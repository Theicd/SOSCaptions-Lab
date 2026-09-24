import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('requestfailed', (r) =>
  console.log('REQFAIL', r.url(), r.failure() && r.failure().errorText)
);

await page.goto('http://127.0.0.1:8899/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async (e) => {
  console.log('goto failed, starting serve...', e.message);
});

// Ensure server: try again after short wait if needed
for (let i = 0; i < 5; i++) {
  try {
    await page.goto('http://127.0.0.1:8899/', { waitUntil: 'domcontentloaded', timeout: 5000 });
    break;
  } catch (_) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const workerErr = await page.evaluate(async () => {
  return await new Promise((resolve) => {
    const w = new Worker('workers/whisper.worker.js', { type: 'module' });
    const t = setTimeout(() => resolve({ timeout: true, logs: [] }), 20000);
    const logs = [];
    w.onmessage = (ev) => {
      logs.push(ev.data);
      if (ev.data && (ev.data.type === 'done' || ev.data.type === 'error')) {
        clearTimeout(t);
        resolve({ msg: ev.data, logs });
      }
    };
    w.onerror = (e) => {
      clearTimeout(t);
      resolve({
        errorEvent: true,
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        logs
      });
    };
    w.postMessage({ id: 1, type: 'ensure' });
  });
});

console.log('WORKER_RESULT', JSON.stringify(workerErr, null, 2));
await browser.close();
