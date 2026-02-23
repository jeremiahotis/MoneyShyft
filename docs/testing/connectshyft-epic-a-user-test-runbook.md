# ConnectShyft Epic A User Test Runbook (Phase A/B/C)

Date: 2026-02-22
Owner: QA + Product + Engineering
Status: Ready to execute

## 1. Objective

Execute a real user-test program for everything delivered in ConnectShyft Epic A that is currently testable, while preserving these rules:

1. Create users through UI flows only.
2. Do not seed user data.
3. Prefer UI-driven data setup for tenants and orgUnits where supported.
4. Use test harness paths only where real UI/runtime context is not fully implemented yet.

## 2. Scope Summary

## In scope now

1. Phase A: UI-driven tenant/orgUnit/user creation and role assignment where currently possible.
2. Phase A: Full 22-route frontend walkthrough.
3. Phase A: Platform RBAC and isolation checks.
4. Phase B: Epic A ConnectShyft stress/isolation matrix through current harness-enabled path.

## Deferred to later

1. True hierarchical subtenant behavior (parent-child tenants).
2. Full actual-user ConnectShyft role projection by orgUnit context switching until active orgUnit switching and role projection are complete.

## 3. Current Constraints (Important)

1. Hard boundary is tenant. No implicit parent-child tenant visibility.
2. OrgUnit hierarchy exists in schema, but tenant admin UI currently supports create orgUnit without parent selection.
3. ConnectShyft role/capability tests currently rely on harness overrides for many journey variants.
4. Inbox UI is still a capability shell, not full production thread-detail UX.

## 4. Test Data Policy

## Allowed

1. UI-created users via `/signup`.
2. UI-created tenants via `/admin/system` when a system-admin account is available.
3. UI-created orgUnits and role assignments via `/admin/tenant`.
4. Non-user seeded/harness data only when a required UI function does not exist yet.

## Not allowed

1. Seeding user records directly in DB.
2. Cross-tenant visibility assumptions.

## 5. Environment and Tools

1. Workspace: `/Users/jeremiahotis/projects/connectshyft`
2. Manual UI runtime:
   1. Backend at `http://localhost:3001` (or managed runtime port)
   2. Frontend at `http://localhost:5174` (or managed runtime port)
3. Harness runner:
   1. `npm run test:e2e`
4. Evidence outputs:
   1. `tests/artifacts/playwright-report`
   2. `tests/artifacts/test-results/results.json`
   3. Session log template: `docs/testing/connectshyft-epic-a-user-test-session-template.md`

## 6. Tenant Topology Matrix for Phase A

Use these target topologies for real user setup now.

## T1: Tenant with users only

1. Create tenant owner user through `/signup` (create household mode).
2. Create at least 2 additional users via invitation code join flow.
3. No orgUnits created.
4. Validate access boundaries and non-admin behavior.

## T2: Tenant with multiple orgUnits and users in each orgUnit

1. Create tenant owner user through `/signup`.
2. Create orgUnits in `/admin/tenant` (minimum 2).
3. Create at least 4 users via invitation code join flow.
4. Assign orgUnit memberships by role in `/admin/tenant`.
5. Validate per-orgUnit membership gating and tenant-privileged bypass behavior.

## T3: Tenant isolation probe counterpart

1. Create separate tenant owner through `/signup`.
2. Create at least 2 users in this tenant.
3. Optionally create one orgUnit.
4. Use this tenant to validate no cross-tenant visibility/mutation.

## Deferred topology notes

1. "Tenant with subtenants" and mixed subtenant models remain deferred by design for current scope.

## 7. Phase A Execution Plan

## A0. Preflight

1. Confirm app login, signup, and dashboard work.
2. Confirm `/admin/tenant` is reachable for tenant-admin accounts.
3. If a system-admin account exists, confirm `/admin/system` access.

## A1. Create Users and Tenants

1. Create tenant owner accounts through `/signup` in create-household mode for T1, T2, T3.
2. In each owner account, open `/settings` and record invitation code.
3. Create member accounts through `/signup` in join-household mode using invitation codes.
4. Capture created user IDs from authenticated session (`/auth/me` payload in network inspector).

## A2. Configure OrgUnits and Roles (T2)

1. Login as T2 owner.
2. Open `/admin/tenant`.
3. Create at least two orgUnits.
4. Assign tenant roles and orgUnit roles for T2 users:
   1. `TENANT_ADMIN`
   2. `TENANT_STAFF`
   3. `TENANT_VIEWER`
   4. `ORGUNIT_ADMIN`
   5. `ORGUNIT_MEMBER`
   6. `ORGUNIT_IDENTITY_LEAD`
5. Refresh RBAC snapshot after each assignment and capture evidence.

## A3. Full 22-View Walkthrough

Execute this list for at least one user in each relevant role context.

| ID | Route | Expected baseline result |
|---|---|---|
| V01 | `/login` | Renders login form; successful auth redirects to `/` |
| V02 | `/signup` | Renders create/join forms; successful signup creates session |
| V03 | `/` | Dashboard visible for authenticated users |
| V04 | `/app/connectshyft/inbox` | Capability-driven inbox view loads |
| V05 | `/app/connectshyft/settings/availability` | Availability page loads |
| V06 | `/app/connectshyft/settings/numbers` | Number mapping page loads |
| V07 | `/app/connectshyft/settings/escalation` | Escalation settings page loads |
| V08 | `/accounts` | Accounts list loads |
| V09 | `/transactions` | Transactions list loads |
| V10 | `/recurring-transactions` | Recurring transactions page loads |
| V11 | `/budget` | Budget page loads or setup redirect based on setup state |
| V12 | `/budget/setup` | Budget setup wizard loads |
| V13 | `/goals` | Goals page loads |
| V14 | `/debts` | Debts page loads |
| V15 | `/extra-money` | Extra money page loads |
| V16 | `/settings` | Household settings page loads |
| V17 | `/admin` | Redirects to best admin workspace or dashboard |
| V18 | `/admin/system` | System-admin only access path or controlled redirect |
| V19 | `/admin/tenant` | Tenant-admin capable users access; others denied |
| V20 | `/scenarios` | Scenarios list loads |
| V21 | `/scenarios/:id` | Scenario detail loads for existing scenario |
| V22 | `/scenarios/:id/projection` | Scenario projection loads for existing scenario |

## A4. Platform RBAC and Isolation Checks

Run these checks and log each as Pass/Fail.

1. Tenant-admin can create orgUnits only in own active tenant scope.
2. Non-tenant-admin receives controlled refusal or no access for tenant admin functions.
3. Cross-tenant mutation attempts are blocked.
4. OrgUnit membership-dependent actions are refused for non-members where required.
5. Tenant-privileged roles show expected bypass behavior for orgUnit membership-gated paths.
6. No tenant A identifiers/data are visible while operating in tenant B accounts.

## A5. Phase A Exit Criteria

1. 22/22 routes executed with outcome logged.
2. All T1/T2/T3 data setup steps completed without user seeding.
3. All RBAC/isolation checks executed and evidence linked.
4. Any failures triaged with severity and owner.

## 8. Phase B Execution Plan (Epic A Harness Stress/Isolation)

Use existing Playwright API+E2E suites for A1-A5. This path is mandatory until actual orgUnit context switching and role projection are complete.

## B1. Smoke (single pass)

Run:

```bash
npm run test:e2e -- tests/api/platform/a-1-connectshyft-feature-flag-and-availability-guardrails.api.spec.ts
npm run test:e2e -- tests/api/platform/a-2-tenant-and-orgunit-context-enforcement-for-connectshyft-routes.api.spec.ts
npm run test:e2e -- tests/api/platform/a-3-orgunit-number-mapping-management.api.spec.ts
npm run test:e2e -- tests/api/platform/a-4-escalation-baseline-and-recipient-configuration.api.spec.ts
npm run test:e2e -- tests/api/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.api.spec.ts
npm run test:e2e -- tests/e2e/platform/a-3-orgunit-number-mapping-management.spec.ts
npm run test:e2e -- tests/e2e/platform/a-4-escalation-baseline-and-recipient-configuration.spec.ts
npm run test:e2e -- tests/e2e/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.spec.ts
```

## B2. Stress Loop (repeat key suites)

Run (example, 5 repeats each):

```bash
npm run test:e2e -- --workers=1 --repeat-each=5 tests/api/platform/a-2-tenant-and-orgunit-context-enforcement-for-connectshyft-routes.api.spec.ts
npm run test:e2e -- --workers=1 --repeat-each=5 tests/api/platform/a-3-orgunit-number-mapping-management.api.spec.ts
npm run test:e2e -- --workers=1 --repeat-each=5 tests/api/platform/a-4-escalation-baseline-and-recipient-configuration.api.spec.ts
npm run test:e2e -- --workers=1 --repeat-each=5 tests/api/platform/a-5-capability-based-route-access-and-envelope-contract-compliance.api.spec.ts
```

## B3. Failure Classification

1. `P0`: Security/scope leak, cross-tenant exposure, incorrect authorization.
2. `P1`: Contract/refusal inconsistency, deterministic behavior drift.
3. `P2`: UX/refinement issues without security/scope impact.

## B4. Phase B Exit Criteria

1. Epic A API coverage green in smoke run.
2. Stress loop complete with no unresolved `P0`.
3. All failures linked to reproducible test output and owning story.

## 9. Phase C Plan (Later, Actual-User Rerun)

Execute only when all entry criteria are met.

## C0. Entry Criteria

1. Active orgUnit context switch flow is implemented end-to-end for real sessions.
2. ConnectShyft capability checks resolve effective roles from real tenant/orgUnit memberships for actual user sessions.
3. ConnectShyft inbox/detail UI reflects real backend contract states and refusal surfaces.

## C1. Rerun Scope

1. Repeat full Phase A route walkthrough and RBAC/isolation checks.
2. Replace harness role/context variants with real user role/account switching.
3. Repeat Phase B high-risk matrices in real-user mode for parity.

## 10. Defect Triage Workflow

1. Log every failure with:
   1. Repro steps
   2. Expected result
   3. Actual result
   4. Role/account used
   5. Tenant/orgUnit context
   6. Attachments (screenshot, network response, test report path)
2. Assign severity (`P0/P1/P2`) and owner.
3. Mark disposition:
   1. `bug`
   2. `known-gap`
   3. `deferred-by-design`

## 11. Deliverables

1. Completed session log file (from template).
2. Linked Playwright report for Phase B.
3. Consolidated defect list with severity and owners.
4. Sign-off note for:
   1. "Phase A complete"
   2. "Phase B complete"
   3. "Phase C blocked or scheduled"
