/**
 * The ground as it is drawn, a chunk at a time: the smooth terrain under
 * each tile at the tile's own step, an upright face of rock wherever two
 * tiles' steps differ, and the rock of an outcrop raised in faceted blocks.
 *
 * A chunk is meshed at one of a few levels of detail (`LOD`): near, a vertex
 * every 2 units, so a slope's curve and the rover's wheels on it agree; mid, a
 * vertex a tile; and far, one every two tiles with no faces for the steps,
 * for chunks too far off to see either.
 *
 * The renderer colours a group and not a vertex, so the ground's colour is
 * not in the mesh at all: it is a picture of the whole world (`groundTexels`),
 * a texel every couple of units, which the ground wears as the renderer's
 * ground texture by world position (golf lays its turf's grain the same way).
 * Every chunk is then one group however many biomes and surfaces cross it,
 * the biomes blend smoothly over their tens of metres, and a road's edge is
 * as smooth as its line, where golf cuts its ground into a mesh a zone.
 */
import type { GameGroup } from 'artshape-render/game/renderer';
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { TEXTURE_STRIDE, packTexture } from 'artshape-render/game/texture';
import { sampleTerrain } from '../physics';
import { BIOMES, BUILT, CHUNK, DRIVE, SURFACE, SURFACES, type WorldMap } from '../world/types';
import { BUILT_SIZE, type BuiltKind } from './built';
import { BIOME_GROUND, ROCK, ROUGH, SURFACE_GROUND, type Rgb } from './palette';

/** The levels of detail a chunk is meshed at: units between vertices. */
export const LOD = { near: 2, mid: 6, far: 12 } as const;
export type Lod = keyof typeof LOD;

/** A chunk's meshes: its ground, the faces between its steps, and its rock's tops and sides, each one colour. */
export interface ChunkMeshes {
  ground: Mesh;
  cliff: Mesh;
  rockTop: Mesh;
  rockSide: Mesh;
  /** The rock's tops in patches of lichen: a share of the faces that face up, chosen by where they are. */
  rockLichen: Mesh;
}

/** How many chunks the world is cut into, each way. */
export function chunksOf(map: WorldMap): { cols: number; rows: number } {
  return { cols: Math.ceil(map.grid.cols / CHUNK), rows: Math.ceil(map.grid.rows / CHUNK) };
}

/** A small integer hash to a number in [0, 1): what makes a rock's facets, the same every time. */
function hash01(a: number, b: number, seed = 0): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Which tiles are rock, to be raised as an outcrop: solid stone not under anything built. Something built stands on
 * the ground as it is, and its own footprint is solid too, so it is told apart by the built placements' footprints.
 */
export function rockOf(map: WorldMap): Uint8Array {
  const { cols, rows, originX, originY, tile } = map.grid;
  const rock = new Uint8Array(cols * rows);
  for (let t = 0; t < cols * rows; t++) rock[t] = map.solid[t] && map.surface[t] === SURFACE.stone ? 1 : 0;
  for (const p of map.placements) {
    if (!BUILT.has(p.kind)) continue;
    const { hx, hy } = BUILT_SIZE[p.kind as BuiltKind];
    // the footprint's box, turned, and every tile under it
    const c = Math.abs(Math.cos(p.yaw)),
      s = Math.abs(Math.sin(p.yaw));
    const ex = (hx * c + hy * s) * p.scale,
      ey = (hx * s + hy * c) * p.scale;
    const x0 = Math.max(0, Math.floor((p.x - ex - originX) / tile)),
      x1 = Math.min(cols - 1, Math.floor((p.x + ex - originX) / tile));
    const y0 = Math.max(0, Math.floor((p.y - ey - originY) / tile)),
      y1 = Math.min(rows - 1, Math.floor((p.y + ey - originY) / tile));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) rock[ty * cols + tx] = 0;
  }
  return rock;
}

/** How far an outcrop's top stands over the ground at its corners: low at its rim, higher where rock is all round. */
/** The share of an outcrop's upward faces in lichen. */
const LICHEN = 0.3;

/**
 * How steep stone ground must be, as height over run, to be painted a bank's bare face: from `from`, wholly by `to`.
 * About the steepest grade the rover climbs (`DRIVE.maxSlope`): a little under it the face begins, a little over it
 * it is whole, so what is painted a face is what the rover cannot climb.
 */
const FACE = {
  from: Math.tan((DRIVE.maxSlope * Math.PI) / 180) * 0.85,
  to: Math.tan((DRIVE.maxSlope * Math.PI) / 180) * 1.15,
} as const;

const ROCK_RISE = { rim: [1.2, 2.4], inner: [3.2, 4.5] } as const;
/**
 * How far an outcrop's top corners are pushed off the tile's corner, either way, in units: at its rim, so its faces lean
 * and turn and an outcrop reads as crags and not as a stack of boxes on the tile grid; and a little inside it.
 */
const ROCK_JITTER = { rim: 1.3, inner: 0.7 } as const;

/** How far a chunk's skirt hangs below its edge, in units: more than two levels of detail ever part by there. */
const SKIRT = 3;

/**
 * The meshes of chunk (cx, cy) at `lod`. `rock` is `rockOf(map)`, worked out once for every chunk. A vertex of the
 * ground is at the smooth terrain's height there plus its tile's step, and its normal is the terrain's; the steps'
 * faces stand on the higher tile's edge and face the lower.
 */
export function chunkMeshes(map: WorldMap, cx: number, cy: number, lod: Lod, rock: Uint8Array): ChunkMeshes {
  const { cols, rows, originX, originY, tile } = map.grid;
  const grid = map.grid;
  const ground = new MeshBuilder(),
    cliff = new MeshBuilder(),
    rocks = new MeshBuilder();
  const tx0 = cx * CHUNK,
    ty0 = cy * CHUNK,
    tx1 = Math.min(cols, tx0 + CHUNK),
    ty1 = Math.min(rows, ty0 + CHUNK);
  const s = new Float64Array(3);
  const step = LOD[lod];
  const stepAt = (tx: number, ty: number) =>
    tx < 0 || ty < 0 || tx >= cols || ty >= rows ? 0 : map.steps[ty * cols + tx];
  const rockAt = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < cols && ty < rows && rock[ty * cols + tx] === 1;

  /** A vertex of the ground at (x, y) on a tile of step `up`. */
  const vertex = (b: MeshBuilder, x: number, y: number, up: number) => {
    sampleTerrain(map.terrain, grid, x, y, s);
    const l = Math.hypot(s[1], s[2], 1);
    return b.vertex(x, y, s[0] + up, -s[1] / l, -s[2] / l, 1 / l, 0, 0);
  };

  if (step >= tile * 2) {
    // far: a grid over the chunk a vertex every `step`, at the ground's height there, its steps and all
    const n = Math.ceil(((tx1 - tx0) * tile) / step),
      m = Math.ceil(((ty1 - ty0) * tile) / step);
    const base = ground.vertexCount;
    for (let j = 0; j <= m; j++)
      for (let i = 0; i <= n; i++) {
        const x = Math.min(originX + tx1 * tile, originX + tx0 * tile + i * step),
          y = Math.min(originY + ty1 * tile, originY + ty0 * tile + j * step);
        const ttx = Math.min(cols - 1, Math.floor((x - originX) / tile - 1e-6)),
          tty = Math.min(rows - 1, Math.floor((y - originY) / tile - 1e-6));
        vertex(ground, x, y, stepAt(Math.max(0, ttx), Math.max(0, tty)));
      }
    for (let j = 0; j < m; j++)
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        ground.quad(a, a + 1, a + n + 2, a + n + 1);
      }
  } else {
    const k = Math.round(tile / step);
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        if (rockAt(tx, ty)) continue;
        const up = stepAt(tx, ty);
        const x0 = originX + tx * tile,
          y0 = originY + ty * tile;
        const base = ground.vertexCount;
        for (let j = 0; j <= k; j++) for (let i = 0; i <= k; i++) vertex(ground, x0 + i * step, y0 + j * step, up);
        for (let j = 0; j < k; j++)
          for (let i = 0; i < k; i++) {
            const a = base + j * (k + 1) + i;
            // the diagonal alternates, so a slope's facets do not all lean one way
            if ((i + j + tx + ty) % 2) ground.quad(a, a + 1, a + k + 2, a + k + 1);
            else ground.quad(a + 1, a + k + 2, a + k + 1, a);
          }
        // a face down to each lower neighbour, east, west, north and south, wherever the neighbour is not rock
        for (const [dx, dy] of NEIGHBOURS) {
          const nx = tx + dx,
            ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || rockAt(nx, ny)) continue;
          const down = stepAt(nx, ny);
          if (up - down < 1e-3) continue;
          // the shared edge, from one end to the other
          const ex0 = dx > 0 ? x0 + tile : x0,
            ey0 = dy > 0 ? y0 + tile : y0;
          const along: [number, number] = dx !== 0 ? [0, 1] : [1, 0];
          for (let i = 0; i < k; i++) {
            const ax = ex0 + along[0] * i * step,
              ay = ey0 + along[1] * i * step,
              bx = ax + along[0] * step,
              by = ay + along[1] * step;
            sampleTerrain(map.terrain, grid, ax, ay, s);
            const ha = s[0];
            sampleTerrain(map.terrain, grid, bx, by, s);
            const hb = s[0];
            upright(cliff, ax, ay, bx, by, ha + down, hb + down, ha + up, hb + up, dx, dy);
          }
        }
      }
  }

  // A skirt hanging from the chunk's edge, facing out: a chunk beside it at another level of detail has its vertices
  // elsewhere along the edge, and the hairline gap between the two would show the sky through the ground.
  const x0 = originX + tx0 * tile,
    y0 = originY + ty0 * tile,
    x1 = originX + tx1 * tile,
    y1 = originY + ty1 * tile;
  const edgeAt = (x: number, y: number, inX: number, inY: number) => {
    // the height on the chunk's own side of its edge, its tile's step and all
    const tx = Math.min(tx1 - 1, Math.max(tx0, Math.floor((x + inX - originX) / tile))),
      ty = Math.min(ty1 - 1, Math.max(ty0, Math.floor((y + inY - originY) / tile)));
    sampleTerrain(map.terrain, grid, x, y, s);
    return s[0] + stepAt(tx, ty);
  };
  for (const [ax, ay, bx, by, dx, dy] of [
    [x0, y0, x1, y0, 0, -1],
    [x1, y0, x1, y1, 1, 0],
    [x1, y1, x0, y1, 0, 1],
    [x0, y1, x0, y0, -1, 0],
  ] as const) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let i = 0; i < n; i++) {
      const px = ax + ((bx - ax) * i) / n,
        py = ay + ((by - ay) * i) / n,
        qx = ax + ((bx - ax) * (i + 1)) / n,
        qy = ay + ((by - ay) * (i + 1)) / n;
      const hp = edgeAt(px, py, -dx * 0.01, -dy * 0.01),
        hq = edgeAt(qx, qy, -dx * 0.01, -dy * 0.01);
      upright(ground, px, py, qx, qy, hp - SKIRT, hq - SKIRT, hp, hq, dx, dy);
    }
  }

  // the rock, the same at every level: the tiles are few, and an outcrop is seen from afar
  const cornerTop = (gx: number, gy: number) => {
    let all = 0,
      up = -Infinity;
    for (const [ox, oy] of CORNER_TILES) {
      const r = rockAt(gx + ox, gy + oy);
      all += r ? 1 : 0;
      if (r) up = Math.max(up, stepAt(gx + ox, gy + oy));
    }
    sampleTerrain(map.terrain, grid, originX + gx * tile, originY + gy * tile, s);
    const rise = all === 4 ? ROCK_RISE.inner : ROCK_RISE.rim;
    return s[0] + up + rise[0] + rise[1] * hash01(gx, gy, 7);
  };
  // a top corner: the grid's corner pushed a little off it, the same for every tile that shares it
  const corner = (gx: number, gy: number): V3 => {
    let all = 0;
    for (const [ox, oy] of CORNER_TILES) all += rockAt(gx + ox, gy + oy) ? 1 : 0;
    const j = all === 4 ? ROCK_JITTER.inner : ROCK_JITTER.rim;
    return [
      originX + gx * tile + (hash01(gx, gy, 11) - 0.5) * 2 * j,
      originY + gy * tile + (hash01(gx, gy, 12) - 0.5) * 2 * j,
      cornerTop(gx, gy),
    ];
  };
  const groundAt = (x: number, y: number, tx: number, ty: number) => {
    sampleTerrain(map.terrain, grid, x, y, s);
    return s[0] + stepAt(tx, ty);
  };
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      if (!rockAt(tx, ty)) continue;
      const x0 = originX + tx * tile,
        y0 = originY + ty * tile,
        x1 = x0 + tile,
        y1 = y0 + tile;
      const a = corner(tx, ty),
        b = corner(tx + 1, ty),
        c = corner(tx + 1, ty + 1),
        d = corner(tx, ty + 1);
      // the feet of the corners, on the tile's own corners
      const feet: [V3, V3, V3, V3] = [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y1, 0],
        [x0, y1, 0],
      ];
      if (hash01(tx, ty, 3) < 0.5) {
        flat(rocks, a, b, c);
        flat(rocks, a, c, d);
      } else {
        flat(rocks, a, b, d);
        flat(rocks, b, c, d);
      }
      for (const [dx, dy] of NEIGHBOURS) {
        if (rockAt(tx + dx, ty + dy)) continue;
        const [i, k] = dx > 0 ? [1, 2] : dx < 0 ? [3, 0] : dy > 0 ? [2, 3] : [0, 1];
        const tops = [a, b, c, d];
        const p = feet[i],
          q = feet[k];
        const own = Math.min(groundAt(p[0], p[1], tx, ty), groundAt(q[0], q[1], tx, ty));
        const near = Math.min(groundAt(p[0], p[1], tx + dx, ty + dy), groundAt(q[0], q[1], tx + dx, ty + dy));
        const bottom = Math.min(own, near) - 0.5;
        // a leaning face from the feet on the tile's edge up to the top's pushed corners, wound to face out
        const out = (q[0] - p[0]) * dy - (q[1] - p[1]) * dx < 0;
        const [f0, f1, t0, t1] = out ? [p, q, tops[i], tops[k]] : [q, p, tops[k], tops[i]];
        const g0: V3 = [f0[0], f0[1], bottom],
          g1: V3 = [f1[0], f1[1], bottom];
        flat(rocks, g0, g1, t1);
        flat(rocks, g0, t1, t0);
      }
    }
  const rockMesh = rocks.build();
  const [rockTop, rockSide, rockLichen] = byFacing(rockMesh, 0.72, LICHEN);
  return { ground: ground.build(), cliff: cliff.build(), rockTop, rockSide, rockLichen };
}

type V3 = [number, number, number];

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** The four tiles round a tile corner (gx, gy), as offsets from it. */
const CORNER_TILES: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [0, -1],
  [-1, -1],
];

/** A flat-shaded triangle, its normal from its corners, wound counter-clockwise from above. */
function flat(b: MeshBuilder, p0: V3, p1: V3, p2: V3) {
  const ux = p1[0] - p0[0],
    uy = p1[1] - p0[1],
    uz = p1[2] - p0[2],
    vx = p2[0] - p0[0],
    vy = p2[1] - p0[1],
    vz = p2[2] - p0[2];
  let nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const i = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(p1[0], p1[1], p1[2], nx, ny, nz, 1, 0);
  b.vertex(p2[0], p2[1], p2[2], nx, ny, nz, 0, 1);
  b.triangle(i, i + 1, i + 2);
}

/**
 * An upright face along the edge from (ax, ay) to (bx, by), from `za0`/`zb0` at its foot to `za1`/`zb1` at its top,
 * facing toward (dx, dy).
 */
function upright(
  b: MeshBuilder,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  za0: number,
  zb0: number,
  za1: number,
  zb1: number,
  dx: number,
  dy: number,
) {
  // counter-clockwise seen from (dx, dy) runs the edge one way or the other
  const forward = (bx - ax) * dy - (by - ay) * dx < 0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = dx / l,
    ny = dy / l;
  const [p, q, zp0, zq0, zp1, zq1] = forward
    ? [[ax, ay], [bx, by], za0, zb0, za1, zb1]
    : [[bx, by], [ax, ay], zb0, za0, zb1, za1];
  const i = b.vertex(p[0], p[1], zp0, nx, ny, 0, 0, 0);
  b.vertex(q[0], q[1], zq0, nx, ny, 0, 1, 0);
  b.vertex(q[0], q[1], zq1, nx, ny, 0, 1, 1);
  b.vertex(p[0], p[1], zp1, nx, ny, 0, 0, 1);
  b.quad(i, i + 1, i + 2, i + 3);
}

/**
 * A mesh's faces split by whether they face up past `up`: the first mesh those that do, the second the rest, and the
 * third the share `lichen` of those that face up, taken from the first by where they are.
 */
function byFacing(mesh: Mesh, up: number, lichen = 0): [Mesh, Mesh, Mesh] {
  const top = new MeshBuilder(),
    side = new MeshBuilder(),
    patch = new MeshBuilder();
  const p = mesh.positions,
    n = mesh.normals;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const v0 = mesh.indices[t] * 3;
    const facing = n[v0 + 2] >= up;
    // a face that faces up is lichen by a hash of where its first corner is, so a patch is the same every time
    const b = !facing ? side : hash01(Math.floor(p[v0]), Math.floor(p[v0 + 1]), 13) < lichen ? patch : top;
    const ids = [0, 1, 2].map((k) => {
      const v = mesh.indices[t + k];
      return b.vertex(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], n[v * 3], n[v * 3 + 1], n[v * 3 + 2], 0, 0);
    });
    b.triangle(ids[0], ids[1], ids[2]);
  }
  return [top.build(), side.build(), patch.build()];
}

// ---- the ground's colour ----

/**
 * The colour map's figures: the side of its picture in texels, the most there may be (`TEXTURE_SIDE_MOST`), and the
 * grey a ground group is given, which the texture's colour is doubled and multiplied into. The colour is linear light in
 * eight bits; at 0.4 the brightest it can show is 0.8, over every ground colour but the sand's red, and a step of it is
 * a third of a percent, so the dark greens keep their shades.
 */
export const COLOUR_MAP = { side: 1024, albedo: 0.4 } as const;

/** The world's side, in units, as the colour map covers it: the larger of its two, since the map is square. */
export function worldSpan(map: WorldMap): number {
  return Math.max(map.grid.cols, map.grid.rows) * map.grid.tile;
}

/**
 * Which surface other than grass covers the ground at (x, y), and how much, nought to one: the kind with the largest
 * share of the four tile middles round the point, read smoothly between them, its edge pushed in and out by a soft
 * noise so a patch of sand or mud is rounded and wanders, and not a tile's square. The kind is written to `scratch[0]`
 * (`scratch` is `SURFACES` long, and is written all through); grass is kind nought, and covers nothing. One rule for
 * the colour map and the grass, so no blade grows on a patch of sand the colour map draws, and none is missing beside
 * it. Makes nothing.
 */
export function surfaceAt(map: WorldMap, x: number, y: number, scratch: Float64Array): number {
  const { cols, rows, originX, originY, tile } = map.grid;
  const soft = softened(map);
  const fx = Math.min(cols - 1, Math.max(0, (x - originX) / tile - 0.5)),
    fy = Math.min(rows - 1, Math.max(0, (y - originY) / tile - 0.5));
  const ix = Math.max(0, Math.min(cols - 2, Math.floor(fx))),
    iy = Math.max(0, Math.min(rows - 2, Math.floor(fy)));
  const ax = Math.max(0, Math.min(1, fx - ix)),
    ay = Math.max(0, Math.min(1, fy - iy));
  scratch.fill(0);
  const n = cols * rows;
  for (let c = 0; c < 4; c++) {
    const t = Math.min(rows - 1, iy + (c >> 1)) * cols + Math.min(cols - 1, ix + (c & 1));
    const w = (c & 1 ? ax : 1 - ax) * (c >> 1 ? ay : 1 - ay);
    for (let k = 1; k < SURFACES; k++) scratch[k] += soft[(k - 1) * n + t] * w;
  }
  let most = 1;
  for (let k = 2; k < SURFACES; k++) if (scratch[k] > scratch[most]) most = k;
  const share = scratch[most];
  scratch[0] = share > 0 ? most : 0;
  if (share <= 0) return 0;
  // the edge pushed in and out by noise at two sizes: a patch's outline wanders on the scale of metres, and frays
  const edge = (noise(x / 9, y / 9 + 9) - 0.5) * 0.55 + (noise(x / 2.7 + 3, y / 2.7) - 0.5) * 0.22;
  return smoothstep(0.42, 0.58, share + edge);
}

/**
 * Each surface's share of each tile, other than grass's, softened over the tiles round it (a tent of three tiles each
 * way), so a patch of sand read between tile middles has rounded ends and corners and no tile's square in it. Worked
 * out once a map; `SURFACES - 1` arrays of a tile each, one after the other, from dirt.
 */
function softened(map: WorldMap): Float32Array {
  let soft = SOFTENED.get(map);
  if (soft) return soft;
  const { cols, rows } = map.grid;
  const n = cols * rows;
  soft = new Float32Array((SURFACES - 1) * n);
  const W = [0.25, 0.5, 0.25];
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.min(cols - 1, Math.max(0, tx + dx)),
            sy = Math.min(rows - 1, Math.max(0, ty + dy));
          const kind = map.surface[sy * cols + sx];
          if (kind === 0) continue;
          soft[(kind - 1) * n + ty * cols + tx] += W[dx + 1] * W[dy + 1];
        }
  SOFTENED.set(map, soft);
  return soft;
}
const SOFTENED = new WeakMap<WorldMap, Float32Array>();

/**
 * The world's ground as a picture `side` texels across, for `setGroundTexture`, laid so that a texel is at world
 * (x, y) where `x / (span * scale)` and `y / (span * scale)`, wrapped, fall in it: the layer's repeat is then
 * `1 / (span * scale)`. A scale of one covers the world once, a texel every couple of units; a far layer's of eight
 * puts the world in an eighth of the picture, which the renderer then does not fade to plain grey until eight times as
 * far (it fades a texture out where its texels shrink under a pixel). Outside the world the nearest edge's colour.
 *
 * Each texel is its biomes' ground colours, blended by their shares (read smoothly between tile middles), with a
 * soft grain; then a surface over it (dirt, sand, mud, stone), by its share of the tiles round it, its edge rounded
 * and broken up a little; then the roads, by their lines, with a soft edge. Linear light over `COLOUR_MAP.albedo * 2`, into eight bits.
 */
export function groundTexels(map: WorldMap, side: number = COLOUR_MAP.side, scale = 1): Uint8ClampedArray {
  const { cols, rows, originX, originY, tile } = map.grid;
  const span = worldSpan(map) * scale;
  const out = new Uint8ClampedArray(side * side * 4);
  const to = 1 / (2 * COLOUR_MAP.albedo);
  const colour = new Float64Array(3);
  const SURF: (Rgb | null)[] = [
    null,
    SURFACE_GROUND.dirt,
    SURFACE_GROUND.sand,
    SURFACE_GROUND.mud,
    SURFACE_GROUND.stone,
  ];
  // where a texel's world point is: the copy of its wrapped place that is nearest the world
  const unwrap = (u: number, origin: number, size: number) => {
    const c = origin + size / 2;
    return u + Math.round((c - u) / span) * span;
  };
  // each tile's ground colour, its biomes' blended by their shares, worked out once and read four at a time
  const tiles = new Float32Array(cols * rows * 3);
  for (let t = 0; t < cols * rows; t++)
    for (let k = 0; k < BIOMES; k++) {
      const share = map.biomes[t * BIOMES + k] / 255;
      const g = BIOME_GROUND[k as keyof typeof BIOME_GROUND];
      tiles[t * 3] += g[0] * share;
      tiles[t * 3 + 1] += g[1] * share;
      tiles[t * 3 + 2] += g[2] * share;
    }
  /** The tiles' colours at (x, y), read smoothly between the four nearest tile middles, into `colour`. */
  const biomeAt = (x: number, y: number) => {
    const fx = Math.min(cols - 1, Math.max(0, (x - originX) / tile - 0.5)),
      fy = Math.min(rows - 1, Math.max(0, (y - originY) / tile - 0.5));
    const ix = Math.max(0, Math.min(cols - 2, Math.floor(fx))),
      iy = Math.max(0, Math.min(rows - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - ix)),
      ay = Math.max(0, Math.min(1, fy - iy));
    colour.fill(0);
    for (let c = 0; c < 4; c++) {
      const w = (c & 1 ? ax : 1 - ax) * (c >> 1 ? ay : 1 - ay);
      const t = Math.min(rows - 1, iy + (c >> 1)) * cols + Math.min(cols - 1, ix + (c & 1));
      colour[0] += tiles[t * 3] * w;
      colour[1] += tiles[t * 3 + 1] * w;
      colour[2] += tiles[t * 3 + 2] * w;
    }
  };
  const shares = new Float64Array(SURFACES);
  const slope = new Float64Array(4);
  const { cover, near } = roadCover(map, side, span);
  // Which texel's colour each texel takes along each axis: its own where its world point is on the world, and the
  // nearest that is, at the world's edge, where it is off it. A spread picture is mostly off the world, and only the
  // texels on it are worked out; the rest are copies.
  const own = (n: number, origin: number, size: number) => {
    const at = new Float64Array(n),
      from = new Int32Array(n);
    let first = -1,
      last = -1;
    for (let i = 0; i < n; i++) {
      at[i] = unwrap(((i + 0.5) / n) * span, origin, size);
      if (at[i] >= origin && at[i] <= origin + size) {
        if (first < 0 || at[i] < at[first]) first = i;
        if (last < 0 || at[i] > at[last]) last = i;
      }
    }
    for (let i = 0; i < n; i++) {
      const on = at[i] >= origin && at[i] <= origin + size;
      from[i] = on || first < 0 ? i : at[i] < origin ? first : last;
      if (first < 0) at[i] = Math.min(origin + size, Math.max(origin, at[i]));
    }
    return { at, from };
  };
  const across = own(side, originX, cols * tile),
    down = own(side, originY, rows * tile);
  for (let j = 0; j < side; j++)
    for (let i = 0; i < side; i++) {
      if (across.from[i] !== i || down.from[j] !== j) continue;
      const x = across.at[i],
        y = down.at[j];
      biomeAt(x, y);
      // the grain: a few per cent lighter or darker, in soft patches a few units across and finer flecks
      const grain = 1 + 0.06 * (noise(x / 7, y / 7) - 0.5) + 0.04 * (hash01(Math.floor(x), Math.floor(y), 5) - 0.5);
      let r = colour[0] * grain,
        g = colour[1] * grain,
        b = colour[2] * grain;
      // the surface over the biome's ground, by the same rule as the grass leaves it bare by (`surfaceAt`)
      const amount = surfaceAt(map, x, y, shares);
      const kind = shares[0];
      const surf = SURF[kind];
      if (kind === SURFACE.stone) {
        // stone on a steep slope is a bank's bare face: earth and rock in bands across the slope, so a player reads it
        // as too steep to climb (review 3, 5); on the level, stone is the paving's and the rock's to draw, each with its
        // own mesh and edge, and under them and round their edges the ground is the biome's own a little bare, and not
        // a pale stone that showed as a halo past the paving
        sampleTerrain(map.terrain, map.grid, x + 1.5, y, slope);
        const ex = slope[0];
        sampleTerrain(map.terrain, map.grid, x - 1.5, y, slope);
        const wx = slope[0];
        sampleTerrain(map.terrain, map.grid, x, y + 1.5, slope);
        const ny = slope[0];
        sampleTerrain(map.terrain, map.grid, x, y - 1.5, slope);
        const sy = slope[0];
        const steep = smoothstep(FACE.from, FACE.to, Math.hypot(ex - wx, ny - sy) / 3) * amount;
        r *= 1 - 0.18 * amount;
        g *= 1 - 0.22 * amount;
        b *= 1 - 0.24 * amount;
        if (steep > 0) {
          // bands by height, so the face reads in strata
          sampleTerrain(map.terrain, map.grid, x, y, slope);
          const band = noise(slope[0] / 1.4, (x + y) / 30) > 0.45 ? ROCK.side : ROCK.earth;
          r += (band[0] * grain - r) * steep;
          g += (band[1] * grain - g) * steep;
          b += (band[2] * grain - b) * steep;
        }
      } else if (surf && kind !== SURFACE.dirt) {
        r += (surf[0] * grain - r) * amount;
        g += (surf[1] * grain - g) * amount;
        b += (surf[2] * grain - b) * amount;
      }
      // dirt by the roads' lines where there are any near, and by tile where there are none (a yard, a square)
      let road = cover[j * side + i];
      if (kind === SURFACE.dirt && !near[j * side + i]) road = Math.max(road, amount);
      if (road > 0) {
        const d = SURFACE_GROUND.dirt;
        // a road's middle a little lighter, where it is driven, and its edge darker, where grass meets it
        const worn = 0.94 + 0.12 * road;
        r += (d[0] * worn * grain - r) * road;
        g += (d[1] * worn * grain - g) * road;
        b += (d[2] * worn * grain - b) * road;
      }
      const o = (j * side + i) * 4;
      out[o] = Math.round(r * to * 255);
      out[o + 1] = Math.round(g * to * 255);
      out[o + 2] = Math.round(b * to * 255);
      out[o + 3] = 128;
    }
  for (let j = 0; j < side; j++)
    for (let i = 0; i < side; i++) {
      const fi = across.from[i],
        fj = down.from[j];
      if (fi === i && fj === j) continue;
      const o = (j * side + i) * 4,
        f = (fj * side + fi) * 4;
      out[o] = out[f];
      out[o + 1] = out[f + 1];
      out[o + 2] = out[f + 2];
      out[o + 3] = out[f + 3];
    }
  return out;
}

/** How much of a road, nought to one, covers (x, y): one inside its width less a unit and a half, softening to nought at its edge. */
function onRoad(points: Float32Array, half: number, x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k + 3 < points.length; k += 2) {
    const ax = points[k],
      ay = points[k + 1],
      bx = points[k + 2],
      by = points[k + 3];
    const vx = bx - ax,
      vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  // the edge wanders a little, as a track's does
  const edge = half - 0.8 + (noise(x / 4, y / 4) - 0.5) * 1.6;
  return Math.max(0, Math.min(1, (edge - best) / 1.5 + 0.5));
}

/**
 * How much of each texel of a picture `side` across, over `span` units, the roads cover (nought to one, by `onRoad`),
 * and whether a road's line runs within a few units of it. Worked out a road's segment at a time over the texels round
 * it, and not a texel at a time over every road, which over a world of roads was a second's work.
 */
function roadCover(map: WorldMap, side: number, span: number): { cover: Float32Array; near: Uint8Array } {
  const cover = new Float32Array(side * side),
    near = new Uint8Array(side * side);
  const texel = span / side;
  const index = (v: number) => {
    const u = v / span - Math.floor(v / span);
    return Math.min(side - 1, Math.floor(u * side));
  };
  for (const road of map.roads) {
    // a little narrower than the road: the road's own mesh draws its edge, and this is only what shows far off
    const half = road.width / 2 - 1.5,
      reach = half + 4;
    const p = road.points;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const seg = p.subarray(k, k + 4);
      const x0 = Math.min(p[k], p[k + 2]) - reach,
        x1 = Math.max(p[k], p[k + 2]) + reach,
        y0 = Math.min(p[k + 1], p[k + 3]) - reach,
        y1 = Math.max(p[k + 1], p[k + 3]) + reach;
      for (let y = Math.floor(y0 / texel) * texel + texel / 2; y <= y1; y += texel)
        for (let x = Math.floor(x0 / texel) * texel + texel / 2; x <= x1; x += texel) {
          const t = index(y) * side + index(x);
          const c = onRoad(seg, half, x, y);
          if (c > cover[t]) cover[t] = c;
          if (!near[t] && onRoad(seg, reach, x, y) > 0) near[t] = 1;
        }
    }
  }
  return { cover, near };
}

/**
 * How much of each cell of a grid (`cols` by `rows` cells of `cell` units from `origin`) the roads cover, nought to one,
 * by `onRoad`: for the grass, which grows on none of a road, by the colour map's own edge. A road's segment at a time,
 * over the cells round it.
 */
export function roadsOver(
  map: WorldMap,
  origin: readonly [number, number],
  cell: number,
  cols: number,
  rows: number,
): Float32Array {
  const cover = new Float32Array(cols * rows);
  for (const road of map.roads) {
    const half = road.width / 2;
    const p = road.points;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const seg = p.subarray(k, k + 4);
      const reach = half + 2;
      const i0 = Math.max(0, Math.floor((Math.min(p[k], p[k + 2]) - reach - origin[0]) / cell)),
        i1 = Math.min(cols - 1, Math.floor((Math.max(p[k], p[k + 2]) + reach - origin[0]) / cell)),
        j0 = Math.max(0, Math.floor((Math.min(p[k + 1], p[k + 3]) - reach - origin[1]) / cell)),
        j1 = Math.min(rows - 1, Math.floor((Math.max(p[k + 1], p[k + 3]) + reach - origin[1]) / cell));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const c = onRoad(seg, half, origin[0] + (i + 0.5) * cell, origin[1] + (j + 0.5) * cell);
          if (c > cover[j * cols + i]) cover[j * cols + i] = c;
        }
    }
  }
  return cover;
}

/** Nought below `a`, one above `b`, and smooth between. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0, 1], from the lattice hash. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, 11),
    b = hash01(ix + 1, iy, 11),
    c = hash01(ix, iy + 1, 11),
    d = hash01(ix + 1, iy + 1, 11);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---- groups ----

/** How much the far layer's picture is spread out: see `groundTexels`. */
export const FAR_SCALE = 8;

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * A chunk's groups: its ground, wearing the colour map (layer 1, the near picture; or layer 2, the spread one, at the
 * far level), its steps' faces and its rock. Groups with nothing in them are left out. The far level casts no shadow and
 * is left out of the occlusion, since neither shows from so far.
 */
export function chunkGroups(meshes: ChunkMeshes, map: WorldMap, lod: Lod): GameGroup[] {
  const far = lod === 'far';
  const span = worldSpan(map) * (far ? FAR_SCALE : 1);
  const texture = packTexture(new Float32Array(TEXTURE_STRIDE), 0, {
    layer: far ? 2 : 1,
    repeat: 1 / span,
    albedo: 1,
    shade: 0,
  });
  const a = COLOUR_MAP.albedo;
  const off = far ? { shadow: false, occlusion: false } : {};
  const groups: GameGroup[] = [
    { mesh: meshes.ground, matrices: IDENTITY, albedo: [a, a, a], roughness: ROUGH.earth, texture, ...off },
    { mesh: meshes.cliff, matrices: IDENTITY, albedo: [...ROCK.side], roughness: ROUGH.stone, ...off },
    { mesh: meshes.rockTop, matrices: IDENTITY, albedo: [...ROCK.top], roughness: ROUGH.stone },
    { mesh: meshes.rockSide, matrices: IDENTITY, albedo: [...ROCK.side], roughness: ROUGH.stone },
    { mesh: meshes.rockLichen, matrices: IDENTITY, albedo: [...ROCK.lichen], roughness: ROUGH.stone },
  ];
  return groups.filter((g) => g.mesh.indices.length > 0);
}
