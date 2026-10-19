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

/** Play `frames` frames, and check nothing that must hold has broken. */
async function play(page: Page, frames: number, stage: string) {
  const broken = await page.evaluate((n) => {
    window.game!.step(n);
    return window.game!.invariants();
  }, frames);
  expect(broken, `invariants after ${stage}`).toEqual([]);
}

test('600 frames of the arena pass with the music playing and no rule broken', async ({ page }) => {
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
