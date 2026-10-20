/**
 * The game played through in a real browser: booted, stopped, and stepped a
 * frame at a time through the test API, so it is the same every run and waits
 * on no clock, while everything that follows, the physics, the scene and the
 * music, is the game's own.
 *
 * A feature that a player can reach gets a stage here, and after every stage
 * the game's invariants are checked.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';
import { aimAt } from './views';

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
  // nothing of it kept: the save is as it was
  const save = JSON.parse(await page.evaluate(() => window.game!.save())) as Record<string, unknown>;
  expect(Object.keys(save).sort()).toEqual(['muted', 'volume']);
  expect(problems).toEqual([]);
});
