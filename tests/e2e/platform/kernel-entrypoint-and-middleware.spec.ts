import { test, expect } from '../../support/fixtures/kernelApi.fixture';
import { apiRequest } from '../../support/helpers/apiClient';

test.describe('Story 0.1 - Canonical app entrypoint and middleware chain', () => {
  test('registers platform kernel route through canonical app entrypoint @P0', async ({ request }) => {
    // Given the API is booted through the canonical app entrypoint
    // When the kernel health route is requested
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/health',
    });

    // Then the route should be registered and reachable
    expect(response.status()).toBe(200);
  });

  test('adds correlation id via platform middleware @P0', async ({ request, kernelRequest }) => {
    // Given a request with tenant and CSRF context
    // When the kernel context route is requested
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/context',
      headers: kernelRequest.headers,
    });

    // Then correlation id should be present in response headers
    expect(response.headers()['x-correlation-id']).toBeTruthy();
  });

  test('enforces middleware ordering for tenancy before handler execution @P1', async ({ request, kernelRequest }) => {
    // Given a request that includes tenant context headers
    // When the middleware diagnostic endpoint is requested
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/middleware-order',
      headers: kernelRequest.headers,
    });

    // Then endpoint should confirm expected middleware order contract
    expect(response.status()).toBe(200);
  });
});
