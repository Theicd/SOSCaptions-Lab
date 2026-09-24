// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Phase 3 translation switch', () => {
  test('policy keeps NLLB off by default; Whisper multilingual on', async ({ page }) => {
    await page.goto('/');
    const p = await page.evaluate(() => window.CaptionsPolicy);
    expect(p.phase).toBe(3);
    expect(p.nllbEnabled).toBe(false);
    expect(p.whisperModel).toContain('whisper-base');
    expect(p.whisperModel).not.toContain('.en');
    expect(p.nllbCodes.he).toBe('heb_Hebr');
    expect(p.nllbCodes.ru).toBe('rus_Cyrl');
    expect(p.nllbCodes.de).toBe('deu_Latn');
  });

  test('switching display language translates cues and keeps timestamps', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.CaptionsTranslate.translateCues = async function (cues, src, tgt) {
        return cues.map(function (c) {
          const text = '[' + tgt + '] ' + c.text;
          return {
            id: c.id,
            start: c.start,
            end: c.end,
            text: text,
            words: [{ text: text, start: c.start, end: c.end }],
            manual: false
          };
        });
      };
    });

    await page.evaluate(() => {
      const rows = [
        {
          id: 'w1',
          start: 3.1,
          end: 5,
          text: 'That tickles!',
          words: [{ text: 'That tickles!', start: 3.1, end: 5 }]
        },
        {
          id: 'w2',
          start: 6.8,
          end: 10,
          text: "what's going on here?",
          words: [{ text: "what's going on here?", start: 6.8, end: 10 }]
        }
      ];
      // inject session like after ASR
      window.CaptionsLab._testInjectWhisperTrack(rows, 'en');
    });

    await page.getByTestId('lang-select').selectOption('he');
    await page.waitForFunction(() => {
      const t = window.CaptionsLab.getTrack();
      return t.length && String(t[0].text).indexOf('[he]') === 0;
    });

    const track = await page.evaluate(() => window.CaptionsLab.getTrack());
    expect(track[0].start).toBeCloseTo(3.1, 1);
    expect(track[0].end).toBeCloseTo(5, 1);
    expect(track[0].text).toMatch(/^\[he\]/);
    expect(track[1].text).toMatch(/^\[he\]/);

    // switch to Russian — new translation, same times
    await page.getByTestId('lang-select').selectOption('ru');
    await page.waitForFunction(() => {
      const t = window.CaptionsLab.getTrack();
      return t.length && String(t[0].text).indexOf('[ru]') === 0;
    });
    const ru = await page.evaluate(() => window.CaptionsLab.getTrack());
    expect(ru[0].start).toBeCloseTo(3.1, 1);
    expect(ru[0].text).toMatch(/^\[ru\]/);

    // back to original English
    await page.getByTestId('lang-select').selectOption('en');
    await page.waitForFunction(() => {
      const t = window.CaptionsLab.getTrack();
      return t.length && t[0].text === 'That tickles!';
    });
  });
});
