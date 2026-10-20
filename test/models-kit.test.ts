import { describe, expect, it } from 'vitest';
import { BUILT_SIZE, BUILT_VARIANTS, footprintOf } from '../src/models/built';
import {
  BUCKETS,
  HEATHER,
  KitBatch,
  bucketOf,
  bucketYaw,
  farPieces,
  LOW,
  kindPieces,
  kitMatrix,
  lowPieces,
  partColour,
  variantOf,
  variantsOf,
} from '../src/models/kit';
import { BIOME, BIOMES, KINDS, type Kind, type Placement } from '../src/world/types';
import { trianglesOf } from './models-helpers';

/**
 * The most triangles a variant of each kind may have, every part and tier of it: golf's for the five it has (a
 * broadleaf 210, a conifer 60, a fern 40, a boulder at its finer cut 40), and Snappy's own for the rest. A
 * placement is drawn three times a frame, and a wood has thousands. A bush is allowed 100, against golf's 80, for its three shapes (review 1, 18).
 */
const CEILING: Record<Kind, number> = {
  broadleaf: 210,
  conifer: 60,
  twisted: 140,
  bush: 100,
  fern: 40,
  reed: 80,
  flowers: 170,
  boulder: 40,
  cottage: 700,
  church: 700,
  well: 360,
  fence: 130,
  wall: 400,
  tower: 520,
  arch: 260,
  column: 220,
  willow: 220,
  lily: 60,
  fruit: 220,
  stepping: 24,
  post: 30,
  signpost: 30,
  bench: 110,
  lamp: 70,
  haystack: 100,
  cart: 210,
  stall: 320,
  windmill: 160,
  menhir: 50,
};

const placement = (kind: Kind, over: Partial<Placement> = {}): Placement => ({
  kind,
  x: 10,
  y: 20,
  z: 3,
  yaw: 0.4,
  scale: 1,
  biome: BIOME.meadow,
  vary: 0.3,
  ...over,
});

describe('the kit', () => {
  for (const kind of KINDS)
    it(`makes every variant of a ${kind}, each under its ceiling of triangles`, () => {
      const pieces = kindPieces(kind);
      for (let v = 0; v < variantsOf(kind); v++) {
        const mine = pieces.filter((p) => p.variant === v);
        expect(mine.length, `variant ${v}`).toBeGreaterThan(0);
        const n = mine.reduce((s, p) => s + trianglesOf(p.mesh), 0);
        expect(n, `variant ${v}`).toBeLessThanOrEqual(CEILING[kind]);
      }
    });

  it('keeps a far tree to the backdrop’s thirty triangles', () => {
    for (const p of farPieces()) {
      expect(trianglesOf(p.mesh)).toBeLessThanOrEqual(30);
      expect(p.far).toBe(true);
    }
  });

  it('makes a tree in a bucket of turn for each sixth of a turn, and the buckets wrap', () => {
    expect(variantsOf('broadleaf')).toBe(BUCKETS);
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(bucketYaw(2))).toBe(2);
    expect(bucketOf(-Math.PI / 3)).toBe(BUCKETS - 1);
    expect(bucketOf(Math.PI * 2 + 0.1)).toBe(0);
  });

  it('chooses a variant there is, for any placement', () => {
    for (const kind of KINDS)
      for (let k = 0; k < 40; k++) {
        const v = variantOf(placement(kind, { yaw: k * 0.7 - 10, vary: (k * 0.137) % 1 }));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(variantsOf(kind));
      }
  });

  it('uses every variant of a built kind over the range of vary', () => {
    for (const kind of ['cottage', 'wall', 'fence'] as const) {
      const seen = new Set<number>();
      for (let k = 0; k < 200; k++) seen.add(variantOf(placement(kind, { vary: k / 200 })));
      expect(seen.size).toBe(BUILT_VARIANTS[kind]);
    }
  });

  it("colours a tree's leaves by its biome: autumn's are not the meadow's", () => {
    const out = new Float32Array(3);
    const leaf = (biome: number, vary: number) => {
      partColour('broadleaf', 'leaves', biome as Placement['biome'], vary, out, 0);
      return Array.from(out);
    };
    for (const vary of [0.1, 0.5, 0.9]) {
      const meadow = leaf(BIOME.meadow, vary),
        autumn = leaf(BIOME.autumn, vary);
      // an autumn leaf is redder than it is green; a meadow's is greener than it is red
      expect(autumn[0]).toBeGreaterThan(meadow[0]);
      expect(meadow[1]).toBeGreaterThan(meadow[0]);
    }
    for (let b = 0; b < BIOMES; b++) for (const c of leaf(b, 0.5)) expect(c).toBeGreaterThan(0);
  });

  it('draws a tree at its bucket’s turn, and a building at its own', () => {
    const m = new Float32Array(16);
    kitMatrix(placement('broadleaf', { yaw: 0.4 }), { size: 1, far: false }, m, 0);
    expect(Math.atan2(m[1], m[0])).toBeCloseTo(0, 6);
    kitMatrix(placement('cottage', { yaw: 0.4 }), { size: 1, far: false }, m, 0);
    expect(Math.atan2(m[1], m[0])).toBeCloseTo(0.4, 6);
    expect(m[12]).toBe(10);
    expect(m[13]).toBe(20);
  });

  it('draws a heath bush low and wide, and a meadow bush round', () => {
    const m = new Float32Array(16);
    kitMatrix(placement('bush', { yaw: 0, biome: BIOME.heath }), { size: 1, far: false }, m, 0);
    expect(m[0]).toBeCloseTo(HEATHER.wide, 6);
    expect(m[10]).toBeCloseTo(HEATHER.tall, 6);
    kitMatrix(placement('bush', { yaw: 0, biome: BIOME.meadow }), { size: 1, far: false }, m, 0);
    expect(m[0]).toBeCloseTo(1, 6);
    expect(m[10]).toBeCloseTo(1, 6);
  });

  it('gathers placements into their pieces’ groups, and empties them', () => {
    const batch = new KitBatch(kindPieces('broadleaf').concat(kindPieces('cottage')), () => 4);
    expect(batch.add(placement('broadleaf'))).toBe(true);
    expect(batch.add(placement('cottage'))).toBe(true);
    // a kind with no pieces in the batch is not drawn
    expect(batch.add(placement('fern'))).toBe(false);
    const live = batch.live();
    expect(live.length).toBeGreaterThan(0);
    for (const g of live) {
      expect(g.count).toBe(1);
      expect(g.materials![3]).toBeGreaterThan(0);
    }
    batch.clear();
    expect(batch.live()).toEqual([]);
  });

  it('shrinks a placement out of sight where it was added, and back, marking only its own groups', () => {
    const batch = new KitBatch(kindPieces('broadleaf'), () => 4);
    const a = placement('broadleaf', { yaw: 0 }),
      b = placement('broadleaf', { yaw: 0, x: 50 });
    batch.add(a);
    batch.add(b);
    const at = batch.lastIndex;
    expect(at).toBe(1);
    batch.dirty.fill(0);
    batch.shrink[0] = 0;
    batch.resize(b, at);
    const mine = batch.groups.filter((_, i) => batch.dirty[i]);
    expect(mine.length).toBeGreaterThan(0);
    for (const g of mine) {
      expect(g.matrices[at * 16]).toBe(0);
      // the other tree is as it was, and the shrunk one stands where it did
      expect(g.matrices[0]).not.toBe(0);
      expect(g.matrices[at * 16 + 12]).toBe(50);
    }
    batch.shrink[0] = 1;
    batch.resize(b, at);
    for (const g of mine) expect(g.matrices[at * 16]).toBeCloseTo(g.matrices[0], 6);
    for (const g of batch.groups.filter((_, i) => !batch.dirty[i])) expect(g.count).toBe(0);
  });

  it('squashes a placement upright only, its width as it was, when only the second shrink is set', () => {
    const batch = new KitBatch(kindPieces('cottage'), () => 2);
    const p = placement('cottage', { yaw: 0, scale: 2 });
    batch.add(p);
    const before = batch.groups[0].matrices[0];
    batch.shrink[1] = 0.25;
    batch.resize(p, 0);
    expect(batch.groups[0].matrices[0]).toBeCloseTo(before, 6);
    expect(batch.groups[0].matrices[10]).toBeCloseTo(0.5, 6);
    // and the next placement written after it is not squashed by what was left set
    batch.shrink[1] = 1;
    batch.add(p);
    expect(batch.groups[0].matrices[16 + 10]).toBeCloseTo(2, 6);
  });

  it('refuses a placement once a group of its is full, rather than writing past it', () => {
    const batch = new KitBatch(kindPieces('cottage'), () => 2);
    const p = placement('cottage');
    expect(batch.add(p)).toBe(true);
    expect(batch.add(p)).toBe(true);
    expect(batch.add(p)).toBe(false);
    for (const g of batch.live()) expect(g.count).toBe(2);
  });

  it('says how big each built kind is, for the world to mark solid', () => {
    for (const k of Object.values(BUILT_SIZE)) {
      expect(k.hx).toBeGreaterThan(0);
      expect(k.hy).toBeGreaterThan(0);
      expect(k.height).toBeGreaterThan(0);
    }
  });
});

describe('the low variants, drawn while a thing is cut out of the camera’s way', () => {
  const capOf = (pieces: ReturnType<typeof lowPieces>, v: number, z: number) =>
    pieces
      .filter((p) => p.variant === v && p.mesh.normals.every((c, i) => i % 3 !== 2 || c === 1))
      .filter((p) => {
        for (let i = 2; i < p.mesh.positions.length; i += 3) if (Math.abs(p.mesh.positions[i] - z) > 1e-4) return false;
        return true;
      });

  for (const kind of ['broadleaf', 'conifer', 'twisted', 'willow', 'fruit'] as const)
    it(`cuts every variant of a ${kind} to a knee-high clump in its crown's colour`, () => {
      const pieces = lowPieces(kind);
      for (let v = 0; v < variantsOf(kind); v++) {
        const mine = pieces.filter((p) => p.variant === v);
        expect(mine.length, `variant ${v}`).toBe(1);
        expect(mine[0].part).toBe('leaves');
        let top = 0;
        for (let i = 2; i < mine[0].mesh.positions.length; i += 3) top = Math.max(top, mine[0].mesh.positions[i]);
        expect(top).toBeLessThanOrEqual(LOW.clump + 0.5);
        expect(top).toBeGreaterThan(LOW.clump * 0.6);
      }
    });

  for (const kind of ['cottage', 'church', 'tower', 'arch', 'wall', 'windmill'] as const)
    it(`cuts every variant of a ${kind} to its walls' feet, capped, and keeps no roof`, () => {
      const pieces = lowPieces(kind);
      for (let v = 0; v < BUILT_VARIANTS[kind]; v++) {
        const mine = pieces.filter((p) => p.variant === v);
        for (const p of mine) {
          expect(p.part).not.toBe('roof');
          for (let i = 2; i < p.mesh.positions.length; i += 3)
            expect(p.mesh.positions[i]).toBeLessThanOrEqual(LOW.built + 1e-4);
        }
        expect(capOf(pieces, v, LOW.built).length, `${kind} ${v} capped`).toBe(1);
      }
    });

  it('caps an arch’s two piers apart, leaving the way between them open', () => {
    const cap = lowPieces('arch').find((p) => p.part === 'stoneDark' && p.mesh.normals[2] === 1)!;
    for (let i = 0; i < cap.mesh.positions.length; i += 3) expect(Math.abs(cap.mesh.positions[i])).toBeGreaterThan(5);
  });
});

describe('what is built', () => {
  /** How high the rover stands, in units: what is drawn under this must be on ground the world has marked solid. */
  const ROVER_HIGH = 6;

  for (const kind of Object.keys(BUILT_SIZE) as (keyof typeof BUILT_SIZE)[])
    it(`keeps a ${kind} inside the world's footprint for it, up to the rover's height, and under its height`, () => {
      const { height } = BUILT_SIZE[kind];
      const rects = footprintOf(kind);
      // within a rectangle of the footprint, a tile's diagonal of slack, since the world marks whole tiles under it
      const inside = (x: number, y: number) =>
        rects.some(([mx, my, rx, ry]) => Math.abs(x - mx) <= rx + 0.6 && Math.abs(y - my) <= ry + 0.6);
      for (let v = 0; v < BUILT_VARIANTS[kind]; v++) {
        let top = 0,
          out = 0;
        for (const p of kindPieces(kind).filter((p) => p.variant === v))
          for (let i = 0; i < p.mesh.positions.length; i += 3) {
            const [x, y, z] = [p.mesh.positions[i], p.mesh.positions[i + 1], p.mesh.positions[i + 2]];
            top = Math.max(top, z);
            if (z < ROVER_HIGH && !inside(x, y)) out++;
          }
        expect(out, `${kind} ${v}: points low down outside the footprint`).toBe(0);
        expect(top, `${kind} ${v} up`).toBeLessThanOrEqual(height);
      }
    });
});
