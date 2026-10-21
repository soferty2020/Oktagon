import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Конфигурация web-админки (docs/13-architecture.md: apps/admin — Next.js).
 *
 * Админка не обращается к backend напрямую из браузера: все запросы идут через
 * route handlers приложения (`src/app/api/proxy`). Так токены остаются в
 * httpOnly-cookie и не попадают в JavaScript страницы
 * (docs/15-security.md: короткоживущие access-токены, секреты вне клиента).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Автономная сборка для контейнера.
   *
   * `standalone` кладет в `.next/standalone` только те файлы, которые реально
   * нужны в рантайме, вместе с урезанным `node_modules`. Без этого образам
   * пришлось бы тащить весь `node_modules`, а он в разы больше самого
   * приложения: это замедляет выкат и раздувает хранилище образов.
   *
   * Проверяется в CI отдельным job: собранный образ запускается и отвечает на
   * запрос, иначе ошибка вида «модуль не найден» всплыла бы только на сервере.
   */
  output: 'standalone',
  // Workspace-пакеты содержат TypeScript-исходники, их нужно транспилировать.
  transpilePackages: ['@octagon/contracts'],
  webpack: (config) => {
    // На Windows пакеты pnpm подключены junction-ссылками, и сборщик не всегда
    // проходит через них. Алиас на исходники делает резолв одинаковым на всех
    // платформах; транспиляцию обеспечивает transpilePackages.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@octagon/contracts': join(currentDir, '..', '..', 'packages', 'contracts', 'src', 'index.ts'),
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@octagon/contracts': '../../packages/contracts/src/index.ts',
    },
  },
};

export default nextConfig;

