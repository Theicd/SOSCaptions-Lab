// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8899',
    headless: true,
    viewport: { width: 420, height: 900 }
  },
  webServer: {
    command: 'npx --yes serve -l 8899 .',
    url: 'http://127.0.0.1:8899',
    reuseExistingServer: true,
    timeout: 60000
  }
});
