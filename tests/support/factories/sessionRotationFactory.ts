import { randomUUID } from 'node:crypto';

type SessionHeaderOverrides = {
  tenantId?: string;
  correlationId?: string;
  csrfToken?: string;
  authToken?: string;
};

type RefreshIssuePayloadOverrides = {
  userId?: string;
  sessionFingerprint?: string;
  refreshTokenId?: string;
  expiresInSeconds?: number;
};

type RefreshRotatePayloadOverrides = {
  sessionId?: string;
  presentedRefreshToken?: string;
  replacementRefreshTokenId?: string;
};

type RefreshRevokePayloadOverrides = {
  sessionId?: string;
  reason?: 'logout' | 'rotation' | 'replay-detected' | 'admin-revoke';
};

export function createSessionHeaders(overrides: SessionHeaderOverrides = {}): Record<string, string> {
  const tenantId = overrides.tenantId ?? `tenant-${randomUUID()}`;
  const correlationId = overrides.correlationId ?? `corr-${randomUUID()}`;
  const csrfToken = overrides.csrfToken ?? `csrf-${randomUUID()}`;
  const authToken = overrides.authToken ?? `access-${randomUUID()}`;

  return {
    'x-tenant-id': tenantId,
    'x-correlation-id': correlationId,
    'x-csrf-token': csrfToken,
    authorization: `Bearer ${authToken}`,
  };
}

export function createRefreshIssuePayload(
  overrides: RefreshIssuePayloadOverrides = {},
): Record<string, string | number> {
  return {
    userId: overrides.userId ?? `user-${randomUUID()}`,
    sessionFingerprint: overrides.sessionFingerprint ?? `fp-${randomUUID()}`,
    refreshTokenId: overrides.refreshTokenId ?? `rt-${randomUUID()}`,
    expiresInSeconds: overrides.expiresInSeconds ?? 60 * 60 * 24 * 30,
  };
}

export function createRefreshRotatePayload(
  overrides: RefreshRotatePayloadOverrides = {},
): Record<string, string> {
  return {
    sessionId: overrides.sessionId ?? `sess-${randomUUID()}`,
    presentedRefreshToken: overrides.presentedRefreshToken ?? `refresh-${randomUUID()}`,
    replacementRefreshTokenId: overrides.replacementRefreshTokenId ?? `rt-next-${randomUUID()}`,
  };
}

export function createRefreshRevokePayload(
  overrides: RefreshRevokePayloadOverrides = {},
): Record<string, string> {
  return {
    sessionId: overrides.sessionId ?? `sess-${randomUUID()}`,
    reason: overrides.reason ?? 'replay-detected',
  };
}
