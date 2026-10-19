import { describe, expect, it } from 'vitest';
import { ORIGIN_X, ORIGIN_Y } from '../src/arena';
import type { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { newGame, settle } from './helpers';

/**
 * A body put in the world, to break a rule about bodies with: the world holds none of its own. It is of a kind the
 * world has no radius for, which no rule reads.
 */
function withBody(game: Game, x: number, y: number) {
  return game.world.spawn(0, x, y, 1);
}

describe('what must always hold', () => {
  it('holds of a new game', () => {
    const { game } = newGame();
    settle(game);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a body in the rock, and a body that is not a number', () => {
    const { game } = newGame();
    const slot = withBody(game, 0, 0);
    expect(checkInvariants(game)).toEqual([]);
    game.world.x[slot] = ORIGIN_X + 1;
    game.world.y[slot] = ORIGIN_Y + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/in the rock/);
    game.world.x[slot] = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/not a number/);
  });

  it('reports time that is not finite, or ran backwards', () => {
    const { game } = newGame();
    game.t = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/time is NaN/);
    game.t = Infinity;
    expect(checkInvariants(game).join('\n')).toMatch(/time is Infinity/);
    game.t = -1;
    expect(checkInvariants(game).join('\n')).toMatch(/time is -1/);
    game.t = 0;
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports a volume out of range, or not a number, and a mute that is not a boolean', () => {
    const { game } = newGame();
    const save = game.progress.save;
    for (const volume of [1.5, -0.1, NaN]) {
      save.volume = volume;
      expect(checkInvariants(game).join('\n'), `volume ${volume}`).toMatch(/the volume is/);
    }
    save.volume = 0;
    expect(checkInvariants(game), 'the ends are in range').toEqual([]);
    save.volume = 1;
    expect(checkInvariants(game)).toEqual([]);
    (save as unknown as { muted: unknown }).muted = 'yes';
    expect(checkInvariants(game).join('\n')).toMatch(/the mute is yes/);
  });

  it('reports only the first few of one sort, and counts the rest', () => {
    const { game } = newGame();
    for (let i = 0; i < 5; i++) withBody(game, 0, 0);
    for (let i = 0; i < 5; i++) game.world.x[i] = NaN;
    const out = checkInvariants(game);
    expect(out.filter((l) => l.startsWith('not a number'))).toHaveLength(4);
    expect(out).toContain('not a number: and 2 more');
  });
});
