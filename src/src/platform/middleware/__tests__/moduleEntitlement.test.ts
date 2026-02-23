import type { NextFunction, Request, Response } from 'express';

const mockFirst = jest.fn();
const mockWhere = jest.fn(() => ({ first: mockFirst }));
const mockTable = jest.fn(() => ({ where: mockWhere }));
const mockWithSchema = jest.fn(() => ({ table: mockTable }));

jest.mock('../../../config/knex', () => ({
  __esModule: true,
  default: {
    withSchema: mockWithSchema,
  },
}));

const refusalSpy = jest.fn();
jest.mock('../../envelopes/response', () => ({
  refusal: (...args: unknown[]) => refusalSpy(...args),
}));

import { requireTenantModuleEntitlement } from '../moduleEntitlement';

describe('requireTenantModuleEntitlement', () => {
  const next: NextFunction = jest.fn();
  const res = {} as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows request when entitlement row is missing', async () => {
    mockFirst.mockResolvedValue(undefined);
    const req = {
      user: {
        householdId: '22222222-2222-4222-8222-222222222222',
      },
    } as Request;

    await requireTenantModuleEntitlement('moneyshyft')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(refusalSpy).not.toHaveBeenCalled();
  });

  it('refuses request when entitlement is disabled', async () => {
    mockFirst.mockResolvedValue({ enabled: false });
    const req = {
      user: {
        activeTenantId: '22222222-2222-4222-8222-222222222222',
      },
    } as Request;

    await requireTenantModuleEntitlement('moneyshyft')(req, res, next);

    expect(refusalSpy).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
