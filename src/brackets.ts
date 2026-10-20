/**
 * The viewfinder's highlights: which oddities are bracketed, where, and which of them are in focus, worked out from
 * the shot and the world and never from the picture, so the page only draws what this says. An oddity is bracketed
 * when some of it is in the frame and some of it is seen, a ray from the lens reaching a point on it past the ground,
 * rock, what is built and the trees; one hidden is not, so the brackets never give away what the lens cannot see. Its
 * box is round its silhouette as the grade sizes it (`GRADE.silhouette`), held to the frame, so it hugs what is drawn
 * and a thing half out of the frame is bracketed to the edge.
 *
 * A fixed pool, `BRACKETS.most`: the world has a dozen oddities and a frame holds a few, so a frame with more than the
 * pool brackets the first of them and no more. The page asks every frame, and nothing here allocates.
 */
import { inView } from './score';
import { seenPoints, type Subjects } from './sight';
import type { Shot } from './viewfinder';
import type { Ground } from './world/types';

/** How many oddities can be bracketed at once: the page's pool of bracket elements is made to this. */
export const BRACKETS = { most: 16 } as const;

export class Brackets {
  /** How many are bracketed now: the first `count` of each array below. */
  count = 0;
  /** Which oddity each is, by its index among the subjects. */
  readonly which = new Int32Array(BRACKETS.most);
  /** Each one's box on the screen, x0, y0, x1, y1, from minus one to one across and up (y up), held to the frame. */
  readonly box = new Float64Array(BRACKETS.most * 4);
  /** One where it is in focus, as the grade counts in focus, nought where not. */
  readonly sharp = new Uint8Array(BRACKETS.most);
  private readonly seen = new Float64Array(8);

  /** The brackets for the shot as it stands. */
  update(shot: Shot, s: Subjects, g: Ground): void {
    const at = this.seen;
    let n = 0;
    for (let i = 0; i < s.count && n < BRACKETS.most; i++) {
      if (!inView(shot, s, i, at)) continue;
      if (seenPoints(g, shot.eye, s, i) === 0) continue;
      this.which[n] = i;
      const o = n * 4;
      this.box[o] = Math.max(-1, at[0]);
      this.box[o + 1] = Math.max(-1, at[1]);
      this.box[o + 2] = Math.min(1, at[2]);
      this.box[o + 3] = Math.min(1, at[3]);
      this.sharp[n] = at[7] > 0 ? 1 : 0;
      n++;
    }
    this.count = n;
  }
}
