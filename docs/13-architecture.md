# 13. Architecture

## Решение
Modular monolith для MVP.

## Monorepo
- apps/api — NestJS
- apps/admin — Next.js
- apps/mobile — Flutter
- packages/contracts — OpenAPI/DTO/generated clients where applicable
- packages/config — shared non-secret config schemas

## Backend modules
- auth
- identity
- athletes
- club-structure
- groups
- scheduling
- attendance
- finance
- freezes
- news
- chat
- analytics
- audit

## Principles
- business logic не должна жить только в UI;
- permission checks выполняются на backend;
- domain rules покрываются unit/integration tests;
- внешние интеграции изолируются adapters/interfaces.
