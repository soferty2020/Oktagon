# OCTAGON Club System API (docs/14-infrastructure.md)
# Сборка из корня монорепо: docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS base
# pnpm ставится фиксированной версии, а не через corepack. Corepack без поля
# `packageManager` берет последнюю версию (сейчас 12.x), а lockfile создан pnpm
# 10.x: при `--frozen-lockfile` это несовместимо, и сборка падает. В CI тот же
# pnpm 10 ставится через pnpm/action-setup, поэтому версия совпадает.
RUN npm install -g pnpm@10.34.7
# Prisma на Alpine требует openssl (движок связывается с libssl), а libc6-compat
# нужен части нативных модулей. Без этого `prisma generate` и запуск падают с
# «Unable to require libquery_engine».
RUN apk add --no-cache openssl libc6-compat
WORKDIR /repo

# --- deps: установка по lockfile ---
#
# Второй фильтр включает сами пакеты: их `typescript` лежит в devDependencies, а
# `--filter @octagon/api...` ставит зависимости API, но не devDependencies его
# workspace-зависимостей. Без этого `pnpm build:packages` падал бы на отсутствии
# tsc.
FROM base AS deps
# Зеркало движков Prisma: с этого хоста binaries.prisma.sh недоступен из
# сборочной сети (SSL reset), поэтому движок берём с зеркала. Значение
# переопределяется build-arg, если зеркало не нужно.

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @octagon/api... --filter "./packages/**" --prod=false

# --- build: компиляция TypeScript и генерация Prisma Client ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# Пакеты отдают только собранный dist (`main`/`types` указывают на него), а
# `.dockerignore` исключает dist из контекста: он собирается здесь. Без этого
# шага компиляция падает на «Cannot find module @octagon/contracts».
RUN pnpm build:packages
RUN pnpm --filter @octagon/api exec prisma generate
RUN pnpm --filter @octagon/api build
# `prune --prod` здесь не используется: `pnpm prune` не принимает `--filter`
# (флаг разворачивается в `--recursive`, который prune не поддерживает), и
# сборка падала на «Unknown option: 'recursive'». В образ попадают
# devDependencies — это увеличивает размер, но не влияет на работу; вынос
# прод-зависимостей в отдельную стадию — отдельная задача.

# --- migrate: применение миграций перед стартом новой версии ---
#
# Отдельная стадия, а не runtime: в runtime стоит `prune --prod`, и CLI Prisma там
# отсутствует. Миграции должны примениться до того, как поднимется API новой
# версии, поэтому в compose это отдельный одноразовый контейнер, который
# запускается первым (`docker compose run --rm migrate`).
#
# Используется стадия `deps`: там есть devDependencies с CLI Prisma, но нет
# компиляции TypeScript — образ нужен только для одной команды.
FROM deps AS migrate
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/package.json
# Пакеты собираются здесь: `pnpm ranks:report` импортирует `@octagon/contracts`, а
# в стадии migrate нет `dist` пакетов (`.dockerignore` его исключает). Без сборки
# отчёт падал на «Cannot find module '@octagon/contracts'».
RUN pnpm build:packages
# Prisma Client тоже нужен: отчёт читает БД через сгенерированный клиент, а в
# стадии migrate его нет (генерируется в стадии build).
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN pnpm --filter @octagon/api exec prisma generate
WORKDIR /repo/apps/api
CMD ["pnpm", "db:deploy"]

# --- seed: справочные данные и первый суперадминистратор ---
#
# Отдельная стадия по той же причине, что и `migrate`: `db:seed` написан на
# TypeScript (ts-node) и импортирует `src/modules/auth/password.service.ts`, чтобы
# хешировать пароль тем же Argon2id, что и вход. В runtime-образе ни ts-node, ни
# исходников нет, поэтому seed запускается из стадии сборки, где есть и то, и
# другое, и сгенерированный Prisma Client.
#
# Стадия идемпотентна: повторный запуск не создает дубликатов, а пароль берется
# из SUPERADMIN_PASSWORD и в логи не пишется.
FROM build AS seed
WORKDIR /repo/apps/api
CMD ["pnpm", "db:seed"]

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -S octagon && adduser -S octagon -G octagon
WORKDIR /repo
COPY --from=build --chown=octagon:octagon /repo/node_modules ./node_modules
COPY --from=build --chown=octagon:octagon /repo/apps/api/node_modules ./apps/api/node_modules
# Workspace-пакеты обязательны: в node_modules/@octagon/* лежат симлинки на
# /repo/packages/*, и без самих пакетов Node падал на «Cannot find module
# '@octagon/config'». Сборка их собирала, но в runtime они не копировались.
COPY --from=build --chown=octagon:octagon /repo/packages ./packages
COPY --from=build --chown=octagon:octagon /repo/apps/api/dist ./apps/api/dist
# Prisma Client генерируется в apps/api/generated (output в schema.prisma), а не в
# node_modules: без каталога dist/prisma/prisma.service.js падает на
# «Cannot find module .../generated/prisma».
COPY --from=build --chown=octagon:octagon /repo/apps/api/generated ./apps/api/generated
COPY --from=build --chown=octagon:octagon /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=octagon:octagon /repo/apps/api/package.json ./apps/api/package.json

# Каталог загрузок (#70): том `uploads` наследует владельца из образа при первом
# создании. Без этого контейнер под octagon не смог бы писать в /data/uploads.
RUN mkdir -p /data/uploads && chown -R octagon:octagon /data

USER octagon
EXPOSE 3000
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]
