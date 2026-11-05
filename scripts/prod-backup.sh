#!/usr/bin/env bash
#
# Production-бэкап OCTAGON: дамп базы, GPG, restore-drill, offsite, ротация.
#
#   ./scripts/prod-backup.sh              # ночной запуск (cron 30 2 * * *)
#   ./scripts/prod-backup.sh --no-offsite # только локально (отладка)
#   ./scripts/prod-backup.sh --check      # восстановить последний дамп в отдельную БД и сверить
#
# Гарантии:
# - берётся только production-контейнер `octagon-postgres-1`; staging не читается;
# - дамп шифруется AES256 ключом /root/.octagon-prod-backup.key (600);
# - сразу после шифрования выполняется restore-drill в отдельную БД
#   `octagon_prod_restore_check`: битый бэкап виден в ту же ночь;
# - offsite-копия на Яндекс.Диск через octagon-disk-upload.sh (если настроен);
# - ротация: 30 дней локально, 90 дней offsite.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose --project-name octagon --env-file .env.production -f docker-compose.prod.yml"
PG_CONTAINER="octagon-postgres-1"
BACKUP_DIR="backups/production"
KEY_FILE="/root/.octagon-prod-backup.key"
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

mkdir -p "$BACKUP_DIR"

# Восстановление дампа в отдельную БД: проверяет и процедуру, и содержимое.
restore_check() {
  local dump="$1"
  echo "restore-drill: $dump"
  gpg --batch --quiet --decrypt --passphrase-file "$KEY_FILE" "$dump" \
    | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
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
  latest=$(ls -1t "$BACKUP_DIR"/*.dump.gpg 2>/dev/null | head -1)
  [ -n "$latest" ] || { echo "Нет дампов в $BACKUP_DIR" >&2; exit 1; }
  restore_check "$latest"
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M)
DUMP="$BACKUP_DIR/octagon-$STAMP.dump.gpg"

# Дамп только production-контейнера. --no-owner/--no-privileges: восстановление
# на другой площадке не падает на несуществующих ролях.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gpg --batch --quiet --symmetric --cipher-algo AES256 \
      --passphrase-file "$KEY_FILE" -o "$DUMP"

echo "дамп: $DUMP ($(stat -c%s "$DUMP") байт)"

restore_check "$DUMP"

if [ "$NO_OFFSITE" -eq 0 ] && [ -x ./scripts/octagon-disk-upload.sh ]; then
  ./scripts/octagon-disk-upload.sh "$DUMP" && echo "offsite: загружен"
else
  echo "offsite: пропущен"
fi

# Ротация локальных копий.
find "$BACKUP_DIR" -name 'octagon-*.dump.gpg' -mtime "+$RETENTION_DAYS" -delete
echo "ротация: старше $RETENTION_DAYS дней удалены"

echo "backup ok: $(basename "$DUMP")"
