/**
 * The mutation gate's judgement, apart from the running, so that its unit
 * tests can hand it counts without a Stryker run. A survivor is a mutant
 * the tests let through: one that ran and passed every test, or that no
 * test reached. The count for each file is held to the baseline exactly,
 * both ways, as every count here is: it does not wobble, so a count that
 * fell is as much a change as one that rose, and the baseline is written
 * again by the change that moved it.
 */

/** What Stryker's json reporter writes: each file mutated, with the state every mutant of it ended in. */
export type Report = { files: Record<string, { mutants: { status: string }[] }> };

/** How many mutants of each file the tests let through. A file that let none through is still counted, as 0. */
export function survivors(report: Report): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [file, { mutants }] of Object.entries(report.files))
    counts[file] = mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage').length;
  return counts;
}

/**
 * A line for each file whose count moved, either way: the files named, or
 * every file of the baseline and the report, so that a file deleted is
 * noticed as much as one added. A file in neither has let nothing through.
 */
export function judge(
  was: Record<string, number>,
  now: Record<string, number>,
  files = [...new Set([...Object.keys(was), ...Object.keys(now)])],
): string[] {
  return files.filter((f) => (was[f] ?? 0) !== (now[f] ?? 0)).map((f) => `${f}: ${was[f] ?? 0} -> ${now[f] ?? 0}`);
}
