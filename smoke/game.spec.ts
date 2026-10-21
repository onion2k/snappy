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
import { aimAt, GAME_VIEWS, placeView } from './views';

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

test('looks round with a drag on the view and with Q and E, and comes back behind once driven', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => window.game!.step(1));
  const view = (await page.locator('#view').boundingBox())!;
  // dragged a quarter of the view's height to the right: an eighth of a turn, the camera going round the other way
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width / 2 + view.height / 4, view.y + view.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.evaluate(() => window.game!.step(1));
  const dragged = await page.evaluate(() => window.game!.camera());
  expect(dragged.offset).toBeCloseTo(-Math.PI / 4, 1);
  // Q held for half a second of the game's time turns it back the other way
  await page.keyboard.down('KeyQ');
  await page.evaluate(() => window.game!.step(30));
  await page.keyboard.up('KeyQ');
  const keyed = await page.evaluate(() => window.game!.camera());
  expect(keyed.offset).toBeGreaterThan(dragged.offset + 0.5);
  // stood still it holds; driven a few seconds it is back behind the rover
  await page.evaluate(() => window.game!.step(120));
  expect((await page.evaluate(() => window.game!.camera())).offset).toBeCloseTo(keyed.offset, 3);
  await page.evaluate(() => {
    window.game!.drive(1, 0);
    window.game!.step(300);
    window.game!.release();
  });
  expect(Math.abs((await page.evaluate(() => window.game!.camera())).offset)).toBeLessThan(0.05);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

test('F raises the viewfinder at the rover eye, Space takes a picture and shows its card, Escape lowers it', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => window.game!.step(240));
  const chase = await page.evaluate(() => window.game!.camera());
  const rover = await page.evaluate(() => window.game!.rover());
  await page.evaluate(() => window.game!.resume());
  // out of it, the camera button and nothing else of the camera's
  await expect(page.locator('#cameraBtn')).toBeVisible();
  for (const hidden of ['#vf', '#vfHelp', '#shutterBtn', '#afBtn', '#card'])
    await expect(page.locator(hidden)).toBeHidden();
  await page.keyboard.press('KeyF');
  await expect(page.locator('#vf')).toBeVisible();
  await expect(page.locator('#vfHelp .keys')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#shutterBtn')).toBeVisible();
  const vf = await page.evaluate(() => window.game!.viewfinder());
  expect(vf.active).toBe(true);
  expect(vf.focal).toBe(50);
  // the rover stands where it was, the drive keys held and all, while the player looks
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  const still = await page.evaluate(() => window.game!.rover());
  expect([still.x, still.y]).toEqual([rover.x, rover.y]);
  // the shutter: a picture, its card, and the event told
  await page.keyboard.press('Space');
  await expect(page.locator('#card')).toBeVisible();
  expect((await page.evaluate(() => window.game!.events())).some((e) => e.startsWith('photo '))).toBe(true);
  await expect(page.locator('#cardTotal')).toHaveText(/^\d+$/);
  // a print of the picture on it, and a line on what let it down, never "not seen" of what was seen
  expect(await printSpread(page), 'the print is a picture, not a blank').toBeGreaterThan(5);
  await expect(page.locator('#cardWords')).not.toBeEmpty();
  // and gone again after its three seconds
  await expect(page.locator('#card')).toBeHidden({ timeout: 5000 });
  // a card still showing goes with the viewfinder
  await page.keyboard.press('Space');
  await expect(page.locator('#card')).toBeVisible();
  await page.keyboard.press('KeyF');
  await expect(page.locator('#card')).toBeHidden();
  await page.keyboard.press('KeyF');
  // Escape: back to the chase camera, where it was
  await page.keyboard.press('Escape');
  for (const hidden of ['#vf', '#vfHelp', '#shutterBtn', '#afBtn']) await expect(page.locator(hidden)).toBeHidden();
  await expect(page.locator('#help')).toBeVisible();
  await page.evaluate(() => window.game!.pause());
  expect((await page.evaluate(() => window.game!.viewfinder())).active).toBe(false);
  const back = await page.evaluate(() => window.game!.camera());
  for (let k = 0; k < 3; k++) expect(back.position[k]).toBeCloseTo(chase.position[k], 2);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

/** How much is in the card's print: the spread of its brightness, nought for a blank. */
function printSpread(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById('cardPrint') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0,
      sq = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += y;
      sq += y * y;
    }
    const n = d.length / 4;
    return Math.sqrt(sq / n - (sum / n) ** 2);
  });
}

test('the viewfinder blurs, and a slower machine stepped down a rung gives the blur up first', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  expect((await page.evaluate(() => window.game!.viewfinder())).blurred, 'not out of it').toBe(false);
  await page.evaluate(() => window.game!.photo(true));
  expect((await page.evaluate(() => window.game!.viewfinder())).blurred).toBe(true);
  await start(page, { seed: 1, paused: true, rung: 1 });
  await page.evaluate(() => window.game!.photo(true));
  expect((await page.evaluate(() => window.game!.viewfinder())).blurred, 'at the first rung down').toBe(false);
  expect(problems).toEqual([]);
});

test('in the viewfinder a drag turns the view, the wheel zooms the lens, a click focuses and A goes back to auto', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => window.game!.photo(true));
  const view = (await page.locator('#view').boundingBox())!;
  const cx = view.x + view.width / 2,
    cy = view.y + view.height / 2;
  const before = await page.evaluate(() => window.game!.viewfinder());
  // dragged right and down: the scene goes with the hand, so the view turns left and tilts up
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 6 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => window.game!.viewfinder());
  expect(dragged.yaw).toBeGreaterThan(before.yaw + 0.05);
  expect(dragged.pitch).toBeGreaterThan(before.pitch + 0.02);
  expect(dragged.mode, 'a drag is not a tap').toBe('auto');
  // the wheel toward the player is a longer lens, and it stops at 135
  await page.mouse.wheel(0, -400);
  await page.evaluate(() => window.game!.step(1));
  expect((await page.evaluate(() => window.game!.viewfinder())).focal).toBeGreaterThan(50);
  for (let k = 0; k < 10; k++) await page.mouse.wheel(0, -800);
  await page.evaluate(() => window.game!.step(1));
  expect((await page.evaluate(() => window.game!.viewfinder())).focal).toBe(135);
  // a click on nothing but grass leaves the auto focus alone: a stray click is not a wish to focus by hand
  await page.mouse.click(cx - view.width / 4, cy + view.height / 4);
  expect((await page.evaluate(() => window.game!.viewfinder())).mode, 'a click on nothing').toBe('auto');
  // a click on an oddity, without a drag: focus set by hand, its mark where the click was (y up)
  const duck = await page.evaluate(() => window.game!.oddities().find((o) => o.name === 'mill pond duck')!);
  // the camera lowered for the move: raised, the viewfinder's eye stays where it was
  await page.evaluate(() => window.game!.photo(false));
  await page.evaluate(
    ([x, y, yaw]) => window.game!.teleport(x + Math.cos(yaw) * 40, y + Math.sin(yaw) * 40, yaw + Math.PI),
    [duck.x, duck.y, duck.yaw],
  );
  await aimAt(page, 'mill pond duck', 135, -0.5, -0.5);
  await page.mouse.click(cx - view.width / 4, cy + view.height / 4);
  const tapped = await page.evaluate(() => window.game!.viewfinder());
  expect(tapped.mode).toBe('manual');
  expect(tapped.mark[0]).toBeCloseTo(-0.5, 2);
  expect(tapped.mark[1]).toBeCloseTo(-0.5, 2);
  await expect(page.locator('#vfMode')).toHaveText('MF');
  await page.keyboard.press('KeyA');
  await page.evaluate(() => window.game!.step(1));
  expect((await page.evaluate(() => window.game!.viewfinder())).mode).toBe('auto');
  await expect(page.locator('#vfMode')).toHaveText('AF');
  // a picture while the game is stopped is not taken
  await page.keyboard.press('Space');
  await expect(page.locator('#card')).toBeHidden();
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
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
    expect(
      (await page.evaluate(() => window.game!.camera())).offset,
      'the stick drives, and does not turn the view',
    ).toBe(0);
    expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('raises the viewfinder and takes a picture with a tap on each button, the stick put away meanwhile', async ({
    page,
  }, info) => {
    const problems = watch(page);
    await start(page, { seed: 1 });
    const camera = page.locator('#cameraBtn');
    await expect(camera).toBeVisible();
    for (const b of [await camera.boundingBox()]) expect(Math.min(b!.width, b!.height)).toBeGreaterThanOrEqual(48);
    await camera.tap();
    expect((await page.evaluate(() => window.game!.viewfinder())).active).toBe(true);
    await expect(page.locator('.stick')).toBeHidden();
    const shutter = page.locator('#shutterBtn'),
      af = page.locator('#afBtn');
    for (const b of [await shutter.boundingBox(), await af.boundingBox()])
      expect(Math.min(b!.width, b!.height)).toBeGreaterThanOrEqual(48);
    // the help in a finger's words, and not the keyboard's
    await expect(page.locator('#vfHelp .touch')).toBeVisible();
    await expect(page.locator('#vfHelp .touch')).toContainText('tap to focus');
    await expect(page.locator('#vfHelp .keys')).toBeHidden();
    await shutter.tap();
    await expect(page.locator('#card')).toBeVisible();
    // the card is a small one along the bottom, clear of the shutter, its print a picture
    const card = (await page.locator('#card').boundingBox())!;
    const button = (await shutter.boundingBox())!;
    expect(card.y, 'along the bottom').toBeGreaterThan(860 / 2);
    expect(card.x + card.width, 'clear of the shutter').toBeLessThanOrEqual(button.x);
    expect(card.height).toBeLessThan(200);
    expect(await printSpread(page)).toBeGreaterThan(5);
    await info.attach('phone viewfinder', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    await camera.tap();
    expect((await page.evaluate(() => window.game!.viewfinder())).active).toBe(false);
    await expect(page.locator('.stick')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('in the viewfinder, a finger drags the view, two pinch the lens and a tap focuses', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => window.game!.photo(true));
    const before = await page.evaluate(() => window.game!.viewfinder());
    // fingers, as the browser tells of them: pointer events of the touch kind, on the view itself
    const after = await page.evaluate(() => {
      const view = document.getElementById('view')!;
      const at = (type: string, id: number, x: number, y: number) =>
        view.dispatchEvent(
          new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }),
        );
      const g = window.game!;
      // one finger dragged left: the scene goes with it, so the view turns right
      at('pointerdown', 1, 250, 400);
      for (let x = 240; x >= 150; x -= 10) at('pointermove', 1, x, 400);
      at('pointerup', 1, 150, 400);
      const dragged = g.viewfinder();
      // two fingers spread apart: a longer lens
      at('pointerdown', 2, 180, 400);
      at('pointerdown', 3, 220, 400);
      for (let d = 30; d <= 120; d += 10) {
        at('pointermove', 2, 200 - d, 400);
        at('pointermove', 3, 200 + d, 400);
      }
      at('pointerup', 2, 80, 400);
      at('pointerup', 3, 320, 400);
      const pinched = g.viewfinder();
      // a tap on nothing but grass, lifted where it was set down: the auto focus is left alone
      at('pointerdown', 4, 100, 215);
      at('pointerup', 4, 100, 215);
      return { dragged, pinched, stray: g.viewfinder() };
    });
    expect(after.dragged.yaw).toBeLessThan(before.yaw - 0.05);
    expect(after.dragged.mode, 'a drag is not a tap').toBe('auto');
    expect(after.pinched.focal).toBeGreaterThan(before.focal * 2);
    expect(after.stray.mode, 'a tap on nothing').toBe('auto');
    // a tap on an oddity: focus by hand, its mark where the finger was
    const duck = await page.evaluate(() => window.game!.oddities().find((o) => o.name === 'mill pond duck')!);
    // the camera lowered for the move: raised, the viewfinder's eye stays where it was
    await page.evaluate(() => window.game!.photo(false));
    await page.evaluate(
      ([x, y, yaw]) => window.game!.teleport(x + Math.cos(yaw) * 40, y + Math.sin(yaw) * 40, yaw + Math.PI),
      [duck.x, duck.y, duck.yaw],
    );
    await aimAt(page, 'mill pond duck', 135, -0.5, 0.5);
    const tapped = await page.evaluate(() => {
      const view = document.getElementById('view')!;
      const box = view.getBoundingClientRect();
      const x = box.left + box.width / 4,
        y = box.top + box.height / 4;
      for (const type of ['pointerdown', 'pointerup'])
        view.dispatchEvent(
          new PointerEvent(type, { pointerId: 5, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }),
        );
      return window.game!.viewfinder();
    });
    expect(tapped.mode).toBe('manual');
    expect(tapped.mark[0]).toBeCloseTo(-0.5, 2);
    expect(tapped.mark[1]).toBeCloseTo(0.5, 2);
    expect(problems).toEqual([]);
  });

  test('looks round with one finger dragged on the view, away from the stick', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await page.evaluate(() => window.game!.step(1));
    // a finger, as the browser tells of one: pointer events of the touch kind, on the view itself
    await page.evaluate(() => {
      const view = document.getElementById('view')!;
      const at = (type: string, x: number) =>
        view.dispatchEvent(
          new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: 300, bubbles: true }),
        );
      at('pointerdown', 200);
      for (let x = 190; x >= 100; x -= 10) at('pointermove', x);
      at('pointerup', 100);
      window.game!.step(1);
    });
    expect((await page.evaluate(() => window.game!.camera())).offset).toBeGreaterThan(0.2);
    expect(problems).toEqual([]);
  });
});
