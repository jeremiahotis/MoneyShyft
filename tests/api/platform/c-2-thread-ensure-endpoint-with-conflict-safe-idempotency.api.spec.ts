import { apiRequest } from '../../support/helpers/apiClient';
import { test, expect } from '../../support/fixtures/connectShyftStoryC2.fixture';

const REQUIRED_ENVELOPE_KEYS = ['ok', 'code', 'message', 'correlationId', 'tenantId'];
const createConnectShyftDbClient = () => {
  const knexFactory = require('../../../src/node_modules/knex');
  return knexFactory({
    client: 'postgresql',
    connection: {
      host: process.env.TEST_DB_HOST || '127.0.0.1',
      port: Number(process.env.TEST_DB_PORT || 5432),
      database: process.env.TEST_DB_NAME || 'moneyshyft',
      user: process.env.TEST_DB_USER || 'jeremiahotis',
      password: process.env.TEST_DB_PASSWORD || 'Oiurueu12',
    },
    pool: {
      min: 0,
      max: 2,
    },
  });
};
const connectShyftDb = createConnectShyftDbClient();

const countActiveThreadsForIdentity = async ({
  tenantId,
  orgUnitId,
  neighborId,
}: {
  tenantId: string;
  orgUnitId: string;
  neighborId: string;
}): Promise<number> => {
  const counted = await connectShyftDb
    .withSchema('connectshyft')
    .table('cs_threads')
    .where({
      tenant_id: tenantId,
      org_unit_id: orgUnitId,
      neighbor_id: neighborId,
    })
    .andWhere('state', '<>', 'CLOSED')
    .count<{ count: string | number }>({ count: '*' })
    .first();

  return Number(counted?.count ?? 0);
};

test.describe(
  'Story c.2 automate - thread ensure idempotency API coverage',
  () => {
    test.describe.configure({ mode: 'serial' });
    test.afterAll(async () => {
      await connectShyftDb.destroy();
    });

    test(
      '[P0] concurrent ensure requests converge to one active thread identity and prevent duplicate active records @P0',
      async ({
        request,
        storyC2Context,
        storyC2OperatorHeaders,
        storyC2SecondaryOperatorHeaders,
        storyC2EnsurePayload,
      }) => {
        const uniqueNeighborId = `${storyC2EnsurePayload.neighborId}-concurrency-${Date.now().toString(36)}`;
        const ensurePayload = {
          ...storyC2EnsurePayload,
          neighborId: uniqueNeighborId,
        };

        const [firstResponse, secondResponse] = await Promise.all([
          apiRequest(request, {
            method: 'POST',
            path: storyC2Context.paths.threadsCollection,
            headers: storyC2OperatorHeaders,
            data: ensurePayload,
          }),
          apiRequest(request, {
            method: 'POST',
            path: storyC2Context.paths.threadsCollection,
            headers: storyC2SecondaryOperatorHeaders,
            data: ensurePayload,
          }),
        ]);

        expect(firstResponse.status()).toBe(200);
        expect(secondResponse.status()).toBe(200);

        const firstBody = await firstResponse.json();
        const secondBody = await secondResponse.json();

        expect(firstBody).toMatchObject({
          ok: true,
          code: 'CONNECTSHYFT_THREAD_ENSURED',
          data: {
            thread: {
              tenantId: storyC2Context.tenantId,
              orgUnitId: storyC2Context.orgUnitId,
              neighborId: uniqueNeighborId,
              state: 'UNCLAIMED',
            },
          },
        });
        expect(secondBody).toMatchObject({
          ok: true,
          code: 'CONNECTSHYFT_THREAD_ENSURED',
          data: {
            thread: {
              tenantId: storyC2Context.tenantId,
              orgUnitId: storyC2Context.orgUnitId,
              neighborId: uniqueNeighborId,
              state: 'UNCLAIMED',
            },
          },
        });
        expect(firstBody.data.thread.threadId).toBe(secondBody.data.thread.threadId);

        const activeThreadCount = await countActiveThreadsForIdentity({
          tenantId: storyC2Context.tenantId,
          orgUnitId: storyC2Context.orgUnitId,
          neighborId: uniqueNeighborId,
        });
        expect(activeThreadCount).toBe(1);
      },
    );

    test(
      '[P0] retries of the same ensure payload return reused outcome and stable thread identity contract @P0',
      async ({ request, storyC2Context, storyC2OperatorHeaders, storyC2EnsurePayload }) => {
        const uniqueNeighborId = `${storyC2EnsurePayload.neighborId}-retry-${Date.now().toString(36)}`;
        const ensurePayload = {
          ...storyC2EnsurePayload,
          neighborId: uniqueNeighborId,
        };

        const createdResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: ensurePayload,
        });

        const reusedResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: ensurePayload,
        });

        expect(createdResponse.status()).toBe(200);
        expect(reusedResponse.status()).toBe(200);

        const createdBody = await createdResponse.json();
        const reusedBody = await reusedResponse.json();

        expect(reusedBody).toMatchObject({
          ok: true,
          code: 'CONNECTSHYFT_THREAD_ENSURED',
          data: {
            ensureOutcome: 'reused',
            thread: {
              threadId: createdBody.data.thread.threadId,
              tenantId: storyC2Context.tenantId,
              orgUnitId: storyC2Context.orgUnitId,
              neighborId: uniqueNeighborId,
            },
          },
        });
      },
    );

    test(
      '[P1] client-supplied threadId is rejected with deterministic validation refusal @P1',
      async ({ request, storyC2Context, storyC2OperatorHeaders, storyC2EnsurePayload }) => {
        const response = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: {
            ...storyC2EnsurePayload,
            neighborId: `${storyC2EnsurePayload.neighborId}-threadid-${Date.now().toString(36)}`,
            threadId: '11111111-1111-4111-8111-111111111111',
          },
        });

        expect(response.status()).toBe(200);
        const body = await response.json();

        expect(body).toMatchObject({
          ok: false,
          code: storyC2Context.refusalCodes.invalidContext,
          refusalType: 'validation',
          data: {
            fieldErrors: [
              expect.objectContaining({
                field: 'threadId',
                reason: 'FORBIDDEN',
              }),
            ],
          },
        });
        expect(body).not.toHaveProperty('data.thread');
      },
    );

    test(
      '[P1] malformed ensure payloads are refused with deterministic validation envelope and no persistence leakage @P1',
      async ({ request, storyC2Context, storyC2OperatorHeaders, storyC2MalformedPayload }) => {
        const response = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: storyC2MalformedPayload,
        });

        expect(response.status()).toBe(200);
        const body = await response.json();

        expect(body).toMatchObject({
          ok: false,
          code: storyC2Context.refusalCodes.invalidContext,
          refusalType: 'validation',
          message: expect.any(String),
        });
        expect(body).not.toHaveProperty('data.thread');
        expect(body).not.toHaveProperty('data.sql');
      },
    );

    test(
      '[P1] unauthorized ensure attempts return no-leak refusal semantics and never expose active thread identifiers @P1',
      async ({ request, storyC2Context, storyC2UnauthorizedHeaders, storyC2EnsurePayload }) => {
        const uniqueNeighborId = `${storyC2EnsurePayload.neighborId}-unauth-${Date.now().toString(36)}`;
        const ensurePayload = {
          ...storyC2EnsurePayload,
          neighborId: uniqueNeighborId,
        };

        const response = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2UnauthorizedHeaders,
          data: ensurePayload,
        });

        expect(response.status()).toBe(200);
        const body = await response.json();

        expect(body).toMatchObject({
          ok: false,
          code: storyC2Context.refusalCodes.unauthorized,
          refusalType: 'business',
          message: expect.any(String),
        });
        expect(body).not.toHaveProperty('data.thread');
      },
    );

    test(
      '[P1] success and refusal ensure paths keep canonical envelope keys while preserving deterministic thread id semantics @P1',
      async ({
        request,
        storyC2Context,
        storyC2OperatorHeaders,
        storyC2UnauthorizedHeaders,
        storyC2EnsurePayload,
      }) => {
        const uniqueNeighborId = `${storyC2EnsurePayload.neighborId}-keys-${Date.now().toString(36)}`;
        const ensurePayload = {
          ...storyC2EnsurePayload,
          neighborId: uniqueNeighborId,
        };

        const successResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: ensurePayload,
        });
        const refusalResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2UnauthorizedHeaders,
          data: ensurePayload,
        });

        expect(successResponse.status()).toBe(200);
        expect(refusalResponse.status()).toBe(200);

        const successBody = await successResponse.json();
        const refusalBody = await refusalResponse.json();

        expect(
          REQUIRED_ENVELOPE_KEYS.every((key) =>
            Object.prototype.hasOwnProperty.call(successBody, key),
          ),
        ).toBe(true);
        expect(
          REQUIRED_ENVELOPE_KEYS.every((key) =>
            Object.prototype.hasOwnProperty.call(refusalBody, key),
          ),
        ).toBe(true);
      },
    );
  },
);
