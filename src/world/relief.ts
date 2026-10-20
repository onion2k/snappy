/**
 * The ground's shape, one height a tile: the land's roll, the hills, the
 * mountains round the edge, the water cut into it, the village and the ruins
 * levelled, the roads graded, and last the limit the physics puts on it,
 * that tiles side by side differ by no more than half a tile. Then the
 * steps: the rock ledges, which are the one thing the smooth ground cannot
 * be, a sheer face.
 *
 * Heights are worked in a Float64Array of tiles and handed back as the
 * map's Float32Array, so nothing rounds part way through. Every position is
 * in tiles, as the layout is.
 */
import { clamp, curve, frame, lerp, lineField, smoothstep } from './geometry';
import {
  COLS,
  FORDS,
  HILLS,
  LAKES,
  LEDGES,
  MARSH,
  PUDDLES,
  RIVER,
  ROADS,
  ROWS,
  RUINS,
  SCARPS,
  VILLAGE,
  WATER_LEVEL,
  type Hill,
  type RoadPlan,
  type WaterShape,
} from './layout';
import { fbm, noise, ridged } from './noise';
import { TILE } from './types';

const W = WATER_LEVEL;
/** Neighbours may differ by half a tile; this stays a hair under it, so a Float32's rounding cannot tip it over. */
export const STEEPEST = TILE / 2 - 0.05;
/** The bed of a ford, under the water level: shallow enough to drive, deep enough to be water. */
export const FORD_BED = W - 0.55;

/** The water as fields over the tiles: how far each is from the nearest shore, and which body that is. */
export interface WaterField {
  /** Tiles from the nearest shore: below nought in the water, above it on land. */
  shore: Float32Array;
  /** Which body is nearest: 0 the river, then each lake in `LAKES` from 1, then each of the `PUDDLES`. */
  body: Uint8Array;
  /** Tiles from the river's middle line, or Infinity far from it. */
  river: Float32Array;
  /** Tiles from the edge of the river's deep channel: below nought inside it, Infinity away from the river. */
  channel: Float32Array;
}

export interface RoadLine {
  name: string;
  /** Half the road's width, in tiles. */
  half: number;
  /** The dense line through its middle, in tiles. */
  line: Float64Array;
  /** The graded height along it, one a point of `line`. */
  profile: Float64Array;
  /** 1 where the road is under water: a ford. */
  ford: Uint8Array;
}

export interface Relief {
  terrain: Float64Array;
  steps: Float64Array;
  water: WaterField;
  roads: RoadLine[];
  /** Tiles from the nearest road's middle, and which road and point that is (`road * 65536 + point`). */
  roadDist: Float32Array;
  roadNear: Int32Array;
  /** How much of each tile is mountain, 0 to 1: the rock rises where it is high. */
  mountain: Float32Array;
}

const n = COLS * ROWS;

/** The river's line, made once. */
export const RIVER_LINE = curve(RIVER.points);

/** The bed and the bank across a body of water, at `s` tiles from its shore (below nought in the water). */
export function waterProfile(s: number, shape: WaterShape): number {
  // past its reach the shore climbs away steeply, so the land there is left as it was
  if (s >= 0) return W + 0.3 + shape.shore * s + 1.2 * Math.max(0, s - shape.reach);
  const depth = -s;
  if (depth <= shape.shelf) return W - 0.15 - 0.6 * (depth / shape.shelf);
  return lerp(W - 0.75, shape.deep, smoothstep(shape.shelf, shape.shelf + 2.5, depth));
}

/** A puddle's shape: shallow all through, too shallow to stop the rover, with a muddy rim. */
export const PUDDLE: WaterShape = { shelf: 3, deep: W - 0.7, shore: 0.5, reach: 3 };

/** Where along the river's line each ford is, as the index of the line's nearest point. */
export function fordIndices(): number[] {
  return FORDS.map((f) => {
    let best = 0,
      bestD = Infinity;
    for (let i = 0; i < RIVER_LINE.length; i += 2) {
      const d = (RIVER_LINE[i] - f.near[0]) ** 2 + (RIVER_LINE[i + 1] - f.near[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i / 2;
      }
    }
    return best;
  });
}

/**
 * Half the width of the river's deep channel at a point along it: most of
 * the river's own half-width, swelling and narrowing as it goes, and
 * narrowing to nothing over the last fifteen tiles before each ford, so the
 * deep water tapers into the shallows there and does not stop short.
 */
export function channelHalf(seed: number, i: number, half: number, fords: readonly number[]): number {
  let near = Infinity;
  for (const f of fords) near = Math.min(near, Math.abs(i - f));
  const swell = 1 + 0.28 * noise(seed + 12, i / 22, 0.5);
  return Math.max(0, (half - 1.3) * swell * smoothstep(4, 18, near));
}

/**
 * The river, the lakes and the puddles as distances from their shores, and
 * the river's deep channel as its own outline inside its banks: it wanders
 * from one side to the other as the river bends, its edge is ragged, and it
 * tapers into each ford.
 */
export function waterField(seed: number): WaterField {
  const shore = new Float32Array(n).fill(Infinity);
  const body = new Uint8Array(n);
  const river = new Float32Array(n).fill(Infinity);
  const channel = new Float32Array(n).fill(Infinity);
  const near = new Int32Array(n).fill(-1);
  lineField(COLS, ROWS, RIVER_LINE, 60, river, near);
  const points = RIVER_LINE.length / 2;
  const fords = fordIndices();
  for (let t = 0; t < n; t++) {
    if (near[t] < 0) continue;
    // the river widens as it goes, and its banks wander a little
    const i = near[t] & 0xffff;
    const along = i / (points - 1);
    const tx = t % COLS,
      ty = (t / COLS) | 0;
    const half = lerp(RIVER.halfWidth[0], RIVER.halfWidth[1], along) + 0.8 * noise(seed + 11, tx / 9, ty / 9);
    shore[t] = river[t] - half;
    if (shore[t] > 1) continue;
    // which side of the line the tile is on, by the line's way at its nearest point
    const a = Math.max(0, i - 1),
      b = Math.min(points - 1, i + 1);
    const dx = RIVER_LINE[2 * b] - RIVER_LINE[2 * a],
      dy = RIVER_LINE[2 * b + 1] - RIVER_LINE[2 * a + 1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const side = (dx * (ty + 0.5 - RIVER_LINE[2 * i + 1]) - dy * (tx + 0.5 - RIVER_LINE[2 * i])) / len;
    const core = channelHalf(seed, i, lerp(RIVER.halfWidth[0], RIVER.halfWidth[1], along), fords);
    const drift = 0.4 * core * noise(seed + 13, i / 30, 1.5);
    channel[t] = Math.abs(side - drift) - core + 0.45 * noise(seed + 14, tx / 4, ty / 4);
  }
  for (let l = 0; l < LAKES.length; l++) {
    const lake = LAKES[l];
    for (let ty = 0; ty < ROWS; ty++)
      for (let tx = 0; tx < COLS; tx++) {
        const px = tx + 0.5,
          py = ty + 0.5;
        let s = Infinity;
        for (const [cx, cy, r] of lake.discs) s = Math.min(s, Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - r);
        if (s > 40) continue;
        s += lake.ragged * fbm(seed + 31 + l, px / 14, py / 14, 2);
        const t = ty * COLS + tx;
        if (s < shore[t]) {
          shore[t] = s;
          body[t] = l + 1;
        }
      }
  }
  for (let k = 0; k < PUDDLES.length; k++) {
    const [cx, cy, r] = PUDDLES[k];
    // out past the wetland's reach, so the shore's distance runs on smoothly where a puddle stops being nearest
    const reach = r + 24;
    for (let ty = Math.max(0, Math.floor(cy - reach)); ty <= Math.min(ROWS - 1, cy + reach); ty++)
      for (let tx = Math.max(0, Math.floor(cx - reach)); tx <= Math.min(COLS - 1, cx + reach); tx++) {
        const px = tx + 0.5,
          py = ty + 0.5;
        const s = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - r + 0.8 * noise(seed + 41 + k, px / 2.5, py / 2.5);
        const t = ty * COLS + tx;
        if (s < shore[t]) {
          shore[t] = s;
          body[t] = LAKES.length + 1 + k;
        }
      }
  }
  return { shore, body, river, channel };
}

/** The shape a body of water gives its bed and its banks. */
export function shapeOf(body: number): WaterShape {
  return body === 0 ? RIVER.water : body <= LAKES.length ? LAKES[body - 1].water : PUDDLE;
}

/**
 * The river's bed at a point: shallow from each bank, falling into its
 * deep channel where there is one, and never deep within a tile of its bank,
 * so the river is shallow along both its edges.
 */
export function riverBed(s: number, channel: number): number {
  const shape = RIVER.water;
  if (s >= 0) return waterProfile(s, shape);
  const shelf = W - 0.15 - 0.6 * Math.min(1, -s / shape.shelf);
  return lerp(shelf, shape.deep, smoothstep(0.2, 1.8, -channel) * smoothstep(0.5, 1.8, -s));
}

/** A hill's own height at a point, before it is added to the land. */
export function hillAt(hill: Hill, px: number, py: number): number {
  const dx = px - hill.x,
    dy = py - hill.y;
  const r = Math.sqrt(dx * dx + dy * dy);
  let radius = hill.radius,
    lean = 0;
  const along = (dir: readonly [number, number]) => {
    const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
    return r > 0 ? (dx * dir[0] + dy * dir[1]) / (r * len) : 0;
  };
  if (hill.steep) {
    const k = Math.max(0, along(hill.steep.toward));
    radius *= lerp(1, hill.steep.share, k * k);
  }
  const h = hill.peak * smoothstep(radius, 0, r);
  if (!hill.terraces) return h;
  lean = smoothstep(hill.terraces.spread - 0.25, hill.terraces.spread + 0.25, along(hill.terraces.toward));
  return lerp(h, terrace(h, hill.terraces.spacing), lean * smoothstep(2, 8, r));
}

/**
 * Cut flat shelves and steep risers into a height, every `spacing` units: a
 * shelf keeps an eighth of the slope it had, and the riser takes the rest,
 * steeper than the rover climbs wherever the hill under it is more than gentle.
 */
export function terrace(h: number, spacing: number): number {
  const k = Math.floor(h / spacing),
    f = h / spacing - k;
  return (k + 0.12 * f + 0.88 * smoothstep(0.62, 1, f)) * spacing;
}

/** A scarp's height at a point: its front, its top, the back it eases down, and its tapered ends. */
export function scarpAt(s: (typeof SCARPS)[number], px: number, py: number, scratch: Float64Array): number {
  frame(s.a[0], s.a[1], s.b[0], s.b[1], px, py, scratch);
  const u = scratch[0],
    v = scratch[1];
  if (v <= 0) return 0;
  const len = Math.sqrt((s.b[0] - s.a[0]) ** 2 + (s.b[1] - s.a[1]) ** 2);
  const rise = smoothstep(0, s.front, v) * smoothstep(s.front + s.depth + 10, s.front + s.depth, v);
  const ends = smoothstep(-s.taper, 0, u) * smoothstep(len + s.taper, len, u);
  return s.height * rise * ends;
}

/**
 * A ledge's step at a point: its full height from the face back to its
 * depth, and less by the same share each tile over its taper at the ends
 * and the back, so each step there is one the rover rolls over.
 */
export function ledgeAt(l: (typeof LEDGES)[number], px: number, py: number, scratch: Float64Array): number {
  frame(l.a[0], l.a[1], l.b[0], l.b[1], px, py, scratch);
  const u = scratch[0],
    v = scratch[1];
  if (v < 0) return 0;
  const len = Math.sqrt((l.b[0] - l.a[0]) ** 2 + (l.b[1] - l.a[1]) ** 2);
  const ends = clamp(Math.min(u, len - u) / l.taper + 1, 0, 1);
  const back = clamp((l.depth + l.taper - v) / l.taper, 0, 1);
  // a whole number of steps, so the quantum each tile goes down by is the same on every tile of the taper
  return Math.round(l.height * ends * back * 4) / 4;
}

/** The land before the water is cut: its roll, its valley, its hills, its scarps and the mountains round it. */
export function land(seed: number, water: WaterField, terrain: Float64Array, mountain: Float32Array): void {
  const scratch = new Float64Array(2);
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const t = ty * COLS + tx,
        px = tx + 0.5,
        py = ty + 0.5;
      // the broad roll, warped so no hill sits on a lattice
      const wx = px + 12 * noise(seed + 1, px / 50, py / 50),
        wy = py + 12 * noise(seed + 2, px / 50, py / 50);
      let h = 6 + 5 * fbm(seed + 3, wx / 64, wy / 64, 3) + 1.6 * fbm(seed + 4, px / 16, py / 16, 2);
      h += 0.35 * noise(seed + 5, px / 4, py / 4);
      // the river's valley: the land falls toward it over fifty tiles
      const river = Math.min(water.river[t], 60);
      h += 6 * smoothstep(0, 55, river) - 2;
      for (const hill of HILLS) h += hillAt(hill, px, py);
      for (const s of SCARPS) h += scarpAt(s, px, py, scratch);
      // the marsh: the ground eased down to lie flat and low, just clear of the water
      const marsh = Math.sqrt((px - MARSH.x) ** 2 + (py - MARSH.y) ** 2);
      h = lerp(
        h,
        W + MARSH.level + 0.25 * noise(seed + 15, px / 5, py / 5),
        smoothstep(MARSH.radius + 12, MARSH.radius - 2, marsh),
      );
      // the mountains: up from a foot that wanders, to rock at the edge
      const edge = Math.min(px, py, COLS - px, ROWS - py);
      // spurs: where the ridged noise crests, the mountain reaches further in
      const spur = Math.max(0, ridged(seed + 9, px / 34, py / 34, 2) - 0.55);
      const reach = edge + 15 * fbm(seed + 6, px / 46, py / 46, 3) + 4 * noise(seed + 8, px / 11, py / 11) - 30 * spur;
      const m = smoothstep(32, 3, reach);
      mountain[t] = m;
      h += m * m * (70 + 26 * ridged(seed + 7, px / 30, py / 30, 3));
      terrain[t] = Math.max(h, W + 1.2);
    }
}

/** The water cut into the land: no bank is left higher than the body's own shore would have it. */
export function carve(water: WaterField, terrain: Float64Array): void {
  for (let t = 0; t < n; t++) {
    const s = water.shore[t];
    if (s > 40) continue;
    const bed = water.body[t] === 0 ? riverBed(s, water.channel[t]) : waterProfile(s, shapeOf(water.body[t]));
    terrain[t] = Math.min(terrain[t], bed);
  }
}

/** Ease the ground toward `level` within `inner` tiles of a point, and back to itself by `outer`. */
export function level(terrain: Float64Array, x: number, y: number, inner: number, outer: number, to: number): void {
  const x0 = Math.max(0, Math.floor(x - outer)),
    x1 = Math.min(COLS - 1, Math.ceil(x + outer)),
    y0 = Math.max(0, Math.floor(y - outer)),
    y1 = Math.min(ROWS - 1, Math.ceil(y + outer));
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const d = Math.sqrt((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2);
      const t = ty * COLS + tx;
      terrain[t] = lerp(terrain[t], to, smoothstep(outer, inner, d));
    }
}

/** The mean height of the tiles whose middles lie within `r` tiles of a point. */
export function meanWithin(terrain: Float64Array, x: number, y: number, r: number): number {
  let sum = 0,
    count = 0;
  for (let ty = Math.max(0, Math.floor(y - r)); ty <= Math.min(ROWS - 1, Math.ceil(y + r)); ty++)
    for (let tx = Math.max(0, Math.floor(x - r)); tx <= Math.min(COLS - 1, Math.ceil(x + r)); tx++)
      if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r * r) {
        sum += terrain[ty * COLS + tx];
        count++;
      }
  return sum / count;
}

/** The height between tile middles, read as a plane from the four round a point. */
export function bilinear(terrain: Float64Array, px: number, py: number): number {
  const u = clamp(px - 0.5, 0, COLS - 1.001),
    v = clamp(py - 0.5, 0, ROWS - 1.001);
  const ix = Math.floor(u),
    iy = Math.floor(v);
  const fx = u - ix,
    fy = v - iy;
  const t = iy * COLS + ix;
  const a = lerp(terrain[t], terrain[t + 1], fx),
    b = lerp(terrain[t + COLS], terrain[t + COLS + 1], fx);
  return lerp(a, b, fy);
}

/**
 * Each road's height along it: the ground it runs over, averaged so the
 * bumps go, held to a grade the rover drives up easily, and laid at a
 * ford's depth wherever it meets water. A ford is a point the grade must
 * meet, so the approaches are eased down to it and the bed is never left
 * dry or deep.
 */
export function profileOf(terrain: Float64Array, line: Float64Array): { profile: Float64Array; ford: Uint8Array } {
  const points = line.length / 2;
  const raw = new Float64Array(points),
    ford = new Uint8Array(points);
  for (let i = 0; i < points; i++) {
    raw[i] = bilinear(terrain, line[2 * i], line[2 * i + 1]);
    if (raw[i] < W - 0.1) ford[i] = 1;
  }
  // a ford runs a little past where the water starts, so the road meets the bank at the water's edge
  const wet = Uint8Array.from(ford);
  for (let i = 0; i < points; i++)
    if (wet[i]) for (let j = Math.max(0, i - 2); j <= Math.min(points - 1, i + 2); j++) ford[j] = 1;
  const profile = new Float64Array(points);
  // A road's ends are held at the ground they arrive at, so a road that ends at a ruin's floor or joins
  // another road meets it level; an average there, taken from one side only, would fall short of a hilltop.
  const held = new Uint8Array(points);
  const window = 6;
  for (let i = 0; i < points; i++) {
    let sum = 0,
      count = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(points - 1, i + window); j++) {
      sum += raw[j];
      count++;
    }
    held[i] = ford[i] || i < 2 || i >= points - 2 ? 1 : 0;
    profile[i] = ford[i] ? FORD_BED : held[i] ? raw[i] : Math.max(sum / count, W + 0.4);
  }
  // the steepest a road climbs, units a tile: about 12 degrees, well inside what the rover can
  const grade = 1.3;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < points; i++)
      if (!held[i]) profile[i] = clamp(profile[i], profile[i - 1] - grade, profile[i - 1] + grade);
    for (let i = points - 2; i >= 0; i--)
      if (!held[i]) profile[i] = clamp(profile[i], profile[i + 1] - grade, profile[i + 1] + grade);
  }
  return { profile, ford };
}

/** Lay each road onto the ground in turn, so a road that meets another meets it at the height it was laid. */
export function gradeRoads(
  terrain: Float64Array,
  plans: readonly RoadPlan[],
  roadDist: Float32Array,
  roadNear: Int32Array,
): RoadLine[] {
  const lines: RoadLine[] = [];
  const dist = new Float32Array(n),
    near = new Int32Array(n);
  for (let r = 0; r < plans.length; r++) {
    const plan = plans[r];
    const line = curve(plan.points);
    const { profile, ford } = profileOf(terrain, line);
    const half = plan.width / 2;
    dist.fill(Infinity);
    near.fill(-1);
    lineField(COLS, ROWS, line, half + 8, dist, near, r);
    for (let t = 0; t < n; t++) {
      if (near[t] < 0) continue;
      const i = near[t] & 0xffff;
      // a ford is laid wider than its road, so its bed is shallow from bank to bank and not only under the wheels
      const inner = half + (ford[i] ? 3.5 : 0.8);
      const w = smoothstep(inner + 4, inner, dist[t]);
      terrain[t] = lerp(terrain[t], profile[i], w);
      if (dist[t] < roadDist[t]) {
        roadDist[t] = dist[t];
        roadNear[t] = near[t];
      }
    }
    lines.push({ name: plan.name, half, line, profile, ford });
  }
  return lines;
}

/**
 * Hold every tile to within `STEEPEST` of its neighbours, lowering the
 * higher and never raising the lower, so the water stays as deep as it was
 * cut and a mountain beside a gorge is worn back to the steepest slope the
 * physics allows. Two sweeps are exact: each tile ends as the least of every
 * tile's height plus the steepest rise over the steps between them.
 */
export function limitSlope(terrain: Float64Array): void {
  const c = STEEPEST;
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const t = ty * COLS + tx;
      if (tx > 0) terrain[t] = Math.min(terrain[t], terrain[t - 1] + c);
      if (ty > 0) terrain[t] = Math.min(terrain[t], terrain[t - COLS] + c);
    }
  for (let ty = ROWS - 1; ty >= 0; ty--)
    for (let tx = COLS - 1; tx >= 0; tx--) {
      const t = ty * COLS + tx;
      if (tx < COLS - 1) terrain[t] = Math.min(terrain[t], terrain[t + 1] + c);
      if (ty < ROWS - 1) terrain[t] = Math.min(terrain[t], terrain[t + COLS] + c);
    }
}

/**
 * Fill any hollow below the water level that is not part of a lake, a pond
 * or the river: one level of water makes every dip below it a puddle, and a
 * puddle nobody laid is a bug. Returns how many tiles were filled.
 */
export function fillHollows(terrain: Float64Array, water: WaterField): number {
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let filled = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] || terrain[s] >= W) continue;
    // gather the hollow, and whether any of it is water that was laid
    let head = 0,
      tail = 0,
      laid = false;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const t = queue[head++];
      if (water.shore[t] < 0.5) laid = true;
      const tx = t % COLS;
      for (const u of [tx > 0 ? t - 1 : -1, tx < COLS - 1 ? t + 1 : -1, t - COLS, t + COLS])
        if (u >= 0 && u < n && !seen[u] && terrain[u] < W) {
          seen[u] = 1;
          queue[tail++] = u;
        }
    }
    if (laid) continue;
    for (let i = 0; i < tail; i++) terrain[queue[i]] = W + 0.25;
    filled += tail;
  }
  return filled;
}

/** The ledges, as steps: rock proud of the ground, a face on one side and a way up round the others. */
export function ledges(steps: Float64Array): void {
  const scratch = new Float64Array(2);
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++)
      for (const l of LEDGES) {
        const s = ledgeAt(l, tx + 0.5, ty + 0.5, scratch);
        const t = ty * COLS + tx;
        if (s > steps[t]) steps[t] = s;
      }
}

/**
 * The whole relief: land, water, the village and ruins levelled, the roads
 * and the `paths` laid after them, the limit, the hollows, the ledges.
 */
export function relief(seed: number, paths: readonly RoadPlan[] = []): Relief {
  const terrain = new Float64Array(n),
    steps = new Float64Array(n),
    mountain = new Float32Array(n);
  const water = waterField(seed);
  land(seed, water, terrain, mountain);
  carve(water, terrain);
  level(terrain, VILLAGE.x, VILLAGE.y, VILLAGE.half + 9, VILLAGE.half + 22, VILLAGE.level);
  // each ruin's floor is laid at the mean of the ground under it, not its top, so it is cut into a hilltop
  // and built up on its fall, and the floor's edge never stands as a bank all round it
  for (const ruin of RUINS)
    if (ruin.floor > 0)
      level(terrain, ruin.x, ruin.y, ruin.floor, ruin.floor + 7, meanWithin(terrain, ruin.x, ruin.y, ruin.floor));
  const roadDist = new Float32Array(n).fill(Infinity),
    roadNear = new Int32Array(n).fill(-1);
  const roads = gradeRoads(terrain, [...ROADS, ...paths], roadDist, roadNear);
  limitSlope(terrain);
  fillHollows(terrain, water);
  limitSlope(terrain);
  ledges(steps);
  return { terrain, steps, water, roads, roadDist, roadNear, mountain };
}
