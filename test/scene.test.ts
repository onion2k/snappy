/**
 * The scene, headless, with a renderer that only takes what it is handed: what is drawn cut out of the camera's way
 * stays cut while it is still in the way, whatever else the scene does that frame. A tree that popped back whole for a
 * few frames each time the camera crossed into another chunk was seen as trees flickering, behind the rover and, it
 * seemed, at random.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ChaseCamera } from '../src/camera';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Scene, type Draws } from '../src/scene';
import { CHUNK } from '../src/world/types';

// the browser's image types, which the scene makes its ground's layers with, and which the test has no use for
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.ImageData ??= class {
    constructor(
      readonly data: Uint8ClampedArray,
      readonly width: number,
      readonly height: number,
    ) {}
  };
  g.createImageBitmap ??= () => Promise.resolve({ width: 1, height: 1, close() {} });
});

/** A renderer that takes everything and draws nothing. */
const draws: Draws = {
  setDynamic: () => {},
  move: () => {},
  tint: () => {},
  setGrass: async () => {},
  press: () => {},
  setSunShadow: () => {},
  setGroundTexture: () => {},
} as unknown as Draws;

/** The chase camera's eye at home, behind a point and above it, looking north: as the game's own stands. */
function eyeBehind(x: number, y: number, z: number): [number, number, number] {
  const distance = 120,
    tilt = (49 * Math.PI) / 180;
  return [x, y - Math.sin(tilt) * distance, z + Math.cos(tilt) * distance];
}

describe('what stands in the camera’s way', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  const { grid } = game.map;
  const span = CHUNK * grid.tile;
  let scene: Scene;

  /** The rover put at (x, y), the camera behind it, and one frame drawn; settled, a test's step, or played. */
  function standAt(x: number, y: number, dt: number, settled: boolean) {
    game.rover.x = x;
    game.rover.y = y;
    game.rover.z = game.ground.heightAt(x, y);
    const target = [x, y, game.rover.z];
    scene.frame(game, eyeBehind(x, y, game.rover.z), target, dt, settled);
  }

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, draws);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
  }, 60_000);

  it('keeps a tree cut while it is in the way, when the camera crosses into another chunk as the game plays', () => {
    // somewhere a chunk's border runs through a wood with trees between the camera and the rover: looked for along the
    // borders, the rover just west of one, every tree in the way settled at once
    let found: { x: number; y: number; cut: number } | null = null;
    for (let k = 2; k < grid.cols / CHUNK - 2 && !found; k++) {
      const x = grid.originX + k * span - 0.5;
      for (let y = grid.originY + span; y < grid.originY + grid.rows * grid.tile - span; y += 6) {
        standAt(x, y, 0, true);
        if (scene.hidden >= 3) {
          found = { x, y, cut: scene.hidden };
          break;
        }
      }
    }
    expect(found, 'a wood on a chunk border with trees in the camera’s way').not.toBeNull();
    const { x, y, cut } = found!;
    // the rover, and the camera with it, a unit east and over the border, frame by frame as the game plays: the way
    // to the rover has hardly moved, so what was in it is in it still, and must not be drawn whole even for a frame
    standAt(x, y, 0, true);
    const seen: number[] = [];
    for (let f = 1; f <= 8; f++) {
      standAt(x + f / 8, y, 1 / 60, false);
      seen.push(scene.hidden);
    }
    expect(
      Math.min(...seen),
      `trees drawn cut each frame across the border, from ${cut}: ${seen.join(', ')}`,
    ).toBeGreaterThanOrEqual(cut - 1);
  });

  it('keeps a bush pressed under the rover when the camera crosses into another chunk as the game plays', () => {
    // somewhere along a chunk's border the rover stands in a bush, a fern or a clump of reeds, pressed flat under it
    let found: { x: number; y: number; pressed: number } | null = null;
    for (let k = 2; k < grid.cols / CHUNK - 2 && !found; k++) {
      const x = grid.originX + k * span - 0.5;
      for (let y = grid.originY + span; y < grid.originY + grid.rows * grid.tile - span; y += 1.5) {
        standAt(x, y, 0, true);
        if (scene.cut.bushes >= 1) {
          found = { x, y, pressed: scene.cut.bushes };
          break;
        }
      }
    }
    expect(found, 'a bush on a chunk border').not.toBeNull();
    const { x, y, pressed } = found!;
    standAt(x, y, 0, true);
    const seen: number[] = [];
    for (let f = 1; f <= 8; f++) {
      standAt(x + f / 8, y, 1 / 60, false);
      seen.push(scene.cut.bushes);
    }
    expect(Math.min(...seen), `bushes pressed each frame across the border, from ${pressed}: ${seen.join(', ')}`).toBe(
      pressed,
    );
  });
});

/** Frames after a jump across the world before a wood's trees are followed: the pools refill in the second. */
const SETTLE = 4;

describe('a tree at the edge of the camera’s way', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  let scene: Scene;

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, draws);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
  }, 60_000);

  it.each(['pine knoll', 'black tarn', 'witch hill'])(
    'is not cut and grown back again within a few frames, as the rover drives through the wood at %s',
    (name) => {
      const cam = new ChaseCamera();
      const wood = game.map.landmarks.find((l) => l.name === name)!;
      game.rover.teleport(wood.x, wood.y, 0.7);
      cam.snap(game.rover, game.ground);
      const drive = { throttle: 0.6, steer: 0.25 };
      const cut = new Int32Array(4096);
      const wasCut = new Set<number>();
      const changedAt = new Map<number, number>();
      let toggles = 0,
        back = 0;
      for (let f = 0; f < 1200; f++) {
        if (f % 300 === 150) drive.steer = -drive.steer;
        game.step(1 / 60, drive);
        cam.update(game.rover, game.ground, 1 / 60);
        scene.frame(game, cam.position, cam.target, 1 / 60, false);
        const n = scene.cutTrees(cut);
        const now = new Set(cut.subarray(0, n));
        // the first frames after the jump fill the pools for the new place, and the last wood's cut trees leave them:
        // trees going from the pool, hundreds of units off and not drawn there, are not trees flickering
        if (f < SETTLE) {
          wasCut.clear();
          for (const id of now) wasCut.add(id);
          continue;
        }
        for (const id of new Set([...now, ...wasCut])) {
          if (now.has(id) === wasCut.has(id)) continue;
          toggles++;
          const at = changedAt.get(id);
          if (at !== undefined && f - at <= 12) back++;
          changedAt.set(id, f);
        }
        wasCut.clear();
        for (const id of now) wasCut.add(id);
      }
      expect(toggles, 'trees were cut and grown back as it drove').toBeGreaterThan(20);
      expect(back, `of ${toggles} times a tree was cut or grown back, the times it went back within 12 frames`).toBe(0);
    },
  );
});

describe('the oddities', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  let scene: Scene;

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, draws);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
  }, 60_000);

  it('are every one drawn, wherever the camera is, and a UFO where its bob has lifted it', () => {
    const s = game.subjects;
    const out = new Float64Array(s.count * 3);
    // the camera over the far corner of the world from most of them
    const { minX, minY } = game.ground.bounds;
    const target = [minX + 10, minY + 10, 0];
    scene.frame(game, [target[0], target[1] - 80, 100], target, 1 / 60, true);
    expect(scene.drawnOddities(out)).toBe(s.count);
    const laid = out.slice();
    for (let k = 0; k < s.count; k++) {
      expect(out[k * 3], s.kinds[k]).toBeCloseTo(s.x[k], 3);
      expect(out[k * 3 + 1], s.kinds[k]).toBeCloseTo(s.y[k], 3);
    }
    // the game stepped on to a moment the UFOs are lifted, and the scene drawn again
    for (let f = 0; f < 40; f++) game.step(1 / 60);
    scene.frame(game, [target[0], target[1] - 80, 100], target, 1 / 60, true);
    scene.drawnOddities(out);
    for (let k = 0; k < s.count; k++) {
      expect(out[k * 3 + 2] - laid[k * 3 + 2], s.kinds[k]).toBeCloseTo(s.lift[k], 4);
    }
    expect(s.kinds.some((k, i) => k === 'ufo' && Math.abs(s.lift[i]) > 0.1)).toBe(true);
  });
});

describe('the trees thinned and dithered', () => {
  /** Where every instance the scene hands the renderer stands, within `reach` of (x, y), drawn from `map`. */
  async function drawnNear(map: Game['map'], x: number, y: number, reach: number): Promise<string[]> {
    let dynamic: { count?: number; matrices: Float32Array }[] = [];
    const recording = { ...draws, setDynamic: (d: typeof dynamic) => (dynamic = d) } as unknown as Draws;
    const game = new Game(new Progress(memoryStore()), { random: seeded(1), map });
    const scene = new Scene(map, game.ground, recording);
    await scene.build([x, y, 0]);
    game.rover.teleport(x, y, Math.PI / 2);
    const cam = new ChaseCamera();
    cam.snap(game.rover, game.ground);
    scene.frame(game, cam.position, cam.target, 0, true);
    const at: string[] = [];
    for (const g of dynamic)
      for (let i = 0; i < (g.count ?? 0); i++) {
        const dx = g.matrices[i * 16 + 12] - x,
          dy = g.matrices[i * 16 + 13] - y;
        if (Math.abs(dx) < reach && Math.abs(dy) < reach) at.push(`${dx.toFixed(2)},${dy.toFixed(2)}`);
      }
    return at.sort();
  }

  it('are the same trees when the world gains a placement before them in its list', async () => {
    // the marsh's willows, thinned, and the trees at the edge of those drawn whole, chosen once by where each was in the
    // world's list: the oddities, laid before the sowing, moved every tree after them and chose others (2026-10-20)
    const map = new Game(new Progress(memoryStore()), { random: seeded(1) }).map;
    const marsh = map.landmarks.find((l) => l.name === 'marsh')!;
    const [x, y] = [marsh.x - 10, marsh.y - 40];
    const corner = { ...map.placements[0], kind: 'flowers' as const, x: map.grid.originX + 3, y: map.grid.originY + 3 };
    const more = { ...map, placements: [corner, ...map.placements] };
    expect(await drawnNear(more, x, y, 60)).toEqual(await drawnNear(map, x, y, 60));
  }, 60_000);
});
