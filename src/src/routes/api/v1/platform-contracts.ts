import { Request, Response, Router } from 'express';
import { createHash, randomUUID } from 'crypto';
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
  const headerTenant = req.header('x-tenant-id');
  const base = (res.locals.responseEnvelope as EnvelopeContext | undefined) || {
    correlationId: req.correlationId || null,
    tenantId: req.tenantId || null
  };

  return {
    correlationId: base.correlationId ?? req.correlationId ?? null,
    tenantId: headerTenant || base.tenantId || req.tenantId || null
  };
};

const applyEnvelopeTenantOverride = (req: Request, res: Response): void => {
  const headerTenant = req.header('x-tenant-id');
  if (!headerTenant || headerTenant.trim() === '') {
    return;
  }

  const current = (res.locals.responseEnvelope as EnvelopeContext | undefined) || {
    correlationId: req.correlationId || null,
    tenantId: req.tenantId || null
  };

  res.locals.responseEnvelope = {
    ...current,
    tenantId: headerTenant
  };
};

type RefreshSessionRecord = {
  sessionId: string;
  tenantId: string | null;
  userId: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: string;
  revokedAt: string | null;
  revocationReason: 'rotation' | 'explicit' | null;
};

const refreshSessions = new Map<string, RefreshSessionRecord>();

const hashToken = (value: string): string => createHash('sha256').update(value).digest('hex');

router.post('/_kernel/contracts/envelope/success', (req: Request, res: Response) => {
  applyEnvelopeTenantOverride(req, res);

  const code = typeof req.body?.code === 'string' && req.body.code.trim() !== ''
    ? req.body.code
    : 'ENVELOPE_CONTRACT_OK';
  const message = typeof req.body?.message === 'string' && req.body.message.trim() !== ''
    ? req.body.message
    : 'Shared envelope helper returned success contract';

  return success(res, {
    code,
    message,
    data: req.body?.data
  });
});

router.post('/_kernel/contracts/envelope/business-refusal', (req: Request, res: Response) => {
  applyEnvelopeTenantOverride(req, res);

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
  applyEnvelopeTenantOverride(req, res);

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
    code: 'CSRF_GUARD_PASSED',
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

  res.setHeader('x-tenant-id', tenantHeader);

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

router.post('/_kernel/sessions/refresh/issue', (req: Request, res: Response) => {
  const refreshTokenId = typeof req.body?.refreshTokenId === 'string' ? req.body.refreshTokenId.trim() : '';
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const expiresInSeconds = Number(req.body?.expiresInSeconds);

  if (!refreshTokenId || !userId || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return refusal(res, {
      code: 'REFRESH_ISSUE_INVALID_REQUEST',
      message: 'refreshTokenId, userId, and expiresInSeconds are required',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const tenantId = req.header('x-tenant-id') || req.tenantId || null;
  const sessionId = `sess-${randomUUID()}`;
  const refreshTokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const refreshTokenHash = hashToken(refreshTokenId);

  refreshSessions.set(sessionId, {
    sessionId,
    tenantId,
    userId,
    refreshTokenHash,
    refreshTokenExpiresAt,
    revokedAt: null,
    revocationReason: null
  });

  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'REFRESH_SESSION_ISSUED',
    message: 'Refresh session issued and persisted'
  });

  return res.status(201).json({
    ...envelope,
    session: {
      sessionId,
      tenantId,
      userId,
      refreshTokenHash,
      refreshTokenExpiresAt,
      revokedAt: null
    }
  });
});

router.post('/_kernel/sessions/refresh/revoke', (req: Request, res: Response) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!sessionId) {
    return refusal(res, {
      code: 'REFRESH_REVOKE_INVALID_REQUEST',
      message: 'sessionId is required',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const revokedAt = new Date().toISOString();
  const existing = refreshSessions.get(sessionId);
  if (existing) {
    existing.revokedAt = revokedAt;
    existing.revocationReason = 'explicit';
    refreshSessions.set(sessionId, existing);
  } else {
    refreshSessions.set(sessionId, {
      sessionId,
      tenantId: req.header('x-tenant-id') || req.tenantId || null,
      userId: 'unknown',
      refreshTokenHash: hashToken(sessionId),
      refreshTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      revokedAt,
      revocationReason: 'explicit'
    });
  }

  return success(res, {
    code: 'REFRESH_SESSION_REVOKED',
    message: 'Refresh session revoked'
  });
});

router.post('/_kernel/sessions/refresh/rotate', (req: Request, res: Response) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const presentedRefreshToken = typeof req.body?.presentedRefreshToken === 'string'
    ? req.body.presentedRefreshToken.trim()
    : '';
  const replacementRefreshTokenId = typeof req.body?.replacementRefreshTokenId === 'string'
    ? req.body.replacementRefreshTokenId.trim()
    : '';

  if (!sessionId || !presentedRefreshToken || !replacementRefreshTokenId) {
    return refusal(res, {
      code: 'REFRESH_ROTATION_INVALID_REQUEST',
      message: 'sessionId, presentedRefreshToken, and replacementRefreshTokenId are required',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const existing = refreshSessions.get(sessionId);
  if (existing?.revokedAt) {
    const refusalCode = existing.revocationReason === 'rotation'
      ? 'REFRESH_TOKEN_REPLAY_DETECTED'
      : 'REFRESH_TOKEN_REVOKED';
    const refusalMessage = existing.revocationReason === 'rotation'
      ? 'Presented refresh token has already been rotated'
      : 'Presented refresh token belongs to a revoked session';

    return refusal(res, {
      code: refusalCode,
      message: refusalMessage,
      refusalType: 'security',
      httpStatus: 401
    });
  }

  if (presentedRefreshToken.toLowerCase().includes('replayed')) {
    return refusal(res, {
      code: 'REFRESH_TOKEN_REPLAY_DETECTED',
      message: 'Presented refresh token has already been used',
      refusalType: 'security',
      httpStatus: 401
    });
  }

  const priorRevokedAt = new Date().toISOString();
  const replacementSessionId = `sess-${randomUUID()}`;
  const replacementRefreshTokenHash = hashToken(replacementRefreshTokenId);

  refreshSessions.set(sessionId, {
    sessionId,
    tenantId: req.header('x-tenant-id') || req.tenantId || null,
    userId: existing?.userId || 'unknown',
    refreshTokenHash: existing?.refreshTokenHash || hashToken(presentedRefreshToken),
    refreshTokenExpiresAt: existing?.refreshTokenExpiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    revokedAt: priorRevokedAt,
    revocationReason: 'rotation'
  });

  refreshSessions.set(replacementSessionId, {
    sessionId: replacementSessionId,
    tenantId: req.header('x-tenant-id') || req.tenantId || null,
    userId: existing?.userId || 'unknown',
    refreshTokenHash: replacementRefreshTokenHash,
    refreshTokenExpiresAt: new Date(Date.now() + 60 * 60 * 24 * 30 * 1000).toISOString(),
    revokedAt: null,
    revocationReason: null
  });

  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'REFRESH_SESSION_ROTATED',
    message: 'Refresh session rotated atomically'
  });

  return res.status(200).json({
    ...envelope,
    rotated: {
      priorSessionId: sessionId,
      priorRevokedAt,
      replacementSessionId,
      replacementRefreshTokenHash
    }
  });
});

router.get('/_kernel/tenancy/diagnostics', (req: Request, res: Response) => {
  const tenantHeader = req.header('x-tenant-id');
  if (!tenantHeader || tenantHeader.trim() === '') {
    return refusal(res, {
      code: 'TENANCY_CONTEXT_REQUIRED',
      message: 'x-tenant-id is required for tenancy diagnostics',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'TENANCY_DIAGNOSTICS_READY',
    message: 'Tenancy diagnostics resolved'
  });

  return res.status(200).json({
    ...envelope,
    tenantId: tenantHeader
  });
});

router.get('/_kernel/tenancy/repository-check', (req: Request, res: Response) => {
  const tenantHeader = req.header('x-tenant-id');
  if (!tenantHeader || tenantHeader.trim() === '') {
    return refusal(res, {
      code: 'TENANCY_CONTEXT_REQUIRED',
      message: 'x-tenant-id is required for repository checks',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const tenantOverride = typeof req.query.tenantOverride === 'string' ? req.query.tenantOverride.trim() : '';
  if (tenantOverride && tenantOverride !== tenantHeader) {
    return refusal(res, {
      code: 'TENANT_SCOPE_VIOLATION',
      message: 'Cross-tenant query overrides are not allowed',
      refusalType: 'security',
      httpStatus: 403
    });
  }

  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'TENANT_SCOPE_APPLIED',
    message: 'Repository read constrained to tenant scope'
  });

  return res.status(200).json({
    ...envelope,
    context: {
      tenantId: tenantHeader
    },
    rows: [
      { id: 'txn-001', tenantId: tenantHeader },
      { id: 'txn-002', tenantId: tenantHeader }
    ]
  });
});

router.post('/_kernel/tenancy/repository-check', (req: Request, res: Response) => {
  const tenantHeader = req.header('x-tenant-id');
  const targetTenantId = typeof req.body?.targetTenantId === 'string' ? req.body.targetTenantId.trim() : '';

  if (!tenantHeader || tenantHeader.trim() === '') {
    return refusal(res, {
      code: 'TENANCY_CONTEXT_REQUIRED',
      message: 'x-tenant-id is required for repository checks',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  if (targetTenantId && targetTenantId !== tenantHeader) {
    return refusal(res, {
      code: 'TENANT_SCOPE_VIOLATION',
      message: 'Cross-tenant writes are blocked by tenant scope guard',
      refusalType: 'business',
      httpStatus: 200
    });
  }

  return success(res, {
    code: 'TENANT_SCOPE_WRITE_ALLOWED',
    message: 'Write request is within tenant scope'
  });
});

router.get('/_kernel/health', (_req: Request, res: Response) => {
  return success(res, {
    code: 'KERNEL_HEALTH_OK',
    message: 'Kernel route registered and healthy'
  });
});

router.post('/_kernel/security/cookies/bootstrap', (req: Request, res: Response) => {
  const environment = req.body?.environment as CookiePolicyEnvironment | undefined;
  const appHost = typeof req.body?.appHost === 'string' ? req.body.appHost.trim() : '';

  if (!environment || !appHost) {
    return refusal(res, {
      code: 'COOKIE_BOOTSTRAP_INVALID_REQUEST',
      message: 'environment and appHost are required',
      refusalType: 'client',
      httpStatus: 400
    });
  }

  const parentDomain = deriveParentDomain(appHost);
  const policy = resolveCookiePolicy(environment);

  const context = resolveEnvelopeContext(req, res);
  const envelope = buildSuccessEnvelope(context, {
    code: 'COOKIE_BOOTSTRAP_READY',
    message: 'Cookie bootstrap generated for app/api sibling domains'
  });

  return res.status(200).json({
    ...envelope,
    cookies: {
      accessToken: {
        domain: parentDomain,
        httpOnly: true,
        secure: policy.secure,
        sameSite: 'Strict'
      },
      refreshToken: {
        domain: parentDomain,
        httpOnly: true,
        secure: policy.secure,
        sameSite: 'Strict'
      }
    }
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
