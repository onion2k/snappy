import { describe, expect, it } from 'vitest';
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

  it('has a physics world laid on the map, holding its ground and no bodies, and nothing that must hold broken', () => {
    const { game } = newGame();
    settle(game);
    expect(game.world.live).toBe(0);
    expect(game.world.grid).toEqual(game.map.grid);
    expect(game.world.solid).toBe(game.map.solid);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('starts the rover where the map says, and drives it as asked', () => {
    const { game } = newGame();
    expect(game.rover.x).toBeCloseTo(game.map.start.x, 6);
    expect(game.rover.y).toBeCloseTo(game.map.start.y, 6);
    const x = game.rover.x,
      y = game.rover.y;
    for (let f = 0; f < 60; f++) game.step(DT, { throttle: 1, steer: 0 });
    expect(Math.hypot(game.rover.x - x, game.rover.y - y)).toBeGreaterThan(10);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('stands still with nobody at the controls', () => {
    const { game } = newGame();
    const x = game.rover.x;
    settle(game);
    expect(game.rover.x).toBeCloseTo(x, 6);
  });

  it('writes the save when it is asked to, and not before', () => {
    const { game, store } = newGame(3);
    settle(game);
    expect(store.json).toBe(null);
    game.persist();
    expect(store.json).toBe(JSON.stringify({ muted: false, volume: 1, album: [] }));
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
