/**
 * What grows in the world, as meshes: golf's faceted broadleaf, conifer,
 * bush, fern and boulder (the renderer's own `parts/lowpoly.ts`, which golf's
 * are copied into), and three of Snappy's: the heath's twisted tree, a clump
 * of reeds and a clump of flowers. Each stands on the ground at its origin at
 * the size it has at a placement's scale of one, in units, and is made from a
 * seed, so the same seed is the same mesh.
 *
 * There are no colours here: a part is a named mesh, and `palette.ts` and the
 * kit colour it by name, biome and `vary`.
 */
import { at, built, faceOut, frustum, lump, seeded } from 'artshape-render/mesh/lowpoly';
import { boulder, broadleaf, conifer, fern, type Scenery } from 'artshape-render/parts/lowpoly';
import { bench, fruit, lamp, lily, marker, shapedBush, signpost, stepping, willow } from './props';
import type { MeshBuilder } from 'artshape-render/mesh/types';
import type { V3 } from './shape';

/**
 * Each kind's size at a placement's scale of one, in units: a broadleaf 3.6 m tall and a conifer 4.4, a twisted heath
 * tree 2.8, a bush a metre across, a fern and the reeds knee to waist high on a person, a clump of flowers knee high,
 * and a boulder a metre across. The rover is half a metre long, so a tree stands seven or nine rovers tall: a good
 * deal smaller than life, as a toy's world is, so the rover reads beside it and the chase camera is over most of a
 * wood and not in it. The trees were a sixth taller, and a canopy beside the rover filled a third of the picture.
 */
export const SIZE = {
  broadleaf: 36,
  conifer: 44,
  twisted: 28,
  bush: 5,
  fern: 6,
  reed: 13,
  flowers: 4.5,
  boulder: 5,
  /** A willow 2 m tall, and an apple tree 3 m; the rest are made at their own size and placed at a scale of one. */
  willow: 21,
  fruit: 30,
  lily: 1,
  stepping: 1,
  post: 1,
  signpost: 1,
  bench: 1,
  lamp: 1,
} as const;
export type SceneryKind = keyof typeof SIZE;

/**
 * The heath's tree: a trunk that leans one way and bends back, a branch off it, and a few flat faceted pads of leaves at
 * their ends, as a hawthorn or a wind-bent pine on a moor is. Parts `trunk` and `leaves`.
 */
export function twisted({ height = SIZE.twisted, seed = 1 } = {}): Scenery {
  const random = seeded(seed * 5113 + 7);
  const h = height;
  const lean = random() * Math.PI * 2;
  const dx = Math.cos(lean),
    dy = Math.sin(lean);
  // the trunk: three segments, out one way then back, thinning as it goes
  const p0: V3 = [0, 0, 0];
  const p1: V3 = [dx * h * 0.16, dy * h * 0.16, h * 0.32];
  const p2: V3 = [dx * h * 0.06 - dy * h * 0.08, dy * h * 0.06 + dx * h * 0.08, h * 0.62];
  const p3: V3 = [-dx * h * 0.12, -dy * h * 0.12, h * 0.8];
  const branch: V3 = [dx * h * 0.34 + dy * h * 0.1, dy * h * 0.34 - dx * h * 0.1, h * 0.66];
  const r = h * 0.055;
  const trunk = built((b) => {
    limb(b, p0, p1, r * 1.3, r);
    limb(b, p1, p2, r, r * 0.8);
    limb(b, p2, p3, r * 0.8, r * 0.55);
    limb(b, p1, branch, r * 0.7, r * 0.45);
  });
  const leaves = built((b) => {
    const pads: [V3, number][] = [
      [p3, 0.4],
      [branch, 0.33],
      [p2, 0.26],
    ];
    for (const [c, s] of pads) {
      const rr = h * s * (0.9 + random() * 0.2);
      lump(b, at(c[0], c[1], c[2] - rr * 0.1, random() * Math.PI), random, 3, 7, [rr, rr * 0.85, rr * 0.42], {
        give: 0.14,
      });
    }
  });
  return {
    name: 'twisted',
    parts: [
      { name: 'trunk', mesh: trunk },
      { name: 'leaves', mesh: leaves },
    ],
  };
}

/** A five-sided limb from `a` to `b`, tapering from `ra` to `rb`, open at both ends, since each meets another. */
function limb(b: MeshBuilder, a: V3, c: V3, ra: number, rb: number) {
  const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  // tilted from straight up toward `d`: a turn about Z to face it, then a pitch over toward it
  const yaw = Math.atan2(d[1], d[0]);
  const pitch = Math.acos(Math.max(-1, Math.min(1, d[2] / len)));
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const place = ([x, y, z]: V3): V3 => {
    const x1 = x * cp + z * sp,
      z1 = -x * sp + z * cp;
    return [a[0] + x1 * cy - y * sy, a[1] + x1 * sy + y * cy, a[2] + z1];
  };
  frustum(b, place, 5, ra, rb, 0, len, { top: false });
}

/**
 * A clump of reeds: thin three-sided stalks leaning a little out from the root, a few of them topped with the brown
 * head of a bulrush. Parts `stalk` and `head`.
 */
export function reed({ height = SIZE.reed, seed = 1 } = {}): Scenery {
  const random = seeded(seed * 2741 + 3);
  const tops: [V3, number][] = [];
  const stalk = built((b) => {
    for (let k = 0; k < 8; k++) {
      const a = random() * Math.PI * 2,
        lean = 0.05 + random() * 0.22,
        len = height * (0.55 + random() * 0.45);
      const root: V3 = [Math.cos(a) * height * 0.06, Math.sin(a) * height * 0.06, 0];
      const tip: V3 = [
        root[0] + Math.cos(a) * Math.sin(lean) * len,
        root[1] + Math.sin(a) * Math.sin(lean) * len,
        Math.cos(lean) * len,
      ];
      const w = height * 0.03;
      const base = [0, 1, 2].map((i): V3 => [
        root[0] + Math.cos(a + i * 2.09) * w,
        root[1] + Math.sin(a + i * 2.09) * w,
        0,
      ]);
      const middle: V3 = [(root[0] * 3 + tip[0]) / 4, (root[1] * 3 + tip[1]) / 4, tip[2] / 4];
      for (let i = 0; i < 3; i++) faceOut(b, [base[i], base[(i + 1) % 3], tip], middle);
      if (k < 3)
        tops.push([[root[0] + (tip[0] - root[0]) * 0.8, root[1] + (tip[1] - root[1]) * 0.8, tip[2] * 0.8], lean]);
    }
  });
  const head = built((b) => {
    for (const [c] of tops)
      frustum(b, at(c[0], c[1], c[2] - height * 0.08), 5, height * 0.035, height * 0.03, 0, height * 0.14, {
        bottom: true,
      });
  });
  return {
    name: 'reed',
    parts: [
      { name: 'stalk', mesh: stalk },
      { name: 'head', mesh: head },
    ],
  };
}

/**
 * A clump of flowers: a few leaves at the root, and five or six flowers on thin stems, each a little five-pointed
 * star of petals tipped up to the sun with a raised middle. Parts `stem` and `petal`, and `eye` for the middles.
 */
export function flowers({ height = SIZE.flowers, seed = 1 } = {}): Scenery {
  const random = seeded(seed * 1777 + 5);
  const heads: V3[] = [];
  const stem = built((b) => {
    const n = 5 + Math.floor(random() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + random() * 0.6;
      const out = height * (0.15 + random() * 0.35);
      const top: V3 = [Math.cos(a) * out, Math.sin(a) * out, height * (0.65 + random() * 0.35)];
      const w = height * 0.04;
      const base: V3[] = [0, 1, 2].map((i) => [Math.cos(a + i * 2.09) * w, Math.sin(a + i * 2.09) * w, 0]);
      const middle: V3 = [top[0] / 4, top[1] / 4, top[2] / 4];
      for (let i = 0; i < 3; i++) faceOut(b, [base[i], base[(i + 1) % 3], top], middle);
      heads.push(top);
    }
    // three leaves lying out from the root
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + random();
      const tip: V3 = [Math.cos(a) * height * 0.5, Math.sin(a) * height * 0.5, height * 0.18];
      const l: V3 = [Math.cos(a + 1.3) * height * 0.1, Math.sin(a + 1.3) * height * 0.1, 0.02];
      const r: V3 = [Math.cos(a - 1.3) * height * 0.1, Math.sin(a - 1.3) * height * 0.1, 0.02];
      faceOut(b, [l, r, tip], [0, 0, -1]);
    }
  });
  const petal = built((b) => {
    for (const c of heads) {
      const R = height * (0.2 + random() * 0.05),
        spin = random() * Math.PI;
      // a star of five points round a pentagon, each point a flat triangle tipped up a little
      for (let i = 0; i < 5; i++) {
        const a0 = spin + (i / 5) * Math.PI * 2,
          a1 = spin + ((i + 0.5) / 5) * Math.PI * 2,
          a2 = spin + ((i + 1) / 5) * Math.PI * 2;
        const p = (a: number, r: number, z: number): V3 => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] + z];
        faceOut(b, [p(a0, R * 0.38, 0), p(a1, R, R * 0.35), p(a2, R * 0.38, 0)], [c[0], c[1], c[2] - R]);
        faceOut(b, [p(a0, R * 0.38, 0), p(a2, R * 0.38, 0), [c[0], c[1], c[2]]], [c[0], c[1], c[2] - R]);
      }
    }
  });
  const eye = built((b) => {
    for (const c of heads) frustum(b, at(c[0], c[1], c[2]), 5, height * 0.06, height * 0.04, 0, height * 0.05);
  });
  return {
    name: 'flowers',
    parts: [
      { name: 'stem', mesh: stem },
      { name: 'petal', mesh: petal },
      { name: 'eye', mesh: eye },
    ],
  };
}

/** The mesh of a scenery kind at its size, from a seed. */
export function sceneryOf(kind: SceneryKind, seed: number): Scenery {
  switch (kind) {
    case 'broadleaf':
      return broadleaf({ height: SIZE.broadleaf, seed });
    case 'conifer':
      return conifer({ height: SIZE.conifer, seed, tiers: 4 });
    case 'twisted':
      return twisted({ seed });
    case 'bush':
      return shapedBush(SIZE.bush, { seed });
    case 'fern':
      return fern(SIZE.fern, { seed });
    case 'reed':
      return reed({ seed });
    case 'flowers':
      return flowers({ seed });
    case 'boulder':
      return boulder(SIZE.boulder, { seed, rings: 4, segments: 6 });
    case 'willow':
      return willow({ seed });
    case 'fruit':
      return fruit({ seed });
    case 'lily':
      return lily({ seed });
    case 'stepping':
      return stepping({ seed });
    case 'post':
      return marker();
    case 'signpost':
      return signpost({ seed });
    case 'bench':
      return bench();
    case 'lamp':
      return lamp();
  }
}
