/**
 * The world's grass, as the renderer grows it (`setGrass`): a field over the
 * whole world, a cell every couple of units, saying which kind grows in each
 * and how high the ground is there. Content and the arithmetic of reading the
 * map; the renderer grows the blades on the GPU from a hash, so a field of a
 * million costs no memory and nothing at boot.
 *
 * A biome is told by its grass as much as by its trees: the meadow lush and
 * fresh, flecked in patches with yellow and pink where flowers are in it; the
 * pine wood's sparse and dark; the autumn wood's long and gold; the heath's
 * short and mauve, with heather in bloom; and the wetland's tall. It grows on
 * grass alone: nothing on a road, sand, mud, stone or rock, in water, or
 * under anything built, each by the same edge the colour map draws it with. Where two biomes blend, each cell takes one of them
 * by chance, weighted by their shares, so the border is a soft mingling and
 * not a line.
 *
 * Blades are about ankle height to the rover: one to two and a half units.
 */
import type { GrassField, GrassKind, GrassOptions, Wind } from 'artshape-render/game/grass';
import { BIOME, BIOMES, SURFACES, type Ground, type WorldMap } from '../world/types';
import { BUILT_SIZE, type BuiltKind } from './built';
import { PAVE } from './paving';
import { rockOf, roadsOver, surfaceAt } from './terrain';

/** The finest cell, in units; a world too big for a field of it at the renderer's 1024 a side is given a coarser one. */
export const GRASS_CELL = 2;
/**
 * How much of a road or a patch of sand, mud or stone may be in a cell before no grass grows there: a third, so the
 * blades stop a little short of where the colour map's edge is half way, and the edge is seen.
 */
const BARE = 0.3;

/** Cells a side a field may have: the renderer's `MAX_SIDE`. */
const FIELD_SIDE = 1024;

/** The kinds, by their place in `GRASS_KINDS`. */
export const GRASS = {
  meadow: 0,
  buttercup: 1,
  clover: 2,
  pine: 3,
  autumn: 4,
  heath: 5,
  heather: 6,
  wetland: 7,
} as const;

/**
 * The kinds, all linear light. Each kind's root is darker than the ground it grows from and its tip lighter, so the
 * field reads as the ground's own colour at a distance (`palette.ts`'s `BIOME_GROUND`) and as blades close to. The
 * flowering kinds are their biome's blade with the tip in bloom, a little taller, so a flower stands over the grass.
 * Densities are blades a square unit: about a thousand a square metre for the meadow, a third of it under the pines.
 */
export const GRASS_KINDS: GrassKind[] = [
  {
    density: 7,
    height: 1.1,
    heightSpread: 0.35,
    width: 0.16,
    base: [0.06, 0.2, 0.01],
    tip: [0.24, 0.44, 0.07],
    variation: 0.25,
    roughness: 0.9,
    lean: 0.35,
    give: 1,
  },
  {
    density: 6,
    height: 1.45,
    heightSpread: 0.3,
    width: 0.2,
    base: [0.06, 0.2, 0.01],
    tip: [0.55, 0.58, 0.08],
    variation: 0.2,
    roughness: 0.9,
    lean: 0.3,
    give: 1,
  },
  {
    density: 6,
    height: 1.4,
    heightSpread: 0.3,
    width: 0.2,
    base: [0.06, 0.2, 0.01],
    tip: [0.3, 0.5, 0.12],
    variation: 0.2,
    roughness: 0.9,
    lean: 0.3,
    give: 1,
  },
  {
    density: 3.5,
    height: 1.3,
    heightSpread: 0.4,
    width: 0.16,
    base: [0.02, 0.08, 0.03],
    tip: [0.1, 0.3, 0.12],
    variation: 0.3,
    roughness: 0.9,
    lean: 0.4,
    give: 0.8,
  },
  {
    density: 8,
    height: 2.0,
    heightSpread: 0.35,
    width: 0.16,
    base: [0.12, 0.13, 0.02],
    tip: [0.72, 0.5, 0.08],
    variation: 0.3,
    roughness: 0.9,
    lean: 0.45,
    give: 1,
  },
  {
    density: 10,
    height: 1.0,
    heightSpread: 0.3,
    width: 0.16,
    base: [0.1, 0.07, 0.06],
    tip: [0.42, 0.35, 0.14],
    variation: 0.3,
    roughness: 0.9,
    lean: 0.25,
    give: 0.6,
  },
  {
    density: 9,
    height: 1.2,
    heightSpread: 0.3,
    width: 0.2,
    base: [0.1, 0.07, 0.06],
    tip: [0.48, 0.2, 0.42],
    variation: 0.25,
    roughness: 0.9,
    lean: 0.2,
    give: 0.6,
  },
  {
    density: 8,
    height: 2.5,
    heightSpread: 0.3,
    width: 0.16,
    base: [0.03, 0.14, 0.05],
    tip: [0.24, 0.5, 0.16],
    variation: 0.25,
    roughness: 0.9,
    lean: 0.25,
    give: 1,
  },
];

/**
 * How the renderer thins the grass with distance, in units from the camera: every blade inside `near`, thinning with
 * the square of the distance past it, one triangle a blade past `mid`, none past `far`. The chase camera stands about
 * ninety units off the rover, so `near` takes in the ground round it and a little past.
 */
export const GRASS_OPTIONS: GrassOptions = { near: 100, mid: 190, far: 320, capacity: 262_144 };

/** A breeze across the world, which the grass bends in: the clouds drift the same way (`clouds.ts`). */
export const WIND: Wind = { direction: [0.8, 0.6], strength: 0.35, gustSize: 60, gustSpeed: 18 };

/** A small hash to [0, 1). */
function hash01(a: number, b: number, seed: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]: the patches flowers grow in. */
function patches(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, seed),
    b = hash01(ix + 1, iy, seed),
    c = hash01(ix, iy + 1, seed),
    d = hash01(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** The built kinds with a floor and four walls, which no grass grows inside: the rest are ruins and fences. */
const HOUSES: ReadonlySet<string> = new Set<BuiltKind>(['cottage', 'church', 'well', 'windmill', 'haystack']);

/** Which cells of a grid are inside a house's footprint, turned as it is placed: one for each that is. */
function housedCells(
  map: WorldMap,
  origin: readonly [number, number],
  cell: number,
  cols: number,
  rows: number,
  margin = 0,
): Uint8Array {
  const out = new Uint8Array(cols * rows);
  for (const p of map.placements) {
    if (!HOUSES.has(p.kind)) continue;
    const size = BUILT_SIZE[p.kind as BuiltKind];
    const hx = size.hx + margin / p.scale,
      hy = size.hy + margin / p.scale;
    const c = Math.cos(p.yaw),
      s = Math.sin(p.yaw);
    const reach = Math.hypot(hx, hy) * p.scale;
    const i0 = Math.max(0, Math.floor((p.x - reach - origin[0]) / cell)),
      i1 = Math.min(cols - 1, Math.floor((p.x + reach - origin[0]) / cell)),
      j0 = Math.max(0, Math.floor((p.y - reach - origin[1]) / cell)),
      j1 = Math.min(rows - 1, Math.floor((p.y + reach - origin[1]) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = origin[0] + (i + 0.5) * cell - p.x,
          dy = origin[1] + (j + 0.5) * cell - p.y;
        // the cell's middle in the house's own frame
        const u = (dx * c + dy * s) / p.scale,
          v = (-dx * s + dy * c) / p.scale;
        if (Math.abs(u) <= hx && Math.abs(v) <= hy) out[j * cols + i] = 1;
      }
  }
  return out;
}

/** The finest of the cells whose field covers the world in at most `FIELD_SIDE` a side. */
export function cellFor(map: WorldMap): number {
  const span = Math.max(map.grid.cols, map.grid.rows) * map.grid.tile;
  for (const cell of [GRASS_CELL, 2.5, 3, 4]) if (Math.ceil(span / cell) <= FIELD_SIDE) return cell;
  return Math.ceil(span / FIELD_SIDE);
}

/**
 * Which kind grows where a biome is: the biome's own blade, or in a patch its flowering one. Patches are cut from
 * smooth noise at two sizes, never by a cell's own chance, which drew a checkerboard of the two kinds cell by cell.
 */
function kindOf(biome: number, x: number, y: number, plain: boolean): number {
  switch (biome) {
    case BIOME.meadow: {
      // no drift by a house or a paved place: a garden is lawn, and a drift there read as frost or paint
      if (plain) return GRASS.meadow;
      // flowers in drifts some five metres across, frayed at their edges, each drift one kind
      const p = patches(x / 50, y / 50, 3) + 0.3 * (patches(x / 7, y / 7, 4) - 0.5);
      if (p > DRIFT) return patches(x / 80, y / 80, 5) > 0.5 ? GRASS.buttercup : GRASS.clover;
      return GRASS.meadow;
    }
    case BIOME.pine:
      return GRASS.pine;
    case BIOME.autumn:
      return GRASS.autumn;
    case BIOME.heath:
      // heather in drifts, and straw-olive grass between them (review 2, 5)
      return patches(x / 30, y / 30, 6) + 0.35 * (patches(x / 6, y / 6, 7) - 0.5) > 0.68 ? GRASS.heather : GRASS.heath;
    default:
      return GRASS.wetland;
  }
}

/** The biomes' shares at (x, y), out of 255, read bilinearly between the middles of the four tiles round it, into `out`. */
export function sharesAt(map: WorldMap, x: number, y: number, out: Float64Array): void {
  const { cols, rows, originX, originY, tile } = map.grid;
  const fx = Math.min(cols - 1, Math.max(0, (x - originX) / tile - 0.5)),
    fy = Math.min(rows - 1, Math.max(0, (y - originY) / tile - 0.5));
  const i = Math.min(cols - 2, Math.floor(fx)),
    j = Math.min(rows - 2, Math.floor(fy));
  const u = fx - i,
    v = fy - j;
  const a = (j * cols + i) * BIOMES,
    b = a + BIOMES,
    c = a + cols * BIOMES,
    d = c + BIOMES;
  const s = map.biomes;
  for (let k = 0; k < BIOMES; k++)
    out[k] = (s[a + k] * (1 - u) + s[b + k] * u) * (1 - v) + (s[c + k] * (1 - u) + s[d + k] * u) * v;
}

/**
 * How far from a house, and from a road or a paved place, the meadow's flowering drifts keep off, in units: a garden
 * and a verge are lawn (review 3, 1).
 */
export const PLAIN = { house: 40, paving: 20 } as const;

/** How high the meadow's smooth noise must reach for a drift of buttercup or clover: a few drifts, not a carpet. */
const DRIFT = 0.78;

/**
 * The world's field of grass, over the whole map at `cellFor(map)`, its heights the ground's at each cell's middle.
 * Seeded by `seed`, so the blades are the same every run. `clearOf`, the paving's distance (`Paving.clearOf`), keeps it
 * off the roads and the plazas up to the edge their meshes draw; left out, the roads' lines are read instead.
 */
export function grassField(
  map: WorldMap,
  ground: Ground,
  seed = 1,
  clearOf?: (x: number, y: number) => number,
): GrassField {
  const { cols: tc, rows: tr, originX, originY, tile } = map.grid;
  const cell = cellFor(map);
  const cols = Math.ceil((tc * tile) / cell),
    rows = Math.ceil((tr * tile) / cell);
  const mask = new Uint8Array(cols * rows),
    heights = new Float32Array(cols * rows);
  const roads = clearOf ? null : roadsOver(map, [originX, originY], cell, cols, rows);
  const rock = rockOf(map);
  const housed = housedCells(map, [originX, originY], cell, cols, rows);
  const nearHouse = housedCells(map, [originX, originY], cell, cols, rows, PLAIN.house);
  const scratch = new Float64Array(SURFACES);
  const shares = new Float64Array(BIOMES);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = originX + (i + 0.5) * cell,
        y = originY + (j + 0.5) * cell;
      const h = ground.heightAt(x, y);
      heights[j * cols + i] = h;
      const tx = Math.min(tc - 1, Math.floor((x - originX) / tile)),
        ty = Math.min(tr - 1, Math.floor((y - originY) / tile));
      const t = ty * tc + tx;
      // none on the rock, in a house, in the water, or on the road, sand, mud or stone the colour map draws there; but it
      // grows up through a ruin or a fence, as it does round old stones, and stops at their own faces
      if (rock[t] || housed[j * cols + i] || h < map.waterLevel + 0.05) continue;
      if (clearOf ? clearOf(x, y) < PAVE.grass : roads![j * cols + i] > BARE) continue;
      if (surfaceAt(map, x, y, scratch) > BARE) continue;
      // one of the biomes, by smooth noise against their shares read smoothly between the tiles' middles, so a border
      // between two is a mingling of patches a few metres across, and neither a cell-by-cell scatter nor a tile's
      // straight edge (review 1, 5a)
      sharesAt(map, x, y, shares);
      let pick =
          Math.min(
            0.999,
            Math.max(
              0,
              0.5 +
                1.6 * (0.7 * patches(x / 14, y / 14, seed + 11) + 0.3 * patches(x / 4.5, y / 4.5, seed + 12) - 0.5) +
                // dithered a cell at a time too, so a border between two kinds frays and does not step (review 2, 18)
                0.3 * (hash01(i, j, seed + 13) - 0.5),
            ),
          ) * 255,
        biome = 0;
      for (let k = 0; k < BIOMES; k++) {
        const share = shares[k];
        if (pick < share) {
          biome = k;
          break;
        }
        pick -= share;
      }
      const plain = nearHouse[j * cols + i] === 1 || (clearOf !== undefined && clearOf(x, y) < PLAIN.paving);
      mask[j * cols + i] = kindOf(biome, x, y, plain) + 1;
    }
  return { origin: [originX, originY], cell, cols, rows, mask, heights, kinds: GRASS_KINDS, seed };
}
