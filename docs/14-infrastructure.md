# 14. Infrastructure

## MVP target
Dockerized deployment.

Components:
- Nginx / reverse proxy
- NestJS API
- Next.js admin
- PostgreSQL
- Redis
- S3-compatible object storage

## Initial server sizing
Ориентир для MVP:
- 2 vCPU
- 4 GB RAM
- 40–60 GB SSD
при небольшом количестве пользователей.

## Backups
- ежедневный backup PostgreSQL;
- versioned object storage;
- проверка восстановления не реже одного раза на релизный цикл.

### Как снимается дамп

```bash
node scripts/backup-db.mjs                 # в .tools/backups, срок хранения 14 дней
node scripts/backup-db.mjs --out /backups --keep-days 30
```

Скрипт снимает дамп в формате custom и **сразу проверяет его читаемость**
(`pg_restore --list` разбирает оглавление архива). Это дешево и ловит обрыв
записи — кончилось место, процесс прервали: иначе битый файл обнаружился бы
только при восстановлении, то есть в момент аварии. Старые дампы удаляются по
сроку хранения: без ротации диск заполнится, и бэкапы перестанут сниматься
именно тогда, когда понадобятся.

Ручной эквивалент для внешнего планировщика:

```bash
pg_dump --format=custom --schema=public --no-owner --no-privileges \
  --file /backups/octagon-$(date +%Y%m%d).dump "$DATABASE_URL"
```

`--no-owner` и `--no-privileges` обязательны: иначе дамп требует тех же ролей
БД, что и источник, и восстановление на другой площадке падает на «роль не
существует». Это выясняется только при проверке восстановления, поэтому она и
нужна.

`DATABASE_URL` для `pg_dump` приводится к формату libpq: Prisma добавляет
`?schema=public`, которого `pg_dump` не понимает («invalid URI query parameter»).
Параметр отбрасывается.

### Как восстанавливать

```bash
# --clean --if-exists обязательны при восстановлении в живую базу: дамп создает
# схему public, а она в целевой базе уже есть, и без этих флагов pg_restore
# падает с «схема public уже существует».
pg_restore --no-owner --no-privileges --exit-on-error \
  --clean --if-exists --dbname "$TARGET_DATABASE_URL" /backups/octagon.dump
```

### Проверка восстановления

```bash
node scripts/check-backup.mjs                    # снять дамп, восстановить в копию, сверить
node scripts/check-backup.mjs --dump <path>      # проверить конкретный дамп
node scripts/check-backup.mjs --keep             # оставить копию для разбора
node scripts/check-backup.mjs --skip-api         # без запуска API
```

Проверка создает базу `<имя>_restore`, восстанавливает в нее дамп и сверяет с
источником:

- количество строк **по каждой таблице**;
- структуру схемы: индексы, внешние ключи, enum;
- отсутствие нарушенных внешних ключей в копии;
- историю миграций, если она есть;
- **пригодность к работе**: API запускается на восстановленной базе, readiness
  отвечает, и выполняется вход существующего пользователя (нужны
  `ADMIN_EMAIL` и `ADMIN_PASSWORD` в окружении). Совпавшие строки еще не значат,
  что система поднимется.

Копия удаляется в конце, рабочая база не изменяется: дамп снимается без
блокировки записи. Сверяется каждое расхождение, а не «примерно те же строки»:
`pg_restore` без `--exit-on-error` продолжает работу после ошибок и завершается
кодом 0, поэтому успешный код сам по себе ничего не доказывает.

**Что уже нашла эта проверка.** Первый же прогон показал, что дамп не
восстанавливается в живую базу: `pg_restore` падал с «схема public уже
существует». Без `--clean --if-exists` восстановление в базу с существующей
схемой невозможно — и выяснилось бы это в момент аварии.

**История миграций.** В локальной среде миграции применяются SQL-скриптом в обход
`prisma migrate` (`scripts/apply-migration.mjs`, причина — `docs/27-local-development.md`),
поэтому таблицы `_prisma_migrations` там может не быть. Это не ошибка проверки:
полнота схемы в таком случае сверяется по самим объектам. В staging и production
миграции применяются через `prisma migrate deploy` (так же, как в CI), и история
переносится вместе с дампом.

## Environments
- local
- staging
- production

Секреты не хранятся в Git.

## Выкат staging

Подготовка целиком лежит в репозитории: `docker-compose.staging.yml`,
`apps/api/Dockerfile`, `apps/admin/Dockerfile`, `infra/nginx/staging.conf.template`.
Ниже — что нужно сделать на сервере.

### 1. Сервер и DNS

Ориентир из начала этого документа: 2 vCPU, 4 ГБ RAM, 40–60 ГБ SSD, Docker и
Docker Compose. Нужны два имени в DNS, оба на адрес сервера:

- `ADMIN_HOST` — web-админка;
- `API_HOST` — backend API (нужен мобильному приложению и внешним клиентам).

### 2. Секреты

```bash
git clone <repo> /srv/octagon && cd /srv/octagon
cp infra/staging.env.example .env.staging
# заполнить: POSTGRES_PASSWORD, JWT_*_SECRET (openssl rand -base64 48),
# CORS_ORIGINS=https://<ADMIN_HOST>, ADMIN_HOST, API_HOST
```

`.env.staging` в git не попадает. `DATABASE_URL` и `REDIS_URL` вручную не
задаются: compose собирает их из `POSTGRES_*`, чтобы пароль не расходился в двух
местах.

### 3. Сертификаты

Сертификаты монтируются из `infra/nginx/certs` и в репозиторий не попадают.

**Шаг 3а: временные самоподписанные.** Нужны, чтобы nginx поднялся до того, как
существует настоящий сертификат: без файлов он не стартует. Браузер покажет
предупреждение — это нормально для нескольких минут:

```bash
mkdir -p infra/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -subj "/CN=$ADMIN_HOST" \
  -keyout infra/nginx/certs/admin.key -out infra/nginx/certs/admin.crt
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -subj "/CN=$API_HOST" \
  -keyout infra/nginx/certs/api.key -out infra/nginx/certs/api.crt
```

**Шаг 3б: настоящий сертификат (Let's Encrypt).** После того как nginx поднят и
оба домена отвечают по HTTP:

```bash
# Проверка без обращения к Let's Encrypt (бережет лимиты: 5 неудач в час)
./scripts/tls-renew.sh issue --dry-run

# Выпуск
./scripts/tls-renew.sh issue
```

Скрипт:

- выпускает **один** сертификат на оба имени (SAN): админка и API живут на одном
  домене, два отдельных сертификата добавили бы точку отказа при продлении;
- проходит ACME-челлендж через `webroot`: nginx отдает файл из
  `infra/certbot/www` по пути `/.well-known/acme-challenge/`;
- копирует `fullchain.pem` и `privkey.pem` в `infra/nginx/certs/admin.*` и
  `api.*` — шаблон nginx не знает про `cert-name`;
- перезагружает nginx: файлы на диске уже новые, но открыты процессом старые.

**Продление.** Сертификат Let's Encrypt живет 90 дней. Продление — в cron раз в
сутки; `renew` ничего не делает, пока до истечения больше 30 дней:

```bash
15 3 * * * cd /srv/octagon && ./scripts/tls-renew.sh renew --quiet >> /var/log/octagon-tls.log 2>&1
```

Проверить, что продление настроено:

```bash
docker compose -f docker-compose.staging.yml --profile tls run --rm certbot certificates
```

**Про мобильное приложение.** Самоподписанный сертификат не годится: Android в
release блокирует и cleartext-HTTP, и недоверенные сертификаты — APK просто не
подключится. Для стенда, на который ставится APK, нужен сертификат из шага 3б.

### 4. Первый выкат

```bash
docker compose -f docker-compose.staging.yml build
docker compose -f docker-compose.staging.yml run --rm migrate   # миграции
docker compose -f docker-compose.staging.yml up -d
```

Миграции вынесены в отдельный сервис намеренно: если применить их при старте
`api`, падение миграции превратилось бы в цикл перезапуска контейнера.

Проверка:

```bash
curl -fsS https://<API_HOST>/api/v1/health/ready   # база и Redis
curl -fsS -o /dev/null -w '%{http_code}\n' https://<ADMIN_HOST>/login
docker compose -f docker-compose.staging.yml ps    # все healthy
```

### 5. Первый администратор и справочники

После миграций нужен сервис seed: он заполняет каталог permissions и создает
суперадминистратора из SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD. Без него в
системе некому войти, а демо-учетка с локального стенда на сервер не переносится.

`ash
docker compose -f docker-compose.staging.yml run --rm seed
`

Сервис идемпотентен: повторный запуск не создает дубликатов и не меняет пароль
существующего пользователя, если email совпадает. Пароль в логи не пишется —
печатается только его длина и короткий отпечаток для сверки.

Если SUPERADMIN_* не заданы, seed заполнит только справочники и предупредит:
это допустимо, если администратор будет создан иначе.

### 6. Обновление версии

```bash
git pull
docker compose -f docker-compose.staging.yml build
docker compose -f docker-compose.staging.yml run --rm migrate   # до старта api
docker compose -f docker-compose.staging.yml up -d
```

Порядок важен: миграции применяются **до** запуска новой версии API. Обратный
порядок даст окно, в котором код уже новый, а схема старая.

### 7. Бэкапы

Ежедневный дамп (`scripts/backup-db.mjs`) и проверка восстановления
(`scripts/check-backup.mjs`) — раздел Backups выше. Проверка восстановления
обязательна перед каждым релизным циклом: непроверенный бэкап бэкапом не является.

### 8. Мобильное приложение

Адрес API задается при сборке, а не хранится в коде: ApiConfig.fromEnvironment
читает API_BASE_URL, по умолчанию — 10.0.2.2 для эмулятора.

`ash
cd apps/mobile
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<API_HOST>/api/v1
`

**Release-сборка требует валидный TLS.** Android запрещает cleartext-HTTP в
release, а самоподписанный сертификат вызовет ошибку доверия: приложение не
подключится. Поэтому для стенда, на который ставится APK, нужен сертификат от
центра (Let's Encrypt через certbot или TLS от провайдера), а не
самоподписанный из шага 3.

Подпись APK: для внутренней раздачи достаточно debug-ключа, для публикации —
собственный keystore (docs/09-mobile-architecture.md).
### 9. Минимум настроек сервера

Порт базы и Redis наружу не публикуются (это заложено в compose), но сама машина
тоже должна быть закрыта. Ориентир для Ubuntu:

`ash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # ACME и редирект на HTTPS
ufw allow 443/tcp
ufw enable
`

Что еще стоит сделать до первого реального пользователя:

- unattended-upgrades для security-обновлений ОС;
- swap 2 ГБ, если RAM 4 ГБ: сборка образов на сервере требует памяти;
- отдельный пользователь для деплоя, а не root;
- проверка, что docker compose ps показывает все сервисы healthy, а
  docker compose logs api не содержит ошибок подключения к базе.
### Что проверяется в CI

Job `docker` собирает оба образа, запускает контейнер админки и проверяет, что
`/login` отвечает, а также прогоняет `nginx -t` с тестовыми сертификатами.
Отдельный шаг проверяет подстановку переменных в шаблоне: если `envsubst`
затронет `$host`, конфиг останется синтаксически валидным, но нерабочим, поэтому
проверяется наличие и подставленных доменов, и переменных nginx.

Сборка локально требует Docker; в средах без него ориентируйтесь на этот job.
