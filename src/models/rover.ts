/**
 * The rover as it is drawn: a little Curiosity made cute, five units (50 cm)
 * long. A white body with an orange skirt and a deck that overhangs it, a
 * mast in front with a big camera head and two round glass eyes under an
 * orange brim, a dish and a whip antenna, an arm folded across its front,
 * the power unit leaning off the back, and six chunky treaded wheels on
 * rocker-bogie arms.
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
import { block, disc, frustum, lump, prism, rod, seeded, type Place } from 'artshape-render/mesh/lowpoly';
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
  /** The eyes, on the head, closed a little or all the way as they blink. */
  eyes: 13,
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
  /** How far the eyes are shut, nought open to one closed; nought if left out. */
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
  // the eyes: about their own middle on the head, their height squeezed as they blink, and never quite to nothing
  STEP[0] = STEP[1] = STEP[3] = 0;
  STEP[2] = EYES.z * HEAD_SCALE;
  child(out, SLOT.eyes * 16, out, SLOT.head * 16, 2);
  const open = 1 - 0.92 * Math.min(1, Math.max(0, pose.blink ?? 0));
  const e = SLOT.eyes * 16;
  out[e + 8] *= open;
  out[e + 9] *= open;
  out[e + 10] *= open;
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
  /** Where the head looks and how far the eyes are shut, as the logic has them, when it has them; nought if not. */
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

/** A place whose points go through `inner` and then `outer`. */
const then =
  (outer: Place, inner: Place): Place =>
  (p) =>
    outer(inner(p));

/**
 * A box with its four upright edges cut off by `c` and its top edge bevelled by `t`: a convex solid of an outline of
 * eight, stood up, then stepped in to its lid. The rover's pieces are made of these and not of plain boxes, since a
 * cut corner catches the light as a soft edge, which is most of what makes a box read as a toy.
 */
function bevelled(
  b: MeshBuilder,
  place: Place,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  c: number,
  t: number,
) {
  const outline = (d: number): [number, number][] => [
    [x0 + c + d, y0 + d],
    [x1 - c - d, y0 + d],
    [x1 - d, y0 + c + d],
    [x1 - d, y1 - c - d],
    [x1 - c - d, y1 - d],
    [x0 + c + d, y1 - d],
    [x0 + d, y1 - c - d],
    [x0 + d, y0 + c + d],
  ];
  prism(b, place, outline(0), z0, z1 - t, { top: false });
  const lo = outline(0),
    hi = outline(t);
  const n = lo.length;
  const p = (o: [number, number][], i: number, z: number): V3 => place([o[i % n][0], o[i % n][1], z]);
  for (let i = 0; i < n; i++) {
    const a = p(lo, i, z1 - t),
      b2 = p(lo, i + 1, z1 - t),
      c2 = p(hi, i + 1, z1),
      d = p(hi, i, z1);
    quad(b, a, b2, c2, d);
  }
  for (let i = 1; i < n - 1; i++) triangle(b, p(hi, 0, z1), p(hi, i, z1), p(hi, i + 1, z1));
}

function normal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2],
    vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function triangle(b: MeshBuilder, p0: V3, p1: V3, p2: V3) {
  const [nx, ny, nz] = normal(p0, p1, p2);
  const i = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(p1[0], p1[1], p1[2], nx, ny, nz, 1, 0);
  b.vertex(p2[0], p2[1], p2[2], nx, ny, nz, 0.5, 1);
  b.triangle(i, i + 1, i + 2);
}

function quad(b: MeshBuilder, p0: V3, p1: V3, p2: V3, p3: V3) {
  const [nx, ny, nz] = normal(p0, p1, p3);
  const i = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(p1[0], p1[1], p1[2], nx, ny, nz, 1, 0);
  b.vertex(p2[0], p2[1], p2[2], nx, ny, nz, 1, 1);
  b.vertex(p3[0], p3[1], p3[2], nx, ny, nz, 0, 1);
  b.quad(i, i + 1, i + 2, i + 3);
}

/** A mesh from a builder's work. */
function made(build: (b: MeshBuilder) => void): Mesh {
  const b = new MeshBuilder();
  build(b);
  return b.build();
}

/** A place whose z runs along +x, for a lens or a cylinder lying along the rover. */
const alongX = (x: number, y: number, z: number): Place => posed(x, y, z, 0, Math.PI / 2, 0);
/** A place whose z runs along +y, for an axle. */
const alongY = (x: number, y: number, z: number): Place => posed(x, y, z, 0, 0, -Math.PI / 2);

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

/**
 * The body: the chassis, its skirt, the deck, the power unit at the back, the antennas and an instrument box, all
 * made about the body's own middle and lifted `LIFT` over the pivots; and the struts down to the pivots.
 */
function bodyParts(): RoverPart[] {
  const white = made((b) => {
    // the chassis, upper half, and the deck that overhangs it a little
    bevelled(b, posed(0, 0, 0), -1.5, 1.4, -0.72, 0.72, -0.12, 0.34, 0.18, 0.04);
    bevelled(b, posed(0, 0, 0), -1.75, 1.62, -1.18, 1.18, 0.42, 0.52, 0.32, 0.05);
    // the high-gain dish's post and the dish, tipped up toward the sky behind
    rod(b, [-0.85, 0.62, 0.5], [-0.85, 0.62, 0.95], 0.06, 6);
    frustum(b, posed(-0.85, 0.62, 0.95, 0.4, -0.75, 0), 10, 0.08, 0.5, 0, 0.16, { top: true });
  });
  const orange = made((b) => {
    // the skirt, the lower half, a little inside the white so the white overhangs it like a lid
    bevelled(b, posed(0, 0, 0), -1.42, 1.32, -0.68, 0.68, -0.48, -0.1, 0.16, 0.0001);
    // the deck's rim, a line of orange under the deck's white
    bevelled(b, posed(0, 0, 0), -1.72, 1.6, -1.15, 1.15, 0.33, 0.43, 0.3, 0.0001);
    // the whip antenna's ball, a bead on a stalk
    lump(b, posed(-1.25, -0.72, 1.9), seeded(3), 3, 6, [0.21, 0.21, 0.21], { give: 0 });
    // a panel down each side of the chassis, so it reads orange from the side and from above at the home zoom too
    for (const y of [0.7, -0.76]) bevelled(b, posed(0, 0, 0), -1.3, 1.2, y, y + 0.06, -0.08, 0.3, 0.02, 0.0001);
    // a plate across the back, so the rover reads orange from behind, where the chase camera sees it
    bevelled(b, posed(0, 0, 0), -1.56, -1.44, -0.6, 0.6, -0.4, 0.28, 0.12, 0.0001);
    // the power unit's fins
    const rtg = posed(-1.68, 0, 0.2, 0, -0.62, 0);
    for (let k = 0; k < 4; k++) {
      const fin = then(rtg, posed(0, 0, 0, ((k + 0.5) / 4) * Math.PI * 2));
      block(b, fin, 0.22, 0.44, -0.04, 0.04, 0.1, 0.72);
    }
    // the mast's collar
    frustum(b, posed(RIG.mast[0], RIG.mast[1], RIG.mast[2] - LIFT), 8, 0.24, 0.2, 0, 0.26, { top: true });
  });
  const dark = made((b) => {
    // the power unit, a finned drum leaning off the back
    const rtg = posed(-1.68, 0, 0.2, 0, -0.62, 0);
    frustum(b, rtg, 8, 0.26, 0.26, 0, 0.8, { top: true, bottom: true });
    // the whip antenna
    rod(b, [-1.25, -0.72, 0.5], [-1.25, -0.72, 1.76], 0.035, 5);
  });
  const struts = made((b) => {
    // a strut down each side from the body to the pivot its rocker turns on
    for (const s of [1, -1]) {
      rod(b, [0.25, s * 0.66, LIFT - 0.3], [0, s * (RIG.arm - 0.12), 0], 0.1, 6, true);
      rod(b, [-0.25, s * 0.66, LIFT - 0.3], [0, s * (RIG.arm - 0.12), 0], 0.1, 6, true);
    }
  });
  const gold = made((b) => {
    // an instrument box in its foil, and a smaller one
    bevelled(b, posed(0, 0, 0), -0.25, 0.45, -0.95, -0.4, 0.52, 0.86, 0.08, 0.04);
    bevelled(b, posed(0, 0, 0), -1.45, -1.05, 0.15, 0.5, 0.52, 0.72, 0.06, 0.03);
  });
  // the arm, folded across the front as Curiosity stows its own: a shoulder, two steel limbs, and a tool turret at the
  // end, white with an orange cap, held just under the deck's lip
  const shoulder: V3 = [1.42, -0.48, -0.05],
    elbow: V3 = [1.78, 0.05, -0.32],
    wrist: V3 = [1.62, 0.5, -0.12];
  const arm = made((b) => {
    rod(b, shoulder, elbow, 0.075, 5, true);
    rod(b, elbow, wrist, 0.065, 5, true);
    lump(b, posed(elbow[0], elbow[1], elbow[2] - 0.09), seeded(5), 3, 6, [0.11, 0.11, 0.11], { give: 0 });
  });
  const turret = made((b) => {
    frustum(b, posed(wrist[0], wrist[1], wrist[2] - 0.12), 8, 0.2, 0.2, 0, 0.26, { top: true, bottom: true });
    block(b, posed(0, 0, 0), 1.36, 1.46, -0.6, -0.36, -0.2, 0.1);
  });
  const cap = made((b) => {
    frustum(b, posed(wrist[0], wrist[1], wrist[2] + 0.14), 8, 0.14, 0.1, 0, 0.08, { top: true });
  });
  const slot = SLOT.body;
  return [
    { name: 'body white', mesh: lifted(white), colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'body orange', mesh: lifted(orange), colour: C.orange, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'body dark', mesh: lifted(dark), colour: C.rtg, rough: ROUGH.metal, slot, count: 1 },
    { name: 'body gold', mesh: lifted(gold), colour: C.gold, rough: ROUGH.metal, slot, count: 1 },
    { name: 'struts', mesh: struts, colour: C.steel, rough: ROUGH.metal, slot, count: 1 },
    { name: 'arm', mesh: lifted(arm), colour: C.steel, rough: ROUGH.metal, slot, count: 1 },
    { name: 'turret', mesh: lifted(turret), colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'turret cap', mesh: lifted(cap), colour: C.orange, rough: ROUGH.plastic, slot, count: 1 },
  ];
}

/** The mast: a white pole from the collar up to the head's turn. */
function mastParts(): RoverPart[] {
  const pole = made((b) => {
    frustum(b, posed(0, 0, 0.2), 8, 0.16, 0.13, 0, RIG.mastHeight - 0.2, { top: false });
  });
  const joint = made((b) => {
    frustum(b, posed(0, 0, RIG.mastHeight - 0.14), 8, 0.21, 0.21, 0, 0.18, { top: true });
  });
  return [
    { name: 'mast', mesh: pole, colour: C.white, rough: ROUGH.plastic, slot: SLOT.mast, count: 1 },
    { name: 'mast joint', mesh: joint, colour: C.steel, rough: ROUGH.metal, slot: SLOT.mast, count: 1 },
  ];
}

/**
 * How much bigger the head is drawn than it was first made: a fifth, so the face reads at the chase camera's distance
 * (review 1, 6). Every figure of the head below is before it.
 */
const HEAD_SCALE = 1.2;

/** A mesh scaled evenly about its origin, and moved up by `dz` after, in place. */
function scaled(mesh: Mesh, k: number, dz = 0): Mesh {
  for (let i = 0; i < mesh.positions.length; i += 3) {
    mesh.positions[i] *= k;
    mesh.positions[i + 1] *= k;
    mesh.positions[i + 2] = mesh.positions[i + 2] * k + dz;
  }
  return mesh;
}

/** The eyes' places on the head's face: either side of the middle, a little above it. */
const EYES = { y: 0.33, z: 0.47, face: 0.52, ring: 0.29, lens: 0.225 } as const;

/**
 * The head: a soft white box with two big round glass eyes in dark rings, a white glint high in each (which is what
 * makes them look back at you), an orange brim over them, a blush under each, and an orange panel on its back so it
 * reads from behind as well, where the chase camera sees it.
 */
function headParts(): RoverPart[] {
  const shell = made((b) => {
    bevelled(b, posed(0, 0, 0), -0.5, EYES.face, -0.8, 0.8, 0.02, 0.92, 0.26, 0.16);
    // the neck under it
    frustum(b, posed(0, 0, -0.06), 8, 0.17, 0.17, 0, 0.1, { top: false });
  });
  const ring = made((b) => {
    for (const y of [EYES.y, -EYES.y])
      frustum(b, alongX(EYES.face - 0.04, y, EYES.z), 12, EYES.ring, EYES.ring * 0.92, 0, 0.12);
  });
  const lens = made((b) => {
    for (const y of [EYES.y, -EYES.y])
      frustum(b, alongX(EYES.face + 0.06, y, EYES.z), 12, EYES.lens, EYES.lens * 0.82, 0, 0.05);
  });
  const glint = made((b) => {
    for (const y of [EYES.y, -EYES.y]) {
      disc(b, alongX(EYES.face + 0.115, y + 0.07, EYES.z + 0.08), 8, 0.075, 0);
      disc(b, alongX(EYES.face + 0.112, y - 0.07, EYES.z - 0.08), 6, 0.03, 0);
    }
  });
  const orange = made((b) => {
    // the brim, standing a little proud of the face over both eyes
    bevelled(b, posed(0, 0, 0), EYES.face - 0.26, EYES.face + 0.2, -0.74, 0.74, 0.84, 0.98, 0.14, 0.03);
    // the panel on the back of the head
    block(b, posed(0, 0, 0), -0.54, -0.47, -0.5, 0.5, 0.18, 0.74);
  });
  const blush = made((b) => {
    for (const y of [0.58, -0.58]) disc(b, alongX(EYES.face + 0.004, y, 0.2), 8, 0.09, 0);
  });
  const slot = SLOT.head,
    eyes = SLOT.eyes;
  // the eyes made about their own middle, which their slot is placed at, so a blink squeezes them about it
  const eye = (m: Mesh) => scaled(m, HEAD_SCALE, -EYES.z * HEAD_SCALE);
  return [
    { name: 'head', mesh: scaled(shell, HEAD_SCALE), colour: C.white, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'eye rings', mesh: eye(ring), colour: C.ring, rough: ROUGH.plastic, slot: eyes, count: 1 },
    { name: 'lenses', mesh: eye(lens), colour: C.lens, rough: ROUGH.lens, slot: eyes, count: 1 },
    { name: 'glints', mesh: eye(glint), colour: C.glint, rough: ROUGH.plastic, slot: eyes, count: 1 },
    { name: 'brim', mesh: scaled(orange, HEAD_SCALE), colour: C.orange, rough: ROUGH.plastic, slot, count: 1 },
    { name: 'blush', mesh: scaled(blush, HEAD_SCALE), colour: C.cheek, rough: ROUGH.paint, slot, count: 1 },
  ];
}

/** An arm of the suspension: a square beam from one point to another, in the plane of its own y = 0. */
function beam(b: MeshBuilder, from: V3, to: V3, r = 0.1) {
  rod(b, from, to, r, 4, true);
}

/**
 * The rockers and bogies: steel beams bent up between their ends, as Curiosity's are, with an orange cap on each pivot.
 * One mesh serves both sides.
 */
function armParts(): RoverPart[] {
  const [fx, fz] = RIG.front,
    [bx, bz] = RIG.bogie;
  const rocker = made((b) => {
    const knee: V3 = [fx * 0.45, 0, 0.45],
      hip: V3 = [bx * 0.5, 0, 0.32];
    beam(b, [0, 0, 0], knee);
    beam(b, knee, [fx, 0, fz], 0.11);
    beam(b, [0, 0, 0], hip);
    beam(b, hip, [bx, 0, bz]);
  });
  const rockerCap = made((b) => {
    frustum(b, alongY(0, -0.16, 0), 8, 0.2, 0.2, 0, 0.32, { top: true, bottom: true });
    frustum(b, alongY(bx, -0.14, bz), 8, 0.14, 0.14, 0, 0.28, { top: true, bottom: true });
  });
  const bogie = made((b) => {
    const apex: V3 = [0, 0, 0.32];
    beam(b, [0, 0, 0], apex, 0.09);
    beam(b, apex, [RIG.reach, 0, RIG.drop]);
    beam(b, apex, [-RIG.reach, 0, RIG.drop]);
  });
  return [
    { name: 'rocker', mesh: rocker, colour: C.steel, rough: ROUGH.metal, slot: SLOT.rocker, count: 2 },
    { name: 'rocker caps', mesh: rockerCap, colour: C.orange, rough: ROUGH.plastic, slot: SLOT.rocker, count: 2 },
    { name: 'bogie', mesh: bogie, colour: C.steel, rough: ROUGH.metal, slot: SLOT.bogie, count: 2 },
  ];
}

/**
 * A wheel: a dark tyre of twelve flat faces with a raised grouser across each, so it rolls as a toy's does and its
 * turning shows on its outline; a pale hub on its outer face with three orange spokes and an orange cap, so its turning
 * shows head on too; and a stub of axle in to the arm. Built about its axle along y, its outer face on +y.
 */
function wheelParts(): RoverPart[] {
  const R = ROVER_SIZE.wheelRadius,
    half = WHEEL_WIDTH / 2,
    tread = 0.07,
    sides = 12;
  const inner = R - tread;
  const tyre = made((b) => {
    frustum(b, alongY(0, -half, 0), sides, inner, inner, 0, WHEEL_WIDTH, { top: true, bottom: true });
    for (let k = 0; k < sides; k++) {
      const turn = posed(0, 0, 0, 0, ((k + 0.5) / sides) * Math.PI * 2, 0);
      block(b, turn, -0.075, 0.075, -half, half, inner - 0.02, R);
    }
    // the axle stub, in to the arm
    frustum(
      b,
      alongY(0, -half - (RIG.track - RIG.arm - half) - 0.05, 0),
      6,
      0.1,
      0.1,
      0,
      RIG.track - RIG.arm - half + 0.06,
      {
        top: false,
      },
    );
  });
  const hub = made((b) => {
    disc(b, alongY(0, half + 0.004, 0), sides, inner - 0.15, 0, Math.PI / sides);
  });
  const spokes = made((b) => {
    for (let k = 0; k < 3; k++) {
      const turn = then(alongY(0, half, 0), posed(0, 0, 0, (k / 3) * Math.PI * 2));
      block(b, turn, 0.12, inner - 0.2, -0.06, 0.06, 0, 0.05);
    }
    frustum(b, alongY(0, half, 0), 8, 0.2, 0.15, 0, 0.1, { top: true });
  });
  return [
    { name: 'tyres', mesh: tyre, colour: C.tyre, rough: ROUGH.earth, slot: SLOT.wheel, count: 6 },
    { name: 'hubs', mesh: hub, colour: C.white, rough: ROUGH.plastic, slot: SLOT.wheel, count: 6 },
    { name: 'spokes', mesh: spokes, colour: C.orange, rough: ROUGH.plastic, slot: SLOT.wheel, count: 6 },
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
