// @ts-check
/**
 * QA gate: model warm-up shows progress, then SAMPLE TEST1–4 produce captions.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SAMPLES = ['TEST1', 'TEST2', 'TEST3', 'TEST4'];

async function waitReady(page, timeout = 240000) {
  await page.waitForFunction(
    () => {
      const s = window.CaptionsLab && window.CaptionsLab.getReadyState();
      return s === 'ready' || s === 'error';
    },
    null,
    { timeout }
  );
  const state = await page.evaluate(() => window.CaptionsLab.getReadyState());
  expect(state, 'model warm-up must reach ready').toBe('ready');
  await expect(page.getByTestId('ready-dot-float')).toHaveAttribute('data-state', 'ready');
}

async function transcribeSample(page, id) {
  await page.getByTestId('btn-float-samples').click();
  await expect(page.getByTestId('sample-picker')).toBeVisible();
  await page.getByTestId('sample-' + id).click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector('#video');
      return v && v.readyState >= 1 && Number(v.duration) > 0;
    },
    null,
    { timeout: 30000 }
  );
  await page.getByTestId('btn-float-transcribe').click();
  await page.waitForFunction(
    () => {
      const t = window.CaptionsLab && window.CaptionsLab.getTrack && window.CaptionsLab.getTrack();
      return Array.isArray(t) && t.length > 0;
    },
    null,
    { timeout: 180000 }
  );
  const track = await page.evaluate(() => window.CaptionsLab.getTrack());
  expect(track.length).toBeGreaterThan(0);
  expect(String(track[0].text || '').length).toBeGreaterThan(0);
  return track;
}

test.describe('QA: warm-up progress + SAMPLE captions', () => {
  test.setTimeout(900000);

  test('sample files exist on disk', async () => {
    for (const id of SAMPLES) {
      const p = path.join(__dirname, '..', 'SAMPLE', id + '.mp4');
      expect(fs.existsSync(p), p).toBe(true);
    }
  });

  test('warm-up reaches ready and surfaces progress UI', async ({ page }) => {
    const progressSeen = { pct: false, hint: false };
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('warm-up FAIL')) throw new Error(t);
    });

    await page.goto('/');
    await expect(page.getByTestId('ready-cluster')).toBeVisible();
    await expect(page.getByTestId('ready-hint')).toBeVisible();

    // While loading, progress or hint should be visible
    await page.waitForFunction(() => {
      const state = window.CaptionsLab && window.CaptionsLab.getReadyState();
      const hint = document.getElementById('readyHint');
      const prog = document.getElementById('readyProgress');
      if (state === 'loading' || state === 'booting') {
        return !!(hint && hint.textContent && hint.textContent.trim().length);
      }
      return state === 'ready' || state === 'error';
    });

    const mid = await page.evaluate(() => ({
      state: window.CaptionsLab.getReadyState(),
      hint: document.getElementById('readyHint')?.textContent || '',
      progHidden: document.getElementById('readyProgress')?.hidden,
      prog: document.getElementById('readyProgress')?.textContent || ''
    }));
    if (mid.state === 'loading' || mid.state === 'booting') {
      expect(mid.hint.length).toBeGreaterThan(0);
      progressSeen.hint = true;
      if (!mid.progHidden && /%/.test(mid.prog)) progressSeen.pct = true;
    }

    await waitReady(page);
    await expect(page.getByTestId('ready-hint')).toContainText('מוכן');
    await expect(page.getByTestId('ready-dot-float')).toHaveAttribute('data-state', 'ready');
    // Transcribe stays disabled until a video is loaded — load TEST1 and confirm.
    await page.getByTestId('btn-float-samples').click();
    await page.getByTestId('sample-TEST1').click();
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnFloatTranscribe');
      return btn && !btn.disabled;
    });
    await expect(page.getByTestId('btn-float-transcribe')).toBeEnabled();
  });

  for (const id of SAMPLES) {
    test(`ASR produces captions for ${id}`, async ({ page }) => {
      await page.goto('/');
      await waitReady(page);
      const track = await transcribeSample(page, id);
      // Overlay should pick up a cue near first caption start
      const t0 = Math.max(0, Number(track[0].start) + 0.05);
      await page.evaluate((t) => {
        const v = document.querySelector('#video');
        v.currentTime = t;
        window.CaptionsLab.syncFromClock();
      }, t0);
      const text = await page.getByTestId('caption-text').textContent();
      expect(String(text || '').trim().length).toBeGreaterThan(0);
    });
  }
});
