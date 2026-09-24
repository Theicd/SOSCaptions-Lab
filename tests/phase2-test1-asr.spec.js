// @ts-check
const { test, expect } = require('@playwright/test');

const EXPECTED = ['tickles', 'going on'];

async function waitVideoReady(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('#video');
    return v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 0;
  });
}

async function waitReady(page) {
  await page.waitForFunction(
    () => window.CaptionsLab && window.CaptionsLab.getReadyState() === 'ready',
    null,
    { timeout: 240000 }
  );
}

test.describe('Phase 2 policy', () => {
  test('whisper + display modes + word timestamps', async ({ page }) => {
    await page.goto('/');
    const p = await page.evaluate(() => window.CaptionsPolicy);
    expect(p.whisperEnabled).toBe(true);
    expect(p.wordTimestamps).toBe(true);
    expect(p.nllbEnabled).toBe(false);
    expect(p.burnIn).toBe(false);
    expect(p.defaultDisplayMode).toBe('movie');
    expect(p.displayModes).toContain('movie');
    expect(p.displayModes).toContain('typing');
  });
});

test.describe('SAMPLE/TEST1 sync + typing', () => {
  test.setTimeout(600000);

  test('first cue starts near speech (~2s+), not at 0; overlay types', async ({ page }) => {
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('[captions-lab]')) console.log(t);
    });

    await page.goto('/');
    await waitReady(page);
    await page.getByTestId('btn-float-samples').click();
    await page.getByTestId('sample-TEST1').click();
    await waitVideoReady(page);

    await page.getByTestId('btn-float-transcribe').click();
    await page.waitForFunction(
      () => window.CaptionsLab && window.CaptionsLab.getTrackSource() === 'whisper' && window.CaptionsLab.getTrack().length > 0,
      null,
      { timeout: 540000 }
    );

    const track = await page.evaluate(() => window.CaptionsLab.getTrack());
    const full = await page.evaluate(() => window.CaptionsLab.getLastFullText().toLowerCase());
    console.log('track', JSON.stringify(track.map((c) => ({ id: c.id, start: c.start, end: c.end, text: c.text }))));

    for (const kw of EXPECTED) expect(full).toContain(kw);

    // First cue must NOT start at silence (speech begins ~2s)
    expect(track[0].start).toBeGreaterThanOrEqual(1.5);
    expect(track[0].text.toLowerCase()).toMatch(/tickle/);

    // At 1.0s — no speech caption yet
    await page.evaluate(() => {
      document.querySelector('#video').currentTime = 1.0;
      window.CaptionsLab.syncFromClock();
    });
    const early = await page.evaluate(() => window.CaptionsLab.getOverlayText());
    expect(early.trim()).toBe('');

    // Mid first cue — movie mode shows full line
    await page.evaluate(() => {
      window.CaptionsLab.applyDisplayMode('movie');
      const t = window.CaptionsLab.getTrack()[0];
      document.querySelector('#video').currentTime = (t.start + t.end) / 2;
      window.CaptionsLab.syncFromClock();
    });
    const mid = (await page.evaluate(() => window.CaptionsLab.getOverlayText())).toLowerCase();
    expect(mid.length).toBeGreaterThan(0);
    expect(mid).toMatch(/tickle/);

    // Typing mode still available for karaoke-style reveal
    await page.evaluate(() => {
      window.CaptionsLab.applyDisplayMode('typing');
      const t = window.CaptionsLab.getTrack()[0];
      document.querySelector('#video').currentTime = t.start + 0.05;
      window.CaptionsLab.syncFromClock();
    });
    const typedEarly = (await page.evaluate(() => window.CaptionsLab.getOverlayText())).toLowerCase();
    expect(typedEarly.length).toBeGreaterThan(0);

    // Near end of first cue — fuller text
    await page.evaluate(() => {
      window.CaptionsLab.applyDisplayMode('movie');
      const t = window.CaptionsLab.getTrack()[0];
      document.querySelector('#video').currentTime = t.end - 0.05;
      window.CaptionsLab.syncFromClock();
    });
    const late = (await page.evaluate(() => window.CaptionsLab.getOverlayText())).toLowerCase();
    expect(late).toMatch(/tickle/);

    // Second cue around later time
    if (track[1]) {
      expect(track[1].start).toBeGreaterThan(track[0].end - 0.2);
    }
  });
});

test.describe('Mobile style sheet', () => {
  test('Aa opens style picker with display modes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('float-top')).toBeVisible();
    await expect(page.getByTestId('style-sheet')).toBeHidden();
    await page.getByTestId('btn-open-style').click();
    await expect(page.getByTestId('style-sheet')).toBeVisible();
    await expect(page.getByTestId('style-grid')).toBeVisible();
    await expect(page.getByTestId('display-mode-toggle-sheet')).toBeVisible();
    await page.getByTestId('btn-close-style').click();
    await expect(page.getByTestId('style-sheet')).toBeHidden();
  });
});

test.describe('Mobile editor sheet', () => {
  test('style sheet can open full editor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByTestId('btn-open-style').click();
    await page.getByTestId('btn-style-to-editor').click();
    await expect(page.getByTestId('editor-sheet')).toHaveClass(/is-open/);
    await expect(page.getByTestId('sheet-backdrop')).toBeVisible();
    await page.getByTestId('btn-close-editor').click();
    await expect(page.getByTestId('editor-sheet')).not.toHaveClass(/is-open/);
  });
});
