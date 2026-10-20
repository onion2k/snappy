/**
 * The scenery: trees, bushes, ferns, reeds, flowers and boulders, each kind
 * by the biomes it grows in. Each kind is tried once a cell of a jittered
 * grid, so no two crowd one another, and kept by its biomes' liking for it
 * and by a noise that gathers it into groves and patches with clearings
 * between. Nothing grows in the water, on a road, in rock or a building, by
 * the village square or the start, and no trunk or boulder stands where the
 * standable ground is narrow, so a gap the rover drives through stays open.
 */
import type { Random } from '../random';
import { smoothstep } from './geometry';
import { COLS, ROWS, RUINS, VILLAGE } from './layout';
import { fbm } from './noise';
import { cleared } from './finds';
import { strongest } from './paint';
import type { WaterField } from './relief';
import { BIOME, BIOMES, SURFACE, type Biome, type Ground, type Kind, type Placement, type WorldMap } from './types';

/** How a kind is scattered. */
interface Sowing {
  kind: Kind;
  /** The grid's cell, in tiles: one try a cell. */
  cell: number;
  /** How much each biome likes it, in `BIOME` order: meadow, pine, autumn, heath, wetland. */
  liking: readonly [number, number, number, number, number];
  /** The size of its groves or patches, in tiles, and how much of the ground they cover (0 to 1). */
  grove: number;
  cover: number;
  /** Tiles it keeps from a road's middle. */
  road: number;
  /** Whether it is a trunk or a rock the rover meets, kept off narrow ground. */
  stands: boolean;
  scale: readonly [number, number];
}

export const SOWINGS: Sowing[] = [
  {
    kind: 'conifer',
    cell: 2.2,
    liking: [0.02, 0.9, 0.08, 0.05, 0],
    grove: 26,
    cover: 0.66,
    road: 3,
    stands: true,
    scale: [0.75, 1.3],
  },
  {
    kind: 'broadleaf',
    cell: 2.45,
    liking: [0.3, 0.06, 0.9, 0.02, 0.2],
    grove: 24,
    cover: 0.62,
    road: 3,
    stands: true,
    scale: [0.8, 1.25],
  },
  {
    kind: 'willow',
    cell: 5,
    liking: [0, 0, 0, 0, 0.75],
    grove: 14,
    cover: 0.55,
    road: 3,
    stands: true,
    scale: [0.85, 1.2],
  },
  {
    kind: 'twisted',
    cell: 4.2,
    liking: [0, 0.02, 0, 0.5, 0.02],
    grove: 20,
    cover: 0.6,
    road: 2.5,
    stands: true,
    scale: [0.65, 1.1],
  },
  {
    kind: 'boulder',
    cell: 3.8,
    liking: [0.05, 0.22, 0.06, 0.5, 0.02],
    grove: 14,
    cover: 0.5,
    road: 2.2,
    stands: true,
    scale: [0.5, 1.6],
  },
  {
    kind: 'bush',
    cell: 2.8,
    liking: [0.12, 0.05, 0.3, 0.14, 0.6],
    grove: 12,
    cover: 0.5,
    road: 2,
    stands: false,
    scale: [0.7, 1.3],
  },
  {
    kind: 'fern',
    cell: 2.3,
    liking: [0, 0.5, 0.3, 0.03, 0.08],
    grove: 10,
    cover: 0.55,
    road: 1.8,
    stands: false,
    scale: [0.7, 1.3],
  },
  {
    kind: 'flowers',
    cell: 2.6,
    liking: [0.45, 0.02, 0.05, 0.3, 0.08],
    grove: 9,
    cover: 0.4,
    road: 1.8,
    stands: false,
    scale: [0.7, 1.3],
  },
];

/** How many tiles each tile is from ground the rover cannot stand on, by steps across the grid, to `cap`. */
export function clearance(stand: Uint8Array, cols: number, cap: number): Uint8Array {
  const n = stand.length;
  const out = new Uint8Array(n).fill(cap);
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let t = 0; t < n; t++)
    if (!stand[t]) {
      out[t] = 0;
      queue[tail++] = t;
    }
  while (head < tail) {
    const t = queue[head++];
    const d = out[t] + 1;
    if (d >= cap) continue;
    const tx = t % cols;
    for (const u of [tx > 0 ? t - 1 : -1, tx < cols - 1 ? t + 1 : -1, t - cols, t + cols])
      if (u >= 0 && u < n && out[u] > d) {
        out[u] = d;
        queue[tail++] = u;
      }
  }
  return out;
}

/** Whether a tile, or any of the eight round it, is solid: a building's or the rock's edge. */
function besideSolid(map: WorldMap, tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx,
        y = ty + dy;
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS && map.solid[y * COLS + x]) return true;
    }
  return false;
}

/**
 * Every scattered thing, kind by kind. Each try draws its own jitter and
 * its chance whether it is kept or not, and a kept one its heading, size
 * and variety, so the same seed sows the same world.
 */
export function scatter(
  map: WorldMap,
  ground: Ground,
  stand: Uint8Array,
  roadDist: Float32Array,
  random: Random,
  water: WaterField,
): Placement[] {
  const out: Placement[] = [];
  const room = clearance(stand, COLS, 8);
  const { originX, originY, tile } = map.grid;
  const [sx, sy] = [(map.start.x - originX) / tile, (map.start.y - originY) / tile];
  const top = SOWINGS.map((sow) => Math.max(...sow.liking));
  for (let k = 0; k < SOWINGS.length; k++) {
    const sow = SOWINGS[k];
    const cells = Math.floor(COLS / sow.cell);
    for (let cy = 0; cy < cells; cy++)
      for (let cx = 0; cx < cells; cx++) {
        const px = (cx + 0.1 + 0.8 * random()) * sow.cell,
          py = (cy + 0.1 + 0.8 * random()) * sow.cell;
        const chance = random();
        const tx = Math.floor(px),
          ty = Math.floor(py);
        if (tx >= COLS || ty >= ROWS) continue;
        const t = ty * COLS + tx;
        // in the meadow a tree stands in a copse, with open grass between, and not on its own anywhere
        const copse = sow.stands ? smoothstep(0.04, 0.2, fbm(k * 31 + 7, px / 15, py / 15, 2)) : 1;
        let like = 0;
        for (let b = 0; b < BIOMES; b++)
          like += (map.biomes[t * BIOMES + b] / 255) * sow.liking[b] * (b === BIOME.meadow ? copse : 1);
        // the noise is spread about nought, so a threshold this far below it leaves about `cover` of the ground grown
        const q = (0.5 - sow.cover) * 0.4;
        const grove = smoothstep(q - 0.1, q + 0.1, fbm(k * 977 + 5, px / sow.grove, py / sow.grove, 2));
        // squared against its own best, so a wood thins toward its edge and its trees keep to their own biome
        if (chance >= ((like * like) / top[k]) * grove * 2.2) continue;
        const x = originX + px * tile,
          y = originY + py * tile;
        if (!allowed(map, ground, room, roadDist, sow, tx, ty, x, y, sx, sy, px, py)) continue;
        out.push(placed(sow, x, y, ground, strongest(map.biomes, t) as Biome, random));
      }
  }
  reeds(map, ground, roadDist, water.shore, random, out);
  lilies(map, ground, roadDist, water, random, out);
  return out;
}

function allowed(
  map: WorldMap,
  ground: Ground,
  room: Uint8Array,
  roadDist: Float32Array,
  sow: Sowing,
  tx: number,
  ty: number,
  x: number,
  y: number,
  sx: number,
  sy: number,
  px: number,
  py: number,
): boolean {
  const t = ty * COLS + tx;
  if (map.solid[t] || ground.waterDepthAt(x, y) > 0) return false;
  // bare stone, a bank's face or a plaza, has nothing on it, so a face reads as one
  if (map.surface[t] === SURFACE.stone) return false;
  if (roadDist[t] < sow.road) return false;
  if ((px - sx) ** 2 + (py - sy) ** 2 < 36) return false;
  if (Math.abs(px - VILLAGE.x) < VILLAGE.half + 2 && Math.abs(py - VILLAGE.y) < VILLAGE.half + 2) return false;
  // the finds keep their ground: the orchard, the hay meadow, the great oak's clearing; flowers may grow there
  if (sow.kind !== 'flowers' && cleared(px, py)) return false;
  if (!sow.stands) return true;
  if (besideSolid(map, tx, ty)) return false;
  // a ruin stands in a clearing, and the village has room round its houses
  for (const r of RUINS) if ((px - r.x) ** 2 + (py - r.y) ** 2 < (r.floor + 3) ** 2) return false;
  if ((px - VILLAGE.x) ** 2 + (py - VILLAGE.y) ** 2 < 26 * 26) return false;
  // the narrow ground keeps its gaps: a trunk only where there are three clear tiles every way, or on ground no wheel can reach
  const stand = room[t] > 0;
  return !stand || room[t] >= 3;
}

function placed(sow: Sowing, x: number, y: number, ground: Ground, biome: Biome, random: Random): Placement {
  const yaw = random() * Math.PI * 2;
  const scale = sow.scale[0] + (sow.scale[1] - sow.scale[0]) * random();
  // on ground that is most heath, a tree that strays in from the meadow or the wood grows as the heath's own
  const kind = biome === BIOME.heath && (sow.kind === 'broadleaf' || sow.kind === 'conifer') ? 'twisted' : sow.kind;
  return { kind, x, y, z: ground.heightAt(x, y), yaw, scale, biome, vary: random() };
}

/** Reeds, in a fringe along the dry edge of the water where the wetland is. */
function reeds(
  map: WorldMap,
  ground: Ground,
  roadDist: Float32Array,
  shore: Float32Array,
  random: Random,
  out: Placement[],
): void {
  const cell = 1.3;
  const cells = Math.floor(COLS / cell);
  const { originX, originY, tile } = map.grid;
  for (let cy = 0; cy < cells; cy++)
    for (let cx = 0; cx < cells; cx++) {
      const px = (cx + 0.1 + 0.8 * random()) * cell,
        py = (cy + 0.1 + 0.8 * random()) * cell;
      const chance = random();
      const tx = Math.floor(px),
        ty = Math.floor(py);
      if (tx >= COLS || ty >= ROWS) continue;
      const t = ty * COLS + tx;
      const s = shore[t];
      if (s < -1 || s > 3) continue;
      const wet = map.biomes[t * BIOMES + 4] / 255;
      const patch = smoothstep(-0.2, 0.3, fbm(4441, px / 8, py / 8, 2));
      if (chance >= (0.35 + wet) * patch) continue;
      const x = originX + px * tile,
        y = originY + py * tile;
      if (map.solid[t] || map.surface[t] === SURFACE.stone || ground.waterDepthAt(x, y) > 0 || roadDist[t] < 2)
        continue;
      out.push({
        kind: 'reed',
        x,
        y,
        z: ground.heightAt(x, y),
        yaw: random() * Math.PI * 2,
        scale: 0.7 + 0.5 * random(),
        biome: strongest(map.biomes, t) as Biome,
        vary: random(),
      });
    }
}

/**
 * Lily pads on still water: the shallows of the lakes, the ponds and the
 * puddles, never the river's current, in patches out from the shore, and
 * kept well off a road so a ford stays clear.
 */
function lilies(
  map: WorldMap,
  ground: Ground,
  roadDist: Float32Array,
  water: WaterField,
  random: Random,
  out: Placement[],
): void {
  const cell = 1.5;
  const cells = Math.floor(COLS / cell);
  const { originX, originY, tile } = map.grid;
  for (let cy = 0; cy < cells; cy++)
    for (let cx = 0; cx < cells; cx++) {
      const px = (cx + 0.1 + 0.8 * random()) * cell,
        py = (cy + 0.1 + 0.8 * random()) * cell;
      const chance = random();
      const tx = Math.floor(px),
        ty = Math.floor(py);
      if (tx >= COLS || ty >= ROWS) continue;
      const t = ty * COLS + tx;
      const s = water.shore[t];
      if (s > -0.5 || s < -5 || water.body[t] === 0 || roadDist[t] < 5) continue;
      const patch = smoothstep(0.05, 0.3, fbm(5557, px / 6, py / 6, 2));
      if (chance >= 0.8 * patch) continue;
      const x = originX + px * tile,
        y = originY + py * tile;
      const depth = ground.waterDepthAt(x, y);
      if (depth < 0.12 || depth > 0.95) continue;
      out.push({
        kind: 'lily',
        x,
        y,
        z: ground.heightAt(x, y),
        yaw: random() * Math.PI * 2,
        scale: 0.7 + 0.6 * random(),
        biome: strongest(map.biomes, t) as Biome,
        vary: random(),
      });
    }
}
