import { Request, Response, Router } from 'express';
import {
  buildSuccessEnvelope,
  refusal,
  success,
  systemError,
  type EnvelopeContext
} from '../../../platform/envelopes/response';
import {
  formatUtcTimestampForTimezone,
  resolveTimezoneContext
} from '../../../platform/time/timezoneService';

const router = Router();

type CookiePolicyEnvironment = 'development' | 'staging' | 'production';

const deriveParentDomain = (host: string): string => {
  const segments = host.split('.').filter(Boolean);
  if (segments.length < 2) {
    return `.${host}`;
  }

  return `.${segments.slice(-2).join('.')}`;
};

const resolveCookiePolicy = (environment: CookiePolicyEnvironment): {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
} => {
  if (environment === 'production') {
    return { secure: true, sameSite: 'strict' };
  }

  if (environment === 'staging') {
    return { secure: true, sameSite: 'lax' };
  }

  return { secure: false, sameSite: 'lax' };
};

const resolveEnvelopeContext = (req: Request, res: Response): EnvelopeContext => {
  return (res.locals.responseEnvelope as EnvelopeContext | undefined) || {
    correlationId: req.correlationId || null,
    tenantId: req.tenantId || null
  };
};

router.post('/_kernel/contracts/envelope/success', (req: Request, res: Response) => {
  const code = typeof req.body?.code === 'string' && req.body.code.trim() !== ''
    ? req.body.code
    : 'ENVELOPE_SUCCESS';
  const message = typeof req.body?.message === 'string' && req.body.message.trim() !== ''
    ? req.body.message
    : 'Envelope contract success';

  return success(res, {
    code,
    message,
    data: req.body?.data
  });
});

router.post('/_kernel/contracts/envelope/business-refusal', (req: Request, res: Response) => {
  const code = typeof req.body?.code === 'string' && req.body.code.trim() !== ''
    ? req.body.code
    : 'ENVELOPE_BUSINESS_REFUSAL';
  const message = typeof req.body?.message === 'string' && req.body.message.trim() !== ''
    ? req.body.message
    : 'Requested amount exceeds available envelope balance';

  return refusal(res, {
    code,
    message,
    data: req.body?.data
  });
});

router.post('/_kernel/contracts/envelope/system-error', (req: Request, res: Response) => {
  const code = typeof req.body?.code === 'string' && req.body.code.trim() !== ''
    ? req.body.code
    : 'ENVELOPE_SYSTEM_ERROR';
  const message = typeof req.body?.message === 'string' && req.body.message.trim() !== ''
    ? req.body.message
    : 'Unhandled exception while processing envelope contract';
  const httpStatus = typeof req.body?.httpStatus === 'number'
    && Number.isInteger(req.body.httpStatus)
    && req.body.httpStatus >= 500
    ? req.body.httpStatus
    : 500;

  return systemError(res, {
    code,
    message,
    data: req.body?.data,
    httpStatus
  });
});

router.post('/_kernel/security/csrf/guard', (req: Request, res: Response) => {
  const csrfHeader = req.header('x-csrf-token');
  const csrfProof = typeof req.body?.csrfToken === 'string'
    ? req.body.csrfToken.trim()
    : '';

  if (!csrfHeader || csrfHeader.trim() === '' || csrfProof === '') {
    return refusal(res, {
      code: 'CSRF_TOKEN_REQUIRED',
      message: 'State-changing requests require CSRF header and proof token',
      refusalType: 'security',
      httpStatus: 403
    });
  }

  if (csrfHeader.trim() !== csrfProof) {
    return refusal(res, {
      code: 'CSRF_TOKEN_INVALID',
      message: 'CSRF header token does not match request proof token',
      refusalType: 'security',
      httpStatus: 403
    });
  }

  return success(res, {
    code: 'CSRF_TOKEN_VALID',
    message: 'CSRF evidence validated for state-changing request',
    data: {
      action: typeof req.body?.action === 'string' ? req.body.action : 'unspecified'
    }
  });
});

router.post('/_kernel/security/cookies/policy/evaluate', (req: Request, res: Response) => {
  const environment = req.body?.environment as CookiePolicyEnvironment | undefined;
  const appHost = typeof req.body?.appHost === 'string' ? req.body.appHost.trim() : '';
  const apiHost = typeof req.body?.apiHost === 'string' ? req.body.apiHost.trim() : '';

  if (!environment || !['development', 'staging', 'production'].includes(environment)) {
    return refusal(res, {
      code: 'COOKIE_POLICY_ENVIRONMENT_INVALID',
      message: 'environment must be one of development, staging, production',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  if (!appHost || !apiHost) {
    return refusal(res, {
      code: 'COOKIE_POLICY_HOSTS_REQUIRED',
      message: 'appHost and apiHost are required',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const parentDomain = deriveParentDomain(appHost);
  const policy = resolveCookiePolicy(environment);

  const context = resolveEnvelopeContext(req, res);

  const policyPayload = {
    environment,
    parentDomain,
    accessToken: {
      httpOnly: true,
      secure: policy.secure,
      sameSite: policy.sameSite,
      domain: parentDomain
    },
    refreshToken: {
      httpOnly: true,
      secure: policy.secure,
      sameSite: policy.sameSite,
      domain: parentDomain
    }
  };

  const envelope = buildSuccessEnvelope(context, {
    code: 'COOKIE_POLICY_EVALUATED',
    message: 'Cookie policy matrix evaluated for sibling app/api subdomains'
  });

  return res.status(200).json({
    ...envelope,
    policy: policyPayload
  });
});

router.get('/_kernel/context', (req: Request, res: Response) => {
  const tenantHeader = req.header('x-tenant-id');
  if (!tenantHeader || tenantHeader.trim() === '') {
    return refusal(res, {
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'x-tenant-id header is required for kernel context diagnostics',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  return success(res, {
    code: 'KERNEL_CONTEXT_READY',
    message: 'Kernel context resolved',
    data: {
      tenantId: tenantHeader,
      correlationId: req.correlationId || null
    }
  });
});

router.get('/_kernel/middleware-order', (req: Request, res: Response) => {
  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'KERNEL_MIDDLEWARE_ORDER_READY',
    message: 'Kernel middleware order diagnostics generated'
  });

  return res.status(200).json({
    ...envelope,
    middleware: ['correlation', 'tenancy', 'auth-context', 'envelope']
  });
});

router.get('/_kernel/routes', (req: Request, res: Response) => {
  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'KERNEL_ROUTES_READY',
    message: 'Kernel route registry diagnostics generated'
  });

  return res.status(200).json({
    ...envelope,
    modules: [
      'platform',
      'auth',
      'accounts',
      'transactions',
      'categories',
      'goals',
      'budgets',
      'income',
      'debts',
      'assignments',
      'households',
      'recurring-transactions',
      'extra-money',
      'settings',
      'scenarios',
      'tags'
    ]
  });
});

router.get('/time/render-context', (req: Request, res: Response) => {
  const context = resolveTimezoneContext({
    userTimezone: req.header('x-user-timezone'),
    tenantTimezone: req.header('x-tenant-timezone'),
    systemTimezone: req.header('x-system-timezone')
  });

  if (!context) {
    return refusal(res, {
      code: 'TIMEZONE_CONTEXT_UNRESOLVED',
      message: 'Unable to resolve timezone context using fallback order user -> tenant -> system'
    });
  }

  return success(res, {
    code: 'TIMEZONE_CONTEXT_RESOLVED',
    message: 'Timezone context resolved for localized rendering',
    data: context
  });
});

router.post('/time/render-contract', (req: Request, res: Response) => {
  const context = resolveTimezoneContext({
    userTimezone: req.header('x-user-timezone'),
    tenantTimezone: req.header('x-tenant-timezone'),
    systemTimezone: req.header('x-system-timezone')
  });

  if (!context) {
    return refusal(res, {
      code: 'TIMEZONE_CONTEXT_UNRESOLVED',
      message: 'Unable to resolve timezone context using fallback order user -> tenant -> system'
    });
  }

  const utcTimestamp = typeof req.body?.utcTimestamp === 'string' ? req.body.utcTimestamp : '';
  const rendered = formatUtcTimestampForTimezone(utcTimestamp, context.timezone);

  if (!rendered) {
    return refusal(res, {
      code: 'INVALID_UTC_TIMESTAMP',
      message: 'utcTimestamp must be a valid UTC ISO-8601 timestamp'
    });
  }

  return success(res, {
    code: 'TIMEZONE_RENDER_CONTRACT_READY',
    message: 'UTC timestamp converted to localized display value',
    data: {
      rendered,
      timezone: context.timezone,
      timezoneSource: context.timezoneSource,
      purpose: typeof req.body?.purpose === 'string' ? req.body.purpose : 'unspecified'
    }
  });
});

router.get('/operations/feed', (req: Request, res: Response) => {
  const context = resolveTimezoneContext({
    userTimezone: req.header('x-user-timezone'),
    tenantTimezone: req.header('x-tenant-timezone'),
    systemTimezone: req.header('x-system-timezone')
  });

  if (!context) {
    return refusal(res, {
      code: 'TIMEZONE_CONTEXT_UNRESOLVED',
      message: 'Unable to resolve timezone context using fallback order user -> tenant -> system'
    });
  }

  const sourceRows = [
    { id: 'op-001', occurredAtUtc: '2026-02-17T15:30:00.000Z' },
    { id: 'op-002', occurredAtUtc: '2026-02-17T18:45:00.000Z' }
  ];

  const rows: Array<{ id: string; occurredAtLocal: string; timezoneSource: typeof context.timezoneSource }> = [];

  for (const row of sourceRows) {
    const occurredAtLocal = formatUtcTimestampForTimezone(row.occurredAtUtc, context.timezone);

    if (!occurredAtLocal) {
      return refusal(res, {
        code: 'INVALID_UTC_TIMESTAMP',
        message: `Operational row ${row.id} contains an invalid UTC timestamp`
      });
    }

    rows.push({
      id: row.id,
      occurredAtLocal,
      timezoneSource: context.timezoneSource
    });
  }

  return success(res, {
    code: 'OPERATIONS_FEED_READY',
    message: 'Operational feed prepared with localized timestamps',
    data: {
      timezone: context.timezone,
      timezoneSource: context.timezoneSource,
      rows
    }
  });
});

export default router;
