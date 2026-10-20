/**
 * The ground of a `WorldMap`, as the rover and the scene ask about it. The
 * smooth part is the physics' own B-spline, so what the rover rides is what
 * a body in the physics world would roll on.
 */
import { sampleTerrain } from '../physics';
import type { Ground, Surface, WorldMap } from './types';

export function groundOf(map: WorldMap): Ground {
  const { grid, terrain, steps, solid, surface, waterLevel, tops, obstacles } = map;
  const { cols, rows, originX, originY, tile } = grid;
  const bounds = { minX: originX, minY: originY, maxX: originX + cols * tile, maxY: originY + rows * tile };
  // one scratch for every read, since nothing here may allocate
  const out = new Float64Array(3);
  const near = obstacleIndex(map);

  /** The tile a point is in, or -1 off the world. */
  function tileOf(x: number, y: number): number {
    const tx = Math.floor((x - originX) / tile),
      ty = Math.floor((y - originY) / tile);
    return tx < 0 || ty < 0 || tx >= cols || ty >= rows ? -1 : ty * cols + tx;
  }

  function heightAt(x: number, y: number): number {
    const t = tileOf(x, y);
    sampleTerrain(terrain, grid, x, y, out);
    return out[0] + (t < 0 ? 0 : steps[t]);
  }

  return {
    bounds,
    heightAt,
    slopeAt(x, y, o) {
      sampleTerrain(terrain, grid, x, y, out);
      o[0] = out[1];
      o[1] = out[2];
    },
    surfaceAt(x, y) {
      const t = tileOf(x, y);
      return (t < 0 ? 0 : surface[t]) as Surface;
    },
    waterDepthAt(x, y) {
      const d = waterLevel - heightAt(x, y);
      return d > 0 ? d : 0;
    },
    solidAt(x, y) {
      const t = tileOf(x, y);
      if (t < 0 || solid[t] !== 0) return true;
      // an obstacle is listed under every tile its circle reaches, so one tile's list is all there is to look at
      for (let k = near.start[t], end = near.start[t + 1]; k < end; k++) {
        const o = near.items[k] * 3;
        const dx = x - obstacles[o],
          dy = y - obstacles[o + 1],
          r = obstacles[o + 2];
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    },
    topAt(x, y) {
      const t = tileOf(x, y);
      return heightAt(x, y) + (t < 0 ? 0 : tops[t]);
    },
  };
}

/**
 * Which obstacles reach into each tile, as one list cut by tile: `items`
 * from `start[t]` to `start[t + 1]`. Made once with the ground, so asking
 * whether a point is in one looks at a handful and allocates nothing.
 */
function obstacleIndex(map: WorldMap): { start: Int32Array; items: Int32Array } {
  const { cols, rows, originX, originY, tile } = map.grid;
  const { obstacles } = map;
  const n = obstacles.length / 3;
  const span = (i: number, f: (t: number) => void) => {
    const x = obstacles[i * 3],
      y = obstacles[i * 3 + 1],
      r = obstacles[i * 3 + 2];
    const x0 = Math.max(0, Math.floor((x - r - originX) / tile)),
      x1 = Math.min(cols - 1, Math.floor((x + r - originX) / tile));
    const y0 = Math.max(0, Math.floor((y - r - originY) / tile)),
      y1 = Math.min(rows - 1, Math.floor((y + r - originY) / tile));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) f(ty * cols + tx);
  };
  const start = new Int32Array(cols * rows + 1);
  for (let i = 0; i < n; i++) span(i, (t) => start[t + 1]++);
  for (let t = 0; t < cols * rows; t++) start[t + 1] += start[t];
  const items = new Int32Array(start[cols * rows]);
  const fill = start.slice(0, cols * rows);
  for (let i = 0; i < n; i++) span(i, (t) => (items[fill[t]++] = i));
  return { start, items };
}
