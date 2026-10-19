/**
 * The physics is a package of its own, artshape-physics, which knows nothing
 * of arenas: a body is a sphere of some radius and the rock is a grid of
 * tiles. This is the game's side of it: a world made from this arena, which
 * holds the floor and the rock and, for now, no bodies. Everything in the
 * game that steps or reads bodies imports from here, so the package stays
 * behind one door, and a change it needs goes in its own repo with a version
 * bump here.
 */
import { World, type WorldOptions } from 'artshape-physics/world';
import { BODY_CAPACITY, COLS, ORIGIN_X, ORIGIN_Y, ROWS, TILE } from './arena';
import type { Random } from './random';

export { World } from 'artshape-physics/world';

/** A world for this arena: its grid, no kinds of body yet, and chance from the game's own source. */
export function makeWorld(solid: Uint8Array, random: Random): World {
  const options: WorldOptions = {
    capacity: BODY_CAPACITY,
    grid: { cols: COLS, rows: ROWS, originX: ORIGIN_X, originY: ORIGIN_Y, tile: TILE },
    solid,
    radii: [],
    random,
  };
  return new World(options);
}
