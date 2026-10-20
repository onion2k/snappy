/**
 * What the game looks like, held to pictures taken before. Every other check
 * is on what the game does; nothing until now noticed a palette gone muddy,
 * a light lost, or the rock drawn over the floor.
 *
 * Each scene is set through the test API with chance seeded from before the
 * game is built, the game paused, the camera parked by hand, and a fixed
 * number of frames stepped, so the same machine draws the same pixels every
 * run. The pictures are in `smoke/screens/`. They are this machine's GPU:
 * another one will draw them a little differently, so the pictures are not
 * worth arguing with from elsewhere.
 *
 *   npm run look               the scenes against the pictures
 *   npm run look:update        the pictures written again, after a change meant to alter them
 *
 * A failure leaves the picture, what was drawn and the difference in
 * `test-results/`. Look at all three before deciding which is right.
 */
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';
import { GAME_VIEWS, placeView } from './views';

/** The world's scenes, by the picture's name, each from one of the game's views. */
const LOOK_SCENES: [string, keyof typeof GAME_VIEWS][] = [
  ['meadow', 'game-meadow'],
  ['pine', 'game-wood'],
  ['autumn', 'game-autumn'],
  ['heath', 'game-heath'],
  ['wetland', 'game-wetland'],
  ['village', 'game-village'],
  ['ruin', 'game-ruin'],
  ['ford', 'game-ford'],
  ['rover', 'game-idle'],
  ['orbit', 'game-orbit'],
  ['far', 'game-farthest'],
];

/**
 * How far the pictures may differ before it is a change and not the GPU: not a pixel whose colour is off by more
 * than 0.02, Playwright's own measure of a colour's difference. The world matches its pictures to the pixel: drawn on
 * five pages just booted, no scene moved a pixel (`/gate-moved`, 2026-10-20). It did not before artshape-render
 * 0.46.0, whose grass was listed as the GPU finished it, so up to twelve pixels of a field flickered and this allowed
 * 24; the grass is in an order of its own now, and nothing is forgiven. A button over the picture is about 700
 * pixels, and the gate's own check below holds that one is seen.
 */
const TOLERANCE = { maxDiffPixels: 0, threshold: 0.02 };

/** The corner that counts the milliseconds a frame takes is different every run, and says nothing about the look. */
async function hideStats(page: Page) {
  await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
}

test.describe('what it looks like', () => {
  test('the world, from the start', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      g.step(180);
      // the standard view: the chase camera settled behind the rover where it starts, on the east road into the village
      g.step(1);
    });
    await hideStats(page);
    await expect(page.locator('#view')).toHaveScreenshot('start.png', TOLERANCE);
    expect(problems).toEqual([]);
  });

  // The world's scenes (the spec's tenth criterion): the five biomes, the village, a ruin, a ford, the rover close to
  // with its idle face, and the world right out, each from its place in `views.ts` as the shots take it. A scene's
  // picture is written only through `/gate-moved` (`npm run look:update`): until it is, the scene is skipped, so a
  // plain run never writes a picture of its own unasked.
  for (const [name, view] of LOOK_SCENES)
    test(`the world: ${name}`, async ({ page }, info) => {
      test.skip(
        !existsSync(`smoke/screens/${name}.png`) && info.config.updateSnapshots !== 'all',
        'no picture yet: written through /gate-moved',
      );
      const problems = watch(page);
      await start(page, { seed: 1, paused: true });
      await placeView(page, GAME_VIEWS[view]);
      await hideStats(page);
      await expect(page.locator('#view')).toHaveScreenshot(`${name}.png`, TOLERANCE);
      expect(problems).toEqual([]);
    });

  test('a small thing added to the picture is a change', async ({ page }, info) => {
    // while the pictures are being written this would write its own, button and all, over the start's
    test.skip(!['none', 'missing'].includes(info.config.updateSnapshots), 'the pictures are being written');
    // the gate held to itself: a button a fifth the size of a thumb, which a tolerance of a five-hundredth of the
    // pixels let through, and let through four times over in a game copied from here
    await start(page, { seed: 11, paused: true });
    await page.evaluate(() => {
      const g = window.game!;
      g.step(180);
      // the standard view: the chase camera settled behind the rover where it starts, on the east road into the village
      g.step(1);
      const button = document.createElement('button');
      button.textContent = 'Go';
      Object.assign(button.style, { position: 'fixed', left: '600px', top: '380px', font: '12px sans-serif' });
      document.body.append(button);
    });
    await hideStats(page);
    let seen = '';
    try {
      await expect(page.locator('#view')).toHaveScreenshot('start.png', { ...TOLERANCE, timeout: 5000 });
    } catch (e) {
      seen = String(e);
    }
    expect(seen, 'the picture with a button on it matched the picture without').toMatch(/pixels \(ratio/);
  });
});
