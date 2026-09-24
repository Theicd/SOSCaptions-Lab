// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('TikTok UI: size + no log clutter', () => {
  test('Aa sheet has size chips + live preview; asr log hidden', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('asr-log')).toBeHidden();
    await page.getByTestId('btn-open-style').click();
    await expect(page.getByTestId('style-sheet')).toBeVisible();
    await expect(page.getByTestId('size-chips-sheet')).toBeVisible();
    await expect(page.getByTestId('size-preview-sheet')).toBeVisible();

    await page.locator('[data-testid="size-chips-sheet"] [data-size="xl"]').click();
    const size = await page.evaluate(() => window.CaptionsLab.getFontSize());
    expect(size).toBe('xl');
    const attr = await page.evaluate(() =>
      document.getElementById('phoneFrame').getAttribute('data-cap-size')
    );
    expect(attr).toBe('xl');
  });

  test('editor is full-screen on mobile when opened', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('btn-open-style').click();
    await page.getByTestId('btn-style-to-editor').click();
    const box = await page.getByTestId('editor-sheet').boundingBox();
    expect(box).toBeTruthy();
    expect(box.width).toBeGreaterThan(350);
    expect(box.height).toBeGreaterThan(700);
    await expect(page.getByTestId('size-chips')).toHaveCount(0);
    await expect(page.getByTestId('source-lang-select')).toBeVisible();
    await expect(page.getByTestId('lang-select')).toBeVisible();
    await expect(page.getByTestId('asr-log')).toBeHidden();
  });

  test('style change updates size preview sample look', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('btn-open-style').click();
    await page.locator('[data-testid="style-grid"] [data-style="karaoke"]').click();
    const cls = await page.evaluate(() =>
      document.getElementById('sizePreviewBoxSheet').className
    );
    expect(cls).toContain('cap-style-karaoke');
    const color = await page.evaluate(() =>
      getComputedStyle(document.getElementById('sizePreviewSampleSheet')).color
    );
    expect(color).toMatch(/255/);
  });
});
