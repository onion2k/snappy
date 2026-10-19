/**
 * The arena as it is drawn: the floor and the rock round it, which do not
 * move, and three sample shapes standing on the floor. Nothing moves, so
 * every group is fixed once, in the static set. It is handed what it draws
 * from, and never the renderer.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { COLS, FLOOR, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import { place } from './matrix';
import { ball, box, square } from './meshes';

/** How tall the rock stands. */
const ROCK_HEIGHT = 3;

/**
 * Golf's grass, already linear: a warm yellow-green (ooergolf's `GREEN` in
 * `models/palette.ts`, taken 2026-10-19), so the floor is the colour the toon
 * light was tuned against.
 */
const GRASS: [number, number, number] = [0.21, 0.41, 0.0072];

/**
 * A warm stone and not a cool grey, as golf's pebble is, so it keeps a colour
 * in the shade; but darker than the pebble's `shown(0.7, 0.68, 0.67)`, which
 * as a whole wall in golf's bright sun read as white against the sky. This is
 * `shown(0.5, 0.47, 0.45)`: `shown` undoes the sRGB curve, and the numbers
 * here are that result, to three figures, so no copy of `shown` is needed.
 */
const STONE: [number, number, number] = [0.214, 0.187, 0.171];

/**
 * The colours of the three samples, golf's toy colours (red, yellow and blue
 * from `PALETTE` in `models/palette.ts`) through the same `shown` curve as
 * the stone: `shown(0.93, 0.2, 0.17)`, `shown(0.99, 0.8, 0.2)` and
 * `shown(0.18, 0.5, 0.93)`.
 */
const RED: [number, number, number] = [0.848, 0.0331, 0.0245];
const YELLOW: [number, number, number] = [0.977, 0.604, 0.0331];
const BLUE: [number, number, number] = [0.0272, 0.214, 0.848];

/** The sample ball's radius, in world units. */
const SAMPLE_BALL = 3;

/** The tallest sample, in world units: the shadow's box has to reach over it. */
const TALL = 12;

export class Scene {
  /** What does not move. */
  static(solid: Uint8Array): GameGroup[] {
    const floor = new Float32Array(16);
    place(
      floor,
      0,
      (FLOOR.minX + FLOOR.maxX) / 2,
      (FLOOR.minY + FLOOR.maxY) / 2,
      0,
      0,
      FLOOR.maxX - FLOOR.minX,
      FLOOR.maxY - FLOOR.minY,
      1,
    );
    const rock: number[] = [];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (solid[ty * COLS + tx]) rock.push(tx, ty);
    const rocks = new Float32Array((rock.length / 2) * 16);
    for (let k = 0; k < rock.length; k += 2)
      place(rocks, k / 2, ORIGIN_X + (rock[k] + 0.5) * TILE, ORIGIN_Y + (rock[k + 1] + 0.5) * TILE, 0);
    // The three samples of the look, drawn only and not in the physics world: a ball, a box and a tall box, set apart
    // near the middle of the floor and clear of the rock, so a picture shows the banding, the rim, the shade at their
    // feet and their shadows. The first feature replaces them with Snappy's own things.
    const ballAt = new Float32Array(16);
    place(ballAt, 0, -14, -4, SAMPLE_BALL);
    const boxAt = new Float32Array(16);
    place(boxAt, 0, 0, 4, 0, 0.4);
    const tallAt = new Float32Array(16);
    place(tallAt, 0, 14, -2, 0, -0.3);
    return [
      { mesh: square(), matrices: floor, albedo: GRASS, roughness: 0.85 },
      { mesh: box(TILE, TILE, ROCK_HEIGHT), matrices: rocks, albedo: STONE, roughness: 0.9 },
      { mesh: ball(SAMPLE_BALL, 16, 28), matrices: ballAt, albedo: RED, roughness: 0.4 },
      { mesh: box(6, 6, 6), matrices: boxAt, albedo: YELLOW, roughness: 0.4 },
      { mesh: box(4, 4, TALL), matrices: tallAt, albedo: BLUE, roughness: 0.4 },
    ];
  }
}

/** The rock's footprint, for the sun's shadow to be fitted to. */
export const ARENA_BOX = {
  min: [ORIGIN_X, ORIGIN_Y, -1] as [number, number, number],
  max: [ORIGIN_X + COLS * TILE, ORIGIN_Y + ROWS * TILE, Math.max(ROCK_HEIGHT, TALL) + 2] as [number, number, number],
};
