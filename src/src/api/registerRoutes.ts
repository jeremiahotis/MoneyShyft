import { Application, Router } from 'express';
import { requestCorrelation } from '../platform/middleware/requestCorrelation';
import { tenancyContext } from '../platform/middleware/tenancyContext';
import { authContext } from '../platform/middleware/authContext';
import { responseEnvelope } from '../platform/middleware/responseEnvelope';
import { requireTenantModuleEntitlement } from '../platform/middleware/moduleEntitlement';

type RouteRegistration = {
  path: string;
  modulePath: string;
  moduleEntitlementKey?: string;
};

export const PLATFORM_MIDDLEWARE_ORDER = [
  'correlation',
  'tenancy',
  'auth-context',
  'response-envelope'
] as const;

export const PLATFORM_MIDDLEWARE_CHAIN = [
  requestCorrelation,
  tenancyContext,
  authContext,
  responseEnvelope
];

export const V1_ROUTE_REGISTRATIONS: RouteRegistration[] = [
  { path: '/api/v1/platform', modulePath: '../routes/api/v1/platform-contracts' },
  { path: '/api/v1/platform/admin', modulePath: '../routes/api/v1/platform-admin' },
  { path: '/api/v1/connectshyft', modulePath: '../routes/api/v1/connectshyft' },
  { path: '/api/v1/auth', modulePath: '../routes/api/v1/auth' },
  { path: '/api/v1/accounts', modulePath: '../routes/api/v1/accounts', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/transactions', modulePath: '../routes/api/v1/transactions', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/transactions', modulePath: '../routes/api/v1/splits', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/categories', modulePath: '../routes/api/v1/categories', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/goals', modulePath: '../routes/api/v1/goals', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/budgets', modulePath: '../routes/api/v1/budgets', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/income', modulePath: '../routes/api/v1/income', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/debts', modulePath: '../routes/api/v1/debts', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/assignments', modulePath: '../routes/api/v1/assignments', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/households', modulePath: '../routes/api/v1/households', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/recurring-transactions', modulePath: '../routes/api/v1/recurring-transactions', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/extra-money', modulePath: '../routes/api/v1/extra-money', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/settings', modulePath: '../routes/api/v1/settings', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/scenarios', modulePath: '../routes/api/v1/scenarios', moduleEntitlementKey: 'moneyshyft' },
  { path: '/api/v1/tags', modulePath: '../routes/api/v1/tags', moduleEntitlementKey: 'moneyshyft' }
];

const loadRouter = (modulePath: string): Router => {
  const mod = require(modulePath) as { default: Router };
  return mod.default;
};

export const registerPlatformMiddleware = (app: Application): void => {
  PLATFORM_MIDDLEWARE_CHAIN.forEach((middleware) => {
    app.use(middleware);
  });
};

export const registerV1Routes = (app: Application): void => {
  V1_ROUTE_REGISTRATIONS.forEach(({ path, modulePath, moduleEntitlementKey }) => {
    const routeMiddleware = moduleEntitlementKey ? [requireTenantModuleEntitlement(moduleEntitlementKey)] : [];
    app.use(path, ...routeMiddleware, loadRouter(modulePath));
  });
};

export const registerV1RoutesWithLoader = (
  app: Application,
  routeLoader: (modulePath: string) => Router
): void => {
  V1_ROUTE_REGISTRATIONS.forEach(({ path, modulePath, moduleEntitlementKey }) => {
    const routeMiddleware = moduleEntitlementKey ? [requireTenantModuleEntitlement(moduleEntitlementKey)] : [];
    app.use(path, ...routeMiddleware, routeLoader(modulePath));
  });
};
