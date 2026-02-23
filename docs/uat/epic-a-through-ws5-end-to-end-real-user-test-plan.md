# Epic A Through WS5 End-to-End Real-User Test Plan

## 1. Purpose
This plan defines a complete, real-user UAT program to validate all implemented capabilities from Epic A foundation work through WS5 admin UX updates, with emphasis on:
- trustworthy status/process controls,
- runtime tenant module entitlements,
- role/scope enforcement,
- UUID-free admin operations,
- real operability for system and tenant administrators.

## 2. Scope Under Test

### Included
- Platform/admin capabilities currently implemented in this repository:
  - Story/branch policy guardrails and status-sync enforcement.
  - Tenant module entitlement runtime enforcement for MoneyShyft routes.
  - Platform admin APIs for tenant/orgUnit/membership governance.
  - Scoped user lookup and inline admin-user creation APIs.
  - System Admin and Tenant Admin UI usability improvements (lookup + inline creation).
- MoneyShyft tenant-facing module routes gated by entitlement middleware.

### Excluded
- Backlog stories not yet implemented in current sprint status files.
- Future ConnectShyft stories that remain `backlog` / `ready-for-dev` in current status tracking.

## 3. Entry Criteria
A UAT cycle can start only when all are true:
1. Candidate branch deployed to UAT environment.
2. `npm run policy:check` passes in candidate commit.
3. Backend build passes (`src`: `npm run build`).
4. Frontend build passes (`frontend`: `npm run build`).
5. UAT dataset seeded (see Section 6).
6. Test users provisioned and credentials distributed to facilitator only.

## 4. Roles and Real Users
Assign real humans (not developers executing their own acceptance alone):
- **U1 System Admin**
- **U2 Tenant Admin (Tenant Alpha)**
- **U3 OrgUnit Admin (Tenant Alpha / OrgUnit A1)**
- **U4 Tenant Staff (Tenant Alpha)**
- **U5 Tenant Viewer (Tenant Alpha)**
- **U6 Tenant Admin (Tenant Beta)**
- **Observer/Recorder** (captures evidence, times, and confusion points)

## 5. Test Design Principles
- Every scenario must be executed by the intended role.
- Every scenario records:
  - pass/fail,
  - time-to-complete,
  - user confidence (1-5),
  - friction notes.
- No UUID copy/paste required for normal admin workflows.
- Any P0 defect blocks release and triggers retest.

## 6. UAT Data Setup
Seed UAT with:

### Tenants
- Tenant Alpha (module `moneyshyft` enabled)
- Tenant Beta (module `moneyshyft` disabled initially)
- Tenant Gamma (empty baseline for tenant bootstrap tests)

### Users
- One system admin user.
- For each tenant: one tenant admin, one tenant staff, one viewer.
- For Tenant Alpha: at least two additional regular users for lookup/assignment tests.

### Org Structure
- Tenant Alpha: OrgUnit A1 and A2.
- Tenant Beta: no orgUnits initially.

### Sample Data
- Accounts, transactions, categories, goals, budgets in Tenant Alpha.
- Minimal/no data in Tenant Gamma for clean bootstrap validation.

## 7. Execution Waves

## Wave 1 — Platform Access and Guardrail Readiness
**Owner:** QA lead + Observer

1. Verify app login works for all UAT roles.
2. Verify unauthorized roles cannot open admin surfaces.
3. Verify system and tenant admin pages load and show expected controls.

**Acceptance:** all role entry points route correctly and deny correctly.

## Wave 2 — WS2 Runtime Entitlement Authority
**Primary users:** U2, U4, U5, U6

### Scenario WS2-01: Enabled tenant can access MoneyShyft routes
- Login as Tenant Alpha user.
- Open key module routes (accounts, transactions, budgets, goals).
- Confirm routes function.

### Scenario WS2-02: Disabled tenant is blocked at runtime
- Login as Tenant Beta user.
- Open same routes.
- Confirm deterministic refusal (`MODULE_DISABLED`) behavior.

### Scenario WS2-03: Entitlement flip takes effect
- System or tenant admin toggles entitlement for Tenant Beta to enabled.
- Re-test access immediately.
- Toggle back to disabled and confirm access revoked.

**Acceptance:** entitlement state is the runtime authority for access.

## Wave 3 — WS3 Admin API Foundation (Scoped Lookup + Inline Admin Creation)
**Primary users:** U1, U2

### Scenario WS3-01: Scoped user lookup
- Run search by first/last/email from admin UI.
- Confirm results are in-scope only.
- Verify no out-of-scope users appear.

### Scenario WS3-02: Inline admin user creation (tenant-scoped)
- Create new tenant admin user from Tenant Admin interface.
- Verify user appears in lookup and can be assigned roles.
- Validate login for created user.

### Scenario WS3-03: Duplicate identity refusal
- Attempt creating user with existing email.
- Verify deterministic refusal response and friendly UI message.

### Scenario WS3-04: Scope boundary enforcement
- Try cross-tenant operations from tenant admin.
- Confirm refusal and no data mutation.

**Acceptance:** lookup and create flows are operable and scope-safe.

## Wave 4 — WS4 System Admin UX (No UUID Dependency)
**Primary user:** U1

### Scenario WS4-01: Tenant bootstrap with lookup-based initial admin
- Create Tenant Gamma from System Admin page.
- Use lookup (name/email) for optional initial admin selection.
- Confirm success without UUID requirement.

### Scenario WS4-02: Error clarity
- Run invalid/empty lookup and incomplete form submissions.
- Verify errors are actionable and non-technical.

**Acceptance:** system admin can complete tenant bootstrap in under 5 minutes without UUID hunting.

## Wave 5 — WS5 Tenant Admin UX (No UUID Dependency)
**Primary user:** U2

### Scenario WS5-01: Create orgUnit and assign admin via lookup
- Create orgUnit under Tenant Alpha.
- Lookup user by name/email.
- Assign orgUnit admin role.

### Scenario WS5-02: Add additional tenant admin via inline creation
- Create a new user inline as tenant admin.
- Confirm assignment and login outcome.

### Scenario WS5-03: Existing-user assignment UX
- Assign tenant-level roles to existing users via lookup.
- Confirm assignment appears in subsequent operations.

**Acceptance:** normal delegation workflows are intuitive and complete without UUID dependence.

## Wave 6 — Regression Sweep (Everything to Date)
**Primary users:** all

Run role-based regression scripts:
- U1: tenant lifecycle + entitlement management + scoped lookup.
- U2: orgUnit management + role assignment + inline user creation.
- U3/U4/U5: verify permitted actions and refusals match role.
- U6: disabled-module tenant behavior.

**Acceptance:** no P0, no unresolved data integrity issues, all core role journeys pass.

## 8. Scenario Traceability Matrix
Map each executed scenario to areas:
- **Status/process trust controls** (B0.x outcomes)
- **WS2 entitlement runtime control**
- **WS3 API operability + scope safety**
- **WS4 system admin usability**
- **WS5 tenant admin usability**

Maintain a single spreadsheet/tab with:
- Scenario ID,
- Role,
- Build SHA,
- Result,
- Evidence links,
- Defect IDs.

## 9. Evidence Requirements
For each scenario, capture:
1. Timestamped tester name and role.
2. Environment URL + build SHA.
3. Step-by-step notes.
4. Screenshot/video for failures and for each completed critical flow.
5. Final tester confidence score (1-5).

## 10. Defect Severity and Gates
- **P0**: Data integrity/security/scope break or blocked critical journey.
- **P1**: Major usability friction requiring workaround.
- **P2**: Minor UX or copy issue.

Release gate:
- 0 open P0,
- all critical scenarios passed,
- stakeholder sign-off from product + operations,
- explicit acceptance for any deferred P1/P2.

## 11. Daily UAT Cadence
- **Standup (15 min):** blockers + top failures.
- **Midday sync (15 min):** triage new defects.
- **End-of-day readout (20 min):** pass-rate, open P0/P1, next-day plan.

## 12. Completion Criteria
UAT completes when:
1. All scenarios executed by real users.
2. Critical-path flows (WS2-WS5) all pass.
3. Cross-role scope checks pass.
4. Sign-off package produced (summary + evidence + defect disposition).

## 13. Sign-Off Template
- Build SHA:
- Date range:
- Scenarios executed: X / X
- Pass rate:
- Open defects by severity:
- Operational readiness verdict: Ready / Conditionally Ready / Not Ready
- Product Owner sign-off:
- Operations/Admin lead sign-off:
