import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: 'deployment.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5298/fair-and-square/' },
  webServer: {
    command: 'npx vite preview --base /fair-and-square/ --port 5298 --strictPort',
    url: 'http://localhost:5298/fair-and-square/',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
