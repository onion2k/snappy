/**
 * The sound as a player gets it, in a real browser with a real AudioContext:
 * the music follows the game's own time and stops with it, the mute is kept
 * in the save and the `m` key works it, and the music before the first
 * gesture is silent and breaks nothing. What is heard is the package's and a
 * person's ear; what is held here is that the game asks for it at the right
 * moments, and that a console error from the audio fails the test.
 *
 * The launch args let the context run without a gesture (playwright.config.ts),
 * so the API can drive it; the test of the first gesture holds it back.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

/** The browser's own next frames, with the game paused, so that nothing the game does can be mistaken for a clock. */
function frames(page: Page, n: number) {
  return page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left > 0 ? requestAnimationFrame(tick) : resolve());
        requestAnimationFrame(tick);
      }),
    n,
  );
}

test('the music follows the game: it moves with step and stands still when paused', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  expect(await page.evaluate(() => window.game!.sound().beat)).toBe(0);
  const beat = await page.evaluate(() => {
    window.game!.wake();
    window.game!.step(60);
    return window.game!.sound().beat;
  });
  // a second of game time at 90 beats a minute
  expect(beat).toBeCloseTo(1.5, 6);
  await frames(page, 5);
  expect(await page.evaluate(() => window.game!.sound().beat), 'paused, with frames drawn').toBe(beat);
  // let it run by itself for a moment, then stop it again and see it stop
  await page.evaluate(() => window.game!.resume());
  await expect.poll(() => page.evaluate(() => window.game!.sound().beat)).toBeGreaterThan(beat);
  await page.evaluate(() => window.game!.pause());
  const stopped = await page.evaluate(() => window.game!.sound().beat);
  await frames(page, 5);
  expect(await page.evaluate(() => window.game!.sound().beat), 'paused again').toBe(stopped);
  expect(problems).toEqual([]);
});

test('wake stands in for the first gesture, makes the context once, and the saved mute and volume go into it', async ({
  page,
}) => {
  const problems = watch(page);
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    (window as unknown as { made: number }).made = 0;
    window.AudioContext = class extends Real {
      constructor(...args: ConstructorParameters<typeof Real>) {
        super(...args);
        (window as unknown as { made: number }).made++;
      }
    };
  });
  await start(page, { save: { muted: true, volume: 0.4 }, paused: true });
  const made = () => page.evaluate(() => (window as unknown as { made: number }).made);
  expect(await made(), 'no context at boot').toBe(0);
  expect(await page.evaluate(() => window.game!.sound())).toEqual({
    awake: false,
    voices: 0,
    muted: true,
    volume: 0.4,
    beat: 0,
  });
  await page.evaluate(() => window.game!.wake());
  await page.evaluate(() => window.game!.wake());
  await page.keyboard.press('x');
  expect(await made(), 'one context however it is woken').toBe(1);
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ awake: true, muted: true, volume: 0.4 });
  expect(problems).toEqual([]);
});

test('a mute made before any gesture is kept in the save and goes into the context when it is made', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { paused: true });
  await page.evaluate(() => window.game!.mute(true));
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ awake: false, muted: true });
  expect(JSON.parse(await page.evaluate(() => window.game!.save()))).toMatchObject({ muted: true });
  await page.evaluate(() => window.game!.wake());
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ awake: true, muted: true });
  expect(problems).toEqual([]);
});

test('mute through the API is kept in the save', async ({ page }) => {
  const problems = watch(page);
  await start(page, { paused: true });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: false, volume: 1 });
  await page.evaluate(() => window.game!.mute(true));
  expect((await page.evaluate(() => window.game!.sound())).muted).toBe(true);
  expect(JSON.parse(await page.evaluate(() => window.game!.save()))).toMatchObject({ muted: true, volume: 1 });
  await page.evaluate(() => window.game!.mute(false));
  expect((await page.evaluate(() => window.game!.sound())).muted).toBe(false);
  expect(problems).toEqual([]);
});

test('the m key toggles the mute, and a reload keeps it', async ({ page }) => {
  const problems = watch(page);
  await start(page);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.game!.sound().muted)).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.game?.ready ?? false), { timeout: 60_000 }).toBe(true);
  expect((await page.evaluate(() => window.game!.sound())).muted, 'kept across the reload').toBe(true);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.game!.sound().muted)).toBe(false);
  expect(problems).toEqual([]);
});

test('a save with the sound in it is played as saved, and one without it plays with the defaults', async ({ page }) => {
  const problems = watch(page);
  await start(page, { save: {} });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: false, volume: 1 });
  expect(problems).toEqual([]);
});

test('a save that was kept with the sound set comes back with it', async ({ page }) => {
  const problems = watch(page);
  await start(page, { save: { muted: true, volume: 0.4 } });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: true, volume: 0.4 });
  expect(problems).toEqual([]);
});

test('a save with the sound wrong is played with the defaults and no error', async ({ page }) => {
  const problems = watch(page);
  // a hand-made or damaged save: a string for the mute, a volume past the top
  await start(page, { save: { muted: 'yes', volume: 7 } as never });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: false, volume: 1 });
  expect(problems).toEqual([]);
});

test('before any gesture the music is silent and breaks nothing; the first key wakes it', async ({ page }) => {
  const problems = watch(page);
  // the browser's own rule, put back for this page: a context that says it is suspended until resume is called
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    let resumed = false;
    window.AudioContext = class extends Real {
      get state() {
        return resumed ? super.state : 'suspended';
      }
      resume() {
        resumed = true;
        return super.resume();
      }
    };
  });
  await start(page, { seed: 1, paused: true });
  expect(await page.evaluate(() => window.game!.sound().awake), 'no context before a gesture').toBe(false);
  // played through the API without waking it: the API's wake stands in for a gesture, and this test holds it back
  const voices = await page.evaluate(() => {
    const g = window.game!;
    const out: number[] = [];
    for (let s = 0; s < 40; s++) {
      g.step(1);
      out.push(g.sound().voices);
    }
    return out;
  });
  expect(Math.max(...voices), 'silent, and not queued').toBe(0);
  expect(await page.evaluate(() => window.game!.sound().beat), 'no music either').toBe(0);
  expect(await page.evaluate(() => window.game!.sound().awake), 'still no context').toBe(false);
  await page.keyboard.press('x');
  expect(await page.evaluate(() => window.game!.sound().awake), 'made by the key').toBe(true);
  await expect
    .poll(async () => {
      await page.evaluate(() => window.game!.step(10));
      return page.evaluate(() => window.game!.sound().voices);
    })
    .toBeGreaterThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('the same seed gives the same music twice', async ({ page }) => {
  const problems = watch(page);
  const play = async () => {
    await start(page, { seed: 3, paused: true });
    return page.evaluate(() => {
      const g = window.game!;
      g.wake();
      const beats: number[] = [];
      for (let i = 0; i < 20; i++) {
        g.step(15);
        beats.push(g.sound().beat);
      }
      return { beats, events: g.events() };
    });
  };
  const first = await play();
  const second = await play();
  expect(first.beats.at(-1), 'the music moved').toBeGreaterThan(0);
  expect(second).toEqual(first);
  expect(problems).toEqual([]);
});

test('the shutter clicks once the sound is awake, makes nothing before the first gesture, and muted still counts', async ({
  page,
}) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  await page.evaluate(() => window.game!.photo(true));
  // before any gesture: a picture is taken, and no context is made for its click
  await page.evaluate(() => window.game!.shutter());
  expect(await page.evaluate(() => window.game!.sound()), 'no context before a gesture').toMatchObject({
    awake: false,
    voices: 0,
  });
  // awake, a picture is a voice more, at once
  const clicked = await page.evaluate(() => {
    const g = window.game!;
    g.wake();
    const before = g.sound().voices;
    g.shutter();
    return g.sound().voices - before;
  });
  expect(clicked).toBe(1);
  // muted, the click is still made and counted, and not heard
  const muted = await page.evaluate(() => {
    const g = window.game!;
    g.mute(true);
    const before = g.sound().voices;
    g.shutter();
    return g.sound().voices - before;
  });
  expect(muted).toBe(1);
  expect(problems).toEqual([]);
});
