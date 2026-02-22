---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-02-22T08:22:20Z'
---

# ATDD Checklist - Epic a, Story 1: ConnectShyft Feature Flag and Availability Guardrails

**Date:** 2026-02-22
**Author:** Jeremiah
**Primary Test Level:** API + E2E
**Story File:** `_bmad-output/implementation-artifacts/a-1-connectshyft-feature-flag-and-availability-guardrails.md`

---

## Step 1 - Preflight & Context

### Mandatory Policy Gates

- `PROJECT_LANE=connectshyft npm run policy:check` passed.
- `PROJECT_LANE=connectshyft npm run branch:ensure-workflow -- --workflow _bmad/tea/workflows/testarch/atdd/workflow.yaml --story _bmad-output/implementation-artifacts/a-1-connectshyft-feature-flag-and-availability-guardrails.md` passed.
- Active branch: `codex/story-a-1-connectshyft-feature-flag-and-availability-guardrails`

### Story Inputs Loaded

Acceptance criteria translated from story:

1. Module OFF state must fail closed on ConnectShyft API/UI entry points with controlled refusal/unavailable behavior.
2. Partial sub-flag state must expose only enabled capabilities with explicit operator-facing messaging.

Constraints captured:

- Feature flags: `connectshyft_enabled`, `connectshyft_inbox_enabled`, `connectshyft_escalation_enabled`, `connectshyft_webhooks_enabled`
- Shared envelope contract: `success` / `refusal` / `systemError`
- ConnectShyft routes under `/api/v1/connectshyft/*`

### Framework and Pattern Inputs Loaded

- Playwright config: `playwright.config.ts`
- Existing ATDD test patterns sampled:
  - `tests/api/platform/1-5-policy-gate-and-branch-workflow-guard-enforcement.atdd.api.spec.ts`
  - `tests/e2e/platform/1-5-policy-gate-and-branch-workflow-guard-enforcement.atdd.spec.ts`
- Existing fixture baseline:
  - `tests/fixtures/test-data.ts`

### Knowledge Fragments Applied

Core:

- `data-factories.md`
- `component-tdd.md`
- `test-quality.md`
- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`

Playwright-utils mode (`tea_use_playwright_utils=true`):

- `overview.md`
- `api-request.md`
- `network-recorder.md`
- `auth-session.md`
- `intercept-network-call.md`
- `recurse.md`
- `log.md`
- `file-utils.md`
- `network-error-monitor.md`
- `fixtures-composition.md`

Automation mode (`tea_browser_automation=auto`):

- `playwright-cli.md`

---

## Step 2 - Generation Mode

Mode selected: **AI generation**.

Reason:

- Acceptance criteria are explicit and deterministic.
- Existing platform ATDD file patterns are available for API and E2E.
- Story is fail-closed policy behavior and capability gating (no complex visual wizard recording required).

---

## Step 3 - Test Strategy

### AC-to-Scenario Mapping

**AC1 (module OFF fail-closed):**

- API: Inbox endpoint returns deterministic refusal envelope when module disabled. (`P0`)
- API: Thread ensure endpoint refuses when module disabled. (`P0`)
- E2E: `/app/connectshyft/inbox` shows unavailable state and blocks inbox UI. (`P0`)

**AC2 (partial sub-flags selective exposure):**

- API: Inbox remains available while escalation action endpoints refuse with explicit messaging. (`P1`)
- API: Webhook ingress endpoint refuses when webhooks sub-flag disabled. (`P1`)
- E2E: Capability state indicators show enabled/disabled split with explicit maintenance copy and disabled controls. (`P1`)

### Test Levels

- API tests for refusal contracts and capability gating behavior.
- E2E tests for operator-visible availability/messaging behavior.

### Red Phase Confirmation

All generated tests are intentionally marked with `test.skip()` and assert expected target behavior.

---

## Step 4 - Generated Failing Tests (RED)

### API Tests (4)

File: `tests/api/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.atdd.api.spec.ts`

- `[P0]` fail-closed inbox refusal when module disabled
- `[P0]` fail-closed thread ensure refusal when module disabled
- `[P1]` partial flags: inbox available, escalation action refused
- `[P1]` webhooks disabled refusal on inbound webhook endpoint

### E2E Tests (3)

File: `tests/e2e/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.atdd.spec.ts`

- `[P0]` module-disabled inbox journey shows explicit unavailable state
- `[P1]` partial flags show capability-level availability split and maintenance banner
- `[P1]` webhook-disabled state hides/disables webhook operator controls with explanation

### Fixture/Data Infrastructure

Updated file: `tests/fixtures/test-data.ts`

- Added `connectShyftFeatureFlagData` for deterministic module/sub-flag test states.

### Subprocess Artifact Aggregation

- API subprocess output: `_bmad-output/test-artifacts/atdd-temp/api-2026-02-22T08-22-20-963Z.json`
- E2E subprocess output: `_bmad-output/test-artifacts/atdd-temp/e2e-2026-02-22T08-22-20-963Z.json`
- Aggregated summary: `_bmad-output/test-artifacts/atdd-temp/summary-2026-02-22T08-22-20-963Z.json`

### TDD Red-Phase Validation

- All tests include `test.skip()`.
- No placeholder assertions (`expect(true).toBe(true)`) found.
- All generated scenarios assert expected target behavior.

---

## Step 5 - Validation and Completion

Checklist validation outcome:

- Prerequisites satisfied: yes
- Mandatory policy/workflow guards passed: yes
- Test files created in correct locations: yes
- Red-phase intent preserved (`test.skip` + expected behavior assertions): yes
- Temp artifacts persisted under `_bmad-output/test-artifacts/atdd-temp`: yes
- CLI session cleanup required: no CLI session opened during this run

### Generated Files

- `tests/api/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.atdd.api.spec.ts`
- `tests/e2e/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.atdd.spec.ts`
- `tests/fixtures/test-data.ts`
- `_bmad-output/test-artifacts/atdd-checklist-a-1.md`
- `_bmad-output/test-artifacts/atdd-temp/api-2026-02-22T08-22-20-963Z.json`
- `_bmad-output/test-artifacts/atdd-temp/e2e-2026-02-22T08-22-20-963Z.json`
- `_bmad-output/test-artifacts/atdd-temp/summary-2026-02-22T08-22-20-963Z.json`

### Risks / Assumptions

- ConnectShyft route surface and UI paths are asserted per planning artifacts and may need endpoint/path adjustment once implementation lands.
- Refusal codes/messages are specified as target behavior and may require alignment to final code constants selected during implementation.

### Next Step Recommendation

Proceed to implementation workflow and remove `test.skip()` only after feature behavior is implemented and stabilized.
