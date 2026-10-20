/**
 * The game's places to look from, shared by the shots (`shots.spec.ts`, for
 * a person to look at) and the look gate (`look.spec.ts`, held to pictures):
 * the rover put at a landmark (or the start, or a tile of the layout's), a
 * little off it and facing `yaw`, driven for a while if `drive` says so, the
 * camera zoomed by `zoom`, and the game played on until the camera has
 * settled behind it and the rover, stood idle, has turned to look at it.
 */
import type { Page } from '@playwright/test';

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
}

/** Frames enough for the camera to settle and the rover, idle two seconds, to turn and look up at it. */
export const SETTLE = 240;

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
};

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
  return page.evaluate(
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
      g.step(v.settle ?? settle);
      return place.name;
    },
    [view, SETTLE, bank] as const,
  );
}
