/**
 * The world past its edge, as golf has it past a hole (ooergolf's
 * `backdrop.ts`): a ring of faceted green hills rising from the world's own
 * edge, blue mountains behind them, far trees in clumps on the hills, and a
 * sea at the water's level from the edge out, so where the world's edge is
 * deep water the water runs on to the foot of the hills. There is no wall:
 * the world simply stops being reachable where the ground does.
 *
 * Golf's ring is round, about a hole's middle; the world is square, so the
 * ring here starts on the world's edge itself (its first points are on the
 * edge, at the edge's own height, so the hills rise straight out of it) and
 * rounds out as it goes. Worked out from the map alone, never from chance.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { frustum, lump, seeded } from 'artshape-render/mesh/lowpoly';
import { SUN } from '../sun';
import type { Ground, WorldMap } from '../world/types';
import { TIERS, split } from './shape';
import type { GameGroup } from 'artshape-render/game/renderer';
import { BACKDROP_COLOURS, ROUGH, WATER, type Rgb } from './palette';
import { oceanPattern } from './water';

/**
 * The backdrop's figures: how deep the ring of hills is, in units; how far behind the hills the mountains begin
 * (`gap`), and how deep their range is; the hills' rings and how many points round each (a multiple of eight, so a
 * world's corners are points of the first ring); the least and the most a hill rises; a mountain's; and how many far
 * trees, in how many clumps. The world is only 200 m across, so a mountain as high as these (24 to 57 m) has to stand
 * well back, a few hundred metres off, to look like a mountain in the distance and not a wall at the end of the garden.
 */
export const BACKDROP = {
  depth: 900,
  gap: 1400,
  mountains: 2600,
  rings: 9,
  around: 160,
  peaks: 48,
  hill: [15, 100],
  mountain: [240, 330],
  forest: 900,
  clumps: 60,
} as const;

/** A far tree on the hills: which kind, and where, turned and scaled. */
export interface FarTree {
  kind: 'conifer' | 'broadleaf';
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface Backdrop {
  /**
   * The hills, cut into golf's three tiers of baked light by how far each face looks toward the sun (`shape.ts`), so
   * their facets read from afar as the title picture's do: the sunward faces a light green, the far ones a deep one.
   * Each is `BACKDROP_COLOURS.hill` times its tier's `TIERS.leaf` factor.
   */
  hills: Mesh[];
  /**
   * The mountains, cut into the same three tiers of light as the hills, so their faces read as rock in the sun and in
   * the shade; and a second range behind them, paler, as far mountains are, into the haze.
   */
  mountains: Mesh[];
  range: Mesh;
  /**
   * The foothills: a ring of low dark peaks between the hills and the mountains, the nearest of the three ranges, so
   * the mountains stand as layered silhouettes, darkest near and palest far (review 2, 12).
   */
  foothills: Mesh;
  /** The mountains' snowy tops, the faces of them over the snow line, which is ragged as a real one is. */
  snow: Mesh;
  sea: Mesh;
  forest: FarTree[];
  /** The far trees' own meshes, a unit tall: a conifer of three tiers, and a broadleaf's ball on its stem. */
  trees: { conifer: Mesh; broadleaf: Mesh };
}

/**
 * The far trees' meshes, a unit tall, of twenty to thirty triangles each, where golf's sixteen read from the hills as
 * a field of spikes (review 1, 10): a conifer as three cones of seven sides stacked, and a broadleaf as a lumpy ball on
 * a short three-sided stem.
 */
export function farTreeMeshes(): { conifer: Mesh; broadleaf: Mesh } {
  const conifer = new MeshBuilder();
  for (let k = 0; k < 3; k++) {
    const z = 0.12 + k * 0.26,
      r = 0.34 - k * 0.08;
    frustum(conifer, (q) => [q[0], q[1], q[2] + z], 7, r, 0, 0, 0.46 - k * 0.05, { bottom: false });
  }
  const broadleaf = new MeshBuilder();
  frustum(broadleaf, (q) => q, 3, 0.06, 0.05, 0, 0.35, { top: false, bottom: false });
  lump(broadleaf, (q) => [q[0], q[1], q[2] + 0.62], seeded(7), 3, 6, [0.36, 0.36, 0.38], { give: 0.12 });
  return { conifer: conifer.build(), broadleaf: broadleaf.build() };
}

/** A smooth bumpy height round the ring, nought to one, from sines with seeded phases: the hills' shape (golf's). */
function ridge(seed: number): (a: number) => number {
  const r = seeded(seed);
  const waves = Array.from({ length: 6 }, (_, k) => ({
    f: 2 + k * 2 + Math.floor(r() * 3),
    p: r() * Math.PI * 2,
    w: 1 / (1 + k * 0.7),
  }));
  const total = waves.reduce((s, w) => s + w.w, 0);
  return (a) => 0.5 + (0.5 * waves.reduce((s, w) => s + w.w * Math.sin(w.f * a + w.p), 0)) / total;
}

type V3 = [number, number, number];

/** A flat-shaded triangle of a height field, wound so it faces up whichever way its points were given. */
function tri(b: MeshBuilder, p0: V3, p1: V3, p2: V3) {
  const ux = p1[0] - p0[0],
    uy = p1[1] - p0[1],
    uz = p1[2] - p0[2],
    vx = p2[0] - p0[0],
    vy = p2[1] - p0[1],
    vz = p2[2] - p0[2];
  let nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const flip = nz < 0;
  const l = (Math.hypot(nx, ny, nz) || 1) * (flip ? -1 : 1);
  nx /= l;
  ny /= l;
  nz /= l;
  const [q1, q2] = flip ? [p2, p1] : [p1, p2];
  const i = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(q1[0], q1[1], q1[2], nx, ny, nz, 1, 0);
  b.vertex(q2[0], q2[1], q2[2], nx, ny, nz, 0, 1);
  b.triangle(i, i + 1, i + 2);
}

/** The part of a convex polygon over the height `z` (`side` one) or under it (minus one), cut where its edges cross it. */
function cut(points: V3[], z: number, side: 1 | -1): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const da = side * (a[2] - z),
      db = side * (b[2] - z);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const u = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z]);
    }
  }
  return out;
}

/** The backdrop round `map`, on its ground. */
export function backdropOf(map: WorldMap, ground: Ground): Backdrop {
  const { minX, minY, maxX, maxY } = ground.bounds;
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const hx = (maxX - minX) / 2,
    hy = (maxY - minY) / 2;
  const random = seeded(4242);
  const { rings, around } = BACKDROP;
  // how far the world's edge is from its middle at angle `a`: the rectangle's, so the first ring lies on it
  const edge = (a: number) =>
    Math.min(hx / Math.max(1e-9, Math.abs(Math.cos(a))), hy / Math.max(1e-9, Math.abs(Math.sin(a))));
  // the edge's own height, read just inside it
  const edgeHeight = (a: number) => {
    const r = edge(a) - 0.01;
    return ground.heightAt(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  };
  const shape = ridge(31),
    peaks = ridge(32);
  // ring k's distance out at angle a: from the edge, out by the depth, rounding out as it goes
  const radius = (a: number, k: number) => edge(a) + (BACKDROP.depth * k) / rings;
  const height = (a: number, k: number) => {
    const t = k / rings;
    const base = edgeHeight(a);
    const rise =
      (BACKDROP.hill[0] + BACKDROP.hill[1] * shape(a + t * 0.6)) * Math.sin(t * Math.PI * 0.95) * (0.3 + 0.7 * t);
    // the hills rise from the edge's height, or from the water's where the edge is under it, so they meet the sea
    return Math.max(base, map.waterLevel - 2) + rise;
  };
  const hills = new MeshBuilder();
  const hp = (i: number, k: number): V3 => {
    // every ring's points at the same angles, so the first ring's are on the world's corners
    const a = (i / around) * Math.PI * 2;
    const r = radius(a, k);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, k === 0 ? edgeHeight(a) : height(a, k)];
  };
  for (let k = 0; k < rings; k++)
    for (let i = 0; i < around; i++) {
      const flip = (i + k) % 2 === 0;
      if (flip) {
        tri(hills, hp(i, k), hp(i + 1, k), hp(i + 1, k + 1));
        tri(hills, hp(i, k), hp(i + 1, k + 1), hp(i, k + 1));
      } else {
        tri(hills, hp(i, k), hp(i + 1, k), hp(i, k + 1));
        tri(hills, hp(i + 1, k), hp(i + 1, k + 1), hp(i, k + 1));
      }
    }
  // the mountains: one ring of faceted peaks behind the hills, from their back out
  const mountains = new MeshBuilder(),
    range = new MeshBuilder(),
    foothills = new MeshBuilder(),
    snow = new MeshBuilder();
  const M = BACKDROP.peaks;
  const back = (a: number) => radius(a, rings) + BACKDROP.gap;
  const mp = (i: number, k: 0 | 1 | 2): V3 => {
    const a = (i / M) * Math.PI * 2 + (k === 1 ? Math.PI / M : 0);
    const r = k === 0 ? back(a) : k === 1 ? back(a) + BACKDROP.mountains * 0.45 : back(a) + BACKDROP.mountains;
    const h = k === 1 ? BACKDROP.mountain[0] + BACKDROP.mountain[1] * peaks(a) : k === 0 ? 0 : 120;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, map.waterLevel + h];
  };
  // the snow line, high, so only the taller peaks are capped: with every peak capped, the range seen from the far zoom
  // was one white table along its top (review 3, 2); a smooth noise and a little more face by face lift and drop it
  const snowLine = map.waterLevel + BACKDROP.mountain[0] + BACKDROP.mountain[1] * 0.62;
  const jag = seeded(33);
  // a face cut at its snow line: what is over it snow, what is under it rock
  const snowy = ridge(34);
  const peak = (p0: V3, p1: V3, p2: V3) => {
    // the line by a smooth noise round the ring, and a little more face by face, so it dips and climbs along the range
    const a = Math.atan2((p0[1] + p1[1] + p2[1]) / 3 - cy, (p0[0] + p1[0] + p2[0]) / 3 - cx);
    const line = snowLine + (snowy(a * 3) - 0.5) * 160 + (jag() - 0.5) * 12;
    const under = cut([p0, p1, p2], line, -1),
      over = cut([p0, p1, p2], line, 1);
    for (let k = 1; k + 1 < under.length; k++) tri(mountains, under[0], under[k], under[k + 1]);
    for (let k = 1; k + 1 < over.length; k++) tri(snow, over[0], over[k], over[k + 1]);
  };
  // each face of the front range split in two at a point a little off its middle, so a slope is two facets and not
  // one great plane
  const facet = (p0: V3, p1: V3, p2: V3) => {
    const m: V3 = [
      (p0[0] + p1[0]) / 2 + (jag() - 0.5) * 60,
      (p0[1] + p1[1]) / 2 + (jag() - 0.5) * 60,
      (p0[2] + p1[2]) / 2 + (jag() - 0.5) * 50,
    ];
    peak(p0, m, p2);
    peak(m, p1, p2);
  };
  for (let i = 0; i < M; i++) {
    facet(mp(i, 0), mp(i + 1, 0), mp(i, 1));
    facet(mp(i + 1, 1), mp(i, 1), mp(i + 1, 0));
    peak(mp(i, 1), mp(i + 1, 1), mp(i + 1, 2));
    peak(mp(i, 1), mp(i + 1, 2), mp(i, 2));
  }
  // the far range: a second ring of lower, broader peaks behind, turned half a peak, all one pale colour
  const R = Math.round(M * 0.75);
  const rp = (i: number, k: 0 | 1): V3 => {
    const a = (i / R) * Math.PI * 2 + (k === 1 ? Math.PI / R : 0) + 0.11;
    const r = back(a) + BACKDROP.mountains * (k === 0 ? 0.5 : 0.95);
    const h = k === 1 ? BACKDROP.mountain[0] * 0.9 + BACKDROP.mountain[1] * 1.1 * peaks(a * 1.7 + 1) : 60;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, map.waterLevel + h];
  };
  for (let i = 0; i < R; i++) {
    tri(range, rp(i, 0), rp(i + 1, 0), rp(i, 1));
    tri(range, rp(i + 1, 0), rp(i + 1, 1), rp(i, 1));
  }
  // the foothills: lower, nearer peaks at the hills' back, turned a third of a peak from the mountains
  const F = Math.round(M * 1.5);
  const fp = (i: number, k: 0 | 1 | 2): V3 => {
    const a = (i / F) * Math.PI * 2 + (k === 1 ? Math.PI / F : 0) + 0.07;
    const r = back(a) - BACKDROP.gap * (k === 0 ? 0.75 : k === 1 ? 0.45 : 0.1);
    const h = k === 1 ? 90 + 120 * peaks(a * 2.3 + 2) : k === 0 ? 0 : 60;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, map.waterLevel + h];
  };
  for (let i = 0; i < F; i++) {
    tri(foothills, fp(i, 0), fp(i + 1, 0), fp(i, 1));
    tri(foothills, fp(i + 1, 0), fp(i + 1, 1), fp(i, 1));
    tri(foothills, fp(i, 1), fp(i + 1, 1), fp(i + 1, 2));
    tri(foothills, fp(i, 1), fp(i + 1, 2), fp(i, 2));
  }
  // the sea: a flat ring at the water's level from the world's edge out under the hills and on to the mountains, a
  // little under the level so the world's own water meets it without a seam
  const sea = new MeshBuilder();
  const z = map.waterLevel - 0.05;
  const S = 32;
  for (let i = 0; i < S; i++) {
    const a0 = (i / S) * Math.PI * 2,
      a1 = ((i + 1) / S) * Math.PI * 2;
    const p = (a: number, r: number): V3 => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    const far = Math.hypot(hx, hy) + BACKDROP.depth + BACKDROP.gap + 200;
    tri(sea, p(a0, edge(a0)), p(a1, edge(a1)), p(a1, far));
    tri(sea, p(a0, edge(a0)), p(a1, far), p(a0, far));
  }
  // the forest, in clumps on the hills, bigger the further out
  const forest: FarTree[] = [];
  const clumps = Array.from({ length: BACKDROP.clumps }, () => [random() * Math.PI * 2, 0.6 + random() * (rings - 2)]);
  for (let n = 0; n < BACKDROP.forest; n++) {
    const [ca, ck] = clumps[n % clumps.length];
    const a = ca + (random() - 0.5) * 0.1;
    const k = Math.min(rings - 0.8, Math.max(0.4, ck + (random() - 0.5) * 1.1));
    const kind = random() < 0.6 ? 'conifer' : 'broadleaf';
    const yaw = random() * Math.PI * 2,
      grow = random();
    const r = radius(a, k);
    const zt = height(a, Math.floor(k)) + (height(a, Math.ceil(k)) - height(a, Math.floor(k))) * (k - Math.floor(k));
    if (zt < map.waterLevel + 1) continue;
    forest.push({
      kind,
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      z: zt - 2,
      yaw,
      scale: 45 + grow * 30 + k * 6,
    });
  }
  const l = Math.hypot(SUN[0], SUN[1], SUN[2]);
  const toSun: [number, number, number] = [SUN[0] / l, SUN[1] / l, SUN[2] / l];
  return {
    hills: split(hills.build(), toSun, TIERS.leaf),
    mountains: split(mountains.build(), toSun, TIERS.leaf),
    range: range.build(),
    foothills: foothills.build(),
    trees: farTreeMeshes(),
    snow: snow.build(),
    sea: sea.build(),
    forest,
  };
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * The backdrop's groups, as the game and the preview both draw it: the hills and the front range in their tiers of
 * light, the far range paler, the snow, the sea, and the far trees each a shade of their kind's green. None casts a
 * shadow, and only the hills and the sea are in the contact shade's pass, since nothing further off shows any.
 */
export function backdropGroups(back: Backdrop): GameGroup[] {
  const tiered = (base: Rgb, k: number) => base.map((c, i) => c * TIERS.leaf[k].mul[i]) as [number, number, number];
  const groups: GameGroup[] = [
    ...back.hills.map((mesh, k) => ({
      mesh,
      matrices: IDENTITY,
      albedo: tiered(BACKDROP_COLOURS.hill, k),
      roughness: ROUGH.leaves,
      shadow: false,
    })),
    ...back.mountains.map((mesh, k) => ({
      mesh,
      matrices: IDENTITY,
      albedo: tiered(BACKDROP_COLOURS.mountain, k),
      roughness: ROUGH.stone,
      shadow: false,
      occlusion: false,
    })),
    {
      mesh: back.foothills,
      matrices: IDENTITY,
      albedo: [...BACKDROP_COLOURS.mountainNear],
      roughness: ROUGH.stone,
      shadow: false,
      occlusion: false,
    },
    {
      mesh: back.range,
      matrices: IDENTITY,
      albedo: [...BACKDROP_COLOURS.mountainFar],
      roughness: ROUGH.stone,
      shadow: false,
      occlusion: false,
    },
    {
      mesh: back.sea,
      matrices: IDENTITY,
      albedo: [...WATER.deep],
      roughness: 0.08,
      patterns: oceanPattern(),
      shadow: false,
    },
    {
      mesh: back.snow,
      matrices: IDENTITY,
      albedo: [...BACKDROP_COLOURS.snow],
      roughness: ROUGH.stone,
      shadow: false,
      occlusion: false,
    },
  ];
  for (const kind of ['conifer', 'broadleaf'] as const) {
    const trees = back.forest.filter((t) => t.kind === kind);
    const matrices = new Float32Array(Math.max(1, trees.length) * 16),
      materials = new Float32Array(Math.max(1, trees.length) * 4);
    const base = kind === 'conifer' ? BACKDROP_COLOURS.farTree : BACKDROP_COLOURS.farLeaf;
    trees.forEach((t, i) => {
      const c = Math.cos(t.yaw) * t.scale,
        s = Math.sin(t.yaw) * t.scale;
      matrices.set([c, s, 0, 0, -s, c, 0, 0, 0, 0, t.scale, 0, t.x, t.y, t.z, 1], i * 16);
      const shade = 0.85 + 0.3 * ((i * 0.618) % 1);
      materials.set([base[0] * shade, base[1] * shade, base[2] * shade, ROUGH.leaves], i * 4);
    });
    groups.push({ mesh: back.trees[kind], matrices, materials, count: trees.length, shadow: false, occlusion: false });
  }
  return groups.filter((g) => g.mesh.indices.length > 0);
}
