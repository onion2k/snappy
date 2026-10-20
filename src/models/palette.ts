/**
 * The colours the world is made in. A colour is written as it should show on
 * the screen in full sun and `shown` turns it into the linear light the
 * renderer takes, as golf's palette does (ooergolf's `models/palette.ts`):
 * toon light shows a colour at its full strength and the screen's curve lifts
 * it, so a colour written down as the renderer takes it comes out pale. One
 * palette, so the rover's orange and a cottage's door are one family, and the
 * five biomes are told apart by colours chosen side by side.
 */
import { BIOME, type Biome } from '../world/types';

export type Rgb = readonly [number, number, number];

/** One channel as the screen shows it, into linear light: the sRGB curve, undone. */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A colour as it should show on the screen in full sun, as the renderer takes it. */
export const shown = (r: number, g: number, b: number): Rgb => [linear(r), linear(g), linear(b)];

/** How rough each kind of surface is: smooth paint takes a highlight, leaves, stone and earth take none. */
export const ROUGH = {
  plastic: 0.32,
  lens: 0.12,
  metal: 0.4,
  paint: 0.55,
  wood: 0.85,
  leaves: 0.88,
  stone: 0.92,
  earth: 0.95,
  cloud: 0.95,
} as const;

/**
 * The rover's colours: a warm white and not a pure one, which glares in a toon sun; golf's toy orange at its full
 * saturation, so the rover carries at the home zoom's distance (review 2, 3); a soft dark for the tyres that keeps a
 * colour in the shade, and its tread a step lighter, so the lugs read against it; a neutral mid grey steel for the arms
 * and joints, dark enough to stand apart from the white plastic and the tread alike; a warm foil gold; the near black
 * of the eye's glass, which the toon gloss puts a highlight on, round a bright blue iris that makes the one lens read
 * as an eye from the chase camera; and a red light by it, a camera's sign that it is on. The lid is the barrel's
 * orange with a dark seam across it, so the eye shut reads as a lid closed and never as a blank white eyeball; the
 * screen on the back is near black.
 */
export const ROVER_COLOURS = {
  white: shown(0.96, 0.94, 0.89),
  orange: shown(1, 0.45, 0.04),
  dark: shown(0.25, 0.25, 0.3),
  tyre: shown(0.3, 0.29, 0.32),
  tread: shown(0.36, 0.35, 0.38),
  steel: shown(0.42, 0.45, 0.5),
  lens: shown(0.05, 0.07, 0.17),
  ring: shown(0.16, 0.17, 0.22),
  iris: shown(0.22, 0.56, 0.95),
  glint: shown(1, 1, 1),
  light: shown(1, 0.18, 0.16),
  lid: shown(1, 0.45, 0.04),
  seam: shown(0.42, 0.2, 0.08),
  screen: shown(0.1, 0.13, 0.2),
  gold: shown(0.93, 0.66, 0.22),
  rtg: shown(0.4, 0.4, 0.44),
} as const;

/**
 * The ground of each biome, under the grass: meadow golf's warm fresh green, pine a deep blue-green, autumn an olive
 * going gold, heath a dusty mauve-brown, and wetland a deep teal green. Chosen so the five read apart from above with
 * no tree in sight, which is how the chase camera mostly sees them; and a step darker than the blades' own middle, near
 * their roots' colour, since where the grass stops short of a road or a patch of sand the ground shows, and a ground
 * brighter than its grass read as a band of lime round every edge (review 1, 4 and 11).
 */
export const BIOME_GROUND: Record<Biome, Rgb> = {
  [BIOME.meadow]: shown(0.43, 0.62, 0.23),
  [BIOME.pine]: shown(0.24, 0.43, 0.22),
  [BIOME.autumn]: shown(0.56, 0.55, 0.24),
  [BIOME.heath]: shown(0.5, 0.46, 0.3),
  [BIOME.wetland]: shown(0.22, 0.46, 0.34),
};

/** The ground where it is not grass: a road's warm packed earth, a bank's pale sand, dark mud, and grey-warm stone. */
export const SURFACE_GROUND = {
  dirt: shown(0.72, 0.6, 0.45),
  sand: shown(0.84, 0.73, 0.5),
  mud: shown(0.5, 0.43, 0.32),
  stone: shown(0.72, 0.67, 0.59),
} as const;

/** The rock of an outcrop and a ledge's face: its sunlit top, and its side, a warm grey a step darker. */
export const ROCK = {
  top: shown(0.64, 0.6, 0.52),
  side: shown(0.5, 0.46, 0.41),
  /** Lichen on the tops: a dusty yellow-green grey, so an outcrop reads as old stone and not concrete (review 2, 5). */
  lichen: shown(0.6, 0.6, 0.4),
  /** The earth of a cut bank where a ledge stands over grass. */
  earth: shown(0.54, 0.43, 0.33),
} as const;

/**
 * Water, as golf's open water (`OCEAN` in ooergolf's `models/obstacles.ts`): the deep body, and the sky its waves
 * mirror; then the shallows, a lighter plain turquoise, so a ford reads at a glance as one; and the foam at the edge.
 */
export const WATER = {
  deep: shown(0.02, 0.38, 0.86),
  tint: shown(0.4, 0.8, 0.97),
  shallow: shown(0.42, 0.76, 0.76),
  shoal: shown(0.6, 0.84, 0.78),
  foam: shown(0.8, 0.92, 0.86),
} as const;

/** The backdrop: the hills past the edge a soft green of the meadow's, and the mountains blue with distance. */
export const BACKDROP_COLOURS = {
  hill: shown(0.4, 0.62, 0.24),
  hillFar: shown(0.36, 0.56, 0.34),
  /** The foothills, nearest: a dark blue-green. */
  mountainNear: shown(0.28, 0.4, 0.46),
  mountain: shown(0.4, 0.5, 0.68),
  /** The far range, paler and bluer: the haze between. */
  mountainFar: shown(0.6, 0.68, 0.84),
  snow: shown(0.93, 0.95, 1),
  farTree: shown(0.2, 0.5, 0.26),
  farLeaf: shown(0.4, 0.68, 0.2),
} as const;

/**
 * A cloud: white, a little blue and a little short of green, so the ground's warm green bounce on its underside, which
 * every surface facing down takes, leaves it a soft blue-grey and not the yellow-green it was (review 1, 25).
 */
export const CLOUD = shown(0.97, 0.9, 1);

/** Trunks and stems. */
export const WOOD = {
  trunk: shown(0.5, 0.33, 0.2),
  pale: shown(0.62, 0.55, 0.48),
  dark: shown(0.36, 0.26, 0.2),
  stem: shown(0.34, 0.58, 0.2),
} as const;

/** What is built: plaster, warm stone, timber, and three roofs (red tile, slate, and a straw thatch). */
export const BUILT_COLOURS = {
  plaster: shown(0.96, 0.9, 0.78),
  stone: shown(0.78, 0.72, 0.62),
  stoneDark: shown(0.62, 0.57, 0.5),
  ruin: shown(0.68, 0.62, 0.53),
  ruinDark: shown(0.54, 0.49, 0.43),
  moss: shown(0.42, 0.56, 0.24),
  timber: shown(0.48, 0.3, 0.18),
  door: shown(0.32, 0.5, 0.62),
  window: shown(0.2, 0.3, 0.42),
  frame: shown(0.98, 0.96, 0.92),
  roofs: [shown(0.84, 0.32, 0.22), shown(0.4, 0.44, 0.52), shown(0.84, 0.66, 0.36)] as readonly Rgb[],
  water: shown(0.12, 0.36, 0.62),
} as const;
