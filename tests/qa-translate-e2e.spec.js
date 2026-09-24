// @ts-check
/**
 * QA: real video ASR → translate each display language → overlay on video.
 * Asserts no NLLB/model bloat; Google/MyMemory only.
 */
const { test, expect } = require('@playwright/test');

/** Target subtitle languages to verify one-by-one (from EN source on TEST1). */
const TARGET_LANGS = ['he', 'ar', 'ru', 'es', 'fr', 'de', 'ja'];

const SCRIPT_HINTS = {
  he: /[\u0590-\u05FF]/,
  ar: /[\u0600-\u06FF]/,
  ru: /[\u0400-\u04FF]/,
  es: /[A-Za-záéíóúñÁÉÍÓÚÑüÜ]/,
  fr: /[A-Za-zàâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/,
  de: /[A-Za-zäöüÄÖÜß]/,
  ja: /[\u3040-\u30ff\u3400-\u9fff]/
};

async function waitReady(page, timeout = 240000) {
  const t0 = Date.now();
  await page.waitForFunction(
    () => {
      const s = window.CaptionsLab && window.CaptionsLab.getReadyState();
      return s === 'ready' || s === 'error';
    },
    null,
    { timeout }
  );
  const state = await page.evaluate(() => window.CaptionsLab.getReadyState());
  expect(state).toBe('ready');
  return Date.now() - t0;
}

async function loadAndTranscribeTest1(page) {
  await page.getByTestId('btn-float-samples').click();
  await page.getByTestId('sample-TEST1').click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector('#video');
      return v && Number(v.duration) > 0;
    },
    null,
    { timeout: 30000 }
  );
  await page.getByTestId('btn-float-transcribe').click();
  await page.waitForFunction(
    () => {
      const t = window.CaptionsLab.getTrack();
      return Array.isArray(t) && t.length > 0;
    },
    null,
    { timeout: 180000 }
  );
  return page.evaluate(() =>
    window.CaptionsLab.getTrack().map((c) => ({
      id: c.id,
      start: c.start,
      end: c.end,
      text: c.text
    }))
  );
}

async function seekShowCaption(page, start) {
  await page.evaluate((t) => {
    const v = document.querySelector('#video');
    v.pause();
    v.currentTime = Math.max(0, t + 0.08);
    window.CaptionsLab.syncFromClock();
  }, start);
  await page.waitForTimeout(150);
}

test.describe('QA: ASR + per-language translate + overlay', () => {
  test.setTimeout(600000);

  test('warm-up is Whisper-only (no NLLB) and finishes reasonably fast', async ({ page }) => {
    const logs = [];
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('[captions-lab]') || t.includes('nllb') || t.includes('warm-up')) {
        logs.push(t);
      }
    });
    await page.goto('/');
    const ms = await waitReady(page);
    const joined = logs.join('\n') + '\n' + (await page.evaluate(() => window.CaptionsLab.getLogs()));
    expect(joined).not.toMatch(/nllb:\s*loading/i);
    expect(await page.evaluate(() => window.CaptionsPolicy.nllbEnabled)).toBe(false);
    expect(await page.evaluate(() => window.CaptionsTranslate.modelId)).toMatch(/google/i);
    // Cached or first download of tiny whisper — hard cap 4 min
    expect(ms).toBeLessThan(240000);
    console.log('[qa] warm-up ms=', ms);
  });

  test('TEST1 transcript then each language translates and shows on video', async ({ page }) => {
    await page.goto('/');
    await waitReady(page);

    const original = await loadAndTranscribeTest1(page);
    expect(original.length).toBeGreaterThan(0);
    const srcText0 = String(original[0].text || '');
    expect(srcText0.length).toBeGreaterThan(0);
    console.log('[qa] source cues=', original.length, 'first=', srcText0.slice(0, 80));

    // Show original on overlay
    await seekShowCaption(page, original[0].start);
    let overlay = await page.evaluate(() => window.CaptionsLab.getOverlayText());
    expect(String(overlay || '').trim().length).toBeGreaterThan(0);

    await page.getByTestId('btn-open-editor').click();
    await expect(page.getByTestId('lang-select')).toBeVisible();

    let prevText = srcText0;
    for (const lang of TARGET_LANGS) {
      const t0 = Date.now();
      await page.getByTestId('lang-select').selectOption(lang);
      await page.waitForFunction(
        (args) => {
          if (window.CaptionsLab.getLang() !== args.lang) return false;
          const t = window.CaptionsLab.getTrack();
          if (!t || !t.length) return false;
          const text = String(t[0].text || '').trim();
          if (!text) return false;
          if (text === args.prev) return false;
          if (args.re) {
            try {
              return new RegExp(args.re).test(text);
            } catch (e) {
              return true;
            }
          }
          return true;
        },
        {
          lang,
          prev: prevText,
          re: SCRIPT_HINTS[lang] ? SCRIPT_HINTS[lang].source : null
        },
        { timeout: 90000 }
      );
      // Ensure translate finished (ready again)
      await page.waitForFunction(
        () => window.CaptionsLab.getReadyState() === 'ready',
        null,
        { timeout: 30000 }
      );
      const elapsed = Date.now() - t0;
      const track = await page.evaluate(() =>
        window.CaptionsLab.getTrack().map((c) => ({
          start: c.start,
          end: c.end,
          text: c.text
        }))
      );
      expect(await page.evaluate(() => window.CaptionsLab.getLang())).toBe(lang);
      expect(track.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(track[i].start).toBeCloseTo(original[i].start, 2);
        expect(track[i].end).toBeCloseTo(original[i].end, 2);
        expect(String(track[i].text || '').trim().length).toBeGreaterThan(0);
      }
      expect(track[0].text).not.toBe(prevText);
      if (SCRIPT_HINTS[lang]) {
        expect(track[0].text).toMatch(SCRIPT_HINTS[lang]);
      }
      await seekShowCaption(page, track[0].start);
      const overlay = await page.evaluate(() => window.CaptionsLab.getOverlayText());
      expect(String(overlay || '').trim().length).toBeGreaterThan(0);
      const slice = String(track[0].text).slice(0, Math.min(8, track[0].text.length));
      expect(String(overlay)).toContain(slice);
      expect(elapsed).toBeLessThan(60000);
      console.log('[qa] lang=', lang, 'ms=', elapsed, 'text=', String(track[0].text).slice(0, 60));
      prevText = track[0].text;
    }

    // Back to source language — original English restored from cache/source
    await page.getByTestId('lang-select').selectOption('en');
    await page.waitForFunction(
      (src) => {
        const t = window.CaptionsLab.getTrack();
        return t && t[0] && t[0].text === src;
      },
      srcText0,
      { timeout: 15000 }
    );
    await seekShowCaption(page, original[0].start);
    overlay = await page.evaluate(() => window.CaptionsLab.getOverlayText());
    expect(String(overlay)).toContain(srcText0.slice(0, Math.min(12, srcText0.length)));

    const logs = await page.evaluate(() => window.CaptionsLab.getLogs());
    expect(logs).not.toMatch(/nllb:\s*loading/i);
    expect(logs).toMatch(/google:|mymemory:/i);
  });
});
