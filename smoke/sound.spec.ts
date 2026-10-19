/**
 * The sound as a player gets it, in a real browser with a real AudioContext:
 * a bank is told of and heard, the music follows the game's own time and
 * stops with it, the mute is kept in the save and the `m` key works it, and
 * a bank before the first gesture is silent and breaks nothing. What is
 * heard is the package's and a person's ear; what is held here is that the
 * game asks for it at the right moments, and that a console error from the
 * audio fails the test.
 *
 * The launch args let the context run without a gesture (playwright.config.ts),
 * so the API can drive it; the test of the first gesture holds it back.
 */
import { expect, test, type Page } from '@playwright/test';
import { start, watch } from './game';

/** Let the balls land, then put a ball in the hole and play `frames`, as many times as asked, and come back with the number of voices after each. */
function bankBalls(page: Page, balls: number, frames: number) {
  return page.evaluate(
    ([n, f]) => {
      const g = window.game!;
      g.wake(); // the API drives no key, so it stands in for the first gesture
      const { hole } = g.content();
      const voices: number[] = [];
      g.step(120); // the balls have landed
      g.events();
      for (let i = 0; i < n; i++) {
        g.place(g.bodies()[0].slot, hole.x, hole.y, 1);
        for (let s = 0; s < f; s++) {
          g.step(1);
          voices.push(g.sound().voices);
        }
      }
      return voices;
    },
    [balls, frames],
  );
}

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

test('a bank is told of, and sounds', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 1, paused: true });
  expect(await page.evaluate(() => window.game!.sound().voices), 'silent before anything is played').toBe(0);
  const voices = await bankBalls(page, 1, 40);
  const events = await page.evaluate(() => window.game!.events());
  expect(
    events.filter((e) => e.startsWith('banked')),
    'banked',
  ).toHaveLength(1);
  expect(
    events.filter((e) => e === 'sound bank'),
    'the bank is told to the sound',
  ).toHaveLength(1);
  expect(
    events.filter((e) => e === 'sound drop'),
    'and so is the ball that takes its place',
  ).toHaveLength(1);
  expect(Math.max(...voices), 'voices sounding').toBeGreaterThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('a bank and the ball that replaces it add a voice each to the music', async ({ page }) => {
  const problems = watch(page);
  // the same seed and the same frames twice, one with a ball put in the hole and one with it put out of the way, and
  // the voices counted at once, before the audio clock can end any: what the bank adds is all that differs
  const voicesAfter = async (x: number | null) => {
    await start(page, { seed: 4, paused: true });
    return page.evaluate((into) => {
      const g = window.game!;
      g.wake();
      const { hole, floor } = g.content();
      g.step(30);
      g.place(g.bodies()[0].slot, into === null ? floor.minX + 8 : hole.x, into === null ? floor.minY + 8 : hole.y, 1);
      g.step(40);
      return { voices: g.sound().voices, banked: g.state().banked };
    }, x);
  };
  const without = await voicesAfter(null);
  const banked = await voicesAfter(0);
  expect(without.banked).toBe(0);
  expect(banked.banked).toBe(1);
  expect(banked.voices - without.voices, 'the bank and the drop').toBe(2);
  expect(problems).toEqual([]);
});

test('never more voices than the pool holds, over 300 frames of banking', async ({ page }) => {
  const problems = watch(page);
  await start(page, { seed: 2, paused: true });
  const voices = await bankBalls(page, 10, 30);
  expect(voices).toHaveLength(300);
  expect(Math.max(...voices), 'the most at once').toBeLessThanOrEqual(16);
  expect(Math.max(...voices), 'and some were heard').toBeGreaterThanOrEqual(1);
  const events = await page.evaluate(() => window.game!.events());
  const state = await page.evaluate(() => window.game!.state());
  expect(events.filter((e) => e === 'sound bank')).toHaveLength(state.banked);
  expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
  expect(problems).toEqual([]);
});

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
  await start(page, { save: { bank: 1, banked: 1, muted: true, volume: 0.4 }, paused: true });
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
  await start(page, { save: { bank: 5, banked: 5 } });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: false, volume: 1 });
  expect((await page.evaluate(() => window.game!.state())).bank).toBe(5);
  expect(problems).toEqual([]);
});

test('a save that was kept with the sound set comes back with it', async ({ page }) => {
  const problems = watch(page);
  await start(page, { save: { bank: 1, banked: 1, muted: true, volume: 0.4 } });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: true, volume: 0.4 });
  expect(problems).toEqual([]);
});

test('a save with the sound wrong is played with the defaults and no error', async ({ page }) => {
  const problems = watch(page);
  // a hand-made or damaged save: a string for the mute, a volume past the top
  await start(page, { save: { bank: 2, muted: 'yes', volume: 7 } as never });
  expect(await page.evaluate(() => window.game!.sound())).toMatchObject({ muted: false, volume: 1 });
  expect(problems).toEqual([]);
});

test('a bank before any gesture is told of, silent, and breaks nothing; the first key wakes it', async ({ page }) => {
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
  // banked through the API without waking it: the API's wake stands in for a gesture, and this test holds it back
  const voices = await page.evaluate(() => {
    const g = window.game!;
    const { hole } = g.content();
    const out: number[] = [];
    g.step(120);
    g.events();
    g.place(g.bodies()[0].slot, hole.x, hole.y, 1);
    for (let s = 0; s < 40; s++) {
      g.step(1);
      out.push(g.sound().voices);
    }
    return out;
  });
  const events = await page.evaluate(() => window.game!.events());
  expect(events, 'told of').toContain('sound bank');
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

test('the same seed gives the same sound log twice, and the same balls as before there was sound', async ({ page }) => {
  const problems = watch(page);
  const play = async () => {
    await start(page, { seed: 3, paused: true });
    return page.evaluate(() => {
      const g = window.game!;
      g.step(60);
      const { hole } = g.content();
      g.events();
      for (let i = 0; i < 4; i++) {
        g.place(g.bodies()[i].slot, hole.x, hole.y, 1);
        g.step(40);
      }
      return g.events();
    });
  };
  const first = await play();
  const second = await play();
  expect(first.filter((e) => e.startsWith('sound'))).toEqual([
    'sound bank',
    'sound drop',
    'sound bank',
    'sound drop',
    'sound bank',
    'sound drop',
    'sound bank',
    'sound drop',
  ]);
  expect(second).toEqual(first);
  // the balls it dropped, read off a run of this seed before the game had a sound: the sound's chance is its own
  expect(first.filter((e) => e.startsWith('dropped'))).toEqual([
    'dropped 13.9,20.6',
    'dropped -26.0,-19.1',
    'dropped 16.8,-4.0',
    'dropped 13.1,19.2',
  ]);
  expect(problems).toEqual([]);
});
