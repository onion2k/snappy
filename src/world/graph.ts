/**
 * The drive graph: every tile the rover fits on, joined to each of its four
 * neighbours it can drive to and back by `canTravel`, the rule the rover
 * itself moves by. The rover is not a point: it is `ROVER_HALF_WIDTH` either
 * side of its middle and turns within `ROVER_TURN`, so a tile counts only
 * where it can turn on the spot, and a link only where the drive holds
 * along its middle and along both its sides. The
 * graph is four-connected, so it never squeezes through two solid tiles
 * that meet at a corner. It is what proves the world can be explored (every
 * tile the rover fits on reached from the start), and what the autopilot
 * finds its way by.
 */
import { canTravel, standable } from './drive';
import { groundOf } from './ground';
import { memoGround } from './memo';
import { clearance } from './scatter';
import { DRIVE, SURFACE, type Ground, type WorldMap } from './types';

export interface DriveGraph {
  cols: number;
  rows: number;
  /** 1 where the rover can stand at a tile's middle. */
  stand: Uint8Array;
  /** Per tile, bit 1: joined to the tile east of it; bit 2: joined to the tile north of it. Joined is both ways. */
  links: Uint8Array;
}

export const EAST = 1;
export const NORTH = 2;

/**
 * Half the rover's width, in units: its hull is 3.5 units across. Said here
 * for the graph, from the rover's own measure; it belongs with `DRIVE`.
 */
export const ROVER_HALF_WIDTH = 1.75;

/**
 * How far round its middle the rover sweeps turning on the spot, in units:
 * the corner of a hull 2.7 long either way and 1.75 wide. A tile it cannot
 * turn round on is no place for a route to turn, or to end.
 */
export const ROVER_TURN = Math.sqrt(2.7 * 2.7 + ROVER_HALF_WIDTH * ROVER_HALF_WIDTH);

/** Whether the rover can stand and turn at a point: its middle, and its turning reach each way along both axes, standable. */
export function fits(g: Ground, x: number, y: number): boolean {
  const w = ROVER_HALF_WIDTH;
  return (
    standable(g, x, y) &&
    standable(g, x + w, y) &&
    standable(g, x - w, y) &&
    standable(g, x, y + w) &&
    standable(g, x, y - w)
  );
}

/**
 * Whether the rover drives from one point to another with room for its
 * body: `canTravel` along the line between them, and along the two lines a
 * half-width either side of it.
 */
export function clear(g: Ground, ax: number, ay: number, bx: number, by: number): boolean {
  if (!canTravel(g, ax, ay, bx, by)) return false;
  const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  if (len === 0) return fits(g, ax, ay);
  const ox = (-(by - ay) / len) * ROVER_HALF_WIDTH,
    oy = ((bx - ax) / len) * ROVER_HALF_WIDTH;
  return canTravel(g, ax + ox, ay + oy, bx + ox, by + oy) && canTravel(g, ax - ox, ay - oy, bx - ox, by - oy);
}

/** A tile's middle, in units. */
export function middle(map: WorldMap, t: number): [number, number] {
  const { cols, originX, originY, tile } = map.grid;
  return [originX + ((t % cols) + 0.5) * tile, originY + (Math.floor(t / cols) + 0.5) * tile];
}

/** The tile a point is in, or -1 off the world. */
export function tileAt(map: WorldMap, x: number, y: number): number {
  const { cols, rows, originX, originY, tile } = map.grid;
  const tx = Math.floor((x - originX) / tile),
    ty = Math.floor((y - originY) / tile);
  return tx < 0 || ty < 0 || tx >= cols || ty >= rows ? -1 : ty * cols + tx;
}

/** Which tiles the rover's body fits on, at their middles: 1 or 0 a tile. */
export function standing(map: WorldMap, ground: Ground): Uint8Array {
  const { cols, rows, originX, originY, tile } = map.grid;
  const stand = new Uint8Array(cols * rows);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++)
      stand[ty * cols + tx] = fits(ground, originX + (tx + 0.5) * tile, originY + (ty + 0.5) * tile) ? 1 : 0;
  return stand;
}

/**
 * The tiles joined to one by tiles that can be stood on, side by side: more
 * than the drive graph reaches, since it does not see a ledge between two
 * standable tiles, and so what is outside it is surely out of reach.
 */
export function spread(stand: Uint8Array, cols: number, rows: number, from: number): Uint8Array {
  const n = cols * rows;
  const seen = new Uint8Array(n);
  if (from < 0 || !stand[from]) return seen;
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  queue[tail++] = from;
  seen[from] = 1;
  while (head < tail) {
    const t = queue[head++];
    const tx = t % cols;
    for (const u of [tx > 0 ? t - 1 : -1, tx < cols - 1 ? t + 1 : -1, t - cols, t + cols])
      if (u >= 0 && u < n && stand[u] && !seen[u]) {
        seen[u] = 1;
        queue[tail++] = u;
      }
  }
  return seen;
}

/**
 * The tiles joined to one by tiles the rover fits on, side by side, where
 * the link between two is taken as given unless either is marked in
 * `check`, and then is tried both ways as the graph tries it. With nothing
 * marked it is `spread`; with everything marked it is `reach` on the drive
 * graph. Marking only the broken ground, where links fail, finds the
 * pockets there for a fraction of the graph's cost.
 */
export function spreadChecked(
  map: WorldMap,
  ground: Ground,
  stand: Uint8Array,
  check: Uint8Array,
  from: number,
): Uint8Array {
  const { cols, rows } = map.grid;
  const n = cols * rows;
  const seen = new Uint8Array(n);
  if (from < 0 || !stand[from]) return seen;
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  queue[tail++] = from;
  seen[from] = 1;
  while (head < tail) {
    const t = queue[head++];
    const tx = t % cols;
    for (const u of [tx > 0 ? t - 1 : -1, tx < cols - 1 ? t + 1 : -1, t - cols, t + cols]) {
      if (u < 0 || u >= n || !stand[u] || seen[u]) continue;
      if (check[t] || check[u]) {
        const [ax, ay] = middle(map, t),
          [bx, by] = middle(map, u);
        if (!clear(ground, ax, ay, bx, by) || !clear(ground, bx, by, ax, ay)) continue;
      }
      seen[u] = 1;
      queue[tail++] = u;
    }
  }
  void rows;
  return seen;
}

/** The graph over a map's tiles, each link tried both ways, with room for the rover's body. */
export function driveGraph(map: WorldMap, ground: Ground = memoGround(map)): DriveGraph {
  const { cols, rows } = map.grid;
  const n = cols * rows;
  const stand = standing(map, ground),
    links = new Uint8Array(n);
  const xs = new Float64Array(cols),
    ys = new Float64Array(rows);
  for (let tx = 0; tx < cols; tx++) xs[tx] = map.grid.originX + (tx + 0.5) * map.grid.tile;
  for (let ty = 0; ty < rows; ty++) ys[ty] = map.grid.originY + (ty + 0.5) * map.grid.tile;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const t = ty * cols + tx;
      if (!stand[t]) continue;
      const x = xs[tx],
        y = ys[ty];
      if (tx + 1 < cols && stand[t + 1] && clear(ground, x, y, xs[tx + 1], y) && clear(ground, xs[tx + 1], y, x, y))
        links[t] |= EAST;
      if (ty + 1 < rows && stand[t + cols] && clear(ground, x, y, x, ys[ty + 1]) && clear(ground, x, ys[ty + 1], x, y))
        links[t] |= NORTH;
    }
  return { cols, rows, stand, links };
}

const cache = new WeakMap<WorldMap, DriveGraph>();

/** The graph of a map, made once and kept with it for as long as the map is kept. */
export function graphOf(map: WorldMap): DriveGraph {
  let g = cache.get(map);
  if (!g) {
    g = driveGraph(map);
    cache.set(map, g);
  }
  return g;
}

/** Hand a map the graph made while it was being built, so it is not made again. */
export function keepGraph(map: WorldMap, graph: DriveGraph): void {
  cache.set(map, graph);
}

/** Each tile's neighbours it is joined to, written to `out`; returns how many. */
export function neighbours(g: DriveGraph, t: number, out: Int32Array): number {
  let k = 0;
  const { cols, links } = g;
  if (links[t] & EAST) out[k++] = t + 1;
  if (links[t] & NORTH) out[k++] = t + cols;
  if (t % cols > 0 && links[t - 1] & EAST) out[k++] = t - 1;
  if (t >= cols && links[t - cols] & NORTH) out[k++] = t - cols;
  return k;
}

/** Which tiles can be reached from a tile, by the links: 1 reached, 0 not. */
export function reach(g: DriveGraph, from: number): Uint8Array {
  const n = g.cols * g.rows;
  const seen = new Uint8Array(n);
  if (from < 0 || !g.stand[from]) return seen;
  const queue = new Int32Array(n),
    next = new Int32Array(4);
  let head = 0,
    tail = 0;
  queue[tail++] = from;
  seen[from] = 1;
  while (head < tail) {
    const t = queue[head++];
    const k = neighbours(g, t, next);
    for (let i = 0; i < k; i++)
      if (!seen[next[i]]) {
        seen[next[i]] = 1;
        queue[tail++] = next[i];
      }
  }
  return seen;
}

/**
 * The rover's pace over each kind of ground, units a second, as the spec
 * gives it: the road fastest, grass and stone at a drive, sand, mud and
 * shallow water slow. The route is the quickest by these and not the
 * shortest, so it keeps to the roads.
 */
export const PACE: Record<number, number> = {
  [SURFACE.dirt]: 25,
  [SURFACE.grass]: 20,
  [SURFACE.stone]: 20,
  [SURFACE.sand]: 12,
  [SURFACE.mud]: 12,
};
export const WADING = 12;
const FASTEST = 25;

/** The pace on a tile, slowed in water. */
export function paceOn(map: WorldMap, ground: Ground, t: number): number {
  const [x, y] = middle(map, t);
  if (ground.waterDepthAt(x, y) > 0) return WADING;
  return PACE[map.surface[t]];
}

/** A binary heap of tiles by cost, the least on top, over arrays sized once. */
class Heap {
  private readonly items: Int32Array;
  private readonly keys: Float64Array;
  size = 0;
  constructor(capacity: number) {
    this.items = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }
  push(item: number, key: number): void {
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.items[i] = this.items[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }
  pop(): number {
    const top = this.items[0];
    const item = this.items[--this.size],
      key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.items[i] = this.items[c];
      this.keys[i] = this.keys[c];
      i = c;
    }
    this.items[i] = item;
    this.keys[i] = key;
    return top;
  }
}

/**
 * What a link costs over its time, by how much room there is round its
 * narrower end, in tiles to ground the rover cannot stand on: a gap a tile
 * or two wide is driven, but slowly, nosing and turning, so a route takes
 * it only when there is no way round worth the time.
 */
export const TIGHT = [12, 12, 3, 1.5, 1];

const rooms = new WeakMap<DriveGraph, Uint8Array>();
const gaps = new WeakMap<DriveGraph, Uint8Array>();

/** What a link costs over its time where either end is in a gap (`narrow`): enough to go well round one, where there is a way. */
export const GAP_COST = 60;

const opens = new WeakMap<DriveGraph, DriveGraph>();

/** A graph with its gaps (`narrow`) taken out, every link into one cut, made once and kept with it. */
export function openOf(g: DriveGraph): DriveGraph {
  let open = opens.get(g);
  if (!open) {
    const tight = narrowOf(g);
    const stand = Uint8Array.from(g.stand),
      links = Uint8Array.from(g.links);
    for (let t = 0; t < stand.length; t++) {
      if (!tight[t]) continue;
      stand[t] = 0;
      links[t] = 0;
      if (t % g.cols > 0) links[t - 1] &= ~EAST;
      if (t >= g.cols) links[t - g.cols] &= ~NORTH;
    }
    open = { cols: g.cols, rows: g.rows, stand, links };
    opens.set(g, open);
  }
  return open;
}

/** The gaps of a graph, made once and kept with it. */
export function narrowOf(g: DriveGraph): Uint8Array {
  let out = gaps.get(g);
  if (!out) {
    out = narrow(g);
    gaps.set(g, out);
  }
  return out;
}

/** How many tiles each tile of a graph is from one the rover cannot stand on, to four. */
export function roomOf(g: DriveGraph): Uint8Array {
  let room = rooms.get(g);
  if (!room) {
    room = clearance(g.stand, g.cols, TIGHT.length - 1);
    rooms.set(g, room);
  }
  return room;
}

/**
 * The tiles of the quickest way from one tile to another along the graph,
 * by A*, first to last; empty when there is none. A tile's link costs the
 * time to cross it at the pace of the ground at each end, more in a tight
 * place (`TIGHT`), and much more in a gap (`GAP_COST`).
 */
export function path(map: WorldMap, g: DriveGraph, ground: Ground, from: number, to: number): number[] {
  const n = g.cols * g.rows;
  if (from < 0 || to < 0 || !g.stand[from] || !g.stand[to]) return [];
  const cost = new Float64Array(n).fill(Infinity),
    came = new Int32Array(n).fill(-1),
    done = new Uint8Array(n),
    pace = new Float64Array(n);
  const heap = new Heap(4 * n),
    next = new Int32Array(4);
  const [gx, gy] = middle(map, to);
  const tile = map.grid.tile;
  const guess = (t: number) => {
    const [x, y] = middle(map, t);
    return Math.sqrt((x - gx) ** 2 + (y - gy) ** 2) / FASTEST;
  };
  const paceAt = (t: number) => (pace[t] ||= paceOn(map, ground, t));
  const room = roomOf(g);
  const tight = narrowOf(g);
  cost[from] = 0;
  heap.push(from, guess(from));
  while (heap.size > 0) {
    const t = heap.pop();
    if (done[t]) continue;
    done[t] = 1;
    if (t === to) break;
    const k = neighbours(g, t, next);
    for (let i = 0; i < k; i++) {
      const u = next[i];
      if (done[u]) continue;
      const squeeze = tight[t] || tight[u] ? GAP_COST : TIGHT[Math.min(room[t], room[u])];
      const c = cost[t] + (tile / 2) * (1 / paceAt(t) + 1 / paceAt(u)) * squeeze;
      if (c < cost[u]) {
        cost[u] = c;
        came[u] = t;
        heap.push(u, c + guess(u));
      }
    }
  }
  if (!done[to]) return [];
  const out: number[] = [];
  for (let t = to; t >= 0; t = came[t]) out.push(t);
  return out.reverse();
}

/**
 * The way from one point to another, as waypoints x, y, x, y in units: the
 * start, the tile middles of the quickest path with the corners of its
 * staircase cut wherever the rover, body and all, could drive straight, and
 * the end. Every leg after the first is `clear`. The way keeps to open
 * ground, through no gap, wherever there is such a way.
 * Empty when either point cannot be stood on or there is no way.
 */
export function route(map: WorldMap, from: { x: number; y: number }, to: { x: number; y: number }): Float32Array {
  const g = graphOf(map),
    ground = groundOf(map);
  const a = tileAt(map, from.x, from.y),
    b = tileAt(map, to.x, to.y);
  // by open ground if there is a way, and through the gaps only if there is not
  let tiles = path(map, openOf(g), ground, a, b);
  if (tiles.length === 0) tiles = path(map, g, ground, a, b);
  if (tiles.length === 0) return new Float32Array(0);
  const points: number[] = [from.x, from.y];
  let i = 0,
    px = from.x,
    py = from.y;
  // look no further ahead than this, so a cut never leaves a road for long
  const ahead = 8;
  while (i < tiles.length - 1) {
    let j = Math.min(tiles.length - 1, i + ahead);
    for (; j > i + 1; j--) {
      const [x, y] = middle(map, tiles[j]);
      if (clear(ground, px, py, x, y) && sameGround(map, tiles, i, j)) break;
    }
    const [x, y] = middle(map, tiles[j]);
    points.push(x, y);
    px = x;
    py = y;
    i = j;
  }
  points.push(to.x, to.y);
  return Float32Array.from(points);
}

/** Whether every tile from `i` to `j` on a path is the same kind of ground, so cutting the corner keeps the pace. */
function sameGround(map: WorldMap, tiles: number[], i: number, j: number): boolean {
  const s = map.surface[tiles[i]];
  for (let k = i + 1; k <= j; k++) if (map.surface[tiles[k]] !== s) return false;
  return true;
}

/** The length of a route, in units. */
export function routeLength(points: Float32Array): number {
  let sum = 0;
  for (let i = 2; i < points.length; i += 2)
    sum += Math.sqrt((points[i] - points[i - 2]) ** 2 + (points[i + 1] - points[i - 1]) ** 2);
  return sum;
}

/** The time a route takes at the pace of the ground under each leg's middle, in seconds. */
export function routeTime(map: WorldMap, points: Float32Array): number {
  const ground = groundOf(map);
  let sum = 0;
  for (let i = 2; i < points.length; i += 2) {
    const x = (points[i] + points[i - 2]) / 2,
      y = (points[i + 1] + points[i - 1]) / 2;
    const len = Math.sqrt((points[i] - points[i - 2]) ** 2 + (points[i + 1] - points[i - 1]) ** 2);
    const t = tileAt(map, x, y);
    const pace = ground.waterDepthAt(x, y) > 0 ? WADING : PACE[map.surface[t]];
    sum += len / pace;
  }
  return sum;
}

/** The deepest water a tile's middle stands in, for a test's reading: nought when dry. */
export function depthAt(map: WorldMap, t: number): number {
  const [x, y] = middle(map, t);
  return groundOf(map).waterDepthAt(x, y);
}

/** Whether a tile's middle is deep water, which is a wall. */
export function deep(map: WorldMap, t: number): boolean {
  return depthAt(map, t) > DRIVE.shallow;
}

/**
 * The two ends of the crossing the pace is judged by: the reached tile
 * nearest the middle of the west edge, and the one nearest the middle of
 * the east edge, each with open ground four tiles round it and reached
 * through no narrow gap (`narrow`), as points in units.
 */
export function crossing(
  map: WorldMap,
  g: DriveGraph,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const { cols, rows } = g;
  // reached by the open ground alone: through no gap narrower than a turn takes
  const reached = reach(openOf(g), tileAt(map, map.start.x, map.start.y));
  const room = roomOf(g);
  let west = -1,
    east = -1,
    westD = Infinity,
    eastD = Infinity;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const t = ty * cols + tx;
      if (!reached[t] || room[t] < TIGHT.length - 1) continue;
      const dy = (ty + 0.5 - rows / 2) ** 2;
      const dw = (tx + 0.5) ** 2 + dy,
        de = (cols - tx - 0.5) ** 2 + dy;
      if (dw < westD) {
        westD = dw;
        west = t;
      }
      if (de < eastD) {
        eastD = de;
        east = t;
      }
    }
  const [wx, wy] = middle(map, west),
    [ex, ey] = middle(map, east);
  return { from: { x: wx, y: wy }, to: { x: ex, y: ey } };
}

/** How few tiles across, along a row or a column, a stretch of standable ground may be before it is a gap. */
export const GAP = 3;

/**
 * Which standable tiles lie in a gap: fewer than `GAP` standable tiles
 * across them along their row or their column. The rover gets through
 * such a place nosing and turning, so the crossing the pace is judged by
 * does not have to go through one.
 */
export function narrow(g: DriveGraph): Uint8Array {
  const { cols, stand } = g;
  const n = stand.length;
  const out = new Uint8Array(n);
  const run = (t: number, step: number, tx: number) => {
    let k = 1;
    for (let d = 1; d < GAP; d++) {
      const u = t + d * step;
      if (u >= n || (step === 1 && tx + d >= cols) || !stand[u]) break;
      k++;
    }
    for (let d = 1; d < GAP; d++) {
      const u = t - d * step;
      if (u < 0 || (step === 1 && tx - d < 0) || !stand[u]) break;
      k++;
    }
    return k;
  };
  for (let t = 0; t < n; t++) {
    if (!stand[t]) continue;
    const tx = t % cols;
    if (run(t, 1, tx) < GAP || run(t, cols, tx) < GAP) out[t] = 1;
  }
  return out;
}
