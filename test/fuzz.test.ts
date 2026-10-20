/** The monkey itself: it gets about, and a clean seed is clean. `npm run fuzz` is the long form. */
import { describe, expect, it } from 'vitest';
import { fuzz } from '../scripts/fuzzer';

describe('the fuzzer', () => {
  it('plays a seed through without breaking a rule, and does everything a player can', () => {
    // seed 4 does every one of them in 2,000 frames, the viewfinder's and going to find an oddity among them (seed 3
    // did before the seeking, and seed 2 before the viewfinder): a seed that needs longer does not fit the thirty
    // seconds a test is allowed under the mutation gate's instrumentation, and the long form is `npm run fuzz`
    const r = fuzz(4, 2000);
    expect(r.failure, JSON.stringify(r.failure)).toBe(null);
    expect(r.happened.blocked, 'the monkey runs into things').toBeGreaterThan(0);
    expect(r.happened['tracks held at the end'], 'and leaves tracks').toBeGreaterThan(0);
    for (const action of [
      'drive',
      'spin',
      'stop',
      'teleport',
      'zoom',
      'orbit',
      'reload',
      'photo',
      'unphoto',
      'aim',
      'lens',
      'focus',
      'shutter',
      'seek',
    ])
      expect(r.done[action], action).toBeGreaterThan(0);
    expect(r.happened['pictures graded'], 'and takes a picture of something').toBeGreaterThan(0);
    expect(
      Object.keys(r.done).some((k) => k.startsWith('set off for')),
      'sets off somewhere',
    ).toBe(true);
  });

  it('plays the same way twice from a seed', () => {
    expect(fuzz(2, 600)).toEqual(fuzz(2, 600));
  });
});
