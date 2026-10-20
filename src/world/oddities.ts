/**
 * The oddities: what the player is out to photograph, set by hand where each
 * is a find. Five rubber ducks on still water (the mill pond, the black
 * tarn, the heath pool, a pool in the marsh and the Mere's shallow bay, never
 * the river's current), five garden gnomes (two in the village's gardens,
 * one before the orchard's rows, one in the pine chapel's ruin and one in a
 * clearing in the pine wood), and two UFOs hovering over the tops of witch
 * hill and shore rise. Each is named, so a test or a reviewer can point at
 * it, and turned so its front faces within a radian of the sun and a way the
 * rover can come to it, so the picture worth taking is lit. Each has its
 * look, a gnome's pose and what he holds or a duck's colour, so no two finds
 * are the same.
 *
 * Everything here is in tiles, as the layout is, and made the same every
 * game: the oddities draw their `vary` from a seed of their own, so placing
 * them takes nothing from the chance the scatter is sown with.
 */
import { seeded } from '../random';
import { WORLD_SEED } from './layout';
import { SUBJECTS, type Biome, type Ground, type Kind, type Placement, type SubjectKind } from './types';

/** An oddity as it is laid: its name, its kind, where it is in tiles, which way its front faces, and its clearing. */
export interface Oddity {
  name: string;
  kind: SubjectKind;
  x: number;
  y: number;
  yaw: number;
  /**
   * Its size against its kind's own (`SUBJECTS`): a duck is set half as big again, the size of the rover's body, and a
   * gnome a quarter bigger, so each reads from the chase camera's height as a thing and not a fleck of colour.
   */
  scale: number;
  /**
   * How far round it, in tiles, what the scatter sowed that could hide it is cleared, so it stands in the open and is
   * not lost in a thicket: a gnome a little room, the wood's gnome a clearing, and a UFO its hilltop.
   */
  clearing: number;
  /** Which of its kind's `SUBJECTS` looks it is: a gnome's pose, a duck's colour or hat. */
  look: number;
  /** And which of its kind's paints: a gnome's hat and coat, each gnome in his own. */
  paint: number;
}

export const ODDITIES: readonly Oddity[] = [
  // the ducks: in the shallows a tile or two out from a shore the rover can stand on, facing it and the sun, the trees
  // on the shore by each cleared so the chase camera sees it over them; a black duck on the black tarn, one in a top
  // hat on the heath pool, and on the Mere a giant, a metre tall
  { name: 'mill pond duck', kind: 'duck', x: 124.5, y: 120.3, yaw: 0.8, scale: 1.6, clearing: 3, look: 0, paint: 0 },
  { name: 'tarn duck', kind: 'duck', x: 98, y: 278.5, yaw: 0.6, scale: 1.6, clearing: 3, look: 1, paint: 0 },
  { name: 'heath pool duck', kind: 'duck', x: 290, y: 219.3, yaw: 1.2, scale: 1.6, clearing: 4, look: 2, paint: 0 },
  { name: 'marsh duck', kind: 'duck', x: 183.4, y: 137.4, yaw: 0.8, scale: 1.6, clearing: 3, look: 0, paint: 0 },
  { name: 'mere duck', kind: 'duck', x: 263, y: 95.4, yaw: 1.2, scale: 4, clearing: 3, look: 0, paint: 0 },
  // the gnomes, each facing within a radian of the sun, so the picture from in front of him is lit: one asleep on the
  // lawn under the west garden's wall (inside it, the open side faced away from the sun), one fishing in the east
  // garden, facing its open side; one with a barrow of apples before the orchard; one with a lantern in the pine
  // chapel, looking out through its arch; and one waving from a clearing of the pine wood
  { name: 'west garden gnome', kind: 'gnome', x: 70, y: 167.5, yaw: 0.8, scale: 1.25, clearing: 2, look: 2, paint: 4 },
  { name: 'east garden gnome', kind: 'gnome', x: 107.5, y: 165, yaw: 1.2, scale: 1.25, clearing: 2, look: 0, paint: 0 },
  { name: 'orchard gnome', kind: 'gnome', x: 135, y: 125.5, yaw: 0.8, scale: 1.25, clearing: 2, look: 3, paint: 3 },
  { name: 'chapel gnome', kind: 'gnome', x: 49.5, y: 249.5, yaw: 0.3, scale: 1.25, clearing: 2, look: 1, paint: 2 },
  { name: 'woodland gnome', kind: 'gnome', x: 84, y: 238, yaw: 0.7, scale: 1.25, clearing: 5, look: 4, paint: 1 },
  // the UFOs: over two open hilltops, a quarter bigger than their kind, 3.5 m across and as far over the ground
  { name: 'witch hill UFO', kind: 'ufo', x: 36, y: 57, yaw: 0.3, scale: 1.25, clearing: 6, look: 0, paint: 0 },
  { name: 'shore rise UFO', kind: 'ufo', x: 268, y: 146, yaw: 1.1, scale: 1.25, clearing: 6, look: 0, paint: 0 },
];

/** The oddities' own seed: their `vary`, from a stream that is not the scatter's. */
const ODDITY_SEED = WORLD_SEED ^ 0x0dd;

/**
 * Every oddity as a placement in units: a duck floating on the water, a gnome standing on the ground, and a UFO
 * `SUBJECTS.ufo.hover` over it. `units` turns the layout's tiles into the world's; `biomeAt` is the biome strongest
 * where it is, which picks nothing of its colour but is kept, as every placement's is.
 */
export function placeOddities(
  ground: Ground,
  waterLevel: number,
  units: (px: number, py: number) => { x: number; y: number },
  biomeAt: (x: number, y: number) => Biome,
): Placement[] {
  const random = seeded(ODDITY_SEED);
  return ODDITIES.map((o) => {
    const { x, y } = units(o.x, o.y);
    const floor = ground.heightAt(x, y);
    const z = o.kind === 'duck' ? waterLevel : floor + SUBJECTS[o.kind].hover * o.scale;
    return { kind: o.kind, x, y, z, yaw: o.yaw, scale: o.scale, biome: biomeAt(x, y), vary: varyOf(o, random()) };
  });
}

/**
 * An oddity's `vary`: in the share of nought to one its look takes (`lookOf`), in the part of that its paint takes
 * (`paintOf`), and where in that part by `chance`, a number in [0, 1) from the oddities' stream, kept a little off
 * either end of it so no rounding takes it to the next. A UFO's bob takes its phase from it.
 */
export function varyOf(o: Pick<Oddity, 'kind' | 'look' | 'paint'>, chance: number): number {
  const n = SUBJECTS[o.kind].looks.length,
    m = SUBJECTS[o.kind].paints;
  return (o.look + (o.paint + 0.02 + chance * 0.96) / m) / n;
}

/**
 * Whether a scattered thing of `kind` at (px, py), in tiles, is in an oddity's clearing and so left out: a tree, a
 * bush, a fern, a boulder or a clump of reeds, any of which could hide it. Flowers and lilies are left, since a duck
 * among the lily pads is the picture. Only what is sown is cleared: what the layout sets by hand, an orchard's trees
 * or a garden's beds, stays where it was laid.
 */
export function inClearing(kind: Kind, px: number, py: number): boolean {
  if (kind === 'flowers' || kind === 'lily') return false;
  for (const o of ODDITIES) if (o.clearing > 0 && (px - o.x) ** 2 + (py - o.y) ** 2 < o.clearing ** 2) return true;
  return false;
}

/**
 * How far a UFO stands over its placement's height at game time `t`, in units: it bobs a little, slowly, each by its
 * own phase from `vary`, so two are never in step. Pure, makes nothing, and draws nothing, so it lives with the world
 * and not the models: the scene adds it to the saucer's height each frame, and the grade reads the same figure for
 * where it is.
 */
export function ufoBob(t: number, vary: number): number {
  return BOB.height * Math.sin(((t / BOB.period) * 2 + vary * 2) * Math.PI);
}

/** The bob: up and down by this much either way, in units, once in so many seconds. */
export const BOB = { height: 1.2, period: 3.2 } as const;
