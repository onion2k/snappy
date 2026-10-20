/**
 * The album: the best picture of each oddity, kept as its numbers. What is kept and what is not (the first, a better,
 * a worse, an equal, a picture of nothing and one of a hidden oddity), the album at its ceiling, the save's shape and
 * every way an entry in it can be bad, the round trip through the save, and a game that keeps its album over a reload.
 */
import { describe, expect, it } from 'vitest';
import { Album, albumProblems, ALBUM_LENS, ALBUM_ROUND, type AlbumEntry } from '../src/album';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import { Grade, starsOf, TERMS } from '../src/score';
import { FOCUS, LENS, LOOK, Shot } from '../src/viewfinder';
import { ODDITIES } from '../src/world/oddities';
import { newGame } from './helpers';

const NAMES = ODDITIES.map((o) => o.name);

/** A grade of oddity `best` totalling `total`, its terms all `term`. */
function graded(best: number, total: number, term = 0.9): Grade {
  const g = new Grade();
  g.values[0] = total;
  g.values[1] = starsOf(total);
  g.values[2] = best;
  g.terms.fill(term);
  return g;
}

/** A shot somewhere about the world, its numbers as unround as a real one's. */
function shot(k = 1): Shot {
  const s = new Shot();
  s.eye[0] = 123.456789 * k;
  s.eye[1] = 98.7654321;
  s.eye[2] = 7.1234567;
  s.yaw = 1.23456789;
  s.pitch = 0.3456789;
  s.focal = 71.234567;
  s.aspect = 1.6;
  s.focus = 33.333333;
  s.turnRate = 0.2;
  return s;
}

const MARK = Float64Array.from([-0.3333333, 0.2512345]);

/** A good entry for the save, of the first oddity, as `toSave` writes one. */
function entry(over: Partial<Record<keyof AlbumEntry, unknown>> = {}): Record<string, unknown> {
  const terms: Record<string, number> = {};
  for (const t of TERMS) terms[t] = 0.95;
  return {
    name: NAMES[0],
    eye: [120.5, 99.25, 6.5],
    yaw: 1.2,
    pitch: 0.1,
    focal: 50,
    aspect: 1.6,
    focus: 30,
    mark: [0.1, -0.2],
    t: 12.5,
    total: 66,
    stars: 2,
    terms,
    ...over,
  };
}

describe('what the album keeps', () => {
  it('starts empty, a slot for every oddity in the world', () => {
    const a = new Album(NAMES);
    expect(a.capacity).toBe(NAMES.length);
    expect(a.count).toBe(0);
    for (let i = 0; i < NAMES.length; i++) {
      expect(a.has(i)).toBe(false);
      expect(a.nameOf(i)).toBe(NAMES[i]);
    }
    expect(a.toSave()).toEqual([]);
    expect(albumProblems(a)).toEqual([]);
    expect(a.last, 'nothing considered yet').toEqual({ kind: 'none', index: -1, replaced: 0 });
  });

  it('keeps the first picture of an oddity, with its lens, its time and its grade', () => {
    const a = new Album(NAMES);
    const g = graded(3, 64, 0.8);
    g.terms[2] = 0.456;
    expect(a.consider(g, shot(), MARK, 61.23456)).toBe('first');
    expect(a.last.kind).toBe('first');
    expect(a.last.index).toBe(3);
    expect(a.last.replaced).toBe(0);
    expect(a.count).toBe(1);
    expect(a.has(3)).toBe(true);
    expect(a.has(2)).toBe(false);
    expect(a.totalOf(3)).toBe(64);
    expect(a.starsOf(3)).toBe(2);
    expect(a.termOf(3, 0)).toBe(0.8);
    expect(a.termOf(3, 2)).toBe(0.46);
    expect(a.timeOf(3)).toBe(61.235);
    const s = new Shot(),
      m = new Float64Array(2);
    a.shotOf(3, s, m);
    expect([...s.eye]).toEqual([123.457, 98.765, 7.123]);
    expect(s.yaw).toBe(1.23457);
    expect(s.pitch).toBe(0.34568);
    expect(s.focal).toBe(71.235);
    expect(s.aspect).toBe(1.6);
    expect(s.focus).toBe(33.333);
    expect(s.aperture).toBe(LENS.aperture);
    expect(s.turnRate).toBe(0);
    expect([...m]).toEqual([-0.3333, 0.2512]);
  });

  it('keeps a better picture over it, and says what it beat', () => {
    const a = new Album(NAMES);
    a.consider(graded(3, 64), shot(1), MARK, 1);
    expect(a.consider(graded(3, 71), shot(2), MARK, 2)).toBe('better');
    expect(a.last).toEqual({ kind: 'better', index: 3, replaced: 64 });
    expect(a.totalOf(3)).toBe(71);
    expect(a.timeOf(3)).toBe(2);
    const s = new Shot();
    a.shotOf(3, s, new Float64Array(2));
    expect(s.eye[0]).toBe(246.914);
    expect(a.count).toBe(1);
  });

  it('keeps the older for a worse picture or an equal one, and nothing of the newer', () => {
    const a = new Album(NAMES);
    a.consider(graded(3, 64), shot(1), MARK, 1);
    expect(a.consider(graded(3, 63), shot(2), MARK, 2)).toBe('none');
    expect(a.last).toEqual({ kind: 'none', index: 3, replaced: 0 });
    expect(a.consider(graded(3, 64, 0.5), shot(2), MARK, 3)).toBe('none');
    expect(a.totalOf(3)).toBe(64);
    expect(a.timeOf(3)).toBe(1);
    expect(a.termOf(3, 0)).toBe(0.9);
    const s = new Shot();
    a.shotOf(3, s, new Float64Array(2));
    expect(s.eye[0]).toBe(123.457);
  });

  it('keeps nothing of a picture of nothing, or of an oddity graded nought, as one hidden is', () => {
    const a = new Album(NAMES);
    expect(a.consider(graded(-1, 0, 0), shot(), MARK, 1)).toBe('none');
    expect(a.last).toEqual({ kind: 'none', index: -1, replaced: 0 });
    const hidden = graded(5, 0);
    hidden.terms[1] = 0;
    expect(a.consider(hidden, shot(), MARK, 1)).toBe('none');
    expect(a.last.index).toBe(5);
    expect(a.count).toBe(0);
    expect(a.has(5)).toBe(false);
    // nor a total with no oddity to it, which no grade gives but which must not be kept under no oddity
    expect(a.consider(graded(-1, 50), shot(), MARK, 1)).toBe('none');
    expect(a.count).toBe(0);
    // a grade of an oddity the album has no slot for is not kept either: a world and an album out of step
    expect(a.consider(graded(NAMES.length, 50), shot(), MARK, 1)).toBe('none');
    expect(a.count).toBe(0);
  });

  it('judges each of many presses against the last kept', () => {
    const a = new Album(NAMES);
    const said = [40, 40, 52, 30, 52, 53, 1, 99].map((t, k) => a.consider(graded(0, t), shot(), MARK, k));
    expect(said).toEqual(['first', 'none', 'better', 'none', 'none', 'better', 'none', 'better']);
    expect(a.totalOf(0)).toBe(99);
    expect(a.count).toBe(1);
  });

  it('fills to its ceiling, one an oddity, and another picture after it is a better one or nothing', () => {
    const a = new Album(NAMES);
    for (let i = 0; i < NAMES.length; i++) expect(a.consider(graded(i, 50), shot(), MARK, i)).toBe('first');
    expect(a.count).toBe(NAMES.length);
    expect(a.consider(graded(4, 50), shot(), MARK, 99)).toBe('none');
    expect(a.consider(graded(4, 51), shot(), MARK, 99)).toBe('better');
    expect(a.count).toBe(NAMES.length);
    expect(a.toSave()).toHaveLength(NAMES.length);
    expect(albumProblems(a)).toEqual([]);
  });

  it('reads out each kept lens number, the eye, the look, the lens, the focus and the mark, and its time', () => {
    const a = new Album(NAMES);
    a.consider(graded(4, 70), shot(), MARK, 9.5);
    expect(Array.from({ length: ALBUM_LENS }, (_, k) => a.lensOf(4, k))).toEqual([
      123.457, 98.765, 7.123, 1.23457, 0.34568, 71.235, 1.6, 33.333, -0.3333, 0.2512,
    ]);
    expect(a.lensOf(3, 0), 'a slot not pictured is nought').toBe(0);
  });

  it('lists what it has pictured in the world order', () => {
    const a = new Album(NAMES);
    for (const i of [7, 2, 11, 0]) a.consider(graded(i, 50), shot(), MARK, i);
    const out = new Int32Array(a.capacity);
    expect(a.pictured(out)).toBe(4);
    expect([...out.subarray(0, 4)]).toEqual([0, 2, 7, 11]);
    expect(a.toSave().map((e) => e.name)).toEqual([0, 2, 7, 11].map((i) => NAMES[i]));
  });

  it('empties when cleared, every number of every slot back to nought', () => {
    const a = new Album(NAMES);
    a.consider(graded(1, 50), shot(), MARK, 1);
    a.clear();
    expect(a.count).toBe(0);
    expect(a.has(1)).toBe(false);
    expect(a.toSave()).toEqual([]);
    expect([a.totalOf(1), a.starsOf(1), a.timeOf(1), a.termOf(1, 0), a.termOf(1, 7)]).toEqual([0, 0, 0, 0, 0]);
    const s = shot(),
      m = new Float64Array([0.5, 0.5]);
    a.shotOf(1, s, m);
    expect([...s.eye, s.yaw, s.pitch, s.focal, s.aspect, s.focus, ...m]).toEqual(Array(10).fill(0));
  });
});

describe('the album in the save', () => {
  it('writes an entry of plain rounded numbers, some 250 bytes of it', () => {
    const a = new Album(NAMES);
    const g = graded(3, 64, 0.81234);
    a.consider(g, shot(), MARK, 61.23456);
    const [e] = a.toSave();
    expect(e).toEqual({
      name: NAMES[3],
      eye: [123.457, 98.765, 7.123],
      yaw: 1.23457,
      pitch: 0.34568,
      focal: 71.235,
      aspect: 1.6,
      focus: 33.333,
      mark: [-0.3333, 0.2512],
      t: 61.235,
      total: 64,
      stars: 2,
      terms: Object.fromEntries(TERMS.map((t) => [t, 0.81])),
    });
    expect(JSON.stringify(e).length).toBeLessThan(320);
    expect(ALBUM_ROUND.terms).toBe(100);
  });

  it('comes back from its save exactly as it went, and written again the same', () => {
    const a = new Album(NAMES);
    for (const i of [0, 5, 11]) a.consider(graded(i, 40 + i, 0.77777), shot(i + 1), MARK, i * 10.123456);
    const saved = a.toSave();
    const b = new Album(NAMES);
    expect(b.load(JSON.parse(JSON.stringify(saved)))).toBe(3);
    expect(b.toSave()).toEqual(saved);
    expect(b.count).toBe(3);
    for (const i of [0, 5, 11]) {
      const s1 = new Shot(),
        s2 = new Shot(),
        m1 = new Float64Array(2),
        m2 = new Float64Array(2);
      a.shotOf(i, s1, m1);
      b.shotOf(i, s2, m2);
      expect([...s2.eye, ...s2.v, ...m2]).toEqual([...s1.eye, ...s1.v, ...m1]);
      expect(b.totalOf(i)).toBe(a.totalOf(i));
      expect(b.timeOf(i)).toBe(a.timeOf(i));
    }
    expect(albumProblems(b)).toEqual([]);
  });

  it('loads a picture taken at the ends of the look, the lens and the frame, though rounding takes it a hair past', () => {
    const a = new Album(NAMES);
    const s = shot();
    s.pitch = LOOK.up;
    s.focal = LENS.most;
    a.consider(graded(2, 90), s, [1, -1], 0);
    s.pitch = -LOOK.down;
    s.focal = LENS.least;
    a.consider(graded(3, 90), s, [-1, 1], 0);
    expect(a.toSave()[0].pitch).toBeGreaterThan(LOOK.up);
    const b = new Album(NAMES);
    expect(b.load(JSON.parse(JSON.stringify(a.toSave())))).toBe(2);
    expect(b.toSave()).toEqual(a.toSave());
  });

  it('keeps the yaw wrapped to a turn either way of nought, however far the rover has turned', () => {
    const a = new Album(NAMES);
    const s = shot();
    const kept = (yaw: number) => {
      s.yaw = yaw;
      a.clear();
      a.consider(graded(2, 90), s, MARK, 0);
      const out = new Shot();
      a.shotOf(2, out, new Float64Array(2));
      return out.yaw;
    };
    expect(kept(7.5)).toBe(1.21681);
    expect(kept(-7.5)).toBe(-1.21681);
    expect(kept(1.2)).toBe(1.2);
    expect(kept(Math.PI), 'a half turn is kept as itself').toBe(3.14159);
    expect(kept(-Math.PI), 'and its other side as it').toBe(3.14159);
    // a hair past the half turn either way, it comes round to the other side
    expect(kept(3.141596)).toBe(-3.14159);
    expect(kept(-3.141596)).toBe(3.14159);
    expect(kept(2 * Math.PI * 100 + 0.5)).toBe(0.5);
    for (const yaw of [Math.PI - 1e-7, -Math.PI + 1e-7, 1e4, -1e4, 123.456, 0.000004, -0.000004]) {
      const y = kept(yaw);
      expect(y, `${yaw}`).toBeGreaterThan(-Math.PI);
      expect(y, `${yaw}`).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(y)).toBeCloseTo(Math.cos(yaw), 4);
      expect(Math.sin(y)).toBeCloseTo(Math.sin(yaw), 4);
      expect(Object.is(y, -0), 'never minus nought').toBe(false);
    }
  });

  it('loads a yaw saved before it was wrapped, wrapped, and writes it so', () => {
    const a = new Album(NAMES);
    expect(a.load([entry({ yaw: 5.28542 })])).toBe(1);
    const s = new Shot();
    a.shotOf(0, s, new Float64Array(2));
    expect(s.yaw).toBe(-0.99777);
    expect(a.toSave()[0].yaw).toBe(-0.99777);
    expect(a.load([entry({ yaw: -40 })])).toBe(1);
    expect(a.toSave()[0].yaw).toBe(-2.30089);
    // a wrapped yaw loads as itself, so a save loaded and written again is the same
    const b = new Album(NAMES);
    b.load(JSON.parse(JSON.stringify(a.toSave())));
    expect(b.toSave()).toEqual(a.toSave());
  });

  it('keeps a hair under nought as nought, as the save writes it, and not as minus nought', () => {
    const a = new Album(NAMES);
    const s = shot();
    s.eye[0] = -0.0001;
    s.pitch = -0.000001;
    a.consider(graded(2, 90, 0.001), s, [-0.00001, 0.00001], 0);
    const m = new Float64Array(2);
    a.shotOf(2, s, m);
    expect(Object.is(s.eye[0], 0)).toBe(true);
    expect(Object.is(s.pitch, 0)).toBe(true);
    expect(Object.is(m[0], 0)).toBe(true);
    expect(Object.is(a.termOf(2, 0), 0)).toBe(true);
  });

  it('loads what is not a list as an empty album, and replaces what it held', () => {
    for (const raw of [undefined, null, 3, 'album', {}, { 0: entry() }]) {
      const a = new Album(NAMES);
      a.consider(graded(1, 50), shot(), MARK, 1);
      expect(a.load(raw), JSON.stringify(raw)).toBe(0);
      expect(a.count).toBe(0);
    }
  });

  it('loads a good entry', () => {
    const a = new Album(NAMES);
    expect(a.load([entry()])).toBe(1);
    expect(a.has(0)).toBe(true);
    expect(a.totalOf(0)).toBe(66);
    expect(a.toSave()).toEqual([entry()]);
  });

  /** Each way an entry can be bad: left out, with the good one beside it loaded. */
  const BAD: [string, Record<string, unknown>][] = [
    ['not an object', { bad: 'x' }],
    ['nothing at all', { bad: null }],
    ['an unknown oddity', { name: 'the moon' }],
    ['a name not a string', { name: 7 }],
    ['an eye too short', { eye: [1, 2] }],
    ['an eye not a list', { eye: 'here' }],
    ['an eye not finite', { eye: [1, null, 3] }],
    ['an eye at infinity', { eye: [1, 2, Infinity] }],
    ['a yaw not a number', { yaw: '1' }],
    ['a pitch past the look', { pitch: LOOK.up + 0.01 }],
    ['a pitch under the look', { pitch: -LOOK.down - 0.01 }],
    ['a focal past the lens', { focal: LENS.most + 1 }],
    ['a focal under the lens', { focal: LENS.least - 1 }],
    ['an aspect of nought', { aspect: 0 }],
    ['an aspect not finite', { aspect: Infinity }],
    ['a focus too near', { focus: FOCUS.nearest - 0.5 }],
    ['a focus too far', { focus: FOCUS.far + 1 }],
    ['a mark off the frame', { mark: [1.01, 0] }],
    ['a mark off the frame below', { mark: [0, -1.01] }],
    ['a mark too short', { mark: [0] }],
    ['a time before the game', { t: -1 }],
    ['a time not a number', { t: 'noon' }],
    ['a total of nought', { total: 0, stars: 0 }],
    ['a total over a hundred', { total: 101, stars: 3 }],
    ['a total not whole', { total: 66.5 }],
    ['stars not the total', { stars: 3 }],
    ['terms missing', { terms: undefined }],
    ['terms of nothing', { terms: null }],
    ['a term missing', { terms: { inFrame: 1 } }],
    ['a term over one', { terms: { ...(entry().terms as object), seen: 1.2 } }],
    ['a term under nought', { terms: { ...(entry().terms as object), light: -0.1 } }],
    ['a term not a number', { terms: { ...(entry().terms as object), focus: 'sharp' } }],
  ];
  for (const [what, over] of BAD)
    it(`leaves out an entry with ${what}, and loads the rest`, () => {
      const a = new Album(NAMES);
      const bad =
        what === 'not an object'
          ? 'not an entry'
          : what === 'nothing at all'
            ? null
            : entry({ name: NAMES[1], ...over });
      expect(a.load([bad, entry()])).toBe(1);
      expect(a.has(0)).toBe(true);
      expect(a.has(1)).toBe(false);
      expect(a.count).toBe(1);
    });

  it('leaves out a field it is missing, whichever', () => {
    for (const key of Object.keys(entry())) {
      const e = entry({ name: NAMES[1] });
      delete e[key];
      const a = new Album(NAMES);
      expect(a.load([e]), key).toBe(0);
    }
  });

  it('takes the ends of every range', () => {
    const a = new Album(NAMES);
    const ends = entry({
      pitch: LOOK.up,
      focal: LENS.most,
      focus: FOCUS.nearest,
      mark: [-1, 1],
      t: 0,
      total: 100,
      stars: 3,
      terms: Object.fromEntries(TERMS.map((t) => [t, 1])),
    });
    const others = entry({
      name: NAMES[1],
      pitch: -LOOK.down,
      focal: LENS.least,
      focus: FOCUS.far,
      mark: [1, -1],
      total: 1,
      stars: 0,
      terms: Object.fromEntries(TERMS.map((t) => [t, 0])),
    });
    expect(a.load([ends, others])).toBe(2);
  });

  it('keeps the first of two entries for one oddity, and leaves out the second', () => {
    const a = new Album(NAMES);
    expect(a.load([entry({ total: 41, stars: 1 }), entry({ total: 90, stars: 3 })])).toBe(1);
    expect(a.totalOf(0)).toBe(41);
  });

  it('keeps a picture by the name of its oddity, wherever the world now has it', () => {
    const a = new Album([...NAMES].reverse());
    a.load([entry()]);
    expect(a.has(NAMES.length - 1)).toBe(true);
    expect(a.nameOf(NAMES.length - 1)).toBe(NAMES[0]);
  });
});

describe('what is wrong with an album', () => {
  it('says so of a total, stars, a term or a number that is not right, and a count that does not add up', () => {
    const a = new Album(NAMES);
    a.load([entry()]);
    expect(albumProblems(a)).toEqual([]);
    const poke = a as unknown as { totals: Float64Array; stars: Uint8Array; terms: Float64Array; lens: Float64Array };
    poke.totals[0] = 0;
    expect(albumProblems(a).join('\n')).toMatch(/total is 0/);
    poke.totals[0] = 101;
    expect(albumProblems(a).join('\n')).toMatch(/total is 101/);
    poke.totals[0] = 66;
    poke.stars[0] = 3;
    expect(albumProblems(a).join('\n')).toMatch(/stars are 3/);
    poke.stars[0] = 2;
    poke.terms[3] = 1.5;
    expect(albumProblems(a).join('\n')).toMatch(/placement is 1.5/);
    poke.terms[3] = -0.5;
    expect(albumProblems(a).join('\n')).toMatch(/placement is -0.5/);
    poke.terms[3] = 0;
    expect(albumProblems(a), 'a term of nought is a term').toEqual([]);
    poke.terms[3] = 1;
    expect(albumProblems(a), 'and of one').toEqual([]);
    poke.totals[0] = 1;
    poke.stars[0] = 0;
    expect(albumProblems(a), 'a total of one is a total').toEqual([]);
    poke.totals[0] = 100;
    poke.stars[0] = 3;
    expect(albumProblems(a), 'and of a hundred').toEqual([]);
    poke.totals[0] = 66;
    poke.stars[0] = 2;
    poke.lens[4] = NaN;
    expect(albumProblems(a).join('\n')).toMatch(/not a number/);
    poke.lens[4] = 0;
    (a as unknown as { times: Float64Array }).times[0] = Infinity;
    expect(albumProblems(a).join('\n')).toMatch(/not a number/);
    (a as unknown as { times: Float64Array }).times[0] = 1;
    expect(albumProblems(a)).toEqual([]);
    (a as unknown as { kept: number }).kept = 2;
    expect(albumProblems(a).join('\n')).toMatch(/holds 2.*1 pictured/);
  });

  it('reads the album only through what it says of itself, so a renamed field cannot make it throw', () => {
    const a = new Album(NAMES);
    a.load([entry()]);
    // a stand-in with the album's readings and none of its insides: what it says is what is judged
    const said = {
      capacity: a.capacity,
      count: 1,
      has: (i: number) => i === 0,
      nameOf: (i: number) => a.nameOf(i),
      totalOf: () => 66,
      starsOf: () => 2,
      termOf: (_: number, k: number) => (k === 5 ? 1.25 : 0.5),
      lensOf: (_: number, k: number) => (k === 7 ? NaN : 1),
      timeOf: () => 1,
    };
    expect(albumProblems(said)).toEqual([
      `the album's picture of ${NAMES[0]}: its focus is 1.25, not from 0 to 1`,
      `the album's picture of ${NAMES[0]}: its lens or time is not a number`,
    ]);
    expect(albumProblems({ ...said, count: 3 }).join('\n')).toMatch(/holds 3 by its count, 1 pictured/);
  });

  it('is an invariant of the game, and so is the save holding the album as a list', () => {
    const { game } = newGame();
    expect(checkInvariants(game)).toEqual([]);
    const poke = game.album as unknown as { totals: Float64Array; taken: Uint8Array; kept: number };
    poke.totals[0] = 200;
    poke.taken[0] = 1;
    poke.kept = 1;
    expect(checkInvariants(game).join('\n')).toMatch(/total is 200/);
    const { game: other } = newGame();
    (other.progress.save as unknown as { album: unknown }).album = 'pictures';
    expect(checkInvariants(other).join('\n')).toMatch(/the save's album is not a list/);
    other.progress.save.album = Array.from({ length: other.album.capacity + 1 }, () => ({}));
    expect(checkInvariants(other).join('\n')).toMatch(/the save's album holds 13/);
  });
});

describe('a game keeping its album', () => {
  it('loads the album from the save, drops what is bad from the save, and keeps it over a reload', () => {
    const json = JSON.stringify({ muted: false, volume: 1, album: [entry(), entry({ name: 'the moon' })] });
    const store = memoryStore(json);
    const game = new Game(new Progress(store), { random: seeded(1) });
    expect(game.album.count).toBe(1);
    expect(game.album.capacity).toBe(game.oddityNames.length);
    expect(game.progress.save.album).toEqual([entry()]);
    expect(store.json, 'loading alone does not write').toBe(json);
    game.persist();
    const again = new Game(new Progress(memoryStore(store.json)), { random: seeded(2) });
    expect(again.album.toSave()).toEqual(game.album.toSave());
    expect(checkInvariants(again)).toEqual([]);
  });
});
