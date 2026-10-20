/**
 * What must always be true of the game, however it has been played: the
 * rules that, broken, are a bug whatever the feature was.
 *
 * The rover stands where it can stand, its wheels on the ground and its
 * arms within their travel: never in rock or in anything built, in deep
 * water, on a bank too steep for it, astride a ledge or off the world. The
 * tracks never outgrow their pool. The camera, when there is one to ask
 * about, is never under the ground or inside anything built or rock, and
 * its line to where it looks never passes under the ground. Time is
 * finite. The save is in range: the volume from 0 to 1, the mute a boolean.
 * The viewfinder is within its limits, and the last picture's grade is from
 * nought to a hundred, its stars its total's and each term from nought to one.
 *
 * The game does not own the camera, the page does, so it is handed in by
 * whoever has one: the test API and the fuzzer. Read by the test API on
 * asking, by the fuzzer, and by the unit tests. Each broken rule is a line
 * saying what and where.
 */
import { cameraProblems } from './camera';
import type { Game } from './game';
import { gradeProblems } from './score';
import { TRACKS } from './tracks';
import { viewfinderProblems } from './viewfinder';

/** A camera to check, as much of one as the rules read. */
export interface Viewed {
  position: ArrayLike<number>;
  target: ArrayLike<number>;
}

export function checkInvariants(game: Game, camera?: Viewed): string[] {
  const out: string[] = [];
  const { progress, rover, tracks, ground } = game;

  const wrong = rover.misplaced();
  if (wrong)
    out.push(`the rover is ${wrong} (at ${rover.x.toFixed(2)}, ${rover.y.toFixed(2)}, facing ${rover.yaw.toFixed(2)})`);
  if (!Number.isFinite(rover.speed)) out.push(`the rover's speed is ${rover.speed}`);

  if (tracks.count > TRACKS.capacity || tracks.count < 0)
    out.push(`the tracks hold ${tracks.count}, past their ${TRACKS.capacity}`);

  if (camera) out.push(...cameraProblems(camera, ground));

  if (!Number.isFinite(game.t) || game.t < 0) out.push(`time is ${game.t}`);

  out.push(...viewfinderProblems(game.viewfinder), ...gradeProblems(game.picture));

  const { muted, volume } = progress.save;
  if (typeof muted !== 'boolean') out.push(`the mute is ${String(muted)}, not a boolean`);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) out.push(`the volume is ${volume}, not from 0 to 1`);
  return out;
}
