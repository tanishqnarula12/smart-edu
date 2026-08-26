import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // The suite talks to a real database; running files in parallel would let
    // them clobber each other's fixtures.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
