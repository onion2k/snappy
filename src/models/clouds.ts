/**
 * The clouds: faceted white heaps high over the world, drifting on the wind
 * by game time and throwing their shadows across the land, which is what the
 * chase camera, looking down, sees most of the sky. Tilted up, it sees the
 * clouds themselves.
 *
 * Where cloud `i` is at time `t` is a pure function of the two (`cloudAt`),
 * worked out from a hash of `i` and nothing kept, so a paused game's clouds
 * stand still, the same seed and time draw the same sky, and nothing is made
 * as they move. They drift within a field a margin wider than the world each
 * way, and come round again on its far side; near the field's edge a cloud
 * shrinks to nothing, so none is seen to jump.
 *
 * The clouds' shadows fall on the land only if the sun's shadow map reaches
 * up to them: see `sunBoxAround`, which says the box for it.
 */
import type { Mesh } from 'artshape-render/mesh/types';
import { at, built, lump, seeded } from 'artshape-render/mesh/lowpoly';
import { SUN } from '../sun';

/**
 * The sky's figures: how many clouds; how high their middles are, in units (20 to 28 m: well over the chase camera,
 * which stands about 6 m up and 13 m at its farthest, and low enough that the sun's map can reach them without a depth
 * bias that loses the rover's own shadow, as `sunBoxAround` says); how wide they are; how fast they drift, in units a
 * second (half a metre a second, a lazy summer breeze); which way (the grass's wind); and how far past the world the
 * field they drift in reaches.
 */
export const SKY_CLOUDS = {
  count: 72,
  height: [200, 280],
  size: [60, 140],
  drift: 5,
  wind: [0.8, 0.6],
  margin: 500,
  /** How far in from the field's edge a cloud grows from nothing to its size. */
  fade: 260,
} as const;

/** How many shapes of cloud there are: cloud `i` is drawn as shape `i % CLOUD_SHAPES`. */
export const CLOUD_SHAPES = 3;

/** The box the clouds drift in. */
export interface CloudField {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The field over a world of `bounds`: the world and `SKY_CLOUDS.margin` round it. */
export function cloudField(bounds: { minX: number; minY: number; maxX: number; maxY: number }): CloudField {
  const m = SKY_CLOUDS.margin;
  return { minX: bounds.minX - m, minY: bounds.minY - m, maxX: bounds.maxX + m, maxY: bounds.maxY + m };
}

/**
 * A whole number from nought to `HASH` from a cloud's index and a salt: whole and small, so it is returned unboxed and
 * `cloudAt`, which reads six a cloud every frame, makes nothing. Divided by `HASH`, a number in [0, 1).
 */
function hash(i: number, salt: number): number {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 8) & 0xffffff;
}
const HASH = 0x1000000;

/**
 * Writes cloud `i`'s matrix at time `t` (seconds of game time) into `out` at offset `o`: where it is, drifted on the
 * wind and wrapped round the field, turned, and scaled to its size, or to nothing near the field's edge. Makes nothing.
 */
export function cloudAt(field: CloudField, i: number, t: number, out: Float32Array, o = 0): void {
  NOW[0] = t;
  cloudNow(field, i, out, o);
}

/**
 * The time `cloudNow` places a cloud at. It goes by this array and not as an argument: a time handed on from a loop to
 * a function that is not inlined is boxed on the heap each call, and `placeClouds` calls it for every cloud a frame.
 */
const NOW = new Float64Array(1);

/** `cloudAt` at the time in `NOW`. */
function cloudNow(field: CloudField, i: number, out: Float32Array, o: number): void {
  const t = NOW[0];
  const w = field.maxX - field.minX,
    h = field.maxY - field.minY;
  // read by index and not taken apart, since taking an array apart can make an iterator each call
  const wx = SKY_CLOUDS.wind[0],
    wy = SKY_CLOUDS.wind[1];
  // and not `Math.hypot`, which is handed its numbers boxed
  const l = Math.sqrt(wx * wx + wy * wy);
  const go = SKY_CLOUDS.drift * t;
  let x = (1 / HASH) * hash(i, 1) * w + (wx / l) * go,
    y = (1 / HASH) * hash(i, 2) * h + (wy / l) * go;
  x -= Math.floor(x / w) * w;
  y -= Math.floor(y / h) * h;
  const z0 = SKY_CLOUDS.height[0],
    z1 = SKY_CLOUDS.height[1],
    s0 = SKY_CLOUDS.size[0],
    s1 = SKY_CLOUDS.size[1];
  const z = z0 + (1 / HASH) * hash(i, 3) * (z1 - z0);
  const edge = Math.min(x, w - x, y, h - y);
  const grow = Math.min(1, edge / SKY_CLOUDS.fade);
  const s = (s0 + (1 / HASH) * hash(i, 4) * (s1 - s0)) * grow * grow * (3 - 2 * grow);
  // a cloud is longer along the wind than across it, so it is turned about the wind's way, give or take
  const yaw = Math.atan2(wy, wx) + ((1 / HASH) * hash(i, 5) - 0.5) * 1.2;
  const c = Math.cos(yaw),
    n = Math.sin(yaw);
  // flatter as well as smaller the bigger it is, as a fair-weather cloud is
  const sz = s * (0.75 + 0.25 * (1 / HASH) * hash(i, 6));
  out[o] = c * s;
  out[o + 1] = n * s;
  out[o + 2] = 0;
  out[o + 3] = 0;
  out[o + 4] = -n * s;
  out[o + 5] = c * s;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = 0;
  out[o + 9] = 0;
  out[o + 10] = sz;
  out[o + 11] = 0;
  out[o + 12] = field.minX + x;
  out[o + 13] = field.minY + y;
  out[o + 14] = z;
  out[o + 15] = 1;
}

/**
 * Writes every cloud's matrix at time `t` into the shape it is drawn as: `out[k]` holds the clouds of shape `k`, in
 * order, `cloudsOfShape(k)` of them. Makes nothing.
 */
export function placeClouds(field: CloudField, t: number, out: readonly Float32Array[]): void {
  NOW[0] = t;
  for (let i = 0; i < SKY_CLOUDS.count; i++)
    cloudNow(field, i, out[i % CLOUD_SHAPES], Math.floor(i / CLOUD_SHAPES) * 16);
}

/** How many clouds are drawn as shape `k`. */
export function cloudsOfShape(k: number): number {
  return Math.floor((SKY_CLOUDS.count - k + CLOUD_SHAPES - 1) / CLOUD_SHAPES);
}

/**
 * A cloud a unit long along x, to be scaled: a heap of faceted white lumps, the biggest in the middle and a few smaller
 * round it and on top, flattened underneath, as a fair-weather cumulus is flat at its base. Golf's cloud is a row of
 * four lumps seen from the side; this one is seen from below and above as well, so it is a heap and not a row.
 */
export function cloudMesh(shape: number): Mesh {
  const random = seeded(shape * 2203 + 4);
  return built((b) => {
    const lumps = 6 + (shape % 2);
    for (let k = 0; k < lumps; k++) {
      const middle = k === 0;
      const a = random() * Math.PI * 2;
      const out = middle ? 0 : 0.18 + random() * 0.26;
      const r = middle ? 0.34 : 0.17 + random() * 0.14;
      const x = Math.cos(a) * out * 1.3,
        y = Math.sin(a) * out * 0.7;
      const z = middle ? 0.02 : r * 0.1 + random() * 0.08;
      lump(b, at(x, y, z), random, 3, 7, [r * 1.15, r, r * 0.8], { give: 0.1, floor: -r * 0.12 });
    }
  });
}

/**
 * The box the sun's shadow map is fitted to for a camera looking at (x, y), written into `out`: the ground round it,
 * `reach` each way, stretched toward the sun far enough to take in every cloud whose shadow can fall there, and up to
 * the highest cloud's top. A box no bigger than that keeps the map's depth bias small: the renderer's bias is a share
 * of the box's depth along the light, and a box round the whole world up to the clouds would be some three units of it,
 * which loses the rover's own shadow; this one's is about one. Snapped to `snap` units, so the map moves only when the camera has
 * moved that far, and its shadows do not swim. `low` is the lowest ground the box must hold.
 */
export function sunBoxAround(
  x: number,
  y: number,
  out: { min: [number, number, number]; max: [number, number, number] },
  { reach = 160, low = -20, snap = 32 } = {},
): void {
  const top = SKY_CLOUDS.height[1] + SKY_CLOUDS.size[1] * 0.35;
  const l = Math.hypot(SUN[0], SUN[1], SUN[2]);
  // how far along the ground toward the sun a cloud at the top stands over the ground its shadow falls on
  const run = (top * Math.hypot(SUN[0], SUN[1])) / SUN[2];
  const dx = ((SUN[0] / l / Math.hypot(SUN[0] / l, SUN[1] / l)) * run) | 0,
    dy = ((SUN[1] / l / Math.hypot(SUN[0] / l, SUN[1] / l)) * run) | 0;
  const sx = Math.round(x / snap) * snap,
    sy = Math.round(y / snap) * snap;
  out.min[0] = sx - reach + Math.min(0, dx);
  out.min[1] = sy - reach + Math.min(0, dy);
  out.min[2] = low;
  out.max[0] = sx + reach + Math.max(0, dx);
  out.max[1] = sy + reach + Math.max(0, dy);
  out.max[2] = top;
}
