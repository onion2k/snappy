/**
 * The water as it is drawn: one flat table at the map's water level, in three
 * bands by how deep the water over the ground is, so the player sees where
 * the rover may go before it gets there. The deep is golf's open water (the
 * renderer's `FLOW_WATER`, its waves and the sky in them), a wall to the
 * rover; the shallows are a lighter plain turquoise, a ford; and a pale rim
 * of foam where the water meets the shore, which reaches a little up the
 * bank and under it, so no sliver of dry bed shows between the water's edge
 * and the ground's.
 *
 * The bands are cut from the depth sampled on a grid a quarter of a tile
 * apart, laid so a tile's middle is on it, and read linearly between the
 * samples over each triangle of the grid (marching triangles): an edge
 * follows the ground's contour smoothly, and a tile's middle is in exactly
 * the band its own depth says.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { FLOW_RIPPLE, FLOW_WATER, packFlow } from 'artshape-render/game/flow';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { DRIVE, type Ground, type WorldMap } from '../world/types';
import { WATER } from './palette';

/**
 * The bands, by depth in units: the foam from a hair above the water (`shore`, under the bank) to `foam` deep, the
 * shoal, a paler sandier shallow along the shore, to `shoal`, the shallows to the deepest the rover fords
 * (`DRIVE.shallow`), and the deep past that. The shoal is how a real ford reads: lighter where the sand is near. The foam reached a third of a unit
 * up the bank once, and where a chunk far off is meshed coarsely its ground lies under the true ground by as much, so
 * on a flat shore far off the foam showed through as a white sheet over the land; a hair is enough to close the seam.
 */
export const BANDS = { shore: -0.05, foam: 0.06, shoal: DRIVE.shallow * 0.4, shallow: DRIVE.shallow } as const;

/** Samples a tile's side is cut into. */
const CUTS = 4;

/**
 * Golf's open water (`OCEAN` in ooergolf's `models/obstacles.ts`) at Snappy's scale: golf's world unit is a yard and
 * Snappy's a tenth of a metre, so the waves' cells a unit are golf's over 9.1, and their speed in units a second
 * golf's times 9.1. `tilt` is how steeply they turn the surface.
 */
export const OCEAN = { scale: 0.6 / 9.1, speed: 0.55 * 9.1, tilt: 0.3 } as const;

/** The water's meshes: each band's, flat at the water level. */
export interface WaterMeshes {
  deep: Mesh;
  shallow: Mesh;
  shoal: Mesh;
  foam: Mesh;
}

/**
 * The water over tiles [tx0, tx1) by [ty0, ty1) (the whole world if left out): a chunk's, for a scene that draws by
 * chunk, or all of it.
 */
export function waterMeshes(map: WorldMap, ground: Ground, region?: [number, number, number, number]): WaterMeshes {
  const { cols, rows, originX, originY, tile } = map.grid;
  const [tx0, ty0, tx1, ty1] = region ?? [0, 0, cols, rows];
  const level = map.waterLevel;
  const deep = new MeshBuilder(),
    shallow = new MeshBuilder(),
    shoal = new MeshBuilder(),
    foam = new MeshBuilder();
  const step = tile / CUTS;
  // the depths over one tile's samples, offset half a sample so a tile's middle is a sample
  const n = CUTS + 1;
  const d = new Float64Array(n * n);
  const xs = new Float64Array(n),
    ys = new Float64Array(n);
  const poly = new Float64Array(3 * 8),
    clipped = new Float64Array(3 * 8);
  const low = lowest(map);
  for (let ty = Math.max(0, ty0); ty < Math.min(rows, ty1); ty++)
    for (let tx = Math.max(0, tx0); tx < Math.min(cols, tx1); tx++) {
      // a tile whose ground is surely over the shore's band everywhere has no water, and is not sampled
      if (low[ty * cols + tx] + map.steps[ty * cols + tx] > level - BANDS.shore) continue;
      const x0 = originX + tx * tile,
        y0 = originY + ty * tile;
      let wet = false;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          xs[i] = x0 + i * step;
          ys[j] = y0 + j * step;
          // a sample on the tile's own edge is read just inside it, so a step's height is the tile's own
          const x = Math.min(x0 + tile - 1e-4, Math.max(x0 + 1e-4, xs[i])),
            y = Math.min(y0 + tile - 1e-4, Math.max(y0 + 1e-4, ys[j]));
          const depth = level - ground.heightAt(x, y);
          d[j * n + i] = depth;
          if (depth > BANDS.shore) wet = true;
        }
      if (!wet) continue;
      // a tile all in one band is one square of it, and not thirty-two triangles: most of a lake is deep all over
      let least = Infinity,
        most = -Infinity;
      for (let k = 0; k < n * n; k++) {
        least = Math.min(least, d[k]);
        most = Math.max(most, d[k]);
      }
      const whole =
        least > BANDS.shallow
          ? deep
          : least > BANDS.shoal && most <= BANDS.shallow
            ? shallow
            : least > BANDS.foam && most <= BANDS.shoal
              ? shoal
              : null;
      if (whole) {
        const first = whole.vertex(x0, y0, level, 0, 0, 1, 0, 0);
        whole.vertex(x0 + tile, y0, level, 0, 0, 1, 0, 0);
        whole.vertex(x0 + tile, y0 + tile, level, 0, 0, 1, 0, 0);
        whole.vertex(x0, y0 + tile, level, 0, 0, 1, 0, 0);
        whole.quad(first, first + 1, first + 2, first + 3);
        continue;
      }
      for (let j = 0; j < CUTS; j++)
        for (let i = 0; i < CUTS; i++) {
          const a = j * n + i;
          // two triangles a cell, split along the line toward the tile's middle, so the cuts fan out from it
          const flip = i < CUTS / 2 === j < CUTS / 2;
          const tris = flip
            ? [
                [a, a + 1, a + n + 1],
                [a, a + n + 1, a + n],
              ]
            : [
                [a, a + 1, a + n],
                [a + 1, a + n + 1, a + n],
              ];
          for (const t of tris) {
            for (let k = 0; k < 3; k++) {
              const v = t[k];
              poly[k * 3] = xs[v % n];
              poly[k * 3 + 1] = ys[Math.floor(v / n)];
              poly[k * 3 + 2] = d[v];
            }
            band(foam, poly, clipped, BANDS.shore, BANDS.foam, level);
            band(shoal, poly, clipped, BANDS.foam, BANDS.shoal, level);
            band(shallow, poly, clipped, BANDS.shoal, BANDS.shallow, level);
            band(deep, poly, clipped, BANDS.shallow, Infinity, level);
          }
        }
    }
  return { deep: deep.build(), shallow: shallow.build(), shoal: shoal.build(), foam: foam.build() };
}

/**
 * The lowest the smooth ground can be anywhere on each tile: the least of the terrain's heights over the five by five
 * tiles round it, since the terrain's smoothing (a cubic B-spline) never goes under the least of the heights it is made
 * from, and reads no further than two tiles off. So a tile whose least is over the water is dry all over, and the water
 * need sample only the tiles by the shore: over a 200 m world, a fifth of a second saved at boot.
 */
function lowest(map: WorldMap): Float32Array {
  const { cols, rows } = map.grid;
  const across = new Float32Array(cols * rows),
    out = new Float32Array(cols * rows);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      let m = Infinity;
      for (let k = -2; k <= 2; k++) m = Math.min(m, map.terrain[ty * cols + Math.min(cols - 1, Math.max(0, tx + k))]);
      across[ty * cols + tx] = m;
    }
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      let m = Infinity;
      for (let k = -2; k <= 2; k++) m = Math.min(m, across[Math.min(rows - 1, Math.max(0, ty + k)) * cols + tx]);
      out[ty * cols + tx] = m;
    }
  return out;
}

/**
 * The part of the triangle `poly` (three points of x, y and depth) whose depth is over `lo` and at most `hi`, cut where
 * the depth, read linearly over it, crosses each, fanned into `b` flat at `level` facing up.
 */
function band(b: MeshBuilder, poly: Float64Array, scratch: Float64Array, lo: number, hi: number, level: number) {
  let n = clip(poly, 3, scratch, lo, 1);
  if (n < 3) return;
  // the second cut, back into `poly`'s room past its first three points, which it no longer needs
  const out = poly.subarray(9);
  n = clip(scratch, n, out, hi, -1);
  if (n < 3) return;
  const first = b.vertex(out[0], out[1], level, 0, 0, 1, 0, 0);
  for (let k = 1; k < n; k++) b.vertex(out[k * 3], out[k * 3 + 1], level, 0, 0, 1, 0, 0);
  for (let k = 1; k < n - 1; k++) b.triangle(first, first + k, first + k + 1);
}

/**
 * A convex polygon of `n` points (x, y, depth) cut to where `sign * (depth - at)` is over nought (`sign` one: deeper
 * than `at`; minus one: no deeper), into `out`; returns how many points it has. Counter-clockwise stays so.
 */
function clip(src: Float64Array, n: number, out: Float64Array, at: number, sign: number): number {
  if (!Number.isFinite(at)) {
    out.set(src.subarray(0, n * 3));
    return n;
  }
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 3,
      b = ((i + 1) % n) * 3;
    const da = sign * (src[a + 2] - at),
      db = sign * (src[b + 2] - at);
    const inA = sign > 0 ? da > 0 : da >= 0,
      inB = sign > 0 ? db > 0 : db >= 0;
    if (inA) {
      out[m * 3] = src[a];
      out[m * 3 + 1] = src[a + 1];
      out[m * 3 + 2] = src[a + 2];
      m++;
    }
    if (inA !== inB) {
      const u = da / (da - db);
      out[m * 3] = src[a] + (src[b] - src[a]) * u;
      out[m * 3 + 1] = src[a + 1] + (src[b + 1] - src[a + 1]) * u;
      out[m * 3 + 2] = at;
      m++;
    }
  }
  return m;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * Floats a placement's pattern: the renderer's `PATTERN_STRIDE`, said again here so the water can be made and tested
 * under node without the renderer's module, which wants a device.
 */
export const PATTERN_FLOATS = 8;

/** The open water's pattern, for a placement of the deep. */
export function oceanPattern(): Float32Array {
  return packFlow(new Float32Array(PATTERN_FLOATS), 0, {
    kind: FLOW_WATER,
    scale: OCEAN.scale,
    speed: OCEAN.speed,
    glow: OCEAN.tilt,
    second: [...WATER.tint],
  });
}

/**
 * A shallow band's faint slow ripple: big soft cells drifting downstream at a walk, in a colour a step off the band's
 * own, so the shallows read as moving water and not as a painted floor (review 1, 8).
 */
export const RIPPLE = { scale: 0.09, speed: 0.6, mix: 0.9 } as const;

/** A shallow band's ripple pattern, its second colour `colour` a little lighter. */
export function ripplePattern(colour: readonly [number, number, number]): Float32Array {
  const k = 1 / RIPPLE.mix;
  return packFlow(new Float32Array(PATTERN_FLOATS), 0, {
    kind: FLOW_RIPPLE,
    scale: RIPPLE.scale,
    speed: RIPPLE.speed,
    glow: 0,
    second: [Math.min(1, colour[0] * k), Math.min(1, colour[1] * k), Math.min(1, colour[2] * k)],
  });
}

/**
 * The water's groups: the deep in open water; the shallows and the paler shoal along the shore matte (a gloss spread
 * the sun's highlight over a whole ford as a white glare seen from the chase camera), each with a faint slow ripple;
 * and the foam pale. Each is one placement at the origin; a band with nothing in it is left out.
 */
export function waterGroups(meshes: WaterMeshes): GameGroup[] {
  const groups: GameGroup[] = [
    { mesh: meshes.deep, matrices: IDENTITY, albedo: [...WATER.deep], roughness: 0.08, patterns: oceanPattern() },
    {
      mesh: meshes.shallow,
      matrices: IDENTITY,
      albedo: [...WATER.shallow],
      roughness: 0.85,
      patterns: ripplePattern(WATER.shallow),
    },
    {
      mesh: meshes.shoal,
      matrices: IDENTITY,
      albedo: [...WATER.shoal],
      roughness: 0.88,
      patterns: ripplePattern(WATER.shoal),
    },
    { mesh: meshes.foam, matrices: IDENTITY, albedo: [...WATER.foam], roughness: 0.9 },
  ];
  return groups.filter((g) => g.mesh.indices.length > 0);
}
