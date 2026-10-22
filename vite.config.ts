import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // three pages: the stage (its Rules drawer loads the block editor when first opened), the about page, and how it was made
  build: { rollupOptions: { input: ['index.html', 'about.html', 'making-of.html'] } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // the spec's acceptance runs take a minute: npm run test:accept
    exclude: ['tests/accept/**', 'tests/browser/**', 'node_modules/**'],
    // One worker: this laptop runs short of memory; a test run must never be what tips it over.
    maxWorkers: 1,
    // The long simulations (the demo, a big history's replay) run 4–6 s here when the machine is busy:
    // a timeout is not a finding.
    testTimeout: 20_000,
  },
});
