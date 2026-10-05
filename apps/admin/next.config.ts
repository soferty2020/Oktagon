import type { NextConfig } from 'next';

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
  // Workspace-пакеты содержат TypeScript-исходники, их нужно транспилировать.
  transpilePackages: ['@octagon/contracts'],
};

export default nextConfig;
