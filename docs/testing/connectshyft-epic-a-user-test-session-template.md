# ConnectShyft Epic A User Test Session Log

Session date:
Facilitator:
Environment:
Run type: Phase A / Phase B / Phase C

## 1. Accounts and Context Used

| Label | Email | Tenant | OrgUnit | Role | Notes |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 2. Data Setup Summary

## Users created via UI

| User | Create path | Tenant joined | Invitation code used | Result |
|---|---|---|---|---|
|  | `/signup` create/join |  |  |  |

## OrgUnits and roles assigned

| Tenant | OrgUnit ID | Assignment action | User ID | Role set | Result |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 3. 22-View Walkthrough Results

| View ID | Route | Role/account | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| V01 | `/login` |  |  |  |  |
| V02 | `/signup` |  |  |  |  |
| V03 | `/` |  |  |  |  |
| V04 | `/app/connectshyft/inbox` |  |  |  |  |
| V05 | `/app/connectshyft/settings/availability` |  |  |  |  |
| V06 | `/app/connectshyft/settings/numbers` |  |  |  |  |
| V07 | `/app/connectshyft/settings/escalation` |  |  |  |  |
| V08 | `/accounts` |  |  |  |  |
| V09 | `/transactions` |  |  |  |  |
| V10 | `/recurring-transactions` |  |  |  |  |
| V11 | `/budget` |  |  |  |  |
| V12 | `/budget/setup` |  |  |  |  |
| V13 | `/goals` |  |  |  |  |
| V14 | `/debts` |  |  |  |  |
| V15 | `/extra-money` |  |  |  |  |
| V16 | `/settings` |  |  |  |  |
| V17 | `/admin` |  |  |  |  |
| V18 | `/admin/system` |  |  |  |  |
| V19 | `/admin/tenant` |  |  |  |  |
| V20 | `/scenarios` |  |  |  |  |
| V21 | `/scenarios/:id` |  |  |  |  |
| V22 | `/scenarios/:id/projection` |  |  |  |  |

## 4. RBAC and Isolation Checks

| Check ID | Scenario | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| R1 | Tenant admin creates orgUnit in own tenant | Allowed |  |  |
| R2 | Non-tenant-admin orgUnit create attempt | Refused |  |  |
| R3 | Cross-tenant mutation attempt | Refused |  |  |
| R4 | OrgUnit member-only route without membership | Refused |  |  |
| R5 | Tenant-privileged bypass route | Allowed with bypass metadata |  |  |
| R6 | Tenant A user sees tenant B data | No visibility |  |  |

## 5. Phase B Harness Results (if run)

| Suite | Command | Result | Report path |
|---|---|---|---|
| a.1 API |  |  |  |
| a.2 API |  |  |  |
| a.3 API |  |  |  |
| a.4 API |  |  |  |
| a.5 API |  |  |  |
| a.3 E2E |  |  |  |
| a.4 E2E |  |  |  |
| a.5 E2E |  |  |  |

## 6. Defects and Findings

| ID | Severity | Title | Repro summary | Owner | Status |
|---|---|---|---|---|---|
|  | P0/P1/P2 |  |  |  |  |

## 7. Sign-Off

Phase A status:
Phase B status:
Phase C status:
Approved by:
Notes:
