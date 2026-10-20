import { describe, expect, it } from 'vitest';
import { ChaseCamera } from '../src/camera';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { FIXTURE, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { checkInvariants } from '../src/invariants';
import { TRACKS } from '../src/tracks';
import { newGame, settle } from './helpers';

describe('what must always hold', () => {
  it('holds of a new game', () => {
    const { game } = newGame();
    settle(game);
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports the camera under the ground, inside what is built, or looking through the ground', () => {
    // on the fixture, whose cottage and rock say how tall they stand
    const game = new Game(new Progress(memoryStore()), { random: seeded(1), map: fixtureWorld() });
    const { rover, ground } = game;
    const camera = new ChaseCamera();
    camera.snap(rover, ground);
    expect(checkInvariants(game, camera)).toEqual([]);
    // the eye put under the ground beneath it
    camera.position[2] = ground.heightAt(camera.position[0], camera.position[1]) - 1;
    expect(checkInvariants(game, camera).join('\n')).toMatch(/the camera's eye is at .*, the ground under it/);
    // and inside the cottage, a little under its ridge
    const [cx, cy] = fixtureAt(FIXTURE.cottage[0], FIXTURE.cottage[1]);
    camera.position[0] = cx;
    camera.position[1] = cy;
    camera.position[2] = ground.topAt(cx, cy) - 1;
    expect(checkInvariants(game, camera).join('\n')).toMatch(/inside what stands there/);
    camera.position[2] = Number.NaN;
    expect(checkInvariants(game, camera).join('\n')).toMatch(/the camera is not a number/);
    // without a camera to ask about, there is nothing to say of one
    expect(checkInvariants(game)).toEqual([]);
  });

  it('reports the rover where it cannot stand, or not a number', () => {
    const { game } = newGame();
    const { rover, map } = game;
    rover.x = map.grid.originX + 1;
    rover.y = map.grid.originY + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/the rover is (not standable|over something solid)/);
    rover.x = NaN;
    expect(checkInvariants(game).join('\n')).toMatch(/the rover is not a number/);
  });

  it('reports the tracks grown past their pool', () => {
    const { game } = newGame();
    game.tracks.count = TRACKS.capacity + 1;
    expect(checkInvariants(game).join('\n')).toMatch(/the tracks hold/);
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
});
