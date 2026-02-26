// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 90_000,
  retries: 1,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'linux-electron',
      grepInvert: /@windows-only/
    },
    {
      name: 'windows-electron',
      grepInvert: /@linux-only/
    }
  ]
});
