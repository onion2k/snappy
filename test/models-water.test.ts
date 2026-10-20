import { describe, expect, it } from 'vitest';
import { FLOW_RIPPLE, FLOW_WATER } from 'artshape-render/game/flow';
import { BANDS, waterGroups, waterMeshes } from '../src/models/water';
import { FIXTURE_TILES, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { DRIVE } from '../src/world/types';
import { covers } from './models-helpers';

const map = fixtureWorld();
const ground = groundOf(map);
const water = waterMeshes(map, ground);

describe('the water', () => {
  it('covers exactly the fixture’s water tiles: every tile whose middle is under water, and no dry one', () => {
    let wet = 0;
    for (let ty = 0; ty < FIXTURE_TILES; ty++)
      for (let tx = 0; tx < FIXTURE_TILES; tx++) {
        const [x, y] = fixtureAt(tx, ty);
        const depth = ground.waterDepthAt(x, y);
        const open = covers(water.shallow, x, y) || covers(water.shoal, x, y) || covers(water.deep, x, y);
        if (depth > 0) {
          wet++;
          expect(open || covers(water.foam, x, y), `${tx},${ty} is ${depth} deep`).toBe(true);
        }
        // a dry tile has no open water on it: at most the foam, which runs on under the bank, where the ground hides it
        else expect(open, `${tx},${ty} is dry`).toBe(false);
        if (depth > BANDS.foam) expect(open, `${tx},${ty} is ${depth} deep`).toBe(true);
      }
    // the pond, and only the pond: its eight by eight tiles
    expect(wet).toBe(64);
  });

  it('draws the deep exactly where the rover may not go, and the shallows where it may', () => {
    for (let ty = 0; ty < FIXTURE_TILES; ty++)
      for (let tx = 0; tx < FIXTURE_TILES; tx++) {
        const [x, y] = fixtureAt(tx, ty);
        const depth = ground.waterDepthAt(x, y);
        expect(covers(water.deep, x, y), `${tx},${ty} is ${depth} deep`).toBe(depth > DRIVE.shallow);
        if (depth > BANDS.foam && depth <= DRIVE.shallow)
          expect(covers(water.shallow, x, y) || covers(water.shoal, x, y)).toBe(true);
      }
  });

  it('lies flat at the water level, facing up', () => {
    for (const mesh of [water.deep, water.shallow, water.shoal, water.foam]) {
      expect(mesh.indices.length).toBeGreaterThan(0);
      for (let v = 0; v < mesh.positions.length; v += 3) {
        expect(mesh.positions[v + 2]).toBe(map.waterLevel);
        expect(mesh.normals[v + 2]).toBe(1);
      }
      // wound counter-clockwise from above, every triangle
      const p = mesh.positions,
        idx = mesh.indices;
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
        expect((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a])).toBeGreaterThanOrEqual(
          -1e-6,
        );
      }
    }
  });

  it('draws the deep as open water, and the shallows and the shoal with a faint ripple, the shoal the paler', () => {
    const [deep, shallow, shoal] = waterGroups(water);
    expect(deep.patterns![0]).toBe(FLOW_WATER);
    expect(shallow.patterns![0]).toBe(FLOW_RIPPLE);
    expect(shoal.patterns![0]).toBe(FLOW_RIPPLE);
    const light = (c: number[]) => c[0] + c[1] + c[2];
    expect(light(shoal.albedo!)).toBeGreaterThan(light(shallow.albedo!));
  });

  it('lays the shoal along the shore, shallower than the shallows', () => {
    expect(water.shoal.indices.length).toBeGreaterThan(0);
    for (let ty = 0; ty < FIXTURE_TILES; ty++)
      for (let tx = 0; tx < FIXTURE_TILES; tx++) {
        const [x, y] = fixtureAt(tx, ty);
        const depth = map.waterLevel - ground.heightAt(x, y);
        if (covers(water.shoal, x, y)) expect(depth).toBeLessThanOrEqual(BANDS.shoal + 0.2);
      }
  });

  it('is only the region asked for', () => {
    const part = waterMeshes(map, ground, [0, 0, 8, 8]);
    for (let v = 0; v < part.deep.positions.length; v += 3)
      expect(part.deep.positions[v]).toBeLessThanOrEqual(map.grid.originX + 8 * map.grid.tile);
    expect(part.deep.indices.length).toBeLessThan(water.deep.indices.length);
  });
});
