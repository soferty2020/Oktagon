# Production runbook OCTAGON

Документ описывает первую установку, обычный деплой и откат production.
Staging живёт рядом на том же сервере и не пересекается с production.

## 1. Изоляция от staging

| | Production | Staging |
|---|---|---|
| Compose-проект | `octagon` | `octagon-staging` |
| Контейнеры | `octagon-api-1`, `octagon-admin-1`, `octagon-postgres-1`… | `octagon-staging-*` |
| Тома | `octagon_postgres-data`, `octagon_redis-data`, `octagon_uploads` | `octagon-staging_*` |
| Секреты | `/srv/octagon/.env.production` (600) | `.env.staging` |
| Сертификаты | `infra/nginx/prod-certs` | `infra/nginx/certs` |
| ACME | `infra/certbot/prod-www` | `infra/certbot/www` |
| Домены | `admin.octagon-karate.ru`, `api.octagon-karate.ru` | `*.octagon-karate.online` |
| HTTP/HTTPS | 80/443 | 8080/8443 (после первого запуска production) |

Порты nginx параметризованы: `NGINX_HTTP_PORT` и `NGINX_HTTPS_PORT`. Пока
production не запущен, staging занимает 80/443. Перед первым запуском production
staging переводится на 8080/8443, а production получает 80/443 — TLS-сертификат
Let's Encrypt выпускается только на стандартный 80.

## 2. Подготовка окружения

```bash
cd /srv/octagon
cp infra/production.env.example .env.production
chmod 600 .env.production
# заполнить: POSTGRES_PASSWORD, APP_DB_PASSWORD, REDIS_PASSWORD,
# JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ADMIN_HOST, API_HOST, CORS_ORIGINS
```

Секреты генерируются заново для production и **не переиспользуются** из staging:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET и JWT_REFRESH_SECRET — разные значения
openssl rand -base64 24   # пароли БД и Redis
```

## 3. Первый запуск (после отдельного разрешения)

```bash
export COMPOSE="docker compose --project-name octagon --env-file .env.production -f docker-compose.prod.yml"

# 1. staging уходит с 80/443
NGINX_HTTP_PORT=8080 NGINX_HTTPS_PORT=8443 \
  docker compose --project-name octagon-staging --env-file .env.staging \
  -f docker-compose.staging.yml up -d nginx

# 2. сертификаты для production-доменов (самоподписанные для старта nginx)
./scripts/prod-tls.sh bootstrap

# 3. база и миграции
$COMPOSE up -d postgres redis
$COMPOSE run --rm migrate

# 4. приложение
$COMPOSE up -d api admin nginx
$COMPOSE ps
curl -fsS https://api.octagon-karate.ru/api/v1/health/ready

# 5. настоящий сертификат
./scripts/prod-tls.sh issue
```

## 4. Обычный деплой (фиксированные версии образов)

Образы собираются и тегируются версией, а не `latest`:

```bash
cd /srv/octagon
RELEASE=$(git rev-parse --short origin/main)

# 1. зафиксировать текущую версию как точку отката
cat .release-current 2>/dev/null > .release-prev || true

# 2. обновить код и собрать образы с тегом релиза
git fetch --quiet origin main && git reset --hard --quiet origin/main
$COMPOSE build api admin
docker tag octagon-api:latest octagon-api:$RELEASE
docker tag octagon-admin:latest octagon-admin:$RELEASE

# 3. миграции (аддитивные)
$COMPOSE run --rm migrate

# 4. перезапуск
$COMPOSE up -d --no-deps api admin

# 5. проверка
curl -fsS https://api.octagon-karate.ru/api/v1/health/ready
echo $RELEASE > .release-current
```

## 5. Откат приложения

Откат возвращает **предыдущий образ**, а не данные. База не восстанавливается:
миграции аддитивные, старая версия совместима со схемой.

```bash
RELEASE=$(cat /srv/octagon/.release-prev)
# образы должны существовать локально; если нет — собрать из предыдущего коммита
docker tag octagon-api:$RELEASE octagon-api:latest
docker tag octagon-admin:$RELEASE octagon-admin:latest
$COMPOSE up -d --no-deps api admin
curl -fsS https://api.octagon-karate.ru/api/v1/health/ready
```

Восстановление дампа — **только** при разрушении данных, отдельным решением:

```bash
# НЕ выполнять при обычном откате приложения
gpg --decrypt backups/octagon-<дата>.dump.gpg | \
  docker exec -i octagon-postgres-1 pg_restore -U octagon -d octagon --clean --if-exists
```

## 6. Бэкапы production

Скрипт `scripts/prod-backup.sh` (cron `30 2 * * *`):

- дамп только базы production (`octagon-postgres-1`);
- GPG AES256, ключ `/root/.octagon-prod-backup.key` (600);
- restore-drill в отдельную БД `octagon_restore_check`;
- offsite-копия на Яндекс.Диск;
- ротация 30 дней локально, 90 дней offsite.

## 7. Постоянное хранение файлов

Фотографии новостей живут в томе `octagon_uploads` (`UPLOAD_DIR=/data/uploads`).
Том переживает пересборку контейнеров. В бэкап базы файлы не входят — при
восстановлении на другой сервер копировать том отдельно:

```bash
docker run --rm -v octagon_uploads:/data -v /tmp:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

## 8. Проверка после деплоя

1. `https://api.octagon-karate.ru/api/v1/health` и `/health/ready` → 200.
2. `https://admin.octagon-karate.ru/login` открывается, сертификат валиден.
3. Вход владельцем, реестр спортсменов загружается.
4. `docker compose ps` — все сервисы `healthy`.
5. Логи 15 минут: `docker compose logs -f api admin nginx`.
6. Счётчики групп не содержат архивных спортсменов.
