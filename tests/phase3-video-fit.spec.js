// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Video fit mobile', () => {
  test('mobile uses contain (full frame), no fit toggle UI', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('fit-chips')).toHaveCount(0);
    const fit = await page.evaluate(() => {
      const frame = document.getElementById('phoneFrame');
      const video = document.getElementById('video');
      return {
        dataFit: frame.getAttribute('data-fit'),
        objectFit: getComputedStyle(video).objectFit
      };
    });
    expect(fit.dataFit).toBe('fit');
    expect(fit.objectFit).toBe('contain');
  });
});
