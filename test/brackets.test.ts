/**
 * The brackets on the fixture world: every oddity in frame and seen is bracketed, where it is drawn and held to the
 * frame, brighter in focus, round the oddity's silhouette; none hidden behind what is built or a tree, none behind the
 * lens, and never more than the pool holds.
 */
import { describe, expect, it } from 'vitest';
import { BRACKETS, Brackets } from '../src/brackets';
import { Subjects } from '../src/sight';
import { EYE, FOCUS, Viewfinder } from '../src/viewfinder';
import { FIXTURE_DUCK, FIXTURE_WATER, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import type { Ground, Placement } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const [duckX, duckY] = fixtureAt(...FIXTURE_DUCK);
const rover = (x: number, y: number, yaw = 0, z = 0.8) => ({ x, y, z, yaw });
const odd = (kind: Placement['kind'], tx: number, ty: number): Placement => {
  const [x, y] = fixtureAt(tx, ty);
  return { kind, x, y, z: 0, yaw: 0, scale: 1, biome: 0, vary: 0.5 };
};

/** Looking west at the fixture's duck from 30 east of it, tilted down at its middle, focused on it. */
function atDuck(s: Subjects) {
  const vf = new Viewfinder();
  vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI));
  vf.look(0, Math.atan2(FIXTURE_WATER + 1.2 - vf.eye[2], 30));
  vf.update(1 / 60, g, s);
  return vf;
}

describe('the brackets', () => {
  it('bracket the duck in frame and seen, round where it is drawn, in focus when focused on', () => {
    const s = Subjects.of(map);
    const vf = atDuck(s);
    const b = new Brackets();
    b.update(vf.shot, s, g);
    expect(b.count).toBe(1);
    expect(b.which[0]).toBe(s.kinds.indexOf('duck'));
    const [x0, y0, x1, y1] = b.box.subarray(0, 4);
    expect(x0).toBeLessThan(0);
    expect(x1).toBeGreaterThan(0);
    expect(y0).toBeLessThan(0);
    expect(y1).toBeGreaterThan(0);
    expect(x1 - x0).toBeLessThan(0.5);
    expect(b.sharp[0]).toBe(1);
  });

  it('show it out of focus when the focus is set far off it', () => {
    const s = Subjects.of(map);
    const vf = atDuck(s);
    vf.shot.focus = FOCUS.far;
    const b = new Brackets();
    b.update(vf.shot, s, g);
    expect(b.count).toBe(1);
    expect(b.sharp[0]).toBe(0);
  });

  it('hold a bracket half out of the frame to the frame', () => {
    const s = Subjects.of(map);
    const vf = atDuck(s);
    vf.zoomBy(135 / 50);
    // turned so the duck sits on the left edge
    vf.look(-Math.atan((12 / 135) * vf.aspect), 0);
    const b = new Brackets();
    b.update(vf.shot, s, g);
    expect(b.count).toBe(1);
    expect(b.box[0]).toBe(-1);
    expect(b.box[2]).toBeGreaterThan(-1);
  });

  it('bracket nothing behind the lens, or out of frame', () => {
    const s = Subjects.of(map);
    const vf = atDuck(s);
    vf.look(Math.PI, 0);
    const b = new Brackets();
    b.update(vf.shot, s, g);
    expect(b.count).toBe(0);
  });

  it('bracket nothing hidden: a gnome behind the cottage, straight ahead', () => {
    const s = new Subjects([odd('gnome', 28, 8.5)]);
    const vf = new Viewfinder();
    vf.enter(rover(...fixtureAt(19, 8.5), 0));
    const b = new Brackets();
    b.update(vf.shot, s, g);
    expect(b.count).toBe(0);
    // walked round to the open side of it, it is
    vf.enter(rover(...fixtureAt(28, 2), Math.PI / 2));
    vf.look(0, -0.3);
    b.update(vf.shot, s, g);
    expect(b.count).toBe(1);
  });

  it('bracket nothing hidden behind a tree: the duck with a broadleaf between it and the lens', () => {
    const tree: Placement = { kind: 'broadleaf', x: duckX + 15, y: duckY, z: 0, yaw: 0, scale: 1, biome: 0, vary: 0.5 };
    const s = new Subjects([...map.placements, tree]);
    const vf = atDuck(s);
    const b = new Brackets();
    b.update(vf.shot, s, g);
    expect(b.count).toBe(0);
    // the tree a little to the side, the duck is bracketed again
    const aside = new Subjects([...map.placements, { ...tree, y: duckY + 6 }]);
    b.update(atDuck(aside).shot, aside, g);
    expect(b.count).toBe(1);
  });

  it('hug the oddity: the duck’s box no wider than its silhouette’s widest ring, well inside its bounding cylinder', () => {
    const s = Subjects.of(map);
    const vf = atDuck(s);
    const b = new Brackets();
    b.update(vf.shot, s, g);
    // the cylinder's 1.3 either side, at about 31 off through a 50 mm lens on a frame 1.6 wide
    const cylinder = (2 * 1.3) / (31 * (12 / 50) * vf.aspect);
    expect(b.box[2] - b.box[0]).toBeLessThan(0.85 * cylinder);
    expect(b.box[2] - b.box[0]).toBeGreaterThan(0.5 * cylinder);
  });

  it('never number more than the pool holds, many gnomes in a row ahead on open ground', () => {
    const flat: Ground = {
      bounds: { minX: -1e3, minY: -1e3, maxX: 1e3, maxY: 1e3 },
      heightAt: () => 0,
      slopeAt: (_x, _y, o) => o.fill(0),
      surfaceAt: () => 0,
      waterDepthAt: () => 0,
      solidAt: () => false,
      topAt: () => 0,
    };
    const row: Placement[] = [];
    for (let k = 0; k < BRACKETS.most + 6; k++)
      row.push({ kind: 'gnome', x: -52.5 + k * 5, y: 60, z: 0, yaw: 0, scale: 1, biome: 0, vary: 0.5 });
    const s = new Subjects(row);
    const vf = new Viewfinder();
    vf.enter(rover(0, 0, Math.PI / 2));
    vf.zoomBy(24 / 50);
    const b = new Brackets();
    b.update(vf.shot, s, flat);
    expect(b.count).toBe(BRACKETS.most);
    expect([...b.which]).toEqual([...Array(BRACKETS.most).keys()].map((k) => k + b.which[0]));
  });

  it('are emptied by a frame with none in it', () => {
    const s = Subjects.of(map);
    const vf = atDuck(s);
    const b = new Brackets();
    b.update(vf.shot, s, g);
    vf.look(0, 1);
    b.update(vf.shot, s, g);
    expect(b.count).toBe(0);
  });
});
