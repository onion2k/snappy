/**
 * What covers the ground, once its shape is made: which biome each tile
 * belongs to and how much, what it is underfoot, and where bare rock breaks
 * through. The biomes are blended, so a pine wood thins into meadow over a
 * few tens of metres and not at a line; the surfaces are not, since a wheel
 * is on dirt or on grass and nothing between.
 */
import { clamp, smoothstep } from './geometry';
import { BIOME_DISCS, COLS, LAKES, MARSH, ROWS, RUINS, VILLAGE, WATER_LEVEL } from './layout';
import { fbm, noise, ridged } from './noise';
import { inside } from './plaza';
import type { Relief } from './relief';
import { BIOME, BIOMES, SURFACE } from './types';

const n = COLS * ROWS;
const W = WATER_LEVEL;

/**
 * Turn shares that are any size into bytes that sum to exactly 255: each
 * gets its share rounded down, and what is left goes to the largest
 * remainders, so no tile is short by the rounding and none is over.
 */
export function toBytes(shares: Float64Array, out: Uint8Array, at: number): void {
  let total = 0;
  for (let b = 0; b < BIOMES; b++) total += shares[b];
  if (total <= 0) {
    for (let b = 0; b < BIOMES; b++) out[at + b] = b === BIOME.meadow ? 255 : 0;
    return;
  }
  let given = 0;
  for (let b = 0; b < BIOMES; b++) {
    const v = Math.floor((shares[b] / total) * 255);
    out[at + b] = v;
    given += v;
  }
  // the leftover, a unit at a time, to the largest remainders, the first of equals winning
  while (given < 255) {
    let best = 0,
      bestRem = -1;
    for (let b = 0; b < BIOMES; b++) {
      const rem = (shares[b] / total) * 255 - out[at + b];
      if (rem > bestRem) {
        bestRem = rem;
        best = b;
      }
    }
    out[at + best]++;
    given++;
  }
}

/** How far a wooded biome takes to come in, in tiles either side of its disc's edge: about 20 m in all. */
export const BLEND = 32;

/**
 * The heights averaged over a square `2 r + 1` tiles a side, in two sweeps
 * of a running sum: the lie of the land, without its banks.
 */
export function blur(src: Float64Array, r: number): Float64Array {
  const tmp = new Float64Array(n),
    out = new Float64Array(n);
  for (let ty = 0; ty < ROWS; ty++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[ty * COLS + clamp(k, 0, COLS - 1)];
    for (let tx = 0; tx < COLS; tx++) {
      tmp[ty * COLS + tx] = sum / (2 * r + 1);
      sum += src[ty * COLS + clamp(tx + r + 1, 0, COLS - 1)] - src[ty * COLS + clamp(tx - r, 0, COLS - 1)];
    }
  }
  for (let tx = 0; tx < COLS; tx++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, ROWS - 1) * COLS + tx];
    for (let ty = 0; ty < ROWS; ty++) {
      out[ty * COLS + tx] = sum / (2 * r + 1);
      sum += tmp[clamp(ty + r + 1, 0, ROWS - 1) * COLS + tx] - tmp[clamp(ty - r, 0, ROWS - 1) * COLS + tx];
    }
  }
  return out;
}

/**
 * Each tile's share of each biome. A wooded biome is whole inside its discs
 * and comes in over `BLEND` tiles either side of their edges, which wander
 * with noise so no border is round; the wetland follows the water and the
 * low ground; the meadow is whatever is left, so between two woods there is
 * a little open country. The shares are summed to one as they are, which
 * keeps every blend as wide as it was made.
 */
export function biomes(seed: number, relief: Relief): Uint8Array {
  const out = new Uint8Array(n * BIOMES);
  const shares = new Float64Array(BIOMES);
  const { water } = relief;
  const low = blur(relief.terrain, 10);
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const t = ty * COLS + tx,
        px = tx + 0.5,
        py = ty + 0.5;
      const wx = px + 22 * fbm(seed + 41, px / 56, py / 56, 3) + 4 * noise(seed + 44, px / 15, py / 15),
        wy = py + 22 * fbm(seed + 42, px / 56, py / 56, 3) + 4 * noise(seed + 45, px / 15, py / 15);
      shares.fill(0);
      for (const { biome, discs } of BIOME_DISCS)
        for (const [cx, cy, r] of discs) {
          const d = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);
          shares[biome] = Math.max(shares[biome], smoothstep(r + BLEND, r - BLEND, d));
        }
      // the wetland: low ground near the river and the Mere, a narrower fringe by the ponds, none up a hillside
      const s = water.shore[t];
      const body = water.body[t];
      const near = body === 0 || body === 1 || body > LAKES.length ? 10 : 3;
      const wet =
        smoothstep(near + 11, near - 11, s + 4 * fbm(seed + 43, px / 20, py / 20, 2)) * smoothstep(16, 3, low[t] - W);
      shares[BIOME.wetland] = Math.max(shares[BIOME.wetland], wet);
      let most = 0;
      for (let b = 0; b < BIOMES; b++) if (b !== BIOME.meadow) most = Math.max(most, shares[b]);
      shares[BIOME.meadow] = Math.max(0.02, 1 - most);
      toBytes(shares, out, t * BIOMES);
    }
  return out;
}

/** The share, 0 to 1, a tile has of a biome. */
export function share(biomeBytes: Uint8Array, t: number, biome: number): number {
  return biomeBytes[t * BIOMES + biome] / 255;
}

/** The biome with the biggest share of a tile: the one that picks its trees' palette. */
export function strongest(biomeBytes: Uint8Array, t: number): number {
  let best = 0;
  for (let b = 1; b < BIOMES; b++) if (biomeBytes[t * BIOMES + b] > biomeBytes[t * BIOMES + best]) best = b;
  return best;
}

/** Whether a tile is within `r` tiles of a point. */
function within(tx: number, ty: number, x: number, y: number, r: number): boolean {
  return (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r * r;
}

/**
 * Where bare rock stands: the mountains' high ground and their crest at
 * the world's edge, tors on the heath, and crags on the steepest banks. It
 * is solid to the rover, and stands proud of the ground by its step. None
 * is laid on a road, in the water, at the village or at a ruin.
 */
export function rock(seed: number, relief: Relief, biomeBytes: Uint8Array, solid: Uint8Array): void {
  const { terrain, steps, water, roadDist, mountain } = relief;
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const t = ty * COLS + tx,
        px = tx + 0.5,
        py = ty + 0.5;
      const edge = Math.min(tx, ty, COLS - 1 - tx, ROWS - 1 - ty);
      const wet = terrain[t] < W + 0.2;
      // the crest round the world: rock, unless it is the Mere or the gorge where they are deep enough to be a wall
      if (edge < 3 && terrain[t] > W - 1.6) {
        solid[t] = 1;
        steps[t] = 2 + 8 * ridged(seed + 51, px / 9, py / 9, 2);
        continue;
      }
      if (wet || roadDist[t] < 6) continue;
      if (within(tx, ty, VILLAGE.x, VILLAGE.y, 32)) continue;
      if (RUINS.some((r) => within(tx, ty, r.x, r.y, r.floor + 6))) continue;
      const crag = ridged(seed + 52, px / 13, py / 13, 3);
      // the mountain's upper slopes break out in rock, more of it the higher it goes
      if (mountain[t] > 0.45 && crag + mountain[t] * 0.6 > 1.05) {
        solid[t] = 1;
        steps[t] = 3 + 9 * crag;
        continue;
      }
      // the steepest banks show rock at their faces
      const tx1 = Math.min(COLS - 1, tx + 1),
        ty1 = Math.min(ROWS - 1, ty + 1);
      const grade = Math.max(
        Math.abs(terrain[ty * COLS + tx1] - terrain[t]),
        Math.abs(terrain[ty1 * COLS + tx] - terrain[t]),
      );
      if (grade > 2.7 && crag > 0.6 && water.shore[t] > 3) {
        solid[t] = 1;
        steps[t] = 1.5 + 4 * crag;
        continue;
      }
      // tors on the heath: knots of rock where the ridges cross, out on the open heath and not at the mountains'
      // foot, where a tor beside the slope pinches a gap too narrow to turn in
      const heath = share(biomeBytes, t, BIOME.heath);
      if (heath > 0.6 && crag > 0.86 && mountain[t] < 0.02 && noise(seed + 53, px / 7, py / 7) > 0.15) {
        solid[t] = 1;
        steps[t] = 2 + 7 * clamp((crag - 0.86) * 8, 0, 1);
      }
    }
}

/**
 * The rise to a tile's steepest neighbour, in units, above which a tile is
 * a face: a little under what the rover's 22 degrees allow over a tile, so
 * the bare band covers the whole of a bank and not only its middle.
 */
export const FACE = 2.3;
/** A step above a neighbour this tall, in units, is a ledge's lip, a little over the edge the rover rolls over. */
export const LIP = 1.2;

/** The greatest rise from a tile to any of its four neighbours. */
export function steepest(terrain: Float64Array, tx: number, ty: number): number {
  const h = terrain[ty * COLS + tx];
  let most = 0;
  if (tx > 0) most = Math.max(most, Math.abs(terrain[ty * COLS + tx - 1] - h));
  if (tx < COLS - 1) most = Math.max(most, Math.abs(terrain[ty * COLS + tx + 1] - h));
  if (ty > 0) most = Math.max(most, Math.abs(terrain[(ty - 1) * COLS + tx] - h));
  if (ty < ROWS - 1) most = Math.max(most, Math.abs(terrain[(ty + 1) * COLS + tx] - h));
  return most;
}

/** How far a tile's step stands above its lowest neighbour's: a ledge's lip where it is tall. */
export function lip(steps: Float64Array, tx: number, ty: number): number {
  const s = steps[ty * COLS + tx];
  let low = s;
  if (tx > 0) low = Math.min(low, steps[ty * COLS + tx - 1]);
  if (tx < COLS - 1) low = Math.min(low, steps[ty * COLS + tx + 1]);
  if (ty > 0) low = Math.min(low, steps[(ty - 1) * COLS + tx]);
  if (ty < ROWS - 1) low = Math.min(low, steps[(ty + 1) * COLS + tx]);
  return s - low;
}

function inMarsh(px: number, py: number): boolean {
  return (px - MARSH.x) ** 2 + (py - MARSH.y) ** 2 < MARSH.radius ** 2;
}

/**
 * What each tile is underfoot. Rock is stone; the plazas, the village square
 * and the ruins' floors, are stone, out to their outlines; the roads are
 * dirt and their fords stone; the shores of the Mere and the river are
 * sand, and mud where the wetland is thick, as are the puddles' rims and
 * patches through the wetland. The sand and the mud come and go by a broad
 * noise, so they lie in blobs and not in tile-sized squares, and a lone tile
 * of either, with no like neighbour, is given back to the grass; the
 * marsh is mud flats more than not. A bank's face and a ledge's lip are
 * bare stone, so what cannot be climbed looks it.
 */
export function surfaces(
  seed: number,
  relief: Relief,
  biomeBytes: Uint8Array,
  solid: Uint8Array,
  plazas: readonly Float64Array[],
): Uint8Array {
  const out = new Uint8Array(n);
  const { terrain, water, roads, roadDist, roadNear } = relief;
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const t = ty * COLS + tx,
        px = tx + 0.5,
        py = ty + 0.5;
      let s: number = SURFACE.grass;
      const h = terrain[t];
      const shore = water.shore[t];
      const body = water.body[t];
      const big = body <= 1;
      const puddle = body > LAKES.length;
      const wetland = share(biomeBytes, t, BIOME.wetland);
      const patch = fbm(seed + 61, px / 9, py / 9, 2);
      if (big && shore < 2.5 + 3 * patch && h < W + 2.2) s = wetland > 0.6 && patch > 0.05 ? SURFACE.mud : SURFACE.sand;
      else if (puddle && shore < 1.5 + 2 * patch) s = SURFACE.mud;
      else if (!big && !puddle && shore < 1 + 2 * patch && h < W + 1) s = SURFACE.sand;
      else if (wetland > 0.55 && h < W + 2.5 && patch > (inMarsh(px, py) ? -0.12 : 0.12)) s = SURFACE.mud;
      // a face too steep to climb, or the lip of a ledge, shows bare: the ground says it cannot be driven up
      if (h > W + 0.3 && (steepest(terrain, tx, ty) > FACE || lip(relief.steps, tx, ty) > LIP)) s = SURFACE.stone;
      if (roadNear[t] >= 0) {
        const road = roads[roadNear[t] >> 16];
        const i = roadNear[t] & 0xffff;
        if (roadDist[t] <= road.half) s = road.ford[i] ? SURFACE.stone : SURFACE.dirt;
      }
      if (plazas.some((o) => inside(o, px, py))) s = SURFACE.stone;
      if (solid[t]) s = SURFACE.stone;
      out[t] = s;
    }
  // a lone tile of sand or mud, none of its four neighbours the same, goes back to grass
  for (let ty = 1; ty < ROWS - 1; ty++)
    for (let tx = 1; tx < COLS - 1; tx++) {
      const t = ty * COLS + tx;
      const s = out[t];
      if (s !== SURFACE.sand && s !== SURFACE.mud) continue;
      if (out[t - 1] !== s && out[t + 1] !== s && out[t - COLS] !== s && out[t + COLS] !== s) out[t] = SURFACE.grass;
    }
  return out;
}

/** The waters' names, by body: 0 is the river, then the lakes, then the puddles. */
export function bodyName(body: number): string {
  return body === 0 ? 'the river' : body <= LAKES.length ? LAKES[body - 1].name : `puddle ${body - LAKES.length}`;
}
