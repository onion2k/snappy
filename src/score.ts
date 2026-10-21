/**
 * The grade of a picture, worked out from where things are and never from the pixels, so the same picture is graded
 * the same every time and each part of it is tested on the fixture. Every oddity with some of it in the frame is
 * graded on its own and the best is the picture's grade: each of eight terms is a number from nought to one, and the
 * grade is their product out of a hundred, so a picture fails as badly as its worst part, as a photograph does. With
 * no oddity in frame it is nought.
 *
 * The terms, each said with its sums where it is worked out:
 *  - in frame: the share of the oddity inside the frame;
 *  - seen: the share of points on it a ray from the lens reaches (`sight.ts`);
 *  - size: how much of the frame its silhouette fills, best from a sixth to three quarters;
 *  - placement: how near a third-line crossing or the middle it sits, a third the better for most, the middle for a UFO;
 *  - facing: how far its front is turned to the lens, for those with one; for a UFO, how little from underneath;
 *  - focus: how sharp it is at the focus set, by the thin lens's circle of confusion;
 *  - steady: how little the view's turn smeared it while the shutter was open;
 *  - light: whether the sun is behind the lens or in its face.
 *
 * Nothing here allocates once the grade is made: the page grades at the shutter, the fuzzer every few frames, and the
 * brackets' box is asked for every oddity every frame.
 *
 * Tuned against what a reviewer measured in play (reports/review-photo.md): a centred duck was held to half by the
 * placement, a gnome at a good portrait distance lost a third to a size reckoned from its bounding cylinder, a gnome
 * filling a long lens's frame was failed twice over, and a UFO was the easiest thing to photograph. Now a well made
 * picture, centred or on a third, of any of them can reach three stars, and `test/photo-grades.test.ts` holds a table
 * of shots on the fixture to show it.
 */
import { SEEN_POINTS, seenPoints, type Subjects } from './sight';
import { SUN } from './sun';
import { LENS, ViewFrame, focusDepthOf, type Shot } from './viewfinder';
import { SUBJECTS, type Ground, type SubjectKind } from './world/types';

export const TERMS = ['inFrame', 'seen', 'size', 'placement', 'facing', 'focus', 'steady', 'light'] as const;
export type Term = (typeof TERMS)[number];
const T = { inFrame: 0, seen: 1, size: 2, placement: 3, facing: 4, focus: 5, steady: 6, light: 7 } as const;

/**
 * How each term is judged, said in one place so it can be tuned.
 *
 * - `silhouette`: the oddity's outline as the box is made from it, rings at shares of its height, each as wide as a
 *   share of its radius in `SUBJECTS`, from its model: the bounding cylinder reaches its widest point all the way up
 *   (a gnome's rod, a duck's bill, a saucer's rim), so a box made from it was half as big again as the thing drawn,
 *   the size was judged on that, and the brackets stood well off it (review 6 and 13). A duck is a tub with a head on
 *   it, a gnome a coat narrowing to a hat's tip, and a saucer a rim low down under a dome.
 * - `size`: the share of the frame the oddity's silhouette fills, the larger of its share of the frame's height and
 *   of its width, is best from `least` to `most`; under it the term falls in a straight line to nought at nothing,
 *   and over it to nought at `gone`, where it is cut off all round. A frame filled is a close portrait and not yet a
 *   failure: three quarters, a gnome head to foot with a little room, is as good as a sixth.
 * - `placement`: the distance from the oddity's middle on the screen to the nearest crossing of the third lines, and
 *   to the middle, each in halves of the frame's height (the width scaled to match, so a distance is the same either
 *   way); at nought each is one, falling in a straight line to `floor` at `reach`, and the term is the better of the
 *   two with the middle's times `aside`. A thing in the middle was held to a half, and since auto focus finds the
 *   thing nearest the middle and the mark starts there, a new player centred it and was failed for it (review 2):
 *   the middle is a plain picture and a sound one, a little less than a third, and only a thing jammed toward an
 *   edge or a corner, near neither, is at the floor. A UFO is the other way about: a saucer is a thing to put square
 *   in the frame, and a third is the lesser.
 * - `facing`: from the cosine between its front and the line to the lens, one face on, a half side on, `floor` from
 *   behind: its back is a poor picture of a gnome but a picture of one all the same. A thing with no front, a UFO, is
 *   judged by how steeply the lens looks up at it instead: one up to `level` degrees, falling in a straight line to
 *   `under` at `steep` and over, since from below it is a grey plate and its dome and lights are seen from its side.
 *   This is what makes a UFO a thing to work at: it hovers over a hilltop, and the picture of it is from off the
 *   hill, a long lens drawing it in, not from under it.
 * - `focus`: `sharp` is the circle of confusion on the sensor counted as sharp, in mm: 0.03, the full-frame camera's
 *   usual figure, a pixel and a half of the 800 the frame is tall. Within it the term is one; past it, it falls as
 *   one over one and the square of how many times past it, a half at twice it, a tenth at four times. In focus, for
 *   the brackets, is within twice it.
 * - `steady`: the turn smears the picture by the turn rate times `exposure` (a 125th of a second, the shutter a
 *   hand-held long lens wants), as a share of the frame's height (the field of view in radians); `smear` of the frame
 *   (a hundredth, eight pixels) halves the term, as one over one and the square of the smear in those.
 * - `light`: the cosine between the way to the oddity and the way to the sun; nought or less, the sun behind or
 *   beside, is one, and looking straight into it is `into` less.
 */
export const GRADE = {
  silhouette: {
    duck: { up: [0, 0.45, 1], out: [0.7, 0.8, 0.45] },
    gnome: { up: [0, 0.5, 1], out: [0.62, 0.5, 0.12] },
    ufo: { up: [0, 0.3, 1], out: [0.6, 0.93, 0.38] },
  } as Record<SubjectKind, { up: readonly number[]; out: readonly number[] }>,
  size: { least: 1 / 6, most: 3 / 4, gone: 2.5 },
  placement: { reach: 0.9, floor: 0.6, aside: 0.9, centred: ['ufo'] as readonly SubjectKind[] },
  facing: { floor: 0.1, level: 20, steep: 70, under: 0.4 },
  focus: { sharp: 0.03 },
  steady: { exposure: 1 / 125, smear: 0.01 },
  light: { into: 0.6 },
  /** The totals at and over which the picture earns one, two and three stars. */
  stars: [40, 60, 80] as readonly number[],
} as const;

/** How many rings round its silhouette the box is made of, and how many points round each. */
const RINGS = 3;
const ROUND = 8;
/** Each kind's rings as flat arrays, read in the box's sums without a lookup that makes anything. */
const SIL_UP = {} as Record<SubjectKind, Float64Array>;
const SIL_OUT = {} as Record<SubjectKind, Float64Array>;
for (const k of Object.keys(SUBJECTS) as SubjectKind[]) {
  SIL_UP[k] = Float64Array.from(GRADE.silhouette[k].up);
  SIL_OUT[k] = Float64Array.from(GRADE.silhouette[k].out);
}

/** A hundred millimetres to the unit: the world is in units of 10 cm, and the lens in mm. */
const MM_PER_UNIT = 100;

/** The stars a total earns. */
export function starsOf(total: number): number {
  const s = GRADE.stars;
  return total >= s[2] ? 3 : total >= s[1] ? 2 : total >= s[0] ? 1 : 0;
}

/**
 * The thin lens's circle of confusion, in mm on the sensor, for a thing `distance` units away with a lens of `focal`
 * mm at f-number `aperture` focused at `focus` units: the aperture's width (focal over f-number) times how far the
 * thing is off the focus as a share of its own distance, times the magnification at the focus, focal over the focus
 * less the focal. The depth-of-field pass blurs by the same sum, as a share of the sensor's 24 mm.
 */
export function blurOf(focal: number, aperture: number, focus: number, distance: number): number {
  const s1 = focus * MM_PER_UNIT,
    s2 = distance * MM_PER_UNIT;
  if (!(s2 > 0) || !(s1 > focal)) return Infinity;
  return (((focal / aperture) * Math.abs(s2 - s1)) / s2) * (focal / (s1 - focal));
}

/**
 * The depth-of-field pass's numbers for a lens of `focal` mm at f-number `aperture` focused at `focus` units along
 * the view, into `out` as the band (units) and the strength, for a pass whose largest blur is `reach` of the frame's
 * height in radius. They are `blurOf`'s sum laid out as the pass reads it, so what the grade calls sharp is drawn sharp
 * and what it calls blurred is drawn as blurred as that:
 *
 *  - the pass blurs a point at depth d by strength times |d - D| / d, of `reach`, in radius; the thin lens's circle
 *    is (focal / aperture) times the same share times focal / (D - focal), in mm across, and the sensor 24 mm tall.
 *    So the strength is that circle's factor, halved to a radius, over the sensor's height and over `reach`;
 *  - the band is the depth either side of the focus within which the circle is no more than `GRADE.focus.sharp`.
 *    The pass's band is the same depth either way and the lens's is not (a little more lies sharp behind the focus
 *    than in front of it), so the nearer side's is taken both ways: nothing the grade calls blurred is drawn sharp.
 *
 * The strength is drawn `LENS.look` times the lens's, for the toon frame's sake; the band and the grade are the lens's.
 * A focus no further off than the focal length, which no lens here can be set to, is no blur at all.
 */
export function depthOfField(focal: number, aperture: number, focus: number, reach: number, out: Float64Array): void {
  const s1 = focus * MM_PER_UNIT;
  if (!(s1 > focal) || !(reach > 0)) {
    out[0] = out[1] = 0;
    return;
  }
  const k = (focal / aperture) * (focal / (s1 - focal));
  const share = GRADE.focus.sharp / k;
  out[0] = (2 * focus * share) / (1 + share);
  out[1] = (LENS.look * k) / 2 / LENS.sensor / reach;
}

/**
 * The blur a shot is drawn with, as the viewfinder draws it: the depth-of-field band and strength (`depthOfField`)
 * through the shot's own lens and aperture, at the depth of its focus along the view through the focus mark `mark`
 * (`focusDepthOf`), written into `out` as band, strength and that depth. One sum for the viewfinder's frames and the
 * album's pages, so a page kept is blurred as its picture was taken. Makes nothing.
 */
export function shotBlur(shot: Shot, mark: ArrayLike<number>, reach: number, out: Float64Array): void {
  const depth = focusDepthOf(shot, mark);
  depthOfField(shot.v[2], shot.v[5], depth, reach, out);
  out[2] = depth;
}

/**
 * A picture's grade: the total out of a hundred, rounded to a whole number as the card shows it, the stars, and which
 * oddity it is of (its index among the subjects, or -1 with none in frame), with the eight terms of that oddity, in
 * `TERMS`' order; and what the card needs to say what let it down: the share of the frame it filled, so a poor size
 * is too near or too far, whether it has a front, so a poor facing is its back or its belly, and how it was placed.
 * Kept in arrays, so grading into one again makes nothing.
 */
export class Grade {
  /** total, stars, best, fill, one if the best has a front, and how it was placed (`PLACED`). */
  readonly values = new Float64Array([0, 0, -1, 0, 0, 0]);
  readonly terms = new Float64Array(TERMS.length);
  get total(): number {
    return this.values[0];
  }
  get stars(): number {
    return this.values[1];
  }
  get best(): number {
    return this.values[2];
  }
  /** The share of the frame the oddity's silhouette filled, the larger of its height's and its width's. */
  get fill(): number {
    return this.values[3];
  }
  /** Whether what it is of has a front, so a poor facing is its back to the lens and not its belly. */
  get fronted(): boolean {
    return this.values[4] > 0;
  }
  /** How it was placed: by the place its kind is best in, by the other, or a UFO by either. */
  get placed(): number {
    return this.values[5];
  }
  term(name: Term): number {
    return this.terms[T[name]];
  }
  /** As plain numbers, for the card and the test API. */
  toJSON(): { total: number; stars: number; best: number; terms: Record<Term, number> } {
    const terms = {} as Record<Term, number>;
    TERMS.forEach((t, i) => (terms[t] = this.terms[i]));
    return { total: this.total, stars: this.stars, best: this.best, terms };
  }
}

/** The points round each of the silhouette's rings. */
const COS = Float64Array.from({ length: ROUND }, (_, k) => Math.cos((k * 2 * Math.PI) / ROUND));
const SIN = Float64Array.from({ length: ROUND }, (_, k) => Math.sin((k * 2 * Math.PI) / ROUND));

const FRAME = new ViewFrame();
const POINT = new Float64Array(3);
const MIDDLE = new Float64Array(3);
const BOX = new Float64Array(8);
const TRY = new Float64Array(TERMS.length);
/** The fill `judge` found, and how it placed it, kept beside the terms for the grade. */
const FILL = new Float64Array(1);
const PLACING = new Float64Array(1);

/**
 * How a picture was placed, as the card tells it: on the place its kind is best in or near neither, a third for most
 * and the middle for a UFO; a thing in the middle that is best on a third; or a UFO on a third.
 */
export const PLACED = { best: 0, middle: 1, third: 2 } as const;

/**
 * The oddity's box on the screen, from the frame already set in `FRAME`, into `out`: x0, y0, x1, y1 in screen
 * coordinates (minus one to one is the frame, y up), unclipped, so a thing half out reaches past the edge; the share
 * of it in frame; its distance from the lens to its middle; its blur, in mm on the sensor; and one if that is in
 * focus. The box is round its silhouette (`GRADE.silhouette`), so it hugs what is drawn. Points of it behind the lens
 * are not on the screen at all, so the share is of those in front, times the share of them that are; and along a
 * side of the frame the box reaches past at both ends, the whole of that side is counted in: a gnome cut at its hat
 * and its boots is too close, which the size says, and not out of the frame, which would fail it twice (review 6).
 */
function boxOf(shot: Shot, s: Subjects, i: number, out: Float64Array): void {
  const r = s.radius[i],
    h = s.height[i],
    foot = s.foot[i] + s.lift[i],
    up = SIL_UP[s.kinds[i]],
    wide = SIL_OUT[s.kinds[i]];
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    front = 0;
  for (let k = 0; k < RINGS * ROUND; k++) {
    const ring = (k / ROUND) | 0,
      a = k - ring * ROUND,
      rr = r * wide[ring];
    POINT[0] = s.x[i] + rr * COS[a];
    POINT[1] = s.y[i] + rr * SIN[a];
    POINT[2] = foot + h * up[ring];
    if (!FRAME.project(POINT)) continue;
    front++;
    const x = FRAME.at[0],
      y = FRAME.at[1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  s.middle(i, MIDDLE);
  const e = shot.eye;
  const dx = MIDDLE[0] - e[0],
    dy = MIDDLE[1] - e[1],
    dz = MIDDLE[2] - e[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // `blurOf`'s sum, written out here: a call handed fractions and handing one back boxes each of them, and this is
  // asked for every oddity every frame
  const focal = shot.v[2],
    s1 = shot.v[4] * MM_PER_UNIT,
    s2 = distance * MM_PER_UNIT;
  const blur =
    s2 > 0 && s1 > focal ? (((focal / shot.v[5]) * Math.abs(s2 - s1)) / s2) * (focal / (s1 - focal)) : Infinity;
  out[5] = distance;
  out[6] = blur;
  out[7] = blur <= GRADE.focus.sharp ? 1 : 0;
  if (front === 0) {
    out[0] = out[1] = out[2] = out[3] = out[4] = 0;
    return;
  }
  out[0] = x0;
  out[1] = y0;
  out[2] = x1;
  out[3] = y1;
  const w = x1 - x0,
    tall = y1 - y0;
  const iw = Math.min(x1, 1) - Math.max(x0, -1),
    ih = Math.min(y1, 1) - Math.max(y0, -1);
  // the share in frame across and up, each one where it is cut at both ends
  const across = x0 < -1 && x1 > 1 ? 1 : w > 0 ? iw / w : 1,
    upward = y0 < -1 && y1 > 1 ? 1 : tall > 0 ? ih / tall : 1;
  const inside = iw > 0 && ih > 0 ? across * upward : 0;
  out[4] = (inside * front) / (RINGS * ROUND);
}

/**
 * Where an oddity is on the screen, for the page's brackets, into `out` as `boxOf` lays it out: x0, y0, x1, y1, the
 * share in frame, the distance, the blur in mm and one if in focus. True if any of it is in frame.
 */
export function inView(shot: Shot, s: Subjects, i: number, out: Float64Array): boolean {
  FRAME.of(shot);
  boxOf(shot, s, i, out);
  return out[4] > 0;
}

/** The terms of one oddity into `TRY`, from its box in `BOX`, which is in frame. */
function judge(shot: Shot, s: Subjects, i: number, g: Ground, sun: ArrayLike<number>): void {
  const v = shot.v,
    e = shot.eye;
  TRY[T.inFrame] = BOX[4];
  TRY[T.seen] = seenPoints(g, e, s, i) / SEEN_POINTS;

  // size: the larger of its shares of the frame's height and width, the frame being two across in screen units
  const fill = Math.max(BOX[3] - BOX[1], BOX[2] - BOX[0]) / 2;
  FILL[0] = fill;
  const z = GRADE.size;
  TRY[T.size] =
    fill < z.least ? fill / z.least : fill <= z.most ? 1 : Math.max(0, 1 - (fill - z.most) / (z.gone - z.most));

  // placement: the box's middle against the nearest third-line crossing and against the frame's middle, across
  // scaled by the aspect so a distance is in halves of the frame's height either way; the better of the two, the one
  // the kind does not favour times `aside`
  const cx = (BOX[0] + BOX[2]) / 2,
    cy = (BOX[1] + BOX[3]) / 2;
  const p = GRADE.placement;
  const px = (Math.abs(cx) - 1 / 3) * v[3],
    py = Math.abs(cy) - 1 / 3,
    mx = cx * v[3];
  const third = 1 - (1 - p.floor) * Math.min(1, Math.sqrt(px * px + py * py) / p.reach),
    middle = 1 - (1 - p.floor) * Math.min(1, Math.sqrt(mx * mx + cy * cy) / p.reach);
  if (p.centred.includes(s.kinds[i])) {
    TRY[T.placement] = Math.max(middle, p.aside * third);
    PLACING[0] = p.aside * third > middle ? PLACED.third : PLACED.best;
  } else {
    TRY[T.placement] = Math.max(third, p.aside * middle);
    PLACING[0] = p.aside * middle > third ? PLACED.middle : PLACED.best;
  }

  // facing: its front, along its yaw, against the way to the lens across the ground; looked straight down on, side on.
  // With no front, how steeply the lens looks up at its middle: level to `level` is one, to `under` at `steep`
  const tx = e[0] - s.x[i],
    ty = e[1] - s.y[i];
  const flat = Math.sqrt(tx * tx + ty * ty);
  const f = GRADE.facing;
  if (s.front[i]) {
    const c = flat > 1e-9 ? (Math.cos(s.yaw[i]) * tx + Math.sin(s.yaw[i]) * ty) / flat : 0;
    TRY[T.facing] = f.floor + (1 - f.floor) * (1 + c) * 0.5;
  } else {
    const rise = (Math.atan2(MIDDLE[2] - e[2], flat) * 180) / Math.PI;
    const k = Math.min(1, Math.max(0, (rise - f.level) / (f.steep - f.level)));
    TRY[T.facing] = 1 - (1 - f.under) * k;
  }

  // focus: the circle of confusion against the sharp one
  const over = BOX[6] / GRADE.focus.sharp - 1;
  TRY[T.focus] = over <= 0 ? 1 : 1 / (1 + over * over);

  // steady: the smear across the frame while the shutter is open, against the smear that halves it
  const smear = (v[6] * GRADE.steady.exposure) / (2 * Math.atan(LENS.sensor / 2 / v[2])) / GRADE.steady.smear;
  TRY[T.steady] = 1 / (1 + smear * smear);

  // light: the way to its middle against the way to the sun
  const d = BOX[5] > 1e-9 ? 1 / BOX[5] : 0;
  const into = ((MIDDLE[0] - e[0]) * sun[0] + (MIDDLE[1] - e[1]) * sun[1] + (MIDDLE[2] - e[2]) * sun[2]) * d;
  TRY[T.light] = 1 - GRADE.light.into * (into > 0 ? into : 0);
}

/**
 * Grade a picture: every oddity in frame judged, and the best kept, into `out`. The best is the greatest product; of
 * those graded the same, nought most often, the one most plainly the picture's subject, by its share in frame times
 * its share seen times its size; then the more of it seen; then the more of it in frame times its size; and then the
 * first. So an oddity in frame with a grade of nought is still what the picture is of, and the card can say why, but
 * one hidden is never chosen over one seen, and of things all hidden the one filling the frame is: a gnome filling a
 * long lens's frame was graded as a duck far off behind it (review 4). Only a frame with no oddity in it is of nothing.
 */
export function grade(shot: Shot, s: Subjects, g: Ground, sun: ArrayLike<number> = SUN, out = new Grade()): Grade {
  out.values[0] = 0;
  out.values[1] = 0;
  out.values[2] = -1;
  out.values[3] = 0;
  out.values[4] = 0;
  out.values[5] = 0;
  out.terms.fill(0);
  FRAME.of(shot);
  let bestScore = -1,
    bestPlain = -1,
    bestSeen = -1,
    bestBulk = -1;
  for (let i = 0; i < s.count; i++) {
    boxOf(shot, s, i, BOX);
    if (!(BOX[4] > 0)) continue;
    judge(shot, s, i, g, sun);
    let product = 1;
    for (let k = 0; k < TRY.length; k++) product *= TRY[k];
    const bulk = TRY[T.inFrame] * TRY[T.size],
      seen = TRY[T.seen],
      plain = bulk * seen;
    const better =
      product !== bestScore
        ? product > bestScore
        : plain !== bestPlain
          ? plain > bestPlain
          : seen !== bestSeen
            ? seen > bestSeen
            : bulk > bestBulk;
    if (better) {
      bestScore = product;
      bestPlain = plain;
      bestSeen = seen;
      bestBulk = bulk;
      out.values[2] = i;
      out.values[3] = FILL[0];
      out.values[4] = s.front[i];
      out.values[5] = PLACING[0];
      out.terms.set(TRY);
    }
  }
  if (bestScore > 0) {
    const total = Math.round(bestScore * 100);
    out.values[0] = total;
    out.values[1] = starsOf(total);
  }
  return out;
}

/**
 * The term that cost the picture the most, by name: the least of them, the first in `TERMS`' order of equals; or null
 * for a picture of nothing. Each term is a factor of the grade, so the least is the one that took the most off it.
 */
export function weakest(gr: Grade): Term | null {
  if (gr.best < 0) return null;
  let k = 0;
  for (let t = 1; t < TERMS.length; t++) if (gr.terms[t] < gr.terms[k]) k = t;
  return TERMS[k];
}

/**
 * At and over this, the weakest term is not a fault worth naming, and the critique says the picture is a good one:
 * a picture whose every term is nine tenths or more is two stars at the least.
 */
export const FINE = 0.9;

/** The critique's lines, said in plain words, for the card. */
export const CRITIQUE = {
  nothing: 'Nothing odd in frame: look for the brackets.',
  fine: 'A fine picture: nothing to fault.',
  inFrame: 'Half out of frame: turn to take it all in.',
  hidden: 'Hidden behind something: find a clear line to it.',
  half: 'Partly hidden: find a clearer line to it.',
  far: 'Too far off: zoom in, or go closer.',
  close: 'Too close: zoom out, or back off.',
  placement: 'Awkwardly placed: try a third, or the middle.',
  middle: 'Plain in the middle: try it on a third.',
  square: 'Off the middle: put it square in the frame.',
  facing: 'Facing away: go round to its front.',
  under: 'Seen from underneath: back off to see its side.',
  focus: 'Out of focus: go back to auto (A).',
  steady: 'Blurred by movement: hold still as you shoot.',
  light: 'Into the sun: shoot with the sun behind you.',
} as const;

/**
 * One short line for the card saying what most let the picture down, in plain words: the weakest term, said as what
 * the player did and can do better, or that the picture is a fine one, or that it was of nothing. Never says a thing
 * was not seen when some of it was: the card once said a gnome in plain sight was not seen, where its focus was the
 * fault (review 3).
 */
export function critique(gr: Grade): string {
  const w = weakest(gr);
  if (w === null) return CRITIQUE.nothing;
  if (gr.terms[T[w]] >= FINE) return CRITIQUE.fine;
  if (w === 'seen') return gr.terms[T.seen] > 0 ? CRITIQUE.half : CRITIQUE.hidden;
  if (w === 'size') return gr.fill > GRADE.size.most ? CRITIQUE.close : CRITIQUE.far;
  if (w === 'facing') return gr.fronted ? CRITIQUE.facing : CRITIQUE.under;
  if (w === 'placement')
    return gr.placed === PLACED.middle
      ? CRITIQUE.middle
      : gr.placed === PLACED.third
        ? CRITIQUE.square
        : CRITIQUE.placement;
  return CRITIQUE[w];
}

/** What is wrong with a grade, as lines saying what: a total off nought to a hundred, stars that do not match it, a term off nought to one. */
export function gradeProblems(gr: Grade): string[] {
  const out: string[] = [];
  const total = gr.total;
  if (!(total >= 0 && total <= 100)) out.push(`the grade's total is ${total}, not from 0 to 100`);
  else if (gr.stars !== starsOf(total)) out.push(`the grade's stars are ${gr.stars} for a total of ${total}`);
  TERMS.forEach((t, k) => {
    const v = gr.terms[k];
    if (!(v >= 0 && v <= 1)) out.push(`the grade's ${t} is ${v}, not from 0 to 1`);
  });
  if (!Number.isInteger(gr.best) || gr.best < -1) out.push(`the grade is of ${gr.best}`);
  return out;
}
