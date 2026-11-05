# Production runbook OCTAGON

Первая установка, обычный деплой и откат production. Staging живёт рядом на том
же сервере и не пересекается с production.

## 1. Изоляция от staging

| | Production | Staging |
|---|---|---|
| Compose-проект | `octagon` | `octagon-staging` |
| Тома | `octagon_postgres-data`, `octagon_redis-data`, `octagon_uploads` | `octagon-staging_*` |
| Секреты | `.env.production` (600) | `.env.staging` |
| Сертификаты | `infra/nginx/prod-certs`, `prod-www` | `infra/nginx/certs`, `www` |
| Домены | `ADMIN_HOST`, `API_HOST` из `.env.production` | `*.octagon-karate.online` |
| Бэкапы | `backups/production`, ключ `/root/.octagon-prod-backup.key` | `backups`, ключ `/root/.octagon-backup.key` |

`scripts/prod-*` работают только с проектом `octagon` и `.env.production`;
staging-контейнеры и staging-база не читаются и не изменяются.

## 2. Сосуществование на одном сервере: edge-прокси

Оба стека не могут слушать 80/443. Вместо перевода staging на 8080/8443
(это сломало бы существующие HTTPS-адреса) используется **единый edge-прокси**:
он занимает 80/443, терминирует TLS для всех доменов и маршрутизирует по
`server_name` во внутренние nginx-контейнеры.

```
Internet ──► edge nginx (:80/:443)
               ├─ admin.octagon-karate.online ─► 127.0.0.1:8080 (staging-nginx)
               ├─ api.octagon-karate.online   ─► 127.0.0.1:8080
               ├─ <ADMIN_HOST>                ─► 127.0.0.1:8081 (prod-nginx)
               └─ <API_HOST>                  ─► 127.0.0.1:8081
```

Конфиг: `infra/nginx/edge.conf`. Порты внутренних nginx публикуются только на
loopback (`127.0.0.1:8080:80`), наружу — только edge.

**Порядок перехода (отдельное разрешение, сейчас не выполняется):**

1. Подготовить `edge.conf`, выполнить `nginx -t`.
2. Переключить staging-nginx на `127.0.0.1:8080`, production-nginx — на `127.0.0.1:8081`.
3. Поднять edge на 80/443, проверить оба домена по HTTPS.
4. Сертификаты на edge: `certbot certonly --webroot` для каждого набора имён;
   внутренние nginx остаются с самоподписанными и наружу по HTTPS не выходят.
5. Продление — cron edge-хоста; `scripts/prod-tls.sh renew` остаётся для случая,
   когда production публикуется напрямую.

До перехода production можно поднять на свободных портах и проверить локально,
не трогая staging.

## 3. Подготовка окружения

```bash
cd /srv/octagon
cp infra/production.env.example .env.production
chmod 600 .env.production
# заполнить: POSTGRES_PASSWORD, APP_DB_PASSWORD, REDIS_PASSWORD,
# JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ADMIN_HOST, API_HOST, CORS_ORIGINS,
# SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (не короче 12 символов)
```

Секреты генерируются заново, из staging не переиспользуются:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET и JWT_REFRESH_SECRET — разные значения
openssl rand -base64 24   # пароли БД и Redis
```

Ключ бэкапа (создать один раз):

```bash
openssl rand -base64 48 > /root/.octagon-prod-backup.key && chmod 600 /root/.octagon-prod-backup.key
```

## 4. Первый запуск (после отдельного разрешения)

```bash
export COMPOSE="docker compose --project-name octagon --env-file .env.production -f docker-compose.prod.yml"

# 1. самоподписанные сертификаты: nginx не стартует без файлов
./scripts/prod-tls.sh bootstrap

# 2. база и миграции
$COMPOSE up -d postgres redis
$COMPOSE --profile tools run --rm migrate

# 3. справочники и первый администратор (идемпотентно: upsert)
$COMPOSE --profile tools run --rm seed

# 4. приложение
$COMPOSE up -d api admin nginx

# 5. здоровье
curl -fsS http://127.0.0.1:${NGINX_HTTP_PORT:-80}/api/v1/health/ready

# 6. настоящий сертификат Let's Encrypt и reload nginx
./scripts/prod-tls.sh issue

# 7. первый вход
#    https://<ADMIN_HOST>/login с SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD
```

Проверка seed: `seed` создаёт каталог permissions (upsert по `code`), при наличии
`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` — суперадмина (upsert по email, повторный
запуск не создаёт дубль и не меняет существующий пароль). Без этих переменных
создаются только справочники.

## 5. Обычный деплой (фиксированные версии образов)

```bash
cd /srv/octagon
RELEASE=$(git rev-parse --short origin/main)

# 0. точка отката
cat .release-current 2>/dev/null > .release-prev || true

# 1. код и образы с тегом релиза
git fetch --quiet origin main && git reset --hard --quiet origin/main
$COMPOSE build api admin
docker tag octagon-api:latest octagon-api:$RELEASE
docker tag octagon-admin:latest octagon-admin:$RELEASE

# 2. миграции (аддитивные)
$COMPOSE --profile tools run --rm migrate

# 3. перезапуск только приложения
$COMPOSE up -d --no-deps api admin

# 4. проверка и фиксация версии
curl -fsS https://<API_HOST>/api/v1/health/ready
echo $RELEASE > .release-current
```

## 6. Откат приложения

Откат возвращает **предыдущий образ**, а не данные: миграции аддитивные, прежняя
версия совместима со схемой.

```bash
RELEASE=$(cat /srv/octagon/.release-prev)
docker image inspect octagon-api:$RELEASE >/dev/null   # образ должен быть локально
docker tag octagon-api:$RELEASE octagon-api:latest
docker tag octagon-admin:$RELEASE octagon-admin:latest
$COMPOSE up -d --no-deps api admin
curl -fsS https://<API_HOST>/api/v1/health/ready
```

**Восстановление дампа при обычном откате не выполняется.** Оно нужно только при
разрушении данных и делается отдельным решением:

```bash
./scripts/prod-backup.sh --check           # сначала проверка последнего дампа
# восстановление в рабочую базу — только вручную и только с подтверждением владельца
```

## 7. Бэкапы production

`scripts/prod-backup.sh`, cron `30 2 * * *`:

- дамп только `octagon-postgres-1`, `--no-owner --no-privileges`;
- GPG AES256, ключ `/root/.octagon-prod-backup.key` (600);
- restore-drill в БД `octagon_prod_restore_check` сразу после дампа;
- offsite через `scripts/octagon-disk-upload.sh` (если настроен);
- ротация 30 дней локально, 90 дней offsite.

Проверка вручную: `./scripts/prod-backup.sh --check` — берёт последний дамп,
восстанавливает в отдельную БД и печатает число таблиц.

## 8. Файлы

Фотографии новостей живут в томе `octagon_uploads` (`UPLOAD_DIR=/data/uploads`).
В дамп базы не входят; при переносе копируются отдельно:

```bash
docker run --rm -v octagon_uploads:/data -v /tmp:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

## 9. Проверка после деплоя

1. `/api/v1/health` и `/api/v1/health/ready` → 200.
2. `https://<ADMIN_HOST>/login` открывается, сертификат валиден (не самоподписанный).
3. Вход владельцем, реестр спортсменов загружается.
4. `docker compose ps` — все сервисы `healthy`.
5. Логи 15 минут: `$COMPOSE logs -f api admin nginx`.
6. Счётчики групп не содержат архивных спортсменов.
