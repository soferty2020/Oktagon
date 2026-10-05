-- Инициализация локального PostgreSQL (docs/14-infrastructure.md).
-- Основная схема создается миграциями Prisma; здесь только то, что должно
-- существовать до первой миграции.
--
-- Расширение pgcrypto дает gen_random_uuid() для PostgreSQL < 13.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Отдельная БД для e2e-тестов (docs/16-testing.md, CI).
SELECT 'CREATE DATABASE octagon_test OWNER ' || quote_ident(current_user)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'octagon_test')\gexec
