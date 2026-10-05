#!/usr/bin/env bash
#
# Проверки монорепо OCTAGON для CI и для локальной машины на Linux/macOS.
#
# Windows-эквивалент: scripts/verify.ps1
#
# Требования: Node.js >= 22, pnpm 10, доступные PostgreSQL и Redis
# (переменные DATABASE_URL / TEST_DATABASE_URL / REDIS_URL).
#
# Запуск:
#   bash scripts/ci-verify.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "== install =="
pnpm install --frozen-lockfile --ignore-scripts

echo "== generate prisma client =="
pnpm db:generate

echo "== apply migrations to the test database =="
# Тестовая БД: e2e-тесты создают и удаляют свои данные, поэтому база отдельная.
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy:test
else
  echo "TEST_DATABASE_URL не задан — пропускаю миграцию тестовой БД"
fi

echo "== build, typecheck, lint, unit tests, e2e =="
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e

echo "== проверки пройдены =="
