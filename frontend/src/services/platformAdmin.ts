import api from '@/services/api';

type Envelope<T> = {
  ok?: boolean;
  code?: string;
  message?: string;
  data?: T;
  tenantId?: string | null;
};

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.data && typeof record.data === 'object') {
      return record.data as T;
    }

    return record as T;
  }

  return {} as T;
};

export type RbacEvaluation = {
  roles: string[];
  capabilities: string[];
};

export type ScopedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleSet: string[];
};

export type CreateScopedAdminUserInput = {
  tenantId?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantRoleSet: string[];
  reason: string;
};

export type CreateTenantInput = {
  name: string;
  status?: string;
  billingAccountName?: string;
  assignTenantAdminUserId?: string;
  reason?: string;
};

export type CreateOrgUnitInput = {
  tenantId?: string;
  name: string;
  type?: string;
  parentOrgUnitId?: string | null;
  status?: string;
  reason: string;
};

export type UpsertTenantMembershipInput = {
  tenantId?: string;
  userId: string;
  roleSet: string[];
  reason: string;
};

export type UpsertOrgUnitMembershipInput = {
  tenantId?: string;
  orgUnitId: string;
  userId: string;
  roleSet: string[];
  reason: string;
};

export const evaluateRbac = async (params: {
  tenantId?: string | null;
  orgUnitId?: string | null;
} = {}): Promise<RbacEvaluation> => {
  const response = await api.get<Envelope<RbacEvaluation>>('/platform/admin/rbac/evaluate', {
    params: {
      tenantId: params.tenantId || undefined,
      orgUnitId: params.orgUnitId || undefined,
    },
  });

  return unwrapData<RbacEvaluation>(response.data);
};

export const createTenant = async (input: CreateTenantInput): Promise<Record<string, unknown>> => {
  const response = await api.post<Envelope<Record<string, unknown>>>('/platform/admin/tenants', input);
  return unwrapData<Record<string, unknown>>(response.data);
};

export const createOrgUnit = async (input: CreateOrgUnitInput): Promise<Record<string, unknown>> => {
  const response = await api.post<Envelope<Record<string, unknown>>>('/platform/admin/org-units', input);
  return unwrapData<Record<string, unknown>>(response.data);
};

export const upsertTenantMembership = async (
  input: UpsertTenantMembershipInput
): Promise<Record<string, unknown>> => {
  const response = await api.post<Envelope<Record<string, unknown>>>('/platform/admin/tenant-memberships', input);
  return unwrapData<Record<string, unknown>>(response.data);
};

export const upsertOrgUnitMembership = async (
  input: UpsertOrgUnitMembershipInput
): Promise<Record<string, unknown>> => {
  const response = await api.post<Envelope<Record<string, unknown>>>('/platform/admin/org-unit-memberships', input);
  return unwrapData<Record<string, unknown>>(response.data);
};


export const searchScopedUsers = async (params: {
  query: string;
  tenantId?: string | null;
  limit?: number;
}): Promise<ScopedUser[]> => {
  const response = await api.get<Envelope<{ users: ScopedUser[] }>>('/platform/admin/users/search', {
    params: {
      query: params.query,
      tenantId: params.tenantId || undefined,
      limit: params.limit,
    },
  });

  const data = unwrapData<{ users: ScopedUser[] }>(response.data);
  return Array.isArray(data.users) ? data.users : [];
};

export const createScopedAdminUser = async (
  input: CreateScopedAdminUserInput
): Promise<Record<string, unknown>> => {
  const response = await api.post<Envelope<Record<string, unknown>>>('/platform/admin/users', input);
  return unwrapData<Record<string, unknown>>(response.data);
};
