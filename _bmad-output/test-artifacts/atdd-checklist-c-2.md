---
stepsCompleted:
  - 'step-01-preflight-and-context'
  - 'step-02-generation-mode'
  - 'step-03-test-strategy'
  - 'step-04c-aggregate'
  - 'step-05-validate-and-complete'
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-24T19:46:00Z'
---

# ATDD Checklist - Epic c, Story 2: Thread Ensure Endpoint with Conflict-Safe Idempotency

**Date:** 2026-02-24
**Author:** Jeremiah
**Primary Test Level:** API

## Story Summary

Story `c.2` hardens `POST /api/v1/connectshyft/threads` to provide conflict-safe idempotent ensure semantics under concurrent calls. All callers must converge on the same active thread instance without duplication.

## Acceptance Criteria

1. Concurrent ensure requests produce exactly one active thread.
2. Conflicting ensure callers receive the same active thread instance.

## Workflow Step Outputs

- Step 1 preflight completed with policy/workflow gates and story context loaded.
- Step 2 selected **AI generation** mode.
- Step 3 strategy selected API concurrency and refusal contract coverage plus E2E duplication checks.
- Step 4 outputs saved:
  - `_bmad-output/test-artifacts/atdd-temp/api-c-2-2026-02-24T19-46-00Z.json`
  - `_bmad-output/test-artifacts/atdd-temp/e2e-c-2-2026-02-24T19-46-00Z.json`
  - `_bmad-output/test-artifacts/atdd-temp/summary-c-2-2026-02-24T19-46-00Z.json`
- Step 5 validation completed: tests are RED-phase (`test.skip`), no placeholder assertions, temp artifacts stored under `test-artifacts`.

## Failing Tests Created (RED Phase)

- API: `tests/api/platform/c-2-thread-ensure-endpoint-with-conflict-safe-idempotency.atdd.api.spec.ts` (4 tests)
- E2E: `tests/e2e/platform/c-2-thread-ensure-endpoint-with-conflict-safe-idempotency.atdd.spec.ts` (3 tests)

## Data Factories and Fixtures

- Factory: `tests/support/factories/connectShyftStoryC2Factory.ts`
- Fixture: `tests/support/fixtures/connectShyftStoryC2.fixture.ts`

## Implementation Checklist

- [ ] Implement transactional conflict-safe ensure behavior under concurrent requests.
- [ ] Return deterministic reused/create outcomes with stable response shape.
- [ ] Enforce invalid-context and unauthorized refusal envelopes with no leak semantics.
- [ ] Remove `test.skip` and make API/E2E tests pass.

## Running Tests

```bash
npx playwright test tests/api/platform/c-2-thread-ensure-endpoint-with-conflict-safe-idempotency.atdd.api.spec.ts tests/e2e/platform/c-2-thread-ensure-endpoint-with-conflict-safe-idempotency.atdd.spec.ts --list
```
