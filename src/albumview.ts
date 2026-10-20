/**
 * The album over the game: the mount, its words and its page buttons, and where the picture is drawn in it. The page's,
 * so it is seen in the smoke tests, the look picture and the shots and not unit-tested. What a page shows is worked out
 * elsewhere: which oddity it is and the words under it by `AlbumPages`, the picture's numbers by the album, and the
 * picture itself drawn by the page's renderer into the view, which this lays over the mount's window.
 *
 * Written when the album is opened, a page turned or the window resized, none of which is a frame.
 */
import type { Album } from './album';
import { fitAspect } from './albummode';
import { pageLine, picturedLine, type AlbumPages } from './albumpages';
import { LOW, TERM_NAMES } from './hud';
import { TERMS } from './score';

export class AlbumView {
  private readonly root = document.getElementById('album')!;
  private readonly window = document.getElementById('albumWindow')!;
  private readonly empty = document.getElementById('albumEmpty')!;
  private readonly grade = document.getElementById('albumGrade')!;
  private readonly total = document.getElementById('albumTotal')!;
  private readonly stars = document.getElementById('albumStars')!;
  private readonly name = document.getElementById('albumName')!;
  private readonly terms = document.getElementById('albumTerms')!;
  private readonly count = document.getElementById('albumCount')!;
  private readonly page = document.getElementById('albumPage')!;
  private readonly small = document.getElementById('albumSmall')!;
  readonly prev = document.getElementById('albumPrev') as HTMLButtonElement;
  readonly next = document.getElementById('albumNext') as HTMLButtonElement;
  private readonly bars: HTMLElement[] = [];
  /** The view's place as last laid: left, top, width and height in CSS pixels; nought wide when it is not laid. */
  private readonly laid = new Float64Array(4);
  /** The picture fitted in the window, within it: left, top, width and height. */
  private readonly fit = new Float64Array(4);

  constructor() {
    for (const t of TERMS) {
      const label = document.createElement('span');
      label.textContent = TERM_NAMES[t];
      const bar = document.createElement('s');
      const fill = document.createElement('u');
      bar.append(fill);
      this.terms.append(label, bar);
      this.bars.push(fill);
    }
  }

  /** The album shown over the game, or put away. */
  show(on: boolean): void {
    this.root.hidden = !on;
    document.body.classList.toggle('album', on);
  }

  /** The page `pages` stands on written out: its oddity's name, grade and terms, or how to take a picture. */
  write(album: Album, pages: AlbumPages): void {
    const i = pages.oddity,
      pictured = i >= 0;
    this.window.hidden = !pictured;
    this.empty.hidden = pictured;
    this.grade.hidden = this.terms.hidden = this.small.hidden = !pictured;
    this.count.textContent = picturedLine(pages.count, album.capacity);
    this.page.textContent = pageLine(pages.page, pages.pages);
    this.prev.disabled = pages.page <= 0;
    this.next.disabled = pages.page >= pages.pages - 1;
    if (!pictured) return;
    const total = album.totalOf(i),
      stars = album.starsOf(i);
    this.total.textContent = String(total);
    this.stars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.name.textContent = album.nameOf(i);
    TERMS.forEach((_, k) => {
      const v = album.termOf(i, k);
      // a width and not the card's scale, which is rastered again a moment after it is set, and a page is held still to
      // the pixel
      this.bars[k].style.width = `${(v * 100).toFixed(1)}%`;
      this.bars[k].classList.toggle('low', v <= LOW);
    });
  }

  /**
   * The view laid over the mount's window while the page has a picture, at the picture's own shape `aspect` (width over
   * height) and as large as the window holds it, in its middle (`fitAspect`), so all of what was taken is drawn and
   * nothing it was not, whatever the window's shape; or put back over the whole screen. Whether its size changed, when
   * the renderer is to be sized again.
   */
  lay(view: HTMLElement, on: boolean, aspect: number): boolean {
    const l = this.laid,
      f = this.fit;
    let left = 0,
      top = 0,
      width = 0,
      height = 0;
    if (on && !this.window.hidden) {
      const box = this.window.getBoundingClientRect();
      fitAspect(aspect, Math.round(box.width), Math.round(box.height), f);
      left = Math.round(box.left) + f[0];
      top = Math.round(box.top) + f[1];
      width = f[2];
      height = f[3];
    }
    if (l[0] === left && l[1] === top && l[2] === width && l[3] === height) return false;
    const resized = l[2] !== width || l[3] !== height;
    l[0] = left;
    l[1] = top;
    l[2] = width;
    l[3] = height;
    const s = view.style;
    if (width > 0) {
      s.inset = 'auto';
      s.left = `${left}px`;
      s.top = `${top}px`;
      s.width = `${width}px`;
      s.height = `${height}px`;
      s.zIndex = '6';
    } else s.cssText = '';
    return resized;
  }
}
