/**
 * The photo mode as the game plays it, on the fixture world: into the viewfinder and out, the rover stood still
 * while the player looks and its head turned with the view, the UFOs bobbing by game time, and the shutter grading
 * the picture and telling of it. The grade's own terms are `score.test.ts`'s, and the viewfinder's `viewfinder.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { Game, type GameEvents } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { ufoBob } from '../src/models/oddities';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import type { Grade } from '../src/score';
import { LENS } from '../src/viewfinder';
import { FIXTURE_DUCK, FIXTURE_WATER, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { ODDITIES } from '../src/world/oddities';
import { DT } from './helpers';

const map = fixtureWorld();
const [duckX, duckY] = fixtureAt(...FIXTURE_DUCK);

/** A game on the fixture, telling what it tells into `told`. */
function fixtureGame(told: number[] = []) {
  const events: GameEvents = { photo: (g: Grade) => told.push(g.total) };
  return new Game(new Progress(memoryStore()), { random: seeded(1), map, events });
}

/** The rover stood 30 east of the fixture's duck, facing it, and the viewfinder raised and tilted down at it. */
function atTheDuck(game: Game) {
  game.rover.teleport(duckX + 32, duckY, Math.PI);
  game.photo(true);
  const vf = game.viewfinder;
  const dx = duckX - vf.eye[0],
    dz = FIXTURE_WATER + 1.2 - vf.eye[2];
  vf.look(0, Math.atan2(dz, Math.abs(dx)));
  game.step(DT);
}

describe('into the viewfinder and out', () => {
  it('enters at the rover eye, and stops the rover dead though it is driven', () => {
    const game = fixtureGame();
    for (let f = 0; f < 40; f++) game.step(DT, { throttle: 1, steer: 0.3 });
    expect(Math.abs(game.rover.speed)).toBeGreaterThan(1);
    game.photo(true);
    expect(game.viewfinder.active).toBe(true);
    expect(game.rover.speed).toBe(0);
    const { x, y, yaw } = game.rover;
    for (let f = 0; f < 120; f++) game.step(DT, { throttle: 1, steer: 1 });
    expect([game.rover.x, game.rover.y, game.rover.yaw]).toEqual([x, y, yaw]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('gives the controls back on leaving', () => {
    const game = fixtureGame();
    game.photo(true);
    game.photo(false);
    expect(game.viewfinder.active).toBe(false);
    const x = game.rover.x;
    for (let f = 0; f < 60; f++) game.step(DT, { throttle: 1, steer: 0 });
    expect(Math.abs(game.rover.x - x)).toBeGreaterThan(5);
  });

  it('enters once however often it is asked, so a second ask does not set the look back level', () => {
    const game = fixtureGame();
    game.photo(true);
    game.viewfinder.look(0.5, 0.2);
    game.photo(true);
    expect(game.viewfinder.headYaw).toBeCloseTo(0.5, 12);
  });

  it('turns the rover head with the view, and lets it go on leaving', () => {
    const game = fixtureGame();
    game.photo(true);
    game.viewfinder.look(1.2, 0.3);
    game.step(DT);
    expect(game.rover.headYaw).toBeCloseTo(1.2, 12);
    expect(game.rover.headPitch).toBeCloseTo(0.3, 12);
    game.photo(false);
    for (let f = 0; f < 60; f++) game.step(DT, { throttle: 1, steer: 0 });
    expect(Math.abs(game.rover.headYaw)).toBeLessThan(0.2);
  });

  it('focuses by itself as the game steps, on the duck in the middle', () => {
    const game = fixtureGame();
    atTheDuck(game);
    expect(game.viewfinder.focused).toBe(game.subjects.kinds.indexOf('duck'));
  });
});

describe('the shutter', () => {
  it('grades nought with nothing in frame, and tells of it', () => {
    const told: number[] = [];
    const game = fixtureGame(told);
    game.photo(true);
    game.viewfinder.look(0, 1);
    game.step(DT);
    const g = game.shutter()!;
    expect(g.total).toBe(0);
    expect(g.best).toBe(-1);
    expect(told).toEqual([0]);
  });

  it('grades a picture of the duck above nought, of the duck, the same every time it is taken', () => {
    const told: number[] = [];
    const game = fixtureGame(told);
    atTheDuck(game);
    const first = game.shutter()!.total;
    expect(first).toBeGreaterThan(0);
    expect(game.picture.best).toBe(game.subjects.kinds.indexOf('duck'));
    game.shutter();
    expect(told).toEqual([first, first]);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('grades into the one grade, kept for the card and the invariants, and saves nothing', () => {
    const game = fixtureGame();
    atTheDuck(game);
    const a = game.shutter();
    const b = game.shutter();
    expect(a).toBe(b);
    expect(a).toBe(game.picture);
    expect(Object.keys(game.progress.save).sort()).toEqual(['muted', 'volume']);
  });

  it('does nothing out of the viewfinder', () => {
    const told: number[] = [];
    const game = fixtureGame(told);
    expect(game.shutter()).toBe(null);
    expect(told).toEqual([]);
  });

  it('grades a picture with nobody told of it, in a game that has no one to tell', () => {
    const game = new Game(new Progress(memoryStore()), { random: seeded(1), map });
    expect(game.photographing).toBe(false);
    game.photo(true);
    expect(game.photographing).toBe(true);
    expect(game.shutter()).toBe(game.picture);
    game.photo(false);
    expect(game.photographing).toBe(false);
  });

  it('counts a picture taken turning as less steady than one held still', () => {
    const game = fixtureGame();
    atTheDuck(game);
    const still = game.shutter()!.term('steady');
    for (let f = 0; f < 10; f++) {
      game.viewfinder.look(f % 2 ? 0.02 : -0.02, 0);
      game.step(DT);
    }
    expect(game.shutter()!.term('steady')).toBeLessThan(still);
  });
});

describe('the UFOs', () => {
  it('bob by game time, each by its own vary, and nothing else is lifted', () => {
    const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
    const s = game.subjects;
    const ufos = s.kinds.flatMap((k, i) => (k === 'ufo' ? [i] : []));
    expect(ufos.length).toBeGreaterThan(0);
    for (let f = 0; f < 50; f++) game.step(DT);
    for (const i of ufos) expect(s.lift[i]).toBe(ufoBob(game.t, s.placements[i].vary));
    expect(new Set(ufos.map((i) => s.lift[i])).size).toBe(ufos.length);
    s.kinds.forEach((k, i) => k !== 'ufo' && expect(s.lift[i]).toBe(0));
  });

  it('are named as the world names them, as the test API reads them', () => {
    const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
    expect(game.oddityNames).toContain('mill pond duck');
    expect(game.oddityNames.length).toBe(game.subjects.count);
    expect(game.oddityNames).toEqual(ODDITIES.map((o) => o.name));
    // the fixture's have no names of their own, so they go by their kind's
    expect(fixtureGame().oddityNames).toEqual(['rubber duck 1', 'garden gnome 1']);
  });

  it('go by their kind and a count where they are not the oddities the world lays, as many of them as there are', () => {
    // as many ducks as the world lays oddities, which are not its oddities however many there are
    const duck = map.placements[0];
    const ducks = { ...map, placements: ODDITIES.map(() => duck) };
    const game = new Game(new Progress(memoryStore()), { random: seeded(1), map: ducks });
    expect(game.oddityNames).toEqual(ODDITIES.map((_, k) => `rubber duck ${k + 1}`));
    // and fewer than it lays, though they begin as its do (its first is a duck)
    expect(ODDITIES[0].kind).toBe('duck');
    const one = new Game(new Progress(memoryStore()), { random: seeded(1), map: { ...map, placements: [duck] } });
    expect(one.oddityNames).toEqual(['rubber duck 1']);
  });
});

describe('what must always hold, in the viewfinder', () => {
  it('reports a viewfinder or a grade gone wrong', () => {
    const game = fixtureGame();
    game.photo(true);
    expect(checkInvariants(game)).toEqual([]);
    game.viewfinder.shot.v[2] = LENS.most + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/the viewfinder's lens/);
    game.viewfinder.shot.v[2] = LENS.start;
    game.picture.values[0] = 101;
    expect(checkInvariants(game).join('\n')).toMatch(/the grade's total is 101/);
  });
});
