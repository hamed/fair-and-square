import { defineConfig, devices } from '@playwright/test';

// npm run test:browsers: the determinism page in Chromium, Firefox and WebKit. WebKit needs its host libraries
// (on Ubuntu: sudo npx playwright install-deps webkit).
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5199' },
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199/rules.html', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
