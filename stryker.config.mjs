// The logic is mutated and not the page: main.ts is the page, scene.ts,
// meshes.ts and matrix.ts its picture, look.ts and sun.ts its light, and
// debug.ts the test API, and none of them is held by a unit test. The rest
// is stepped headless, frame-cost.ts among them: it is the perf gate's measuring
// arithmetic, with a clock of the test's own. The survivors are judged by
// scripts/mutation-check.ts against mutation-baseline.json; break is the
// budget, a score the whole suite may not fall under, set below the first
// run's and raised as the baseline comes down.
export default {
  testRunner: 'vitest',
  mutate: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/scene.ts',
    '!src/meshes.ts',
    '!src/matrix.ts',
    '!src/debug.ts',
    '!src/look.ts',
    '!src/sun.ts',
  ],
  incremental: true,
  reporters: ['clear-text', 'progress', 'json'],
  thresholds: { high: 80, low: 60, break: 50 },
};
