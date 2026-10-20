/**
 * The album's pages, as the page turns them: a page for each oddity pictured, in the world's order as the album gives
 * them, turned a page at a time by the arrows, the page buttons or a swipe, and never round from either end to the
 * other, since a book does not; and with nothing pictured, one page saying how to take a picture. The words under a
 * page, and which drag across it is a swipe, are here too, so the page (`albumview.ts`) only shows what this says.
 *
 * Read again from the album each time it is opened, into an order made once at the album's capacity: opening and
 * turning make nothing.
 */
import type { KeptKind } from './album';

/** What the pages read of the album: the oddities pictured, by index in the world's order, and how many. */
export interface Pictured {
  pictured(out: Int32Array): number;
}

/**
 * A swipe: a drag across the page of at least `least` CSS pixels, more across than down, turns it; less is a tap or a
 * wander. About a third of a thumb's sweep across a phone, and well past the eight pixels a tap is allowed to wander.
 */
export const SWIPE = { least: 48 } as const;

export class AlbumPages {
  /** The page shown, counted from nought. A whole number. */
  page = 0;
  /** The oddities pictured, by index, in the order of their pages; the first `count` of it. */
  readonly order: Int32Array;
  private n = 0;

  constructor(capacity: number) {
    this.order = new Int32Array(capacity);
  }

  /** The pages read again from `album`, standing on the page they were on, or the last there is if it has gone. */
  refresh(album: Pictured): void {
    this.n = album.pictured(this.order);
    this.page = Math.min(this.page, this.pages - 1);
  }

  /** How many oddities are pictured. */
  get count(): number {
    return this.n;
  }

  /** How many pages there are: one for each oddity pictured, or the one that says how to take a picture. */
  get pages(): number {
    return Math.max(1, this.n);
  }

  /** The oddity on the page shown, by index; -1 on the page of nothing pictured. */
  get oddity(): number {
    return this.n > 0 ? this.order[this.page] : -1;
  }

  /** On by `by` pages, or back for less than nought, held to the first and the last. Whether the page moved. */
  turn(by: number): boolean {
    return this.go(this.page + by);
  }

  /** To page `n`, counted from nought, the nearest whole page there is. Whether the page moved. */
  go(n: number): boolean {
    if (Number.isNaN(n)) return false;
    const to = Math.max(0, Math.min(this.pages - 1, Math.round(n)));
    if (to === this.page) return false;
    this.page = to;
    return true;
  }
}

/** The album's count under a page: how many oddities are pictured of how many there are. */
export function picturedLine(count: number, capacity: number): string {
  return `${count} of ${capacity} oddities pictured`;
}

/** Which page is shown of how many, counted from one, as a book's are. */
export function pageLine(page: number, pages: number): string {
  return `page ${page + 1} of ${pages}`;
}

/**
 * The turn a drag of (`dx`, `dy`) CSS pixels across the page makes: on a page (1) dragged left, as a page is turned
 * from its right edge, back a page (-1) dragged right; nothing if it is no further across than `least`, or no more
 * across than down.
 */
export function swipeTurn(dx: number, dy: number, least: number = SWIPE.least): -1 | 0 | 1 {
  const across = Math.abs(dx);
  if (across <= least || across <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * The card's line on what the album made of a picture: into it as the first of its oddity, or better than the one it
 * held, by that one's total; nothing for a picture not kept.
 */
export function keptLine(kind: KeptKind, replaced: number): string | null {
  if (kind === 'first') return 'Into the album';
  if (kind === 'better') return `Better than the album's ${replaced}`;
  return null;
}
