#!/usr/bin/env bash
#
# Let's Encrypt: выпуск и продление сертификата для админки и API.
#
# Первый выпуск (nginx уже поднят с самоподписанными из шага 3 docs/14):
#   ./scripts/tls-renew.sh issue
#
# Проверить, ничего не выпуская (лимиты Let's Encrypt: 5 неудач в час):
#   ./scripts/tls-renew.sh issue --dry-run
#
# Продление (cron, раз в сутки):
#   15 3 * * * cd /srv/octagon && ./scripts/tls-renew.sh renew --quiet >> /var/log/octagon-tls.log 2>&1
#
# Почему копирование в infra/nginx/certs, а не прямое монтирование live/:
# nginx стартует раньше, чем существует сертификат. Самоподписанные файлы лежат
# в infra/nginx/certs и подхватываются сразу; certbot кладет настоящий туда же,
# а nginx получает его после reload. Шаблон конфига при этом не меняется.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose --env-file .env.staging -f docker-compose.staging.yml"
CERT_NAME="octagon"

usage() {
  echo "Использование: $0 {issue|renew} [--dry-run] [--quiet]" >&2
  exit 2
}

COMMAND="${1:-}"
[ "$COMMAND" = "issue" ] || [ "$COMMAND" = "renew" ] || usage
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

if [ ! -f .env.staging ]; then
  echo "Нет .env.staging: скопируйте infra/staging.env.example и заполните." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env.staging; set +a

: "${ADMIN_HOST:?задайте ADMIN_HOST в .env.staging}"
: "${API_HOST:?задайте API_HOST в .env.staging}"

mkdir -p infra/certbot/www infra/nginx/certs

# Хук выполняется внутри контейнера certbot: он видит /etc/letsencrypt, а /certs —
# это смонтированный infra/nginx/certs. Копируются два имени файлов, потому что
# шаблон nginx читает admin.crt/api.crt и не знает про --cert-name.
DEPLOY_HOOK="cp /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem /certs/admin.crt; \
cp /etc/letsencrypt/live/${CERT_NAME}/privkey.pem /certs/admin.key; \
cp /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem /certs/api.crt; \
cp /etc/letsencrypt/live/${CERT_NAME}/privkey.pem /certs/api.key"

ARGS=(--rm certbot)
if [ "$COMMAND" = "issue" ]; then
  ARGS+=(certonly --webroot -w /var/www/certbot --cert-name "$CERT_NAME")
  ARGS+=(-d "$ADMIN_HOST" -d "$API_HOST" --deploy-hook "$DEPLOY_HOOK")
else
  # Hook сохранен в renewal-конфиге при выпуске: повторно он не нужен.
  ARGS+=(renew --webroot -w /var/www/certbot)
fi
if [ "$DRY_RUN" -eq 1 ]; then
  ARGS+=(--dry-run)
fi
if [ "$QUIET" -eq 1 ]; then
  ARGS+=(--quiet)
fi

$COMPOSE --profile tls run "${ARGS[@]}"

# Без reload nginx продолжит отдавать старый сертификат: файлы подменены на
# диске, но уже открыты процессом.
$COMPOSE exec nginx nginx -s reload
echo "Готово: https://${ADMIN_HOST} и https://${API_HOST}"
