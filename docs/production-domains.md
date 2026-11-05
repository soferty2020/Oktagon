# Домены и двухэтапный запуск production

Утверждённое разделение доменов:

| Окружение | Админка | API |
|---|---|---|
| production | `admin.octagon-karate.online` | `api.octagon-karate.online` |
| staging | `staging-admin.octagon-karate.online` | `staging-api.octagon-karate.online` |

Сейчас `admin.` и `api.` обслуживает staging. Задача — перевести staging на
`staging-*`, а освободившиеся имена отдать production.

## 1. DNS

В зоне `octagon-karate.online` нужны четыре A-записи на один IP (`188.120.250.29`):

```
admin          A  188.120.250.29
api            A  188.120.250.29     # уже существуют, обслуживают staging
staging-admin  A  188.120.250.29     # новые
staging-api    A  188.120.250.29     # новые
```

Проверка после создания:

```bash
dig +short staging-admin.octagon-karate.online
dig +short staging-api.octagon-karate.online
```

Порядок: **сначала** добавить `staging-*`, дождаться распространения (TTL), и
только потом переключать staging. Пока записи `admin.`/`api.` указывают на
staging, production публично недоступен.

## 2. Порты (уже параметризованы)

| Стек | Переменные | Сейчас | За edge |
|---|---|---|---|
| staging | `STAGING_HTTP_PORT`, `STAGING_HTTPS_PORT` | `80`, `443` | `127.0.0.1:8080`, `127.0.0.1:8443` |
| production | `PROD_HTTP_PORT`, `PROD_HTTPS_PORT` | `127.0.0.1:8081`, `127.0.0.1:8444` | не публикуются |

Проверено `docker compose config`:

```
staging: published 80, 443
production: published 8081, 8444 (только loopback)
```

Production по умолчанию **не виден снаружи**: до переключения доменов он
доступен только через SSH-туннель.

## 3. Этап 1 — закрытый запуск production

Публичные DNS не меняются, staging продолжает работать на `admin.`/`api.`.

```bash
cd /srv/octagon
export COMPOSE="docker compose --project-name octagon --env-file .env.production -f docker-compose.prod.yml"

# окружение: домены production, свои секреты
cp infra/production.env.example .env.production && chmod 600 .env.production
#   ADMIN_HOST=admin.octagon-karate.online
#   API_HOST=api.octagon-karate.online
#   CORS_ORIGINS=https://admin.octagon-karate.online
#   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (>=12), пароли БД/Redis, JWT-секреты

./scripts/prod-tls.sh bootstrap
$COMPOSE up -d postgres redis
$COMPOSE --profile tools run --rm migrate
$COMPOSE --profile tools run --rm seed
$COMPOSE up -d api admin nginx
```

Проверка **через SSH-туннель**, без публичного доступа:

```bash
# на рабочей машине
ssh -L 8081:127.0.0.1:8081 -L 8444:127.0.0.1:8444 root@188.120.250.29

# локально
curl -fsS http://127.0.0.1:8081/api/v1/health/ready
open http://127.0.0.1:8081/login        # вход SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD
```

HTTPS до переключения проверяется самоподписанным сертификатом:

```bash
curl -kI https://127.0.0.1:8444/login
```

## 4. Этап 2 — переключение доменов

Выполняется, когда этап 1 принят. Порядок сохраняет доступ к staging.

### 4.1 Staging на новые домены

```bash
# .env.staging: ADMIN_HOST=staging-admin.octagon-karate.online,
#              API_HOST=staging-api.octagon-karate.online,
#              CORS_ORIGINS=https://staging-admin.octagon-karate.online
docker compose --project-name octagon-staging --env-file .env.staging \
  -f docker-compose.staging.yml up -d --force-recreate nginx api admin

# сертификат на новые имена (nginx staging уже смотрит в prod-certs? нет — в infra/nginx/certs)
./scripts/tls-renew.sh issue   # после правки ADMIN_HOST/API_HOST в .env.staging
```

Проверка: `https://staging-admin.octagon-karate.online` и `https://staging-api...`
открываются, старые `admin.`/`api.` ещё обслуживает staging (пока DNS не изменён).

### 4.2 Edge на 80/443

```bash
# staging-nginx — только loopback
STAGING_HTTP_PORT=127.0.0.1:8080 STAGING_HTTPS_PORT=127.0.0.1:8443 \
  docker compose --project-name octagon-staging --env-file .env.staging \
  -f docker-compose.staging.yml up -d --force-recreate nginx

# production-nginx — только loopback (как по умолчанию)
$COMPOSE up -d --force-recreate nginx

# edge
cp infra/nginx/edge.conf /etc/nginx/sites-available/octagon-edge.conf
ln -s /etc/nginx/sites-available/octagon-edge.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 4.3 Сертификаты на edge

```bash
certbot certonly --webroot -w /var/www/certbot --cert-name octagon-prod  -d admin.octagon-karate.online -d api.octagon-karate.online
certbot certonly --webroot -w /var/www/certbot --cert-name octagon-staging -d staging-admin.octagon-karate.online -d staging-api.octagon-karate.online
systemctl reload nginx
```

Проверка: `curl -I https://admin.octagon-karate.online` (production),
`curl -I https://staging-admin.octagon-karate.online` (staging), оба без `-k`.

## 5. Возврат к прежнему состоянию

Если после переключения что-то не работает — staging возвращается на `admin.`/`api.`:

```bash
# 1. убрать edge из публикации
systemctl stop nginx

# 2. staging обратно на 80/443
docker compose --project-name octagon-staging --env-file .env.staging \
  -f docker-compose.staging.yml up -d --force-recreate nginx   # без STAGING_* переменных

# 3. убедиться, что старые адреса отвечают
curl -I https://admin.octagon-karate.online
```

Production при этом остаётся на loopback (`127.0.0.1:8081`) и доступен по
туннелю — данные не теряются, публичный доступ к нему закрыт.

DNS-записи `staging-*` можно оставить: они не мешают и пригодятся при повторной
попытке.

## 6. Проверка конфигураций (выполнено)

| Что | Результат |
|---|---|
| `nginx -t` для `edge.conf` (4 домена, 2 сертификата) | syntax ok, test successful |
| Маршрутизация по Host | staging → 8443, production → 8444 |
| `docker compose config` staging | published 80, 443 |
| `docker compose config` production | published 8081, 8444 (loopback) |
| Домены в `production.env.example` / `staging.env.example` | обновлены |

## 7. Что ещё не сделано (NOT_TESTED)

- Публичные DNS `staging-*` не созданы — требуется действие владельца в панели DNS.
- Production не запускался, сертификат для production-доменов не выпускался.
- Переключение staging на `staging-*` и edge не выполнялось.
- Проверка `certbot` на edge-хосте не проводилась (edge ещё не установлен).
