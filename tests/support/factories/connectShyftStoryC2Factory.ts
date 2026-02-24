import { randomUUID } from 'node:crypto';
import { createTenantScopeHeaders } from './tenantRepositoryFactory';

export type ConnectShyftFlags = {
  connectshyft_enabled: boolean;
  connectshyft_inbox_enabled: boolean;
  connectshyft_escalation_enabled: boolean;
  connectshyft_webhooks_enabled: boolean;
};

type StoryC2ContextOverrides = {
  tenantId?: string;
  orgUnitId?: string;
  neighborId?: string;
  role?: string;
  userId?: string;
  correlationId?: string;
  csrfToken?: string;
};

type StoryC2HeaderOverrides = {
  tenantId?: string;
  orgUnitId?: string | null;
  role?: string;
  userId?: string;
  correlationId?: string;
  csrfToken?: string;
  flags?: ConnectShyftFlags;
  orgUnitMemberships?: string[];
};

export type StoryC2Context = {
  storyId: 'c-2';
  tenantId: string;
  orgUnitId: string;
  neighborId: string;
  role: string;
  userId: string;
  secondaryActorUserId: string;
  unauthorizedActorUserId: string;
  correlationId: string;
  csrfToken: string;
  inboundCsNumberId: string;
  preferredOutboundCsNumberId: string;
  flags: ConnectShyftFlags;
  refusalCodes: {
    invalidContext: string;
    unauthorized: string;
  };
  paths: {
    threadsCollection: string;
    inboxUi: string;
    threadDetailUi: string;
  };
};

const DEFAULT_FLAGS: ConnectShyftFlags = {
  connectshyft_enabled: true,
  connectshyft_inbox_enabled: true,
  connectshyft_escalation_enabled: true,
  connectshyft_webhooks_enabled: true,
};

export function createStoryC2Context(
  overrides: StoryC2ContextOverrides = {},
): StoryC2Context {
  return {
    storyId: 'c-2',
    tenantId: overrides.tenantId ?? 'tenant-connectshyft-c2',
    orgUnitId: overrides.orgUnitId ?? 'org-connectshyft-c2-east',
    neighborId: overrides.neighborId ?? 'neighbor-connectshyft-c2-1001',
    role: overrides.role ?? 'ORGUNIT_MEMBER',
    userId: overrides.userId ?? 'user-connectshyft-c2-operator-primary',
    secondaryActorUserId: 'user-connectshyft-c2-operator-secondary',
    unauthorizedActorUserId: 'user-connectshyft-c2-tenant-viewer',
    correlationId:
      overrides.correlationId ?? `corr-story-c2-${randomUUID().slice(0, 8)}`,
    csrfToken:
      overrides.csrfToken ?? `csrf-story-c2-${randomUUID().slice(0, 8)}`,
    inboundCsNumberId: 'cs-inbound-c2-001',
    preferredOutboundCsNumberId: 'cs-outbound-c2-001',
    flags: { ...DEFAULT_FLAGS },
    refusalCodes: {
      invalidContext: 'CONNECTSHYFT_CONTEXT_INVALID',
      unauthorized: 'CONNECTSHYFT_THREAD_ENSURE_FORBIDDEN',
    },
    paths: {
      threadsCollection: '/api/v1/connectshyft/threads',
      inboxUi: '/app/connectshyft/inbox',
      threadDetailUi: '/app/connectshyft/threads',
    },
  };
}

export function createStoryC2Headers(
  context: StoryC2Context,
  overrides: StoryC2HeaderOverrides = {},
): Record<string, string> {
  const headers = createTenantScopeHeaders({
    tenantId: overrides.tenantId ?? context.tenantId,
    orgUnitId: overrides.orgUnitId === undefined ? context.orgUnitId : overrides.orgUnitId,
    role: overrides.role ?? context.role,
    userId: overrides.userId ?? context.userId,
    correlationId: overrides.correlationId ?? context.correlationId,
    csrfToken: overrides.csrfToken ?? context.csrfToken,
  });

  const resolvedHeaders: Record<string, string> = {
    ...headers,
    'x-test-connectshyft-flags': JSON.stringify(overrides.flags ?? context.flags),
  };

  if (overrides.orgUnitMemberships) {
    resolvedHeaders['x-test-connectshyft-orgunit-memberships'] = JSON.stringify(
      overrides.orgUnitMemberships,
    );
  }

  return resolvedHeaders;
}
