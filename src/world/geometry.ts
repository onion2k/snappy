/**
 * The small arithmetic the layout is drawn with: easing, curves through
 * hand-placed points, and how far each tile is from a line. Every distance
 * here is in tiles, the layout's own measure, and nothing is per frame: this
 * runs once, when the world is made.
 */

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Eased from 0 at `e0` to 1 at `e1`, either way round, flat at both ends so no edge shows a crease. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * A Catmull-Rom curve through hand-placed points, as a dense line about a
 * tile between points: a road or a river laid by hand at a dozen points,
 * bent smoothly between them. The ends are held, so the curve begins and
 * ends where it was put.
 */
export function curve(points: readonly (readonly [number, number])[], spacing = 1): Float64Array {
  const out: number[] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(n - 1, i + 2)];
    const len = Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps,
        t2 = t * t,
        t3 = t2 * t;
      for (let k = 0; k < 2; k++)
        out.push(
          0.5 *
            (2 * p1[k] +
              (-p0[k] + p2[k]) * t +
              (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
              (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
        );
    }
  }
  out.push(points[n - 1][0], points[n - 1][1]);
  return Float64Array.from(out);
}

/** The length of a dense line, in its own units. */
export function lineLength(line: Float64Array): number {
  let sum = 0;
  for (let i = 2; i < line.length; i += 2)
    sum += Math.sqrt((line[i] - line[i - 2]) ** 2 + (line[i + 1] - line[i - 1]) ** 2);
  return sum;
}

/**
 * How far each tile's middle is from a dense line, out to `reach` tiles, and
 * which of the line's points is nearest it; further than `reach` is left at
 * Infinity and -1. `dist` and `near` are written in place, keeping the
 * nearer of what is there already and this line, so several lines can share
 * one field and each tile knows which it is nearest. `id` is folded into
 * `near` as `id * 65536 + point`, so a field over many roads still says
 * which road.
 */
export function lineField(
  cols: number,
  rows: number,
  line: Float64Array,
  reach: number,
  dist: Float32Array,
  near: Int32Array,
  id = 0,
): void {
  const points = line.length / 2;
  for (let i = 0; i < points - 1; i++) {
    const ax = line[2 * i],
      ay = line[2 * i + 1],
      bx = line[2 * i + 2],
      by = line[2 * i + 3];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)),
      x1 = Math.min(cols - 1, Math.ceil(Math.max(ax, bx) + reach)),
      y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)),
      y1 = Math.min(rows - 1, Math.ceil(Math.max(ay, by) + reach));
    const dx = bx - ax,
      dy = by - ay,
      len2 = dx * dx + dy * dy;
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const px = tx + 0.5,
          py = ty + 0.5;
        const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
        const ex = ax + dx * t - px,
          ey = ay + dy * t - py;
        const d = Math.sqrt(ex * ex + ey * ey);
        const k = ty * cols + tx;
        if (d <= reach && d < dist[k]) {
          dist[k] = d;
          near[k] = id * 65536 + (t < 0.5 ? i : i + 1);
        }
      }
  }
}

/**
 * Where a point lies against a straight line from `a` to `b`: how far along
 * it (`u`, 0 at `a`, the line's length at `b`) and how far to its left
 * (`v`), both in tiles, into `out`.
 */
export function frame(ax: number, ay: number, bx: number, by: number, px: number, py: number, out: Float64Array): void {
  const dx = bx - ax,
    dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len,
    uy = dy / len;
  out[0] = (px - ax) * ux + (py - ay) * uy;
  out[1] = -(px - ax) * uy + (py - ay) * ux;
}
