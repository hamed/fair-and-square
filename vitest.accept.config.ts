import { defineConfig } from 'vitest/config';

// The acceptance runs (npm run test:accept): about 200 M trades, a minute or so, one worker.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/accept/**/*.test.ts'],
    setupFiles: ['tests/accept/yield.ts'],
    maxWorkers: 1,
    testTimeout: 300_000,
  },
});
