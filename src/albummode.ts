/**
 * The album over the game, as the page works it: whether it is open; what the game was when it was opened, stopped or
 * going, in the viewfinder or not, and the post its frame was drawn with, which closing puts back exactly; which keys
 * act while it is open, the album's own and nothing of the game's; the pages, turned only while it is open; and the
 * sum that fits a page's picture, at the shape it was taken at, inside the space the mount leaves for it.
 *
 * The page (`main.ts`) only wires these to the keys, the buttons, the renderer and the view, so what opening and
 * closing do is held here by unit tests, and the page's own part is seen in the smoke tests.
 */
import { AlbumPages, type Pictured } from './albumpages';

/**
 * What a key does over the album: opens it or closes it, turns its page back or on, is the album's and does nothing
 * (any key while it is open that is not its own, and Tab or Escape held down), or is the game's, the album being shut.
 */
export type AlbumKey = 'open' | 'close' | 'prev' | 'next' | 'held' | 'game';

/**
 * What a key (`KeyboardEvent.code`) does, a repeat or not, with the album open or not. Tab opens it and closes it, and
 * never moves the keyboard's focus; while it is open the arrows turn its pages, a page a repeat when one is held, and
 * Escape closes it; every other key is held from the game while it is open, so F, Space and the drive do nothing.
 */
export function albumKey(code: string, repeat: boolean, open: boolean): AlbumKey {
  if (code === 'Tab') return repeat ? 'held' : open ? 'close' : 'open';
  if (!open) return 'game';
  if (code === 'ArrowLeft') return 'prev';
  if (code === 'ArrowRight') return 'next';
  if (code === 'Escape' && !repeat) return 'close';
  return 'held';
}

/** What the game was when the album was opened, and what closing it puts back: `P` is the renderer's post. */
export interface AlbumBefore<P> {
  paused: boolean;
  photographing: boolean;
  post: P;
}

export class AlbumMode<P> {
  readonly pages: AlbumPages;
  /** What the game was when the album was opened: one, written into by each opening. */
  private readonly before: AlbumBefore<P>;
  private isOpen = false;

  /** For an album of `capacity` pictures; `post` is only what `before` holds until the album is first opened. */
  constructor(capacity: number, post: P) {
    this.pages = new AlbumPages(capacity);
    this.before = { paused: false, photographing: false, post };
  }

  /** Whether the album is open over the game. */
  get open(): boolean {
    return this.isOpen;
  }

  /**
   * The album opened over a game stopped or going, in the viewfinder or not, drawn with `post`: kept, to be put back,
   * and the pages read again from `album` and turned to the first. False, with nothing kept, if it was open already,
   * since what the game is while the album is open is the album's and not the player's.
   */
  enter(paused: boolean, photographing: boolean, post: P, album: Pictured): boolean {
    if (this.isOpen) return false;
    this.isOpen = true;
    const b = this.before;
    b.paused = paused;
    b.photographing = photographing;
    b.post = post;
    this.pages.go(0);
    this.pages.refresh(album);
    return true;
  }

  /** The album closed: what the game was when it was opened, to be put back as it was; null if it was not open. */
  leave(): Readonly<AlbumBefore<P>> | null {
    if (!this.isOpen) return null;
    this.isOpen = false;
    return this.before;
  }

  /** The page turned on by `by`, or back, while open. Whether it moved. */
  turn(by: number): boolean {
    return this.isOpen && this.pages.turn(by);
  }

  /** To page `n` while open. Whether it moved. */
  go(n: number): boolean {
    return this.isOpen && this.pages.go(n);
  }
}

/**
 * A picture of shape `aspect` (width over height) fitted inside a space `width` by `height` CSS pixels, whole, as large
 * as it goes and in the middle of the other way: its left and top within the space, its width and height, in whole
 * pixels, into `out`. So a page shows all of what was taken and nothing it did not: a desktop picture wide across a
 * phone with the mount above and below, and a phone's tall on a desktop. A shape that is not one takes the whole
 * space, and a space of nothing holds nothing.
 */
export function fitAspect(aspect: number, width: number, height: number, out: Float64Array): void {
  if (!(width > 0 && height > 0)) {
    out.fill(0);
    return;
  }
  let w = width,
    h = height;
  if (aspect > 0 && Number.isFinite(aspect)) {
    if (width / height > aspect) w = Math.min(width, Math.round(height * aspect));
    else h = Math.min(height, Math.round(width / aspect));
  }
  out[0] = Math.floor((width - w) / 2);
  out[1] = Math.floor((height - h) / 2);
  out[2] = w;
  out[3] = h;
}
