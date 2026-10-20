/**
 * The paved places: the village square, cobbled, and each ruin's floor of
 * broken flags. Each is an outline, and the outline is the one truth about
 * it: the tiles inside are stone, the scene paves it, and every road that
 * meets it stops at its edge, so no road's end is painted over the paving.
 * Outlines are in tiles here, anticlockwise, and handed to the map in units.
 */
import { VILLAGE, type Ruin } from './layout';
import { noise } from './noise';

/** The square: its sides, with each corner cut off by the chamfer, so it reads as a place and not a box. */
export function squareOutline(): Float64Array {
  const { x, y, half, chamfer: c } = VILLAGE;
  const h = half;
  return Float64Array.from([
    x - h + c,
    y - h,
    x + h - c,
    y - h,
    x + h,
    y - h + c,
    x + h,
    y + h - c,
    x + h - c,
    y + h,
    x - h + c,
    y + h,
    x - h,
    y + h - c,
    x - h,
    y - h + c,
  ]);
}

/** How many points a ruin's floor is drawn round with. */
const FLOOR_POINTS = 28;

/**
 * A ruin's floor: a ring round its middle whose radius wanders between
 * about four fifths and the whole of its floor, as a worn pavement's edge
 * does. The noise is read round a circle, so the outline closes on itself.
 */
export function ruinOutline(ruin: Ruin, seed: number): Float64Array {
  const out = new Float64Array(FLOOR_POINTS * 2);
  for (let k = 0; k < FLOOR_POINTS; k++) {
    const a = (k / FLOOR_POINTS) * Math.PI * 2;
    const c = Math.cos(a),
      s = Math.sin(a);
    const r = ruin.floor * (0.88 + 0.16 * noise(seed + 71, 1.6 * c + ruin.x, 1.6 * s + ruin.y));
    out[2 * k] = ruin.x + r * c;
    out[2 * k + 1] = ruin.y + r * s;
  }
  return out;
}

/** Twice the signed area of an outline: above nought when it runs anticlockwise. */
export function area2(outline: ArrayLike<number>): number {
  let sum = 0;
  const n = outline.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += outline[2 * i] * outline[2 * j + 1] - outline[2 * j] * outline[2 * i + 1];
  }
  return sum;
}

/** Whether a point is inside an outline, by the crossings of a ray east from it. */
export function inside(outline: ArrayLike<number>, px: number, py: number): boolean {
  let hit = false;
  const n = outline.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = outline[2 * i],
      yi = outline[2 * i + 1],
      xj = outline[2 * j],
      yj = outline[2 * j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * A line with every stretch inside any outline taken out, as the runs left
 * outside, each ending exactly at the edge it met. A road that ends in a
 * plaza ends at its edge; one that crosses a plaza becomes two.
 */
export function clipLine(line: ArrayLike<number>, outlines: readonly ArrayLike<number>[]): Float64Array[] {
  const runs: Float64Array[] = [];
  let run: number[] = [];
  const points = line.length / 2;
  const isIn = (x: number, y: number) => outlines.some((o) => inside(o, x, y));
  for (let i = 0; i < points; i++) {
    const x = line[2 * i],
      y = line[2 * i + 1];
    const here = isIn(x, y);
    if (i > 0) {
      const px = line[2 * i - 2],
        py = line[2 * i - 1];
      const was = isIn(px, py);
      if (was !== here) {
        // the edge between, found by halving the step
        let a = 0,
          b = 1;
        for (let k = 0; k < 24; k++) {
          const m = (a + b) / 2;
          if (isIn(px + (x - px) * m, py + (y - py) * m) === was) a = m;
          else b = m;
        }
        const t = was ? b : a;
        const ex = px + (x - px) * t,
          ey = py + (y - py) * t;
        if (was) run = [ex, ey];
        else {
          run.push(ex, ey);
          if (run.length >= 4) runs.push(Float64Array.from(run));
          run = [];
        }
      }
    }
    if (!here) run.push(x, y);
  }
  if (run.length >= 4) runs.push(Float64Array.from(run));
  return runs;
}
