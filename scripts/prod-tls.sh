#!/usr/bin/env bash
#
# Let's Encrypt для production: bootstrap → issue → renew.
#
#   ./scripts/prod-tls.sh bootstrap   # самоподписанные сертификаты для первого старта nginx
#   ./scripts/prod-tls.sh issue       # настоящий сертификат Let's Encrypt
#   ./scripts/prod-tls.sh issue --dry-run
#   ./scripts/prod-tls.sh renew       # cron, раз в сутки
#
# Порядок первого запуска (docs/production-runbook.md):
#   1. bootstrap — nginx поднимается с самоподписанными;
#   2. nginx отвечает по HTTP-01 на :80;
#   3. issue — certbot получает настоящий сертификат и кладёт его в prod-certs;
#   4. nginx перезагружается и отдаёт HTTPS.
#
# Скрипт работает только с production-проектом `octagon` и .env.production;
# staging не затрагивается.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose --project-name octagon --env-file .env.production -f docker-compose.prod.yml"
CERT_NAME="octagon-prod"
CERTS_DIR="infra/nginx/prod-certs"
ACME_DIR="infra/certbot/prod-www"

usage() {
  echo "Использование: $0 {bootstrap|issue|renew} [--dry-run] [--quiet]" >&2
  exit 2
}

COMMAND="${1:-}"
case "$COMMAND" in
  bootstrap|issue|renew) ;;
  *) usage ;;
esac
shift

DRY_RUN=0
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --quiet) QUIET=1 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; usage ;;
  esac
done

if [ ! -f .env.production ]; then
  echo "Нет .env.production: скопируйте infra/production.env.example и заполните." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env.production; set +a

: "${ADMIN_HOST:?задайте ADMIN_HOST в .env.production}"
: "${API_HOST:?задайте API_HOST в .env.production}"
: "${TLS_EMAIL:=${SUPERADMIN_EMAIL:-}}"

mkdir -p "$CERTS_DIR" "$ACME_DIR"

# Самоподписанные сертификаты для первого старта: nginx не умеет стартовать без
# файлов, а Let's Encrypt требует уже работающий HTTP-01 на :80.
if [ "$COMMAND" = "bootstrap" ]; then
  if [ -s "$CERTS_DIR/admin.crt" ] && [ -s "$CERTS_DIR/api.crt" ]; then
    echo "Сертификаты уже есть в $CERTS_DIR — bootstrap пропущен."
    exit 0
  fi

  for name in admin api; do
    cn="$ADMIN_HOST"
    [ "$name" = "api" ] && cn="$API_HOST"
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
      -keyout "$CERTS_DIR/$name.key" \
      -out "$CERTS_DIR/$name.crt" \
      -subj "/CN=$cn" \
      >/dev/null 2>&1
  done

  echo "Самоподписанные сертификаты созданы в $CERTS_DIR (срок 30 дней)."
  echo "Дальше: поднимите nginx и выполните $0 issue."
  exit 0
fi

# Хук выполняется внутри контейнера certbot: он видит /etc/letsencrypt и
# смонтированный /certs. Шаблон nginx читает admin.crt/api.crt и не знает
# про --cert-name, поэтому копируются два имени.
DEPLOY_HOOK="cp /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem /certs/admin.crt; \
cp /etc/letsencrypt/live/${CERT_NAME}/privkey.pem /certs/admin.key; \
cp /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem /certs/api.crt; \
cp /etc/letsencrypt/live/${CERT_NAME}/privkey.pem /certs/api.key"

ARGS=(--rm certbot)
if [ "$COMMAND" = "issue" ]; then
  ARGS+=(certonly --webroot -w /var/www/certbot --cert-name "$CERT_NAME")
  ARGS+=(--non-interactive --agree-tos --email "$TLS_EMAIL")
  ARGS+=(-d "$ADMIN_HOST" -d "$API_HOST" --deploy-hook "$DEPLOY_HOOK")
else
  ARGS+=(renew --webroot -w /var/www/certbot)
fi
[ "$DRY_RUN" -eq 1 ] && ARGS+=(--dry-run)
[ "$QUIET" -eq 1 ] && ARGS+=(--quiet)

$COMPOSE --profile tls run "${ARGS[@]}"

# Без reload nginx отдаёт старый сертификат: файлы подменены на диске, но уже
# открыты процессом.
$COMPOSE exec nginx nginx -s reload
echo "Готово: https://${ADMIN_HOST} и https://${API_HOST}"
