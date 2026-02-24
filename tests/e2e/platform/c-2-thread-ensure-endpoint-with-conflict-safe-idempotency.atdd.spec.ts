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
  'Story c.2 Thread Ensure Endpoint with Conflict-Safe Idempotency (ATDD E2E RED)',
  () => {
    test.skip(
      '[P0] repeated open-conversation actions route operators to the same active thread card and do not create duplicates @P0',
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

        await page.getByRole('button', { name: 'Open Conversation' }).click();
        await page.getByRole('button', { name: 'Open Conversation' }).click();

        await expect(page.getByTestId('connectshyft-thread-card')).toHaveCount(1);
        await expect(page.getByTestId('connectshyft-thread-state-chip')).toHaveText('UNCLAIMED');
        await expect(page.getByTestId('connectshyft-thread-id-chip')).toContainText('thread-');
      },
    );

    test.skip(
      '[P1] hard refresh and quick re-entry preserve the same thread identity in thread detail while keeping inbox count stable @P1',
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

        await page.getByRole('button', { name: 'Open Conversation' }).click();
        const firstThreadId = await page.getByTestId('connectshyft-thread-id-chip').innerText();

        await page.reload();
        await page.getByRole('button', { name: 'Open Conversation' }).click();
        const secondThreadId = await page.getByTestId('connectshyft-thread-id-chip').innerText();

        expect(secondThreadId).toBe(firstThreadId);
        await expect(page.getByTestId('connectshyft-thread-card')).toHaveCount(1);
      },
    );

    test.skip(
      '[P1] unauthorized operator context shows deterministic refusal guidance and keeps thread composer disabled @P1',
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
