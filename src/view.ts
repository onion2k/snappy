/**
 * What the scene draws where, worked out without the renderer so it can be
 * tested: which chunks of the world are drawn in detail and which coarsely,
 * by how far they are from what the camera looks at; and which trees stand
 * between the camera and the rover, which the scene leaves out so a wood
 * never hides it (the spec's ninth criterion: the camera rises over what is
 * solid, and a tree is not solid to it).
 *
 * The world is cut into chunks of `CHUNK` tiles. The choice is made a chunk
 * at a time and only changes when the target crosses into another chunk, so
 * the scene rebuilds what it draws a few times a minute and not every frame.
 */
import { BUILT_SIZE, type BuiltKind } from './models/built';
import { SIZE } from './models/scenery';
import { BUILT, CHUNK, type Grid, type Placement } from './world/types';

/**
 * The rings of chunks round the target's own, by how many chunks away they are either way: the ground meshed finely
 * out to `near`, at a vertex a tile out to `mid`, and coarsely past it; the scenery drawn whole out to `kit`, as far
 * trees out to `trees`, and not at all past that. A chunk is 19 m, so the kit is drawn whole for at least 38 m round
 * the rover, which the chase camera sees all of at its farthest, and the far trees for 115 m.
 */
export const RINGS = { near: 1, mid: 3, kit: 2, trees: 6 } as const;

/** The ground's levels of detail, by number, as `ChunkView.lod` holds them. */
export const GROUND = { near: 0, mid: 1, far: 2 } as const;
/** What scenery a chunk draws, as `ChunkView.kit` holds it. */
export const KIT = { none: 0, whole: 1, far: 2 } as const;

/** Which chunks are drawn how, for where the camera looks. */
export class ChunkView {
  readonly cols: number;
  readonly rows: number;
  /** Each chunk's ground, a `GROUND`, row by row. */
  readonly lod: Uint8Array;
  /** Each chunk's scenery, a `KIT`, row by row. */
  readonly kit: Uint8Array;
  /** The chunk the target is in, or -1 before the first update. */
  cx = -1;
  cy = -1;
  /** How far out the far trees are drawn, in chunks: `RINGS.trees`, or fewer on a slower machine (`setTrees`). */
  trees: number = RINGS.trees;
  private readonly size: number;
  private readonly originX: number;
  private readonly originY: number;

  constructor(grid: Grid) {
    this.cols = Math.ceil(grid.cols / CHUNK);
    this.rows = Math.ceil(grid.rows / CHUNK);
    this.size = CHUNK * grid.tile;
    this.originX = grid.originX;
    this.originY = grid.originY;
    this.lod = new Uint8Array(this.cols * this.rows);
    this.kit = new Uint8Array(this.cols * this.rows);
  }

  /** The chunk column (or row, with `y`) a point is in, held to the world. */
  chunkOf(v: number, origin: number, n: number): number {
    return Math.max(0, Math.min(n - 1, Math.floor((v - origin) / this.size)));
  }

  /** Choose for a target at (x, y): true if it has crossed into another chunk, and the choice was made again. */
  update(x: number, y: number): boolean {
    const cx = this.chunkOf(x, this.originX, this.cols),
      cy = this.chunkOf(y, this.originY, this.rows);
    if (cx === this.cx && cy === this.cy) return false;
    this.cx = cx;
    this.cy = cy;
    this.choose();
    return true;
  }

  /**
   * Draw the far trees out to `ring` chunks, not less than the ring drawn whole: true if that changed what is chosen,
   * which is chosen again at once round the chunk the target is in.
   */
  setTrees(ring: number): boolean {
    const r = Math.max(RINGS.kit, Math.round(ring));
    if (r === this.trees) return false;
    this.trees = r;
    if (this.cx >= 0) this.choose();
    return true;
  }

  private choose() {
    const { cx, cy } = this;
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.cols; i++) {
        const d = Math.max(Math.abs(i - cx), Math.abs(j - cy));
        const c = j * this.cols + i;
        this.lod[c] = d <= RINGS.near ? GROUND.near : d <= RINGS.mid ? GROUND.mid : GROUND.far;
        this.kit[c] = d <= RINGS.kit ? KIT.whole : d <= this.trees ? KIT.far : KIT.none;
      }
  }
}

/**
 * How tall each kind that can come between the camera and the rover stands at a scale of one, in units: the trees,
 * and what is built at its ridge or its top; nought for what is too low ever to hide it.
 */
export function tallness(kind: Placement['kind']): number {
  const tree = TREE_HEIGHT[kind];
  if (tree !== undefined) return tree;
  return BUILT.has(kind) && BUILT_SIZE[kind as BuiltKind].height > 12 ? BUILT_SIZE[kind as BuiltKind].height : 0;
}

/** The trees' heights, by kind: the kinds tall enough to stand in the camera's way that are not built. */
const TREE_HEIGHT: Partial<Record<Placement['kind'], number>> = {
  broadleaf: SIZE.broadleaf,
  conifer: SIZE.conifer,
  twisted: SIZE.twisted,
  willow: SIZE.willow,
  fruit: SIZE.fruit,
};

/** How far out from its middle a tall kind reaches, at a scale of one: a tree's crown, or a building's footprint. */
function reachOf(kind: Placement['kind']): number {
  if (BUILT.has(kind)) {
    const b = BUILT_SIZE[kind as BuiltKind];
    return Math.max(b.hx, b.hy);
  }
  return tallness(kind) * CROWN;
}

/**
 * What stands in the camera's way, as the scene asks of each tall thing every frame: anything in the line from the
 * camera to the rover (the line, read as a cylinder as wide as the thing's crown or footprint from its foot to its top),
 * and anything near the eye that would fill the foot of the picture, a wall of leaves or roof in front of everything.
 * The foot of the picture is taken as the frustum's own: a thing nearer the camera than `NEAR_SHARE` of the way to what
 * it looks at, inside the frustum's sides, whose top reaches above the ray along the bottom edge of the picture, is
 * in the picture and in front, and is cut away (review 1). The line and the frustum are set once a frame, and each thing
 * is asked of them with nothing handed in but the placement, so asking makes nothing.
 */
export class SightLine {
  /** The camera's eye and the point it looks at, x, y and z each. */
  readonly eye = new Float64Array(3);
  readonly target = new Float64Array(3);
  /** The frustum, as a forward along the ground, its reach, the tangent of half its width, and the bottom ray's dip. */
  private readonly frame = new Float64Array(7);

  /**
   * The line and the frustum for a camera at `eye` looking at `target` through `lens`: how many degrees tall the view
   * is, and its width over its height. The lens is read from an array and not handed in as two numbers, since a number
   * with a fraction handed to a call is boxed, and this is asked every frame.
   */
  set(eye: ArrayLike<number>, target: ArrayLike<number>, lens: ArrayLike<number> = LENS): void {
    const fov = lens[0],
      aspect = lens[1];
    for (let k = 0; k < 3; k++) {
      this.eye[k] = eye[k];
      this.target[k] = target[k];
    }
    const dx = target[0] - eye[0],
      dy = target[1] - eye[1];
    const reach = Math.sqrt(dx * dx + dy * dy);
    const f = this.frame;
    f[0] = reach > 1e-6 ? dx / reach : 1;
    f[1] = reach > 1e-6 ? dy / reach : 0;
    f[2] = reach;
    const half = (fov * Math.PI) / 360;
    f[3] = Math.tan(half) * aspect;
    // how far under the level the picture's bottom edge looks
    const pitch = Math.atan2(eye[2] - target[2], Math.max(reach, 1e-6));
    f[4] = pitch + half;
    // the view's own dip, for how deep into the picture a point is
    f[5] = Math.cos(pitch);
    f[6] = Math.sin(pitch);
  }

  /** Whether `p` stands in the way: false for anything not tall enough to. */
  blocks(p: Placement): boolean {
    return this.inLine(p) || this.inFront(p);
  }

  /** Whether `p` stands in the line from the eye to what it looks at. */
  inLine(p: Placement): boolean {
    const h = tallness(p.kind) * p.scale;
    if (h <= 0) return false;
    const ex = this.eye[0],
      ey = this.eye[1],
      ez = this.eye[2];
    const vx = this.target[0] - ex,
      vy = this.target[1] - ey,
      vz = this.target[2] - ez;
    const across = vx * vx + vy * vy;
    if (BUILT.has(p.kind)) {
      // a building by its own footprint, turned with it, and not by a circle round it, which took a long wall beside
      // the rover to be across the line: the part of the line over the footprint, clipped to it, and its heights there
      const b = BUILT_SIZE[p.kind as BuiltKind];
      const c = Math.cos(p.yaw),
        s = Math.sin(p.yaw);
      const ox = ex - p.x,
        oy = ey - p.y;
      const lx = ox * c + oy * s,
        ly = -ox * s + oy * c,
        ux = vx * c + vy * s,
        uy = -vx * s + vy * c;
      let t0 = 0,
        t1 = 1;
      for (let k = 0; k < 4; k++) {
        const half = (k < 2 ? b.hx : b.hy) * p.scale + MARGIN;
        const q = k === 0 ? -ux : k === 1 ? ux : k === 2 ? -uy : uy;
        const w = k === 0 ? lx + half : k === 1 ? half - lx : k === 2 ? ly + half : half - ly;
        if (q === 0) {
          if (w < 0) return false;
        } else if (q < 0) t0 = Math.max(t0, w / q);
        else t1 = Math.min(t1, w / q);
        if (t0 > t1) return false;
      }
      const low = Math.min(ez + vz * t0, ez + vz * t1),
        high = Math.max(ez + vz * t0, ez + vz * t1);
      return low < p.z + h + MARGIN && high > p.z - MARGIN;
    }
    // the nearest the line comes to the thing's middle, seen from above, and how high it is there
    let t = across > 0 ? ((p.x - ex) * vx + (p.y - ey) * vy) / across : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = p.x - ex - vx * t,
      dy = p.y - ey - vy * t;
    const reach = reachOf(p.kind) * p.scale + MARGIN;
    if (dx * dx + dy * dy > reach * reach) return false;
    const z = ez + vz * t;
    return z < p.z + h + MARGIN && z > p.z - MARGIN;
  }

  /** Whether `p` stands near the eye and inside the foot of the picture, where it would hide what is behind it. */
  inFront(p: Placement): boolean {
    const h = tallness(p.kind) * p.scale;
    if (h <= 0) return false;
    const f = this.frame;
    const r = reachOf(p.kind) * p.scale;
    const dx = p.x - this.eye[0],
      dy = p.y - this.eye[1];
    const along = dx * f[0] + dy * f[1],
      side = Math.abs(dx * f[1] - dy * f[0]);
    if (along < -r || along > f[2] * (BUILT.has(p.kind) ? NEAR_BUILT : NEAR_SHARE) + r) return false;
    // inside the frustum's sides at the depth into the picture of the crown's middle, a crown's width allowed: the depth
    // along the view and not the distance over the ground, which under a camera looking steeply down is far less, and
    // took a crown filling a corner of the foot to be off the side of the picture
    const depth = Math.max(0, along * f[5] + (this.eye[2] - p.z - h * 0.6) * f[6]);
    if (side > depth * f[3] + r) return false;
    // and big in the picture: as tall as `LOOM` of its depth into it, so a short tree or a well's roof in the foot is
    // left standing, and only what looms over the foot is taken
    if (h < depth * LOOM) return false;
    // its top over the ray along the picture's bottom edge somewhere: at its far side, where the ray has fallen
    // furthest, so a tree whose foot is past where the ray meets the ground is in the picture however short it is
    const far = Math.max(0, along + r);
    return p.z + h > this.eye[2] - far * Math.tan(f[4]);
  }
}

/** The chase camera's lens, when none is said: forty degrees tall, at the shots' width over their height. */
const LENS = new Float64Array([40, 1.6]);

/** How far out a crown reaches from its trunk, as a share of the tree's height: a broadleaf's is about 0.27. */
export const CROWN = 0.32;
/** How much room is left round a crown, in units: a little, so a tree just clear of the line is left standing. */
export const MARGIN = 2;
/** How far toward what the camera looks at the foreground is cut away, as a share of the way. */
export const NEAR_SHARE = 0.6;
/**
 * How far toward what the camera looks at a building is cut away in the foot of the picture: less far than a tree,
 * since a house beside the rover is what the rover is seen among, and a house cut to its feet reads as a slab.
 */
export const NEAR_BUILT = 0.35;
/**
 * How tall a thing in the foot of the picture must stand, as a share of its depth into the picture, to be cut away: a
 * fifth of the picture's height and more, at the chase camera's forty degrees.
 */
export const LOOM = 0.4;

/**
 * The frame-time rungs a slower machine steps down, one at a time, while its frames run long (review 1, 21): first the
 * far trees drawn out to fewer chunks, then the grass thinned, then the far trees' ring cut to the ring drawn whole and
 * the contact shade and the antialiasing given up. Each rung says what it draws: how many chunks out the far trees go,
 * how dense the grass is, and whether the occlusion and the antialiasing are kept.
 */
export const RUNG_STEPS = [
  { trees: RINGS.trees, grass: 1, finish: true },
  { trees: 4, grass: 1, finish: true },
  { trees: 4, grass: 0.6, finish: true },
  { trees: RINGS.kit, grass: 0.45, finish: false },
] as const;

/**
 * When to step down: when the frames, smoothed over about `window` seconds, take longer than `slow` seconds for
 * `hold` seconds on end; and never twice within `hold`, so a rung's own relief is seen before the next is taken. A
 * frame longer than `ignore` (a tab in the background, a boot's compile) is not counted. There is no stepping back up:
 * a machine slow once is slow again, and a rung that comes and goes is seen to flicker.
 */
export const RUNG = { slow: 1 / 45, hold: 2, window: 0.5, ignore: 0.25 } as const;

/** The rung the page draws at, from how long its frames take. Makes nothing. */
export class FrameRung {
  /** Which of `RUNG_STEPS` is drawn now. */
  rung = 0;
  private smoothed = 1 / 60;
  private slowFor = 0;

  /** A frame `dt` seconds long: true if it stepped down a rung. */
  step(dt: number): boolean {
    if (!(dt > 0) || dt > RUNG.ignore) return false;
    this.smoothed += (dt - this.smoothed) * Math.min(1, dt / RUNG.window);
    this.slowFor = this.smoothed > RUNG.slow ? this.slowFor + dt : 0;
    if (this.slowFor < RUNG.hold || this.rung >= RUNG_STEPS.length - 1) return false;
    this.rung++;
    this.slowFor = 0;
    // what was smoothed was the last rung's; the next is judged afresh
    this.smoothed = 1 / 60;
    return true;
  }
}

/** The scene's work a frame can do, as bits: the ground's levels switched, and the scenery's pools filled. */
export const WORK = { ground: 1, refill: 2 } as const;

/**
 * What the scene does in a frame, from whether its target has `crossed` into another chunk, whether a crossing's
 * pools are still to be filled (`due`), and whether the frame must be `settled`: drawn as the game's state and the
 * camera say and nothing less, as a test's step and a paused frame are. While the game plays, a crossing's work is
 * spread over two frames, the ground in the one that crosses and the pools in the next, so neither frame takes both
 * (review 3, 3); a settled frame does it all at once, so its picture is never one frame behind (the final pass's bug:
 * a step's picture showed the old pools, the next frame's the new, and a still scene was never twice the same). A
 * frame with neither does none of it.
 */
export function frameWork(crossed: boolean, due: boolean, settled: boolean): number {
  if (crossed) return settled ? WORK.ground | WORK.refill : WORK.ground;
  if (due) return WORK.refill;
  return 0;
}
