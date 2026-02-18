---
stepsCompleted:
  - 'step-01-preflight-and-context'
  - 'step-02-generation-mode'
  - 'step-03-test-strategy'
  - 'step-04-generate-tests'
  - 'step-04c-aggregate'
  - 'step-05-validate-and-complete'
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-18T02:08:01Z'
---

# ATDD Checklist - Epic 0, Story 9: CI Policy Gate as Blocking First Stage

**Date:** 2026-02-18  
**Author:** Jeremiah  
**Primary Test Level:** API

---

## Story Summary

This story makes CI policy enforcement the first blocking stage so downstream quality jobs stop immediately on policy violations. It also raises the quality bar for failure diagnostics so developers get direct, actionable guidance instead of ambiguous failures.

**As a** maintainer  
**I want** policy checks to run before downstream quality jobs  
**So that** non-compliant workflow/branch operations are blocked immediately

---

## Acceptance Criteria

1. lint/test/burn-in/gates do not proceed
2. failure output includes actionable policy violation context

---

## Failing Tests Created (RED Phase)

### E2E Tests (3 tests)

**File:** `tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts` (63 lines)

- ✅ **Test:** `[P0] blocks downstream quality graph when policy gate fails @P0`
  - **Status:** RED (skipped intentionally) - workflow dependencies do not yet enforce direct policy-stage blocking for all targeted downstream jobs
  - **Verifies:** lint/test/burn-in/quality-gates do not proceed when policy stage fails
- ✅ **Test:** `[P1] CI summary includes actionable policy violation context when policy stage fails @P1`
  - **Status:** RED (skipped intentionally) - report stage does not yet emit policy-specific remediation guidance
  - **Verifies:** CI summary includes policy result plus actionable context and remediation hints
- ✅ **Test:** `[P1] local policy gate failure experience mirrors CI-level actionable diagnostics @P1`
  - **Status:** RED (skipped intentionally) - local policy output does not yet include branch-explicit recovery guidance
  - **Verifies:** local developer failure experience is as actionable as CI diagnostics

### API Tests (3 tests)

**File:** `tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts` (88 lines)

- ✅ **Test:** `[P0] requires policy as explicit blocking dependency for all downstream quality jobs @P0`
  - **Status:** RED (skipped intentionally) - workflow graph not yet aligned to strict direct policy dependency for all targeted jobs
  - **Verifies:** policy is the first blocking dependency for lint/test/burn-in/quality-gates
- ✅ **Test:** `[P0] policy check failure output includes branch, policy path, and remediation command @P0`
  - **Status:** RED (skipped intentionally) - `scripts/enforce-git-policy.sh` output does not yet include full actionable context
  - **Verifies:** policy violation message includes branch context, policy file reference, and direct remediation command
- ✅ **Test:** `[P1] branch workflow guard failure output includes exact expected pattern and next-step command @P1`
  - **Status:** RED (skipped intentionally) - branch guard output does not yet include explicit next-step command for recovery
  - **Verifies:** branch guard diagnostics provide precise expected pattern and immediate remediation command

### Component Tests (0 tests)

No component-level tests were generated because this story is CI/policy governance focused.

---

## Data Factories Created

### CI Policy Context Factory

**File:** `tests/support/factories/ciPolicyContextFactory.ts`

**Exports:**

- `createCiPolicyContext(overrides?)` - creates story-specific CI policy context (workflow paths, protected branches, remediation hint)

---

## Fixtures Created

### CI Policy Context Fixture

**File:** `tests/support/fixtures/ciPolicyContext.fixture.ts`

**Fixtures:**

- `ciPolicyContext` - provides reusable context for CI/policy gate tests
  - **Setup:** creates default context from factory
  - **Provides:** workflow/policy/branch-guard file references and defaults
  - **Cleanup:** none required (pure in-memory fixture)

---

## Mock Requirements

### Policy Check Output Contract Mock

**Command:** `bash scripts/enforce-git-policy.sh`

**Expected Failure Envelope:**

```json
{
  "status": "failed",
  "reason": "branch-first policy violation",
  "currentBranch": "main|master|codex/dev|production",
  "policyFile": "docs/policies/git_policy.md",
  "nextStep": "npm run start:story-branch -- <story-id> <slug>"
}
```

### Branch Guard Output Contract Mock

**Command:** `bash scripts/branch-ensure-workflow.sh --workflow ... --story ...`

**Expected Failure Envelope:**

```json
{
  "status": "failed",
  "workflowKey": "atdd",
  "expectedBranchPattern": "codex/story-0-9-<slug>",
  "currentBranch": "<actual>",
  "nextStep": "npm run start:story-branch -- 0-9 ci-policy-gate-as-blocking-first-stage"
}
```

---

## Required data-testid Attributes

No UI attributes required for this story.

---

## Implementation Checklist

### Test: `[P0] requires policy as explicit blocking dependency for all downstream quality jobs`

**File:** `tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Update `.github/workflows/test.yml` so policy is the first blocking dependency for targeted downstream jobs
- [ ] Ensure lint/test/burn-in/quality-gates are blocked when policy fails
- [ ] Run test: `npx playwright test tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

### Test: `[P0] policy check failure output includes branch, policy path, and remediation command`

**File:** `tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts`

**Tasks to make this test pass:**

- [ ] Enhance `scripts/enforce-git-policy.sh` failure output with explicit branch context
- [ ] Include policy path (`docs/policies/git_policy.md`) in branch-first failures
- [ ] Include direct remediation command in failure output
- [ ] Run test: `npx playwright test tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

### Test: `[P1] CI summary includes actionable policy violation context when policy stage fails`

**File:** `tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts`

**Tasks to make this test pass:**

- [ ] Update workflow report stage to publish policy violation context and remediation hints
- [ ] Ensure summary includes policy result plus concrete next steps
- [ ] Run test: `npx playwright test tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

---

## Running Tests

```bash
# Run all failing tests for this story
npx playwright test tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts

# Run specific API test file
npx playwright test tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts

# Run specific E2E test file
npx playwright test tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts

# Debug mode
npx playwright test --debug tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

- ✅ Story 0.9 tests authored before implementation changes
- ✅ Tests intentionally marked with `test.skip()` for TDD red phase staging
- ✅ CI dependency and diagnostic-quality expectations captured as failing contracts
- ✅ Factory + fixture scaffolding created for stable governance test inputs

### GREEN Phase (DEV Team - Next Steps)

1. Implement workflow dependency updates in `.github/workflows/test.yml`.
2. Upgrade policy and branch-guard failure output for actionable diagnostics.
3. Remove `test.skip()` from Story 0.9 tests.
4. Run the two story test files until all pass.

### REFACTOR Phase (DEV Team - After All Tests Pass)

1. Consolidate policy diagnostic formatting in shared shell helpers if duplicated.
2. Keep branch/policy context output consistent across scripts and CI summary.
3. Re-run full regression and policy guard commands for parity.

---

## Next Steps

1. Share this checklist and generated RED tests with the dev workflow.
2. Implement policy-first CI dependency and diagnostic output changes.
3. Unskip Story 0.9 tests and drive to green one test at a time.

---

## Knowledge Base References Applied

- `data-factories.md`
- `component-tdd.md`
- `test-quality.md`
- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`
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
- `playwright-cli.md`

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:**
`npx playwright test tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts`

**Results:** Not executed in this run. RED phase is intentionally represented via `test.skip()` scaffolding.

**Expected Failure Messages (after removing `test.skip()` pre-implementation):**

- Workflow dependency checks fail where policy is not declared as strict blocking dependency.
- Policy-check diagnostics fail due to missing branch/path/remediation context.
- Branch-guard diagnostics fail due to missing explicit next-step command.

---

## Validation Notes

- Required policy gates passed on branch `codex/story-0-9-ci-policy-gate-as-blocking-first-stage`.
- Branch guard passed for ATDD workflow + story file.
- Subprocess artifacts generated:
  - `/tmp/tea-atdd-api-tests-2026-02-18T02-08-01-3NZ.json`
  - `/tmp/tea-atdd-e2e-tests-2026-02-18T02-08-01-3NZ.json`
  - `/tmp/tea-atdd-summary-2026-02-18T02-08-01-3NZ.json`
- Persisted artifacts copied to `_bmad-output/test-artifacts/`.

---

**Generated by BMad TEA Agent** - 2026-02-18
