import { apiRequest } from '../../support/helpers/apiClient';
import { test, expect } from '../../support/fixtures/connectShyftStoryA1.fixture';

test.describe(
  'Story a.1 automate - connectshyft feature flag and availability guardrails API coverage',
  () => {
    test('[P0] fail-closed module-off blocks inbox with deterministic refusal envelope @P0', async ({
      request,
      storyA1Context,
      storyA1FlagsOffHeaders,
    }) => {
      const response = await apiRequest(request, {
        method: 'GET',
        path: storyA1Context.paths.inbox,
        headers: storyA1FlagsOffHeaders,
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        ok: false,
        code: 'CONNECTSHYFT_MODULE_DISABLED',
        refusalType: 'business',
        message: expect.stringContaining('ConnectShyft is currently unavailable'),
      });
    });

    test('[P0] fail-closed module-off blocks thread ensure and claim actions @P0', async ({
      request,
      storyA1Context,
      storyA1FlagsOffHeaders,
    }) => {
      const ensureResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.threadEnsure,
        headers: storyA1FlagsOffHeaders,
        data: {
          orgUnitId: storyA1Context.orgUnitId,
          neighborId: 'neighbor-a-1001',
        },
      });

      const claimResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.threadClaim,
        headers: storyA1FlagsOffHeaders,
        data: {
          reason: 'operator-claim',
        },
      });

      expect(ensureResponse.status()).toBe(200);
      expect(claimResponse.status()).toBe(200);

      const ensureBody = await ensureResponse.json();
      const claimBody = await claimResponse.json();

      expect(ensureBody).toMatchObject({
        ok: false,
        code: 'CONNECTSHYFT_MODULE_DISABLED',
        refusalType: 'business',
      });
      expect(claimBody).toMatchObject({
        ok: false,
        code: 'CONNECTSHYFT_MODULE_DISABLED',
        refusalType: 'business',
      });
    });

    test('[P1] inbox-only flags keep inbox available while escalation actions are refused @P1', async ({
      request,
      storyA1Context,
      storyA1InboxOnlyHeaders,
    }) => {
      const inboxResponse = await apiRequest(request, {
        method: 'GET',
        path: storyA1Context.paths.inbox,
        headers: storyA1InboxOnlyHeaders,
      });

      const claimResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.threadClaim,
        headers: storyA1InboxOnlyHeaders,
        data: {
          reason: 'operator-claim',
        },
      });

      const takeoverResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.threadTakeover,
        headers: storyA1InboxOnlyHeaders,
        data: {
          reason: 'coverage-check',
        },
      });

      expect(inboxResponse.status()).toBe(200);
      expect(claimResponse.status()).toBe(200);
      expect(takeoverResponse.status()).toBe(200);

      const inboxBody = await inboxResponse.json();
      const claimBody = await claimResponse.json();
      const takeoverBody = await takeoverResponse.json();

      expect(inboxBody).toMatchObject({
        ok: true,
        code: 'CONNECTSHYFT_INBOX_READY',
      });
      expect(inboxBody.data.actions).toMatchObject({
        claim: false,
        takeover: false,
      });
      expect(claimBody).toMatchObject({
        ok: false,
        code: 'CONNECTSHYFT_ESCALATION_CAPABILITY_DISABLED',
        refusalType: 'business',
      });
      expect(takeoverBody).toMatchObject({
        ok: false,
        code: 'CONNECTSHYFT_ESCALATION_CAPABILITY_DISABLED',
        refusalType: 'business',
      });
    });

    test('[P1] all-enabled flags allow inbox escalation actions and webhook processing @P1', async ({
      request,
      storyA1Context,
      storyA1AllEnabledHeaders,
    }) => {
      const inboxResponse = await apiRequest(request, {
        method: 'GET',
        path: storyA1Context.paths.inbox,
        headers: storyA1AllEnabledHeaders,
      });

      const claimResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.threadClaim,
        headers: storyA1AllEnabledHeaders,
        data: {
          reason: 'operator-claim',
        },
      });

      const takeoverResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.threadTakeover,
        headers: storyA1AllEnabledHeaders,
        data: {
          reason: 'operator-takeover',
        },
      });

      const webhookResponse = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.webhookSms,
        headers: storyA1AllEnabledHeaders,
        data: {
          sid: 'SM1234567890-ALLOW',
          from: '+12605550123',
          to: '+12605550999',
          body: 'Enabled state processing check',
        },
      });

      expect(inboxResponse.status()).toBe(200);
      expect(claimResponse.status()).toBe(200);
      expect(takeoverResponse.status()).toBe(200);
      expect(webhookResponse.status()).toBe(200);

      const inboxBody = await inboxResponse.json();
      const claimBody = await claimResponse.json();
      const takeoverBody = await takeoverResponse.json();
      const webhookBody = await webhookResponse.json();

      expect(inboxBody).toMatchObject({
        ok: true,
        code: 'CONNECTSHYFT_INBOX_READY',
      });
      expect(inboxBody.data.actions).toMatchObject({
        claim: true,
        takeover: true,
      });
      expect(claimBody).toMatchObject({
        ok: true,
        code: 'CONNECTSHYFT_THREAD_CLAIM_READY',
      });
      expect(takeoverBody).toMatchObject({
        ok: true,
        code: 'CONNECTSHYFT_THREAD_TAKEOVER_READY',
      });
      expect(webhookBody).toMatchObject({
        ok: true,
        code: 'CONNECTSHYFT_WEBHOOK_ACCEPTED',
      });
    });

    test('[P1] webhooks-disabled flag refuses inbound webhook processing with explicit capability code @P1', async ({
      request,
      storyA1Context,
      storyA1InboxAndEscalationHeaders,
    }) => {
      const response = await apiRequest(request, {
        method: 'POST',
        path: storyA1Context.paths.webhookSms,
        headers: storyA1InboxAndEscalationHeaders,
        data: {
          sid: 'SM1234567890',
          from: '+12605550123',
          to: '+12605550999',
          body: 'Need help with pickup update',
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        ok: false,
        code: 'CONNECTSHYFT_WEBHOOKS_DISABLED',
        refusalType: 'business',
        message: expect.stringContaining('webhook processing is unavailable'),
      });
    });

    test('[P1] disabled-state refusals preserve shared envelope keys and deterministic messaging contracts @P1', async ({
      request,
      storyA1Context,
      storyA1FlagsOffHeaders,
    }) => {
      const response = await apiRequest(request, {
        method: 'GET',
        path: storyA1Context.paths.inbox,
        headers: storyA1FlagsOffHeaders,
      });

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toEqual(
        expect.objectContaining({
          ok: false,
          code: expect.any(String),
          refusalType: expect.any(String),
          message: expect.any(String),
        }),
      );
      expect(String(body.message).length).toBeGreaterThan(10);
    });

    test('[P1] inbox-disabled sub-flag refuses inbox capability even when module is otherwise enabled @P1', async ({
      request,
      storyA1Context,
      storyA1InboxDisabledHeaders,
    }) => {
      const response = await apiRequest(request, {
        method: 'GET',
        path: storyA1Context.paths.inbox,
        headers: storyA1InboxDisabledHeaders,
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        ok: false,
        refusalType: 'business',
      });
      expect(String(body.code).toUpperCase()).toContain('INBOX');
      expect(String(body.message).toLowerCase()).toContain('inbox');
    });
  },
);
