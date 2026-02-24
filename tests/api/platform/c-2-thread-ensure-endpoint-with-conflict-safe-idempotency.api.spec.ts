import { apiRequest } from '../../support/helpers/apiClient';
import { test, expect } from '../../support/fixtures/connectShyftStoryC2.fixture';

const REQUIRED_ENVELOPE_KEYS = ['ok', 'code', 'message', 'correlationId', 'tenantId'];

test.describe(
  'Story c.2 automate - thread ensure idempotency API coverage',
  () => {
    test.describe.configure({ mode: 'serial' });

    test.fixme(
      '[P0] concurrent ensure requests converge to one active thread identity and prevent duplicate active records @P0',
      async ({
        request,
        storyC2Context,
        storyC2OperatorHeaders,
        storyC2SecondaryOperatorHeaders,
        storyC2EnsurePayload,
      }) => {
        const [firstResponse, secondResponse] = await Promise.all([
          apiRequest(request, {
            method: 'POST',
            path: storyC2Context.paths.threadsCollection,
            headers: storyC2OperatorHeaders,
            data: storyC2EnsurePayload,
          }),
          apiRequest(request, {
            method: 'POST',
            path: storyC2Context.paths.threadsCollection,
            headers: storyC2SecondaryOperatorHeaders,
            data: storyC2EnsurePayload,
          }),
        ]);

        expect(firstResponse.status()).toBe(201);
        expect(secondResponse.status()).toBe(201);

        const firstBody = await firstResponse.json();
        const secondBody = await secondResponse.json();

        expect(firstBody).toMatchObject({
          ok: true,
          code: 'CONNECTSHYFT_THREAD_ENSURED',
          data: {
            thread: {
              tenantId: storyC2Context.tenantId,
              orgUnitId: storyC2Context.orgUnitId,
              neighborId: storyC2Context.neighborId,
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
              neighborId: storyC2Context.neighborId,
              state: 'UNCLAIMED',
            },
          },
        });
        expect(firstBody.data.thread.threadId).toBe(secondBody.data.thread.threadId);
      },
    );

    test.fixme(
      '[P0] retries of the same ensure payload return reused outcome and stable thread identity contract @P0',
      async ({ request, storyC2Context, storyC2OperatorHeaders, storyC2EnsurePayload }) => {
        const createdResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: storyC2EnsurePayload,
        });

        const reusedResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: storyC2EnsurePayload,
        });

        expect(createdResponse.status()).toBe(201);
        expect(reusedResponse.status()).toBe(201);

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
              neighborId: storyC2Context.neighborId,
            },
          },
        });
      },
    );

    test.fixme(
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

    test.fixme(
      '[P1] unauthorized ensure attempts return no-leak refusal semantics and never expose active thread identifiers @P1',
      async ({ request, storyC2Context, storyC2UnauthorizedHeaders, storyC2EnsurePayload }) => {
        const response = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2UnauthorizedHeaders,
          data: storyC2EnsurePayload,
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

    test.fixme(
      '[P1] success and refusal ensure paths keep canonical envelope keys while preserving deterministic thread id semantics @P1',
      async ({
        request,
        storyC2Context,
        storyC2OperatorHeaders,
        storyC2UnauthorizedHeaders,
        storyC2EnsurePayload,
      }) => {
        const successResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2OperatorHeaders,
          data: storyC2EnsurePayload,
        });
        const refusalResponse = await apiRequest(request, {
          method: 'POST',
          path: storyC2Context.paths.threadsCollection,
          headers: storyC2UnauthorizedHeaders,
          data: storyC2EnsurePayload,
        });

        expect(successResponse.status()).toBe(201);
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
