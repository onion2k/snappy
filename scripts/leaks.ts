/**
 * A long game played through, watching the things that must not keep growing: the album's pictures, the save, the
 * tracks and the heap.
 *
 * A list that is added to and never emptied does not throw, break a rule, or move any gate's figure. It shows up an
 * hour into a game as a machine that has slowed to a crawl, on somebody else's computer. Nothing else here would ever
 * see it: the fuzzer plays a minute of game a seed and the pace gate stops at a crossing.
 *
 * The game is driven by the autopilot from landmark to landmark, in an order the seed picks, and every so often the
 * player stops to photograph an oddity as the fuzzer's seeking does (`seek.ts`), pressing the shutter a few times, so
 * the album fills and is written into again and again over the hour. Every few minutes the game is saved and loaded
 * again into a new one, as a reload of the page would (the album must come back as it went), so what loading keeps is
 * watched as well as what playing does.
 *
 * Every size is held two ways: under a ceiling that says what it could ever reasonably be, and, where marked `steady`,
 * not still climbing by the end — the last third of the run against the middle third, so a size that fills up early
 * and settles is left alone, and one that creeps all the way through is not. A new list, map or cache in the game gets
 * a line in `WATCH` and a reading in `sizes`.
 *
 * The heap is read after a collection, when the run is given one (`node --expose-gc`, as `npm run leaks` is), so it is
 * what is still held and not what is waiting to be collected: steady to a fraction of a megabyte, and so a slow leak
 * shows over the hour. What the page keeps (the album's mount, the renderer) is not here: this is the logic's heap.
 */
import { Autopilot } from '../src/autopilot';
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import type { Drive } from '../src/rover';
import { TRACKS } from '../src/tracks';
import { route } from '../src/world/graph';
import { ODDITIES } from '../src/world/oddities';
import { seek } from './seek';

const DT = 1 / 60;
/** Frames between the player's stops to photograph something: twenty seconds of game. */
export const SEEK_EVERY = 1200;

/** Game minutes between the reloads: as the fuzzer reloads, a save written and loaded into a new game. */
export const RELOAD_MINUTES = 5;

/** How far a `steady` size may drift, the last third over the middle, before it counts: a share of it and a number. */
export interface Drift {
  share: number;
  slack: number;
}

/**
 * What is watched, and how. Every size has a ceiling: what it could ever reasonably be, not a guess at what the game
 * does now, so tuning does not move it and a leak cannot hide under it.
 *
 * - `album pictures`: one an oddity, so the oddities the world lays. It cannot pass it by the album's shape; it is
 *   here so a change of shape that could is caught.
 * - `save bytes`: the save with every oddity pictured, each entry as long as one can be (the longest name, every
 *   number at its most digits, the yaw wrapped), and a little room; short of a thirteenth entry's worth over it.
 *   `test/leaks.test.ts` works the longest out from the world, the lens and the look, and holds the ceiling to it.
 * - `save bytes a picture`: the save past an empty album's, over the pictures it holds; its ceiling the longest entry
 *   and its comma, with a little room. Steady, so an entry that grows with play (a yaw kept unwrapped did) is caught
 *   under its ceiling. The save as a whole grows as the album fills, which can be most of the hour.
 * - `tracks`: their fixed pool, which cannot pass it either.
 * - `heap MB`: the catch-all for what is leaking and has no name here, read after a collection. Its drift is twice
 *   what six hours over seeds 1-6, read so, wandered by between the middle and the last third (2026-10-20: at most
 *   0.15 MB, of some 8 or 9), and taken as a number and not a share, since the heap's own size says nothing of how
 *   fast it may grow: a leak of 15 kB a game minute is past it by the end of the hour. Its ceiling is a sanity bound.
 */
export const WATCH: Partial<Record<string, { ceiling: number; steady?: Drift }>> = {
  'album pictures': { ceiling: ODDITIES.length },
  'save bytes': { ceiling: 4_000 },
  'save bytes a picture': { ceiling: 330, steady: { share: 0, slack: 3 } },
  tracks: { ceiling: TRACKS.capacity },
  'heap MB': { ceiling: 300, steady: { share: 0, slack: 0.3 } },
};

/** The heap in use, in megabytes to a tenth, after a collection if the run was given one. */
function heapMB(): number {
  (globalThis as { gc?: () => void }).gc?.();
  return Math.round(process.memoryUsage().heapUsed / 1e5) / 10;
}

/** Every size worth watching, read off a game as it stands. */
export function sizes(game: Game): Record<string, number> {
  const save = game.progress.save,
    bytes = JSON.stringify(save).length,
    empty = JSON.stringify({ ...save, album: [] }).length;
  return {
    'album pictures': game.album.count,
    'save bytes': bytes,
    'save bytes a picture': game.album.count > 0 ? Math.round((bytes - empty) / game.album.count) : 0,
    tracks: game.tracks.count,
    'heap MB': heapMB(),
  };
}

/**
 * Whether a size is still climbing at the end: the last third of the run against the middle third. `share` and
 * `slack` are what it may drift by without counting, as a share and as a number, so a small size wobbling by one or
 * two is not a leak.
 */
export function grew(series: number[], share = 0.15, slack = 3): boolean {
  if (series.length < 6) return false;
  const third = Math.floor(series.length / 3);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const middle = mean(series.slice(third, third * 2));
  const last = mean(series.slice(-third));
  return last > middle * (1 + share) + slack;
}

/** What is wrong with a run's sizes: over a ceiling, or still growing at the end. */
export function trouble(samples: Record<string, number[]>): string[] {
  const out: string[] = [];
  for (const [key, series] of Object.entries(samples)) {
    const watch = WATCH[key];
    const most = Math.max(...series);
    if (watch && most > watch.ceiling) out.push(`${key} went to ${most}, over its ceiling of ${watch.ceiling}`);
    else if (watch?.steady && grew(series, watch.steady.share, watch.steady.slack)) {
      const third = Math.floor(series.length / 3);
      const at = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
      out.push(
        `${key} grew all the way through: ${at(series.slice(0, third))} at the start, ${at(series.slice(third, third * 2))} in the middle, ${at(series.slice(-third))} by the end`,
      );
    }
  }
  return out;
}

export interface LeakOptions {
  seed: number;
  /** Game minutes to play. */
  minutes: number;
  /** Game minutes between reloads; `RELOAD_MINUTES` unless said. */
  reloadMinutes?: number;
}

export interface LeakRun {
  seed: number;
  minutes: number;
  /** Every size, sampled once a game minute. */
  samples: Record<string, number[]>;
  /** How many pictures were taken, and how many of them the album kept. */
  pictures: number;
  kept: number;
  /** How many times the game was saved and loaded again. */
  reloads: number;
  problems: string[];
  /** Real seconds it took. */
  seconds: number;
}

/** Play a long game, sampling the sizes once a game minute, and say what would not stay bounded. */
export function leakRun({ seed, minutes, reloadMinutes = RELOAD_MINUTES }: LeakOptions): LeakRun {
  const started = performance.now();
  const samples: Record<string, number[]> = {};
  let pictures = 0,
    kept = 0,
    reloads = 0;
  const done = (problems: string[]): LeakRun => ({
    seed,
    minutes,
    samples,
    pictures,
    kept,
    reloads,
    problems,
    seconds: (performance.now() - started) / 1000,
  });
  try {
    let store = memoryStore();
    let game = new Game(new Progress(store), { random: seeded(seed) });
    // the player's own chance, apart from the game's, as the fuzzer's is
    const random = seeded(seed * 7 + 3);
    const between = (a: number, b: number) => a + random() * (b - a);
    const order = [...game.map.landmarks].sort(() => random() - 0.5);
    let leg = 0;
    const pilot = new Autopilot(route(game.map, game.rover, order[0]));
    const drive: Drive = { throttle: 0, steer: 0 };
    const reloadEvery = Math.max(1, Math.round(reloadMinutes * 3600));
    for (let frame = 1; frame <= minutes * 3600; frame++) {
      if (frame % reloadEvery === 0) {
        // saved, and loaded into a new game as a reload of the page would: the album comes back as it went
        const album = JSON.stringify(game.album.toSave());
        game.persist();
        store = memoryStore(store.json);
        game = new Game(new Progress(store), { random: seeded(seed + frame) });
        const back = JSON.stringify(game.album.toSave());
        if (back !== album) throw new Error(`the album was ${album} and loaded as ${back}`);
        reloads++;
        pilot.follow(route(game.map, game.rover, order[leg % order.length]));
      }
      if (frame % SEEK_EVERY === 0) {
        const i = Math.floor(random() * game.subjects.count);
        if (seek(game, i, between)) {
          for (let k = random() < 0.3 ? 3 : 1; k > 0; k--) {
            game.shutter();
            pictures++;
            if (game.album.last.kind !== 'none') kept++;
          }
        }
        game.photo(false);
        pilot.follow(route(game.map, game.rover, order[leg % order.length]));
      }
      if (pilot.done) pilot.follow(route(game.map, game.rover, order[++leg % order.length]));
      pilot.drive(game.rover, DT, drive);
      game.step(DT, drive);
      if (frame % 3600 === 0) for (const [key, n] of Object.entries(sizes(game))) (samples[key] ??= []).push(n);
    }
    return done(trouble(samples));
  } catch (err) {
    return done([`threw ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}
