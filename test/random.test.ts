import { describe, expect, it } from 'vitest';
import { seeded } from '../src/random';

describe('chance from a seed', () => {
  it('gives the same numbers from the same seed, everywhere: the first three from seed 1 are written down', () => {
    // Written down, and not only compared run with run, so the generator cannot change under a saved replay or a
    // baseline without this failing: two runs of a changed generator would still agree with each other.
    const random = seeded(1);
    expect(random()).toBe(0.25828632176853716);
    expect(random()).toBe(0.27580974716693163);
    expect(random()).toBe(0.4554710097145289);
  });

  it('gives another game from another seed', () => {
    const a = seeded(1),
      b = seeded(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('keeps every number in [0, 1)', () => {
    const random = seeded(7);
    for (let i = 0; i < 10000; i++) {
      const r = random();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});
