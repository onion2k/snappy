/**
 * What is laid by rule from the layout rather than by hand: each cottage
 * turned to face its road or the square, with a path from its door and a
 * fenced garden behind, the signposts where roads meet, the farm's fences
 * and ricks, the windmill, the orchard's rows, the great oak, the stepping
 * stones and posts that mark each ford, and the clearings the scatter
 * leaves round all of them. Everything here is in tiles, as the layout is,
 * and made the same every time from it.
 */
import { curve } from './geometry';
import {
  GREAT_OAK,
  HAY_MEADOW,
  ORCHARD,
  PUDDLES,
  ROADS,
  RUINS,
  SQUARE_PROPS,
  VILLAGE,
  VILLAGE_PIECES,
  WINDMILL,
  type Piece,
  type Point,
  type RoadPlan,
} from './layout';
import { FOOTPRINT } from './built';
import { inside, squareOutline } from './plaza';
import { TILE } from './types';

/** The roads' middle lines, in tiles, made once. */
export const ROAD_LINES = ROADS.map((r) => curve(r.points));

/** The nearest point on any road's middle line or the square's edge to a point, how far it is, and whether it is the square's. */
export function nearestWay(px: number, py: number): { x: number; y: number; d: number; square: boolean } {
  let best = { x: px, y: py, d: Infinity, square: false };
  let square = false;
  const consider = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const x = ax + dx * t,
      y = ay + dy * t;
    const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    if (d < best.d) best = { x, y, d, square };
  };
  for (const line of ROAD_LINES)
    for (let i = 2; i < line.length; i += 2) consider(line[i - 2], line[i - 1], line[i], line[i + 1]);
  const sq = squareOutline();
  const n = sq.length / 2;
  square = true;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    consider(sq[2 * i], sq[2 * i + 1], sq[2 * j], sq[2 * j + 1]);
  }
  return best;
}

/** A point `along` tiles ahead of a piece and `across` tiles to its left, by its heading. */
function local(p: { x: number; y: number; yaw: number }, along: number, across: number): Point {
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  return [p.x + along * c - across * s, p.y + along * s + across * c];
}

/** How far a point is from every road's middle, the nearest, in tiles. */
function roadGap(px: number, py: number): number {
  let best = Infinity;
  for (const line of ROAD_LINES)
    for (let i = 0; i < line.length; i += 2) best = Math.min(best, Math.hypot(line[i] - px, line[i + 1] - py));
  return best;
}

export interface Village {
  /** The built pieces: the church, the well, the cottages turned, the stalls and carts, the garden fences. */
  built: Piece[];
  /** The paths from cottage doors to the road, as narrow roads. */
  paths: RoadPlan[];
  /** Flowers in the gardens' beds. */
  beds: Piece[];
}

/**
 * The village, laid by rule: each cottage that faces is turned, door
 * first, to the nearest road or the square's edge, and a path is laid from
 * its door to it; a cottage with a garden has a plot behind it fenced on
 * its back and one side, open on the other so nothing is shut in, and two
 * rows of flowers in it. A garden whose fence would come near a road or the
 * square is left out.
 */
export function village(): Village {
  const built: Piece[] = [],
    paths: RoadPlan[] = [],
    beds: Piece[] = [];
  const sq = squareOutline();
  for (const piece of VILLAGE_PIECES) {
    if (!piece.face) {
      built.push(piece);
      continue;
    }
    const scale = piece.scale ?? 1;
    const way = nearestWay(piece.x, piece.y);
    let yaw = Math.atan2(way.y - piece.y, way.x - piece.x);
    // a house on the square stands square to it, whichever of its corners is nearest
    if (way.square) yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    const house = { ...piece, yaw };
    built.push(house);
    // half the house along its heading and across it, in tiles
    const [hx, hy] = FOOTPRINT.cottage![0].slice(2).map((h) => (h * scale) / TILE);
    const door = local(house, hx + 0.3, 0);
    if (Math.hypot(way.x - door[0], way.y - door[1]) > 1.5)
      paths.push({ name: `path to ${piece.x},${piece.y}`, width: 1.1, points: [door, [way.x, way.y]] });
    if (!piece.garden) continue;
    const depth = 5;
    const back = local(house, -(hx + depth), 0),
      side = local(house, -(hx + depth / 2), hy + 0.8);
    const fences: Piece[] = [
      { kind: 'fence', x: back[0], y: back[1], yaw: yaw + Math.PI / 2, scale: ((2 * hy + 1.6) * TILE) / 30 },
      { kind: 'fence', x: side[0], y: side[1], yaw, scale: (depth * TILE) / 30 },
    ];
    const clear = fences.every((f) => {
      for (let k = -1; k <= 1; k++) {
        const [x, y] = local(f, (k * 15 * (f.scale ?? 1)) / TILE, 0);
        if (roadGap(x, y) < 3 || inside(sq, x, y)) return false;
      }
      return true;
    });
    if (!clear) continue;
    built.push(...fences);
    for (const row of [-0.9, 0.9])
      for (let k = 0; k < 3; k++) {
        const [x, y] = local(house, -(hx + 1.2 + k * 1.4), row * hy * 0.6);
        beds.push({ kind: 'flowers', x, y, yaw: yaw + k, scale: 0.8 });
      }
  }
  return { built, paths, beds };
}

/** The farm: the hay meadow fenced along its south and west, a gap left for a gate, and its ricks. */
export function farm(): Piece[] {
  const { x, y, w, h, ricks } = HAY_MEADOW;
  const out: Piece[] = [];
  // fence runs of 3 m; the south side has its gate where the second run would be
  for (let k = 0; k * 5 < w; k++) if (k !== 1) out.push({ kind: 'fence', x: x + 2.5 + k * 5, y, yaw: 0 });
  for (let k = 0; k * 5 < h; k++) out.push({ kind: 'fence', x, y: y + 2.5 + k * 5, yaw: Math.PI / 2 });
  for (const [rx, ry] of ricks)
    out.push({ kind: 'haystack', x: rx, y: ry, yaw: rx * 0.7, scale: 0.85 + ((rx + ry) % 4) * 0.08 });
  return out;
}

/** Every built piece in the world: the village's, the farm's, the windmill and the ruins'. */
export function builtPieces(v: Village): Piece[] {
  return [
    ...v.built,
    ...farm(),
    { kind: 'windmill', x: WINDMILL.x, y: WINDMILL.y, yaw: WINDMILL.yaw },
    ...RUINS.flatMap((r) => r.pieces),
  ];
}

/** The orchard's trees, in rows, a little out of true as an old orchard's are. */
export function orchard(): Piece[] {
  const { x, y, across, rows, spacing, yaw } = ORCHARD;
  const out: Piece[] = [];
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < across; i++) {
      const u = i * spacing + 0.25 * ((j * 7 + i * 3) % 3) - 0.25,
        v = j * spacing;
      out.push({
        kind: 'fruit',
        x: x + u * c - v * s,
        y: y + u * s + v * c,
        yaw: i * 1.7 + j,
        scale: 0.9 + 0.05 * ((i + j) % 4),
      });
    }
  return out;
}

/** The small things set by hand or by rule: the square's benches and lamps, and a signpost where each road meets another. */
export function props(): Piece[] {
  const out: Piece[] = [...SQUARE_PROPS];
  const sq = squareOutline();
  for (let r = 0; r < ROADS.length; r++) {
    const line = ROAD_LINES[r];
    const n = line.length / 2;
    for (const end of [0, n - 1]) {
      const ex = line[2 * end],
        ey = line[2 * end + 1];
      // a junction: this road's end on another road, or at the square's edge
      let meets = inside(sq, ex, ey) || nearSquare(ex, ey);
      for (let o = 0; o < ROADS.length && !meets; o++) {
        if (o === r) continue;
        const other = ROAD_LINES[o];
        for (let i = 0; i < other.length; i += 2)
          if (Math.hypot(other[i] - ex, other[i + 1] - ey) < 2.5) {
            meets = true;
            break;
          }
      }
      if (!meets) continue;
      // stood a little along the road from the junction, off its side
      const k = end === 0 ? Math.min(n - 1, 4) : Math.max(0, n - 5);
      const sx = line[2 * k],
        sy = line[2 * k + 1];
      const dir = Math.atan2(line[2 * k + 1] - ey, line[2 * k] - ex);
      const off = ROADS[r].width / 2 + 1.4;
      const x = sx - Math.sin(dir) * off,
        y = sy + Math.cos(dir) * off;
      if (inside(sq, x, y) || roadGap(x, y) < ROADS[r].width / 2 + 1) continue;
      out.push({ kind: 'signpost', x, y, yaw: dir });
    }
  }
  return out;
}

function nearSquare(x: number, y: number): boolean {
  return Math.abs(x - VILLAGE.x) <= VILLAGE.half + 1.5 && Math.abs(y - VILLAGE.y) <= VILLAGE.half + 1.5;
}

/** The great oak, alone. */
export function greatOak(): Piece {
  return { kind: 'broadleaf', x: GREAT_OAK.x, y: GREAT_OAK.y, yaw: 0.8, scale: GREAT_OAK.scale };
}

/**
 * Whether the scatter leaves a point clear: the orchard, the hay meadow, the
 * great oak's clearing, the windmill's knoll top and the ring of stones.
 */
export function cleared(px: number, py: number): boolean {
  const { x, y, across, rows, spacing } = ORCHARD;
  if (px > x - 3 && px < x + across * spacing + 1 && py > y - 3 && py < y + rows * spacing + 1) return true;
  const m = HAY_MEADOW;
  if (px > m.x - 1 && px < m.x + m.w + 1 && py > m.y - 1 && py < m.y + m.h + 1) return true;
  if ((px - GREAT_OAK.x) ** 2 + (py - GREAT_OAK.y) ** 2 < GREAT_OAK.clearing ** 2) return true;
  if ((px - WINDMILL.x) ** 2 + (py - WINDMILL.y) ** 2 < 64) return true;
  const stones = RUINS.find((r) => r.name === 'standing stones');
  return stones !== undefined && (px - stones.x) ** 2 + (py - stones.y) ** 2 < 100;
}

/** A ford's run of road under water, as the layout's tiles along a road's line, and its half width. */
export interface FordRun {
  line: Float64Array;
  half: number;
  from: number;
  to: number;
}

/**
 * Marks for a ford: a line of stepping stones a pace apart along the
 * road's line where it is under water, and a post on each bank
 * either side of the road, where the water begins. `wet` says whether the
 * ground at a point in tiles is under water.
 */
export function fordMarks(run: FordRun, wet: (px: number, py: number) => boolean): Piece[] {
  const out: Piece[] = [];
  const { line, half, from, to } = run;
  const at = (i: number) => {
    const k = Math.max(1, Math.min(line.length / 2 - 2, i));
    const x = line[2 * k],
      y = line[2 * k + 1];
    const dir = Math.atan2(line[2 * k + 3] - line[2 * k - 1], line[2 * k + 2] - line[2 * k - 2]);
    return { x, y, dir };
  };
  for (let i = from; i <= to; i++) {
    const { x, y, dir } = at(i);
    // on the road's own line, a hand's breadth either side of it in turn, so they read as the road's way over
    const off = 0.12 * ((i % 2) * 2 - 1);
    const sx = x - Math.sin(dir) * off,
      sy = y + Math.cos(dir) * off;
    if (wet(sx, sy))
      out.push({ kind: 'stepping', x: sx, y: sy, yaw: dir + 0.4 * ((i % 3) - 1), scale: 0.9 + 0.1 * (i % 2) });
  }
  // the posts: from each end of the run, outward along the road to the first dry ground
  for (const [i0, step] of [
    [from, -1],
    [to, 1],
  ]) {
    for (let i = i0, k = 0; k < 6; i += step, k++) {
      const { x, y, dir } = at(i);
      const off = half + 0.7;
      const left = [x - Math.sin(dir) * off, y + Math.cos(dir) * off],
        right = [x + Math.sin(dir) * off, y - Math.cos(dir) * off];
      if (wet(left[0], left[1]) || wet(right[0], right[1])) continue;
      out.push(
        { kind: 'post', x: left[0], y: left[1], yaw: dir },
        { kind: 'post', x: right[0], y: right[1], yaw: dir },
      );
      break;
    }
  }
  return out;
}

/** Lilies in every pool: a few set about each puddle's middle, where the water is still and shallow. */
export function poolLilies(): Piece[] {
  const out: Piece[] = [];
  for (const [x, y, r] of PUDDLES)
    for (const [u, v] of [
      [0, 0],
      [0.45, 0.25],
      [-0.3, 0.4],
      [0.1, -0.45],
    ])
      out.push({ kind: 'lily', x: x + u * r, y: y + v * r, yaw: (x + u) * 1.3, scale: 0.8 + 0.1 * ((x + y) % 3) });
  return out;
}
