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

### Review Follow-ups (AI)

- [x] [AI-Review][High] Remove story-specific hardcoding in local recovery guidance and derive story id/slug dynamically or emit generic remediation so policy diagnostics remain valid beyond Story 0.9 (`scripts/enforce-git-policy.sh:7`)
- [x] [AI-Review][High] Prevent local policy-check bypass by resolving branch from git for local runs (do not trust `GITHUB_HEAD_REF`/`GITHUB_REF_NAME` in local mode) (`scripts/enforce-git-policy.sh:28`)
- [x] [AI-Review][High] Enforce story-id/branch consistency by validating the commit subject story id matches `codex/story-<story-id>-*` when on story branches (`scripts/enforce-git-policy.sh:66`)
- [x] [AI-Review][Medium] Make pull-request default-branch failure output actionable by including policy path and remediation commands similar to local diagnostics (`scripts/enforce-git-policy.sh:43`)
- [x] [AI-Review][Medium] Harden AC1 workflow tests by parsing YAML/job graph instead of fragile text-order and exact-format regex matching (`tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts:11`)

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
  - Final result: 12 passed, 0 failed.
- Ran full regression suite:
  - `npm run test:e2e`
  - Result: 10 passed, 48 failed, 30 skipped (failures are outside Story 0.9 scope and block status promotion to `review` in this run).
- Ran focused policy checks for review fixes:
  - `GITHUB_EVENT_NAME=local GITHUB_HEAD_REF=main bash scripts/enforce-git-policy.sh` (fails with actionable default-branch remediation)
  - `GITHUB_EVENT_NAME=pull_request GITHUB_HEAD_REF=main GITHUB_BASE_REF=production bash scripts/enforce-git-policy.sh` (fails with actionable pull-request remediation)

### Completion Notes List

- AC1 implemented and covered:
  - CI dependency-chain assertions are active and validate policy-first gating for `lint`, `test`, `burn-in`, and `quality-gates`.
  - AC1 graph assertions now parse job blocks/needs structurally to reduce false failures from harmless formatting changes.
- AC2 implemented and covered:
  - `scripts/enforce-git-policy.sh` now emits actionable local and pull-request failure context including:
    - policy file path
    - current branch
    - base branch (when relevant)
    - remediation commands (dynamic when story branch context exists, generic placeholders otherwise)
- Story-specific coverage is now executable (not skipped) and passing.
- Review findings resolved:
  - local branch spoof prevention now reads git branch in local mode
  - branch/story commit-subject consistency enforced for story branches
  - pull-request default-branch violations emit actionable remediation hints
- Full-repo regression is currently red for unrelated suites; story status remains `in-progress` until broader suite health is addressed.

### File List

- _bmad-output/implementation-artifacts/0-9-ci-policy-gate-as-blocking-first-stage.md
- scripts/enforce-git-policy.sh
- tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts
- tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts
- tests/support/factories/ciPolicyContextFactory.ts
- tests/support/utils/policyScriptTestHarness.ts

## Change Log

- 2026-02-18: Implemented Story 0.9 AC1/AC2 updates, activated automated coverage, and verified targeted story tests pass. Full regression remains red due to unrelated existing failures.
- 2026-02-18: Senior Developer Review (AI) completed; changes requested and follow-up action items added.
- 2026-02-18: Resolved all five Senior Developer Review findings; hardened policy enforcement logic, added deterministic policy harness coverage, and reconciled story file metadata with git-tracked changes.

## Senior Developer Review (AI)

**Reviewer:** Jeremiah (AI)
**Date:** 2026-02-18
**Outcome:** Resolved (post-review fixes applied)

### Summary

- AC1 validated in current branch state: CI dependency chain blocks downstream jobs when `policy` fails via `needs` graph.
- AC2 is now fully satisfied with actionable diagnostics across local and pull-request policy violations.
- Story remains `in-progress`; sprint tracking for `0-9-ci-policy-gate-as-blocking-first-stage` remains `in-progress`.

### Findings

#### High

1. Local recovery output is hardcoded to Story 0.9, causing incorrect remediation guidance for any other story.
   - Evidence: `scripts/enforce-git-policy.sh:7`
2. Local policy evaluation trusts CI env branch variables, enabling branch spoofing and incorrect pass/fail outcomes.
   - Evidence: `scripts/enforce-git-policy.sh:28`
3. Commit subject validation does not ensure story id matches current story branch id, allowing cross-story commits to pass policy.
   - Evidence: `scripts/enforce-git-policy.sh:66`

#### Medium

1. Pull-request default-branch rejection output is not actionable (no policy path or remediation command).
   - Evidence: `scripts/enforce-git-policy.sh:43`
2. AC1 coverage relies on brittle raw-text order/regex checks that can break on harmless YAML formatting changes.
   - Evidence: `tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts:11`

### Validation Notes

- Reviewed story file, policy script, branch guard script, CI workflow, and story-specific tests.
- Executed targeted verification:
  - `npm run test:e2e -- tests/e2e/platform/ci-policy-gate-as-blocking-first-stage.spec.ts tests/api/platform/ci-policy-gate-as-blocking-first-stage.api.spec.ts`
  - Result: 12 passed, 0 failed.
- Executed policy checks:
  - `npm run policy:check` (intentionally fails on this branch when latest commit subject does not match story id, enforcing the new branch/story consistency rule)
  - `GITHUB_EVENT_NAME=pull_request GITHUB_HEAD_REF=main GITHUB_BASE_REF=production bash scripts/enforce-git-policy.sh` (fails with actionable remediation context)

### Resolution Notes

- All five findings are now implemented and validated in code/tests.
- Git/story discrepancy resolved: story File List and follow-up status now match actual modified files and completed fixes in this branch.
