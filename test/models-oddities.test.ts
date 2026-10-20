/**
 * The oddities' models: each the size the grade reads it as (`SUBJECTS`) in every one of its looks, the duck and the
 * gnome facing +x, every face wound the way its normals point (a bent or squeezed solid is never lit inside out), every
 * part coloured, a gnome's hat and coat by his paint, the UFO's beam reaching the ground under it, and the UFO's bob a
 * small pure motion that makes nothing.
 */
import { describe, expect, it } from 'vitest';
import { kindPieces, partColour, variantOf, variantsOf } from '../src/models/kit';
import { BEAM, ODDITY_PARTS, oddityOf } from '../src/models/oddities';
import { BOB, ufoBob, varyOf } from '../src/world/oddities';
import { BIOME, SUBJECTS, lookOf, paintOf, type Placement, type SubjectKind } from '../src/world/types';
import { heapSwing } from './models-helpers';

const UNDER_MUTATION = process.env.STRYKER_MUTATOR_WORKER !== undefined;
const KINDS = Object.keys(SUBJECTS) as SubjectKind[];
/** Every look of every kind, by its number. */
const LOOKS = KINDS.flatMap((kind) => SUBJECTS[kind].looks.map((name, look) => ({ kind, look, name })));

/**
 * The farthest any point of a model reaches from its upright axis, and its lowest and highest points: of the oddity
 * itself, and not the UFO's beam, which falls under it to the ground and is not in its bounds.
 */
function extent(kind: SubjectKind, look = 0) {
  let reach = 0,
    low = Infinity,
    high = -Infinity;
  for (const { name, mesh } of oddityOf(kind, look).parts) {
    if (name === 'beam') continue;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      reach = Math.max(reach, Math.hypot(mesh.positions[i], mesh.positions[i + 1]));
      low = Math.min(low, mesh.positions[i + 2]);
      high = Math.max(high, mesh.positions[i + 2]);
    }
  }
  return { reach, low, high };
}

/** The middle of a part's points, or of its normals: which way it looks, on the whole. */
function middleOf(kind: SubjectKind, part: string, look = 0, of: 'positions' | 'normals' = 'positions') {
  const mesh = oddityOf(kind, look).parts.find((p) => p.name === part)!.mesh;
  const m = [0, 0, 0];
  const v = mesh[of];
  const n = v.length / 3;
  for (let i = 0; i < v.length; i += 3) for (let a = 0; a < 3; a++) m[a] += v[i + a] / n;
  return m as [number, number, number];
}

describe('the oddities, modelled', () => {
  for (const { kind, look, name } of LOOKS)
    it(`makes a ${kind} ${name} no bigger than the grade reads it as, its foot at its origin`, () => {
      const { reach, low, high } = extent(kind, look);
      const s = SUBJECTS[kind];
      expect(reach).toBeLessThanOrEqual(s.radius);
      expect(high).toBeLessThanOrEqual(s.height);
      // its foot at its origin: a duck a little into the water, a gnome's boots or his coat's hem a hair into the ground
      expect(low).toBeGreaterThanOrEqual(-0.2);
      expect(low).toBeLessThanOrEqual(0.05);
      // and a good part of its bounds filled, no look a speck in a box the grade reads as a whole oddity: a gnome sat
      // down to sleep is three-quarters of his standing height
      expect(reach, 'reach').toBeGreaterThan(s.radius * 0.8);
      expect(high, 'height').toBeGreaterThan(s.height * (kind === 'gnome' && name === 'asleep' ? 0.7 : 0.8));
    });

  for (const kind of KINDS)
    it(`fills a ${kind}'s bounds in its first look, the one it was drawn to`, () => {
      const { reach, high } = extent(kind);
      const s = SUBJECTS[kind];
      expect(reach).toBeGreaterThan(s.radius * 0.85);
      expect(high).toBeGreaterThan(s.height * 0.9);
    });

  it('turns the duck and the gnome to face +x: their eyes and the duck’s bill in front, either side of the middle', () => {
    for (const kind of ['duck', 'gnome'] as const) {
      expect(SUBJECTS[kind].front).toBe(true);
      const [ex, ey] = middleOf(kind, 'eye');
      expect(ex, kind).toBeGreaterThan(0.3);
      expect(Math.abs(ey), kind).toBeLessThan(0.01);
    }
    const bill = middleOf('duck', 'beak'),
      tail = extent('duck');
    expect(bill[0]).toBeGreaterThan(0.8);
    expect(tail.reach).toBeGreaterThan(bill[0]);
    // the gnome's nose is the foremost point of his face
    const skin = oddityOf('gnome').parts.find((p) => p.name === 'skin')!.mesh;
    let nose = -Infinity;
    for (let i = 0; i < skin.positions.length; i += 3)
      if (skin.positions[i + 2] > 2.6) nose = Math.max(nose, skin.positions[i]);
    expect(nose).toBeGreaterThan(0.75);
  });

  for (const { kind, look, name } of LOOKS.filter((l) => SUBJECTS[l.kind].front))
    it(`looks out along +x as a ${kind} ${name}: its eyes face the front, so a front shot is of its face`, () => {
      const [nx, ny, nz] = middleOf(kind, 'eye', look, 'normals');
      const len = Math.hypot(nx, ny, nz);
      expect(nx / len).toBeGreaterThan(0.6);
      expect(Math.abs(ny / len)).toBeLessThan(0.35);
    });

  it('makes each look of a kind its own: no two the same shape', () => {
    for (const kind of KINDS) {
      const shapes = SUBJECTS[kind].looks.map((_, look) =>
        oddityOf(kind, look)
          .parts.map((p) => `${p.name}:${p.mesh.indices.length}:${p.mesh.positions[0].toFixed(4)}`)
          .join(' '),
      );
      expect(new Set(shapes).size, kind).toBe(shapes.length);
    }
  });

  for (const { kind, look, name } of LOOKS)
    it(`winds every face of a ${kind} ${name} the way its normals point, each a unit long`, () => {
      for (const { name, mesh } of oddityOf(kind, look).parts) {
        const p = mesh.positions,
          n = mesh.normals,
          idx = mesh.indices;
        for (let i = 0; i < n.length; i += 3) expect(Math.hypot(n[i], n[i + 1], n[i + 2]), name).toBeCloseTo(1, 4);
        let wrong = 0;
        for (let t = 0; t < idx.length; t += 3) {
          const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
          const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]],
            v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
          const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          if (Math.hypot(f[0], f[1], f[2]) < 1e-9) continue;
          const dot = (k: number) => f[0] * n[k] + f[1] * n[k + 1] + f[2] * n[k + 2];
          if (dot(a) + dot(b) + dot(c) < 0) wrong++;
        }
        expect(wrong, name).toBe(0);
      }
    });

  it('drops the UFO’s beam from under its belly to a pool on the ground below it, out of the bob’s reach', () => {
    const beam = oddityOf('ufo').parts.find((p) => p.name === 'beam')!.mesh;
    let low = Infinity,
      high = -Infinity,
      wide = 0;
    for (let i = 0; i < beam.positions.length; i += 3) {
      low = Math.min(low, beam.positions[i + 2]);
      high = Math.max(high, beam.positions[i + 2]);
      wide = Math.max(wide, Math.hypot(beam.positions[i], beam.positions[i + 1]));
    }
    const drop = SUBJECTS.ufo.hover;
    // the pool's foot over the ground by more than the bob takes the saucer down, and not far over it
    expect(low).toBeGreaterThan(-drop + BOB.height);
    expect(low).toBeLessThan(-drop + BOB.height + 1);
    expect(BEAM.over - 0.2).toBeGreaterThan(BOB.height);
    // from just under the saucer, and inside its rim
    expect(high).toBeLessThan(0);
    expect(high).toBeGreaterThan(-3);
    expect(wide).toBeLessThan(SUBJECTS.ufo.radius);
  });

  /** A placement of `kind` in `look` and `paint`, as the world makes it. */
  const placed = (kind: SubjectKind, look: number, paint: number, biome = BIOME.meadow): Placement => ({
    kind,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    scale: 1,
    biome,
    vary: varyOf({ kind, look, paint }, 0.37),
  });

  it('draws each oddity in the look and paint the world set in its vary', () => {
    for (const { kind, look } of LOOKS) {
      expect(variantsOf(kind)).toBe(SUBJECTS[kind].looks.length);
      for (let paint = 0; paint < SUBJECTS[kind].paints; paint++)
        for (const chance of [0, 0.5, 0.999]) {
          const vary = varyOf({ kind, look, paint }, chance);
          expect(vary).toBeGreaterThanOrEqual(0);
          expect(vary).toBeLessThan(1);
          expect(lookOf(kind, vary), `${kind} ${look} ${paint} ${chance}`).toBe(look);
          expect(paintOf(kind, vary), `${kind} ${look} ${paint} ${chance}`).toBe(paint);
          expect(variantOf({ ...placed(kind, look, paint), vary })).toBe(look);
        }
    }
  });

  it('colours every part of each look, the same in every biome, and a gnome’s hat and coat by his paint', () => {
    const a = new Float32Array(3),
      b = new Float32Array(3);
    const paints = new Set<string>();
    for (const kind of KINDS)
      for (const piece of kindPieces(kind)) {
        const part = ODDITY_PARTS[piece.part];
        expect(part, `${kind} ${piece.part}`).toBeDefined();
        expect(piece.rough).toBe(part.rough);
        for (let paint = 0; paint < SUBJECTS[kind].paints; paint++) {
          const p = placed(kind, piece.variant, paint);
          partColour(kind, piece.part, BIOME.meadow, p.vary, a, 0);
          partColour(kind, piece.part, BIOME.autumn, p.vary, b, 0);
          expect(Array.from(a)).toEqual(Array.from(b));
          const list = part.colours ?? [part.colour];
          if (part.colours) expect(list.length, piece.part).toBe(SUBJECTS[kind].paints);
          const want = list[Math.min(list.length - 1, paint)];
          expect(Array.from(a)).toEqual(Array.from(want).map((c) => Math.fround(c)));
          if (piece.part === 'hat' || piece.part === 'coat') paints.add(`${piece.part} ${Array.from(a).join()}`);
        }
      }
    // five hats and five coats, none the same
    expect(paints.size).toBe(SUBJECTS.gnome.paints * 2);
  });
});

describe("the UFO's bob", () => {
  it('rises and falls by its height about where it was placed, once a period', () => {
    let lo = Infinity,
      hi = -Infinity;
    for (let k = 0; k < 400; k++) {
      const z = ufoBob((k / 400) * BOB.period, 0.3);
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
    expect(hi).toBeCloseTo(BOB.height, 2);
    expect(lo).toBeCloseTo(-BOB.height, 2);
    expect(ufoBob(0, 0)).toBeCloseTo(0, 9);
    expect(ufoBob(BOB.period / 4, 0)).toBeCloseTo(BOB.height, 9);
    for (const t of [0.4, 2.2, 17]) expect(ufoBob(t + BOB.period, 0.6)).toBeCloseTo(ufoBob(t, 0.6), 9);
  });

  it('is a small motion: a tenth of a metre or so, slowly', () => {
    expect(BOB.height).toBeGreaterThan(0.5);
    expect(BOB.height).toBeLessThan(2);
    expect(BOB.period).toBeGreaterThan(2);
  });

  it('keeps two UFOs out of step by their vary, and gives the same height for the same time', () => {
    expect(ufoBob(1, 0.2)).not.toBeCloseTo(ufoBob(1, 0.7), 2);
    expect(ufoBob(1.234, 0.2)).toBe(ufoBob(1.234, 0.2));
  });

  it.skipIf(UNDER_MUTATION)('makes nothing', () => {
    // the time and the sum kept in an array, as a number kept in a closure is made again each time it changes
    const at = new Float64Array(2);
    const swing = heapSwing(() => {
      at[1] += ufoBob(at[0], 0.4);
      at[0] += 0.016;
    });
    expect(Number.isFinite(at[1])).toBe(true);
    expect(swing).toBeLessThan(256 * 1024);
  });
});
