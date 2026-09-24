// @ts-check
const { test, expect } = require('@playwright/test');

async function waitReady(page) {
  await page.waitForFunction(
    () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
    null,
    { timeout: 240000 }
  );
}

async function waitVideoReady(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('#video');
    return v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 0;
  });
}

test.describe('Auto language detection (SubVid-style)', () => {
  test.setTimeout(600000);

  test('auto detects English on TEST1 and surfaces זוהה', async ({ page }) => {
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('[captions-lab]')) console.log(t);
    });

    await page.goto('/');
    await waitReady(page);

    const srcSel = page.getByTestId('source-lang-select');
    await expect(srcSel).toHaveValue('auto');

    await page.getByTestId('btn-float-samples').click();
    await page.getByTestId('sample-TEST1').click();
    await waitVideoReady(page);

    await page.getByTestId('btn-float-transcribe').click();
    await page.waitForFunction(
      () =>
        window.CaptionsLab &&
        window.CaptionsLab.getTrackSource() === 'whisper' &&
        window.CaptionsLab.getTrack().length > 0,
      null,
      { timeout: 540000 }
    );

    const logs = await page.evaluate(() => window.CaptionsLab.getLogs());
    expect(logs).toMatch(/detect:\s*language=/i);
    expect(logs).toMatch(/detected language=en/i);

    const sourceLang = await page.evaluate(() => window.CaptionsLab.getSourceLang());
    expect(sourceLang).toBe('en');

    const pill = page.getByTestId('detected-lang');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText(/זוהה:\s*en/i);

    const full = (await page.evaluate(() => window.CaptionsLab.getLastFullText())).toLowerCase();
    expect(full).toMatch(/tickle/);
  });

  test('forced source lang skips detect and keeps selection', async ({ page }) => {
    await page.goto('/');
    await waitReady(page);
    await page.getByTestId('source-lang-select').selectOption('en');
    await page.getByTestId('btn-float-samples').click();
    await page.getByTestId('sample-TEST1').click();
    await waitVideoReady(page);
    await page.getByTestId('btn-float-transcribe').click();
    await page.waitForFunction(
      () =>
        window.CaptionsLab &&
        window.CaptionsLab.getTrackSource() === 'whisper' &&
        window.CaptionsLab.getTrack().length > 0,
      null,
      { timeout: 540000 }
    );
    const logs = await page.evaluate(() => window.CaptionsLab.getLogs());
    expect(logs).not.toMatch(/detect:\s*encoding audio/i);
    expect(await page.evaluate(() => window.CaptionsLab.getSourceLang())).toBe('en');
  });
});
