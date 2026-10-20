/** The pace gate's working parts: what it drives, and how it decides a figure has moved. */
import { describe, expect, it } from 'vitest';
import { CHECK, moved, paceRun, runs } from '../scripts/pace';

describe('the pace gate', () => {
  it('holds a figure both ways, quicker as much as slower', () => {
    expect(moved(100, 109)).toBe(false);
    expect(moved(100, 111)).toBe(true);
    expect(moved(100, 89)).toBe(true);
  });

  it('times the crossing first, then the village to each ruin', () => {
    const all = runs();
    expect(all[0].name).toBe('west to east');
    expect(all[0].from.x).toBeLessThan(all[0].to.x);
    expect(all.filter((r) => r.name.startsWith('village to')).length).toBeGreaterThanOrEqual(4);
  });

  it('crosses the world in the time the spec gives it', () => {
    const [crossing] = runs();
    const run = paceRun(crossing.name, crossing.from, crossing.to);
    expect(run.finished).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(CHECK.least);
    expect(run.seconds).toBeLessThanOrEqual(CHECK.most);
  });

  it('gives up at the cap, and says so', () => {
    const [crossing] = runs();
    const run = paceRun(crossing.name, crossing.from, crossing.to, 2);
    expect(run.finished).toBe(false);
    expect(run.seconds).toBe(2);
  });
});
