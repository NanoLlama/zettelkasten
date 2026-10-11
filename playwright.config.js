import { defineConfig } from '@playwright/test';

// End-to-end tests run the real app (demo mode) in Chromium at iPhone sizes.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8090/',
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'phone-portrait', use: { viewport: { width: 390, height: 844 } } },
    { name: 'phone-landscape', use: { viewport: { width: 844, height: 390 } } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: '8090' },
    url: 'http://localhost:8090/',
    reuseExistingServer: true,
  },
});
