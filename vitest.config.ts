import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test/timing/ is run by itself afterwards (vitest.timing.config.ts), so its figures are not read beside other files' workers.
    include: ['test/**/*.test.ts'],
    // Under the mutation gate, the tests that play the whole real world (the fuzzer's, determinism's, the pace
    // gate's, the leak run's and the world's own) are left out: they hold the scripts and the world's generator, which are not
    // mutated, and every mutant of the rover or the camera reran them for seconds each, two hours a run
    // (2026-10-20). The mutated files are judged by their own tests on the fixture world. The scene's tests, which build
    // the whole world's scene, are left out for the same reason: view.ts's mutants are judged by view.test.ts.
    exclude: [
      ...configDefaults.exclude,
      'test/timing/**',
      ...(process.env.STRYKER_MUTATOR_WORKER === undefined
        ? []
        : [
            'test/fuzz.test.ts',
            'test/determinism.test.ts',
            'test/pace.test.ts',
            'test/leaks.test.ts',
            'test/world.test.ts',
            'test/world-graph.test.ts',
            'test/world-parts.test.ts',
            'test/scene.test.ts',
          ]),
    ],
    environment: 'node',
    // A test is timed out only so that one which never ends is caught: how fast the game steps is held by no gate
    // yet, and not by this. Vitest's own five seconds failed tests at random in three games copied from here, each a test
    // that plays the real game for a few seconds, on a busy machine and on a CI runner a third the speed of the
    // one they were written on. The tests here take a thirtieth of a second at most; a game's will not.
    //
    // Under the mutation gate (Stryker sets STRYKER_MUTATOR_WORKER in each of its runners) every file of logic is
    // instrumented with all its mutants at once, and eleven runners share the machine: a test that drives the real
    // world for a couple of thousand frames, a second here, ran past thirty seconds there (2026-10-20). It is given
    // four times as long there, and only there, so a test that never ends is still caught.
    testTimeout: process.env.STRYKER_MUTATOR_WORKER === undefined ? 30_000 : 120_000,
  },
});
