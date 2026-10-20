/**
 * The world, made: the layout laid down as ground, water, rock and roads,
 * painted with biomes and surfaces, built on, mended where ground is cut
 * off from the start, and planted. It is one world, from the
 * layout and `WORLD_SEED`, the same to the byte every time it is made,
 * which `worldHash` holds.
 */
import { seeded } from '../random';
import { canTravel } from './drive';
import { buildings, placePiece, ROCK_TOP } from './built';
import { builtPieces, fordMarks, greatOak, orchard, poolLilies, props, village } from './finds';
import { fits, middle, spreadChecked, standing, tileAt } from './graph';
import { groundOf } from './ground';
import {
  COLS,
  FORDS,
  GREAT_OAK,
  HAY_MEADOW,
  HILLS,
  LAKES,
  MARSH,
  ORCHARD,
  ROWS,
  RUINS,
  SUMMITS,
  VILLAGE,
  WATER_LEVEL,
  WINDMILL,
  WORLD_SEED,
  BANKS,
  type Piece,
} from './layout';
import { memoGround } from './memo';
import { inClearing, placeOddities } from './oddities';
import { biomes, rock, strongest, surfaces } from './paint';
import { clipLine, inside, ruinOutline, squareOutline } from './plaza';
import { relief, type RoadLine } from './relief';
import { scatter } from './scatter';
import {
  BIOMES,
  SURFACE,
  TILE,
  type Biome,
  type Ground,
  type Kind,
  type Landmark,
  type Placement,
  type Plaza,
  type Road,
  type WorldMap,
} from './types';

export { WORLD_SEED } from './layout';

/** Where the grid's south-west corner is, so the world's middle is at 0, 0. */
export const ORIGIN_X = -(COLS * TILE) / 2;
export const ORIGIN_Y = -(ROWS * TILE) / 2;

/** What making the world found, for the tests and the map. */
export interface WorldStats {
  /** Standable tiles nothing could reach, turned to rock. */
  mended: number;
  /** Their tile indices, for the map to show. */
  mendedTiles: Int32Array;
  ms: number;
}

/** A point in the layout's tiles, in units. */
export function units(px: number, py: number): { x: number; y: number } {
  return { x: ORIGIN_X + px * TILE, y: ORIGIN_Y + py * TILE };
}

/** A line or an outline in the layout's tiles, in units. */
function inUnits(line: ArrayLike<number>): Float32Array {
  const out = new Float32Array(line.length);
  for (let i = 0; i < line.length; i += 2) {
    out[i] = ORIGIN_X + line[i] * TILE;
    out[i + 1] = ORIGIN_Y + line[i + 1] * TILE;
  }
  return out;
}

/**
 * Where the rover starts: on the start road, `startAlong` tiles out from
 * the square's edge where the road leaves it, facing on along the road, so
 * the first thing it sees is the way out and not the paving.
 */
function startOn(road: Float64Array): { x: number; y: number; yaw: number } {
  let walked = 0;
  for (let i = 2; i < road.length; i += 2) {
    const dx = road[i] - road[i - 2],
      dy = road[i + 1] - road[i - 1];
    walked += Math.sqrt(dx * dx + dy * dy);
    if (walked >= VILLAGE.startAlong) return { ...units(road[i], road[i + 1]), yaw: Math.atan2(dy, dx) };
  }
  return { ...units(road[road.length - 2], road[road.length - 1]), yaw: 0 };
}

/** The world and what making it found. */
export function generate(): { map: WorldMap; stats: WorldStats } {
  const began = performance.now();
  const seed = WORLD_SEED;
  const n = COLS * ROWS;
  const v = village();
  const r = relief(seed, v.paths);
  const biomeBytes = biomes(seed, r);
  const solid = new Uint8Array(n),
    tops = new Float32Array(n);
  rock(seed, r, biomeBytes, solid);
  for (let t = 0; t < n; t++) if (solid[t]) tops[t] = ROCK_TOP;
  // the plazas, in tiles: the square, and every ruin that has a floor
  const floors = RUINS.filter((ruin) => ruin.floor > 0);
  const outlines = [squareOutline(), ...floors.map((ruin) => ruinOutline(ruin, seed))];
  const surface = surfaces(seed, r, biomeBytes, solid, outlines);
  const plazas: Plaza[] = outlines.map((o, k) => ({ outline: inUnits(o), paving: k === 0 ? 'cobbles' : 'flags' }));
  // every road stops at a plaza's edge
  const roads: Road[] = [];
  for (const road of r.roads)
    for (const run of clipLine(road.line, outlines)) roads.push({ points: inUnits(run), width: road.half * 2 * TILE });
  const startRoad = r.roads.find((road) => road.name === VILLAGE.startRoad)!;
  const map: WorldMap = {
    grid: { cols: COLS, rows: ROWS, originX: ORIGIN_X, originY: ORIGIN_Y, tile: TILE },
    terrain: Float32Array.from(r.terrain),
    steps: Float32Array.from(r.steps),
    solid,
    surface,
    biomes: biomeBytes,
    waterLevel: WATER_LEVEL,
    roads,
    plazas,
    tops,
    obstacles: new Float32Array(0),
    placements: [],
    landmarks: [],
    start: startOn(clipLine(startRoad.line, outlines)[0]),
  };
  const ground = groundOf(map);
  const random = seeded(seed);
  const biomeAt = (x: number, y: number) => strongest(biomeBytes, tileAt(map, x, y)) as Biome;
  const built = buildings(builtPieces(v), ground, biomeAt, map.grid, solid, tops, random);

  // The small things, set before the mending, since the solid ones among them, the lamps, the signposts and the
  // benches, are obstacles the rover drives round, and the ground is read again with them in it.
  const small = smallThings(map, ground, r.roads, [
    ...props(),
    ...orchard(),
    greatOak(),
    ...v.beds,
    ...poolLilies(),
  ]).map((piece) => placePiece(piece, biomeAt(...xy(piece)), ORIGIN_X, ORIGIN_Y, ground, random));
  // the oddities, set by hand and drawing on a seed of their own; a gnome is an obstacle as a lamp is
  const odd = placeOddities(ground, map.waterLevel, units, biomeAt);
  map.obstacles = obstaclesOf(small.concat(odd));
  const solidGround = groundOf(map);

  // Mend: ground the rover fits on but that is cut off from the start, by water, rock or a bank all round
  // it, is turned to rock, so nothing is left out of reach. Which tiles the rover fits on and which touch is
  // quick to read; whether it can drive between two that touch is the drive graph's question, and slow, so
  // it is asked only on the mountains' broken ground, where it is not the same answer. The drive graph is
  // the tests' to make, and they hold the whole world to it.
  const memo = memoGround(map);
  const stand = standing(map, memo);
  const check = new Uint8Array(n);
  for (let ty = 1; ty < ROWS - 1; ty++)
    for (let tx = 1; tx < COLS - 1; tx++) {
      const t = ty * COLS + tx;
      if (!stand[t] || r.mountain[t] < 0.1) continue;
      for (let dy = -1; dy <= 1 && !check[t]; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (!stand[t + dy * COLS + dx]) {
            check[t] = 1;
            break;
          }
    }
  const reached = spreadChecked(map, memo, stand, check, tileAt(map, map.start.x, map.start.y));
  const mendedList: number[] = [];
  for (let t = 0; t < n; t++)
    if (stand[t] && !reached[t]) {
      mendedList.push(t);
      solid[t] = 1;
      surface[t] = SURFACE.stone;
      tops[t] = ROCK_TOP;
      stand[t] = 0;
    }

  map.landmarks = landmarks(map, r.roads, reached);
  // what is sown is cleared from round each oddity after the sowing, so the chance it is sown with is as it was
  const sown = scatter(map, solidGround, stand, r.roadDist, random, r.water).filter(
    (p) => !inClearing(p.kind, (p.x - ORIGIN_X) / TILE, (p.y - ORIGIN_Y) / TILE),
  );
  map.placements = built.concat(small, odd, sown);
  return {
    map,
    stats: { mended: mendedList.length, mendedTiles: Int32Array.from(mendedList), ms: performance.now() - began },
  };
}

function xy(piece: Piece): [number, number] {
  const p = units(piece.x, piece.y);
  return [p.x, p.y];
}

/**
 * What makes each small solid kind solid, at a scale of one: circles about
 * its foot, as x along its heading, y across it, and a radius, in units,
 * each a little wider than what is drawn there (the look's `props.ts`). A
 * lamp is its post's foot; a signpost its post; a bench, which runs along y,
 * three circles down its length.
 */
export const OBSTACLE: Partial<Record<Kind, readonly (readonly [number, number, number])[]>> = {
  lamp: [[0, 0, 0.9]],
  signpost: [[0, 0, 0.9]],
  /**
   * A garden gnome: his round base, half a metre tall, as wide as all of him, so the rover meets the barrow before the
   * orchard's gnome or the boots of the one asleep and not only his coat.
   */
  gnome: [[0, 0, 1.6]],
  bench: [
    [0, -3.4, 1.6],
    [0, 0, 1.6],
    [0, 3.4, 1.6],
  ],
};

/** The small solid things' circles, x, y and radius three numbers each, in units. */
export function obstaclesOf(placements: readonly Placement[]): Float32Array {
  const out: number[] = [];
  for (const p of placements) {
    const circles = OBSTACLE[p.kind];
    if (!circles) continue;
    const c = Math.cos(p.yaw),
      s = Math.sin(p.yaw);
    for (const [u, v, r] of circles)
      out.push(p.x + (u * c - v * s) * p.scale, p.y + (u * s + v * c) * p.scale, r * p.scale);
  }
  return Float32Array.from(out);
}

/**
 * The small things, each where it may stand: the props, the orchard, the
 * great oak, the garden beds, the lilies in the pools and the marks at each
 * ford. None is in something solid or on a road; none is in the water but a
 * stepping stone or a lily, and both of those are. A solid one stands only
 * with open dry ground on its four sides, so it never narrows a way to less than
 * the rover can pass.
 */
function smallThings(map: WorldMap, ground: Ground, roads: readonly RoadLine[], pieces: Piece[]): Piece[] {
  const wet = (px: number, py: number) => {
    const p = units(px, py);
    return ground.waterDepthAt(p.x, p.y) > 0.05;
  };
  const marks: Piece[] = [];
  for (const road of roads) {
    const points = road.ford.length;
    for (let i = 0; i < points; i++) {
      if (!road.ford[i] || (i > 0 && road.ford[i - 1])) continue;
      let j = i;
      while (j + 1 < points && road.ford[j + 1]) j++;
      marks.push(...fordMarks({ line: road.line, half: road.half, from: i, to: j }, wet));
    }
  }
  return [...pieces, ...marks].filter((piece) => {
    const p = units(piece.x, piece.y);
    const t = tileAt(map, p.x, p.y);
    if (t < 0 || map.solid[t] || map.surface[t] === SURFACE.dirt || faceAt(map, p.x, p.y)) return false;
    if (OBSTACLE[piece.kind]) {
      const tx = Math.floor(piece.x),
        ty = Math.floor(piece.y);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const u = (ty + dy) * COLS + tx + dx;
        if (map.solid[u] || wet(tx + dx + 0.5, ty + dy + 0.5)) return false;
      }
    }
    return piece.kind === 'stepping' || piece.kind === 'lily' ? wet(piece.x, piece.y) : !wet(piece.x, piece.y);
  });
}

/** The world. */
export function buildWorld(): WorldMap {
  return generate().map;
}

/** The reached tile nearest a point in the layout's tiles, dry if asked: where a landmark on ground that may be water or rock is put. */
function nearestReached(
  map: WorldMap,
  reached: Uint8Array,
  px: number,
  py: number,
  dry = false,
): { x: number; y: number } {
  const ground = groundOf(map);
  let best = -1,
    bestD = Infinity;
  const r = 60;
  for (let ty = Math.max(0, Math.floor(py - r)); ty < Math.min(ROWS, py + r); ty++)
    for (let tx = Math.max(0, Math.floor(px - r)); tx < Math.min(COLS, px + r); tx++) {
      const t = ty * COLS + tx;
      if (!reached[t]) continue;
      const d = (tx + 0.5 - px) ** 2 + (ty + 0.5 - py) ** 2;
      if (d >= bestD) continue;
      if (dry && ground.waterDepthAt(...middle(map, t)) > 0) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
  const [x, y] = middle(map, best);
  return { x, y };
}

/** Every named place: the start and the village, the ruins, the fords, the lakes and ponds, the summits, the finds. */
function landmarks(map: WorldMap, roads: readonly RoadLine[], reached: Uint8Array): Landmark[] {
  const out: Landmark[] = [];
  out.push({ name: 'start', kind: 'start', x: map.start.x, y: map.start.y });
  out.push({ name: VILLAGE.name, kind: 'village', ...units(VILLAGE.x + 4.5, VILLAGE.y - 1.5) });
  for (const ruin of RUINS) out.push({ name: ruin.name, kind: 'ruin', ...units(ruin.at[0], ruin.at[1]) });
  for (const ford of FORDS) {
    // the middle of the run of the road that is under water, nearest where the ford was meant to be
    const road = roads.find((r) => r.name === ford.road)!;
    let best = 0,
      bestD = Infinity;
    for (let i = 0; i < road.ford.length; i++) {
      if (!road.ford[i]) continue;
      const d = (road.line[2 * i] - ford.near[0]) ** 2 + (road.line[2 * i + 1] - ford.near[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    let a = best,
      b = best;
    while (a > 0 && road.ford[a - 1]) a--;
    while (b < road.ford.length - 1 && road.ford[b + 1]) b++;
    const mid = (a + b) >> 1;
    out.push({ name: ford.name, kind: 'ford', ...units(road.line[2 * mid], road.line[2 * mid + 1]) });
  }
  for (const lake of LAKES) {
    const [cx, cy] = lake.discs[0];
    // a lake is named from its shore, where it can be seen from, and not out in the water
    out.push({ name: lake.name, kind: 'lake', ...nearestReached(map, reached, cx, cy, true) });
  }
  for (const name of SUMMITS) {
    const hill = HILLS.find((h) => h.name === name)!;
    out.push({ name, kind: 'summit', ...nearestReached(map, reached, hill.x, hill.y) });
  }
  // the finds between: the windmill on its knoll, the orchard, the hay meadow and the great oak
  out.push({ name: WINDMILL.name, kind: 'summit', ...units(WINDMILL.at[0], WINDMILL.at[1]) });
  const o = ORCHARD;
  out.push({ name: o.name, kind: 'find', ...units(o.x + (o.across * o.spacing) / 2 - 1, o.y - 2) });
  const m = HAY_MEADOW;
  out.push({ name: m.name, kind: 'find', ...units(m.x + m.w / 2, m.y + m.h / 2 - 2) });
  out.push({ name: GREAT_OAK.name, kind: 'find', ...units(GREAT_OAK.x - 5, GREAT_OAK.y) });
  out.push({ name: MARSH.name, kind: 'find', ...units(MARSH.at[0], MARSH.at[1]) });
  return out;
}

/**
 * A hash of everything a world is, to the byte: its grid, every per-tile
 * array, the water, the plazas, the obstacles, the roads, the placements,
 * the landmarks and the start.
 * FNV-1a, 32 bits, as eight hex digits.
 */
export function worldHash(map: WorldMap): string {
  let h = 0x811c9dc5;
  const bytes = (a: ArrayBufferView) => {
    const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
  };
  const nums = (...xs: number[]) => bytes(Float64Array.from(xs));
  const text = (s: string) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  };
  const { grid } = map;
  nums(grid.cols, grid.rows, grid.originX, grid.originY, grid.tile, map.waterLevel, BIOMES);
  bytes(map.terrain);
  bytes(map.steps);
  bytes(map.solid);
  bytes(map.surface);
  bytes(map.biomes);
  bytes(map.tops);
  bytes(map.obstacles);
  for (const plaza of map.plazas) {
    text(plaza.paving);
    bytes(plaza.outline);
  }
  for (const road of map.roads) {
    nums(road.width);
    bytes(road.points);
  }
  for (const p of map.placements) {
    text(p.kind);
    nums(p.x, p.y, p.z, p.yaw, p.scale, p.biome, p.vary);
  }
  for (const l of map.landmarks) {
    text(l.name);
    text(l.kind);
    nums(l.x, l.y);
  }
  nums(map.start.x, map.start.y, map.start.yaw);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** How far ahead of a bank's view, in units, the chase camera looks: the face is to be there. */
export const BANK_LOOK = 20;

/**
 * Whether a point is on a face: bare stone that is not a plaza or a ford,
 * so the steep ground of a bank, the lip of a ledge, or the crags of bare
 * rock, but never what is built.
 */
export function faceAt(map: WorldMap, x: number, y: number): boolean {
  const t = tileAt(map, x, y);
  if (t < 0 || map.surface[t] !== SURFACE.stone) return false;
  if (map.solid[t] && map.tops[t] !== ROCK_TOP) return false;
  if (map.plazas.some((p) => inside(p.outline, x, y))) return false;
  return map.terrain[t] + map.steps[t] > map.waterLevel + 0.3;
}

/**
 * Where to look at each bank from: on ground the rover fits on, facing up
 * the line from its foot to its top, as near the face as lets the point
 * `BANK_LOOK` units ahead, where the chase camera looks, fall on the face,
 * so the face fills the middle and the top of the frame and rises away
 * from the rover. Walked from below the foot toward the top, and a tile or
 * three to the side where straight on is no good.
 */
export function bankViews(map: WorldMap): { name: string; x: number; y: number; yaw: number }[] {
  const ground = groundOf(map);
  return BANKS.map((b) => {
    const lo = units(b.below[0] + 0.5, b.below[1] + 0.5),
      hi = units(b.above[0] + 0.5, b.above[1] + 0.5);
    const len = Math.sqrt((hi.x - lo.x) ** 2 + (hi.y - lo.y) ** 2);
    const ux = (hi.x - lo.x) / len,
      uy = (hi.y - lo.y) / len;
    const yaw = Math.atan2(uy, ux);
    for (const side of [0, 1, -1, 2, -2, 3, -3])
      for (let u = -8 * TILE; u < len; u += 1) {
        const x = lo.x + ux * u - uy * side * TILE,
          y = lo.y + uy * u + ux * side * TILE;
        if (!fits(ground, x, y)) continue;
        if (!faceAt(map, x + ux * BANK_LOOK, y + uy * BANK_LOOK)) continue;
        if (canTravel(ground, x, y, hi.x - uy * side * TILE, hi.y + ux * side * TILE)) continue;
        return { name: b.name, x, y, yaw };
      }
    return { name: b.name, ...lo, yaw };
  });
}
