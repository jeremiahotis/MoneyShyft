# Story a.5: Capability-Based Route Access and Envelope Contract Compliance

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a tenant operations lead,
I want capability checks and response envelopes to be consistent across ConnectShyft APIs,
so that client behavior is predictable and unauthorized operations are safely refused.

## Acceptance Criteria

1. Given users with different role capabilities call ConnectShyft APIs, when authorization executes, then permission checks are enforced server-side at endpoint and service boundaries.
2. Given any ConnectShyft API response path (success, refused, system error), when serialization executes, then all responses follow shared `success/refusal/systemError` envelope semantics.

## Operability Guardrails

- Guardrail Classification Reviewed: yes
- Critical Capability: yes
- Access-Control Story: yes
- Backend/API Implies Human Operability: yes
- Frontend/Operator Usability Criteria Included: yes
- Operability Pairing Notes: UI behavior must map refusal reasons to actionable operator feedback without exposing unauthorized data.
- Real-User Validation Evidence: Capability matrix tests + endpoint/service boundary authorization checks.
- Real-User Validation Result: pass
- Role-Admin UI Path: Tenant admin role/capability assignment path must be testable for coverage scenarios.
- Role-Admin UI Path Verified: yes
- Access-Control Exemption Rationale: N/A

## Tasks / Subtasks

- [x] Implement capability checks across endpoint and service layers (AC: 1)
  - [x] Apply role/capability checks at route guard and business-service boundaries.
  - [x] Ensure deny-by-default behavior for unauthorized operations.
- [x] Enforce envelope contract compliance for all ConnectShyft responses (AC: 2)
  - [x] Use shared `success/refusal/systemError` envelope helpers.
  - [x] Remove or prevent non-standard ad hoc response shapes in ConnectShyft endpoints.
- [x] Add coverage tests for capability and envelope behavior (AC: 1, 2)
  - [x] API contract tests for authorized vs unauthorized capability paths.
  - [x] Response-shape tests for success/refusal/systemError variants.

## Dev Notes

### Technical Requirements

- FR coverage: FR-CS-001, FR-CS-002, FR-CS-003.
- NFR coverage: NFR-CS-001, NFR-CS-002, NFR-CS-004.
- Depends on: a.2 tenant/orgUnit context enforcement.
- Parallel lane: lane-a-platform-guards.

### Architecture Compliance

- Maintain strict tenant/orgUnit boundary checks while enforcing capabilities.
- Keep response envelope behavior consistent across all ConnectShyft APIs.

### File Structure Requirements

- Backend auth/capability guards and response helpers: `src/src/platform/` and `src/src/modules/connectshyft/`.
- API routes: `src/src/routes/api/v1/`.
- Tests: `tests/api/platform/` plus targeted integration tests under `src/`.

### Testing Requirements

- Validate capability matrix behavior per role and context.
- Validate refusal semantics for unauthorized calls with no data leakage.
- Validate shared envelope compliance for success, refusal, and system error paths.

### Project Structure Notes

- Reuse existing shared envelope utilities and authorization patterns.
- Keep ConnectShyft and RouteShyft boundaries isolated during implementation.

### References

- `_bmad-output/planning-artifacts/epics-ConnectShyft-2026-02-19.md` (Epic a, Story a.5)
- `_bmad-output/planning-artifacts/architecture-ConnectShyft-2026-02-19.md` (Policy/envelope and bounded-module constraints)
- `_bmad-output/planning-artifacts/ux-design-specification-ConnectShyft-2026-02-19.md` (Refusal behavior and operator interaction constraints)
- `_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Harden ConnectShyft route/service boundaries by enforcing role capability checks for thread view/claim/takeover flows.
- Preserve deny-by-default refusal semantics for escalation actions when tenant-scoped roles bypass orgUnit membership without takeover authority.
- Preserve shared envelope serializer usage for all ConnectShyft success/refusal paths and validate against capability matrix API coverage.

### Debug Log References

- `cd src && npm test -- src/modules/connectshyft/__tests__/numberMappings.test.ts src/modules/connectshyft/__tests__/escalationConfig.test.ts` (pass)
- `cd src && npm run build` (pass)
- `npm run test:e2e -- tests/api/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.api.spec.ts tests/e2e/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.spec.ts tests/api/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.atdd.api.spec.ts tests/e2e/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.atdd.spec.ts` (pass: 17 passed, 0 skipped)
- `npm run policy:check` (pass)
- `POLICY_ENFORCE_NO_SKIPPED_TESTS=true npm run policy:check` (pass)

### Completion Notes List

- Added service-layer capability enforcement for number-mapping mutation paths and escalation-configuration persistence paths to close endpoint-only authorization gaps.
- Reordered claim/takeover refusal flow to enforce capability-specific refusal contracts before membership-gate checks for bypassed tenant roles.
- Fixed Story A.5 shared fixture contract path to use the implemented platform envelope response-matrix system-error endpoint.
- Unskipped and stabilized all Story A.5 automated validations (2 mainline E2E + 6 ATDD API + 3 ATDD E2E) and confirmed full pass.

### File List

- _bmad-output/implementation-artifacts/a-5-capability-based-route-access-and-envelope-contract-compliance.md
- _bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml
- src/src/modules/connectshyft/numberMappings.ts
- src/src/modules/connectshyft/escalationConfig.ts
- src/src/modules/connectshyft/__tests__/numberMappings.test.ts
- src/src/modules/connectshyft/__tests__/escalationConfig.test.ts
- src/src/routes/api/v1/connectshyft.ts
- frontend/src/services/platformAdmin.ts
- frontend/src/views/Admin/SystemAdminView.vue
- frontend/src/views/Admin/TenantAdminView.vue
- frontend/src/views/ConnectShyft/ConnectShyftEscalationSettingsView.vue
- frontend/src/views/ConnectShyft/ConnectShyftNumberMappingsView.vue
- src/.env.example
- src/src/api/registerRoutes.ts
- src/src/platform/middleware/__tests__/moduleEntitlement.test.ts
- src/src/platform/middleware/moduleEntitlement.ts
- src/src/routes/api/v1/__tests__/platform-admin.test.ts
- src/src/routes/api/v1/platform-admin.ts
- src/src/services/PlatformAdminService.ts
- src/src/services/__tests__/PlatformAdminService.test.ts
- tests/api/platform/1-5-policy-gate-and-branch-workflow-guard-enforcement.api.spec.ts
- tests/api/platform/a-3-orgunit-number-mapping-management.api.spec.ts
- tests/e2e/platform/a-3-orgunit-number-mapping-management.spec.ts
- tests/api/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.api.spec.ts
- tests/api/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.atdd.api.spec.ts
- tests/e2e/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.spec.ts
- tests/e2e/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.atdd.spec.ts
- tests/fixtures/test-data.ts
- tests/support/factories/connectShyftStoryA3Factory.ts
- tests/support/factories/connectShyftStoryA5Factory.ts
- tests/support/fixtures/connectShyftStoryA5.fixture.ts
- tests/support/utils/policyScriptTestHarness.ts
- tests/support/utils/storyStatusTransitionTestHarness.ts

### Change Log

- 2026-02-22: Completed Story a.5 implementation and validation; status moved to `review`.
- 2026-02-22: Resolved senior review findings for service-boundary authorization, refusal-contract precedence, fixture contract path correctness, and skipped Story A.5 validations.
