/**
 * The rover as it is drawn: a little Curiosity made cute, five units (50 cm)
 * long. A white body with an orange skirt and a panelled deck that overhangs
 * it, a mast in front with a camera for a head, one big round lens in an
 * orange barrel that a lid blinks over, a dish and a whip antenna, an arm
 * folded across its front, the finned power unit leaning off the back, and
 * six chunky treaded wheels on rocker-bogie arms.
 *
 * It is cut into the pieces that move against each other (the body, the
 * mast, the head, each rocker, each bogie and each wheel), every piece a
 * slot of its own in one array of matrices. `poseRover` writes every slot
 * from where the rover is and how its arms and wheels are turned, each frame,
 * into that array and nothing else; the groups `roverGroups` makes read
 * their matrices from views of the same array, so the page moves each group
 * with the view it was made with and nothing is made a frame.
 *
 * The rover's frame: x forward, y to its left, z up. Its origin is the pivot
 * the two rockers turn on, `RIG.rest` above flat ground when every arm is
 * level. An angle that lifts the front is positive: pitch, a rocker, a bogie.
 * Roll lifts the left side. A wheel's spin is the angle it has rolled forward
 * through, its distance over `ROVER_SIZE.wheelRadius`.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { block, disc, face, frustum, prism, rod, tri, type Place } from 'artshape-render/mesh/lowpoly';
import { revolve } from 'artshape-render/mesh/revolve';
import { HEAD, ROVER, type Rover } from '../rover';
import { ROUGH, ROVER_COLOURS as C, type Rgb } from './palette';
import { posed, type V3 } from './shape';

/** The rover's figures, the logic's own (`ROVER` in `src/rover.ts`), so what is drawn is what moves. */
export const ROVER_SIZE = ROVER;

/** How far the body stands over the rockers' pivots, in units: the arms hang from it on struts, as Curiosity's do. */
const LIFT = 1.1;

/**
 * Where the moving pieces hang, in the rover's frame and each from the piece it hangs on, from `ROVER`: the rockers'
 * pivot is the origin, at the axles' height as the logic has it; a rocker reaches forward to its front wheel's axle and
 * back to its bogie's pivot; a bogie reaches forward to the middle wheel and back to the rear one. With every arm level
 * all six axles are a wheel's radius above the ground, which is `rest` below the origin, and the wheels stand `track`
 * either side of the middle. The arms are drawn bent up between their ends, which stay where the logic says.
 */
export const RIG = {
  rest: ROVER.wheelRadius,
  /** The rocker's plane, either side of the middle, just inside the wheels. */
  arm: 1.0,
  /** The wheels' middle plane, either side. */
  track: ROVER.track / 2,
  /** The front axle from the rocker's pivot, along x and z. */
  front: [ROVER.axleX[0], 0] as const,
  /** The bogie's pivot from the rocker's, along x and z. */
  bogie: [ROVER.bogieX, 0] as const,
  /** The middle and rear axles from the bogie's pivot: forward and back by this, and down by `drop`. */
  reach: ROVER.axleX[1] - ROVER.bogieX,
  drop: 0,
  /** The mast's foot on the deck, and how tall it stands to the head's turn: the turn at the logic's `HEAD.height`. */
  mast: [1.0, 0, 0.5 + LIFT] as const,
  mastHeight: HEAD.height - (0.5 + LIFT),
} as const;

/** How wide a wheel is across its tread. */
const WHEEL_WIDTH = ROVER.wheelWidth;

/** The slots of the matrices, in order: what each moving piece is placed by. */
export const SLOT = {
  body: 0,
  mast: 1,
  head: 2,
  /** Left then right. */
  rocker: 3,
  /** Left then right. */
  bogie: 5,
  /** The left side's front, middle and rear, then the right side's. */
  wheel: 7,
  /** The eye's lid, hinged across the middle of the lens on the head, turned down over it as it blinks. */
  eye: 13,
} as const;
export const SLOTS = 14;

/** How the rover stands: where its origin is, which way it faces and leans, and how its arms and wheels are turned. */
export interface RoverPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  rockerL: number;
  rockerR: number;
  bogieL: number;
  bogieR: number;
  /** Each wheel's roll, in the order of `SLOT.wheel`. */
  wheelSpin: ArrayLike<number>;
  /** How far the head is turned from straight ahead; nought if left out. */
  headYaw?: number;
  /** How far the head is tipped up from level; nought if left out. */
  headPitch?: number;
  /** How far the eye is shut, nought open to one closed; nought if left out. */
  blink?: number;
}

// two scratches for the steps of a composition, made once, since this runs every frame
const A = new Float32Array(16),
  B = new Float32Array(16);
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * The step `child` takes: a move (x, y, z) and a turn, which `step` and `wheel` write and `child` reads. They go by this
 * array and never as arguments: a number with a fraction handed to a function that is not inlined is boxed on the heap,
 * and with a dozen steps a frame `poseRover` is too long for all of them to be. Measured so: as arguments, posing made
 * three megabytes for every twenty thousand poses.
 */
const STEP = new Float64Array(4);

/** The steps of the rover's frame, by number, for `step`. */
const S = { yaw: 0, pitch: 1, roll: 2, mast: 3, head: 4, rocker: 5, bogie: 7 } as const;

/** Writes step `n` (an `S`, plus one for the right side's rocker or bogie) into `STEP`, from `pose`. */
function step(pose: RoverPose, n: number) {
  let x = 0,
    y = 0,
    z = 0,
    angle = 0;
  switch (n) {
    case S.yaw:
      x = pose.x;
      y = pose.y;
      z = pose.z;
      angle = pose.yaw;
      break;
    case S.pitch:
      angle = -pose.pitch;
      break;
    case S.roll:
      angle = pose.roll;
      break;
    case S.mast:
      x = RIG.mast[0];
      y = RIG.mast[1];
      z = RIG.mast[2];
      angle = pose.headYaw ?? 0;
      break;
    case S.head:
      z = RIG.mastHeight;
      angle = -(pose.headPitch ?? 0);
      break;
    case S.rocker:
    case S.rocker + 1:
      y = n === S.rocker ? RIG.arm : -RIG.arm;
      angle = -(n === S.rocker ? pose.rockerL : pose.rockerR);
      break;
    default:
      x = RIG.bogie[0];
      z = RIG.bogie[1];
      angle = -(n === S.bogie ? pose.bogieL : pose.bogieR);
  }
  STEP[0] = x;
  STEP[1] = y;
  STEP[2] = z;
  STEP[3] = angle;
}

/**
 * Writes at `o` in `out` the parent at `po` in `parent`, then the move of `STEP`, then its turn about the axis `axis`
 * (0 x, 1 y, 2 z), all column-major. `out` may be `parent` at another offset.
 */
function child(out: Float32Array, o: number, parent: Float32Array, po: number, axis: 0 | 1 | 2) {
  const tx = STEP[0],
    ty = STEP[1],
    tz = STEP[2],
    angle = STEP[3];
  const p00 = parent[po],
    p10 = parent[po + 1],
    p20 = parent[po + 2],
    p01 = parent[po + 4],
    p11 = parent[po + 5],
    p21 = parent[po + 6],
    p02 = parent[po + 8],
    p12 = parent[po + 9],
    p22 = parent[po + 10],
    p03 = parent[po + 12],
    p13 = parent[po + 13],
    p23 = parent[po + 14];
  const c = Math.cos(angle),
    s = Math.sin(angle);
  // the turn's columns
  let r00 = 1,
    r10 = 0,
    r20 = 0,
    r01 = 0,
    r11 = 1,
    r21 = 0,
    r02 = 0,
    r12 = 0,
    r22 = 1;
  if (axis === 0) {
    r11 = c;
    r21 = s;
    r12 = -s;
    r22 = c;
  } else if (axis === 1) {
    r00 = c;
    r20 = -s;
    r02 = s;
    r22 = c;
  } else {
    r00 = c;
    r10 = s;
    r01 = -s;
    r11 = c;
  }
  out[o] = p00 * r00 + p01 * r10 + p02 * r20;
  out[o + 1] = p10 * r00 + p11 * r10 + p12 * r20;
  out[o + 2] = p20 * r00 + p21 * r10 + p22 * r20;
  out[o + 3] = 0;
  out[o + 4] = p00 * r01 + p01 * r11 + p02 * r21;
  out[o + 5] = p10 * r01 + p11 * r11 + p12 * r21;
  out[o + 6] = p20 * r01 + p21 * r11 + p22 * r21;
  out[o + 7] = 0;
  out[o + 8] = p00 * r02 + p01 * r12 + p02 * r22;
  out[o + 9] = p10 * r02 + p11 * r12 + p12 * r22;
  out[o + 10] = p20 * r02 + p21 * r12 + p22 * r22;
  out[o + 11] = 0;
  out[o + 12] = p00 * tx + p01 * ty + p02 * tz + p03;
  out[o + 13] = p10 * tx + p11 * ty + p12 * tz + p13;
  out[o + 14] = p20 * tx + p21 * ty + p22 * tz + p23;
  out[o + 15] = 1;
}

/** Writes every slot's matrix into `out`, `SLOTS` matrices long, from `pose`. Makes nothing. */
export function poseRover(out: Float32Array, pose: RoverPose): void {
  step(pose, S.yaw);
  child(A, 0, IDENTITY, 0, 2);
  step(pose, S.pitch);
  child(B, 0, A, 0, 1);
  step(pose, S.roll);
  child(out, SLOT.body * 16, B, 0, 0);
  step(pose, S.mast);
  child(out, SLOT.mast * 16, out, SLOT.body * 16, 2);
  step(pose, S.head);
  child(out, SLOT.head * 16, out, SLOT.mast * 16, 1);
  // the lid: hinged across the lens's middle, and turned from tucked away inside the head behind the face, at nought,
  // up and over the top of the eye and down until it covers the lens, at one, as an eyelid comes down
  STEP[0] = EYE.x;
  STEP[1] = 0;
  STEP[2] = EYE.z;
  STEP[3] = -Math.PI * (1 - Math.min(1, Math.max(0, pose.blink ?? 0)));
  child(out, SLOT.eye * 16, out, SLOT.head * 16, 1);
  for (let s = 0; s < 2; s++) {
    const rocker = (SLOT.rocker + s) * 16,
      bogie = (SLOT.bogie + s) * 16;
    step(pose, S.rocker + s);
    child(out, rocker, out, SLOT.body * 16, 1);
    step(pose, S.bogie + s);
    child(out, bogie, out, rocker, 1);
    wheel(out, pose, s, 0, rocker);
    wheel(out, pose, s, 1, bogie);
    wheel(out, pose, s, 2, bogie);
  }
}

/** Where each wheel of a side hangs on its arm, x then z: the front on the rocker, the middle and rear on the bogie. */
const HUNG = new Float64Array([RIG.front[0], RIG.front[1], RIG.reach, RIG.drop, -RIG.reach, RIG.drop]);

/**
 * Writes wheel `k` of side `s` (nought the left) hung from the arm at `parent`, rolled as `pose` says. A right wheel is
 * a left one turned half round, so its hub faces out; turned so, it rolls forward the other way.
 */
function wheel(out: Float32Array, pose: RoverPose, s: number, k: number, parent: number) {
  const o = (SLOT.wheel + s * 3 + k) * 16;
  const spin = pose.wheelSpin[s * 3 + k];
  STEP[0] = HUNG[k * 2];
  STEP[1] = s === 0 ? RIG.track - RIG.arm : RIG.arm - RIG.track;
  STEP[2] = HUNG[k * 2 + 1];
  if (s === 0) {
    STEP[3] = spin;
    child(out, o, out, parent, 1);
  } else {
    STEP[3] = Math.PI;
    child(A, 0, out, parent, 2);
    STEP[0] = STEP[1] = STEP[2] = 0;
    STEP[3] = -spin;
    child(out, o, A, 0, 1);
  }
}

/** What the model reads of the rover's logic (`Rover` in `src/rover.ts`). */
export type Posed = Pick<Rover, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll' | 'rocker' | 'bogie' | 'spin'> & {
  /** Where the head looks and how far the eye is shut, as the logic has them, when it has them; nought if not. */
  headYaw?: number;
  headPitch?: number;
  blink?: number;
};

/**
 * Writes the rover's pose as the logic has it into `out`, whose `wheelSpin` must be an array of six it owns. The
 * logic numbers its wheels by axle, left before right (wheel `i` on axle `i >> 1`, side `i & 1`); the model's slots go
 * down the left side and then the right, so wheel `i` is slot `(i & 1) * 3 + (i >> 1)`. The signs are the same: pitch
 * nose up, roll left side up, a rocker front up against the body, a bogie middle wheel up against its rocker, and `z`
 * the height of the rockers' pivots. Makes nothing.
 */
export function poseOf(r: Posed, out: RoverPose & { wheelSpin: Float64Array | number[] }): void {
  out.x = r.x;
  out.y = r.y;
  out.z = r.z;
  out.yaw = r.yaw;
  out.pitch = r.pitch;
  out.roll = r.roll;
  out.headYaw = r.headYaw ?? 0;
  out.headPitch = r.headPitch ?? 0;
  out.blink = r.blink ?? 0;
  out.rockerL = r.rocker[0];
  out.rockerR = r.rocker[1];
  out.bogieL = r.bogie[0];
  out.bogieR = r.bogie[1];
  for (let i = 0; i < 6; i++) out.wheelSpin[(i & 1) * 3 + (i >> 1)] = r.spin[i];
}

/** A pose with every arm level and every wheel unturned, at (x, y) on flat ground at `ground`, facing `yaw`. */
export function restPose(x = 0, y = 0, ground = 0, yaw = 0): RoverPose & { wheelSpin: number[] } {
  return {
    x,
    y,
    z: ground + RIG.rest,
    yaw,
    pitch: 0,
    roll: 0,
    rockerL: 0,
    rockerR: 0,
    bogieL: 0,
    bogieR: 0,
    wheelSpin: [0, 0, 0, 0, 0, 0],
    headYaw: 0,
    headPitch: 0,
    blink: 0,
  };
}

// ---- the meshes ----

type P2 = [number, number];

/** A place whose points go through `inner` and then `outer`. */
const then =
  (outer: Place, inner: Place): Place =>
  (p) =>
    outer(inner(p));

/** A mesh from a builder's work. */
function made(build: (b: MeshBuilder) => void): Mesh {
  const b = new MeshBuilder();
  build(b);
  return b.build();
}

/** A point and its normal, carried through `place` into `b`: the normal is turned as the point is, and kept a unit. */
function vertexAt(b: MeshBuilder, place: Place, x: number, y: number, z: number, nx: number, ny: number, nz: number) {
  const q = place([x, y, z]),
    r = place([x + nx, y + ny, z + nz]);
  const mx = r[0] - q[0],
    my = r[1] - q[1],
    mz = r[2] - q[2];
  const l = Math.hypot(mx, my, mz) || 1;
  return b.vertex(q[0], q[1], q[2], mx / l, my / l, mz / l, 0, 0);
}

/** Every point and face of `mesh` carried through `place` into `b`: a turned or rounded solid set where it goes. */
function put(b: MeshBuilder, mesh: Mesh, place: Place) {
  const p = mesh.positions,
    n = mesh.normals,
    base = b.vertexCount;
  for (let i = 0; i < p.length; i += 3) vertexAt(b, place, p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2]);
  for (let i = 0; i < mesh.indices.length; i += 3)
    b.triangle(base + mesh.indices[i], base + mesh.indices[i + 1], base + mesh.indices[i + 2]);
}

/**
 * A solid turned about the place's z from a profile of [radius, height] points, run so the solid lies to its left (up
 * from the bottom, for a solid; `revolve`'s rule), in `segments` round: smooth round the turn, and with every corner of
 * the profile cut by a chamfer of `chamfer` and kept hard, so each rim catches the light as a thin bright band, as a
 * machined or moulded part's does, for one more ring of faces a corner and no more.
 */
function lathe(b: MeshBuilder, place: Place, profile: P2[], segments: number, chamfer = 0) {
  const points: P2[] = [profile[0]];
  for (let i = 1; i + 1 < profile.length; i++) {
    const [px, pz] = profile[i - 1],
      [x, z] = profile[i],
      [nx, nz] = profile[i + 1];
    const la = Math.hypot(x - px, z - pz),
      ln = Math.hypot(nx - x, nz - z);
    const a = Math.min(chamfer, la / 2),
      d = Math.min(chamfer, ln / 2);
    if (a > 0 && d > 0)
      points.push(
        [x - ((x - px) / la) * a, z - ((z - pz) / la) * a],
        [x + ((nx - x) / ln) * d, z + ((nz - z) / ln) * d],
      );
    else points.push([x, z]);
  }
  points.push(profile[profile.length - 1]);
  put(b, revolve({ points, sharp: points.map(() => true) }, { segments }), place);
}

/** A solid turned as `lathe` turns one, but smooth along its profile too: a dome, a ball, a shell. */
function curve(b: MeshBuilder, place: Place, profile: P2[], segments: number) {
  put(b, revolve({ points: profile }, { segments }), place);
}

/**
 * A soft slab: the box from (x0, y0, z0) to (x1, y1, z1) with its upright corners rounded in plan, to `corner` (one
 * radius, or one for each corner from (x1, y0) round anticlockwise) in `cs` steps, and its top and bottom edges rounded
 * to `edge` in `es` steps, smooth all round, and closed underneath only if `bottom`. A moulded panel: the rover's body,
 * deck and head are made of these, as a toy's are, since a plain box reads as a prototype however it is lit.
 */
function pad(
  b: MeshBuilder,
  place: Place,
  [x0, x1, y0, y1, z0, z1]: readonly number[],
  corner: number | readonly number[],
  edge: number,
  cs = 3,
  es = 2,
  bottom = false,
) {
  const radii = typeof corner === 'number' ? [corner, corner, corner, corner] : corner;
  const e = Math.min(edge, (z1 - z0) / 2, ...radii);
  const centres: P2[] = [
    [x1 - radii[0], y0 + radii[0]],
    [x1 - radii[1], y1 - radii[1]],
    [x0 + radii[2], y1 - radii[2]],
    [x0 + radii[3], y0 + radii[3]],
  ];
  // the outline's points: each a corner's middle, its radius, and the way out from it, anticlockwise from above
  const ring: [number, number, number, number, number][] = [];
  for (let k = 0; k < 4; k++)
    for (let j = 0; j <= cs; j++) {
      const a = ((k - 1 + j / cs) * Math.PI) / 2;
      ring.push([centres[k][0], centres[k][1], radii[k], Math.cos(a), Math.sin(a)]);
    }
  // the rows up the side: how far in from the outline, how high, and the turn of the edge there
  const rows: [number, number, number, number][] = [];
  for (let j = 0; j <= es; j++) {
    const f = -Math.PI / 2 + (j / es) * (Math.PI / 2);
    rows.push([e * (1 - Math.cos(f)), z0 + e + e * Math.sin(f), Math.cos(f), Math.sin(f)]);
  }
  for (let j = 0; j <= es; j++) {
    const f = (j / es) * (Math.PI / 2);
    rows.push([e * (1 - Math.cos(f)), z1 - e + e * Math.sin(f), Math.cos(f), Math.sin(f)]);
  }
  const n = ring.length,
    base = b.vertexCount;
  for (const [d, z, c, s] of rows)
    for (const [cx, cy, r, nx, ny] of ring)
      vertexAt(b, place, cx + (r - d) * nx, cy + (r - d) * ny, z, c * nx, c * ny, s);
  for (let j = 0; j + 1 < rows.length; j++)
    for (let i = 0; i < n; i++) {
      const a = base + j * n + i,
        a1 = base + j * n + ((i + 1) % n);
      b.quad(a, a1, a1 + n, a + n);
    }
  // the lids, flat
  const lid = (z: number, up: number) => {
    const first = b.vertexCount;
    for (const [cx, cy, r, nx, ny] of ring) vertexAt(b, place, cx + (r - e) * nx, cy + (r - e) * ny, z, 0, 0, up);
    for (let i = 1; i + 1 < n; i++)
      if (up > 0) b.triangle(first, first + i, first + i + 1);
      else b.triangle(first, first + i + 1, first + i);
  };
  lid(z1, 1);
  if (bottom) lid(z0, -1);
}

/**
 * A bar from one point to another with its four long edges chamfered by `c`: `w` across (level, where it can be) and
 * `h` the other way. The arms are made of these, so each edge catches the light as a thin bright line along the bar,
 * which is what a machined arm looks like and a square beam does not. `w` is along `across` where that is given; its
 * ends are shut unless `caps` is false, for a bar whose ends are hidden in a joint.
 */
function bar(b: MeshBuilder, from: V3, to: V3, w: number, h: number, c: number, caps = true, across?: V3) {
  const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const al: V3 = [d[0] / len, d[1] / len, d[2] / len];
  let u: V3 = [al[1], -al[0], 0];
  if (across) {
    const k = across[0] * al[0] + across[1] * al[1] + across[2] * al[2];
    u = [across[0] - k * al[0], across[1] - k * al[1], across[2] - k * al[2]];
  } else if (Math.hypot(u[0], u[1]) < 1e-6) u = [1, 0, 0];
  const k = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / k, u[1] / k, u[2] / k];
  const v: V3 = [al[1] * u[2] - al[2] * u[1], al[2] * u[0] - al[0] * u[2], al[0] * u[1] - al[1] * u[0]];
  const place: Place = ([x, y, z]) => [
    from[0] + x * u[0] + y * v[0] + z * al[0],
    from[1] + x * u[1] + y * v[1] + z * al[1],
    from[2] + x * u[2] + y * v[2] + z * al[2],
  ];
  const a = w / 2,
    e = h / 2;
  const outline: [number, number][] = [
    [a, -e + c],
    [a, e - c],
    [a - c, e],
    [-a + c, e],
    [-a, e - c],
    [-a, -e + c],
    [-a + c, -e],
    [a - c, -e],
  ];
  prism(b, place, outline, 0, len, { top: caps, bottom: caps });
}

/** A ball of radius `r`, smooth, at the place's origin. */
function ball(b: MeshBuilder, place: Place, r: number, segments = 12) {
  const profile: P2[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    profile.push([i === 0 || i === 6 ? 0 : r * Math.cos(a), r * Math.sin(a)]);
  }
  curve(b, place, profile, segments);
}

/** A short drum about the place's z from `z0` to `z1`, of radius `r`, its rims chamfered by `chamfer` and both ends shut. */
function drum(b: MeshBuilder, place: Place, r: number, z0: number, z1: number, chamfer: number, segments = 16) {
  const profile: P2[] = [
    [0, z0],
    [r, z0],
    [r, z1],
    [0, z1],
  ];
  lathe(b, place, profile, segments, chamfer);
}

/** A place whose z runs along +x, for a lens or a cylinder lying along the rover. */
const alongX = (x: number, y: number, z: number): Place => posed(x, y, z, 0, Math.PI / 2, 0);
/** A place whose z runs along +y, for an axle. */
const alongY = (x: number, y: number, z: number): Place => posed(x, y, z, 0, 0, -Math.PI / 2);
/** A place whose z runs along -y. */
const alongMinusY = (x: number, y: number, z: number): Place => posed(x, y, z, 0, 0, Math.PI / 2);

/** One of the rover's meshes, in one colour, and the slots it is placed at: one, or a run of them. */
export interface RoverPart {
  name: string;
  mesh: Mesh;
  colour: Rgb;
  rough: number;
  slot: number;
  count: number;
}

/** `mesh` moved up by `dz`, in place. */
function lifted(mesh: Mesh, dz = LIFT): Mesh {
  for (let i = 2; i < mesh.positions.length; i += 3) mesh.positions[i] += dz;
  return mesh;
}

/** The power unit's lean off the back, and the dish's tip toward the sky behind. */
const RTG = posed(-1.68, 0, 0.2, 0, -0.62, 0);
const DISH = posed(-0.85, 0.62, 0.98, 0.4, -0.75, 0);

/** The direction `place` turns `v` to, as a unit: for a bar laid across something turned. */
function turned(place: Place, v: V3): V3 {
  const a = place([0, 0, 0]),
    b = place(v);
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
}

/**
 * The body: the chassis, its skirt, the deck in three panels with dark seams between, the finned power unit at the
 * back, the dish and the whip antenna, an instrument box and a sensor, all made about the body's own middle and
 * lifted `LIFT` over the pivots; and the struts down to the pivots, each pair meeting at a boss.
 */
function bodyParts(): RoverPart[] {
  const o = posed(0, 0, 0);
  const white = made((b) => {
    // the chassis, upper half
    pad(b, o, [-1.5, 1.4, -0.72, 0.72, -0.12, 0.36], 0.2, 0.08, 3, 2);
    // the deck, in three panels, the outer corners cut round as wide as the old deck's were and the inner ones tight
    const wide = 0.32,
      tight = 0.04;
    pad(b, o, [0.66, 1.62, -1.18, 1.18, 0.42, 0.53], [wide, wide, tight, tight], 0.04, 3, 1);
    pad(b, o, [-0.6, 0.625, -1.18, 1.18, 0.42, 0.53], tight, 0.04, 1, 1);
    pad(b, o, [-1.75, -0.635, -1.18, 1.18, 0.42, 0.53], [tight, tight, wide, wide], 0.04, 3, 1);
    // the instrument box's lid, a white plate on its foil
    pad(b, o, [-0.21, 0.41, -0.91, -0.44, 0.84, 0.9], 0.06, 0.025, 2, 1);
  });
  const orange = made((b) => {
    // the skirt, the lower half, a little inside the white so the white overhangs it like a lid
    pad(b, o, [-1.42, 1.32, -0.68, 0.68, -0.5, -0.06], 0.18, 0.08, 2, 1);
    // the deck's rim, a line of orange under the deck's white
    pad(b, o, [-1.72, 1.6, -1.15, 1.15, 0.32, 0.44], 0.3, 0.04, 3, 1);
    // a panel down each side of the chassis, so it reads orange from the side and from above at the home zoom too
    for (const y of [0.68, -0.76]) pad(b, o, [-1.3, 1.2, y, y + 0.08, -0.06, 0.28], 0.03, 0.02, 1, 1);
    // a plate across the back, so the rover reads orange from behind, where the chase camera sees it
    pad(b, o, [-1.58, -1.44, -0.6, 0.6, -0.4, 0.28], 0.07, 0.04, 2, 1);
    // the power unit's foot ring and its cap, orange, each a little wider than its fins, so the whole reads as a finned
    // canister and not a gear, from the chase camera behind and above it
    drum(b, then(RTG, posed(0, 0, 0.02)), 0.46, 0, 0.08, 0, 16);
    const end: P2[] = [
      [0, 0],
      [0.46, 0],
      [0.46, 0.05],
      [0.38, 0.1],
      [0, 0.12],
    ];
    lathe(b, then(RTG, posed(0, 0, 0.7)), end, 16);
    // the whip antenna's ball, a bead on its stalk
    ball(b, posed(-1.25, -0.72, 1.9), 0.17, 10);
    // the mast's collar, where it stands on the deck
    const collar: P2[] = [
      [0.28, 0],
      [0.28, 0.12],
      [0.22, 0.26],
      [0, 0.26],
    ];
    lathe(b, posed(RIG.mast[0], RIG.mast[1], RIG.mast[2] - LIFT), collar, 16, 0.03);
    // the dish's back
    const back: P2[] = [
      [0, 0],
      [0.2, 0.025],
      [0.4, 0.09],
      [0.52, 0.16],
      [0.52, 0.2],
    ];
    lathe(b, DISH, back, 16);
  });
  const dark = made((b) => {
    // the power unit, a drum leaning off the back, and its six fins grown out of it, their outer edges chamfered
    const drumOf: P2[] = [
      [0, 0],
      [0.22, 0],
      [0.24, 0.8],
      [0, 0.8],
    ];
    lathe(b, RTG, drumOf, 16, 0.04);
    for (let k = 0; k < 6; k++) {
      const fin = then(RTG, posed(0, 0, 0, ((k + 0.5) / 6) * Math.PI * 2));
      bar(b, fin([0.32, 0, 0.1]), fin([0.32, 0, 0.7]), 0.075, 0.2, 0.025, false, turned(fin, [0, 1, 0]));
    }
    // the seams between the deck's panels: a dark slab under them, showing between
    pad(b, o, [-1.7, 1.58, -1.12, 1.12, 0.4, 0.49], 0.3, 0.02, 2, 1);
    // the whip antenna
    rod(b, [-1.25, -0.72, 0.6], [-1.25, -0.72, 1.76], 0.03, 6);
    // the instrument box's vent, three slots across its front, and the sensor's window
    for (const y of [-0.78, -0.68, -0.58]) block(b, o, 0.44, 0.465, y - 0.022, y + 0.022, 0.6, 0.78);
    drum(b, posed(-1.25, 0.32, 0.62), 0.1, 0, 0.025, 0, 10);
  });
  const steel = made((b) => {
    // a strut down each side from the bracket under the body to the boss at the pivot its rocker turns on
    for (const s of [1, -1]) {
      rod(b, [0.22, s * 0.67, -0.5], [0, s * 0.78, -LIFT + 0.04], 0.085, 10);
      rod(b, [-0.22, s * 0.67, -0.5], [0, s * 0.78, -LIFT + 0.04], 0.085, 10);
      drum(b, s > 0 ? alongY(0, 0.7, -LIFT) : alongMinusY(0, -0.7, -LIFT), 0.15, 0, 0.14, 0.03, 10);
    }
    // the dish's face, a shallow bowl in steel, so it shows against the white deck from the chase camera over it
    const bowl: P2[] = [
      [0.52, 0.2],
      [0.46, 0.2],
      [0.3, 0.13],
      [0.14, 0.095],
      [0, 0.085],
    ];
    lathe(b, DISH, bowl, 16);
    // the dish's feed, at the tip of its three legs
    drum(b, then(DISH, posed(0, 0, 0.44)), 0.06, 0, 0.1, 0.02, 8);
    // the dish's post, the ball it tips on, and the feed's three legs
    rod(b, [-0.85, 0.62, 0.5], [-0.85, 0.62, 0.95], 0.06, 8);
    ball(b, posed(-0.85, 0.62, 0.96), 0.09, 8);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      rod(b, DISH([0.46 * Math.cos(a), 0.46 * Math.sin(a), 0.19]), DISH([0, 0, 0.45]), 0.014, 4);
    }
    // the antenna's foot
    drum(b, posed(-1.25, -0.72, 0.52), 0.08, 0, 0.1, 0, 10);
    // the power unit's two brackets to the back plate
    for (const y of [0.3, -0.3]) rod(b, [-1.52, y, 0.05], RTG([0, y * 0.4, 0.4]), 0.04, 6);
    // a sensor puck where the second instrument box was
    drum(b, posed(-1.25, 0.32, 0.5), 0.18, 0, 0.13, 0.035, 10);
    // a bracket under the skirt each side, which the two struts of that side hang from
    for (const s of [1, -1])
      pad(b, o, [-0.3, 0.3, s > 0 ? 0.6 : -0.74, s > 0 ? 0.74 : -0.6, -0.56, -0.48], 0.04, 0.02, 1, 1);
  });
  const gold = made((b) => {
    // an instrument box in its foil
    pad(b, o, [-0.25, 0.45, -0.95, -0.4, 0.5, 0.86], 0.08, 0.05, 2, 1);
  });
  // the arm, folded across the front as Curiosity stows its own: a shoulder, two steel limbs, and a tool turret at the
  // end, white with an orange cap, held just under the deck's lip
  const shoulder: V3 = [1.42, -0.48, -0.05],
    elbow: V3 = [1.78, 0.05, -0.32],
    wrist: V3 = [1.62, 0.5, -0.12];
  const arm = made((b) => {
    rod(b, shoulder, elbow, 0.075, 8, true);
    rod(b, elbow, wrist, 0.065, 8, true);
    ball(b, posed(elbow[0], elbow[1], elbow[2]), 0.11, 8);
    drum(b, alongX(1.36, shoulder[1], shoulder[2]), 0.12, 0, 0.1, 0.03, 10);
    // the drill under the turret
    frustum(b, posed(wrist[0], wrist[1], wrist[2] - 0.24), 6, 0, 0.05, 0, 0.12, { top: false });
  });
  const turret = made((b) => {
    const can: P2[] = [
      [0, 0],
      [0.2, 0],
      [0.2, 0.26],
      [0, 0.26],
    ];
    lathe(b, posed(wrist[0], wrist[1], wrist[2] - 0.12), can, 10, 0.03);
    pad(b, o, [1.34, 1.46, -0.62, -0.34, -0.2, 0.1], 0.04, 0.03, 1, 1);
  });
  const cap = made((b) => {
    const lid: P2[] = [
      [0, 0],
      [0.15, 0],
      [0.12, 0.09],
      [0, 0.09],
    ];
    lathe(b, posed(wrist[0], wrist[1], wrist[2] + 0.13), lid, 10);
  });
  const slot = SLOT.body;
  return [
    { name: 'body white', mesh: lifted(white), colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'body orange', mesh: lifted(orange), colour: C.orange, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'body dark', mesh: lifted(dark), colour: C.rtg, rough: ROUGH.metal, slot, count: 1 },
    { name: 'body gold', mesh: lifted(gold), colour: C.gold, rough: ROUGH.metal, slot, count: 1 },
    { name: 'body steel', mesh: lifted(steel), colour: C.steel, rough: ROUGH.metal, slot, count: 1 },
    { name: 'arm', mesh: lifted(arm), colour: C.steel, rough: ROUGH.metal, slot, count: 1 },
    { name: 'turret', mesh: lifted(turret), colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'turret cap', mesh: lifted(cap), colour: C.orange, rough: ROUGH.plastic, slot, count: 1 },
  ];
}

/** The mast's pole: its radius at its foot and up at its neck, under a flare to the yoke, and how high the flare starts. */
const POLE = { foot: 0.2, neck: 0.155, flare: RIG.mastHeight - 0.36 } as const;
/** The pole's radius at height `z` up the mast. */
const radiusAt = (z: number) => POLE.foot + ((POLE.neck - POLE.foot) * (z - 0.2)) / (POLE.flare - 0.2);

/**
 * The mast: a white pole from the collar up, a little thicker at its foot and flared under the head, with two steel bands and a cable down its
 * side, to a yoke at the top whose two cheeks hold the hinge the head tips on, across the head's turn.
 */
function mastParts(): RoverPart[] {
  const top = RIG.mastHeight;
  const o = posed(0, 0, 0);
  const pole = made((b) => {
    const profile: P2[] = [
      [POLE.foot, 0.2],
      [POLE.neck, POLE.flare],
      [0.2, top - 0.26],
      [0.2, top - 0.2],
      [0, top - 0.2],
    ];
    lathe(b, o, profile, 16, 0.03);
    // the yoke: a plate across the pole's top, and a cheek up each side of the hinge
    pad(b, o, [-0.15, 0.15, -0.36, 0.36, top - 0.24, top - 0.14], 0.07, 0.03, 1, 1);
    for (const s of [1, -1])
      pad(b, o, [-0.13, 0.13, s * 0.3 - 0.06, s * 0.3 + 0.06, top - 0.2, top + 0.1], 0.06, 0.03, 1, 1);
  });
  // the cable's radius, and where it runs: lying on the pole's side
  const cable = 0.022;
  const along = (z: number): V3 => [0, -(radiusAt(z) + cable - 0.004), z];
  const joint = made((b) => {
    // two bands round the pole, clamping the cable to it, and the hinge the head tips on
    for (const z of [0.6, top - 0.6]) drum(b, posed(0, 0, z), radiusAt(z) + 2 * cable + 0.006, 0, 0.06, 0, 12);
    drum(b, alongY(0, -0.36, top), 0.1, 0, 0.72, 0.03, 10);
  });
  const wire = made((b) => {
    // the cable, out of the collar in a little S onto the pole's side, up it under the bands, and in again under the
    // flare below the yoke
    const path: V3[] = [
      [0, -0.12, 0.16],
      [0, -0.2, 0.26],
      along(0.36),
      along(POLE.flare - 0.1),
      [0, -0.19, POLE.flare + 0.02],
      [0, -0.12, POLE.flare + 0.06],
    ];
    for (let i = 0; i + 1 < path.length; i++) rod(b, path[i], path[i + 1], cable, 6);
  });
  return [
    { name: 'mast', mesh: pole, colour: C.white, rough: ROUGH.plastic, slot: SLOT.mast, count: 1 },
    { name: 'mast joint', mesh: joint, colour: C.steel, rough: ROUGH.metal, slot: SLOT.mast, count: 1 },
    { name: 'mast cable', mesh: wire, colour: C.dark, rough: ROUGH.paint, slot: SLOT.mast, count: 1 },
  ];
}

/**
 * The head's box over its hinge, and the eye on its face: big, its barrel three fifths of the head across, and in the
 * head's middle, so it reads at the chase camera's distance.
 */
const HEAD_BOX = [-0.46, 0.6, -0.84, 0.84, 0.04, 1.24] as const;
const EYE = {
  /** The middle of the lens on the face, where the lid's hinge is. */
  x: HEAD_BOX[1],
  z: 0.64,
  /**
   * The barrel, in two tiers: a wide orange base out of the face, and a narrower white focus ring in front of it, its
   * lip a little rounded; the bore through both, dark, and how far the whole stands out. Deep, so the eye reads as a
   * lens from the side and not as a sticker on a box.
   */
  base: 0.55,
  baseOut: 0.15,
  ring: 0.46,
  bore: 0.38,
  out: 0.33,
  /** The glass's radius, and how far out of the face it is at its rim and at its crown: well back in the barrel. */
  glass: 0.33,
  rim: 0.08,
  crown: 0.17,
  /**
   * The lid's radius: inside the bore, so it turns down inside the barrel as an eyelid does in its socket, and outside
   * the glass, so it never cuts it. It reaches round past the lens's edge to a little behind the face, so shut it closes
   * on the bore's step all the way round and no glass shows past it from any side.
   */
  lid: 0.365,
  reach: (97 * Math.PI) / 180,
} as const;

/** How far out of the face the glass is at `r` from its middle: a shallow dome, so the toon gloss lies on it. */
const glassAt = (r: number) => EYE.rim + (EYE.crown - EYE.rim) * (1 - (r / EYE.glass) ** 2);

/**
 * The head: a soft white camera body with one big lens on its front, deep in a barrel of an orange base and a white
 * focus ring, its glass dark with a bright blue iris round its middle and a white glint high on it, which is what makes
 * it look back at you; a toothed dial on one side and a small one on the other, an orange grip down one front corner, a red light in a steel bezel by the
 * lens, and a dark screen in an orange bezel on the back, which the chase camera sees. One eye, a camera's, and none of
 * a face's two: two round eyes under a brim read as Wall-E. The lid, on its own slot, comes down over the lens to blink.
 */
function headParts(): RoverPart[] {
  const at = alongX(EYE.x, 0, EYE.z);
  const o = posed(0, 0, 0);
  const shell = made((b) => {
    pad(b, o, HEAD_BOX, 0.34, 0.24, 5, 3);
    // a hump on top to one side, a viewfinder's, so the head is a camera from any side and not a box
    pad(b, o, [-0.38, 0.1, 0.16, 0.6, 1.06, 1.36], 0.12, 0.09, 2, 1);
  });
  const barrel = made((b) => {
    const base: P2[] = [
      [EYE.base, -0.14],
      [EYE.base, EYE.baseOut],
      [EYE.ring, EYE.baseOut],
    ];
    lathe(b, at, base, 20, 0.025);
    // the dials: a big one on the left with a crown of twelve teeth round its rim, and a small plain one on the right
    const left = alongY(0.02, HEAD_BOX[3] - 0.03, EYE.z);
    const tooth = (i: number, z: number) => {
      const a = (i / 24) * Math.PI * 2,
        r = i % 2 === 0 ? 0.19 : 0.165;
      return left([r * Math.cos(a), r * Math.sin(a), z]);
    };
    for (let i = 0; i < 24; i++) {
      face(b, tooth(i, 0), tooth(i + 1, 0), tooth(i + 1, 0.07), tooth(i, 0.07));
      tri(b, tooth(i, 0.07), tooth(i + 1, 0.07), left([0, 0, 0.07]));
    }
    frustum(b, left, 12, 0.15, 0.12, 0.07, 0.11, { top: true });
    const small: P2[] = [
      [0, 0],
      [0.12, 0],
      [0.12, 0.05],
      [0.09, 0.08],
      [0, 0.08],
    ];
    lathe(b, alongMinusY(0.02, HEAD_BOX[2] + 0.03, EYE.z + 0.1), small, 12);
    // a grip down the front of the head's left side, as a camera's is, standing out of the face and the side
    pad(b, o, [HEAD_BOX[1] - 0.12, HEAD_BOX[1] + 0.06, 0.63, HEAD_BOX[3] + 0.02, 0.24, 0.96], 0.08, 0.07, 2, 1);
    // the bezel on the back, round the screen
    pad(b, o, [HEAD_BOX[0] - 0.04, HEAD_BOX[0] + 0.1, -0.44, 0.44, 0.34, 0.94], 0.08, 0.04, 2, 2);
  });
  const focus = made((b) => {
    const ring: P2[] = [
      [EYE.ring, EYE.baseOut - 0.01],
      [EYE.ring, EYE.out - 0.03],
      [EYE.ring - 0.03, EYE.out],
      [EYE.bore, EYE.out],
    ];
    lathe(b, at, ring, 20, 0.012);
  });
  const ring = made((b) => {
    // the bore's dark wall, down the barrel to the step in to the glass
    const bore: P2[] = [
      [EYE.bore, EYE.out],
      [EYE.bore, EYE.rim - 0.01],
      [EYE.glass, EYE.rim - 0.01],
      [EYE.glass, EYE.rim],
    ];
    lathe(b, at, bore, 20);
  });
  const glass = made((b) => {
    const profile: P2[] = [];
    for (let i = 0; i <= 6; i++) {
      const r = EYE.glass * (1 - i / 6);
      profile.push([r, glassAt(r)]);
    }
    curve(b, at, profile, 20);
  });
  const iris = made((b) => {
    const profile: P2[] = [];
    for (let i = 0; i <= 3; i++) {
      const r = 0.245 - (i / 3) * 0.105;
      profile.push([r, glassAt(r) + 0.004]);
    }
    curve(b, at, profile, 20);
  });
  const glint = made((b) => {
    disc(b, alongX(EYE.x + glassAt(0.15) + 0.012, 0.095, EYE.z + 0.115), 10, 0.07, 0);
    disc(b, alongX(EYE.x + glassAt(0.14) + 0.012, -0.105, EYE.z - 0.095), 8, 0.03, 0);
  });
  // the light, in the face's top corner, and its bezel
  const lightAt: V3 = [EYE.x - 0.05, HEAD_BOX[2] + 0.24, HEAD_BOX[5] - 0.16];
  const light = made((b) => {
    ball(b, posed(lightAt[0] + 0.02, lightAt[1], lightAt[2]), 0.05, 8);
  });
  const neck = made((b) => {
    // the bracket under the head that the hinge goes through, and the light's bezel
    pad(b, o, [-0.16, 0.16, -0.22, 0.22, -0.1, 0.12], 0.06, 0.04, 2, 1);
    drum(b, alongX(lightAt[0] - 0.04, lightAt[1], lightAt[2]), 0.085, 0, 0.08, 0.02, 8);
  });
  const screen = made((b) => {
    // the screen on the back, dark in its bezel, with a sheen across one corner
    pad(b, o, [HEAD_BOX[0] - 0.06, HEAD_BOX[0], -0.36, 0.36, 0.42, 0.86], 0.05, 0.015, 2, 1);
  });
  const sheen = made((b) => {
    bar(b, [HEAD_BOX[0] - 0.062, 0.18, 0.82], [HEAD_BOX[0] - 0.062, 0.3, 0.7], 0.004, 0.035, 0, true, [1, 0, 0]);
  });
  const lid = made((b) => {
    // a shell over the lens, a little thick, made facing +x about the hinge: inside from its middle to its edge, then
    // back over the outside
    const profile: P2[] = [];
    const inner = EYE.lid - 0.015;
    for (let i = 0; i <= 2; i++) {
      const a = (i / 2) * EYE.reach;
      profile.push([inner * Math.sin(a), inner * Math.cos(a)]);
    }
    for (let i = 7; i >= 0; i--) {
      const a = (i / 7) * EYE.reach;
      profile.push([EYE.lid * Math.sin(a), EYE.lid * Math.cos(a)]);
    }
    curve(b, alongX(0, 0, 0), profile, 16);
  });
  const seam = made((b) => {
    // a seam across the lid's middle, side to side, so the eye shut reads as a lid closed, a line across it, and not as
    // a blank ball: a thin band standing just proud of the shell, round the lid's own upright through the hinge
    const r = EYE.lid + 0.006;
    put(
      b,
      revolve(
        {
          points: [
            [r, -0.012],
            [r, 0.012],
          ],
          sharp: [true, true],
        },
        { segments: 12, arc: 2.7 },
      ),
      posed(0, 0, 0, -1.35),
    );
  });
  const slot = SLOT.head;
  return [
    { name: 'head', mesh: shell, colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'barrel', mesh: barrel, colour: C.orange, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'focus ring', mesh: focus, colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'eye ring', mesh: ring, colour: C.ring, rough: ROUGH.paint, slot, count: 1 },
    { name: 'lens', mesh: glass, colour: C.lens, rough: ROUGH.lens, slot, count: 1 },
    { name: 'iris', mesh: iris, colour: C.iris, rough: ROUGH.lens, slot, count: 1 },
    { name: 'glint', mesh: glint, colour: C.glint, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'light', mesh: light, colour: C.light, rough: ROUGH.lens, slot, count: 1 },
    { name: 'neck', mesh: neck, colour: C.steel, rough: ROUGH.metal, slot, count: 1 },
    { name: 'screen', mesh: screen, colour: C.screen, rough: ROUGH.lens, slot, count: 1 },
    { name: 'screen sheen', mesh: sheen, colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'lid', mesh: lid, colour: C.lid, rough: ROUGH.plastic, slot: SLOT.eye, count: 1 },
    { name: 'lid seam', mesh: seam, colour: C.seam, rough: ROUGH.plastic, slot: SLOT.eye, count: 1 },
  ];
}

/**
 * The rockers and bogies: steel bars with chamfered edges, bent up between their ends as Curiosity's are, a knuckle
 * at every bend and a boss at every axle, so each joint reads as one; and an orange cap on each pivot. One mesh serves
 * both sides.
 */
function armParts(): RoverPart[] {
  const [fx, fz] = RIG.front,
    [bx, bz] = RIG.bogie;
  const knee: V3 = [fx * 0.45, 0, 0.45],
    hip: V3 = [bx * 0.5, 0, 0.32],
    apex: V3 = [0, 0, 0.32];
  const knuckle = (b: MeshBuilder, [x, , z]: V3, r: number, w: number) =>
    drum(b, alongY(x, -w / 2, z), r, 0, w, 0.03, 8);
  const rocker = made((b) => {
    bar(b, [0, 0, 0], knee, 0.17, 0.2, 0.045, false);
    bar(b, knee, [fx, 0, fz], 0.17, 0.2, 0.045, false);
    bar(b, [0, 0, 0], hip, 0.15, 0.18, 0.04, false);
    bar(b, hip, [bx, 0, bz], 0.15, 0.18, 0.04, false);
    knuckle(b, knee, 0.13, 0.22);
    knuckle(b, hip, 0.12, 0.2);
    knuckle(b, [fx, 0, fz], 0.15, 0.24);
  });
  const rockerCap = made((b) => {
    drum(b, alongY(0, -0.16, 0), 0.2, 0, 0.32, 0.05, 8);
    drum(b, alongY(bx, -0.14, bz), 0.14, 0, 0.28, 0.04, 8);
  });
  const bogie = made((b) => {
    bar(b, [0, 0, 0], apex, 0.13, 0.16, 0.035, false);
    bar(b, apex, [RIG.reach, 0, RIG.drop], 0.15, 0.18, 0.04, false);
    bar(b, apex, [-RIG.reach, 0, RIG.drop], 0.15, 0.18, 0.04, false);
    knuckle(b, apex, 0.12, 0.2);
    knuckle(b, [RIG.reach, 0, RIG.drop], 0.14, 0.22);
    knuckle(b, [-RIG.reach, 0, RIG.drop], 0.14, 0.22);
  });
  return [
    { name: 'rocker', mesh: rocker, colour: C.steel, rough: ROUGH.metal, slot: SLOT.rocker, count: 2 },
    { name: 'rocker caps', mesh: rockerCap, colour: C.orange, rough: ROUGH.plastic, slot: SLOT.rocker, count: 2 },
    { name: 'bogie', mesh: bogie, colour: C.steel, rough: ROUGH.metal, slot: SLOT.bogie, count: 2 },
  ];
}

/**
 * A wheel: a round dark tyre with chamfered shoulders and chevrons of tread lugs round it, so it rolls as a toy's does
 * and its turning shows on its outline, and a step on its inner face; a white rim on its outer face dished in toward
 * the middle, with three orange spokes tapering out to its lip, an orange domed cap, and three bolts between the
 * spokes, so its turning shows head on too; and a stub of axle in to the arm. Built about its axle along y, its outer
 * face on +y.
 */
function wheelParts(): RoverPart[] {
  const R = ROVER_SIZE.wheelRadius,
    half = WHEEL_WIDTH / 2,
    carcass = R - 0.08,
    blocks = 11;
  // a lug's half width round the tyre, and how far its ends sweep back to make the chevron
  const w = 0.075,
    sweep = 0.08,
    edge = half - 0.02;
  // the tread's top, low enough that a lug's corners are no further out than the wheel's radius
  const top = Math.sqrt(R * R - (w + sweep) ** 2) - 0.001;
  const tyre = made((b) => {
    const profile: P2[] = [
      [0, -half + 0.03],
      [carcass - 0.06, -half],
      [carcass, -half + 0.06],
      [carcass, half - 0.06],
      [carcass - 0.06, half],
      [0.5, half],
    ];
    lathe(b, alongY(0, 0, 0), profile, 24);
    // the axle stub, in to the arm
    const stub = RIG.track - RIG.arm - half + 0.06;
    frustum(b, alongY(0, -half - stub + 0.06, 0), 8, 0.1, 0.1, 0, stub - 0.05, { top: false });
  });
  const tread = made((b) => {
    for (let k = 0; k < blocks; k++) {
      // each lug a chevron, its two halves meeting in the middle and swept back to the shoulders, as a tractor's are; its
      // foot sunk into the tyre's shoulder, so its ends do not float over it
      const turn = posed(0, 0, 0, 0, (k / blocks) * Math.PI * 2, 0);
      // its outline from above, anticlockwise: the right half's end, the point, the left half's end, the notch
      const v: [number, number][] = [
        [-w + sweep, -edge],
        [w + sweep, -edge],
        [w, 0],
        [w + sweep, edge],
        [-w + sweep, edge],
        [-w, 0],
      ];
      const at = (i: number, z: number) => turn([v[i % 6][0], v[i % 6][1], z]);
      const foot = carcass - 0.06;
      for (let i = 0; i < 6; i++) face(b, at(i, foot), at(i + 1, foot), at(i + 1, top), at(i, top));
      face(b, at(0, top), at(1, top), at(2, top), at(5, top));
      face(b, at(5, top), at(2, top), at(3, top), at(4, top));
    }
  });
  // how far out the rim's face is at its lip and at its middle, dished in between
  const lip = half + 0.01,
    dish = half - 0.03;
  const rim = made((b) => {
    const profile: P2[] = [
      [0.56, half],
      [0.53, half + 0.06],
      [0.47, half + 0.05],
      [0.42, lip],
      [0.19, dish],
    ];
    // open in the middle, under the cap
    lathe(b, alongY(0, 0, 0), profile, 24);
  });
  const spokes = made((b) => {
    // each spoke a bar tapering from the cap out to under the rim's lip, its top edges chamfered, lofted from one end's
    // section to the other's; its ends are under the cap and the lip, so it is open at both
    const section = (r: number, half: number, z0: number, z1: number, c: number): [number, number, number][] => [
      [r, -half, z0],
      [r, half, z0],
      [r, half, z1 - c],
      [r, half - c, z1],
      [r, -half + c, z1],
      [r, -half, z1 - c],
    ];
    const inner = section(0.12, 0.075, dish - 0.01, dish + 0.08, 0.025),
      outer = section(0.5, 0.055, lip - 0.01, lip + 0.05, 0.02);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const c = Math.cos(a),
        s = Math.sin(a);
      // radial along (c, s) in the wheel's plane x-z, across it at right angles, and out along +y
      const p = ([r, t, h]: [number, number, number]): V3 => [r * c - t * s, h, r * s + t * c];
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        face(b, p(inner[j]), p(inner[i]), p(outer[i]), p(outer[j]));
      }
    }
    const cap: P2[] = [
      [0, 0],
      [0.2, 0],
      [0.2, 0.05],
      [0.17, 0.09],
      [0.1, 0.12],
      [0, 0.13],
    ];
    lathe(b, alongY(0, dish, 0), cap, 12);
  });
  const bolts = made((b) => {
    // three bolts between the spokes
    for (let k = 0; k < 3; k++) {
      const a = ((k + 0.5) / 3) * Math.PI * 2;
      frustum(b, alongY(0.3 * Math.cos(a), lip - 0.035, 0.3 * Math.sin(a)), 6, 0.035, 0.035, 0, 0.05);
    }
  });
  return [
    { name: 'tyres', mesh: tyre, colour: C.tyre, rough: ROUGH.earth, slot: SLOT.wheel, count: 6 },
    { name: 'tread', mesh: tread, colour: C.tread, rough: ROUGH.earth, slot: SLOT.wheel, count: 6 },
    { name: 'hubs', mesh: rim, colour: C.white, rough: ROUGH.plastic, slot: SLOT.wheel, count: 6 },
    { name: 'spokes', mesh: spokes, colour: C.orange, rough: ROUGH.plastic, slot: SLOT.wheel, count: 6 },
    { name: 'bolts', mesh: bolts, colour: C.steel, rough: ROUGH.metal, slot: SLOT.wheel, count: 6 },
  ];
}

/** Every mesh of the rover, in one colour each, with the slots it is placed at. Made once. */
export function roverParts(): RoverPart[] {
  return [...bodyParts(), ...mastParts(), ...headParts(), ...armParts(), ...wheelParts()];
}

/** The triangles the rover draws, every placement of every part counted. */
export function roverTriangles(parts: RoverPart[] = roverParts()): number {
  return parts.reduce((n, p) => n + (p.mesh.indices.length / 3) * p.count, 0);
}

/**
 * The rover's groups, for the renderer's dynamic set: one a part, each reading its matrices from a view of
 * `matrices` (`SLOTS` matrices long), so once `poseRover` has written it each frame the page moves group `i` with
 * `groups[i].matrices`, the view it was made with, and makes nothing.
 */
export function roverGroups(matrices: Float32Array, parts: RoverPart[] = roverParts()): GameGroup[] {
  return parts.map((p) => ({
    mesh: p.mesh,
    matrices: matrices.subarray(p.slot * 16, (p.slot + p.count) * 16),
    albedo: [p.colour[0], p.colour[1], p.colour[2]],
    roughness: p.rough,
  }));
}
