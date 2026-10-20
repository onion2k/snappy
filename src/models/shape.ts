/**
 * What the models share: a part (one mesh in one colour, as a group of the
 * renderer draws it), a place that turns a solid any way and not only about
 * Z, and the baked light golf gives its scenery (ooergolf's `models/tone.ts`):
 * a part cut into a lit, a middle and a shaded tier by how far each face
 * looks toward a fixed sun, each tier its own colour, so a canopy's sunward
 * side is a bright lime and its far side a deep cool green whatever bands the
 * toon light makes of the same faces. Without it a tree is two or three
 * greens that are all the leaf's own.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import type { Place } from 'artshape-render/mesh/lowpoly';
import type { Rgb } from './palette';

export type V3 = [number, number, number];

/**
 * A place turned by `roll` about X, then `pitch` about Y, then `yaw` about Z, scaled evenly by `s`, and moved to
 * (x, y, z). Every rotation keeps a face's winding, so a solid placed by it is never turned inside out.
 */
export function posed(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, s = 1): Place {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cr = Math.cos(roll),
    sr = Math.sin(roll);
  return ([px, py, pz]) => {
    px *= s;
    py *= s;
    pz *= s;
    // about X
    const y1 = py * cr - pz * sr,
      z1 = py * sr + pz * cr;
    // about Y
    const x2 = px * cp + z1 * sp,
      z2 = -px * sp + z1 * cp;
    // about Z
    return [x + x2 * cy - y1 * sy, y + x2 * sy + y1 * cy, z + z2];
  };
}

/** How many triangles a mesh has. */
export const triangles = (mesh: Mesh) => mesh.indices.length / 3;

/** One step of baked light: the tier takes every face whose dot with the sun is at least `from`, the first that does. */
export interface Tier {
  from: number;
  mul: Rgb;
}

/**
 * The tiers, brightest first. The lit side warms toward yellow and the shade cools toward the look's sea-green shade,
 * as golf's trees do; but by a light hand on every channel, so one set of tiers serves a green, an orange and a purple
 * crown alike (golf's were each tuned to one green, and on an autumn orange its lit tier's red clipped to white).
 */
export const TIERS = {
  leaf: [
    { from: 0.35, mul: [1.32, 1.24, 1.0] },
    { from: -0.1, mul: [0.98, 1.0, 1.02] },
    { from: -9, mul: [0.5, 0.6, 0.72] },
  ],
  rock: [
    { from: 0.5, mul: [1.14, 1.12, 1.08] },
    { from: 0.2, mul: [0.94, 0.92, 0.92] },
    { from: -0.2, mul: [0.72, 0.7, 0.76] },
    { from: -9, mul: [0.5, 0.5, 0.58] },
  ],
} as const satisfies Record<string, readonly Tier[]>;

/** The faces `keep` of `mesh` as a mesh of their own. */
export function sliced(mesh: Mesh, keep: readonly number[]): Mesh {
  const b = new MeshBuilder();
  const p = mesh.positions,
    n = mesh.normals,
    uv = mesh.uvs;
  for (const t of keep) {
    const ids = [0, 1, 2].map((k) => {
      const v = mesh.indices[t * 3 + k];
      return b.vertex(
        p[v * 3],
        p[v * 3 + 1],
        p[v * 3 + 2],
        n[v * 3],
        n[v * 3 + 1],
        n[v * 3 + 2],
        uv[v * 2] ?? 0,
        uv[v * 2 + 1] ?? 0,
      );
    });
    b.triangle(ids[0], ids[1], ids[2]);
  }
  return b.build();
}

/**
 * `mesh` cut into one mesh a tier, by how far each face looks toward `sun` (in the mesh's own frame); a tier no face
 * falls in is an empty mesh, so the list is always as long as the tiers. Faces are sorted, never made or lost.
 */
export function split(mesh: Mesh, sun: readonly [number, number, number], tiers: readonly Tier[]): Mesh[] {
  const kept: number[][] = tiers.map(() => []);
  const p = mesh.positions,
    n = mesh.normals;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const a = mesh.indices[t * 3] * 3,
      b = mesh.indices[t * 3 + 1] * 3,
      c = mesh.indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2],
      vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    // the mesh's own normal says which way the face looks, whichever way it is wound
    const s = nx * (n[a] + n[b] + n[c]) + ny * (n[a + 1] + n[b + 1] + n[c + 1]) + nz * (n[a + 2] + n[b + 2] + n[c + 2]);
    const k = s < 0 ? -1 / l : 1 / l;
    nx *= k;
    ny *= k;
    nz *= k;
    const dot = nx * sun[0] + ny * sun[1] + nz * sun[2];
    const tier = tiers.findIndex((x) => dot >= x.from);
    kept[tier < 0 ? tiers.length - 1 : tier].push(t);
  }
  return kept.map((keep) => sliced(mesh, keep));
}

/** One mesh of a model in one colour: what a group of the renderer draws. */
export interface Part {
  name: string;
  mesh: Mesh;
  colour: Rgb;
  rough: number;
}

/**
 * The part of `mesh` at or under the height `z`, each face cut where it crosses it (a face's normal kept), and the
 * points where its edges cross it pushed onto `section`, x and y, for the cap that closes the cut. A face wholly over
 * `z` is dropped; one wholly under it is kept as it was.
 */
export function clippedBelow(mesh: Mesh, z: number, section: number[] = []): Mesh {
  const b = new MeshBuilder();
  const p = mesh.positions,
    n = mesh.normals;
  const poly: number[][] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const vs = [0, 1, 2].map((k) => mesh.indices[t + k]);
    // the face's own normal, from its first vertex: the kit's meshes are flat-shaded
    const nx = n[vs[0] * 3],
      ny = n[vs[0] * 3 + 1],
      nz = n[vs[0] * 3 + 2];
    poly.length = 0;
    for (let k = 0; k < 3; k++) {
      const a = vs[k],
        c = vs[(k + 1) % 3];
      const az = p[a * 3 + 2],
        cz = p[c * 3 + 2];
      if (az <= z) poly.push([p[a * 3], p[a * 3 + 1], az]);
      if (az <= z !== cz <= z) {
        const u = (z - az) / (cz - az);
        const x = p[a * 3] + (p[c * 3] - p[a * 3]) * u,
          y = p[a * 3 + 1] + (p[c * 3 + 1] - p[a * 3 + 1]) * u;
        poly.push([x, y, z]);
        section.push(x, y);
      }
    }
    if (poly.length < 3) continue;
    const first = b.vertex(poly[0][0], poly[0][1], poly[0][2], nx, ny, nz, 0, 0);
    for (let k = 1; k < poly.length; k++) b.vertex(poly[k][0], poly[k][1], poly[k][2], nx, ny, nz, 0, 0);
    for (let k = 1; k + 1 < poly.length; k++) b.triangle(first, first + k, first + k + 1);
  }
  return b.build();
}

/**
 * A flat cap facing up at height `z` over the convex hull of `points` (x and y, two numbers each), into `b`: what
 * closes a solid cut level, so a cut stump or a house cut to its walls' feet is solid from above and not a hollow ring.
 * Fewer than three points not in a line cap nothing.
 */
export function capHull(b: MeshBuilder, points: readonly number[], z: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]]);
  pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cross = (o: [number, number], a: [number, number], c: [number, number]) =>
    (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  // Andrew's monotone chain, anticlockwise from above
  const lower: [number, number][] = [],
    upper: [number, number][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return;
  const first = b.vertex(hull[0][0], hull[0][1], z, 0, 0, 1, 0, 0);
  for (let k = 1; k < hull.length; k++) b.vertex(hull[k][0], hull[k][1], z, 0, 0, 1, 0, 0);
  for (let k = 1; k + 1 < hull.length; k++) b.triangle(first, first + k, first + k + 1);
}
