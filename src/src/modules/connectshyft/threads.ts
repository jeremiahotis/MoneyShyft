import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import db from '../../config/knex';

export type ConnectShyftThreadState = 'UNCLAIMED' | 'CLAIMED' | 'CLOSED';
export type ConnectShyftEnsureOutcome = 'created' | 'reused';

export type ConnectShyftThread = {
  threadId: string;
  tenantId: string;
  orgUnitId: string;
  neighborId: string;
  state: ConnectShyftThreadState;
  source: string;
  claimedByUserId: string | null;
  escalationStage: number;
  escalationCount: number;
  nextEvaluationAtUtc: string | null;
  lastInboundCsNumberId: string | null;
  preferredOutboundCsNumberId: string | null;
  lastActivityAtUtc: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type ConnectShyftEnsureThreadCommand = {
  tenantId: string;
  orgUnitId: string;
  neighborId: string;
  source?: string | null;
  lastInboundCsNumberId?: string | null;
  preferredOutboundCsNumberId?: string | null;
  threadId?: string | null;
};

type ThreadStoreEnsureInput = {
  tenantId: string;
  orgUnitId: string;
  neighborId: string;
  source: string;
  lastInboundCsNumberId: string | null;
  preferredOutboundCsNumberId: string | null;
  threadId?: string | null;
};

type ThreadPersistenceResult =
  | {
    ok: true;
    ensureOutcome: ConnectShyftEnsureOutcome;
    thread: ConnectShyftThread;
  }
  | {
    ok: false;
    reason: 'THREAD_ID_CONFLICT';
  };

type ThreadEnsureRefusalResult = {
  ok: false;
  code:
    | 'CONNECTSHYFT_CONTEXT_INVALID'
    | 'CONNECTSHYFT_THREAD_ENSURE_CONFLICT'
    | 'CONNECTSHYFT_THREAD_ENSURE_UNAVAILABLE';
  message: string;
  refusalType: 'validation' | 'business';
  data?: {
    fieldErrors?: Array<{
      field: 'tenantId' | 'orgUnitId' | 'neighborId';
      reason: 'REQUIRED';
      message: string;
    }>;
  };
};

export type ConnectShyftEnsureThreadResult =
  | {
    ok: true;
    code: 'CONNECTSHYFT_THREAD_ENSURED';
    httpStatus: 200;
    data: {
      ensureOutcome: ConnectShyftEnsureOutcome;
      thread: ConnectShyftThread;
    };
  }
  | ThreadEnsureRefusalResult;

type DbThreadRow = {
  id: string;
  tenant_id: string;
  org_unit_id: string;
  neighbor_id: string;
  state: ConnectShyftThreadState;
  source: string;
  claimed_by_user_id: string | null;
  escalation_stage: number;
  escalation_count?: number | null;
  next_evaluation_at_utc: string | Date | null;
  last_inbound_cs_number_id: string | null;
  preferred_outbound_cs_number_id: string | null;
  last_activity_at_utc?: string | Date | null;
  created_at_utc: string | Date;
  updated_at_utc: string | Date;
};

const normalizeNonEmptyString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const normalizeOptionalString = (value: unknown): string | null => {
  const normalized = normalizeNonEmptyString(value);
  return normalized.length > 0 ? normalized : null;
};

const normalizePersistedOptionalString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeThreadSource = (value: unknown): string => {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) {
    return 'VOICE';
  }

  return normalized.toUpperCase();
};

const buildThreadIdentityKey = (
  tenantId: string,
  orgUnitId: string,
  neighborId: string,
): string => `${tenantId}::${orgUnitId}::${neighborId}`;

const nowIsoUtc = (): string => new Date().toISOString();

const toIsoUtc = (value: string | Date | null): string | null => {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString();
  }

  return value;
};

const mapDbRowToThread = (row: DbThreadRow): ConnectShyftThread => ({
  threadId: row.id,
  tenantId: row.tenant_id,
  orgUnitId: row.org_unit_id,
  neighborId: row.neighbor_id,
  state: row.state,
  source: row.source,
  claimedByUserId: row.claimed_by_user_id,
  escalationStage: row.escalation_stage,
  escalationCount: typeof row.escalation_count === 'number'
    ? row.escalation_count
    : 0,
  nextEvaluationAtUtc: toIsoUtc(row.next_evaluation_at_utc),
  lastInboundCsNumberId: normalizePersistedOptionalString(row.last_inbound_cs_number_id),
  preferredOutboundCsNumberId: normalizePersistedOptionalString(row.preferred_outbound_cs_number_id),
  lastActivityAtUtc: toIsoUtc(row.last_activity_at_utc ?? row.updated_at_utc) || nowIsoUtc(),
  createdAtUtc: toIsoUtc(row.created_at_utc) || nowIsoUtc(),
  updatedAtUtc: toIsoUtc(row.updated_at_utc) || nowIsoUtc(),
});

const cloneThread = (thread: ConnectShyftThread): ConnectShyftThread => ({
  ...thread,
});

const isMissingPersistenceError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string };
  return candidate.code === '42P01'
    || candidate.code === '3F000'
    || candidate.code === '42703';
};

const buildMissingContextRefusal = (
  field: 'tenantId' | 'orgUnitId' | 'neighborId',
): ThreadEnsureRefusalResult => ({
  ok: false,
  code: 'CONNECTSHYFT_CONTEXT_INVALID',
  message: `${field} is required to ensure a ConnectShyft thread.`,
  refusalType: 'validation',
  data: {
    fieldErrors: [
      {
        field,
        reason: 'REQUIRED',
        message: `${field} is required to ensure a ConnectShyft thread.`,
      },
    ],
  },
});

const buildThreadEnsureConflictRefusal = (): ThreadEnsureRefusalResult => ({
  ok: false,
  code: 'CONNECTSHYFT_THREAD_ENSURE_CONFLICT',
  message: 'Unable to ensure thread identity right now. Please retry.',
  refusalType: 'business',
});

const buildThreadEnsureUnavailableRefusal = (): ThreadEnsureRefusalResult => ({
  ok: false,
  code: 'CONNECTSHYFT_THREAD_ENSURE_UNAVAILABLE',
  message: 'Thread ensure is temporarily unavailable. Please retry shortly.',
  refusalType: 'business',
});

export class InMemoryConnectShyftThreadStore {
  private threadsById = new Map<string, ConnectShyftThread>();

  private activeThreadIdByIdentity = new Map<string, string>();

  ensureThread(input: ThreadStoreEnsureInput): ThreadPersistenceResult {
    const identityKey = buildThreadIdentityKey(
      input.tenantId,
      input.orgUnitId,
      input.neighborId,
    );

    const existingActiveThreadId = this.activeThreadIdByIdentity.get(identityKey);
    if (existingActiveThreadId) {
      const existingThread = this.threadsById.get(existingActiveThreadId);
      if (existingThread && existingThread.state !== 'CLOSED') {
        return {
          ok: true,
          ensureOutcome: 'reused',
          thread: cloneThread(existingThread),
        };
      }
    }

    const requestedThreadId = normalizeOptionalString(input.threadId);
    if (requestedThreadId) {
      const existingById = this.threadsById.get(requestedThreadId);
      if (existingById) {
        if (
          existingById.tenantId === input.tenantId
          && existingById.orgUnitId === input.orgUnitId
          && existingById.neighborId === input.neighborId
          && existingById.state !== 'CLOSED'
        ) {
          this.activeThreadIdByIdentity.set(identityKey, existingById.threadId);
          return {
            ok: true,
            ensureOutcome: 'reused',
            thread: cloneThread(existingById),
          };
        }

        return {
          ok: false,
          reason: 'THREAD_ID_CONFLICT',
        };
      }
    }

    const threadId = requestedThreadId || randomUUID();
    const now = nowIsoUtc();
    const thread: ConnectShyftThread = {
      threadId,
      tenantId: input.tenantId,
      orgUnitId: input.orgUnitId,
      neighborId: input.neighborId,
      state: 'UNCLAIMED',
      source: input.source,
      claimedByUserId: null,
      escalationStage: 0,
      escalationCount: 0,
      nextEvaluationAtUtc: null,
      lastInboundCsNumberId: input.lastInboundCsNumberId,
      preferredOutboundCsNumberId: input.preferredOutboundCsNumberId,
      lastActivityAtUtc: now,
      createdAtUtc: now,
      updatedAtUtc: now,
    };

    this.threadsById.set(threadId, thread);
    this.activeThreadIdByIdentity.set(identityKey, threadId);

    return {
      ok: true,
      ensureOutcome: 'created',
      thread: cloneThread(thread),
    };
  }

  activeThreadCountForIdentity(
    tenantId: string,
    orgUnitId: string,
    neighborId: string,
  ): number {
    const identityKey = buildThreadIdentityKey(tenantId, orgUnitId, neighborId);
    const threadId = this.activeThreadIdByIdentity.get(identityKey);
    if (!threadId) {
      return 0;
    }

    const thread = this.threadsById.get(threadId);
    if (!thread || thread.state === 'CLOSED') {
      return 0;
    }

    return 1;
  }
}

export class KnexConnectShyftThreadStore {
  constructor(private readonly knexClient: Knex = db) {}

  private threadColumns(): string[] {
    return [
      'id',
      'tenant_id',
      'org_unit_id',
      'neighbor_id',
      'state',
      'source',
      'claimed_by_user_id',
      'escalation_stage',
      'next_evaluation_at_utc',
      'last_inbound_cs_number_id',
      'preferred_outbound_cs_number_id',
      'created_at_utc',
      'updated_at_utc',
    ];
  }

  private async resolveActiveThreadByIdentity(
    executor: Knex | Knex.Transaction,
    input: ThreadStoreEnsureInput,
  ): Promise<ConnectShyftThread | null> {
    const row = await executor
      .withSchema('connectshyft')
      .table('cs_threads')
      .where({
        tenant_id: input.tenantId,
        org_unit_id: input.orgUnitId,
        neighbor_id: input.neighborId,
      })
      .andWhere('state', '<>', 'CLOSED')
      .orderBy('created_at_utc', 'asc')
      .orderBy('id', 'asc')
      .first<DbThreadRow>(this.threadColumns());

    return row ? mapDbRowToThread(row) : null;
  }

  async ensureThread(input: ThreadStoreEnsureInput): Promise<ThreadPersistenceResult> {
    const threadId = normalizeOptionalString(input.threadId) || randomUUID();

    try {
      return await this.knexClient.transaction(async (trx) => {
        const returningColumns = this.threadColumns().join(', ');
        const insertedResult = await trx.raw(
          `
          INSERT INTO connectshyft.cs_threads (
            id,
            tenant_id,
            org_unit_id,
            neighbor_id,
            state,
            source,
            claimed_by_user_id,
            escalation_stage,
            next_evaluation_at_utc,
            last_inbound_cs_number_id,
            preferred_outbound_cs_number_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING
          RETURNING ${returningColumns}
          `,
          [
            threadId,
            input.tenantId,
            input.orgUnitId,
            input.neighborId,
            'UNCLAIMED',
            input.source,
            null,
            0,
            null,
            input.lastInboundCsNumberId || '',
            input.preferredOutboundCsNumberId || '',
          ],
        ) as { rows?: DbThreadRow[] };

        const inserted = insertedResult.rows?.[0];
        if (inserted) {
          return {
            ok: true,
            ensureOutcome: 'created',
            thread: mapDbRowToThread(inserted),
          } as ThreadPersistenceResult;
        }

        const existing = await this.resolveActiveThreadByIdentity(trx, input);
        if (!existing) {
          return {
            ok: false,
            reason: 'THREAD_ID_CONFLICT',
          } as ThreadPersistenceResult;
        }

        return {
          ok: true,
          ensureOutcome: 'reused',
          thread: existing,
        } as ThreadPersistenceResult;
      });
    } catch (error) {
      throw error;
    }
  }
}

export class ConnectShyftThreadService {
  constructor(
    private readonly store: InMemoryConnectShyftThreadStore = defaultThreadStore,
  ) {}

  ensureThread(input: ConnectShyftEnsureThreadCommand): ConnectShyftEnsureThreadResult {
    const tenantId = normalizeNonEmptyString(input.tenantId);
    if (!tenantId) {
      return buildMissingContextRefusal('tenantId');
    }

    const orgUnitId = normalizeNonEmptyString(input.orgUnitId);
    if (!orgUnitId) {
      return buildMissingContextRefusal('orgUnitId');
    }

    const neighborId = normalizeNonEmptyString(input.neighborId);
    if (!neighborId) {
      return buildMissingContextRefusal('neighborId');
    }

    const persisted = this.store.ensureThread({
      tenantId,
      orgUnitId,
      neighborId,
      source: normalizeThreadSource(input.source),
      lastInboundCsNumberId: normalizeOptionalString(input.lastInboundCsNumberId),
      preferredOutboundCsNumberId: normalizeOptionalString(input.preferredOutboundCsNumberId),
      threadId: normalizeOptionalString(input.threadId),
    });

    if (!persisted.ok) {
      return buildThreadEnsureConflictRefusal();
    }

    return {
      ok: true,
      code: 'CONNECTSHYFT_THREAD_ENSURED',
      httpStatus: 200,
      data: {
        ensureOutcome: persisted.ensureOutcome,
        thread: persisted.thread,
      },
    };
  }
}

const defaultThreadStore = new InMemoryConnectShyftThreadStore();
const defaultKnexThreadStore = new KnexConnectShyftThreadStore();

export const connectShyftThreadService = new ConnectShyftThreadService(defaultThreadStore);

export class AsyncConnectShyftThreadService {
  constructor(
    private readonly store: KnexConnectShyftThreadStore = defaultKnexThreadStore,
  ) {}

  async ensureThread(input: ConnectShyftEnsureThreadCommand): Promise<ConnectShyftEnsureThreadResult> {
    const tenantId = normalizeNonEmptyString(input.tenantId);
    if (!tenantId) {
      return buildMissingContextRefusal('tenantId');
    }

    const orgUnitId = normalizeNonEmptyString(input.orgUnitId);
    if (!orgUnitId) {
      return buildMissingContextRefusal('orgUnitId');
    }

    const neighborId = normalizeNonEmptyString(input.neighborId);
    if (!neighborId) {
      return buildMissingContextRefusal('neighborId');
    }

    const normalizedInput: ThreadStoreEnsureInput = {
      tenantId,
      orgUnitId,
      neighborId,
      source: normalizeThreadSource(input.source),
      lastInboundCsNumberId: normalizeOptionalString(input.lastInboundCsNumberId),
      preferredOutboundCsNumberId: normalizeOptionalString(input.preferredOutboundCsNumberId),
      threadId: normalizeOptionalString(input.threadId),
    };

    try {
      const persisted = await this.store.ensureThread(normalizedInput);
      if (!persisted.ok) {
        return buildThreadEnsureConflictRefusal();
      }

      return {
        ok: true,
        code: 'CONNECTSHYFT_THREAD_ENSURED',
        httpStatus: 200,
        data: {
          ensureOutcome: persisted.ensureOutcome,
          thread: persisted.thread,
        },
      };
    } catch (error) {
      if (!isMissingPersistenceError(error)) {
        throw error;
      }

      return buildThreadEnsureUnavailableRefusal();
    }
  }
}

export const connectShyftThreadServiceAsync = new AsyncConnectShyftThreadService();
