// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Upload blob load', () => {
  test('local file upload loads video metadata (no dead blob)', async ({ page }) => {
    await page.goto('/');
    const sample = path.join(__dirname, '..', 'SAMPLE', 'TEST1.mp4');
    expect(fs.existsSync(sample)).toBe(true);

    await page.setInputFiles('[data-testid="file-input"]', sample);

    await page.waitForFunction(() => {
      const v = document.querySelector('#video');
      return v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 0;
    });

    const info = await page.evaluate(() => {
      const v = document.querySelector('#video');
      return {
        duration: v.duration,
        srcKind: String(v.currentSrc || v.src).startsWith('blob:') ? 'blob' : 'other',
        error: v.error ? v.error.code : null
      };
    });

    expect(info.error).toBeNull();
    expect(info.srcKind).toBe('blob');
    expect(info.duration).toBeGreaterThan(1);
  });
});
