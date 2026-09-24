// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Caption cue grouping', () => {
  test('TEST1-like words collapse to ~2 readable cues, not 4 flashes', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const chunks = [
        { text: 'That', timestamp: [3.14, 3.4] },
        { text: 'tickles!', timestamp: [3.4, 4.0] },
        { text: "What's", timestamp: [6.64, 6.9] },
        { text: 'the...', timestamp: [6.9, 7.0] },
        { text: "It's", timestamp: [7.94, 7.96] },
        { text: 'going', timestamp: [8.18, 8.5] },
        { text: 'on', timestamp: [8.5, 8.7] },
        { text: 'here!', timestamp: [8.7, 9.0] }
      ];
      const cues = window.CaptionsTiming.wordsToCues(chunks, 10.1);
      return cues.map((c) => ({
        id: c.id,
        start: +c.start.toFixed(2),
        end: +c.end.toFixed(2),
        dur: +(c.end - c.start).toFixed(2),
        text: c.text
      }));
    });

    console.log('grouped', JSON.stringify(result));
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].text.toLowerCase()).toMatch(/tickle/);
    result.forEach((c) => {
      expect(c.dur).toBeGreaterThanOrEqual(0.85);
      expect(c.end).toBeLessThanOrEqual(10.1);
    });
  });

  test('cue past media duration is clamped and disappears after end', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const clamped = window.CaptionsTiming.clampTrackToMedia(
        [{ id: 'w1', start: 0.86, end: 13.8, text: 'Thank you for 60 years.' }],
        10.05
      );
      window.CaptionsLab._testInjectWhisperTrack(clamped, 'en');
      window.CaptionsLab.applyDisplayMode('movie');
      const track = window.CaptionsLab.getTrack();
      const end = track[0].end;
      const v = document.querySelector('#video');
      v.currentTime = end + 0.15;
      window.CaptionsLab.syncFromClock();
      return {
        trackEnd: end,
        overlay: window.CaptionsLab.getOverlayText(),
        active: window.CaptionsLab.getActiveCaption()
      };
    });
    expect(out.trackEnd).toBeLessThanOrEqual(10.05);
    expect(out.overlay.trim()).toBe('');
    expect(out.active).toBeNull();
  });
});
