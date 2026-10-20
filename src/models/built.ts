/**
 * What is built, as meshes: the village's cottage, church, well and fence,
 * and the ruins' broken wall, tower stump, arch and fallen column, each cut
 * from the renderer's lowpoly solids. Each stands on the ground at its origin
 * with its front (a door, an arch's opening) toward +x, at the size it has at
 * a placement's scale of one, and comes in a few variants, which a
 * placement's `vary` chooses between: where a cottage's chimney is, which
 * stones of a wall have fallen, how much of a tower is left.
 *
 * There are no colours here: a part is a named mesh, coloured by name in the
 * kit (a roof's by `vary` too). `BUILT_SIZE` is each one's footprint, for the
 * world to mark solid under it.
 */
import { MeshBuilder, type Mesh } from 'artshape-render/mesh/types';
import { block, frustum, lump, prism, seeded, slab, tubeIn, type Place } from 'artshape-render/mesh/lowpoly';
import type { Scenery } from 'artshape-render/parts/lowpoly';
import { FOOTPRINT, TOP } from '../world/built';
import { posed } from './shape';

export type BuiltKind =
  | 'cottage'
  | 'church'
  | 'well'
  | 'fence'
  | 'wall'
  | 'tower'
  | 'arch'
  | 'column'
  | 'haystack'
  | 'cart'
  | 'stall'
  | 'windmill'
  | 'menhir';

/** A kind's footprint, as the world marks it solid. */
export function footprintOf(kind: BuiltKind): readonly (readonly [number, number, number, number])[] {
  return FOOTPRINT[kind] ?? [];
}

/**
 * Each built kind's footprint at a scale of one, as half its size along x (its heading) and along y, about its origin,
 * and its height: the box round the world's own footprint for it (`FOOTPRINT` in `world/built.ts`, which marks the
 * tiles under it solid). Each model is made, or turned and scaled (`FIT`), to fill that footprint up to the rover's
 * height, so the rover meets a building where it is drawn; a roof's eaves may reach a little past it overhead.
 */
export const BUILT_SIZE: Record<BuiltKind, { hx: number; hy: number; height: number }> = {
  cottage: sizeOf('cottage'),
  church: sizeOf('church'),
  well: sizeOf('well'),
  fence: sizeOf('fence'),
  wall: sizeOf('wall'),
  tower: sizeOf('tower'),
  arch: sizeOf('arch'),
  column: sizeOf('column'),
  haystack: sizeOf('haystack'),
  cart: sizeOf('cart'),
  stall: sizeOf('stall'),
  windmill: sizeOf('windmill'),
  menhir: sizeOf('menhir'),
};

/** A kind's box and height, as the world has them: `TOP` is how tall it stands, which its model is made to. */
function sizeOf(kind: BuiltKind): { hx: number; hy: number; height: number } {
  return { ...boxOf(kind), height: TOP[kind] ?? 0 };
}

/** The half sizes of the box round a kind's footprint in the world. */
function boxOf(kind: BuiltKind): { hx: number; hy: number } {
  let hx = 0,
    hy = 0;
  for (const [mx, my, rx, ry] of footprintOf(kind)) {
    hx = Math.max(hx, Math.abs(mx) + rx);
    hy = Math.max(hy, Math.abs(my) + ry);
  }
  return { hx, hy };
}

/**
 * How each model is turned and scaled to its footprint, at its origin: the cottage, made with its ridge along y, is
 * turned a quarter so its gable ends are along x, as the world lays it, and scaled to the world's smaller house; the
 * church turned half round so its tower is at the west end; and so on. Every scale is even, so a face's light is right.
 */
const FIT: Record<BuiltKind, { yaw: number; scale: number; dx?: number }> = {
  cottage: { yaw: Math.PI / 2, scale: 0.72 },
  church: { yaw: Math.PI, scale: 0.6 },
  well: { yaw: 0, scale: 0.72 },
  fence: { yaw: Math.PI / 2, scale: 1 },
  wall: { yaw: Math.PI / 2, scale: 1 },
  tower: { yaw: 0, scale: 1 },
  arch: { yaw: Math.PI / 2, scale: 1 },
  column: { yaw: 0, scale: 0.78 },
  haystack: { yaw: 0, scale: 1 },
  cart: { yaw: 0, scale: 0.62, dx: -2 },
  stall: { yaw: 0, scale: 1 },
  windmill: { yaw: 0, scale: 1 },
  menhir: { yaw: 0, scale: 1 },
};

/** A model's every mesh moved `dx` along x, turned `yaw` about its origin and scaled evenly by `scale`, in place. */
function fitted(model: Scenery, { yaw, scale, dx = 0 }: { yaw: number; scale: number; dx?: number }): Scenery {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  for (const { mesh } of model.parts) {
    const p = mesh.positions,
      n = mesh.normals;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] + dx,
        y = p[i + 1];
      p[i] = (x * c - y * s) * scale;
      p[i + 1] = (x * s + y * c) * scale;
      p[i + 2] *= scale;
      const nx = n[i],
        ny = n[i + 1];
      n[i] = nx * c - ny * s;
      n[i + 1] = nx * s + ny * c;
    }
  }
  return model;
}

/** How many variants each built kind comes in. */
export const BUILT_VARIANTS: Record<BuiltKind, number> = {
  cottage: 3,
  church: 1,
  well: 1,
  fence: 3,
  wall: 3,
  tower: 2,
  arch: 2,
  column: 2,
  haystack: 2,
  cart: 2,
  stall: 2,
  windmill: 1,
  menhir: 3,
};

/** A mesh per part name, built by adding to whichever builder is asked for. */
class Parts {
  private builders = new Map<string, MeshBuilder>();
  of(name: string): MeshBuilder {
    let b = this.builders.get(name);
    if (!b) this.builders.set(name, (b = new MeshBuilder()));
    return b;
  }
  done(name: string): Scenery {
    const parts: { name: string; mesh: Mesh }[] = [];
    for (const [n, b] of this.builders) if (b.triangleCount) parts.push({ name: n, mesh: b.build() });
    return { name, parts };
  }
}

const here: Place = (p) => p;

/**
 * A gabled roof over walls `hx` by `hy` (half sizes) whose tops are at `zw`, rising `rise` to a ridge along y, its
 * eaves `over` past the walls: two panels `t` thick and the two gable triangles that close it, the gables into
 * `gable`. `place` turns and moves the whole.
 */
function roof(
  roofB: MeshBuilder,
  gable: MeshBuilder,
  place: Place,
  hx: number,
  hy: number,
  zw: number,
  rise: number,
  over: number,
  t = 2.4,
) {
  const slope = rise / hx;
  const X = hx + over;
  const low = zw - over * slope;
  const panel: [number, number][] = [
    [-X, low],
    [0.4, zw + rise + 0.4 * slope],
    [0.4, zw + rise + 0.4 * slope + t],
    [-X, low + t],
  ];
  const length = 2 * (hy + over);
  slab(roofB, place, panel, length);
  slab(
    roofB,
    (p) => place([-p[0], -p[1], p[2]]),
    panel.map(([x, z]) => [x, z] as [number, number]),
    length,
  );
  for (const y of [-hy + 0.4, hy - 0.4])
    slab(
      gable,
      (p) => place([p[0], p[1] + y, p[2]]),
      [
        [-hx, zw],
        [hx, zw],
        [0, zw + rise],
      ],
      1,
    );
}

/** A window on a wall facing +x at x = `x`: a white frame standing a little proud, a dark pane, and a cross of bars. */
function window(parts: Parts, place: Place, x: number, y: number, z: number, w: number, h: number) {
  block(parts.of('frame'), place, x - 0.2, x + 0.8, y - w / 2 - 1.2, y + w / 2 + 1.2, z - 1.2, z + h + 1.2);
  block(parts.of('window'), place, x + 0.8, x + 1.0, y - w / 2, y + w / 2, z, z + h);
  block(parts.of('frame'), place, x + 1.0, x + 1.4, y - 0.4, y + 0.4, z, z + h);
  block(parts.of('frame'), place, x + 1.0, x + 1.4, y - w / 2, y + w / 2, z + h / 2 - 0.4, z + h / 2 + 0.4);
  // a sill under it
  block(parts.of('frame'), place, x - 0.2, x + 2, y - w / 2 - 1.6, y + w / 2 + 1.6, z - 2.2, z - 1.2);
}

/** A cottage: plaster walls on a stone plinth, a red, slate or thatched roof, a chimney, a blue door and five windows. */
function cottage(variant: number): Scenery {
  const parts = new Parts();
  // three houses: the common one; a tall narrow one of two storeys; and a long low one under a deep roof
  const hx = variant === 1 ? 14 : 16,
    hy = variant === 1 ? 20 : 24,
    zw = variant === 1 ? 44 : variant === 2 ? 28 : 34,
    rise = variant === 1 ? 22 : variant === 2 ? 30 : 26;
  block(parts.of('walls'), here, -hx, hx, -hy, hy, 0, zw);
  block(parts.of('stone'), here, -hx - 1, hx + 1, -hy - 1, hy + 1, -4, 4);
  roof(parts.of('roof'), parts.of('walls'), here, hx, hy, zw, rise, 5);
  // the chimney through one end of the roof, on whichever side the variant says
  const cy = (variant === 1 ? -1 : 1) * hy * 0.62;
  block(parts.of('stone'), here, -hx * 0.55, -hx * 0.55 + 8, cy - 4, cy + 4, zw - 4, zw + rise + 14);
  block(parts.of('stoneDark'), here, -hx * 0.55 - 1, -hx * 0.55 + 9, cy - 5, cy + 5, zw + rise + 14, zw + rise + 17);
  // the door in the middle of the front, and its step
  const dy = variant === 2 ? -hy * 0.35 : 0;
  block(parts.of('door'), here, hx - 0.5, hx + 1, dy - 6, dy + 6, 0, 22);
  block(parts.of('frame'), here, hx - 0.5, hx + 1.6, dy - 7.5, dy + 7.5, 22, 24);
  block(parts.of('stone'), here, hx, hx + 2.5, dy - 9, dy + 9, -3, 2.5);
  for (const wy of variant === 2 ? [hy * 0.4] : [-hy * 0.58, hy * 0.58]) window(parts, here, hx, wy, 13, 9, 11);
  // the tall house's upper windows
  if (variant === 1) for (const wy of [-hy * 0.5, 0, hy * 0.5]) window(parts, here, hx, wy, 31, 8, 9);
  // a window in each end and one at the back
  for (const s of [1, -1]) {
    const side: Place = (p) => [s * p[1], -s * p[0], p[2]];
    window(parts, side, hy, 0, 13, 9, 11);
  }
  window(parts, (p) => [-p[0], -p[1], p[2]], hx, 0, 13, 9, 11);
  return parts.done('cottage');
}

/**
 * A church: a long nave of warm stone with a slate roof running along x, and at its front a square tower with a
 * pointed spire, an arched door, and dark slits for its bell.
 */
function church(): Scenery {
  const parts = new Parts();
  const nave: Place = (p) => [p[1] - 10, -p[0], p[2]];
  const hx = 20,
    hy = 36,
    zw = 40,
    rise = 30;
  block(parts.of('stone'), nave, -hx, hx, -hy, hy, 0, zw);
  block(parts.of('stoneDark'), nave, -hx - 1, hx + 1, -hy - 1, hy + 1, -4, 4);
  roof(parts.of('slate'), parts.of('stone'), nave, hx, hy, zw, rise, 4);
  // tall windows down each side of the nave
  for (const s of [1, -1])
    for (let k = -1; k <= 1; k++) {
      const side: Place = (p) => nave([s * p[0], s * p[1], p[2]]);
      block(parts.of('window'), side, hx, hx + 0.6, k * 20 - 3.5, k * 20 + 3.5, 12, 30);
      archHead(parts.of('window'), side, hx + 0.3, k * 20, 30, 3.5, 0.6);
    }
  // the tower at the front, and its spire
  const tx = 34,
    t = 12,
    th = 82;
  block(parts.of('stone'), here, tx - t, tx + t, -t, t, 0, th);
  block(parts.of('stoneDark'), here, tx - t - 1, tx + t + 1, -t - 1, t + 1, th, th + 3);
  block(parts.of('stoneDark'), here, tx - t - 1, tx + t + 1, -t - 1, t + 1, -4, 4);
  frustum(parts.of('slate'), posed(tx, 0, th + 3, Math.PI / 4), 4, t * 1.3, 0, 0, 46, { bottom: true });
  // the door, and the bell's slits on each face
  block(parts.of('door'), here, tx + t - 0.4, tx + t + 1, -5, 5, 0, 18);
  archHead(parts.of('door'), here, tx + t + 0.3, 0, 18, 5, 1.4);
  for (let k = 0; k < 4; k++) {
    const turn = posed(tx, 0, 0, (k * Math.PI) / 2);
    block(parts.of('window'), turn, t - 0.2, t + 0.5, -2.5, 2.5, th - 22, th - 8);
  }
  // a little round window over the door
  frustum(parts.of('frame'), posed(tx + t, 0, 40, 0, Math.PI / 2), 8, 4, 4, 0, 0.8, { top: true });
  frustum(parts.of('window'), posed(tx + t + 0.8, 0, 40, 0, Math.PI / 2), 8, 3, 3, 0, 0.3, { top: true });
  return parts.done('church');
}

/**
 * The round head of a door or a window in a wall facing +x, at x: a half disc of radius `r` standing on (y, z), `t`
 * thick through the wall, as a slab turned so its own y runs along the world's x.
 */
function archHead(b: MeshBuilder, place: Place, x: number, y: number, z: number, r: number, t: number) {
  const outline: [number, number][] = [
    [-r, z],
    [r, z],
  ];
  for (let i = 1; i < 6; i++) outline.push([Math.cos((i / 6) * Math.PI) * r, z + Math.sin((i / 6) * Math.PI) * r]);
  slab(b, (p) => place([x - p[1], y + p[0], p[2]]), outline, t);
}

/** A well: a round stone wall with dark water in it, two timber posts, a crossbar with its bucket, and a little roof. */
function well(): Scenery {
  const parts = new Parts();
  frustum(parts.of('stone'), here, 10, 7, 6.6, 0, 7, { top: false });
  frustum(parts.of('stoneDark'), posed(0, 0, 6.6), 10, 7.4, 7.4, 0, 1.4, { top: false });
  // the rim's top, a ring, and the water a little down inside it
  const rim = parts.of('stoneDark');
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2,
      a1 = ((i + 1) / 10) * Math.PI * 2;
    const p = (a: number, r: number): [number, number, number] => [Math.cos(a) * r, Math.sin(a) * r, 8];
    quad(rim, p(a0, 5.2), p(a0, 7.4), p(a1, 7.4), p(a1, 5.2));
  }
  tubeIn(parts.of('stone'), posed(0, 0, 0), 10, 5.2, 1, 8);
  prism(parts.of('water'), here, ring(10, 5.2), 0, 5.5);
  for (const y of [-6.4, 6.4]) block(parts.of('timber'), here, -0.8, 0.8, y - 0.8, y + 0.8, 7, 21);
  block(parts.of('timber'), here, -0.5, 0.5, -7, 7, 16.5, 17.5);
  frustum(parts.of('timber'), posed(0, 0, 11.5), 6, 1.3, 1.6, 0, 3, { top: true });
  roof(parts.of('roof'), parts.of('timber'), here, 5, 8, 21, 5, 2.5, 1.2);
  return parts.done('well');
}

/** A flat-shaded quad, wound counter-clockwise seen from the normal. */
function quad(b: MeshBuilder, p0: number[], p1: number[], p2: number[], p3: number[]) {
  const ux = p1[0] - p0[0],
    uy = p1[1] - p0[1],
    uz = p1[2] - p0[2],
    vx = p3[0] - p0[0],
    vy = p3[1] - p0[1],
    vz = p3[2] - p0[2];
  let nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const i = b.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0);
  b.vertex(p1[0], p1[1], p1[2], nx, ny, nz, 1, 0);
  b.vertex(p2[0], p2[1], p2[2], nx, ny, nz, 1, 1);
  b.vertex(p3[0], p3[1], p3[2], nx, ny, nz, 0, 1);
  b.quad(i, i + 1, i + 2, i + 3);
}

/** A ring of `n` points of radius `r`, anticlockwise from above: a round outline for a prism. */
function ring(n: number, r: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [
    Math.cos((i / n) * Math.PI * 2) * r,
    Math.sin((i / n) * Math.PI * 2) * r,
  ]);
}

/**
 * A run of fence along y, a tile and a bit long: a post at each end and two rails. The second variant has lost its top
 * rail, and the third has one rail fallen to lean on the ground.
 */
function fence(variant: number): Scenery {
  const parts = new Parts();
  // made along y and turned to the world's x by `FIT`
  const half = BUILT_SIZE.fence.hx;
  for (let k = 0; k <= 4; k++) {
    const y = -half + 0.6 + (k * (2 * half - 1.2)) / 4;
    block(parts.of('post'), here, -0.6, 0.6, y - 0.6, y + 0.6, -1, 6.4);
    frustum(parts.of('post'), posed(0, y, 6.4, Math.PI / 4), 4, 0.85, 0.2, 0, 0.8, { top: true });
  }
  block(parts.of('rail'), here, -0.35, 0.35, -half, half, 2, 2.9);
  if (variant === 0) block(parts.of('rail'), here, -0.35, 0.35, -half, half, 4.6, 5.5);
  if (variant === 2) {
    // fallen from its top end: one end still on the post, the other on the ground
    const fall = Math.atan2(4.6, 2 * half);
    block(parts.of('rail'), posed(0.9, -half + 0.6, 0.5, 0, 0, fall), -0.35, 0.35, 0, 2 * half - 1, 0, 0.9);
  }
  return parts.done('fence');
}

/** A stone of a ruin: in one of its two greys by chance, so a wall of them is mottled as old stone is. */
const stone = (parts: Parts, random: () => number) => parts.of(random() < 0.35 ? 'ruinDark' : 'ruin');

/**
 * A broken dry-stone wall along y: three courses of stones of uneven length, each stone a little off true, and a
 * different few fallen from the top course (and lying at its foot) in each variant. Moss on what is left of the top.
 */
function wall(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 31 + 17);
  // made along y and turned to the world's x by `FIT`
  const half = BUILT_SIZE.wall.hx,
    t = 2.5;
  const course = 4.6;
  const gapAt = -half + (0.25 + random() * 0.5) * 2 * half;
  for (let c = 0; c < 3; c++) {
    let y = -half - (c % 2) * 1.6;
    const z0 = c * course - 1;
    while (y < half - 0.5) {
      const len = Math.min(half - y, 3.4 + random() * 3.6);
      const mid = y + len / 2;
      // the top course is broken over a gap, and in the third variant the course under it too
      const gone =
        (c === 2 && Math.abs(mid - gapAt) < 5 + variant * 2) || (c === 1 && variant === 2 && Math.abs(mid - gapAt) < 3);
      if (!gone && y + len > -half + 0.5) {
        const inset = 0.15 + random() * 0.4;
        // the top falls away toward the wall's ends, more so the more broken the variant
        const top = z0 + course - 0.2 - random() * 0.7 - (c === 2 ? Math.abs(mid / half) * 1.5 * variant : 0);
        const from = Math.max(-half, y);
        const place = posed(0, (from + y + len) / 2, 0, (random() - 0.5) * 0.1);
        const l = (y + len - from) / 2;
        block(stone(parts, random), place, -t + inset, t - inset, -l + 0.15, l - 0.15, z0, top);
        if (c === 2 && random() < 0.55)
          block(parts.of('moss'), place, -t + inset + 0.2, t - inset - 0.2, -l + 0.6, l - 0.6, top - 0.1, top + 0.45);
      }
      y += len;
    }
  }
  // the fallen stones of the gap, lying in it, within the wall's own width
  for (let k = 0; k < 2 + variant; k++) {
    const r = 1.3 + random() * 0.8;
    lump(
      stone(parts, random),
      posed((random() - 0.5) * t, gapAt + (random() - 0.5) * 8, 0, random() * 3),
      random,
      3,
      5,
      [r, r * 0.8, r * 0.6],
      {
        give: 0.25,
        floor: -r * 0.1,
      },
    );
  }
  return parts.done('wall');
}

/**
 * The stump of a round tower: a ring of stone, each of its twelve sides standing to its own broken height, low where
 * one side has fallen in and with a doorway through its front; a dark floor inside; moss on the highest stones; and
 * rubble at its foot below the fallen side. The second variant is the shorter, and more fallen.
 */
function tower(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 53 + 5);
  const R = 14,
    n = 12,
    thick = 3;
  const h = variant === 0 ? 34 : 22;
  // the side that has fallen in: its sides are low, and they rise again away from it
  const fallen = 3 + variant * 4;
  const side = 2 * R * Math.sin(Math.PI / n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const from = Math.min(Math.abs(i - fallen), n - Math.abs(i - fallen));
    const up = h * Math.min(1, 0.22 + from * 0.2) * (0.75 + random() * 0.3);
    const place = posed(Math.cos(a) * (R - thick / 2), Math.sin(a) * (R - thick / 2), 0, a);
    // the doorway, through the side facing +x: the wall over it on a lintel
    if (i === 0) {
      block(stone(parts, random), place, -thick / 2, thick / 2, -side / 2 - 0.3, -3.6, -3, up);
      block(stone(parts, random), place, -thick / 2, thick / 2, 3.6, side / 2 + 0.3, -3, up);
      block(parts.of('ruinDark'), place, -thick / 2 - 0.4, thick / 2 + 0.4, -4.4, 4.4, 13, 15.5);
      if (up > 16) block(stone(parts, random), place, -thick / 2, thick / 2, -3.6, 3.6, 15.5, up);
      continue;
    }
    // a side in two courses, the upper one a little set in and broken shorter
    const split = up * (0.45 + random() * 0.2);
    block(stone(parts, random), place, -thick / 2, thick / 2, -side / 2 - 0.3, side / 2 + 0.3, -3, split);
    block(
      stone(parts, random),
      place,
      -thick / 2 + 0.2,
      thick / 2 - 0.2,
      -side / 2 + random() * 1.2,
      side / 2 - random() * 1.2,
      split,
      up,
    );
    if (up > h * 0.7 && random() < 0.6)
      block(
        parts.of('moss'),
        place,
        -thick / 2 + 0.3,
        thick / 2 - 0.3,
        -side / 2 + 1.4,
        side / 2 - 1.4,
        up - 0.1,
        up + 0.5,
      );
  }
  // the floor inside, a little up from the ground
  prism(parts.of('floor'), here, ring(n, R - thick + 0.2), 0, 0.6);
  for (let k = 0; k < 5 + variant * 3; k++) {
    const a = fallen * ((Math.PI * 2) / n) + (random() - 0.5) * 1.6,
      r = 1.5 + random() * 1.5,
      d = R * (0.35 + random() * 0.45);
    lump(
      stone(parts, random),
      posed(Math.cos(a) * d, Math.sin(a) * d, 0, random() * 3),
      random,
      3,
      5,
      [r, r * 0.8, r * 0.65],
      {
        give: 0.25,
        floor: -r * 0.1,
      },
    );
  }
  return parts.done('tower');
}

/**
 * An arch across y: two piers, each three courses of stone a little off true, and a round head of seven wedge stones
 * over the opening, a keystone standing a little proud. The second variant has lost the stones on one side of its head
 * and the top of that pier, which lie at its foot.
 */
function archway(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 7 + 3);
  // made across y and turned to the world's x by `FIT`: piers 7 wide with their middles 15 out, as the world has them
  const half = 11.5,
    pier = 7,
    t = 3.5,
    spring = 20;
  const r0 = half,
    r1 = half + pier;
  for (const s of [-1, 1]) {
    const broken = variant === 1 && s < 0;
    const courses = broken ? 2 : 3;
    for (let c = 0; c < courses; c++) {
      const z0 = (c * spring) / 3,
        z1 = ((c + 1) * spring) / 3 - (broken && c === courses - 1 ? 2.5 : 0);
      const j = (random() - 0.5) * 0.5;
      block(
        stone(parts, random),
        posed(j, 0, 0, (random() - 0.5) * 0.05),
        -t,
        t,
        s * half,
        s * (half + pier),
        z0 - (c === 0 ? 2 : 0),
        z1,
      );
    }
    if (!broken)
      block(
        parts.of('ruinDark'),
        here,
        -t - 0.5,
        t + 0.5,
        s * (half - 0.4),
        s * (half + pier + 0.5),
        spring - 1.2,
        spring,
      );
  }
  const n = 7;
  for (let i = 0; i < n; i++) {
    if (variant === 1 && i <= 3) continue;
    const a0 = Math.PI - (i / n) * Math.PI,
      a1 = Math.PI - ((i + 1) / n) * Math.PI;
    const key = i === 3;
    const out = key ? 1.4 : 0;
    // a wedge between two radii, as a slab across the arch's thickness (x)
    const outline: [number, number][] = [
      [Math.cos(a0) * r0, spring + Math.sin(a0) * r0],
      [Math.cos(a1) * r0, spring + Math.sin(a1) * r0],
      [Math.cos(a1) * (r1 + out), spring + Math.sin(a1) * (r1 + out)],
      [Math.cos(a0) * (r1 + out), spring + Math.sin(a0) * (r1 + out)],
    ];
    // the slab's outline is in its own x and z, with its thickness along its own y: turned so that is the arch's x
    slab(
      key ? parts.of('ruinDark') : stone(parts, random),
      (p) => [-p[1] * (key ? 1.15 : 1), p[0], p[2]],
      outline,
      2 * t * 0.96,
    );
  }
  if (variant === 1)
    for (let k = 0; k < 4; k++) {
      // fallen at the foot of the broken pier, where it stood, and not across the way through
      const r = 1.2 + random() * 0.8;
      lump(
        stone(parts, random),
        posed((random() - 0.5) * t, -(half + 1.5 + random() * (pier - 3)), 0, random() * 3),
        random,
        3,
        5,
        [r, r * 0.8, r * 0.6],
        {
          give: 0.25,
          floor: -r * 0.1,
        },
      );
    }
  return parts.done('arch');
}

/**
 * A fallen column along x: three drums of it lying where they rolled, each a little turned from the next and fluted (a
 * twelve-sided drum, its edges catching the light as flutes do), the square capital at one end and the base still
 * standing at the other. The second variant has its drums further apart.
 */
function column(variant: number): Scenery {
  const parts = new Parts();
  const r = 3.2,
    drum = 9;
  const spread = variant === 0 ? 0.8 : 2.2;
  // the base still standing, its broken top a short drum
  block(parts.of('ruinDark'), here, -25, -17, -4, 4, -1, 2);
  frustum(parts.of('ruin'), posed(-21, 0, 2), 12, r * 1.05, r, 0, 5, { top: true });
  for (let k = 0; k < 3; k++) {
    const x = -16 + k * (drum + spread) + drum / 2;
    const turn = (k - 1) * (variant === 0 ? 0.05 : 0.12);
    const place = posed(x - (Math.cos(turn) * drum) / 2, Math.sin(turn) * (k - 1) * 2, r * 0.97, turn, Math.PI / 2);
    frustum(parts.of(k === 1 ? 'ruinDark' : 'ruin'), place, 12, r, r, 0, drum, { top: true, bottom: true });
  }
  // the capital, tipped on its side at the far end
  const cx = -16 + 3 * (drum + spread) + 3;
  block(parts.of('ruinDark'), posed(cx, 0, 0, 0.1), -3, 3, -3.6, 3.6, 0, 7.5);
  return parts.done('column');
}

/** A haystack: a round golden stack with a domed top, a little lopsided, and a darker band of older hay at its foot. */
function haystack(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 13 + 2);
  const r = 6.6 + variant * 0.5;
  frustum(parts.of('hayDark'), here, 9, r, r * 0.98, -1, 3, { top: false });
  lump(parts.of('hay'), posed(0, 0, 3, random() * 3), random, 4, 9, [r, r * 0.95, 13 + variant * 1.5], {
    give: 0.08,
    floor: 0,
  });
  // a rope round it, a little up
  frustum(parts.of('timber'), posed(0, 0, 8), 9, r * 0.93, r * 0.88, 0, 0.5, { top: false });
  return parts.done('haystack');
}

/** A hay cart along x: a plank bed on two big wheels, its shafts reaching forward to the ground, and a load of hay. */
function cart(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 7 + 11);
  block(parts.of('timber'), here, -8, 6, -5, 5, 4.5, 5.5);
  for (const y of [-5, 5]) block(parts.of('plank'), here, -8, 6, y - 0.4, y + 0.4, 5.5, 8);
  block(parts.of('plank'), here, -8.4, -7.6, -5, 5, 5.5, 8.5);
  // the wheels, and their hubs
  for (const s of [-1, 1]) {
    frustum(
      parts.of('timber'),
      posed(-1, s * 6.4, 4.2, 0, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2),
      10,
      4.2,
      4.2,
      0,
      0.6,
      {
        top: true,
        bottom: true,
      },
    );
    frustum(parts.of('iron'), posed(-1, s * 7, 4.2, 0, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2), 6, 0.8, 0.6, 0, 0.6, {
      top: true,
    });
  }
  // the shafts, down to the ground in front
  for (const y of [-3.2, 3.2]) block(parts.of('timber'), posed(6, y, 4.6, 0, 0.34), 0, 6.6, -0.35, 0.35, 0, 0.6);
  if (variant === 0) lump(parts.of('hay'), posed(-1, 0, 6.5), random, 3, 7, [6.2, 4.2, 5.5], { give: 0.15, floor: -1 });
  else
    for (let k = 0; k < 3; k++)
      block(
        parts.of('crate'),
        posed(-5 + k * 4.2, (random() - 0.5) * 2, 5.5, random() * 0.3),
        -1.7,
        1.7,
        -1.7,
        1.7,
        0,
        3.2,
      );
  return parts.done('cart');
}

/**
 * A market stall along y: four posts, a table spread with produce (red and green apples, orange gourds, a few crates)
 * and a striped awning over it, sloping to the front.
 */
function stall(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 5 + 3);
  for (const x of [-5.5, 5.5])
    for (const y of [-9, 9])
      block(parts.of('timber'), here, x - 0.45, x + 0.45, y - 0.45, y + 0.45, -1, x < 0 ? 19 : 16.5);
  block(parts.of('timber'), here, -5.5, 5.5, -9.5, 9.5, 7, 8);
  block(parts.of('cloth'), here, 5.2, 5.6, -9.4, 9.4, 2, 7.6);
  // the awning: stripes in two colours, each a slab sloping from the back down to the front
  const stripes = 7;
  for (let k = 0; k < stripes; k++) {
    const y0 = -10 + (k * 20) / stripes,
      y1 = -10 + ((k + 1) * 20) / stripes;
    const outline: [number, number][] = [
      [-6.5, 19.4],
      [7, 16.4],
      [7, 16.9],
      [-6.5, 19.9],
    ];
    slab(
      parts.of(k % 2 ? 'awningLight' : 'awning'),
      (p) => [p[0], (y0 + y1) / 2 + p[1] * ((y1 - y0) / 1), p[2]],
      outline,
      1,
    );
  }
  // the produce, in heaps
  const heaps = ['apples', 'greens', 'gourds'];
  for (let k = 0; k < 6; k++) {
    const part = heaps[(k + variant) % 3];
    lump(parts.of(part), posed(-2 + random() * 5, -7.5 + k * 3, 8.4), random, 3, 6, [1.5, 1.3, 1.1], {
      give: 0.2,
      floor: -0.6,
    });
  }
  for (const y of [-6, 4]) block(parts.of('crate'), posed(-4, y, 0, random() * 0.4), -1.8, 1.8, -1.8, 1.8, 0, 3.4);
  return parts.done('stall');
}

/** Where a windmill's sails turn, on its cap, facing +x: the scene turns them by game time about this point's x. */
export const SAILS_HUB: readonly [number, number, number] = [12.5, 0, 72];

/**
 * A windmill: a whitewashed round tower on a stone foot, tapering, with a door and small windows, under a pointed
 * timber cap. Its sails are not here: they turn, and are `windmillSails`, placed by the scene at `SAILS_HUB`.
 */
function windmill(): Scenery {
  const parts = new Parts();
  frustum(parts.of('stoneDark'), here, 10, 11.5, 11.2, -3, 6, { top: false });
  frustum(parts.of('walls'), posed(0, 0, 6), 10, 11, 8, 0, 62, { top: true });
  frustum(parts.of('roof'), posed(0, 0, 66), 10, 9.8, 0, 0, 20, { bottom: true });
  frustum(parts.of('timber'), posed(0, 0, 65), 10, 9.6, 9.6, 0, 2, { top: true, bottom: true });
  // the shaft out to the sails' hub
  frustum(parts.of('timber'), posed(8, 0, SAILS_HUB[2], 0, Math.PI / 2), 6, 1, 1, 0, SAILS_HUB[0] - 8, { top: true });
  block(parts.of('door'), here, 10.6, 11.6, -3, 3, 0, 14);
  for (const z of [26, 46])
    block(parts.of('window'), here, 10.2 - (z - 6) * 0.05, 11.2 - (z - 6) * 0.05, -1.8, 1.8, z, z + 5);
  return parts.done('windmill');
}

/** A windmill's four sails about their hub at the origin, in the plane facing +x: a spar each, and a lattice of slats. */
export function windmillSails(): Scenery {
  const parts = new Parts();
  frustum(parts.of('timber'), posed(0, 0, 0, 0, Math.PI / 2), 8, 1.8, 1.4, 0, 1.6, { top: true });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    // in the plane x = 0: y and z by the sail's angle
    const place: Place = ([x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
    block(parts.of('timber'), place, 0.4, 1.2, -0.45, 0.45, 1, 36);
    block(parts.of('sail'), place, 0.6, 0.9, 0.5, 6.5, 8, 35);
    for (let j = 0; j < 5; j++) block(parts.of('timber'), place, 0.9, 1.3, 0.4, 6.8, 9 + j * 6.4, 9.6 + j * 6.4);
  }
  return parts.done('sails');
}

/** A standing stone: a tall weathered slab, leaning a little, its top rounded, lichen on its sunward face. */
function menhir(variant: number): Scenery {
  const parts = new Parts();
  const random = seeded(variant * 29 + 7);
  const lean = (random() - 0.5) * 0.14;
  const h = 15 + variant * 2.8;
  lump(parts.of('menhir'), posed(0, 0, h * 0.5, random() * 0.5, lean), random, 4, 6, [3, 2.3, h * 0.55], {
    give: 0.14,
    floor: -h * 0.52,
  });
  lump(parts.of('moss'), posed(0.8, 0.4, h * 0.3, 0.4, lean), random, 2, 5, [2.2, 1.7, 2.2], { give: 0.2 });
  return parts.done('menhir');
}

/** The mesh of a built kind's variant. */
export function builtOf(kind: BuiltKind, variant: number): Scenery {
  return fitted(made(kind, variant), FIT[kind]);
}

/** The mesh of a built kind's variant, as it is made, before it is fitted to the world's footprint. */
function made(kind: BuiltKind, variant: number): Scenery {
  switch (kind) {
    case 'cottage':
      return cottage(variant);
    case 'church':
      return church();
    case 'well':
      return well();
    case 'fence':
      return fence(variant);
    case 'wall':
      return wall(variant);
    case 'tower':
      return tower(variant);
    case 'arch':
      return archway(variant);
    case 'column':
      return column(variant);
    case 'haystack':
      return haystack(variant);
    case 'cart':
      return cart(variant);
    case 'stall':
      return stall(variant);
    case 'windmill':
      return windmill();
    case 'menhir':
      return menhir(variant);
  }
}
