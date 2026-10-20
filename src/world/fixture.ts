/**
 * A small world made by hand, 32 tiles a side, with one of each thing the
 * real world has: a ramp the rover climbs, a bank too steep for it, a ledge
 * it cannot get up, a pond shallow at its rim and deep in its middle, rock,
 * a cottage, a road, sand and mud, and two biomes meeting. It is for the
 * tests of everything that reads a world, so they do not wait on the real
 * one, and so a test can say exactly where each thing is.
 */
import { BIOME, BIOMES, CHUNK, SURFACE, TILE, type Placement, type WorldMap } from './types';

export const FIXTURE_TILES = CHUNK;

/** Where each thing is, in tiles, inclusive: [x0, y0, x1, y1]. */
export const FIXTURE = {
  /** Rises one and a half units a tile eastward, about 14°, to a plateau. */
  ramp: [4, 20, 8, 27],
  plateau: [9, 20, 11, 27],
  /** Falls 2.9 units a tile eastward off the plateau, about 26°: too steep. */
  bank: [12, 20, 13, 27],
  /** A terrace standing 2 units: a wall. */
  ledge: [20, 20, 27, 27],
  /** Shallow rim round a deep middle. */
  pond: [4, 4, 11, 11],
  deep: [6, 6, 9, 9],
  rock: [16, 4, 17, 11],
  /** The cottage's footprint. */
  cottage: [24, 8, 25, 9],
  /** A dirt road the width of the world. */
  road: [0, 15, 31, 16],
  sand: [12, 4, 13, 11],
  mud: [20, 12, 23, 13],
} as const;

export const FIXTURE_WATER = -1;

/** A lamp post's radius, in units: one stands north of the road, in the middle of the world. */
export const LAMP_RADIUS = 0.6;

/** How tall the rock and the cottage stand, in units. */
export const ROCK_TOP = 8;
export const COTTAGE_TOP = 60;

/** The plateau's height, in units. */
export const PLATEAU = 7.5;

function inside(r: readonly number[], tx: number, ty: number): boolean {
  return tx >= r[0] && ty >= r[1] && tx <= r[2] && ty <= r[3];
}

/** The middle of a tile, in units. */
export function fixtureAt(tx: number, ty: number): [number, number] {
  const origin = -(FIXTURE_TILES * TILE) / 2;
  return [origin + (tx + 0.5) * TILE, origin + (ty + 0.5) * TILE];
}

export function fixtureWorld(): WorldMap {
  const n = FIXTURE_TILES,
    origin = -(n * TILE) / 2;
  const terrain = new Float32Array(n * n),
    steps = new Float32Array(n * n),
    solid = new Uint8Array(n * n),
    surface = new Uint8Array(n * n),
    tops = new Float32Array(n * n),
    biomes = new Uint8Array(n * n * BIOMES);
  const F = FIXTURE;
  for (let ty = 0; ty < n; ty++)
    for (let tx = 0; tx < n; tx++) {
      const t = ty * n + tx;
      // the hill's profile west to east, eased down over four rows north and south of it,
      // since tiles side by side may differ by no more than half a tile
      const rows = Math.min(1, Math.max(0, (ty - F.ramp[1] + 4) / 4), Math.max(0, (F.ramp[3] + 4 - ty) / 4));
      let hill = 0;
      if (tx >= F.ramp[0] && tx <= F.ramp[2]) hill = 1.5 * (tx - F.ramp[0]);
      else if (tx >= F.plateau[0] && tx <= F.plateau[2]) hill = PLATEAU;
      else if (tx >= F.bank[0] && tx <= F.bank[2]) hill = PLATEAU - 2.9 * (tx - F.bank[0] + 1);
      terrain[t] = hill * rows;
      if (inside(F.deep, tx, ty)) terrain[t] = -3;
      else if (inside(F.pond, tx, ty)) terrain[t] = -1.6;
      if (inside(F.ledge, tx, ty)) steps[t] = 2;
      if (inside(F.rock, tx, ty) || inside(F.cottage, tx, ty)) solid[t] = 1;
      if (inside(F.rock, tx, ty)) tops[t] = ROCK_TOP;
      if (inside(F.cottage, tx, ty)) tops[t] = COTTAGE_TOP;
      if (inside(F.rock, tx, ty)) surface[t] = SURFACE.stone;
      else if (inside(F.road, tx, ty)) surface[t] = SURFACE.dirt;
      else if (inside(F.sand, tx, ty)) surface[t] = SURFACE.sand;
      else if (inside(F.mud, tx, ty)) surface[t] = SURFACE.mud;
      // meadow in the west, pine in the east, shared across the four middle columns
      const east = Math.min(1, Math.max(0, (tx - 14) / 4));
      const pine = Math.round(east * 255);
      biomes[t * BIOMES + BIOME.meadow] = 255 - pine;
      biomes[t * BIOMES + BIOME.pine] = pine;
    }

  const at = (tx: number, ty: number, kind: Placement['kind'], biome: Placement['biome']): Placement => {
    const [x, y] = fixtureAt(tx, ty);
    return { kind, x, y, z: 0, yaw: 0, scale: 1, biome, vary: 0.5 };
  };
  const [cx, cy] = fixtureAt(F.cottage[0] + 0.5, F.cottage[1] + 0.5);
  const placements: Placement[] = [
    at(2, 2, 'broadleaf', BIOME.meadow),
    at(28, 2, 'conifer', BIOME.pine),
    at(2, 29, 'bush', BIOME.meadow),
    at(29, 13, 'boulder', BIOME.pine),
    { kind: 'cottage', x: cx, y: cy, z: 0, yaw: 0, scale: 1, biome: BIOME.pine, vary: 0.5 },
  ];
  const [r0x, ry] = fixtureAt(0, 15.5),
    [r1x] = fixtureAt(31, 15.5);
  const [sx, sy] = fixtureAt(15.5, 15.5);
  return {
    grid: { cols: n, rows: n, originX: origin, originY: origin, tile: TILE },
    terrain,
    steps,
    solid,
    surface,
    biomes,
    waterLevel: FIXTURE_WATER,
    plazas: [],
    obstacles: Float32Array.from([...fixtureAt(16, 18), LAMP_RADIUS]),
    tops,
    roads: [{ points: new Float32Array([r0x, ry, r1x, ry]), width: 2 * TILE }],
    placements,
    landmarks: [
      { name: 'start', kind: 'start', x: sx, y: sy },
      { name: 'plateau', kind: 'summit', ...xy(fixtureAt(10, 24)) },
      { name: 'pond', kind: 'lake', ...xy(fixtureAt(7.5, 7.5)) },
    ],
    start: { x: sx, y: sy, yaw: 0 },
  };
}

function xy([x, y]: [number, number]) {
  return { x, y };
}
