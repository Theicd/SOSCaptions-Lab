// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Online translate (Google gtx / MyMemory)', () => {
  test('CaptionsTranslate uses google without NLLB preload', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(() => ({
      nllb: window.CaptionsPolicy.nllbEnabled,
      model: window.CaptionsTranslate.modelId,
      hasFn: typeof window.CaptionsTranslate.translateCues === 'function'
    }));
    expect(info.nllb).toBe(false);
    expect(info.model).toMatch(/google/i);
    expect(info.hasFn).toBe(true);
  });

  test('google translates a short FR→HE phrase', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async () => {
      return window.CaptionsTranslate.translateText('Bonjour', 'fr', 'he', {
        onLog: function () {}
      });
    });
    expect(String(out || '').length).toBeGreaterThan(0);
    // Hebrew letters expected
    expect(out).toMatch(/[\u0590-\u05FF]/);
  });

  test('applyLang after mock whisper track translates and keeps timestamps', async ({
    page
  }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
      null,
      { timeout: 240000 }
    );
    await page.evaluate(() => {
      window.CaptionsLab._testInjectWhisperTrack(
        [
          { id: 'c1', start: 1, end: 3, text: 'Hello world' },
          { id: 'c2', start: 4, end: 6, text: 'Good morning' }
        ],
        'en'
      );
    });
    await page.getByTestId('btn-open-editor').click();
    await page.getByTestId('lang-select').selectOption('he');
    await page.waitForFunction(
      () => {
        const t = window.CaptionsLab.getTrack();
        return t && t[0] && /[\u0590-\u05FF]/.test(t[0].text || '');
      },
      null,
      { timeout: 60000 }
    );
    const track = await page.evaluate(() => window.CaptionsLab.getTrack());
    expect(track[0].start).toBe(1);
    expect(track[0].end).toBe(3);
    expect(track[1].start).toBe(4);
    expect(track[0].text).toMatch(/[\u0590-\u05FF]/);
  });
});
