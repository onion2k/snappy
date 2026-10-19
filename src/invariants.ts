/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * Every body is a number and out of the rock. Time is finite. The save is
 * in range: the volume from 0 to 1, the mute a boolean.
 *
 * Read by the test API on asking, and by the unit tests. Each broken rule is
 * a line saying what and where.
 */
import { onFloor } from './arena';
import type { Game } from './game';

/** How many broken rules of one sort are reported before the rest are only counted. */
const EACH = 3;

export function checkInvariants(game: Game): string[] {
  const out: string[] = [];
  const { world, progress } = game;
  const report = (sort: string, found: string[]) => {
    if (!found.length) return;
    out.push(...found.slice(0, EACH).map((f) => `${sort}: ${f}`));
    if (found.length > EACH) out.push(`${sort}: and ${found.length - EACH} more`);
  };
  const at = (i: number) => `body ${i} at ${world.x[i].toFixed(1)},${world.y[i].toFixed(1)},${world.z[i].toFixed(1)}`;

  const notNumbers: string[] = [],
    buried: string[] = [];
  let live = 0;
  for (let i = 0; i < world.count; i++) {
    if (!world.alive[i]) continue;
    live++;
    const values = [world.x[i], world.y[i], world.z[i], world.vx[i], world.vy[i], world.vz[i]];
    if (!values.every(Number.isFinite)) notNumbers.push(at(i));
    else if (!world.carried[i] && !onFloor(world.solid, world.x[i], world.y[i])) buried.push(at(i));
  }
  report('not a number', notNumbers);
  report('in the rock', buried);
  if (live !== world.live) out.push(`the world counts ${world.live} live, and has ${live}`);

  if (!Number.isFinite(game.t) || game.t < 0) out.push(`time is ${game.t}`);

  const { muted, volume } = progress.save;
  if (typeof muted !== 'boolean') out.push(`the mute is ${String(muted)}, not a boolean`);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) out.push(`the volume is ${volume}, not from 0 to 1`);
  return out;
}
