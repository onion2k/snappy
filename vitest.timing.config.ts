import { defineConfig } from 'vitest/config';

// The tests that read a clock, run alone and after the rest (`npm run test:timing`): beside the other files' workers
// a single-threaded build read 401-446 ms for what is 332-346 on its own (2026-10-21), and neither the wall clock nor
// the CPU time (up to 408 ms) is the build's own once the cores are shared. One file at a time, so the limit stays
// the limit and is not loosened to the noise of its neighbours.
export default defineConfig({
  test: {
    include: ['test/timing/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
