/**
 * Seeded noise for the world's detail: a gradient noise and its sums, made
 * from integer hashing and polynomials alone. Nothing here calls a
 * trigonometric or exponential function, whose last bit an engine is free to
 * choose, so the same seed gives the same ground to the byte in Node and in
 * every browser, which is what lets `worldHash` be pinned.
 */

/** A hash of a seed and two integers, as a number in [0, 1). */
export function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(seed ^ 0x27d4eb2d, 0x9e3779b1);
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ y, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Eight directions of equal length, so no corner of the lattice pulls harder than another.
const GX = [1, -1, 1, -1, 1.4142135623730951, -1.4142135623730951, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1.4142135623730951, -1.4142135623730951];

function corner(seed: number, ix: number, iy: number, dx: number, dy: number): number {
  const g = (hash2(seed, ix, iy) * 8) | 0;
  return GX[g] * dx + GY[g] * dy;
}

/** The quintic fade, whose slope and curve are nought at both ends, so the lattice never shows as a crease. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Gradient noise at a point, about -1 to 1, nought on every lattice point. */
export function noise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const u = fade(fx),
    v = fade(fy);
  const a = corner(seed, ix, iy, fx, fy),
    b = corner(seed, ix + 1, iy, fx - 1, fy),
    c = corner(seed, ix, iy + 1, fx, fy - 1),
    d = corner(seed, ix + 1, iy + 1, fx - 1, fy - 1);
  const ab = a + (b - a) * u,
    cd = c + (d - c) * u;
  return (ab + (cd - ab) * v) * 0.7071067811865476;
}

/**
 * Noise summed over octaves, each half the size and half the height of the
 * one before, scaled back to about -1 to 1: the broad roll of the land with
 * its smaller bumps on it.
 */
export function fbm(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0,
    amp = 1,
    norm = 0,
    f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(seed + o * 7919, x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Ridged noise, 0 to about 1, high along thin crests: for rock that breaks the ground in lines and not blobs. */
export function ridged(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0,
    amp = 1,
    norm = 0,
    f = 1;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise(seed + o * 104729, x * f, y * f));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
