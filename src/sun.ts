/**
 * Toward the sun: about 46 degrees up, from the right and the far side of the floor, so the rock and anything that
 * stands on it throw a long shadow back across the ground. Golf's own value (ooergolf, taken 2026-10-19), which
 * suits Snappy's camera because that looks along +y as golf's does. A module of its own, beside the look that lights
 * by it, so a test in Node can work out which way a surface faces it without loading the renderer, whose source it
 * cannot run.
 */
export const SUN: [number, number, number] = [0.5, 0.482, 0.719];
