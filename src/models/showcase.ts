/**
 * A small world made for the models' preview, and for nothing else: 77 m a
 * side, with one of every biome, a river with a ford and its deep channel, a
 * lake, a pond, a hill with a ledge, rock, a village of cottages round a well
 * with its church, and ruins on the heath's hill, joined by dirt roads. The
 * fixture world is the tests' and a few tiles across; the real one is the
 * world builder's and not here yet; this is what the look is worked on
 * against until it is. Made from arithmetic alone, the same every time.
 */
import {
  BIOME,
  BIOMES,
  BUILT,
  SURFACE,
  TILE,
  type Biome,
  type Kind,
  type Placement,
  type Road,
  type WorldMap,
} from '../world/types';
import { groundOf } from '../world/ground';
import { BUILT_SIZE, type BuiltKind } from './built';

/** Tiles a side. */
export const SHOWCASE_TILES = 128;
const N = SHOWCASE_TILES;
const ORIGIN = -(N * TILE) / 2;
export const SHOWCASE_WATER = -1;

/** Where things are in the showcase, in units, for the preview's cameras. */
export const PLACES = {
  village: [-150, -135],
  well: [-150, -135],
  ford: [-112, -47],
  lake: [-250, -275],
  pond: [-40, 130],
  ruins: [200, -205],
  autumnHill: [215, 215],
  pine: [-230, 220],
  heath: [190, -150],
  meadow: [-40, 60],
  wetland: [-200, -40],
  start: [-118, -95],
} as const;

/** A small hash to [0, 1). */
function hash01(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

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

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The river's middle line, y at x. */
const riverY = (x: number) => -20 + 40 * Math.sin(x / 150);

/** The roads, as lines through their middles. */
const ROADS: [number, number][][] = [
  // the village north over the ford and into the pines
  [
    [-150, -135],
    [-125, -100],
    [-112, -47],
    [-104, 10],
    [-120, 90],
    [-170, 170],
    [-220, 260],
  ],
  // the village east along the river's south to the heath and its ruins
  [
    [-150, -135],
    [-80, -150],
    [0, -130],
    [80, -150],
    [150, -175],
    [195, -195],
  ],
  // a branch north across the meadow to the autumn wood, over the river at the second shallows
  [
    [0, -130],
    [30, -60],
    [52, 4],
    [80, 80],
    [150, 150],
    [200, 200],
  ],
];

/** How far (x, y) is from the nearest road's middle. */
function roadDistance(x: number, y: number): number {
  let best = Infinity;
  for (const road of ROADS)
    for (let k = 0; k + 1 < road.length; k++) {
      const [ax, ay] = road[k],
        [bx, by] = road[k + 1];
      const vx = bx - ax,
        vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
    }
  return best;
}

/** How shallow the river is kept at x: one at a ford, nought in the deep channel. */
const fordAt = (x: number) => Math.max(1 - smooth(14, 26, Math.abs(x + 112)), 1 - smooth(10, 22, Math.abs(x - 52)));

/** The ground's height at (x, y), before the steps. */
function heightOf(x: number, y: number): number {
  let h = 1.6 + 2.4 * (noise(x / 90, y / 90, 1) - 0.5) + 1.2 * (noise(x / 35, y / 35, 2) - 0.5);
  // the autumn wood's hill, and the heath's
  h += 26 * smooth(170, 40, Math.hypot(x - PLACES.autumnHill[0], y - PLACES.autumnHill[1]));
  h += 16 * smooth(150, 30, Math.hypot(x - PLACES.ruins[0], y - PLACES.ruins[1]));
  // a rise in the pines
  h += 9 * smooth(140, 20, Math.hypot(x - PLACES.pine[0], y - PLACES.pine[1]));
  h = Math.max(h, 0.2);
  // the river: a deep channel with shallow edges, kept shallow at the fords
  const d = Math.abs(y - riverY(x));
  const ford = fordAt(x);
  // the bed's middle: deep in the channel, and at a ford most of a rover's wheel under the water
  const bed = -6 * (1 - ford) - 1.75 * ford;
  const carve = 1 - Math.min(1, (d / 30) ** 2);
  if (carve > 0) h += (Math.min(h, bed) - h) * carve;
  // the lake and the pond
  const ld = Math.hypot(x - PLACES.lake[0], y - PLACES.lake[1]);
  h = Math.min(h, h - 7 * smooth(80, 30, ld));
  const pd = Math.hypot(x - PLACES.pond[0], y - PLACES.pond[1]);
  h = Math.min(h, h - 3.4 * smooth(26, 10, pd));
  // the roads are graded: a little flatter than the ground round them
  const rd = roadDistance(x, y);
  if (rd < 10 && carve <= 0) h = h * 0.85 + 0.15 * 1.6;
  return h;
}

/** Each biome's weight at (x, y), unnormalised, its regions blended over twenty to forty metres. */
function biomeWeights(x: number, y: number, out: Float64Array) {
  const river = Math.abs(y - riverY(x));
  const lake = Math.hypot(x - PLACES.lake[0], y - PLACES.lake[1]);
  const wobble = (noise(x / 60, y / 60, 9) - 0.5) * 60;
  out[BIOME.wetland] = Math.max(smooth(70, 30, river + wobble * 0.4) * (x < 40 ? 1 : 0.35), smooth(150, 80, lake));
  out[BIOME.pine] = smooth(-40, 40, -x + wobble) * smooth(40, 120, y + wobble);
  out[BIOME.autumn] = smooth(-20, 60, x + wobble) * smooth(40, 120, y - wobble);
  out[BIOME.heath] = smooth(40, 120, x - wobble) * smooth(-30, -100, y + wobble);
  out[BIOME.meadow] = 0.35;
}

/** The showcase's map. */
export function showcaseWorld(): WorldMap {
  const tops = new Float32Array(N * N);
  const terrain = new Float32Array(N * N),
    steps = new Float32Array(N * N),
    solid = new Uint8Array(N * N),
    surface = new Uint8Array(N * N),
    biomes = new Uint8Array(N * N * BIOMES);
  const w = new Float64Array(BIOMES);
  const centre = (t: number) => [ORIGIN + ((t % N) + 0.5) * TILE, ORIGIN + (Math.floor(t / N) + 0.5) * TILE] as const;
  for (let t = 0; t < N * N; t++) {
    const [x, y] = centre(t);
    terrain[t] = heightOf(x, y);
    // the autumn hill's top is a terrace a ledge high, and the heath's hill has a lower one on its north side
    if (Math.hypot(x - 230, y - 228) < 48) steps[t] = 3;
    if (Math.hypot(x - 250, y - 120) < 22) steps[t] = 2;
    biomeWeights(x, y, w);
    let sum = 0;
    for (let k = 0; k < BIOMES; k++) sum += w[k];
    let given = 0,
      most = 0;
    for (let k = 0; k < BIOMES; k++) {
      const share = Math.floor((w[k] / sum) * 255);
      biomes[t * BIOMES + k] = share;
      given += share;
      if (share > biomes[t * BIOMES + most]) most = k;
    }
    biomes[t * BIOMES + most] += 255 - given;
    // what the ground is made of
    const rd = roadDistance(x, y);
    const lake = Math.hypot(x - PLACES.lake[0], y - PLACES.lake[1]);
    const river = Math.abs(y - riverY(x));
    if (rd < 6) surface[t] = SURFACE.dirt;
    else if (Math.hypot(x - PLACES.village[0], y - PLACES.village[1]) < 22) surface[t] = SURFACE.dirt;
    else if (lake < 82 && lake > 50) surface[t] = SURFACE.sand;
    else if (river < 34 && river > 22 && fordAt(x) > 0.3) surface[t] = SURFACE.sand;
    else if (biomes[t * BIOMES + BIOME.wetland] > 150 && noise(x / 20, y / 20, 5) > 0.68 && terrain[t] > SHOWCASE_WATER)
      surface[t] = SURFACE.mud;
    // rock: outcrops on the heath and in the pines
    for (const [rx, ry, rr] of OUTCROPS)
      if (Math.hypot(x - rx, y - ry) < rr * (0.75 + 0.5 * noise(x / 12, y / 12, 6)) && rd > 10) {
        solid[t] = 1;
        surface[t] = SURFACE.stone;
      }
  }
  const placements: Placement[] = [];
  const built = (kind: BuiltKind, x: number, y: number, yaw: number, vary = 0.5) => {
    const p = place(kind, x, y, yaw, BIOME.meadow, vary, 1);
    placements.push(p);
    markSolid(p, solid, tops);
  };
  // the village: cottages round the square facing in, the well in the middle, the church to the east, fences
  built('well', PLACES.well[0], PLACES.well[1], 0.3);
  built('cottage', -200, -120, 0.1, 0.1);
  built('cottage', -185, -185, Math.PI / 3, 0.45);
  built('cottage', -120, -190, (Math.PI * 2) / 3, 0.8);
  built('cottage', -205, -60, -0.3, 0.6);
  built('church', -60, -185, Math.PI / 2 + 0.1);
  for (let k = 0; k < 5; k++) built('fence', -108 + k * 0.6, -118 - k * 11.6, 0.05, k / 5);
  for (let k = 0; k < 4; k++) built('fence', -96 - k * 11.8, -165 - k * 0.5, Math.PI / 2, k / 4);
  // the ruins on the heath's hill
  built('tower', 215, -215, 0.4, 0.2);
  built('arch', 170, -238, 0.2, 0.3);
  built('arch', 250, -170, 1.4, 0.9);
  built('wall', 185, -180, 0.5, 0.1);
  built('wall', 200, -165, 0.4, 0.5);
  built('wall', 240, -205, 1.9, 0.8);
  built('column', 240, -250, 0.7, 0.2);
  built('column', 160, -205, -0.4, 0.8);
  // a lone ruined wall in the pines, and a column in the autumn wood
  built('wall', -180, 240, 0.9, 0.4);
  built('column', 250, 150, 2.2, 0.6);
  scatter(placements, steps, solid, surface, biomes);
  const roads: Road[] = ROADS.map((r) => ({ points: new Float32Array(r.flat()), width: 12 }));
  const map: WorldMap = {
    grid: { cols: N, rows: N, originX: ORIGIN, originY: ORIGIN, tile: TILE },
    terrain,
    steps,
    solid,
    surface,
    biomes,
    waterLevel: SHOWCASE_WATER,
    roads,
    plazas: [{ outline: ring(PLACES.village[0], PLACES.village[1], 22, 12), paving: 'cobbles' }],
    tops,
    // nothing small stands free in the showcase: its lamps and benches are pictures, not obstacles
    obstacles: new Float32Array(0),
    placements,
    landmarks: [
      { name: 'village', kind: 'village', x: PLACES.village[0], y: PLACES.village[1] },
      { name: 'ruins', kind: 'ruin', x: PLACES.ruins[0], y: PLACES.ruins[1] },
      { name: 'ford', kind: 'ford', x: PLACES.ford[0], y: PLACES.ford[1] },
      { name: 'lake', kind: 'lake', x: PLACES.lake[0], y: PLACES.lake[1] },
      { name: 'start', kind: 'start', x: PLACES.start[0], y: PLACES.start[1] },
    ],
    start: { x: PLACES.start[0], y: PLACES.start[1], yaw: Math.PI / 2 },
  };
  const ground = groundOf(map);
  for (const p of placements) p.z = ground.heightAt(p.x, p.y);
  return map;
}

/** The outcrops, a middle and a radius each. */
const OUTCROPS: [number, number, number][] = [
  [128, -128, 20],
  [262, -112, 16],
  [-270, 180, 18],
  [-150, 290, 12],
  [300, 280, 16],
];

const tileOf = (x: number, y: number) => {
  const tx = Math.floor((x - ORIGIN) / TILE),
    ty = Math.floor((y - ORIGIN) / TILE);
  return tx < 0 || ty < 0 || tx >= N || ty >= N ? -1 : ty * N + tx;
};

/** A placement, its height to be read from the finished ground. */
function place(kind: Kind, x: number, y: number, yaw: number, biome: Biome, vary: number, scale: number): Placement {
  return { kind, x, y, z: 0, yaw, scale, biome, vary };
}

/** Marks solid every tile under a built placement's footprint. */
/** A ring of `n` points round (x, y), `r` out, anticlockwise: a plaza's outline. */
function ring(x: number, y: number, r: number, n: number): Float32Array {
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = x + Math.cos((i / n) * Math.PI * 2) * r;
    out[i * 2 + 1] = y + Math.sin((i / n) * Math.PI * 2) * r;
  }
  return out;
}

/** Marks solid every tile under a built placement's footprint, and how tall it stands there. */
function markSolid(p: Placement, solid: Uint8Array, tops: Float32Array) {
  const { hx, hy, height } = BUILT_SIZE[p.kind as BuiltKind];
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  for (let u = -hx; u <= hx; u += TILE / 2)
    for (let v = -hy; v <= hy; v += TILE / 2) {
      const t = tileOf(p.x + u * c - v * s, p.y + u * s + v * c);
      if (t >= 0) {
        solid[t] = 1;
        tops[t] = Math.max(tops[t], height * p.scale);
      }
    }
}

/** How likely each kind is on a tile of each biome: the woods thick, the meadow open, the heath sparse and stony. */
const GROWS: Record<Biome, [Kind, number][]> = {
  [BIOME.meadow]: [
    ['broadleaf', 0.035],
    ['bush', 0.04],
    ['flowers', 0.09],
    ['boulder', 0.008],
  ],
  [BIOME.pine]: [
    ['conifer', 0.2],
    ['fern', 0.16],
    ['boulder', 0.03],
    ['bush', 0.015],
  ],
  [BIOME.autumn]: [
    ['broadleaf', 0.16],
    ['conifer', 0.025],
    ['fern', 0.1],
    ['bush', 0.05],
  ],
  [BIOME.heath]: [
    ['twisted', 0.03],
    ['boulder', 0.07],
    ['bush', 0.07],
    ['flowers', 0.03],
    ['fern', 0.03],
  ],
  [BIOME.wetland]: [
    ['reed', 0.16],
    ['bush', 0.07],
    ['broadleaf', 0.025],
    ['flowers', 0.03],
  ],
};

/** The scenery: on every tile, by its biome's chances, at a spot jittered within it, kept off roads, water, rock and what is built. */
function scatter(out: Placement[], steps: Float32Array, solid: Uint8Array, surface: Uint8Array, biomes: Uint8Array) {
  const builtAt = out.filter((p) => BUILT.has(p.kind));
  for (let t = 0; t < N * N; t++) {
    const tx = t % N,
      ty = Math.floor(t / N);
    if (solid[t] || surface[t] === SURFACE.dirt || surface[t] === SURFACE.stone) continue;
    // the biome by chance, weighted by the tile's shares
    let pick = hash01(tx, ty, 21) * 255,
      biome: Biome = BIOME.meadow;
    for (let k = 0; k < BIOMES; k++) {
      if (pick < biomes[t * BIOMES + k]) {
        biome = k as Biome;
        break;
      }
      pick -= biomes[t * BIOMES + k];
    }
    let roll = hash01(tx, ty, 22);
    for (const [kind, chance] of GROWS[biome]) {
      if (roll >= chance) {
        roll -= chance;
        continue;
      }
      const x = ORIGIN + (tx + 0.15 + 0.7 * hash01(tx, ty, 23)) * TILE,
        y = ORIGIN + (ty + 0.15 + 0.7 * hash01(tx, ty, 24)) * TILE;
      const z = heightOf(x, y) + steps[t];
      const wet = SHOWCASE_WATER - z;
      // reeds stand in the shallows and at the edge, and nothing else in the water at all
      if (kind === 'reed' ? wet > 0.8 || wet < -1.2 : wet > -0.4) break;
      if (kind !== 'reed' && kind !== 'flowers' && roadDistance(x, y) < 12) break;
      if (
        builtAt.some(
          (b) =>
            Math.hypot(b.x - x, b.y - y) <
            Math.max(BUILT_SIZE[b.kind as BuiltKind].hx, BUILT_SIZE[b.kind as BuiltKind].hy) + 10,
        )
      )
        break;
      const grow = hash01(tx, ty, 25);
      const scale = kind === 'broadleaf' || kind === 'conifer' ? 0.75 + 0.5 * grow : 0.7 + 0.6 * grow;
      out.push(place(kind, x, y, hash01(tx, ty, 26) * Math.PI * 2, biome, hash01(tx, ty, 27), scale));
      break;
    }
  }
}

/**
 * A flat lawn for laying the kit out on, 64 tiles a side, one biome's ground all over (chosen by `biome`), and the
 * placements given: for the kit's and the built things' pictures, where nothing else should be in the way.
 */
export function labWorld(placements: Placement[], biome: Biome = BIOME.meadow): WorldMap {
  const n = 64;
  const origin = -(n * TILE) / 2;
  const biomes = new Uint8Array(n * n * BIOMES);
  for (let t = 0; t < n * n; t++) biomes[t * BIOMES + biome] = 255;
  return {
    grid: { cols: n, rows: n, originX: origin, originY: origin, tile: TILE },
    terrain: new Float32Array(n * n),
    steps: new Float32Array(n * n),
    solid: new Uint8Array(n * n),
    surface: new Uint8Array(n * n),
    biomes,
    waterLevel: -50,
    roads: [],
    plazas: [],
    tops: new Float32Array(n * n),
    obstacles: new Float32Array(0),
    placements,
    landmarks: [],
    start: { x: 0, y: 0, yaw: 0 },
  };
}
