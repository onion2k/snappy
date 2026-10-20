/**
 * The game as a player gets it: served by Vite, run in Chromium on the real
 * GPU, with a fresh save each test. What the unit tests cannot reach — the
 * renderer, the frame loop, the page — checked for the things that would
 * make it plainly broken: an error, a black screen, a mute that does not come
 * back.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { ready, start, watch } from './game';
import { GAME_VIEWS, placeView } from './views';

/** How many frames the page draws in a second. */
function framesInASecond(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const began = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - began < 1000) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** How much a screenshot has in it: the spread of its brightness, and the share of it that is not near black. */
function content(png: Buffer) {
  const img = PNG.sync.read(png);
  let sum = 0,
    sq = 0,
    lit = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const y = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    sum += y;
    sq += y * y;
    if (y > 40) lit++;
  }
  const mean = sum / n;
  return { spread: Math.sqrt(sq / n - mean * mean), lit: lit / n };
}

test('boots with no errors and draws the world', async ({ page }, info) => {
  const problems = watch(page);
  await start(page);
  expect(await framesInASecond(page)).toBeGreaterThan(20);
  const shot = await page.screenshot();
  await info.attach('world', { body: shot, contentType: 'image/png' });
  const c = content(shot);
  expect(c.lit, 'share of the screen lit').toBeGreaterThan(0.2);
  // the toon daylight is bright and flat-coloured, so its spread is lower than the dark studio look's was: a black or
  // one-colour screen is still far under this
  expect(c.spread, 'variety in the picture').toBeGreaterThan(10);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

/**
 * How far one channel of a pixel may move between two pictures of a still scene before it is a change: the grass's
 * blades are gathered on the GPU in no fixed order (artshape-render's grass pass appends them by atomic counter), so
 * where two blades lie at one depth a few pixels flicker by a few levels from frame to frame. Anything the scene
 * itself changes moves far more: a pool refilled a frame late moved 300,000 pixels by up to 135.
 */
const STILL_SLACK = 24;

// What is drawn depends on the game's state and the camera, never on how many frames have been drawn: a paused view,
// pictured at once after it is set and again a second later, is the same picture (the final pass's bug: a crossing's
// pools were refilled a frame after the step that crossed, so the step's own picture was the old pools').
for (const view of ['game-autumn', 'game-ruin'])
  test(`draws a still view the same at once and a second later: ${view}`, async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await placeView(page, GAME_VIEWS[view]);
    await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
    const first = PNG.sync.read(await page.locator('#view').screenshot());
    await page.waitForTimeout(1000);
    const later = PNG.sync.read(await page.locator('#view').screenshot());
    let moved = 0;
    for (let i = 0; i < first.data.length; i += 4)
      for (let k = 0; k < 3; k++)
        if (Math.abs(first.data[i + k] - later.data[i + k]) > STILL_SLACK) {
          moved++;
          break;
        }
    expect(moved, 'pixels changed in a still scene').toBe(0);
    expect(problems).toEqual([]);
  });

test('keeps the mute across a reload', async ({ page }) => {
  const problems = watch(page);
  await start(page);
  await page.evaluate(() => window.game!.mute(true));
  await page.reload();
  await ready(page);
  expect((await page.evaluate(() => window.game!.sound())).muted, 'kept across the reload').toBe(true);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });

  test('boots, and nothing is wider than the screen', async ({ page }, info) => {
    const problems = watch(page);
    await start(page);
    await expect(page.locator('#help')).toBeVisible();
    await expect(page.locator('#bank')).toHaveCount(0);
    await info.attach('phone', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    expect(problems).toEqual([]);
  });

  test('shows the thumb stick, and a push up on it drives the rover forward', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    const stick = page.locator('.stick');
    await expect(stick).toBeVisible();
    const box = (await stick.boundingBox())!;
    const before = await page.evaluate(() => window.game!.rover());
    // a thumb down in the middle of the ring and pushed straight up, held while the game plays a second
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 50, { steps: 4 });
    await page.evaluate(() => window.game!.step(60));
    await page.mouse.up();
    const after = await page.evaluate(() => window.game!.rover());
    const ahead = (after.x - before.x) * Math.cos(before.yaw) + (after.y - before.y) * Math.sin(before.yaw);
    expect(ahead, 'driven forward').toBeGreaterThan(5);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });
});
