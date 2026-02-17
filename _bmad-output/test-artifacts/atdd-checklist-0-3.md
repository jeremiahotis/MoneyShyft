---
stepsCompleted: ['step-01-preflight-and-context','step-02-generation-mode','step-03-test-strategy','step-04-generate-tests','step-04c-aggregate','step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-17'
---

# ATDD Checklist - Epic 0, Story 3: Platform session store and refresh rotation

**Date:** 2026-02-17
**Author:** Jeremiah
**Primary Test Level:** API

---

## Story Summary

Story 0.3 hardens session security by requiring first-party refresh session persistence with auditable metadata and strict refresh rotation semantics. The RED-phase test suite defines deterministic rejection behavior for replayed and revoked refresh tokens before implementation begins.

**As a** security engineer
**I want** first-party session persistence with refresh rotation
**So that** token lifecycle and revocation are auditable and safe

---

## Acceptance Criteria

1. `platform.sessions` stores hashed refresh state, expiry, and revocation metadata.
2. replayed/revoked refresh tokens are rejected.

---

## Failing Tests Created (RED Phase)

### API Tests (4 tests)

**File:** `tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`

- ✅ **Test:** persists hashed refresh state with expiry and revocation metadata `@P0`
  - **Status:** RED - refresh session issue contract is not implemented yet.
  - **Verifies:** hashed refresh state + expiry/revocation metadata persistence in `platform.sessions`.

- ✅ **Test:** rotates refresh sessions and revokes prior refresh state atomically `@P0`
  - **Status:** RED - rotation contract is not implemented yet.
  - **Verifies:** prior refresh token state is revoked and replacement token metadata is persisted.

- ✅ **Test:** rejects replayed refresh token attempts deterministically `@P1`
  - **Status:** RED - replay detection semantics are not implemented yet.
  - **Verifies:** replayed refresh tokens are refused with deterministic security refusal code.

- ✅ **Test:** rejects revoked refresh tokens across subsequent refresh attempts `@P1`
  - **Status:** RED - revoked-token refusal path is not implemented yet.
  - **Verifies:** revoked refresh credentials cannot be reused.

### E2E Tests (3 tests)

**File:** `tests/e2e/platform/platform-session-store-and-refresh-rotation.spec.ts`

- ✅ **Test:** shows active refresh session metadata after authenticated entry `@P0`
  - **Status:** RED - security session panel behavior is not implemented yet.
  - **Verifies:** refresh hash/expiry/revocation fields are visible in user security journey.

- ✅ **Test:** rotates refresh token and replaces prior session card in security journey `@P0`
  - **Status:** RED - UI/session rotation flow is not implemented yet.
  - **Verifies:** prior token is marked revoked and replacement token is active.

- ✅ **Test:** blocks replayed or revoked refresh actions with deterministic refusal banner `@P1`
  - **Status:** RED - refusal-banner behavior is not implemented yet.
  - **Verifies:** replay/revocation rejections surface deterministic refusal codes in UI flow.

### Component Tests (0 tests)

No component tests are required for this platform-kernel security story.

---

## Data Factories Created

### Session Rotation Factory

**File:** `tests/support/factories/sessionRotationFactory.ts`

**Exports:**

- `createSessionHeaders(overrides?)` - builds tenant/auth/correlation/csrf header sets.
- `createRefreshIssuePayload(overrides?)` - builds payload for refresh-session issue contract.
- `createRefreshRotatePayload(overrides?)` - builds payload for refresh rotation contract.
- `createRefreshRevokePayload(overrides?)` - builds payload for explicit refresh revocation contract.

---

## Fixtures Created

### Session Rotation Fixture

**File:** `tests/support/fixtures/sessionRotation.fixture.ts`

**Fixtures:**

- `sessionHeaders` - generated request headers with tenant/auth context.
- `refreshIssuePayload` - generated issue payload test data.
- `refreshRotatePayload` - generated rotate payload test data.
- `refreshRevokePayload` - generated revoke payload test data.

---

## Mock Requirements

No third-party mocks required. Story targets platform kernel session contracts and first-party refresh security semantics.

---

## Required data-testid Attributes

### Login + Security Session UI

- `auth-email-input` - login email input.
- `auth-password-input` - login password input.
- `session-store-panel` - session security panel container.
- `refresh-token-hash` - active refresh hash display field.
- `refresh-token-expires-at` - refresh expiry display field.
- `refresh-token-revoked-at` - refresh revocation status field.
- `session-rotation-toast` - rotation success signal.
- `previous-refresh-token-status` - previous refresh status label.
- `active-refresh-token-status` - active refresh status label.
- `session-refusal-banner` - replay/revoke refusal container.
- `session-refusal-code` - deterministic refusal code display element.

---

## Implementation Checklist

### Test: persists hashed refresh state with expiry and revocation metadata

**File:** `tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Implement `POST /api/v1/platform/_kernel/sessions/refresh/issue`.
- [ ] Persist hashed refresh token state in `platform.sessions` (never raw token).
- [ ] Persist `refreshTokenExpiresAt` and `revokedAt` metadata fields.
- [ ] Return deterministic success envelope for created session metadata.
- [ ] Run test: `npm run test:e2e -- tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 3-5 hours

### Test: rotates refresh sessions and revokes prior refresh state atomically

**File:** `tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Implement `POST /api/v1/platform/_kernel/sessions/refresh/rotate`.
- [ ] Revoke prior refresh record and persist replacement refresh hash atomically.
- [ ] Emit audit-ready rotation metadata (`priorRevokedAt`, replacement session linkage).
- [ ] Run test: `npm run test:e2e -- tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 3-6 hours

### Test: rejects replayed refresh token attempts deterministically

**File:** `tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Detect replayed refresh token use against rotated/revoked state.
- [ ] Return deterministic refusal envelope `REFRESH_TOKEN_REPLAY_DETECTED`.
- [ ] Ensure refusal uses security refusal type + stable status code.
- [ ] Run test: `npm run test:e2e -- tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2-4 hours

### Test: rejects revoked refresh tokens across subsequent refresh attempts

**File:** `tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Implement `POST /api/v1/platform/_kernel/sessions/refresh/revoke`.
- [ ] Ensure revoked refresh credentials cannot be used for future rotation.
- [ ] Return deterministic refusal envelope `REFRESH_TOKEN_REVOKED`.
- [ ] Run test: `npm run test:e2e -- tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2-4 hours

---

## Running Tests

```bash
# Collect and run Story 0.3 RED-phase tests
npm run test:e2e -- tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts tests/e2e/platform/platform-session-store-and-refresh-rotation.spec.ts

# Headed e2e diagnostics
npm run test:e2e:headed -- tests/e2e/platform/platform-session-store-and-refresh-rotation.spec.ts

# Debug story suite
npm run test:e2e:debug -- tests/e2e/platform/platform-session-store-and-refresh-rotation.spec.ts
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

- ✅ API and E2E acceptance tests generated for Story 0.3.
- ✅ Tests encode expected behavior for session persistence + refresh security.
- ✅ Tests are intentionally skipped to mark pre-implementation RED artifacts.
- ✅ Support factory and fixture generated for deterministic payload/header setup.

### GREEN Phase (DEV Team - Next Steps)

1. Implement refresh issue/rotate/revoke platform kernel contracts.
2. Persist hashed refresh metadata in `platform.sessions` with audit fields.
3. Enforce deterministic replay/revoked token refusals.
4. Add session-security UI states and data-testid attributes listed above.
5. Remove `test.skip()` markers and run Story 0.3 suite until passing.

### REFACTOR Phase (After GREEN)

- Consolidate session-security request builders and refusal assertions in shared helpers.
- Reduce duplication between API and E2E assertions while preserving deterministic refusal coverage.

---

## Step Progress

- **Step 1:** Loaded story context, Playwright config, existing test patterns, TEA config flags (`tea_use_playwright_utils=true`, `tea_browser_automation=auto`), and required knowledge fragments.
- **Step 2:** Selected mode = **AI generation** (ACs are explicit and kernel/session contracts are well-defined).
- **Step 3:** Mapped AC coverage to **API-primary** with E2E security-journey parity and P0/P1 prioritization.
- **Step 4:** Generated RED-phase API/E2E specs plus factory/fixture support.
- **Step 4C:** Aggregated subprocess outputs, validated `test.skip()` compliance, created checklist + summary artifacts.
- **Step 5:** Validated output completeness and test discoverability.

---

## Validation Evidence

**Command:**

`npm run test:e2e -- --list tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts tests/e2e/platform/platform-session-store-and-refresh-rotation.spec.ts`

**Result:**

- 7 tests discovered across 2 files.
- All tests are RED-phase artifacts (`test.skip`) pending implementation.

---

## Output

- Checklist: `/Users/jeremiahotis/moneyshyft/_bmad-output/test-artifacts/atdd-checklist-0-3.md`
- API spec: `/Users/jeremiahotis/moneyshyft/tests/api/platform/platform-session-store-and-refresh-rotation.api.spec.ts`
- E2E spec: `/Users/jeremiahotis/moneyshyft/tests/e2e/platform/platform-session-store-and-refresh-rotation.spec.ts`
- Factory: `/Users/jeremiahotis/moneyshyft/tests/support/factories/sessionRotationFactory.ts`
- Fixture: `/Users/jeremiahotis/moneyshyft/tests/support/fixtures/sessionRotation.fixture.ts`

