# Backend Architecture

## Executive Summary
The backend is a TypeScript Express API organized by API routes, service classes, middleware, and Knex-based persistence. It currently uses cookie JWT authentication and a household-scoped domain model for budgeting workflows.

## Technology Stack
- Runtime: Node.js >=20
- Framework: Express 4
- Language: TypeScript
- Persistence: PostgreSQL + Knex
- Validation: Joi
- Auth primitives: JWT access/refresh cookies
- Testing: Jest + Supertest

## Architecture Pattern
Layered modular backend:
1. Routes (`routes/api/v1/*.ts`) map HTTP contracts.
2. Middleware (`middleware/*.ts`) handles auth/validation/errors.
3. Services (`services/*Service.ts`) implement domain behavior.
4. Data access currently centralized through Knex queries/migrations.

## Current Gaps vs Target Platform Kernel
- Tenant context is household-oriented, not canonical platform `tenant_id` middleware.
- Session persistence and refresh rotation table are not yet platformized.
- CSRF and parent-domain cookie behavior are not formalized for app.* + api.* target.
- Event + outbox kernel is not yet established as mutation contract.

## Governance & CI Policy Constraints
- Canonical git policy source: `docs/policies/git_policy.md` (mandatory).
- CI must enforce policy gate first (`npm run policy:check`) before lint/test gates.
- Branch/workflow guard command is required for story and epic operations:
- `npm run branch:ensure-workflow -- --workflow <name-or-path> --story <story-key-or-story-file>`
- `npm run branch:ensure-workflow -- --workflow <name-or-path> --epic <epic-id>`
- Required CI target jobs for RouteShyft stream:
1. `policy`
2. `lint`
3. `test` (4 shards)
4. `burn-in`
5. `quality-gates` (`@P0` 100%, `@P1` >=95%)
6. `backend-contracts` (optional `workflow_dispatch` lane)
7. `report`

## Key Route Surface
Representative route groups in `src/src/routes/api/v1/`:
- `auth`, `households`, `accounts`, `budgets`, `transactions`, `categories`
- `debts`, `goals`, `income`, `extra-money`, `scenarios`, `tags`, `assignments`, `splits`, `settings`, `recurring-transactions`
