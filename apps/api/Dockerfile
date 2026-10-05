# OCTAGON Club System API (docs/14-infrastructure.md)
# Сборка из корня монорепо: docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --- deps: установка по lockfile ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @octagon/api... --prod=false

# --- build: компиляция TypeScript и генерация Prisma Client ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @octagon/api exec prisma generate
RUN pnpm --filter @octagon/api build
RUN pnpm --filter @octagon/api prune --prod

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -S octagon && adduser -S octagon -G octagon
WORKDIR /repo
COPY --from=build --chown=octagon:octagon /repo/node_modules ./node_modules
COPY --from=build --chown=octagon:octagon /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=octagon:octagon /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=octagon:octagon /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=octagon:octagon /repo/apps/api/package.json ./apps/api/package.json

USER octagon
EXPOSE 3000
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]
