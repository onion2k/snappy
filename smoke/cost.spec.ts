/**
 * What a frame of a few views costs, for working on the frame: `measureFrame` (the GPU waited for, the least of many
 * frames) at the views that matter, at the rung `COST_RUNG` says (nought by default). Not a gate: nothing is compared,
 * and it runs only through `npm run cost` (which sets `COST`), so the smoke run skips it.
 *
 *   npm run cost
 *   COST_RUNG=2 npm run cost
 */
import { test } from '@playwright/test';
import { start } from './game';
import { GAME_VIEWS, placeView } from './views';

const VIEWS = ['game-start', 'game-village', 'game-wood', 'game-far', 'game-photo-duck'];
const RUNG = Number(process.env.COST_RUNG ?? 0);

test.describe('what a frame costs', () => {
  test.skip(!process.env.COST, 'run through npm run cost');
  for (const view of VIEWS)
    test(view, async ({ page }) => {
      await start(page, { seed: 1, paused: true, rung: RUNG });
      await placeView(page, GAME_VIEWS[view]);
      // the viewfinder's iris opens over a couple of seconds, and the frame is measured once it has
      if (GAME_VIEWS[view].photo) await page.waitForTimeout(2500);
      // the least of three, a second apart: a GPU settles into a clock for a while, and one run in a few sat twice as high
      let ms = Infinity;
      for (let k = 0; k < 3; k++) {
        ms = Math.min(ms, await page.evaluate(() => window.game!.measureFrame()));
        await page.waitForTimeout(1000);
      }
      console.log(`COST rung ${RUNG} ${view} ${ms.toFixed(2)} ms`);
    });
});
