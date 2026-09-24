import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('requestfailed', (r) =>
  console.log('REQFAIL', r.url(), r.failure() && r.failure().errorText)
);

await page.goto('http://127.0.0.1:8899/');
const out = await page.evaluate(async () => {
  try {
    const m = await import('/node_modules/@huggingface/transformers/dist/transformers.web.js');
    return { ok: true, keys: Object.keys(m).slice(0, 8) };
  } catch (e) {
    return { ok: false, err: String(e && e.message ? e.message : e) };
  }
});
console.log('MAIN', JSON.stringify(out));
await browser.close();
