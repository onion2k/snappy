/**
 * The daylight look: toon shading in a bright sun, the colours shown
 * straight, a pale blue sky, and the daylight environment for the sky's own
 * light. One place for it, so every scene Snappy draws is drawn alike;
 * without it, a colour tuned in one scene would be wrong in the next. The
 * values are golf's, from ooergolf and taken on 2026-10-19 without change,
 * and a value tuned here from now on is Snappy's own.
 */
import { noFog } from 'artshape-render/game/fog';
import type { GameRenderer } from 'artshape-render/game/renderer';
import type { Gpu } from 'artshape-render/gpu/context';
import { bakeEnvironment } from 'artshape-render/render/env';
import { SUN } from './sun';

/** How many millimetres a world unit is: the fog's lengths are the world's own, and its density per one of them. */
const MM_PER_UNIT = 100;

/**
 * The shade where things meet: the renderer's screen-space occlusion, dark
 * in a corner, at the foot of a wall and under a thing standing on the
 * floor. Toon light is flat, and without it a thing standing on the ground
 * seems pasted on it.
 */
export const OCCLUSION = { strength: 2, radius: 2.5, direct: 0.3 } as const;

/**
 * A thin haze, the sky's own blue, even at every height: the far ground goes
 * pale, and the floor stands out against it. Half of what is behind it is
 * lost over this many world units.
 */
export const HAZE = {
  halfWay: 3000,
  colour: [0.2, 0.42, 0.85] as [number, number, number],
  reach: 3000,
  height: 250,
} as const;

/**
 * The sky: a deep blue overhead going pale toward the horizon. The haze is
 * the sky's blue too, so what is far pales into it. Chosen for golf from a
 * sheet on 8 October 2026.
 */
export const SKY = {
  zenith: [0.03, 0.33, 0.9] as [number, number, number],
  horizon: [0.36, 0.77, 0.98] as [number, number, number],
  height: 0.2,
} as const;

/**
 * The sun's shadow: how far past what stands on the floor its box reaches (`margin`), how high (`top`, over the
 * tallest thing that casts: a top outside the box casts no shadow), the side of the square of ground its map covers
 * when it is fitted to the view and not the box (`reach`), how much of the square's edge its shadows fade out over
 * (`fade`), and how soft their edge is, in texels of its map (`softness`). Snappy fits the map to the whole arena, as
 * a small course does in golf, so only `softness` is read yet; the rest are kept as golf had them for when a larger
 * place needs them. Chosen so every thing casts and every surface catches, at one softness (golf, 8 October 2026).
 */
export const SHADOW = { margin: 4, top: 38, reach: 420, fade: 0.15, softness: 1.5 } as const;

/**
 * The clean toy: edges drawn at four samples a pixel, the toon bands eased
 * over a narrow width so a band's edge on a curve is a clean line, the shade
 * a deep sea-green of a colour rather than a grey of it, a warm rim where a
 * thing turns from the camera, the sky's light from above with a warm bounce
 * off the grass from below, and the form light, which keeps some of the
 * sun's fall-off in the top band, so a slope facing the sun is not drawn as
 * bright as the flat. The toy finish (a highlight on what is smooth, the sky
 * in a clear coat, one smooth ramp of light, shade in a crease toward the
 * shade colour) is not asked for here: the renderer gives it to every toon
 * look.
 */
export const TOY = {
  antialias: 'msaa',
  bandSoftness: 0.06,
  shadeColour: [0.3, 0.55, 0.62] as [number, number, number],
  rim: 0.25,
  rimColour: [1, 0.95, 0.85] as [number, number, number],
  rimWidth: 0.18,
  skyLight: [0.5, 0.66, 0.9] as [number, number, number],
  groundLight: [0.42, 0.42, 0.18] as [number, number, number],
  form: 5,
  // every shadow at one softness, and open water darkened in one as the ground beside it is
  shadowSoftness: SHADOW.softness,
  waterShadow: true,
} as const;

/**
 * The post chain: a bright day, so no darkened corners, which against a pale sky read as a grey haze; no film grain; the
 * colours shown straight with a shoulder, so a lit plastic keeps its hue and its roundness where the clamp held a channel
 * flat at one; and a dither of a step of the screen's eight bits, the renderer's own since v0.45.0. Without the dither a
 * gentle light that changes by less than a step over a hundred pixels is drawn as flat bands a step or two apart, which a
 * player saw on a phone in golf (16 October 2026). It is the same at a pixel every frame, so a picture is the same every
 * run and a still frame does not shimmer.
 */
export const POST = { vignette: 0, grain: 0, tone: 'soft', dither: 1 } as const;

/**
 * Put the daylight look on `renderer`: a cartoon in daylight, in the clean
 * toy's light. Resolves once the pipelines the look asks for are compiled,
 * which the first frame waits for.
 */
export async function daylight(renderer: GameRenderer, ctx: Gpu): Promise<void> {
  renderer.look = {
    ...renderer.look,
    sunDir: SUN,
    // toon light is at a colour's full strength, so the sun is bright and the colours are shown straight
    sunColour: [2.75, 2.55, 2.2],
    exposure: 1,
    ambient: 1,
    background: SKY.horizon,
    sky: { zenith: SKY.zenith, horizon: SKY.horizon, height: SKY.height },
    shading: 'toon',
    occlusion: OCCLUSION.strength,
    occlusionRadius: OCCLUSION.radius,
    occlusionDirect: OCCLUSION.direct,
    ...TOY,
  };
  renderer.fog = {
    ...noFog(MM_PER_UNIT),
    density: Math.LN2 / HAZE.halfWay,
    base: -10,
    height: HAZE.height,
    colour: HAZE.colour,
    ambient: 0.4,
    anisotropy: 0,
    reach: HAZE.reach,
    steps: 16,
    cones: 0,
  };
  renderer.post = { ...renderer.post, ...POST };
  const env = bakeEnvironment(ctx, 'daylight', { size: 128, mips: 6 });
  renderer.setEnvironment(env.specular, env.brdf, env.mips);
  await renderer.prepare();
}
