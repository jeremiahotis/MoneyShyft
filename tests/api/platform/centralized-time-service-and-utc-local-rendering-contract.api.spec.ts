import { test, expect } from '@playwright/test';
import { apiRequest } from '../../support/helpers/apiClient';
import { createTimezoneContext } from '../../support/factories/timezoneContextFactory';

test.describe('Story 0.8 atdd - centralized time service and utc/local rendering contract API coverage', () => {
  test('[P0] resolves timezone fallback in strict order user -> tenant -> system @P0', async ({
    request,
  }) => {
    // Given a request where user timezone is absent and tenant timezone is available
    const timezoneContext = createTimezoneContext({
      userTimezone: null,
      tenantTimezone: 'America/Chicago',
      systemTimezone: 'UTC',
    });

    // When asking for operational render context
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/time/render-context',
      headers: timezoneContext.headers,
    });

    // Then tenant fallback should be selected
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      timezone: 'America/Chicago',
      timezoneSource: 'tenant',
    });
    expect(body.timezone).not.toBe('UTC');
  });

  test('[P1] returns localized timestamps for operational payload contract @P1', async ({ request }) => {
    // Given an operational UTC timestamp and explicit user timezone
    const timezoneContext = createTimezoneContext({
      userTimezone: 'America/Los_Angeles',
      tenantTimezone: 'America/Chicago',
      systemTimezone: 'UTC',
    });

    // When requesting a render contract payload
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/time/render-contract',
      headers: timezoneContext.headers,
      data: {
        utcTimestamp: '2026-02-17T15:30:00.000Z',
        purpose: 'operations-listing',
      },
    });

    // Then service should acknowledge contract generation
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      timezoneSource: 'user',
      rendered: expect.any(String),
      utcTimestamp: '2026-02-17T15:30:00.000Z',
    });
    expect(body.rendered).not.toContain('T15:30:00.000Z');
  });

  test('[P1] contract endpoint omits raw utc strings in operational-ui response envelope @P1', async ({ request }) => {
    // Given an operational response feed request with timezone metadata
    const timezoneContext = createTimezoneContext({
      userTimezone: 'America/New_York',
      tenantTimezone: 'America/Chicago',
      systemTimezone: 'UTC',
    });

    // When requesting operation rows prepared for UI rendering
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/operations/feed',
      headers: timezoneContext.headers,
    });

    // Then contract endpoint should be reachable for UI-safe values
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.rows ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          occurredAtLocal: expect.any(String),
          timezoneSource: expect.stringMatching(/^(user|tenant|system)$/),
        }),
      ]),
    );
  });

  test('[P1] falls back to system timezone when user and tenant preferences are absent @P1', async ({
    request,
  }) => {
    // Given a request where user and tenant timezone are both unavailable
    const timezoneContext = createTimezoneContext({
      userTimezone: null,
      tenantTimezone: '',
      systemTimezone: 'UTC',
    });

    // When asking for operational render context
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/time/render-context',
      headers: timezoneContext.headers,
    });

    // Then system fallback should be selected and contract should declare source
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      timezone: 'UTC',
      timezoneSource: 'system',
    });
  });

  test('[P1] returns refusal envelope when timezone context cannot be resolved @P1', async ({
    request,
  }) => {
    // Given an invalid timezone context payload
    const timezoneContext = createTimezoneContext({
      userTimezone: '',
      tenantTimezone: '',
      systemTimezone: '',
    });

    // When asking for render context without a valid fallback option
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/time/render-context',
      headers: timezoneContext.headers,
    });

    // Then refusal envelope should identify timezone resolution failure
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'TIMEZONE_CONTEXT_UNRESOLVED',
      message: expect.any(String),
    });
  });
});
