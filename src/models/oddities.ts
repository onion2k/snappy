/**
 * The oddities as they are drawn: a classic yellow rubber duck, a garden
 * gnome with his red hat and his fishing rod, and a chrome saucer with a
 * glass dome and a ring of coloured lights. Each stands at its origin at its
 * size at a placement's scale of one, in units, to `SUBJECTS` (a duck 25 cm
 * long, a gnome 50 cm tall, a saucer 3 m across), and the duck and the gnome
 * face +x, which is the front the grade reads.
 *
 * They are the stars of the game, and drawn smooth and not faceted as the
 * scenery is: moulded rubber, glazed clay and polished metal, so each reads
 * as a made thing against the wild ones round it. Their shapes are turned
 * profiles (`revolve`), squeezed and bent into a duck's body or a gnome's
 * drooping hat by `warped`, which carries the normals through the bend.
 *
 * No colours here but their names: a part is a named mesh, coloured by
 * `ODDITY_PARTS` through the kit.
 */
import type { Scenery } from 'artshape-render/parts/lowpoly';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { revolve } from 'artshape-render/mesh/revolve';
import { SUBJECTS, type SubjectKind } from '../world/types';
import { ODDITY_COLOURS as O, ROUGH, type Rgb } from './palette';
import type { V3 } from './shape';

/** A point of a profile, [radius, height]. */
type P2 = [number, number];

/** Where a point goes: any smooth map, a bend or a squeeze as well as a turn and a move. */
type Warp = (p: V3) => V3;

/**
 * Every point and face of `mesh` carried through `f` into `b`, each normal carried as a normal is, by the inverse
 * transpose of the map's own stretch at the point (taken by difference), so a ball squeezed into an egg or a cone bent
 * over is lit as its new shape and not its old one.
 */
function warped(b: MeshBuilder, mesh: Mesh, f: Warp) {
  const p = mesh.positions,
    n = mesh.normals,
    base = b.vertexCount;
  const e = 1e-3;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i],
      y = p[i + 1],
      z = p[i + 2];
    const q = f([x, y, z]);
    const fx = f([x + e, y, z]),
      fy = f([x, y + e, z]),
      fz = f([x, y, z + e]);
    // the columns of the map's stretch here
    const a: V3 = [(fx[0] - q[0]) / e, (fx[1] - q[1]) / e, (fx[2] - q[2]) / e];
    const c: V3 = [(fy[0] - q[0]) / e, (fy[1] - q[1]) / e, (fy[2] - q[2]) / e];
    const d: V3 = [(fz[0] - q[0]) / e, (fz[1] - q[1]) / e, (fz[2] - q[2]) / e];
    // the inverse transpose's columns are the cross products of the stretch's, over its determinant: its sign is kept,
    // and its size does not matter, since the normal is made a unit again
    const cd = cross(c, d),
      da = cross(d, a),
      ac = cross(a, c);
    const det = a[0] * cd[0] + a[1] * cd[1] + a[2] * cd[2] < 0 ? -1 : 1;
    const nx = (cd[0] * n[i] + da[0] * n[i + 1] + ac[0] * n[i + 2]) * det,
      ny = (cd[1] * n[i] + da[1] * n[i + 1] + ac[1] * n[i + 2]) * det,
      nz = (cd[2] * n[i] + da[2] * n[i + 1] + ac[2] * n[i + 2]) * det;
    const l = Math.hypot(nx, ny, nz) || 1;
    b.vertex(q[0], q[1], q[2], nx / l, ny / l, nz / l, 0, 0);
  }
  for (let i = 0; i < mesh.indices.length; i += 3)
    b.triangle(base + mesh.indices[i], base + mesh.indices[i + 1], base + mesh.indices[i + 2]);
}

const cross = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];

/** A smooth solid turned from a profile, run bottom to top (or round a ring, `closed`), and carried through `f`. */
function turned(b: MeshBuilder, profile: P2[], segments: number, f: Warp, sharp?: boolean[], closed = false) {
  warped(b, revolve({ points: profile, sharp, closed }, { segments }), f);
}

/** A ball's profile of `rings` rows, radius one, from its foot to its top. */
function ballProfile(rings: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * Math.PI;
    out.push([i === 0 || i === rings ? 0 : Math.cos(a), Math.sin(a)]);
  }
  return out;
}

/** A ball stretched to `r` along x, y and z, at `c`, then turned `yaw` about z and tipped `pitch` about y first. */
function ball(b: MeshBuilder, c: V3, r: V3, segments: number, rings: number, yaw = 0, pitch = 0) {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  turned(b, ballProfile(rings), segments, ([x, y, z]) => {
    const px = x * r[0],
      py = y * r[1],
      pz = z * r[2];
    const tx = px * cp + pz * sp,
      tz = -px * sp + pz * cp;
    return [c[0] + tx * cy - py * sy, c[1] + tx * sy + py * cy, c[2] + tz];
  });
}

/** A rod of `n` sides from `a` to `c`, smooth round and shut at both ends. */
function rod(b: MeshBuilder, a: V3, c: V3, r: number, n: number) {
  const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const w: V3 = [d[0] / len, d[1] / len, d[2] / len];
  let u = cross(w, [0, 0, 1]);
  if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = [1, 0, 0];
  const k = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / k, u[1] / k, u[2] / k];
  const v = cross(w, u);
  turned(
    b,
    [
      [0, 0],
      [r, 0],
      [r, len],
      [0, len],
    ],
    n,
    ([x, y, z]) => [
      a[0] + x * u[0] + y * v[0] + z * w[0],
      a[1] + x * u[1] + y * v[1] + z * w[1],
      a[2] + x * u[2] + y * v[2] + z * w[2],
    ],
    [false, true, true, false],
  );
}

/** A named part from a builder's work. */
function part(name: string, build: (b: MeshBuilder) => void): { name: string; mesh: Mesh } {
  const b = new MeshBuilder();
  build(b);
  return { name, mesh: b.build() };
}

// ---- the duck ----

/**
 * The rubber duck: 2.5 units nose to tail, 2.4 tall, its foot at the waterline. A plump body, an egg squeezed in at
 * the sides with its back swept up into a perky tail; a round head set forward on it; a wide flat orange beak with a
 * smile in its line; two shiny black eyes, each with a white glint; and a moulded wing on either side. Parts `body`,
 * `wing`, `beak`, `eye` and `glint`.
 *
 * It comes in its kind's three looks (`SUBJECTS.duck.looks`): the yellow one; a black one, `ink` and `inkWing`, whose
 * eyes are white (`eyeWhite`) round a black middle so they read on it; and a yellow one a little smaller with a top
 * hat cocked on its head (`topHat`, `hatBand`), small enough that the hat's crown is under the kind's height.
 */
export function duck(look = 0): Scenery {
  const black = look === 1,
    hatted = look === 2;
  // the hatted duck is a size smaller, from its foot, so it and its hat stand in a plain duck's bounds
  const k = hatted ? 0.84 : 1;
  const size: Warp = ([x, y, z]) => [x * k, y * k, z * k];
  // the whole duck is set back by this along x, so its middle is between its tail and its bill
  const back = -0.03;
  const head: V3 = [0.45 + back, 0, 1.78],
    headR: V3 = [0.62, 0.58, 0.58];
  const body = posed(black ? 'ink' : 'body', size, (b) => {
    // the body's profile, a round-bottomed tub that sits a little into the water
    const profile: P2[] = [
      [0, -0.15],
      [0.55, -0.12],
      [0.92, 0.08],
      [1.08, 0.38],
      [1.08, 0.7],
      [0.96, 0.98],
      [0.72, 1.18],
      [0.38, 1.28],
      [0, 1.3],
    ];
    turned(b, profile, 18, ([x, y, z]) => {
      // longer than it is wide, and its back half swept up toward the tail
      const aft = Math.max(0, -x);
      const lift = aft * aft * 0.85 * Math.max(0, z + 0.2);
      return [x * 1.05 - aft * aft * 0.1 + back, y * 0.86, z + lift];
    });
    ball(b, head, headR, 16, 9);
  });
  const wing = posed(black ? 'inkWing' : 'wing', size, (b) => {
    for (const s of [1, -1]) ball(b, [-0.25 + back, s * 0.7, 0.84], [0.56, 0.26, 0.32], 10, 5, s * 0.12, 0.35);
  });
  const beak = posed('beak', size, (b) => {
    // one broad flat bill, tipped up a little at its end, low on the face
    ball(b, [0.98 + back, 0, 1.63], [0.34, 0.31, 0.13], 12, 5, 0, -0.18);
  });
  // a black duck's eyes are a white ball each, with the black eye set out of its front
  const whites = black
    ? [
        posed('eyeWhite', size, (b) => {
          for (const s of [1, -1]) ball(b, on(head, headR, s * 0.6, 0.32), [0.1, 0.13, 0.17], 8, 4, s * 0.6);
        }),
      ]
    : [];
  const eye = posed('eye', size, (b) => {
    // a black duck's a little smaller and set out of its white, so the white rings it
    const out = black ? 1.13 : 1,
      r: V3 = black ? [0.06, 0.07, 0.1] : [0.08, 0.09, 0.13];
    for (const s of [1, -1]) ball(b, on(head, headR, s * 0.62, 0.32, out), r, 8, 4, s * 0.62);
  });
  const glint = posed('glint', size, (b) => {
    for (const s of [1, -1]) ball(b, on(head, headR, s * 0.56, 0.4, black ? 1.12 : 1.06), [0.03, 0.035, 0.035], 6, 3);
  });
  const hat = hatted ? topHat(head, headR, k) : [];
  return { name: 'duck', parts: [body, wing, beak, ...whites, eye, glint, ...hat] };
}

/**
 * A little top hat for a duck whose head is `head` and `headR` before it is made `k` its size: a brim and a crown
 * with a red band, cocked back and to one side, its crown under the duck's height.
 */
function topHat(head: V3, headR: V3, k: number) {
  // where it sits: on the crown of the head, a little back
  const seat: V3 = [(head[0] - 0.08) * k, 0.05 * k, (head[2] + headR[2] * 0.86) * k];
  const tip = 0.32,
    roll = -0.2;
  // the hat's own frame: up its axis, cocked back by `tip` about y and to the side by `roll` about x
  const cocked: Warp = ([x, y, z]) => {
    const ct = Math.cos(tip),
      st = Math.sin(tip),
      cr = Math.cos(roll),
      sr = Math.sin(roll);
    const x1 = x * ct - z * st,
      z1 = x * st + z * ct;
    const y2 = y * cr - z1 * sr,
      z2 = y * sr + z1 * cr;
    return [seat[0] + x1, seat[1] + y2, seat[2] + z2];
  };
  const crown = 0.26,
    tall = 0.34;
  return [
    part('topHat', (b) => {
      // the brim, a flat ring with a little roll at its edge, and the crown on it
      turned(
        b,
        [
          [0, -0.02],
          [0.44, -0.02],
          [0.46, 0.03],
          [0.42, 0.05],
          [crown, 0.05],
          [crown, tall],
          [crown * 1.04, tall + 0.02],
          [0, tall + 0.03],
        ],
        14,
        cocked,
        [false, true, false, true, true, false, false, false],
      );
    }),
    part('hatBand', (b) => {
      turned(
        b,
        [
          [crown + 0.012, 0.06],
          [crown + 0.012, 0.15],
        ],
        14,
        cocked,
      );
    }),
  ];
}

/**
 * The point on a ball stretched to `r` about `c`, `az` round from its front (+x) and `el` up from its middle, times
 * `out` of the way out: where an eye or a nose is set on a head.
 */
function on(c: V3, r: V3, az: number, el: number, out = 1): V3 {
  return [
    c[0] + Math.cos(el) * Math.cos(az) * r[0] * out,
    c[1] + Math.cos(el) * Math.sin(az) * r[1] * out,
    c[2] + Math.sin(el) * r[2] * out,
  ];
}

/** A named part built as `build` makes it, then carried through `pose` whole, and with `after` added as it is. */
function posed(name: string, pose: Warp, build: (b: MeshBuilder) => void, after?: (b: MeshBuilder) => void) {
  const made = new MeshBuilder();
  build(made);
  const b = new MeshBuilder();
  if (made.triangleCount > 0) warped(b, made.build(), pose);
  after?.(b);
  return { name, mesh: b.build() };
}

// ---- the gnome ----

/**
 * How the sleeping gnome sits: his coat from its hem, `foot` up, to his belt pressed down to `low` of its height and
 * onto the ground, as a coat sat on spreads,
 * and all above it set on his hips and leaned back by `lean` and to his left by `roll`, in radians, bending over the
 * first `bend` units over the hips so the coat folds and does not break.
 */
const SIT = { foot: 0.3, belt: 1.5, low: 0.5, lean: 0.42, roll: 0.3, bend: 0.9 } as const;

/** Where a point of a standing gnome goes when he sits down to sleep. */
const sitting: Warp = ([x, y, z]) => {
  // the coat's hem on the ground, a hair into it
  const hips = (SIT.belt - SIT.foot) * SIT.low;
  if (z <= SIT.belt) return [x, y, (z - SIT.foot) * SIT.low];
  const h = z - SIT.belt;
  const f = Math.min(1, h / SIT.bend),
    ease = f * f * (3 - 2 * f);
  const a = SIT.lean * ease,
    r = SIT.roll * ease;
  const x1 = x * Math.cos(a) - h * Math.sin(a),
    z1 = x * Math.sin(a) + h * Math.cos(a);
  return [x1, y * Math.cos(r) - z1 * Math.sin(r), hips + y * Math.sin(r) + z1 * Math.cos(r)];
};

/**
 * The garden gnome: five units tall to the tip of his hat. Brown boots poking out under a coat that flares to his
 * knees, a black belt with a gold buckle, round pink hands, a round face with a big nose and rosy cheeks over a long
 * white beard, and a tall hat whose tip droops forward. Parts `boot`, `coat`, `belt`, `buckle`, `skin`, `cheek`,
 * `beard`, `hat` and `eye`, and what he holds.
 *
 * He comes in his kind's five looks (`SUBJECTS.gnome.looks`), each a pose and a thing held, so no two finds are the
 * same: fishing, his rod held up at his side and its line hanging (`rod`, `line`, `float`); holding a lantern out
 * before him (`iron`, `lamp`); sat on the ground asleep, his legs out and his eyes shut and his hands on his belly;
 * behind a wheelbarrow of apples, his hands on its handles (`barrow`, `tyre`, `rod`, `apple`), set back so the
 * barrow is in his bounds; and waving, one hand up high and one eye shut in a wink.
 */
export function gnome(look = 0): Scenery {
  const pose = SUBJECTS.gnome.looks[look] ?? 'fishing';
  const asleep = pose === 'asleep';
  const behind = pose === 'barrow' ? -0.46 : 0;
  const body: Warp = asleep ? sitting : ([x, y, z]) => [x + behind, y, z];
  // where his hands are, standing: before him at his belt, but as the pose has them
  const hands: Record<number, V3> = { 1: [0.76, 0.3, 1.74], [-1]: [0.76, -0.3, 1.74] };
  if (pose === 'lantern') {
    hands[-1] = [1.0, -0.48, 2.42];
    hands[1] = [0.72, 0.42, 1.7];
  } else if (pose === 'asleep') {
    hands[1] = [0.8, 0.22, 1.86];
    hands[-1] = [0.8, -0.24, 1.8];
  } else if (pose === 'barrow') {
    hands[1] = [1.02, 0.44, 1.42];
    hands[-1] = [1.02, -0.44, 1.42];
  } else if (pose === 'waving') {
    hands[-1] = [0.32, -1.12, 3.1];
    hands[1] = [0.72, 0.38, 1.68];
  }
  const boot = posed(
    'boot',
    body,
    (b) => {
      if (!asleep) for (const s of [1, -1]) ball(b, [0.28, s * 0.36, 0.2], [0.52, 0.3, 0.26], 10, 5);
    },
    (b) => {
      // sat, his boots at the ends of his legs, toes up
      if (asleep) for (const s of [1, -1]) ball(b, [1.12, s * 0.4, 0.4], [0.24, 0.26, 0.38], 10, 5, 0, 0.2);
    },
  );
  const coat = posed(
    'coat',
    body,
    (b) => {
      turned(
        b,
        [
          [0, 0.3],
          [1.0, 0.3],
          [0.98, 0.55],
          [0.86, 1.3],
          [0.72, 2.1],
          [0.62, 2.55],
          [0.3, 2.85],
          [0, 2.9],
        ],
        16,
        ([x, y, z]) => [x * 0.92 + 0.04, y, z],
        [false, true, false, false, false, false, false, false],
      );
      // the arms: sleeves from the shoulders to the hands
      for (const s of [1, -1]) {
        const sh: V3 = [0.05, s * 0.66, 2.35],
          h = hands[s];
        // the cuff a little short of the hand, back along the arm
        const d = Math.hypot(h[0] - sh[0], h[1] - sh[1], h[2] - sh[2]);
        const k = 1 - 0.1 / d;
        rodTaper(
          b,
          sh,
          [sh[0] + (h[0] - sh[0]) * k, sh[1] + (h[1] - sh[1]) * k, sh[2] + (h[2] - sh[2]) * k],
          0.24,
          0.18,
          8,
        );
      }
    },
    (b) => {
      // sat, his legs out before him
      if (asleep) for (const s of [1, -1]) rodTaper(b, [0.2, s * 0.36, 0.34], [1.02, s * 0.4, 0.32], 0.27, 0.22, 8);
    },
  );
  const belt = posed('belt', body, (b) => {
    turned(
      b,
      [
        [0.83, 1.5],
        [0.83, 1.72],
      ],
      16,
      ([x, y, z]) => [x * 0.94 + 0.04, y * 1.02, z],
    );
  });
  const buckle = posed('buckle', body, (b) => {
    ball(b, [0.85, 0, 1.61], [0.06, 0.18, 0.14], 6, 3);
  });
  const face: V3 = [0.12, 0, 3.08],
    faceR: V3 = [0.58, 0.58, 0.56];
  const skin = posed('skin', body, (b) => {
    // the face, and the round nose on it, and the hands; a waving hand is open, its palm out
    ball(b, face, faceR, 14, 8);
    ball(b, on(face, faceR, 0, -0.12, 0.98), [0.2, 0.2, 0.19], 10, 5);
    for (const s of [1, -1])
      if (pose === 'waving' && s === -1) ball(b, hands[s], [0.12, 0.2, 0.24], 8, 4, 0.3);
      else ball(b, hands[s], [0.19, 0.18, 0.18], 8, 4);
  });
  const cheek = posed('cheek', body, (b) => {
    for (const s of [1, -1]) ball(b, on(face, faceR, s * 0.62, -0.18), [0.07, 0.13, 0.1], 8, 4, s * 0.62);
  });
  const beard = posed('beard', body, (b) => {
    // a long beard: a cone pointing down, flat at the back against the coat, wide at the cheeks
    turned(
      b,
      [
        [0, 1.65],
        [0.22, 1.85],
        [0.44, 2.25],
        [0.56, 2.7],
        [0.54, 3.0],
        [0, 3.02],
      ],
      14,
      ([x, y, z]) => [0.34 + Math.max(x, -0.15) * 0.8 + (3 - z) * 0.08, y * 1.05, z],
    );
    // and a moustache under the nose, either side
    for (const s of [1, -1]) ball(b, [0.62, s * 0.2, 2.86], [0.14, 0.24, 0.1], 8, 4, s * 0.35);
  });
  // asleep, his hat's tip flops further forward, over his brow
  const droop = asleep ? 0.6 : 0.42;
  const hat = posed('hat', body, (b) => {
    // a tall cone from a brim over the brow, its tip bent forward and down
    turned(
      b,
      [
        [0, 3.24],
        [0.66, 3.24],
        [0.66, 3.4],
        [0.5, 3.9],
        [0.32, 4.4],
        [0.14, 4.85],
        [0, 5.05],
      ],
      16,
      ([x, y, z]) => {
        const up = Math.max(0, z - 3.6);
        return [x + 0.06 + up * up * droop, y, z - up * up * (droop - 0.3)];
      },
      [false, true, true, false, false, false, false],
    );
  });
  const eye = posed('eye', body, (b) => {
    for (const s of [1, -1]) {
      // an eye shut is a short dark line; asleep both are, and waving the right one winks
      const shut = asleep || (pose === 'waving' && s === -1);
      if (shut) ball(b, on(face, faceR, s * 0.36, 0.04), [0.04, 0.11, 0.028], 6, 3, s * 0.36);
      else ball(b, on(face, faceR, s * 0.36, 0.08), [0.06, 0.06, 0.08], 6, 3, s * 0.36);
    }
  });
  const held =
    pose === 'fishing' ? fishing() : pose === 'lantern' ? lantern(hands[-1]) : pose === 'barrow' ? barrow() : [];
  return {
    name: 'gnome',
    parts: [boot, coat, belt, buckle, skin, cheek, beard, hat, eye, ...held],
  };
}

/** The fishing gnome's rod, held up in his right hand, out to his side, and its line hanging from it to a red float. */
function fishing() {
  const tip: V3 = [0.85, -1.1, 4.6];
  return [
    part('rod', (b) => rodTaper(b, [0.72, -0.3, 1.45], tip, 0.07, 0.035, 5)),
    part('line', (b) => rodTaper(b, tip, [0.9, -1.12, 1.3], 0.02, 0.02, 3)),
    part('float', (b) => ball(b, [0.9, -1.12, 1.22], [0.12, 0.12, 0.16], 8, 4)),
  ];
}

/**
 * A lantern hung from the hand at `hand`: a black iron bail, a cap with a ring on top, and a base, and between them a
 * round pane of warm glass, big enough to read as a light from the chase camera.
 */
function lantern(hand: V3) {
  const [x, y] = [hand[0] + 0.04, hand[1]];
  const top = hand[2] - 0.2;
  return [
    part('iron', (b) => {
      rodTaper(b, [x, y, hand[2] + 0.08], [x, y, top], 0.035, 0.035, 4);
      // the cap, a little roof
      turned(
        b,
        [
          [0, top - 0.12],
          [0.3, top - 0.12],
          [0.14, top + 0.02],
          [0, top + 0.04],
        ],
        10,
        ([px, py, pz]) => [x + px, y + py, pz],
        [false, true, true, false],
      );
      // the base
      turned(
        b,
        [
          [0, top - 0.78],
          [0.28, top - 0.78],
          [0.28, top - 0.68],
          [0, top - 0.66],
        ],
        10,
        ([px, py, pz]) => [x + px, y + py, pz],
        [false, true, true, false],
      );
    }),
    part('lamp', (b) => {
      turned(
        b,
        [
          [0, top - 0.68],
          [0.2, top - 0.66],
          [0.25, top - 0.4],
          [0.2, top - 0.13],
          [0, top - 0.12],
        ],
        10,
        ([px, py, pz]) => [x + px, y + py, pz],
      );
    }),
  ];
}

/**
 * A wheelbarrow before the gnome, its handles in his hands: a green tray, wider at its lip, on two shafts that run
 * from its wheel's axle back to his hands, two legs under it, a black tyre, and a heap of red apples in it. All of it
 * inside his bounds, the wheel's front a hair under them.
 */
function barrow() {
  const front = 1.24,
    axle = 0.3,
    wheel = 0.28;
  const tray: Warp = ([x, y, z]) => {
    // a four-sided bowl, its corners to the sides, stretched along x
    const c = Math.SQRT1_2;
    return [0.98 + (x * c - y * c) * 1.05, (x * c + y * c) * 0.95, z];
  };
  return [
    part('barrow', (b) => {
      turned(
        b,
        [
          [0, 0.58],
          [0.36, 0.58],
          [0.6, 1.02],
          [0.54, 1.04],
          [0, 0.66],
        ],
        4,
        tray,
        [false, true, true, true, false],
      );
    }),
    part('rod', (b) => {
      // the shafts, from the axle up and back to the hands, and the legs
      for (const s of [1, -1]) {
        rodTaper(b, [front, s * 0.14, axle], [0.52, s * 0.44, 1.4], 0.05, 0.05, 5);
        rodTaper(b, [0.74, s * 0.26, 0.62], [0.72, s * 0.3, 0.02], 0.045, 0.045, 5);
      }
    }),
    part('tyre', (b) => {
      // the wheel, a fat ring on its side, its axis along y
      turned(
        b,
        [
          [0, -0.09],
          [wheel * 0.7, -0.1],
          [wheel, -0.06],
          [wheel, 0.06],
          [wheel * 0.7, 0.1],
          [0, 0.09],
        ],
        12,
        // turned about z, then stood on its edge: a turn, so the faces stay wound as they were
        ([x, y, z]) => [front + x, z, axle - y],
        [false, true, false, false, true, false],
      );
    }),
    part('apple', (b) => {
      const heap: V3[] = [
        [0.82, -0.14, 0.98],
        [1.0, 0.16, 0.98],
        [1.14, -0.12, 0.96],
        [0.86, 0.2, 0.96],
        [0.98, -0.0, 1.1],
        [1.16, 0.12, 0.94],
      ];
      for (const c of heap) ball(b, c, [0.15, 0.15, 0.14], 7, 4);
    }),
  ];
}

/** A rod from `a` to `c` tapering from `ra` to `rc`, shut at both ends. */
function rodTaper(b: MeshBuilder, a: V3, c: V3, ra: number, rc: number, n: number) {
  const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const w: V3 = [d[0] / len, d[1] / len, d[2] / len];
  let u = cross(w, [0, 0, 1]);
  if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = [1, 0, 0];
  const k = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / k, u[1] / k, u[2] / k];
  const v = cross(w, u);
  turned(
    b,
    [
      [0, -ra * 0.5],
      [ra, 0],
      [rc, len],
      [0, len + rc * 0.5],
    ],
    n,
    ([x, y, z]) => [
      a[0] + x * u[0] + y * v[0] + z * w[0],
      a[1] + x * u[1] + y * v[1] + z * w[1],
      a[2] + x * u[2] + y * v[2] + z * w[2],
    ],
  );
}

// ---- the UFO ----

/**
 * The saucer's figures, in units: its hull's radius, the height of its rim, how many lights go round the rim and how
 * big each is, and the glass dome's radius, the height of its foot on the hull, and its top.
 */
export const SAUCER = { radius: 13.95, rim: 1.9, lights: 12, light: 0.95, dome: 5.4, base: 3.9, top: 6.35 } as const;

/**
 * Its underside and its beam: how many lights go round the belly and how far out; how many hoops of light the beam is
 * drawn as, its radius under the saucer and at the ground; and the pool of light it makes on the ground, its radius
 * and how far over the ground it lies, which is past the bob's reach so it never sinks into the hill.
 */
export const BEAM = { lights: 9, out: 9.4, hoops: 5, top: 3.2, foot: 8, pool: 8.6, over: 1.5 } as const;

/** The belly's profile, from the glow out to under the band: [radius, height]. */
const BELLY: P2[] = [
  [0, 0.45],
  [3.4, 0.45],
  [3.9, 0.6],
  [SAUCER.radius * 0.55, 0.95],
  [SAUCER.radius * 0.82, 1.3],
  [SAUCER.radius - 0.6, SAUCER.rim - 0.45],
];

/** How high the belly is at `r` out from the middle, along its profile. */
function bellyAt(r: number): number {
  for (let i = 1; i < BELLY.length; i++)
    if (r <= BELLY[i][0]) {
      const [r0, z0] = BELLY[i - 1],
        [r1, z1] = BELLY[i];
      return z0 + ((r - r0) / (r1 - r0)) * (z1 - z0);
    }
  return BELLY[BELLY.length - 1][1];
}

/**
 * The UFO: a saucer 3 m across, a lens of polished hull with a darker band round its rim, a ring of twelve round lights
 * set in the band in three colours by turns, and on top a tall tinted glass dome with a frame round its foot and a
 * little green beacon on its crown. Its foot is the bottom of the glow, at its origin; it is symmetric, and has no
 * front.
 *
 * Seen from below, as it mostly is, it is not a plate: its pale belly is ribbed out from the middle in twelve panels
 * and ringed twice, a second ring of nine lights goes round it, and from the glowing disc in its middle a beam of pale
 * hoops falls, widening, to a pool of light on the ground under it, `SUBJECTS.ufo.hover` down, which is what is seen
 * of it first from the chase camera. Parts `hull`, `belly`, `band`, `glass`, `frame`, `lightA`, `lightB`, `lightC`,
 * `glow`, `beacon` and `beam`; the beam alone is under its foot, and not in its bounds.
 */
export function ufo(): Scenery {
  const { radius: R, rim, dome, base, top } = SAUCER;
  const hull = part('hull', (b) => {
    // the top of the lens, swelling up from the band to the dome's foot
    turned(
      b,
      [
        [R - 0.6, rim + 0.45],
        [R * 0.8, rim + 1.2],
        [R * 0.56, base - 0.15],
        [dome + 0.7, base],
        [0, base + 0.05],
      ],
      32,
      (p) => p,
    );
  });
  const belly = part('belly', (b) => {
    // its belly, from the glow out to under the band, a paler metal than the band so it is not a grey plate on the sky
    turned(b, BELLY, 32, (p) => p, [false, true, false, false, false, false]);
  });
  const band = part('band', (b) => {
    turned(
      b,
      [
        [R - 0.6, rim - 0.45],
        [R, rim - 0.2],
        [R, rim + 0.2],
        [R - 0.6, rim + 0.45],
      ],
      32,
      (p) => p,
      [false, true, true, false],
    );
    // and a raised seam round the top, between the hull's outer and inner plates
    const seam = R * 0.8;
    turned(
      b,
      [
        [seam - 0.3, rim + 1.27],
        [seam + 0.3, rim + 1.07],
        [seam + 0.3, rim + 1.3],
        [seam - 0.3, rim + 1.45],
      ],
      32,
      (p) => p,
      [false, true, true, false],
    );
    // underneath, two rings round the belly, one inside the lights and one outside them, standing a little proud of it
    for (const r of [R * 0.5, R * 0.8]) {
      const z = bellyAt(r);
      turned(
        b,
        [
          [r - 0.35, z + 0.02],
          [r - 0.3, z - 0.16],
          [r + 0.3, z - 0.18],
          [r + 0.35, z + 0.02],
        ],
        32,
        (p) => p,
        [false, true, true, false],
      );
    }
    // and its panel lines, twelve ribs from the glow out to the band, between the lights
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const c = Math.cos(a),
        s = Math.sin(a);
      const r0 = 4.2,
        r1 = R - 0.9;
      rod(b, [c * r0, s * r0, bellyAt(r0) - 0.06], [c * r1, s * r1, bellyAt(r1) - 0.06], 0.14, 4);
    }
  });
  const lights = ['lightA', 'lightB', 'lightC'].map((name, k) =>
    part(name, (b) => {
      for (let i = k; i < SAUCER.lights; i += 3) {
        const a = (i / SAUCER.lights) * Math.PI * 2;
        const l = SAUCER.light;
        ball(b, [Math.cos(a) * R, Math.sin(a) * R, rim], [l, l, l * 0.85], 8, 5);
      }
      // and the belly's ring, each a round lamp half out of it, in the same colours by turns
      for (let i = k; i < BEAM.lights; i += 3) {
        const a = ((i + 0.25) / BEAM.lights) * Math.PI * 2;
        const z = bellyAt(BEAM.out);
        ball(b, [Math.cos(a) * BEAM.out, Math.sin(a) * BEAM.out, z - 0.05], [0.62, 0.62, 0.4], 8, 4);
      }
    }),
  );
  const glow = part('glow', (b) => {
    turned(
      b,
      [
        [0, 0],
        [3.0, 0.1],
        [3.4, 0.45],
      ],
      24,
      (p) => p,
      [false, true, false],
    );
  });
  const beam = part('beam', (b) => {
    const drop = SUBJECTS.ufo.hover;
    // the hoops, thin flat rings, wider the farther down, spaced closer near the saucer as a beam seen in perspective is
    for (let i = 0; i < BEAM.hoops; i++) {
      const f = (i + 0.6) / (BEAM.hoops + 0.2);
      const z = -drop * f * f * 0.92 - 0.8;
      const r = BEAM.top + (BEAM.foot - BEAM.top) * f;
      turned(
        b,
        [
          [r - 0.4, z - 0.3],
          [r + 0.4, z - 0.3],
          [r + 0.4, z + 0.3],
          [r - 0.4, z + 0.3],
        ],
        24,
        (p) => p,
        [true, true, true, true],
        true,
      );
    }
    // and the pool of light on the ground, a low flat disc with a rounded edge
    const z = -drop + BEAM.over;
    turned(
      b,
      [
        [0, z - 0.2],
        [BEAM.pool, z - 0.2],
        [BEAM.pool + 0.2, z - 0.05],
        [BEAM.pool, z + 0.08],
        [0, z + 0.1],
      ],
      24,
      (p) => p,
      [false, true, false, true, false],
    );
  });
  const glass = part('glass', (b) => {
    const profile: P2[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      profile.push([i === 6 ? 0 : Math.cos(a) * dome, base + Math.sin(a) * (top - base)]);
    }
    turned(b, profile, 24, (p) => p);
  });
  const frame = part('frame', (b) => {
    turned(
      b,
      [
        [dome + 0.45, base - 0.1],
        [dome + 0.45, base + 0.3],
        [dome - 0.1, base + 0.4],
      ],
      24,
      (p) => p,
      [false, true, false],
    );
  });
  const beacon = part('beacon', (b) => {
    rod(b, [0, 0, top - 0.3], [0, 0, top + 0.2], 0.1, 6);
    ball(b, [0, 0, top + 0.35], [0.25, 0.25, 0.25], 8, 5);
  });
  return { name: 'ufo', parts: [hull, belly, band, ...lights, glow, beam, glass, frame, beacon] };
}

/**
 * The UFO's bob, `ufoBob` and `BOB`, is logic and lives with the world's oddities, which this module reads it from; it
 * is said again here so what read it from the models still does.
 */
export { BOB, ufoBob } from '../world/oddities';

// ---- colour ----

/**
 * What each part of an oddity is made in, and how rough: by its name, whatever the biome. A part with `colours` is
 * one of them by its placement's `vary`, the same place in each list, so a gnome's hat and coat go together.
 */
export const ODDITY_PARTS: Record<string, { colour: Rgb; colours?: readonly Rgb[]; rough: number }> = {
  // the duck: a warm yellow rubber, a deeper yellow for the moulded wings, an orange bill, eyes of black; the black
  // duck in black rubber with white eyes; and a top hat
  body: { colour: O.duck, rough: ROUGH.plastic },
  wing: { colour: O.duckWing, rough: ROUGH.plastic },
  beak: { colour: O.beak, rough: ROUGH.plastic },
  eye: { colour: O.eye, rough: ROUGH.lens },
  glint: { colour: O.white, rough: ROUGH.lens },
  ink: { colour: O.ink, rough: ROUGH.plastic },
  inkWing: { colour: O.inkWing, rough: ROUGH.plastic },
  eyeWhite: { colour: O.white, rough: ROUGH.plastic },
  topHat: { colour: O.topHat, rough: ROUGH.paint },
  hatBand: { colour: O.hatBand, rough: ROUGH.paint },
  // the gnome: glazed clay, painted, his hat and coat in one of the pairs
  boot: { colour: O.boot, rough: ROUGH.paint },
  coat: { colour: O.coats[0], colours: O.coats, rough: ROUGH.paint },
  belt: { colour: O.belt, rough: ROUGH.paint },
  buckle: { colour: O.gold, rough: ROUGH.metal },
  skin: { colour: O.skin, rough: ROUGH.paint },
  cheek: { colour: O.cheek, rough: ROUGH.paint },
  beard: { colour: O.beard, rough: ROUGH.paint },
  hat: { colour: O.hats[0], colours: O.hats, rough: ROUGH.paint },
  // and what he holds: the rod and its line and float, the lantern, the barrow and its apples
  rod: { colour: O.rod, rough: ROUGH.wood },
  line: { colour: O.line, rough: ROUGH.paint },
  float: { colour: O.hats[0], rough: ROUGH.plastic },
  iron: { colour: O.iron, rough: ROUGH.metal },
  lamp: { colour: O.lamp, rough: ROUGH.lens },
  barrow: { colour: O.barrow, rough: ROUGH.paint },
  tyre: { colour: O.tyre, rough: ROUGH.plastic },
  apple: { colour: O.apple, rough: ROUGH.plastic },
  // the saucer: polished metal, its lights, glow and beam as bright as a colour goes
  hull: { colour: O.hull, rough: ROUGH.metal },
  belly: { colour: O.belly, rough: ROUGH.metal },
  band: { colour: O.band, rough: ROUGH.metal },
  glass: { colour: O.glass, rough: ROUGH.lens },
  frame: { colour: O.band, rough: ROUGH.metal },
  lightA: { colour: O.lightA, rough: ROUGH.lens },
  lightB: { colour: O.lightB, rough: ROUGH.lens },
  lightC: { colour: O.lightC, rough: ROUGH.lens },
  glow: { colour: O.glow, rough: ROUGH.lens },
  beam: { colour: O.beam, rough: ROUGH.lens },
  beacon: { colour: O.alien, rough: ROUGH.lens },
};

/** The mesh of an oddity in one of its kind's looks (`SUBJECTS[kind].looks`). */
export function oddityOf(kind: SubjectKind, look = 0): Scenery {
  return kind === 'duck' ? duck(look) : kind === 'gnome' ? gnome(look) : ufo();
}
