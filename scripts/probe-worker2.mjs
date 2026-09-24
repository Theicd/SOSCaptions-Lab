import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack));
page.on('requestfailed', (r) =>
  console.log('REQFAIL', r.url(), r.failure() && r.failure().errorText)
);
page.on('response', async (r) => {
  if (r.url().includes('worker') || r.url().includes('transformers') || r.url().includes('onnx')) {
    console.log('RESP', r.status(), r.url().slice(0, 120));
  }
});

await page.goto('http://127.0.0.1:8899/', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  return await new Promise((resolve) => {
    const w = new Worker(
      new URL('workers/whisper.worker.js', location.href),
      { type: 'module' }
    );
    const t = setTimeout(() => resolve({ timeout: true }), 15000);
    w.addEventListener('message', (ev) => {
      clearTimeout(t);
      resolve({ message: ev.data });
    });
    w.addEventListener('error', (e) => {
      clearTimeout(t);
      resolve({
        error: true,
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        errorObj: e.error ? String(e.error) : null
      });
    });
    // don't post yet — wait for import failure
  });
});

console.log('RESULT', JSON.stringify(result, null, 2));
await browser.close();
