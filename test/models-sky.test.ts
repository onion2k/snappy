import { UNDER_MUTATION } from './helpers';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_SHAPES,
  SKY_CLOUDS,
  cloudAt,
  cloudField,
  cloudMesh,
  cloudsOfShape,
  placeClouds,
  sunBoxAround,
} from '../src/models/clouds';
import { BACKDROP, backdropOf } from '../src/models/backdrop';
import { fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { heapSwing, trianglesOf } from './models-helpers';

const field = cloudField({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
const matrix = (i: number, t: number) => {
  const m = new Float32Array(16);
  cloudAt(field, i, t, m);
  return m;
};

describe('the clouds', () => {
  it('are where they were for the same cloud at the same time', () => {
    for (const t of [0, 12.5, 600]) expect(matrix(7, t)).toEqual(matrix(7, t));
  });

  it('are each somewhere of their own', () => {
    expect(matrix(1, 0)[12]).not.toBe(matrix(2, 0)[12]);
  });

  it('drift with the wind as time goes on', () => {
    const a = matrix(5, 100),
      b = matrix(5, 101);
    const [wx, wy] = SKY_CLOUDS.wind;
    const l = Math.hypot(wx, wy);
    expect(b[12] - a[12]).toBeCloseTo((SKY_CLOUDS.drift * wx) / l, 3);
    expect(b[13] - a[13]).toBeCloseTo((SKY_CLOUDS.drift * wy) / l, 3);
  });

  it('stay in their field however long, high over the world, and never bigger than a cloud is', () => {
    for (let i = 0; i < SKY_CLOUDS.count; i++)
      for (const t of [0, 1e3, 1e5]) {
        const m = matrix(i, t);
        expect(m[12]).toBeGreaterThanOrEqual(field.minX);
        expect(m[12]).toBeLessThanOrEqual(field.maxX);
        expect(m[13]).toBeGreaterThanOrEqual(field.minY);
        expect(m[13]).toBeLessThanOrEqual(field.maxY);
        expect(m[14]).toBeGreaterThanOrEqual(SKY_CLOUDS.height[0]);
        expect(m[14]).toBeLessThanOrEqual(SKY_CLOUDS.height[1]);
        expect(Math.hypot(m[0], m[1])).toBeLessThanOrEqual(SKY_CLOUDS.size[1] + 1e-3);
      }
  });

  it('shrink to nothing at the field’s edge, so none is seen to jump', () => {
    // a cloud is found at its wrap, and its size there is nothing
    const m = new Float32Array(16);
    let smallest = Infinity;
    for (let t = 0; t < 1200; t += 0.5) {
      cloudAt(field, 3, t, m);
      const edge = Math.min(m[12] - field.minX, field.maxX - m[12], m[13] - field.minY, field.maxY - m[13]);
      if (edge < 3) smallest = Math.min(smallest, Math.hypot(m[0], m[1]));
    }
    expect(smallest).toBeLessThan(2);
  });

  it('are placed, every one, into its shape’s matrices', () => {
    const out = Array.from({ length: CLOUD_SHAPES }, (_, k) => new Float32Array(cloudsOfShape(k) * 16));
    placeClouds(field, 50, out);
    expect(out.reduce((n, m) => n + m.length / 16, 0)).toBe(SKY_CLOUDS.count);
    for (const m of out) for (let o = 0; o < m.length; o += 16) expect(m[15]).toBe(1);
  });

  it.skipIf(UNDER_MUTATION)('make nothing as they move', () => {
    const out = Array.from({ length: CLOUD_SHAPES }, (_, k) => new Float32Array(cloudsOfShape(k) * 16));
    // the time kept in an array, so the test's own counting makes nothing either
    const t = new Float64Array(1);
    expect(heapSwing(() => placeClouds(field, (t[0] += 0.016), out), 12, 500)).toBeLessThan(256 * 1024);
  });

  it('are cheap: a heap of faceted lumps, a few hundred triangles a shape', () => {
    for (let k = 0; k < CLOUD_SHAPES; k++) expect(trianglesOf(cloudMesh(k))).toBeLessThanOrEqual(400);
  });

  it('cast their shadows on the ground round the camera: the sun’s box holds them and the ground under them', () => {
    const box = { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
    sunBoxAround(100, -50, box);
    expect(box.min[0]).toBeLessThan(100);
    expect(box.max[0]).toBeGreaterThan(100);
    expect(box.min[1]).toBeLessThan(-50);
    expect(box.max[1]).toBeGreaterThan(-50);
    expect(box.max[2]).toBeGreaterThan(SKY_CLOUDS.height[1]);
    // and is kept small, since the map's depth bias is a share of its depth along the light
    expect(box.max[0] - box.min[0]).toBeLessThan(1000);
  });
});

describe('the backdrop', () => {
  const map = fixtureWorld();
  const ground = groundOf(map);
  const back = backdropOf(map, ground);

  it('rises from the world’s own edge, at the edge’s height, and never over the world', () => {
    const { minX, maxX, minY, maxY } = ground.bounds;
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2,
      hx = (maxX - minX) / 2,
      hy = (maxY - minY) / 2;
    let onEdge = 0;
    for (const mesh of back.hills)
      for (let v = 0; v < mesh.positions.length; v += 3) {
        const x = mesh.positions[v],
          y = mesh.positions[v + 1],
          z = mesh.positions[v + 2];
        // how far outside the world's square the point is: nought on its edge
        const out = Math.max(Math.abs(x - cx) - hx, Math.abs(y - cy) - hy);
        expect(out).toBeGreaterThan(-1e-2);
        if (Math.abs(out) < 1e-2) {
          onEdge++;
          expect(z).toBeCloseTo(ground.heightAt(cx + (x - cx) * 0.9999, cy + (y - cy) * 0.9999), 1);
        }
      }
    expect(onEdge).toBeGreaterThan(BACKDROP.around);
  });

  it('faces up everywhere, as ground does', () => {
    for (const mesh of [...back.hills, ...back.mountains, back.range, back.foothills, back.snow, back.sea])
      for (let v = 0; v < mesh.normals.length; v += 3) expect(mesh.normals[v + 2]).toBeGreaterThanOrEqual(0);
  });

  it('makes its far trees of twenty to thirty triangles, a unit tall', () => {
    for (const mesh of [back.trees.conifer, back.trees.broadleaf]) {
      const n = mesh.indices.length / 3;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(30);
      let top = 0;
      for (let v = 2; v < mesh.positions.length; v += 3) top = Math.max(top, mesh.positions[v]);
      expect(top).toBeGreaterThan(0.85);
      expect(top).toBeLessThan(1.1);
    }
  });

  it('runs its snow line ragged: the lowest snow is well under the highest rock', () => {
    let lowSnow = Infinity,
      highRock = -Infinity;
    for (let v = 2; v < back.snow.positions.length; v += 3) lowSnow = Math.min(lowSnow, back.snow.positions[v]);
    for (const mesh of back.mountains)
      for (let v = 2; v < mesh.positions.length; v += 3) highRock = Math.max(highRock, mesh.positions[v]);
    expect(highRock - lowSnow).toBeGreaterThan(30);
  });

  it('has a wood on its hills, and none of it in the water', () => {
    expect(back.forest.length).toBeGreaterThan(BACKDROP.forest / 2);
    for (const t of back.forest) expect(t.z).toBeGreaterThan(map.waterLevel - 2);
  });
});
