/**
 * The ground of a map, as `groundOf` reads it, remembering its last few
 * readings. `canTravel` asks the height and the slope at each point along a
 * move up to four times, and the terrain's one sample gives both; read once
 * and kept, the drive graph is made in a quarter of the time, and every
 * answer is the same to the bit, since it is the same arithmetic on the
 * same numbers, obstacles and all. It is for making the graph, where nothing else runs between
 * the readings; the rover reads `groundOf`.
 */
import { sampleTerrain } from '../physics';
import type { Ground, Surface, WorldMap } from './types';

/** How many readings are kept: a move's two ends and the probe's two points cover it. */
const KEPT = 4;

export function memoGround(map: WorldMap): Ground {
  const { grid, terrain, steps, solid, surface, waterLevel, tops, obstacles } = map;
  const { cols, rows, originX, originY, tile } = grid;
  const bounds = { minX: originX, minY: originY, maxX: originX + cols * tile, maxY: originY + rows * tile };
  const out = new Float64Array(3);
  const keyX = new Float64Array(KEPT).fill(NaN),
    keyY = new Float64Array(KEPT).fill(NaN),
    height = new Float64Array(KEPT),
    dx = new Float64Array(KEPT),
    dy = new Float64Array(KEPT);
  let next = 0;
  const near = obstaclesByTile(map);

  function tileOf(x: number, y: number): number {
    const tx = Math.floor((x - originX) / tile),
      ty = Math.floor((y - originY) / tile);
    return tx < 0 || ty < 0 || tx >= cols || ty >= rows ? -1 : ty * cols + tx;
  }

  /** The slot holding a reading at a point, read now if it was not kept. */
  function read(x: number, y: number): number {
    for (let i = 0; i < KEPT; i++) if (keyX[i] === x && keyY[i] === y) return i;
    const i = next;
    next = (next + 1) % KEPT;
    const t = tileOf(x, y);
    sampleTerrain(terrain, grid, x, y, out);
    keyX[i] = x;
    keyY[i] = y;
    height[i] = out[0] + (t < 0 ? 0 : steps[t]);
    dx[i] = out[1];
    dy[i] = out[2];
    return i;
  }

  return {
    bounds,
    heightAt: (x, y) => height[read(x, y)],
    slopeAt(x, y, o) {
      const i = read(x, y);
      o[0] = dx[i];
      o[1] = dy[i];
    },
    surfaceAt(x, y) {
      const t = tileOf(x, y);
      return (t < 0 ? 0 : surface[t]) as Surface;
    },
    waterDepthAt(x, y) {
      const d = waterLevel - height[read(x, y)];
      return d > 0 ? d : 0;
    },
    solidAt(x, y) {
      const t = tileOf(x, y);
      if (t < 0 || solid[t] !== 0) return true;
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
      return height[read(x, y)] + (t < 0 ? 0 : tops[t]);
    },
  };
}

/**
 * Which obstacles reach into each tile, as one list cut by tile: `items`
 * from `start[t]` to `start[t + 1]`, every obstacle under each tile its
 * circle's box touches, so a point's tile's list holds every one it could
 * be in, and the answer is the ground's own.
 */
export function obstaclesByTile(map: WorldMap): { start: Int32Array; items: Int32Array } {
  const { cols, rows, originX, originY, tile } = map.grid;
  const { obstacles } = map;
  const count = obstacles.length / 3;
  const start = new Int32Array(cols * rows + 1);
  const each = (i: number, f: (t: number) => void) => {
    const x = obstacles[i * 3],
      y = obstacles[i * 3 + 1],
      r = obstacles[i * 3 + 2];
    const x0 = Math.max(0, Math.floor((x - r - originX) / tile)),
      x1 = Math.min(cols - 1, Math.floor((x + r - originX) / tile)),
      y0 = Math.max(0, Math.floor((y - r - originY) / tile)),
      y1 = Math.min(rows - 1, Math.floor((y + r - originY) / tile));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) f(ty * cols + tx);
  };
  for (let i = 0; i < count; i++) each(i, (t) => start[t + 1]++);
  for (let t = 0; t < cols * rows; t++) start[t + 1] += start[t];
  const items = new Int32Array(start[cols * rows]);
  const fill = start.slice(0, cols * rows);
  for (let i = 0; i < count; i++) each(i, (t) => (items[fill[t]++] = i));
  return { start, items };
}
