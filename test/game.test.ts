import { describe, expect, it } from 'vitest';
import { COLS, FLOOR, ORIGIN_X, ORIGIN_Y, ROWS, TILE, onFloor } from '../src/arena';
import { checkInvariants } from '../src/invariants';
import { DT, newGame, settle } from './helpers';

describe('the game', () => {
  it('starts at time zero, and steps the clock by the time it is given', () => {
    const { game } = newGame();
    expect(game.t).toBe(0);
    game.step(DT);
    game.step(0.5);
    expect(game.t).toBeCloseTo(DT + 0.5, 12);
  });

  it('has a world that holds the floor and the rock and no bodies, and nothing that must hold broken', () => {
    const { game } = newGame();
    settle(game);
    expect(game.world.live).toBe(0);
    expect(game.world.solid).toHaveLength(COLS * ROWS);
    expect(game.world.grid, "the world is laid on the arena's own grid").toEqual({
      cols: COLS,
      rows: ROWS,
      originX: ORIGIN_X,
      originY: ORIGIN_Y,
      tile: TILE,
    });
    expect(onFloor(game.world.solid, (FLOOR.minX + FLOOR.maxX) / 2, (FLOOR.minY + FLOOR.maxY) / 2)).toBe(true);
    expect(onFloor(game.world.solid, FLOOR.minX - 1, 0), 'the rock round the floor').toBe(false);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('writes the save when it is asked to, and not before', () => {
    const { game, store } = newGame(3);
    settle(game);
    expect(store.json).toBe(null);
    game.persist();
    expect(store.json).toBe(JSON.stringify({ muted: false, volume: 1 }));
  });

  it('takes its chance from the source it is given, and can be handed another', () => {
    const { game } = newGame(5);
    const first = game.random();
    game.random = () => 0.25;
    expect(game.random()).toBe(0.25);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });
});
