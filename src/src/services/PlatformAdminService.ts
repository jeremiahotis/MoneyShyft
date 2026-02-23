import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { generateInvitationCode } from '../utils/invitationCode';
import { executePlatformMutation } from '../platform/mutations/executePlatformMutation';
import { redactSensitivePayload } from '../platform/audit/redaction';
import {
  CAPABILITIES,
  Capability,
  hasCapability,
  normalizeRole,
  ScopedRole,
} from '../platform/rbac/capabilities';

export interface PlatformAdminActorContext {
  userId: string | null;
  baseRole: string | null;
  headerRoles: Array<string | null | undefined>;
  activeTenantId: string | null;
}

type RoleSetInput = Array<string | null | undefined>;

export interface TenantRecord {
  id: string;
  name: string;
  status: string;
  created_at_utc?: string;
}

export interface BillingAccountRecord {
  id: string;
  name: string;
}

export interface OrgUnitRecord {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: string;
  parent_org_unit_id: string | null;
}

const normalizeRoleSet = (input: RoleSetInput): ScopedRole[] => {
  const resolved: ScopedRole[] = [];
  const seen = new Set<string>();

  input.forEach((rawRole) => {
    const role = normalizeRole(rawRole);
    if (!role) {
      return;
    }

    if (!seen.has(role)) {
      resolved.push(role);
      seen.add(role);
    }
  });

  return resolved;
};

export const parseRoleSetBody = (value: unknown): ScopedRole[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizeRoleSet(value as string[]);
};

const parseRoleSetJson = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch (_error) {
      return [];
    }
  }

  return [];
};

const toRoleSetJson = (roles: ScopedRole[]): string => JSON.stringify(roles);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GOVERNANCE_MODULE_BY_CAPABILITY: Partial<Record<Capability, string>> = {
  [CAPABILITIES.ORG_UNIT_CREATE]: 'org_units',
  [CAPABILITIES.ORG_UNIT_UPDATE]: 'org_units',
  [CAPABILITIES.TENANT_ROLE_ASSIGN]: 'rbac',
  [CAPABILITIES.ORG_UNIT_ADMIN_ASSIGN]: 'rbac',
  [CAPABILITIES.ORG_UNIT_MEMBERSHIP_MANAGE]: 'rbac',
};

const resolveGovernanceModuleKey = (capability: Capability): string | null => {
  return GOVERNANCE_MODULE_BY_CAPABILITY[capability] || null;
};

const isUuid = (value: string | null | undefined): value is string => {
  return typeof value === 'string' && UUID_PATTERN.test(value);
};

const writePlatformEventAndOutbox = async (
  trx: Knex.Transaction,
  event: {
    tenantId: string;
    actorId?: string | null;
    eventName: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> => {
  if (!isUuid(event.tenantId) || !isUuid(event.entityId) || (event.actorId != null && !isUuid(event.actorId))) {
    throw new Error('Mutation contract violation: tenantId, entityId, and actorId (if present) must be UUIDs');
  }

  const sanitizedPayload = redactSensitivePayload(event.payload ?? {}).redactedPayload as Record<string, unknown>;
  const occurredAtUtc = trx.fn.now();
  const [insertedEvent] = await trx
    .withSchema('platform')
    .table('events')
    .insert({
      tenant_id: event.tenantId,
      actor_id: event.actorId ?? null,
      event_name: event.eventName,
      entity_type: event.entityType,
      entity_id: event.entityId,
      occurred_at_utc: occurredAtUtc,
      payload: sanitizedPayload,
    })
    .returning(['id']);

  const eventId = insertedEvent?.id;
  if (typeof eventId !== 'string' || eventId.trim().length === 0) {
    throw new Error('Mutation contract violation: event write did not return an id');
  }

  const [insertedOutboxEvent] = await trx
    .withSchema('platform')
    .table('outbox_events')
    .insert({
      event_id: eventId,
      tenant_id: event.tenantId,
      event_name: event.eventName,
      entity_type: event.entityType,
      entity_id: event.entityId,
      occurred_at_utc: occurredAtUtc,
      payload: sanitizedPayload,
      delivery_status: 'pending',
      delivery_attempts: 0,
      available_at_utc: occurredAtUtc,
    })
    .returning(['id']);

  const outboxId = insertedOutboxEvent?.id;
  if (typeof outboxId !== 'string' || outboxId.trim().length === 0) {
    throw new Error('Mutation contract violation: outbox write did not return an id');
  }
};

const ensureHouseholdShadow = async (trx: Knex.Transaction, tenantId: string, tenantName: string): Promise<void> => {
  const existing = await trx('households').where({ id: tenantId }).first();
  if (existing) {
    return;
  }

  let invitationCode = '';
  for (let attempts = 0; attempts < 100; attempts += 1) {
    const candidate = generateInvitationCode();
    const collision = await trx('households').where({ invitation_code: candidate }).first();
    if (!collision) {
      invitationCode = candidate;
      break;
    }
  }

  if (!invitationCode) {
    throw new Error('Unable to generate unique invitation code for tenant shadow household');
  }

  await trx('households').insert({
    id: tenantId,
    name: tenantName,
    invitation_code: invitationCode,
  });
};

const resolveMembershipRoles = async (
  trx: Knex.Transaction,
  userId: string,
  tenantId?: string,
  orgUnitId?: string
): Promise<string[]> => {
  const roles: string[] = [];

  if (tenantId) {
    const tenantMembership = await trx
      .withSchema('platform')
      .table('tenant_memberships')
      .where({ tenant_id: tenantId, user_id: userId })
      .first();

    roles.push(...parseRoleSetJson(tenantMembership?.role_set_json));
  }

  if (orgUnitId) {
    const orgUnitMembership = await trx
      .withSchema('platform')
      .table('org_unit_memberships')
      .where({ org_unit_id: orgUnitId, user_id: userId })
      .first();

    roles.push(...parseRoleSetJson(orgUnitMembership?.role_set_json));
  }

  return roles;
};

const resolveRequestRoles = async (
  trx: Knex.Transaction,
  actor: PlatformAdminActorContext,
  tenantId?: string,
  orgUnitId?: string
): Promise<ScopedRole[]> => {
  const baseRole = actor.baseRole || null;

  const legacyRoleAliases: Record<string, ScopedRole> = {
    admin: 'TENANT_ADMIN',
    member: 'ORGUNIT_MEMBER',
  };

  const normalizedLegacy = baseRole && legacyRoleAliases[baseRole.toLowerCase()]
    ? legacyRoleAliases[baseRole.toLowerCase()]
    : null;

  const membershipRoles = actor.userId
    ? await resolveMembershipRoles(trx, actor.userId, tenantId, orgUnitId)
    : [];

  return normalizeRoleSet([
    baseRole,
    normalizedLegacy,
    ...actor.headerRoles,
    ...membershipRoles,
  ]);
};

const requireCapability = async (
  trx: Knex.Transaction,
  actor: PlatformAdminActorContext,
  capability: Capability,
  tenantId?: string,
  orgUnitId?: string
): Promise<ScopedRole[]> => {
  if (tenantId) {
    await ensureScopedTenantExists(trx, tenantId);
  }

  const roles = await resolveRequestRoles(trx, actor, tenantId, orgUnitId);

  if (!hasCapability(roles, capability)) {
    throw new Error(`FORBIDDEN:${capability}`);
  }

  const moduleKey = resolveGovernanceModuleKey(capability);
  if (moduleKey && tenantId) {
    const entitlement = await trx
      .withSchema('platform')
      .table('tenant_module_entitlements')
      .where({ tenant_id: tenantId, module_key: moduleKey })
      .first(['enabled']);

    if (entitlement && entitlement.enabled === false) {
      throw new Error(`MODULE_DISABLED:${moduleKey}`);
    }
  }

  return roles;
};

const hasSystemRole = (actor: PlatformAdminActorContext): boolean => {
  const inlineRoles = normalizeRoleSet([actor.baseRole]);
  return inlineRoles.includes('SYSTEM_ADMIN');
};

const normalizeIdInput = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureScopedTenantExists = async (
  trx: Knex.Transaction,
  tenantId: string
): Promise<void> => {
  const existingTenant = await trx
    .withSchema('platform')
    .table('tenants')
    .where({ id: tenantId })
    .first(['id']);

  if (existingTenant) {
    return;
  }

  const household = await trx('households')
    .where({ id: tenantId })
    .first(['id', 'name']);

  if (!household) {
    throw new Error('TENANT_NOT_FOUND');
  }

  const tenantName = typeof household.name === 'string' && household.name.trim().length > 0
    ? household.name.trim()
    : `Tenant ${tenantId.slice(0, 8)}`;

  await trx
    .withSchema('platform')
    .table('tenants')
    .insert({
      id: tenantId,
      name: tenantName,
      status: 'active',
      created_at_utc: trx.fn.now(),
      updated_at_utc: trx.fn.now(),
    })
    .onConflict('id')
    .ignore();
};

export const resolveScopedTenantId = (
  actor: PlatformAdminActorContext,
  requestedTenantId?: string | null
): string => {
  const activeTenantId = normalizeIdInput(actor.activeTenantId);
  const requested = normalizeIdInput(requestedTenantId || null);

  if (hasSystemRole(actor)) {
    const resolved = requested || activeTenantId;
    if (!resolved) {
      throw new Error('TENANT_ID_REQUIRED');
    }

    return resolved;
  }

  if (!activeTenantId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }

  if (requested && requested !== activeTenantId) {
    throw new Error('TENANT_SCOPE_MISMATCH');
  }

  return activeTenantId;
};

const shouldGateInitialTenantAdminAssignment = (roles: ScopedRole[]): boolean => roles.includes('TENANT_ADMIN');

const hasExistingTenantAdmin = async (trx: Knex.Transaction, tenantId: string): Promise<boolean> => {
  const existing = await trx
    .withSchema('platform')
    .table('tenant_memberships')
    .where({ tenant_id: tenantId })
    .whereRaw('role_set_json @> ?::jsonb', [JSON.stringify(['TENANT_ADMIN'])])
    .first(['user_id']);

  return !!existing;
};

const ensureInitialTenantAdminAssignmentAllowed = async (
  trx: Knex.Transaction,
  actor: PlatformAdminActorContext,
  tenantId: string,
  nextRoleSet: ScopedRole[]
): Promise<void> => {
  if (!shouldGateInitialTenantAdminAssignment(nextRoleSet)) {
    return;
  }

  const initialAdminExists = await hasExistingTenantAdmin(trx, tenantId);
  if (initialAdminExists) {
    return;
  }

  await requireCapability(trx, actor, CAPABILITIES.TENANT_ADMIN_ASSIGN, tenantId);
};

export interface CreateTenantInput {
  name: string;
  status?: string;
  billingAccountName?: string;
  assignTenantAdminUserId?: string;
  reason?: string;
}

export const createTenant = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: CreateTenantInput
) => {
  const actorId = actor.userId;
  const status = input.status || 'active';
  const reason = normalizeIdInput(input.reason || null) || 'tenant-create';

  return executePlatformMutation({
    mutation: async (trx) => {
      await requireCapability(trx, actor, CAPABILITIES.TENANT_CREATE);

      const [tenant] = await trx
        .withSchema('platform')
        .table('tenants')
        .insert({
          name: input.name.trim(),
          status,
        })
        .returning(['id', 'name', 'status', 'created_at_utc']);

      await ensureHouseholdShadow(trx, tenant.id, tenant.name);

      let billingAccount: BillingAccountRecord | null = null;
      if (typeof input.billingAccountName === 'string' && input.billingAccountName.trim() !== '') {
        const [createdBilling] = await trx
          .withSchema('platform')
          .table('billing_accounts')
          .insert({
            name: input.billingAccountName.trim(),
            status: 'active',
          })
          .returning(['id', 'name']);

        await trx
          .withSchema('platform')
          .table('tenant_billing')
          .insert({
            tenant_id: tenant.id,
            billing_account_id: createdBilling.id,
          });

        billingAccount = createdBilling;
      }

      const assignUserId = normalizeIdInput(input.assignTenantAdminUserId || null);
      if (assignUserId) {
        await requireCapability(trx, actor, CAPABILITIES.TENANT_ADMIN_ASSIGN, tenant.id);

        await trx
          .withSchema('platform')
          .table('tenant_memberships')
          .insert({
            tenant_id: tenant.id,
            user_id: assignUserId,
            role_set_json: toRoleSetJson(['TENANT_ADMIN']),
          })
          .onConflict(['tenant_id', 'user_id'])
          .merge({
            role_set_json: toRoleSetJson(['TENANT_ADMIN']),
            updated_at_utc: trx.fn.now(),
          });

        await writePlatformEventAndOutbox(trx, {
          tenantId: tenant.id,
          actorId,
          eventName: 'platform.tenant_membership.upserted',
          entityType: 'tenant_membership',
          entityId: assignUserId,
          payload: {
            actorId,
            tenantId: tenant.id,
            scope: {
              layer: 'TENANT',
              tenantId: tenant.id,
              orgUnitId: null,
            },
            reason,
            roleSet: ['TENANT_ADMIN'],
          },
        });
      }

      return {
        tenant: tenant as TenantRecord,
        billingAccount,
      };
    },
    event: (result) => ({
      tenantId: result.tenant.id,
      actorId,
      eventName: 'platform.tenant.created',
      entityType: 'tenant',
      entityId: result.tenant.id,
      payload: {
        actorId,
        tenantId: result.tenant.id,
        scope: {
          layer: 'TENANT',
          tenantId: result.tenant.id,
          orgUnitId: null,
        },
        reason,
        status: result.tenant.status,
        hasBillingAccount: !!result.billingAccount,
      },
    }),
  }, trxClient);
};

export interface UpsertTenantModuleEntitlementInput {
  tenantId?: string;
  moduleKey: string;
  enabled: boolean;
  reason: string;
}

export const upsertTenantModuleEntitlement = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: UpsertTenantModuleEntitlementInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;

  return executePlatformMutation({
    mutation: async (trx) => {
      await requireCapability(trx, actor, CAPABILITIES.MODULE_ENTITLEMENT_MANAGE, tenantId);

      const [entitlement] = await trx
        .withSchema('platform')
        .table('tenant_module_entitlements')
        .insert({
          tenant_id: tenantId,
          module_key: input.moduleKey.trim(),
          enabled: input.enabled,
          reason: input.reason.trim(),
          created_by_user_id: actorId,
          updated_by_user_id: actorId,
        })
        .onConflict(['tenant_id', 'module_key'])
        .merge({
          enabled: input.enabled,
          reason: input.reason.trim(),
          updated_by_user_id: actorId,
          updated_at_utc: trx.fn.now(),
        })
        .returning(['id', 'tenant_id', 'module_key', 'enabled', 'reason', 'updated_at_utc']);

      return { entitlement };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.tenant_module_entitlement.upserted',
      entityType: 'tenant_module_entitlement',
      entityId: result.entitlement.id,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'TENANT',
          tenantId,
          orgUnitId: null,
        },
        reason: input.reason.trim(),
        moduleKey: result.entitlement.module_key,
        enabled: result.entitlement.enabled,
      },
    }),
  }, trxClient);
};

export interface CreateOrgUnitInput {
  tenantId?: string;
  name: string;
  type?: string;
  parentOrgUnitId?: string | null;
  status?: string;
  reason?: string;
}

export const createOrgUnit = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: CreateOrgUnitInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;
  const reason = normalizeIdInput(input.reason || null) || 'org-unit-create';

  return executePlatformMutation({
    mutation: async (trx) => {
      await requireCapability(trx, actor, CAPABILITIES.ORG_UNIT_CREATE, tenantId);

      const [orgUnit] = await trx
        .withSchema('platform')
        .table('org_units')
        .insert({
          tenant_id: tenantId,
          parent_org_unit_id: normalizeIdInput(input.parentOrgUnitId || null),
          type: (input.type || 'ORG_UNIT').trim(),
          name: input.name.trim(),
          status: (input.status || 'active').trim(),
        })
        .returning(['id', 'tenant_id', 'name', 'type', 'status', 'parent_org_unit_id']);

      return { orgUnit: orgUnit as OrgUnitRecord };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.org_unit.created',
      entityType: 'org_unit',
      entityId: result.orgUnit.id,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'ORG_UNIT',
          tenantId,
          orgUnitId: result.orgUnit.id,
        },
        reason,
        type: result.orgUnit.type,
        parentOrgUnitId: result.orgUnit.parent_org_unit_id,
      },
    }),
  }, trxClient);
};

export interface UpdateOrgUnitInput {
  tenantId?: string;
  orgUnitId: string;
  name?: string;
  type?: string;
  parentOrgUnitId?: string | null;
  status?: string;
  reason?: string;
}

export const updateOrgUnit = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: UpdateOrgUnitInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;
  const reason = normalizeIdInput(input.reason || null) || 'org-unit-update';

  return executePlatformMutation({
    mutation: async (trx) => {
      const orgUnit = await trx
        .withSchema('platform')
        .table('org_units')
        .where({ id: input.orgUnitId.trim(), tenant_id: tenantId })
        .first(['id', 'tenant_id', 'name', 'type', 'status', 'parent_org_unit_id']);

      if (!orgUnit) {
        throw new Error('ORG_UNIT_NOT_FOUND');
      }

      await requireCapability(trx, actor, CAPABILITIES.ORG_UNIT_UPDATE, tenantId, orgUnit.id);

      const patch: Record<string, unknown> = {
        updated_at_utc: trx.fn.now(),
      };

      if (typeof input.name === 'string' && input.name.trim() !== '') {
        patch.name = input.name.trim();
      }

      if (typeof input.type === 'string' && input.type.trim() !== '') {
        patch.type = input.type.trim();
      }

      if (typeof input.status === 'string' && input.status.trim() !== '') {
        patch.status = input.status.trim();
      }

      if (input.parentOrgUnitId !== undefined) {
        patch.parent_org_unit_id = normalizeIdInput(input.parentOrgUnitId || null);
      }

      const [updatedOrgUnit] = await trx
        .withSchema('platform')
        .table('org_units')
        .where({ id: orgUnit.id, tenant_id: tenantId })
        .update(patch)
        .returning(['id', 'tenant_id', 'name', 'type', 'status', 'parent_org_unit_id']);

      return { orgUnit: updatedOrgUnit as OrgUnitRecord };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.org_unit.updated',
      entityType: 'org_unit',
      entityId: result.orgUnit.id,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'ORG_UNIT',
          tenantId,
          orgUnitId: result.orgUnit.id,
        },
        reason,
        type: result.orgUnit.type,
        parentOrgUnitId: result.orgUnit.parent_org_unit_id,
        status: result.orgUnit.status,
      },
    }),
  }, trxClient);
};

export interface UpsertTenantMembershipInput {
  tenantId?: string;
  userId: string;
  roleSet: ScopedRole[];
  reason: string;
}

export const upsertTenantMembership = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: UpsertTenantMembershipInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;

  return executePlatformMutation({
    mutation: async (trx) => {
      await requireCapability(trx, actor, CAPABILITIES.TENANT_ROLE_ASSIGN, tenantId);
      await ensureInitialTenantAdminAssignmentAllowed(trx, actor, tenantId, input.roleSet);

      await trx
        .withSchema('platform')
        .table('tenant_memberships')
        .insert({
          tenant_id: tenantId,
          user_id: input.userId.trim(),
          role_set_json: toRoleSetJson(input.roleSet),
        })
        .onConflict(['tenant_id', 'user_id'])
        .merge({
          role_set_json: toRoleSetJson(input.roleSet),
          updated_at_utc: trx.fn.now(),
        });

      return {
        tenantId,
        userId: input.userId.trim(),
        roleSet: input.roleSet,
      };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.tenant_membership.upserted',
      entityType: 'tenant_membership',
      entityId: result.userId,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'TENANT',
          tenantId,
          orgUnitId: null,
        },
        reason: input.reason.trim(),
        roleSet: result.roleSet,
      },
    }),
  }, trxClient);
};

export interface RevokeTenantMembershipInput {
  tenantId?: string;
  userId: string;
  reason: string;
}

export const revokeTenantMembership = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: RevokeTenantMembershipInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;

  return executePlatformMutation({
    mutation: async (trx) => {
      await requireCapability(trx, actor, CAPABILITIES.TENANT_ROLE_ASSIGN, tenantId);

      const deleted = await trx
        .withSchema('platform')
        .table('tenant_memberships')
        .where({ tenant_id: tenantId, user_id: input.userId.trim() })
        .del();

      if (!deleted) {
        throw new Error('TENANT_MEMBERSHIP_NOT_FOUND');
      }

      return {
        tenantId,
        userId: input.userId.trim(),
      };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.tenant_membership.revoked',
      entityType: 'tenant_membership',
      entityId: result.userId,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'TENANT',
          tenantId,
          orgUnitId: null,
        },
        reason: input.reason.trim(),
      },
    }),
  }, trxClient);
};

export interface UpsertOrgUnitMembershipInput {
  tenantId?: string;
  orgUnitId: string;
  userId: string;
  roleSet: ScopedRole[];
  reason: string;
}

export const upsertOrgUnitMembership = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: UpsertOrgUnitMembershipInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;

  return executePlatformMutation({
    mutation: async (trx) => {
      const orgUnit = await trx
        .withSchema('platform')
        .table('org_units')
        .where({ id: input.orgUnitId.trim(), tenant_id: tenantId })
        .first(['id', 'tenant_id']);

      if (!orgUnit) {
        throw new Error('ORG_UNIT_NOT_FOUND');
      }

      await requireCapability(trx, actor, CAPABILITIES.ORG_UNIT_MEMBERSHIP_MANAGE, tenantId, orgUnit.id);

      await trx
        .withSchema('platform')
        .table('org_unit_memberships')
        .insert({
          org_unit_id: orgUnit.id,
          user_id: input.userId.trim(),
          role_set_json: toRoleSetJson(input.roleSet),
        })
        .onConflict(['org_unit_id', 'user_id'])
        .merge({
          role_set_json: toRoleSetJson(input.roleSet),
          updated_at_utc: trx.fn.now(),
        });

      return {
        orgUnitId: orgUnit.id,
        tenantId,
        userId: input.userId.trim(),
        roleSet: input.roleSet,
      };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.org_unit_membership.upserted',
      entityType: 'org_unit_membership',
      entityId: result.userId,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'ORG_UNIT',
          tenantId,
          orgUnitId: result.orgUnitId,
        },
        reason: input.reason.trim(),
        roleSet: result.roleSet,
      },
    }),
  }, trxClient);
};

export interface RevokeOrgUnitMembershipInput {
  tenantId?: string;
  orgUnitId: string;
  userId: string;
  reason: string;
}

export const revokeOrgUnitMembership = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: RevokeOrgUnitMembershipInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const actorId = actor.userId;

  return executePlatformMutation({
    mutation: async (trx) => {
      const orgUnit = await trx
        .withSchema('platform')
        .table('org_units')
        .where({ id: input.orgUnitId.trim(), tenant_id: tenantId })
        .first(['id']);

      if (!orgUnit) {
        throw new Error('ORG_UNIT_NOT_FOUND');
      }

      await requireCapability(trx, actor, CAPABILITIES.ORG_UNIT_MEMBERSHIP_MANAGE, tenantId, orgUnit.id);

      const deleted = await trx
        .withSchema('platform')
        .table('org_unit_memberships')
        .where({ org_unit_id: orgUnit.id, user_id: input.userId.trim() })
        .del();

      if (!deleted) {
        throw new Error('ORG_UNIT_MEMBERSHIP_NOT_FOUND');
      }

      return {
        orgUnitId: orgUnit.id,
        tenantId,
        userId: input.userId.trim(),
      };
    },
    event: (result) => ({
      tenantId,
      actorId,
      eventName: 'platform.org_unit_membership.revoked',
      entityType: 'org_unit_membership',
      entityId: result.userId,
      payload: {
        actorId,
        tenantId,
        scope: {
          layer: 'ORG_UNIT',
          tenantId,
          orgUnitId: result.orgUnitId,
        },
        reason: input.reason.trim(),
      },
    }),
  }, trxClient);
};

export const evaluateRequestCapabilities = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  tenantId?: string,
  orgUnitId?: string
) => {
  const roles = await trxClient.transaction((trx) => resolveRequestRoles(trx, actor, tenantId, orgUnitId));

  return {
    roles,
    capabilities: Array.from(new Set(Object.values(CAPABILITIES).filter((capability) => hasCapability(roles, capability)))),
  };
};


export interface SearchScopedUsersInput {
  tenantId?: string;
  query: string;
  limit?: number;
}

export interface CreateScopedAdminUserInput {
  tenantId?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantRoleSet: ScopedRole[];
  reason: string;
}

const BCRYPT_ROUNDS = 12;

export const searchScopedUsers = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: SearchScopedUsersInput
) => {
  const resolvedTenantId = resolveScopedTenantId(actor, input.tenantId);
  const query = input.query.trim().toLowerCase();
  const limit = Math.max(1, Math.min(input.limit || 10, 50));

  if (query.length < 2) {
    throw new Error('QUERY_TOO_SHORT');
  }

  return trxClient.transaction(async (trx) => {
    await requireCapability(trx, actor, CAPABILITIES.TENANT_ROLE_ASSIGN, resolvedTenantId);

    const users = await trx('users as u')
      .join('platform.tenant_memberships as tm', function joinMembership() {
        this.on('tm.user_id', '=', 'u.id').andOn('tm.tenant_id', '=', trx.raw('?', [resolvedTenantId]));
      })
      .where((builder) => {
        builder
          .whereRaw('LOWER(u.email) LIKE ?', [`%${query}%`])
          .orWhereRaw('LOWER(u.first_name) LIKE ?', [`%${query}%`])
          .orWhereRaw('LOWER(u.last_name) LIKE ?', [`%${query}%`]);
      })
      .limit(limit)
      .select([
        'u.id',
        'u.email',
        'u.first_name as firstName',
        'u.last_name as lastName',
        'tm.role_set_json as roleSetJson',
      ]);

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleSet: parseRoleSetJson(user.roleSetJson),
    }));
  });
};

export const createScopedAdminUser = async (
  trxClient: Knex,
  actor: PlatformAdminActorContext,
  input: CreateScopedAdminUserInput
) => {
  const tenantId = resolveScopedTenantId(actor, input.tenantId);
  const roleSet = normalizeRoleSet(input.tenantRoleSet);

  if (roleSet.length === 0) {
    throw new Error('ROLE_SET_REQUIRED');
  }

  return executePlatformMutation({
    mutation: async (trx) => {
    await requireCapability(trx, actor, CAPABILITIES.TENANT_ROLE_ASSIGN, tenantId);

    const existingUser = await trx('users').whereRaw('LOWER(email) = ?', [input.email.trim().toLowerCase()]).first();
    if (existingUser) {
      throw new Error('USER_EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const [createdUser] = await trx('users')
      .insert({
        email: input.email.trim().toLowerCase(),
        password_hash: passwordHash,
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        household_id: tenantId,
        role: roleSet.includes('TENANT_ADMIN') ? 'admin' : 'member',
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'household_id']);

    const [membership] = await trx
      .withSchema('platform')
      .table('tenant_memberships')
      .insert({
        tenant_id: tenantId,
        user_id: createdUser.id,
        role_set_json: toRoleSetJson(roleSet),
      })
      .onConflict(['tenant_id', 'user_id'])
      .merge({
        role_set_json: toRoleSetJson(roleSet),
        updated_at_utc: trx.fn.now(),
      })
      .returning(['tenant_id', 'user_id', 'role_set_json']);

    return {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        firstName: createdUser.first_name,
        lastName: createdUser.last_name,
        tenantId: createdUser.household_id,
      },
      membership: {
        tenantId: membership.tenant_id,
        userId: membership.user_id,
        roleSet: parseRoleSetJson(membership.role_set_json),
      },
    };
    },
    event: (result) => ({
      tenantId,
      actorId: actor.userId,
      eventName: 'platform.tenant.admin-user.created',
      entityType: 'tenant_membership',
      entityId: result.membership.userId,
      payload: {
        tenantId,
        userId: result.membership.userId,
        roleSet: result.membership.roleSet,
        reason: input.reason.trim(),
      },
    }),
  }, trxClient);
};
