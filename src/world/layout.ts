/**
 * The world as it was laid out by hand: where the river runs, where the
 * hills, the lake, the village and the ruins are, which way the roads go and
 * what each place is called. Everything here is in tiles, from the
 * south-west corner, x east and y north, so a place can be found on the map
 * by eye; `generate.ts` turns it into ground, and the seeded noise only adds
 * the detail between these points. A place is moved here, and nowhere else.
 *
 * The shape of it: mountains on the west, the north and the north-east, a
 * deep lake, the Mere, filling the south-east corner, and a river coming down
 * out of a gorge in the north mountains and winding south-east into it. The
 * village sits on a low rise west of the river. Pine woods climb to the
 * north-west, an autumn wood fills the south-west, and heath covers the high
 * ground east of the river, where Beacon Hill stands with the old tower on
 * its top.
 */
import { BIOME, type Biome, type Kind } from './types';

export type Point = readonly [number, number];

/** Tiles a side. At 6 units a tile that is 192 m across. */
export const COLS = 320;
export const ROWS = 320;

/** The one level every lake, pond and river stands at. */
export const WATER_LEVEL = 0;

/** The world's own seed, for its noise and its scattering: one world, the same each game. */
export const WORLD_SEED = 0x5ba99;

/** A body of water's depth across it: shallow for `shelf` tiles in from the shore, then deep. */
export interface WaterShape {
  shelf: number;
  /** The bed in the deep middle, below the water level. */
  deep: number;
  /** How fast the dry shore rises from the water, units a tile: a beach is gentle. */
  shore: number;
  /** How far from the water, in tiles, the shore is shaped; past it the land is as it was. */
  reach: number;
}

export const RIVER = {
  name: 'the river',
  /** From beyond the north edge, through the gorge, to its mouth in the Mere. */
  points: [
    [150, 334],
    [149, 306],
    [143, 284],
    [146, 264],
    [157, 249],
    [169, 233],
    [170, 214],
    [161, 197],
    [163, 179],
    [178, 164],
    [196, 152],
    [207, 136],
    [206, 118],
    [215, 104],
    [233, 94],
    [252, 86],
  ] as Point[],
  /** Half its width, in tiles, at its source and at its mouth. */
  halfWidth: [4.6, 6],
  water: { shelf: 2.2, deep: -3.4, shore: 0.9, reach: 12 } satisfies WaterShape,
};

/** A lake, as overlapping discs [x, y, radius]: the Mere runs off the south and east edges. */
export interface Lake {
  name: string;
  discs: readonly (readonly [number, number, number])[];
  water: WaterShape;
  /** How much the shore wanders, in tiles. */
  ragged: number;
}

export const LAKES: Lake[] = [
  {
    name: 'the mere',
    discs: [
      [272, 62, 36],
      [302, 34, 42],
      [308, 82, 30],
      [302, 110, 16],
      [244, 74, 18],
      [230, 12, 24],
      [262, 10, 22],
      [204, 6, 14],
    ],
    water: { shelf: 4, deep: -4.5, shore: 0.55, reach: 18 },
    ragged: 4,
  },
  { name: 'mill pond', discs: [[121, 116, 8]], water: { shelf: 2.5, deep: -2.4, shore: 0.6, reach: 7 }, ragged: 1.5 },
  { name: 'black tarn', discs: [[92, 276, 9]], water: { shelf: 2, deep: -2.8, shore: 0.9, reach: 7 }, ragged: 2 },
  { name: 'heath pool', discs: [[290, 214, 7]], water: { shelf: 2, deep: -2.2, shore: 0.7, reach: 6 }, ragged: 1.5 },
];

/**
 * A hill: a dome `peak` units high and `radius` tiles round. `steep` pulls
 * one side in toward the middle, to a share of the radius, so that side is a
 * bank too steep to climb; `terraces` cuts flat shelves and steep risers into
 * the sides facing a way, every `spacing` units of height.
 */
export interface Hill {
  name: string;
  x: number;
  y: number;
  radius: number;
  peak: number;
  steep?: { toward: Point; share: number };
  terraces?: { toward: Point; spacing: number; spread: number };
}

export const HILLS: Hill[] = [
  {
    name: 'beacon hill',
    x: 250,
    y: 232,
    radius: 50,
    peak: 46,
    steep: { toward: [1, 0.15], share: 0.55 },
    terraces: { toward: [0.1, -1], spacing: 9, spread: 0.35 },
  },
  { name: 'fort hill', x: 158, y: 64, radius: 32, peak: 24, steep: { toward: [0.1, 1], share: 0.34 } },
  { name: 'pine knoll', x: 58, y: 284, radius: 30, peak: 16 },
  { name: 'gorse down', x: 292, y: 178, radius: 28, peak: 14 },
  { name: 'witch hill', x: 36, y: 58, radius: 30, peak: 18 },
  { name: 'barrow', x: 102, y: 26, radius: 24, peak: 10 },
  { name: 'shepherd knoll', x: 128, y: 210, radius: 20, peak: 9 },
  { name: 'shore rise', x: 268, y: 146, radius: 24, peak: 11 },
  { name: 'village rise', x: 86, y: 160, radius: 54, peak: 5 },
];

/**
 * A scarp: a steep front along a line from `a` to `b`, the ground on its
 * left (looking from `a` to `b`) raised `height` units over `front` tiles,
 * held up for `depth` tiles back and eased down behind, and eased out over
 * `taper` tiles at each end, which is the way round it.
 */
export interface Scarp {
  name: string;
  a: Point;
  b: Point;
  height: number;
  front: number;
  depth: number;
  taper: number;
}

export const SCARPS: Scarp[] = [
  { name: 'river bluff', a: [146, 180], b: [147, 212], height: 10, front: 3, depth: 16, taper: 12 },
  { name: 'sheep scarp', a: [262, 162], b: [300, 152], height: 9, front: 3, depth: 14, taper: 10 },
];

/**
 * A ledge: rock standing `height` units proud of the ground on the left of
 * the line from `a` to `b`, a sheer face along the line. It runs back
 * `depth` tiles and its top eases down to the ground over `taper` tiles at
 * the ends and at the back, a step a tile no taller than the rover rolls
 * over, so there is a way up round each end.
 */
export interface Ledge {
  name: string;
  a: Point;
  b: Point;
  height: number;
  depth: number;
  taper: number;
}

export const LEDGES: Ledge[] = [
  { name: 'pine ledge', a: [36, 216], b: [74, 222], height: 4, depth: 14, taper: 6 },
  { name: 'mill ledge', a: [98, 90], b: [128, 84], height: 3.5, depth: 8, taper: 5 },
  { name: 'beacon shelf', a: [262, 278], b: [232, 268], height: 4, depth: 9, taper: 6 },
];

/** The village: its square, cobbled and level, and the start in it. */
export const VILLAGE = {
  name: 'village',
  x: 88,
  y: 158,
  /** Half the square's side, in tiles. */
  half: 7,
  /** How high the village stands. */
  level: 8,
  /** The chamfer cut off each corner of the square, in tiles, so it is not a box. */
  chamfer: 2.5,
  /** The road the rover starts on, just out of the square, facing out along it. */
  startRoad: 'east road',
  /** How far along that road from the square's edge it starts, in tiles. */
  startAlong: 4,
};

/** A built thing as the layout places it: tiles, and a heading in radians (0 is east). */
export interface Piece {
  kind: Kind;
  x: number;
  y: number;
  yaw: number;
  /** Its size against the kind's own; one if left out. */
  scale?: number;
  /** Turned to face the nearest road or the square instead, door first: its `yaw` is then ignored. */
  face?: boolean;
  /** A fenced garden plot behind it. */
  garden?: boolean;
}

const N = Math.PI / 2;

export const VILLAGE_PIECES: Piece[] = [
  { kind: 'church', x: 88, y: 171, yaw: 0 },
  { kind: 'well', x: 88, y: 159, yaw: 0.3 },
  // three sizes of cottage, each turned to the road or the square it stands on
  { kind: 'cottage', x: 75.5, y: 162, yaw: 0, face: true, scale: 1, garden: true },
  { kind: 'cottage', x: 75.5, y: 153, yaw: 0, face: true, scale: 0.86 },
  { kind: 'cottage', x: 101.5, y: 165, yaw: 0, face: true, scale: 1.12, garden: true },
  { kind: 'cottage', x: 102, y: 150, yaw: 0, face: true, scale: 0.86 },
  { kind: 'cottage', x: 79, y: 144, yaw: 0, face: true, scale: 1.12, garden: true },
  { kind: 'cottage', x: 96.5, y: 144, yaw: 0, face: true, scale: 1 },
  { kind: 'cottage', x: 112, y: 162.5, yaw: 0, face: true, scale: 0.86 },
  { kind: 'cottage', x: 114, y: 147.5, yaw: 0, face: true, scale: 1, garden: true },
  { kind: 'cottage', x: 80, y: 132, yaw: 0, face: true, scale: 1, garden: true },
  { kind: 'cottage', x: 95, y: 130, yaw: 0, face: true, scale: 0.86 },
  { kind: 'cottage', x: 73, y: 178, yaw: 0, face: true, scale: 1.12, garden: true },
  // market day on the square, and a farm's cart and rick by the lane south
  { kind: 'stall', x: 84, y: 155.5, yaw: 0.1 },
  { kind: 'stall', x: 92.5, y: 163, yaw: Math.PI + 0.15 },
  { kind: 'cart', x: 91.5, y: 153, yaw: 0.5 },
  { kind: 'haystack', x: 73, y: 128, yaw: 0 },
  { kind: 'cart', x: 89.5, y: 125.5, yaw: 1.9 },
];

/** Small things on the square, which the rover may brush: benches facing in, lamps at the corners. */
export const SQUARE_PROPS: Piece[] = [
  { kind: 'bench', x: 82.5, y: 160, yaw: 0 },
  { kind: 'bench', x: 93.5, y: 159, yaw: Math.PI },
  { kind: 'bench', x: 87, y: 164, yaw: -N },
  { kind: 'lamp', x: 82.4, y: 152.6, yaw: 0 },
  { kind: 'lamp', x: 94.2, y: 155, yaw: 0 },
  { kind: 'lamp', x: 83.5, y: 162.5, yaw: 0 },
  { kind: 'lamp', x: 88.5, y: 152.3, yaw: 0 },
  { kind: 'lamp', x: 106.5, y: 159.4, yaw: 0 },
  { kind: 'lamp', x: 85, y: 140, yaw: 0 },
];

/**
 * The finds between the places on the roads: a windmill on shepherd knoll,
 * an orchard in rows, a hay meadow fenced on two sides with its ricks, and
 * a great oak standing alone in a clearing. Each is a landmark, and the
 * scatter leaves room round it.
 */
export const WINDMILL = { name: 'windmill', x: 128, y: 211, yaw: 0.4, at: [127, 205] as Point };
export const ORCHARD = {
  name: 'orchard',
  x: 128,
  y: 129,
  /** Trees across and rows, and the spacing between them, in tiles. */
  across: 6,
  rows: 5,
  spacing: 3.6,
  yaw: 0.12,
};
export const HAY_MEADOW = {
  name: 'hay meadow',
  /** The field, its south-west corner and its size, in tiles. */
  x: 108,
  y: 178,
  w: 22,
  h: 16,
  ricks: [
    [113, 183],
    [119, 187],
    [125, 182],
    [115, 190],
    [124, 190],
  ] as Point[],
};
export const GREAT_OAK = { name: 'great oak', x: 214, y: 197, scale: 1.9, clearing: 9 };

/** Shallow pools in the wetland, laid like ponds but too small to name. [x, y, radius] */
export const PUDDLES: (readonly [number, number, number])[] = [
  // the marsh's pools
  [182, 138, 3],
  [190, 129, 2.6],
  [196, 137, 2.2],
  [184, 124, 3],
  [193, 120, 2.4],
  [176, 130, 2.2],
  // and a few along the river and the Mere
  [171, 146, 3],
  [181, 190, 2.5],
  [228, 104, 3],
  [137, 252, 2.5],
];

/**
 * The marsh: low wet ground on the river's west bank below the east ford,
 * laid level a little above the water, with its pools, mud flats, willows
 * and reeds. A place of its own, named, and the wetland's strongest.
 */
export const MARSH = { name: 'marsh', x: 187, y: 131, radius: 14, level: 1.3, at: [180, 134] as Point };

/** A ruin site: its pieces, the floor of old flags round it, and the landmark where it is seen from. */
export interface Ruin {
  name: string;
  x: number;
  y: number;
  /** The flagged floor's radius, in tiles. */
  floor: number;
  pieces: Piece[];
  /** Where the landmark is: inside the site, clear of every piece. */
  at: Point;
}

export const RUINS: Ruin[] = [
  {
    name: 'old tower',
    x: 250,
    y: 232,
    floor: 9,
    at: [244, 226],
    pieces: [
      { kind: 'tower', x: 251, y: 234, yaw: 0.2 },
      { kind: 'wall', x: 258, y: 240, yaw: 0.7 },
      { kind: 'wall', x: 243, y: 239, yaw: -0.6 },
      { kind: 'wall', x: 257, y: 225, yaw: -0.9 },
      { kind: 'column', x: 239, y: 230, yaw: 1.2 },
    ],
  },
  {
    name: 'pine chapel',
    x: 50,
    y: 250,
    floor: 8,
    at: [51, 249],
    pieces: [
      { kind: 'wall', x: 50, y: 254, yaw: 0.05 },
      { kind: 'wall', x: 44, y: 249, yaw: N + 0.05 },
      { kind: 'wall', x: 51, y: 244.5, yaw: 0.05 },
      { kind: 'arch', x: 58, y: 250, yaw: N },
    ],
  },
  {
    name: 'autumn arch',
    x: 60,
    y: 78,
    floor: 6,
    at: [64, 80],
    pieces: [
      { kind: 'arch', x: 60, y: 78, yaw: 0.6 },
      { kind: 'wall', x: 54, y: 73, yaw: 0.6 },
      { kind: 'column', x: 67, y: 74, yaw: -0.3 },
    ],
  },
  {
    name: 'fort hill',
    x: 158,
    y: 61,
    floor: 8,
    at: [158, 61],
    // five walls round a ring, gaps between them wide enough to drive through
    pieces: [
      { kind: 'wall', x: 158, y: 68.5, yaw: 0 },
      { kind: 'wall', x: 165.1, y: 63.3, yaw: 1.885 },
      { kind: 'wall', x: 162.4, y: 54.9, yaw: 0.628 },
      { kind: 'wall', x: 153.6, y: 54.9, yaw: -0.628 },
      { kind: 'wall', x: 150.9, y: 63.3, yaw: 1.257 },
      { kind: 'column', x: 157, y: 58.5, yaw: 2.4 },
    ],
  },

  {
    name: 'lakeside columns',
    x: 247,
    y: 128,
    floor: 7,
    at: [244, 131],
    pieces: [
      { kind: 'column', x: 249, y: 126, yaw: 0.4 },
      { kind: 'column', x: 252, y: 131, yaw: 1.9 },
      { kind: 'column', x: 244, y: 124, yaw: -0.8 },
      { kind: 'wall', x: 253, y: 124, yaw: N - 0.3 },
    ],
  },
  {
    name: 'standing stones',
    x: 205,
    y: 277,
    // no flagged floor: the stones stand in the heather
    floor: 0,
    at: [205, 277],
    pieces: Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2 + 0.2;
      return {
        kind: 'menhir' as const,
        x: 205 + 6.5 * Math.cos(a),
        y: 277 + 6.5 * Math.sin(a),
        yaw: a + 0.3 * (k % 2),
      };
    }),
  },
];

/** A road: its points by hand, and its width in tiles. Where it meets the river it fords it. */
export interface RoadPlan {
  name: string;
  width: number;
  points: Point[];
}

export const ROADS: RoadPlan[] = [
  {
    name: 'east road',
    width: 2.6,
    points: [
      [95, 158],
      [104, 157],
      [120, 153],
      [140, 149],
      [158, 151],
      [171, 158],
      [180, 165],
      [190, 172],
      [205, 176],
      [222, 178],
      [238, 182],
    ],
  },
  {
    name: 'beacon road',
    width: 2.2,
    points: [
      [238, 182],
      [231, 197],
      [227, 213],
      [229, 229],
      [236, 242],
      [246, 248],
      [254, 245],
      [256, 239],
    ],
  },
  {
    name: 'north road',
    width: 2.2,
    points: [
      [82, 164],
      [80, 180],
      [88, 198],
      [100, 214],
      [118, 228],
      [136, 240],
      [148, 246],
      [158, 251],
      [172, 258],
      [190, 262],
      [212, 260],
      [229, 253],
      [236, 242],
    ],
  },
  {
    name: 'pine track',
    width: 1.8,
    points: [
      [100, 214],
      [86, 226],
      [70, 240],
      [58, 248],
      [51, 249],
    ],
  },
  {
    name: 'tarn path',
    width: 1.6,
    points: [
      [51, 249],
      [56, 260],
      [68, 270],
      [82, 268],
      [98, 264],
      [110, 249],
      [118, 228],
    ],
  },
  {
    name: 'witch path',
    width: 1.6,
    points: [
      [68, 92],
      [54, 84],
      [44, 72],
      [38, 60],
      [48, 50],
      [62, 52],
      [72, 62],
    ],
  },
  {
    name: 'south road',
    width: 2.2,
    points: [
      [88, 151],
      [87, 136],
      [84, 120],
      [76, 104],
      [67, 89],
      [64, 80],
      [72, 62],
      [90, 48],
      [115, 41],
      [138, 43],
      [150, 50],
      [156, 60],
    ],
  },
  {
    name: 'lake track',
    width: 1.8,
    points: [
      [205, 176],
      [220, 161],
      [235, 146],
      [244, 133],
    ],
  },
  {
    name: 'ford track',
    width: 1.8,
    points: [
      [138, 43],
      [158, 38],
      [176, 50],
      [186, 76],
      [193, 100],
      [198, 118],
      [207, 122],
      [222, 126],
      [244, 131],
    ],
  },
];

/** The fords, where a road crosses the river, named for the landmarks. */
export const FORDS: { name: string; road: string; near: Point }[] = [
  { name: 'north ford', road: 'north road', near: [156, 250] },
  { name: 'east ford', road: 'east road', near: [177, 163] },
  { name: 'south ford', road: 'ford track', near: [206, 122] },
];

/** Summits named for the landmarks: the hill's top. */
export const SUMMITS = ['beacon hill', 'fort hill', 'pine knoll', 'witch hill'];

/** Where each wooded biome is, as discs [x, y, radius]; the wetland follows the water, and the meadow is the rest. */
export const BIOME_DISCS: { biome: Biome; discs: readonly (readonly [number, number, number])[] }[] = [
  {
    biome: BIOME.pine,
    discs: [
      [52, 256, 70],
      [128, 300, 40],
      [22, 196, 36],
      [104, 268, 30],
      [302, 284, 34],
      [178, 300, 22],
    ],
  },
  {
    biome: BIOME.autumn,
    discs: [
      [48, 70, 66],
      [112, 30, 40],
      [24, 130, 28],
      [142, 96, 20],
      [196, 236, 20],
    ],
  },
  {
    biome: BIOME.wetland,
    discs: [[187, 131, 12]],
  },
  {
    biome: BIOME.heath,
    discs: [
      [254, 234, 62],
      [158, 62, 30],
      [294, 176, 36],
      [214, 290, 30],
    ],
  },
];

/**
 * The banks and ledges the rover cannot climb, each named, each with a place
 * below it and a place above it a straight drive apart, which the test
 * holds: the straight drive fails, and the drive graph still joins the two
 * another way.
 */
export const BANKS: { name: string; below: Point; above: Point }[] = [
  { name: 'beacon crags', below: [290, 236], above: [270, 234] },
  { name: 'beacon terraces', below: [250, 190], above: [250, 198] },
  { name: 'fort hill scarp', below: [163, 80], above: [163, 64] },
  { name: 'river bluff', below: [152, 196], above: [140, 196] },
  { name: 'pine ledge', below: [55, 212], above: [55, 222] },
  { name: 'mill ledge', below: [113, 83], above: [113, 91] },
  { name: 'beacon shelf', below: [247, 277], above: [247, 270] },
  { name: 'sheep scarp', below: [281, 150], above: [282, 162] },
];
