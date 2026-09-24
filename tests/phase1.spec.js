// @ts-check
const { test, expect } = require('@playwright/test');

async function loadSample(page) {
  await page.goto('/');
  await page.evaluate(() => window.CaptionsLab.loadSample());
  await page.waitForFunction(() => {
    const v = document.querySelector('#video');
    return v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 0;
  });
  await page.waitForFunction(() => window.CaptionsLab && window.CaptionsLab.getTrack().length > 0);
}

test.describe('Phase 1 policy lock', () => {
  test('mock-only, no AI, no burn-in, no SOS', async ({ page }) => {
    await page.goto('/');
    const p = await page.evaluate(() => window.CaptionsPolicy);
    expect(p.burnIn).toBe(false);
    expect(p.exportVideo).toBe(false);
    expect(p.sosWire).toBe(false);
    expect(p.overlaySyncSource).toBe('video.currentTime');
    expect(p.nllbEnabled).toBe(false);
  });
});

test.describe('Upload / sample', () => {
  test('sample video loads and enables transport', async ({ page }) => {
    await loadSample(page);
    await expect(page.getByTestId('drop-hint')).toBeHidden();
    await expect(page.getByTestId('btn-play')).toBeEnabled();
    await expect(page.getByTestId('scrub')).toBeEnabled();
  });
});

test.describe('Overlay sync', () => {
  test('caption follows seek to known cue', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => {
      const v = document.querySelector('#video');
      v.currentTime = 2.0;
      window.CaptionsLab.syncFromClock();
    });
    const text = page.getByTestId('caption-text');
    await expect(text).toHaveAttribute('data-cap-id', 'c2');
    await expect(text).toContainText(/overlay|שכבה|слой|capa|طبقة/i);

    await page.evaluate(() => {
      const v = document.querySelector('#video');
      v.currentTime = 6.0;
      window.CaptionsLab.syncFromClock();
    });
    await expect(text).toHaveAttribute('data-cap-id', 'c5');
  });

  test('pause keeps current caption stable', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(async () => {
      const v = document.querySelector('#video');
      v.currentTime = 3.5;
      window.CaptionsLab.syncFromClock();
      await v.play();
    });
    await page.waitForTimeout(200);
    await page.getByTestId('btn-pause').click();
    const idBefore = await page.getByTestId('caption-text').getAttribute('data-cap-id');
    await page.waitForTimeout(300);
    const idAfter = await page.getByTestId('caption-text').getAttribute('data-cap-id');
    expect(idAfter).toBe(idBefore);
  });

  test('playbackRate change still maps by currentTime', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => {
      document.querySelector('#video').playbackRate = 2;
      const v = document.querySelector('#video');
      v.currentTime = 4.8;
      window.CaptionsLab.syncFromClock();
    });
    await expect(page.getByTestId('caption-text')).toHaveAttribute('data-cap-id', 'c4');
    const rate = await page.evaluate(() => document.querySelector('#video').playbackRate);
    expect(rate).toBe(2);
  });
});

test.describe('Language + RTL', () => {
  test('switch to Hebrew updates text and RTL', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => {
      document.querySelector('#video').currentTime = 1.0;
      window.CaptionsLab.syncFromClock();
    });
    await page.getByTestId('lang-select').selectOption('he');
    const overlay = page.locator('#captionOverlay');
    await expect(overlay).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('caption-text')).toContainText('ברוכים');
  });

  test('Arabic is RTL; English is LTR', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('lang-select').selectOption('ar');
    await expect(page.locator('#captionOverlay')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('lang-select').selectOption('en');
    await expect(page.locator('#captionOverlay')).toHaveAttribute('dir', 'ltr');
  });

  test('Spanish track without reload', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => {
      document.querySelector('#video').currentTime = 1.0;
      window.CaptionsLab.syncFromClock();
    });
    await page.getByTestId('lang-select').selectOption('es');
    await expect(page.getByTestId('caption-text')).toContainText('Bienvenido');
  });
});

test.describe('Styles + position', () => {
  test('style chips switch CSS class', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/');
    await page.getByTestId('btn-open-style').click();
    await page.locator('[data-testid="style-grid"] [data-style="neon"]').click();
    await expect(page.locator('#phoneFrame')).toHaveClass(/cap-style-neon/);
    await page.locator('[data-testid="style-grid"] [data-style="boxed"]').click();
    await expect(page.locator('#phoneFrame')).toHaveClass(/cap-style-boxed/);
  });

  test('position attribute updates', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('btn-open-style').click();
    await page.getByTestId('pos-select').selectOption('top');
    await expect(page.locator('#captionOverlay')).toHaveAttribute('data-position', 'top');
  });
});

test.describe('Editor cards', () => {
  test('edit card updates live overlay', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => window.CaptionsLab.openEditor());
    await page.evaluate(() => {
      document.querySelector('#video').currentTime = 1.0;
      window.CaptionsLab.syncFromClock();
    });
    await expect(page.getByTestId('caption-text')).toHaveAttribute('data-cap-id', 'c1');
    await page.getByTestId('cap-edit-c1').fill('LIVE EDIT MARKER');
    await expect(page.getByTestId('caption-text')).toHaveText('LIVE EDIT MARKER');
  });

  test('click card seeks to cue start', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => window.CaptionsLab.openEditor());
    await page.getByTestId('cap-seek-c6').click();
    const t = await page.evaluate(() => document.querySelector('#video').currentTime);
    expect(t).toBeGreaterThanOrEqual(7.0);
    expect(t).toBeLessThan(8.0);
    await expect(page.getByTestId('caption-text')).toHaveAttribute('data-cap-id', 'c6');
  });
});

test.describe('Scrubber', () => {
  test('scrub input seeks and syncs caption', async ({ page }) => {
    await loadSample(page);
    await page.evaluate(() => {
      const scrub = document.querySelector('#scrub');
      scrub.value = '7.5';
      scrub.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.getByTestId('caption-text')).toHaveAttribute('data-cap-id', 'c6');
  });
});
