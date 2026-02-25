import {
  AsyncConnectShyftThreadService,
  ConnectShyftThreadService,
  InMemoryConnectShyftThreadStore,
} from '../threads';

describe('connectshyft thread service', () => {
  let store: InMemoryConnectShyftThreadStore;
  let service: ConnectShyftThreadService;

  beforeEach(() => {
    store = new InMemoryConnectShyftThreadStore();
    service = new ConnectShyftThreadService(store);
  });

  it('creates a new active thread and reuses it for repeat ensure requests', () => {
    const created = service.ensureThread({
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: 'neighbor-connectshyft-c2-1001',
      source: 'VOICE',
      lastInboundCsNumberId: 'cs-inbound-c2-001',
      preferredOutboundCsNumberId: 'cs-outbound-c2-001',
    });

    if (!created.ok) {
      throw new Error('Expected first ensure to succeed');
    }

    const reused = service.ensureThread({
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: 'neighbor-connectshyft-c2-1001',
      source: 'VOICE',
      lastInboundCsNumberId: 'cs-inbound-c2-001',
      preferredOutboundCsNumberId: 'cs-outbound-c2-001',
    });

    expect(created).toMatchObject({
      ok: true,
      code: 'CONNECTSHYFT_THREAD_ENSURED',
      data: {
        ensureOutcome: 'created',
        thread: {
          tenantId: 'tenant-connectshyft-c2',
          orgUnitId: 'org-connectshyft-c2-east',
          neighborId: 'neighbor-connectshyft-c2-1001',
          state: 'UNCLAIMED',
        },
      },
    });

    expect(reused).toMatchObject({
      ok: true,
      code: 'CONNECTSHYFT_THREAD_ENSURED',
      data: {
        ensureOutcome: 'reused',
        thread: {
          tenantId: 'tenant-connectshyft-c2',
          orgUnitId: 'org-connectshyft-c2-east',
          neighborId: 'neighbor-connectshyft-c2-1001',
          state: 'UNCLAIMED',
          threadId: created.data.thread.threadId,
        },
      },
    });

    expect(
      store.activeThreadCountForIdentity(
        'tenant-connectshyft-c2',
        'org-connectshyft-c2-east',
        'neighbor-connectshyft-c2-1001',
      ),
    ).toBe(1);
  });

  it('concurrent ensure calls converge to a single active identity', async () => {
    const input = {
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: 'neighbor-connectshyft-c2-2002',
      source: 'VOICE',
    };

    const [first, second] = await Promise.all([
      Promise.resolve().then(() => service.ensureThread(input)),
      Promise.resolve().then(() => service.ensureThread(input)),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      throw new Error('Expected concurrent ensure calls to succeed');
    }

    expect(first.data.thread.threadId).toBe(second.data.thread.threadId);
    expect(
      store.activeThreadCountForIdentity(
        input.tenantId,
        input.orgUnitId,
        input.neighborId,
      ),
    ).toBe(1);
  });

  it('returns deterministic validation refusals for malformed ensure payloads', () => {
    const result = service.ensureThread({
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: '',
      source: 'VOICE',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'CONNECTSHYFT_CONTEXT_INVALID',
      refusalType: 'validation',
      data: {
        fieldErrors: [
          expect.objectContaining({
            field: 'neighborId',
            reason: 'REQUIRED',
          }),
        ],
      },
    });
  });
});

describe('connectshyft async thread service', () => {
  it('falls back to in-memory ensure behavior when persistence schema is unavailable', async () => {
    const unavailableStore = {
      ensureThread: jest.fn(async () => {
        const error = new Error('relation does not exist') as Error & { code: string };
        error.code = '42P01';
        throw error;
      }),
    };

    const fallbackService = new ConnectShyftThreadService(
      new InMemoryConnectShyftThreadStore(),
    );
    const service = new AsyncConnectShyftThreadService(
      unavailableStore as any,
      fallbackService,
    );

    const first = await service.ensureThread({
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: 'neighbor-connectshyft-c2-3003',
      source: 'VOICE',
    });
    const second = await service.ensureThread({
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: 'neighbor-connectshyft-c2-3003',
      source: 'VOICE',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      throw new Error('Expected fallback ensure requests to succeed');
    }

    expect(first.data.ensureOutcome).toBe('created');
    expect(second.data.ensureOutcome).toBe('reused');
    expect(second.data.thread.threadId).toBe(first.data.thread.threadId);
  });

  it('returns conflict refusal when persistence reports conflicting identity', async () => {
    const conflictingStore = {
      ensureThread: jest.fn(async () => ({ ok: false, reason: 'THREAD_ID_CONFLICT' as const })),
    };

    const service = new AsyncConnectShyftThreadService(conflictingStore as any);

    const result = await service.ensureThread({
      tenantId: 'tenant-connectshyft-c2',
      orgUnitId: 'org-connectshyft-c2-east',
      neighborId: 'neighbor-connectshyft-c2-4004',
      source: 'VOICE',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'CONNECTSHYFT_THREAD_ENSURE_CONFLICT',
      refusalType: 'business',
    });
  });

  it('rethrows unexpected persistence errors', async () => {
    const unstableStore = {
      ensureThread: jest.fn(async () => {
        const error = new Error('db connection aborted') as Error & { code: string };
        error.code = 'XX000';
        throw error;
      }),
    };

    const service = new AsyncConnectShyftThreadService(unstableStore as any);

    await expect(
      service.ensureThread({
        tenantId: 'tenant-connectshyft-c2',
        orgUnitId: 'org-connectshyft-c2-east',
        neighborId: 'neighbor-connectshyft-c2-5005',
        source: 'VOICE',
      }),
    ).rejects.toThrow('db connection aborted');
  });
});
