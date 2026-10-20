/**
 * The smaller things of the world that are not built and not wild: the
 * wetland's drooping willow and its lily pads, the orchard's apple trees, a
 * ford's stepping stones and marker posts, and the village's signposts,
 * benches and lamps; and the bush in three shapes. Each stands on the ground
 * at its origin at its size at a placement's scale of one, in units, its
 * front toward +x, made from a seed. No colours here: a part is a named
 * mesh, coloured by the kit.
 */
import { at, built, faceOut, frustum, lump, seeded } from 'artshape-render/mesh/lowpoly';
import type { Scenery } from 'artshape-render/parts/lowpoly';
import { MeshBuilder } from 'artshape-render/mesh/types';
import { posed, type V3 } from './shape';

/**
 * A willow about 2 m tall: a short leaning trunk, a small dome of crown, and hanging from it on every side seven or
 * eight long thin drooping lobes, each a tall soft lump falling nearly to the ground, with a lighter lump at its foot for the
 * new leaves at the strands' tips (`tips`). Soft lumps and not cones: a curtain of panels read as a green lampshade and
 * a ring of thin cones as icicles (review 2, 4). Parts `trunk`, `leaves` and `tips`.
 */
export function willow({ height = 21, seed = 1 } = {}): Scenery {
  const random = seeded(seed * 4243 + 9);
  const h = height;
  const lean = (random() - 0.5) * 0.2;
  const trunk = built((b) => {
    frustum(b, posed(0, 0, 0, random() * 6, lean), 6, h * 0.08, h * 0.05, 0, h * 0.66, { top: false });
  });
  const R = h * 0.36;
  const leaves = new MeshBuilderOf();
  const tips = new MeshBuilderOf();
  lump(leaves.b, at(0, 0, h * 0.8, random() * 3), random, 3, 7, [R * 0.75, R * 0.75, R * 0.42], { give: 0.12 });
  const n = 7 + Math.floor(random() * 2);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + random() * 0.5;
    const r = R * (0.62 + random() * 0.1);
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    // a lobe hangs from the crown, longer than it is wide, its foot a third of the way up the trunk
    const top = h * (0.82 + random() * 0.06),
      foot = h * (0.1 + random() * 0.1);
    const mid = (top + foot) / 2,
      half = (top - foot) / 2;
    lump(leaves.b, at(x, y, mid, a), random, 2, 5, [R * 0.27, R * 0.22, half], { give: 0.14 });
    lump(tips.b, at(x * 1.06, y * 1.06, foot + half * 0.22, a), random, 2, 4, [R * 0.28, R * 0.24, half * 0.3], {
      give: 0.12,
    });
  }
  return {
    name: 'willow',
    parts: [
      { name: 'trunk', mesh: trunk },
      { name: 'leaves', mesh: leaves.b.build() },
      { name: 'tips', mesh: tips.b.build() },
    ],
  };
}

/** A builder to add to from more than one place, where `built` takes one callback. */
class MeshBuilderOf {
  readonly b = new MeshBuilder();
}

/**
 * Lily pads on still water: four or five flat round pads, each with its notch, a little apart, and on some a flower.
 * Laid flat at their origin, which the kit floats on the water. Parts `pad` and `bloom`.
 */
export function lily({ seed = 1 } = {}): Scenery {
  const random = seeded(seed * 911 + 3);
  const blooms: V3[] = [];
  const pad = built((b) => {
    const n = 4 + Math.floor(random() * 2);
    for (let k = 0; k < n; k++) {
      const a = random() * Math.PI * 2,
        d = k === 0 ? 0 : 1.6 + random() * 2.2;
      const cx = Math.cos(a) * d,
        cy = Math.sin(a) * d,
        r = 0.9 + random() * 0.7,
        turn = random() * Math.PI * 2;
      // a disc of nine sides with one wedge cut out: the notch
      for (let i = 1; i < 9; i++) {
        const p = (j: number): V3 => [
          cx + Math.cos(turn + (j / 9) * Math.PI * 2) * r,
          cy + Math.sin(turn + (j / 9) * Math.PI * 2) * r,
          0,
        ];
        faceOut(b, [[cx, cy, 0], p(i), p(i + 1)], [cx, cy, -1]);
      }
      if (random() < 0.35) blooms.push([cx, cy, 0]);
    }
  });
  const bloom = built((b) => {
    for (const c of blooms) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        faceOut(
          b,
          [
            [c[0], c[1], 0.15],
            [c[0] + Math.cos(a - 0.4) * 0.35, c[1] + Math.sin(a - 0.4) * 0.35, 0.2],
            [c[0] + Math.cos(a) * 0.65, c[1] + Math.sin(a) * 0.65, 0.5],
          ],
          [c[0], c[1], -1],
        );
      }
    }
  });
  return {
    name: 'lily',
    parts: [
      { name: 'pad', mesh: pad },
      { name: 'bloom', mesh: bloom },
    ],
  };
}

/**
 * An apple tree, 3 m: a short trunk with a round, rather flat crown of three lumps, and red apples studded round it.
 * Parts `trunk`, `leaves` and `apples`.
 */
export function fruit({ height = 30, seed = 1 } = {}): Scenery {
  const random = seeded(seed * 3361 + 2);
  const h = height;
  const R = h * 0.34;
  const lumps: [number, number, number, number][] = [];
  const leaves = built((b) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + random();
      const r = R * (0.68 + random() * 0.12);
      const c: [number, number, number, number] = [Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4, h * 0.62, r];
      lumps.push(c);
      lump(b, at(c[0], c[1], c[2], a), random, 3, 7, [r, r, r * 0.78], { give: 0.12 });
    }
    lump(b, at(0, 0, h - R * 0.55), random, 3, 7, [R * 0.62, R * 0.62, R * 0.55], { give: 0.12 });
  });
  const trunk = built((b) => frustum(b, at(0, 0, 0), 5, h * 0.06, h * 0.045, 0, h * 0.55, { top: false }));
  const apples = built((b) => {
    for (let k = 0; k < 9; k++) {
      const [cx, cy, cz, r] = lumps[k % 3];
      const a = random() * Math.PI * 2,
        up = (random() - 0.35) * 1.2;
      const p: V3 = [
        cx + Math.cos(a) * Math.cos(up) * r * 0.96,
        cy + Math.sin(a) * Math.cos(up) * r * 0.96,
        cz + Math.sin(up) * r * 0.75,
      ];
      lump(b, at(p[0], p[1], p[2]), random, 2, 5, [0.55, 0.55, 0.55], { give: 0 });
    }
  });
  return {
    name: 'fruit',
    parts: [
      { name: 'trunk', mesh: trunk },
      { name: 'leaves', mesh: leaves },
      { name: 'apples', mesh: apples },
    ],
  };
}

/**
 * A stepping stone: a flat-topped boulder, its top at its origin and its body reaching three units down, so set at the
 * water's level it stands on the ford's bed and shows a dry top. Part `rock`.
 */
export function stepping({ seed = 1 } = {}): Scenery {
  const random = seeded(seed * 577 + 1);
  const rock = built((b) => {
    const r = 2 + random() * 0.6;
    frustum(b, at(0, 0, -3, random() * 3), 7, r * 1.15, r, 0, 3.2, { top: true });
  });
  return { name: 'stepping', parts: [{ name: 'rock', mesh: rock }] };
}

/** A square block of `w` across from `z0` to `z1` at (x, y), turned `yaw`. */
function post(b: MeshBuilder, x: number, y: number, w: number, z0: number, z1: number, yaw = 0) {
  frustum(b, posed(x, y, z0, yaw + Math.PI / 4), 4, w * 0.71, w * 0.71, 0, z1 - z0, { top: true });
}

/** A ford's marker post: a white post with a red top, a metre tall, and a little cap. Parts `post` and `paint`. */
export function marker(): Scenery {
  const white = built((b) => post(b, 0, 0, 0.9, -1, 7));
  const red = built((b) => {
    post(b, 0, 0, 0.95, 7, 9.5);
    frustum(b, posed(0, 0, 9.5, Math.PI / 4), 4, 0.7, 0, 0, 0.6, { top: false });
  });
  return {
    name: 'post',
    parts: [
      { name: 'post', mesh: white },
      { name: 'paint', mesh: red },
    ],
  };
}

/** A signpost: a timber post with two arms pointing off at different heights, each with a painted end. Parts `post` and `paint`. */
export function signpost({ seed = 1 } = {}): Scenery {
  const random = seeded(seed * 71 + 5);
  const arms: [number, number][] = [
    [0, 10],
    [Math.PI * (0.55 + random() * 0.4), 8.6],
  ];
  const wood = built((b) => {
    post(b, 0, 0, 0.8, -1, 12.2);
    for (const [a, z] of arms) {
      const p = posed(0, 0, z, a);
      // the arm: a board out from the post, its end cut to a point
      faceOut(b, [p([0.4, -0.12, -0.7]), p([4.6, -0.12, -0.7]), p([4.6, -0.12, 0.7])], p([2, 1, 0]));
      faceOut(b, [p([0.4, -0.12, -0.7]), p([4.6, -0.12, 0.7]), p([0.4, -0.12, 0.7])], p([2, 1, 0]));
      faceOut(b, [p([0.4, 0.12, -0.7]), p([4.6, 0.12, 0.7]), p([4.6, 0.12, -0.7])], p([2, -1, 0]));
      faceOut(b, [p([0.4, 0.12, -0.7]), p([0.4, 0.12, 0.7]), p([4.6, 0.12, 0.7])], p([2, -1, 0]));
    }
  });
  const paint = built((b) => {
    for (const [a, z] of arms) {
      const p = posed(0, 0, z, a);
      faceOut(b, [p([4.6, -0.14, -0.7]), p([5.5, -0.14, 0]), p([4.6, -0.14, 0.7])], p([5, 1, 0]));
      faceOut(b, [p([4.6, 0.14, -0.7]), p([4.6, 0.14, 0.7]), p([5.5, 0.14, 0])], p([5, -1, 0]));
    }
    frustum(b, posed(0, 0, 12.2, Math.PI / 4), 4, 0.75, 0, 0, 0.7, { top: false });
  });
  return {
    name: 'signpost',
    parts: [
      { name: 'post', mesh: wood },
      { name: 'paint', mesh: paint },
    ],
  };
}

/** A park bench along y: two iron ends, a slatted seat and back. Parts `seat` and `iron`. */
export function bench(): Scenery {
  const seat = built((b) => {
    for (let k = 0; k < 3; k++)
      frustum(b, posed(-0.6 + k * 0.7, -5, 3.2, 0, 0, -Math.PI / 2), 4, 0.3, 0.3, 0, 10, { top: true, bottom: true });
    for (let k = 0; k < 2; k++)
      frustum(b, posed(-1.35, -5, 4.4 + k * 0.9, 0, 0, -Math.PI / 2), 4, 0.28, 0.28, 0, 10, {
        top: true,
        bottom: true,
      });
  });
  const iron = built((b) => {
    for (const y of [-4.2, 4.2]) {
      post(b, 1, y, 0.35, 0, 3.2);
      post(b, -1.2, y, 0.35, 0, 6);
    }
  });
  return {
    name: 'bench',
    parts: [
      { name: 'seat', mesh: seat },
      { name: 'iron', mesh: iron },
    ],
  };
}

/** A lamp post: a dark post on a foot, an arm, and a lantern with warm glass under a little roof. Parts `iron` and `glass`. */
export function lamp(): Scenery {
  const iron = built((b) => {
    frustum(b, at(0, 0, 0), 6, 0.8, 0.6, 0, 1.2, { top: true });
    frustum(b, at(0, 0, 1.2), 6, 0.3, 0.24, 0, 14, { top: false });
    frustum(b, posed(0, 0, 15.2, Math.PI / 4), 4, 1.3, 0.2, 0, 1.2, { top: true });
    frustum(b, posed(0, 0, 14.6, Math.PI / 4), 4, 1.1, 1.1, 0, 0.3, { top: true, bottom: true });
  });
  const glass = built((b) =>
    frustum(b, posed(0, 0, 12.8, Math.PI / 4), 4, 0.75, 1.0, 0, 1.8, { top: false, bottom: true }),
  );
  return {
    name: 'lamp',
    parts: [
      { name: 'iron', mesh: iron },
      { name: 'glass', mesh: glass },
    ],
  };
}

/**
 * A bush in one of three shapes by its seed: a round heap of three lumps, a low wide mound of four, or a tall clump of
 * two, so a hedge row or a scatter of them does not repeat one silhouette. One part, `bush`.
 */
export function shapedBush(size: number, { seed = 1 } = {}): Scenery {
  const random = seeded(seed * 4441 + 9);
  const shape = seed % 3;
  const mesh = built((b) => {
    const n = shape === 1 ? 4 : shape === 2 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + random();
      const r = size * (shape === 2 ? 0.7 : 0.55) * (0.85 + random() * 0.3);
      const spread = shape === 1 ? 0.75 : shape === 2 ? 0.25 : 0.45;
      const tall = shape === 2 ? 1.25 : shape === 1 ? 0.7 : 0.85;
      lump(
        b,
        at(Math.cos(a) * size * spread, Math.sin(a) * size * spread, r * 0.4 * tall),
        random,
        3,
        6,
        [r, r * 0.92, r * tall],
        {
          give: 0.15,
          floor: -r * 0.4,
        },
      );
    }
  });
  return { name: 'bush', parts: [{ name: 'bush', mesh }] };
}
