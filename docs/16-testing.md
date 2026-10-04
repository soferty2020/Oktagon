# 16. Testing Strategy

## Backend
- unit tests for business rules;
- integration tests for DB modules;
- API e2e for critical flows.

## Mobile/Web
- component/widget tests;
- state-management tests;
- smoke e2e for critical flows.

## Critical scenarios
- multi-athlete account;
- permission boundaries;
- schedule exception;
- attendance edit;
- debt calculation;
- retroactive freeze;
- payment marking fully paid;
- chat membership access.

## CI
PR не должен merge при failed lint/test/build.
