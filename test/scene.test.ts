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
import { HOLD, RINGS, SightLine, tallness } from '../src/view';
import { BUILT, CHUNK, SUBJECT_KINDS, type Kind } from '../src/world/types';

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

describe('the rover put away, for an album page', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  /** Each call to move that set a group's count: the group and the count, in the order made. */
  const counted: [number, number][] = [];
  const recording: Draws = {
    ...draws,
    move: (group: number, _m: Float32Array, count?: number) => {
      if (count !== undefined) counted.push([group, count]);
    },
  };
  let scene: Scene;
  const { grid } = game.map;
  const span = CHUNK * grid.tile;

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, recording);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
  }, 60_000);

  /** The rover at (x, y), the camera behind it, one settled frame. */
  function standAt(x: number, y: number) {
    game.rover.x = x;
    game.rover.y = y;
    game.rover.z = game.ground.heightAt(x, y);
    scene.frame(game, eyeBehind(x, y, game.rover.z), [x, y, game.rover.z], 0, true);
  }

  it('draws the rover, its shade, its rings and its tracks at nought, once, and puts each back after', () => {
    const { x, y } = game.map.start;
    standAt(x, y);
    counted.length = 0;
    scene.hidePlayer = true;
    standAt(x, y);
    const away = counted.filter(([, n]) => n === 0).map(([g]) => g);
    // every part of the rover, and the shade, the rings and the tracks: more than the four that are not the rover
    expect(away.length).toBeGreaterThan(4);
    expect(new Set(away).size, 'each group once').toBe(away.length);
    // a second frame put away writes no count again
    counted.length = 0;
    standAt(x, y);
    expect(counted.filter(([g]) => away.includes(g))).toEqual([]);
    // drawn again, every one of them back at a count of its own: the rover's parts and the shade at one at least
    counted.length = 0;
    scene.hidePlayer = false;
    standAt(x, y);
    const back = new Map(counted.filter(([g]) => away.includes(g)));
    expect([...back.keys()].sort((a, b) => a - b)).toEqual([...away].sort((a, b) => a - b));
    // all but the tracks, of which there are none laid here
    expect([...back.values()].filter((n) => n > 0).length).toBe(away.length - 1);
  });

  it('cuts for a page what its eye is in and nothing it was cut before: the same page whatever the game did first', () => {
    // a wood with trees cut out of the chase camera's way, as the game left it when the album was opened
    let wood: { x: number; y: number } | null = null;
    for (let k = 2; k < grid.cols / CHUNK - 2 && !wood; k++) {
      const x = grid.originX + k * span - 0.5;
      for (let y = grid.originY + span; y < grid.originY + grid.rows * grid.tile - span && !wood; y += 1.5) {
        standAt(x, y);
        if (scene.hidden >= 3) wood = { x, y };
      }
    }
    expect(wood, 'a wood in the way').not.toBeNull();
    const cut = new Int32Array(64);
    const n = scene.cutTrees(cut);
    // an eye beside one of the trees cut, near enough its crown to keep it cut by the hold that stops a cut tree
    // flickering, and not in it: a page's eye there must see the tree whole, as a page drawn after a reload does
    const sight = new SightLine();
    let eye: number[] | null = null,
      tree = -1;
    for (let c = 0; c < n && !eye; c++) {
      const p = game.map.placements[cut[c]];
      const z = p.z + tallness(p.kind) * p.scale * 0.7;
      for (let r = 0.5; r < 20 && !eye; r += 0.25)
        for (let a = 0; a < 16 && !eye; a++) {
          const e = [p.x + r * Math.cos((a * Math.PI) / 8), p.y + r * Math.sin((a * Math.PI) / 8), z];
          sight.set(e, e, scene.lens);
          if (sight.blocks(p, HOLD) && !sight.blocks(p, 0)) {
            eye = e;
            tree = cut[c];
          }
        }
    }
    expect(eye, 'an eye at the edge of a cut tree').not.toBeNull();
    const page = () => {
      scene.hidePlayer = true;
      scene.frame(game, eye!, eye!, 0, true);
      const m = scene.cutTrees(cut);
      scene.hidePlayer = false;
      return [...cut.subarray(0, m)].sort((a, b) => a - b);
    };
    const afterPlay = page();
    expect(afterPlay, 'the tree the game had cut').not.toContain(tree);
    // and the same page with nothing cut before it: the rover stood where it cuts nothing
    standAt(eye![0], eye![1]);
    expect(page()).toEqual(afterPlay);
  });

  it('cuts nothing out of the way to a rover that is not there, and presses no bush', () => {
    // a wood on a chunk border with trees between the camera and the rover, as above, and a bush under the rover
    let wood: { x: number; y: number } | null = null,
      bush: { x: number; y: number } | null = null;
    for (let k = 2; k < grid.cols / CHUNK - 2 && !(wood && bush); k++) {
      const x = grid.originX + k * span - 0.5;
      for (let y = grid.originY + span; y < grid.originY + grid.rows * grid.tile - span; y += 1.5) {
        standAt(x, y);
        if (!wood && scene.hidden >= 3) wood = { x, y };
        if (!bush && scene.cut.bushes >= 1) bush = { x, y };
        if (wood && bush) break;
      }
    }
    expect(wood, 'a wood in the way').not.toBeNull();
    expect(bush, 'a bush under the rover').not.toBeNull();
    scene.hidePlayer = true;
    standAt(wood!.x, wood!.y);
    expect(scene.hidden, 'trees cut with no rover to see').toBe(0);
    standAt(bush!.x, bush!.y);
    expect(scene.cut.bushes, 'bushes pressed with no rover in them').toBe(0);
    scene.hidePlayer = false;
    standAt(bush!.x, bush!.y);
    expect(scene.cut.bushes, 'and pressed again once it is back').toBeGreaterThanOrEqual(1);
  });
});

describe('a tree in the way sinks out of it', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  const { grid } = game.map;
  const span = CHUNK * grid.tile;
  /** Every group the scene handed the renderer, whose matrices it goes on writing into. */
  let dynamic: { count?: number; matrices: Float32Array }[] = [];
  const recording = { ...draws, setDynamic: (d: typeof dynamic) => (dynamic = d) } as unknown as Draws;
  let scene: Scene;
  let id = -1;
  let at: { x: number; y: number; z: number };
  /** Each instance at the tree's foot: its group, its place, and how long its x axis was whole and when cut. */
  let parts: { g: number; i: number; whole: number; cut: number }[] = [];

  /** How long the x axis of each instance at the tree's foot is now, by group and place. */
  function lengths(): Map<string, number> {
    const p = game.map.placements[id];
    const out = new Map<string, number>();
    dynamic.forEach((g, gi) => {
      for (let i = 0; i < (g.count ?? 0); i++) {
        const m = g.matrices;
        if (Math.abs(m[i * 16 + 12] - p.x) > 0.01 || Math.abs(m[i * 16 + 13] - p.y) > 0.01) continue;
        out.set(`${gi}:${i}`, Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2]));
      }
    });
    return out;
  }

  /** The tree's full size now and its clump's, each as a share of what it is when it is drawn: read off the matrices. */
  function scales(): { whole: number; low: number } {
    const now = lengths();
    let whole = 0,
      wholeOf = 0,
      low = 0,
      lowOf = 0;
    for (const [key, len] of now) {
      const part = parts.find((q) => `${q.g}:${q.i}` === key);
      if (!part) continue;
      if (part.whole > part.cut) {
        whole += len;
        wholeOf += part.whole;
      } else {
        low += len;
        lowOf += part.cut;
      }
    }
    return { whole: whole / wholeOf, low: low / lowOf };
  }

  /** One frame with the camera behind the rover (the tree in the way) or over it (clear), a step of `dt`. */
  function frame(blocked: boolean, dt: number) {
    const eye: [number, number, number] = blocked ? eyeBehind(at.x, at.y, at.z) : [at.x, at.y, at.z + 120];
    scene.frame(game, eye, [at.x, at.y, at.z], dt, dt === 0);
  }

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, recording);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
    // a place with a tree in the camera's way from behind and not from over the rover: found along the chunk borders
    const cut = new Int32Array(4096);
    const clear = new Int32Array(4096);
    for (let k = 2; k < grid.cols / CHUNK - 2 && id < 0; k++) {
      const x = grid.originX + k * span - 0.5;
      for (let y = grid.originY + span; y < grid.originY + grid.rows * grid.tile - span; y += 6) {
        game.rover.x = x;
        game.rover.y = y;
        game.rover.z = game.ground.heightAt(x, y);
        at = { x, y, z: game.rover.z };
        frame(true, 0);
        const n = scene.cutTrees(cut);
        if (!n) continue;
        const behind = cut.slice(0, n);
        frame(false, 0);
        const m = scene.cutTrees(clear);
        const over = new Set(clear.subarray(0, m));
        const one = behind.find((t) => !over.has(t));
        if (one === undefined) continue;
        id = one;
        break;
      }
    }
    expect(id, 'a tree in the way from behind and not from over').toBeGreaterThanOrEqual(0);
    frame(false, 0);
    const whole = lengths();
    frame(true, 0);
    const cutDown = lengths();
    parts = [...whole.keys()].map((key) => {
      const [g, i] = key.split(':').map(Number);
      return { g, i, whole: whole.get(key)!, cut: cutDown.get(key)! };
    });
    expect(parts.length, 'instances at the tree’s foot').toBeGreaterThan(1);
  }, 60_000);

  function reset() {
    frame(false, 0);
  }

  it('is drawn part way, and its clump the rest, after one step with it newly in the way', () => {
    reset();
    frame(true, 1 / 60);
    const s = scales();
    expect(s.whole).toBeGreaterThan(0);
    expect(s.whole).toBeLessThan(1);
    expect(s.low).toBeCloseTo(1 - s.whole, 6);
  });

  it('is gone, and its clump whole, once it has been in the way for a little while', () => {
    reset();
    for (let f = 0; f < 36; f++) frame(true, 1 / 60);
    const s = scales();
    expect(s.whole).toBe(0);
    expect(s.low).toBeCloseTo(1, 6);
  });

  it('is gone at once when the step is nought, a paused frame', () => {
    reset();
    frame(true, 0);
    const s = scales();
    expect(s.whole).toBe(0);
    expect(s.low).toBeCloseTo(1, 6);
  });

  it('grows back over a few frames once it is out of the way, and is whole in the end', () => {
    reset();
    frame(true, 0);
    frame(false, 1 / 60);
    const s = scales();
    expect(s.whole).toBeGreaterThan(0);
    expect(s.whole).toBeLessThan(1);
    expect(s.low).toBeCloseTo(1 - s.whole, 6);
    for (let f = 0; f < 240; f++) frame(false, 1 / 60);
    const end = scales();
    expect(end.whole).toBeCloseTo(1, 6);
    expect(end.low).toBeCloseTo(0, 6);
  });

  it('is put back at the size it had when the pools are filled again half way', () => {
    reset();
    frame(true, 0);
    frame(false, 0);
    frame(true, 1 / 60);
    const before = scales();
    expect(before.whole).toBeGreaterThan(0);
    expect(before.whole).toBeLessThan(1);
    // the far trees drawn out to another ring fills the pools again, and restores what was cut
    scene.setTreesRing(RINGS.trees - 1);
    const after = scales();
    scene.setTreesRing(RINGS.trees);
    expect(after.whole).toBeCloseTo(before.whole, 6);
    expect(after.low).toBeCloseTo(before.low, 6);
  });
});

describe('a ruin’s wall in the camera’s way as the camera lifts over it and sinks again', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  let scene: Scene;

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, draws);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
  }, 60_000);

  it('is swapped for its feet at most once in five seconds, not each time the camera sinks back', () => {
    // the eighth wall of the world, one a rover walking back and forth beyond it, the camera lifting over it and
    // sinking again, cut and grew back four times in five seconds with the trees' slack and rate (2026-10-21)
    const wall = game.map.placements.flatMap((p, i) => (p.kind === 'wall' ? [i] : []))[7];
    const w = game.map.placements[wall];
    // the rover beyond the wall and heading away, so the camera behind it looks across the wall
    const heading = w.yaw + Math.PI / 2;
    const cam = new ChaseCamera();
    const stand = (away: number) => {
      const x = w.x + Math.cos(heading) * away,
        y = w.y + Math.sin(heading) * away;
      game.rover.teleport(x, y, heading);
    };
    stand(40);
    cam.snap(game.rover, game.ground);
    const cut = new Int32Array(4096);
    const isDown = () => {
      const n = scene.cutHouses(cut);
      for (let k = 0; k < n; k++) if (cut[k] === wall) return true;
      return false;
    };
    let swaps = 0,
      was = false,
      everDown = false;
    for (let f = 0; f < 300; f++) {
      // a walk out and back, across a distance the lift is let go and taken up again over
      stand(40 + 6 * Math.sin((f / 60) * 2));
      cam.update(game.rover, game.ground, 1 / 60);
      scene.frame(game, cam.position, cam.target, 1 / 60, false);
      const now = isDown();
      if (f > 0 && now !== was) swaps++;
      everDown ||= now;
      was = now;
    }
    expect(everDown, 'the wall was in the camera’s way at some point').toBe(true);
    expect(swaps, 'times the wall was swapped for its feet or back').toBeLessThanOrEqual(1);
  });
});

describe('the small scenery at the edge of the ring drawn whole', () => {
  it('is drawn a share at a time past the edge, not the whole row of it at once', async () => {
    const map = new Game(new Progress(memoryStore()), { random: seeded(1) }).map;
    const game = new Game(new Progress(memoryStore()), { random: seeded(1), map });
    const small = (k: Kind) => tallness(k) === 0 && !BUILT.has(k) && !SUBJECT_KINDS.has(k);
    const span = CHUNK * map.grid.tile;
    // the chunk with the most small things in it that has room for the ring past it to the east
    const cols = Math.ceil(map.grid.cols / CHUNK),
      rows = Math.ceil(map.grid.rows / CHUNK);
    const per = new Map<number, string[]>();
    for (const p of map.placements) {
      if (!small(p.kind) || p.kind === 'willow') continue;
      const c = Math.floor((p.y - map.grid.originY) / span) * cols + Math.floor((p.x - map.grid.originX) / span);
      (per.get(c) ?? per.set(c, []).get(c)!).push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
    let best = -1,
      most = 0;
    for (let cy = 3; cy < rows - 3; cy++)
      for (let cx = 3; cx < cols - 3; cx++) {
        const n = per.get(cy * cols + cx + RINGS.kit + 1)?.length ?? 0;
        if (n > most) [best, most] = [cy * cols + cx, n];
      }
    expect(most, 'a chunk of small scenery just past the ring').toBeGreaterThan(20);
    const [tcx, tcy] = [best % cols, Math.floor(best / cols)];
    const outer = per.get(tcy * cols + tcx + RINGS.kit + 1)!;

    let dynamic: { count?: number; matrices: Float32Array }[] = [];
    const recording = { ...draws, setDynamic: (d: typeof dynamic) => (dynamic = d) } as unknown as Draws;
    const x = map.grid.originX + (tcx + 0.5) * span,
      y = map.grid.originY + (tcy + 0.5) * span;
    const scene = new Scene(map, game.ground, recording);
    await scene.build([x, y, 0]);
    game.rover.teleport(x, y, Math.PI / 2);
    const cam = new ChaseCamera();
    cam.snap(game.rover, game.ground);
    scene.frame(game, cam.position, cam.target, 0, true);
    const drawn = new Set<string>();
    for (const g of dynamic)
      for (let i = 0; i < (g.count ?? 0); i++)
        drawn.add(`${g.matrices[i * 16 + 12].toFixed(2)},${g.matrices[i * 16 + 13].toFixed(2)}`);
    const seen = outer.filter((k) => drawn.has(k)).length;
    expect(seen, `of ${outer.length} in the ring past the whole one`).toBeGreaterThan(0);
    expect(seen, `of ${outer.length} in the ring past the whole one`).toBeLessThan(outer.length);
  }, 60_000);
});

describe('what the scene hands the renderer only when it changes', () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  const MARKS = 2048 * 16,
    RINGS_LEN = 36 * 16,
    COLOURS = 2048 * 4;
  /** The calls that wrote the tracks' matrices, their colours, and the rings, by the size of what was handed over. */
  const calls = { marks: 0, colours: 0, rings: 0 };
  const recording: Draws = {
    ...draws,
    move: (_group: number, m: Float32Array) => {
      if (m.length === MARKS) calls.marks++;
      else if (m.length === RINGS_LEN) calls.rings++;
    },
    tint: (_group: number, c: Float32Array) => {
      if (c.length === COLOURS) calls.colours++;
    },
  };
  let scene: Scene;
  const reset = () => {
    calls.marks = calls.colours = calls.rings = 0;
  };

  beforeAll(async () => {
    scene = new Scene(game.map, game.ground, recording);
    await scene.build([game.map.start.x, game.map.start.y, 0]);
  }, 60_000);

  /** One frame at game time `t` with the rover where it is. */
  function frameAt(t: number) {
    game.t = t;
    const r = game.rover;
    r.z = game.ground.heightAt(r.x, r.y);
    scene.frame(game, eyeBehind(r.x, r.y, r.z), [r.x, r.y, r.z], 1 / 60, false);
  }

  /** A mark laid by hand, as the tracks would, at game time `t`. */
  function lay(t: number) {
    const k = game.tracks;
    const i = k.next;
    k.x[i] = game.rover.x;
    k.y[i] = game.rover.y;
    k.z[i] = game.rover.z;
    k.yaw[i] = 0;
    k.born[i] = t;
    k.next = (i + 1) % k.capacity;
    k.count = Math.min(k.capacity, k.count + 1);
  }

  it('writes the tracks for no frame in which none was laid, and for a mark laid at most every tenth of a second', () => {
    const { x, y } = game.map.start;
    game.rover.x = x;
    game.rover.y = y;
    frameAt(100);
    // with none laid, nothing is written, frame after frame
    reset();
    for (let k = 1; k <= 5; k++) frameAt(100 + k / 60);
    expect(calls.marks + calls.colours).toBe(0);
    // the first mark is written at once, matrices and colours together
    lay(100.1);
    frameAt(100.1);
    expect(calls).toMatchObject({ marks: 1, colours: 1 });
    // a mark laid a frame later waits for the tenth of a second to be up, and is written then with the colours
    reset();
    lay(100.12);
    frameAt(100.12);
    frameAt(100.15);
    expect(calls.marks + calls.colours, 'held back').toBe(0);
    frameAt(100.21);
    expect(calls).toMatchObject({ marks: 1, colours: 1 });
    // and the frames after it write nothing
    reset();
    frameAt(100.22);
    frameAt(100.23);
    expect(calls.marks + calls.colours).toBe(0);
  });

  it('writes the rings for no frame without one alive, and once more after the last has gone', () => {
    // the rover in the water: a point that is deep enough for all of it, found along the world
    let wet: { x: number; y: number } | null = null;
    const { bounds } = game.ground;
    for (let y = bounds.minY; y < bounds.maxY && !wet; y += 3)
      for (let x = bounds.minX; x < bounds.maxX && !wet; x += 3) {
        let all = game.ground.waterDepthAt(x, y) > 0;
        for (let w = 0; w < 6 && all; w++) all = game.ground.waterDepthAt(x + (w - 3) * 0.4, y) > 0;
        if (all) wet = { x, y };
      }
    expect(wet, 'water to wade in').not.toBeNull();
    const r = game.rover;
    r.x = wet!.x;
    r.y = wet!.y;
    r.speed = 0;
    // a quiet frame or two, and then none writes the rings
    frameAt(200);
    frameAt(200 + 1 / 60);
    reset();
    for (let k = 2; k <= 6; k++) frameAt(200 + k / 60);
    expect(calls.rings, 'none alive').toBe(0);
    // driven in the water, a ring is born and written every frame while it lives
    r.speed = 4;
    for (let w = 0; w < 6; w++) {
      r.wheelX[w] = wet!.x + (w - 3) * 0.4;
      r.wheelY[w] = wet!.y;
    }
    reset();
    frameAt(201);
    expect(calls.rings, 'one born').toBe(1);
    r.speed = 0;
    frameAt(201.5);
    frameAt(201.9);
    expect(calls.rings, 'alive').toBe(3);
    // spent, written once more, so it is drawn so, and then not at all
    reset();
    frameAt(205);
    expect(calls.rings, 'the last frame').toBe(1);
    frameAt(205.1);
    frameAt(205.2);
    expect(calls.rings, 'none alive').toBe(1);
  });
});
