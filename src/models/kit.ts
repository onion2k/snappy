/**
 * The kit: every kind a `Placement` can name, as the pieces the renderer
 * draws, and the colour each piece takes in each biome.
 *
 * A piece is one mesh of one kind's variant in one colour tier: a broadleaf's
 * leaves in their lit tier, a cottage's roof. Its colour is not its own but
 * each placement's, written into the group's `materials`, so one group of a
 * broadleaf's leaves draws a meadow's fresh green and an autumn wood's orange
 * side by side, and a kind needs no group per biome. What grows is cut into
 * golf's baked tiers of light (`shape.ts`); since those are right at one turn
 * only, a tree is made in `BUCKETS` variants, each a different seed baked for
 * its own turn, and a placement is drawn as the variant its yaw falls nearest
 * and at that variant's turn, so its bright side is always toward the sun.
 * What is built, and the reeds and flowers, are turned freely.
 *
 * `KitBatch` gathers placements into groups with nothing made per placement,
 * for a static set filled once or a dynamic pool refilled as the camera
 * moves.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { SUN } from '../sun';
import {
  BIOME,
  BUILT,
  KINDS,
  SUBJECT_KINDS,
  SUBJECTS,
  lookOf,
  paintOf,
  type Biome,
  type Kind,
  type Placement,
  type SubjectKind,
} from '../world/types';
import { BUILT_VARIANTS, builtOf, footprintOf, type BuiltKind } from './built';
import { BUILT_COLOURS as B, ROUGH, WOOD, shown, type Rgb } from './palette';
import { farTreeMeshes } from './backdrop';
import { ODDITY_PARTS, oddityOf } from './oddities';
import { SIZE, sceneryOf, type SceneryKind } from './scenery';
import { TIERS, capHull, clippedBelow, split, type Tier } from './shape';
import { at, lump, seeded } from 'artshape-render/mesh/lowpoly';

/** How many turns a tree is made for, a sixth of a turn apart: a placement is drawn at most a twelfth of a turn from its own yaw. */
export const BUCKETS = 6;

/** The kinds made in buckets of turn and baked light. */
const TONED: ReadonlySet<Kind> = new Set<Kind>([
  'broadleaf',
  'conifer',
  'twisted',
  'bush',
  'fern',
  'boulder',
  'willow',
  'fruit',
]);

/** The parts that are cut into tiers, and which tiers: everything leafy one way, rock its own four. */
const TIERED: Record<string, readonly Tier[]> = {
  leaves: TIERS.leaf,
  crown: TIERS.leaf,
  bush: TIERS.leaf,
  fern: TIERS.leaf,
  rock: TIERS.rock,
};

/** A broadleaf's crown, the lump on top, lighter than the lumps under it, as a canopy is lit from above (golf's). */
const CROWN_LIFT: Rgb = [1.22, 1.18, 1.05];

/** The turn a bucket's trees are drawn at. */
export const bucketYaw = (k: number) => (k / BUCKETS) * Math.PI * 2;

/** The bucket nearest a yaw, whatever the yaw. */
export function bucketOf(yaw: number): number {
  const turns = yaw / (Math.PI * 2);
  return ((Math.round(turns * BUCKETS) % BUCKETS) + BUCKETS) % BUCKETS;
}

/** How many variants a kind is made in. */
export function variantsOf(kind: Kind): number {
  if (TONED.has(kind)) return BUCKETS;
  if (BUILT.has(kind)) return BUILT_VARIANTS[kind as BuiltKind];
  // an oddity in its kind's looks, a gnome's poses and a duck's colours and hats
  if (SUBJECT_KINDS.has(kind)) return SUBJECTS[kind as SubjectKind].looks.length;
  // what is made, and is the same every time, in one; a signpost's arms differ; the rest in three
  return kind === 'post' || kind === 'bench' || kind === 'lamp' ? 1 : kind === 'signpost' ? 2 : 3;
}

/** A number in [0, 1) from another, as unlike it as a few multiplications make it: so a variant and a colour, both from `vary`, are not the same choice. */
const scramble = (v: number) => {
  const x = Math.sin(v * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Which variant a placement is drawn as: its yaw's bucket for a tree, an oddity's look as the world set it in its
 * `vary` (`lookOf`), and otherwise chosen by its `vary`.
 */
export function variantOf(p: Placement): number {
  if (TONED.has(p.kind)) return bucketOf(p.yaw);
  if (SUBJECT_KINDS.has(p.kind)) return lookOf(p.kind as SubjectKind, p.vary);
  return Math.min(variantsOf(p.kind) - 1, Math.floor(scramble(p.vary) * variantsOf(p.kind)));
}

/** The sun as a mesh turned `yaw` sees it: so a mesh baked with it and placed at `yaw` is lit from the sun. */
function turnedSun(yaw: number): [number, number, number] {
  const l = Math.hypot(SUN[0], SUN[1], SUN[2]);
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [(SUN[0] * c + SUN[1] * s) / l, (-SUN[0] * s + SUN[1] * c) / l, SUN[2] / l];
}

/** One mesh of one variant of one kind, in one tier of light: a group of the renderer. */
export interface KitPiece {
  kind: Kind;
  variant: number;
  part: string;
  tier: number;
  mesh: Mesh;
  /** What the placement's colour is multiplied by for this tier. */
  mul: Rgb;
  rough: number;
  /** What the mesh is scaled by before the placement's own scale: one, but a far tree's mesh is a unit tall. */
  size: number;
  /** A far tree: drawn into no shadow map and no occlusion. */
  far: boolean;
}

const ONE: Rgb = [1, 1, 1];

/** How rough each part is: leaves and stone are matte, painted wood and a door take a soft highlight. */
function roughOf(part: string): number {
  if (part === 'rock' || part.startsWith('stone') || part.startsWith('ruin') || part === 'moss' || part === 'floor')
    return ROUGH.stone;
  if (part === 'door' || part === 'frame') return ROUGH.paint;
  if (part === 'window' || part === 'water') return 0.3;
  if (part === 'trunk' || part === 'post' || part === 'rail' || part === 'timber') return ROUGH.wood;
  return ROUGH.leaves;
}

/** Every piece of one kind, every variant. Made once. */
export function kindPieces(kind: Kind): KitPiece[] {
  const out: KitPiece[] = [];
  const n = variantsOf(kind);
  for (let v = 0; v < n; v++) {
    const odd = SUBJECT_KINDS.has(kind);
    const model = BUILT.has(kind)
      ? builtOf(kind as BuiltKind, v)
      : odd
        ? oddityOf(kind as SubjectKind, v)
        : sceneryOf(kind as SceneryKind, v + 1);
    for (const part of model.parts) {
      const tiers = TONED.has(kind) ? TIERED[part.name] : undefined;
      const lift = part.name === 'crown' ? CROWN_LIFT : ONE;
      const rough = odd ? ODDITY_PARTS[part.name].rough : roughOf(part.name);
      const base = { kind, variant: v, part: part.name, rough, size: 1, far: false };
      if (!tiers) {
        out.push({ ...base, tier: 0, mesh: part.mesh, mul: lift });
        continue;
      }
      split(part.mesh, turnedSun(bucketYaw(v)), tiers).forEach((mesh, t) => {
        if (mesh.indices.length === 0) return;
        const m = tiers[t].mul;
        out.push({ ...base, tier: t, mesh, mul: [m[0] * lift[0], m[1] * lift[1], m[2] * lift[2]] });
      });
    }
  }
  return out;
}

/**
 * How a tall thing is drawn while it is cut out of the camera's way, in its own units: a tree as a knee-high clump of
 * undergrowth `clump` tall in its own crown's colour, so a cut wood reads as a wood's floor and not as one felled (a
 * field of stumps did, review 3, 4); a building as its walls' feet `built` tall, closed with a flat cap. A cut thing is
 * swapped for this whole, and never squashed: a squashed house was a flat cake with its roof pressed onto its walls
 * (review 2, 1 and 2).
 */
export const LOW = { clump: 3, built: 9 } as const;

/** The undergrowth a cut tree leaves: its crown's colour a step into the shade, as what grows under a canopy is. */
const UNDER: Rgb = [0.82, 0.86, 0.84];

/** A knee-high clump of undergrowth at its origin, `LOW.clump` tall and about twice as wide: two soft lumps. */
function clumpMesh(seed: number): Mesh {
  const b = new MeshBuilder();
  const random = seeded(seed * 97 + 5);
  const h = LOW.clump;
  lump(b, at(0.6, 0.2, h * 0.45), random, 2, 6, [h * 0.9, h * 0.8, h * 0.55], { give: 0.18 });
  lump(b, at(-1.6, -0.9, h * 0.32), random, 2, 5, [h * 0.6, h * 0.55, h * 0.36], { give: 0.18 });
  return b.build();
}

/**
 * The low pieces of one tall kind, every variant: a tree's clump of undergrowth, coloured as its crown is (the part is
 * its leaves'), or a building cut to its walls' feet and capped over each rectangle of its footprint, the cap the colour
 * of the wall's top stone. Each piece keeps its variant, so a placement draws the low variant of its own.
 */
export function lowPieces(kind: Kind): KitPiece[] {
  const out: KitPiece[] = [];
  if (!BUILT.has(kind)) {
    for (let v = 0; v < variantsOf(kind); v++)
      out.push({
        kind,
        variant: v,
        part: 'leaves',
        tier: 0,
        mesh: clumpMesh(v + 1),
        mul: UNDER,
        rough: ROUGH.leaves,
        size: 1,
        far: false,
      });
    return out;
  }
  const z = LOW.built;
  const pieces = kindPieces(kind);
  const rects = footprintOf(kind as BuiltKind);
  for (let v = 0; v < variantsOf(kind); v++) {
    // each rectangle of a footprint its own cap, so an arch's two piers are two and the gap between them open
    const sections: number[][] = rects.map(() => []);
    for (const piece of pieces) {
      if (piece.variant !== v) continue;
      const section: number[] = [];
      const mesh = clippedBelow(piece.mesh, z, section);
      if (mesh.indices.length) out.push({ ...piece, mesh });
      for (let i = 0; i < section.length; i += 2) {
        let best = 0,
          far = Infinity;
        rects.forEach(([mx, my, rx, ry], r) => {
          const d = Math.max(Math.abs(section[i] - mx) - rx, Math.abs(section[i + 1] - my) - ry);
          if (d < far) {
            far = d;
            best = r;
          }
        });
        sections[best].push(section[i], section[i + 1]);
      }
    }
    const cap = new MeshBuilder();
    for (const s of sections) capHull(cap, s, z);
    if (cap.triangleCount === 0) continue;
    out.push({
      kind,
      variant: v,
      part: 'stoneDark',
      tier: 0,
      mesh: cap.build(),
      mul: ONE,
      rough: ROUGH.stone,
      size: 1,
      far: false,
    });
  }
  return out;
}

/** Every piece of every kind. */
export function kitPieces(): KitPiece[] {
  return KINDS.flatMap((k) => kindPieces(k));
}

/**
 * A far tree's colour against its kind's crown: a step into the shade, as the whole tree's lit, middle and shaded
 * tiers come to together from afar; at one, the far ring was a band of pale green diamonds (review 3, 9).
 */
const FAR_SHADE: Rgb = [0.76, 0.8, 0.84];

/**
 * The far trees: the backdrop's own, a conifer of three tiers for a conifer and a ball on a stem for the rest, a unit
 * tall and scaled to the kind's height, in one variant each and turned freely, so the far ring is the same wood the
 * hills past the edge are (golf's sixteen-triangle lump read as a band of diamonds, review 3, 9). Everything smaller
 * is not drawn far off.
 */
export function farPieces(): KitPiece[] {
  const meshes = farTreeMeshes();
  const make = (kind: Kind, shape: 'conifer' | 'broadleaf'): KitPiece => ({
    kind,
    variant: 0,
    part: 'leaves',
    tier: 0,
    mesh: meshes[shape],
    mul: FAR_SHADE,
    rough: ROUGH.leaves,
    size: SIZE[kind as SceneryKind],
    far: true,
  });
  return [
    make('broadleaf', 'broadleaf'),
    make('conifer', 'conifer'),
    make('twisted', 'broadleaf'),
    make('willow', 'broadleaf'),
    make('fruit', 'broadleaf'),
  ];
}

// ---- colour ----

/** Palettes for a part in each biome, a few colours each that `vary` picks between. */
type Palette = Record<Biome, readonly Rgb[]>;

const { meadow, pine, autumn, heath, wetland } = BIOME;

/**
 * A broadleaf's leaves: the meadow's fresh lime, the pine wood's a deeper green, the autumn wood's orange, red, gold
 * and amber with an odd one still green, the heath's olive, and the wetland's soft willow green.
 */
const LEAVES: Palette = {
  // a step less saturated than golf's, whose sunlit tier read as lime from the chase camera (review 1, 11)
  [meadow]: [shown(0.38, 0.64, 0.19), shown(0.44, 0.68, 0.22), shown(0.33, 0.58, 0.18)],
  [pine]: [shown(0.3, 0.58, 0.2), shown(0.26, 0.54, 0.18)],
  [autumn]: [
    shown(0.92, 0.52, 0.18),
    shown(0.84, 0.3, 0.16),
    shown(0.92, 0.7, 0.26),
    shown(0.9, 0.6, 0.2),
    shown(0.76, 0.36, 0.16),
    shown(0.6, 0.64, 0.26),
  ],
  [heath]: [shown(0.48, 0.56, 0.24), shown(0.42, 0.5, 0.26)],
  [wetland]: [shown(0.4, 0.7, 0.3), shown(0.46, 0.72, 0.34)],
};

/** A conifer's needles: dark blue-greens, and in the autumn wood a few larches gone gold. */
const NEEDLES: Palette = {
  [meadow]: [shown(0.15, 0.5, 0.26)],
  [pine]: [shown(0.1, 0.42, 0.3), shown(0.12, 0.46, 0.32), shown(0.08, 0.38, 0.27)],
  [autumn]: [shown(0.12, 0.44, 0.28), shown(0.92, 0.66, 0.2), shown(0.12, 0.42, 0.26)],
  [heath]: [shown(0.16, 0.38, 0.26)],
  [wetland]: [shown(0.15, 0.47, 0.3)],
};

/** The heath's twisted tree: a sage green, some in a pink-mauve blossom; elsewhere the biome's leaf. */
const TWISTED: Palette = {
  ...LEAVES,
  // one in six in blossom, and a soft one (review 2, 5)
  [heath]: [
    shown(0.44, 0.54, 0.3),
    shown(0.4, 0.5, 0.28),
    shown(0.46, 0.52, 0.32),
    shown(0.42, 0.52, 0.3),
    shown(0.38, 0.48, 0.28),
    shown(0.72, 0.52, 0.64),
  ],
};

/** A bush: hedge green, the pine's darker, autumn's red-brown and gold, the heath's gorse yellow-green and heather mauve. */
const BUSH: Palette = {
  [meadow]: [shown(0.3, 0.62, 0.16), shown(0.36, 0.66, 0.18)],
  [pine]: [shown(0.2, 0.48, 0.22)],
  [autumn]: [shown(0.84, 0.34, 0.16), shown(0.9, 0.6, 0.18), shown(0.6, 0.5, 0.16)],
  [heath]: [shown(0.48, 0.32, 0.42), shown(0.62, 0.6, 0.22), shown(0.42, 0.3, 0.38)],
  [wetland]: [shown(0.24, 0.56, 0.3), shown(0.3, 0.6, 0.28)],
};

/** A fern: a fresh green in the woods, and bracken gone orange-brown in the autumn wood and on the heath. */
const FERN: Palette = {
  [meadow]: [shown(0.3, 0.64, 0.2)],
  [pine]: [shown(0.18, 0.56, 0.22), shown(0.22, 0.6, 0.24)],
  [autumn]: [shown(0.84, 0.5, 0.18), shown(0.78, 0.42, 0.16)],
  [heath]: [shown(0.72, 0.46, 0.22), shown(0.6, 0.5, 0.24)],
  [wetland]: [shown(0.22, 0.6, 0.3)],
};

/** A boulder: a warm grey, the heath's paler and bleached, the pine wood's and the wetland's mossed a little green. */
const ROCKS: Palette = {
  [meadow]: [shown(0.5, 0.47, 0.43), shown(0.55, 0.5, 0.45)],
  [pine]: [shown(0.47, 0.5, 0.42), shown(0.52, 0.52, 0.47)],
  [autumn]: [shown(0.5, 0.45, 0.4)],
  [heath]: [shown(0.53, 0.51, 0.49), shown(0.48, 0.47, 0.46)],
  [wetland]: [shown(0.45, 0.47, 0.42)],
};

/** Flowers' petals: the meadow's pink, yellow, white and blue; heath's purple and magenta; and so on. */
const PETALS: Palette = {
  [meadow]: [shown(0.97, 0.42, 0.62), shown(1, 0.86, 0.22), shown(0.98, 0.97, 0.95), shown(0.5, 0.62, 0.98)],
  [pine]: [shown(0.98, 0.97, 0.95), shown(0.62, 0.66, 0.98)],
  [autumn]: [shown(0.99, 0.66, 0.18), shown(0.98, 0.82, 0.24), shown(0.9, 0.36, 0.2)],
  [heath]: [shown(0.72, 0.38, 0.86), shown(0.9, 0.38, 0.7), shown(0.62, 0.4, 0.82)],
  [wetland]: [shown(1, 0.88, 0.2), shown(0.98, 0.97, 0.95)],
};

const one = (c: Rgb): Palette => ({ [meadow]: [c], [pine]: [c], [autumn]: [c], [heath]: [c], [wetland]: [c] });
const STEM = one(WOOD.stem);
const EYE = one(shown(1, 0.82, 0.25));
const REED = one(shown(0.52, 0.64, 0.28));
const REED_HEAD = one(shown(0.48, 0.32, 0.2));
const TRUNK: Palette = { ...one(WOOD.trunk), [heath]: [WOOD.pale], [pine]: [shown(0.52, 0.3, 0.2)] };

/** What each built part is made in, whatever the biome: a roof's colour is chosen by `vary` among `BUILT_COLOURS.roofs`. */
/** The willow's dark blue-green (review 2, 4), the apple tree's fresh green and its apples, red or a few still green. */
const WILLOW = one(shown(0.32, 0.5, 0.3));
/** The willow's strands' tips: the new leaves, lighter and yellower. */
const WILLOW_TIPS = one(shown(0.62, 0.76, 0.42));
const ORCHARD = one(shown(0.36, 0.66, 0.2));
const APPLES = one(shown(0.88, 0.16, 0.12));
const PADS = one(shown(0.3, 0.58, 0.24));
const BLOOM = one(shown(0.98, 0.82, 0.9));
/** The village's furniture: painted white posts with red tops, weathered timber, dark iron, and a lamp's warm glass. */
const PROP_PART: Record<string, readonly Rgb[]> = {
  post: [shown(0.94, 0.92, 0.86)],
  paint: [shown(0.84, 0.22, 0.16)],
  seat: [shown(0.6, 0.42, 0.26)],
  iron: [shown(0.2, 0.22, 0.26)],
  glass: [shown(1, 0.86, 0.5)],
};

const BUILT_PART: Record<string, readonly Rgb[]> = {
  walls: [B.plaster],
  stone: [B.stone],
  stoneDark: [B.stoneDark],
  moss: [B.moss],
  ruin: [B.ruin],
  ruinDark: [B.ruinDark],
  floor: [shown(0.36, 0.34, 0.3)],
  timber: [B.timber],
  post: [WOOD.pale],
  rail: [shown(0.7, 0.6, 0.48)],
  door: [B.door, shown(0.62, 0.3, 0.24), shown(0.32, 0.56, 0.36)],
  window: [B.window],
  frame: [B.frame],
  roof: B.roofs,
  slate: [B.roofs[1]],
  water: [B.water],
  hay: [shown(0.92, 0.76, 0.36), shown(0.88, 0.72, 0.32)],
  hayDark: [shown(0.72, 0.56, 0.26)],
  plank: [shown(0.62, 0.45, 0.28)],
  iron: [shown(0.22, 0.23, 0.26)],
  crate: [shown(0.72, 0.54, 0.33)],
  cloth: [shown(0.93, 0.89, 0.8)],
  awning: [shown(0.86, 0.24, 0.2), shown(0.24, 0.5, 0.78), shown(0.26, 0.62, 0.34)],
  awningLight: [shown(0.96, 0.93, 0.85)],
  apples: [shown(0.88, 0.18, 0.14)],
  greens: [shown(0.5, 0.76, 0.26)],
  gourds: [shown(0.96, 0.56, 0.16)],
  sail: [shown(0.95, 0.92, 0.84)],
  menhir: [shown(0.6, 0.58, 0.55), shown(0.55, 0.54, 0.52), shown(0.62, 0.58, 0.52)],
};

/** The palette for a part of a kind. */
function paletteOf(kind: Kind, part: string): Palette | readonly Rgb[] {
  if (BUILT.has(kind)) return BUILT_PART[part] ?? [B.stone];
  if (part === 'trunk') return TRUNK;
  switch (kind) {
    case 'broadleaf':
      return LEAVES;
    case 'conifer':
      return NEEDLES;
    case 'twisted':
      return TWISTED;
    case 'bush':
      return BUSH;
    case 'fern':
      return FERN;
    case 'boulder':
      return ROCKS;
    case 'reed':
      return part === 'head' ? REED_HEAD : REED;
    case 'flowers':
      return part === 'petal' ? PETALS : part === 'eye' ? EYE : STEM;
    case 'willow':
      return part === 'tips' ? WILLOW_TIPS : WILLOW;
    case 'fruit':
      return part === 'apples' ? APPLES : ORCHARD;
    case 'lily':
      return part === 'bloom' ? BLOOM : PADS;
    case 'stepping':
      return ROCKS;
    case 'post':
    case 'signpost':
    case 'bench':
    case 'lamp':
      return PROP_PART[part] ?? [B.timber];
    // the oddities: each part its own colour, the same in every biome
    case 'duck':
    case 'gnome':
    case 'ufo':
      return ODDITY_PARTS[part].colours ?? [ODDITY_PARTS[part].colour];
    // the built kinds, answered above
    case 'cottage':
    case 'church':
    case 'well':
    case 'fence':
    case 'wall':
    case 'tower':
    case 'arch':
    case 'column':
    case 'haystack':
    case 'cart':
    case 'stall':
    case 'windmill':
    case 'menhir':
      return [B.stone];
  }
}

/**
 * Writes the colour a placement's part takes, before its tier, into `out` at `o`: its biome's palette, the colour in
 * it `vary` picks, a little lighter or darker by `vary` again so no two trees are quite alike. Makes nothing.
 */
export function partColour(kind: Kind, part: string, biome: Biome, vary: number, out: Float32Array, o: number) {
  const palette = paletteOf(kind, part);
  const list = Array.isArray(palette) ? (palette as readonly Rgb[]) : (palette as Palette)[biome];
  // an oddity's `vary` says its look first, and then its paint, which picks its colours (`paintOf`)
  const pick = SUBJECT_KINDS.has(kind) ? paintOf(kind as SubjectKind, vary) : Math.floor(vary * list.length);
  const c = list[Math.min(list.length - 1, pick)];
  // what is made is the colour it was made in; what grows varies a little
  const shade = BUILT.has(kind) || SUBJECT_KINDS.has(kind) ? 1 : 0.9 + 0.2 * scramble(vary + 0.5);
  out[o] = c[0] * shade;
  out[o + 1] = c[1] * shade;
  out[o + 2] = c[2] * shade;
}

// ---- placing ----

/**
 * The water's level, for the kinds that float on it or stand out of it: a lily pad lies on it, and a stepping stone's
 * top stands a little over it. Set once by the scene for its world; minus infinity, nothing floats.
 */
export const WATER_AT = new Float64Array([-Infinity]);

/** How far a tree is sunk into the ground, so its foot is in the ground on a slope and never over it. */
const SINK: Partial<Record<Kind, number>> = {
  broadleaf: 0.6,
  conifer: 0.6,
  twisted: 0.4,
  willow: 0.6,
  fruit: 0.5,
  bush: 0.3,
  reed: 0.2,
  // a boulder sits a fifth of its height in the ground, as one that has lain there does
  boulder: 1.2,
};

/**
 * What `kitMatrix` shrinks a placement by, all over and then upright only: one and one unless a batch is shrinking one
 * out of the way (`KitBatch.resize`): a tree shrunk whole, a house cut down to its walls' feet, a bush pressed flat. It
 * is read from here and not handed in, since a number with a fraction handed to a call that is not inlined is boxed.
 */
const SHRINK = new Float64Array([1, 1]);

/** How a heath bush is drawn against another: wider, and half as tall. */
export const HEATHER = { wide: 1.3, tall: 0.5 } as const;

/** Writes a placement's matrix for `piece` into `out` at matrix `i`: its own place, its bucket's turn for a tree, its scale. */
export function kitMatrix(p: Placement, piece: Pick<KitPiece, 'size' | 'far'>, out: Float32Array, i: number) {
  const yaw = TONED.has(p.kind) && !piece.far ? bucketYaw(bucketOf(p.yaw)) : p.yaw;
  const s = p.scale * piece.size * SHRINK[0];
  // the heath's bushes are heather and gorse: low wide domes, not round bushes (review 2, 5)
  const heather = p.kind === 'bush' && p.biome === BIOME.heath;
  const wide = heather ? HEATHER.wide : 1;
  const c = Math.cos(yaw) * s * wide,
    n = Math.sin(yaw) * s * wide;
  const o = i * 16;
  out[o] = c;
  out[o + 1] = n;
  out[o + 2] = 0;
  out[o + 3] = 0;
  out[o + 4] = -n;
  out[o + 5] = c;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = 0;
  out[o + 9] = 0;
  out[o + 10] = s * SHRINK[1] * (heather ? HEATHER.tall : 1);
  out[o + 11] = 0;
  out[o + 12] = p.x;
  out[o + 13] = p.y;
  let z = p.z - (SINK[p.kind] ?? 0) * p.scale;
  if (p.kind === 'lily') z = Math.max(z, WATER_AT[0] + 0.04);
  else if (p.kind === 'stepping') z = Math.max(z + 0.6, WATER_AT[0] + 0.3);
  out[o + 14] = z;
  out[o + 15] = 1;
}

/**
 * Placements gathered into the kit's groups, one a piece, each with room for `capacity(kind)` placements. `add` writes
 * a placement into every group of its kind's variant, its matrix and its colour times the piece's tier, and makes
 * nothing; `clear` empties them. For a static set, fill it once and hand the renderer the groups with something in
 * them (`live`); for a dynamic pool, hand it every group once (`setDynamic`), and after each refill write group `i`
 * with `move(i, groups[i].matrices, groups[i].count)` and `tint(i, groups[i].materials)`.
 */
export class KitBatch {
  readonly groups: GameGroup[];
  readonly pieces: readonly KitPiece[];
  /** For each kind and variant, the pieces drawn for it: `first[k * MAX + v]` to `first[k * MAX + v + 1]` in `order`. */
  private readonly first: Int32Array;
  private readonly order: Int32Array;
  private readonly capacities: Int32Array;
  private readonly colour = new Float32Array(3);
  private static readonly MAX = BUCKETS;
  /** Which groups have been written since the page last moved them: one each, set by `add` and `resize`. */
  readonly dirty: Uint8Array;
  /** Where the last placement `add` took went, in each of its groups: the same place in all of them. */
  lastIndex = -1;
  /** What `resize` shrinks to, all over and upright only: set them, then call. */
  readonly shrink = new Float64Array([1, 1]);

  constructor(pieces: readonly KitPiece[], capacity: (kind: Kind) => number) {
    this.pieces = pieces;
    this.capacities = Int32Array.from(pieces, (p) => Math.max(1, capacity(p.kind)));
    this.groups = pieces.map((p, i) => ({
      mesh: p.mesh,
      matrices: new Float32Array(this.capacities[i] * 16),
      materials: new Float32Array(this.capacities[i] * 4),
      count: 0,
      roughness: p.rough,
      ...(p.far ? { shadow: false, occlusion: false } : {}),
    }));
    this.dirty = new Uint8Array(pieces.length);
    const slots = KINDS.length * KitBatch.MAX;
    const lists: number[][] = Array.from({ length: slots }, () => []);
    pieces.forEach((p, i) => lists[KINDS.indexOf(p.kind) * KitBatch.MAX + p.variant].push(i));
    this.first = new Int32Array(slots + 1);
    this.order = new Int32Array(pieces.length);
    let at = 0;
    lists.forEach((l, s) => {
      this.first[s] = at;
      for (const i of l) this.order[at++] = i;
    });
    this.first[slots] = at;
  }

  clear() {
    for (const g of this.groups) g.count = 0;
  }

  /** Adds a placement to its pieces' groups; false, and nothing added, where a group of them is full or none draws it. */
  add(p: Placement): boolean {
    const far = this.pieces.length > 0 && this.pieces[0].far;
    const slot = KINDS.indexOf(p.kind) * KitBatch.MAX + (far ? 0 : variantOf(p));
    const from = this.first[slot],
      to = this.first[slot + 1];
    if (from === to) return false;
    for (let k = from; k < to; k++)
      if (this.groups[this.order[k]].count! >= this.capacities[this.order[k]]) return false;
    for (let k = from; k < to; k++) {
      const i = this.order[k];
      const piece = this.pieces[i],
        g = this.groups[i];
      const n = g.count!;
      kitMatrix(p, piece, g.matrices, n);
      partColour(p.kind, piece.part, p.biome, p.vary, this.colour, 0);
      const m = g.materials!;
      m[n * 4] = Math.min(1, this.colour[0] * piece.mul[0]);
      m[n * 4 + 1] = Math.min(1, this.colour[1] * piece.mul[1]);
      m[n * 4 + 2] = Math.min(1, this.colour[2] * piece.mul[2]);
      m[n * 4 + 3] = piece.rough;
      g.count = n + 1;
      this.dirty[i] = 1;
      this.lastIndex = n;
    }
    return true;
  }

  /**
   * Writes again the matrices of `p`, added at `at` (its `lastIndex` then), scaled by `shrink[0]` of its size and its
   * height by `shrink[1]` more: nought puts it out of sight, one back as it was. Marks its groups dirty. Makes nothing.
   */
  resize(p: Placement, at: number): void {
    const far = this.pieces.length > 0 && this.pieces[0].far;
    const slot = KINDS.indexOf(p.kind) * KitBatch.MAX + (far ? 0 : variantOf(p));
    SHRINK[0] = this.shrink[0];
    SHRINK[1] = this.shrink[1];
    for (let k = this.first[slot]; k < this.first[slot + 1]; k++) {
      const i = this.order[k];
      kitMatrix(p, this.pieces[i], this.groups[i].matrices, at);
      this.dirty[i] = 1;
    }
    SHRINK[0] = SHRINK[1] = 1;
  }

  /** The groups with something in them: what a static set is handed. */
  live(): GameGroup[] {
    return this.groups.filter((g) => g.count! > 0);
  }
}
