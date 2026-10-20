/**
 * Pictures for a person or a reviewer to look at: each view of the models'
 * preview page (`preview.html`), and the game itself at the world's places
 * (`game-` views), drawn headless on the machine's own GPU and saved to
 * `reports/shots/`, with what a frame of each cost beside it in
 * `reports/shots/frames.json`. Not a gate: nothing is compared, and it runs
 * only through `npm run shots` (which sets `SHOTS`), so the smoke run skips it.
 *
 *   npm run shots                                every view
 *   SHOTS_VIEWS=rover,game-ford npm run shots     only those
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { start } from './game';
import { GAME_VIEWS, placeView } from './views';

/**
 * The preview's views that are shot, in order. Its fixture views of the biomes from above, of the whole world from the
 * top and of the clouds' shade are left out: their world is the showcase's, capsule rivers and square sand, and they
 * misled a reviewer about the game's (review 2, 19). The game's own views below show the real world.
 */
const VIEWS = [
  'rover',
  'rover-back',
  'rover-side',
  'rover-tilt',
  'rover-face',
  'rover-face-34',
  'rover-blink',
  'rover-blink-shut',
  'rover-blink-low',
  'rover-wheels',
  'chase',
  'far',
  'kit',
  'small',
  'built',
  'ruins',
  'meadow',
  'pine',
  'autumn',
  'heath',
  'wetland',
  'village',
  'ruin',
  'water',
  'ford',
  'sky',
  'edge',
  'fixture',
];

const OUT = 'reports/shots';
const chosen = process.env.SHOTS_VIEWS?.split(',').filter(Boolean) ?? [...VIEWS, ...Object.keys(GAME_VIEWS)];

test.describe('the models, pictured', () => {
  test.skip(!process.env.SHOTS, 'run through npm run shots');
  const frames: Record<string, { ms: number; info?: string }> = {};

  test.afterAll(() => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames, null, 2) + '\n');
  });

  for (const view of chosen.filter((v) => v in GAME_VIEWS))
    test(view, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(m.text());
      });
      page.on('pageerror', (e) => problems.push(e.message));
      await start(page, { seed: 1, paused: true });
      const at = await placeView(page, GAME_VIEWS[view]);
      const ms = await page.evaluate(() => window.game!.measureFrame());
      const r = await page.evaluate(() => window.game!.rover());
      frames[view] = {
        ms: Math.round(ms * 1000) / 1000,
        info: `at ${at}: rover at ${r.x.toFixed(0)}, ${r.y.toFixed(0)} on ${r.surface}`,
      };
      mkdirSync(OUT, { recursive: true });
      await page.locator('#stats').evaluate((el: HTMLElement) => (el.hidden = true));
      await page.locator('#view').screenshot({ path: `${OUT}/${view}.png` });
      expect(await page.evaluate(() => window.game!.invariants())).toEqual([]);
      expect(problems).toEqual([]);
    });

  for (const view of chosen.filter((v) => !(v in GAME_VIEWS)))
    test(view, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(m.text());
      });
      page.on('pageerror', (e) => problems.push(e.message));
      await page.goto(`/preview.html?view=${view}`);
      await expect
        .poll(() => page.evaluate(() => (window.preview?.ready ? 'ready' : (window.preview?.error ?? 'starting'))), {
          timeout: 60_000,
        })
        .toBe('ready');
      const ms = await page.evaluate(() => window.preview!.measure());
      frames[view] = { ms: Math.round(ms * 1000) / 1000, info: await page.evaluate(() => window.preview!.info) };
      mkdirSync(OUT, { recursive: true });
      await page.locator('#view').screenshot({ path: `${OUT}/${view.replace(/[&=]/g, '-')}.png` });
      expect(problems).toEqual([]);
    });
});

declare global {
  interface Window {
    preview?: { ready: boolean; measure: () => Promise<number>; error?: string; info?: string };
  }
}
