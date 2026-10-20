import { describe, expect, it } from 'vitest';
import { SLOT, SLOTS, poseRover, restPose, roverParts, type RoverPart } from '../src/models/rover';
import { ROVER_COLOURS } from '../src/models/palette';

type V = [number, number, number];

/** A point of a mesh carried by the matrix at `slot` in `m`. */
function moved(m: Float32Array, slot: number, x: number, y: number, z: number): V {
  const o = slot * 16;
  return [
    m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12],
    m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13],
    m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14],
  ];
}

/** The box round a part's mesh in its own slot's frame. */
function bounds(p: RoverPart): { lo: V; hi: V } {
  const lo: V = [Infinity, Infinity, Infinity],
    hi: V = [-Infinity, -Infinity, -Infinity];
  const q = p.mesh.positions;
  for (let i = 0; i < q.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], q[i]);
    hi[i % 3] = Math.max(hi[i % 3], q[i]);
  }
  return { lo, hi };
}

/** Where a ray from `o` along +x first meets the triangles of `part` as posed by `m`, or Infinity if it never does. */
function hitAlongX(m: Float32Array, part: RoverPart, o: V): number {
  const p = part.mesh.positions,
    idx = part.mesh.indices;
  let best = Infinity;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      moved(m, part.slot, p[idx[t + k] * 3], p[idx[t + k] * 3 + 1], p[idx[t + k] * 3 + 2]),
    );
    // the ray is along +x, so the triangle is met where (y, z) falls inside it seen from the front
    const d = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((o[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (o[2] - a[2])) / d;
    const v = ((b[1] - a[1]) * (o[2] - a[2]) - (o[1] - a[1]) * (b[2] - a[2])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const x = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]);
    if (x > o[0] && x < best) best = x;
  }
  return best;
}

/** Whether a ray from `o` along `d` meets any triangle of `part` as posed by `m` (Möller and Trumbore's test). */
function meets(m: Float32Array, part: RoverPart, o: V, d: V): boolean {
  const p = part.mesh.positions,
    idx = part.mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      moved(m, part.slot, p[idx[t + k] * 3], p[idx[t + k] * 3 + 1], p[idx[t + k] * 3 + 2]),
    );
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const q = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * q[0] + e1[1] * q[1] + e1[2] * q[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    // a little give at the edges, so a ray down the seam between two faces meets one of them
    const u = (s[0] * q[0] + s[1] * q[1] + s[2] * q[2]) / det;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const r = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / det;
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    if ((e2[0] * r[0] + e2[1] * r[1] + e2[2] * r[2]) / det > 1e-6) return true;
  }
  return false;
}

const parts = roverParts();
const named = (name: string) => {
  const p = parts.find((q) => q.name === name);
  if (!p) throw new Error(`no part ${name}`);
  return p;
};
const same = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i]);

describe('the rover’s one eye', () => {
  it('has one lens, round and centred across the head’s face', () => {
    const lenses = parts.filter((p) => same(p.colour, ROVER_COLOURS.lens));
    expect(lenses.map((p) => p.name)).toEqual(['lens']);
    const lens = lenses[0];
    expect(lens.slot).toBe(SLOT.head);
    const { lo, hi } = bounds(lens);
    // one disc, as tall as it is wide: a pair side by side would be twice as wide as tall
    expect(hi[1] - lo[1]).toBeCloseTo(hi[2] - lo[2], 1);
    expect(Math.abs((hi[1] + lo[1]) / 2)).toBeLessThan(0.01);
    // on the front of the head, and nothing of the head's shell is in front of it
    const shell = bounds(named('head'));
    expect(hi[0]).toBeGreaterThan(shell.hi[0]);
    // a big eye: its glass over a third as wide as the head, and its barrel over half
    expect(hi[1] - lo[1]).toBeGreaterThan(0.35 * (shell.hi[1] - shell.lo[1]));
    const barrel = bounds(named('barrel'));
    expect(barrel.hi[2] - barrel.lo[2]).toBeGreaterThan(0.55 * (shell.hi[1] - shell.lo[1]));
  });

  it('keeps everything eye-like inside the one eye: no pair of eyes anywhere', () => {
    const lens = bounds(named('lens'));
    const r = (lens.hi[1] - lens.lo[1]) / 2,
      cz = (lens.hi[2] + lens.lo[2]) / 2;
    const glassy = [ROVER_COLOURS.lens, ROVER_COLOURS.ring, ROVER_COLOURS.glint, ROVER_COLOURS.iris];
    const eyeLike = parts.filter((p) => glassy.some((c) => same(p.colour, c)));
    expect(eyeLike.length).toBeGreaterThan(1);
    for (const p of eyeLike) {
      expect(p.slot, p.name).toBe(SLOT.head);
      const { lo, hi } = bounds(p);
      for (const y of [lo[1], hi[1]]) expect(Math.abs(y), p.name).toBeLessThanOrEqual(r * 1.2);
      for (const z of [lo[2], hi[2]]) expect(Math.abs(z - cz), p.name).toBeLessThanOrEqual(r * 1.2);
    }
  });

  it('hangs the eye slot at the lens’s middle, on the head', () => {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, restPose());
    const lens = bounds(named('lens'));
    const [, y, z] = moved(m, SLOT.eye, 0, 0, 0);
    const head = moved(m, SLOT.head, 0, 0, 0);
    expect(y).toBeCloseTo(0, 5);
    expect(z - head[2]).toBeCloseTo((lens.hi[2] + lens.lo[2]) / 2, 2);
  });

  /** How many of a spread of rays forward from the lens's face meet the lid in front of it, at `blink`. */
  function covered(blink: number, headPitch = 0, headYaw = 0): number {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, { ...restPose(), blink, headPitch, headYaw });
    const lens = bounds(named('lens'));
    const r = (lens.hi[1] - lens.lo[1]) / 2,
      cz = (lens.hi[2] + lens.lo[2]) / 2;
    let n = 0;
    for (const [dy, dz] of [
      [0, 0],
      [0.8, 0],
      [-0.8, 0],
      [0, 0.8],
      [0, -0.8],
      [0.55, 0.55],
      [-0.55, 0.55],
      [0.55, -0.55],
      [-0.55, -0.55],
    ]) {
      // a point on the lens's face, in the head's frame, carried into the world
      const o = moved(m, SLOT.head, lens.hi[0], dy * r, cz + dz * r);
      if (hitAlongX(m, named('lid'), o) < Infinity) n++;
    }
    return n;
  }

  it('is wide open at blink 0: nothing in front of the lens', () => {
    expect(covered(0)).toBe(0);
  });

  it('is shut at blink 1: the lid over the whole lens', () => {
    expect(covered(1)).toBe(9);
  });

  it('closes from the top down as it blinks', () => {
    const half = covered(0.5);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(9);
  });

  it('blinks the same with the head turned and tipped', () => {
    expect(covered(0, 0, 0)).toBe(0);
    // the rays are cast along the world's x, so only a small turn keeps them square to the lens
    expect(covered(1, 0.05, 0.05)).toBe(9);
  });

  /**
   * Every point of the glass, carried into the world as the rover stands at rest, and the ways it can be seen from:
   * straight on, from three-quarters either side, from below and from above.
   */
  const LOOKS: V[] = [
    [1, 0, 0],
    [1, 1, 0],
    [1, -1, 0],
    [1, 0, -1],
    [1, 0, 1],
    [1, 0.6, -0.8],
    [1, -0.6, -0.8],
  ];
  function glassPoints(m: Float32Array): V[] {
    const g = named('lens').mesh.positions,
      out: V[] = [];
    for (let i = 0; i < g.length; i += 3) out.push(moved(m, SLOT.head, g[i], g[i + 1], g[i + 2]));
    return out;
  }

  it('shuts over the whole glass at blink 1, seen from any side the barrel lets it be seen from', () => {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, { ...restPose(), blink: 1 });
    // what stands between the glass and an eye: the lid, or the barrel round it
    const covers = parts.filter((p) => p.slot === SLOT.eye || ['barrel', 'focus ring', 'eye ring'].includes(p.name));
    const seen: string[] = [];
    for (const o of glassPoints(m))
      for (const l of LOOKS) {
        const k = Math.hypot(l[0], l[1], l[2]);
        const d: V = [l[0] / k, l[1] / k, l[2] / k];
        const from: V = [o[0] + d[0] * 0.003, o[1] + d[1] * 0.003, o[2] + d[2] * 0.003];
        if (!covers.some((p) => meets(m, p, from, d)))
          seen.push(`${o.map((v) => v.toFixed(2)).join(',')} along ${l.join(',')}`);
      }
    expect(seen.slice(0, 5)).toEqual([]);
  });

  it('shuts over the whole glass by the lid alone, even from steeply to one side', () => {
    // as if the barrel were not there: the lid reaches far enough round that nothing of the glass shows past its edge
    // from sixty degrees off the lens's axis either way, which a lid that stops short leaves a crescent of
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, { ...restPose(), blink: 1 });
    const lids = parts.filter((p) => p.slot === SLOT.eye);
    const steep: V[] = [[1, 0, -1.8], [1, 0, 1.8], [1, 1.8, 0], [1, -1.8, 0], ...LOOKS];
    const seen: string[] = [];
    for (const o of glassPoints(m))
      for (const l of steep) {
        const k = Math.hypot(l[0], l[1], l[2]);
        const d: V = [l[0] / k, l[1] / k, l[2] / k];
        const from: V = [o[0] + d[0] * 0.003, o[1] + d[1] * 0.003, o[2] + d[2] * 0.003];
        if (!lids.some((p) => meets(m, p, from, d)))
          seen.push(`${o.map((v) => v.toFixed(2)).join(',')} along ${l.join(',')}`);
      }
    expect(seen.slice(0, 5)).toEqual([]);
  });

  it('leaves the whole glass clear straight on at blink 0', () => {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, restPose());
    const lids = parts.filter((p) => p.slot === SLOT.eye);
    for (const o of glassPoints(m))
      expect(lids.some((p) => meets(m, p, [o[0] + 0.003, o[1], o[2]], [1, 0, 0]))).toBe(false);
  });

  it('puts the lid and its seam on the eye slot and nothing else there', () => {
    expect(parts.filter((p) => p.slot === SLOT.eye).map((p) => p.name)).toEqual(['lid', 'lid seam']);
  });
});

/**
 * Each moving piece's box in its own slot's frame, every part on it together, as the rover was before it had one eye
 * (ac3f9d1): the body, mast, arms and wheels keep their shape, so each box stays near this.
 */
const BEFORE: Record<string, { slot: number; lo: V; hi: V; give: number }> = {
  body: { slot: SLOT.body, lo: [-2.375, -1.18, -0.033], hi: [1.875, 1.18, 3.21], give: 0.2 },
  mast: { slot: SLOT.mast, lo: [-0.21, -0.21, 0.2], hi: [0.21, 0.21, 1.84], give: 0.2 },
  rocker: { slot: SLOT.rocker, lo: [-1.09, -0.16, -0.2], hi: [1.944, 0.16, 0.551], give: 0.12 },
  bogie: { slot: SLOT.bogie, lo: [-0.982, -0.1, -0.095], hi: [0.982, 0.1, 0.415], give: 0.12 },
  wheel: { slot: SLOT.wheel, lo: [-0.792, -0.5, -0.792], hi: [0.792, 0.4, 0.792], give: 0.06 },
};

describe('the rover’s shape, kept', () => {
  for (const [name, was] of Object.entries(BEFORE))
    it(`keeps the ${name}’s box near what it was`, () => {
      const lo: V = [Infinity, Infinity, Infinity],
        hi: V = [-Infinity, -Infinity, -Infinity];
      for (const p of parts.filter((q) => q.slot === was.slot)) {
        const b = bounds(p);
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], b.lo[a]);
          hi[a] = Math.max(hi[a], b.hi[a]);
        }
      }
      for (let a = 0; a < 3; a++) {
        expect(Math.abs(lo[a] - was.lo[a]), `${name} low ${'xyz'[a]}`).toBeLessThanOrEqual(was.give);
        expect(Math.abs(hi[a] - was.hi[a]), `${name} high ${'xyz'[a]}`).toBeLessThanOrEqual(was.give);
      }
    });

  it('keeps the wheels round at their radius, and their tread as wide as the wheel', () => {
    // the tyre and the blocks of its tread together: the logic rolls a wheel of `wheelRadius`
    const tyre = bounds(named('tyres')),
      tread = bounds(named('tread'));
    for (const a of [0, 2]) {
      const hi = Math.max(tyre.hi[a], tread.hi[a]),
        lo = Math.min(tyre.lo[a], tread.lo[a]);
      expect(hi).toBeLessThanOrEqual(0.8 + 1e-6);
      expect(hi).toBeGreaterThan(0.78);
      expect(lo).toBeGreaterThanOrEqual(-0.8 - 1e-6);
      expect(lo).toBeLessThan(-0.78);
    }
    expect(tread.hi[1] - tread.lo[1]).toBeCloseTo(0.6, 1);
    expect(named('tread').slot).toBe(SLOT.wheel);
  });

  it('keeps the head about the logic’s head height, the size it was', () => {
    const { lo, hi } = bounds(named('head'));
    // the head was 1.47 deep, 1.92 wide and 1.18 tall over its turn
    expect(hi[0] - lo[0]).toBeGreaterThan(0.9);
    expect(hi[1] - lo[1]).toBeGreaterThan(1.2);
    expect(hi[1] - lo[1]).toBeLessThan(2);
    expect(hi[2]).toBeLessThan(1.4);
    expect(lo[2]).toBeGreaterThan(-0.3);
  });
});
