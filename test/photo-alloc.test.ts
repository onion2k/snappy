/**
 * What the viewfinder does every frame makes nothing: the look, the turn rate, auto focus with its rays over the ground
 * and through the trees, the brackets' boxes, and the grade, which the fuzzer asks for every few frames. Run as `alloc.test.ts` runs the rover:
 * on a gentle plane of its own, whose reads V8 inlines, in a file of its own so no other ground has made the calls
 * polymorphic, and warmed up first, so what is measured is the optimised code's own.
 */
import { UNDER_MUTATION } from './helpers';
import { getHeapSpaceStatistics } from 'node:v8';
import { expect, it } from 'vitest';
import { Brackets } from '../src/brackets';
import { Grade, grade, inView } from '../src/score';
import { Subjects } from '../src/sight';
import { SUN } from '../src/sun';
import { Viewfinder } from '../src/viewfinder';
import type { Ground, Placement } from '../src/world/types';

const plane: Ground = {
  bounds: { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 },
  heightAt: (x, y) => 0.01 * x + 0.02 * y,
  slopeAt: (_x, _y, o) => {
    o[0] = 0.01;
    o[1] = 0.02;
  },
  surfaceAt: () => 0,
  waterDepthAt: () => 0,
  solidAt: () => false,
  topAt: (x, y) => 0.01 * x + 0.02 * y,
};

const young = () => getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/** The least the young heap grows over 4000 frames of `frame`, after warming it up: twice the rover's, so a number boxed every few frames shows the more. */
function grows(frame: (f: number) => void): number {
  for (let f = 0; f < 50_000; f++) frame(f);
  let least = Infinity;
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = young();
    for (let f = 0; f < 4000; f++) frame(f);
    const grew = young() - before;
    if (grew >= 0) least = Math.min(least, grew);
  }
  return least;
}

// one number boxed a frame would be 64 kB; a frame that makes nothing leaves a few bytes of the runtime's own
const NOTHING = 8000;

const at = (kind: Placement['kind'], x: number, y: number, z: number): Placement => ({
  kind,
  x,
  y,
  z,
  yaw: 1,
  scale: 1,
  biome: 0,
  vary: 0.5,
});
// a duck and a gnome ahead of the rover, a UFO over it, and a gnome behind; and a wood round them, a tree hiding
// the far gnome and the rest about, so the rays walk the trees' grid every frame
const subjects = new Subjects([
  at('duck', 30, 2, 0.3),
  at('gnome', 40, -6, 0.3),
  at('ufo', 60, 20, 60),
  at('gnome', -30, 0, -0.6),
  at('broadleaf', 20, -3, 0.3),
  at('conifer', 45, 15, 0.9),
  at('willow', -10, 12, 0),
  at('twisted', 70, -30, 1),
  at('fruit', 10, 40, 0.8),
  ...Array.from({ length: 40 }, (_, k) => at('broadleaf', -200 + k * 37, (k % 5) * 60 - 120, 0)),
]);
const rover = { x: 0, y: 0, z: 0.8, yaw: 0 };

it.skipIf(UNDER_MUTATION)('makes nothing in a frame of the viewfinder: the look, the focus and the brackets', () => {
  const vf = new Viewfinder();
  vf.enter(rover);
  const box = new Float64Array(8);
  const frame = (f: number) => {
    // turned to and fro across the oddities, tilted up to the UFO and down, and focused by hand now and then
    // each turn a number of its own at its own call, since a fraction chosen here is boxed by the choosing
    if (f % 400 < 200) vf.look(0.01, 0.004);
    else vf.look(-0.01, -0.004);
    if (f % 300 === 0) vf.focusAt(0, 0, plane, subjects);
    if (f % 300 === 150) vf.auto();
    vf.update(1 / 60, plane, subjects);
    subjects.lift[2] = f % 120;
    for (let i = 0; i < subjects.count; i++) inView(vf.shot, subjects, i, box);
  };
  expect(grows(frame)).toBeLessThan(NOTHING);
});

it.skipIf(UNDER_MUTATION)('makes nothing grading a picture into a grade made once', () => {
  const vf = new Viewfinder();
  vf.enter(rover);
  const out = new Grade();
  const frame = (f: number) => {
    if (f % 400 < 200) vf.look(0.01, 0);
    else vf.look(-0.01, 0);
    vf.update(1 / 60, plane, subjects);
    grade(vf.shot, subjects, plane, SUN, out);
  };
  expect(grows(frame)).toBeLessThan(NOTHING);
});

it.skipIf(UNDER_MUTATION)('makes nothing working out the brackets every frame', () => {
  const vf = new Viewfinder();
  vf.enter(rover);
  const b = new Brackets();
  const frame = (f: number) => {
    if (f % 400 < 200) vf.look(0.01, 0.004);
    else vf.look(-0.01, -0.004);
    vf.update(1 / 60, plane, subjects);
    b.update(vf.shot, subjects, plane);
  };
  expect(grows(frame)).toBeLessThan(NOTHING);
});
