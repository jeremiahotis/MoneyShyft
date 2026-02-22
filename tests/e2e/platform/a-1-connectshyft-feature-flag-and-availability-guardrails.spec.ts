import { test, expect } from '../../support/fixtures/connectShyftStoryA1.fixture';
import type { Page } from '@playwright/test';

const loginAsOperator = async (page: Page) => {
  await page.goto('/login');
  await page.fill('#email', process.env.TEST_EMAIL || 'operator@example.com');
  await page.fill('#password', process.env.TEST_PASSWORD || 'SecurePass123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
};

test.describe(
  'Story a.1 automate - connectshyft feature flag and availability guardrails operator journeys',
  () => {
    test.beforeEach(async ({ page }) => {
      await loginAsOperator(page);
    });

    test('[P0] module-disabled journey renders unavailable state and blocks inbox surfaces @P0', async ({
      page,
      storyA1Context,
    }) => {
      await page.goto(storyA1Context.paths.inboxUi);

      await expect(page.getByTestId('connectshyft-unavailable-state')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'ConnectShyft unavailable' }),
      ).toBeVisible();
      await expect(
        page.getByText('Enable connectshyft_enabled to access this module.'),
      ).toBeVisible();
      await expect(page.getByTestId('connectshyft-inbox-list')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Claim thread' })).toBeHidden();
    });

    test('[P1] partial-flag journey exposes inbox while escalation controls stay unavailable @P1', async ({
      page,
      storyA1Context,
    }) => {
      await page.goto(
        `${storyA1Context.paths.inboxUi}?flags=module:on,inbox:on,escalation:off,webhooks:on`,
      );

      await expect(page.getByRole('heading', { name: 'ConnectShyft Inbox' })).toBeVisible();
      await expect(page.getByTestId('connectshyft-capability-inbox')).toHaveText(
        'Available',
      );
      await expect(page.getByTestId('connectshyft-capability-escalation')).toHaveText(
        'Unavailable',
      );
      await expect(
        page.getByTestId('connectshyft-capability-maintenance-banner'),
      ).toContainText('Escalation controls are temporarily unavailable');
      await expect(page.getByRole('button', { name: 'Claim thread' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Take over thread' })).toBeDisabled();
    });

    test('[P1] inbox-disabled journey keeps inbox list hidden and explains capability-specific unavailability @P1', async ({
      page,
      storyA1Context,
    }) => {
      await page.goto(
        `${storyA1Context.paths.inboxUi}?flags=module:on,inbox:off,escalation:on,webhooks:on`,
      );

      await expect(page.getByRole('heading', { name: 'ConnectShyft unavailable' })).toBeVisible();
      await expect(page.getByTestId('connectshyft-capability-inbox')).toHaveText(
        'Unavailable',
      );
      await expect(page.getByText(/inbox.+unavailable/i)).toBeVisible();
      await expect(page.getByTestId('connectshyft-inbox-list')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Compose message' })).toBeHidden();
    });

    test('[P1] webhooks-disabled journey hides replay controls and shows explicit maintenance explanation @P1', async ({
      page,
      storyA1Context,
    }) => {
      await page.goto(
        `${storyA1Context.paths.availabilityUi}?flags=module:on,inbox:on,escalation:on,webhooks:off`,
      );

      await expect(
        page.getByRole('heading', { name: 'ConnectShyft Availability' }),
      ).toBeVisible();
      await expect(page.getByTestId('connectshyft-capability-webhooks')).toHaveText(
        'Unavailable',
      );
      await expect(
        page.getByText(
          'Inbound webhook processing is currently unavailable for this tenant.',
        ),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Replay webhook' })).toBeDisabled();
      await expect(
        page.getByTestId('connectshyft-capability-maintenance-banner'),
      ).toContainText('Webhook processing is temporarily unavailable');
    });
  },
);
