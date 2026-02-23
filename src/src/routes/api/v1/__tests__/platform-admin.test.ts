import express from 'express';
import request from 'supertest';

const mockCreateTenant = jest.fn();
const mockUpsertTenantModuleEntitlement = jest.fn();
const mockCreateOrgUnit = jest.fn();
const mockUpdateOrgUnit = jest.fn();
const mockUpsertTenantMembership = jest.fn();
const mockRevokeTenantMembership = jest.fn();
const mockUpsertOrgUnitMembership = jest.fn();
const mockRevokeOrgUnitMembership = jest.fn();
const mockEvaluateRequestCapabilities = jest.fn();
const mockSearchScopedUsers = jest.fn();
const mockCreateScopedAdminUser = jest.fn();

jest.mock('../../../../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'user-1@example.com',
      householdId: '22222222-2222-4222-8222-222222222222',
      activeTenantId: '22222222-2222-4222-8222-222222222222',
      activeOrgUnitId: null,
      role: 'SYSTEM_ADMIN',
    };
    next();
  },
}));

jest.mock('../../../../services/PlatformAdminService', () => ({
  createTenant: (...args: unknown[]) => mockCreateTenant(...args),
  upsertTenantModuleEntitlement: (...args: unknown[]) => mockUpsertTenantModuleEntitlement(...args),
  createOrgUnit: (...args: unknown[]) => mockCreateOrgUnit(...args),
  updateOrgUnit: (...args: unknown[]) => mockUpdateOrgUnit(...args),
  parseRoleSetBody: (value: unknown) => Array.isArray(value) ? value : [],
  upsertTenantMembership: (...args: unknown[]) => mockUpsertTenantMembership(...args),
  revokeTenantMembership: (...args: unknown[]) => mockRevokeTenantMembership(...args),
  upsertOrgUnitMembership: (...args: unknown[]) => mockUpsertOrgUnitMembership(...args),
  revokeOrgUnitMembership: (...args: unknown[]) => mockRevokeOrgUnitMembership(...args),
  evaluateRequestCapabilities: (...args: unknown[]) => mockEvaluateRequestCapabilities(...args),
  searchScopedUsers: (...args: unknown[]) => mockSearchScopedUsers(...args),
  createScopedAdminUser: (...args: unknown[]) => mockCreateScopedAdminUser(...args),
}));

jest.mock('../../../../config/knex', () => ({
  __esModule: true,
  default: {},
}));

import router from '../platform-admin';

describe('platform admin routes', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/platform/admin', router);
    return app;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates required tenant creation input', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/v1/platform/admin/tenants')
      .send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'TENANT_NAME_REQUIRED',
    });
  });

  it('returns refusal envelope when capability checks fail', async () => {
    const app = buildApp();
    mockCreateTenant.mockRejectedValue(new Error('FORBIDDEN:platform:tenant:create'));

    const response = await request(app)
      .post('/api/v1/platform/admin/tenants')
      .send({ name: 'Tenant A' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('returns success envelope for tenant creation', async () => {
    const app = buildApp();
    mockCreateTenant.mockResolvedValue({
      tenant: {
        id: 'tenant-a',
        name: 'Tenant A',
        status: 'active',
      },
      billingAccount: null,
    });

    const response = await request(app)
      .post('/api/v1/platform/admin/tenants')
      .send({ name: 'Tenant A' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: 'TENANT_CREATED',
      data: {
        tenant: {
          id: 'tenant-a',
          name: 'Tenant A',
          status: 'active',
        },
      },
    });
  });

  it('validates module entitlement toggle payload', async () => {
    const app = buildApp();

    const response = await request(app)
      .put('/api/v1/platform/admin/module-entitlements')
      .send({ moduleKey: 'dispatch', enabled: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'MODULE_ENTITLEMENT_INPUT_INVALID',
    });
  });

  it('rejects invalid UUID input with refusal envelope', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/v1/platform/admin/tenant-memberships')
      .send({
        tenantId: 'not-a-uuid',
        userId: 'also-not-a-uuid',
        roleSet: ['TENANT_ADMIN'],
        reason: 'test',
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'TENANT_MEMBERSHIP_INPUT_INVALID',
    });
  });

  it('returns refusal envelope when module is disabled for requested action', async () => {
    const app = buildApp();
    mockUpsertTenantMembership.mockRejectedValue(new Error('MODULE_DISABLED:rbac'));

    const response = await request(app)
      .post('/api/v1/platform/admin/tenant-memberships')
      .send({
        userId: '33333333-3333-4333-8333-333333333333',
        roleSet: ['TENANT_ADMIN'],
        reason: 'test',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'MODULE_DISABLED',
    });
  });

  it('ignores client-provided role headers when building actor context', async () => {
    const app = buildApp();
    mockCreateTenant.mockResolvedValue({
      tenant: {
        id: 'tenant-a',
        name: 'Tenant A',
        status: 'active',
      },
      billingAccount: null,
    });

    await request(app)
      .post('/api/v1/platform/admin/tenants')
      .set('x-system-role', 'SYSTEM_ADMIN')
      .set('x-tenant-role', 'TENANT_ADMIN')
      .set('x-orgunit-role', 'ORGUNIT_ADMIN')
      .send({ name: 'Tenant A' });

    expect(mockCreateTenant).toHaveBeenCalled();
    const actorArg = mockCreateTenant.mock.calls[0][1];
    expect(actorArg).toMatchObject({
      headerRoles: [],
    });
  });

  it('returns forbidden refusal for unauthorized initial tenant-admin assignment during tenant creation', async () => {
    const app = buildApp();
    mockCreateTenant.mockRejectedValue(new Error('FORBIDDEN:platform:tenant_admin:assign'));

    const response = await request(app)
      .post('/api/v1/platform/admin/tenants')
      .send({
        name: 'Tenant A',
        assignTenantAdminUserId: '33333333-3333-4333-8333-333333333333',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('returns forbidden refusal for unauthorized initial tenant-admin assignment during membership upsert', async () => {
    const app = buildApp();
    mockUpsertTenantMembership.mockRejectedValue(new Error('FORBIDDEN:platform:tenant_admin:assign'));

    const response = await request(app)
      .post('/api/v1/platform/admin/tenant-memberships')
      .send({
        userId: '33333333-3333-4333-8333-333333333333',
        roleSet: ['TENANT_ADMIN'],
        reason: 'bootstrap-admin',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Insufficient permissions for tenant membership update',
    });
  });

  it('returns tenant-not-found refusal when org-unit creation scope is missing', async () => {
    const app = buildApp();
    mockCreateOrgUnit.mockRejectedValue(new Error('TENANT_NOT_FOUND'));

    const response = await request(app)
      .post('/api/v1/platform/admin/org-units')
      .send({
        name: 'Ops East',
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'TENANT_NOT_FOUND',
    });
  });

  it('supports scoped user lookup by query without UUID knowledge', async () => {
    const app = buildApp();
    mockSearchScopedUsers.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'admin@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        roleSet: ['TENANT_ADMIN'],
      },
    ]);

    const response = await request(app)
      .get('/api/v1/platform/admin/users/search')
      .query({ query: 'ada' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: 'USER_SEARCH_COMPLETED',
      data: {
        users: [
          {
            email: 'admin@example.com',
          },
        ],
      },
    });
  });

  it('validates scoped admin user creation payload', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/v1/platform/admin/users')
      .send({
        email: 'new-admin@example.com',
        password: 'short',
        firstName: 'New',
        lastName: 'Admin',
        tenantRoleSet: ['TENANT_ADMIN'],
        reason: 'bootstrap',
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'USER_CREATE_INPUT_INVALID',
    });
  });

  it('returns success envelope for scoped admin user creation', async () => {
    const app = buildApp();
    mockCreateScopedAdminUser.mockResolvedValue({
      user: {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'new-admin@example.com',
      },
      membership: {
        tenantId: '22222222-2222-4222-8222-222222222222',
        roleSet: ['TENANT_ADMIN'],
      },
    });

    const response = await request(app)
      .post('/api/v1/platform/admin/users')
      .send({
        email: 'new-admin@example.com',
        password: 'very-secure-password',
        firstName: 'New',
        lastName: 'Admin',
        tenantRoleSet: ['TENANT_ADMIN'],
        reason: 'bootstrap',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: 'ADMIN_USER_CREATED',
    });
  });
});
