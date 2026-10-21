import { describe, expect, it } from 'vitest';
import { generate } from '../../src/world/generate';

describe('the world build, alone', () => {
  // a time says nothing of the code under the mutation gate, where every file runs instrumented many times slower
  it.skipIf(process.env.STRYKER_MUTATOR_WORKER !== undefined)('is made in under 400 ms', () => {
    // run apart from every other test file (vitest.timing.config.ts), so this is the build's own time; the best of
    // five drops a stray garbage collection or a first run's cold code
    let best = Infinity;
    for (let i = 0; i < 5; i++) best = Math.min(best, generate().stats.ms);
    console.log(`buildWorld: ${best.toFixed(0)} ms`);
    expect(best).toBeLessThan(400);
  });
});
