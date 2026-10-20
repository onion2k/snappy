/**
 * The game's places to look from, shared by the shots (`shots.spec.ts`, for
 * a person to look at) and the look gate (`look.spec.ts`, held to pictures):
 * the rover put at a landmark (or the start, or a tile of the layout's), a
 * little off it and facing `yaw`, driven for a while if `drive` says so, the
 * camera zoomed by `zoom`, and the game played on until the camera has
 * settled behind it and the rover, stood idle, has turned to look at it.
 */
import type { Page } from '@playwright/test';
import { ODDITIES } from '../src/world/oddities';
import { SUBJECTS } from '../src/world/types';

export interface GameView {
  /**
   * The landmark to stand at, by name: the first of the names that the world has, so a view can name a place the
   * world is still to make and stand at an older one until it does. 'start' is the start.
   */
  at: string | string[];
  /** Or the viewpoint the world gives for the bank of this name (`bankViews`), facing it, before `at` is tried. */
  bank?: string;
  /** A tile of the layout's to stand at if no landmark is found, counted from the world's corner. */
  tile?: [number, number];
  off?: [number, number];
  yaw?: number;
  zoom?: number;
  /** Legs of driving, each a throttle, a steer and how many frames. */
  drive?: [number, number, number][];
  /** How many frames are stepped after, for the camera to settle: past the rover's idle, so its face is seen. */
  settle?: number;
  /** The view turned round the rover and tilted, in radians, as a drag on it does, once the rover is placed. */
  orbit?: [number, number];
  /**
   * The viewfinder raised once the rover has settled, and aimed at the oddity of this name through a lens of `mm`,
   * its middle put at (`nx`, `ny`) on the screen (y up), focus on auto.
   */
  photo?: { of: string; mm: number; nx?: number; ny?: number };
}

/** Frames enough for the camera to settle and the rover, idle two seconds, to turn and look up at it. */
export const SETTLE = 240;

/**
 * The rover stood `back` units from the oddity of this name, out along `turn` from the way the oddity faces (nought:
 * straight in front of it), and turned to look at it: no landmark, its tile the oddity's own.
 */
function facing(name: string, back: number, turn = 0, rest: Partial<GameView> = {}): GameView {
  const o = ODDITIES.find((d) => d.name === name)!;
  const a = o.yaw + turn;
  return {
    at: [],
    tile: [o.x - 0.5, o.y - 0.5],
    off: [Math.cos(a) * back, Math.sin(a) * back],
    yaw: a + Math.PI,
    ...rest,
  };
}

export const GAME_VIEWS: Record<string, GameView> = {
  'game-start': { at: 'start' },
  'game-village': { at: 'village', off: [-30, -40], yaw: 0.9, zoom: 1.3 },
  'game-drive': { at: 'start', drive: [[1, 0.15, 150]], settle: 90 },
  'game-ford': { at: 'north ford', off: [0, -30], yaw: Math.PI / 2 },
  'game-river': { at: 'east ford', off: [-30, 0], yaw: 0, zoom: 1.6 },
  'game-wood': { at: 'pine chapel', off: [0, -60], yaw: Math.PI / 2 },
  'game-autumn': { at: 'autumn arch', off: [-40, 0], yaw: 0 },
  'game-heath': { at: 'old tower', off: [-50, -20], yaw: 0.3 },
  'game-meadow': { at: ['hay meadow', 'great oak'], off: [-40, -10], yaw: 0.2 },
  'game-lake': { at: 'the mere', off: [0, 90], yaw: -Math.PI / 2, zoom: 1.5 },
  'game-ruin': { at: 'fort hill', off: [0, -50], yaw: Math.PI / 2 },
  'game-far': { at: 'start', zoom: 2.4 },
  'game-close': { at: 'start', zoom: 0.45 },
  // the rover close to, stood idle long enough to turn and look at the camera, and blink
  'game-idle': { at: 'start', zoom: 0.4, yaw: Math.PI, settle: 300 },
  // the view turned three-quarters round and tipped toward the horizon, looking back past the rover the way it came
  'game-orbit': { at: 'start', yaw: Math.PI, orbit: [Math.PI * 0.75, 0.35], settle: 240 },
  // a bank the rover cannot climb, from the viewpoint the world gives for it, facing up its face
  'game-bank': { at: 'fort hill', bank: 'fort hill scarp', zoom: 0.6 },
  // right out: the far zoom, the horizon and the clouds
  'game-farthest': { at: 'start', zoom: 4 },
  'game-wetland': { at: ['marsh', 'black tarn'], off: [-10, -40], yaw: Math.PI / 2 },
  // an S of tracks over the start's road and the grass beside it, seen from behind as the rover rolls to a stop
  'game-tracks': {
    at: 'start',
    zoom: 0.9,
    drive: [
      [1, 0.55, 70],
      [1, -0.55, 80],
      [1, 0.55, 70],
    ],
    settle: 90,
  },
  // an oddity of each kind as the chase camera first finds it, the rover a few metres off and facing it
  'game-duck': facing('mill pond duck', 30),
  'game-gnome': facing('orchard gnome', 30),
  // the UFO from the ground a good way off, the view tipped up toward the horizon to take it in
  'game-ufo': facing('shore rise UFO', 100, 0.47, { orbit: [0, 1], zoom: 1.3 }),
  // the viewfinder: the duck on the mill pond on a third through a short telephoto, in focus, the far shore blurred
  'game-photo-duck': facing('mill pond duck', 34, 0, {
    settle: 60,
    photo: { of: 'mill pond duck', mm: 70, nx: -1 / 3, ny: -1 / 4 },
  }),
  'game-photo-gnome': facing('orchard gnome', 24, 0, {
    settle: 60,
    photo: { of: 'orchard gnome', mm: 60, nx: 1 / 3, ny: -1 / 6 },
  }),
  // looking up at a UFO hovering over the shore rise, square in the middle, the hill's trees under it
  'game-photo-ufo': facing('shore rise UFO', 130, 0.47, {
    settle: 60,
    photo: { of: 'shore rise UFO', mm: 35, ny: 0.35 },
  }),
};

/**
 * The viewfinder raised and aimed so the middle of the oddity named is drawn at (nx, ny) on the screen, through a lens
 * of `mm`, then held still a moment so the focus finds it and the turn rate falls away. The eye moves with the head
 * as it turns, so the aim is found again a few times over.
 */
export async function aimAt(page: Page, of: string, mm: number, nx = 0, ny = 0): Promise<void> {
  await page.evaluate(() => window.game!.photo(true));
  const heights = Object.fromEntries(Object.entries(SUBJECTS).map(([k, v]) => [k, v.height]));
  const scales = Object.fromEntries(ODDITIES.map((o) => [o.name, o.scale]));
  await page.evaluate(
    ([of, mm, nx, ny, heights, scales]) => {
      const g = window.game!;
      g.lens(mm / g.viewfinder().focal);
      for (let k = 0; k < 4; k++) {
        const v = g.viewfinder();
        const o = g.oddities().find((d) => d.name === of)!;
        const mz = o.z + (heights[o.kind] * (scales[of] ?? 1)) / 2;
        const dx = o.x - v.eye[0],
          dy = o.y - v.eye[1],
          dz = mz - v.eye[2];
        const t = Math.tan((v.fov / 2) * (Math.PI / 180));
        const aspect = innerWidth / innerHeight;
        const yaw = Math.atan2(dy, dx) + Math.atan(nx * t * aspect);
        const pitch = Math.atan2(dz, Math.hypot(dx, dy)) - Math.atan(ny * t);
        // the turn the short way round, since the look is held to half a turn either way of the heading
        const turn = yaw - v.yaw;
        g.aim(turn - 2 * Math.PI * Math.round(turn / (2 * Math.PI)), pitch - v.pitch);
      }
      g.autoFocus();
      g.step(30);
    },
    [of, mm, nx, ny, heights, scales] as const,
  );
}

/** Sets the paused game on `page` at `view`, and plays it on until it has settled. Says where it stood. */
export async function placeView(page: Page, view: GameView): Promise<string> {
  // a bank's viewpoint is the world's to say, worked out in the page from the world's own module, which the dev server
  // serves (under node the physics package's TypeScript cannot be loaded)
  const bank =
    view.bank === undefined
      ? undefined
      : await page.evaluate(
          async ([name, url]) => {
            const world = (await import(url)) as typeof import('../src/world/generate');
            return world.bankViews(world.buildWorld()).find((b) => b.name === name);
          },
          [view.bank, '/src/world/generate.ts'] as const,
        );
  const at = await page.evaluate(
    ([v, settle, bank]) => {
      const g = window.game!;
      const c = g.content();
      const names = typeof v.at === 'string' ? [v.at] : v.at;
      const found =
        bank ??
        names
          .map((n) => (n === 'start' ? { ...c.start, name: 'start' } : c.landmarks.find((l) => l.name === n)))
          .find(Boolean);
      const place =
        found ??
        (v.tile
          ? { x: c.bounds.minX + (v.tile[0] + 0.5) * 6, y: c.bounds.minY + (v.tile[1] + 0.5) * 6, name: 'a tile' }
          : { ...c.start, name: 'start' });
      const [dx, dy] = v.off ?? [0, 0];
      g.teleport(place.x + dx, place.y + dy, bank?.yaw ?? v.yaw ?? c.start.yaw);
      if (v.zoom) g.zoom(v.zoom);
      for (const [throttle, steer, frames] of v.drive ?? []) {
        g.drive(throttle, steer);
        g.step(frames);
      }
      if (v.drive) g.release();
      if (v.orbit) g.orbit(v.orbit[0], v.orbit[1]);
      g.step(v.settle ?? settle);
      return place.name;
    },
    [view, SETTLE, bank] as const,
  );
  if (view.photo) await aimAt(page, view.photo.of, view.photo.mm, view.photo.nx, view.photo.ny);
  return at;
}
