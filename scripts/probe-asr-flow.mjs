import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('captions') || t.includes('ASR') || t.includes('main:') || m.type() === 'error') {
    console.log('CONSOLE', m.type(), t);
  }
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto('http://127.0.0.1:8899/', { waitUntil: 'domcontentloaded' });
await page.getByTestId('btn-test1').click();
await page.waitForFunction(() => {
  const v = document.querySelector('#video');
  return v && v.readyState >= 1 && v.duration > 0;
});
console.log('video ready');
await page.getByTestId('btn-transcribe').click();
console.log('transcribe clicked');

const ok = await page.waitForFunction(
  () => window.CaptionsLab && window.CaptionsLab.getTrackSource() === 'whisper' && window.CaptionsLab.getTrack().length > 0,
  null,
  { timeout: 300000 }
).then(() => true).catch(() => false);

const status = await page.getByTestId('status-text').innerText();
const logs = await page.evaluate(() => window.CaptionsLab.getLogs());
const text = await page.evaluate(() => window.CaptionsLab.getLastFullText());
const overlay = await page.getByTestId('caption-text').innerText();
console.log('OK', ok);
console.log('STATUS', status);
console.log('TEXT', text);
console.log('OVERLAY', overlay);
console.log('LOGS\n', logs);
await browser.close();
process.exit(ok && /tickles/i.test(text) ? 0 : 1);
