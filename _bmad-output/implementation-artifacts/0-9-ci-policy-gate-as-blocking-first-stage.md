# Story 0.9: CI Policy Gate as Blocking First Stage

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a maintainer,
I want policy checks to run before downstream quality jobs,
so that non-compliant workflow/branch operations are blocked immediately..

## Acceptance Criteria

1. lint/test/burn-in/gates do not proceed
2. failure output includes actionable policy violation context

## Tasks / Subtasks

- [ ] Implement acceptance criterion 1 (AC: 1)
  - [ ] Add automated coverage for AC 1
- [ ] Implement acceptance criterion 2 (AC: 2)
  - [ ] Add automated coverage for AC 2

## Dev Notes

- Phase-0 scope only. Do not introduce Route/Operations/Resource/POS module behavior in this story.
- Preserve monolith kernel constraints: tenancy, first-party auth, CSRF, refusal envelope, event/outbox, and timezone guarantees.
- Keep changes incremental and isolated for small PR sequencing in Epic 0.

### Project Structure Notes

- Platform kernel code paths should live under `src/platform`, shared API routing in `src/api`, and module code under `src/modules`.
- Maintain alias usage and shared entrypoint registration patterns from architecture and roadmap constraints.

### References

- /Users/jeremiahotis/moneyshyft/_bmad-output/planning-artifacts/epic-0-phase-0-kernel-story-set.md
- /Users/jeremiahotis/moneyshyft/_bmad-output/planning-artifacts/prd.md
- /Users/jeremiahotis/moneyshyft/_bmad-output/planning-artifacts/architecture.md
- /Users/jeremiahotis/moneyshyft/docs/policies/git_policy.md
- /Users/jeremiahotis/moneyshyft/ROADMAP.md

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Activated Story 0.9 tests (removed `test.skip`) in API and E2E coverage files.
- Ran targeted story suite:
  - `npm run test:e2e -- tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts`
  - Final result: 10 passed, 0 failed.
- Ran full regression suite:
  - `npm run test:e2e`
  - Result: 10 passed, 48 failed, 30 skipped (failures are outside Story 0.9 scope and block status promotion to `review` in this run).

### Completion Notes List

- AC1 implemented and covered:
  - CI dependency-chain assertions are active and validate policy-first gating for `lint`, `test`, `burn-in`, and `quality-gates`.
  - Regex coverage was hardened to allow YAML indentation while preserving dependency assertions.
- AC2 implemented and covered:
  - `scripts/enforce-git-policy.sh` now emits actionable local failure context including:
    - policy file path
    - current branch
    - suggested story branch
    - remediation commands
- Story-specific coverage is now executable (not skipped) and passing.
- Full-repo regression is currently red for unrelated suites; story status remains `in-progress` until broader suite health is addressed.

### File List

- scripts/enforce-git-policy.sh
- tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts
- tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts

## Change Log

- 2026-02-18: Implemented Story 0.9 AC1/AC2 updates, activated automated coverage, and verified targeted story tests pass. Full regression remains red due to unrelated existing failures.
