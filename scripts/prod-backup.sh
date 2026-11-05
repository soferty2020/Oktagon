#!/usr/bin/env bash
#
# Production-бэкап OCTAGON: дамп базы, GPG, restore-drill, offsite, ротация.
#
#   ./scripts/prod-backup.sh              # ночной запуск (cron 30 2 * * *)
#   ./scripts/prod-backup.sh --check      # восстановить последний дамп в отдельную БД
#   ./scripts/prod-backup.sh --no-offsite # локально, без offsite (отладка)
#
# Дамп создаётся в custom-формате (`pg_dump --format=custom`), поэтому
# восстанавливается `pg_restore`, а не `psql`. Формат совпадает с staging-бэкапом.
#
# Гарантии:
# - берётся только production-контейнер `octagon-postgres-1`; staging не читается;
# - дамп шифруется AES256 ключом /root/.octagon-prod-backup.key (600);
# - сразу после шифрования — restore-drill в `octagon_prod_restore_check`;
# - offsite обязателен: если загрузчик или его конфиг недоступны, скрипт падает
#   с ошибкой, а не пишет «пропущено»;
# - ротация: 30 дней локально, offsite — на стороне загрузчика.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose --project-name octagon --env-file .env.production -f docker-compose.prod.yml"
PG_CONTAINER="octagon-postgres-1"
BACKUP_DIR="backups/production"
KEY_FILE="/root/.octagon-prod-backup.key"
UPLOADER="/usr/local/bin/octagon-disk-upload.sh"
UPLOADER_ENV="/root/.octagon-backup.env"
RETENTION_DAYS=30
CHECK_DB="octagon_prod_restore_check"

NO_OFFSITE=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-offsite) NO_OFFSITE=1 ;;
    --check) CHECK_ONLY=1 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -f .env.production ]; then
  echo "Нет .env.production" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env.production; set +a
: "${POSTGRES_USER:=octagon}"
: "${POSTGRES_DB:=octagon}"

if [ ! -s "$KEY_FILE" ]; then
  echo "Нет ключа $KEY_FILE: создайте его командой" >&2
  echo "  openssl rand -base64 48 > $KEY_FILE && chmod 600 $KEY_FILE" >&2
  exit 1
fi

# Offsite проверяется до дампа: иначе выяснится после часа работы, что копия
# никуда не уехала.
if [ "$NO_OFFSITE" -eq 0 ] && [ "$CHECK_ONLY" -eq 0 ]; then
  if [ ! -f "$UPLOADER" ]; then
    echo "offsite: не найден загрузчик $UPLOADER" >&2
    exit 1
  fi
  if [ ! -f "$UPLOADER_ENV" ]; then
    echo "offsite: не найден конфиг $UPLOADER_ENV (нужен для доступа к Диску)" >&2
    exit 1
  fi
fi

mkdir -p "$BACKUP_DIR"

# Дамп в custom-формате (совместим с pg_restore).
dump_database() {
  local target="$1"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges \
    > "$target"
}

# Восстановление в отдельную БД: проверяет и процедуру, и содержимое.
restore_check() {
  local dump="$1"
  echo "restore-drill: $dump"

  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $CHECK_DB" \
    -c "CREATE DATABASE $CHECK_DB" >/dev/null

  gpg --batch --quiet --decrypt --passphrase-file "$KEY_FILE" "$dump" \
    | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
        pg_restore -U "$POSTGRES_USER" -d "$CHECK_DB" --no-owner --no-privileges >/dev/null

  local tables
  tables=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$CHECK_DB" -tAc \
    "select count(*) from information_schema.tables where table_schema = 'public'")

  if [ "${tables:-0}" -lt 10 ]; then
    echo "restore-drill: ПРОВАЛ, таблиц: ${tables:-0}" >&2
    exit 1
  fi

  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
    psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $CHECK_DB" >/dev/null
  echo "restore-drill: ok, таблиц: $tables"
}

if [ "$CHECK_ONLY" -eq 1 ]; then
  latest=$(ls -1t "$BACKUP_DIR"/octagon-prod-*.dump.gpg 2>/dev/null | head -1)
  [ -n "$latest" ] || { echo "Нет дампов в $BACKUP_DIR" >&2; exit 1; }
  restore_check "$latest"
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M)
RAW="$BACKUP_DIR/octagon-prod-$STAMP.dump"
DUMP="$RAW.gpg"

dump_database "$RAW"

# Проверка, что дамп читается как custom-архив, до шифрования.
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
  pg_restore --list < "$RAW" >/dev/null

gpg --batch --quiet --symmetric --cipher-algo AES256 \
  --passphrase-file "$KEY_FILE" -o "$DUMP" "$RAW"
rm -f "$RAW"

echo "дамп: $DUMP ($(stat -c%s "$DUMP") байт)"

restore_check "$DUMP"

if [ "$NO_OFFSITE" -eq 0 ]; then
  if bash "$UPLOADER" "$DUMP"; then
    echo "offsite: загружен"
  else
    echo "offsite: ОШИБКА загрузки $DUMP" >&2
    exit 1
  fi
else
  echo "offsite: отключён флагом --no-offsite"
fi

find "$BACKUP_DIR" -name 'octagon-prod-*.dump.gpg' -mtime "+$RETENTION_DAYS" -delete
echo "ротация: старше $RETENTION_DAYS дней удалены"

echo "backup ok: $(basename "$DUMP")"
