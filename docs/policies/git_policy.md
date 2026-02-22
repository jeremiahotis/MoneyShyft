# Canonical Git Policy (RouteShyft)

This policy is mandatory and repository-wide.

Source material was imported from `~/Downloads/git_policy.md` and adapted for this repository.

## 1) Git + Branch Policy

- Branch-first is mandatory.
- Stage only relevant files.
- Never commit failing checks.
- Commit format is mandatory: `<story-id>: <imperative summary>`.
- `<story-id>` format: `<epic>-<story>` where `<epic>` is numeric or a letter (examples: `0-10`, `a-1`).
- Commit in small slices by AC/subtask scope.
- One PR per story branch.
- Story PRs must use merge commit.
- Do not squash-merge story PRs.
- Story PR base branch is mandatory: `codex/dev`.

## 2) Story-Scoped Workflow Policy (`AT` / `TA` / `DS` / `CR` and equivalents)

- Trigger set includes: `atdd`, `automate`, `create-story`, `dev-story`, `code-review`.
- Aliases and direct workflow-path invocations are treated as equivalent triggers.
- Required guard command before execution:
  - `npm run branch:ensure-workflow -- --workflow <name-or-path> --story <story-key-or-story-file>`
- Required story branch naming:
  - `codex/story-<story-id>-<project-lane>-<short-slug>`
  - `<story-id>` accepts numeric or letter epic IDs (`1-2`, `a-1`), and dotted form (`a.1`) should normalize to `a-1`.
  - `<project-lane>` token must appear in slug and match resolved lane context.
- Story branches must be created from `codex/dev` and merged back into `codex/dev`.
- Do not run story-scoped workflows on `master` or mismatched story branches.
- Keep all code, tests, and story artifacts for that story on the same story branch.

### Production Promotion Flow (Mandatory)

1. Story work merges into `codex/dev`.
2. Promote only from `codex/dev`:
   - `npm run promote:production -- "X-YYY: release <summary>"`
3. Push production branch:
   - `git push origin production`

## 3) Epic-Ops Workflow Policy

- Trigger set: `sprint-planning`, `retrospective`, `correct-course`.
- Required guard command before execution:
  - `npm run branch:ensure-workflow -- --workflow <name-or-path> --epic <epic-id>`
- Required epic branch naming:
  - `codex/epic-<epic-id>-ops` (`<epic-id>` numeric or single letter)
- Keep epic-level artifacts on that matching epic-ops branch.

## 4) ATDD / TA / Code Review Gates

- ATDD (`atdd` / `AT`) is story-scoped and must run on the matching story branch.
- TA (`automate` / `TA`, test automation) is story-scoped and must run on the matching story branch.
- Code review (`code-review` / `CR`) is story-scoped and must run on the matching story branch.
- Run targeted story tests before each commit slice.
- Run full regression before PR is marked ready.
- PR description must include Story ID, AC traceability, and exact test commands/results.

### Playwright Regression Execution Policy (Mandatory)

- Playwright regression runs must target loopback IPv4 only:
  - `API_URL` host must be `127.0.0.1`
  - `BASE_URL` host must be `127.0.0.1`
- Backend and frontend must be live and reachable before Playwright starts.
- Enforcement is mandatory through:
  - `scripts/run-playwright-with-preflight.sh`
  - Root npm scripts: `test:e2e`, `test:e2e:headed`, `test:e2e:debug`
- If preflight cannot reach backend/frontend health endpoints, Playwright execution must fail immediately.

### Corrected Kernel Gate (Mandatory for Feature Story Progression)

- Numeric feature stories outside Epic 0 are blocked until corrected kernel acceptance criteria are complete.
- Alpha-epic lanes (for example `a-1` in ConnectShyft) are exempt from this Epic-0 kernel gate.
- Required sprint-status conditions before starting or validating non-Epic-0 story workflows:
  - `0-10-kernel-readiness-verification-suite: done`
  - `course_correction.cc-2026-02-18.status: approved`
- Enforced by:
  - `scripts/start-story-branch.sh`
  - `scripts/branch-ensure-workflow.sh`

### Shared Envelope Guardrail (Mandatory for New/Modified Module Endpoints)

- Legacy module routes may be migrated incrementally.
- New or modified module endpoints must not introduce ad hoc response serialization (`res.json(...)` or `res.status(...).json(...)`).
- Required serializer path for module endpoint changes: shared helpers (`success`, `refusal`, `systemError`).
- Enforced by:
  - `scripts/enforce-envelope-helper-guard.sh`
  - `scripts/enforce-git-policy.sh` (via `npm run policy:check`)

### Story Status Sync Guardrail (Mandatory)

- Story file `Status:` and `_bmad-output/implementation-artifacts/sprint-status.yaml` `development_status` must stay synchronized.
- A status mismatch is a blocking policy violation.
- Enforced by:
  - `scripts/enforce-story-status-sync.sh`
  - `scripts/enforce-git-policy.sh` (via `npm run policy:check`)

### Critical Capability Real-User Validation Guardrail (Mandatory)

- Stories classified as `Critical Capability: yes` cannot close as `done` without real-user validation evidence.
- Automation-only validation is insufficient for closeout on critical capabilities.
- Required closeout evidence:
  - `Real-User Validation Evidence` must be concrete and non-empty.
  - `Real-User Validation Result` must be `pass`.
- Enforced by:
  - `scripts/enforce-operability-closeout-guard.sh`
  - `scripts/enforce-git-policy.sh` (via `npm run policy:check`)

### Access-Control UI Closeout Guardrail (Mandatory)

- No access-control story can close as `done` without a verified role-admin UI path.
- Stories classified as `Access-Control Story: yes` must include:
  - `Role-Admin UI Path` (specific path)
  - `Role-Admin UI Path Verified: yes`
- Stories that appear access-control related but are not classified as such must include explicit exemption rationale.
- Enforced by:
  - `scripts/enforce-operability-closeout-guard.sh`
  - `scripts/enforce-git-policy.sh` (via `npm run policy:check`)

### Planning Operability Coupling Guardrail (Mandatory)

- If a backend/API contract implies human operability, planning artifacts must include frontend/operator usability criteria.
- Story closeout must confirm this coupling via guardrail fields:
  - `Backend/API Implies Human Operability`
  - `Frontend/Operator Usability Criteria Included`
- Enforced by:
  - planning and implementation workflow checklists
  - `scripts/enforce-operability-closeout-guard.sh` for done-story closeout

## 5) Story Creation Inside Epics (`create-story`)

- `create-story` uses sprint tracking as primary source (`sprint-status.yaml`) to choose/create the next story.
- It parses story key as `epic-story-title` (example: `4-018-model-router-...` or `a-1-connectshyft-...`) and sets `story_id` as `epic.story`.
- If it is first story in an epic, epic status is moved to `in-progress` when appropriate.
- It halts if epic is `done` (cannot create new story in a completed epic).
- It writes story output to implementation artifacts (`_bmad-output/implementation-artifacts/<story_key>.md`).
- It sets new story status to `ready-for-dev`.
- It updates sprint status entry for that story to `ready-for-dev`.

## 6) Project Lane Policy (Mandatory)

- `project_lane` is required for planning and status artifacts.
- Story branch lane context is resolved from `--lane`/`PROJECT_LANE`, then branch token, then `SPRINT_STATUS_FILE`, then default lane.
- Canonical lane configuration source:
  - `docs/policies/project_lanes.json`
- Current lane mapping:
  - `connectshyft` lane:
    - planning artifacts include `ConnectShyft` in filename
    - sprint status file: `_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml`
  - `routeshyft` lane:
    - planning artifacts omit `ConnectShyft` token
    - sprint status file: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Shared implementation story files under `_bmad-output/implementation-artifacts/[epic-story].md` are cross-lane foundation artifacts and are allowed in both product repos.
- Future modules must register a new lane in `docs/policies/project_lanes.json` before planning artifacts are created.
- Lane enforcement is mandatory through:
  - `scripts/project-lane-context.js`
  - `scripts/enforce-project-lane.js`
  - `scripts/enforce-git-policy.sh` (via `npm run policy:check`)

## 7) BMAD Safety / Artifact Boundaries

- Discover workflows via manifests; no hard-coded workflow lists.
- Execute via deterministic harness.
- Write artifacts only to allowed outputs:
  - `_bmad-output/planning-artifacts`
  - `_bmad-output/implementation-artifacts`
  - `docs/` (project context)
- Never modify external BMAD installations outside this repository.

## CI Enforcement

The CI policy gate runs `npm run policy:check` and fails the pipeline on violations.

- Script: `scripts/enforce-git-policy.sh`
- Workflow guard helper: `scripts/branch-ensure-workflow.sh`
