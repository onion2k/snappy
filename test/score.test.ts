/**
 * The grade on the fixture world, a term at a time: the duck on the pond framed well and badly, half out of the
 * frame, hidden, too small, out of focus, turned away, shot turning and into the sun; nought with nothing in frame;
 * and the same picture graded the same every time.
 */
import { describe, expect, it } from 'vitest';
import {
  CRITIQUE,
  FINE,
  GRADE,
  Grade,
  PLACED,
  TERMS,
  blurOf,
  critique,
  depthOfField,
  grade,
  gradeProblems,
  inView,
  shotBlur,
  starsOf,
  weakest,
} from '../src/score';
import { Subjects } from '../src/sight';
import { SUN } from '../src/sun';
import { FOCUS, LENS, Shot, focusDepthOf, fovOf } from '../src/viewfinder';
import { FIXTURE_DUCK, FIXTURE_GNOME, FIXTURE_WATER, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import type { Placement } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const [duckX, duckY] = fixtureAt(...FIXTURE_DUCK);
const DUCK_MIDDLE = [duckX, duckY, FIXTURE_WATER + 1.2];
const duckOnly = new Subjects(map.placements.filter((p) => p.kind === 'duck'));

const odd = (kind: Placement['kind'], tx: number, ty: number, yaw = 0, z = 0): Placement => {
  const [x, y] = fixtureAt(tx, ty);
  return { kind, x, y, z, yaw, scale: 1, biome: 0, vary: 0.5 };
};

/**
 * A shot from `eye` through a `focal` lens, turned and tilted so `at` is drawn at (nx, ny) on the screen, focused on
 * it, held still.
 */
function shotOf(eye: number[], at: number[], focal = 135, nx = 0, ny = 0): Shot {
  const s = new Shot();
  s.eye.set(eye);
  s.focal = focal;
  s.aspect = 1.6;
  const dx = at[0] - eye[0],
    dy = at[1] - eye[1],
    dz = at[2] - eye[2];
  const t = Math.tan(((fovOf(focal) / 2) * Math.PI) / 180);
  s.yaw = Math.atan2(dy, dx) + Math.atan(nx * t * s.aspect);
  s.pitch = Math.atan2(dz, Math.hypot(dx, dy)) - Math.atan(ny * t);
  s.focus = Math.hypot(dx, dy, dz);
  return s;
}
/** The duck from 40 east of it, three units up, through the long lens. */
const fromEast = (focal = 135, nx = -1 / 3, ny = 1 / 3) => shotOf([duckX + 40, duckY, 3], DUCK_MIDDLE, focal, nx, ny);
const term = (gr: Grade, name: (typeof TERMS)[number]) => gr.term(name);

describe('a picture of the duck framed well', () => {
  const gr = grade(fromEast(), duckOnly, g);

  it('is graded on the duck, with three stars', () => {
    expect(gr.best).toBe(0);
    expect(gr.total).toBeGreaterThanOrEqual(90);
    expect(gr.stars).toBe(3);
  });

  it('has every term near one', () => {
    for (const t of TERMS) expect(term(gr, t), t).toBeGreaterThan(0.9);
  });

  it('is the product of its terms, out of a hundred, rounded', () => {
    const product = TERMS.reduce((p, t) => p * term(gr, t), 1);
    expect(gr.total).toBe(Math.round(product * 100));
  });
});

describe('each term', () => {
  it('in frame: about half for the duck half out of the frame, and one for it wholly in', () => {
    const half = grade(fromEast(135, 1, 0), duckOnly, g);
    expect(term(half, 'inFrame')).toBeGreaterThan(0.35);
    expect(term(half, 'inFrame')).toBeLessThan(0.65);
    expect(term(grade(fromEast(135, 0, 0), duckOnly, g), 'inFrame')).toBe(1);
  });

  it('seen: nought for a gnome behind the cottage, and so the grade is nought, though it is in frame', () => {
    const s = new Subjects([odd('gnome', 28, 8.5)]);
    const [x, y] = fixtureAt(20, 8.5);
    const gr = grade(shotOf([x, y, 5], [s.x[0], s.y[0], 2.5], 50), s, g);
    expect(gr.best).toBe(0);
    expect(term(gr, 'inFrame')).toBe(1);
    expect(term(gr, 'seen')).toBe(0);
    expect(gr.total).toBe(0);
    expect(gr.stars).toBe(0);
  });

  it('size: low for the duck small in a wide frame, and low for it filling the frame', () => {
    const wide = grade(fromEast(24, 0, 0), duckOnly, g);
    expect(term(wide, 'size')).toBeLessThan(0.5);
    const close = grade(shotOf([duckX + 6, duckY, 1], DUCK_MIDDLE, 135), duckOnly, g);
    expect(term(close, 'size')).toBeLessThan(0.5);
    expect(term(grade(fromEast(), duckOnly, g), 'size')).toBe(1);
  });

  it('size: in a straight line from nought to a sixth, one to three quarters, and down to nought at two and a half', () => {
    expect(GRADE.size).toEqual({ least: 1 / 6, most: 3 / 4, gone: 2.5 });
    const box = new Float64Array(8);
    const fill = (shot: Shot) => {
      inView(shot, duckOnly, 0, box);
      return Math.max(box[3] - box[1], box[2] - box[0]) / 2;
    };
    const wide = fromEast(24, 0, 0);
    expect(fill(wide)).toBeLessThan(1 / 6);
    expect(term(grade(wide, duckOnly, g), 'size')).toBeCloseTo(fill(wide) * 6, 12);
    expect(grade(wide, duckOnly, g).fill).toBeCloseTo(fill(wide), 12);
    // twelve off through the long lens it fills the frame and more
    const close = shotOf([duckX + 12, duckY, 1], DUCK_MIDDLE, 135);
    const f = fill(close);
    expect(f).toBeGreaterThan(0.75);
    expect(f).toBeLessThan(2.5);
    expect(term(grade(close, duckOnly, g), 'size')).toBeCloseTo(1 - (f - 0.75) / 1.75, 12);
    // and so close it is nought, the grade with it
    const touching = shotOf([duckX + 3, duckY, 1], DUCK_MIDDLE, 135);
    expect(fill(touching)).toBeGreaterThan(2.5);
    expect(term(grade(touching, duckOnly, g), 'size')).toBe(0);
  });

  it('size: a frame filled is a close portrait, not a failure, and none of it counted out of the frame', () => {
    // the gnome from 24 off through the long lens: cut at its hat and its boots, and more than a frame wide
    const s = new Subjects([odd('gnome', 22, 4, Math.PI / 2)]);
    const at = [s.x[0], s.y[0], 2.5];
    const gr = grade(shotOf([at[0], at[1] + 18, 2.5], at, 135), s, g);
    expect(gr.fill).toBeGreaterThan(1);
    expect(term(gr, 'inFrame')).toBe(1);
    expect(term(gr, 'size')).toBeGreaterThan(0.5);
    expect(gr.total).toBeGreaterThan(40);
  });

  it('size: by its width where that is the more, as a saucer’s is', () => {
    const s = new Subjects([odd('ufo', 16, 26, 0, 60)]);
    const box = new Float64Array(8);
    const [x, y] = fixtureAt(16, 2);
    const shot = shotOf([x, y, 60], [s.x[0], s.y[0], 63.5], 24);
    inView(shot, s, 0, box);
    const w = (box[2] - box[0]) / 2,
      h = (box[3] - box[1]) / 2;
    expect(w).toBeGreaterThan(h);
    expect(w).toBeLessThan(1 / 6);
    expect(term(grade(shot, s, g), 'size')).toBeCloseTo(w * 6, 12);
  });

  it('placement: one on a third, nine tenths in the middle, and the floor toward a corner or an edge', () => {
    expect(GRADE.placement.floor).toBe(0.6);
    expect(GRADE.placement.aside).toBe(0.9);
    const at = (nx: number, ny: number) => term(grade(fromEast(135, nx, ny), duckOnly, g), 'placement');
    expect(at(1 / 3, -1 / 3)).toBeGreaterThan(0.97);
    expect(at(-1 / 3, 1 / 3)).toBeGreaterThan(0.97);
    expect(at(0, 0)).toBeGreaterThan(0.87);
    expect(at(0, 0)).toBeLessThanOrEqual(0.9);
    expect(at(0.95, 0.9)).toBeCloseTo(GRADE.placement.floor, 9);
    expect(at(-0.95, 0)).toBeCloseTo(GRADE.placement.floor, 9);
    // a little off the middle is less than either, but a sound picture still
    const between = at(0.15, 0.1);
    expect(between).toBeLessThan(at(0, 0));
    expect(between).toBeGreaterThan(0.8);
  });

  it('placement: from either, in a straight line, by the distance in halves of the frame’s height', () => {
    const s = new Subjects([odd('gnome', 22, 4, Math.PI / 2)]);
    const at = [s.x[0], s.y[0], 2.5];
    const box = new Float64Array(8);
    const shot = shotOf([at[0], at[1] + 60, 2.5], at, 85, 0.6, -0.1);
    inView(shot, s, 0, box);
    const cx = (box[0] + box[2]) / 2,
      cy = (box[1] + box[3]) / 2;
    const r = GRADE.placement.reach;
    const third = 1 - 0.4 * Math.min(1, Math.hypot((cx - 1 / 3) * 1.6, cy + 1 / 3) / r);
    const middle = 1 - 0.4 * Math.min(1, Math.hypot(cx * 1.6, cy) / r);
    expect(term(grade(shot, s, g), 'placement')).toBeCloseTo(Math.max(third, 0.9 * middle), 12);
  });

  it('placement: a UFO is best in the middle, and a third is the lesser', () => {
    const s = new Subjects([odd('ufo', 16, 26, 0, 60)]);
    const ufo = [s.x[0], s.y[0], 63.5];
    const [x, y] = fixtureAt(16, 2);
    const middle = grade(shotOf([x, y, 10], ufo, 50, 0, 0), s, g);
    const third = grade(shotOf([x, y, 10], ufo, 50, 1 / 3, 1 / 3), s, g);
    expect(term(middle, 'placement')).toBeGreaterThan(0.97);
    expect(term(third, 'placement')).toBeLessThanOrEqual(0.9);
    expect(term(third, 'placement')).toBeGreaterThan(0.85);
  });

  it('facing: one for its front to the lens, low for its back, and between for its side', () => {
    const away = new Subjects([{ ...map.placements[0], yaw: Math.PI }]);
    const side = new Subjects([{ ...map.placements[0], yaw: Math.PI / 2 }]);
    expect(term(grade(fromEast(), duckOnly, g), 'facing')).toBeGreaterThan(0.99);
    expect(term(grade(fromEast(), away, g), 'facing')).toBeLessThan(0.15);
    const f = term(grade(fromEast(), side, g), 'facing');
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.7);
  });

  it('facing: along its yaw, whichever way that is, and side on looked straight down on', () => {
    // a gnome facing north, from the north, from the south, and from overhead
    const s = new Subjects([odd('gnome', 22, 4, Math.PI / 2)]);
    const at = [s.x[0], s.y[0], 2.5];
    expect(term(grade(shotOf([at[0], at[1] + 30, 4], at, 85), s, g), 'facing')).toBeCloseTo(1, 12);
    expect(term(grade(shotOf([at[0], at[1] - 30, 4], at, 85), s, g), 'facing')).toBeCloseTo(GRADE.facing.floor, 12);
    const over = shotOf([at[0], at[1], 40], at, 85);
    expect(term(grade(over, s, g), 'facing')).toBeCloseTo((1 + GRADE.facing.floor) / 2, 12);
  });

  it('facing: the fixture’s gnome, on open grass facing north, whole and face on from the north', () => {
    const s = Subjects.of(map);
    const [x, y] = fixtureAt(...FIXTURE_GNOME);
    expect([s.x[1], s.y[1]]).toEqual([x, y]);
    const gr = grade(shotOf([x, y + 30, 4], [x, y, 2.5], 135, 0, 0), s, g);
    expect(gr.best).toBe(1);
    expect(term(gr, 'seen')).toBe(1);
    expect(term(gr, 'facing')).toBeCloseTo(1, 12);
  });

  it('size: a placement scaled up is that much bigger, as the world places ducks', () => {
    const big = new Subjects([{ ...map.placements[0], scale: 1.6 }]);
    expect(big.radius[0]).toBeCloseTo(1.3 * 1.6, 12);
    expect(big.height[0]).toBeCloseTo(2.4 * 1.6, 12);
    const box = new Float64Array(8),
      small = new Float64Array(8);
    inView(fromEast(135, 0, 0), big, 0, box);
    inView(fromEast(135, 0, 0), duckOnly, 0, small);
    expect(box[3] - box[1]).toBeGreaterThan(1.5 * (small[3] - small[1]));
  });

  it('facing: a UFO, which has no front, by how steeply the lens looks up at it, whichever way it is turned', () => {
    const f = GRADE.facing;
    expect([f.level, f.steep, f.under]).toEqual([20, 70, 0.4]);
    // from 144 south and 10 up, the saucer's middle 53.5 over the eye: twenty degrees up, so one
    const s = new Subjects([odd('ufo', 16, 26, 0, 60)]);
    const turned = new Subjects([odd('ufo', 16, 26, 2, 60)]);
    const ufo = [s.x[0], s.y[0], 63.5];
    const rise = (d: number) => (Math.atan2(53.5, d) * 180) / Math.PI;
    const facing = (d: number, subjects = s) =>
      term(grade(shotOf([ufo[0], ufo[1] - d, 10], ufo, 50), subjects, g), 'facing');
    const level = 53.5 / Math.tan((20 * Math.PI) / 180);
    expect(facing(level + 1)).toBe(1);
    expect(facing(level + 1, turned)).toBe(1);
    // forty-five degrees up, halfway down from one to `under`; and straight under it, `under`
    expect(facing(53.5)).toBeCloseTo(1 - 0.6 * ((rise(53.5) - 20) / 50), 12);
    expect(facing(53.5, turned)).toBeCloseTo(facing(53.5), 12);
    expect(facing(5)).toBeCloseTo(0.4, 12);
    // looked down on, from over it, it is one
    expect(term(grade(shotOf([ufo[0], ufo[1] - 60, 120], ufo, 50), s, g), 'facing')).toBe(1);
  });

  it('focus: one focused on it, low focused well in front of it, and lower the further off', () => {
    const shot = fromEast();
    expect(term(grade(shot, duckOnly, g), 'focus')).toBe(1);
    shot.focus = 30;
    const near = term(grade(shot, duckOnly, g), 'focus');
    shot.focus = 10;
    const nearer = term(grade(shot, duckOnly, g), 'focus');
    expect(near).toBeLessThan(0.3);
    expect(nearer).toBeLessThan(near);
    shot.focus = FOCUS.far;
    expect(term(grade(shot, duckOnly, g), 'focus')).toBeLessThan(0.3);
  });

  it('steady: one held still, low turning fast, and lower through a longer lens at the same rate', () => {
    const shot = fromEast();
    expect(term(grade(shot, duckOnly, g), 'steady')).toBe(1);
    shot.turnRate = 3;
    expect(term(grade(shot, duckOnly, g), 'steady')).toBeLessThan(0.1);
    shot.turnRate = 0.1;
    const long = term(grade(shot, duckOnly, g), 'steady');
    const wide = fromEast(24, 0, 0);
    expect(term(grade(wide, duckOnly, g), 'steady')).toBe(1);
    wide.turnRate = 0.1;
    expect(term(grade(wide, duckOnly, g), 'steady')).toBeGreaterThan(long);
  });

  it('steady: the smear over a 125th of a second, against a hundredth of the frame', () => {
    const shot = fromEast();
    shot.turnRate = 0.2;
    const smear = 0.2 / 125 / (2 * Math.atan(12 / 135)) / 0.01;
    expect(term(grade(shot, duckOnly, g), 'steady')).toBeCloseTo(1 / (1 + smear * smear), 12);
  });

  it('light: less by the share of the way to the sun the way to it is', () => {
    const s = new Subjects([odd('ufo', 22, 26, 0, 40)]);
    const eye = [-30, -20, 5];
    const middle = [s.x[0], s.y[0], 43.5];
    const v = [middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2]];
    const into = (v[0] * SUN[0] + v[1] * SUN[1] + v[2] * SUN[2]) / Math.hypot(v[0], v[1], v[2]);
    expect(into).toBeGreaterThan(0.3);
    expect(term(grade(shotOf(eye, middle, 50), s, g), 'light')).toBeCloseTo(1 - GRADE.light.into * into, 12);
  });

  it('light: one with the sun behind the lens, and low looking into it', () => {
    // a UFO high in the sun's direction from the eye, and one the other way
    const eye = [0, 0, 5];
    const into = new Subjects([
      { ...odd('ufo', 0, 0, 0, 0), x: SUN[0] * 80, y: SUN[1] * 80, z: 5 + SUN[2] * 80 - 3.5 },
    ]);
    const back = new Subjects([{ ...odd('ufo', 0, 0, 0, 0), x: -SUN[0] * 80, y: -SUN[1] * 80, z: 40 }]);
    const a = grade(shotOf(eye, [into.x[0], into.y[0], into.foot[0] + 3.5], 50), into, g);
    const b = grade(shotOf(eye, [back.x[0], back.y[0], 43.5], 50), back, g);
    expect(term(a, 'light')).toBeLessThan(0.5);
    expect(term(b, 'light')).toBe(1);
    // the sun is handed in: the same picture with the sun the other way is lit
    const flipped = [-SUN[0], -SUN[1], -SUN[2]];
    const shot = shotOf(eye, [into.x[0], into.y[0], into.foot[0] + 3.5], 50);
    expect(term(grade(shot, into, g, flipped), 'light')).toBe(1);
  });
});

describe('the grade as a whole', () => {
  it('is nought with no stars and no subject, with nothing in frame', () => {
    const shot = fromEast();
    shot.pitch = 1;
    const gr = grade(shot, Subjects.of(map), g);
    expect(gr.total).toBe(0);
    expect(gr.stars).toBe(0);
    expect(gr.best).toBe(-1);
    for (const t of TERMS) expect(term(gr, t)).toBe(0);
  });

  it('is nought in a world with no oddities', () => {
    const gr = grade(fromEast(), new Subjects([]), g);
    expect(gr.total).toBe(0);
    expect(gr.best).toBe(-1);
  });

  it('is of the best oddity in the frame: the seen one, not the hidden one before it', () => {
    // a gnome behind the cottage, and a gnome in the open to the right of the line
    const s = new Subjects([odd('gnome', 28, 8.5), odd('gnome', 22, 6.5)]);
    const [x, y] = fixtureAt(18, 8.5);
    const gr = grade(shotOf([x, y, 5], [fixtureAt(24, 7.5)[0], fixtureAt(24, 7.5)[1], 2.5], 24), s, g);
    expect(gr.best).toBe(1);
    expect(gr.total).toBeGreaterThan(0);
  });

  it('is the same picture graded the same every time, into a fresh grade or one used before', () => {
    const a = grade(fromEast(85, 0.2, 0.1), Subjects.of(map), g).toJSON();
    const used = grade(fromEast(24, 0, 0), Subjects.of(map), g);
    const b = grade(fromEast(85, 0.2, 0.1), Subjects.of(map), g, SUN, used).toJSON();
    expect(b).toEqual(a);
    expect(Object.keys(a.terms)).toEqual([...TERMS]);
  });

  it('leaves nothing of the last picture in a grade used again', () => {
    const used = grade(fromEast(), duckOnly, g);
    const sky = fromEast();
    sky.pitch = 1;
    grade(sky, duckOnly, g, SUN, used);
    expect(used.toJSON()).toEqual(new Grade().toJSON());
    expect(new Grade().best).toBe(-1);
  });

  it('keeps the first of two oddities graded the same', () => {
    const twice = new Subjects([map.placements[0], map.placements[0]]);
    expect(grade(fromEast(), twice, g).best).toBe(0);
  });

  it('is never of a hidden oddity where one is seen, though both grade nought: the gnome filling the frame', () => {
    // review 4: a gnome so near the long lens that it grades nought, and a duck hidden behind the cottage far
    // beyond it, first in the list. The gnome is the picture, and the card says it was too close
    const duck = odd('duck', 28, 8.5);
    const gnome = odd('gnome', 22, 8.5, 0);
    const s = new Subjects([duck, gnome]);
    const shot = shotOf([gnome.x - 2.5, gnome.y, 2.5], [gnome.x, gnome.y, 2.5], 135);
    const gr = grade(shot, s, g);
    expect(gr.total).toBe(0);
    expect(gr.best).toBe(1);
    expect(term(gr, 'seen')).toBeGreaterThan(0);
    expect(critique(gr)).toBe(CRITIQUE.close);
  });

  it('is of the one most plainly the subject, of two graded nought: in frame, seen and its size', () => {
    // two gnomes in the open, both seen and both graded nought by a focus far off: the bigger in the frame wins,
    // wherever it is in the list
    const near = odd('gnome', 22, 4, Math.PI / 2),
      far = odd('gnome', 22.5, 9, Math.PI / 2);
    const at = [near.x, near.y + 60, 2.5];
    const shot = shotOf(at, [near.x, near.y, 2.5], 50);
    shot.turnRate = 1e6;
    for (const order of [
      [far, near],
      [near, far],
    ]) {
      const s = new Subjects(order);
      const gr = grade(shot, s, g);
      expect(gr.total).toBe(0);
      expect(s.placements[gr.best]).toBe(near);
    }
  });

  it('is of the bigger of two hidden oddities, of nothing seen', () => {
    // two gnomes behind the cottage, the one further off first: the nearer is bigger in frame
    const far = odd('gnome', 29, 8.5),
      near = odd('gnome', 27, 8.5);
    const [x, y] = fixtureAt(18, 8.5);
    for (const order of [
      [far, near],
      [near, far],
    ]) {
      const s = new Subjects(order);
      const gr = grade(shotOf([x, y, 5], [near.x, near.y, 2.5], 50), s, g);
      expect(gr.total).toBe(0);
      expect(term(gr, 'seen')).toBe(0);
      expect(s.placements[gr.best]).toBe(near);
    }
  });

  it('gives stars at 40, 60 and 80', () => {
    expect(GRADE.stars).toEqual([40, 60, 80]);
    expect([0, 39, 40, 59, 60, 79, 80, 100].map(starsOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('the lens’s blur', () => {
  it('is nought at the focus, and the thin lens’s circle of confusion off it, in millimetres', () => {
    expect(blurOf(50, 2.8, 30, 30)).toBe(0);
    // 50 mm at f/2.8 focused at 3 m, a thing at 6 m: (50/2.8) x (3/6) x 50/(3000-50)
    expect(blurOf(50, 2.8, 30, 60)).toBeCloseTo((50 / 2.8) * 0.5 * (50 / 2950), 9);
    expect(blurOf(50, 2.8, 60, 30)).toBeCloseTo((50 / 2.8) * 1 * (50 / 5950), 9);
    expect(LENS.aperture).toBe(2.8);
  });

  it('is past measuring for a focus nearer than the focal length, or a thing at the lens', () => {
    expect(blurOf(50, 2.8, 0.4, 30)).toBe(Infinity);
    expect(blurOf(50, 2.8, 0.5, 30)).toBe(Infinity);
    expect(blurOf(50, 2.8, 30, 0)).toBe(Infinity);
    expect(blurOf(50, 2.8, 0.51, 30)).toBeLessThan(Infinity);
  });

  it('is more through a longer lens, and less stopped down', () => {
    expect(blurOf(135, 2.8, 30, 60)).toBeGreaterThan(blurOf(50, 2.8, 30, 60));
    expect(blurOf(50, 8, 30, 60)).toBeLessThan(blurOf(50, 2.8, 30, 60));
  });
});

describe('the brackets', () => {
  const box = new Float64Array(8);

  it('box the duck round its middle, wholly in frame, in focus', () => {
    const shot = fromEast(135, 0, 0);
    expect(inView(shot, duckOnly, 0, box)).toBe(true);
    expect(box[0]).toBeLessThan(0);
    expect(box[2]).toBeGreaterThan(0);
    expect(box[1]).toBeLessThan(0);
    expect(box[3]).toBeGreaterThan(0);
    expect(box[4]).toBe(1);
    expect(box[5]).toBeCloseTo(shot.focus, 9);
    expect(box[7]).toBe(1);
  });

  it('say when it is out of focus', () => {
    const shot = fromEast(135, 0, 0);
    shot.focus = 20;
    inView(shot, duckOnly, 0, box);
    expect(box[6]).toBeGreaterThan(GRADE.focus.sharp * 2);
    expect(box[7]).toBe(0);
  });

  it('blur the duck by the lens’s own sum, from its distance seen at a slant', () => {
    const shot = shotOf([duckX + 30, duckY + 20, 6], DUCK_MIDDLE, 85);
    shot.focus = 25;
    shot.aperture = 4;
    inView(shot, duckOnly, 0, box);
    const d = Math.hypot(30, 20, 6 - DUCK_MIDDLE[2]);
    expect(box[5]).toBeCloseTo(d, 12);
    expect(box[6]).toBeCloseTo(blurOf(85, 4, 25, d), 12);
    shot.focus = 0.5;
    inView(shot, duckOnly, 0, box);
    expect(box[6]).toBe(Infinity);
    expect(box[7]).toBe(0);
  });

  it('are in focus just within the sharp circle, and not just past it', () => {
    const shot = fromEast(135, 0, 0);
    const d = shot.focus;
    // the focus that blurs it by a share of the sharp circle, found by halving
    const focusFor = (blur: number) => {
      let lo = d,
        hi = d * 1.2;
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2;
        if (blurOf(135, LENS.aperture, mid, d) < blur) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    shot.focus = focusFor(GRADE.focus.sharp * 0.999);
    inView(shot, duckOnly, 0, box);
    expect(box[7]).toBe(1);
    shot.focus = focusFor(GRADE.focus.sharp * 1.001);
    inView(shot, duckOnly, 0, box);
    expect(box[7]).toBe(0);
  });

  it('are not there for the duck in front of the lens but wholly out of the frame', () => {
    expect(inView(fromEast(135, 3, 0), duckOnly, 0, box)).toBe(false);
    expect(box[4]).toBe(0);
    expect(inView(fromEast(135, 0, -3), duckOnly, 0, box)).toBe(false);
    expect(box[4]).toBe(0);
  });

  it('rise with the oddity lifted', () => {
    const s = new Subjects(map.placements.filter((p) => p.kind === 'duck'));
    const shot = fromEast(135, 0, 0);
    inView(shot, s, 0, box);
    const low = box[1];
    s.lift[0] = 1;
    inView(shot, s, 0, box);
    expect(box[1]).toBeGreaterThan(low + 0.1);
  });

  it('are not there for the duck behind the lens', () => {
    const shot = fromEast(135, 0, 0);
    shot.yaw += Math.PI;
    expect(inView(shot, duckOnly, 0, box)).toBe(false);
    expect([...box.subarray(0, 5)]).toEqual([0, 0, 0, 0, 0]);
  });

  it('hug its silhouette, narrower than its bounding cylinder, and narrower toward its top', () => {
    // straight across from the east and level with it: the box is the silhouette's widest ring across, as wide as
    // that share of the radius at the duck's distance
    const shot = shotOf([duckX + 40, duckY, DUCK_MIDDLE[2]], DUCK_MIDDLE, 135);
    inView(shot, duckOnly, 0, box);
    const wide = Math.max(...GRADE.silhouette.duck.out);
    const half = (wide * 1.3) / ((40 - wide * 1.3) * (12 / 135) * 1.6);
    expect(box[2]).toBeCloseTo(half, 2);
    expect(box[0]).toBeCloseTo(-half, 2);
    expect(GRADE.silhouette.gnome.out[2]).toBeLessThan(GRADE.silhouette.gnome.out[0]);
    expect(GRADE.silhouette.ufo.out[1]).toBeGreaterThan(0.9);
    for (const k of ['duck', 'gnome', 'ufo'] as const) {
      expect(GRADE.silhouette[k].up).toHaveLength(3);
      for (const o of GRADE.silhouette[k].out) expect(o).toBeLessThan(1);
    }
  });

  it('reach past the edge for the duck half out, its share in frame about a half', () => {
    inView(fromEast(135, 1, 0), duckOnly, 0, box);
    expect(box[2]).toBeGreaterThan(1);
    expect(box[0]).toBeLessThan(1);
    expect(box[4]).toBeGreaterThan(0.35);
    expect(box[4]).toBeLessThan(0.65);
  });
});

describe('what let the picture down', () => {
  const weak = (
    terms: Partial<Record<(typeof TERMS)[number], number>>,
    fill = 0.4,
    fronted = true,
    placed: number = PLACED.best,
  ) => {
    const gr = new Grade();
    gr.values[2] = 0;
    gr.values[3] = fill;
    gr.values[4] = fronted ? 1 : 0;
    gr.values[5] = placed;
    TERMS.forEach((t, k) => (gr.terms[k] = terms[t] ?? 1));
    return gr;
  };

  it('is the least of the terms, by name, the first of equals; and nothing for a picture of nothing', () => {
    expect(weakest(new Grade())).toBe(null);
    expect(weakest(weak({ focus: 0.2 }))).toBe('focus');
    expect(weakest(weak({ focus: 0.2, light: 0.1 }))).toBe('light');
    expect(weakest(weak({ seen: 0.5, steady: 0.5 }))).toBe('seen');
    expect(weakest(weak({}))).toBe('inFrame');
    for (const t of TERMS) expect(weakest(weak({ [t]: 0.3 }))).toBe(t);
  });

  it('is said in a line in plain words for each term', () => {
    expect(critique(new Grade())).toBe('Nothing odd in frame: look for the brackets.');
    expect(critique(weak({ inFrame: 0.5 }))).toBe('Half out of frame: turn to take it all in.');
    expect(critique(weak({ seen: 0 }))).toBe('Hidden behind something: find a clear line to it.');
    expect(critique(weak({ size: 0.4 }, 0.06))).toBe('Too far off: zoom in, or go closer.');
    expect(critique(weak({ size: 0.4 }, 1.8))).toBe('Too close: zoom out, or back off.');
    expect(critique(weak({ placement: 0.6 }))).toBe('Awkwardly placed: try a third, or the middle.');
    expect(critique(weak({ placement: 0.85 }, 0.4, true, PLACED.middle))).toBe(
      'Plain in the middle: try it on a third.',
    );
    expect(critique(weak({ placement: 0.85 }, 0.4, false, PLACED.third))).toBe(
      'Off the middle: put it square in the frame.',
    );
    expect(critique(weak({ facing: 0.2 }))).toBe('Facing away: go round to its front.');
    expect(critique(weak({ facing: 0.5 }, 0.4, false))).toBe(CRITIQUE.under);
    expect(critique(weak({ focus: 0.1 }))).toBe('Out of focus: go back to auto (A).');
    expect(critique(weak({ steady: 0.1 }))).toBe('Blurred by movement: hold still as you shoot.');
    expect(critique(weak({ light: 0.4 }))).toBe('Into the sun: shoot with the sun behind you.');
  });

  it('never says a thing was hidden when some of it was seen', () => {
    expect(critique(weak({ seen: 0.2 }))).toBe(CRITIQUE.half);
    expect(critique(weak({ seen: 0.2 }))).not.toMatch(/^hidden|not seen/i);
    // and the card's old fault: seen in full, graded nought for its focus, is out of focus
    expect(critique(weak({ focus: 0 }))).toBe('Out of focus: go back to auto (A).');
  });

  it('is a fine picture when even the weakest is nine tenths or more', () => {
    expect(FINE).toBe(0.9);
    expect(critique(weak({ placement: 0.9 }))).toBe(CRITIQUE.fine);
    expect(critique(weak({ placement: 0.89 }))).toBe(CRITIQUE.placement);
    expect(critique(grade(fromEast(), duckOnly, g))).toBe(CRITIQUE.fine);
  });

  it('tells how a real picture was placed: on a third, in the middle, toward a corner, and a UFO on a third', () => {
    const placed = (nx: number, ny: number) => grade(fromEast(135, nx, ny), duckOnly, g).placed;
    expect(placed(1 / 3, 1 / 3)).toBe(PLACED.best);
    expect(placed(0, 0)).toBe(PLACED.middle);
    expect(placed(0.95, 0.9)).toBe(PLACED.best);
    const s = new Subjects([odd('ufo', 16, 26, 0, 60)]);
    const ufo = [s.x[0], s.y[0], 63.5];
    const [x, y] = fixtureAt(16, 2);
    expect(grade(shotOf([x, y, 10], ufo, 50, 1 / 3, 1 / 3), s, g).placed).toBe(PLACED.third);
    expect(grade(shotOf([x, y, 10], ufo, 50, 0, 0), s, g).placed).toBe(PLACED.best);
    expect(new Grade().placed).toBe(PLACED.best);
  });

  it('says so of real pictures: the duck out of focus, too small, half out, hidden and turned away', () => {
    const blurred = fromEast();
    blurred.focus = 10;
    expect(critique(grade(blurred, duckOnly, g))).toBe('Out of focus: go back to auto (A).');
    expect(critique(grade(fromEast(24, 0, 0), duckOnly, g))).toBe('Too far off: zoom in, or go closer.');
    expect(critique(grade(fromEast(135, 1, 0), duckOnly, g))).toBe('Half out of frame: turn to take it all in.');
    const away = new Subjects([{ ...map.placements[0], yaw: Math.PI }]);
    expect(critique(grade(fromEast(), away, g))).toBe('Facing away: go round to its front.');
    const shaken = fromEast();
    shaken.turnRate = 2;
    expect(critique(grade(shaken, duckOnly, g))).toBe('Blurred by movement: hold still as you shoot.');
    const hidden = new Subjects([odd('gnome', 28, 8.5)]);
    const [x, y] = fixtureAt(20, 8.5);
    expect(critique(grade(shotOf([x, y, 5], [hidden.x[0], hidden.y[0], 2.5], 50), hidden, g))).toBe(
      'Hidden behind something: find a clear line to it.',
    );
  });
});

describe('what is wrong with a grade', () => {
  it('is nothing for any grade made', () => {
    expect(gradeProblems(new Grade())).toEqual([]);
    expect(gradeProblems(grade(fromEast(), duckOnly, g))).toEqual([]);
  });

  it('says what, for a total or a term out of range, not a number, or stars that do not match', () => {
    const gr = grade(fromEast(), duckOnly, g);
    gr.values[0] = 120;
    expect(gradeProblems(gr).join()).toMatch(/total/);
    gr.values[0] = NaN;
    expect(gradeProblems(gr).join()).toMatch(/total/);
    gr.values[0] = 50;
    expect(gradeProblems(gr).join()).toMatch(/stars/);
    gr.values[1] = 1;
    expect(gradeProblems(gr)).toEqual([]);
    gr.terms[3] = 1.5;
    expect(gradeProblems(gr).join()).toMatch(/placement/);
  });

  it('holds each range exactly: at its ends a grade is right, a hair past them wrong', () => {
    const gr = new Grade();
    gr.values[0] = 100;
    gr.values[1] = 3;
    expect(gradeProblems(gr)).toEqual([]);
    gr.values[0] = 100.5;
    expect(gradeProblems(gr)).toHaveLength(1);
    gr.values[0] = -0.5;
    gr.values[1] = 0;
    expect(gradeProblems(gr)).toHaveLength(1);
    gr.values[0] = 0;
    gr.terms.fill(1);
    expect(gradeProblems(gr)).toEqual([]);
    gr.terms[7] = 1.0001;
    expect(gradeProblems(gr).join()).toMatch(/light/);
    gr.terms[7] = -0.0001;
    expect(gradeProblems(gr).join()).toMatch(/light/);
    gr.terms[7] = 0;
    for (const [best, wrong] of [
      [-1, false],
      [2, false],
      [-2, true],
      [0.5, true],
    ] as const) {
      gr.values[2] = best;
      expect(gradeProblems(gr).length > 0, `${best}`).toBe(wrong);
    }
  });
});

describe('the depth of field the blur is drawn with', () => {
  const REACH = 0.025;
  const out = new Float64Array(2);

  it('blurs by the thin lens: the circle the pass draws is the grade’s circle, as a share of the frame', () => {
    for (const [focal, focus] of [
      [50, 10],
      [135, 40],
      [24, 30],
    ]) {
      depthOfField(focal, LENS.aperture, focus, REACH, out);
      const strength = out[1];
      // the pass's radius, strength times the share off the focus, against the grade's circle's radius as a share of
      // the sensor's height: the same, short of the band, which takes a hair off near the focus
      for (const d of [focus * 1.5, focus * 3, focus * 0.7]) {
        const pass = Math.min(1, (strength * Math.abs(d - focus)) / d) * REACH;
        const lens = blurOf(focal, LENS.aperture, focus, d) / 2 / LENS.sensor;
        if (pass < REACH) expect(pass / lens, `${focal} mm at ${d}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('keeps sharp what the grade calls sharp: the band reaches to where the circle is the sharp one', () => {
    depthOfField(50, LENS.aperture, 10, REACH, out);
    const band = out[0];
    expect(band).toBeGreaterThan(0);
    expect(blurOf(50, LENS.aperture, 10, 10 - band / 2)).toBeCloseTo(GRADE.focus.sharp, 6);
    expect(blurOf(50, LENS.aperture, 10, 10 + band / 2)).toBeLessThan(GRADE.focus.sharp);
  });

  it('blurs a long lens close to far more than a wide one far off', () => {
    depthOfField(135, LENS.aperture, 20, REACH, out);
    const long = out[1];
    depthOfField(24, LENS.aperture, 200, REACH, out);
    expect(long).toBeGreaterThan(out[1] * 50);
  });

  it('is no blur at all where the lens cannot focus', () => {
    depthOfField(50, LENS.aperture, 0.1, REACH, out);
    expect([...out]).toEqual([0, 0]);
  });

  it('is laid on a shot as the viewfinder lays it: the band and strength at the focus mark’s depth, and the depth', () => {
    // one sum for the viewfinder and the album's pages, so a page kept is blurred as the picture was taken
    const shot = new Shot();
    shot.focal = 85;
    shot.aspect = 1.6;
    shot.focus = 24;
    shot.aperture = LENS.aperture;
    const mark = new Float64Array([0.4, -0.3]);
    const blur = new Float64Array(3);
    shotBlur(shot, mark, REACH, blur);
    const depth = focusDepthOf(shot, mark);
    expect(depth).toBeLessThan(24);
    expect(blur[2]).toBe(depth);
    depthOfField(85, LENS.aperture, depth, REACH, out);
    expect([blur[0], blur[1]]).toEqual([out[0], out[1]]);
    // the shot's own aperture, not the lens's
    shot.aperture = 8;
    shotBlur(shot, mark, REACH, blur);
    depthOfField(85, 8, depth, REACH, out);
    expect([blur[0], blur[1]]).toEqual([out[0], out[1]]);
    // in the middle the depth is the focus
    shotBlur(shot, new Float64Array(2), REACH, blur);
    expect(blur[2]).toBe(24);
  });
});
