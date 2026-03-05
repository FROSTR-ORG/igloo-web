import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/int/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30_000
  }
});
