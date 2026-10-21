import { UNDER_MUTATION } from './helpers';
import { describe, expect, it } from 'vitest';
import {
  ChunkView,
  FrameRung,
  rungDt,
  GROUND,
  KIT,
  RINGS,
  RUNG,
  RUNG_STEPS,
  CHUNK_SLACK,
  HOLD,
  HOLD_BUILT,
  SightLine,
  WORK,
  frameWork,
  tallness,
} from '../src/view';
import { CHUNK, TILE, type Placement } from '../src/world/types';
import { heapSwing } from './models-helpers';

/** A world ten chunks a side, from (0, 0). */
const grid = { cols: 10 * CHUNK, rows: 10 * CHUNK, originX: 0, originY: 0, tile: TILE };
const SIDE = CHUNK * TILE;

describe('which chunks are drawn how', () => {
  it('draws the ground finely round the target, coarser out to the mid ring, and coarsely past it', () => {
    const v = new ChunkView(grid);
    expect(v.update(4.5 * SIDE, 4.5 * SIDE)).toBe(true);
    expect([v.cx, v.cy]).toEqual([4, 4]);
    const at = (i: number, j: number) => v.lod[j * v.cols + i];
    expect(at(4, 4)).toBe(GROUND.near);
    expect(at(4 + RINGS.near, 4 - RINGS.near)).toBe(GROUND.near);
    expect(at(4 + RINGS.near + 1, 4)).toBe(GROUND.mid);
    expect(at(4, 4 + RINGS.mid)).toBe(GROUND.mid);
    expect(at(4, 4 + RINGS.mid + 1)).toBe(GROUND.far);
  });

  it('draws the scenery whole round the target, far trees further out, and nothing past them', () => {
    const v = new ChunkView(grid);
    v.update(0.5 * SIDE, 0.5 * SIDE);
    const at = (i: number, j: number) => v.kit[j * v.cols + i];
    expect(at(0, 0)).toBe(KIT.whole);
    expect(at(RINGS.kit, RINGS.kit)).toBe(KIT.whole);
    expect(at(RINGS.kit + 1, 0)).toBe(KIT.far);
    expect(at(RINGS.trees, RINGS.trees)).toBe(KIT.far);
    expect(at(RINGS.trees + 1, 0)).toBe(KIT.none);
  });

  it('chooses again only when the target crosses into another chunk', () => {
    const v = new ChunkView(grid);
    expect(v.update(10, 10)).toBe(true);
    expect(v.update(SIDE - 1, SIDE - 1)).toBe(false);
    expect(v.update(SIDE * (1 + CHUNK_SLACK) + 1, 10)).toBe(true);
    expect(v.cx).toBe(1);
  });

  it('keeps its choice while the target idles within a slack of the chunk edge, and chooses again past it', () => {
    const v = new ChunkView(grid);
    v.update(4.5 * SIDE, 4.5 * SIDE);
    // ten units over the edge: the choice is kept
    expect(v.update(5 * SIDE + 10, 4.5 * SIDE)).toBe(false);
    expect([v.cx, v.cy]).toEqual([4, 4]);
    // sixty over: another chunk
    expect(v.update(5 * SIDE + 60, 4.5 * SIDE)).toBe(true);
    expect([v.cx, v.cy]).toEqual([5, 4]);
    // and back ten units inside the old one: kept again, so an edge is not crossed once each way a frame
    expect(v.update(5 * SIDE - 10, 4.5 * SIDE)).toBe(false);
    expect([v.cx, v.cy]).toEqual([5, 4]);
  });

  it('counts the slack as a share of a chunk, either way along either axis', () => {
    const v = new ChunkView(grid);
    v.update(4.5 * SIDE, 4.5 * SIDE);
    const slack = CHUNK_SLACK * SIDE;
    expect(v.update(4 * SIDE - slack + 1, 4.5 * SIDE)).toBe(false);
    expect(v.update(4.5 * SIDE, 5 * SIDE + slack - 1)).toBe(false);
    expect(v.update(4.5 * SIDE, 4 * SIDE - slack - 1)).toBe(true);
    expect([v.cx, v.cy]).toEqual([4, 3]);
  });

  it('holds a target off the world to the chunk at its edge', () => {
    const v = new ChunkView(grid);
    v.update(-500, 1e6);
    expect([v.cx, v.cy]).toEqual([0, 9]);
  });

  it('draws the far trees out to fewer chunks when told, at once, and never inside the ring drawn whole', () => {
    const v = new ChunkView(grid);
    v.update(0.5 * SIDE, 0.5 * SIDE);
    const at = (i: number, j: number) => v.kit[j * v.cols + i];
    expect(v.setTrees(4)).toBe(true);
    expect(at(4, 0)).toBe(KIT.far);
    expect(at(5, 0)).toBe(KIT.none);
    expect(v.setTrees(4)).toBe(false);
    v.setTrees(0);
    expect(v.trees).toBe(RINGS.kit);
    expect(at(RINGS.kit, 0)).toBe(KIT.whole);
    expect(at(RINGS.kit + 1, 0)).toBe(KIT.none);
  });

  it.skipIf(UNDER_MUTATION)('makes nothing as it is asked, chunk crossed or not', () => {
    const v = new ChunkView(grid);
    const at = new Float64Array(1);
    expect(heapSwing(() => v.update((at[0] = (at[0] + 7) % (10 * SIDE)), 100), 12, 2000)).toBeLessThan(256 * 1024);
  });
});

const tree = (x: number, y: number, kind: Placement['kind'] = 'broadleaf', scale = 1): Placement => ({
  kind,
  x,
  y,
  z: 0,
  yaw: 0,
  scale,
  biome: 0,
  vary: 0.5,
});

describe('the trees in the way', () => {
  // the chase camera: 69 back along -x and 58 up, looking at the rover at the origin
  const sight = new SightLine();
  sight.set([-69, 0, 60], [0, 0, 2]);

  it('takes a tree between the camera and the rover to be in the way', () => {
    expect(sight.blocks(tree(-20, 0))).toBe(true);
    expect(sight.blocks(tree(-20, 10))).toBe(true);
  });

  it('takes a tree outside the picture, off to its side or behind the camera, to be clear', () => {
    expect(sight.blocks(tree(-20, 80))).toBe(false);
    expect(sight.blocks(tree(-120, 0))).toBe(false);
  });

  it('cuts away a tree near the eye in the foot of the picture, though it is not on the line', () => {
    // two thirds of the way from the eye to the rover's side, well to one side of the line, its crown filling the foot
    expect(sight.inLine(tree(-45, 25))).toBe(false);
    expect(sight.inFront(tree(-45, 25))).toBe(true);
  });

  it('leaves a tree beyond the near part of the view, off the line, standing', () => {
    expect(sight.blocks(tree(10, 30))).toBe(false);
  });

  it('cuts away a house as it does a tree, and a short wall not at all', () => {
    expect(tallness('cottage')).toBeGreaterThan(40);
    expect(sight.blocks(tree(-30, 0, 'cottage'))).toBe(true);
    expect(tallness('fence')).toBe(0);
  });

  it('takes a tree the camera is in to be in the way', () => {
    expect(sight.blocks(tree(-66, 2, 'conifer', 1.3))).toBe(true);
  });

  it('takes a tree too short to reach the line, near the camera, to be clear', () => {
    // the line is 40 up two thirds of the way back; a heath tree at a scale of a half is 14 tall
    expect(sight.blocks(tree(-46, 0, 'twisted', 0.5))).toBe(false);
  });

  it('never takes a bush, a fern, a boulder or a reed to be in the way', () => {
    for (const kind of ['bush', 'fern', 'boulder', 'reed'] as const) {
      expect(tallness(kind)).toBe(0);
      expect(sight.blocks(tree(-20, 0, kind))).toBe(false);
    }
  });

  it('widens the way by its slack, so what is cut stays cut until it is clearly out of it', () => {
    // walked out sideways from the line until a thing is just clear of it, then asked again with the slack
    for (const [x, kind] of [
      [-20, 'broadleaf'],
      [-30, 'cottage'],
      [-45, 'conifer'],
    ] as const) {
      let y = 0;
      while (sight.blocks(tree(x, y, kind))) y += 0.25;
      expect(y, `${kind} at ${x} is in the way on the line`).toBeGreaterThan(0);
      expect(sight.blocks(tree(x, y, kind), HOLD), `${kind} just clear, with the slack`).toBe(true);
      expect(sight.blocks(tree(x, y + HOLD + 1, kind), HOLD), `${kind} clear by more than the slack`).toBe(false);
    }
    expect(HOLD).toBeGreaterThan(0);
  });

  it('widens a building’s footprint and a crown’s height by its slack, out of the foot of the picture', () => {
    // a cottage near the rover, past the part of the view whose buildings are cut for standing in front, so only its
    // own footprint against the line decides it
    let y = 0;
    while (sight.blocks(tree(-10, y, 'cottage'))) y += 0.25;
    expect(y).toBeGreaterThan(0);
    expect(sight.inFront(tree(-10, y, 'cottage'), HOLD)).toBe(false);
    expect(sight.inLine(tree(-10, y, 'cottage'), HOLD)).toBe(true);
    expect(sight.inLine(tree(-10, y + HOLD + 1, 'cottage'), HOLD)).toBe(false);
    // a tree on the line near the rover, grown until its top reaches the line, and the size before taken with the slack
    let scale = 0.02;
    while (!sight.inLine(tree(-10, 0, 'broadleaf', scale))) scale += 0.005;
    const short = tree(-10, 0, 'broadleaf', scale - 0.005);
    expect(sight.inLine(short)).toBe(false);
    expect(sight.inLine(short, HOLD)).toBe(true);
  });

  it('widens the foot of the picture by its slack too', () => {
    // a crown just outside the foot, off the line, taken in with the slack and not without
    let y = 25;
    while (sight.inFront(tree(-45, y))) y += 0.25;
    expect(sight.inLine(tree(-45, y))).toBe(false);
    expect(sight.inFront(tree(-45, y), HOLD)).toBe(true);
    expect(sight.inFront(tree(-45, y + 40), HOLD)).toBe(false);
  });

  it('keeps a wall already cut away cut with the wider slack of what is built, where a tree’s would let it back', () => {
    // a wall along the line, near the rover, moved aside until it is just clear of the line, and a little more than the
    // trees' slack beyond that: the camera sinking a hair would cut it again at once
    const wall = (y: number) => tree(-10, y, 'wall');
    let y = 0;
    while (sight.inLine(wall(y))) y += 0.25;
    const clear = wall(y + HOLD + 2);
    expect(sight.blocks(clear), 'clear of the line with no slack').toBe(false);
    expect(sight.blocks(clear, HOLD), 'with a tree’s slack').toBe(false);
    expect(sight.blocks(clear, HOLD_BUILT), 'with a building’s').toBe(true);
    expect(sight.blocks(wall(y + HOLD_BUILT + 4), HOLD_BUILT), 'well clear').toBe(false);
    expect(HOLD_BUILT).toBeGreaterThan(HOLD);
  });

  it('does not cut a wall for standing at the foot of the picture, off the line, as it does a tree', () => {
    const wall = tree(-55, 20, 'wall');
    expect(sight.inLine(wall)).toBe(false);
    expect(sight.inFront(wall)).toBe(true);
    expect(sight.blocks(wall)).toBe(false);
    expect(sight.blocks(tree(-55, 20, 'conifer'))).toBe(true);
    // in the line it is cut still
    expect(sight.blocks(tree(-10, 0, 'wall'))).toBe(true);
  });

  it.skipIf(UNDER_MUTATION)('makes nothing as it is asked', () => {
    const t = tree(-20, 0);
    expect(heapSwing(() => sight.blocks(t))).toBeLessThan(256 * 1024);
  });

  it('under a camera looking steeply down, cuts a crown filling a corner of the foot, and not one off the picture', () => {
    const steep = new SightLine();
    steep.set([-40, 0, 90], [0, 0, 2]);
    expect(steep.inFront(tree(-25, 25))).toBe(true);
    expect(steep.inFront(tree(-25, 70))).toBe(false);
  });

  it('takes a long wall across the line to be in it, and the same wall beside the line, along it, not', () => {
    // a wall 36 long (18 each way along its heading) and 6 thick, its middle 14 to the side of the line near the rover
    const across = { ...tree(-10, 14, 'wall'), yaw: Math.PI / 2 };
    const along = { ...tree(-10, 14, 'wall'), yaw: 0 };
    expect(sight.inLine(across)).toBe(true);
    expect(sight.inLine(along)).toBe(false);
  });

  it('leaves a house beside the rover standing, though a tree there would be cut, unless it is in the line', () => {
    // half the way to the rover, well to the side: in the foot for a tree, past the near part for a house
    expect(sight.inFront(tree(-20, 30))).toBe(true);
    expect(sight.inFront(tree(-20, 30, 'cottage'))).toBe(false);
    expect(sight.inFront(tree(-55, 20, 'cottage'))).toBe(true);
  });

  it('widens the foot of the picture it cuts with a wider lens', () => {
    const wide = new SightLine(),
      narrow = new SightLine();
    wide.set([-69, 0, 60], [0, 0, 2], [40, 2.4]);
    narrow.set([-69, 0, 60], [0, 0, 2], [40, 1]);
    // well to one side, two thirds of the way back: in the wide picture's foot and out of the narrow one's
    const side = tree(-45, 32);
    expect(wide.inFront(side)).toBe(true);
    expect(narrow.inFront(side)).toBe(false);
  });
});

describe('the frame-time rungs', () => {
  const run = (r: FrameRung, dt: number, seconds: number) => {
    let stepped = 0;
    for (let t = 0; t < seconds; t += dt) if (r.step(dt)) stepped++;
    return stepped;
  };

  it('stays on the top rung while the frames are quick', () => {
    const r = new FrameRung();
    expect(run(r, 1 / 60, 30)).toBe(0);
    expect(r.rung).toBe(0);
  });

  it('steps down one rung once the frames have run slow for the hold, and not before', () => {
    const r = new FrameRung();
    expect(run(r, 1 / 25, RUNG.hold * 0.8)).toBe(0);
    expect(run(r, 1 / 25, RUNG.hold)).toBe(1);
    expect(r.rung).toBe(1);
  });

  it('steps down for frames of 25 ms held for two seconds, and for frames of 45 ms', () => {
    expect(run(new FrameRung(), 0.025, 2)).toBe(1);
    expect(run(new FrameRung(), 0.045, 2)).toBe(1);
  });

  it('does not take a display held at thirty hertz for a slow machine', () => {
    // a browser or a screen capped at 30 Hz gives frames of a steady 33.3 ms however quick the game is
    const r = new FrameRung();
    expect(run(r, 1 / 30, 5)).toBe(0);
    expect(r.rung).toBe(0);
    // within a tenth of it either way is the same cap, with the wobble of a real one
    const wobble = new FrameRung();
    for (let k = 0; k < 150; k++) wobble.step(k % 2 ? 0.031 : 0.036);
    expect(wobble.rung).toBe(0);
    // but a machine that is slower than a cap, or only a little quicker than one, is slow
    expect(run(new FrameRung(), 0.04, 5)).toBeGreaterThan(0);
    expect(run(new FrameRung(), 0.027, 5)).toBeGreaterThan(0);
  });

  it('steps down no further than the last rung, and never back up', () => {
    const r = new FrameRung();
    run(r, 1 / 20, 60);
    expect(r.rung).toBe(RUNG_STEPS.length - 1);
    run(r, 1 / 60, 30);
    expect(r.rung).toBe(RUNG_STEPS.length - 1);
  });

  it('does not count a frame of a tab in the background, or a step of nothing', () => {
    const r = new FrameRung();
    run(r, 1, 30);
    for (let k = 0; k < 600; k++) r.step(0);
    expect(r.rung).toBe(0);
  });

  it('is handed the frame as it took, not as the game was stepped: a long frame passes through to be ignored', () => {
    expect(rungDt(0.3)).toBe(0.3);
    expect(rungDt(1 / 60)).toBe(1 / 60);
    expect(rungDt(-0.5)).toBe(0);
    const r = new FrameRung();
    for (let k = 0; k < 600; k++) r.step(rungDt(0.3));
    expect(r.rung).toBe(0);
  });

  it('asks less of each rung down than of the one before', () => {
    for (let k = 1; k < RUNG_STEPS.length; k++) {
      const a = RUNG_STEPS[k - 1],
        b = RUNG_STEPS[k];
      expect(
        b.trees <= a.trees &&
          b.grass <= a.grass &&
          b.pixel <= a.pixel &&
          (a.occlusion || !b.occlusion) &&
          (a.focus || !b.focus),
      ).toBe(true);
      expect(
        b.trees < a.trees ||
          b.grass < a.grass ||
          b.pixel < a.pixel ||
          b.occlusion !== a.occlusion ||
          b.focus !== a.focus,
      ).toBe(true);
    }
    expect(RUNG_STEPS[0].trees).toBe(RINGS.trees);
  });

  it('is the table, rung by rung: what helps a driver first, and the world’s own look last', () => {
    expect(
      RUNG_STEPS.map(({ trees, grass, occlusion, focus, pixel }) => [trees, grass, occlusion, focus, pixel]),
    ).toEqual([
      [RINGS.trees, 1, true, true, 1.5],
      [RINGS.trees, 1, true, false, 1],
      [4, 1, true, false, 1],
      [4, 0.6, true, false, 1],
      [4, 0.6, false, false, 1],
      [RINGS.kit, 0.45, false, false, 1],
    ]);
  });

  it('drops the viewfinder’s blur and the pixels past one a pixel first, and never has them back', () => {
    expect(RUNG_STEPS[0].focus).toBe(true);
    expect(RUNG_STEPS.slice(1).every((s) => !s.focus)).toBe(true);
    expect(RUNG_STEPS[0].pixel).toBe(1.5);
    expect(RUNG_STEPS.slice(1).every((s) => s.pixel === 1)).toBe(true);
    // the first rung down gives up nothing else of the world's: it is a cheaper picture of the same world
    expect(RUNG_STEPS[1].trees).toBe(RUNG_STEPS[0].trees);
    expect(RUNG_STEPS[1].grass).toBe(RUNG_STEPS[0].grass);
    expect(RUNG_STEPS[1].occlusion).toBe(RUNG_STEPS[0].occlusion);
  });

  it.skipIf(UNDER_MUTATION)('makes nothing as it steps', () => {
    const r = new FrameRung();
    expect(heapSwing(() => r.step(1 / 60))).toBeLessThan(256 * 1024);
  });
});

describe('a frame’s share of the scene’s work', () => {
  it('splits a crossing over two frames while the game plays: the ground now, the pools next', () => {
    expect(frameWork(true, false, false)).toBe(WORK.ground);
    expect(frameWork(false, true, false)).toBe(WORK.refill);
  });

  it('does a crossing whole in a frame that must be settled: a test’s step, or a paused frame', () => {
    // the final pass's bug: the step's picture showed the old pools, and the next frame's the new
    expect(frameWork(true, false, true)).toBe(WORK.ground | WORK.refill);
    expect(frameWork(false, true, true)).toBe(WORK.refill);
  });

  it('does nothing of it in a frame with no crossing and no pools to fill', () => {
    expect(frameWork(false, false, false)).toBe(0);
    expect(frameWork(false, false, true)).toBe(0);
  });
});
