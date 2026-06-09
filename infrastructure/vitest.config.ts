import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // NodejsFunction bundling during synth can be slow on first run.
    testTimeout: 120_000,
  },
});
