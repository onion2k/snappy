/**
 * What is built: the village's houses, church, well, fences, stalls and
 * carts, the farms' ricks, the windmill, and the ruins and the standing
 * stones. Each kind has a footprint, in units, that the kit's model is made
 * to fill at a scale of one, and a height its top stands to; the tiles under
 * the footprint are marked solid, so the rover meets a building where it is
 * drawn, and their tops are kept, so the camera never goes inside a roof.
 * An arch is its two piers, so the rover drives through it.
 */
import type { Random } from '../random';
import type { Piece } from './layout';
import { type Biome, type Ground, type Kind, type Placement, TILE } from './types';

/** A rectangle of a footprint: its middle along the piece's heading and across it, and its half sizes, in units. */
export type Rect = readonly [number, number, number, number];

/**
 * Each built kind's footprint at a scale of one, in units, along its
 * heading (x, the way its front faces) and across it (y). The kit's models
 * are made to these, and to the heights in `TOP`.
 */
export const FOOTPRINT: Partial<Record<Kind, readonly Rect[]>> = {
  /** 3.6 m by 2.7 m, the gable ends along x, the door at +x. */
  cottage: [[0, 0, 18, 13.5]],
  /** 6 m by 3.3 m, the tower at the west end (-x). */
  church: [[0, 0, 30, 16.5]],
  well: [[0, 0, 6, 6]],
  /** A 3 m run of fence. */
  fence: [[0, 0, 15, 0.75]],
  /** A 3.6 m run of broken wall, 0.6 m thick. */
  wall: [[0, 0, 18, 3]],
  /** The stump of a round tower, 3 m across. */
  tower: [[0, 0, 15, 15]],
  /** Two piers 3 m apart, centre to centre; the span between them is open. */
  arch: [
    [-15, 0, 3.5, 3.5],
    [15, 0, 3.5, 3.5],
  ],
  /** A fallen column lying along x, 4 m long. */
  column: [[0, 0, 20, 3]],
  /** A round rick, 1.8 m across. */
  haystack: [[0, 0, 9, 9]],
  /** A two-wheeled cart, its shafts along +x: 1.6 m by 0.9 m. */
  cart: [[0, 0, 8, 4.5]],
  /** A market stall, its counter facing +x: 2 m by 1.2 m. */
  stall: [[0, 0, 6, 10]],
  /** A tower mill's round base, 3 m across; the sails turn above it, clear of the ground. */
  windmill: [[0, 0, 15, 15]],
  /** A standing stone, its broad face across x: 0.5 m by 0.6 m. */
  menhir: [[0, 0, 2.5, 3]],
};

/**
 * How tall each built kind stands at a scale of one, in units, from the
 * ground to its highest point: a cottage's ridge, the church's tower, the
 * windmill's cap with its sails' top. `tops` holds these, scaled, on every
 * tile a footprint covers; the kit's models are made to them.
 */
export const TOP: Partial<Record<Kind, number>> = {
  cottage: 60,
  church: 82,
  well: 20,
  fence: 10,
  wall: 30,
  tower: 46,
  arch: 42,
  column: 8,
  haystack: 18,
  cart: 14,
  stall: 22,
  windmill: 110,
  menhir: 22,
};

/** How far bare rock stands above the ground its tile reads, in units: its crags drawn above the step. */
export const ROCK_TOP = 3;

/**
 * Mark every tile a footprint covers any part of, sampled a unit apart so a
 * fence no wider than that is still found, as solid, and its top as the
 * kind's height where that is the tallest thing there. Returns how many
 * tiles were newly marked.
 */
export function markFootprint(
  p: { kind: Kind; x: number; y: number; yaw: number; scale: number },
  grid: { cols: number; rows: number; originX: number; originY: number },
  solid: Uint8Array,
  tops?: Float32Array,
): number {
  const rects = FOOTPRINT[p.kind] ?? [];
  const top = (TOP[p.kind] ?? 0) * p.scale;
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  let marked = 0;
  for (const [mx, my, hx, hy] of rects) {
    const sx = Math.max(1, Math.ceil(2 * hx * p.scale)),
      sy = Math.max(1, Math.ceil(2 * hy * p.scale));
    for (let i = 0; i <= sx; i++)
      for (let j = 0; j <= sy; j++) {
        const lx = (mx - hx + (2 * hx * i) / sx) * p.scale,
          ly = (my - hy + (2 * hy * j) / sy) * p.scale;
        const x = p.x + lx * c - ly * s,
          y = p.y + lx * s + ly * c;
        const tx = Math.floor((x - grid.originX) / TILE),
          ty = Math.floor((y - grid.originY) / TILE);
        if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) continue;
        const t = ty * grid.cols + tx;
        if (!solid[t]) marked++;
        solid[t] = 1;
        if (tops && tops[t] < top) tops[t] = top;
      }
  }
  return marked;
}

/** A piece laid out in tiles, as a placement in units, standing on the ground. */
export function placePiece(
  piece: Piece,
  biome: Biome,
  originX: number,
  originY: number,
  ground: Ground,
  random: Random,
): Placement {
  const x = originX + piece.x * TILE,
    y = originY + piece.y * TILE;
  return {
    kind: piece.kind,
    x,
    y,
    z: ground.heightAt(x, y),
    yaw: piece.yaw,
    scale: piece.scale ?? 1,
    biome,
    vary: random(),
  };
}

/**
 * Every built piece as a placement, its footprint marked solid and its top
 * kept. The ground is read for each one's height after the village and the
 * ruins were levelled, so each stands on its own floor.
 */
export function buildings(
  pieces: readonly Piece[],
  ground: Ground,
  biomeAt: (x: number, y: number) => Biome,
  grid: { cols: number; rows: number; originX: number; originY: number },
  solid: Uint8Array,
  tops: Float32Array,
  random: Random,
): Placement[] {
  const out: Placement[] = [];
  for (const piece of pieces) {
    const x = grid.originX + piece.x * TILE,
      y = grid.originY + piece.y * TILE;
    out.push(placePiece(piece, biomeAt(x, y), grid.originX, grid.originY, ground, random));
  }
  for (const p of out) markFootprint(p, grid, solid, tops);
  return out;
}
