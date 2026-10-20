/**
 * The game played by a monkey: the real game, without the picture, driven
 * at random and made to do at random everything a player can make happen —
 * driving about, stopping, spinning on the spot, setting off for somewhere
 * far, zooming the camera and turning it round, saving and loading, and
 * raising the viewfinder to look about, zoom, focus and take pictures — and
 * checked after every few frames for anything that must always hold and does
 * not (`invariants.ts`, the camera's rules among them, since the monkey holds
 * a camera as the page does, and in the viewfinder the lens is that camera),
 * and for anything thrown.
 *
 * Only what a player could do. A monkey that did what no player can would
 * find bugs no player will. The one exception is being put down somewhere:
 * a player can drive anywhere they can stand, so the monkey may simply be
 * there, and the world is too big to drive into every corner of otherwise.
 * A new thing a player can do gets an action here.
 *
 * From a seed, so a failure can be played again exactly: `npm run fuzz --
 * --seed N` does, and prints what was done before it went wrong.
 */
import { Autopilot } from '../src/autopilot';
import { ChaseCamera } from '../src/camera';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import type { Drive } from '../src/rover';
import { standable } from '../src/world/drive';
import { route } from '../src/world/graph';

const DT = 1 / 60;
/** How many frames between checks, when nothing has just been done. */
const CHECK_EVERY = 10;
/** How many of the last things done a failure reports. */
const LOG_TAIL = 25;

export interface FuzzFailure {
  seed: number;
  frame: number;
  problems: string[];
  /** The last things done before it, oldest first. */
  log: string[];
}

export interface FuzzResult {
  seed: number;
  frames: number;
  failure: FuzzFailure | null;
  /** How often each thing was done, and each event happened: to see that the monkey got about. */
  done: Record<string, number>;
  happened: Record<string, number>;
}

/** Play `frames` frames of the game at random from `seed`. */
export function fuzz(seed: number, frames: number): FuzzResult {
  // the monkey's own chance, apart from the game's, so what it decides does not shift what the game does
  const random = seeded(seed * 7 + 1);
  const happened: Record<string, number> = {};
  const done: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
  const log: string[] = [];
  let frame = 0;
  const fail = (problems: string[]): FuzzResult => ({
    seed,
    frames: frame,
    failure: { seed, frame, problems, log: log.slice(-LOG_TAIL) },
    done,
    happened,
  });

  try {
    let store = memoryStore();
    let game = new Game(new Progress(store), { random: seeded(seed) });
    const camera = new ChaseCamera();
    camera.snap(game.rover, game.ground);
    let drive: Drive = { throttle: 0, steer: 0 };
    let pilot: Autopilot | null = null;
    let busy = 0;
    const between = (a: number, b: number) => a + random() * (b - a);
    const did = (what: string) => {
      count(done, what);
      log.push(`frame ${frame}: ${what} (rover at ${game.rover.x.toFixed(1)}, ${game.rover.y.toFixed(1)})`);
    };
    const { bounds } = game.ground;
    const lens = { position: new Float64Array(3), target: new Float64Array(3) };
    /** An oddity's middle, for the monkey that goes looking for one. */
    const odd = new Float64Array(3);
    /**
     * The viewfinder's camera, for the camera's rules: its eye, and as where it looks the rover's body it stands on,
     * so the line between is the mast and the head, which must not pass through the ground. What the lens looks at
     * may be under the ground, and is no fault.
     */
    const lensCamera = () => {
      lens.position.set(game.viewfinder.eye);
      lens.target[0] = game.rover.x;
      lens.target[1] = game.rover.y;
      lens.target[2] = game.rover.z + 2;
      return lens;
    };
    /** Something only done in the viewfinder: nothing, and not counted, out of it. */
    const looking = (what: string, go: () => void) => () => {
      if (!game.photographing) return;
      go();
      did(what);
    };
    /** Everything a player can make happen, each as often as it is weighted. */
    const actions: [number, () => void][] = [
      [
        8,
        () => {
          pilot = null;
          drive = { throttle: random() < 0.8 ? 1 : -1, steer: random() < 0.4 ? 0 : between(-1, 1) };
          busy = Math.floor(between(20, 240));
          did('drive');
        },
      ],
      [
        2,
        () => {
          pilot = null;
          drive = { throttle: 0, steer: random() < 0.5 ? 1 : -1 };
          busy = Math.floor(between(10, 90));
          did('spin');
        },
      ],
      [
        2,
        () => {
          pilot = null;
          drive = { throttle: 0, steer: 0 };
          busy = Math.floor(between(10, 60));
          did('stop');
        },
      ],
      [
        2,
        () => {
          // a player can drive anywhere they can stand, so the monkey may simply be there: walls, banks and fords
          // are found far sooner from close by
          for (let tries = 0; tries < 50; tries++) {
            const x = between(bounds.minX, bounds.maxX),
              y = between(bounds.minY, bounds.maxY);
            if (!standable(game.ground, x, y)) continue;
            // a player drives there, which they cannot do looking through the viewfinder
            game.photo(false);
            game.rover.teleport(x, y, between(0, Math.PI * 2));
            camera.snap(game.rover, game.ground);
            did('teleport');
            return;
          }
        },
      ],
      [
        1,
        () => {
          // set off for a landmark the long way, as a player crossing the world does
          const { landmarks } = game.map;
          const to = landmarks[Math.floor(random() * landmarks.length)];
          const path = route(game.map, game.rover, to);
          if (path.length < 4) return;
          pilot = new Autopilot(path);
          busy = Math.floor(between(600, 2400));
          did(`set off for ${to.name}`);
        },
      ],
      [
        1,
        () => {
          camera.zoomBy(random() < 0.5 ? between(0.5, 0.9) : between(1.1, 2));
          did('zoom');
        },
      ],
      [
        1,
        () => {
          // the view turned round the rover and tilted, as a drag or Q and E do, anywhere at all
          camera.orbitBy(between(-Math.PI, Math.PI), between(-0.8, 0.8));
          did('orbit');
        },
      ],
      [
        2,
        () => {
          // the viewfinder raised, or lowered, as F or the camera button does
          game.photo(!game.photographing);
          did(game.photographing ? 'photo' : 'unphoto');
        },
      ],
      // a drag in the viewfinder, anywhere, past its limits as often as not
      [3, looking('aim', () => game.viewfinder.look(between(-2, 2), between(-1.2, 1.2)))],
      [1, looking('lens', () => game.viewfinder.zoomBy(random() < 0.5 ? between(0.3, 0.95) : between(1.05, 3.5)))],
      [
        2,
        looking('focus', () => {
          // a tap anywhere on the frame, now and then a hair past its edge, which is not on the frame; or A
          if (random() < 0.25) game.viewfinder.auto();
          else game.viewfinder.focusAt(between(-1.02, 1.02), between(-1.02, 1.02), game.ground, game.subjects);
        }),
      ],
      [
        2,
        () => {
          // a player out to photograph something: stood somewhere in sight of an oddity, a few of its heights off, and
          // the view turned onto it, as a drag would. Shots at random are almost all of nothing, or of an oddity behind
          // the trees, and a grade worth having is what the shutter's rules most need tried
          const s = game.subjects;
          if (s.count === 0) return;
          const i = Math.floor(random() * s.count);
          s.middle(i, odd);
          for (let tries = 0; tries < 50; tries++) {
            const reach = s.height[i] * between(3, 14) + s.radius[i],
              bearing = between(0, Math.PI * 2);
            const x = odd[0] + Math.cos(bearing) * reach,
              y = odd[1] + Math.sin(bearing) * reach;
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
            if (!standable(game.ground, x, y)) continue;
            game.photo(false);
            game.rover.teleport(x, y, bearing + Math.PI);
            camera.snap(game.rover, game.ground);
            game.photo(true);
            const eye = game.viewfinder.eye;
            const dx = odd[0] - eye[0],
              dy = odd[1] - eye[1];
            game.viewfinder.look(0, Math.atan2(odd[2] - eye[2], Math.sqrt(dx * dx + dy * dy)));
            // and held still for the lens to settle before the shutter, as a player waits for the focus
            for (let f = 0; f < 30; f++) game.step(DT);
            const g = game.shutter()!;
            count(happened, g.total > 0 ? 'pictures graded' : 'pictures of nothing');
            did('seek');
            return;
          }
        },
      ],
      [
        3,
        looking('shutter', () => {
          // as often several times in a frame as once
          const presses = random() < 0.3 ? 3 : 1;
          for (let k = 0; k < presses; k++) {
            const g = game.shutter()!;
            count(happened, g.total > 0 ? 'pictures graded' : 'pictures of nothing');
          }
        }),
      ],
      [
        1,
        () => {
          // saved, and loaded again into a new game as a reload would: the save must come back as it was
          const before = JSON.stringify(game.progress.save);
          game.persist();
          store = memoryStore(store.json);
          game = new Game(new Progress(store), { random: seeded(seed + frame) });
          camera.snap(game.rover, game.ground);
          pilot = null;
          const after = JSON.stringify(game.progress.save);
          if (after !== before) throw new Error(`the save was ${before} and loaded as ${after}`);
          did('reload');
        },
      ],
    ];
    const total = actions.reduce((n, [w]) => n + w, 0);
    const act = () => {
      let pick = random() * total;
      for (const [w, go] of actions) {
        if ((pick -= w) < 0) return go();
      }
    };

    for (frame = 1; frame <= frames; frame++) {
      if (busy > 0) busy--;
      else act();
      const p = pilot as Autopilot | null;
      if (p) {
        p.drive(game.rover, DT, drive);
        if (p.done) {
          count(happened, 'arrived');
          pilot = null;
          busy = 0;
        }
      }
      const blocked = game.rover.blocked;
      // the page tells the rover where the camera is each frame, so its head turns to it when it stands idle
      game.rover.lookAt(camera.position[0], camera.position[1], camera.position[2]);
      const photographing = game.photographing;
      const at = photographing ? game.rover.x + game.rover.y * 1e-3 : 0;
      game.step(DT, drive);
      if (game.rover.blocked && !blocked) count(happened, 'blocked');
      if (game.rover.wet) count(happened, 'wet frames');
      if (photographing && game.rover.x + game.rover.y * 1e-3 !== at)
        return fail([`the rover moved in the viewfinder, to ${game.rover.x}, ${game.rover.y}`]);
      // the chase camera waits where it was while the player looks through the viewfinder, as the page's does
      if (!photographing) camera.update(game.rover, game.ground, DT);
      if (frame % CHECK_EVERY === 0) {
        const problems = checkInvariants(game, photographing ? lensCamera() : camera);
        if (problems.length) return fail(problems);
      }
    }
    happened['tracks held at the end'] = game.tracks.count;
    return { seed, frames, failure: null, done, happened };
  } catch (err) {
    return fail([`threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`]);
  }
}
