/**
 * The grade's tuning, as a table of representative pictures on the fixture: what a player takes, well and badly, of
 * each kind of oddity, with the stars each earns and the line the card says. It holds what the review asked of the
 * tuning (reports/review-photo.md): a well made picture of any kind, centred or on a third, can reach three stars; a
 * gnome at a good portrait distance grades as a duck does; a frame filled is a close portrait and not a failure; and
 * a UFO is not the easiest, since from under it it is a grey plate and it is worth a picture only from off its hill.
 */
import { describe, expect, it } from 'vitest';
import { CRITIQUE, critique, grade, type Grade } from '../src/score';
import { Subjects } from '../src/sight';
import { SUN } from '../src/sun';
import { Shot, fovOf } from '../src/viewfinder';
import { FIXTURE_DUCK, FIXTURE_GNOME, FIXTURE_WATER, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import type { Placement } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const [duckX, duckY] = fixtureAt(...FIXTURE_DUCK);
const [gnomeX, gnomeY] = fixtureAt(...FIXTURE_GNOME);
const DUCK = [duckX, duckY, FIXTURE_WATER + 1.2];
const GNOME = [gnomeX, gnomeY, 2.5];
const fixture = Subjects.of(map);

/**
 * A UFO hovering 25 over the pond, and the fixture's own oddities; and where it is pictured from, on the open grass
 * north of the road seventy off, the sun at the lens's back.
 */
const SUN_WAY = Math.atan2(SUN[1], SUN[0]);
const OFF_HILL = [fixtureAt(15.5, 18)[0], fixtureAt(15.5, 18)[1], 4.8];
const ufoAt: Placement = {
  kind: 'ufo',
  x: OFF_HILL[0] - Math.cos(SUN_WAY) * 70,
  y: OFF_HILL[1] - Math.sin(SUN_WAY) * 70,
  z: 25,
  yaw: 0,
  scale: 1,
  biome: 0,
  vary: 0.5,
};
const withUfo = new Subjects([...map.placements, ufoAt]);
const UFO = [ufoAt.x, ufoAt.y, 25 + 3.5];

/** A shot from `eye` through a `focal` lens, turned so `at` is drawn at (nx, ny), focused on it, held still. */
function shotOf(eye: number[], at: number[], focal: number, nx = 0, ny = 0): Shot {
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

/** The rover's eye is about five units up: the duck from the east and the gnome from the north, face on. */
const duckFrom = (d: number, focal: number, nx = 0, ny = 0) => shotOf([duckX + d, duckY, 4], DUCK, focal, nx, ny);
const gnomeFrom = (d: number, focal: number, nx = 0, ny = 0) => shotOf([gnomeX, gnomeY + d, 4.8], GNOME, focal, nx, ny);

interface Row {
  label: string;
  shot: () => Shot;
  subjects?: Subjects;
  /** The stars it earns, at least and at most. */
  stars: [number, number];
  /** What the card says of it. */
  says: string;
}

const ROWS: Row[] = [
  // well made: three stars, centred or on a third, whatever it is of
  { label: 'duck, 60 mm, centred', shot: () => duckFrom(19, 60), stars: [3, 3], says: CRITIQUE.middle },
  { label: 'duck, 60 mm, on a third', shot: () => duckFrom(19, 60, 1 / 3, 1 / 3), stars: [3, 3], says: CRITIQUE.fine },
  {
    label: 'duck, 135 mm far off, on a third',
    shot: () => duckFrom(50, 135, -1 / 3, 1 / 3),
    stars: [3, 3],
    says: CRITIQUE.fine,
  },
  { label: 'gnome, 60 mm portrait, centred', shot: () => gnomeFrom(22, 60), stars: [3, 3], says: CRITIQUE.middle },
  {
    label: 'gnome, 60 mm portrait, on a third',
    shot: () => gnomeFrom(22, 60, -1 / 3, -1 / 3),
    stars: [3, 3],
    says: CRITIQUE.fine,
  },
  {
    label: 'UFO, 50 mm from off its hill, centred',
    shot: () => shotOf(OFF_HILL, UFO, 50),
    subjects: withUfo,
    stars: [3, 3],
    says: CRITIQUE.fine,
  },
  {
    label: 'UFO, 50 mm from off its hill, on a third',
    shot: () => shotOf(OFF_HILL, UFO, 50, 1 / 3, 1 / 3),
    subjects: withUfo,
    stars: [3, 3],
    says: CRITIQUE.square,
  },
  // a close portrait, filling the frame: a lesser picture, not a failure
  { label: 'gnome, 135 mm, filling the frame', shot: () => gnomeFrom(22, 135), stars: [1, 2], says: CRITIQUE.close },
  { label: 'duck, 135 mm, filling the frame', shot: () => duckFrom(10, 135), stars: [1, 2], says: CRITIQUE.close },
  // made badly: each fault says itself
  { label: 'duck, 24 mm far off', shot: () => duckFrom(60, 24), stars: [0, 1], says: CRITIQUE.far },
  { label: 'duck, half out of frame', shot: () => duckFrom(30, 85, 1, 0), stars: [0, 1], says: CRITIQUE.inFrame },
  {
    label: 'duck, focused well in front of it',
    shot: () => {
      const s = duckFrom(30, 85);
      s.focus = 12;
      return s;
    },
    stars: [0, 1],
    says: CRITIQUE.focus,
  },
  {
    label: 'duck, taken turning',
    shot: () => {
      const s = duckFrom(30, 85, 1 / 3, 1 / 3);
      s.turnRate = 0.6;
      return s;
    },
    stars: [0, 1],
    says: CRITIQUE.steady,
  },
  {
    label: 'gnome, from behind',
    shot: () => shotOf([gnomeX, gnomeY - 22, 4.8], GNOME, 60, 1 / 3, 1 / 3),
    stars: [0, 0],
    says: CRITIQUE.facing,
  },
  {
    label: 'gnome, into the sun',
    shot: () => {
      const eye = [gnomeX - Math.cos(SUN_WAY) * 22, gnomeY - Math.sin(SUN_WAY) * 22, 4.8];
      return shotOf(eye, GNOME, 60, 1 / 3, 1 / 3);
    },
    subjects: new Subjects([{ ...map.placements[1], yaw: SUN_WAY + Math.PI }]),
    stars: [1, 2],
    says: CRITIQUE.light,
  },
  {
    label: 'UFO, 24 mm from right under it',
    shot: () => shotOf([UFO[0] + Math.cos(SUN_WAY) * 8, UFO[1] + Math.sin(SUN_WAY) * 8, 4.8], UFO, 24),
    subjects: withUfo,
    stars: [0, 1],
    says: CRITIQUE.under,
  },
  {
    label: 'duck, behind a tree',
    shot: () => duckFrom(30, 60, 1 / 3, 1 / 3),
    subjects: new Subjects([
      ...map.placements,
      { kind: 'broadleaf', x: duckX + 15, y: duckY, z: 0, yaw: 0, scale: 1, biome: 0, vary: 0.5 },
    ]),
    stars: [0, 0],
    says: CRITIQUE.hidden,
  },
];

describe('the grade’s table of pictures', () => {
  const graded = new Map<string, Grade>();
  for (const row of ROWS) graded.set(row.label, grade(row.shot(), row.subjects ?? fixture, g));

  for (const row of ROWS)
    it(`${row.label}: ${row.stars[0]} to ${row.stars[1]} stars, and the card says “${row.says}”`, () => {
      const gr = graded.get(row.label)!;
      const why = JSON.stringify(gr.toJSON());
      expect(gr.stars, why).toBeGreaterThanOrEqual(row.stars[0]);
      expect(gr.stars, why).toBeLessThanOrEqual(row.stars[1]);
      expect(critique(gr), why).toBe(row.says);
    });

  it('grades a gnome at a good portrait distance as a duck', () => {
    const at = (label: string) => graded.get(label)!.total;
    expect(Math.abs(at('gnome, 60 mm portrait, centred') - at('duck, 60 mm, centred'))).toBeLessThanOrEqual(5);
    expect(Math.abs(at('gnome, 60 mm portrait, on a third') - at('duck, 60 mm, on a third'))).toBeLessThanOrEqual(5);
  });

  it('makes a UFO no easier than the others: from under it, the least of the well framed', () => {
    const under = graded.get('UFO, 24 mm from right under it')!.total;
    for (const label of ['duck, 60 mm, centred', 'gnome, 60 mm portrait, centred'])
      expect(under).toBeLessThan(graded.get(label)!.total - 30);
  });
});
