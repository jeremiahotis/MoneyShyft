import { test, expect } from '@playwright/test';

test.describe('Story 0.3 ATDD RED - platform session store and refresh rotation journey', () => {
  test.skip('shows active refresh session metadata after authenticated entry @P0', async ({ page }) => {
    // Given a user can authenticate into the first-party session flow
    await page.goto('/login');
    await page.getByTestId('auth-email-input').fill('security.engineer@example.com');
    await page.getByTestId('auth-password-input').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // When the user opens session security settings
    await page.getByRole('link', { name: 'Security' }).click();
    await page.getByTestId('session-store-panel').waitFor({ state: 'visible' });

    // Then refresh session metadata is visible and revocation marker is unset
    await expect(page.getByTestId('refresh-token-hash')).toBeVisible();
    await expect(page.getByTestId('refresh-token-expires-at')).toBeVisible();
    await expect(page.getByTestId('refresh-token-revoked-at')).toHaveText('Active');
  });

  test.skip('rotates refresh token and replaces prior session card in security journey @P0', async ({ page }) => {
    // Given a user is on security settings with an active session card
    await page.goto('/settings/security');
    await page.getByTestId('session-store-panel').waitFor({ state: 'visible' });

    // When the user rotates refresh credentials
    await page.getByRole('button', { name: 'Rotate refresh token' }).click();

    // Then previous token is marked revoked and replacement token metadata is shown
    await expect(page.getByTestId('session-rotation-toast')).toBeVisible();
    await expect(page.getByTestId('previous-refresh-token-status')).toHaveText('Revoked');
    await expect(page.getByTestId('active-refresh-token-status')).toHaveText('Active');
  });

  test.skip('blocks replayed or revoked refresh actions with deterministic refusal banner @P1', async ({ page }) => {
    // Given the session panel has a replay/revoke simulation action for diagnostics
    await page.goto('/settings/security');
    await page.getByTestId('session-store-panel').waitFor({ state: 'visible' });

    // When a replayed refresh attempt is triggered
    await page.getByRole('button', { name: 'Replay revoked token' }).click();

    // Then the refusal envelope is surfaced with deterministic security code
    await expect(page.getByTestId('session-refusal-banner')).toBeVisible();
    await expect(page.getByTestId('session-refusal-code')).toHaveText('REFRESH_TOKEN_REPLAY_DETECTED');
  });
});
