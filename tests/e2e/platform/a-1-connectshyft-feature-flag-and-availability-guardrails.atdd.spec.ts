import { test, expect } from '@playwright/test';

test.describe('Story a.1 ConnectShyft Feature Flag and Availability Guardrails (ATDD E2E RED)', () => {
  test.skip('[P0] module-disabled journey routes operators to explicit unavailable state on ConnectShyft inbox entry @P0', async ({ page }) => {
    await page.goto('/app/connectshyft/inbox');

    await expect(page.getByTestId('connectshyft-unavailable-state')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ConnectShyft unavailable' })).toBeVisible();
    await expect(page.getByText('Enable connectshyft_enabled to access this module.')).toBeVisible();
    await expect(page.getByTestId('connectshyft-inbox-list')).toBeHidden();
  });

  test.skip('[P1] partial-flag journey shows only enabled capabilities and explicit maintenance messaging for disabled ones @P1', async ({ page }) => {
    await page.goto('/app/connectshyft/inbox?flags=module:on,inbox:on,escalation:off,webhooks:on');

    await expect(page.getByRole('heading', { name: 'ConnectShyft Inbox' })).toBeVisible();
    await expect(page.getByTestId('connectshyft-capability-inbox')).toHaveText('Available');
    await expect(page.getByTestId('connectshyft-capability-escalation')).toHaveText('Unavailable');
    await expect(page.getByTestId('connectshyft-capability-maintenance-banner')).toContainText(
      'Escalation controls are temporarily unavailable',
    );
    await expect(page.getByRole('button', { name: 'Claim thread' })).toBeDisabled();
  });

  test.skip('[P1] partial-flag journey keeps webhook-related operator controls hidden and explains why @P1', async ({ page }) => {
    await page.goto('/app/connectshyft/settings/availability?flags=module:on,inbox:on,escalation:on,webhooks:off');

    await expect(page.getByRole('heading', { name: 'ConnectShyft Availability' })).toBeVisible();
    await expect(page.getByTestId('connectshyft-capability-webhooks')).toHaveText('Unavailable');
    await expect(page.getByText('Inbound webhook processing is currently unavailable for this tenant.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay webhook' })).toBeDisabled();
  });
});
