import { describe, expect, it } from 'vitest';
import { MAX_KINDS, MAX_SIDE, checkField } from 'artshape-render/game/grass';
import { GRASS, GRASS_KINDS, GRASS_OPTIONS, PLAIN, grassField, sharesAt } from '../src/models/grass';
import { FIXTURE, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { BIOMES } from '../src/world/types';

const map = fixtureWorld();
const ground = groundOf(map);
const field = grassField(map, ground);
/** The kind growing in the cell under (x, y), or -1 for none. */
const kindAt = (x: number, y: number) => {
  const i = Math.floor((x - field.origin[0]) / field.cell),
    j = Math.floor((y - field.origin[1]) / field.cell);
  return field.mask[j * field.cols + i] - 1;
};
/**
 * Every kind in the cells under the middles of tiles [x0, y0] to [x1, y1], inclusive. A patch's edge wanders a unit or
 * so either side of its tiles' edge, as the colour map draws it, so only a tile's middle is sure to be bare.
 */
const kindsIn = (r: readonly number[]) => {
  const kinds = new Set<number>();
  for (let ty = r[1]; ty <= r[3]; ty++) for (let tx = r[0]; tx <= r[2]; tx++) kinds.add(kindAt(...fixtureAt(tx, ty)));
  return kinds;
};

describe('the grass', () => {
  it('is a field the renderer takes', () => {
    expect(() => checkField(field, GRASS_OPTIONS)).not.toThrow();
    expect(field.cols).toBeLessThanOrEqual(MAX_SIDE);
    expect(GRASS_KINDS.length).toBeLessThanOrEqual(MAX_KINDS);
  });

  it('is ankle high to the rover: a unit to two and a half', () => {
    for (const k of GRASS_KINDS) {
      expect(k.height).toBeGreaterThanOrEqual(0.9);
      expect(k.height).toBeLessThanOrEqual(2.5);
    }
  });

  it('stands on the ground', () => {
    const [x, y] = fixtureAt(6, 24);
    const i = Math.floor((x - field.origin[0]) / field.cell),
      j = Math.floor((y - field.origin[1]) / field.cell);
    const cx = field.origin[0] + (i + 0.5) * field.cell,
      cy = field.origin[1] + (j + 0.5) * field.cell;
    expect(field.heights[j * field.cols + i]).toBeCloseTo(ground.heightAt(cx, cy), 5);
  });

  it('grows on none of the road, the rock, the cottage or the pond', () => {
    for (const r of [[2, 15, 29, 16], FIXTURE.rock, FIXTURE.cottage, FIXTURE.deep])
      expect([...kindsIn(r)], String(r)).toEqual([-1]);
  });

  it('grows on hardly any of a strip of sand or mud: its edge wanders, and a strip two tiles wide is mostly edge', () => {
    for (const r of [FIXTURE.sand, FIXTURE.mud]) {
      let bare = 0,
        all = 0;
      for (let ty = r[1]; ty <= r[3]; ty++)
        for (let tx = r[0]; tx <= r[2]; tx++) {
          all++;
          if (kindAt(...fixtureAt(tx, ty)) === -1) bare++;
        }
      expect(bare / all, String(r)).toBeGreaterThan(0.5);
    }
  });

  it('grows the meadow’s grass in the west and the pine wood’s in the east', () => {
    const west = kindsIn([1, 24, 3, 30]),
      east = kindsIn([27, 24, 30, 30]);
    expect([...west].every((k) => k === GRASS.meadow || k === GRASS.buttercup || k === GRASS.clover)).toBe(true);
    expect([...east]).toEqual([GRASS.pine]);
  });

  it('grows no flowering drift by a house: a garden is lawn', () => {
    const houses = map.placements.filter((p) => p.kind === 'cottage');
    expect(houses.length).toBeGreaterThan(0);
    let near = 0;
    for (const h of houses)
      for (let dy = -PLAIN.house; dy <= PLAIN.house; dy += 2)
        for (let dx = -PLAIN.house; dx <= PLAIN.house; dx += 2) {
          const k = kindAt(h.x + dx, h.y + dy);
          if (k < 0) continue;
          near++;
          expect(k === GRASS.buttercup || k === GRASS.clover, `${dx}, ${dy}`).toBe(false);
        }
    expect(near).toBeGreaterThan(0);
  });

  it('is the same every time', () => {
    expect(grassField(map, ground).mask).toEqual(field.mask);
  });

  it('reads the biomes smoothly between tiles: a tile’s own at its middle, and halfway to the next between them', () => {
    const out = new Float64Array(BIOMES),
      next = new Float64Array(BIOMES),
      mid = new Float64Array(BIOMES);
    // somewhere the shares change from one tile to the next
    let found = false;
    for (let ty = 2; ty < map.grid.rows - 2 && !found; ty++)
      for (let tx = 2; tx < map.grid.cols - 2 && !found; tx++) {
        const t = ty * map.grid.cols + tx;
        if (map.biomes[t * BIOMES] === map.biomes[(t + 1) * BIOMES]) continue;
        found = true;
        const [x, y] = fixtureAt(tx, ty);
        sharesAt(map, x, y, out);
        sharesAt(map, x + map.grid.tile, y, next);
        sharesAt(map, x + map.grid.tile / 2, y, mid);
        for (let k = 0; k < BIOMES; k++) {
          expect(out[k]).toBeCloseTo(map.biomes[t * BIOMES + k], 6);
          expect(next[k]).toBeCloseTo(map.biomes[(t + 1) * BIOMES + k], 6);
          expect(mid[k]).toBeCloseTo((out[k] + next[k]) / 2, 6);
        }
      }
    expect(found).toBe(true);
  });
});
