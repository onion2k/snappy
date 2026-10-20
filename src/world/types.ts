/**
 * The world's shape, said once: what a map of it holds, and what the rover,
 * the scene and the tests may ask of the ground. The world's generator
 * fills a `WorldMap`; everything else reads one through `Ground`, so the
 * rover is tested on a small fixture and drives the real world unchanged.
 *
 * Units are the renderer's: a unit is 10 cm (`MM_PER_UNIT` is 100), z is up.
 */

/** A tile's side, in units: 60 cm. The physics lets neighbours differ by half this, a slope of 1 in 2. */
export const TILE = 6;

/** Tiles a chunk is on a side: the scene draws and swaps scenery a chunk at a time. */
export const CHUNK = 32;

/** What the ground is made of, one byte a tile. Tracks show on the soft kinds. */
export const SURFACE = {
  grass: 0,
  /** A road or a path: packed earth. */
  dirt: 1,
  sand: 2,
  mud: 3,
  /** Cobbles, flags, bare rock underfoot: nothing marks it. */
  stone: 4,
} as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];
export const SURFACES = 5;

/** Which ground marks a wheel leaves a track on. */
export function soft(surface: Surface): boolean {
  return surface !== SURFACE.stone;
}

/** The biomes, told apart by their trees and the tint of their ground. */
export const BIOME = { meadow: 0, pine: 1, autumn: 2, heath: 3, wetland: 4 } as const;
export type Biome = (typeof BIOME)[keyof typeof BIOME];
export const BIOMES = 5;

/** Everything that stands on the ground and is drawn from a kit: scenery, and what is built. */
export const KINDS = [
  'broadleaf',
  'conifer',
  'twisted',
  'bush',
  'fern',
  'reed',
  'flowers',
  'boulder',
  /** A drooping willow, the wetland's own tree. */
  'willow',
  /** Lily pads on still water. */
  'lily',
  /** An apple tree, planted in an orchard's rows. */
  'fruit',
  /** A flat stone across a ford, one of a line marking the way over. */
  'stepping',
  /** A marker post at a ford's edge. */
  'post',
  /** A signpost where roads meet, its arms turned down them. */
  'signpost',
  'bench',
  'lamp',
  'haystack',
  'cart',
  /** A market stall on the square. */
  'stall',
  'windmill',
  /** A standing stone, one of a ring. */
  'menhir',
  'cottage',
  'church',
  'well',
  'fence',
  'wall',
  'tower',
  'arch',
  'column',
] as const;
export type Kind = (typeof KINDS)[number];

/** The built kinds: solid to the rover, their footprint marked in `solid`. */
export const BUILT: ReadonlySet<Kind> = new Set<Kind>([
  'haystack',
  'cart',
  'stall',
  'windmill',
  'menhir',
  'cottage',
  'church',
  'well',
  'fence',
  'wall',
  'tower',
  'arch',
  'column',
]);

/** One thing standing in the world. */
export interface Placement {
  kind: Kind;
  x: number;
  y: number;
  /** The ground's height under it, so the scene does not sample it again. */
  z: number;
  yaw: number;
  /** Size against the kind's own: about 1. */
  scale: number;
  /** The biome it grew in, which picks its palette. */
  biome: Biome;
  /** A seeded 0..1 the kit uses to vary it (a tree's hue, a wall's breakage). */
  vary: number;
}

/**
 * Small things that stand on the ground and are not solid: the rover may
 * brush them, so they are kept off its routes rather than walled in.
 */
export const PROPS: ReadonlySet<Kind> = new Set<Kind>(['stepping', 'post', 'signpost', 'bench', 'lamp', 'lily']);

/** A paved place, the village square or a ruin's floor, as its outline: x, y pairs, anticlockwise, in units. */
export interface Plaza {
  outline: Float32Array;
  /** What it is paved with: cobbles for the square, broken flags for a ruin. */
  paving: 'cobbles' | 'flags';
}

/** A road, as a line through the middle and a width. */
export interface Road {
  /** x, y pairs, in units. */
  points: Float32Array;
  width: number;
}

export type LandmarkKind = 'village' | 'ruin' | 'ford' | 'lake' | 'summit' | 'find' | 'start';

/** A place worth finding, named so tests and reviewers can point at it. */
export interface Landmark {
  name: string;
  kind: LandmarkKind;
  x: number;
  y: number;
}

/** The tile grid, the same shape as the physics' own `Grid`. */
export interface Grid {
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  tile: number;
}

/**
 * The world, as the generator leaves it. Every per-tile array is `cols × rows`,
 * row by row from the south-west, and is never written after it is made.
 */
export interface WorldMap {
  grid: Grid;
  /** The smooth ground, one height a tile at its middle, smoothed by the physics' B-spline. */
  terrain: Float32Array;
  /** A height added to a whole tile: a ledge, a terrace, a cliff. A step taller than `DRIVE.step` is a wall. */
  steps: Float32Array;
  /** 1 where the rover may not go at all: rock, and what is built. */
  solid: Uint8Array;
  /** A `Surface` per tile. */
  surface: Uint8Array;
  /** Each biome's share of a tile, 0..255, `BIOMES` a tile: they sum to 255. */
  biomes: Uint8Array;
  /** The one level all the water stands at. */
  waterLevel: number;
  roads: Road[];
  /** The paved places. Roads that meet one stop at its edge. */
  plazas: Plaza[];
  /**
   * Small solid things, a lamp post, a signpost, a bench, too small to wall a
   * whole tile in: x, y and radius in units, three numbers each. The rover
   * slides off them as off a wall, and nothing may stand in one.
   */
  obstacles: Float32Array;
  /** How tall what stands on a solid tile is, above the ground, in units: a building's ridge, rock's top. Nought where nothing does. */
  tops: Float32Array;
  placements: Placement[];
  landmarks: Landmark[];
  /** Where the rover starts, and which way it faces. */
  start: { x: number; y: number; yaw: number };
}

/** What the rover may ask of the ground at a point. Nothing here allocates. */
export interface Ground {
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** The ground's height: the tile's step and the smooth terrain under the point. Not the water. */
  heightAt(x: number, y: number): number;
  /** The smooth terrain's slope, dh/dx and dh/dy, written to `out[0]` and `out[1]`. A step's face is not in it. */
  slopeAt(x: number, y: number, out: Float64Array): void;
  surfaceAt(x: number, y: number): Surface;
  /** How deep the water over the point is; nought where it is dry. */
  waterDepthAt(x: number, y: number): number;
  /** Whether the point is in rock or in something built, or off the world, or inside one of the small solid obstacles. */
  solidAt(x: number, y: number): boolean;
  /** The height of the top of whatever stands at the point: the ground, or the ridge of what is built on it. For the camera, which must not go inside a roof. */
  topAt(x: number, y: number): number;
}

/**
 * What the rover can drive over, said once, for the rover and for the
 * drive graph alike: a world is only proven reachable by the same rule the
 * rover moves by.
 */
export const DRIVE = {
  /** The steepest slope it climbs or goes down, in degrees. */
  maxSlope: 22,
  /** The tallest edge it rolls over, in units: a ledge taller than this is a wall. */
  step: 1,
  /** The deepest water it fords, in units. */
  shallow: 1.2,
  /** How far apart, in units, `canTravel` looks along a move. */
  probe: 0.5,
} as const;
