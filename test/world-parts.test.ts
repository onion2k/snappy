import { describe, expect, it } from 'vitest';
import { FOOTPRINT, markFootprint, TOP } from '../src/world/built';
import { fixtureWorld } from '../src/world/fixture';
import { clamp, curve, frame, lerp, lineField, lineLength, smoothstep } from '../src/world/geometry';
import { groundOf } from '../src/world/ground';
import { COLS, LEDGES, ROWS, RUINS, type WaterShape } from '../src/world/layout';
import { memoGround } from '../src/world/memo';
import { fbm, hash2, noise, ridged } from '../src/world/noise';
import { toBytes } from '../src/world/paint';
import {
  fillHollows,
  ledgeAt,
  limitSlope,
  profileOf,
  STEEPEST,
  terrace,
  waterProfile,
  type WaterField,
} from '../src/world/relief';
import { clearance } from '../src/world/scatter';
import { area2, clipLine, inside, ruinOutline, squareOutline } from '../src/world/plaza';
import { BIOMES, BUILT, DRIVE, TILE } from '../src/world/types';

describe('the noise', () => {
  it('is the same for the same seed and point, and differs by seed', () => {
    expect(hash2(1, 5, 7)).toBe(hash2(1, 5, 7));
    expect(hash2(1, 5, 7)).not.toBe(hash2(2, 5, 7));
    expect(hash2(1, 5, 7)).not.toBe(hash2(1, 7, 5));
    expect(noise(3, 1.25, 2.5)).toBe(noise(3, 1.25, 2.5));
  });

  it('hashes into [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const h = hash2(9, i, i * 3 - 1000);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('is nought on the lattice and stays within -1 and 1 between', () => {
    expect(noise(4, 3, 8)).toBe(0);
    let lo = Infinity,
      hi = -Infinity,
      sum = 0;
    for (let i = 0; i < 4000; i++) {
      const v = noise(4, i * 0.137, i * 0.071);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      sum += v;
    }
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(1);
    // it swings both ways about nought, and is not flat
    expect(lo).toBeLessThan(-0.3);
    expect(hi).toBeGreaterThan(0.3);
    expect(Math.abs(sum / 4000)).toBeLessThan(0.1);
  });

  it('is smooth: a small step moves it a little', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.31,
        y = i * 0.17;
      expect(Math.abs(noise(5, x + 0.001, y) - noise(5, x, y))).toBeLessThan(0.01);
    }
  });

  it('sums octaves within -1 and 1, and ridges within 0 and 1', () => {
    for (let i = 0; i < 1000; i++) {
      const f = fbm(6, i * 0.29, i * 0.13, 4),
        r = ridged(6, i * 0.29, i * 0.13, 3);
      expect(Math.abs(f)).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    // one octave of fbm is the noise itself
    expect(fbm(6, 1.3, 2.7, 1)).toBe(noise(6, 1.3, 2.7));
  });
});

describe('the geometry', () => {
  it('clamps, eases and blends', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(smoothstep(0, 10, 0)).toBe(0);
    expect(smoothstep(0, 10, 10)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
    expect(smoothstep(0, 10, 2.5)).toBeCloseTo(0.15625, 10);
    // either way round
    expect(smoothstep(10, 0, 2.5)).toBeCloseTo(0.84375, 10);
  });

  it('bends a curve through every point it was given, ends held', () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [20, 12],
    ];
    const line = curve(pts, 1);
    expect([line[0], line[1]]).toEqual([0, 0]);
    expect([line[line.length - 2], line[line.length - 1]]).toEqual([20, 12]);
    for (const [x, y] of pts) {
      let best = Infinity;
      for (let i = 0; i < line.length; i += 2) best = Math.min(best, Math.hypot(line[i] - x, line[i + 1] - y));
      expect(best).toBeLessThan(1e-9);
    }
    // about a tile between points, and no shorter than the straight way
    expect(lineLength(line)).toBeGreaterThanOrEqual(10 + 10 + Math.hypot(10, 2));
    for (let i = 2; i < line.length; i += 2)
      expect(Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1])).toBeLessThan(1.6);
  });

  it('measures each tile from a line, to its reach, and keeps the nearer of two', () => {
    const cols = 20,
      rows = 20;
    const dist = new Float32Array(cols * rows).fill(Infinity),
      near = new Int32Array(cols * rows).fill(-1);
    lineField(cols, rows, Float64Array.from([0, 10, 20, 10]), 5, dist, near, 0);
    expect(dist[10 * cols + 3]).toBeCloseTo(0.5, 5);
    expect(dist[14 * cols + 3]).toBeCloseTo(4.5, 5);
    expect(dist[16 * cols + 3]).toBe(Infinity);
    expect(near[16 * cols + 3]).toBe(-1);
    lineField(cols, rows, Float64Array.from([3, 0, 3, 20]), 5, dist, near, 1);
    expect(dist[14 * cols + 3]).toBeCloseTo(0.5, 5);
    expect(near[14 * cols + 3] >> 16).toBe(1);
    expect(near[10 * cols + 10] >> 16).toBe(0);
  });

  it('frames a point against a line: along it and to its left', () => {
    const out = new Float64Array(2);
    frame(0, 0, 10, 0, 3, 2, out);
    expect(out[0]).toBeCloseTo(3, 10);
    expect(out[1]).toBeCloseTo(2, 10);
    frame(0, 0, 0, 10, 3, 2, out);
    expect(out[0]).toBeCloseTo(2, 10);
    expect(out[1]).toBeCloseTo(-3, 10);
  });
});

describe('the relief', () => {
  const shape: WaterShape = { shelf: 2, deep: -3, shore: 0.5, reach: 6 };

  it('lays a shallow shelf and a deep middle under water, and a shore that rises', () => {
    expect(waterProfile(-0.5, shape)).toBeLessThan(0);
    expect(waterProfile(-shape.shelf, shape)).toBeGreaterThan(-DRIVE.shallow);
    expect(waterProfile(-8, shape)).toBe(shape.deep);
    expect(waterProfile(0, shape)).toBeGreaterThan(0);
    expect(waterProfile(4, shape)).toBeCloseTo(0.3 + 2, 10);
    // past its reach the shore climbs faster, and leaves the land alone
    expect(waterProfile(10, shape) - waterProfile(9, shape)).toBeGreaterThan(
      waterProfile(4, shape) - waterProfile(3, shape),
    );
    for (let s = -10; s < 20; s += 0.25)
      expect(waterProfile(s + 0.25, shape)).toBeGreaterThanOrEqual(waterProfile(s, shape));
  });

  it('cuts terraces: flat shelves, steep risers, never lower than a step below', () => {
    const d = 9;
    let steepest = 0,
      flattest = Infinity;
    for (let h = 0.05; h < 40; h += 0.05) {
      const a = terrace(h, d),
        b = terrace(h + 0.05, d);
      expect(b).toBeGreaterThanOrEqual(a);
      expect(Math.abs(a - h)).toBeLessThanOrEqual(d);
      steepest = Math.max(steepest, (b - a) / 0.05);
      flattest = Math.min(flattest, (b - a) / 0.05);
    }
    expect(steepest).toBeGreaterThan(3);
    expect(flattest).toBeLessThan(0.2);
    expect(terrace(18, d)).toBeCloseTo(18, 10);
  });

  it('holds neighbours within half a tile, and lowers only', () => {
    const t = new Float64Array(COLS * ROWS);
    t[160 * COLS + 160] = 100;
    t[10 * COLS + 10] = -20;
    const before = Float64Array.from(t);
    limitSlope(t);
    let raised = 0,
      steepest = 0;
    for (let i = 0; i < t.length; i++) if (t[i] > before[i]) raised++;
    for (let y = 0; y < ROWS - 1; y++)
      for (let x = 0; x < COLS - 1; x++) {
        const h = t[y * COLS + x];
        steepest = Math.max(steepest, Math.abs(t[y * COLS + x + 1] - h), Math.abs(t[(y + 1) * COLS + x] - h));
      }
    expect(raised).toBe(0);
    expect(steepest).toBeLessThanOrEqual(STEEPEST + 1e-9);
    // the peak is worn to one step above the flat round it
    expect(t[160 * COLS + 160]).toBeCloseTo(STEEPEST, 9);
    expect(t[10 * COLS + 11]).toBeCloseTo(-20 + STEEPEST, 9);
    expect(STEEPEST).toBeLessThan(TILE / 2);
  });

  it('fills a hollow below the water nobody laid, and leaves laid water', () => {
    const t = new Float64Array(COLS * ROWS).fill(5);
    const water: WaterField = {
      shore: new Float32Array(COLS * ROWS).fill(50),
      body: new Uint8Array(COLS * ROWS),
      river: new Float32Array(COLS * ROWS).fill(Infinity),
      channel: new Float32Array(COLS * ROWS).fill(Infinity),
    };
    t[50 * COLS + 50] = -1;
    t[50 * COLS + 51] = -1;
    t[100 * COLS + 100] = -2;
    water.shore[100 * COLS + 100] = -3;
    expect(fillHollows(t, water)).toBe(2);
    expect(t[50 * COLS + 50]).toBeGreaterThan(0);
    expect(t[50 * COLS + 51]).toBeGreaterThan(0);
    expect(t[100 * COLS + 100]).toBe(-2);
  });

  it('lays a road over a river at a ford: wet, shallow, and eased up the banks', () => {
    const t = new Float64Array(COLS * ROWS).fill(6);
    for (let y = 0; y < ROWS; y++) for (let x = 150; x < 160; x++) t[y * COLS + x] = -3;
    const line = curve(
      [
        [100, 100],
        [210, 100],
      ],
      1,
    );
    const { profile, ford } = profileOf(t, line);
    let wet = 0;
    for (let i = 0; i < profile.length; i++) {
      if (ford[i]) {
        wet++;
        expect(profile[i]).toBeLessThan(0);
        expect(profile[i]).toBeGreaterThan(-DRIVE.shallow);
      }
      if (i > 0) expect(Math.abs(profile[i] - profile[i - 1])).toBeLessThanOrEqual(1.3 + 1e-9);
    }
    expect(wet).toBeGreaterThanOrEqual(10);
    // the ends are held at the ground
    expect(profile[0]).toBe(6);
    expect(profile[profile.length - 1]).toBe(6);
  });

  it('stands each ledge proud at its face, and eases it down a step the rover rolls over', () => {
    const scratch = new Float64Array(2);
    for (const l of LEDGES) {
      const mx = (l.a[0] + l.b[0]) / 2,
        my = (l.a[1] + l.b[1]) / 2;
      const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
      const nx = -(l.b[1] - l.a[1]) / len,
        ny = (l.b[0] - l.a[0]) / len;
      expect(ledgeAt(l, mx + nx * 1, my + ny * 1, scratch), l.name).toBeCloseTo(l.height, 5);
      expect(ledgeAt(l, mx - nx * 1, my - ny * 1, scratch), l.name).toBe(0);
      // over the taper, no two tiles side by side differ by more than the rover rolls over
      for (let ty = 0; ty < ROWS; ty++)
        for (let tx = 0; tx < COLS - 1; tx++) {
          const a = ledgeAt(l, tx + 0.5, ty + 0.5, scratch);
          const b = ledgeAt(l, tx + 1.5, ty + 0.5, scratch);
          const c = ledgeAt(l, tx + 0.5, ty + 1.5, scratch);
          const across = Math.max(Math.abs(a - b), Math.abs(a - c));
          if (across > DRIVE.step) expect(Math.min(a, b, c), `${l.name} at ${tx},${ty}`).toBe(0);
        }
    }
  });
});

describe('the biome shares', () => {
  it('turn any shares into bytes that sum to 255', () => {
    const out = new Uint8Array(BIOMES);
    for (const shares of [
      [1, 1, 1, 0, 0],
      [0.2, 0.3, 0.1, 0.05, 0.35],
      [1e-9, 0, 0, 0, 2],
      [3, 3, 3, 3, 3],
      [0.7, 0, 0, 0, 0],
    ]) {
      toBytes(Float64Array.from(shares), out, 0);
      expect(out.reduce((a, b) => a + b, 0)).toBe(255);
      for (let b = 0; b < BIOMES; b++)
        expect(Math.abs(out[b] - (shares[b] / shares.reduce((a, c) => a + c)) * 255)).toBeLessThan(1);
    }
  });

  it('gives a tile with no share at all wholly to the meadow', () => {
    const out = new Uint8Array(BIOMES);
    toBytes(new Float64Array(BIOMES), out, 0);
    expect(Array.from(out)).toEqual([255, 0, 0, 0, 0]);
  });
});

describe('what is built', () => {
  const origin = -(COLS * TILE) / 2;
  const grid = { cols: COLS, rows: ROWS, originX: origin, originY: origin };

  it('keeps the tallest top on each tile it marks, scaled with the piece', () => {
    const solid = new Uint8Array(COLS * ROWS),
      tops = new Float32Array(COLS * ROWS);
    markFootprint({ kind: 'cottage', x: 3, y: 3, yaw: 0.4, scale: 1.12 }, grid, solid, tops);
    expect(tops[160 * COLS + 160]).toBeCloseTo(TOP.cottage! * 1.12, 4);
    markFootprint({ kind: 'fence', x: 3, y: 3, yaw: 0, scale: 1 }, grid, solid, tops);
    expect(tops[160 * COLS + 160]).toBeCloseTo(TOP.cottage! * 1.12, 4);
    for (let t = 0; t < COLS * ROWS; t++) expect(tops[t] > 0).toBe(solid[t] === 1);
  });

  it('has a footprint and a top for every built kind', () => {
    for (const kind of BUILT) {
      expect(FOOTPRINT[kind], kind).toBeDefined();
      expect(TOP[kind], kind).toBeGreaterThan(0);
    }
  });

  it('marks every tile a footprint touches, a fence no wider than a unit too', () => {
    const solid = new Uint8Array(COLS * ROWS);
    // a fence along x, three metres long, through the middle of a row of tiles
    markFootprint({ kind: 'fence', x: 0, y: 3, yaw: 0, scale: 1 }, grid, solid);
    const row = 160;
    let marked = 0;
    for (let tx = 0; tx < COLS; tx++) marked += solid[row * COLS + tx];
    expect(marked).toBeGreaterThanOrEqual(5);
    expect(solid[(row + 1) * COLS + 160]).toBe(0);
  });

  it('leaves the span of an arch open between its piers', () => {
    const solid = new Uint8Array(COLS * ROWS);
    markFootprint({ kind: 'arch', x: 3, y: 3, yaw: 0, scale: 1 }, grid, solid);
    expect(solid[160 * COLS + 160]).toBe(0);
    expect(solid[160 * COLS + 162]).toBe(1);
    expect(solid[160 * COLS + 157]).toBe(1);
    expect(FOOTPRINT.arch).toHaveLength(2);
  });
});

describe('the remembering ground', () => {
  it('answers exactly as the ground does', () => {
    const map = fixtureWorld();
    const plain = groundOf(map),
      memo = memoGround(map);
    const a = new Float64Array(2),
      b = new Float64Array(2);
    for (let i = 0; i < 3000; i++) {
      // points in a walk, coming back to the same few, as a move's probes do
      const x = -100 + ((i * 7.3) % 200),
        y = -100 + ((i * 3.1) % 200);
      for (const [px, py] of [
        [x, y],
        [x + 0.5, y],
        [x, y],
      ]) {
        expect(memo.heightAt(px, py)).toBe(plain.heightAt(px, py));
        expect(memo.waterDepthAt(px, py)).toBe(plain.waterDepthAt(px, py));
        memo.slopeAt(px, py, a);
        plain.slopeAt(px, py, b);
        expect(a[0]).toBe(b[0]);
        expect(a[1]).toBe(b[1]);
        expect(memo.solidAt(px, py)).toBe(plain.solidAt(px, py));
        expect(memo.topAt(px, py)).toBe(plain.topAt(px, py));
        expect(memo.surfaceAt(px, py)).toBe(plain.surfaceAt(px, py));
      }
    }
    expect(memo.bounds).toEqual(plain.bounds);
    // and round the fixture's lamp, in and out of its circle
    const [lx, ly] = [map.obstacles[0], map.obstacles[1]];
    let inside = 0;
    for (let k = 0; k < 400; k++) {
      const x = lx + ((k % 20) - 9.5) * 0.2,
        y = ly + (Math.floor(k / 20) - 9.5) * 0.2;
      expect(memo.solidAt(x, y)).toBe(plain.solidAt(x, y));
      if (plain.solidAt(x, y)) inside++;
    }
    expect(inside).toBeGreaterThan(0);
  });
});

describe('the room round a tile', () => {
  it('counts tiles to the nearest unstandable one, to a cap', () => {
    const cols = 10,
      rows = 10;
    const stand = new Uint8Array(cols * rows).fill(1);
    stand[0] = 0;
    const room = clearance(stand, cols, 5);
    expect(room[0]).toBe(0);
    expect(room[1]).toBe(1);
    expect(room[cols + 1]).toBe(2);
    expect(room[99]).toBe(5);
  });
});

describe('the plazas', () => {
  const box = Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]);

  it('knows inside from out, and which way round an outline runs', () => {
    expect(inside(box, 5, 5)).toBe(true);
    expect(inside(box, 11, 5)).toBe(false);
    expect(inside(box, -1, 5)).toBe(false);
    expect(area2(box)).toBe(200);
    expect(area2(Float64Array.from([0, 0, 0, 10, 10, 10, 10, 0]))).toBe(-200);
    expect(area2(squareOutline())).toBeGreaterThan(0);
    for (const r of RUINS.filter((ruin) => ruin.floor > 0)) {
      const o = ruinOutline(r, 1);
      expect(area2(o), r.name).toBeGreaterThan(0);
      expect(inside(o, r.x, r.y), r.name).toBe(true);
      expect(inside(o, r.x + r.floor + 0.5, r.y), r.name).toBe(false);
    }
  });

  it("stops a line at an outline's edge, and splits one that crosses it", () => {
    const ends = clipLine(Float64Array.from([-5, 5, 0, 5, 5, 5]), [box]);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toHaveLength(4);
    expect(ends[0][2]).toBeCloseTo(0, 5);
    expect(ends[0][3]).toBe(5);
    const through = clipLine(Float64Array.from([-5, 5, 5, 5, 15, 5]), [box]);
    expect(through).toHaveLength(2);
    expect(through[0][through[0].length - 2]).toBeCloseTo(0, 5);
    expect(through[1][0]).toBeCloseTo(10, 5);
    expect(clipLine(Float64Array.from([2, 2, 8, 8]), [box])).toHaveLength(0);
    expect(clipLine(Float64Array.from([-2, -2, -8, -8]), [box])).toHaveLength(1);
  });
});
