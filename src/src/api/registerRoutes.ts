import { Application, Router } from 'express';
import { requestCorrelation } from '../platform/middleware/requestCorrelation';
import { tenancyContext } from '../platform/middleware/tenancyContext';
import { authContext } from '../platform/middleware/authContext';
import { responseEnvelope } from '../platform/middleware/responseEnvelope';

type RouteRegistration = {
  path: string;
  modulePath: string;
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
  { path: '/api/v1/accounts', modulePath: '../routes/api/v1/accounts' },
  { path: '/api/v1/transactions', modulePath: '../routes/api/v1/transactions' },
  { path: '/api/v1/transactions', modulePath: '../routes/api/v1/splits' },
  { path: '/api/v1/categories', modulePath: '../routes/api/v1/categories' },
  { path: '/api/v1/goals', modulePath: '../routes/api/v1/goals' },
  { path: '/api/v1/budgets', modulePath: '../routes/api/v1/budgets' },
  { path: '/api/v1/income', modulePath: '../routes/api/v1/income' },
  { path: '/api/v1/debts', modulePath: '../routes/api/v1/debts' },
  { path: '/api/v1/assignments', modulePath: '../routes/api/v1/assignments' },
  { path: '/api/v1/households', modulePath: '../routes/api/v1/households' },
  { path: '/api/v1/recurring-transactions', modulePath: '../routes/api/v1/recurring-transactions' },
  { path: '/api/v1/extra-money', modulePath: '../routes/api/v1/extra-money' },
  { path: '/api/v1/settings', modulePath: '../routes/api/v1/settings' },
  { path: '/api/v1/scenarios', modulePath: '../routes/api/v1/scenarios' },
  { path: '/api/v1/tags', modulePath: '../routes/api/v1/tags' }
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
  V1_ROUTE_REGISTRATIONS.forEach(({ path, modulePath }) => {
    app.use(path, loadRouter(modulePath));
  });
};

export const registerV1RoutesWithLoader = (
  app: Application,
  routeLoader: (modulePath: string) => Router
): void => {
  V1_ROUTE_REGISTRATIONS.forEach(({ path, modulePath }) => {
    app.use(path, routeLoader(modulePath));
  });
};
