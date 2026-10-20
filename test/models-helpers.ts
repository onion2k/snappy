/**
 * What the models' tests share: whether a function makes anything as it
 * runs, and where a point is in a mesh.
 */
import type { Mesh } from 'artshape-render/mesh/types';

/**
 * How far the heap moves over many runs of `fn`, in bytes: the most it reads less the least, sampled between lots of
 * runs. A function that makes nothing leaves it where it is, give or take the sampling's own few hundred bytes; one
 * that makes even a small array a run moves it by megabytes over a lot, before or after a collection. The loop is
 * synchronous, so nothing else runs to move it; but the worker's own leftovers can be collected in the middle of one
 * try, so it is tried three times and the least is taken, which only a function that makes something every run moves.
 */
export function heapSwing(fn: () => void, lots = 12, runs = 20000): number {
  let least = Infinity;
  for (let attempt = 0; attempt < 3; attempt++) least = Math.min(least, swingOnce(fn, lots, runs));
  return least;
}

function swingOnce(fn: () => void, lots: number, runs: number): number {
  for (let i = 0; i < runs; i++) fn();
  let low = Infinity,
    high = -Infinity;
  for (let k = 0; k < lots; k++) {
    for (let i = 0; i < runs; i++) fn();
    const used = process.memoryUsage().heapUsed;
    low = Math.min(low, used);
    high = Math.max(high, used);
  }
  return high - low;
}

/** Whether (x, y) is inside or on the edge of any triangle of `mesh`, seen from above. */
export function covers(mesh: Mesh, x: number, y: number, slack = 1e-4): boolean {
  const p = mesh.positions,
    idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3,
      b = idx[t + 1] * 3,
      c = idx[t + 2] * 3;
    const d1 = (x - p[b]) * (p[a + 1] - p[b + 1]) - (p[a] - p[b]) * (y - p[b + 1]);
    const d2 = (x - p[c]) * (p[b + 1] - p[c + 1]) - (p[b] - p[c]) * (y - p[c + 1]);
    const d3 = (x - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (y - p[a + 1]);
    const neg = d1 < -slack || d2 < -slack || d3 < -slack,
      pos = d1 > slack || d2 > slack || d3 > slack;
    if (!(neg && pos)) return true;
  }
  return false;
}

/** The triangles of a mesh. */
export const trianglesOf = (mesh: Mesh) => mesh.indices.length / 3;
