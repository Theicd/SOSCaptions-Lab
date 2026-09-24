// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Cache + ready stability', () => {
  test.setTimeout(300000);

  test('after green ready, stays ready — no NLLB preload', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
      null,
      { timeout: 240000 }
    );
    await expect(page.getByTestId('ready-dot-float')).toHaveAttribute('data-state', 'ready');

    const policy = await page.evaluate(() => window.CaptionsLab.policy);
    expect(policy.nllbEnabled).toBe(false);

    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.CaptionsLab.getReadyState())).toBe('ready');
    const logs = await page.evaluate(() => window.CaptionsLab.getLogs());
    expect(logs).not.toMatch(/nllb: loading/);
  });

  test('second visit reuses HF browser cache store', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
      null,
      { timeout: 240000 }
    );
    await page.waitForTimeout(2000);
    const first = await page.evaluate(async () => {
      if (typeof caches === 'undefined') return { files: -1 };
      const c = await caches.open('sos-captions-transformers-v1');
      return { files: (await c.keys()).length };
    });
    expect(first.files).toBeGreaterThan(0);

    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForFunction(
      () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
      null,
      { timeout: 120000 }
    );
    const second = await page2.evaluate(async () => {
      const c = await caches.open('sos-captions-transformers-v1');
      const logs = window.CaptionsLab.getLogs();
      return { files: (await c.keys()).length, logs };
    });
    expect(second.files).toBeGreaterThanOrEqual(first.files);
    expect(second.logs.includes('cache on') || second.logs.includes('cache health')).toBe(true);
    await page2.close();
  });
});
