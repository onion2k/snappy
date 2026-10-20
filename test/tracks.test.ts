/**
 * The tracks: two lines of marks laid behind the rover on soft ground, none
 * on stone or in water, in a fixed ring that reuses its oldest mark.
 */
import { describe, expect, it } from 'vitest';
import { Rover, type Drive } from '../src/rover';
import { TRACKS, Tracks } from '../src/tracks';
import { fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { SURFACE, type Ground } from '../src/world/types';

const DT = 1 / 60;
const g = groundOf(fixtureWorld());

/** Drive a rover from a tile for `seconds`, the tracks following it, and hand back both. */
function lay(tx: number, ty: number, yaw: number, seconds: number, d: Drive, ground: Ground = g, dt = DT) {
  const r = new Rover(ground);
  r.teleport(...fixtureAt(tx, ty), yaw);
  const tracks = new Tracks(ground);
  let t = 0;
  for (let f = 0; f < Math.round(seconds / dt); f++) {
    r.step(dt, d);
    t += dt;
    tracks.follow(r, t);
  }
  return { r, tracks, t };
}

/** The marks on one side, oldest first. */
function side(tracks: Tracks, s: number) {
  const out: { x: number; y: number; born: number }[] = [];
  for (let i = 0; i < tracks.count; i++)
    if (tracks.side[i] === s) out.push({ x: tracks.x[i], y: tracks.y[i], born: tracks.born[i] });
  return out.sort((a, b) => a.born - b.born);
}

describe('the tracks', () => {
  it('are laid on grass, two lines a track apart, a mark every so often', () => {
    const { r, tracks } = lay(16, 0.6, 0, 1, { throttle: 1, steer: 0 });
    const left = side(tracks, 0),
      right = side(tracks, 1);
    const went = r.rolled[0];
    expect(left.length).toBeGreaterThan(went / TRACKS.spacing - 2);
    expect(left.length).toBeLessThan(went / TRACKS.spacing + 2);
    expect(right.length).toBe(left.length);
    // heading east, the left side is to the north
    expect(left[3].y - right[3].y).toBeCloseTo(2.9, 1);
    for (let i = 1; i < left.length; i++) expect(left[i].x - left[i - 1].x).toBeCloseTo(TRACKS.spacing, 2);
    // and behind the rover, under its rear wheels
    expect(left[left.length - 1].x).toBeLessThan(r.x);
    expect(tracks.z[0]).toBeCloseTo(g.heightAt(tracks.x[0], tracks.y[0]), 4);
    expect(tracks.yaw[0]).toBeCloseTo(0, 4);
  });

  it('are laid on the road, on sand and in mud', () => {
    expect(lay(2, 15.5, 0, 0.5, { throttle: 1, steer: 0 }).tracks.count).toBeGreaterThan(10);
    expect(lay(12.5, 4.5, Math.PI / 2, 0.5, { throttle: 1, steer: 0 }).tracks.count).toBeGreaterThan(10);
    expect(lay(20.6, 12.5, 0, 0.5, { throttle: 1, steer: 0 }).tracks.count).toBeGreaterThan(10);
  });

  it('are not laid on stone', () => {
    const stone: Ground = { ...g, surfaceAt: () => SURFACE.stone };
    expect(lay(16, 0.6, 0, 1, { throttle: 1, steer: 0 }, stone).tracks.count).toBe(0);
  });

  it('are not laid in water, and are again out of it', () => {
    // north along the pond's shallow rim and out the far side onto grass
    const { tracks } = lay(5, 4.6, Math.PI / 2, 5, { throttle: 1, steer: 0 });
    for (let i = 0; i < tracks.count; i++) expect(g.waterDepthAt(tracks.x[i], tracks.y[i])).toBe(0);
    let past = 0;
    for (let i = 0; i < tracks.count; i++) if (tracks.y[i] > fixtureAt(0, 12)[1]) past++;
    expect(past).toBeGreaterThan(4);
  });

  it('are laid by each side the way it goes when turning on the spot', () => {
    const { tracks } = lay(16, 2, 0, 1, { throttle: 0, steer: 1 });
    expect(side(tracks, 0).length).toBeGreaterThan(3);
    expect(side(tracks, 1).length).toBe(side(tracks, 0).length);
  });

  it('keep their spacing when the frames are long', () => {
    const { tracks } = lay(2, 15.5, 0, 1.5, { throttle: 1, steer: 0 }, g, 0.05);
    const left = side(tracks, 0);
    for (let i = 1; i < left.length; i++) expect(left[i].x - left[i - 1].x).toBeCloseTo(TRACKS.spacing, 2);
  });

  it('are none when it has not moved, nor where it was teleported from', () => {
    const r = new Rover(g);
    r.teleport(...fixtureAt(16, 2), 0);
    const tracks = new Tracks(g);
    tracks.follow(r, 0);
    r.teleport(...fixtureAt(20, 2), 0);
    tracks.follow(r, 1);
    for (let f = 0; f < 30; f++) {
      r.step(DT, { throttle: 0, steer: 0 });
      tracks.follow(r, 1 + f * DT);
    }
    expect(tracks.count).toBe(0);
  });
});

/** A stand-in for the rover, as much of it as the tracks read: rolling forward along the x axis, a mark at a time. */
function roller() {
  const r = { rolled: new Float64Array(2), wheelX: new Float64Array(6), wheelY: new Float64Array(6), yaw: 0 };
  // on grass, south of the rock and clear of the water
  r.wheelY.fill(fixtureAt(0, 1)[1]);
  return r;
}

describe('the pool', () => {
  it('is a fixed ring: at capacity the oldest mark is reused, and nothing grows', () => {
    const tracks = new Tracks(g);
    const buffers = [tracks.x, tracks.y, tracks.z, tracks.yaw, tracks.born, tracks.side];
    expect(TRACKS.capacity).toBe(2048);
    const r = roller();
    tracks.follow(r, 0);
    // a mark a side each time: 1500 times is 3000 marks
    for (let k = 1; k <= 1500; k++) {
      r.rolled[0] += TRACKS.spacing;
      r.rolled[1] += TRACKS.spacing;
      r.wheelX.fill((k % 100) * 0.6 - 30);
      tracks.follow(r, k);
    }
    expect(tracks.count).toBe(TRACKS.capacity);
    expect(tracks.next).toBe(3000 - TRACKS.capacity);
    // the slot after the newest holds the oldest left
    let oldest = Infinity;
    for (let i = 0; i < tracks.count; i++) oldest = Math.min(oldest, tracks.born[i]);
    expect(oldest).toBe((3000 - TRACKS.capacity) / 2 + 1);
    expect(tracks.born[tracks.next]).toBe(oldest);
    expect(tracks.born[tracks.next - 1]).toBe(1500);
    expect([tracks.x, tracks.y, tracks.z, tracks.yaw, tracks.born, tracks.side]).toEqual(buffers);
    for (const b of buffers) expect(b.length).toBe(TRACKS.capacity);
  });

  it('lays no more than a few marks a side in one long frame', () => {
    const tracks = new Tracks(g);
    const r = roller();
    tracks.follow(r, 0);
    r.rolled[0] = r.rolled[1] = 100;
    tracks.follow(r, 1);
    expect(tracks.count).toBe(2 * TRACKS.perFrame);
    // and carries on from where the rover is, not laying the rest after
    r.rolled[0] = r.rolled[1] = 100.3;
    tracks.follow(r, 2);
    expect(tracks.count).toBe(2 * TRACKS.perFrame);
  });

  it('says how old each mark is, and empties', () => {
    const tracks = new Tracks(g);
    const r = roller();
    tracks.follow(r, 0);
    r.rolled[1] = TRACKS.spacing;
    tracks.follow(r, 10);
    expect(tracks.count).toBe(1);
    expect(tracks.side[0]).toBe(1);
    expect(tracks.age(0, 12.5)).toBe(2.5);
    tracks.clear();
    expect(tracks.count).toBe(0);
    expect(tracks.next).toBe(0);
    // followed afresh after it is emptied: what was rolled before is not laid
    r.rolled[1] = 50;
    tracks.follow(r, 11);
    expect(tracks.count).toBe(0);
  });
});
