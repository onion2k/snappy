import { describe, expect, it } from 'vitest';
import { sampleTerrain } from '../src/physics';
import {
  COLOUR_MAP,
  LOD,
  chunkGroups,
  chunkMeshes,
  chunksOf,
  groundTexels,
  rockOf,
  worldSpan,
  type Lod,
} from '../src/models/terrain';
import { FIXTURE, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { SURFACE } from '../src/world/types';

const map = fixtureWorld();
const ground = groundOf(map);
const { cols, originX, originY, tile } = map.grid;
const rock = rockOf(map);
const tileAt = (x: number, y: number) => Math.floor((y - originY) / tile) * cols + Math.floor((x - originX) / tile);

describe('the terrain', () => {
  it('cuts the fixture into one chunk', () => {
    expect(chunksOf(map)).toEqual({ cols: 1, rows: 1 });
  });

  it('takes the rock to be the solid stone, and not the cottage', () => {
    const [rx, ry] = fixtureAt(FIXTURE.rock[0], FIXTURE.rock[1]);
    const [cx, cy] = fixtureAt(FIXTURE.cottage[0], FIXTURE.cottage[1]);
    expect(rock[tileAt(rx, ry)]).toBe(1);
    expect(rock[tileAt(cx, cy)]).toBe(0);
    expect(rock.reduce((s, r) => s + r, 0)).toBe(
      (FIXTURE.rock[2] - FIXTURE.rock[0] + 1) * (FIXTURE.rock[3] - FIXTURE.rock[1] + 1),
    );
  });

  for (const lod of ['near', 'mid'] as Lod[])
    it(`lays every vertex of the ground, ${lod}, on the ground's own height: the smooth terrain and its tile's step`, () => {
      const { ground: mesh } = chunkMeshes(map, 0, 0, lod, rock);
      const p = mesh.positions,
        idx = mesh.indices;
      const s = new Float64Array(3);
      expect(idx.length).toBeGreaterThan(0);
      for (let t = 0; t < idx.length; t += 3) {
        // the skirt that hangs from the chunk's edge is upright, and is not ground to stand on
        if (mesh.normals[idx[t] * 3 + 2] === 0) continue;
        // the tile a triangle is on is the one under its middle
        const mx = (p[idx[t] * 3] + p[idx[t + 1] * 3] + p[idx[t + 2] * 3]) / 3,
          my = (p[idx[t] * 3 + 1] + p[idx[t + 1] * 3 + 1] + p[idx[t + 2] * 3 + 1]) / 3;
        const step = map.steps[tileAt(mx, my)];
        for (let k = 0; k < 3; k++) {
          const v = idx[t + k] * 3;
          sampleTerrain(map.terrain, map.grid, p[v], p[v + 1], s);
          expect(p[v + 2]).toBeCloseTo(s[0] + step, 4);
        }
        // and the middle of the triangle is where the ground says, to within a slope's bend over the triangle: a few
        // hundredths of a unit for each unit the triangle is across
        expect(
          Math.abs((p[idx[t] * 3 + 2] + p[idx[t + 1] * 3 + 2] + p[idx[t + 2] * 3 + 2]) / 3 - ground.heightAt(mx, my)),
        ).toBeLessThan(0.08 * LOD[lod]);
      }
    });

  it('agrees with the ground exactly at a vertex inside a tile', () => {
    const { ground: mesh } = chunkMeshes(map, 0, 0, 'near', rock);
    const p = mesh.positions;
    let inside = 0;
    for (let v = 0; v < p.length; v += 3) {
      const fx = (p[v] - originX) / tile,
        fy = (p[v + 1] - originY) / tile;
      if (Math.abs(fx - Math.round(fx)) < 1e-3 || Math.abs(fy - Math.round(fy)) < 1e-3) continue;
      inside++;
      expect(p[v + 2]).toBeCloseTo(ground.heightAt(p[v], p[v + 1]), 4);
    }
    expect(inside).toBeGreaterThan(1000);
  });

  it('stands an upright face, facing out and level, along the ledge', () => {
    const { cliff } = chunkMeshes(map, 0, 0, 'near', rock);
    expect(cliff.indices.length).toBeGreaterThan(0);
    const [x0] = fixtureAt(FIXTURE.ledge[0], FIXTURE.ledge[1]);
    let west = 0;
    for (let v = 0; v < cliff.positions.length; v += 3) {
      expect(cliff.normals[v + 2]).toBe(0);
      if (Math.abs(cliff.positions[v] - (x0 - tile / 2)) < 1e-3 && cliff.normals[v] === -1) west++;
    }
    // the ledge's west edge is eight tiles long, three faces a tile, four corners a face
    expect(west).toBe(8 * 3 * 4);
  });

  it('raises the rock over the ground round it, and its top faces up', () => {
    const { rockTop, rockSide } = chunkMeshes(map, 0, 0, 'near', rock);
    expect(rockTop.indices.length).toBeGreaterThan(0);
    expect(rockSide.indices.length).toBeGreaterThan(0);
    for (let v = 0; v < rockTop.positions.length; v += 3) {
      expect(rockTop.normals[v + 2]).toBeGreaterThan(0.7);
      expect(rockTop.positions[v + 2]).toBeGreaterThan(
        ground.heightAt(rockTop.positions[v] + 0.01, rockTop.positions[v + 1] + 0.01) + 1,
      );
    }
  });

  it('patches some of the rock’s top with lichen, and only faces that face up', () => {
    const { rockTop, rockLichen } = chunkMeshes(map, 0, 0, 'near', rock);
    expect(rockLichen.indices.length).toBeGreaterThan(0);
    expect(rockLichen.indices.length).toBeLessThan(rockTop.indices.length);
    for (let v = 0; v < rockLichen.normals.length; v += 3) expect(rockLichen.normals[v + 2]).toBeGreaterThan(0.7);
  });

  it('leaves the rock out of the ground mesh', () => {
    const { ground: mesh } = chunkMeshes(map, 0, 0, 'near', rock);
    const [rx, ry] = fixtureAt(FIXTURE.rock[0] + 0.5, FIXTURE.rock[1] + 2);
    const p = mesh.positions;
    for (let v = 0; v < p.length; v += 3) expect(Math.hypot(p[v] - rx, p[v + 1] - ry)).toBeGreaterThan(tile * 0.4);
  });

  it('is cheaper far off: a far chunk has a tenth of a near one’s triangles, and no faces', () => {
    const near = chunkMeshes(map, 0, 0, 'near', rock),
      far = chunkMeshes(map, 0, 0, 'far', rock);
    expect(far.ground.indices.length * 10).toBeLessThanOrEqual(near.ground.indices.length);
    expect(far.cliff.indices.length).toBe(0);
  });

  it('wears the colour map on its ground, the near picture near and the spread one far', () => {
    for (const lod of ['near', 'far'] as Lod[]) {
      const groups = chunkGroups(chunkMeshes(map, 0, 0, lod, rock), map, lod);
      const ground = groups[0];
      expect(ground.texture![0]).toBe(lod === 'far' ? 2 : 1);
      expect(ground.albedo).toEqual([COLOUR_MAP.albedo, COLOUR_MAP.albedo, COLOUR_MAP.albedo]);
      for (const g of groups) expect(g.mesh.indices.length).toBeGreaterThan(0);
    }
  });
});

describe('the colour map', () => {
  const side = 64;
  const texels = groundTexels(map, side);
  /** The texel's colour over world (x, y), as linear light. */
  const at = (x: number, y: number) => {
    const span = worldSpan(map);
    const wrap = (v: number) => Math.floor(((((v / span) % 1) + 1) % 1) * side);
    const o = (wrap(y) * side + wrap(x)) * 4;
    return [0, 1, 2].map((k) => (texels[o + k] / 255) * 2 * COLOUR_MAP.albedo);
  };

  it('is the same every time', () => {
    expect(groundTexels(map, side)).toEqual(texels);
  });

  it('is the road on the road: warmer and redder than the grass beside it', () => {
    const [x, y] = fixtureAt(4, 15.5);
    const [gx, gy] = fixtureAt(4, 19);
    const road = at(x, y),
      grass = at(gx, gy);
    expect(road[0]).toBeGreaterThan(road[1] * 0.9);
    expect(grass[1]).toBeGreaterThan(grass[0]);
    expect(map.surface[tileAt(x, y)]).toBe(SURFACE.dirt);
  });

  it('tells the pine wood from the meadow: its ground is darker', () => {
    const meadow = at(...fixtureAt(4, 28)),
      pine = at(...fixtureAt(30, 28));
    expect(pine[1]).toBeLessThan(meadow[1]);
  });

  it('is sand on the sand, and under the rock the biome’s own ground a little bare, not a pale stone', () => {
    const sand = at(...fixtureAt(12.5, 7.5)),
      stone = at(...fixtureAt(16.5, 7.5));
    expect(sand[0]).toBeGreaterThan(0.5);
    // the rock and the paving draw their stone with meshes of their own; past their edges a pale stone showed as a halo
    expect(stone[1]).toBeGreaterThan(stone[0]);
    expect(stone[0] + stone[1] + stone[2]).toBeLessThan((sand[0] + sand[1] + sand[2]) * 0.8);
  });
});
