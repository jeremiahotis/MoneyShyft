import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  registerV1RoutesWithLoader,
  registerV1Routes,
  PLATFORM_MIDDLEWARE_CHAIN,
  PLATFORM_MIDDLEWARE_ORDER,
  V1_ROUTE_REGISTRATIONS
} from '../api/registerRoutes';
import { generateAccessToken } from '../utils/jwt';
import { csrfProtection } from '../platform/middleware/csrfProtection';

describe('Story 0.1 - canonical app entrypoint and kernel middleware', () => {
  describe('AC1: ordered platform middleware chain', () => {
    it('applies correlation, tenancy, auth-context, and envelope in order', async () => {
      const testApp = express();
      PLATFORM_MIDDLEWARE_CHAIN.forEach((middleware) => testApp.use(middleware));
      testApp.get('/_test/health', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const response = await request(testApp)
        .get('/_test/health')
        .set('X-Tenant-Id', 'tenant-123');

      expect(response.status).toBe(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-tenant-id']).toBe('public');
      expect(response.headers['x-platform-middleware-chain']).toBe(
        PLATFORM_MIDDLEWARE_ORDER.join(',')
      );
    });

    it('does not trust tenant headers and resolves tenant from auth cookie', async () => {
      const testApp = express();
      testApp.use(cookieParser());
      PLATFORM_MIDDLEWARE_CHAIN.forEach((middleware) => testApp.use(middleware));
      testApp.get('/_test/tenant', (_req, res) => {
        res.status(200).json({
          tenantId: res.getHeader('x-tenant-id')
        });
      });

      const accessToken = generateAccessToken({
        userId: 'user-1',
        email: 'user@example.com',
        householdId: 'household-secure',
        role: 'member'
      });

      const response = await request(testApp)
        .get('/_test/tenant')
        .set('X-Tenant-Id', 'spoofed-tenant')
        .set('Cookie', [`access_token=${accessToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe('household-secure');
      expect(response.headers['x-tenant-id']).toBe('household-secure');
    });
  });

  describe('AC2: shared route registration', () => {
    it('registers all v1 module routes through a shared registry', () => {
      const registeredPaths = V1_ROUTE_REGISTRATIONS.map(
        (registration) => registration.path
      );

      expect(registeredPaths).toEqual([
        '/api/v1/platform',
        '/api/v1/platform/admin',
        '/api/v1/connectshyft',
        '/api/v1/auth',
        '/api/v1/accounts',
        '/api/v1/transactions',
        '/api/v1/transactions',
        '/api/v1/categories',
        '/api/v1/goals',
        '/api/v1/budgets',
        '/api/v1/income',
        '/api/v1/debts',
        '/api/v1/assignments',
        '/api/v1/households',
        '/api/v1/recurring-transactions',
        '/api/v1/extra-money',
        '/api/v1/settings',
        '/api/v1/scenarios',
        '/api/v1/tags'
      ]);
    });

    it('mounts each v1 route from the shared registration function', () => {
      const app = {
        use: jest.fn()
      } as unknown as express.Application;
      const routeLoader = jest.fn(() => express.Router());

      registerV1RoutesWithLoader(app, routeLoader);

      expect((app.use as jest.Mock).mock.calls).toHaveLength(
        V1_ROUTE_REGISTRATIONS.length
      );

      V1_ROUTE_REGISTRATIONS.forEach(({ path, modulePath }, index) => {
        const call = (app.use as jest.Mock).mock.calls[index];
        expect(call[0]).toBe(path);
        expect(typeof call[1]).toBe('function');
        expect(routeLoader).toHaveBeenNthCalledWith(index + 1, modulePath);
      });
    });
  });
});

describe('Story 0.4 - csrf and parent-domain cookie enforcement', () => {
  it('rejects authenticated state-changing requests without a matching CSRF token in app middleware order', async () => {
    const testApp = express();
    testApp.use(cookieParser());
    PLATFORM_MIDDLEWARE_CHAIN.forEach((middleware) => testApp.use(middleware));
    testApp.use(csrfProtection);
    testApp.post('/_test/mutate', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const missingTokenResponse = await request(testApp)
      .post('/_test/mutate')
      .set('Cookie', ['access_token=access-token']);

    expect(missingTokenResponse.status).toBe(403);
    expect(missingTokenResponse.body).toMatchObject({
      ok: false,
      code: 'CSRF_TOKEN_REQUIRED',
      refusalType: 'security',
    });

    const validTokenResponse = await request(testApp)
      .post('/_test/mutate')
      .set('Cookie', ['access_token=access-token', 'csrf_token=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token');

    expect(validTokenResponse.status).toBe(200);
    expect(validTokenResponse.body.ok).toBe(true);
  });
});
