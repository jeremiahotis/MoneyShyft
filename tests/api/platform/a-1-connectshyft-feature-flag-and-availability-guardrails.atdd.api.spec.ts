import { test, expect } from '@playwright/test';
import { apiRequest } from '../../support/helpers/apiClient';
import { createTenantScopeHeaders } from '../../support/factories/tenantRepositoryFactory';

test.describe('Story a.1 ConnectShyft Feature Flag and Availability Guardrails (ATDD API RED)', () => {
  test.skip('[P0] fail-closed: module-disabled inbox access returns controlled refusal envelope @P0', async ({ request }) => {
    const headers = {
      ...createTenantScopeHeaders({
        tenantId: 'tenant-connectshyft-a',
        orgUnitId: 'org-connectshyft-east',
        role: 'TENANT_ADMIN',
      }),
      'x-test-connectshyft-flags': JSON.stringify({
        connectshyft_enabled: false,
        connectshyft_inbox_enabled: false,
        connectshyft_escalation_enabled: false,
        connectshyft_webhooks_enabled: false,
      }),
    };

    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/connectshyft/inbox',
      headers,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'CONNECTSHYFT_MODULE_DISABLED',
      refusalType: 'business',
      message: expect.stringContaining('ConnectShyft is currently unavailable'),
    });
  });

  test.skip('[P0] fail-closed: module-disabled thread ensure endpoint is refused with deterministic contract @P0', async ({ request }) => {
    const headers = {
      ...createTenantScopeHeaders({
        tenantId: 'tenant-connectshyft-a',
        orgUnitId: 'org-connectshyft-east',
        role: 'TENANT_ADMIN',
      }),
      'x-test-connectshyft-flags': JSON.stringify({
        connectshyft_enabled: false,
        connectshyft_inbox_enabled: false,
        connectshyft_escalation_enabled: false,
        connectshyft_webhooks_enabled: false,
      }),
    };

    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/connectshyft/threads',
      headers,
      data: {
        orgUnitId: 'org-connectshyft-east',
        neighborId: 'neighbor-a-1001',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'CONNECTSHYFT_MODULE_DISABLED',
      refusalType: 'business',
    });
  });

  test.skip('[P1] partial-flag state exposes inbox while refusing escalation actions with explicit messaging @P1', async ({ request }) => {
    const headers = {
      ...createTenantScopeHeaders({
        tenantId: 'tenant-connectshyft-a',
        orgUnitId: 'org-connectshyft-east',
        role: 'TENANT_ADMIN',
      }),
      'x-test-connectshyft-flags': JSON.stringify({
        connectshyft_enabled: true,
        connectshyft_inbox_enabled: true,
        connectshyft_escalation_enabled: false,
        connectshyft_webhooks_enabled: true,
      }),
    };

    const inboxResponse = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/connectshyft/inbox',
      headers,
    });
    expect(inboxResponse.status()).toBe(200);

    const claimResponse = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/connectshyft/threads/thread-a-1001/claim',
      headers,
      data: {
        reason: 'operator-claim',
      },
    });

    expect(claimResponse.status()).toBe(200);
    const claimBody = await claimResponse.json();
    expect(claimBody).toMatchObject({
      ok: false,
      code: 'CONNECTSHYFT_ESCALATION_CAPABILITY_DISABLED',
      refusalType: 'business',
      message: expect.stringContaining('escalation capability is unavailable'),
    });
  });

  test.skip('[P1] webhooks sub-flag disabled refuses inbound SMS webhook processing deterministically @P1', async ({ request }) => {
    const headers = {
      ...createTenantScopeHeaders({
        tenantId: 'tenant-connectshyft-a',
        orgUnitId: 'org-connectshyft-east',
        role: 'TENANT_ADMIN',
      }),
      'x-test-connectshyft-flags': JSON.stringify({
        connectshyft_enabled: true,
        connectshyft_inbox_enabled: true,
        connectshyft_escalation_enabled: true,
        connectshyft_webhooks_enabled: false,
      }),
    };

    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/connectshyft/webhooks/sms',
      headers,
      data: {
        sid: 'SM1234567890',
        from: '+12605550123',
        to: '+12605550999',
        body: 'Need help with pickup update',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'CONNECTSHYFT_WEBHOOKS_DISABLED',
      refusalType: 'business',
      message: expect.stringContaining('webhook processing is unavailable'),
    });
  });
});
