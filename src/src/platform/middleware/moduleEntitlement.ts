import { NextFunction, Request, Response } from 'express';
import db from '../../config/knex';
import { refusal } from '../envelopes/response';

const resolveTenantId = (req: Request): string | null => {
  const fromUser = req.user?.activeTenantId || req.user?.householdId || null;
  return typeof fromUser === 'string' && fromUser.trim().length > 0 ? fromUser.trim() : null;
};

export const requireTenantModuleEntitlement = (moduleKey: string) => {
  const normalizedModuleKey = moduleKey.trim().toLowerCase();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next();
    }

    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return next();
    }

    try {
      const entitlement = await db
        .withSchema('platform')
        .table('tenant_module_entitlements')
        .where({ tenant_id: tenantId, module_key: normalizedModuleKey })
        .first(['enabled']);

      if (entitlement && entitlement.enabled === false) {
        refusal(res, {
          code: 'MODULE_DISABLED',
          message: `Module ${normalizedModuleKey} is disabled for this tenant`,
          refusalType: 'security',
          httpStatus: 403,
        });
        return;
      }

      next();
    } catch (_error) {
      refusal(res, {
        code: 'MODULE_ENTITLEMENT_CHECK_FAILED',
        message: 'Unable to verify module entitlement',
        refusalType: 'security',
        httpStatus: 500,
      });
    }
  };
};
