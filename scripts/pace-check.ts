/**
 * The crossing, timed: see `pace.ts`.
 *
 *   npm run pace                       the figures, run by run
 *   npm run pace:check                 held to scripts/pace-baseline.json
 *   npm run pace:check -- --update     the baseline written again, after a change meant to move it
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CHECK, moved, paceRun, runs } from './pace';

const BASELINE = 'scripts/pace-baseline.json';

function main() {
  const args = process.argv.slice(2);
  const started = performance.now();
  const results = runs().map((r) => paceRun(r.name, r.from, r.to));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const figure = results[0].seconds;
  const stuck = results.filter((r) => !r.finished);
  for (const r of results)
    console.log(`${r.name}: ${r.finished ? `${r.seconds} s` : `did not arrive in ${CHECK.capSeconds} s`}`);
  console.log(`crossing ${figure} s (${seconds} s to run)`);
  for (const r of stuck) console.error(`  ${r.name} did not arrive`);
  if (stuck.length) process.exitCode = 1;
  if (figure < CHECK.least || figure > CHECK.most) {
    console.error(`  the crossing takes ${figure} s, outside the spec's ${CHECK.least} to ${CHECK.most}`);
    process.exitCode = 1;
  }
  if (!args.includes('--check')) return;

  if (args.includes('--update')) {
    if (process.exitCode) {
      console.error('not written: fix these first');
      return;
    }
    writeFileSync(BASELINE, `${JSON.stringify({ seconds: figure }, null, 2)}\n`);
    console.log('pace baseline written');
    return;
  }
  let baseline: { seconds: number };
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { seconds: number };
  } catch {
    console.error('no baseline: run npm run pace:check -- --update first');
    process.exitCode = 1;
    return;
  }
  const out = moved(baseline.seconds, figure);
  console.log(`pace: ${baseline.seconds} -> ${figure} s (${out ? 'MOVED' : 'within tolerance'})`);
  if (out) {
    console.error(
      `\nthe pacing moved beyond tolerance: if that was meant, npm run pace:check -- --update, and say why`,
    );
    process.exitCode = 1;
  }
}

main();
