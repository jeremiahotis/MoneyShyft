import { Request, Response, Router } from 'express';
import db from '../../../config/knex';
import { authenticateToken } from '../../../middleware/auth';
import { refusal, success, systemError } from '../../../platform/envelopes/response';
import {
  createOrgUnit,
  createTenant,
  evaluateRequestCapabilities,
  parseRoleSetBody,
  PlatformAdminActorContext,
  revokeOrgUnitMembership,
  revokeTenantMembership,
  upsertOrgUnitMembership,
  upsertTenantMembership,
  upsertTenantModuleEntitlement,
  updateOrgUnit,
  searchScopedUsers,
  createScopedAdminUser,
} from '../../../services/PlatformAdminService';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
};

const actorFromRequest = (req: Request): PlatformAdminActorContext => ({
  userId: req.user?.userId || null,
  baseRole: req.user?.role || null,
  headerRoles: [],
  activeTenantId: req.user?.activeTenantId || req.user?.householdId || null,
});

const getMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

const handleScopeErrors = (res: Response, error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.message === 'TENANT_SCOPE_REQUIRED') {
    refusal(res, {
      code: 'TENANT_SCOPE_REQUIRED',
      message: 'Active tenant context is required',
      refusalType: 'security',
      httpStatus: 403,
    });
    return true;
  }

  if (error.message === 'TENANT_SCOPE_MISMATCH') {
    refusal(res, {
      code: 'TENANT_SCOPE_MISMATCH',
      message: 'Cross-tenant mutations are not allowed for this actor',
      refusalType: 'security',
      httpStatus: 403,
    });
    return true;
  }

  if (error.message === 'TENANT_ID_REQUIRED') {
    refusal(res, {
      code: 'TENANT_ID_REQUIRED',
      message: 'tenantId is required',
      refusalType: 'client',
      httpStatus: 400,
    });
    return true;
  }

  if (error.message === 'TENANT_NOT_FOUND') {
    refusal(res, {
      code: 'TENANT_NOT_FOUND',
      message: 'Active tenant scope was not found',
      refusalType: 'client',
      httpStatus: 404,
    });
    return true;
  }

  return false;
};

const handleForbiddenError = (res: Response, error: unknown, message: string): boolean => {
  if (error instanceof Error && error.message.startsWith('FORBIDDEN:')) {
    refusal(res, {
      code: 'FORBIDDEN',
      message,
      refusalType: 'security',
      httpStatus: 403,
    });
    return true;
  }

  return false;
};

const handleModuleDisabledError = (res: Response, error: unknown): boolean => {
  if (error instanceof Error && error.message.startsWith('MODULE_DISABLED:')) {
    const moduleKey = error.message.slice('MODULE_DISABLED:'.length);
    refusal(res, {
      code: 'MODULE_DISABLED',
      message: `Module ${moduleKey} is disabled for this tenant`,
      refusalType: 'security',
      httpStatus: 403,
    });
    return true;
  }

  return false;
};

router.use(authenticateToken);

router.post('/tenants', async (req: Request, res: Response) => {
  const { name, status, billingAccountName, assignTenantAdminUserId, reason } = req.body || {};

  if (typeof name !== 'string' || name.trim() === '') {
    return refusal(res, {
      code: 'TENANT_NAME_REQUIRED',
      message: 'name is required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const created = await createTenant(db, actorFromRequest(req), {
      name,
      status,
      billingAccountName,
      assignTenantAdminUserId,
      reason,
    });

    return success(res, {
      code: 'TENANT_CREATED',
      message: 'Tenant created successfully',
      data: created,
    });
  } catch (error) {
    if (handleForbiddenError(res, error, 'Insufficient permissions for tenant creation')) {
      return;
    }

    return systemError(res, {
      code: 'TENANT_CREATE_FAILED',
      message: getMessage(error, 'Failed to create tenant'),
      httpStatus: 500,
    });
  }
});

router.put('/module-entitlements', async (req: Request, res: Response) => {
  const { tenantId, moduleKey, enabled, reason } = req.body || {};

  if (
    (tenantId !== undefined && !isUuid(tenantId))
    ||
    typeof moduleKey !== 'string'
    || moduleKey.trim() === ''
    || typeof enabled !== 'boolean'
    || typeof reason !== 'string'
    || reason.trim() === ''
  ) {
    return refusal(res, {
      code: 'MODULE_ENTITLEMENT_INPUT_INVALID',
      message: 'moduleKey, enabled(boolean), and reason are required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const updated = await upsertTenantModuleEntitlement(db, actorFromRequest(req), {
      tenantId,
      moduleKey,
      enabled,
      reason,
    });

    return success(res, {
      code: 'MODULE_ENTITLEMENT_UPDATED',
      message: 'Tenant module entitlement updated successfully',
      data: updated,
    });
  } catch (error) {
    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for module entitlement update')) {
      return;
    }

    return systemError(res, {
      code: 'MODULE_ENTITLEMENT_UPDATE_FAILED',
      message: getMessage(error, 'Failed to update tenant module entitlement'),
      httpStatus: 500,
    });
  }
});

router.post('/org-units', async (req: Request, res: Response) => {
  const { tenantId, name, type, parentOrgUnitId, status, reason } = req.body || {};

  if (
    typeof name !== 'string'
    || name.trim() === ''
    || (tenantId !== undefined && !isUuid(tenantId))
    || (parentOrgUnitId !== undefined && parentOrgUnitId !== null && !isUuid(parentOrgUnitId))
  ) {
    return refusal(res, {
      code: 'ORG_UNIT_INPUT_INVALID',
      message: 'name is required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const created = await createOrgUnit(db, actorFromRequest(req), {
      tenantId,
      name,
      type,
      parentOrgUnitId,
      status,
      reason,
    });

    return success(res, {
      code: 'ORG_UNIT_CREATED',
      message: 'OrgUnit created successfully',
      data: created,
    });
  } catch (error) {
    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for org unit creation')) {
      return;
    }

    if (handleModuleDisabledError(res, error)) {
      return;
    }

    return systemError(res, {
      code: 'ORG_UNIT_CREATE_FAILED',
      message: getMessage(error, 'Failed to create org unit'),
      httpStatus: 500,
    });
  }
});

router.put('/org-units/:orgUnitId', async (req: Request, res: Response) => {
  const { tenantId, name, type, parentOrgUnitId, status, reason } = req.body || {};
  const orgUnitId = typeof req.params.orgUnitId === 'string' ? req.params.orgUnitId.trim() : '';

  if (!orgUnitId) {
    return refusal(res, {
      code: 'ORG_UNIT_INPUT_INVALID',
      message: 'orgUnitId is required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  if (
    !isUuid(orgUnitId)
    || (tenantId !== undefined && !isUuid(tenantId))
    || (parentOrgUnitId !== undefined && parentOrgUnitId !== null && !isUuid(parentOrgUnitId))
  ) {
    return refusal(res, {
      code: 'ORG_UNIT_INPUT_INVALID',
      message: 'orgUnitId, tenantId, and parentOrgUnitId must be UUIDs when provided',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  const hasPatch =
    (typeof name === 'string' && name.trim() !== '')
    || (typeof type === 'string' && type.trim() !== '')
    || (typeof status === 'string' && status.trim() !== '')
    || parentOrgUnitId !== undefined;

  if (!hasPatch) {
    return refusal(res, {
      code: 'ORG_UNIT_UPDATE_INPUT_INVALID',
      message: 'At least one patch field is required: name, type, status, parentOrgUnitId',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const updated = await updateOrgUnit(db, actorFromRequest(req), {
      tenantId,
      orgUnitId,
      name,
      type,
      parentOrgUnitId,
      status,
      reason,
    });

    return success(res, {
      code: 'ORG_UNIT_UPDATED',
      message: 'OrgUnit updated successfully',
      data: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORG_UNIT_NOT_FOUND') {
      return refusal(res, {
        code: 'ORG_UNIT_NOT_FOUND',
        message: 'OrgUnit was not found in active tenant scope',
        refusalType: 'client',
        httpStatus: 404,
      });
    }

    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for org unit update')) {
      return;
    }

    if (handleModuleDisabledError(res, error)) {
      return;
    }

    return systemError(res, {
      code: 'ORG_UNIT_UPDATE_FAILED',
      message: getMessage(error, 'Failed to update org unit'),
      httpStatus: 500,
    });
  }
});

router.post('/tenant-memberships', async (req: Request, res: Response) => {
  const { tenantId, userId, roleSet, reason } = req.body || {};
  const parsedRoleSet = parseRoleSetBody(roleSet);

  if (
    typeof userId !== 'string'
    || userId.trim() === ''
    || !isUuid(userId)
    || (tenantId !== undefined && !isUuid(tenantId))
    || parsedRoleSet.length === 0
    || typeof reason !== 'string'
    || reason.trim() === ''
  ) {
    return refusal(res, {
      code: 'TENANT_MEMBERSHIP_INPUT_INVALID',
      message: 'userId, roleSet[], and reason are required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const updated = await upsertTenantMembership(db, actorFromRequest(req), {
      tenantId,
      userId,
      roleSet: parsedRoleSet,
      reason,
    });

    return success(res, {
      code: 'TENANT_MEMBERSHIP_UPDATED',
      message: 'Tenant membership updated successfully',
      data: updated,
    });
  } catch (error) {
    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for tenant membership update')) {
      return;
    }

    if (handleModuleDisabledError(res, error)) {
      return;
    }

    return systemError(res, {
      code: 'TENANT_MEMBERSHIP_UPDATE_FAILED',
      message: getMessage(error, 'Failed to update tenant membership'),
      httpStatus: 500,
    });
  }
});

router.delete('/tenant-memberships', async (req: Request, res: Response) => {
  const { tenantId, userId, reason } = req.body || {};

  if (
    typeof userId !== 'string'
    || userId.trim() === ''
    || !isUuid(userId)
    || (tenantId !== undefined && !isUuid(tenantId))
    || typeof reason !== 'string'
    || reason.trim() === ''
  ) {
    return refusal(res, {
      code: 'TENANT_MEMBERSHIP_INPUT_INVALID',
      message: 'userId and reason are required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const revoked = await revokeTenantMembership(db, actorFromRequest(req), {
      tenantId,
      userId,
      reason,
    });

    return success(res, {
      code: 'TENANT_MEMBERSHIP_REVOKED',
      message: 'Tenant membership revoked successfully',
      data: revoked,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'TENANT_MEMBERSHIP_NOT_FOUND') {
      return refusal(res, {
        code: 'TENANT_MEMBERSHIP_NOT_FOUND',
        message: 'Tenant membership was not found',
        refusalType: 'client',
        httpStatus: 404,
      });
    }

    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for tenant membership revocation')) {
      return;
    }

    if (handleModuleDisabledError(res, error)) {
      return;
    }

    return systemError(res, {
      code: 'TENANT_MEMBERSHIP_REVOKE_FAILED',
      message: getMessage(error, 'Failed to revoke tenant membership'),
      httpStatus: 500,
    });
  }
});

router.post('/org-unit-memberships', async (req: Request, res: Response) => {
  const { tenantId, orgUnitId, userId, roleSet, reason } = req.body || {};
  const parsedRoleSet = parseRoleSetBody(roleSet);

  if (
    typeof orgUnitId !== 'string'
    || orgUnitId.trim() === ''
    || !isUuid(orgUnitId)
    || typeof userId !== 'string'
    || userId.trim() === ''
    || !isUuid(userId)
    || (tenantId !== undefined && !isUuid(tenantId))
    || parsedRoleSet.length === 0
    || typeof reason !== 'string'
    || reason.trim() === ''
  ) {
    return refusal(res, {
      code: 'ORG_UNIT_MEMBERSHIP_INPUT_INVALID',
      message: 'orgUnitId, userId, roleSet[], and reason are required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const updated = await upsertOrgUnitMembership(db, actorFromRequest(req), {
      tenantId,
      orgUnitId,
      userId,
      roleSet: parsedRoleSet,
      reason,
    });

    return success(res, {
      code: 'ORG_UNIT_MEMBERSHIP_UPDATED',
      message: 'OrgUnit membership updated successfully',
      data: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORG_UNIT_NOT_FOUND') {
      return refusal(res, {
        code: 'ORG_UNIT_NOT_FOUND',
        message: 'OrgUnit was not found in active tenant scope',
        refusalType: 'client',
        httpStatus: 404,
      });
    }

    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for org unit membership update')) {
      return;
    }

    if (handleModuleDisabledError(res, error)) {
      return;
    }

    return systemError(res, {
      code: 'ORG_UNIT_MEMBERSHIP_UPDATE_FAILED',
      message: getMessage(error, 'Failed to update org unit membership'),
      httpStatus: 500,
    });
  }
});

router.delete('/org-unit-memberships', async (req: Request, res: Response) => {
  const { tenantId, orgUnitId, userId, reason } = req.body || {};

  if (
    typeof orgUnitId !== 'string'
    || orgUnitId.trim() === ''
    || !isUuid(orgUnitId)
    || typeof userId !== 'string'
    || userId.trim() === ''
    || !isUuid(userId)
    || (tenantId !== undefined && !isUuid(tenantId))
    || typeof reason !== 'string'
    || reason.trim() === ''
  ) {
    return refusal(res, {
      code: 'ORG_UNIT_MEMBERSHIP_INPUT_INVALID',
      message: 'orgUnitId, userId, and reason are required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const revoked = await revokeOrgUnitMembership(db, actorFromRequest(req), {
      tenantId,
      orgUnitId,
      userId,
      reason,
    });

    return success(res, {
      code: 'ORG_UNIT_MEMBERSHIP_REVOKED',
      message: 'OrgUnit membership revoked successfully',
      data: revoked,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORG_UNIT_NOT_FOUND') {
      return refusal(res, {
        code: 'ORG_UNIT_NOT_FOUND',
        message: 'OrgUnit was not found in active tenant scope',
        refusalType: 'client',
        httpStatus: 404,
      });
    }

    if (error instanceof Error && error.message === 'ORG_UNIT_MEMBERSHIP_NOT_FOUND') {
      return refusal(res, {
        code: 'ORG_UNIT_MEMBERSHIP_NOT_FOUND',
        message: 'OrgUnit membership was not found',
        refusalType: 'client',
        httpStatus: 404,
      });
    }

    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for org unit membership revocation')) {
      return;
    }

    if (handleModuleDisabledError(res, error)) {
      return;
    }

    return systemError(res, {
      code: 'ORG_UNIT_MEMBERSHIP_REVOKE_FAILED',
      message: getMessage(error, 'Failed to revoke org unit membership'),
      httpStatus: 500,
    });
  }
});


router.get('/users/search', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId && typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const query = req.query.query && typeof req.query.query === 'string' ? req.query.query : '';
  const limitRaw = req.query.limit && typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  if (query.trim().length < 2) {
    return refusal(res, {
      code: 'USER_SEARCH_QUERY_TOO_SHORT',
      message: 'query must be at least 2 characters',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const users = await searchScopedUsers(db, actorFromRequest(req), {
      tenantId,
      query,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });

    return success(res, {
      code: 'USER_SEARCH_COMPLETED',
      message: 'Scoped user search completed',
      data: { users },
    });
  } catch (error) {
    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for user search')) {
      return;
    }

    return systemError(res, {
      code: 'USER_SEARCH_FAILED',
      message: getMessage(error, 'Failed to search users'),
      httpStatus: 500,
    });
  }
});

router.post('/users', async (req: Request, res: Response) => {
  const {
    tenantId,
    email,
    password,
    firstName,
    lastName,
    tenantRoleSet,
    reason,
  } = req.body || {};
  const parsedRoleSet = parseRoleSetBody(tenantRoleSet);

  if (
    (tenantId !== undefined && !isUuid(tenantId))
    || typeof email !== 'string'
    || email.trim() === ''
    || typeof password !== 'string'
    || password.length < 12
    || typeof firstName !== 'string'
    || firstName.trim() === ''
    || typeof lastName !== 'string'
    || lastName.trim() === ''
    || parsedRoleSet.length === 0
    || typeof reason !== 'string'
    || reason.trim() === ''
  ) {
    return refusal(res, {
      code: 'USER_CREATE_INPUT_INVALID',
      message: 'email, password(>=12), firstName, lastName, tenantRoleSet[], and reason are required',
      refusalType: 'client',
      httpStatus: 400,
    });
  }

  try {
    const created = await createScopedAdminUser(db, actorFromRequest(req), {
      tenantId,
      email,
      password,
      firstName,
      lastName,
      tenantRoleSet: parsedRoleSet,
      reason,
    });

    return success(res, {
      code: 'ADMIN_USER_CREATED',
      message: 'Scoped admin user created successfully',
      data: created,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_EMAIL_ALREADY_EXISTS') {
      return refusal(res, {
        code: 'USER_EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists',
        refusalType: 'client',
        httpStatus: 409,
      });
    }

    if (handleScopeErrors(res, error)) {
      return;
    }

    if (handleForbiddenError(res, error, 'Insufficient permissions for admin user creation')) {
      return;
    }

    return systemError(res, {
      code: 'ADMIN_USER_CREATE_FAILED',
      message: getMessage(error, 'Failed to create admin user'),
      httpStatus: 500,
    });
  }
});

router.get('/rbac/evaluate', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId && typeof req.query.tenantId === 'string'
    ? req.query.tenantId
    : undefined;
  const orgUnitId = req.query.orgUnitId && typeof req.query.orgUnitId === 'string'
    ? req.query.orgUnitId
    : undefined;

  try {
    const data = await evaluateRequestCapabilities(db, actorFromRequest(req), tenantId, orgUnitId);

    return success(res, {
      code: 'RBAC_EVALUATED',
      message: 'Resolved request role and capability context',
      data,
    });
  } catch (error) {
    return systemError(res, {
      code: 'RBAC_EVALUATION_FAILED',
      message: getMessage(error, 'Failed to evaluate RBAC'),
      httpStatus: 500,
    });
  }
});

export default router;
