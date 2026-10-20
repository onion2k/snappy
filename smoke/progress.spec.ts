/**
 * The game played through in a real browser: booted, stopped, and stepped a
 * frame at a time through the test API, so it is the same every run and waits
 * on no clock, while everything that follows, the physics, the scene and the
 * music, is the game's own.
 *
 * A feature that a player can reach gets a stage here, and after every stage
 * the game's invariants are checked.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { start, watch } from './game';
import { GAME_VIEWS, aimAt, placeView } from './views';

/** Play `frames` frames, and check nothing that must hold has broken. */
async function play(page: Page, frames: number, stage: string) {
  const broken = await page.evaluate((n) => {
    window.game!.step(n);
    return window.game!.invariants();
  }, frames);
  expect(broken, `invariants after ${stage}`).toEqual([]);
}

/**
 * The way the road through the north ford runs there, anticlockwise from +x: read from the world's roads, which a
 * test of the page cannot see, and said here so the rover is lined up on it.
 */
const NORTH_FORD_ROAD = 0.464;

test('the rover drives through the north ford and on along its road, slowed in the water, breaking no rule', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const ford = await page.evaluate(() => window.game!.content().landmarks.find((l) => l.name === 'north ford')!);
  // forty units back from the ford along its road, facing across it
  await page.evaluate(
    ([x, y, yaw]) => window.game!.teleport(x - Math.cos(yaw) * 40, y - Math.sin(yaw) * 40, yaw),
    [ford.x, ford.y, NORTH_FORD_ROAD],
  );
  await page.evaluate(() => window.game!.drive(1, 0));
  let wettest = 0,
    slowestWet = Infinity,
    fastestDry = 0;
  const surfaces = new Set<string>();
  for (let leg = 0; leg < 20; leg++) {
    await play(page, 30, `leg ${leg} of the drive`);
    const r = await page.evaluate(() => window.game!.rover());
    surfaces.add(r.surface);
    if (r.wet > 0) slowestWet = Math.min(slowestWet, Math.abs(r.speed));
    else fastestDry = Math.max(fastestDry, Math.abs(r.speed));
    wettest = Math.max(wettest, r.wet);
    expect(r.blocked, `blocked on leg ${leg} at ${r.x.toFixed(1)}, ${r.y.toFixed(1)}`).toBe(false);
  }
  await page.evaluate(() => window.game!.release());
  const r = await page.evaluate(() => window.game!.rover());
  // across: the ford left behind, along the way it was driven
  const past = (r.x - ford.x) * Math.cos(NORTH_FORD_ROAD) + (r.y - ford.y) * Math.sin(NORTH_FORD_ROAD);
  expect(past, 'past the ford').toBeGreaterThan(30);
  expect(wettest, 'in the water on the way').toBeGreaterThan(0);
  expect(wettest, 'and never deeper than a ford').toBeLessThanOrEqual(1.2);
  expect(slowestWet, 'slowed in it').toBeLessThan(fastestDry);
  expect(surfaces.has('dirt'), `on the road: ${[...surfaces].join(', ')}`).toBe(true);
  expect(r.tracks, 'tracks laid on the road').toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('600 frames of the world pass with the music playing and no rule broken', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => window.game!.wake());
  await play(page, 600, 'ten seconds');
  const { t } = await page.evaluate(() => window.game!.state());
  expect(t, 'ten seconds of game time').toBeCloseTo(10, 6);
  const sound = await page.evaluate(() => window.game!.sound());
  expect(sound.beat, 'the music has played, on game time: 90 beats a minute').toBeCloseTo(15, 6);
  expect(sound.voices, 'the music is sounding').toBeGreaterThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('the rover drives to the mill pond, and the duck there is photographed well', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  const duck = await page.evaluate(() => window.game!.oddities().find((o) => o.name === 'mill pond duck')!);
  // forty units out from it along the way it faces, turned to it, and driven twenty units toward it
  await page.evaluate(
    ([x, y, yaw]) => window.game!.teleport(x + Math.cos(yaw) * 40, y + Math.sin(yaw) * 40, yaw + Math.PI),
    [duck.x, duck.y, duck.yaw],
  );
  await page.evaluate(() => window.game!.drive(1, 0));
  await play(page, 25, 'the drive to the pond');
  await page.evaluate(() => window.game!.release());
  await play(page, 60, 'stopping');
  // the viewfinder raised, the duck put on a third through a short telephoto, auto focus left to find it
  await aimAt(page, 'mill pond duck', 70, -1 / 3, -1 / 4);
  const vf = await page.evaluate(() => window.game!.viewfinder());
  expect(vf.framed.map((f) => f.name)).toContain('mill pond duck');
  expect(vf.framed.find((f) => f.name === 'mill pond duck')!.sharp, 'in focus').toBe(true);
  const grade = (await page.evaluate(() => window.game!.shutter()))!;
  expect(grade.name).toBe('mill pond duck');
  expect(grade.total, JSON.stringify(grade.terms)).toBeGreaterThan(40);
  expect(grade.stars).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#cardTotal')).toHaveText(String(grade.total));
  const broken = await page.evaluate(() => window.game!.invariants());
  expect(broken, 'invariants after the picture').toEqual([]);
  // kept in the album, the first of the duck, and the save holding it
  expect(grade.kept).toEqual({ kind: 'first', replaced: 0 });
  const save = JSON.parse(await page.evaluate(() => window.game!.save())) as { album: { name: string }[] };
  expect(save.album.map((e) => e.name)).toEqual(['mill pond duck']);
  expect(problems).toEqual([]);
});

/** The game as the album must leave it: its time, whether it is stopped, and the viewfinder's look. */
async function asItIs(page: Page) {
  return page.evaluate(() => {
    const g = window.game!;
    const { t, paused } = g.state();
    const { active, yaw, pitch, focal, focusDepth } = g.viewfinder();
    return { t, paused, active, yaw, pitch, focal, focusDepth };
  });
}

/** What the open album shows: its page's name and total, the count, and which page of how many. */
async function shown(page: Page) {
  return page.evaluate(() => ({
    name: document.getElementById('albumName')!.textContent,
    total: document.getElementById('albumTotal')!.textContent,
    count: document.getElementById('albumCount')!.textContent,
    page: document.getElementById('albumPage')!.textContent,
  }));
}

/**
 * Where the view is laid over an open album page: inside the mount's window, at the shape the picture was taken at,
 * as large as the window holds it and in its middle, so the whole of what was taken shows and nothing it did not.
 */
async function expectFitted(page: Page, aspect: number) {
  const win = (await page.locator('#albumWindow').boundingBox())!;
  const view = (await page.locator('#view').boundingBox())!;
  expect(Math.abs(view.width / view.height - aspect), `the view ${view.width} by ${view.height}`).toBeLessThan(
    2 / Math.min(view.width, view.height),
  );
  expect(view.x).toBeGreaterThanOrEqual(Math.floor(win.x));
  expect(view.y).toBeGreaterThanOrEqual(Math.floor(win.y));
  expect(view.x + view.width).toBeLessThanOrEqual(Math.ceil(win.x + win.width));
  expect(view.y + view.height).toBeLessThanOrEqual(Math.ceil(win.y + win.height));
  // filling one way, and in the middle of the other
  const fills = Math.abs(view.width - win.width) <= 1 || Math.abs(view.height - win.height) <= 1;
  expect(fills, 'as large as the window holds it').toBe(true);
  expect(Math.abs(view.x - win.x - (win.x + win.width - view.x - view.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(view.y - win.y - (win.y + win.height - view.y - view.height))).toBeLessThanOrEqual(2);
  return { win, view };
}

/** How many pixels of two pictures of one size differ at all. */
function differing(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a),
    pb = PNG.sync.read(b);
  expect([pa.width, pa.height]).toEqual([pb.width, pb.height]);
  let n = 0;
  for (let i = 0; i < pa.data.length; i += 4)
    if (pa.data[i] !== pb.data[i] || pa.data[i + 1] !== pb.data[i + 1] || pa.data[i + 2] !== pb.data[i + 2]) n++;
  return n;
}

/** Frames of the page's own loop, as the browser draws them: time passing for a game that is not stopped. */
async function frames(page: Page, n: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        let left = n;
        const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

test('pictures go into the album, which opens over the game, turns its pages, closes back to it and is kept', async ({
  page,
  browser,
}, info) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  // the duck on the mill pond, as its view in the shots has it, and the card saying it went into the album
  await placeView(page, GAME_VIEWS['game-photo-duck']);
  const duck = (await page.evaluate(() => window.game!.shutter()))!;
  expect(duck.name).toBe('mill pond duck');
  expect(duck.kept).toEqual({ kind: 'first', replaced: 0 });
  await expect(page.locator('#cardKept')).toHaveText('Into the album');
  // the same again is no better, and the card says nothing of the album
  const again = (await page.evaluate(() => window.game!.shutter()))!;
  expect(again.kept.kind).toBe('none');
  await expect(page.locator('#cardKept')).toBeHidden();
  // and a second oddity, the orchard gnome, for a second page
  await page.evaluate(() => window.game!.photo(false));
  await placeView(page, GAME_VIEWS['game-photo-gnome']);
  const gnome = (await page.evaluate(() => window.game!.shutter()))!;
  expect(gnome.name).toBe('orchard gnome');
  expect(gnome.kept.kind).toBe('first');
  await expect(page.locator('#card')).toBeVisible();
  const album = await page.evaluate(() => window.game!.album());
  expect(album.count).toBe(2);
  expect(album.pages.map((p) => [p.name, p.total])).toEqual([
    ['mill pond duck', duck.total],
    ['orchard gnome', gnome.total],
  ]);

  // opened by Tab from the viewfinder, over the game, the card gone and the keyboard's focus not moved
  const before = await asItIs(page);
  expect(before.active).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('#album')).toBeVisible();
  await expect(page.locator('#card')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(await page.evaluate(() => window.game!.albumState())).toEqual({ open: true, page: 0, pages: 2 });
  expect(await shown(page)).toEqual({
    name: 'mill pond duck',
    total: String(duck.total),
    count: '2 of 12 oddities pictured',
    page: 'page 1 of 2',
  });
  await expect(page.locator('#albumSmall')).toHaveText(
    'Redrawn from the lens as it was; the rover and its tracks are not in it.',
  );
  // the picture is drawn in the mount's window at the shape it was taken at, the screen's, the view laid over it
  const { win } = await expectFitted(page, 1280 / 800);
  await info.attach('album, the duck', { body: await page.screenshot(), contentType: 'image/png' });

  // turned by the arrows, and not past either end
  await page.keyboard.press('ArrowRight');
  expect((await shown(page)).name).toBe('orchard gnome');
  expect((await shown(page)).page).toBe('page 2 of 2');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.game!.albumState().page), 'no going round from the last').toBe(1);
  await info.attach('album, the gnome', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.game!.albumState().page), 'nor from the first').toBe(0);
  // by the page buttons, the one that goes nowhere put out
  await expect(page.locator('#albumPrev')).toBeDisabled();
  await page.locator('#albumNext').click();
  expect((await shown(page)).name).toBe('orchard gnome');
  await expect(page.locator('#albumNext')).toBeDisabled();
  await page.locator('#albumPrev').click();
  expect((await shown(page)).name).toBe('mill pond duck');
  // by a swipe across the page: a drag left turns on, a short one does nothing, a drag right turns back
  const swipe = async (dx: number) => {
    await page.mouse.move(640, 300);
    await page.mouse.down();
    await page.mouse.move(640 + dx, 304, { steps: 5 });
    await page.mouse.up();
  };
  await swipe(-160);
  expect((await shown(page)).name).toBe('orchard gnome');
  await swipe(20);
  expect((await shown(page)).name).toBe('orchard gnome');
  await swipe(160);
  expect((await shown(page)).name).toBe('mill pond duck');

  // only the album's keys work while it is open: F, Space and A do nothing to the game
  await page.evaluate(() => window.game!.events());
  await page.keyboard.press('KeyF');
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyA');
  expect(await page.evaluate(() => window.game!.events())).toEqual([]);
  expect((await page.evaluate(() => window.game!.albumState())).open).toBe(true);

  // the window resized while it is open: the view laid over the window again, still at the picture's shape, narrower
  // and wider than it
  await page.setViewportSize({ width: 900, height: 700 });
  await frames(page, 3);
  const { win: win2 } = await expectFitted(page, 1280 / 800);
  expect(win2.width).toBeLessThan(win.width);
  await page.setViewportSize({ width: 1600, height: 700 });
  await frames(page, 3);
  await expectFitted(page, 1280 / 800);
  await page.setViewportSize({ width: 1280, height: 800 });
  await frames(page, 3);

  // what a page turn costs, from the turn to its frame finished on the GPU
  const turns: number[] = [];
  for (let k = 0; k < 6; k++)
    turns.push(
      await page.evaluate(
        async (n) => {
          const t = performance.now();
          await window.game!.albumPage(n);
          return performance.now() - t;
        },
        (k + 1) % 2,
      ),
    );
  info.annotations.push({ type: 'page turn, ms', description: turns.map((t) => t.toFixed(1)).join(', ') });
  console.log(`a page turn, ms: ${turns.map((t) => t.toFixed(1)).join(', ')}`);

  // closed by Escape: the viewfinder up as it was, the game stopped as it was, its time not moved
  await page.keyboard.press('Escape');
  await expect(page.locator('#album')).toBeHidden();
  expect(await asItIs(page)).toEqual(before);
  await expect(page.locator('#vf')).toBeVisible();
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  // and the frame as it was before it opened, to the pixel: the focus mark where it was, its pulse not played again
  // (it swept in from far across the screen as the album closed: album review, 5)
  await frames(page, 30);
  const settled = await page.screenshot();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.locator('#album')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('focusMark')!.getAnimations().length)).toBe(0);
  expect(differing(await page.screenshot(), settled), 'the frame closed back to').toBe(0);

  // the keys that drive heard by nothing while it is open: an arrow held to turn its pages, and W held from before,
  // drive nothing after it is closed until they are pressed again
  await page.evaluate(() => window.game!.photo(false));
  await play(page, 30, 'standing');
  const stood = await page.evaluate(() => window.game!.rover());
  await page.keyboard.down('KeyW');
  await page.keyboard.press('Tab');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('Tab');
  await expect(page.locator('#album')).toBeHidden();
  await play(page, 30, 'the keys still held after the album');
  const still = await page.evaluate(() => window.game!.rover());
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyW');
  expect([still.x, still.y, still.yaw].map((v) => v.toFixed(3))).toEqual(
    [stood.x, stood.y, stood.yaw].map((v) => v.toFixed(3)),
  );
  await page.evaluate(() => window.game!.photo(true));

  // and by the button, from driving with the game going: stopped while open, going again after
  await page.evaluate(() => window.game!.photo(false));
  await page.evaluate(() => window.game!.resume());
  await page.locator('#albumBtn').click();
  await expect(page.locator('#album')).toBeVisible();
  const open = await asItIs(page);
  expect(open.paused).toBe(true);
  await frames(page, 5);
  expect((await asItIs(page)).t, 'no time passes while it is open').toBe(open.t);
  await page.locator('#albumBtn').click();
  await expect(page.locator('#album')).toBeHidden();
  const after = await asItIs(page);
  expect(after.paused).toBe(false);
  expect(after.active).toBe(false);
  await page.evaluate(() => window.game!.pause());
  await info.attach('closed, back to driving', { body: await page.screenshot(), contentType: 'image/png' });

  // kept through a reload, from the save as it was written
  const save = JSON.parse(await page.evaluate(() => window.game!.save())) as Record<string, unknown>;
  const again2 = await browser.newPage();
  const problems2 = watch(again2);
  await start(again2, { save, seed: 1, paused: true });
  expect((await again2.evaluate(() => window.game!.album())).pages).toEqual(album.pages);
  await again2.evaluate(() => window.game!.openAlbum(true));
  expect((await shown(again2)).name).toBe('mill pond duck');
  await again2.close();
  expect(problems2).toEqual([]);
  expect(problems).toEqual([]);
});

test('a page is the same picture after a reload, though the rover pressed the grass in front of it first', async ({
  page,
  browser,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  // stood where the gnome's picture is taken from, driven on toward it through the grass, and put back to take it:
  // the grass in front of the lens pressed by the rover moments before the shutter
  await placeView(page, GAME_VIEWS['game-photo-gnome']);
  await page.evaluate(async () => {
    const g = window.game!;
    await g.photo(false);
    g.drive(1, 0);
    // a frame drawn each step, as the page draws them, since the grass is pressed where the frame finds the wheels
    for (let f = 0; f < 90; f++) g.step(1);
    g.release();
  });
  expect(
    (await page.evaluate(() => window.game!.rover())).tracks,
    'tracks laid, and the grass pressed',
  ).toBeGreaterThan(0);
  await placeView(page, GAME_VIEWS['game-photo-gnome']);
  expect((await page.evaluate(() => window.game!.shutter()))!.kept.kind).toBe('first');
  await page.evaluate(() => window.game!.openAlbum(true));
  const view = page.locator('#view');
  const before = await view.screenshot();
  const save = JSON.parse(await page.evaluate(() => window.game!.save())) as Record<string, unknown>;
  // the same page from the save, in a game that has pressed nothing and whose grain has rolled on differently
  const again = await browser.newPage();
  const problems2 = watch(again);
  await start(again, { save, seed: 1, paused: true });
  await again.evaluate(() => window.game!.step(37));
  await again.evaluate(() => window.game!.openAlbum(true));
  const after = await again.locator('#view').screenshot();
  expect(differing(before, after), 'pixels of the page that differ after the reload').toBe(0);
  await again.close();
  expect(problems2).toEqual([]);
  expect(problems).toEqual([]);
});

test('an album from a save before there was one is a page saying how to take a picture', async ({ page }) => {
  const problems = watch(page);
  await start(page, { save: { muted: true, volume: 0.6 }, seed: 1, paused: true });
  expect(await page.evaluate(() => window.game!.album())).toEqual({ capacity: 12, count: 0, pages: [] });
  await page.evaluate(() => window.game!.openAlbum(true));
  await expect(page.locator('#albumEmpty')).toBeVisible();
  await expect(page.locator('#albumEmpty')).toContainText('Nothing pictured yet');
  await expect(page.locator('#albumWindow')).toBeHidden();
  await expect(page.locator('#albumCount')).toHaveText('0 of 12 oddities pictured');
  expect(await page.evaluate(() => window.game!.albumState())).toEqual({ open: true, page: 0, pages: 1 });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.game!.albumState().page)).toBe(0);
  await page.keyboard.press('Tab');
  await expect(page.locator('#album')).toBeHidden();
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('the album’s button is big enough, and its mount and words fit the screen', async ({ page }, info) => {
    const problems = watch(page);
    const album = JSON.parse(readFileSync('test/saves/04-album.json', 'utf8')) as Record<string, unknown>;
    await start(page, { save: album, seed: 1, paused: true });
    const button = page.locator('#albumBtn');
    const b = (await button.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(48);
    await button.tap();
    await expect(page.locator('#album')).toBeVisible();
    expect(await page.evaluate(() => window.game!.albumState())).toEqual({ open: true, page: 0, pages: 2 });
    const mount = (await page.locator('#albumMount').boundingBox())!;
    expect(mount.x).toBeGreaterThanOrEqual(0);
    expect(mount.x + mount.width).toBeLessThanOrEqual(375);
    expect(mount.y + mount.height).toBeLessThanOrEqual(812);
    // the words inside the mount, none running past its edge
    const over = await page.evaluate(() => {
      const box = document.getElementById('albumMount')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('#albumMount *'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > box.right + 0.5 || r.left < box.left - 0.5 || r.bottom > box.bottom + 0.5;
        })
        .map((el) => el.id || el.tagName);
    });
    expect(over).toEqual([]);
    // the picture all there, at the shape it was taken at on a desktop, across the width of the mount
    const { view } = await expectFitted(page, 1.6);
    expect(view.width, 'the picture a good part of the screen').toBeGreaterThan(330);
    // the page buttons a thumb's size, and the keys' help not shown to a thumb
    for (const id of ['#albumPrev', '#albumNext']) {
      const p = (await page.locator(id).boundingBox())!;
      expect(Math.min(p.width, p.height), id).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#albumKeys')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await info.attach('phone album', { body: await page.screenshot(), contentType: 'image/png' });
    // a swipe of a finger turns the page
    await page.evaluate(() => {
      const fire = (type: string, x: number) =>
        document
          .getElementById('album')!
          .dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: 600, bubbles: true }));
      fire('pointerdown', 300);
      fire('pointerup', 120);
    });
    expect(await page.evaluate(() => window.game!.albumState().page)).toBe(1);
    await button.tap();
    await expect(page.locator('#album')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('the help is a thumb’s, and nothing over the camera’s and the album’s buttons', async ({ page }) => {
    const problems = watch(page);
    await start(page, { seed: 1, paused: true });
    await expect(page.locator('#help .keys')).toBeHidden();
    await expect(page.locator('#help .touch')).toBeVisible();
    const boxes = async (ids: string[]) => Promise.all(ids.map(async (id) => (await page.locator(id).boundingBox())!));
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const [help, camera, album] = await boxes(['#help', '#cameraBtn', '#albumBtn']);
    expect(overlap(help, camera), 'the help over the camera’s button').toBe(false);
    expect(overlap(help, album), 'the help over the album’s button').toBe(false);
    expect(overlap(camera, album)).toBe(false);
    expect(help.x + help.width).toBeLessThanOrEqual(375);
    expect(problems).toEqual([]);
  });
});
