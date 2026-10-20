/**
 * The line of sight on the fixture world: what a ray meets (the ground, the water, rock, the cottage, an oddity, a
 * tree), and how much of an oddity is in sight from an eye.
 */
import { describe, expect, it } from 'vitest';
import { seeded } from '../src/random';
import {
  BLOCKER_GRID,
  Blockers,
  HIT,
  MARCH,
  SEEN_POINTS,
  Subjects,
  TREE,
  TRUNK,
  cast,
  castInto,
  seenPoints,
  seenShare,
} from '../src/sight';
import { CROWN } from '../src/view';
import { COTTAGE_TOP, FIXTURE, FIXTURE_DUCK, FIXTURE_WATER, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import type { Ground, Placement } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const out = new Float64Array(2);
const [duckX, duckY] = fixtureAt(...FIXTURE_DUCK);

const odd = (kind: Placement['kind'], tx: number, ty: number, yaw = 0, z = 0): Placement => {
  const [x, y] = fixtureAt(tx, ty);
  return { kind, x, y, z, yaw, scale: 1, biome: 0, vary: 0.5 };
};
const unit = (x: number, y: number, z: number) => {
  const d = Math.hypot(x, y, z);
  return [x / d, y / d, z / d];
};

describe('the subjects', () => {
  it('are the oddities among the placements, in order, with their bounds from the table', () => {
    const s = Subjects.of(map);
    expect(s.count).toBe(2);
    expect(s.kinds).toEqual(['duck', 'gnome']);
    expect(s.x[0]).toBe(duckX);
    expect(s.foot[0]).toBe(FIXTURE_WATER);
    expect(s.radius[0]).toBe(1.3);
    expect(s.height[1]).toBe(5);
    expect(s.front[0]).toBe(1);
    expect(s.name(1)).toBe('garden gnome');
    expect(s.lift[0]).toBe(0);
  });

  it('are scaled with their placement, and a UFO has no front', () => {
    const s = new Subjects([{ ...odd('ufo', 3, 3, 0, 60), scale: 2 }]);
    expect(s.radius[0]).toBe(30);
    expect(s.height[0]).toBe(14);
    expect(s.front[0]).toBe(0);
  });

  it('put their middle halfway up, lifted by their bob', () => {
    const s = Subjects.of(map);
    const m = new Float64Array(3);
    s.middle(0, m);
    expect([...m]).toEqual([duckX, duckY, FIXTURE_WATER + 1.2]);
    s.lift[0] = 0.5;
    s.middle(0, m);
    expect(m[2]).toBeCloseTo(FIXTURE_WATER + 1.7, 9);
  });
});

describe('a cast', () => {
  const none = new Subjects([]);

  it('meets the flat ground where it is, to a hundredth of a unit', () => {
    // from 10 up over the road, looking down at 45 degrees eastward
    const [x, y] = fixtureAt(2, 15.5);
    const d = cast(g, none, [x, y, 10], unit(1, 0, -1), 500, out);
    expect(d).toBeCloseTo(10 * Math.SQRT2, 1);
    expect(out[0]).toBe(d);
    expect(out[1]).toBe(HIT.ground);
  });

  it('stops at the water, not the pond bed under it', () => {
    const [x, y] = fixtureAt(7.5, 7.5);
    cast(g, none, [x, y, 10], [0, 0, -1], 500, out);
    expect(out[0]).toBeCloseTo(10 - FIXTURE_WATER, 1);
  });

  it('meets the cottage wall at its edge, and not the ground beyond', () => {
    // level at head height along the cottage's middle row, from four tiles west of it
    const [x0, y] = fixtureAt(20, 8.5);
    const [wall] = fixtureAt(FIXTURE.cottage[0] - 0.5, 8.5);
    cast(g, none, [x0, y, 5], [1, 0, 0], 500, out);
    expect(out[1]).toBe(HIT.ground);
    expect(out[0]).toBeCloseTo(wall - x0, 1);
  });

  it('passes over the cottage when higher than its top', () => {
    const [x0, y] = fixtureAt(20, 8.5);
    cast(g, none, [x0, y, COTTAGE_TOP + 5], [1, 0, 0], 500, out);
    expect(out[1]).toBe(HIT.nothing);
    expect(out[0]).toBe(500);
  });

  it('meets nothing looking at the sky, and gives back its reach', () => {
    expect(cast(g, none, [0, 0, 10], unit(0, 1, 1), 300, out)).toBe(300);
    expect(out[1]).toBe(HIT.nothing);
  });

  it('stops at the edge of the world, past which there is nothing', () => {
    // level and low, so it would meet the ground were the world to go on
    cast(g, null, [80, 0, 1], [1, 0, 0], 5000, out);
    expect(out[1]).toBe(HIT.nothing);
  });

  it('starts under the ground at nought', () => {
    cast(g, none, [0, 0, -5], [1, 0, 0], 100, out);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(HIT.ground);
  });

  it('meets an oddity on its cylinder, nearer than the ground behind it', () => {
    const s = Subjects.of(map);
    // from 30 east of the duck, level with its middle
    const from = [duckX + 30, duckY, FIXTURE_WATER + 1.2];
    cast(g, s, from, [-1, 0, 0], 500, out);
    expect(out[1]).toBe(0);
    expect(out[0]).toBeCloseTo(30 - 1.3, 6);
  });

  it('misses an oddity passing above it, beside it or below its foot', () => {
    const s = new Subjects([odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(20, 2);
    cast(g, s, [x - 20, y, 5.5], [1, 0, 0], 40, out);
    expect(out[1]).toBe(HIT.nothing);
    cast(g, s, [x - 20, y + 1.7, 2], [1, 0, 0], 40, out);
    expect(out[1]).toBe(HIT.nothing);
    cast(g, s, [x - 20, y + 1.5, 2], [1, 0, 0], 40, out);
    expect(out[1]).toBe(0);
    expect(out[0]).toBeGreaterThan(18.4);
    // straight down onto it, and straight down beside it
    cast(g, s, [x, y, 20], [0, 0, -1], 40, out);
    expect(out[1]).toBe(0);
    expect(out[0]).toBeCloseTo(15, 9);
    cast(g, s, [x + 2, y, 20], [0, 0, -1], 40, out);
    expect(out[1]).toBe(HIT.ground);
    // level at its top and at its foot
    cast(g, s, [x - 20, y, 5], [1, 0, 0], 40, out);
    expect(out[1]).toBe(0);
    cast(g, s, [x - 20, y, 6], [1, 0, 0], 40, out);
    expect(out[1]).toBe(HIT.nothing);
  });

  it('meets the nearer of two oddities, and passes the one it is told to skip', () => {
    const s = new Subjects([odd('gnome', 20, 2), odd('gnome', 22, 2)]);
    const [x, y] = fixtureAt(18, 2);
    cast(g, s, [x, y, 2], [1, 0, 0], 100, out);
    expect(out[1]).toBe(0);
    cast(g, s, [x, y, 2], [1, 0, 0], 100, out, 0);
    expect(out[1]).toBe(1);
    // the far one first in the list, met all the same at the near one
    const t = new Subjects([odd('gnome', 22, 2), odd('gnome', 20, 2)]);
    cast(g, t, [x, y, 2], [1, 0, 0], 100, out);
    expect(out[1]).toBe(1);
  });

  it('meets an oddity it starts inside at nought, but not one behind it', () => {
    const s = new Subjects([odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(20, 2);
    cast(g, s, [x, y, 2], [1, 0, 0], 100, out);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    cast(g, s, [x + 10, y, 2], [1, 0, 0], 100, out);
    expect(out[1]).not.toBe(0);
  });

  it('meets the cottage wall looking north as well as east', () => {
    const [x, y0] = fixtureAt(24.5, 5);
    const [, wall] = fixtureAt(24.5, FIXTURE.cottage[1] - 0.5);
    cast(g, null, [x, y0, 5], [0, 1, 0], 500, out);
    expect(out[1]).toBe(HIT.ground);
    expect(out[0]).toBeCloseTo(wall - y0, 1);
  });

  it('walks on to what it meets further off than the far edge is from the near one', () => {
    // a wall five east of the middle of a world ten either way, met from five west of the middle
    const walled: Ground = {
      ...g,
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      topAt: (x, y) => (x > 5 && x < 6 ? 100 : y > 5 && y < 6 ? 100 : 0),
      waterDepthAt: () => 0,
    };
    cast(walled, null, [-5, 0, 1], [1, 0, 0], 50, out);
    expect(out[1]).toBe(HIT.ground);
    expect(out[0]).toBeCloseTo(10, 1);
    cast(walled, null, [0, -5, 1], [0, 1, 0], 50, out);
    expect(out[1]).toBe(HIT.ground);
    expect(out[0]).toBeCloseTo(10, 1);
  });

  it('meets an oddity’s side on a level ray across the ground at a slant', () => {
    const s = new Subjects([odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(20, 2);
    cast(g, s, [x - 10, y - 10, 2], unit(1, 1, 0), 100, out);
    expect(out[1]).toBe(0);
    expect(out[0]).toBeCloseTo(10 * Math.SQRT2 - 1.6, 9);
  });

  it('stops at every edge of the world, past which nothing is met however high it would stand', () => {
    const walled: Ground = {
      ...g,
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      topAt: (x, y) => (Math.abs(x) > 10 || Math.abs(y) > 10 ? 100 : 0),
      waterDepthAt: () => 0,
    };
    for (const dir of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
    ]) {
      cast(walled, null, [0, 0, 1], dir, 50, out);
      expect(out[1], dir.join()).toBe(HIT.nothing);
    }
  });

  it('meets an oddity’s top on a slanting ray, where it comes down through it', () => {
    const s = new Subjects([odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(20, 2);
    // from up and behind, aimed at a point on its top near its far side, and across it at a slant
    const to = [x + 1, y + 0.5, 5],
      from = [x - 3, y - 1, 20];
    const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    cast(g, s, from, unit(to[0] - from[0], to[1] - from[1], to[2] - from[2]), 100, out);
    expect(out[1]).toBe(0);
    expect(out[0]).toBeCloseTo(d, 9);
  });

  it('passes over an oddity on a slanting ray that comes down only after it is past', () => {
    const s = new Subjects([odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(20, 2);
    // over its top at its near side at 6, and down to its top's height two past its far side
    const from = [x - 10, y, 10];
    cast(g, s, from, unit(13.6, 0, -5), 100, out);
    expect(out[1]).toBe(HIT.ground);
  });

  it('meets an oddity where it is lifted to, and not where it stood', () => {
    const s = new Subjects([odd('ufo', 20, 2, 0, 60)]);
    const [x, y] = fixtureAt(20, 2);
    cast(g, s, [x - 40, y, 63], [1, 0, 0], 100, out);
    expect(out[1]).toBe(0);
    cast(g, s, [x - 40, y, 58], [1, 0, 0], 100, out);
    expect(out[1]).toBe(HIT.nothing);
    s.lift[0] = 10;
    cast(g, s, [x - 40, y, 63], [1, 0, 0], 100, out);
    expect(out[1]).toBe(HIT.nothing);
    cast(g, s, [x - 40, y, 72], [1, 0, 0], 100, out);
    expect(out[1]).toBe(0);
  });

  it('skips nothing unless told, cast into an array alone', () => {
    const s = new Subjects([odd('gnome', 22, 2), odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(18, 2);
    castInto(g, s, [x, y, 2], [1, 0, 0], 100, out);
    expect(out[1]).toBe(1);
    expect(out[0]).toBeCloseTo(12 - 1.6, 9);
  });

  it('looks closely near the eye and further apart far off, within its steps', () => {
    expect(MARCH.least).toBeLessThan(MARCH.most);
    expect(MARCH.most).toBeLessThanOrEqual(3);
  });
});

describe('how much of an oddity is seen', () => {
  it('is all of it in the open', () => {
    const s = Subjects.of(map);
    expect(seenPoints(g, [duckX + 30, duckY, 3], s, 0)).toBe(SEEN_POINTS);
    expect(seenShare(g, [duckX + 30, duckY, 3], s, 0)).toBe(1);
  });

  it('is none of it behind the cottage', () => {
    const s = new Subjects([odd('gnome', 28, 8.5)]);
    const [x, y] = fixtureAt(20, 8.5);
    expect(seenShare(g, [x, y, 5], s, 0)).toBe(0);
  });

  it('is some of it half behind something: the top over a wall, the foot not', () => {
    // a gnome behind the rock's 8 units, seen from low down and far back: only what stands over the line is seen
    const flatGround: Ground = { ...g, topAt: (x) => (x > 0 && x < 2 ? 2.5 : 0), waterDepthAt: () => 0 };
    const s = new Subjects([{ ...odd('gnome', 0, 0), x: 6, y: 0, z: 0 }]);
    expect(seenPoints(flatGround, [-20, 0, 1], s, 0)).toBe(1);
    expect(seenPoints(flatGround, [-20, 0, 3], s, 0)).toBeGreaterThan(1);
  });

  it('is the points either side of its middle as the lens sees it, from wherever it is seen', () => {
    // seen at a slant, a post a little left of the line to the gnome's middle hides its left side and no more
    const s = new Subjects([{ ...odd('gnome', 0, 0), x: 6, y: 0, z: 0 }]);
    const eye = [-20, -10, 2.5];
    const ax = 26 / Math.hypot(26, 10),
      ay = 10 / Math.hypot(26, 10);
    // the left side point is the middle moved a quarter turn anticlockwise from the line, 0.7 of the radius out
    const lx = 6 - ay * 1.12,
      ly = ax * 1.12;
    // near the gnome, where the lines to its points are a unit apart, and thin
    const px = eye[0] + (lx - eye[0]) * 0.9,
      py = eye[1] + (ly - eye[1]) * 0.9;
    const post: Ground = { ...g, topAt: (x, y) => (Math.hypot(x - px, y - py) < 0.25 ? 10 : 0), waterDepthAt: () => 0 };
    expect(seenPoints(post, eye, s, 0)).toBe(SEEN_POINTS - 1);
  });

  it('is of it where it is lifted to: over the cottage, the gnome behind it is seen', () => {
    const s = new Subjects([odd('gnome', 28, 8.5)]);
    const [x, y] = fixtureAt(20, 8.5);
    s.lift[0] = 3 * COTTAGE_TOP;
    expect(seenShare(g, [x, y, 5], s, 0)).toBe(1);
  });

  it('is not hidden by itself, but is by another oddity in front of it', () => {
    const s = new Subjects([odd('gnome', 22, 2), odd('ufo', 20, 2)]);
    const [x, y] = fixtureAt(17, 2);
    // the UFO, fifteen wide, stood on the ground here, hides the gnome behind it
    expect(seenShare(g, [x, y, 2.5], s, 0)).toBe(0);
    expect(seenShare(g, [x, y, 2.5], s, 1)).toBe(1);
  });

  it('is all of it looked straight down on', () => {
    const s = new Subjects([odd('gnome', 20, 2)]);
    const [x, y] = fixtureAt(20, 2);
    expect(seenShare(g, [x, y, 30], s, 0)).toBe(1);
  });
});

describe('the trees', () => {
  /** A tree east of the duck, in a copy of the fixture's placements: the fixture itself is left be. */
  const tree = (dx: number, dy = 0, kind: Placement['kind'] = 'broadleaf', scale = 1): Placement => ({
    kind,
    x: duckX + dx,
    y: duckY + dy,
    z: 0,
    yaw: 0,
    scale,
    biome: 0,
    vary: 0.5,
  });
  const withTree = (...more: Placement[]) => Subjects.of({ placements: [...map.placements, ...more] });
  const H = 36;
  const unitTo = (from: number[], to: number[]) => unit(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const DUCK_MIDDLE = [duckX, duckY, FIXTURE_WATER + 1.2];

  it('are read from the placements as a trunk and a crown each, the trees only, as tall as the scene draws them', () => {
    const b = Subjects.of(map).blockers;
    // the fixture's broadleaf and conifer; its bush, boulder and cottage are not trees
    expect(b.count).toBe(4);
    expect([...b.radius]).toEqual([H * TRUNK, H * CROWN, 44 * TRUNK, 44 * TREE.conifer!.crown]);
    expect([...b.bottom]).toEqual([0, H * TREE.broadleaf!.foot, 0, 44 * TREE.conifer!.foot]);
    expect([...b.top]).toEqual([H * TREE.broadleaf!.foot, H, 44 * TREE.conifer!.foot, 44]);
    expect(TREE.broadleaf!.crown).toBe(CROWN);
    expect(Object.keys(TREE).sort()).toEqual(['broadleaf', 'conifer', 'fruit', 'twisted', 'willow']);
    // scaled with the placement, from its foot
    const big = new Blockers([{ ...tree(0), z: 3, scale: 1.5 }]);
    expect(big.top[1]).toBe(3 + 1.5 * H);
    expect(big.radius[1]).toBe(1.5 * H * CROWN);
    expect(new Blockers([tree(0, 0, 'bush'), tree(0, 0, 'cottage')]).count).toBe(0);
  });

  it('hide the duck behind a crown from a lens up high, and every part of it with it', () => {
    const eye = [duckX + 40, duckY, 30];
    expect(seenPoints(g, eye, Subjects.of(map), 0)).toBe(SEEN_POINTS);
    const s = withTree(tree(20));
    expect(seenPoints(g, eye, s, 0)).toBe(0);
    // the ray to its middle meets the crown's near side, where it comes down into it
    cast(g, s, eye, unitTo(eye, DUCK_MIDDLE), 100, out);
    expect(out[1]).toBe(HIT.tree);
    const r = H * CROWN;
    const slope = (30 - DUCK_MIDDLE[2]) / 40;
    // the crown's side is 20 - r east of the eye's foot, met that much across at the ray's slant
    expect(out[0]).toBeCloseTo((20 - r) * Math.hypot(1, slope), 6);
  });

  it('let the lens see under a crown, past the trunk, but not through the trunk', () => {
    const s = withTree(tree(20));
    // low down: under the crown, the trunk's own width to the side of the line
    expect(seenPoints(g, [duckX + 40, duckY + 6, 0.5], s, 0)).toBe(SEEN_POINTS);
    cast(g, s, [duckX + 40, duckY, 0.5], [-1, 0, 0], 100, out);
    expect(out[1]).toBe(HIT.tree);
    expect(out[0]).toBeCloseTo(20 - H * TRUNK, 9);
    // just beside the trunk the ray goes on under the crown, past the duck too, to the far shore
    cast(g, s, [duckX + 40, duckY + H * TRUNK + 0.1, 0.5], [-1, 0, 0], 100, out);
    expect(out[1]).not.toBe(HIT.tree);
    expect(out[0]).toBeGreaterThan(40);
  });

  it('are met on the crown’s top looking down, and not at all from inside a crown, which the scene cuts away', () => {
    const s = withTree(tree(20));
    cast(g, s, [duckX + 20, duckY, 60], [0, 0, -1], 100, out);
    expect(out[1]).toBe(HIT.tree);
    expect(out[0]).toBeCloseTo(60 - H, 9);
    // from in the crown, the duck is in sight past it
    const inside = [duckX + 20, duckY, 20];
    expect(seenPoints(g, inside, s, 0)).toBe(SEEN_POINTS);
    cast(g, s, inside, unitTo(inside, DUCK_MIDDLE), 100, out);
    expect(out[1]).toBe(0);
  });

  it('are met by a ray however it crosses the grid: the walk finds what every tree tried in turn finds', () => {
    // a wood of a few hundred trees of every kind and size, and rays from all over it every way, the ground far below
    const random = seeded(7);
    const kinds = Object.keys(TREE) as Placement['kind'][];
    // small trees, most of them filed in a cell or two, so a cell the walk skipped would be missed
    const wood: Placement[] = Array.from({ length: 600 }, () => ({
      kind: kinds[Math.floor(random() * kinds.length)],
      x: (random() - 0.5) * 600,
      y: (random() - 0.5) * 400,
      z: random() * 10,
      yaw: 0,
      scale: 0.2 + random() * 0.6,
      biome: 0,
      vary: 0.5,
    }));
    const s = new Subjects(wood);
    const b = s.blockers;
    const open: Ground = { ...g, bounds: { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 }, topAt: () => -1e6 };
    // every cylinder tried in turn, walked finely: the nearest place along the ray inside one the eye is not inside
    const every = (from: number[], dir: number[], reach: number) => {
      let best = reach;
      for (let k = 0; k < b.count; k++) {
        const cx = from[0] - b.x[k],
          cy = from[1] - b.y[k];
        const r = b.radius[k];
        if (cx * cx + cy * cy <= r * r && from[2] >= b.bottom[k] && from[2] <= b.top[k]) continue;
        // a cylinder the ray passes nowhere near, across the ground, is passed over at once
        const flat = Math.hypot(dir[0], dir[1]);
        if (flat > 1e-9) {
          const along = -(cx * dir[0] + cy * dir[1]) / (flat * flat);
          const px = cx + dir[0] * along,
            py = cy + dir[1] * along;
          if (px * px + py * py > r * r) continue;
        }
        for (let t = 0; t < best; t += 0.02) {
          const x = cx + dir[0] * t,
            y = cy + dir[1] * t,
            z = from[2] + dir[2] * t;
          if (x * x + y * y <= r * r && z >= b.bottom[k] && z <= b.top[k]) {
            best = t;
            break;
          }
        }
      }
      return best;
    };
    let met = 0;
    for (let n = 0; n < 150; n++) {
      // from in the wood and from well outside it, past its corners too, aimed into it more often than not
      const from = [(random() - 0.5) * 1400, (random() - 0.5) * 1000, 2 + random() * 8];
      const a = Math.atan2(-from[1], -from[0]) + (random() - 0.5) * (n % 2 ? 1 : 6),
        up = (random() - 0.5) * 0.05;
      // now and then square along x or y, or straight down
      const dir =
        n % 10 === 0
          ? [1, 0, 0]
          : n % 10 === 1
            ? [0, -1, 0]
            : n % 10 === 2
              ? [0, 0, -1]
              : [Math.cos(a) * Math.cos(up), Math.sin(a) * Math.cos(up), Math.sin(up)];
      const reach = 50 + random() * 1200;
      cast(open, s, from, dir, reach, out);
      const expected = every(from, dir, reach);
      expect(out[0], `ray ${n}`).toBeGreaterThan(expected - 0.03);
      expect(out[0], `ray ${n}`).toBeLessThan(expected + 1e-9);
      expect(out[1], `ray ${n}`).toBe(expected < reach ? HIT.tree : HIT.nothing);
      if (expected < reach) met++;
    }
    expect(met).toBeGreaterThan(35);
  });

  it('are nothing to a world without them, and a world of one tree is a grid of one cell', () => {
    expect(new Blockers([]).count).toBe(0);
    cast(g, new Subjects([]), [duckX + 40, duckY, 2], [-1, 0, 0], 30, out);
    expect(out[1]).toBe(HIT.nothing);
    const one = new Blockers([tree(0, 0, 'twisted', 0.5)]);
    expect([one.cols, one.rows]).toEqual([1, 1]);
    expect(BLOCKER_GRID.cell).toBe(16);
  });
});
