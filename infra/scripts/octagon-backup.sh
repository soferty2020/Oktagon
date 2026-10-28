#!/bin/bash
# Ежедневный дамп PostgreSQL: шифрование, проверка восстановлением, offsite и ротация.
#
# --no-owner/--no-privileges: иначе восстановление на другой площадке падает на
# «роль не существует» (docs/14-infrastructure.md).
#
# Дамп шифруется GPG (AES256), ключ — /root/.octagon-backup.key (600).
# Раз в сутки выполняется restore-drill в отдельную БД: битый бэкап обнаруживается
# сразу, а не при аварии. Шифрованный файл копируется на Яндекс.Диск
# (offsite, #53 SEC-11) через octagon-disk-upload.sh; на Диске хранится 90 дней.
set -euo pipefail

BACKUP_DIR=/srv/octagon/backups
KEEP_DAYS=14
REMOTE_KEEP_DAYS=90
STAMP=$(date +%Y%m%d-%H%M)
KEY_FILE=/root/.octagon-backup.key
PG=octagon-staging-postgres-1
DUMP="${BACKUP_DIR}/octagon-${STAMP}.dump"
ENC="${DUMP}.gpg"
CHECK_DB=octagon_restore_check

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

if [ ! -f "${KEY_FILE}" ]; then
  openssl rand -base64 48 > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
  echo "$(date -Is) created backup key"
fi

docker exec "${PG}" pg_dump -U octagon -d octagon --format=custom --no-owner --no-privileges > "${DUMP}"
docker exec -i "${PG}" pg_restore --list < "${DUMP}" > /dev/null

gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${KEY_FILE}" -o "${ENC}" "${DUMP}"
rm -f "${DUMP}"
chmod 600 "${ENC}"

# --- restore-drill ---------------------------------------------------------
docker exec "${PG}" psql -U octagon -d postgres -q -c "DROP DATABASE IF EXISTS ${CHECK_DB}" >/dev/null
docker exec "${PG}" psql -U octagon -d postgres -q -c "CREATE DATABASE ${CHECK_DB}" >/dev/null

if ! gpg --batch --quiet --decrypt --passphrase-file "${KEY_FILE}" "${ENC}" \
  | docker exec -i "${PG}" pg_restore -U octagon -d "${CHECK_DB}" --no-owner --no-privileges >/dev/null 2>&1; then
  echo "$(date -Is) RESTORE FAILED: ${ENC}" >&2
  docker exec "${PG}" psql -U octagon -d postgres -q -c "DROP DATABASE IF EXISTS ${CHECK_DB}" >/dev/null || true
  exit 1
fi

TABLES=$(docker exec "${PG}" psql -U octagon -d "${CHECK_DB}" -tAc \
  "select count(*) from information_schema.tables where table_schema='public'")
docker exec "${PG}" psql -U octagon -d postgres -q -c "DROP DATABASE IF EXISTS ${CHECK_DB}" >/dev/null

if [ "${TABLES:-0}" -lt 30 ]; then
  echo "$(date -Is) RESTORE CHECK FAILED: только ${TABLES} таблиц" >&2
  exit 1
fi

# --- offsite ---------------------------------------------------------------
OFFSITE="skipped"
if [ -f /usr/local/bin/octagon-disk-upload.sh ] && [ -f /root/.octagon-backup.env ]; then
  if bash /usr/local/bin/octagon-disk-upload.sh "${ENC}"; then
    OFFSITE="ok"
  else
    OFFSITE="FAILED"
  fi
fi

find "${BACKUP_DIR}" -name 'octagon-*.gpg' -mtime +${KEEP_DAYS} -delete
find "${BACKUP_DIR}" -name 'octagon-*.dump' -mtime +${KEEP_DAYS} -delete

echo "$(date -Is) backup ok: $(basename "${ENC}"), restore check: ${TABLES} таблиц, offsite: ${OFFSITE}"

if [ "${OFFSITE}" = "FAILED" ]; then
  exit 1
fi