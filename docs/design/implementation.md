# Agent implementation brief — OCTAGON Admin

## Goal
Apply current Figma design as a **provisional UI refresh** to existing Next.js admin, without altering product behavior. Work through PRs and screenshot-based review.

## Scope guard
- Do not change database schema, finance rules, authentication, permissions, API contracts or domain logic as part of UI alignment.
- Do not add CRM, push, competitions or other post-MVP features based on mockup labels.
- Do not show finance to unauthorized staff.
- Use actual API data and current state management; no hardcoded demo metrics in runtime.
- Do not treat mockup text as product copy when it conflicts with current requirements.
- Existing code tokens take precedence over approximate Figma values until design review.

## Agent workflow
1. Inspect `apps/admin` and the current UI components.
2. Read `docs/design/*`, `docs/11-admin-panel.md`, `docs/12-ui-guidelines.md`, `AGENTS.md`.
3. Inspect relevant Figma nodes via connected Figma tool or node screenshots; if agent cannot access Figma, **stop and request exported screenshots**, do not invent appearance.
4. Create a gap matrix: screen / existing UI / Figma difference / implementation cost / permission implications.
5. Submit proposed implementation batch and screenshots for user review.
6. Implement approved batch, run tests/build, attach before/after screenshots to PR.
7. Wait for approval before further batches.

## Suggested batches
- Batch A: sidebar, header, typography, token alignment and responsive shell.
- Batch B: overview, athletes/groups/trainers/branches lists.
- Batch C: details, forms and modal states.
- Batch D: scheduling, attendance, finance, communication and settings.
- Batch E: mobile/tablet responsive pass and accessibility QA.

## Definition of Done
- All existing functionality preserved.
- Visual parity demonstrated with screenshots.
- Tests/lint/build green.
- Accessibility and responsive behavior checked.
- No unauthorized data exposure.
- No placeholder content shipped as real data.
- User approves PR.

## Important
Design is not yet final; this handoff is explicitly authorized as an intermediate application of existing mockups. Figma remains the source for visual design; GitHub remains the source for application code and business rules.
