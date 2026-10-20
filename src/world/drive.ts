/**
 * Where the rover can go, as one rule the rover moves by and the drive
 * graph is built by. A point is standable when it is on the world, out of
 * rock and anything built, in water no deeper than a ford, and on ground no
 * steeper than the rover climbs. A move is allowed when every point along
 * it is standable and no edge on it is taller than the rover rolls over.
 * Steepness is read from the smooth terrain, and a ledge from the change in
 * height between two points close together, so a bank and a cliff are each
 * a wall both ways and nothing can be driven down that cannot be driven up.
 */
import { DRIVE, type Ground } from './types';

/** The steepest slope as a rise over a run. */
export const MAX_GRADE = Math.tan((DRIVE.maxSlope * Math.PI) / 180);
// a scratch for the slope, since this runs a few times a wheel a frame
const slope = new Float64Array(2);

/** Whether the rover may stand at a point. */
export function standable(g: Ground, x: number, y: number): boolean {
  if (g.solidAt(x, y)) return false;
  if (g.waterDepthAt(x, y) > DRIVE.shallow) return false;
  g.slopeAt(x, y, slope);
  return slope[0] * slope[0] + slope[1] * slope[1] <= MAX_GRADE * MAX_GRADE;
}

/**
 * Whether a short move, no longer than `DRIVE.probe`, is allowed: the far
 * end standable, and the rise between the ends no more than an edge the
 * rover rolls over plus what the slope gives over that distance.
 */
export function canMove(g: Ground, ax: number, ay: number, bx: number, by: number): boolean {
  if (!standable(g, bx, by)) return false;
  // sqrt and not hypot: V8's hypot boxes its result, and this runs every wheel every frame
  const run = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  return Math.abs(g.heightAt(bx, by) - g.heightAt(ax, ay)) <= DRIVE.step + MAX_GRADE * run;
}

/** Whether a move of any length is allowed, looked at every `DRIVE.probe` units along it. */
export function canTravel(g: Ground, ax: number, ay: number, bx: number, by: number): boolean {
  if (!standable(g, ax, ay)) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / DRIVE.probe));
  let px = ax,
    py = ay;
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n,
      y = ay + ((by - ay) * i) / n;
    if (!canMove(g, px, py, x, y)) return false;
    px = x;
    py = y;
  }
  return true;
}
