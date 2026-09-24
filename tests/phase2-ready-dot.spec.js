// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Ready indicator + cache warm-up', () => {
  test.setTimeout(300000);

  test('ready-dot turns green when model is prepared', async ({ page }) => {
    await page.goto('/');
    // Mobile chrome uses floating ready dot; desktop header also updates state.
    const floatDot = page.getByTestId('ready-dot-float');
    await expect(floatDot).toBeVisible();
    await page.waitForFunction(
      () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
      null,
      { timeout: 240000 }
    );
    await expect(floatDot).toHaveAttribute('data-state', 'ready');
  });
});
