/**
 * The mutation gate's judgement, tried on counts handed to it without a
 * Stryker run. A survivor is a mutant the tests let through, and the count
 * of them in each file is held to the baseline exactly, both ways: a gate
 * that let a count rise, or missed one that fell, would look the same as
 * one that holds.
 */
import { describe, expect, it } from 'vitest';
import { judge, survivors, type Report } from '../scripts/mutation-judge';

/** A report of one file, with a mutant in each of the given states. */
function report(files: Record<string, string[]>): Report {
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([file, statuses]) => [file, { mutants: statuses.map((status) => ({ status })) }]),
    ),
  };
}

describe('the mutation gate', () => {
  it('counts a mutant that survived or was never covered as a survivor, and nothing else', () => {
    const counts = survivors(
      report({
        'src/a.ts': [
          'Killed',
          'Survived',
          'NoCoverage',
          'Timeout',
          'RuntimeError',
          'CompileError',
          'Ignored',
          'Survived',
        ],
        'src/b.ts': ['Killed', 'Killed'],
        'src/c.ts': [],
      }),
    );
    expect(counts).toEqual({ 'src/a.ts': 3, 'src/b.ts': 0, 'src/c.ts': 0 });
  });

  it('passes counts that match the baseline', () => {
    expect(judge({ 'src/a.ts': 2, 'src/b.ts': 0 }, { 'src/a.ts': 2, 'src/b.ts': 0 })).toEqual([]);
  });

  it('fails a count that rose, and names the file with the count before and after', () => {
    expect(judge({ 'src/a.ts': 2, 'src/b.ts': 0 }, { 'src/a.ts': 3, 'src/b.ts': 0 })).toEqual(['src/a.ts: 2 -> 3']);
  });

  it('fails a count that fell, since a baseline is held both ways', () => {
    expect(judge({ 'src/a.ts': 2, 'src/b.ts': 1 }, { 'src/a.ts': 2, 'src/b.ts': 0 })).toEqual(['src/b.ts: 1 -> 0']);
  });

  it('notices a file that left the report, and one that joined it', () => {
    expect(judge({ 'src/gone.ts': 2 }, { 'src/new.ts': 1 })).toEqual(['src/gone.ts: 2 -> 0', 'src/new.ts: 0 -> 1']);
    expect(judge({ 'src/gone.ts': 0 }, {}), 'a file that let nothing through is not missed').toEqual([]);
  });

  it('judges only the files it is given, when it is given any', () => {
    const was = { 'src/a.ts': 2, 'src/b.ts': 1 };
    const now = { 'src/a.ts': 3, 'src/b.ts': 0 };
    expect(judge(was, now, ['src/b.ts'])).toEqual(['src/b.ts: 1 -> 0']);
    expect(judge(was, now, ['src/c.ts']), 'one in neither counts as nothing both times').toEqual([]);
  });
});
