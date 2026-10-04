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

## Environments
- local
- staging
- production

Секреты не хранятся в Git.
