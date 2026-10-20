/**
 * What runs every frame makes nothing: the rover's step, the camera, the
 * tracks, the autopilot and reading the controls. They run here on a
 * ground of their own, a gentle plane whose reads are small enough for V8
 * to inline, and in a file of their own so no other ground has made the
 * calls polymorphic: what is measured is then this code's own. On a real
 * ground each read V8 does not inline hands back its number boxed, sixteen
 * bytes in the young heap, which is the ground's and not the frame's.
 */
import { UNDER_MUTATION } from './helpers';
import { getHeapSpaceStatistics } from 'node:v8';
import { expect, it } from 'vitest';
import { Autopilot } from '../src/autopilot';
import { ChaseCamera } from '../src/camera';
import { Input } from '../src/input';
import { Rover, type Drive } from '../src/rover';
import { Tracks } from '../src/tracks';
import type { Ground } from '../src/world/types';

const plane: Ground = {
  bounds: { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 },
  heightAt: (x, y) => 0.01 * x + 0.02 * y,
  slopeAt: (_x, _y, o) => {
    o[0] = 0.01;
    o[1] = 0.02;
  },
  surfaceAt: () => 0,
  waterDepthAt: () => 0,
  solidAt: (x) => x > 5000,
  topAt: (x, y) => 0.01 * x + 0.02 * y,
};

const young = () => getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/** The least the young heap grows over 2000 frames of `frame`, after warming it up. */
function grows(frame: (f: number) => void): number {
  // warmed up first, so what is measured is the optimised code and not the interpreter's own boxing
  for (let f = 0; f < 50_000; f++) frame(f);
  // the least of a few tries, since a scavenge in the middle of one hides what it made
  let least = Infinity;
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = young();
    for (let f = 0; f < 2000; f++) frame(f);
    const grew = young() - before;
    if (grew >= 0) least = Math.min(least, grew);
  }
  return least;
}

// one small object a frame would be about 100 kB; a frame that makes nothing leaves a few bytes of the runtime's own
const NOTHING = 8000;

it.skipIf(UNDER_MUTATION)('makes nothing in a frame of the rover, the camera and the tracks', () => {
  const r = new Rover(plane, { x: 0, y: 0, yaw: 0 });
  const cam = new ChaseCamera();
  cam.snap(r, plane);
  const tracks = new Tracks(plane);
  const d: Drive = { throttle: 1, steer: 0 };
  const frame = (f: number) => {
    // driving and standing by turns, so the head both looks into the turn and turns round to the camera
    d.throttle = f % 600 < 300 ? 1 : f % 600 < 400 ? -1 : 0;
    d.steer = f % 600 < 400 ? Math.sin(f / 50) : 0;
    r.lookAt(cam.position[0], cam.position[1], cam.position[2]);
    r.step(1 / 60, d);
    cam.update(r, plane, 1 / 60);
    // the time as the frame's count, a whole number: a fraction made here and handed to a call is boxed, which is the
    // caller's doing and not the tracks'
    tracks.follow(r, f);
  };
  expect(grows(frame)).toBeLessThan(NOTHING);
  expect(tracks.count).toBe(tracks.capacity);
});

it.skipIf(UNDER_MUTATION)('makes nothing in a frame of the autopilot and the controls', () => {
  const r = new Rover(plane, { x: 0, y: 0, yaw: 0 });
  // a long zigzag, so it is always turning toward somewhere
  const route = new Float32Array(400);
  for (let i = 0; i < 200; i++) {
    route[2 * i] = i * 30;
    route[2 * i + 1] = (i & 1) * 25;
  }
  const pilot = new Autopilot(route);
  const input = new Input(new EventTarget());
  const d: Drive = { throttle: 0, steer: 0 };
  const frame = () => {
    if (pilot.done) pilot.follow(route);
    pilot.drive(r, 1 / 60, d);
    input.override = d;
    r.step(1 / 60, input.read());
  };
  expect(grows(frame)).toBeLessThan(NOTHING);
});
