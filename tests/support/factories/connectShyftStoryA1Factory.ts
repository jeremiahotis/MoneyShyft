import { randomUUID } from 'node:crypto';
import { connectShyftFeatureFlagData } from '../../fixtures/test-data';
import { createTenantScopeHeaders } from './tenantRepositoryFactory';

export type ConnectShyftFlags = {
  connectshyft_enabled: boolean;
  connectshyft_inbox_enabled: boolean;
  connectshyft_escalation_enabled: boolean;
  connectshyft_webhooks_enabled: boolean;
};

type StoryA1ContextOverrides = {
  tenantId?: string;
  orgUnitId?: string;
  role?: string;
  userId?: string;
  correlationId?: string;
  csrfToken?: string;
  threadId?: string;
};

type StoryA1HeaderOverrides = {
  role?: string;
  orgUnitId?: string;
  userId?: string;
  correlationId?: string;
  csrfToken?: string;
};

export type StoryA1Context = {
  storyId: 'a-1';
  tenantId: string;
  orgUnitId: string;
  role: string;
  userId: string;
  correlationId: string;
  csrfToken: string;
  threadId: string;
  paths: {
    inbox: string;
    threadEnsure: string;
    threadClaim: string;
    threadTakeover: string;
    webhookSms: string;
    inboxUi: string;
    availabilityUi: string;
  };
};

export const storyA1FlagSets: Record<
  'off' | 'inboxOnly' | 'inboxAndEscalation' | 'allEnabled' | 'inboxDisabled',
  ConnectShyftFlags
> = {
  off: { ...connectShyftFeatureFlagData.flagsOff },
  inboxOnly: { ...connectShyftFeatureFlagData.inboxOnly },
  inboxAndEscalation: { ...connectShyftFeatureFlagData.inboxAndEscalation },
  allEnabled: {
    connectshyft_enabled: true,
    connectshyft_inbox_enabled: true,
    connectshyft_escalation_enabled: true,
    connectshyft_webhooks_enabled: true,
  },
  inboxDisabled: {
    connectshyft_enabled: true,
    connectshyft_inbox_enabled: false,
    connectshyft_escalation_enabled: true,
    connectshyft_webhooks_enabled: true,
  },
};

export function createStoryA1Context(
  overrides: StoryA1ContextOverrides = {},
): StoryA1Context {
  const tenantId = overrides.tenantId ?? connectShyftFeatureFlagData.tenantId;
  const orgUnitId = overrides.orgUnitId ?? connectShyftFeatureFlagData.orgUnitId;

  return {
    storyId: 'a-1',
    tenantId,
    orgUnitId,
    role: overrides.role ?? 'TENANT_ADMIN',
    userId: overrides.userId ?? `story-a1-user-${randomUUID().slice(0, 8)}`,
    correlationId:
      overrides.correlationId ?? `corr-story-a1-${randomUUID().slice(0, 8)}`,
    csrfToken: overrides.csrfToken ?? `csrf-story-a1-${randomUUID().slice(0, 8)}`,
    threadId: overrides.threadId ?? 'thread-a-1001',
    paths: {
      inbox: '/api/v1/connectshyft/inbox',
      threadEnsure: '/api/v1/connectshyft/threads',
      threadClaim: '/api/v1/connectshyft/threads/thread-a-1001/claim',
      threadTakeover: '/api/v1/connectshyft/threads/thread-a-1001/takeover',
      webhookSms: '/api/v1/connectshyft/webhooks/sms',
      inboxUi: '/app/connectshyft/inbox',
      availabilityUi: '/app/connectshyft/settings/availability',
    },
  };
}

export function createStoryA1FlagHeaders(
  context: StoryA1Context,
  flags: ConnectShyftFlags,
  overrides: StoryA1HeaderOverrides = {},
): Record<string, string> {
  const headers = createTenantScopeHeaders({
    tenantId: context.tenantId,
    orgUnitId: overrides.orgUnitId ?? context.orgUnitId,
    role: overrides.role ?? context.role,
    userId: overrides.userId ?? context.userId,
    correlationId: overrides.correlationId ?? context.correlationId,
    csrfToken: overrides.csrfToken ?? context.csrfToken,
  });

  return {
    ...headers,
    'x-test-connectshyft-flags': JSON.stringify(flags),
  };
}
