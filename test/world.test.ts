/**
 * The world as it is made, held to the spec's criteria 1 to 5: made the
 * same every time, every standable place reached, the banks that cannot be
 * climbed each with a way round, the river forded on the roads and walled
 * where it is deep, and a crossing from the west edge to the east that takes
 * a minute or two. The drive graph is made once here, with the rule the
 * rover moves by.
 */
import { describe, expect, it } from 'vitest';
import { World } from '../src/physics';
import { FOOTPRINT, ROCK_TOP, TOP } from '../src/world/built';
import { canTravel, standable } from '../src/world/drive';
import {
  BANK_LOOK,
  bankViews,
  buildWorld,
  faceAt,
  generate,
  OBSTACLE,
  ORIGIN_X,
  ORIGIN_Y,
  units,
  worldHash,
} from '../src/world/generate';
import { memoGround } from '../src/world/memo';
import {
  clear,
  crossing,
  fits,
  graphOf,
  middle,
  narrow,
  reach,
  route,
  routeLength,
  routeTime,
  tileAt,
  TIGHT,
} from '../src/world/graph';
import { groundOf } from '../src/world/ground';
import {
  BANKS,
  COLS,
  FORDS,
  LAKES,
  MARSH,
  PUDDLES,
  RIVER,
  ROWS,
  RUINS,
  VILLAGE,
  WATER_LEVEL,
} from '../src/world/layout';
import { area2, inside } from '../src/world/plaza';
import { fordIndices, RIVER_LINE } from '../src/world/relief';
import { BOB, ODDITIES } from '../src/world/oddities';
import { HEAD } from '../src/rover';
import { SUN } from '../src/sun';
import { variantOf } from '../src/models/kit';
import { BEAM } from '../src/models/oddities';
import {
  BIOME,
  BIOMES,
  BUILT,
  DRIVE,
  KINDS,
  PROPS,
  SUBJECT_KINDS,
  SUBJECTS,
  SURFACE,
  paintOf,
  TILE,
  type Kind,
  type Placement,
  type SubjectKind,
} from '../src/world/types';

/** The world's hash, pinned: a change that moves it is a change to the world, and says so here. */
const HASH = '943d165d';

const { map, stats } = generate();
const g = groundOf(map);
const graph = graphOf(map);
const startTile = tileAt(map, map.start.x, map.start.y);
const reached = reach(graph, startTile);
const n = COLS * ROWS;
const at = (px: number, py: number) => units(px + 0.5, py + 0.5);

describe('criterion 1: the world is made from content, the same every time', () => {
  it('hashes to the pinned value', () => {
    expect(worldHash(map)).toBe(HASH);
  });

  it('is made again to the byte', () => {
    const again = buildWorld();
    expect(worldHash(again)).toBe(worldHash(map));
    expect(again.terrain).toEqual(map.terrain);
    expect(again.placements).toEqual(map.placements);
  });

  it('hashes a change of a single byte to something else', () => {
    const copy = { ...map, solid: Uint8Array.from(map.solid) };
    copy.solid[12345] ^= 1;
    expect(worldHash(copy)).not.toBe(worldHash(map));
  });

  it('is 320 tiles of 6 units a side, centred on the origin', () => {
    expect(map.grid).toEqual({ cols: 320, rows: 320, originX: -960, originY: -960, tile: 6 });
    expect(ORIGIN_X + (COLS * TILE) / 2).toBe(0);
    expect(ORIGIN_Y + (ROWS * TILE) / 2).toBe(0);
    for (const a of [map.terrain, map.steps, map.solid, map.surface]) expect(a).toHaveLength(n);
    expect(map.biomes).toHaveLength(n * BIOMES);
    expect(map.waterLevel).toBe(WATER_LEVEL);
  });

  it('is ground the physics accepts', () => {
    expect(
      () => new World({ capacity: 1, grid: map.grid, solid: map.solid, radii: [], terrain: map.terrain }),
    ).not.toThrow();
  });

  it('shares every tile among the biomes, to 255', () => {
    for (let t = 0; t < n; t++) {
      let sum = 0;
      for (let b = 0; b < BIOMES; b++) sum += map.biomes[t * BIOMES + b];
      if (sum !== 255) expect(sum, `tile ${t}`).toBe(255);
    }
  });

  it('has each of the five biomes as the strongest somewhere, over a good stretch', () => {
    const strongest = new Array<number>(BIOMES).fill(0);
    for (let t = 0; t < n; t++) {
      let best = 0;
      for (let b = 1; b < BIOMES; b++) if (map.biomes[t * BIOMES + b] > map.biomes[t * BIOMES + best]) best = b;
      strongest[best]++;
    }
    // each at least a twentieth of the world: about 30 m by 30 m
    for (let b = 0; b < BIOMES; b++) expect(strongest[b], `biome ${b}`).toBeGreaterThan(n / 20);
  });

  it('never changes biome at a line', () => {
    // across any two tiles side by side, no biome's share jumps by more than an eighth
    let jump = 0;
    for (let ty = 0; ty < ROWS - 1; ty++)
      for (let tx = 0; tx < COLS - 1; tx++)
        for (let b = 0; b < BIOMES; b++) {
          const a = map.biomes[(ty * COLS + tx) * BIOMES + b];
          jump = Math.max(
            jump,
            Math.abs(a - map.biomes[(ty * COLS + tx + 1) * BIOMES + b]),
            Math.abs(a - map.biomes[((ty + 1) * COLS + tx) * BIOMES + b]),
          );
        }
    expect(jump).toBeLessThanOrEqual(32);
  });

  it('blends one wood into the next over tens of metres', () => {
    // walking from the village to each wood, the wood's share goes from a fifth to four fifths over 12 m or more
    const village: [number, number] = [VILLAGE.x, VILLAGE.y];
    for (const [biome, to] of [
      [BIOME.pine, [52, 250]],
      [BIOME.autumn, [48, 70]],
      [BIOME.heath, [158, 64]],
    ] as const) {
      let first = -1,
        last = -1;
      const steps = 400;
      for (let i = 0; i <= steps; i++) {
        const px = village[0] + ((to[0] - village[0]) * i) / steps,
          py = village[1] + ((to[1] - village[1]) * i) / steps;
        const s = map.biomes[(Math.floor(py) * COLS + Math.floor(px)) * BIOMES + biome] / 255;
        if (first < 0 && s >= 0.2) first = i;
        if (last < 0 && s >= 0.8) last = i;
      }
      const metres = (((last - first) / steps) * Math.hypot(to[0] - village[0], to[1] - village[1]) * TILE) / 10;
      expect(first, `biome ${biome}`).toBeGreaterThanOrEqual(0);
      expect(metres, `biome ${biome}`).toBeGreaterThanOrEqual(12);
    }
  });

  it('lays the wetland along the river and the Mere', () => {
    const [rx, ry] = RIVER.points[8];
    const t = Math.floor(ry) * COLS + Math.floor(rx) + 8;
    let wet = 0;
    for (let dx = -12; dx <= 12; dx++) wet = Math.max(wet, map.biomes[(t + dx) * BIOMES + BIOME.wetland]);
    expect(wet).toBeGreaterThan(128);
  });
});

describe('criterion 2: every place is reachable', () => {
  it('starts the rover in the village, on the road out of the square, facing along it', () => {
    expect(fits(g, map.start.x, map.start.y)).toBe(true);
    expect(map.surface[startTile]).toBe(SURFACE.dirt);
    const v = at(VILLAGE.x, VILLAGE.y);
    expect(Math.hypot(map.start.x - v.x, map.start.y - v.y)).toBeLessThan((VILLAGE.half + 8) * TILE);
    for (const plaza of map.plazas) expect(inside(plaza.outline, map.start.x, map.start.y)).toBe(false);
    // the road's way at the start, read from the nearest two of its points
    let best = Infinity,
      way = 0;
    for (const road of map.roads)
      for (let i = 2; i < road.points.length; i += 2) {
        const d = Math.hypot(road.points[i] - map.start.x, road.points[i + 1] - map.start.y);
        if (d < best) {
          best = d;
          way = Math.atan2(road.points[i + 1] - road.points[i - 1], road.points[i] - road.points[i - 2]);
        }
      }
    expect(Math.abs(Math.atan2(Math.sin(map.start.yaw - way), Math.cos(map.start.yaw - way)))).toBeLessThan(0.4);
  });

  it('reaches every tile the rover fits on, from the start, along links that go both ways with room for its body', () => {
    const lost: number[] = [];
    let standing = 0;
    for (let t = 0; t < n; t++) {
      standing += graph.stand[t];
      if (graph.stand[t] && !reached[t]) lost.push(t);
    }
    console.log(`standable tiles: ${standing} of ${n}, mended to rock: ${stats.mended}`);
    expect(lost.map((t) => `${t % COLS},${Math.floor(t / COLS)}`).slice(0, 20)).toEqual([]);
    // most of the world is open to drive, and only a little had to be mended
    expect(standing).toBeGreaterThan(n * 0.55);
    expect(stats.mended).toBeLessThan(n * 0.01);
  });

  it('mended no ground near a road, a ruin or the village', () => {
    for (const t of stats.mendedTiles) {
      const [x, y] = middle(map, t);
      const px = (x - ORIGIN_X) / TILE,
        py = (y - ORIGIN_Y) / TILE;
      for (const r of RUINS) expect(Math.hypot(px - r.x, py - r.y), `${t} by ${r.name}`).toBeGreaterThan(r.floor + 6);
      expect(Math.hypot(px - VILLAGE.x, py - VILLAGE.y)).toBeGreaterThan(30);
      for (const road of map.roads)
        for (let i = 0; i < road.points.length; i += 8)
          if (Math.hypot(road.points[i] - x, road.points[i + 1] - y) < 4 * TILE) expect.fail(`mended ${t} by a road`);
    }
  });

  it('reaches every landmark', () => {
    const kinds = new Set(map.landmarks.map((l) => l.kind));
    for (const k of ['start', 'village', 'ruin', 'ford', 'lake', 'summit', 'find'] as const)
      expect(kinds.has(k), k).toBe(true);
    for (const l of map.landmarks) expect(reached[tileAt(map, l.x, l.y)], l.name).toBe(1);
    expect(map.landmarks.filter((l) => l.kind === 'ruin').map((l) => l.name)).toEqual(RUINS.map((r) => r.name));
    // a lake is named from its dry shore
    for (const l of map.landmarks.filter((m) => m.kind === 'lake')) expect(g.waterDepthAt(l.x, l.y), l.name).toBe(0);
    expect(map.landmarks.filter((l) => l.kind === 'lake').map((l) => l.name)).toEqual(LAKES.map((l) => l.name));
  });

  it('cannot stand on any tile at the edge of the world', () => {
    for (let i = 0; i < COLS; i++)
      for (const t of [i, (ROWS - 1) * COLS + i, i * COLS, i * COLS + COLS - 1])
        expect(graph.stand[t], `edge ${t}`).toBe(0);
  });

  it('keeps the rover out of everything built', () => {
    for (const p of map.placements) {
      if (!BUILT.has(p.kind)) continue;
      const c = Math.cos(p.yaw),
        s = Math.sin(p.yaw);
      for (const [mx, my] of FOOTPRINT[p.kind]!)
        expect(g.solidAt(p.x + mx * c - my * s, p.y + mx * s + my * c), p.kind).toBe(true);
    }
  });
});

describe('criterion 3: banks and ledges the rover cannot climb, each with a way round', () => {
  it('names at least six', () => {
    expect(BANKS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(BANKS.map((b) => b.name)).size).toBe(BANKS.length);
  });

  for (const bank of BANKS)
    it(`${bank.name}: the straight drive up fails both ways, and the graph goes round`, () => {
      const lo = at(...bank.below),
        hi = at(...bank.above);
      expect(fits(g, lo.x, lo.y), 'below').toBe(true);
      expect(fits(g, hi.x, hi.y), 'above').toBe(true);
      // it is a bank or a ledge: the top stands well above the foot
      expect(g.heightAt(hi.x, hi.y) - g.heightAt(lo.x, lo.y)).toBeGreaterThan(DRIVE.step + 1);
      expect(canTravel(g, lo.x, lo.y, hi.x, hi.y)).toBe(false);
      expect(canTravel(g, hi.x, hi.y, lo.x, lo.y)).toBe(false);
      expect(reached[tileAt(map, lo.x, lo.y)]).toBe(1);
      expect(reached[tileAt(map, hi.x, hi.y)]).toBe(1);
      const way = route(map, lo, hi);
      expect(way.length).toBeGreaterThan(4);
      for (let i = 2; i < way.length; i += 2) expect(clear(g, way[i - 2], way[i - 1], way[i], way[i + 1])).toBe(true);
    });
});

describe('the banks read as banks', () => {
  for (const bank of BANKS)
    it(`${bank.name}: shows a bare face between its foot and its top, and has a view of it`, () => {
      const lo = at(...bank.below),
        hi = at(...bank.above);
      let bare = 0;
      for (let k = 0; k <= 40; k++) {
        const t = tileAt(map, lo.x + ((hi.x - lo.x) * k) / 40, lo.y + ((hi.y - lo.y) * k) / 40);
        if (map.surface[t] === SURFACE.stone) bare++;
      }
      expect(bare, 'stone on the way up').toBeGreaterThan(0);
      const view = bankViews(map).find((v) => v.name === bank.name)!;
      expect(reached[tileAt(map, view.x, view.y)], 'the view is reached').toBe(1);
      expect(fits(g, view.x, view.y), 'the rover fits at the view').toBe(true);
      // it faces up the line from the foot to the top
      const up = Math.atan2(hi.y - lo.y, hi.x - lo.x);
      expect(Math.abs(Math.atan2(Math.sin(up - view.yaw), Math.cos(up - view.yaw)))).toBeLessThan(1e-9);
      // where the chase camera looks, a little ahead, is the face itself
      const look = { x: view.x + Math.cos(view.yaw) * BANK_LOOK, y: view.y + Math.sin(view.yaw) * BANK_LOOK };
      expect(faceAt(map, look.x, look.y), 'the look-at point is on the face').toBe(true);
      expect(map.surface[tileAt(map, look.x, look.y)]).toBe(SURFACE.stone);
      // and the drive straight up from it is blocked
      const far = { x: view.x + Math.cos(view.yaw) * 60, y: view.y + Math.sin(view.yaw) * 60 };
      expect(canTravel(g, view.x, view.y, far.x, far.y)).toBe(false);
    });

  it('stands nothing on a face, so each reads as bare ground', () => {
    for (const p of map.placements) if (faceAt(map, p.x, p.y)) expect.fail(`${p.kind} on a face at ${p.x},${p.y}`);
  });

  it('grows no meadow or wood tree on ground that is most heath: the heath has its own', () => {
    for (const p of map.placements)
      if ((p.kind === 'broadleaf' || p.kind === 'conifer') && p.biome === BIOME.heath && p.scale < 1.7)
        expect.fail(`a ${p.kind} on the heath at ${p.x},${p.y}`);
  });
});

describe('criterion 4: the river is deep, and forded on the roads', () => {
  it('is deep water down its middle, a wall to the rover, but where it tapers into a ford', () => {
    // along the river's line, from where it leaves the mountains to its mouth, every point is deep but those
    // within the taper either side of a ford
    const fords = fordIndices();
    const points = RIVER_LINE.length / 2;
    let deep = 0,
      counted = 0;
    for (let i = 30; i < points - 4; i++) {
      const p = at(RIVER_LINE[2 * i], RIVER_LINE[2 * i + 1]);
      const near = Math.min(...fords.map((f) => Math.abs(i - f)));
      if (near < 26) continue;
      counted++;
      if (g.waterDepthAt(p.x, p.y) > DRIVE.shallow) deep++;
      else expect.fail(`the river is shallow at its point ${i}, ${near} from a ford`);
    }
    expect(deep).toBe(counted);
    expect(counted).toBeGreaterThan(points / 3);
    const p = at(...RIVER.points[6]);
    expect(standable(g, p.x, p.y)).toBe(false);
    expect(canTravel(g, p.x - 5 * TILE, p.y, p.x + 5 * TILE, p.y)).toBe(false);
  });

  it('tapers its deep channel into each ford, narrow where it ends, with no blunt end', () => {
    // the width of deep water straight across the river, in tiles, at a point along its line
    const across = (i: number) => {
      const x = RIVER_LINE[2 * i],
        y = RIVER_LINE[2 * i + 1];
      const dx = RIVER_LINE[2 * i + 2] - RIVER_LINE[2 * i - 2],
        dy = RIVER_LINE[2 * i + 3] - RIVER_LINE[2 * i - 1];
      const len = Math.hypot(dx, dy);
      let width = 0;
      for (let k = -40; k <= 40; k++) {
        const p = at(x - (dy / len) * k * 0.25, y + (dx / len) * k * 0.25);
        if (g.waterDepthAt(p.x, p.y) > DRIVE.shallow) width += 0.25;
      }
      return width;
    };
    for (const f of fordIndices())
      for (const step of [-1, 1]) {
        expect(across(f), 'at the ford').toBe(0);
        // walking away from the ford, the first deep water is a sliver, and it is wide further on
        let i = f;
        while (across(i) === 0) i += step;
        expect(Math.abs(i - f), `deep water ${Math.abs(i - f)} from a ford`).toBeGreaterThan(4);
        expect(across(i), 'where the deep water begins').toBeLessThanOrEqual(3);
        expect(across(f + step * 34), 'further on').toBeGreaterThan(across(i));
      }
  });

  it('cannot be crossed anywhere but at a ford', () => {
    // with the fords' tiles taken away, the river splits the world in two
    const stand = Uint8Array.from(graph.stand);
    const ford = map.landmarks.filter((l) => l.kind === 'ford');
    expect(ford.length).toBeGreaterThanOrEqual(2);
    const links = Uint8Array.from(graph.links);
    for (const l of ford) {
      const ft = tileAt(map, l.x, l.y);
      for (let dy = -12; dy <= 12; dy++)
        for (let dx = -12; dx <= 12; dx++) {
          const t = ft + dy * COLS + dx;
          if (g.waterDepthAt(...middle(map, t)) > 0) {
            stand[t] = 0;
            links[t] = 0;
            links[t - 1] &= ~1;
            links[t - COLS] &= ~2;
          }
        }
    }
    const cut = reach({ ...graph, stand, links }, startTile);
    const east = at(240, 180);
    expect(reached[tileAt(map, east.x, east.y)]).toBe(1);
    expect(cut[tileAt(map, east.x, east.y)]).toBe(0);
  });

  it('has at least two fords, each shallow, driven across, and on a road', () => {
    const fords = map.landmarks.filter((l) => l.kind === 'ford');
    expect(fords.map((f) => f.name)).toEqual(FORDS.map((f) => f.name));
    for (const f of fords) {
      const depth = g.waterDepthAt(f.x, f.y);
      expect(depth, f.name).toBeGreaterThan(0);
      expect(depth, f.name).toBeLessThanOrEqual(DRIVE.shallow);
      expect(fits(g, f.x, f.y), f.name).toBe(true);
      expect(map.surface[tileAt(map, f.x, f.y)], f.name).toBe(SURFACE.stone);
      // on a road: within its half-width of the road's line
      let near = Infinity;
      for (const road of map.roads)
        for (let i = 0; i < road.points.length; i += 2)
          near = Math.min(near, Math.hypot(road.points[i] - f.x, road.points[i + 1] - f.y) - road.width / 2);
      expect(near, f.name).toBeLessThanOrEqual(0);
    }
  });

  it('takes each road over the water at a ford only, never through deep water', () => {
    for (const road of map.roads)
      for (let i = 0; i < road.points.length; i += 2) {
        const depth = g.waterDepthAt(road.points[i], road.points[i + 1]);
        if (depth > DRIVE.shallow) expect.fail(`a road at ${road.points[i]},${road.points[i + 1]} is ${depth} deep`);
      }
  });

  it('lays no water where none was laid: every wet tile is in a lake, a pond or the river', () => {
    // flood the wet tiles from the laid waters' middles; any left over is a puddle
    const wet = new Uint8Array(n);
    for (let t = 0; t < n; t++) if (g.waterDepthAt(...middle(map, t)) > 0) wet[t] = 1;
    const seen = new Uint8Array(n);
    const queue: number[] = [];
    const seeds = [...LAKES.map((l) => l.discs[0]), ...PUDDLES, ...RIVER.points.slice(2).map(([x, y]) => [x, y, 0])];
    for (const [x, y] of seeds) {
      const t = Math.floor(y) * COLS + Math.floor(x);
      if (t >= 0 && t < n && wet[t] && !seen[t]) {
        seen[t] = 1;
        queue.push(t);
      }
    }
    while (queue.length) {
      const t = queue.pop()!;
      for (const u of [t - 1, t + 1, t - COLS, t + COLS])
        if (u >= 0 && u < n && wet[u] && !seen[u]) {
          seen[u] = 1;
          queue.push(u);
        }
    }
    const puddles: string[] = [];
    for (let t = 0; t < n; t++) if (wet[t] && !seen[t]) puddles.push(`${t % COLS},${Math.floor(t / COLS)}`);
    expect(puddles.slice(0, 20)).toEqual([]);
  });
});

describe('criterion 5: the crossing from the west edge to the east', () => {
  it('takes between a minute and two and a half at 20 u/s, by a route the rover can drive', () => {
    const { from, to } = crossing(map, graph);
    expect(from.x).toBeLessThan(ORIGIN_X + 40 * TILE);
    expect(to.x).toBeGreaterThan(-ORIGIN_X - 40 * TILE);
    const way = route(map, from, to);
    const len = routeLength(way);
    console.log(
      `west to east: ${len.toFixed(0)} units, ${(len / 20).toFixed(1)} s at 20 u/s, ${routeTime(map, way).toFixed(1)} s at the ground's pace`,
    );
    expect(len / 20).toBeGreaterThanOrEqual(60);
    expect(len / 20).toBeLessThanOrEqual(150);
    for (let i = 2; i < way.length; i += 2) expect(clear(g, way[i - 2], way[i - 1], way[i], way[i + 1])).toBe(true);
  });
});

describe('the routes keep to open ground', () => {
  it('takes the crossing through no gap narrower than three tiles', () => {
    const { from, to } = crossing(map, graph);
    const way = route(map, from, to);
    const tight = narrow(graph);
    const gaps = new Set<string>();
    for (let i = 2; i < way.length; i += 2)
      for (let k = 0; k <= 20; k++) {
        const t = tileAt(
          map,
          way[i - 2] + ((way[i] - way[i - 2]) * k) / 20,
          way[i - 1] + ((way[i + 1] - way[i - 1]) * k) / 20,
        );
        if (tight[t]) gaps.add(`${t % COLS},${Math.floor(t / COLS)}`);
      }
    expect([...gaps]).toEqual([]);
  });

  it('costs a link more the less room there is round it, and never less than its time', () => {
    for (let k = 1; k < TIGHT.length; k++) expect(TIGHT[k]).toBeLessThanOrEqual(TIGHT[k - 1]);
    expect(TIGHT[TIGHT.length - 1]).toBe(1);
  });
});

describe('the placements', () => {
  const counts = new Map<Kind, number>();
  for (const p of map.placements) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);

  it('number six to nine thousand, of every kind', () => {
    console.log('placements:', map.placements.length, Object.fromEntries(counts));
    expect(map.placements.length).toBeGreaterThanOrEqual(6000);
    expect(map.placements.length).toBeLessThanOrEqual(9000);
    for (const k of KINDS) expect(counts.get(k) ?? 0, k).toBeGreaterThan(0);
  });

  it('builds a village of eight to fourteen buildings, and four to six ruins', () => {
    const buildings = (counts.get('cottage') ?? 0) + (counts.get('church') ?? 0) + (counts.get('well') ?? 0);
    expect(buildings).toBeGreaterThanOrEqual(8);
    expect(buildings).toBeLessThanOrEqual(14);
    expect(RUINS.length).toBeGreaterThanOrEqual(4);
    expect(RUINS.length).toBeLessThanOrEqual(6);
  });

  it('stands nothing in water but stepping stones and lilies, nothing on a road, and nothing in rock or a building', () => {
    const roadTiles = new Uint8Array(n);
    for (let t = 0; t < n; t++) if (map.surface[t] === SURFACE.dirt) roadTiles[t] = 1;
    for (const p of map.placements) {
      if (BUILT.has(p.kind)) continue;
      const t = tileAt(map, p.x, p.y);
      const depth = g.waterDepthAt(p.x, p.y);
      if (p.kind === 'stepping' || p.kind === 'lily' || p.kind === 'duck') {
        if (depth <= 0 || depth > DRIVE.shallow) expect.fail(`${p.kind} not in shallow water at ${p.x},${p.y}`);
      } else if (depth > 0) expect.fail(`${p.kind} in water at ${p.x},${p.y}`);
      if (roadTiles[t]) expect.fail(`${p.kind} on a road at ${p.x},${p.y}`);
      if (map.solid[t]) expect.fail(`${p.kind} in rock at ${p.x},${p.y}`);
    }
  });

  it('stands everything on the ground, a duck on the water and a UFO over the ground, in the world, sized and turned within reason', () => {
    for (const p of map.placements) {
      const floor = p.kind === 'duck' ? map.waterLevel : g.heightAt(p.x, p.y);
      expect(p.z, p.kind).toBe(p.kind === 'ufo' ? floor + SUBJECTS.ufo.hover * p.scale : floor);
      expect(tileAt(map, p.x, p.y)).toBeGreaterThanOrEqual(0);
      expect(p.scale).toBeGreaterThan(0.4);
      // the Mere's giant duck the one thing bigger
      expect(p.scale).toBeLessThan(p.kind === 'duck' ? 4.5 : 2);
      expect(p.vary).toBeGreaterThanOrEqual(0);
      expect(p.vary).toBeLessThan(1);
      expect(Number.isFinite(p.yaw)).toBe(true);
    }
  });

  it('grows each tree in the biomes it belongs to', () => {
    // the mean share, where each one stands, of the biomes it belongs in
    const share = (kind: Kind, ...biomes: number[]) => {
      const of = map.placements.filter((p) => p.kind === kind);
      let sum = 0;
      for (const p of of) {
        const t = tileAt(map, p.x, p.y);
        for (const b of biomes) sum += map.biomes[t * BIOMES + b] / 255;
      }
      return sum / of.length;
    };
    expect(share('conifer', BIOME.pine), 'conifer').toBeGreaterThan(2 / 3);
    expect(share('twisted', BIOME.heath), 'twisted').toBeGreaterThan(0.6);
    expect(share('broadleaf', BIOME.autumn, BIOME.meadow, BIOME.wetland)).toBeGreaterThan(0.8);
    expect(share('fern', BIOME.pine, BIOME.autumn)).toBeGreaterThan(0.6);
    expect(share('flowers', BIOME.meadow, BIOME.heath)).toBeGreaterThan(0.6);
    expect(share('reed', BIOME.wetland)).toBeGreaterThan(0.4);
    // and each one's palette is the biome strongest where it stands
    for (const p of map.placements) {
      if (BUILT.has(p.kind)) continue;
      const t = tileAt(map, p.x, p.y);
      let best = 0;
      for (let b = 1; b < BIOMES; b++) if (map.biomes[t * BIOMES + b] > map.biomes[t * BIOMES + best]) best = b;
      if (p.biome !== best) expect.fail(`${p.kind} at ${t} has the palette of ${p.biome}, not ${best}`);
    }
  });

  it('keeps every trunk and boulder off narrow ground, so no gap is shut', () => {
    // a trunk on standable ground has three tiles of standable ground every way
    const stands: Kind[] = ['broadleaf', 'conifer', 'twisted', 'boulder', 'willow', 'fruit'];
    for (const p of map.placements) {
      if (!stands.includes(p.kind)) continue;
      const t = tileAt(map, p.x, p.y);
      if (!graph.stand[t]) continue;
      for (const d of [1, 2, -1, -2, COLS, 2 * COLS, -COLS, -2 * COLS])
        if (!graph.stand[t + d] && !map.solid[t + d]) expect.fail(`${p.kind} at ${t} by narrow ground`);
    }
  });

  it('leaves the start clear of trees and rock, and the square of all but its own things', () => {
    for (const p of map.placements) {
      if (BUILT.has(p.kind) || PROPS.has(p.kind)) continue;
      expect(Math.hypot(p.x - map.start.x, p.y - map.start.y)).toBeGreaterThan(5 * TILE);
      expect(inside(map.plazas[0].outline, p.x, p.y), p.kind).toBe(false);
    }
  });

  it("keeps every small thing but the fords' stepping stones off the roads, and out of the way of the rover", () => {
    for (const p of map.placements) {
      if (!PROPS.has(p.kind) || p.kind === 'stepping') continue;
      const t = tileAt(map, p.x, p.y);
      expect(map.surface[t], p.kind).not.toBe(SURFACE.dirt);
      for (const road of map.roads)
        for (let i = 0; i < road.points.length; i += 2)
          if (Math.hypot(road.points[i] - p.x, road.points[i + 1] - p.y) < road.width / 2)
            expect.fail(`${p.kind} on a road at ${p.x},${p.y}`);
    }
  });
});

describe('the small solid things', () => {
  const solidKinds: Kind[] = ['lamp', 'signpost', 'bench', 'gnome'];

  it('makes every lamp, signpost, bench and gnome an obstacle the rover cannot stand in, and nothing else one', () => {
    const solidOnes = map.placements.filter((p) => solidKinds.includes(p.kind));
    expect(solidOnes.length).toBeGreaterThanOrEqual(10);
    const circles = map.obstacles.length / 3;
    expect(circles).toBe(solidOnes.reduce((sum, p) => sum + OBSTACLE[p.kind]!.length, 0));
    for (const p of solidOnes) {
      expect(g.solidAt(p.x, p.y), p.kind).toBe(true);
      expect(standable(g, p.x, p.y), p.kind).toBe(false);
    }
    // stepping stones, posts and lilies stay passable
    for (const p of map.placements)
      if (p.kind === 'stepping' || p.kind === 'post' || p.kind === 'lily')
        if (!map.solid[tileAt(map, p.x, p.y)]) expect(g.solidAt(p.x, p.y), p.kind).toBe(false);
  });

  it('stands no obstacle on a road, in the water, or hard by anything solid', () => {
    for (let i = 0; i < map.obstacles.length; i += 3) {
      const x = map.obstacles[i],
        y = map.obstacles[i + 1];
      const t = tileAt(map, x, y);
      expect(map.surface[t]).not.toBe(SURFACE.dirt);
      expect(g.waterDepthAt(x, y)).toBe(0);
      for (const d of [-1, 1, -COLS, COLS]) expect(map.solid[t + d]).toBe(0);
    }
  });

  it('answers in the remembering ground exactly as in the ground, all round each obstacle', () => {
    const memo = memoGround(map);
    for (let i = 0; i < map.obstacles.length; i += 3)
      for (let k = 0; k < 64; k++) {
        const x = map.obstacles[i] + ((k % 8) - 3.5) * 0.7,
          y = map.obstacles[i + 1] + (Math.floor(k / 8) - 3.5) * 0.7;
        expect(memo.solidAt(x, y)).toBe(g.solidAt(x, y));
      }
  });
});

describe('the village, the finds and the fords', () => {
  const count = (kind: Kind) => map.placements.filter((p) => p.kind === kind).length;

  it('furnishes the village: stalls, a cart, benches, lamps, gardens fenced, a signpost at each junction', () => {
    expect(count('stall')).toBeGreaterThanOrEqual(1);
    expect(count('cart')).toBeGreaterThanOrEqual(1);
    expect(count('bench')).toBeGreaterThanOrEqual(3);
    expect(count('lamp')).toBeGreaterThanOrEqual(4);
    expect(count('signpost')).toBeGreaterThanOrEqual(6);
    expect(count('fence')).toBeGreaterThanOrEqual(10);
    // two or three sizes of cottage
    const sizes = new Set(map.placements.filter((p) => p.kind === 'cottage').map((p) => p.scale));
    expect(sizes.size).toBeGreaterThanOrEqual(2);
  });

  it('turns every cottage to face a road or the square, with its door no more than a short path from it', () => {
    for (const p of map.placements) {
      if (p.kind !== 'cottage') continue;
      const door = { x: p.x + Math.cos(p.yaw) * 20 * p.scale, y: p.y + Math.sin(p.yaw) * 20 * p.scale };
      let near = Infinity;
      for (const road of map.roads)
        for (let i = 0; i < road.points.length; i += 2)
          near = Math.min(near, Math.hypot(road.points[i] - door.x, road.points[i + 1] - door.y));
      for (const plaza of map.plazas.slice(0, 1))
        for (let i = 0; i < plaza.outline.length; i += 2)
          near = Math.min(near, Math.hypot(plaza.outline[i] - door.x, plaza.outline[i + 1] - door.y));
      expect(near, `cottage at ${p.x},${p.y}`).toBeLessThan(3 * TILE);
    }
  });

  it('names the finds, and puts the windmill, the stones, the orchard and the great oak where they are named', () => {
    const named = (name: string) => map.landmarks.find((l) => l.name === name)!;
    for (const name of ['orchard', 'hay meadow', 'great oak', 'marsh']) expect(named(name).kind, name).toBe('find');
    for (const [name, kind, r] of [
      ['windmill', 'windmill', 10],
      ['standing stones', 'menhir', 10],
      ['orchard', 'fruit', 16],
      ['hay meadow', 'haystack', 12],
      ['great oak', 'broadleaf', 8],
    ] as const) {
      const l = named(name);
      expect(l, name).toBeDefined();
      const near = map.placements.filter((p) => p.kind === kind && Math.hypot(p.x - l.x, p.y - l.y) < r * TILE);
      expect(near.length, name).toBeGreaterThan(0);
    }
    expect(count('menhir')).toBeGreaterThanOrEqual(7);
    expect(count('fruit')).toBeGreaterThanOrEqual(20);
    expect(Math.max(...map.placements.filter((p) => p.kind === 'broadleaf').map((p) => p.scale))).toBeGreaterThan(1.7);
  });

  it('marks each ford with stepping stones beside the road and a post either side on each bank', () => {
    for (const f of map.landmarks.filter((l) => l.kind === 'ford')) {
      const near = (kind: Kind, r: number) =>
        map.placements.filter((p) => p.kind === kind && Math.hypot(p.x - f.x, p.y - f.y) < r * TILE);
      expect(near('stepping', 12).length, f.name).toBeGreaterThanOrEqual(4);
      expect(near('post', 16).length, f.name).toBeGreaterThanOrEqual(4);
    }
  });

  it('lays a marsh of its own below the east ford: mud flats, its pools each with lilies, willows and reeds', () => {
    const marsh = map.landmarks.find((l) => l.name === 'marsh')!;
    expect(marsh.kind).toBe('find');
    const c = at(MARSH.x, MARSH.y);
    let mud = 0,
      tiles = 0,
      wet = 0;
    for (let t = 0; t < n; t++) {
      const [x, y] = middle(map, t);
      if (Math.hypot(x - c.x, y - c.y) > MARSH.radius * TILE) continue;
      tiles++;
      if (map.surface[t] === SURFACE.mud) mud++;
      wet += map.biomes[t * BIOMES + BIOME.wetland] / 255;
    }
    expect(mud / tiles, 'mud').toBeGreaterThan(0.3);
    expect(wet / tiles, 'wetland').toBeGreaterThan(0.6);
    const pools = PUDDLES.filter(([x, y]) => Math.hypot(x - MARSH.x, y - MARSH.y) < MARSH.radius);
    expect(pools.length).toBeGreaterThanOrEqual(4);
    const near = (kind: Kind, r: number) =>
      map.placements.filter((p) => p.kind === kind && Math.hypot(p.x - c.x, p.y - c.y) < r * TILE).length;
    expect(near('willow', MARSH.radius + 4)).toBeGreaterThanOrEqual(5);
    expect(near('reed', MARSH.radius + 4)).toBeGreaterThanOrEqual(20);
  });

  it('lays lilies on every pool', () => {
    for (const [x, y, r] of PUDDLES) {
      const c = at(x, y);
      const lilies = map.placements.filter((p) => p.kind === 'lily' && Math.hypot(p.x - c.x, p.y - c.y) < r * TILE);
      expect(lilies.length, `the pool at ${x},${y}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives the wetland its willows, and lays lilies on still shallow water, never the river', () => {
    const willows = map.placements.filter((p) => p.kind === 'willow');
    expect(willows.length).toBeGreaterThan(40);
    let wet = 0;
    for (const p of willows) wet += map.biomes[tileAt(map, p.x, p.y) * BIOMES + BIOME.wetland] / 255;
    expect(wet / willows.length).toBeGreaterThan(0.5);
    const lilies = map.placements.filter((p) => p.kind === 'lily');
    expect(lilies.length).toBeGreaterThan(40);
    for (const p of lilies)
      for (let i = 0; i < RIVER_LINE.length; i += 8)
        if (
          Math.hypot(at(RIVER_LINE[i], RIVER_LINE[i + 1]).x - p.x, at(RIVER_LINE[i], RIVER_LINE[i + 1]).y - p.y) <
          4 * TILE
        )
          expect.fail(`a lily on the river at ${p.x},${p.y}`);
  });
});

describe('the plazas and what stands on the solid ground', () => {
  it('paves the square with cobbles and each ruin floor with flags, as outlines running anticlockwise', () => {
    expect(map.plazas[0].paving).toBe('cobbles');
    expect(map.plazas.filter((p) => p.paving === 'flags')).toHaveLength(RUINS.filter((r) => r.floor > 0).length);
    for (const plaza of map.plazas) expect(area2(plaza.outline)).toBeGreaterThan(0);
  });

  it("lays stone inside every plaza, and no road inside one; the square's roads end at its edge", () => {
    for (const plaza of map.plazas) {
      const o = plaza.outline;
      for (let t = 0; t < n; t++) {
        const [x, y] = middle(map, t);
        if (inside(o, x, y) && map.surface[t] !== SURFACE.stone) expect.fail(`tile ${t} in a plaza is not stone`);
      }
      for (const road of map.roads)
        for (let i = 0; i < road.points.length; i += 2)
          if (
            inside(o, road.points[i] - 0.01 * Math.sign(road.points[i]), road.points[i + 1]) &&
            !onEdge(o, road.points[i], road.points[i + 1])
          )
            expect.fail(`a road at ${road.points[i]},${road.points[i + 1]} is in a plaza`);
    }
    // at least three roads end on the square's edge: east, south and the north-west way out
    let ends = 0;
    for (const road of map.roads)
      for (const k of [0, road.points.length - 2])
        if (onEdge(map.plazas[0].outline, road.points[k], road.points[k + 1])) ends++;
    expect(ends).toBeGreaterThanOrEqual(3);
  });

  it('keeps the top of what stands on each solid tile, and nothing on open ground', () => {
    for (let t = 0; t < n; t++) {
      if (map.solid[t]) {
        if (map.tops[t] < ROCK_TOP) expect.fail(`solid tile ${t} has no top`);
      } else if (map.tops[t] !== 0) expect.fail(`open tile ${t} has a top`);
    }
    for (const p of map.placements) {
      if (!BUILT.has(p.kind)) continue;
      const c = Math.cos(p.yaw),
        s = Math.sin(p.yaw);
      const [mx, my] = FOOTPRINT[p.kind]![0];
      const x = p.x + mx * p.scale * c - my * p.scale * s,
        y = p.y + mx * p.scale * s + my * p.scale * c;
      expect(g.topAt(x, y) - g.heightAt(x, y), p.kind).toBeGreaterThanOrEqual(TOP[p.kind]! * p.scale - 1e-3);
    }
  });

  it('leaves no lone tile of sand or mud, so each lies in a patch', () => {
    for (let ty = 1; ty < ROWS - 1; ty++)
      for (let tx = 1; tx < COLS - 1; tx++) {
        const t = ty * COLS + tx;
        const s = map.surface[t];
        if (s !== SURFACE.sand && s !== SURFACE.mud) continue;
        if (
          map.surface[t - 1] !== s &&
          map.surface[t + 1] !== s &&
          map.surface[t - COLS] !== s &&
          map.surface[t + COLS] !== s
        )
          expect.fail(`a lone tile of ${s} at ${tx},${ty}`);
      }
  });
});

describe('the oddities', () => {
  const odd = map.placements.filter((p) => SUBJECT_KINDS.has(p.kind));
  /** The oddity of each name, which the world places in the table's order. */
  const named = ODDITIES.map((o, k) => ({ ...o, p: odd[k] }));
  const of = (kind: SubjectKind) => named.filter((o) => o.kind === kind);

  it('places twelve, each named once: five ducks, five gnomes and two UFOs, where the table lays them', () => {
    expect(odd.length).toBe(12);
    expect(new Set(ODDITIES.map((o) => o.name)).size).toBe(12);
    expect(of('duck').length).toBe(5);
    expect(of('gnome').length).toBe(5);
    expect(of('ufo').length).toBe(2);
    for (const o of named) {
      const u = units(o.x, o.y);
      expect(o.p.kind, o.name).toBe(o.kind);
      expect(o.p.x, o.name).toBe(u.x);
      expect(o.p.y, o.name).toBe(u.y);
      expect(o.p.yaw, o.name).toBe(o.yaw);
      expect(o.p.scale, o.name).toBe(o.scale);
    }
  });

  it('floats every duck on still shallow water, at its level, well off the river', () => {
    for (const { name, p } of of('duck')) {
      expect(p.z, name).toBe(map.waterLevel);
      const depth = g.waterDepthAt(p.x, p.y);
      expect(depth, name).toBeGreaterThan(0.1);
      expect(depth, name).toBeLessThanOrEqual(DRIVE.shallow);
      for (let i = 0; i < RIVER_LINE.length; i += 2) {
        const r = at(RIVER_LINE[i], RIVER_LINE[i + 1]);
        expect(Math.hypot(r.x - p.x, r.y - p.y), `${name} by the river`).toBeGreaterThan(10 * TILE);
      }
      expect(g.solidAt(p.x, p.y), name).toBe(false);
    }
  });

  it('stands every gnome on open dry ground off the roads, an obstacle with open ground on its four sides', () => {
    for (const { name, p } of of('gnome')) {
      const t = tileAt(map, p.x, p.y);
      expect(g.waterDepthAt(p.x, p.y), name).toBe(0);
      expect(map.solid[t], name).toBe(0);
      expect(map.surface[t], name).not.toBe(SURFACE.dirt);
      for (const d of [-1, 1, -COLS, COLS]) {
        expect(map.solid[t + d], name).toBe(0);
        expect(g.waterDepthAt(...middle(map, t + d)), name).toBe(0);
      }
      expect(g.solidAt(p.x, p.y), name).toBe(true);
      expect(standable(g, p.x, p.y), name).toBe(false);
      // its own circle, and nobody else's
      let mine = 0;
      for (let i = 0; i < map.obstacles.length; i += 3) {
        const d = Math.hypot(map.obstacles[i] - p.x, map.obstacles[i + 1] - p.y);
        if (d < 1e-3) mine++;
        else expect(d, name).toBeGreaterThan(map.obstacles[i + 2] + OBSTACLE.gnome![0][2] * p.scale);
      }
      expect(mine, name).toBe(1);
    }
  });

  it('hovers every UFO over an open hilltop, clear over everything under its saucer', () => {
    for (const { name, p } of of('ufo')) {
      const floor = g.heightAt(p.x, p.y);
      expect(p.z, name).toBe(floor + SUBJECTS.ufo.hover * p.scale);
      expect(g.waterDepthAt(p.x, p.y), name).toBe(0);
      expect(g.solidAt(p.x, p.y), name).toBe(false);
      expect(standable(g, p.x, p.y), name).toBe(true);
      const r = SUBJECTS.ufo.radius * p.scale;
      for (let k = 0; k < 64; k++) {
        const x = p.x + ((k % 8) / 3.5 - 1) * r,
          y = p.y + (Math.floor(k / 8) / 3.5 - 1) * r;
        expect(g.topAt(x, y), name).toBeLessThan(p.z - 20);
      }
      // a top: the ground no higher within 4 tiles of it, and lower 12 tiles out most of the way round (a hill under
      // the mountains has them behind it)
      let lower = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        expect(g.heightAt(p.x + Math.cos(a) * 4 * TILE, p.y + Math.sin(a) * 4 * TILE), name).toBeLessThan(floor + 1);
        if (g.heightAt(p.x + Math.cos(a) * 12 * TILE, p.y + Math.sin(a) * 12 * TILE) < floor) lower++;
      }
      expect(lower, name).toBeGreaterThanOrEqual(10);
    }
  });

  it('stands none inside rock, anything built, or an obstacle not its own, nor by the start or on the square', () => {
    for (const { name, p } of named) {
      expect(map.solid[tileAt(map, p.x, p.y)], name).toBe(0);
      if (p.kind !== 'gnome') expect(g.solidAt(p.x, p.y), name).toBe(false);
      expect(Math.hypot(p.x - map.start.x, p.y - map.start.y), name).toBeGreaterThan(10 * TILE);
      expect(inside(map.plazas[0].outline, p.x, p.y), name).toBe(false);
    }
  });

  it('clears the trees, bushes, ferns and reeds that were sown round each, so it stands in the open', () => {
    const sown: Kind[] = ['broadleaf', 'conifer', 'twisted', 'willow', 'boulder', 'bush', 'fern', 'reed'];
    for (const o of named) {
      if (o.clearing <= 0) continue;
      for (const p of map.placements)
        if (sown.includes(p.kind) && Math.hypot(p.x - o.p.x, p.y - o.p.y) < o.clearing * TILE)
          expect.fail(`${p.kind} in the clearing of the ${o.name}`);
    }
  });

  it('turns every duck and gnome to face within a radian of the sun, so the picture from in front of it is lit', () => {
    const sun = Math.atan2(SUN[1], SUN[0]);
    for (const { name, p } of named) {
      if (!SUBJECTS[p.kind as SubjectKind].front) continue;
      const off = Math.atan2(Math.sin(p.yaw - sun), Math.cos(p.yaw - sun));
      expect(Math.abs(off), name).toBeLessThanOrEqual(1);
    }
  });

  it('draws each in the look the table gives it, every gnome in a pose and a paint of his own, and a duck of each look', () => {
    for (const o of named) {
      expect(variantOf(o.p), o.name).toBe(o.look);
      expect(paintOf(o.kind, o.p.vary), o.name).toBe(o.paint);
    }
    const gnomes = of('gnome');
    expect(new Set(gnomes.map((o) => o.look)).size).toBe(SUBJECTS.gnome.looks.length);
    expect(new Set(gnomes.map((o) => o.paint)).size).toBe(gnomes.length);
    expect(new Set(of('duck').map((o) => o.look)).size).toBe(SUBJECTS.duck.looks.length);
    // and one duck a giant, a metre tall, on the Mere
    expect(
      of('duck')
        .filter((o) => o.scale > 3)
        .map((o) => o.name),
    ).toEqual(['mere duck']);
  });

  it('lays the pool of each UFO’s beam on its hilltop: over the ground at the bottom of its bob, and near it at the top', () => {
    for (const { name, p } of of('ufo')) {
      const s = p.scale,
        floor = g.heightAt(p.x, p.y);
      // the pool's underside at the bottom of the bob, and its top at the top of it
      const under = p.z - BOB.height + (-SUBJECTS.ufo.hover + BEAM.over - 0.2) * s;
      const over = p.z + BOB.height + (-SUBJECTS.ufo.hover + BEAM.over + 0.1) * s;
      expect(over - floor, name).toBeLessThan(4);
      for (let k = 0; k < 24; k++)
        for (const f of [0, 0.5, 1]) {
          const a = (k / 24) * Math.PI * 2,
            r = BEAM.pool * s * f;
          expect(g.heightAt(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r), name).toBeLessThan(under);
        }
    }
  });

  it('is seen from ground the rover reaches within 30 m, and one with a front from in front of it', () => {
    for (const { name, p } of named) {
      const from = seenFrom(p);
      expect(from.length, `${name} seen from somewhere`).toBeGreaterThan(0);
      if (!SUBJECTS[p.kind as SubjectKind].front) continue;
      const ahead = from.filter(([x, y]) => {
        const a = Math.atan2(y - p.y, x - p.x) - p.yaw;
        return Math.cos(a) > Math.cos(Math.PI / 3);
      });
      expect(ahead.length, `${name} seen from in front`).toBeGreaterThan(0);
    }
  });

  /**
   * Where an oddity is seen from: the middle of every tile the rover reaches within 30 m of it, whose camera's eye,
   * `HEAD.height` over the ground there, has a clear line to the oddity's middle over the ground and over the top of
   * whatever is built or is rock on every tile between. Every fourth tile each way, which is plenty to find one.
   */
  function seenFrom(p: Placement): [number, number][] {
    const s = SUBJECTS[p.kind as SubjectKind];
    const mz = p.z + (s.height * p.scale) / 2;
    const out: [number, number][] = [];
    const reachTiles = Math.floor(300 / TILE);
    const [tx0, ty0] = [Math.floor((p.x - ORIGIN_X) / TILE), Math.floor((p.y - ORIGIN_Y) / TILE)];
    for (let dy = -reachTiles; dy <= reachTiles; dy += 4)
      for (let dx = -reachTiles; dx <= reachTiles; dx += 4) {
        const tx = tx0 + dx,
          ty = ty0 + dy;
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
        const t = ty * COLS + tx;
        if (!reached[t]) continue;
        const [x, y] = middle(map, t);
        const len = Math.hypot(p.x - x, p.y - y);
        if (len > 300 || len < s.radius * p.scale + 3) continue;
        const ez = g.heightAt(x, y) + HEAD.height;
        let clear = true;
        for (let d = 1; d < len - s.radius * p.scale && clear; d += 1) {
          const f = d / len;
          const sx = x + (p.x - x) * f,
            sy = y + (p.y - y) * f;
          if (ez + (mz - ez) * f <= g.topAt(sx, sy)) clear = false;
        }
        if (clear) out.push([x, y]);
      }
    return out;
  }
});

/** Whether a point lies on an outline's edge, to within a hundredth of a unit. */
function onEdge(o: Float32Array, x: number, y: number): boolean {
  for (let i = 0; i < o.length; i += 2) {
    const j = (i + 2) % o.length;
    const ax = o[i],
      ay = o[i + 1],
      bx = o[j],
      by = o[j + 1];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    if (Math.hypot(ax + (bx - ax) * t - x, ay + (by - ay) * t - y) < 0.01) return true;
  }
  return false;
}
