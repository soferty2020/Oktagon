# ADR-0001: Modular Monolith for MVP

Status: Accepted

## Context
Команда небольшая, пользователей на старте около 40, ожидается рост, но нет нагрузки, оправдывающей микросервисы.

## Decision
Использовать NestJS modular monolith с четкими module boundaries.

## Consequences
Плюсы: проще разработка, тестирование, деплой и транзакции.
Минусы: требуется дисциплина границ модулей.
