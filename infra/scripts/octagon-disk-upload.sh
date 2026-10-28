#!/bin/bash
# Offsite-выгрузка шифрованного бэкапа на Яндекс.Диск (#53, SEC-11).
#
# rclone для Яндекс.Диска требует refresh-token, поэтому работаем напрямую с
# REST API Диска: получить ссылку на загрузку → PUT файла → проверить размер →
# удалить объекты старше срока хранения.
set -euo pipefail

BACKUP_DIR=/srv/octagon/backups
REMOTE_DIR='app:/OCTAGON/backups'
REMOTE_KEEP_DAYS=90
ENV_FILE=/root/.octagon-backup.env
API=https://cloud-api.yandex.net/v1/disk

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

if [ -z "${YANDEX_DISK_TOKEN:-}" ]; then
  echo "offsite: нет YANDEX_DISK_TOKEN в $ENV_FILE" >&2
  exit 1
fi

AUTH="Authorization: OAuth ${YANDEX_DISK_TOKEN}"

# Папка приложения: 409 — уже существует, это нормально.
curl -s -o /dev/null -X PUT -H "$AUTH" \
  "${API}/resources?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$REMOTE_DIR")" || true

for FILE in "$@"; do
  NAME=$(basename "$FILE")
  HREF=$(curl -s -H "$AUTH" \
    "${API}/resources/upload?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "${REMOTE_DIR}/${NAME}")&overwrite=true" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('href',''))")

  if [ -z "$HREF" ]; then
    echo "offsite: не получил ссылку на загрузку для ${NAME}" >&2
    exit 1
  fi

  curl -s -o /dev/null -T "$FILE" "$HREF"

  REMOTE_SIZE=$(curl -s -H "$AUTH" \
    "${API}/resources?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "${REMOTE_DIR}/${NAME}")" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('size',0))")

  LOCAL_SIZE=$(stat -c %s "$FILE")
  if [ "${REMOTE_SIZE}" != "${LOCAL_SIZE}" ]; then
    echo "offsite: размер на Диске ${REMOTE_SIZE} != локального ${LOCAL_SIZE} для ${NAME}" >&2
    exit 1
  fi

  echo "offsite: ${NAME} (${LOCAL_SIZE} байт) загружен"
done

# Ротация на Диске: удаляем объекты старше срока.
# Список сохраняется в файл: stdin нужен python-скрипту из heredoc.
curl -s -H "$AUTH" "${API}/resources?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$REMOTE_DIR")&limit=1000&sort=created" \
  -o /tmp/octagon-disk-list.json
python3 - "$REMOTE_KEEP_DAYS" /tmp/octagon-disk-list.json <<'PY' || true
import json, sys, time, urllib.parse, urllib.request, os

keep_days = int(sys.argv[1])
with open(sys.argv[2], encoding='utf-8') as handle:
    payload = json.load(handle)
items = payload.get('_embedded', {}).get('items', [])
token = os.environ.get('YANDEX_DISK_TOKEN', '')
now = time.time()
for item in items:
    created = item.get('created', '')
    try:
        ts = time.mktime(time.strptime(created[:19], '%Y-%m-%dT%H:%M:%S'))
    except Exception:
        continue
    if (now - ts) / 86400 > keep_days:
        path = urllib.parse.quote(item['path'])
        req = urllib.request.Request(
            f'https://cloud-api.yandex.net/v1/disk/resources?path={path}&permanently=true',
            method='DELETE',
            headers={'Authorization': f'OAuth {token}'},
        )
        try:
            urllib.request.urlopen(req, timeout=30)
            print(f'offsite: удалён {item["name"]}')
        except Exception as exc:
            print(f'offsite: не удалён {item["name"]}: {exc}', file=sys.stderr)
PY