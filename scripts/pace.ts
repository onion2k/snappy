/**
 * How the world paces, played by the autopilot: how many game seconds the
 * rover takes to cross it, west edge to east and village to each ruin,
 * along the routes the drive graph gives, held to a baseline both ways.
 * Quicker is as much a change as slower: a world that is crossed in half
 * the time has lost half its ground, or the rover has been made too quick.
 *
 * `pace-check.ts` runs it: `npm run pace` for the figures, `npm run
 * pace:check` to hold them, `-- --update` to write the baseline again.
 *
 * The figure is the west-to-east crossing, which the spec puts at a minute
 * to two and a half, and the other runs are reported and must finish. The
 * tolerance is a tenth: the autopilot steers the same way every time, so
 * the figure does not wobble, and a tenth is a road made rough or a ford
 * moved.
 */
import { Autopilot } from '../src/autopilot';
import { Game, theWorld } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import type { Drive } from '../src/rover';
import { crossing, graphOf, route } from '../src/world/graph';

const DT = 1 / 60;
/** The crossing's bounds, in game seconds, from the spec's criterion 5. */
export const CHECK = { least: 60, most: 150, capSeconds: 400 };
/** How far the figure may move from the baseline, as a share of it, before the check fails. */
export const TOLERANCE = 0.1;

export interface PaceRun {
  name: string;
  /** Game seconds to arrive, or the cap if it never did. */
  seconds: number;
  finished: boolean;
}

/** The runs: the crossing first, which is the figure, then the village to each ruin. */
export function runs(): { name: string; from: { x: number; y: number }; to: { x: number; y: number } }[] {
  const map = theWorld();
  const { from, to } = crossing(map, graphOf(map));
  const out = [{ name: 'west to east', from, to }];
  for (const l of map.landmarks)
    if (l.kind === 'ruin') out.push({ name: `village to ${l.name}`, from: map.start, to: l });
  return out;
}

/** The rover put at `from` and driven by the autopilot along the route to `to`, until it arrives or the time is up. */
export function paceRun(
  name: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  capSeconds: number = CHECK.capSeconds,
): PaceRun {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1) });
  const path = route(game.map, from, to);
  if (path.length < 4) return { name, seconds: capSeconds, finished: false };
  game.rover.teleport(from.x, from.y, Math.atan2(path[3] - path[1], path[2] - path[0]));
  const pilot = new Autopilot(path);
  const drive: Drive = { throttle: 0, steer: 0 };
  const frames = capSeconds * 60;
  for (let f = 0; f < frames; f++) {
    pilot.drive(game.rover, DT, drive);
    game.step(DT, drive);
    if (pilot.done) return { name, seconds: round(game.t), finished: true };
  }
  return { name, seconds: capSeconds, finished: false };
}

/** Whether a figure has moved from its baseline beyond the tolerance, either way. */
export function moved(was: number, now: number, tolerance = TOLERANCE): boolean {
  return Math.abs(now - was) > Math.abs(was) * tolerance;
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}
