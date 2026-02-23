# Blocker Remediation Implementation Plan (2026-02-23)

## Decision Lock

- Freeze remains active.
- No new feature-epic execution starts until all blocker exit criteria are satisfied and validated.

## Blockers to Resolve

1. Status truth is unreliable (reality vs tracked status drift).
2. ConnectShyft is not wired to real tenant entitlements for runtime/admin control.
3. System Admin and Tenant Admin flows are UUID-dependent and not operator-usable.
4. Scoped admin creation/delegation and scoped user lookup are incomplete.
5. Usability validation is not enforced as a blocking release gate.

## Implementation Strategy

Execute in six workstreams, in order. Each workstream produces mergeable deliverables and hard tests.

## WS1 - Status Trust Lockdown

### Objective

Make status values authoritative, synchronized, and merge-blocking when invalid.

### Deliverables

1. Add atomic status transition script to update both story file and sprint-status in one command.
2. Add closeout gate that prevents merge if story is effectively complete but status is not `done`.
3. Extend policy checks so lane-specific status files are always targeted (RouteShyft vs ConnectShyft) and cannot be bypassed by branch naming drift.
4. Add CI lane to fail on any status drift for changed stories.

### Code Touchpoints

- `scripts/enforce-git-policy.sh`
- `scripts/enforce-story-status-sync.sh`
- `scripts/project-lane-context.js`
- New: `scripts/set-story-status-atomic.sh`
- New/updated tests under `tests/api/platform/` and `tests/support/utils/`

### Exit Criteria

1. Any mismatch between story markdown `Status:` and lane sprint-status key fails locally and in CI.
2. Story closeout requires explicit transition to `done` via atomic command path.
3. Policy checks are lane-correct for ConnectShyft artifacts.

## WS2 - Real Entitlement Runtime Wiring

### Objective

Use platform entitlements, not env-only flags, as source of truth for module availability.

### Deliverables

1. Add entitlement resolver service for tenant-scoped module availability.
2. Wire ConnectShyft route capability gates to tenant entitlement (`module_key = connectshyft`) before feature/sub-flag checks.
3. Add MoneyShyft module visibility gate (`module_key = moneyshyft`) across nav and route guards.
4. Keep env flags as global kill-switch only, not tenant authority.

### Code Touchpoints

- `src/src/modules/connectshyft/featureFlags.ts`
- `src/src/routes/api/v1/connectshyft.ts`
- New: `src/src/services/PlatformModuleEntitlementService.ts`
- `frontend/src/components/layout/AppHeader.vue`
- `frontend/src/components/layout/AppMobileNav.vue`
- `frontend/src/router/index.ts`
- `src/src/routes/api/v1/platform-admin.ts`

### Exit Criteria

1. Tenant without `connectshyft` entitlement cannot access ConnectShyft routes.
2. Tenant without `moneyshyft` entitlement does not see MoneyShyft surfaces.
3. Entitlement toggles from admin flows take effect without manual env changes.

## WS3 - Admin API Foundation (No UUID-Only UX)

### Objective

Provide admin APIs that support human lookup, inline user creation, scoped delegation, and future-safe hierarchy behavior.

### Deliverables

1. Add scoped user directory search endpoint (email, first name, last name, username once introduced).
2. Add inline user creation endpoint for admin flows with role assignment in same transaction.
3. Add tenant configuration fields for allowed structure modes:
   - orgUnits enabled/disabled
   - subtenants enabled/disabled
   - direct users enabled/disabled
4. Add orgUnit/subtenant-level module entitlements constrained by tenant-level grants.
5. Add server-side scope filtering so admins never see out-of-scope users.

### Data Changes

1. Add `users.username` (unique, indexed, case-insensitive handling).
2. Add tenant structure config table or fields in `platform.tenants`.
3. Add `platform.org_unit_module_entitlements` for delegated module control.
4. Use existing `platform.org_units.type` for `ORG_UNIT` and `SUBTENANT` (subtenant+orgUnit nesting deferred as requested).

### Code Touchpoints

- `src/src/services/PlatformAdminService.ts`
- `src/src/routes/api/v1/platform-admin.ts`
- New migrations under `src/src/migrations/`
- `src/src/platform/rbac/capabilities.ts` (if capability extensions are needed)

### Exit Criteria

1. Admin can create scoped admin users directly from admin surfaces.
2. Admin can search users by human identifiers within allowed scope.
3. OrgUnit/subtenant module entitlements cannot exceed tenant grants.

## WS4 - System Admin UX Redesign

### Objective

Deliver system-admin setup workflow that is human-operable and complete.

### Deliverables

1. Replace UUID-first forms with guided setup flow:
   - Create tenant
   - Configure allowed structure modes
   - Configure module access (MoneyShyft/ConnectShyft)
   - Create initial tenant admin user inline
2. Add searchable “assign existing user” path by email/name/username.
3. Add clear action labels and contextual help.

### Code Touchpoints

- `frontend/src/views/Admin/SystemAdminView.vue`
- `frontend/src/services/platformAdmin.ts`
- New shared admin form components in `frontend/src/components/admin/`

### Exit Criteria

1. System admin can complete tenant bootstrap without UUID lookup.
2. Module grants and initial tenant admin setup complete in one guided flow.

## WS5 - Tenant Admin UX Redesign

### Objective

Deliver tenant-admin delegation workflows for orgUnits/subtenants and scoped admin assignments.

### Deliverables

1. Tenant admin can create orgUnit and subtenant entities.
2. Tenant admin can create orgUnit/subtenant admin users inline.
3. Tenant admin can assign existing users via scoped lookup.
4. Tenant admin can configure module access for orgUnits/subtenants only within tenant-granted modules.

### Code Touchpoints

- `frontend/src/views/Admin/TenantAdminView.vue`
- `frontend/src/services/platformAdmin.ts`
- New scoped lookup and assignment components.

### Exit Criteria

1. Tenant admin performs delegation and module assignment without UUID dependency.
2. Out-of-scope user visibility is blocked end-to-end.

## WS6 - Blocking Validation and Release Gates

### Objective

Convert usability and operability into hard release gates.

### Deliverables

1. Add end-to-end admin scenario suite:
   - System admin bootstrap
   - Tenant admin orgUnit/subtenant delegation
   - Scoped lookup and assignment
   - Module visibility enforcement (MoneyShyft and ConnectShyft)
2. Add policy gate checks for mandatory admin-flow evidence before blocker epic can close.
3. Add freeze-lift checklist with explicit pass/fail criteria.

### Code Touchpoints

- `tests/e2e/platform/` new admin-flow suites
- `tests/api/platform/` entitlement and scoped lookup suites
- `scripts/enforce-operability-closeout-guard.sh` enhancements if needed
- `scripts/enforce-git-policy.sh` gate integration

### Exit Criteria

1. All blocker suites pass in CI.
2. Real-user validation evidence is recorded and marked pass.
3. Stakeholder acceptance can move from pending to accepted.

## Execution Order and Dependencies

1. WS1 first (status trust), because execution telemetry must be reliable.
2. WS2 and WS3 next (entitlement/runtime + API foundation).
3. WS4 and WS5 after foundation APIs exist.
4. WS6 last as freeze-lift validation, but test scaffolding starts early.

## Implementation Backlog (Ready to Create as Stories)

1. B0.1 Status atomic transition and lane-safe enforcement.
2. B0.2 Closeout policy gate: no effective completion with non-done status.
3. B1.1 Tenant runtime entitlement resolver and ConnectShyft integration.
4. B1.2 MoneyShyft module visibility and route gating.
5. B2.1 Scoped user directory search API.
6. B2.2 Inline admin user creation API with transactional membership assignment.
7. B2.3 Tenant structure-mode config and subtenant modeling constraints.
8. B2.4 OrgUnit/subtenant module entitlement delegation API.
9. B3.1 System admin guided setup UI.
10. B3.2 Tenant admin delegation and assignment UI.
11. B4.1 E2E/API blocker validation gates and freeze-lift checklist.

## Freeze Lift Conditions

All conditions must be met:

1. Status trust controls pass in CI.
2. ConnectShyft and MoneyShyft entitlement gating works per tenant.
3. System admin setup is UUID-free for core bootstrap actions.
4. Tenant admin delegation is UUID-free for core flows.
5. Scoped lookup/assignment and visibility boundaries are verified.
6. Real-user operability validation passes.

## Immediate Next Action

Start B0.1 now: implement atomic status transition + policy integration, then run `npm run policy:check` to verify blocker gate behavior.
