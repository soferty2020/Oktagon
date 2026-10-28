#!/bin/bash
# Ретенция данных (#56, SEC-19): что хранить вечно, а что нет.
#
# Вечно: история тренировок, оплат, аттестаций и карточек — она нужна клубу.
# Ограниченно:
#   - журнал аудита — 365 дней (BR-007 требует хранить, но не бессрочно);
#   - заявки на пробную тренировку в финальном статусе — 180 дней;
#   - заявки на привязку ребёнка в финальном статусе — 180 дней.
#
# Удаление порциями: один DELETE на сотни тысяч строк держал бы таблицу.
set -euo pipefail

PG=octagon-staging-postgres-1
BATCH=5000

psql_run() {
  docker exec "${PG}" psql -U octagon -d octagon -q -tAc "$1"
}

echo "$(date -Is) retention: старт"

# 1. Журнал аудита.
DELETED_AUDIT=0
while true; do
  ROWS=$(psql_run "WITH batch AS (
      SELECT id FROM audit_logs WHERE created_at < now() - interval '365 days' LIMIT ${BATCH}
    ) DELETE FROM audit_logs a USING batch WHERE a.id = batch.id RETURNING a.id" | wc -l)
  DELETED_AUDIT=$((DELETED_AUDIT + ROWS))
  [ "${ROWS}" -lt "${BATCH}" ] && break
done
echo "  audit_logs: удалено ${DELETED_AUDIT}"

# 2. Заявки на пробную тренировку: только финальные статусы.
DELETED_TRIAL=$(psql_run "WITH batch AS (
    SELECT id FROM trial_requests
    WHERE created_at < now() - interval '180 days'
      AND status IN ('CONVERTED', 'REJECTED')
    LIMIT ${BATCH}
  ) DELETE FROM trial_requests t USING batch WHERE t.id = batch.id RETURNING t.id" | wc -l)
echo "  trial_requests: удалено ${DELETED_TRIAL}"

# 3. Заявки на привязку ребёнка: только обработанные.
DELETED_LINKS=0
if psql_run "SELECT to_regclass('link_requests') IS NOT NULL" | grep -q '^t$'; then
  DELETED_LINKS=$(psql_run "WITH batch AS (
      SELECT id FROM link_requests
      WHERE created_at < now() - interval '180 days'
        AND status IN ('APPROVED', 'REJECTED')
      LIMIT ${BATCH}
    ) DELETE FROM link_requests l USING batch WHERE l.id = batch.id RETURNING l.id" | wc -l)
fi
echo "  link_requests: удалено ${DELETED_LINKS}"

echo "$(date -Is) retention: готово"
