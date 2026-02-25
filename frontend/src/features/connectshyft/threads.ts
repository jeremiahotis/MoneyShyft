import api from '@/services/api';
import { buildConnectShyftTestOverrideHeaders } from '@/features/connectshyft/flags';

export type ConnectShyftEnsuredThread = {
  threadId: string;
  tenantId: string;
  orgUnitId: string;
  neighborId: string;
  state: 'UNCLAIMED' | 'CLAIMED' | 'CLOSED';
  source: string;
};

type EnsureThreadEnvelope = {
  ok?: boolean;
  code?: string;
  message?: string;
  data?: {
    ensureOutcome?: 'created' | 'reused';
    thread?: Partial<ConnectShyftEnsuredThread>;
  };
};

type EnsureThreadInput = {
  orgUnitId: string;
  neighborId: string;
  source?: string;
  lastInboundCsNumberId?: string;
  preferredOutboundCsNumberId?: string;
};

export type EnsureThreadResult =
  | {
    ok: true;
    ensureOutcome: 'created' | 'reused';
    thread: ConnectShyftEnsuredThread;
  }
  | {
    ok: false;
    code: string;
    message: string;
  };

const parseEnsuredThread = (payload: unknown): ConnectShyftEnsuredThread | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const threadId = typeof candidate.threadId === 'string' ? candidate.threadId.trim() : '';
  const tenantId = typeof candidate.tenantId === 'string' ? candidate.tenantId.trim() : '';
  const orgUnitId = typeof candidate.orgUnitId === 'string' ? candidate.orgUnitId.trim() : '';
  const neighborId = typeof candidate.neighborId === 'string' ? candidate.neighborId.trim() : '';
  const state = typeof candidate.state === 'string' ? candidate.state.trim().toUpperCase() : '';
  const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';

  if (!threadId || !tenantId || !orgUnitId || !neighborId) {
    return null;
  }

  if (state !== 'UNCLAIMED' && state !== 'CLAIMED' && state !== 'CLOSED') {
    return null;
  }

  return {
    threadId,
    tenantId,
    orgUnitId,
    neighborId,
    state,
    source,
  };
};

const parseEnsureEnvelope = (payload: unknown): EnsureThreadEnvelope => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  return payload as EnsureThreadEnvelope;
};

export const ensureConnectShyftThread = async (
  input: EnsureThreadInput,
): Promise<EnsureThreadResult> => {
  try {
    const response = await api.post<EnsureThreadEnvelope>(
      '/connectshyft/threads',
      {
        orgUnitId: input.orgUnitId,
        neighborId: input.neighborId,
        source: input.source || 'VOICE',
        ...(input.lastInboundCsNumberId
          ? { lastInboundCsNumberId: input.lastInboundCsNumberId }
          : {}),
        ...(input.preferredOutboundCsNumberId
          ? { preferredOutboundCsNumberId: input.preferredOutboundCsNumberId }
          : {}),
      },
      {
        headers: buildConnectShyftTestOverrideHeaders(),
      },
    );

    const envelope = parseEnsureEnvelope(response.data);
    const ensuredThread = parseEnsuredThread(envelope.data?.thread);
    const ensureOutcome = envelope.data?.ensureOutcome;

    if (envelope.ok === true && ensuredThread && (ensureOutcome === 'created' || ensureOutcome === 'reused')) {
      return {
        ok: true,
        ensureOutcome,
        thread: ensuredThread,
      };
    }

    return {
      ok: false,
      code: typeof envelope.code === 'string' ? envelope.code : 'CONNECTSHYFT_THREAD_ENSURE_FAILED',
      message: typeof envelope.message === 'string'
        ? envelope.message
        : 'Unable to open this conversation.',
    };
  } catch (error: any) {
    const envelope = parseEnsureEnvelope(error?.response?.data);
    return {
      ok: false,
      code: typeof envelope.code === 'string' ? envelope.code : 'CONNECTSHYFT_THREAD_ENSURE_FAILED',
      message: typeof envelope.message === 'string'
        ? envelope.message
        : 'Unable to open this conversation.',
    };
  }
};
