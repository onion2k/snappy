/**
 * The world as it is drawn: the ground a chunk at a time, the roads and the
 * paved places, the water, the grass, the scenery and what is built, the
 * windmill's sails, the backdrop past the edge, the clouds drifting over it
 * all, the tracks, and the rover. It is handed the map, the ground, and the
 * few calls of the renderer it draws through, and each frame what the camera
 * does and where the game is; it decides nothing of the game.
 *
 * Most of it never moves, and is handed over once. What depends on where
 * the camera looks (how finely each chunk of ground is meshed, and which
 * scenery is drawn whole, which as far trees and which not at all) is
 * chosen by `ChunkView` and changes only when the camera's target crosses
 * into another chunk: then the ground is handed over again from meshes made
 * a frame at a time before they were wanted, and the scenery's pools
 * refilled, into groups whose room was fixed at boot. Each frame the rover
 * is posed, the clouds placed and the sails turned by game time, the tracks
 * laid and now and then faded, the grass pressed under the wheels, the sun's
 * shadow fitted to the view, a bush the rover is in pressed down, and what
 * stands between the camera and the rover, or fills the foot of the picture,
 * cut out of the way, all into arrays made once.
 */
import type { GameGroup, GameRenderer } from 'artshape-render/game/renderer';
import type { Box } from 'artshape-render/game/shadows';
import type { Mesh } from 'artshape-render/mesh/types';
import { backdropGroups, backdropOf } from './models/backdrop';
import { SAILS_HUB, windmillSails } from './models/built';
import {
  CLOUD_SHAPES,
  cloudField,
  cloudMesh,
  cloudsOfShape,
  placeClouds,
  sunBoxAround,
  type CloudField,
} from './models/clouds';
import { GRASS_OPTIONS, grassField } from './models/grass';
import { KitBatch, WATER_AT, farPieces, kindPieces, lowPieces, partColour } from './models/kit';
import { BIOME_GROUND, CLOUD, ROUGH, WATER } from './models/palette';
import { DETAIL_LAYER, detailTexels, pavingGroups, pavingOf } from './models/paving';
import { SLOTS, poseOf, poseRover, restPose, roverGroups } from './models/rover';
import { SIZE } from './models/scenery';
import {
  COLOUR_MAP,
  FAR_SCALE,
  chunkGroups,
  chunkMeshes,
  groundTexels,
  rockOf,
  worldSpan,
  type Lod,
} from './models/terrain';
import { waterGroups, waterMeshes } from './models/water';
import { ROVER, type Rover } from './rover';
import { TRACKS, type Tracks } from './tracks';
import { ChunkView, GROUND, KIT, RINGS, SightLine, WORK, frameWork, tallness } from './view';
import {
  BIOME,
  BUILT,
  CHUNK as CHUNK_SIDE,
  KINDS,
  SURFACE,
  type Ground,
  type Kind,
  type Placement,
  type WorldMap,
} from './world/types';

/** The calls of the renderer the scene draws through. */
export type Draws = Pick<
  GameRenderer,
  'setStatic' | 'setDynamic' | 'move' | 'tint' | 'setGrass' | 'press' | 'setSunShadow' | 'setGroundTexture'
>;

/** What the scene reads of the game each frame. */
export interface Played {
  rover: Rover;
  tracks: Tracks;
  /** Game time, in seconds. */
  t: number;
}

/** The levels of detail by `GROUND` number, and the ring each is drawn out to. */
const LODS: readonly Lod[] = ['near', 'mid', 'far'];
const LOD_RING = [RINGS.near, RINGS.mid, Infinity] as const;
/** The levels made ahead of need, finest first; the coarse level of every chunk too, which a chunk the camera leaves wants. */
const AHEAD = [GROUND.near, GROUND.mid, GROUND.far] as const;

/**
 * The tracks as drawn: a mark a little longer than a tyre is wide, lying a hair over the ground, the ground's own
 * colour darkened by `dark` (a deep rut's, so a track reads from the chase camera, review 1, 9), fading back to it over
 * `fade` seconds as it ages; their colours written again at most every `every` seconds, since a mark's fade over a
 * tenth of a second is too little to see and writing two thousand of them each frame is not.
 */
const MARK = { long: 0.75, wide: 0.55, lift: 0.12, dark: 0.45, fade: 45, every: 0.1 } as const;

/** The tracks' pool, as the tracks keep it: one group of marks with room for every one. */
const TRACKS_ROOM = TRACKS.capacity;

/** How quickly what is cut out of the camera's way goes and comes back, as the share of the way it goes in a second. */
const SHRINK_RATE = 7;

/**
 * How low a building is cut when it stands in the camera's way, in units: its walls' feet, a little over the rover's
 * height, so the rover is still seen to be stopped by it; how flat a bush is pressed while the rover is in it; and the
 * share of a tree's trunk left standing as a stump when its crown is taken out of the way.
 */
const CUT = { bush: 0.3 } as const;

/** How far over the rover's origin the sight line runs to, in units: the middle of its body, under its head. */
const AIM_HEIGHT = 2;

/** How wide the grass is pressed under each wheel, in units, how long it takes to stand again, and how dark it goes. */
const PRESS = { radius: 1.1, recovery: 25, shade: 0.62 } as const;

/** How fast a windmill's sails turn, in radians a second of game time: a lazy turn in a breeze. */
const SAILS_SPEED = 0.55;

/**
 * The sun's shadow map, fitted to the view: a square as wide as the camera's distance to the rover times `reach`,
 * held between `least` and `most`, its shadows fading out over the outer `fade` of it. Fitted, a texel of the map is a
 * few centimetres round the rover at the home zoom, where the whole world's box made it half a metre (review 1, 12).
 */
const SUN_FIT = { reach: 2.2, least: 90, most: 520, fade: 0.2 } as const;

/** The kinds that stand tall enough to be drawn as far trees past the ring drawn whole, and to be cut away. */
const TALL: ReadonlySet<Kind> = new Set<Kind>(['broadleaf', 'conifer', 'twisted', 'willow', 'fruit']);

/**
 * The rover in water: how far it is drawn sunk, as a share of a wheel's radius, once the water is `full` deep or more,
 * so the water stands at its hubs and it does not seem to float on the top (review 3, 8); and the rings that spread
 * from each wet wheel while it moves: how many there may be at once, how long one lasts, how often a wheel makes one,
 * how far one spreads, and the speed at which they are their full size.
 */
const WADE = { sink: 0.6, full: 0.3, rings: 36, life: 1.1, every: 0.14, spread: 2.6, fast: 8 } as const;

/** The dark disc of contact shade under the rover, half its length and width, in units, in its own group (review 3, 6). */
const CONTACT = { long: 2.3, wide: 1.8, lift: 0.06, colour: [0.05, 0.06, 0.07] as [number, number, number] } as const;

/** A flat disc of radius one facing up, in `n` sides, or a ring of it from `inner` out. */
function discMesh(n: number, inner = 0): Mesh {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    positions.push(Math.cos(a), Math.sin(a), 0, Math.cos(a) * inner, Math.sin(a) * inner, 0);
    normals.push(0, 0, 1, 0, 0, 1);
    const o = i * 2,
      q = ((i + 1) % n) * 2;
    indices.push(o, q, q + 1, o, q + 1, o + 1);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array((positions.length / 3) * 2),
    indices: new Uint32Array(indices),
  };
}

/** A flat mark of a track, a unit long along x and wide along y, facing up. */
function markMesh(): Mesh {
  const n = 8;
  const positions: number[] = [0, 0, 0],
    normals: number[] = [0, 0, 1],
    indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a rounded oblong: an octagon squashed, its ends a little blunt
    positions.push(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
    normals.push(0, 0, 1);
    indices.push(0, 1 + i, 1 + ((i + 1) % n));
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array((n + 1) * 2),
    indices: new Uint32Array(indices),
  };
}

/** A picture's texels as a bitmap the renderer can take as a layer of its ground texture: colour as data, not converted. */
async function layer(texels: Uint8ClampedArray, side: number): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(new Uint8ClampedArray(texels), side, side), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
}

/**
 * Placements in a pool that can be cut out of the way and come back: which placement each is, where it went in its
 * groups and in its low variant's, how far toward cut it has eased (one whole, nought cut), and whether its low
 * variant is the one drawn now.
 */
class Tracked {
  readonly of: Int32Array;
  readonly at: Int32Array;
  readonly lowAt: Int32Array;
  readonly size: Float64Array;
  readonly down: Uint8Array;
  count = 0;
  constructor(room: number) {
    this.of = new Int32Array(Math.max(1, room));
    this.at = new Int32Array(Math.max(1, room));
    this.lowAt = new Int32Array(Math.max(1, room));
    this.size = new Float64Array(Math.max(1, room));
    this.down = new Uint8Array(Math.max(1, room));
  }
  add(placement: number, at: number, lowAt = -1) {
    if (this.count >= this.of.length) return;
    this.of[this.count] = placement;
    this.at[this.count] = at;
    this.lowAt[this.count] = lowAt;
    this.size[this.count] = 1;
    this.down[this.count] = 0;
    this.count++;
  }
  /** How many are not drawn whole now. */
  get cut(): number {
    let n = 0;
    for (let t = 0; t < this.count; t++) if (this.size[t] < 1) n++;
    return n;
  }
}

/**
 * The shares left out or swapped: the willows not drawn, and the share of trees each side of the edge between the ring
 * drawn whole and the far trees drawn as the other side's.
 */
const THIN = { willow: 0.3, edge: 0.35 } as const;

/** What the rover presses down as it drives through: bushes, ferns, flowers and reeds (review 3, 12). */
const UNDERFOOT: ReadonlySet<Kind> = new Set<Kind>(['bush', 'fern', 'flowers', 'reed']);

/** A placement's index hashed with `salt` to [0, 1): the same every time, so a choice made by it does not flicker. */
function hashOf(i: number, salt: number): number {
  let h = Math.imul(i ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A placement in `batch`, at `at`, drawn at nothing: a low variant before it is wanted. Makes nothing. */
function hide(batch: KitBatch, p: Placement, at: number) {
  batch.shrink[0] = 0;
  batch.resize(p, at);
  batch.shrink[0] = 1;
}

export class Scene {
  private readonly view: ChunkView;
  private readonly rock: Uint8Array;
  /** The ground's groups made so far, by chunk and level: made a frame at a time ahead of need, let go once far again. */
  private readonly ground3 = new Map<number, GameGroup[]>();
  private readonly roverMatrices = new Float32Array(SLOTS * 16);
  private readonly pose = restPose();
  private readonly roverDrawn: GameGroup[];
  private readonly field: CloudField;
  private readonly clouds: Float32Array[];
  private readonly box: Box = { min: [0, 0, 0], max: [0, 0, 0] };
  private readonly fit = { reach: SUN_FIT.least as number, fade: SUN_FIT.fade as number };
  /** What the sun's box is made round the target with: written each frame, never made again. */
  private readonly boxAround = { low: 0, reach: 160, snap: 32 };
  private readonly sight = new SightLine();
  /**
   * The camera's lens: how many degrees tall its view is, and its width over its height. The page writes them when
   * they change; they are read here and not handed in each frame, since a fraction handed to a call is boxed.
   */
  readonly lens = new Float64Array([40, 1.6]);
  /** The rover's body, which the sight line runs to: written each frame. */
  private readonly aim = new Float64Array(3);
  /** The way the target is going, eased, x and y, then where it was last frame: for which chunk to make ahead first. */
  private readonly going = new Float64Array(4);

  /** The scenery's pools: the tall trees drawn whole, everything else drawn whole, the far trees, and what is built. */
  private readonly trees: KitBatch;
  private readonly kit: KitBatch;
  private readonly far: KitBatch;
  private readonly built: KitBatch;
  /** The low variants of the trees drawn whole and of the tall buildings: drawn in their place while they are cut. */
  private readonly treesLow: KitBatch;
  private readonly builtLow: KitBatch;
  /** Whether the scenery's pools are to be filled again this frame, after a crossing the frame before. */
  private refillDue = false;
  /** Each pool's views onto the live part of each of its groups' matrices, made when it is filled. */
  private readonly live = new Map<KitBatch, Float32Array[]>();
  /** Where each pool's groups start in the dynamic set. */
  private base = {
    contact: 0,
    rover: 0,
    clouds: 0,
    tracks: 0,
    trees: 0,
    treesLow: 0,
    kit: 0,
    far: 0,
    built: 0,
    builtLow: 0,
    sails: 0,
  };
  /** Each chunk's placements, as indices into the map's, from `chunkFirst[c]` to `chunkFirst[c + 1]` in `chunkOrder`. */
  private readonly chunkFirst: Int32Array;
  private readonly chunkOrder: Int32Array;
  /** The trees drawn whole, the bushes, and the tall buildings: each can be cut out of the camera's or the rover's way. */
  private readonly treesCut: Tracked;
  private readonly bushes: Tracked;
  private readonly housesCut: Tracked;
  /** The windmills, by index into the placements, and their sails' groups and matrices. */
  private readonly mills: Int32Array;
  private readonly sails: GameGroup[];
  private readonly sailMatrices: Float32Array;

  /** The tracks: their group's matrices and colours, each mark's own colour, and how far the marks are written. */
  private readonly marks: GameGroup;
  private readonly markColour: Float32Array;
  /** The contact shade under the rover, and the rings round its wet wheels: their groups, and each ring's birth and place. */
  private readonly contact: GameGroup;
  private readonly rings: GameGroup;
  private readonly ringBorn = new Float64Array(WADE.rings).fill(-Infinity);
  private readonly ringAt = new Float64Array(WADE.rings * 3);
  private readonly ringSize = new Float64Array(WADE.rings);
  private ringNext = 0;
  /** When each wheel last made a ring, and how far the rover is drawn sunk now, eased. */
  private readonly wheelRung = new Float64Array(6).fill(-Infinity);
  private sunk = 0;
  private marksWritten = 0;
  private marksNext = 0;
  private marksTinted = -Infinity;
  /** The near picture of the ground's colour, kept so a track can take the colour of the ground it is laid on. */
  private texels: Uint8ClampedArray | null = null;
  private texSide = 0;

  constructor(
    private readonly map: WorldMap,
    private readonly ground: Ground,
    private readonly draws: Draws,
  ) {
    this.view = new ChunkView(map.grid);
    this.rock = rockOf(map);
    this.field = cloudField(ground.bounds);
    this.clouds = Array.from({ length: CLOUD_SHAPES }, (_, k) => new Float32Array(cloudsOfShape(k) * 16));
    this.roverDrawn = roverGroups(this.roverMatrices);
    WATER_AT[0] = map.waterLevel;
    this.boxAround.low = map.waterLevel - 30;

    // the placements sorted by chunk, once
    const { cols, rows } = this.view;
    const chunkOf = (x: number, y: number) =>
      this.view.chunkOf(y, map.grid.originY, rows) * cols + this.view.chunkOf(x, map.grid.originX, cols);
    const counts = new Int32Array(cols * rows + 1);
    for (const p of map.placements) counts[chunkOf(p.x, p.y) + 1]++;
    for (let c = 0; c < cols * rows; c++) counts[c + 1] += counts[c];
    this.chunkFirst = counts.slice();
    this.chunkOrder = new Int32Array(map.placements.length);
    const fill = counts.slice();
    map.placements.forEach((p, i) => (this.chunkOrder[fill[chunkOf(p.x, p.y)]++] = i));

    // each pool's room: the most of each kind any ring of chunks drawn whole can hold, and every far tree there is
    const whole = this.mostInRing(RINGS.kit);
    const total = new Map<Kind, number>();
    for (const p of map.placements) total.set(p.kind, (total.get(p.kind) ?? 0) + 1);
    this.trees = new KitBatch(
      [...TALL].flatMap((k) => kindPieces(k)),
      (k) => whole.get(k) ?? 1,
    );
    this.treesLow = new KitBatch(
      [...TALL].flatMap((k) => lowPieces(k)),
      (k) => whole.get(k) ?? 1,
    );
    this.kit = new KitBatch(
      KINDS.filter((k) => !TALL.has(k) && !BUILT.has(k)).flatMap((k) => kindPieces(k)),
      (k) => whole.get(k) ?? 1,
    );
    this.far = new KitBatch(farPieces(), (k) => total.get(k) ?? 1);
    // what is built is few, and drawn wherever it is, so the church tower is seen from across the world
    this.built = new KitBatch(
      KINDS.filter((k) => BUILT.has(k)).flatMap((k) => kindPieces(k)),
      (k) => total.get(k) ?? 1,
    );
    this.builtLow = new KitBatch(
      KINDS.filter((k) => BUILT.has(k) && tallness(k) > 0).flatMap((k) => lowPieces(k)),
      (k) => total.get(k) ?? 1,
    );
    let most = 0;
    for (const k of TALL) most += whole.get(k) ?? 0;
    this.treesCut = new Tracked(most);
    let under = 0;
    for (const k of UNDERFOOT) under += whole.get(k) ?? 0;
    this.bushes = new Tracked(under);
    let tallBuilt = 0;
    for (const p of map.placements) if (BUILT.has(p.kind) && tallness(p.kind) > 0) tallBuilt++;
    this.housesCut = new Tracked(tallBuilt);

    const mills: number[] = [];
    map.placements.forEach((p, i) => p.kind === 'windmill' && mills.push(i));
    this.mills = Int32Array.from(mills);
    this.sailMatrices = new Float32Array(Math.max(1, mills.length) * 16);
    const colour = new Float32Array(3);
    this.sails = windmillSails().parts.map(({ name, mesh }) => {
      partColour('windmill', name, BIOME.meadow, 0, colour, 0);
      return {
        mesh,
        matrices: this.sailMatrices,
        count: mills.length,
        albedo: [colour[0], colour[1], colour[2]] as [number, number, number],
        roughness: name === 'sail' ? ROUGH.leaves : ROUGH.wood,
      };
    });

    this.marks = {
      mesh: markMesh(),
      matrices: new Float32Array(TRACKS_ROOM * 16),
      materials: new Float32Array(TRACKS_ROOM * 4),
      count: 0,
      roughness: ROUGH.earth,
      shadow: false,
    };
    this.markColour = new Float32Array(TRACKS_ROOM * 3);
    this.contact = {
      mesh: discMesh(12),
      matrices: new Float32Array(16),
      albedo: CONTACT.colour,
      roughness: 1,
      shadow: false,
      occlusion: false,
    };
    this.rings = {
      mesh: discMesh(16, 0.82),
      matrices: new Float32Array(WADE.rings * 16),
      albedo: [...WATER.foam],
      roughness: 0.9,
      shadow: false,
      occlusion: false,
    };
    // a mark laid between two writes of the colours shows what its slot held: a dark earth, never black
    const earth = BIOME_GROUND[BIOME.meadow];
    for (let i = 0; i < TRACKS_ROOM; i++)
      this.marks.materials!.set([earth[0] * MARK.dark, earth[1] * MARK.dark, earth[2] * MARK.dark, ROUGH.earth], i * 4);
  }

  /** The most of each kind of placement in any square of chunks `ring` each way of one. */
  private mostInRing(ring: number): Map<Kind, number> {
    const { cols, rows } = this.view;
    const per = new Map<Kind, Int32Array>();
    for (let c = 0; c < cols * rows; c++)
      for (let k = this.chunkFirst[c]; k < this.chunkFirst[c + 1]; k++) {
        const kind = this.map.placements[this.chunkOrder[k]].kind;
        let a = per.get(kind);
        if (!a) per.set(kind, (a = new Int32Array(cols * rows)));
        a[c]++;
      }
    const out = new Map<Kind, number>();
    for (const [kind, a] of per) {
      let best = 0;
      for (let cy = 0; cy < rows; cy++)
        for (let cx = 0; cx < cols; cx++) {
          let n = 0;
          for (let j = Math.max(0, cy - ring); j <= Math.min(rows - 1, cy + ring); j++)
            for (let i = Math.max(0, cx - ring); i <= Math.min(cols - 1, cx + ring); i++) n += a[j * cols + i];
          best = Math.max(best, n);
        }
      out.set(kind, best);
    }
    return out;
  }

  /**
   * Everything the first frame needs, for a camera looking at `target`: the ground's colour and the paving's detail,
   * the ground round it, every pool and what never moves, and the grass. Resolves once the grass's pipelines are in.
   */
  async build(target: ArrayLike<number>): Promise<void> {
    const { map, ground, draws } = this;
    const side = COLOUR_MAP.side;
    this.texels = groundTexels(map, side, 1);
    this.texSide = side;
    // the layers in the order the groups count them: the colour map near and far, then the paving's detail
    const details = (Object.keys(DETAIL_LAYER) as (keyof typeof DETAIL_LAYER)[]).sort(
      (a, b) => DETAIL_LAYER[a] - DETAIL_LAYER[b],
    );
    draws.setGroundTexture([
      await layer(this.texels, side),
      await layer(groundTexels(map, side, FAR_SCALE), side),
      ...(await Promise.all(details.map((k) => layer(detailTexels(k, side), side)))),
    ]);
    const paving = pavingOf(map, ground);

    // what moves, and what never does, in one dynamic set, whose room is fixed here
    const dynamic: GameGroup[] = [];
    this.base.rover = dynamic.length;
    dynamic.push(...this.roverDrawn);
    this.base.clouds = dynamic.length;
    for (let k = 0; k < CLOUD_SHAPES; k++)
      dynamic.push({
        mesh: cloudMesh(k),
        matrices: this.clouds[k],
        albedo: [...CLOUD],
        roughness: ROUGH.cloud,
        occlusion: false,
      });
    this.base.tracks = dynamic.length;
    dynamic.push(this.marks);
    this.base.contact = dynamic.length;
    dynamic.push(this.contact, this.rings);
    this.base.trees = dynamic.length;
    dynamic.push(...this.trees.groups);
    this.base.treesLow = dynamic.length;
    dynamic.push(...this.treesLow.groups);
    this.base.kit = dynamic.length;
    dynamic.push(...this.kit.groups);
    this.base.far = dynamic.length;
    dynamic.push(...this.far.groups);
    this.base.built = dynamic.length;
    map.placements.forEach((p, i) => {
      if (!BUILT.has(p.kind) || !this.built.add(p)) return;
      if (tallness(p.kind) > 0 && this.builtLow.add(p)) {
        this.housesCut.add(i, this.built.lastIndex, this.builtLow.lastIndex);
        hide(this.builtLow, p, this.builtLow.lastIndex);
      }
    });
    dynamic.push(...this.built.groups);
    this.base.builtLow = dynamic.length;
    dynamic.push(...this.builtLow.groups);
    this.base.sails = dynamic.length;
    if (this.mills.length) dynamic.push(...this.sails);
    dynamic.push(...pavingGroups(paving));
    dynamic.push(...waterGroups(waterMeshes(map, ground)));
    dynamic.push(...backdropGroups(backdropOf(map, ground)));
    draws.setDynamic(dynamic);
    this.handOver(this.built, this.base.built, true);
    this.handOver(this.builtLow, this.base.builtLow, true);

    this.view.update(target[0], target[1]);
    this.going[2] = target[0];
    this.going[3] = target[1];
    this.groundAgain();
    this.refill();

    const { originX, originY, cols, rows, tile } = map.grid;
    const cell = 2;
    await draws.setGrass(
      grassField(map, ground, 1, (x, y) => paving.clearOf(x, y)),
      {
        ...GRASS_OPTIONS,
        pressShade: PRESS.shade,
        trample: {
          origin: [originX, originY],
          cell,
          cols: Math.ceil((cols * tile) / cell),
          rows: Math.ceil((rows * tile) / cell),
          recovery: PRESS.recovery,
        },
      },
    );
    draws.setSunShadow(this.box, this.fit);
  }

  /** How far chunk `c` is from the one the target is in, in chunks, the greater of across and down. */
  private ringOf(c: number): number {
    const { cols } = this.view;
    return Math.max(Math.abs((c % cols) - this.view.cx), Math.abs(Math.floor(c / cols) - this.view.cy));
  }

  /** Chunk `c`'s groups at level `lod`, made now if they were not made ahead. */
  private groupsOf(c: number, lod: number): GameGroup[] {
    const key = c * 3 + lod;
    let g = this.ground3.get(key);
    if (!g) {
      const { cols } = this.view;
      const m = chunkMeshes(this.map, c % cols, Math.floor(c / cols), LODS[lod], this.rock);
      this.ground3.set(key, (g = chunkGroups(m, this.map, LODS[lod])));
    }
    return g;
  }

  /**
   * The ground handed over again, each chunk at the level `view` says. A chunk's finer groups are kept while it is a
   * chunk past their ring, since the target crossing back or on will want them, and let go past that, so what is kept
   * is never more than the rings and their edge.
   */
  private groundAgain() {
    const { cols, rows } = this.view;
    const groups: GameGroup[] = [];
    for (let c = 0; c < cols * rows; c++) groups.push(...this.groupsOf(c, this.view.lod[c]));
    for (const key of this.ground3.keys()) {
      const lod = key % 3;
      if (lod !== GROUND.far && this.ringOf((key - lod) / 3) > LOD_RING[lod] + 1) this.ground3.delete(key);
    }
    this.draws.setStatic(groups);
  }

  /**
   * One chunk's finer ground made ahead of need, if one is wanted: a chunk a step past the near or mid ring whose
   * groups at that level are not made yet, so a crossing finds them made and makes none. One a frame, near first, so
   * the work is spread over the frames the camera takes to cross a chunk and no frame takes it all (review 1, 20); and
   * of those wanted, the one nearest a point ahead of the target the way it is going, so the chunks a crossing needs
   * first are made first (review 2, 10).
   */
  private makeAhead(target: ArrayLike<number>) {
    const { cols, rows } = this.view;
    const n = cols * rows;
    // the way the target goes, eased, and a point a chunk and a half that way
    const w = this.going;
    w[0] += (target[0] - w[2] - w[0]) * 0.1;
    w[1] += (target[1] - w[3] - w[1]) * 0.1;
    w[2] = target[0];
    w[3] = target[1];
    const speed = Math.sqrt(w[0] * w[0] + w[1] * w[1]);
    const side = CHUNK_SIDE * this.map.grid.tile;
    const ax = target[0] + (speed > 1e-6 ? (w[0] / speed) * side * 1.5 : 0),
      ay = target[1] + (speed > 1e-6 ? (w[1] / speed) * side * 1.5 : 0);
    const { originX, originY } = this.map.grid;
    for (let l = 0; l < AHEAD.length; l++) {
      const lod = AHEAD[l];
      let best = -1,
        nearest = Infinity;
      for (let c = 0; c < n; c++) {
        if (this.ringOf(c) > LOD_RING[lod] + 1 || this.ground3.has(c * 3 + lod)) continue;
        const dx = originX + ((c % cols) + 0.5) * side - ax,
          dy = originY + (Math.floor(c / cols) + 0.5) * side - ay;
        const d = dx * dx + dy * dy;
        if (d < nearest) {
          nearest = d;
          best = c;
        }
      }
      if (best >= 0) {
        this.groupsOf(best, lod);
        return;
      }
    }
  }

  /** The scenery's pools filled again for the chunks `view` says, and handed to the renderer. */
  private refill() {
    const { trees, kit, far, map } = this;
    trees.clear();
    this.treesLow.clear();
    kit.clear();
    far.clear();
    this.treesCut.count = 0;
    this.bushes.count = 0;
    for (let c = 0; c < this.view.kit.length; c++) {
      const draw = this.view.kit[c];
      if (draw === KIT.none) continue;
      for (let k = this.chunkFirst[c]; k < this.chunkFirst[c + 1]; k++) {
        const i = this.chunkOrder[k];
        const p = map.placements[i];
        if (BUILT.has(p.kind)) continue;
        // a share of the willows left out: the world sets them thick along the water, where they crowded it (review 3, 7)
        if (p.kind === 'willow' && hashOf(i, 1) < THIN.willow) continue;
        const tall = TALL.has(p.kind);
        // the edge between the trees drawn whole and the far trees dithered a placement at a time, so it is not a band
        // (review 3, 9): a share of the ring past the whole one drawn whole, and a share of the whole one's edge far
        const ring = this.ringOf(c);
        let whole = draw === KIT.whole;
        if (tall && whole && ring === RINGS.kit && hashOf(i, 2) < THIN.edge) whole = false;
        else if (tall && !whole && ring === RINGS.kit + 1 && hashOf(i, 3) < THIN.edge) whole = true;
        if (!whole) {
          if (tall) far.add(p);
        } else if (tall) {
          if (trees.add(p) && this.treesLow.add(p)) {
            this.treesCut.add(i, trees.lastIndex, this.treesLow.lastIndex);
            hide(this.treesLow, p, this.treesLow.lastIndex);
          } else far.add(p);
        } else if (draw === KIT.whole && kit.add(p) && UNDERFOOT.has(p.kind)) this.bushes.add(i, kit.lastIndex);
      }
    }
    this.handOver(trees, this.base.trees, true);
    this.handOver(this.treesLow, this.base.treesLow, true);
    this.handOver(kit, this.base.kit, true);
    this.handOver(far, this.base.far, true);
  }

  /** A pool's groups written to the renderer: every one, or only those written since. */
  private handOver(batch: KitBatch, base: number, all: boolean) {
    let live = this.live.get(batch);
    if (!live) this.live.set(batch, (live = []));
    for (let i = 0; i < batch.groups.length; i++) {
      if (!all && !batch.dirty[i]) continue;
      const g = batch.groups[i];
      // only the placements there are written, not the pool's whole room: writing every pool whole on a crossing was
      // ten megabytes, and took seventy milliseconds of the frame (review 1, 20). The views onto the live part are made
      // when a pool is filled, and a frame that writes a group again reuses its view.
      if (all) live[i] = g.matrices.subarray(0, g.count! * 16);
      this.draws.move(base + i, live[i], g.count);
      if (all) this.draws.tint(base + i, g.materials!.subarray(0, g.count! * 4));
      batch.dirty[i] = 0;
    }
  }

  /**
   * One frame: the camera stands at `eye` and looks at `target`, through `lens`; `dt` is the frame's length, for what
   * eases; `settled`, that it is a test's step or a paused frame, whose picture must be the whole of the game's state
   * and the camera's. Makes nothing but when the target crosses into another chunk, and a chunk's ground made ahead.
   */
  frame(game: Played, eye: ArrayLike<number>, target: ArrayLike<number>, dt: number, settled = false): void {
    // a crossing's work spread over two frames while the game plays, and done whole in a settled frame (`frameWork`)
    const work = frameWork(this.view.update(target[0], target[1]), this.refillDue, settled);
    if (work & WORK.ground) {
      this.groundAgain();
      this.refillDue = true;
    }
    if (work & WORK.refill) {
      this.refillDue = false;
      this.refill();
    }
    if (work & WORK.ahead) this.makeAhead(target);
    const { draws } = this;

    // the rover, from its logic
    poseOf(game.rover, this.pose);
    poseRover(this.roverMatrices, this.pose);
    this.wade(game.rover, game.t, dt);
    for (let i = 0; i < this.roverDrawn.length; i++) draws.move(this.base.rover + i, this.roverDrawn[i].matrices);

    // the clouds, by game time; the sun's box round where the camera looks, high enough to hold them, and its map
    // fitted to the ground the camera sees
    placeClouds(this.field, game.t, this.clouds);
    for (let k = 0; k < CLOUD_SHAPES; k++) draws.move(this.base.clouds + k, this.clouds[k]);
    const dx = target[0] - eye[0],
      dy = target[1] - eye[1],
      dz = target[2] - eye[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.fit.reach = Math.min(SUN_FIT.most, Math.max(SUN_FIT.least, distance * SUN_FIT.reach));
    this.boxAround.reach = Math.max(160, this.fit.reach);
    sunBoxAround(target[0], target[1], this.box, this.boxAround);

    // what stands in the camera's way cut out of it, and grown back once it has passed: the way to the rover itself,
    // at its body's middle, and not to the point the camera looks at, which leads it, so a crown over the rover and short
    // of the line to the lead was left standing over it (review 2)
    const aim = this.aim;
    aim[0] = game.rover.x;
    aim[1] = game.rover.y;
    aim[2] = game.rover.z + AIM_HEIGHT;
    this.sight.set(eye, aim, this.lens);
    const ease = 1 - Math.exp(-SHRINK_RATE * Math.max(0, dt));
    this.cutAway(this.treesCut, this.trees, this.treesLow, dt, ease);
    this.cutAway(this.housesCut, this.built, this.builtLow, dt, ease);
    this.pressBushes(game.rover, dt, ease);
    this.handOver(this.trees, this.base.trees, false);
    this.handOver(this.treesLow, this.base.treesLow, false);
    this.handOver(this.builtLow, this.base.builtLow, false);
    this.handOver(this.built, this.base.built, false);
    this.handOver(this.kit, this.base.kit, false);

    this.turnSails(game.t);
    this.lay(game.tracks, game.t);
    this.press(game.rover);
  }

  /**
   * Each of `tracked`, eased toward cut if the sight line says it is in the way and back if not, and swapped for its
   * low variant (a capped stump, a house's capped walls' feet) as it passes halfway, and back again the same: so a
   * thing that grazes the line does not flicker, and nothing is ever drawn squashed. A step of nought (a paused frame)
   * settles it at once.
   */
  private cutAway(tracked: Tracked, batch: KitBatch, low: KitBatch, dt: number, ease: number) {
    for (let t = 0; t < tracked.count; t++) {
      const p = this.map.placements[tracked.of[t]];
      const want = this.sight.blocks(p) ? 0 : 1;
      const was = tracked.size[t];
      if (was === want) continue;
      let now = dt > 0 ? was + (want - was) * ease : want;
      if (Math.abs(now - want) < 0.02) now = want;
      tracked.size[t] = now;
      const down = now < 0.5 ? 1 : 0;
      if (down === tracked.down[t]) continue;
      tracked.down[t] = down;
      batch.shrink[0] = down ? 0 : 1;
      batch.resize(p, tracked.at[t]);
      batch.shrink[0] = 1;
      low.shrink[0] = down ? 1 : 0;
      low.resize(p, tracked.lowAt[t]);
      low.shrink[0] = 1;
    }
  }

  /**
   * A bush, a fern, a clump of flowers or of reeds the rover is in pressed down under it, and stood up again once it
   * has gone, so nothing pokes through its body (review 1, 19; review 3, 12).
   */
  private pressBushes(r: Rover, dt: number, ease: number) {
    const b = this.bushes;
    for (let t = 0; t < b.count; t++) {
      const p = this.map.placements[b.of[t]];
      const dx = p.x - r.x,
        dy = p.y - r.y;
      const reach = SIZE[p.kind as keyof typeof SIZE] * p.scale * 0.45 + 3;
      const want = dx * dx + dy * dy < reach * reach ? 0 : 1;
      const was = b.size[t];
      if (was === want) continue;
      let now = dt > 0 ? was + (want - was) * ease : want;
      if (Math.abs(now - want) < 0.02) now = want;
      b.size[t] = now;
      this.kit.shrink[1] = CUT.bush + (1 - CUT.bush) * now;
      this.kit.resize(p, b.at[t]);
      this.kit.shrink[1] = 1;
    }
  }

  /**
   * Each windmill's sails turned by game time about their hub, which is placed, turned and scaled with the mill, and
   * cut down with it when the mill is cut out of the camera's way.
   */
  private turnSails(t: number) {
    if (!this.mills.length) return;
    const m = this.sailMatrices;
    const a = t * SAILS_SPEED;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    for (let k = 0; k < this.mills.length; k++) {
      const p = this.map.placements[this.mills[k]];
      // the sails go with the mill when it is cut to its feet
      let v = 1;
      for (let h = 0; h < this.housesCut.count; h++)
        if (this.housesCut.of[h] === this.mills[k] && this.housesCut.down[h]) v = 0;
      const c = Math.cos(p.yaw),
        n = Math.sin(p.yaw),
        s = p.scale * v;
      const o = k * 16;
      // turned about x by the sails' angle, then scaled with the mill (upright by its cut too), then turned with it
      m[o] = c * s;
      m[o + 1] = n * s;
      m[o + 2] = 0;
      m[o + 3] = 0;
      m[o + 4] = -n * s * ca;
      m[o + 5] = c * s * ca;
      m[o + 6] = s * v * sa;
      m[o + 7] = 0;
      m[o + 8] = n * s * sa;
      m[o + 9] = -c * s * sa;
      m[o + 10] = s * v * ca;
      m[o + 11] = 0;
      m[o + 12] = p.x + (c * SAILS_HUB[0] - n * SAILS_HUB[1]) * s;
      m[o + 13] = p.y + (n * SAILS_HUB[0] + c * SAILS_HUB[1]) * s;
      m[o + 14] = p.z + SAILS_HUB[2] * s * v;
      m[o + 15] = 1;
    }
    for (let i = 0; i < this.sails.length; i++) this.draws.move(this.base.sails + i, m);
  }

  /**
   * The rover in water and on the ground: drawn sunk toward its hubs as the water under it deepens, eased so it does not
   * jump at the water's edge; its contact shade laid on the ground under it; and a ring spread from each wet wheel while
   * it moves, from a pool written in place.
   */
  private wade(r: Rover, now: number, dt: number) {
    const depth = this.ground.waterDepthAt(r.x, r.y);
    const want = depth > 0 ? Math.min(1, depth / WADE.full) * WADE.sink * ROVER.wheelRadius : 0;
    this.sunk = dt > 0 ? this.sunk + (want - this.sunk) * Math.min(1, dt * 6) : want;
    if (this.sunk > 1e-4) for (let i = 0; i < SLOTS; i++) this.roverMatrices[i * 16 + 14] -= this.sunk;
    // the contact shade, turned with the rover, on the ground or the water under its middle
    const c = this.contact.matrices;
    const cos = Math.cos(r.yaw),
      sin = Math.sin(r.yaw);
    c[0] = cos * CONTACT.long;
    c[1] = sin * CONTACT.long;
    c[4] = -sin * CONTACT.wide;
    c[5] = cos * CONTACT.wide;
    c[10] = 1;
    c[12] = r.x;
    c[13] = r.y;
    c[14] = Math.max(this.ground.heightAt(r.x, r.y), depth > 0 ? this.map.waterLevel : -Infinity) + CONTACT.lift;
    c[15] = 1;
    this.draws.move(this.base.contact, c);
    // the rings: a new one from each wheel in the water while the rover moves, and every live one spread by its age
    const speed = Math.abs(r.speed);
    if (speed > 0.5 && dt > 0)
      for (let w = 0; w < 6; w++) {
        if (now - this.wheelRung[w] < WADE.every && now >= this.wheelRung[w]) continue;
        if (this.ground.waterDepthAt(r.wheelX[w], r.wheelY[w]) <= 0) continue;
        this.wheelRung[w] = now;
        const k = this.ringNext;
        this.ringNext = (k + 1) % WADE.rings;
        this.ringBorn[k] = now;
        this.ringAt[k * 3] = r.wheelX[w];
        this.ringAt[k * 3 + 1] = r.wheelY[w];
        this.ringAt[k * 3 + 2] = this.map.waterLevel + 0.05;
        this.ringSize[k] = 0.5 + 0.5 * Math.min(1, speed / WADE.fast);
      }
    const m = this.rings.matrices;
    for (let k = 0; k < WADE.rings; k++) {
      const age = (now - this.ringBorn[k]) / WADE.life;
      const o = k * 16;
      // spread out and thinned away as it ages; nought before it is born, or once it is spent, or if time ran back
      const s = age >= 0 && age < 1 ? (0.6 + WADE.spread * age) * this.ringSize[k] : 0;
      m[o] = s;
      m[o + 5] = s;
      m[o + 10] = 1;
      m[o + 12] = this.ringAt[k * 3];
      m[o + 13] = this.ringAt[k * 3 + 1];
      m[o + 14] = this.ringAt[k * 3 + 2];
      m[o + 15] = 1;
    }
    this.draws.move(this.base.contact + 1, m);
  }

  /** The tracks: new marks written where they were laid, and every mark's colour faded by its age, now and then. */
  private lay(tracks: Tracks, now: number) {
    const m = this.marks.matrices,
      colours = this.marks.materials!;
    // the marks laid since the last frame, from where the writing stopped round to where the tracks have got to
    let laid = false;
    if (tracks.next !== this.marksNext || tracks.count !== this.marksWritten) {
      let i = this.marksNext;
      const end = tracks.next;
      let n = 0;
      do {
        if (i >= tracks.count) break;
        const o = i * 16;
        const c = Math.cos(tracks.yaw[i]),
          s = Math.sin(tracks.yaw[i]);
        m[o] = c * MARK.long;
        m[o + 1] = s * MARK.long;
        m[o + 4] = -s * MARK.wide;
        m[o + 5] = c * MARK.wide;
        m[o + 10] = 1;
        m[o + 12] = tracks.x[i];
        m[o + 13] = tracks.y[i];
        m[o + 14] = tracks.z[i] + MARK.lift;
        m[o + 15] = 1;
        this.groundColour(tracks.x[i], tracks.y[i], i);
        i = (i + 1) % TRACKS_ROOM;
        n++;
      } while (i !== end && n < TRACKS_ROOM);
      this.marksNext = tracks.next;
      this.marksWritten = tracks.count;
      this.draws.move(this.base.tracks, m, tracks.count);
      laid = true;
    }
    // the colours, written when a mark has been laid since they last were or the fade has moved on, but not oftener
    // than `every`; and at once if game time ran back (a test's new game)
    const since = now - this.marksTinted;
    if (tracks.count === 0 || (since < MARK.every && since >= 0) || (!laid && since < MARK.every * 5 && since >= 0))
      return;
    this.marksTinted = now;
    for (let i = 0; i < tracks.count; i++) {
      const age = Math.min(1, Math.max(0, now - tracks.born[i]) / MARK.fade);
      const shade = MARK.dark + (1 - MARK.dark) * age;
      colours[i * 4] = this.markColour[i * 3] * shade;
      colours[i * 4 + 1] = this.markColour[i * 3 + 1] * shade;
      colours[i * 4 + 2] = this.markColour[i * 3 + 2] * shade;
      colours[i * 4 + 3] = ROUGH.earth;
    }
    this.draws.tint(this.base.tracks, colours);
  }

  /** The ground's own colour at (x, y), from the near picture, into mark `i`'s. */
  private groundColour(x: number, y: number, i: number) {
    const tex = this.texels,
      side = this.texSide;
    if (!tex) return;
    const span = worldSpan(this.map);
    const u = x / span - Math.floor(x / span),
      v = y / span - Math.floor(y / span);
    const o = (Math.min(side - 1, Math.floor(v * side)) * side + Math.min(side - 1, Math.floor(u * side))) * 4;
    const to = 2 * COLOUR_MAP.albedo;
    this.markColour[i * 3] = (tex[o] / 255) * to;
    this.markColour[i * 3 + 1] = (tex[o + 1] / 255) * to;
    this.markColour[i * 3 + 2] = (tex[o + 2] / 255) * to;
  }

  /** The grass pressed flat under each wheel that is on it and moving. */
  private press(r: Rover) {
    if (r.speed === 0 && r.yawRate === 0) return;
    const c = Math.cos(r.yaw),
      s = Math.sin(r.yaw);
    for (let i = 0; i < 6; i++) {
      const x = r.wheelX[i],
        y = r.wheelY[i];
      if (this.ground.surfaceAt(x, y) !== SURFACE.grass) continue;
      this.draws.press(x, y, PRESS.radius, c, s);
    }
  }

  /**
   * The trees chosen to draw far off and drawn whole are set by `view`'s rings; the frame-time rung can draw fewer far
   * trees, out to `ring` chunks, and the pools are filled again at once.
   */
  setTreesRing(ring: number): void {
    if (!this.view.setTrees(ring)) return;
    this.refill();
  }

  /** How many of the trees drawn whole are cut out of the camera's way now: for a test. */
  get hidden(): number {
    return this.treesCut.cut;
  }

  /** How many buildings are cut down out of the camera's way now, and how many bushes are pressed: for a test. */
  get cut(): { houses: number; bushes: number } {
    return { houses: this.housesCut.cut, bushes: this.bushes.cut };
  }
}
