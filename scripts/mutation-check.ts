/**
 * The mutants the tests let through, held to what they let through before.
 *
 *   npm run mutate                             stryker over every file, then this, judging every file
 *   npm run mutate:judge -- src/a.ts src/b.ts  this alone, judging the files named from the last run's report
 *   npm run mutate:update                      the baseline written again from the last run's report, for a change
 *                                              meant to move it
 *
 * Stryker's json report is read from reports/mutation/mutation.json and the
 * baseline from mutation-baseline.json, and the count of survivors in each
 * file is compared exactly, both ways, by scripts/mutation-judge.ts. A
 * run over some files keeps the rest from the incremental report, so the
 * report always has every file and the baseline can be written from it.
 * When a run fails, the lines here say which file moved; Stryker's own
 * output, above them, lists every survivor and the tests that ran.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { judge, survivors, type Report } from './mutation-judge';

const REPORT = 'reports/mutation/mutation.json';
const BASELINE = 'mutation-baseline.json';

function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  let report: Report;
  try {
    report = JSON.parse(readFileSync(REPORT, 'utf8')) as Report;
  } catch {
    console.error(`no report at ${REPORT}: run npm run mutate first`);
    process.exitCode = 1;
    return;
  }
  const now = survivors(report);
  const mutants = Object.values(report.files).reduce((n, f) => n + f.mutants.length, 0);
  const through = Object.values(now).reduce((n, c) => n + c, 0);
  console.log(`mutation: ${through} of ${mutants} mutants survived, over ${Object.keys(now).length} files`);

  if (args.includes('--update')) {
    const sorted = Object.fromEntries(
      Object.keys(now)
        .sort()
        .map((f) => [f, now[f]]),
    );
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log('mutation baseline written');
    return;
  }
  let was: Record<string, number>;
  try {
    was = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, number>;
  } catch {
    console.error(`no baseline at ${BASELINE}: run npm run mutate:update first`);
    process.exitCode = 1;
    return;
  }
  const moved = judge(was, now, files.length ? files : undefined);
  const judged = files.length ? files.join(', ') : 'every file';
  if (!moved.length) {
    console.log(`mutation: ${judged} held to the baseline`);
    return;
  }
  for (const line of moved) console.error(`  ${line}`);
  console.error(`\nthe survivors moved: if that was meant, npm run mutate:update, and say why`);
  process.exitCode = 1;
}

main();
