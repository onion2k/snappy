import { describe, expect, it } from 'vitest';
import { World } from '../src/physics';
import { canMove, canTravel, standable } from '../src/world/drive';
import {
  COTTAGE_TOP,
  FIXTURE_WATER,
  LAMP_RADIUS,
  PLATEAU,
  ROCK_TOP,
  fixtureAt,
  fixtureWorld,
} from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { BIOMES, DRIVE, SURFACE, TILE } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const at = (tx: number, ty: number) => fixtureAt(tx, ty);

describe('the fixture world', () => {
  it('is ground the physics accepts', () => {
    expect(
      () => new World({ capacity: 1, grid: map.grid, solid: map.solid, radii: [], terrain: map.terrain }),
    ).not.toThrow();
  });

  it('shares each tile among the biomes, to 255', () => {
    for (let t = 0; t < map.grid.cols * map.grid.rows; t++) {
      let sum = 0;
      for (let b = 0; b < BIOMES; b++) sum += map.biomes[t * BIOMES + b];
      expect(sum).toBe(255);
    }
  });
});

describe('the ground', () => {
  it('reads the step and the smooth terrain together', () => {
    expect(g.heightAt(...at(16, 2))).toBeCloseTo(0, 6);
    expect(g.heightAt(...at(23, 23))).toBeCloseTo(2, 6);
    expect(g.heightAt(...at(10, 24))).toBeCloseTo(PLATEAU, 1);
  });

  it('reads the water over the pond, and none on dry ground', () => {
    expect(g.waterDepthAt(...at(16, 2))).toBe(0);
    expect(g.waterDepthAt(...at(7.5, 7.5))).toBeCloseTo(FIXTURE_WATER + 3, 1);
    const rim = g.waterDepthAt(...at(4, 4));
    expect(rim).toBeGreaterThan(0);
    expect(rim).toBeLessThanOrEqual(DRIVE.shallow);
  });

  it('reads rock, the cottage and off the world as solid', () => {
    expect(g.solidAt(...at(16, 6))).toBe(true);
    expect(g.solidAt(...at(24, 8))).toBe(true);
    expect(g.solidAt(g.bounds.minX - 1, 0)).toBe(true);
    expect(g.solidAt(...at(16, 2))).toBe(false);
  });

  it('reads each surface where it was laid', () => {
    expect(g.surfaceAt(...at(16, 2))).toBe(SURFACE.grass);
    expect(g.surfaceAt(...at(3, 15))).toBe(SURFACE.dirt);
    expect(g.surfaceAt(...at(12, 6))).toBe(SURFACE.sand);
    expect(g.surfaceAt(...at(21, 12))).toBe(SURFACE.mud);
    expect(g.surfaceAt(...at(16, 6))).toBe(SURFACE.stone);
  });

  it('reads a slope on the ramp and none on the flat', () => {
    const s = new Float64Array(2);
    g.slopeAt(...at(6, 24), s);
    expect(s[0]).toBeCloseTo(1.5 / TILE, 2);
    g.slopeAt(...at(16, 2), s);
    expect(s[0]).toBe(0);
    expect(s[1]).toBe(0);
  });
});

describe('where the rover can go', () => {
  it('stands on grass, the road, the ramp and in the shallows', () => {
    for (const [tx, ty] of [
      [16, 2],
      [3, 15],
      [6, 24],
      [4, 4],
    ])
      expect(standable(g, ...at(tx, ty)), `${tx},${ty}`).toBe(true);
  });

  it('does not stand in rock, in deep water, or on the bank', () => {
    expect(standable(g, ...at(16, 6))).toBe(false);
    expect(standable(g, ...at(7.5, 7.5))).toBe(false);
    expect(standable(g, ...at(12.5, 24))).toBe(false);
  });

  it('climbs the ramp to the plateau, and comes back down', () => {
    expect(canTravel(g, ...at(3, 24), ...at(10, 24))).toBe(true);
    expect(canTravel(g, ...at(10, 24), ...at(3, 24))).toBe(true);
  });

  it('neither climbs nor goes down the bank', () => {
    expect(canTravel(g, ...at(10, 24), ...at(16, 24))).toBe(false);
    expect(canTravel(g, ...at(16, 24), ...at(10, 24))).toBe(false);
  });

  it('neither climbs nor drops off the ledge', () => {
    expect(canTravel(g, ...at(18, 23), ...at(23, 23))).toBe(false);
    expect(canTravel(g, ...at(23, 23), ...at(18, 23))).toBe(false);
  });

  it('rolls over an edge no taller than its step', () => {
    const [x, y] = at(16, 2);
    const flat = { ...g, heightAt: (px: number) => (px > x ? DRIVE.step : 0) };
    expect(canMove(flat, x - 0.2, y, x + 0.2, y)).toBe(true);
    const tall = { ...g, heightAt: (px: number) => (px > x ? DRIVE.step + 0.3 : 0) };
    expect(canMove(tall, x - 0.2, y, x + 0.2, y)).toBe(false);
  });

  it('fords the rim but not the middle of the pond', () => {
    expect(canTravel(g, ...at(2, 5), ...at(5, 5))).toBe(true);
    expect(canTravel(g, ...at(2, 7.5), ...at(7.5, 7.5))).toBe(false);
  });
});

describe('what stands on the ground', () => {
  it('reads the top of the cottage and the rock, and the ground elsewhere', () => {
    expect(g.topAt(...at(24, 8))).toBeCloseTo(g.heightAt(...at(24, 8)) + COTTAGE_TOP, 6);
    expect(g.topAt(...at(16, 6))).toBeCloseTo(g.heightAt(...at(16, 6)) + ROCK_TOP, 6);
    expect(g.topAt(...at(16, 2))).toBeCloseTo(g.heightAt(...at(16, 2)), 6);
  });
});

describe('small solid things', () => {
  it('reads inside the lamp as solid and just outside it as open, so the rover cannot stand in it', () => {
    const [x, y] = at(16, 18);
    expect(g.solidAt(x, y)).toBe(true);
    expect(g.solidAt(x + LAMP_RADIUS * 0.9, y)).toBe(true);
    expect(g.solidAt(x + LAMP_RADIUS * 1.1, y)).toBe(false);
    expect(standable(g, x, y)).toBe(false);
    expect(canTravel(g, x - 3, y, x + 3, y)).toBe(false);
    expect(canTravel(g, x - 3, y + 2, x + 3, y + 2)).toBe(true);
  });
});
