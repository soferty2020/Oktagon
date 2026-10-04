# 24. Multi-Agent Execution Plan

## Workstreams
1. Architecture/Contracts Agent — ERD, OpenAPI, ADR, cross-module consistency.
2. Backend Identity Agent — auth/users/permissions.
3. Backend Core Agent — athletes/branches/groups.
4. Backend Operations Agent — schedule/attendance.
5. Backend Finance Agent — periods/payments/freezes/debt.
6. Backend Communication Agent — news/chat.
7. Mobile Agent — Flutter client.
8. Admin Agent — Next.js admin.
9. QA Agent — automated tests, acceptance suite.
10. DevOps Agent — Docker, CI, staging, backups.

## Coordination
Contracts-first. Parallel implementation starts only after affected schemas and permissions are agreed.

## Ownership boundaries
Agents must not silently modify another workstream's public contract. Cross-cutting change requires ADR or explicit issue and documentation update.

## Merge order
Foundation -> identity/core -> schedule -> attendance/finance -> communication -> clients -> stabilization.

## Handoff
Every completed issue must leave:
- implementation;
- tests;
- migration if needed;
- API/doc update;
- notes for dependent issues.
