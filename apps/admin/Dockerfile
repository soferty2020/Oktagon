# OCTAGON Club System — web-админка (docs/14-infrastructure.md)
#
# Сборка из корня монорепозитория:
#   docker build -f apps/admin/Dockerfile -t octagon-admin .
#
# Образ основан на `output: 'standalone'` (apps/admin/next.config.ts): Next
# складывает в `.next/standalone` только нужное для рантайма вместе с урезанным
# `node_modules`. Копировать весь `node_modules` было бы в разы дороже и по
# размеру, и по времени выката.

FROM node:22-alpine AS base
# pnpm фиксированной версии, а не через corepack: corepack без поля
# `packageManager` берет последнюю (12.x), а lockfile создан pnpm 10.x — при
# `--frozen-lockfile` это несовместимо. В CI версия та же (pnpm/action-setup).
RUN npm install -g pnpm@10.34.7
# Next в контейнере не должен тянуть телеметрию: это лишний сетевой вызов и
# шум в логах.
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo

# --- deps: установка по lockfile -------------------------------------------
# `--filter @octagon/admin...` ставит зависимости админки и ее workspace-зависимостей
# (@octagon/contracts). Второй фильтр нужен для devDependencies пакетов: их
# `typescript` используется при сборке contracts, а без него `build:packages`
# падает. Копируются только package.json: слой переиспользуется, пока не
# изменились зависимости.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @octagon/admin... --filter "./packages/**" --prod=false

# --- build: сборка Next -----------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/admin ./apps/admin
# Пакеты отдают только dist, а `.dockerignore` его исключает: собирается здесь.
# Админка резолвит contracts через alias на исходники, но Next и его инструменты
# в части случаев идут через node_modules, поэтому dist должен существовать.
RUN pnpm build:packages
RUN pnpm --filter @octagon/admin build

# --- runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# Непривилегированный пользователь: приложение не должно работать от root.
# Уязвимость в зависимостях тогда не дает прав на всю файловую систему.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs
WORKDIR /app

# Standalone-сборка кладет приложение в `apps/admin` (структура монорепозитория),
# поэтому и запуск идет из этого пути.
COPY --from=build --chown=nextjs:nodejs /repo/apps/admin/.next/standalone ./
# Статику Next не включает в standalone: без этих двух копирований страницы
# открывались бы без стилей и клиентских скриптов.
COPY --from=build --chown=nextjs:nodejs /repo/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs
EXPOSE 3000

# HOSTNAME=0.0.0.0 обязателен: иначе сервер слушает только localhost и снаружи
# контейнера недоступен.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/admin/server.js"]
