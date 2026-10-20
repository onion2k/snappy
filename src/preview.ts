/**
 * The models' preview: a page for working on the look, and never part of the
 * game (vite builds `index.html` alone). It draws a world with everything the
 * models make (the terrain a chunk at a time, the water, the grass, the kit's
 * scenery and buildings, the backdrop, the clouds drifting, and the rover)
 * from a camera the query string chooses: `?view=chase`, `?view=kit` and so
 * on, `VIEWS` below. The showcase world is the preview's own
 * (`models/showcase.ts`), the fixture is the tests', and the lab is a flat
 * lawn for laying the kit out on.
 *
 * `window.preview` says when the first frames are drawn and measures what a
 * frame costs, for `npm run shots` (`smoke/shots.spec.ts`).
 */
import { createContext } from 'artshape-render/gpu/context';
import { GameRenderer, type GameGroup } from 'artshape-render/game/renderer';
import type { Box } from 'artshape-render/game/shadows';
import { frameCost } from './frame-cost';
import { daylight } from './look';
import { backdropGroups, backdropOf } from './models/backdrop';
import {
  CLOUD_SHAPES,
  SKY_CLOUDS,
  cloudAt,
  cloudField,
  cloudMesh,
  cloudsOfShape,
  placeClouds,
  sunBoxAround,
} from './models/clouds';
import { SUN } from './sun';
import { GRASS_OPTIONS, WIND, grassField } from './models/grass';
import { KitBatch, kitPieces } from './models/kit';
import { CLOUD, ROUGH } from './models/palette';
import { RIG, poseRover, restPose, roverGroups, roverTriangles, SLOTS } from './models/rover';
import { SIZE } from './models/scenery';
import { PLACES, labWorld, showcaseWorld } from './models/showcase';
import { BUILT_VARIANTS } from './models/built';
import {
  FAR_SCALE,
  chunkGroups,
  chunkMeshes,
  chunksOf,
  groundTexels,
  rockOf,
  worldSpan,
  type Lod,
} from './models/terrain';
import { waterGroups, waterMeshes } from './models/water';
import { fixtureAt, fixtureWorld } from './world/fixture';
import { groundOf } from './world/ground';
import { ODDITIES, varyOf } from './world/oddities';
import { BIOME, CHUNK, SUBJECTS, type Biome, type Kind, type Placement, type WorldMap } from './world/types';

const MM_PER_UNIT = 100;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const stats = document.getElementById('stats')!;

declare global {
  interface Window {
    preview?: { ready: boolean; measure: () => Promise<number>; error?: string; triangles?: number; info?: string };
  }
}

/** A view: the world it is of, where the rover stands and faces, and the camera's eye and what it looks at. */
interface View {
  world: 'showcase' | 'fixture' | 'lab-kit' | 'lab-small' | 'lab-built' | 'lab-ruins' | 'lab-odd' | 'lab-looks' | 'lab';
  rover?: [number, number, number];
  /** The chase camera behind the rover, or an eye and a target of its own. */
  chase?: number;
  eye?: [number, number, number];
  target?: [number, number, number];
  /** The game time the clouds and the water are drawn at; `shade`, the first time a cloud's shadow is over the target. */
  time?: number | 'shade';
  pose?: 'tilt';
  /** How far the rover's eye is shut, nought open to one closed. */
  blink?: number;
  /** False draws no clouds: for a view from over them. */
  clouds?: boolean;
  /** False draws no grass: for a close look at what stands in it. */
  grass?: boolean;
}

/**
 * The chase camera: `back` units from the rover, tilted 50 degrees from straight down, behind its heading (the spec's,
 * about 9 m back).
 */
const TILT = (50 * Math.PI) / 180;

/** The size the world sets each oddity at. */
const ODDITY_SCALE = {
  duck: ODDITIES.find((o) => o.kind === 'duck')!.scale,
  gnome: ODDITIES.find((o) => o.kind === 'gnome')!.scale,
};

/** Where the oddities' lab sets each, x and y: a duck and a gnome either side, and a UFO hovering beyond. */
const ODD = { duck: [-7, 0], gnome: [7, 0], ufo: [0, 40] } as const;

/** The `vary` that draws an oddity of `kind` in its `look` and `paint`. */
const looking = (kind: 'duck' | 'gnome' | 'ufo', look = 0, paint = 0) => varyOf({ kind, look, paint }, 0.5);

/**
 * The looks' lab: every look of a duck in a row, the giant the Mere has at the end of it, and every look of a gnome in
 * a row behind, each in its own paint, all turned a little off facing the camera's side (-y), so each is seen.
 */
const LOOKS = { duckY: 0, gnomeY: 40, duckX: [-12, -4, 4], giantX: 16, gnomeX: [-24, -12, 0, 12, 24] } as const;

/** The views of each look close to, from in front and a little to one side, as the `duck` and `gnome` views are. */
function lookViews(): Record<string, View> {
  const out: Record<string, View> = {};
  SUBJECTS.duck.looks.forEach((l, k) => {
    const x = LOOKS.duckX[k];
    out[`look-duck-${l.replace(' ', '-')}`] = {
      world: 'lab-looks',
      eye: [x + 2.2, LOOKS.duckY - 10.5, 4.5],
      target: [x, LOOKS.duckY, 1.85],
      grass: false,
    };
  });
  out['look-duck-giant'] = {
    world: 'lab-looks',
    eye: [LOOKS.giantX + 6, LOOKS.duckY - 26, 9],
    target: [LOOKS.giantX, LOOKS.duckY, 4.6],
    grass: false,
  };
  SUBJECTS.gnome.looks.forEach((l, k) => {
    const x = LOOKS.gnomeX[k];
    out[`look-gnome-${l}`] = {
      world: 'lab-looks',
      eye: [x + 5, LOOKS.gnomeY - 12, 5.8],
      target: [x, LOOKS.gnomeY, 3.1],
      grass: false,
    };
  });
  return out;
}

const VIEWS: Record<string, View> = {
  rover: { world: 'lab', rover: [0, 0, 0.35], eye: [11, -9, 6], target: [0, 0, 2.4] },
  'rover-back': { world: 'lab', rover: [0, 0, 0.35], eye: [-12, 5, 8], target: [0, 0, 2.2] },
  'rover-side': { world: 'lab', rover: [0, 0, 0], eye: [0, -14, 3.5], target: [0, 0, 2.4] },
  'rover-tilt': { world: 'lab', rover: [0, 0, 0.6], eye: [10, -11, 5], target: [0, 0, 2.2], pose: 'tilt' },
  // the head close to: square on, and from three-quarters; then the eye half shut and shut, for the blink
  'rover-face': { world: 'lab', rover: [0, 0, 0], eye: [6.8, 0.6, 5.4], target: [1.1, 0, 4.6] },
  'rover-face-34': { world: 'lab', rover: [0, 0, 0], eye: [5.2, -4.6, 5.8], target: [0.9, 0, 4.4] },
  'rover-blink': { world: 'lab', rover: [0, 0, 0], eye: [5.6, -3.2, 5.6], target: [1.1, 0, 4.6], blink: 0.5 },
  'rover-blink-shut': { world: 'lab', rover: [0, 0, 0], eye: [5.6, -3.2, 5.6], target: [1.1, 0, 4.6], blink: 1 },
  // shut, from below and to one side, where a lid that stops short shows a crescent of glass
  'rover-blink-low': { world: 'lab', rover: [0, 0, 0], eye: [4.4, 2.2, 3.4], target: [1.3, 0, 4.7], blink: 1 },
  // the wheels and the arms close to, from low at the front quarter
  'rover-wheels': { world: 'lab', rover: [0, 0, 0], eye: [4.6, -5.6, 1.9], target: [0.4, -1.4, 1.0], grass: false },
  chase: { world: 'showcase', rover: [PLACES.start[0], PLACES.start[1], Math.PI / 2 - 0.2], chase: 90 },
  far: { world: 'showcase', rover: [PLACES.start[0], PLACES.start[1], Math.PI / 2 - 0.2], chase: 200 },
  kit: { world: 'lab-kit', eye: [0, -250, 120], target: [0, 10, 18] },
  small: { world: 'lab-small', eye: [0, -82, 44], target: [0, 0, 2] },
  built: { world: 'lab-built', eye: [40, -240, 140], target: [0, 0, 20] },
  ruins: { world: 'lab-ruins', eye: [30, -150, 95], target: [0, 0, 8] },
  biomes: { world: 'showcase', eye: [-30, -620, 560], target: [0, -20, 0], clouds: false },
  meadow: { world: 'showcase', rover: [PLACES.meadow[0], PLACES.meadow[1], 0.6], chase: 90 },
  pine: { world: 'showcase', rover: [-170, 172, 2.3], chase: 90 },
  autumn: { world: 'showcase', rover: [150, 150, 0.8], chase: 90 },
  heath: { world: 'showcase', rover: [150, -175, 0.2], chase: 90 },
  wetland: { world: 'showcase', rover: [-250, 20, 1.2], chase: 90 },
  village: { world: 'showcase', rover: [-128, -108, -2.2], chase: 110 },
  ruin: { world: 'showcase', rover: [176, -190, -0.6], chase: 100 },
  water: { world: 'showcase', eye: [-150, -320, 60], target: [-250, -270, -1] },
  ford: { world: 'showcase', rover: [PLACES.ford[0] + 2, PLACES.ford[1] - 6, Math.PI / 2 - 0.15], chase: 90 },
  top: { world: 'showcase', rover: [-40, 40, 0.3], eye: [-40, 39, 330], target: [-40, 40, 0], time: 40 },
  shade: { world: 'showcase', rover: [-10, -128, 0], eye: [-10, -200, 170], target: [-10, -100, 0], time: 'shade' },
  // from near the world's edge, looking out over the backdrop's hills to the mountains
  edge: { world: 'showcase', eye: [150, -300, 110], target: [700, -900, 40], time: 20 },
  sky: { world: 'showcase', eye: [0, -150, 12], target: [60, 200, 110], time: 20 },
  // the chase view's ground from straight over it, for seeing where the grass grows
  'chase-over': {
    world: 'showcase',
    rover: [PLACES.start[0], PLACES.start[1], Math.PI / 2 - 0.2],
    eye: [-105, -125, 160],
    target: [-104, -124, 0],
    clouds: false,
  },
  fixture: { world: 'fixture', rover: [...fixtureAt(6, 23.5), 0], eye: [10, -150, 130], target: [0, 0, 0] },
  // the oddities close to, each from in front and a little to one side, a hand's breadth over the grass; then the UFO
  // from the ground below it, as the rover sees it; then all three by the rover, for their size against it
  duck: {
    world: 'lab-odd',
    eye: [ODD.duck[0] + 2.2, ODD.duck[1] - 10.5, 4.5],
    target: [...ODD.duck, 1.85],
    grass: false,
  },
  gnome: {
    world: 'lab-odd',
    eye: [ODD.gnome[0] + 5, ODD.gnome[1] - 12, 5.8],
    target: [...ODD.gnome, 3.1],
    grass: false,
  },
  ufo: {
    world: 'lab-odd',
    eye: [ODD.ufo[0] + 30, ODD.ufo[1] - 26, SUBJECTS.ufo.hover + 12],
    target: [ODD.ufo[0], ODD.ufo[1], SUBJECTS.ufo.hover + 2],
  },
  'ufo-below': {
    world: 'lab-odd',
    rover: [ODD.ufo[0] - 30, ODD.ufo[1] - 80, 1.2],
    eye: [ODD.ufo[0] - 40, ODD.ufo[1] - 100, 5],
    target: [ODD.ufo[0], ODD.ufo[1], SUBJECTS.ufo.hover - 2],
  },
  oddities: { world: 'lab-odd', rover: [-4, -22, Math.PI / 2], eye: [20, -60, 8], target: [0, 0, 20] },
  // the fixture's duck on its pond and its gnome, from the chase camera's height
  'fixture-odd': { world: 'fixture', rover: [...fixtureAt(10, 13), -Math.PI / 2], chase: 70 },
  // every look of the oddities in a row, the ducks before the gnomes; and each close to
  looks: { world: 'lab-looks', eye: [0, -34, 16], target: [0, 20, 2], grass: false },
  ...lookViews(),
};

const BIOME_ROWS: Biome[] = [BIOME.meadow, BIOME.pine, BIOME.autumn, BIOME.heath, BIOME.wetland];

/** A placement on the lab's flat lawn. */
const at = (kind: Kind, x: number, y: number, biome: Biome, vary: number, yaw = 0, scale = 1): Placement => ({
  kind,
  x,
  y,
  z: 0,
  yaw,
  scale,
  biome,
  vary,
});

/** The world a view is of. */
function worldFor(view: View): WorldMap {
  switch (view.world) {
    case 'showcase':
      return showcaseWorld();
    case 'fixture':
      return fixtureWorld();
    case 'lab-kit': {
      // every tree in every biome: a column a biome, west to east, and a row a kind, the conifers at the back
      const ps: Placement[] = [];
      BIOME_ROWS.forEach((b, c) =>
        ['twisted', 'broadleaf', 'conifer'].forEach((k, r) =>
          ps.push(at(k as Kind, -120 + c * 60, -50 + r * 55, b, (c * 0.37 + r * 0.21 + 0.1) % 1, c + r)),
        ),
      );
      return labWorld(ps);
    }
    case 'lab-small': {
      const ps: Placement[] = [];
      BIOME_ROWS.forEach((b, c) =>
        ['flowers', 'fern', 'bush', 'boulder', 'reed'].forEach((k, r) =>
          ps.push(at(k as Kind, -44 + c * 22, -24 + r * 13, b, (c * 0.29 + r * 0.17 + 0.05) % 1, c * 1.7 + r)),
        ),
      );
      return labWorld(ps);
    }
    case 'lab-built': {
      const ps: Placement[] = [];
      let x = -150;
      for (let v = 0; v < BUILT_VARIANTS.cottage; v++) {
        ps.push(at('cottage', x, 30, BIOME.meadow, (v + 0.5) / 3, -0.3));
        x += 64;
      }
      ps.push(at('church', x + 30, 30, BIOME.meadow, 0.5, -0.3));
      ps.push(at('well', -40, -50, BIOME.meadow, 0.5, 0.4));
      for (let v = 0; v < 3; v++) ps.push(at('fence', 10 + v * 0.3, -40 + v * 12, BIOME.meadow, (v + 0.5) / 3, 0));
      return labWorld(ps);
    }
    case 'lab-ruins': {
      const ps: Placement[] = [];
      const kinds: Kind[] = ['wall', 'tower', 'arch', 'column'];
      kinds.forEach((k, r) => {
        for (let v = 0; v < 3; v++) {
          const n = BUILT_VARIANTS[k as keyof typeof BUILT_VARIANTS];
          if (v >= n) break;
          // the vary that picks variant v, by trying
          ps.push(
            at(
              k,
              -70 + v * 60 + (r % 2) * 20,
              50 - r * 32,
              r % 2 ? BIOME.pine : BIOME.heath,
              varyFor(k, v),
              k === 'arch' ? Math.PI / 2 : 0.3,
            ),
          );
        }
      });
      return labWorld(ps, BIOME.heath);
    }
    case 'lab-odd':
      // each turned toward the views' side and at the size the world sets it, the UFO at its height over the lawn
      return labWorld([
        at('duck', ODD.duck[0], ODD.duck[1], BIOME.meadow, looking('duck'), -0.55, ODDITY_SCALE.duck),
        at('gnome', ODD.gnome[0], ODD.gnome[1], BIOME.meadow, looking('gnome'), -0.6, ODDITY_SCALE.gnome),
        { ...at('ufo', ODD.ufo[0], ODD.ufo[1], BIOME.meadow, looking('ufo'), 0.3), z: SUBJECTS.ufo.hover },
      ]);
    case 'lab-looks': {
      const ps: Placement[] = [];
      LOOKS.duckX.forEach((x, k) =>
        ps.push(at('duck', x, LOOKS.duckY, BIOME.meadow, looking('duck', k), -1.2, ODDITY_SCALE.duck)),
      );
      const giant = ODDITIES.find((o) => o.name === 'mere duck')!;
      ps.push(at('duck', LOOKS.giantX, LOOKS.duckY, BIOME.meadow, looking('duck', giant.look), -1.2, giant.scale));
      LOOKS.gnomeX.forEach((x, k) =>
        ps.push(at('gnome', x, LOOKS.gnomeY, BIOME.meadow, looking('gnome', k, k), -1.15, ODDITY_SCALE.gnome)),
      );
      return labWorld(ps);
    }
    case 'lab':
      return labWorld([]);
  }
}

/** A `vary` that picks variant `v` of a built kind, found by looking. */
function varyFor(kind: Kind, v: number): number {
  for (let k = 0; k < 200; k++) {
    const vary = k / 200;
    const x = Math.sin(vary * 127.1 + 311.7) * 43758.5453;
    const n = BUILT_VARIANTS[kind as keyof typeof BUILT_VARIANTS];
    if (Math.min(n - 1, Math.floor((x - Math.floor(x)) * n)) === v) return vary;
  }
  return 0.5;
}

/** A picture's texels as a bitmap the renderer can take as a layer: colour as data, not to be converted. */
async function layer(texels: Uint8ClampedArray, side: number): Promise<ImageBitmap> {
  const image = new ImageData(new Uint8ClampedArray(texels), side, side);
  return createImageBitmap(image, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/** The first time, by the second, that a cloud's shadow falls on (x, y): the cloud over it, but toward the sun. */
function shadeTime(field: ReturnType<typeof cloudField>, target: readonly number[]): number {
  const m = new Float32Array(16);
  for (let t = 0; t < 2000; t++)
    for (let i = 0; i < SKY_CLOUDS.count; i++) {
      cloudAt(field, i, t, m);
      const z = m[14];
      const sx = m[12] - (SUN[0] / SUN[2]) * z,
        sy = m[13] - (SUN[1] / SUN[2]) * z;
      if (Math.hypot(sx - target[0] - 25, sy - target[1] - 10) < Math.hypot(m[0], m[1]) * 0.25) return t;
    }
  return 0;
}

/** The kinds that stand tall enough to come between the chase camera and the rover, and their heights a scale of one. */
const TALL: Partial<Record<Kind, number>> = { broadleaf: SIZE.broadleaf, conifer: SIZE.conifer, twisted: SIZE.twisted };

/**
 * The placements without the trees that stand between `eye` and `target`, or that the eye is in: what the game's own
 * camera has to do in a wood, by fading them, or rising over them, as the spec's ninth criterion says. Here they are
 * simply left out, so a picture of a wood shows the rover in it.
 */
function clearSight(placements: Placement[], eye: readonly number[], target: readonly number[]): Placement[] {
  return placements.filter((p) => {
    const h = TALL[p.kind];
    if (h === undefined) return true;
    const vx = target[0] - eye[0],
      vy = target[1] - eye[1];
    const t = Math.max(0, Math.min(1, ((p.x - eye[0]) * vx + (p.y - eye[1]) * vy) / (vx * vx + vy * vy || 1)));
    const d = Math.hypot(p.x - eye[0] - vx * t, p.y - eye[1] - vy * t);
    const sight = eye[2] + (target[2] - eye[2]) * t;
    return !(d < h * 0.45 * p.scale + 3 && sight < p.z + h * p.scale + 2);
  });
}

async function main() {
  const query = new URLSearchParams(location.search);
  const name = query.get('view') ?? 'chase';
  const view = VIEWS[name] ?? VIEWS.chase;
  const map = worldFor(view);
  const ground = groundOf(map);
  // the lab is a lawn for laying the kit out on, with nothing past it and no sky to speak of
  const lab = view.world.startsWith('lab');

  const ctx = await createContext(canvas);
  const renderer = new GameRenderer(ctx, 16, 16, 1024, MM_PER_UNIT);
  await daylight(renderer, ctx);
  const cam = renderer.camera;
  cam.fov = 40;
  cam.near = 1;
  cam.far = 8000;

  // ---- where the rover is, and the camera ----

  const matrices = new Float32Array(SLOTS * 16);
  const [rx, ry, ryaw] = view.rover ?? [0, 0, 0];
  const pose = restPose(rx, ry, ground.heightAt(rx, ry), ryaw);
  if (view.pose === 'tilt') {
    pose.rockerL = 0.2;
    pose.bogieL = -0.3;
    pose.rockerR = -0.12;
    pose.bogieR = 0.15;
    pose.pitch = 0.08;
    pose.roll = -0.05;
    pose.wheelSpin = [0.3, 0.6, 0.9, 0.2, 0.4, 0.6];
    pose.headYaw = 0.45;
  }
  pose.blink = view.blink ?? 0;
  poseRover(matrices, pose);
  const target: [number, number, number] = view.target ?? [rx, ry, pose.z - RIG.rest + 2];
  let eye: [number, number, number];
  if (view.chase !== undefined) {
    const back = view.chase;
    eye = [
      rx - Math.cos(ryaw) * Math.sin(TILT) * back,
      ry - Math.sin(ryaw) * Math.sin(TILT) * back,
      target[2] + Math.cos(TILT) * back,
    ];
  } else eye = view.eye!;
  cam.target = target;
  cam.position = eye;

  // ---- the ground, by chunk, at a level of detail by its distance from what the camera looks at ----

  const span = worldSpan(map);
  const side = Math.min(1024, 2 ** Math.ceil(Math.log2(span / 1.5)));
  renderer.setGroundTexture([
    await layer(groundTexels(map, side, 1), side),
    await layer(groundTexels(map, side, FAR_SCALE), side),
  ]);
  const rock = rockOf(map);
  const statics: GameGroup[] = [];
  const { cols, rows } = chunksOf(map);
  let groundTriangles = 0;
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const mx = map.grid.originX + (cx + 0.5) * CHUNK * map.grid.tile,
        my = map.grid.originY + (cy + 0.5) * CHUNK * map.grid.tile;
      const d = Math.hypot(mx - target[0], my - target[1]) - (CHUNK * map.grid.tile) / 2;
      const lod: Lod = d < 120 ? 'near' : d < 320 ? 'mid' : 'far';
      const meshes = chunkMeshes(map, cx, cy, lod, rock);
      groundTriangles += meshes.ground.indices.length / 3;
      statics.push(...chunkGroups(meshes, map, lod));
    }
  statics.push(...waterGroups(waterMeshes(map, ground)));

  // ---- the kit ----

  const placements = clearSight(map.placements, eye, target);
  const batch = new KitBatch(kitPieces(), () => placements.length);
  for (const p of placements) batch.add(p);
  statics.push(...batch.live());

  // ---- past the edge ----

  const back = backdropOf(map, ground);
  if (!lab) statics.push(...backdropGroups(back));
  renderer.setStatic(statics);

  // ---- what moves: the rover and the clouds ----

  const field = cloudField(ground.bounds);
  const cloudMatrices = lab
    ? []
    : Array.from({ length: CLOUD_SHAPES }, (_, k) => new Float32Array(cloudsOfShape(k) * 16));
  const time = view.time === 'shade' ? shadeTime(field, target) : (view.time ?? 30);
  if (!lab) placeClouds(field, time, cloudMatrices);
  // ?clouds=0 puts them away, to see what their shadows are
  if (query.get('clouds') === '0' || view.clouds === false) for (const m of cloudMatrices) m.fill(0);
  const dynamic: GameGroup[] = [
    ...(view.rover ? roverGroups(matrices) : []),
    ...cloudMatrices.map((m, k) => ({
      mesh: cloudMesh(k),
      matrices: m,
      albedo: [...CLOUD] as [number, number, number],
      roughness: ROUGH.cloud,
      occlusion: false,
    })),
  ];
  renderer.setDynamic(dynamic);
  renderer.time = time;
  renderer.wind = { ...WIND };
  // ?grass=0 draws none, to measure what the grass costs
  // ?cap=N tries the grass with room for N blades, for working on its options
  const cap = Number(query.get('cap') ?? 0);
  if (query.get('grass') !== '0' && view.grass !== false)
    await renderer.setGrass(grassField(map, ground), {
      ...GRASS_OPTIONS,
      ...(cap > 0 ? { capacity: cap } : {}),
      ...(query.has('near')
        ? { near: Number(query.get('near')), mid: Number(query.get('near')) + 1, far: Number(query.get('near')) + 2 }
        : {}),
    });

  const box: Box = { min: [0, 0, 0], max: [0, 0, 0] };
  sunBoxAround(target[0], target[1], box, { low: Math.min(map.waterLevel, -10) - 10 });
  renderer.setSunShadow(box);

  const resize = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth));
    const h = Math.max(1, Math.floor(canvas.clientHeight));
    canvas.width = w;
    canvas.height = h;
    cam.aspect = w / h;
    renderer.resize(w, h);
  };
  resize();
  await renderer.ready;
  await renderer.prepare();

  const draw = () => {
    cam.update();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', 1 / 60);
  };
  const measure = async () => {
    const t = ctx.device.createTexture({
      size: [canvas.width, canvas.height],
      format: ctx.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const v = t.createView();
    try {
      cam.update();
      return await frameCost(
        () => renderer.frame(v, 'redraw', 1 / 60),
        () => ctx.device.queue.onSubmittedWorkDone(),
      );
    } finally {
      t.destroy();
    }
  };
  for (let i = 0; i < 6; i++) draw();
  await ctx.device.queue.onSubmittedWorkDone();
  const triangles =
    statics.reduce((n, g) => n + (g.mesh.indices.length / 3) * (g.count ?? g.matrices.length / 16), 0) +
    (view.rover ? roverTriangles() : 0) +
    cloudMatrices.reduce((n, m, k) => n + (cloudMesh(k).indices.length / 3) * (m.length / 16), 0);
  const blades = await renderer.grassDrawn();
  stats.textContent = `${name}: ${blades.near + blades.far} blades, ${statics.length + dynamic.length} groups, ${Math.round(triangles / 1000)}k triangles (${Math.round(groundTriangles / 1000)}k ground), ${map.placements.length} placements`;
  window.preview = { ready: true, measure, triangles, info: stats.textContent };
  const loop = () => {
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err: unknown) => {
  window.preview = {
    ready: false,
    measure: () => Promise.resolve(0),
    error: err instanceof Error ? err.stack : String(err),
  };
  console.error(err);
});
