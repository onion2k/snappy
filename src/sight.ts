/**
 * What a line of sight meets, worked out from the world's numbers and never from the picture, so the viewfinder's
 * focus and the grade are tested on the fixture and are the same every time. A ray is walked out over the ground,
 * whose top is the terrain, the water over it, and the top of whatever rock or building stands on a tile; and it is
 * met against each oddity's bounds, an upright cylinder as wide and as tall as `SUBJECTS` says, and against the trees
 * (`Blockers`). The trees were left out once, as cut from the view by the scene, but in the viewfinder the scene's
 * sight line runs from the lens to a point a few metres ahead, so it cuts only what is at the lens: a UFO behind a
 * crown was bracketed, focused on and graded as seen (review 1). What is low, a bush or a fern, is still left out.
 *
 * Nothing here allocates: the viewfinder asks it every frame. The rays are handed in and read back through scratch
 * arrays, and the answers that are counts are whole numbers, since a fraction handed to a call or handed back from
 * one is boxed by V8.
 */
import { CROWN, tallness } from './view';
import { SUBJECTS, SUBJECT_KINDS, type Ground, type Kind, type Placement, type SubjectKind } from './world/types';

/** What a cast hit, as `out[1]` says it: an oddity's index among the subjects, or one of these. */
export const HIT = { ground: -1, nothing: -2, tree: -3 } as const;

/**
 * The trees as the lens meets them, each kind in shares of its height (`tallness`, the scene's own): a thin trunk
 * from its foot to where its crown begins, `foot`, and the crown an upright cylinder from there to its top, `crown`
 * of the height in radius. The cylinder is about the solid middle of each model's crown, read off its builder: the
 * scene's `CROWN`, a third of the height, is how far a crown can reach and is what the scene cuts by, and the lens
 * takes the same for the round-crowned trees; a conifer is a cone, a third wide at its foot and nothing at its tip,
 * so its cylinder is narrower, and its lowest tier starts a sixth up; the broadleaf's lumps start a quarter up, the
 * apple's two fifths, the twisted tree's pads halfway, and the willow's lobes hang to a sixth of its height. The
 * trunks are a twentieth of the height across at the most. Nothing lower than a tree hides an oddity from the lens:
 * a bush or the reeds are a few units tall, and leaving them out keeps the oddities in the open seen.
 */
export const TREE: Readonly<Partial<Record<Kind, { foot: number; crown: number }>>> = {
  broadleaf: { foot: 0.25, crown: CROWN },
  conifer: { foot: 0.16, crown: 0.2 },
  twisted: { foot: 0.45, crown: 0.3 },
  willow: { foot: 0.15, crown: 0.3 },
  fruit: { foot: 0.4, crown: CROWN },
};
/** A tree's trunk's radius, as a share of its height. */
export const TRUNK = 0.05;

/**
 * The coarse grid the trees are filed in, its cells `cell` units square: a ray looks only at the trees filed in the
 * cells it crosses, nearest first, and stops at the first cell past which nothing it met could be nearer. A crown is
 * at most about forty units across (the biggest broadleaf in the world) and most are fifteen to twenty-five, so a cell
 * of sixteen holds the few trees round it, and a ray across the whole world crosses about two hundred.
 */
export const BLOCKER_GRID = { cell: 16 } as const;

/**
 * The trees among a world's placements, read once into flat arrays as upright cylinders, two a tree (its trunk and its
 * crown), and filed by the cells of a coarse grid each reaches into, as offsets into one list of indices. Made once
 * with the subjects, and never written again.
 */
export class Blockers {
  /** How many cylinders: twice the trees. */
  readonly count: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly radius: Float64Array;
  readonly bottom: Float64Array;
  readonly top: Float64Array;
  /** The grid: its corner, its size in cells, and for each cell where its indices start in `filed` and end. */
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  readonly start: Int32Array;
  readonly filed: Int32Array;

  constructor(placements: readonly Placement[]) {
    const trees = placements.filter((p) => TREE[p.kind] !== undefined && tallness(p.kind) * p.scale > 0);
    const n = trees.length * 2;
    this.count = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.radius = new Float64Array(n);
    this.bottom = new Float64Array(n);
    this.top = new Float64Array(n);
    let minX = 0,
      minY = 0,
      maxX = 0,
      maxY = 0;
    trees.forEach((p, k) => {
      const h = tallness(p.kind) * p.scale,
        shape = TREE[p.kind]!;
      const trunk = 2 * k,
        crown = trunk + 1;
      this.x[trunk] = this.x[crown] = p.x;
      this.y[trunk] = this.y[crown] = p.y;
      this.radius[trunk] = h * TRUNK;
      this.radius[crown] = h * shape.crown;
      this.bottom[trunk] = p.z;
      this.top[trunk] = this.bottom[crown] = p.z + h * shape.foot;
      this.top[crown] = p.z + h;
      const r = h * shape.crown;
      if (k === 0) {
        minX = maxX = p.x;
        minY = maxY = p.y;
      }
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    });
    const cell = BLOCKER_GRID.cell;
    this.minX = minX;
    this.minY = minY;
    const cols = (this.cols = Math.max(1, Math.ceil((maxX - minX) / cell)));
    const rows = (this.rows = Math.max(1, Math.ceil((maxY - minY) / cell)));
    // each cylinder filed in every cell its circle's square reaches into: counted, then laid out, then written
    const span = (k: number, each: (c: number) => void) => {
      const r = this.radius[k];
      const i0 = Math.max(0, Math.floor((this.x[k] - r - minX) / cell)),
        i1 = Math.min(cols - 1, Math.floor((this.x[k] + r - minX) / cell)),
        j0 = Math.max(0, Math.floor((this.y[k] - r - minY) / cell)),
        j1 = Math.min(rows - 1, Math.floor((this.y[k] + r - minY) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) each(j * cols + i);
    };
    const cells = cols * rows;
    const start = new Int32Array(cells + 1);
    for (let k = 0; k < n; k++) span(k, (c) => start[c + 1]++);
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const filed = new Int32Array(start[cells]);
    const at = start.slice(0, cells);
    for (let k = 0; k < n; k++) span(k, (c) => (filed[at[c]++] = k));
    this.start = start;
    this.filed = filed;
  }
}

/**
 * How the ray is walked over the ground, in units. Each step is `least` near the eye, growing by `grow` of the
 * distance out to at most `most`, so the near ground, where an edge is big in the picture, is looked at closely and
 * the far ground in fewer looks: a tile is six units, so a step of three looks into every tile a ray crosses square
 * on, and misses only a corner it clips. Where a step ends under the ground, the edge between it and the last is found
 * by halving the step `refine` times, to a hundredth of a unit at the longest.
 */
export const MARCH = { least: 0.5, grow: 0.01, most: 3, refine: 9 } as const;

/**
 * The oddities in a world, read once from its placements into flat arrays, so a ray is met against a dozen cylinders
 * without walking the thousands of trees and stones round them. Each is as big as `SUBJECTS` says times its placement's
 * scale, and its foot is the placement's z, which for a UFO already has its hover in it. `lift` is written by whoever
 * moves them as the game goes, in units over the foot: the page and the fuzzer write a UFO's bob there each frame,
 * `ufoBob(t, vary)` from the models, so the lens sees the saucer where it is drawn. It starts at nought, and nothing
 * here writes it, so this module needs neither the clock nor the models.
 */
export class Subjects {
  readonly count: number;
  /** The placements they were read from, in order: an oddity's index here is its index in this list. */
  readonly placements: readonly Placement[];
  readonly kinds: readonly SubjectKind[];
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** The foot, in units: the placement's own z, which is the ground, the water, or for a UFO the air it hovers in. */
  readonly foot: Float64Array;
  readonly radius: Float64Array;
  readonly height: Float64Array;
  /** Which way its front faces across the ground, the placement's yaw; and 1 where it has a front, 0 where not. */
  readonly yaw: Float64Array;
  readonly front: Uint8Array;
  /** How far each is lifted off its foot now, in units: written by the page each frame, read by every sum here. */
  readonly lift: Float64Array;
  /** The trees of the same world, which hide an oddity as the ground does. */
  readonly blockers: Blockers;

  constructor(placements: readonly Placement[]) {
    const odd = placements.filter((p) => SUBJECT_KINDS.has(p.kind));
    const n = odd.length;
    this.count = n;
    this.placements = odd;
    this.kinds = odd.map((p) => p.kind as SubjectKind);
    this.x = Float64Array.from(odd, (p) => p.x);
    this.y = Float64Array.from(odd, (p) => p.y);
    this.foot = Float64Array.from(odd, (p) => p.z);
    this.radius = Float64Array.from(odd, (p) => SUBJECTS[p.kind as SubjectKind].radius * p.scale);
    this.height = Float64Array.from(odd, (p) => SUBJECTS[p.kind as SubjectKind].height * p.scale);
    this.yaw = Float64Array.from(odd, (p) => p.yaw);
    this.front = Uint8Array.from(odd, (p) => (SUBJECTS[p.kind as SubjectKind].front ? 1 : 0));
    this.lift = new Float64Array(n);
    this.blockers = new Blockers(placements);
  }

  /** The oddities among a world's placements. */
  static of(map: { placements: readonly Placement[] }): Subjects {
    return new Subjects(map.placements);
  }

  /** Its middle, halfway up, written to `out` as x, y, z. */
  middle(i: number, out: Float64Array): void {
    out[0] = this.x[i];
    out[1] = this.y[i];
    out[2] = this.foot[i] + this.lift[i] + this.height[i] * 0.5;
  }

  /** Its display name, for the brackets and the card. */
  name(i: number): string {
    return SUBJECTS[this.kinds[i]].name;
  }
}

/**
 * The ray being cast, and what it met: the eye x, y, z, the way it goes (a unit vector), how far it is looked along,
 * and how far along it the walk is looking now; then the distance to what it met and what that was. Shared by every
 * cast, since each runs to its end before the next is begun.
 */
const RAY = new Float64Array(8);
const MET = new Float64Array(2);

/**
 * Whether the ray is under the ground `RAY[7]` along it, the ground standing as tall as rock's or a roof's top, or the
 * water over the terrain. How far along is read from the array and not handed in, since the walk's distances are
 * fractions, and V8 boxed one handed to this where it did not inline it: a number a look, at a few looks of the
 * hundreds a walk takes (the allocation test caught it).
 */
function under(g: Ground): boolean {
  const t = RAY[7];
  const x = RAY[0] + RAY[3] * t,
    y = RAY[1] + RAY[4] * t;
  // the water and the tops never stand together on a tile in a world made by the rule, so adding them is the higher
  // of the two wherever it matters, and costs two reads of the ground rather than three
  return RAY[2] + RAY[5] * t < g.topAt(x, y) + g.waterDepthAt(x, y);
}

/**
 * The nearest of the oddities the ray meets within its reach, but `skip`: its distance in `MET[0]` and its index in
 * `MET[1]`, or the reach and `HIT.nothing`. Each is an upright cylinder from its foot to its top: the ray is cut to
 * where it is inside the circle across the ground, and to where it is between the two heights, and meets it where
 * both are first true.
 */
function meetSubjects(s: Subjects, skip: number): void {
  const ox = RAY[0],
    oy = RAY[1],
    oz = RAY[2],
    dx = RAY[3],
    dy = RAY[4],
    dz = RAY[5];
  MET[0] = RAY[6];
  MET[1] = HIT.nothing;
  const flat = dx * dx + dy * dy;
  for (let i = 0; i < s.count; i++) {
    if (i === skip) continue;
    const r = s.radius[i];
    const cx = ox - s.x[i],
      cy = oy - s.y[i];
    const c = cx * cx + cy * cy - r * r;
    let lo = -Infinity,
      hi = Infinity;
    if (flat < 1e-12) {
      // straight up or down: inside the circle all the way, or never
      if (c > 0) continue;
    } else {
      const b = cx * dx + cy * dy;
      const disc = b * b - flat * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      lo = (-b - root) / flat;
      hi = (-b + root) / flat;
    }
    const bottom = s.foot[i] + s.lift[i],
      top = bottom + s.height[i];
    if (Math.abs(dz) < 1e-12) {
      if (oz < bottom || oz > top) continue;
    } else {
      const a = (bottom - oz) / dz,
        b = (top - oz) / dz;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
    if (lo > hi || hi < 0) continue;
    const t = lo > 0 ? lo : 0;
    if (t < MET[0]) {
      MET[0] = t;
      MET[1] = i;
    }
  }
}

/** Where the ray meets one of the blockers' cylinders, in `CROSS[0]`: its distance along, or infinity for never. */
const CROSS = new Float64Array(1);

/**
 * The ray in `RAY` against one of the blockers' cylinders, by its index, so nothing handed in or back is a fraction.
 * A cylinder the eye is inside is never met: the scene cuts what is at the lens out of the picture (`view.ts`), so
 * the lens sees out of a crown it stands in, as the player does.
 */
function crossBlocker(b: Blockers, k: number): void {
  CROSS[0] = Infinity;
  const ox = RAY[0],
    oy = RAY[1],
    oz = RAY[2],
    dx = RAY[3],
    dy = RAY[4],
    dz = RAY[5];
  const r = b.radius[k],
    bottom = b.bottom[k],
    top = b.top[k];
  const cx = ox - b.x[k],
    cy = oy - b.y[k];
  const c = cx * cx + cy * cy - r * r;
  if (c <= 0 && oz >= bottom && oz <= top) return;
  const flat = dx * dx + dy * dy;
  let lo = -Infinity,
    hi = Infinity;
  if (flat < 1e-12) {
    if (c > 0) return;
  } else {
    const p = cx * dx + cy * dy;
    const disc = p * p - flat * c;
    if (disc < 0) return;
    const root = Math.sqrt(disc);
    lo = (-p - root) / flat;
    hi = (-p + root) / flat;
  }
  if (Math.abs(dz) < 1e-12) {
    if (oz < bottom || oz > top) return;
  } else {
    const a = (bottom - oz) / dz,
      e = (top - oz) / dz;
    lo = Math.max(lo, Math.min(a, e));
    hi = Math.min(hi, Math.max(a, e));
  }
  if (lo > hi || hi < 0) return;
  CROSS[0] = lo > 0 ? lo : 0;
}

/**
 * The nearest tree the ray meets nearer than `MET[0]`, written over `MET` as `HIT.tree` if there is one. The ray is
 * walked across the grid's cells in the order it crosses them, from where it enters the grid to where it leaves it or
 * reaches `MET[0]`, and stops at the first cell holding a meeting no further off than that cell's far side: a tree
 * filed only further on can only be met further off.
 */
function meetBlockers(b: Blockers): void {
  if (b.count === 0) return;
  const cell = BLOCKER_GRID.cell;
  const ox = RAY[0],
    oy = RAY[1],
    dx = RAY[3],
    dy = RAY[4];
  const x0 = b.minX,
    y0 = b.minY,
    x1 = x0 + b.cols * cell,
    y1 = y0 + b.rows * cell;
  // the stretch of the ray over the grid, across the ground; a ray straight up or down stays in the one cell
  const alongX = Math.abs(dx) >= 1e-12,
    alongY = Math.abs(dy) >= 1e-12;
  let t0 = 0,
    t1 = MET[0];
  if (!alongX) {
    if (ox < x0 || ox > x1) return;
  } else {
    const a = (x0 - ox) / dx,
      e = (x1 - ox) / dx;
    t0 = Math.max(t0, Math.min(a, e));
    t1 = Math.min(t1, Math.max(a, e));
  }
  if (!alongY) {
    if (oy < y0 || oy > y1) return;
  } else {
    const a = (y0 - oy) / dy,
      e = (y1 - oy) / dy;
    t0 = Math.max(t0, Math.min(a, e));
    t1 = Math.min(t1, Math.max(a, e));
  }
  if (t0 > t1) return;
  let i = Math.min(b.cols - 1, Math.max(0, Math.floor((ox + dx * t0 - x0) / cell))),
    j = Math.min(b.rows - 1, Math.max(0, Math.floor((oy + dy * t0 - y0) / cell)));
  let nextX = alongX ? (x0 + (dx > 0 ? i + 1 : i) * cell - ox) / dx : Infinity,
    nextY = alongY ? (y0 + (dy > 0 ? j + 1 : j) * cell - oy) / dy : Infinity;
  const stepX = alongX ? cell / Math.abs(dx) : Infinity,
    stepY = alongY ? cell / Math.abs(dy) : Infinity;
  let near = MET[0];
  for (;;) {
    const c = j * b.cols + i;
    for (let q = b.start[c], end = b.start[c + 1]; q < end; q++) {
      crossBlocker(b, b.filed[q]);
      if (CROSS[0] < near) near = CROSS[0];
    }
    const leave = Math.min(nextX, nextY);
    if (near <= leave || leave > t1) break;
    if (nextX < nextY) {
      i += dx > 0 ? 1 : -1;
      nextX += stepX;
      if (i < 0 || i >= b.cols) break;
    } else {
      j += dy > 0 ? 1 : -1;
      nextY += stepY;
      if (j < 0 || j >= b.rows) break;
    }
  }
  if (near < MET[0]) {
    MET[0] = near;
    MET[1] = HIT.tree;
  }
}

/**
 * Walk the ray in `RAY` out over the ground to what it meets first, the ground, a tree or an oddity but `skip`, into
 * `MET`. The oddities and the trees are met first, so the walk need only go as far as the nearest of them. The walk
 * stops at the world's edge, past which there is nothing to meet.
 */
function trace(g: Ground, s: Subjects | null, skip: number): void {
  if (s) {
    meetSubjects(s, skip);
    meetBlockers(s.blockers);
  } else {
    MET[0] = RAY[6];
    MET[1] = HIT.nothing;
  }
  const reach = MET[0];
  RAY[7] = 0;
  if (under(g)) {
    MET[0] = 0;
    MET[1] = HIT.ground;
    return;
  }
  const { minX, minY, maxX, maxY } = g.bounds;
  let last = 0;
  while (last < reach) {
    const step = Math.min(MARCH.most, MARCH.least + MARCH.grow * last);
    const t = Math.min(reach, last + step);
    const x = RAY[0] + RAY[3] * t,
      y = RAY[1] + RAY[4] * t;
    if (x < minX || y < minY || x > maxX || y > maxY) return;
    RAY[7] = t;
    if (under(g)) {
      // the edge lies between the last look above the ground and this one under it: halved down to it
      let above = last,
        below = t;
      for (let k = 0; k < MARCH.refine; k++) {
        const mid = (above + below) * 0.5;
        RAY[7] = mid;
        if (under(g)) below = mid;
        else above = mid;
      }
      MET[0] = below;
      MET[1] = HIT.ground;
      return;
    }
    last = t;
  }
}

/**
 * Cast a ray from `from` along `dir` (a unit vector) at most `maxDist`, over the ground and against the oddities and
 * the trees in `subjects` (but the oddity at `skip`, if any): writes the distance to what it meets to `out[0]` and what it is to
 * `out[1]`, an oddity's index or a `HIT`. Met nothing, the distance is `maxDist`. It hands nothing back, since a
 * fraction handed back is boxed, and the viewfinder casts every frame it has nothing in frame to focus on.
 */
export function castInto(
  g: Ground,
  subjects: Subjects | null,
  from: ArrayLike<number>,
  dir: ArrayLike<number>,
  maxDist: number,
  out: Float64Array,
  skip = -1,
): void {
  for (let k = 0; k < 3; k++) {
    RAY[k] = from[k];
    RAY[3 + k] = dir[k];
  }
  RAY[6] = maxDist;
  trace(g, subjects, skip);
  out[0] = MET[0];
  out[1] = MET[1];
}

/** `castInto`, handing back the distance as well, for a caller that is not asked every frame. */
export function cast(
  g: Ground,
  subjects: Subjects | null,
  from: ArrayLike<number>,
  dir: ArrayLike<number>,
  maxDist: number,
  out: Float64Array,
  skip = -1,
): number {
  castInto(g, subjects, from, dir, maxDist, out, skip);
  return out[0];
}

/**
 * The points on an oddity a ray is sent to, to see how much of it is in sight: its middle, near its top, near its
 * foot, and either side of its middle across the line to the eye, each as shares of its height and of its radius.
 * Five, so a share seen is in fifths, which is as fine as the grade needs to tell a thing half behind a wall from
 * one in the open.
 */
const POINTS = { up: [0.5, 0.9, 0.15, 0.5, 0.5], side: [0, 0, 0, -0.7, 0.7] } as const;
export const SEEN_POINTS = 5;
const UP = Float64Array.from(POINTS.up);
const SIDE = Float64Array.from(POINTS.side);
/** How near a ray must come to its point to have reached it, in units: what the halving leaves of an edge. */
const REACHED = 0.05;

/**
 * How many of an oddity's `SEEN_POINTS` a ray from `from` reaches unblocked by the ground, rock, what is built, a tree
 * or another oddity: a whole number, so the viewfinder can ask it every frame without boxing the answer.
 */
export function seenPoints(g: Ground, from: ArrayLike<number>, s: Subjects, i: number): number {
  const ex = from[0],
    ey = from[1],
    ez = from[2];
  const sx = s.x[i],
    sy = s.y[i];
  // across the line to the eye, flat: either side of the middle as the lens sees it; looked straight down on, east
  let ax = sx - ex,
    ay = sy - ey;
  const flat = Math.sqrt(ax * ax + ay * ay);
  if (flat > 1e-9) {
    const k = 1 / flat;
    ax *= k;
    ay *= k;
  } else {
    ax = 0;
    ay = -1;
  }
  const r = s.radius[i],
    h = s.height[i],
    foot = s.foot[i] + s.lift[i];
  let seen = 0;
  for (let p = 0; p < SEEN_POINTS; p++) {
    // the side is across the line: (ay, -ax) is the line turned a quarter clockwise
    const px = sx + ay * r * SIDE[p],
      py = sy - ax * r * SIDE[p],
      pz = foot + h * UP[p];
    const dx = px - ex,
      dy = py - ey,
      dz = pz - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) {
      seen++;
      continue;
    }
    RAY[0] = ex;
    RAY[1] = ey;
    RAY[2] = ez;
    RAY[3] = dx / d;
    RAY[4] = dy / d;
    RAY[5] = dz / d;
    RAY[6] = d;
    trace(g, s, i);
    if (MET[0] >= d - REACHED) seen++;
  }
  return seen;
}

/** The share of an oddity in sight from `from`: of its points, those a ray reaches, nought to one. */
export function seenShare(g: Ground, from: ArrayLike<number>, s: Subjects, i: number): number {
  return seenPoints(g, from, s, i) / SEEN_POINTS;
}
