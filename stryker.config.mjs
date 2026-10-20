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
    // the models' preview page and its own world, the stick's element, the viewfinder's marks and the album's mount:
    // the page's, seen and not unit-tested
    '!src/preview.ts',
    '!src/models/showcase.ts',
    '!src/touch.ts',
    '!src/hud.ts',
    '!src/albumview.ts',
    // the meshes and colours: pictures, held by their pictures and their triangle ceilings, not by a mutant's survival
    '!src/models/palette.ts',
    '!src/models/scenery.ts',
    '!src/models/built.ts',
    '!src/models/backdrop.ts',
    '!src/models/props.ts',
    // The world's generator and the models' mesh builders are left out (2026-10-20, the user's choice). The first
    // full run over them was on course for two days: every one of their eleven thousand mutants reruns the tests
    // that build the whole world, which take seconds each instrumented. They are held instead by their own tests of
    // what they must make (reached, banked, forded, hashed; triangle ceilings, ground under every vertex), by the
    // fuzzer and determinism over the real world, and by the pictures. What stays of them is the contract's rule of
    // where the rover goes and how the ground is read, which everything else stands on.
    '!src/world/**/*.ts',
    'src/world/drive.ts',
    'src/world/ground.ts',
    '!src/models/**/*.ts',
    'src/models/clouds.ts',
  ],
  incremental: true,
  // the first run over the world: every test driving the real world, instrumented, takes past Stryker's own five
  // minutes before a mutant is tried (2026-10-20); later runs are incremental and try only what changed
  dryRunTimeoutMinutes: 20,
  reporters: ['clear-text', 'progress', 'json'],
  thresholds: { high: 80, low: 60, break: 50 },
};
