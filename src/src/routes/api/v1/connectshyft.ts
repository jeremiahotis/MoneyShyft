import { Request, Response, Router } from 'express';
import type { Knex } from 'knex';
import { refusal, success } from '../../../platform/envelopes/response';
import { CAPABILITIES, hasCapability } from '../../../platform/rbac/capabilities';
import {
  evaluateConnectShyftCapability,
  isConnectShyftTestOverrideEnabled,
  mergeConnectShyftFlagsWithEntitlement,
  resolveConnectShyftFeatureFlags,
  type ConnectShyftCapability,
  type ConnectShyftFeatureFlags,
} from '../../../modules/connectshyft/featureFlags';
import { resolveConnectShyftOrgUnitContext } from '../../../modules/connectshyft/contextAccess';
import { connectShyftNumberMappingServiceAsync } from '../../../modules/connectshyft/numberMappings';
import {
  connectShyftNeighborServiceAsync,
  type ConnectShyftNeighborPhoneInput,
} from '../../../modules/connectshyft/neighbors';
import {
  connectShyftThreadServiceAsync,
} from '../../../modules/connectshyft/threads';
import {
  ConnectShyftEscalationConfigService,
  KnexConnectShyftEscalationConfigStore,
  connectShyftEscalationRecipientScopes,
  createEscalationRecipientDirectory,
  type ConnectShyftEscalationRecipientDirectory,
  type ConnectShyftEscalationRecipientOption,
} from '../../../modules/connectshyft/escalationConfig';
import {
  createKnexOrgUnitAccessStore,
  validateOrgUnitScopedAccess,
} from '../../../platform/tenancy/orgUnitAccess';
import {
  evaluateActorTenantModuleEntitlement,
  type PlatformAdminActorContext,
} from '../../../services/PlatformAdminService';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_ACTIVE_THREAD_NEIGHBOR_IDS_HEADER = 'x-test-connectshyft-active-thread-neighbor-ids';
const TEST_USER_ID_HEADER = 'x-test-connectshyft-user-id';
const NEIGHBOR_RELATIONSHIP_REQUIRED_CODE = 'CONNECTSHYFT_NEIGHBOR_EDIT_RELATIONSHIP_REQUIRED';
const NEIGHBOR_RELATIONSHIP_REQUIRED_MESSAGE = 'This edit requires an active thread relationship or tenant-privileged role.';
const TENANT_PRIVILEGED_OVERRIDE_NOTICE = 'Tenant-privileged override applied';
const RELATIONSHIP_POLICY_INDICATOR = 'Active thread relationship';

const loadPlatformDb = (): Knex => {
  const knexModule = require('../../../config/knex') as { default: Knex };
  return knexModule.default;
};

const connectShyftEscalationConfigService = new ConnectShyftEscalationConfigService(
  new KnexConnectShyftEscalationConfigStore(loadPlatformDb),
);

const actorFromRequest = (req: Request): PlatformAdminActorContext => ({
  userId: req.user?.userId || null,
  baseRole: req.user?.role || null,
  headerRoles: [],
  activeTenantId: req.user?.activeTenantId || req.user?.householdId || null,
});

const resolveTenantIdFromRequest = (req: Request): string | null => {
  return req.user?.activeTenantId || req.user?.householdId || null;
};

const shouldBypassTestHarnessEntitlementLookup = (tenantId: string): boolean => {
  return isConnectShyftTestOverrideEnabled() && !UUID_PATTERN.test(tenantId);
};

const resolveEntitlementAwareConnectShyftFlags = async (
  req: Request,
): Promise<{ flags: ConnectShyftFeatureFlags; entitlementDecision: Awaited<ReturnType<typeof evaluateActorTenantModuleEntitlement>> | null }> => {
  const resolvedFlags = resolveConnectShyftFeatureFlags(req);
  const tenantId = resolveTenantIdFromRequest(req);
  if (!tenantId) {
    return {
      flags: resolvedFlags,
      entitlementDecision: null,
    };
  }

  if (shouldBypassTestHarnessEntitlementLookup(tenantId)) {
    return {
      flags: resolvedFlags,
      entitlementDecision: null,
    };
  }

  const entitlementDecision = await evaluateActorTenantModuleEntitlement(
    loadPlatformDb(),
    actorFromRequest(req),
    tenantId,
    'connectshyft',
  );

  return {
    flags: mergeConnectShyftFlagsWithEntitlement(resolvedFlags, {
      moduleEnabled: entitlementDecision.enabled,
    }),
    entitlementDecision,
  };
};

const enforceCapability = async (
  req: Request,
  res: Response,
  capability: ConnectShyftCapability,
): Promise<ConnectShyftFeatureFlags | null> => {
  const { flags, entitlementDecision } = await resolveEntitlementAwareConnectShyftFlags(req);
  const evaluation = evaluateConnectShyftCapability(flags, capability);
  if (evaluation.ok) {
    return flags;
  }

  const moduleDeniedByEntitlement =
    evaluation.code === 'CONNECTSHYFT_MODULE_DISABLED'
    && entitlementDecision
    && !entitlementDecision.enabled;

  refusal(res, {
    code: moduleDeniedByEntitlement ? entitlementDecision.refusalCode : evaluation.code,
    message: moduleDeniedByEntitlement ? entitlementDecision.message : evaluation.message,
    refusalType: evaluation.refusalType,
    httpStatus: 200,
    data: moduleDeniedByEntitlement
      ? {
        moduleKey: entitlementDecision.moduleKey,
        tenantId: entitlementDecision.tenantId,
        reason: entitlementDecision.reason,
      }
      : undefined,
  });
  return null;
};

const enforceOrgUnitContext = async (
  req: Request,
  res: Response,
  attemptedOrgUnitId?: string | null,
) => {
  const decision = await resolveConnectShyftOrgUnitContext(req, {
    attemptedOrgUnitId,
    resolveOrgUnitAccess: async ({ tenantId, orgUnitId, userId, baseRoles }) =>
      validateOrgUnitScopedAccess(
        createKnexOrgUnitAccessStore(loadPlatformDb()),
        {
          tenantId,
          orgUnitId,
          userId,
          baseRoles,
        },
      ),
  });

  if (decision.ok) {
    return decision.context;
  }

  refusal(res, {
    code: decision.code,
    message: decision.message,
    refusalType: decision.refusalType,
    httpStatus: decision.httpStatus,
  });
  return null;
};

const resolveConnectShyftRequestedRole = (req: Request): string | null => {
  if (isConnectShyftTestOverrideEnabled()) {
    const testOverrideRole = req.header('x-test-connectshyft-role');
    if (typeof testOverrideRole === 'string' && testOverrideRole.trim().length > 0) {
      return testOverrideRole.trim();
    }
  }

  return req.user?.role || null;
};

const resolveConnectShyftRequestedActorUserId = (req: Request): string | null => {
  if (isConnectShyftTestOverrideEnabled()) {
    const testOverrideUserId = req.header(TEST_USER_ID_HEADER);
    if (typeof testOverrideUserId === 'string' && testOverrideUserId.trim().length > 0) {
      return testOverrideUserId.trim();
    }
  }

  return req.user?.userId || null;
};

const resolveConnectShyftActiveThreadNeighborIds = (req: Request): Set<string> => {
  if (!isConnectShyftTestOverrideEnabled()) {
    return new Set<string>();
  }

  const rawHeader = req.header(TEST_ACTIVE_THREAD_NEIGHBOR_IDS_HEADER);
  if (!rawHeader) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(rawHeader);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    const normalizedIds = parsed
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);

    return new Set(normalizedIds);
  } catch (_error) {
    const normalizedIds = rawHeader
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return new Set(normalizedIds);
  }
};

type ConnectShyftNeighborEditPolicyPath =
  | 'relationship-gated'
  | 'tenant-privileged'
  | 'role-capability';

type ConnectShyftNeighborEditPolicyDecision =
  | {
    ok: true;
    policyPath: ConnectShyftNeighborEditPolicyPath;
    indicator: string | null;
    contextOverrideNotice: string | null;
  }
  | {
    ok: false;
    code: typeof NEIGHBOR_RELATIONSHIP_REQUIRED_CODE;
    message: typeof NEIGHBOR_RELATIONSHIP_REQUIRED_MESSAGE;
    refusalType: 'business';
    httpStatus: 200;
  };

const evaluateNeighborEditPolicy = (
  req: Request,
  requestedRole: string | null,
  neighborId: string,
): ConnectShyftNeighborEditPolicyDecision => {
  if (hasCapability([requestedRole], CAPABILITIES.NEIGHBOR_EDIT_ALL)) {
    return {
      ok: true,
      policyPath: 'tenant-privileged',
      indicator: null,
      contextOverrideNotice: TENANT_PRIVILEGED_OVERRIDE_NOTICE,
    };
  }

  const normalizedRole = (requestedRole || '').trim().toUpperCase();
  if (normalizedRole === 'ORGUNIT_IDENTITY_LEAD') {
    const activeThreadNeighborIds = resolveConnectShyftActiveThreadNeighborIds(req);
    if (!activeThreadNeighborIds.has(neighborId)) {
      return {
        ok: false,
        code: NEIGHBOR_RELATIONSHIP_REQUIRED_CODE,
        message: NEIGHBOR_RELATIONSHIP_REQUIRED_MESSAGE,
        refusalType: 'business',
        httpStatus: 200,
      };
    }

    return {
      ok: true,
      policyPath: 'relationship-gated',
      indicator: RELATIONSHIP_POLICY_INDICATOR,
      contextOverrideNotice: null,
    };
  }

  return {
    ok: true,
    policyPath: 'role-capability',
    indicator: null,
    contextOverrideNotice: null,
  };
};

const enforceNumberMappingManageCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (hasCapability([requestedRole], CAPABILITIES.NUMBER_MAPPING_MANAGE)) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_NUMBER_MAPPING_FORBIDDEN',
    message: 'Number mapping management requires an authorized ConnectShyft role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceNeighborCreateCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_NEIGHBOR_EDIT_RELATED)
    || hasCapability([requestedRole], CAPABILITIES.NEIGHBOR_EDIT_ALL)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_NEIGHBOR_CREATE_FORBIDDEN',
    message: 'Neighbor creation requires an authorized ConnectShyft role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceNeighborReadCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_NEIGHBOR_EDIT_RELATED)
    || hasCapability([requestedRole], CAPABILITIES.NEIGHBOR_EDIT_ALL)
    || hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_THREAD_VIEW)
    || hasCapability([requestedRole], CAPABILITIES.THREAD_VIEW_ALL)
    || hasCapability([requestedRole], CAPABILITIES.TENANT_READ_ALL)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_NEIGHBOR_READ_FORBIDDEN',
    message: 'Neighbor profile access requires an authorized ConnectShyft role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceNeighborUpdateCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_NEIGHBOR_EDIT_RELATED)
    || hasCapability([requestedRole], CAPABILITIES.NEIGHBOR_EDIT_ALL)
    || hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_IDENTITY_RESOLVE)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_NEIGHBOR_UPDATE_FORBIDDEN',
    message: 'Neighbor profile updates require an authorized ConnectShyft role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceEscalationConfigCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_ESCALATION_CONFIG)) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_ESCALATION_CONFIG_FORBIDDEN',
    message: 'Escalation configuration requires an authorized orgUnit role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceThreadViewCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_THREAD_VIEW)
    || hasCapability([requestedRole], CAPABILITIES.THREAD_VIEW_ALL)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_THREAD_VIEW_FORBIDDEN',
    message: 'Thread access requires an authorized ConnectShyft role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceThreadEnsureCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  const normalizedRole = normalizeNonEmptyString(requestedRole)?.toUpperCase() || '';
  if (normalizedRole === 'TENANT_VIEWER') {
    refusal(res, {
      code: 'CONNECTSHYFT_THREAD_ENSURE_FORBIDDEN',
      message: 'Thread ensure requires an authorized ConnectShyft role.',
      refusalType: 'business',
      httpStatus: 200,
    });
    return false;
  }

  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_THREAD_VIEW)
    || hasCapability([requestedRole], CAPABILITIES.THREAD_VIEW_ALL)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_THREAD_ENSURE_FORBIDDEN',
    message: 'Thread ensure requires an authorized ConnectShyft role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceEscalationActionMembership = (
  req: Request,
  res: Response,
  bypassedOrgUnitMembership: boolean,
): boolean => {
  if (!bypassedOrgUnitMembership) {
    return true;
  }

  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (hasCapability([requestedRole], CAPABILITIES.THREAD_TAKEOVER_ALL)) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_ORGUNIT_MEMBERSHIP_REQUIRED',
    message: 'orgUnit membership is required for this ConnectShyft route',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceThreadClaimCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_THREAD_CLAIM)
    || hasCapability([requestedRole], CAPABILITIES.THREAD_TAKEOVER_ALL)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_THREAD_CLAIM_FORBIDDEN',
    message: 'Thread claim requires an authorized orgUnit role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const enforceThreadTakeoverCapability = (
  req: Request,
  res: Response,
): boolean => {
  const requestedRole = resolveConnectShyftRequestedRole(req);
  if (
    hasCapability([requestedRole], CAPABILITIES.ORG_UNIT_THREAD_TAKEOVER)
    || hasCapability([requestedRole], CAPABILITIES.THREAD_TAKEOVER_ALL)
  ) {
    return true;
  }

  refusal(res, {
    code: 'CONNECTSHYFT_THREAD_TAKEOVER_FORBIDDEN',
    message: 'Thread takeover requires an authorized orgUnit role.',
    refusalType: 'business',
    httpStatus: 200,
  });
  return false;
};

const parseOrgUnitIdFromBody = (req: Request): string | null => {
  if (typeof req.body?.orgUnitId !== 'string') {
    return null;
  }

  const normalized = req.body.orgUnitId.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseThreadEnsureBody = (req: Request) => ({
  orgUnitId: parseOrgUnitIdFromBody(req),
  threadId: typeof req.body?.threadId === 'string'
    ? req.body.threadId.trim()
    : '',
  neighborId: typeof req.body?.neighborId === 'string'
    ? req.body.neighborId.trim()
    : '',
  source: typeof req.body?.source === 'string'
    ? req.body.source.trim()
    : '',
  lastInboundCsNumberId: typeof req.body?.lastInboundCsNumberId === 'string'
    ? req.body.lastInboundCsNumberId.trim()
    : '',
  preferredOutboundCsNumberId: typeof req.body?.preferredOutboundCsNumberId === 'string'
    ? req.body.preferredOutboundCsNumberId.trim()
    : '',
});

const parseMappingBody = (req: Request) => ({
  twilioNumberE164: typeof req.body?.twilioNumberE164 === 'string' ? req.body.twilioNumberE164 : '',
  label: typeof req.body?.label === 'string' ? req.body.label : '',
  isActive: req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
});

const parseNeighborPhones = (req: Request): ConnectShyftNeighborPhoneInput[] => {
  const rawPhones: unknown[] = Array.isArray(req.body?.phones) ? req.body.phones : [];
  return rawPhones.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') {
      return {
        label: '',
        value: '',
        isShared: false,
        verificationStatus: 'unverified',
      };
    }

    const candidate = entry as {
      label?: unknown;
      value?: unknown;
      isShared?: unknown;
      verificationStatus?: unknown;
    };
    return {
      label: typeof candidate.label === 'string' ? candidate.label : '',
      value: typeof candidate.value === 'string' ? candidate.value : '',
      isShared: candidate.isShared === true,
      verificationStatus: candidate.verificationStatus === 'verified'
        ? 'verified'
        : 'unverified',
    };
  });
};

const parseNeighborCreateBody = (req: Request) => {
  return {
    orgUnitId: parseOrgUnitIdFromBody(req),
    firstName: typeof req.body?.firstName === 'string' ? req.body.firstName : '',
    lastName: typeof req.body?.lastName === 'string' ? req.body.lastName : '',
    phones: parseNeighborPhones(req),
  };
};

const parseNeighborUpdateBody = (req: Request) => ({
  orgUnitId: parseOrgUnitIdFromBody(req),
  firstName: typeof req.body?.firstName === 'string' ? req.body.firstName : '',
  lastName: typeof req.body?.lastName === 'string' ? req.body.lastName : '',
  phones: parseNeighborPhones(req),
});

const parseNeighborIdParam = (req: Request): string => {
  if (typeof req.params.neighborId !== 'string') {
    return '';
  }

  return req.params.neighborId.trim();
};

const buildNeighborScopePayload = (context: { tenantId: string; orgUnitId: string }) => ({
  scope: {
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
  },
});

const buildNeighborRefusalData = (
  createdOrUpdated:
    | {
      data?: {
        fieldErrors?: Array<{ field: string; reason: string; message: string }>;
      };
    }
    | undefined,
  context: { tenantId: string; orgUnitId: string },
) => ({
  ...('data' in (createdOrUpdated || {}) ? createdOrUpdated?.data : undefined),
  ...buildNeighborScopePayload(context),
});

const buildNeighborEditPolicyPayload = (
  policy: Extract<ConnectShyftNeighborEditPolicyDecision, { ok: true }>,
) => ({
  editPolicy: {
    path: policy.policyPath,
    indicator: policy.indicator,
  },
  contextOverrideNotice: policy.contextOverrideNotice,
});

const buildNeighborEditProvenancePayload = (
  context: { tenantId: string; orgUnitId: string },
  policy: Extract<ConnectShyftNeighborEditPolicyDecision, { ok: true }>,
  neighborId: string,
  actorUserId: string | null,
) => {
  const resolvedActorUserId = actorUserId || 'unknown';
  const metadata = {
    tenant_id: context.tenantId,
    org_unit_id: context.orgUnitId,
    actor_user_id: resolvedActorUserId,
    policy_path: policy.policyPath,
    mutation_context: {
      policy_path: policy.policyPath,
      neighbor_id: neighborId,
    },
  };

  return {
    audit: {
      eventName: 'connectshyft.neighbor.updated',
      metadata,
    },
    outbox: {
      eventName: 'connectshyft.neighbor.updated',
      metadata: {
        tenant_id: context.tenantId,
        org_unit_id: context.orgUnitId,
        actor_user_id: resolvedActorUserId,
        policy_path: policy.policyPath,
      },
    },
  };
};

const parseEscalationConfigBody = (req: Request) => ({
  escalationBaselineHours: req.body?.escalationBaselineHours,
  recipients: req.body?.recipients,
});

const TEST_RECIPIENT_DIRECTORY_HEADER = 'x-test-connectshyft-recipient-directory';

const normalizeNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseScopedRecipientEntries = (
  rawEntries: unknown,
  scope: ConnectShyftEscalationRecipientOption['scope'],
): {
  recipientIds: string[];
  options: ConnectShyftEscalationRecipientOption[];
} => {
  if (!Array.isArray(rawEntries)) {
    return {
      recipientIds: [],
      options: [],
    };
  }

  const recipientIds: string[] = [];
  const options: ConnectShyftEscalationRecipientOption[] = [];

  rawEntries.forEach((entry) => {
    if (typeof entry === 'string') {
      const userId = normalizeNonEmptyString(entry);
      if (!userId) {
        return;
      }

      recipientIds.push(userId);
      options.push({
        value: userId,
        label: userId,
        scope,
      });
      return;
    }

    if (!entry || typeof entry !== 'object') {
      return;
    }

    const candidate = entry as {
      userId?: unknown;
      label?: unknown;
    };

    const userId = normalizeNonEmptyString(candidate.userId);
    if (!userId) {
      return;
    }

    const label = normalizeNonEmptyString(candidate.label) || userId;
    recipientIds.push(userId);
    options.push({
      value: userId,
      label,
      scope,
    });
  });

  return {
    recipientIds,
    options,
  };
};

const parseRecipientOptions = (
  rawOptions: unknown,
): ConnectShyftEscalationRecipientOption[] => {
  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const candidate = entry as {
        value?: unknown;
        label?: unknown;
        scope?: unknown;
      };

      const value = normalizeNonEmptyString(candidate.value);
      if (!value) {
        return null;
      }

      const label = normalizeNonEmptyString(candidate.label) || value;
      const scope = normalizeNonEmptyString(candidate.scope)
        || connectShyftEscalationRecipientScopes.TEST_ONLY;

      return {
        value,
        label,
        scope,
      } as ConnectShyftEscalationRecipientOption;
    })
    .filter((entry): entry is ConnectShyftEscalationRecipientOption => entry !== null);
};

const buildDefaultTestRecipientDirectory = (): ConnectShyftEscalationRecipientDirectory =>
  createEscalationRecipientDirectory({
    orgUnitRecipientIds: [
      'user-connectshyft-a4-primary-recipient',
      'user-connectshyft-a4-secondary-recipient',
      'user-connectshyft-a5-orgunit-admin',
      'user-connectshyft-a5-orgunit-member',
    ],
    tenantRecipientIds: [
      'user-connectshyft-a4-primary-recipient',
      'user-connectshyft-a4-secondary-recipient',
      'user-connectshyft-a4-tenant-staff-recipient',
      'user-connectshyft-a5-orgunit-admin',
      'user-connectshyft-a5-orgunit-member',
      'user-connectshyft-a5-tenant-staff',
    ],
    options: [
      {
        value: 'user-connectshyft-a4-primary-recipient',
        label: 'Primary OrgUnit Admin',
        scope: connectShyftEscalationRecipientScopes.ORG_UNIT,
      },
      {
        value: 'user-connectshyft-a4-secondary-recipient',
        label: 'Secondary OrgUnit Admin',
        scope: connectShyftEscalationRecipientScopes.ORG_UNIT,
      },
      {
        value: 'user-connectshyft-a4-tenant-staff-recipient',
        label: 'Tenant Staff Recipient',
        scope: connectShyftEscalationRecipientScopes.TENANT,
      },
      {
        value: 'user-connectshyft-a5-orgunit-admin',
        label: 'A5 OrgUnit Admin',
        scope: connectShyftEscalationRecipientScopes.ORG_UNIT,
      },
      {
        value: 'user-connectshyft-a5-orgunit-member',
        label: 'A5 OrgUnit Member',
        scope: connectShyftEscalationRecipientScopes.ORG_UNIT,
      },
      {
        value: 'user-connectshyft-a5-tenant-staff',
        label: 'A5 Tenant Staff',
        scope: connectShyftEscalationRecipientScopes.TENANT,
      },
      {
        value: 'user-connectshyft-a4-cross-tenant-recipient',
        label: 'Cross-tenant recipient (invalid test option)',
        scope: connectShyftEscalationRecipientScopes.TEST_ONLY,
      },
    ],
  });

const resolveEscalationRecipientDirectoryFromHeader = (
  req: Request,
): ConnectShyftEscalationRecipientDirectory | null => {
  if (!isConnectShyftTestOverrideEnabled()) {
    return null;
  }

  const rawHeader = req.header(TEST_RECIPIENT_DIRECTORY_HEADER);
  if (!rawHeader) {
    return buildDefaultTestRecipientDirectory();
  }

  try {
    const parsed = JSON.parse(rawHeader) as {
      orgUnitRecipients?: unknown;
      tenantRecipients?: unknown;
      options?: unknown;
    };

    const orgUnitRecipients = parseScopedRecipientEntries(
      parsed.orgUnitRecipients,
      connectShyftEscalationRecipientScopes.ORG_UNIT,
    );
    const tenantRecipients = parseScopedRecipientEntries(
      parsed.tenantRecipients,
      connectShyftEscalationRecipientScopes.TENANT,
    );

    const options = [
      ...orgUnitRecipients.options,
      ...tenantRecipients.options,
      ...parseRecipientOptions(parsed.options),
    ];

    return createEscalationRecipientDirectory({
      orgUnitRecipientIds: orgUnitRecipients.recipientIds,
      tenantRecipientIds: [
        ...tenantRecipients.recipientIds,
        ...orgUnitRecipients.recipientIds,
      ],
      options,
    });
  } catch (_error) {
    return buildDefaultTestRecipientDirectory();
  }
};

const buildRecipientLabel = (
  userId: string,
  firstName: unknown,
  lastName: unknown,
): string => {
  const first = typeof firstName === 'string' ? firstName.trim() : '';
  const last = typeof lastName === 'string' ? lastName.trim() : '';
  const fullName = `${first} ${last}`.trim();
  return fullName.length > 0 ? fullName : userId;
};

const buildDatabaseRecipientDirectory = async (
  tenantId: string,
  orgUnitId: string,
): Promise<ConnectShyftEscalationRecipientDirectory> => {
  if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(orgUnitId)) {
    return createEscalationRecipientDirectory({
      orgUnitRecipientIds: [],
      tenantRecipientIds: [],
      options: [],
    });
  }

  const db = loadPlatformDb();

  const tenantRows = await db('platform.tenant_memberships as tm')
    .leftJoin('users as u', 'u.id', 'tm.user_id')
    .where('tm.tenant_id', tenantId)
    .select('tm.user_id as userId', 'u.first_name as firstName', 'u.last_name as lastName');

  const orgUnitRows = await db('platform.org_unit_memberships as om')
    .join('platform.org_units as ou', 'ou.id', 'om.org_unit_id')
    .leftJoin('users as u', 'u.id', 'om.user_id')
    .where('om.org_unit_id', orgUnitId)
    .andWhere('ou.tenant_id', tenantId)
    .select('om.user_id as userId', 'u.first_name as firstName', 'u.last_name as lastName');

  const orgUnitRecipientIds: string[] = [];
  const orgUnitOptions: ConnectShyftEscalationRecipientOption[] = [];
  orgUnitRows.forEach((row) => {
    const userId = normalizeNonEmptyString((row as { userId?: unknown }).userId);
    if (!userId) {
      return;
    }

    orgUnitRecipientIds.push(userId);
    orgUnitOptions.push({
      value: userId,
      label: buildRecipientLabel(
        userId,
        (row as { firstName?: unknown }).firstName,
        (row as { lastName?: unknown }).lastName,
      ),
      scope: connectShyftEscalationRecipientScopes.ORG_UNIT,
    });
  });

  const tenantRecipientIds: string[] = [];
  const tenantOptions: ConnectShyftEscalationRecipientOption[] = [];
  tenantRows.forEach((row) => {
    const userId = normalizeNonEmptyString((row as { userId?: unknown }).userId);
    if (!userId) {
      return;
    }

    tenantRecipientIds.push(userId);
    tenantOptions.push({
      value: userId,
      label: buildRecipientLabel(
        userId,
        (row as { firstName?: unknown }).firstName,
        (row as { lastName?: unknown }).lastName,
      ),
      scope: connectShyftEscalationRecipientScopes.TENANT,
    });
  });

  const directory = createEscalationRecipientDirectory({
    orgUnitRecipientIds,
    tenantRecipientIds,
    options: [...orgUnitOptions, ...tenantOptions],
  });

  directory.options.sort((a, b) => {
    if (a.label < b.label) {
      return -1;
    }
    if (a.label > b.label) {
      return 1;
    }
    return a.value.localeCompare(b.value);
  });

  return directory;
};

const resolveEscalationRecipientDirectory = async (
  req: Request,
  tenantId: string,
  orgUnitId: string,
): Promise<ConnectShyftEscalationRecipientDirectory> => {
  const testDirectory = resolveEscalationRecipientDirectoryFromHeader(req);
  if (testDirectory) {
    return testDirectory;
  }

  return buildDatabaseRecipientDirectory(tenantId, orgUnitId);
};

router.get('/availability', async (req: Request, res: Response) => {
  const { flags, entitlementDecision } = await resolveEntitlementAwareConnectShyftFlags(req);

  return success(res, {
    code: 'CONNECTSHYFT_AVAILABILITY_RESOLVED',
    message: 'ConnectShyft availability state resolved',
    data: {
      flags,
      entitlement: entitlementDecision
        ? {
          moduleKey: entitlementDecision.moduleKey,
          enabled: entitlementDecision.enabled,
          reason: entitlementDecision.reason,
        }
        : null,
      capabilities: {
        module: evaluateConnectShyftCapability(flags, 'module').ok,
        inbox: evaluateConnectShyftCapability(flags, 'inbox').ok,
        escalation: evaluateConnectShyftCapability(flags, 'escalation').ok,
        webhooks: evaluateConnectShyftCapability(flags, 'webhooks').ok,
      },
    },
  });
});

router.get('/context', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  return success(res, {
    code: 'CONNECTSHYFT_CONTEXT_RESOLVED',
    message: 'ConnectShyft context resolved',
    data: {
      context: {
        tenantId: context.tenantId,
        orgUnitId: context.orgUnitId,
      },
    },
  });
});

router.get('/inbox', async (req: Request, res: Response) => {
  const flags = await enforceCapability(req, res, 'inbox');
  if (!flags) {
    return;
  }

  if (!enforceThreadViewCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  return success(res, {
    code: 'CONNECTSHYFT_INBOX_READY',
    message: 'ConnectShyft inbox is available for this tenant',
    data: {
      context,
      items: [],
      actions: {
        claim: flags.connectshyft_escalation_enabled,
        takeover: flags.connectshyft_escalation_enabled,
      },
    },
  });
});

router.post('/neighbors', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNeighborCreateCapability(req, res)) {
    return;
  }

  const payload = parseNeighborCreateBody(req);
  const context = await enforceOrgUnitContext(req, res, payload.orgUnitId);
  if (!context) {
    return;
  }

  const requestedRole = resolveConnectShyftRequestedRole(req);
  const created = await connectShyftNeighborServiceAsync.createNeighbor({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
    firstName: payload.firstName,
    lastName: payload.lastName,
    phones: payload.phones,
  });

  if (!created.ok) {
    refusal(res, {
      code: created.code,
      message: created.message,
      refusalType: 'business',
      httpStatus: 200,
      data: buildNeighborRefusalData(created, context),
    });
    return;
  }

  return success(res, {
    code: created.code,
    message: 'Neighbor created',
    httpStatus: created.httpStatus,
    data: {
      neighborId: created.data.neighbor.neighborId,
      neighbor: created.data.neighbor,
      ...buildNeighborScopePayload(context),
    },
  });
});

router.get('/neighbors', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNeighborReadCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  const requestedRole = resolveConnectShyftRequestedRole(req);
  const resolved = await connectShyftNeighborServiceAsync.listNeighbors({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
  });

  if (!resolved.ok) {
    refusal(res, {
      code: resolved.code,
      message: resolved.message,
      refusalType: 'business',
      httpStatus: 200,
      data: buildNeighborRefusalData(resolved, context),
    });
    return;
  }

  return success(res, {
    code: resolved.code,
    message: 'Neighbors resolved',
    httpStatus: resolved.httpStatus,
    data: {
      neighbors: resolved.data.neighbors,
      ...buildNeighborScopePayload(context),
    },
  });
});

router.get('/neighbors/:neighborId', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNeighborReadCapability(req, res)) {
    return;
  }

  const neighborId = parseNeighborIdParam(req);
  if (!neighborId) {
    refusal(res, {
      code: 'CONNECTSHYFT_NEIGHBOR_ID_REQUIRED',
      message: 'neighborId is required',
      refusalType: 'client',
      httpStatus: 400,
    });
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  const requestedRole = resolveConnectShyftRequestedRole(req);
  const policyDecision = evaluateNeighborEditPolicy(req, requestedRole, neighborId);
  if (!policyDecision.ok) {
    refusal(res, {
      code: policyDecision.code,
      message: policyDecision.message,
      refusalType: policyDecision.refusalType,
      httpStatus: policyDecision.httpStatus,
      data: buildNeighborScopePayload(context),
    });
    return;
  }

  const resolved = await connectShyftNeighborServiceAsync.resolveNeighbor({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
    neighborId,
  });

  if (!resolved.ok) {
    refusal(res, {
      code: resolved.code,
      message: resolved.message,
      refusalType: 'business',
      httpStatus: 200,
      data: buildNeighborRefusalData(resolved, context),
    });
    return;
  }

  return success(res, {
    code: resolved.code,
    message: 'Neighbor resolved',
    httpStatus: resolved.httpStatus,
    data: {
      neighbor: resolved.data.neighbor,
      ...buildNeighborScopePayload(context),
      ...buildNeighborEditPolicyPayload(policyDecision),
    },
  });
});

router.put('/neighbors/:neighborId', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNeighborUpdateCapability(req, res)) {
    return;
  }

  const neighborId = parseNeighborIdParam(req);
  if (!neighborId) {
    refusal(res, {
      code: 'CONNECTSHYFT_NEIGHBOR_ID_REQUIRED',
      message: 'neighborId is required',
      refusalType: 'client',
      httpStatus: 400,
    });
    return;
  }

  const payload = parseNeighborUpdateBody(req);
  const context = await enforceOrgUnitContext(req, res, payload.orgUnitId);
  if (!context) {
    return;
  }

  const requestedRole = resolveConnectShyftRequestedRole(req);
  const policyDecision = evaluateNeighborEditPolicy(req, requestedRole, neighborId);
  if (!policyDecision.ok) {
    refusal(res, {
      code: policyDecision.code,
      message: policyDecision.message,
      refusalType: policyDecision.refusalType,
      httpStatus: policyDecision.httpStatus,
      data: buildNeighborScopePayload(context),
    });
    return;
  }

  const actorUserId = resolveConnectShyftRequestedActorUserId(req);
  const updated = await connectShyftNeighborServiceAsync.updateNeighbor({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
    neighborId,
    firstName: payload.firstName,
    lastName: payload.lastName,
    phones: payload.phones,
  });

  if (!updated.ok) {
    refusal(res, {
      code: updated.code,
      message: updated.message,
      refusalType: 'business',
      httpStatus: 200,
      data: buildNeighborRefusalData(updated, context),
    });
    return;
  }

  return success(res, {
    code: updated.code,
    message: 'Neighbor profile updated',
    httpStatus: updated.httpStatus,
    data: {
      neighbor: updated.data.neighbor,
      ...buildNeighborScopePayload(context),
      ...buildNeighborEditPolicyPayload(policyDecision),
      ...buildNeighborEditProvenancePayload(
        context,
        policyDecision,
        neighborId,
        actorUserId,
      ),
    },
  });
});

router.get('/numbers', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNumberMappingManageCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  return success(res, {
    code: 'CONNECTSHYFT_NUMBER_MAPPINGS_RESOLVED',
    message: 'ConnectShyft number mappings resolved',
    data: {
      orgUnitId: context.orgUnitId,
      mappings: await connectShyftNumberMappingServiceAsync.listMappings(context.tenantId, context.orgUnitId),
    },
  });
});

router.post('/numbers', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNumberMappingManageCapability(req, res)) {
    return;
  }

  const requestedOrgUnitId = parseOrgUnitIdFromBody(req);
  const context = await enforceOrgUnitContext(req, res, requestedOrgUnitId);
  if (!context) {
    return;
  }

  const payload = parseMappingBody(req);
  const requestedRole = resolveConnectShyftRequestedRole(req);
  const saved = await connectShyftNumberMappingServiceAsync.createMapping({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
    twilioNumberE164: payload.twilioNumberE164,
    label: payload.label,
    isActive: payload.isActive,
  });

  if (!saved.ok) {
    const refusalData = 'data' in saved ? saved.data : undefined;
    refusal(res, {
      code: saved.code,
      message: saved.message,
      refusalType: 'business',
      httpStatus: 200,
      data: refusalData,
    });
    return;
  }

  return success(res, {
    code: saved.code,
    message: 'ConnectShyft number mapping saved',
    httpStatus: saved.httpStatus,
    data: {
      orgUnitId: saved.data.orgUnitId,
      mappingId: saved.data.mappingId,
      twilioNumberE164: saved.data.twilioNumberE164,
      label: saved.data.label,
      isActive: saved.data.isActive,
      mappings: saved.data.mappings,
    },
  });
});

router.put('/numbers/:mappingId', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'module')) {
    return;
  }

  if (!enforceNumberMappingManageCapability(req, res)) {
    return;
  }

  const mappingId = typeof req.params.mappingId === 'string' ? req.params.mappingId.trim() : '';
  if (!mappingId) {
    refusal(res, {
      code: 'CONNECTSHYFT_NUMBER_MAPPING_ID_REQUIRED',
      message: 'mappingId is required',
      refusalType: 'client',
      httpStatus: 400,
    });
    return;
  }

  const requestedOrgUnitId = parseOrgUnitIdFromBody(req);
  const context = await enforceOrgUnitContext(req, res, requestedOrgUnitId);
  if (!context) {
    return;
  }

  const payload = parseMappingBody(req);
  const requestedRole = resolveConnectShyftRequestedRole(req);
  const updated = await connectShyftNumberMappingServiceAsync.updateMapping({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
    mappingId,
    twilioNumberE164: payload.twilioNumberE164,
    label: payload.label,
    isActive: payload.isActive,
  });

  if (!updated.ok) {
    refusal(res, {
      code: updated.code,
      message: updated.message,
      refusalType: 'business',
      httpStatus: 200,
      data: updated.data,
    });
    return;
  }

  return success(res, {
    code: updated.code,
    message: 'ConnectShyft number mapping updated',
    httpStatus: updated.httpStatus,
    data: {
      mappingId: updated.data.mappingId,
      orgUnitId: updated.data.orgUnitId,
      twilioNumberE164: updated.data.twilioNumberE164,
      label: updated.data.label,
      isActive: updated.data.isActive,
      mappings: updated.data.mappings,
    },
  });
});

router.get('/escalation/recipients', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'escalation')) {
    return;
  }

  if (!enforceEscalationConfigCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  const recipientDirectory = await resolveEscalationRecipientDirectory(
    req,
    context.tenantId,
    context.orgUnitId,
  );

  return success(res, {
    code: 'CONNECTSHYFT_ESCALATION_RECIPIENTS_RESOLVED',
    message: 'ConnectShyft escalation recipients resolved',
    data: {
      orgUnitId: context.orgUnitId,
      recipientOptions: recipientDirectory.options,
    },
  });
});

router.get('/escalation/config', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'escalation')) {
    return;
  }

  if (!enforceEscalationConfigCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  const config = await connectShyftEscalationConfigService.getConfig(context.tenantId, context.orgUnitId);

  return success(res, {
    code: 'CONNECTSHYFT_ESCALATION_CONFIG_RESOLVED',
    message: 'ConnectShyft escalation configuration resolved',
    data: {
      orgUnitId: config.orgUnitId,
      escalationBaselineHours: config.escalationBaselineHours,
      recipients: config.recipients,
      updatedAtUtc: config.updatedAtUtc,
    },
  });
});

router.put('/escalation/config', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'escalation')) {
    return;
  }

  if (!enforceEscalationConfigCapability(req, res)) {
    return;
  }

  const requestedOrgUnitId = parseOrgUnitIdFromBody(req);
  const context = await enforceOrgUnitContext(req, res, requestedOrgUnitId);
  if (!context) {
    return;
  }

  const recipientDirectory = await resolveEscalationRecipientDirectory(
    req,
    context.tenantId,
    context.orgUnitId,
  );

  const payload = parseEscalationConfigBody(req);
  const requestedRole = resolveConnectShyftRequestedRole(req);
  const saved = await connectShyftEscalationConfigService.saveConfig({
    actorRoles: [requestedRole],
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
    escalationBaselineHours: payload.escalationBaselineHours,
    recipients: payload.recipients,
    recipientDirectory,
  });

  if (!saved.ok) {
    const refusalData = 'data' in saved ? saved.data : undefined;
    refusal(res, {
      code: saved.code,
      message: saved.message,
      refusalType: 'business',
      httpStatus: 200,
      data: refusalData,
    });
    return;
  }

  return success(res, {
    code: saved.code,
    message: 'ConnectShyft escalation settings saved',
    httpStatus: saved.httpStatus,
    data: {
      orgUnitId: saved.data.orgUnitId,
      escalationBaselineHours: saved.data.escalationBaselineHours,
      recipients: saved.data.recipients,
      updatedAtUtc: saved.data.updatedAtUtc,
    },
  });
});

router.post('/threads', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'inbox')) {
    return;
  }

  if (!enforceThreadEnsureCapability(req, res)) {
    return;
  }

  const payload = parseThreadEnsureBody(req);
  if (payload.threadId) {
    refusal(res, {
      code: 'CONNECTSHYFT_CONTEXT_INVALID',
      message: 'threadId is not accepted when ensuring a ConnectShyft thread.',
      refusalType: 'validation',
      httpStatus: 200,
      data: {
        fieldErrors: [
          {
            field: 'threadId',
            reason: 'FORBIDDEN',
            message: 'threadId is not accepted when ensuring a ConnectShyft thread.',
          },
        ],
      },
    });
    return;
  }

  const context = await enforceOrgUnitContext(req, res, payload.orgUnitId);
  if (!context) {
    return;
  }

  const ensured = await connectShyftThreadServiceAsync.ensureThread({
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
    neighborId: payload.neighborId,
    source: payload.source,
    lastInboundCsNumberId: payload.lastInboundCsNumberId,
    preferredOutboundCsNumberId: payload.preferredOutboundCsNumberId,
  });

  if (!ensured.ok) {
    refusal(res, {
      code: ensured.code,
      message: ensured.message,
      refusalType: ensured.refusalType,
      httpStatus: 200,
      data: ensured.data,
    });
    return;
  }

  return success(res, {
    code: ensured.code,
    message: 'ConnectShyft thread ensured',
    httpStatus: ensured.httpStatus,
    data: {
      ensureOutcome: ensured.data.ensureOutcome,
      thread: ensured.data.thread,
    },
  });
});

router.post('/threads/:threadId/claim', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'escalation')) {
    return;
  }

  if (!enforceThreadClaimCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  if (!enforceEscalationActionMembership(req, res, context.bypassedOrgUnitMembership)) {
    return;
  }

  return success(res, {
    code: 'CONNECTSHYFT_THREAD_CLAIM_READY',
    message: 'ConnectShyft claim action accepted',
    data: {
      threadId: req.params.threadId,
      context,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
    },
  });
});

router.post('/threads/:threadId/takeover', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'escalation')) {
    return;
  }

  if (!enforceThreadTakeoverCapability(req, res)) {
    return;
  }

  const context = await enforceOrgUnitContext(req, res);
  if (!context) {
    return;
  }

  if (!enforceEscalationActionMembership(req, res, context.bypassedOrgUnitMembership)) {
    return;
  }

  return success(res, {
    code: 'CONNECTSHYFT_THREAD_TAKEOVER_READY',
    message: 'ConnectShyft takeover action accepted',
    data: {
      threadId: req.params.threadId,
      context,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
    },
  });
});

router.post('/webhooks/sms', async (req: Request, res: Response) => {
  if (!await enforceCapability(req, res, 'webhooks')) {
    return;
  }

  return success(res, {
    code: 'CONNECTSHYFT_WEBHOOK_ACCEPTED',
    message: 'Inbound webhook accepted for processing',
    data: {
      sid: typeof req.body?.sid === 'string' ? req.body.sid : null,
      from: typeof req.body?.from === 'string' ? req.body.from : null,
      to: typeof req.body?.to === 'string' ? req.body.to : null,
    },
  });
});

export default router;
