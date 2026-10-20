/**
 * The roads and the paved places as meshes of their own, laid a hair over
 * the ground: each a crisp edge and a tiled detail layer of its own (gravel
 * for a road, cobbles for the square, broken flags for a ruin's floor), where
 * they used to be a soft smear in the world's colour map, which is a texel
 * every two units and can hold neither an edge nor a stone.
 *
 * Each is cut from a distance field on a grid `PAVE.cell` apart: how far a
 * point is from the road's edge (or the plaza's outline), negative inside.
 * The field is read linearly over each triangle of the grid and the part
 * inside cut out (marching triangles, as the water is), so an edge is a
 * smooth line through the grid and not a step of it. A road's edge wanders
 * a little by a soft noise, as a track's does. The grass is kept off the
 * same field (`clearOf`), so it stops at the edge the mesh draws.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { TEXTURE_STRIDE, packTexture } from 'artshape-render/game/texture';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import type { Ground, Plaza, WorldMap } from '../world/types';
import { ROUGH, SURFACE_GROUND, shown, type Rgb } from './palette';

/**
 * The paving's figures, in units: the grid it is cut on; how far over the ground a road and a plaza lie (the plaza
 * over the road, where a road runs into it); how far the road's edge wanders either way; and how far past an edge the
 * grass stands back from it.
 */
export const PAVE = { cell: 1.5, roadLift: 0.1, plazaLift: 0.16, wander: 0.4, grass: 0.35 } as const;

/** The paving's colours, before their detail layer: a road's packed earth, the square's warm grey cobbles, a ruin's flags. */
export const PAVING_COLOURS = {
  road: SURFACE_GROUND.dirt,
  cobbles: shown(0.64, 0.6, 0.54),
  flags: shown(0.66, 0.63, 0.57),
} as const satisfies Record<string, Rgb>;

/** The ground texture's layers the paving wears, counted from one: after the colour map's near and far pictures. */
export const DETAIL_LAYER = { gravel: 3, cobbles: 4, flags: 5 } as const;
/** How many units each detail layer covers before it repeats. */
export const DETAIL_SPAN = { gravel: 16, cobbles: 12, flags: 24 } as const;

export interface Paving {
  roads: Mesh;
  cobbles: Mesh;
  flags: Mesh;
  /** How far (x, y) is from the nearest paving, negative inside it, in units: for the grass to keep off. */
  clearOf(x: number, y: number): number;
}

/** A small hash to [0, 1). */
function hash01(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
function noise(x: number, y: number, seed: number): number {
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

/** A field over the world on the paving's grid, its values where something was written and +infinity elsewhere. */
class Field {
  readonly cols: number;
  readonly rows: number;
  readonly value: Float32Array;
  /** Which cells have a corner with something written: the ones to cut. */
  readonly touched: Uint8Array;
  constructor(
    readonly originX: number,
    readonly originY: number,
    w: number,
    h: number,
  ) {
    this.cols = Math.ceil(w / PAVE.cell) + 1;
    this.rows = Math.ceil(h / PAVE.cell) + 1;
    this.value = new Float32Array(this.cols * this.rows).fill(Infinity);
    this.touched = new Uint8Array(this.cols * this.rows);
  }
  /** Writes `fn` at every grid point in the box, keeping the least there, and marks the cells. */
  over(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => number) {
    const i0 = Math.max(0, Math.floor((x0 - this.originX) / PAVE.cell)),
      i1 = Math.min(this.cols - 1, Math.ceil((x1 - this.originX) / PAVE.cell)),
      j0 = Math.max(0, Math.floor((y0 - this.originY) / PAVE.cell)),
      j1 = Math.min(this.rows - 1, Math.ceil((y1 - this.originY) / PAVE.cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const v = fn(this.originX + i * PAVE.cell, this.originY + j * PAVE.cell);
        const k = j * this.cols + i;
        if (v < this.value[k]) this.value[k] = v;
        this.touched[k] = 1;
      }
  }
  /** The field at (x, y), read linearly between its grid points; +infinity off it. */
  at(x: number, y: number): number {
    const fx = (x - this.originX) / PAVE.cell,
      fy = (y - this.originY) / PAVE.cell;
    const i = Math.floor(fx),
      j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= this.cols - 1 || j >= this.rows - 1) return Infinity;
    const ax = fx - i,
      ay = fy - j;
    const v = this.value,
      k = j * this.cols + i;
    const a = v[k],
      b = v[k + 1],
      c = v[k + this.cols],
      d = v[k + this.cols + 1];
    if (!Number.isFinite(a + b + c + d)) return Math.min(a, b, c, d);
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
  }
}

/** The distance from (x, y) to the segment from (ax, ay) to (bx, by). */
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax,
    vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
  const dx = x - ax - vx * t,
    dy = y - ay - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

/** The signed distance from (x, y) to a plaza's outline: negative inside it. */
function toPlaza(p: Plaza, x: number, y: number): number {
  const o = p.outline,
    n = o.length / 2;
  let best = Infinity,
    inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = o[j * 2],
      ay = o[j * 2 + 1],
      bx = o[i * 2],
      by = o[i * 2 + 1];
    best = Math.min(best, toSegment(x, y, ax, ay, bx, by));
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -best : best;
}

/** The world's paving, cut from its roads' lines and its plazas' outlines. */
export function pavingOf(map: WorldMap, ground: Ground): Paving {
  const { minX, minY, maxX, maxY } = ground.bounds;
  const roads = new Field(minX, minY, maxX - minX, maxY - minY);
  for (const road of map.roads) {
    const p = road.points,
      half = road.width / 2;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k],
        ay = p[k + 1],
        bx = p[k + 2],
        by = p[k + 3];
      const reach = half + 2 * PAVE.cell;
      roads.over(
        Math.min(ax, bx) - reach,
        Math.min(ay, by) - reach,
        Math.max(ax, bx) + reach,
        Math.max(ay, by) + reach,
        (x, y) => {
          const edge = half + (noise(x / 5, y / 5, 31) - 0.5) * 2 * PAVE.wander;
          return toSegment(x, y, ax, ay, bx, by) - edge;
        },
      );
    }
  }
  // a field of its own for each plaza, over its own box: they are few and small, and the world's field is not wanted
  const plazas: { field: Field; paving: Plaza['paving'] }[] = [];
  for (const plaza of map.plazas) {
    const o = plaza.outline;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i < o.length; i += 2) {
      x0 = Math.min(x0, o[i]);
      x1 = Math.max(x1, o[i]);
      y0 = Math.min(y0, o[i + 1]);
      y1 = Math.max(y1, o[i + 1]);
    }
    const m = 2 * PAVE.cell;
    // a ruin's floor broken at its edge, the square's kept true
    const ragged = plaza.paving === 'flags' ? 1.2 : 0;
    const field = new Field(Math.floor(x0 - m), Math.floor(y0 - m), x1 - x0 + 2 * m, y1 - y0 + 2 * m);
    field.over(
      x0 - m,
      y0 - m,
      x1 + m,
      y1 + m,
      (x, y) => toPlaza(plaza, x, y) + (noise(x / 3, y / 3, 41) - 0.5) * ragged,
    );
    plazas.push({ field, paving: plaza.paving });
  }
  const cobbles = new MeshBuilder(),
    flags = new MeshBuilder();
  for (const { field, paving } of plazas) cut(field, ground, PAVE.plazaLift, paving === 'cobbles' ? cobbles : flags);
  return {
    roads: cut(roads, ground, PAVE.roadLift, new MeshBuilder()).build(),
    cobbles: cobbles.build(),
    flags: flags.build(),
    clearOf: (x, y) => {
      let d = roads.at(x, y);
      for (const p of plazas) d = Math.min(d, p.field.at(x, y));
      return d;
    },
  };
}

/** The part of `field` under nought, into `b`, draped on the ground `lift` over it, its normals the ground's. */
function cut(field: Field, ground: Ground, lift: number, b: MeshBuilder): MeshBuilder {
  const poly = new Float64Array(3 * 8),
    out = new Float64Array(3 * 8);
  const slope = new Float64Array(2);
  const { cols, value, touched } = field;
  const emit = (x: number, y: number) => {
    ground.slopeAt(x, y, slope);
    const l = Math.hypot(slope[0], slope[1], 1);
    return b.vertex(x, y, ground.heightAt(x, y) + lift, -slope[0] / l, -slope[1] / l, 1 / l, x, y);
  };
  for (let j = 0; j < field.rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const k = j * cols + i;
      if (!touched[k] || !touched[k + 1] || !touched[k + cols] || !touched[k + cols + 1]) continue;
      const corners = [k, k + 1, k + cols + 1, k + cols];
      if (corners.every((c) => value[c] >= 0)) continue;
      const x0 = field.originX + i * PAVE.cell,
        y0 = field.originY + j * PAVE.cell;
      const xs = [x0, x0 + PAVE.cell, x0 + PAVE.cell, x0],
        ys = [y0, y0, y0 + PAVE.cell, y0 + PAVE.cell];
      for (const tri of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        for (let t = 0; t < 3; t++) {
          poly[t * 3] = xs[tri[t]];
          poly[t * 3 + 1] = ys[tri[t]];
          poly[t * 3 + 2] = value[corners[tri[t]]];
        }
        const n = inside(poly, 3, out);
        if (n < 3) continue;
        const first = emit(out[0], out[1]);
        for (let v = 1; v < n; v++) emit(out[v * 3], out[v * 3 + 1]);
        for (let v = 1; v < n - 1; v++) b.triangle(first, first + v, first + v + 1);
      }
    }
  return b;
}

/** The part of a triangle (x, y, value a point) where the value is under nought, into `out`: how many points. */
function inside(src: Float64Array, n: number, out: Float64Array): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 3,
      c = ((i + 1) % n) * 3;
    const da = src[a + 2],
      dc = src[c + 2];
    if (da < 0) {
      out[m * 3] = src[a];
      out[m * 3 + 1] = src[a + 1];
      out[m * 3 + 2] = da;
      m++;
    }
    if (da < 0 !== dc < 0) {
      const u = da / (da - dc);
      out[m * 3] = src[a] + (src[c] - src[a]) * u;
      out[m * 3 + 1] = src[a + 1] + (src[c + 1] - src[a + 1]) * u;
      out[m * 3 + 2] = 0;
      m++;
    }
  }
  return m;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The paving's groups, each in its colour and wearing its detail layer; one with nothing in it is left out. */
export function pavingGroups(p: Paving): GameGroup[] {
  const layer = (kind: keyof typeof DETAIL_LAYER, strength: number) =>
    packTexture(new Float32Array(TEXTURE_STRIDE), 0, {
      layer: DETAIL_LAYER[kind],
      repeat: 1 / DETAIL_SPAN[kind],
      albedo: strength,
      shade: strength,
    });
  const groups: GameGroup[] = [
    {
      mesh: p.roads,
      matrices: IDENTITY,
      albedo: [...PAVING_COLOURS.road],
      roughness: ROUGH.earth,
      texture: layer('gravel', 0.8),
    },
    {
      mesh: p.cobbles,
      matrices: IDENTITY,
      albedo: [...PAVING_COLOURS.cobbles],
      roughness: ROUGH.stone,
      texture: layer('cobbles', 1),
    },
    {
      mesh: p.flags,
      matrices: IDENTITY,
      albedo: [...PAVING_COLOURS.flags],
      roughness: ROUGH.stone,
      texture: layer('flags', 1),
    },
  ];
  return groups.filter((g) => g.mesh.indices.length > 0);
}

/**
 * A detail layer as texels, `side` across, tiling: the colour a modulation about mid-grey and the alpha a height, as
 * the renderer's ground texture takes them. Worked out on a picture a quarter the side and read up smoothly, which is
 * as fine as a stone needs and a sixteenth of the work at boot.
 *
 * - gravel: a fine speckle of lighter and darker grit over soft patches;
 * - cobbles: rounded stones in rows, each its own shade, in dark joints;
 * - flags: big irregular slabs, cracked, in wide dark joints with moss.
 */
export function detailTexels(kind: keyof typeof DETAIL_LAYER, side: number): Uint8ClampedArray {
  const small = Math.max(16, side / 4);
  const grain = new Float32Array(small * small),
    height = new Float32Array(small * small);
  // stones as cells of a jittered grid, wrapping at the edge so the layer tiles
  const cells = kind === 'cobbles' ? 10 : kind === 'flags' ? 5 : 0;
  const jitter = (i: number, j: number, s: number) =>
    hash01(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, s);
  for (let y = 0; y < small; y++)
    for (let x = 0; x < small; x++) {
      const u = x / small,
        v = y / small;
      let g = 0,
        h = 0;
      if (cells === 0) {
        g = 0.55 * (hash01(x, y, 3) - 0.5) + 0.45 * (noise(u * 24, v * 24, 4) - 0.5);
        h = 0.6 * (hash01(x, y, 5) - 0.5);
      } else {
        // the nearest two stone middles, for the joint between them
        const cx = u * cells,
          cy = v * cells;
        const ix = Math.floor(cx),
          iy = Math.floor(cy);
        let d1 = Infinity,
          d2 = Infinity,
          owner = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const i = ix + di,
              j = iy + dj;
            // cobbles in rows: every other row shifted half a stone
            const shift = kind === 'cobbles' && ((j % 2) + 2) % 2 ? 0.5 : 0;
            const px = i + shift + 0.5 + (jitter(i, j, 1) - 0.5) * (kind === 'cobbles' ? 0.35 : 0.6),
              py = j + 0.5 + (jitter(i, j, 2) - 0.5) * (kind === 'cobbles' ? 0.25 : 0.6);
            const d = Math.hypot(cx - px, cy - py);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              owner = jitter(i, j, 3);
            } else if (d < d2) d2 = d;
          }
        const joint = d2 - d1;
        const width = kind === 'cobbles' ? 0.09 : 0.06;
        const edge = Math.min(1, joint / width);
        // each stone its own shade, rounded toward its middle, the joint dark and low
        g = (owner - 0.5) * 0.55 + (edge - 1) * 1.1 + 0.12 * (noise(u * 40, v * 40, 7) - 0.5);
        h = edge * (1 - d1 * (kind === 'cobbles' ? 0.9 : 0.4)) - 0.5;
        if (kind === 'flags' && noise(u * 12, v * 12, 8) > 0.72) g -= 0.25 * (1 - edge);
      }
      grain[y * small + x] = g;
      height[y * small + x] = h;
    }
  const out = new Uint8ClampedArray(side * side * 4);
  const read = (a: Float32Array, fx: number, fy: number) => {
    const i = Math.floor(fx),
      j = Math.floor(fy);
    const ax = fx - i,
      ay = fy - j;
    const w = (n: number) => ((n % small) + small) % small;
    const p = a[w(j) * small + w(i)],
      q = a[w(j) * small + w(i + 1)],
      r = a[w(j + 1) * small + w(i)],
      s = a[w(j + 1) * small + w(i + 1)];
    return (p * (1 - ax) + q * ax) * (1 - ay) + (r * (1 - ax) + s * ax) * ay;
  };
  const k = small / side;
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const g = read(grain, x * k, y * k),
        h = read(height, x * k, y * k);
      const o = (y * side + x) * 4;
      const c = Math.round(128 + Math.max(-1, Math.min(1, g)) * 60);
      out[o] = c;
      out[o + 1] = c;
      out[o + 2] = c;
      out[o + 3] = Math.round(128 + Math.max(-1, Math.min(1, h)) * 70);
    }
  return out;
}
