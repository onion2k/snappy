/**
 * The physics is a package of its own, artshape-physics, which knows nothing
 * of landscapes: a body is a sphere of some radius and the rock is a grid of
 * tiles. This is the game's side of it: a world made from the game's map,
 * which holds its ground (the smooth terrain, the steps, the rock and what
 * each tile is made of) and, for now, no bodies. Everything in the game that
 * steps or reads bodies imports from here, so the package stays behind one
 * door, and a change it needs goes in its own repo with a version bump here.
 */
import { World, type WorldOptions } from 'artshape-physics/world';
import type { Random } from './random';
import type { WorldMap } from './world/types';

export { World } from 'artshape-physics/world';
/** The terrain's own smoothing, for reading the ground the world rolls on: `sample` writes height and slope and allocates nothing. */
export { sample as sampleTerrain, terrainProblem } from 'artshape-physics/terrain';

/** The most bodies the world can hold: none are in it yet, so a feature that adds some sizes this. */
export const BODY_CAPACITY = 64;

/**
 * The spatial hash's cell, in units. The package's default is a body's
 * width, and every step copies one number a cell; over a world 1,920 units
 * across that is half a million cells copied for no bodies at all. A cell a
 * chunk across keeps the copy to a hundred, and the first bodies to come
 * choose it again.
 */
const CELL = 192;

/** A world for the map: its grid and its ground, no kinds of body yet, and chance from the game's own source. */
export function makeWorld(map: WorldMap, random: Random): World {
  const options: WorldOptions = {
    capacity: BODY_CAPACITY,
    grid: map.grid,
    solid: map.solid,
    floor: map.steps,
    terrain: map.terrain,
    surface: map.surface,
    radii: [],
    random,
    tuning: { cell: CELL },
  };
  return new World(options);
}
