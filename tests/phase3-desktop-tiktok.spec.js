// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Desktop TikTok layout', () => {
  test('fullscreen video + floating sheets, no side panel clutter', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByTestId('float-top')).toBeVisible();
    await expect(page.getByTestId('float-top-actions')).toBeVisible();
    await expect(page.getByTestId('btn-open-style')).toBeVisible();
    await expect(page.getByTestId('btn-open-editor')).toBeVisible();

    const frame = await page.locator('#phoneFrame').boundingBox();
    const cluster = await page.getByTestId('ready-cluster').boundingBox();
    const actionsBox = await page.getByTestId('float-top-actions').boundingBox();
    expect(frame).toBeTruthy();
    expect(cluster).toBeTruthy();
    expect(actionsBox).toBeTruthy();
    expect(cluster.x - frame.x).toBeLessThan(40);
    const frameCenter = frame.x + frame.width / 2;
    const actionsCenter = actionsBox.x + actionsBox.width / 2;
    expect(Math.abs(actionsCenter - frameCenter)).toBeLessThan(40);

    // Editor starts closed (not a permanent side panel)
    await expect(page.getByTestId('editor-sheet')).not.toHaveClass(/is-open/);

    const player = await page.locator('.player-column').boundingBox();
    expect(player.width).toBeGreaterThan(900);
    expect(player.height).toBeGreaterThan(600);

    await page.getByTestId('btn-open-style').click();
    await expect(page.getByTestId('pos-select')).toBeVisible();
    await page.getByTestId('btn-close-style').click();

    await page.getByTestId('btn-open-editor').click();
    await expect(page.getByTestId('editor-sheet')).toHaveClass(/is-open/);
    await expect(page.getByTestId('display-mode-toggle')).toHaveCount(0);
    await expect(page.getByTestId('size-preview')).toHaveCount(0);
    await expect(page.getByTestId('style-chips')).toHaveCount(0);
    await expect(page.getByTestId('source-lang-select')).toBeVisible();
    await expect(page.getByTestId('sheet-backdrop')).toBeVisible();
    await page.getByTestId('btn-close-editor').click();
    await expect(page.getByTestId('editor-sheet')).not.toHaveClass(/is-open/);
  });
});
