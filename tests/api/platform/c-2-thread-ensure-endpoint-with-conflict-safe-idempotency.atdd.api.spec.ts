import { apiRequest } from '../../support/helpers/apiClient';
import { test, expect } from '../../support/fixtures/connectShyftStoryC2.fixture';

test.describe(
  'Story c.2 Thread Ensure Endpoint with Conflict-Safe Idempotency (ATDD API RED)',
  () => {
    test.skip(
      '[P0] concurrent ensure requests create at most one active thread and all callers receive the same thread identity @P0',
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

        expect(firstBody.data.thread.threadId).toBe(secondBody.data.thread.threadId);
        expect(firstBody.data.thread.state).toBe('UNCLAIMED');
        expect(secondBody.data.thread.state).toBe('UNCLAIMED');
      },
    );

    test.skip(
      '[P0] conflict-safe retries return reused ensure outcome with stable response contract instead of duplicate thread creation @P0',
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

        const createdBody = await createdResponse.json();
        const reusedBody = await reusedResponse.json();

        expect(createdResponse.status()).toBe(201);
        expect(reusedResponse.status()).toBe(201);
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

    test.skip(
      '[P1] malformed ensure payloads are refused with canonical envelope and validation diagnostics without persistence leakage @P1',
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
          message: expect.stringContaining('neighborId'),
        });
        expect(body).not.toHaveProperty('data.sql');
      },
    );

    test.skip(
      '[P1] unauthorized ensure attempts return deterministic no-leak refusals and never expose existing active thread identifiers @P1',
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
  },
);
