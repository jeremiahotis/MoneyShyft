import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { generateAccessToken, type JWTPayload } from '../../../src/src/utils/jwt';

type SignedUpUser = {
  userId: string;
  email: string;
  householdId: string | null;
};

const resolveBaseUrl = (): string => process.env.BASE_URL || 'http://localhost:5174';
const resolveApiBaseUrl = (): string => process.env.API_BASE_URL || process.env.API_URL || 'http://localhost:3000';

const signupTenantAdminUser = async (page: Page): Promise<SignedUpUser> => {
  const suffix = randomUUID().slice(0, 8);
  const email = `story12-admin-ui-${suffix}@example.com`;
  const response = await page.request.post('/api/v1/auth/signup', {
    data: {
      firstName: 'Admin',
      lastName: 'Tester',
      email,
      password: 'Password123!',
      householdName: `Story12-UI-${suffix}`,
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  const userId =
    body?.user?.id
    || body?.user?.userId
    || body?.data?.user?.id
    || body?.data?.user?.userId;
  const householdId =
    body?.user?.householdId
    || body?.data?.user?.householdId
    || null;
  expect(typeof userId).toBe('string');

  return {
    userId: userId as string,
    email,
    householdId: typeof householdId === 'string' ? householdId : null,
  };
};

const signupTenantAdminUserIsolated = async (): Promise<SignedUpUser> => {
  const requestContext = await playwrightRequest.newContext({
    baseURL: resolveApiBaseUrl(),
  });

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `story12-admin-ui-${suffix}@example.com`;
    const response = await requestContext.post('/api/v1/auth/signup', {
      data: {
        firstName: 'Admin',
        lastName: 'Tester',
        email,
        password: 'Password123!',
        householdName: `Story12-UI-${suffix}`,
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    const userId =
      body?.user?.id
      || body?.user?.userId
      || body?.data?.user?.id
      || body?.data?.user?.userId;
    const householdId =
      body?.user?.householdId
      || body?.data?.user?.householdId
      || null;
    expect(typeof userId).toBe('string');

    return {
      userId: userId as string,
      email,
      householdId: typeof householdId === 'string' ? householdId : null,
    };
  } finally {
    await requestContext.dispose();
  }
};

const assumeSystemAdminSession = async (page: Page, user: SignedUpUser): Promise<void> => {
  const baseUrl = resolveBaseUrl();
  const baseDomain = new URL(baseUrl).hostname;
  const csrfToken = `csrf-${randomUUID()}`;
  const payload: JWTPayload = {
    userId: user.userId,
    email: user.email,
    householdId: user.householdId,
    activeTenantId: user.householdId,
    activeOrgUnitId: null,
    role: 'SYSTEM_ADMIN',
  };
  const accessToken = generateAccessToken(payload);

  await page.context().addCookies([
    {
      name: 'access_token',
      value: accessToken,
      domain: baseDomain,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'csrf_token',
      value: csrfToken,
      domain: baseDomain,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
};

const resolveCsrfHeaders = async (page: Page): Promise<Record<string, string>> => {
  const baseUrl = resolveBaseUrl();
  const cookies = await page.context().cookies(baseUrl);
  const csrfToken = cookies.find((cookie) => cookie.name === 'csrf_token')?.value;

  if (!csrfToken) {
    return {};
  }

  return {
    'x-csrf-token': csrfToken,
  };
};

test.describe('Story 1.2 admin provisioning UI - role-gated journeys', () => {
  test('[P0] tenant admin can access tenant administration view with breadcrumbs @P0', async ({ page }) => {
    await signupTenantAdminUser(page);

    await page.goto('/admin/tenant');

    await expect(page.getByTestId('tenant-admin-heading')).toBeVisible();
    await expect(page.getByTestId('admin-breadcrumbs')).toContainText('Dashboard');
    await expect(page.getByTestId('admin-breadcrumbs')).toContainText('Tenant Admin');
  });

  test('[P1] tenant admin is denied direct access to system administration view @P1', async ({ page }) => {
    await signupTenantAdminUser(page);

    await page.goto('/admin/system');

    await expect(page).toHaveURL(/\/admin\/tenant$/);
    await expect(page.getByTestId('tenant-admin-heading')).toBeVisible();
  });

  test('[P1] tenant admin can create an orgUnit from tenant administration form @P1', async ({ page }) => {
    await signupTenantAdminUser(page);

    await page.goto('/admin/tenant');
    await page.getByRole('button', { name: /Structure/ }).first().click();

    const unique = randomUUID().slice(0, 8);
    await page.getByRole('button', { name: '+ Add Node' }).click();
    await page.locator('#new-node-name').fill(`Operations ${unique}`);
    await page.locator('#new-node-reason').fill('story12-admin-ui-test');
    await page.getByRole('button', { name: 'Create Node' }).click();

    await expect(page.getByText('Node created.')).toBeVisible();
  });

  test('[P0] system admin can bootstrap a tenant with inline admin identity (email-as-username) @P0', async ({ page }) => {
    const systemUser = await signupTenantAdminUser(page);
    await assumeSystemAdminSession(page, systemUser);

    await page.goto('/admin/system');
    await expect(page.getByTestId('system-admin-heading')).toBeVisible();

    const suffix = randomUUID().slice(0, 8);
    await page.getByRole('button', { name: '+ New Tenant' }).click();
    await page.locator('#wizard-tenant-name').fill(`Story12 Inline ${suffix}`);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#wizard-admin-first').fill('Inline');
    await page.locator('#wizard-admin-last').fill('Bootstrap');
    await page.locator('#wizard-admin-email').fill(`inline-bootstrap-${suffix}@example.com`);
    await page.locator('#wizard-admin-temp-password').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Create Tenant' }).click();

    await expect(page.getByText(/Tenant created:/)).toBeVisible({ timeout: 15000 });
  });

  test('[P1] tenant admin assignment flow refuses out-of-scope UUID identity inputs @P1', async ({ page }) => {
    const currentUser = await signupTenantAdminUser(page);
    const outOfScopeUser = await signupTenantAdminUserIsolated();

    await page.goto('/admin/tenant');
    await expect(page.getByTestId('tenant-admin-heading')).toBeVisible();

    await expect(page.locator('#tenant-role-user-id')).toHaveCount(0);

    const refusalResponse = await page.request.post('/api/v1/platform/admin/tenant-memberships', {
      headers: await resolveCsrfHeaders(page),
      data: {
        userId: outOfScopeUser.userId,
        roleSet: ['TENANT_STAFF'],
        reason: 'story12-ui-out-of-scope-identity',
      },
    });

    expect([403, 404]).toContain(refusalResponse.status());
    const refusalBody = await refusalResponse.json();
    expect(refusalBody).toMatchObject({
      ok: false,
    });
    expect(String(refusalBody?.code || '')).toMatch(/ASSIGNABLE_USER_NOT_FOUND|FORBIDDEN|TENANT_SCOPE/);

    const healthCheck = await page.request.get('/api/v1/auth/me');
    expect(healthCheck.status()).toBe(200);
    const me = await healthCheck.json();
    const currentUserId =
      me?.user?.id
      || me?.data?.user?.id
      || null;
    expect(currentUserId).toBe(currentUser.userId);
  });
});
