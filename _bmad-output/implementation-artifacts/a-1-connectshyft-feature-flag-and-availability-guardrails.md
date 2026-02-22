# Story a.1: ConnectShyft Feature Flag and Availability Guardrails

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant administrator,
I want ConnectShyft to be controlled by module and sub-feature flags,
so that rollout can be safely enabled, limited, or reversed without deployment changes.

## Acceptance Criteria

1. Given ConnectShyft feature flags are disabled, when a user tries to access ConnectShyft routes or UI surfaces, then the system fails closed with controlled unavailable/refusal responses.
2. Given only selected ConnectShyft sub-flags are enabled, when users access ConnectShyft capabilities, then only enabled capabilities are exposed with explicit operator messaging.

## Operability Guardrails

- Guardrail Classification Reviewed: yes
- Critical Capability: yes
- Access-Control Story: no
- Backend/API Implies Human Operability: yes
- Frontend/Operator Usability Criteria Included: yes
- Operability Pairing Notes: API refusals use deterministic business-envelope messaging while UI surfaces show matching unavailable and maintenance copy with disabled controls.
- Real-User Validation Evidence: Ran `npm run test:e2e -- tests/api/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.api.spec.ts` and `npm run test:e2e -- tests/e2e/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.spec.ts` to validate module-off and partial-flag operator flows end-to-end.
- Real-User Validation Result: pass
- Role-Admin UI Path: N/A
- Role-Admin UI Path Verified: n/a
- Access-Control Exemption Rationale: Story is rollout gating and availability behavior, not role assignment.

## Tasks / Subtasks

- [x] Implement module and sub-flag evaluation in ConnectShyft entry points (AC: 1, 2)
  - [x] Enforce fail-closed behavior when `connectshyft_enabled` is false.
  - [x] Enforce selective capability exposure for sub-flags (inbox/escalation/webhooks).
- [x] Implement unavailable/refusal behavior and operator messaging (AC: 1, 2)
  - [x] Return shared refusal envelope responses for disabled backend endpoints.
  - [x] Render explicit unavailable/maintenance messaging in ConnectShyft UI surfaces.
- [x] Add deterministic tests for OFF/ON and partial-flag states (AC: 1, 2)
  - [x] API tests for refusal envelopes in disabled state.
  - [x] E2E tests for visible UI availability messaging and hidden disabled actions.

## Dev Notes

### Technical Requirements

- Feature flags default OFF in production and must support kill-switch behavior.
- Sub-flags include `connectshyft_inbox_enabled`, `connectshyft_escalation_enabled`, and `connectshyft_webhooks_enabled`.
- Keep response behavior aligned to shared `success/refusal/systemError` envelope semantics.

### Architecture Compliance

- Preserve bounded-context safety: no direct ConnectShyft-to-RouteShyft module imports.
- Implement fail-closed behavior consistently at API and UI boundaries.

### File Structure Requirements

- Backend guardrails and route checks: `src/src/modules/connectshyft/` and `src/src/routes/api/v1/`.
- Frontend availability UX and gating: `frontend/src/` views/router/store.
- Tests: `tests/api/platform/` and `tests/e2e/platform/`.

### Testing Requirements

- Validate complete OFF state for ConnectShyft module.
- Validate mixed sub-flag states (enabled capability visible, disabled capability refused/hidden).
- Verify refusal envelope contract and operator-facing copy remain deterministic.

### Project Structure Notes

- Keep changes additive and scoped to ConnectShyft paths.
- Do not modify RouteShyft behavior while implementing ConnectShyft availability guardrails.

### References

- `_bmad-output/planning-artifacts/epics-ConnectShyft-2026-02-19.md` (Epic a, Story a.1)
- `_bmad-output/planning-artifacts/architecture-ConnectShyft-2026-02-19.md` (Feature Flags and Rollout)
- `_bmad-output/planning-artifacts/ux-design-specification-ConnectShyft-2026-02-19.md` (Feature Flag UX Behavior)
- `_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run test:e2e -- tests/api/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.api.spec.ts` (pass, 7/7)
- `npm run test:e2e -- tests/e2e/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.spec.ts` (pass, 4/4)
- `npm test -- --runInBand src/src/modules/connectshyft/__tests__/featureFlags.test.ts src/src/__tests__/app-entrypoint-kernel.test.ts` (pass, 12/12)
- `npm test` in `src/` (pass)
- `npm run build` in `frontend/` (pass)
- `npm run policy:check` (fails on pre-existing HEAD commit subject format)

### Implementation Plan

- Add a dedicated ConnectShyft feature-flag evaluator with fail-closed defaults and capability-level refusal contracts.
- Guard all ConnectShyft backend entry points using shared refusal envelope semantics.
- Add ConnectShyft frontend availability surfaces driven by server-sourced availability flags.
- Validate OFF/ON/partial states via existing story API and E2E suites plus backend regression tests.

### Completion Notes List

- Implemented `src/src/modules/connectshyft/featureFlags.ts` for module and sub-capability evaluation with kill-switch defaults.
- Added `src/src/routes/api/v1/connectshyft.ts` availability endpoint plus deterministic refusal envelopes and capability-aware action exposure for enabled-state responses.
- Added frontend ConnectShyft availability/inbox UI routes with explicit unavailable and maintenance messaging sourced from backend availability data.
- Added backend unit coverage for feature-flag parsing/evaluation and updated route-registry contract expectations.
- Restricted test-only flag overrides to explicit test harness mode and tightened UI route auth requirements.
- Verified acceptance criteria with expanded API + E2E contract suites and backend/frontend regression commands.

### File List

- _bmad-output/implementation-artifacts/a-1-connectshyft-feature-flag-and-availability-guardrails.md
- _bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml
- src/src/modules/connectshyft/featureFlags.ts
- src/src/modules/connectshyft/__tests__/featureFlags.test.ts
- src/src/routes/api/v1/connectshyft.ts
- src/src/api/registerRoutes.ts
- src/src/__tests__/app-entrypoint-kernel.test.ts
- frontend/src/features/connectshyft/flags.ts
- frontend/src/vite-env.d.ts
- frontend/src/views/ConnectShyft/ConnectShyftInboxView.vue
- frontend/src/views/ConnectShyft/ConnectShyftAvailabilityView.vue
- frontend/src/router/index.ts
- scripts/run-playwright-with-preflight.sh
- tests/api/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.api.spec.ts
- tests/e2e/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.spec.ts
- tests/support/factories/connectShyftStoryA1Factory.ts
- tests/support/fixtures/connectShyftStoryA1.fixture.ts

## Change Log

- 2026-02-22: Implemented ConnectShyft module/sub-flag fail-closed guardrails across API and UI, and validated deterministic refusal/availability behavior with story API and E2E suites.
- 2026-02-22: Addressed review findings by moving feature-flag authority server-side, adding positive-path API coverage, auth-gating ConnectShyft UI routes, and syncing story File List with git-tracked story artifacts.
