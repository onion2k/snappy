import { describe, expect, it } from 'vitest';
import { canTravel, standable } from '../src/world/drive';
import { FIXTURE, fixtureAt, fixtureWorld } from '../src/world/fixture';
import {
  clear,
  GAP_COST,
  narrow,
  openOf,
  roomOf,
  TIGHT,
  crossing,
  driveGraph,
  fits,
  EAST,
  graphOf,
  middle,
  NORTH,
  path,
  ROVER_HALF_WIDTH,
  reach,
  route,
  routeLength,
  routeTime,
  spread,
  tileAt,
} from '../src/world/graph';
import { groundOf } from '../src/world/ground';
import { SURFACE } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const graph = graphOf(map);
const n = map.grid.cols;
const tile = (tx: number, ty: number) => ty * n + tx;
const start = tileAt(map, map.start.x, map.start.y);

describe('the drive graph', () => {
  it('joins two tiles exactly where the rover, body and all, can drive between their middles both ways', () => {
    // made with the plain ground, so the remembering ground the graph is made with is held to it
    let links = 0;
    for (let ty = 0; ty < n; ty++)
      for (let tx = 0; tx < n; tx++) {
        const t = tile(tx, ty);
        const [x, y] = middle(map, t);
        if (tx + 1 < n) {
          const [ex, ey] = middle(map, t + 1);
          const both =
            graph.stand[t] === 1 && graph.stand[t + 1] === 1 && clear(g, x, y, ex, ey) && clear(g, ex, ey, x, y);
          expect((graph.links[t] & EAST) !== 0, `${tx},${ty} east`).toBe(both);
          if (both) links++;
        }
        if (ty + 1 < n) {
          const [nx, ny] = middle(map, t + n);
          const both =
            graph.stand[t] === 1 && graph.stand[t + n] === 1 && clear(g, x, y, nx, ny) && clear(g, nx, ny, x, y);
          expect((graph.links[t] & NORTH) !== 0, `${tx},${ty} north`).toBe(both);
        }
      }
    expect(links).toBeGreaterThan(500);
    for (let t = 0; t < n * n; t++) expect(graph.stand[t]).toBe(fits(g, ...middle(map, t)) ? 1 : 0);
  });

  it('gives the rover room for its body: a drive that grazes rock is refused, though a point would pass', () => {
    // along the rock's west face, a unit clear of it: the middle passes, the side would be in the rock
    const [rx] = fixtureAt(FIXTURE.rock[0], 0);
    const face = rx - 3;
    const [, y0] = fixtureAt(0, 5),
      [, y1] = fixtureAt(0, 10);
    expect(canTravel(g, face - 1, y0, face - 1, y1)).toBe(true);
    expect(clear(g, face - 1, y0, face - 1, y1)).toBe(false);
    expect(clear(g, face - 1 - ROVER_HALF_WIDTH - 0.5, y0, face - 1 - ROVER_HALF_WIDTH - 0.5, y1)).toBe(true);
    // and a body does not fit where a point would, a unit from the rock
    expect(standable(g, face - 1, y0)).toBe(true);
    expect(fits(g, face - 1, y0)).toBe(false);
  });

  it('links only side by side, never across a corner', () => {
    // no tile is ever joined to one it only touches at a corner: the links are east and north and nothing else
    for (const l of graph.links) expect(l & ~(EAST | NORTH)).toBe(0);
  });

  it('is the one kept with the map, and the same as one made again', () => {
    expect(graphOf(map)).toBe(graph);
    const again = driveGraph(map, g);
    expect(again.links).toEqual(graph.links);
    expect(again.stand).toEqual(graph.stand);
  });

  it('reaches the plateau up the ramp, and not the top of the ledge or the deep pond', () => {
    const reached = reach(graph, start);
    expect(reached[start]).toBe(1);
    expect(reached[tile(10, 24)]).toBe(1);
    expect(reached[tile(6, 24)]).toBe(1);
    expect(reached[tile(4, 4)]).toBe(1);
    expect(reached[tile(23, 23)]).toBe(0);
    expect(reached[tile(7, 7)]).toBe(0);
    expect(graph.stand[tile(7, 7)]).toBe(0);
    expect(graph.stand[tile(23, 23)]).toBe(1);
  });

  it('reaches nothing from where the rover cannot stand', () => {
    const reached = reach(graph, tile(16, 6));
    expect(reached.reduce((a, b) => a + b, 0)).toBe(0);
    expect(reach(graph, -1).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('spreads past a ledge, since it sees only which tiles can be stood on', () => {
    const wide = spread(graph.stand, n, n, start);
    const reached = reach(graph, start);
    for (let t = 0; t < n * n; t++) if (reached[t]) expect(wide[t]).toBe(1);
    expect(wide[tile(23, 23)]).toBe(1);
    expect(spread(graph.stand, n, n, tile(16, 6)).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('the route', () => {
  const [sx, sy] = fixtureAt(15.5, 15.5);
  const [px, py] = fixtureAt(10, 24);

  it('climbs to the plateau, every leg a drive the rover can make', () => {
    const way = route(map, { x: sx, y: sy }, { x: px, y: py });
    expect(way.length).toBeGreaterThanOrEqual(6);
    expect([way[0], way[1]]).toEqual([Math.fround(sx), Math.fround(sy)]);
    expect([way[way.length - 2], way[way.length - 1]]).toEqual([Math.fround(px), Math.fround(py)]);
    for (let i = 2; i < way.length; i += 2)
      expect(canTravel(g, way[i - 2], way[i - 1], way[i], way[i + 1]), `leg ${i / 2}`).toBe(true);
    // every leg between tile middles has room for the rover's body
    for (let i = 4; i < way.length - 2; i += 2)
      expect(clear(g, way[i - 2], way[i - 1], way[i], way[i + 1]), `leg ${i / 2}`).toBe(true);
    // no leg passes over the bank, east of the plateau
    const [b0, b1] = [FIXTURE.bank[0], FIXTURE.bank[2]],
      [r0, r1] = [FIXTURE.bank[1], FIXTURE.bank[3]];
    for (let i = 2; i < way.length; i += 2)
      for (let k = 0; k <= 20; k++) {
        const t = tileAt(
          map,
          way[i - 2] + ((way[i] - way[i - 2]) * k) / 20,
          way[i - 1] + ((way[i + 1] - way[i - 1]) * k) / 20,
        );
        const tx = t % n,
          ty = Math.floor(t / n);
        expect(tx >= b0 && tx <= b1 && ty >= r0 && ty <= r1, `leg ${i / 2} over the bank`).toBe(false);
      }
    expect(routeLength(way)).toBeGreaterThan(Math.hypot(px - sx, py - sy));
  });

  it('finds no way into deep water, onto the ledge or from rock', () => {
    expect(route(map, { x: sx, y: sy }, { x: fixtureAt(7.5, 7.5)[0], y: fixtureAt(7.5, 7.5)[1] })).toHaveLength(0);
    expect(route(map, { x: sx, y: sy }, { x: fixtureAt(23, 23)[0], y: fixtureAt(23, 23)[1] })).toHaveLength(0);
    expect(route(map, { x: fixtureAt(16, 6)[0], y: fixtureAt(16, 6)[1] }, { x: sx, y: sy })).toHaveLength(0);
  });

  it('keeps to the road where the road is quicker', () => {
    const tiles = path(map, graph, g, tile(0, 15), tile(31, 15));
    expect(tiles[0]).toBe(tile(0, 15));
    expect(tiles[tiles.length - 1]).toBe(tile(31, 15));
    for (const t of tiles) expect(map.surface[t]).toBe(SURFACE.dirt);
    expect(tiles).toHaveLength(32);
  });

  it('times a leg by the ground under it', () => {
    const [ax, ay] = fixtureAt(0, 15.5),
      [bx] = fixtureAt(31, 15.5);
    const road = Float32Array.from([ax, ay, bx, ay]);
    expect(routeLength(road)).toBeCloseTo(bx - ax, 3);
    expect(routeTime(map, road)).toBeCloseTo((bx - ax) / 25, 3);
    const [gx, gy] = fixtureAt(16, 2),
      [hx] = fixtureAt(28, 2);
    expect(routeTime(map, Float32Array.from([gx, gy, hx, gy]))).toBeCloseTo((hx - gx) / 20, 3);
    expect(routeLength(new Float32Array(0))).toBe(0);
  });

  it('picks the reached tiles nearest the middles of the west and east edges, the southern of two as near', () => {
    const { from, to } = crossing(map, graph);
    expect(tileAt(map, from.x, from.y)).toBe(tile(0, 15));
    expect(tileAt(map, to.x, to.y)).toBe(tile(31, 15));
  });
});

describe('the gaps', () => {
  // a 9 by 9 graph: open ground to the west, a wall down the middle with a one-tile gap in it, open ground to the east
  const cols = 9,
    rows = 9;
  const stand = new Uint8Array(cols * rows).fill(1);
  for (let ty = 0; ty < rows; ty++) if (ty !== 4) stand[ty * cols + 4] = 0;
  const links = new Uint8Array(cols * rows);
  for (let t = 0; t < cols * rows; t++) {
    if (!stand[t]) continue;
    if (t % cols < cols - 1 && stand[t + 1]) links[t] |= EAST;
    if (t + cols < cols * rows && stand[t + cols]) links[t] |= NORTH;
  }
  const g = { cols, rows, stand, links };

  it('finds the tile in the gap, and none out on the open ground', () => {
    const tight = narrow(g);
    expect(tight[4 * cols + 4]).toBe(1);
    expect(tight[0]).toBe(0);
    expect(tight[4 * cols + 1]).toBe(0);
    expect(tight.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('cuts the gap out of the open graph, so each side is reached alone', () => {
    const open = openOf(g);
    expect(open).toBe(openOf(g));
    expect(reach(g, 0)[cols - 1]).toBe(1);
    expect(reach(open, 0)[cols - 1]).toBe(0);
    expect(open.stand[4 * cols + 4]).toBe(0);
    expect(open.links[4 * cols + 3] & EAST).toBe(0);
  });

  it('counts the room round each tile, to its cap, and costs a tight link dearer', () => {
    const room = roomOf(g);
    expect(room[4 * cols + 4]).toBe(1);
    expect(room[0]).toBeGreaterThan(1);
    for (let k = 1; k < TIGHT.length; k++) expect(TIGHT[k]).toBeLessThanOrEqual(TIGHT[k - 1]);
    expect(GAP_COST).toBeGreaterThan(TIGHT[0]);
  });
});
