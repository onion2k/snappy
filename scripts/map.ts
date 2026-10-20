/**
 * The world from above, as a picture to read the layout by: `npm run map`
 * writes reports/map.png, and `npm run map -- --crop x0,y0,x1,y1` writes
 * that box of tiles, close up, to reports/map-crop.png. Height is shaded and
 * contoured, water is light where the rover can ford it and dark where it
 * cannot, the biomes and the surfaces are coloured, rock is grey, what is
 * built is red, ground too steep to stand on is hatched, rock that was
 * mended from ground nothing reached is magenta, and ground the drive graph
 * cannot reach is bright red (there should be none). Trees are drawn as
 * their crowns, the rest as dots. The landmarks are named, each unclimbable
 * bank is an arrow from below to above with its viewpoint in cyan, and the
 * crossing from the west edge
 * to the east is drawn in magenta. It prints the figures the world's tests
 * hold.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FOOTPRINT } from '../src/world/built';
import { canTravel } from '../src/world/drive';
import { BANK_LOOK, bankViews, generate, units } from '../src/world/generate';
import { crossing, graphOf, reach, route, routeLength, routeTime, tileAt } from '../src/world/graph';
import { groundOf } from '../src/world/ground';
import { BANKS } from '../src/world/layout';
import { BIOME, BIOMES, BUILT, DRIVE, SURFACE, type Kind } from '../src/world/types';

const cropAt = process.argv.indexOf('--crop');
const crop = cropAt > 0 ? process.argv[cropAt + 1].split(',').map(Number) : null;

const { map, stats } = generate();
const graph = graphOf(map);
const { cols, rows, originX, originY, tile } = map.grid;
const [vx0, vy0, vx1, vy1] = crop ?? [0, 0, cols, rows];
const PX = crop ? Math.max(4, Math.floor(1100 / Math.max(vx1 - vx0, vy1 - vy0))) : 3;
const W = (vx1 - vx0) * PX,
  H = (vy1 - vy0) * PX;
const png = new PNG({ width: W, height: H });
const g = groundOf(map);
const reached = reach(graph, tileAt(map, map.start.x, map.start.y));

const BIOME_RGB: [number, number, number][] = [
  [128, 182, 84],
  [46, 98, 62],
  [196, 132, 56],
  [150, 112, 146],
  [88, 140, 112],
];
const SURFACE_RGB: Record<number, [number, number, number]> = {
  [SURFACE.dirt]: [176, 136, 88],
  [SURFACE.sand]: [226, 208, 150],
  [SURFACE.mud]: [104, 84, 58],
  [SURFACE.stone]: [150, 148, 142],
};

function put(x: number, y: number, rgb: readonly number[], a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  for (let k = 0; k < 3; k++) png.data[i + k] = Math.round(png.data[i + k] * (1 - a) + rgb[k] * a);
  png.data[i + 3] = 255;
}

/** A world point, in units, as a pixel. */
function pixel(x: number, y: number): [number, number] {
  return [Math.floor(((x - originX) / tile - vx0) * PX), Math.floor(H - ((y - originY) / tile - vy0) * PX)];
}

const mended = new Uint8Array(cols * rows);
for (const t of stats.mendedTiles) mended[t] = 1;

for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const x = originX + (vx0 + (i + 0.5) / PX) * tile,
      y = originY + (vy1 - (j + 0.5) / PX) * tile;
    const t = tileAt(map, x, y);
    const h = g.heightAt(x, y);
    const depth = g.waterDepthAt(x, y);
    let rgb: number[] = [0, 0, 0];
    for (let b = 0; b < BIOMES; b++) {
      const w = map.biomes[t * BIOMES + b] / 255;
      for (let k = 0; k < 3; k++) rgb[k] += BIOME_RGB[b][k] * w;
    }
    const s = map.surface[t];
    if (s in SURFACE_RGB) rgb = [...SURFACE_RGB[s]];
    if (map.solid[t]) rgb = mended[t] ? [200, 60, 200] : [112, 106, 102];
    if (graph.stand[t] && !reached[t]) rgb = [255, 0, 0];
    // the light from the north-west, off the ground's slope and its steps
    const e = 1.5;
    const dx = (g.heightAt(x + e, y) - g.heightAt(x - e, y)) / (2 * e),
      dy = (g.heightAt(x, y + e) - g.heightAt(x, y - e)) / (2 * e);
    const shade = Math.max(0.45, Math.min(1.35, 1 + 0.9 * (-dx * 0.7 + dy * 0.7)));
    const lift = 1 + Math.min(0.25, Math.max(0, h) / 300);
    rgb = rgb.map((c) => c * shade * lift);
    if (depth > 0) rgb = depth > DRIVE.shallow ? [30 + 20 / depth, 76 + 30 / depth, 150] : [118, 196, 222];
    // contours every five units of height
    const hx = g.heightAt(x + tile / PX, y);
    if (depth <= 0 && Math.floor(h / 5) !== Math.floor(hx / 5)) rgb = rgb.map((c) => c * 0.82);
    // ground too steep to stand on: hatched
    if (!map.solid[t] && depth <= DRIVE.shallow && !graph.stand[t] && (i + j) % 5 < 2) rgb = rgb.map((c) => c * 0.55);
    put(
      i,
      j,
      rgb.map((c) => Math.max(0, Math.min(255, c))),
    );
  }

// built footprints, in red
for (const p of map.placements) {
  if (!BUILT.has(p.kind)) continue;
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  const d = 6 / PX;
  for (const [mx, my, hx, hy] of FOOTPRINT[p.kind] ?? [])
    for (let lx = -hx; lx <= hx; lx += d)
      for (let ly = -hy; ly <= hy; ly += d) {
        const [i, j] = pixel(p.x + (mx + lx) * c - (my + ly) * s, p.y + (mx + lx) * s + (my + ly) * c);
        put(i, j, [196, 52, 44]);
      }
}

// the scenery: trees as their crowns, about a fifth of their height across, the rest as dots
const LOOK: Partial<Record<Kind, [number, number, number, number]>> = {
  conifer: [24, 66, 40, 9],
  broadleaf: [52, 126, 44, 12],
  twisted: [96, 62, 96, 8],
  boulder: [214, 214, 210, 4],
  bush: [62, 112, 50, 4],
  fern: [100, 164, 70, 2.5],
  reed: [196, 182, 100, 1.5],
  flowers: [246, 226, 96, 2],
  willow: [92, 140, 84, 12],
  fruit: [120, 168, 60, 7],
  lily: [70, 150, 80, 1.5],
  stepping: [236, 232, 220, 1.5],
  post: [60, 40, 24, 1],
  signpost: [255, 255, 255, 1.5],
  bench: [140, 90, 50, 1.5],
  lamp: [255, 230, 120, 1.5],
};
const order: Kind[] = [
  'flowers',
  'lily',
  'fern',
  'reed',
  'bush',
  'boulder',
  'stepping',
  'post',
  'signpost',
  'bench',
  'lamp',
  'fruit',
  'twisted',
  'willow',
  'broadleaf',
  'conifer',
];
for (const kind of order)
  for (const p of map.placements) {
    if (p.kind !== kind) continue;
    const d = LOOK[kind]!;
    let rgb: number[] = d.slice(0, 3);
    if (kind === 'broadleaf' && p.biome === BIOME.autumn)
      rgb = p.vary < 0.4 ? [214, 96, 30] : p.vary < 0.75 ? [226, 168, 40] : [178, 52, 36];
    if (kind === 'flowers' && p.biome === BIOME.heath) rgb = [190, 110, 200];
    const r = Math.max(0.6, (d[3] * p.scale * PX) / tile);
    const [ci, cj] = pixel(p.x, p.y);
    for (let a = -Math.ceil(r); a <= Math.ceil(r); a++)
      for (let b = -Math.ceil(r); b <= Math.ceil(r); b++) {
        const q = Math.sqrt(a * a + b * b);
        if (q > r) continue;
        const edge = q > r - 1 && r > 2;
        // lit from the north-west, so a crown reads as round
        const lit = 1 + (0.25 * (-a - b)) / (r + 1);
        put(ci + a, cj + b, edge ? rgb.map((c) => c * 0.6) : rgb.map((c) => Math.min(255, c * lit)));
      }
  }

function line(x0: number, y0: number, x1: number, y1: number, rgb: number[], width = 1) {
  const [i0, j0] = pixel(x0, y0),
    [i1, j1] = pixel(x1, y1);
  const steps = Math.max(1, Math.abs(i1 - i0), Math.abs(j1 - j0));
  for (let k = 0; k <= steps; k++) {
    const i = Math.round(i0 + ((i1 - i0) * k) / steps),
      j = Math.round(j0 + ((j1 - j0) * k) / steps);
    for (let a = 0; a < width; a++) for (let b = 0; b < width; b++) put(i + a, j + b, rgb);
  }
}

// the plazas' outlines, in white
for (const plaza of map.plazas) {
  const o = plaza.outline;
  for (let k = 0; k < o.length; k += 2) {
    const j = (k + 2) % o.length;
    line(o[k], o[k + 1], o[j], o[j + 1], [255, 255, 255], 1);
  }
}

// the crossing from the west edge to the east
const { from, to } = crossing(map, graph);
const way = route(map, from, to);
for (let k = 2; k < way.length; k += 2) line(way[k - 2], way[k - 1], way[k], way[k + 1], [230, 30, 200], 2);

// a 3 by 5 font, for the names
const FONT: Record<string, string> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  '-': '000000111000000',
  '.': '000000000000010',
  ' ': '000000000000000',
  ':': '000010000010000',
};
function text(i: number, j: number, s: string, rgb: number[] = [255, 255, 255], scale = 2) {
  let x = i;
  for (const ch of s.toUpperCase()) {
    const f = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        for (let a = -1; a <= scale; a++)
          for (let b = -1; b <= scale; b++) {
            const on = f[r * 3 + c] === '1';
            if (on && a >= 0 && b >= 0 && a < scale && b < scale) put(x + c * scale + a, j + r * scale + b, rgb);
            else if (on) put(x + c * scale + a, j + r * scale + b, [0, 0, 0], 0.6);
          }
    x += 4 * scale;
  }
}

// the banks: an arrow from below to above, orange where the straight drive fails as it should
for (const b of BANKS) {
  const lo = units(b.below[0] + 0.5, b.below[1] + 0.5),
    hi = units(b.above[0] + 0.5, b.above[1] + 0.5);
  const blocked = !canTravel(g, lo.x, lo.y, hi.x, hi.y);
  line(lo.x, lo.y, hi.x, hi.y, blocked ? [255, 150, 0] : [255, 0, 0], 2);
  const [i, j] = pixel(hi.x, hi.y);
  text(i + 4, j - 4, b.name, [255, 200, 120]);
}

// each bank's viewpoint, in cyan, and where the chase camera looks from it
for (const v of bankViews(map)) {
  line(v.x, v.y, v.x + Math.cos(v.yaw) * BANK_LOOK, v.y + Math.sin(v.yaw) * BANK_LOOK, [0, 230, 255], 2);
  const [i, j] = pixel(v.x, v.y);
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) put(i + a, j + b, [0, 230, 255]);
}

for (const l of map.landmarks) {
  const [i, j] = pixel(l.x, l.y);
  for (let a = -3; a <= 3; a++)
    for (let b = -3; b <= 3; b++)
      put(i + a, j + b, Math.max(Math.abs(a), Math.abs(b)) === 3 ? [0, 0, 0] : [255, 255, 255]);
  if (l.kind !== 'start') text(i + 6, j - 4, l.name);
}

mkdirSync('reports', { recursive: true });
const out = crop ? 'reports/map-crop.png' : 'reports/map.png';
writeFileSync(out, PNG.sync.write(png));

// the figures
const counts: Record<string, number> = {};
for (const p of map.placements) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
let standing = 0,
  reachedCount = 0;
for (let t = 0; t < cols * rows; t++) {
  standing += graph.stand[t];
  reachedCount += reached[t];
}
const len = routeLength(way);
console.log(`built in ${stats.ms.toFixed(0)} ms`);
console.log(`standable tiles ${standing} of ${cols * rows}, reached ${reachedCount}, mended to rock ${stats.mended}`);
console.log(`placements ${map.placements.length}:`, counts);
console.log(
  `west to east: ${len.toFixed(0)} units, ${(len / 20).toFixed(1)} s at 20 u/s, ${routeTime(map, way).toFixed(1)} s at the ground's pace`,
);
for (const b of BANKS) {
  const lo = units(b.below[0] + 0.5, b.below[1] + 0.5),
    hi = units(b.above[0] + 0.5, b.above[1] + 0.5);
  const lt = tileAt(map, lo.x, lo.y),
    ht = tileAt(map, hi.x, hi.y);
  console.log(
    `${b.name}: straight ${canTravel(g, lo.x, lo.y, hi.x, hi.y) ? 'DRIVES' : 'blocked'}, below ${reached[lt] ? 'reached' : 'NOT REACHED'}, above ${reached[ht] ? 'reached' : 'NOT REACHED'}, rise ${(g.heightAt(hi.x, hi.y) - g.heightAt(lo.x, lo.y)).toFixed(1)}`,
  );
}
console.log(`wrote ${out}`);
