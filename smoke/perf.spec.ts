/**
 * What the game costs a player, held to a budget and to what it cost
 * before: how long it takes to boot, what a frame costs to draw at the
 * standard view, and how much is downloaded. The budget is what a good
 * browser game may cost at all; the baseline is what this one cost at the
 * last commit, so a step toward the budget is noticed as much as a step
 * over it.
 *
 *   npm run perf               the figures, held to smoke/perf-baseline.json and the budget
 *   npm run perf:update        the baseline written again, after a change meant to move it
 *
 * The boot and the frame are this machine's, headless on its own GPU, and
 * both wobble from run to run; the tolerances were set by running it several
 * times first, and the frame is the least of many samples. The download is
 * the built bundle, gzipped, and does not wobble at all, so it is held to the
 * byte. How each is judged is in `judging.ts`, with its tests.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { start, watch } from './game';
import { drivenMoved, moved as hasMoved, type Figures } from './judging';
import { GAME_VIEWS, placeView } from './views';

const BASELINE = 'smoke/perf-baseline.json';
/** What the game may cost at all, on this machine, whatever it cost before. */
export const BUDGET = { bootMs: 3000, frameMs: 8, bundleBytes: 400 * 1024 };

/** The built game's download: every script and stylesheet in dist/, gzipped, in bytes. */
function bundleBytes(): number {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'silent'], { stdio: 'ignore' });
  const dir = 'dist/assets';
  let bytes = 0;
  for (const f of readdirSync(dir)) {
    if (!/\.(js|css)$/.test(f)) continue;
    if (!statSync(join(dir, f)).isFile()) continue;
    bytes += gzipSync(readFileSync(join(dir, f))).length;
  }
  return bytes;
}

test('boots, draws and downloads within budget, and as it did before', async ({ page }, info) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  const bundle = bundleBytes();
  await start(page, { seed: 11, paused: true });
  const boot = await page.evaluate(() => window.game!.bootMs);
  // the standard view: the start in the village, from the chase camera, as the look picture has it
  const frame = await page.evaluate(async () => {
    const g = window.game!;
    g.step(180);
    // the chase camera settled behind the rover where it starts, on the east road into the village
    g.step(1);
    // the first measuring on a page just booted: it keeps the GPU drawing for a quarter of a second before it times
    return g.measureFrame();
  });
  const now: Figures = { bootMs: Math.round(boot), frameMs: Math.round(frame * 1000) / 1000, bundleBytes: bundle };
  info.annotations.push({ type: 'perf', description: JSON.stringify(now) });
  console.log(
    `perf: boot ${now.bootMs} ms, frame ${now.frameMs} ms, download ${now.bundleBytes} bytes (${(now.bundleBytes / 1024).toFixed(1)} kB)`,
  );

  if (process.env.PERF_UPDATE) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log('perf baseline written');
  } else {
    let baseline: Partial<Figures> = {};
    try {
      baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Partial<Figures>;
    } catch {
      throw new Error('no baseline: run npm run perf:update first');
    }
    const moved: string[] = [];
    for (const key of ['bootMs', 'frameMs', 'bundleBytes'] as const) {
      const was = baseline[key];
      if (was === undefined) {
        moved.push(`${key} ${now[key]} (not in the baseline)`);
        continue;
      }
      const out = hasMoved(key, was, now[key]);
      console.log(`  ${key}: ${was} -> ${now[key]} (${out ? 'MOVED' : 'within tolerance'})`);
      if (out) moved.push(`${key} ${was} -> ${now[key]}`);
    }
    expect(moved, 'moved from the baseline: if that was meant, npm run perf:update, and say why').toEqual([]);
  }
  expect(now.bootMs, 'boot within budget').toBeLessThanOrEqual(BUDGET.bootMs);
  expect(now.frameMs, 'frame within budget').toBeLessThanOrEqual(BUDGET.frameMs);
  expect(now.bundleBytes, 'download within budget').toBeLessThanOrEqual(BUDGET.bundleBytes);
  expect(problems).toEqual([]);
});

/**
 * The worst frame of a drive across several chunks, as the page's own work (the game's step, the scene's frame and the
 * frame's encoding, not the GPU's drawing of it), paced a frame at a time as the page's loop is: so a hitch where the
 * camera's target crosses into another chunk is seen, and held to the baseline (`drivenWorstMs`, tolerance in
 * `judging.ts`) and to the frame budget (review 1, 20; review 2, 10). Printed with the median, for the report.
 */
test('a driven run across chunks: its worst frame, held to the baseline and the budget', async ({ page }, info) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  const run = await page.evaluate(async () => {
    const g = window.game!;
    const c = g.content();
    const orchard = c.landmarks.find((l) => l.name === 'orchard') ?? c.start;
    const windmill = c.landmarks.find((l) => l.name === 'windmill') ?? c.start;
    // straight runs found open for a chunk and more each, from where each is teleported; the frames just after a
    // teleport are a teleport's and not a drive's, and are left out
    const legs: [{ x: number; y: number }, number][] = [
      [c.start, 0],
      [orchard, Math.PI / 2],
      [orchard, 0],
      [windmill, Math.PI],
    ];
    const SIDE = 32 * 6;
    const chunk = () => {
      const t = g.camera().target;
      return Math.floor((t[0] - c.bounds.minX) / SIDE) * 100 + Math.floor((t[1] - c.bounds.minY) / SIDE);
    };
    const times: number[] = [],
      crossings: number[] = [];
    for (const [at, yaw] of legs) {
      g.teleport(at.x, at.y, yaw);
      // two seconds' frames stood still, as a player who has just arrived would, for the ground round them to be made
      for (let f = 0; f < 120; f++) {
        await new Promise((done) => requestAnimationFrame(() => done(0)));
        g.step(1);
      }
      g.drive(1, 0);
      let was = chunk();
      for (let f = 0; f < 600; f++) {
        // a frame at a time, as the page's own loop paces them: stepped back to back, the GPU fell behind and the
        // next frame waited on it, which was the test's doing and not the game's
        await new Promise((done) => requestAnimationFrame(() => done(0)));
        const t = performance.now();
        g.step(1);
        const ms = performance.now() - t;
        times.push(ms);
        const now = chunk();
        if (now !== was) crossings.push(ms);
        was = now;
      }
      g.release();
    }
    const sorted = [...times].sort((a, b) => a - b);
    return {
      worst: sorted[sorted.length - 1],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      median: sorted[Math.floor(sorted.length / 2)],
      frames: times.length,
      over8: times.filter((t) => t > 8).length,
      crossings: crossings.map((t) => Math.round(t * 10) / 10),
    };
  });
  info.annotations.push({ type: 'driven', description: JSON.stringify(run) });
  console.log(
    `driven run: worst ${run.worst.toFixed(1)} ms, 99th ${run.p99.toFixed(1)} ms, median ${run.median.toFixed(2)} ms ` +
      `over ${run.frames} frames, ${run.over8} over 8 ms; the frames that crossed a chunk: ${run.crossings.join(', ')} ms`,
  );
  // the worst frame held to the baseline's, both ways, and written into it with the rest when it is written again
  const worst = Math.round(run.worst * 10) / 10;
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Partial<Figures> & { drivenWorstMs?: number };
  if (process.env.PERF_UPDATE) {
    writeFileSync(BASELINE, `${JSON.stringify({ ...baseline, drivenWorstMs: worst }, null, 2)}\n`);
    console.log('driven run written into the perf baseline');
  } else if (baseline.drivenWorstMs === undefined) {
    console.log('driven run: not in the baseline yet; npm run perf:update writes it');
  } else {
    console.log(`  drivenWorstMs: ${baseline.drivenWorstMs} -> ${worst}`);
    expect(drivenMoved(baseline.drivenWorstMs, worst), 'the driven run’s worst frame moved from the baseline').toBe(
      false,
    );
  }
  expect(worst, 'the driven run’s worst frame within the frame budget').toBeLessThanOrEqual(BUDGET.frameMs);
  expect(problems).toEqual([]);
});

/**
 * A frame in the viewfinder, with the depth of field laid on it: the duck on the mill pond through a short telephoto,
 * its far shore blurred, as the look's picture of it has it. Held to the frame budget only, and not yet to a baseline:
 * printed beside the chase camera's frame from the same place, so the blur's cost is read off the two.
 */
test('a frame in the viewfinder, blurred, within the budget', async ({ page }, info) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await start(page, { seed: 11, paused: true });
  await placeView(page, GAME_VIEWS['game-photo-duck']);
  const viewfinder = await page.evaluate(() => window.game!.measureFrame());
  await page.evaluate(() => window.game!.photo(false));
  const chase = await page.evaluate(() => window.game!.measureFrame(0.1));
  const figures = { viewfinderMs: Math.round(viewfinder * 1000) / 1000, chaseMs: Math.round(chase * 1000) / 1000 };
  info.annotations.push({ type: 'viewfinder', description: JSON.stringify(figures) });
  console.log(`viewfinder: frame ${figures.viewfinderMs} ms blurred; the chase camera there ${figures.chaseMs} ms`);
  expect(figures.viewfinderMs, 'the viewfinder’s frame within budget').toBeLessThanOrEqual(BUDGET.frameMs);
  expect(problems).toEqual([]);
});
