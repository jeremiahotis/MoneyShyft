import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth';
import {
  createStoryC2Context,
  type StoryC2Context,
} from '../../support/factories/connectShyftStoryC2Factory';

const buildInboxUrl = (
  context: StoryC2Context,
  options: {
    actorUserId: string;
    tenantRole: string;
    orgUnitMemberships: string[];
  },
): string => {
  const params = new URLSearchParams({
    flags: 'module:on,inbox:on,escalation:on,webhooks:on',
    tenantId: context.tenantId,
    orgUnitId: context.orgUnitId,
    actorUserId: options.actorUserId,
    tenantRole: options.tenantRole,
    orgUnitMemberships: options.orgUnitMemberships.join(','),
  });

  return `${context.paths.inboxUi}?${params.toString()}`;
};

test.describe(
  'Story c.2 automate - thread ensure idempotency operator journeys',
  () => {
    test.describe.configure({ mode: 'serial' });

    test(
      '[P0] repeated open-conversation actions route operators to the same active thread card without duplicates @P0',
      async ({ page }) => {
        const context = createStoryC2Context();
        await login(page);

        await page.goto(
          buildInboxUrl(context, {
            actorUserId: context.userId,
            tenantRole: 'ORGUNIT_MEMBER',
            orgUnitMemberships: [context.orgUnitId],
          }),
        );

        const firstEnsureResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/connectshyft/threads')
            && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Open Conversation' }).click();
        await firstEnsureResponse;

        const secondEnsureResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/connectshyft/threads')
            && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Open Conversation' }).click();
        await secondEnsureResponse;

        await expect(page.getByTestId('connectshyft-thread-card')).toHaveCount(1);
        await expect(page.getByTestId('connectshyft-thread-state-chip')).toHaveText('UNCLAIMED');
      },
    );

    test(
      '[P1] hard refresh and rapid re-entry preserve identical thread identity while inbox active-thread count stays stable @P1',
      async ({ page }) => {
        const context = createStoryC2Context();
        await login(page);

        await page.goto(
          buildInboxUrl(context, {
            actorUserId: context.userId,
            tenantRole: 'ORGUNIT_MEMBER',
            orgUnitMemberships: [context.orgUnitId],
          }),
        );

        const initialEnsureResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/connectshyft/threads')
            && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Open Conversation' }).click();
        await initialEnsureResponse;

        const firstThreadId = await page.getByTestId('connectshyft-thread-id-chip').innerText();

        await page.reload();

        const secondEnsureResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/connectshyft/threads')
            && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Open Conversation' }).click();
        await secondEnsureResponse;

        const secondThreadId = await page.getByTestId('connectshyft-thread-id-chip').innerText();
        expect(secondThreadId).toBe(firstThreadId);
        await expect(page.getByTestId('connectshyft-thread-card')).toHaveCount(1);
      },
    );

    test(
      '[P1] unauthorized operator context renders deterministic refusal guidance and keeps open-conversation controls disabled @P1',
      async ({ page }) => {
        const context = createStoryC2Context();
        await login(page);

        await page.goto(
          buildInboxUrl(context, {
            actorUserId: context.unauthorizedActorUserId,
            tenantRole: 'TENANT_VIEWER',
            orgUnitMemberships: [],
          }),
        );

        await expect(page.getByTestId('connectshyft-inbox-refusal-banner')).toContainText(
          'You do not have permission to open this conversation.',
        );
        await expect(page.getByRole('button', { name: 'Open Conversation' })).toBeDisabled();
      },
    );
  },
);
