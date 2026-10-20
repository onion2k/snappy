/**
 * The album: the best picture taken of each oddity, kept as the numbers it was taken with and not as pixels, so the
 * game can draw it again whenever the player looks (a picture is some 250 bytes of save, and twelve of them are all
 * there can be). A slot an oddity, in the world's order, each holding whether it is pictured; the lens (the eye, the
 * yaw and pitch, the focal length, the frame's aspect, the focus and the focus mark); the game time it was taken at,
 * for what moves by it; and its grade, the total, the stars and the eight terms in `TERMS`' order.
 *
 * A picture is kept for its oddity on the shutter if it is graded above nought and the slot is empty or holds a lower
 * total: strictly lower, so of two pictures graded the same the older stays. Everything kept is rounded as the save
 * rounds it, at once, so the album in play and the album loaded from its save are the same to the last bit, and a
 * page redrawn before a reload is the page redrawn after it.
 *
 * Everything is in typed arrays, and judging a picture and keeping it makes nothing: the shutter may be pressed many
 * times a frame. Only writing the save allocates, and the game does that only when a picture is kept.
 *
 * Saved as a list of entries keyed by the oddity's name, so a world that reorders its oddities keeps its pictures, and
 * one that drops an oddity drops its picture when the save is loaded. An entry that is not right in any way is left out
 * and the rest loads: a save is the player's, and one bad picture does not cost them the others.
 */
import { starsOf, TERMS, type Grade } from './score';
import { FOCUS, LENS, LOOK, type Shot } from './viewfinder';

/** What became of a picture: kept as the first of its oddity, kept over a worse one, or not kept. */
export type KeptKind = 'none' | 'first' | 'better';

/**
 * What the last picture considered came to, for the card: what became of it, the oddity it was of (its index, -1 for
 * none), and the total it replaced (nought unless it was better). One, written into again by each picture, so telling
 * of it makes nothing: read it when it is told.
 */
export interface Keeping {
  readonly kind: KeptKind;
  readonly index: number;
  readonly replaced: number;
}

/** A picture as the save holds it: plain numbers, rounded as `ALBUM_ROUND` says. */
export interface AlbumEntry {
  name: string;
  eye: [number, number, number];
  yaw: number;
  pitch: number;
  focal: number;
  aspect: number;
  focus: number;
  mark: [number, number];
  t: number;
  total: number;
  stars: number;
  terms: Record<(typeof TERMS)[number], number>;
}

/**
 * How finely each number is kept, as what it is multiplied by before rounding to a whole number: the eye to a
 * thousandth of a unit (a tenth of a millimetre), the angles to a hundred-thousandth of a radian (a hair across the
 * longest lens's frame, which is three thousand times wider), the lens and focus to a thousandth, the aspect and the
 * mark to a ten-thousandth (a tenth of a pixel), the time to a millisecond, and the terms to two places, as the card
 * shows them. An entry so rounded is some 250 bytes.
 */
export const ALBUM_ROUND = {
  eye: 1e3,
  angle: 1e5,
  focal: 1e3,
  aspect: 1e4,
  focus: 1e3,
  mark: 1e4,
  t: 1e3,
  terms: 100,
} as const;

/** The lens's numbers in a slot: eye x, y, z, yaw, pitch, focal, aspect, focus, mark x, mark y. */
export const ALBUM_LENS = 10;
const LENS_N = ALBUM_LENS;
const E = { yaw: 3, pitch: 4, focal: 5, aspect: 6, focus: 7, markX: 8, markY: 9 } as const;
const TERM_N = TERMS.length;

/** Half a step of the angles' rounding: a pitch held at the look's limit is a hair past it once rounded. */
const ANGLE_SLACK = 0.5 / ALBUM_ROUND.angle;

/**
 * A number rounded as the save keeps it. Nought added, since a hair under nought rounds to minus nought, which the
 * save writes as nought: kept so, the album in play and the album loaded from its save were not the same.
 */
const round = (v: number, by: number) => Math.round(v * by) / by + 0;

const TURN = 2 * Math.PI;

/**
 * A yaw as the album keeps it: wrapped to within a half turn either way of nought, minus a half turn left out and a
 * half turn kept, and rounded as the angles are. The rover's heading runs on as it turns, and kept as it was a save's
 * length grew with play, and two pictures from the one place differed by how far the rover had come round. Rounding
 * never takes a wrapped yaw past a half turn, which is 3.1415927 and rounds to 3.14159 either way; and a yaw already
 * wrapped and rounded comes back as itself, so a save loaded and written again is the same.
 */
function wrapYaw(yaw: number): number {
  let w = yaw - TURN * Math.round(yaw / TURN);
  if (w <= -Math.PI) w += TURN;
  return round(w, ALBUM_ROUND.angle);
}

export class Album {
  /** How many pictures it can hold: one for each oddity. */
  readonly capacity: number;
  /** What the last picture considered came to, written into by each. */
  private readonly keeping = { kind: 'none' as KeptKind, index: -1, replaced: 0 };
  /** One for each oddity pictured. */
  private readonly taken: Uint8Array;
  private readonly lens: Float64Array;
  private readonly times: Float64Array;
  private readonly totals: Float64Array;
  private readonly stars: Uint8Array;
  private readonly terms: Float64Array;
  /** How many are pictured, kept beside the slots so the count is not a walk through them. */
  private kept = 0;

  /** An empty album for the world's oddities, by their names in the world's order. */
  constructor(private readonly names: readonly string[]) {
    const n = names.length;
    this.capacity = n;
    this.taken = new Uint8Array(n);
    this.lens = new Float64Array(n * LENS_N);
    this.times = new Float64Array(n);
    this.totals = new Float64Array(n);
    this.stars = new Uint8Array(n);
    this.terms = new Float64Array(n * TERM_N);
  }

  /** What the last picture considered came to: the one object, written into again by the next. */
  get last(): Keeping {
    return this.keeping;
  }

  /** How many oddities are pictured. */
  get count(): number {
    return this.kept;
  }

  /** Whether oddity `i` is pictured. */
  has(i: number): boolean {
    return this.taken[i] === 1;
  }

  /** Oddity `i`'s name, the save's key for its picture. */
  nameOf(i: number): string {
    return this.names[i];
  }

  /** The kept picture's total, out of a hundred; nought for a slot not pictured. */
  totalOf(i: number): number {
    return this.totals[i];
  }

  /** The kept picture's stars. */
  starsOf(i: number): number {
    return this.stars[i];
  }

  /** The kept picture's term `k`, in `TERMS`' order. */
  termOf(i: number, k: number): number {
    return this.terms[i * TERM_N + k];
  }

  /**
   * The kept picture's lens number `k`, of `ALBUM_LENS`: the eye's x, y and z, the yaw, the pitch, the focal length,
   * the aspect, the focus, and the mark's x and y; nought for a slot not pictured.
   */
  lensOf(i: number, k: number): number {
    return this.lens[i * LENS_N + k];
  }

  /** The game time the kept picture was taken at, for the clouds, the sails, the grass and the UFOs' bob. */
  timeOf(i: number): number {
    return this.times[i];
  }

  /**
   * The kept picture's lens written into `shot` and its focus mark into `mark`, for the page to draw it again as the
   * viewfinder would: the aperture is the lens's own, which is fixed, and the view is still.
   */
  shotOf(i: number, shot: Shot, mark: Float64Array): void {
    const l = this.lens,
      o = i * LENS_N;
    shot.eye[0] = l[o];
    shot.eye[1] = l[o + 1];
    shot.eye[2] = l[o + 2];
    shot.yaw = l[o + E.yaw];
    shot.pitch = l[o + E.pitch];
    shot.focal = l[o + E.focal];
    shot.aspect = l[o + E.aspect];
    shot.focus = l[o + E.focus];
    shot.aperture = LENS.aperture;
    shot.turnRate = 0;
    mark[0] = l[o + E.markX];
    mark[1] = l[o + E.markY];
  }

  /** The oddities pictured, by index in the world's order, into `out`; how many there are. */
  pictured(out: Int32Array | number[]): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.taken[i] === 1) out[n++] = i;
    return n;
  }

  /**
   * A picture taken: kept for the oddity it is of if it is graded above nought and its slot is empty or holds a lower
   * total. Says what became of it, as `last` does too. A grade of nothing, or of an oddity the album has no slot for,
   * is not kept.
   */
  consider(grade: Grade, shot: Shot, mark: ArrayLike<number>, t: number): KeptKind {
    const i = grade.best,
      total = grade.total,
      last = this.keeping;
    last.index = i;
    last.replaced = 0;
    if (!(i >= 0 && i < this.capacity) || !(total > 0) || (this.taken[i] === 1 && !(total > this.totals[i]))) {
      last.kind = 'none';
      return 'none';
    }
    // the time goes in through an array, and the keeping is a call of its own: this much is small enough to be
    // inlined where the shutter is pressed, and a fraction handed on to a call that is not is boxed in the handing
    this.now[0] = t;
    this.keep(i, grade, shot, mark);
    return last.kind;
  }

  /** The time handed to `consider`, on its way to the slot. */
  private readonly now = new Float64Array(1);

  /** A picture kept in slot `i`, over what it held, rounded as the save rounds it. */
  private keep(i: number, grade: Grade, shot: Shot, mark: ArrayLike<number>): void {
    const last = this.keeping;
    if (this.taken[i] === 1) {
      last.kind = 'better';
      last.replaced = this.totals[i];
    } else {
      last.kind = 'first';
      this.taken[i] = 1;
      this.kept++;
    }
    const l = this.lens,
      o = i * LENS_N,
      v = shot.v,
      e = shot.eye,
      r = ALBUM_ROUND;
    l[o] = round(e[0], r.eye);
    l[o + 1] = round(e[1], r.eye);
    l[o + 2] = round(e[2], r.eye);
    l[o + E.yaw] = wrapYaw(v[0]);
    l[o + E.pitch] = round(v[1], r.angle);
    l[o + E.focal] = round(v[2], r.focal);
    l[o + E.aspect] = round(v[3], r.aspect);
    l[o + E.focus] = round(v[4], r.focus);
    l[o + E.markX] = round(mark[0], r.mark);
    l[o + E.markY] = round(mark[1], r.mark);
    this.times[i] = round(this.now[0], r.t);
    this.totals[i] = grade.total;
    this.stars[i] = grade.stars;
    const terms = this.terms,
      gt = grade.terms;
    for (let k = 0; k < TERM_N; k++) terms[i * TERM_N + k] = round(gt[k], r.terms);
  }

  /** Every picture emptied out. */
  clear(): void {
    this.taken.fill(0);
    this.lens.fill(0);
    this.times.fill(0);
    this.totals.fill(0);
    this.stars.fill(0);
    this.terms.fill(0);
    this.kept = 0;
  }

  /** The album as the save holds it, in the world's order. Makes a list: only for when the save is written. */
  toSave(): AlbumEntry[] {
    const out: AlbumEntry[] = [];
    const l = this.lens;
    for (let i = 0; i < this.capacity; i++) {
      if (this.taken[i] !== 1) continue;
      const o = i * LENS_N;
      const terms = {} as AlbumEntry['terms'];
      TERMS.forEach((t, k) => (terms[t] = this.terms[i * TERM_N + k]));
      out.push({
        name: this.names[i],
        eye: [l[o], l[o + 1], l[o + 2]],
        yaw: l[o + E.yaw],
        pitch: l[o + E.pitch],
        focal: l[o + E.focal],
        aspect: l[o + E.aspect],
        focus: l[o + E.focus],
        mark: [l[o + E.markX], l[o + E.markY]],
        t: this.times[i],
        total: this.totals[i],
        stars: this.stars[i],
        terms,
      });
    }
    return out;
  }

  /**
   * The album as a save held it, in place of what it holds: anything not a list is an empty album, and each entry not
   * right in every way (`entryOf`), of an oddity this world does not have, or of one an earlier entry has already
   * pictured, is left out. Of two entries for one oddity the first is kept, as a save the game wrote never has two
   * and there is nothing to say which is the true one. The numbers are taken as they are, already rounded as the
   * album rounds them, but for a yaw from a save written before the album wrapped it, which is wrapped here and so
   * written wrapped the next time the save is. Says how many were loaded.
   */
  load(raw: unknown): number {
    this.clear();
    if (!Array.isArray(raw)) return 0;
    for (const item of raw) {
      const e = entryOf(item);
      if (!e) continue;
      const i = this.names.indexOf(e.name);
      if (i < 0 || this.taken[i] === 1) continue;
      const l = this.lens,
        o = i * LENS_N;
      l[o] = e.eye[0];
      l[o + 1] = e.eye[1];
      l[o + 2] = e.eye[2];
      l[o + E.yaw] = wrapYaw(e.yaw);
      l[o + E.pitch] = e.pitch;
      l[o + E.focal] = e.focal;
      l[o + E.aspect] = e.aspect;
      l[o + E.focus] = e.focus;
      l[o + E.markX] = e.mark[0];
      l[o + E.markY] = e.mark[1];
      this.times[i] = e.t;
      this.totals[i] = e.total;
      this.stars[i] = e.stars;
      TERMS.forEach((t, k) => (this.terms[i * TERM_N + k] = e.terms[t]));
      this.taken[i] = 1;
      this.kept++;
    }
    return this.kept;
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const within = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;
/** A list of `n` finite numbers. */
const numbers = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(finite);

/**
 * A save's entry, if it is right in every way: a name; an eye of three finite numbers; a finite yaw; a pitch within
 * the look's limits (and the rounding's hair past them); a focal length within the lens's; an aspect above nought; a
 * focus within its range; a mark of two numbers on the frame; a time not before the game began; a whole total from one
 * to a hundred, the stars it earns, and every term from nought to one. Otherwise null.
 */
function entryOf(raw: unknown): AlbumEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.name !== 'string') return null;
  if (!numbers(e.eye, 3) || !finite(e.yaw)) return null;
  if (!within(e.pitch, -LOOK.down - ANGLE_SLACK, LOOK.up + ANGLE_SLACK)) return null;
  if (!within(e.focal, LENS.least, LENS.most) || !finite(e.aspect) || !(e.aspect > 0)) return null;
  if (!within(e.focus, FOCUS.nearest, FOCUS.far)) return null;
  if (!numbers(e.mark, 2) || !e.mark.every((m) => m >= -1 && m <= 1)) return null;
  if (!finite(e.t) || e.t < 0) return null;
  if (!within(e.total, 1, 100) || !Number.isInteger(e.total) || e.stars !== starsOf(e.total)) return null;
  if (typeof e.terms !== 'object' || e.terms === null) return null;
  const terms = e.terms as Record<string, unknown>;
  if (!TERMS.every((t) => within(terms[t], 0, 1))) return null;
  return e as unknown as AlbumEntry;
}

/** What the invariant reads of an album: its own readings, and none of its insides. */
export type AlbumReading = Pick<
  Album,
  'capacity' | 'count' | 'has' | 'nameOf' | 'totalOf' | 'starsOf' | 'termOf' | 'lensOf' | 'timeOf'
>;

/**
 * What is wrong with an album, as lines saying what: a count that is not the pictures it holds, or past its capacity;
 * and of each picture, a total off one to a hundred or not whole, stars not its total's, a term off nought to one, or
 * a number that is not one. One an oddity, each of an oddity the world has, it is by its shape: a slot each. Read
 * through what the album says of itself, so a field renamed inside it is a type error here and not a throw.
 */
export function albumProblems(album: AlbumReading): string[] {
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < album.capacity; i++) {
    if (!album.has(i)) continue;
    n++;
    const name = album.nameOf(i);
    const total = album.totalOf(i),
      stars = album.starsOf(i);
    if (!(total >= 1 && total <= 100) || !Number.isInteger(total))
      out.push(`the album's picture of ${name}: its total is ${total}, not from 1 to 100`);
    else if (stars !== starsOf(total))
      out.push(`the album's picture of ${name}: its stars are ${stars} for a total of ${total}`);
    TERMS.forEach((t, k) => {
      const v = album.termOf(i, k);
      if (!(v >= 0 && v <= 1)) out.push(`the album's picture of ${name}: its ${t} is ${v}, not from 0 to 1`);
    });
    let numbered = Number.isFinite(album.timeOf(i));
    for (let k = 0; k < LENS_N; k++) numbered &&= Number.isFinite(album.lensOf(i, k));
    if (!numbered) out.push(`the album's picture of ${name}: its lens or time is not a number`);
  }
  // a slot each, so the pictures can never be more than the oddities: only the count can be out of step with them
  if (album.count !== n) out.push(`the album holds ${album.count} by its count, ${n} pictured, of ${album.capacity}`);
  return out;
}
