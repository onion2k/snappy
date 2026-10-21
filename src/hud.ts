/**
 * The viewfinder's marks over the picture, and the grade's card: the page's, so they are seen in the smoke tests and
 * the shots and not unit-tested. Everything they show is worked out elsewhere: which oddities are bracketed and which
 * are in focus by `Brackets`, the focus mark's place and the lens by the `Viewfinder`, the card's numbers by the grade.
 *
 * The marks are drawn every frame in the viewfinder, so nothing is made for them then: the brackets are a fixed pool
 * of elements, `BRACKETS.most`, made once; and each mark's place, size and look is kept as it was last written, in
 * whole pixels, and written again only when it has moved, so a view held still writes nothing to the page at all. The
 * card is made on a press of the shutter, which is not a frame.
 */
import type { Keeping } from './album';
import { keptLine } from './albumpages';
import { BRACKETS, type Brackets } from './brackets';
import { TERMS, critique, type Grade } from './score';
import type { Viewfinder } from './viewfinder';

/** How long the card shows, in milliseconds. */
const CARD_MS = 3000;

/** Each term's name on the card, in `TERMS`' order. */
export const TERM_NAMES: Record<(typeof TERMS)[number], string> = {
  inFrame: 'in frame',
  seen: 'seen',
  size: 'size',
  placement: 'placement',
  facing: 'facing',
  focus: 'focus',
  steady: 'steady',
  light: 'light',
};

/** A term at or under this is shown as what let the picture down. */
export const LOW = 0.5;

export class ViewfinderHud {
  private readonly root = document.getElementById('vf')!;
  private readonly mark = document.getElementById('focusMark')!;
  private readonly mode = document.getElementById('vfMode')!;
  private readonly lens = document.getElementById('vfLens')!;
  private readonly flashEl = document.getElementById('flash')!;
  private readonly cardEl = document.getElementById('card')!;
  private readonly cardTotal = document.getElementById('cardTotal')!;
  private readonly cardStars = document.getElementById('cardStars')!;
  private readonly cardName = document.getElementById('cardName')!;
  private readonly cardWords = document.getElementById('cardWords')!;
  private readonly cardKept = document.getElementById('cardKept')!;
  private readonly print = (document.getElementById('cardPrint') as HTMLCanvasElement).getContext('2d')!;
  private readonly cardBars: HTMLElement[] = [];
  private readonly boxes: HTMLElement[] = [];
  private readonly names: HTMLElement[] = [];
  /** Each bracket as last written: left, top, width, height in pixels, in focus, which oddity; -1 hidden. */
  private readonly written = new Int32Array(BRACKETS.most * 6).fill(-1);
  /** The focus mark as last written: x, y in pixels, in focus; the mode (1 manual) and the lens in whole mm. */
  private readonly markWritten = new Int32Array(5).fill(-1);
  /** What the focus was last on, and how (1 manual): a change to something is a lock, and the mark pulses. */
  private readonly locked = new Int32Array([-1, 0]);
  private cardTimer = 0;

  constructor() {
    // the pulse is once a lock: taken off when it is done, or cut short by the marks being hidden (the album hides them
    // by its style, which the HUD is not told of), so showing them again does not play it over (album review, 5)
    const unpulse = () => this.mark.classList.remove('pulse');
    this.mark.addEventListener('animationend', unpulse);
    this.mark.addEventListener('animationcancel', unpulse);
    const holder = document.getElementById('brackets')!;
    for (let k = 0; k < BRACKETS.most; k++) {
      const el = document.createElement('div');
      el.className = 'bracket';
      el.append(...Array.from({ length: 4 }, () => document.createElement('i')));
      const name = document.createElement('b');
      el.append(name);
      holder.append(el);
      this.boxes.push(el);
      this.names.push(name);
    }
    const terms = document.getElementById('cardTerms')!;
    for (const t of TERMS) {
      const label = document.createElement('span');
      label.textContent = TERM_NAMES[t];
      const bar = document.createElement('s');
      const fill = document.createElement('u');
      bar.append(fill);
      terms.append(label, bar);
      this.cardBars.push(fill);
    }
  }

  /** The marks shown or put away; put away, they are written afresh when next shown. */
  show(on: boolean): void {
    this.root.hidden = !on;
    this.iris();
    if (!on) {
      this.mark.classList.remove('pulse');
      this.written.fill(-1);
      this.markWritten.fill(-1);
      this.locked[0] = -1;
      this.locked[1] = 0;
      for (const el of this.boxes) el.style.display = 'none';
      // the card is the viewfinder's, and goes with it
      clearTimeout(this.cardTimer);
      this.cardEl.hidden = true;
    }
  }

  /** The iris: the frame closed to black and opened again over a fifth of a second, into the viewfinder or out. */
  private iris(): void {
    const el = document.getElementById('iris')!;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  /**
   * The marks for this frame, over a view `width` by `height` CSS pixels: a bracket and a name for each of
   * `brackets`, the focus mark at the viewfinder's, AF or MF, and the lens.
   */
  frame(vf: Viewfinder, brackets: Brackets, names: readonly string[], width: number, height: number): void {
    const w = this.written;
    for (let k = 0; k < BRACKETS.most; k++) {
      const el = this.boxes[k],
        o = k * 6;
      if (k >= brackets.count) {
        if (w[o + 5] !== -1) {
          el.style.display = 'none';
          w[o + 5] = -1;
        }
        continue;
      }
      const b = k * 4;
      const left = Math.round(((brackets.box[b] + 1) / 2) * width),
        right = Math.round(((brackets.box[b + 2] + 1) / 2) * width),
        top = Math.round(((1 - brackets.box[b + 3]) / 2) * height),
        bottom = Math.round(((1 - brackets.box[b + 1]) / 2) * height);
      // never a bracket smaller than its corners, so a far-off oddity is still marked plainly
      const bw = Math.max(18, right - left),
        bh = Math.max(18, bottom - top);
      const lx = left - ((bw - (right - left)) >> 1),
        ty = top - ((bh - (bottom - top)) >> 1);
      const sharp = brackets.sharp[k],
        which = brackets.which[k];
      if (w[o + 5] === -1) el.style.display = 'block';
      if (w[o] !== lx || w[o + 1] !== ty) el.style.transform = `translate(${lx}px, ${ty}px)`;
      if (w[o + 2] !== bw) el.style.width = `${bw}px`;
      if (w[o + 3] !== bh) el.style.height = `${bh}px`;
      if (w[o + 4] !== sharp) el.classList.toggle('sharp', sharp === 1);
      if (w[o + 5] !== which) this.names[k].textContent = names[which];
      w[o] = lx;
      w[o + 1] = ty;
      w[o + 2] = bw;
      w[o + 3] = bh;
      w[o + 4] = sharp;
      w[o + 5] = which;
    }

    // the focus mark, where the focus is, gold once it is on an oddity bracketed in focus
    const m = this.markWritten;
    const mx = Math.round(((vf.mark[0] + 1) / 2) * width),
      my = Math.round(((1 - vf.mark[1]) / 2) * height);
    let onSharp = 0;
    for (let k = 0; k < brackets.count; k++) if (brackets.which[k] === vf.focused && brackets.sharp[k]) onSharp = 1;
    // placed by its own translate and not a transform, which the pulse's scale is applied before: scaled so, the mark
    // was scaled from the page's corner and swept in from 1.7 times as far off (album review, 5)
    if (m[0] !== mx || m[1] !== my) this.mark.style.translate = `${mx}px ${my}px`;
    if (m[2] !== onSharp) this.mark.classList.toggle('sharp', onSharp === 1);
    const manual = vf.mode === 'manual' ? 1 : 0;
    // a lock: auto focus finding an oddity, or a tap setting the focus; the mark pulses once, as a camera's beeps
    const l = this.locked;
    if ((vf.focused >= 0 && vf.focused !== l[0]) || (manual === 1 && (l[1] === 0 || m[0] !== mx || m[1] !== my))) {
      this.mark.classList.remove('pulse');
      void this.mark.offsetWidth;
      this.mark.classList.add('pulse');
    }
    l[0] = vf.focused;
    l[1] = manual;
    if (m[3] !== manual) {
      this.mode.textContent = manual ? 'MF' : 'AF';
      this.mode.classList.toggle('manual', manual === 1);
      // a tap that left auto: MF is drawn big and bright, and the page's animation brings it back over two seconds
      this.mode.classList.remove('switched');
      if (manual === 1 && m[3] === 0) {
        void this.mode.offsetWidth;
        this.mode.classList.add('switched');
      }
    }
    const mm = Math.round(vf.focal);
    if (m[4] !== mm) this.lens.textContent = `${mm} mm`;
    m[0] = mx;
    m[1] = my;
    m[2] = onSharp;
    m[3] = manual;
    m[4] = mm;
  }

  /** The shutter's flash: the white laid over the frame and faded, started again by a press during the last. */
  flash(): void {
    const f = this.flashEl;
    f.classList.remove('go');
    // read back, so the animation is begun again rather than carried on
    void f.offsetWidth;
    f.classList.add('go');
  }

  /**
   * The card for a picture: a print of the frame as taken, copied from `frame` (one copy a press), its total and stars,
   * what it is of, whether the album kept it (`kept`, read now, as the next picture writes it again), a line on what let
   * it down, and each term; for three seconds, replacing the last.
   */
  card(g: Grade, name: string | null, frame: HTMLCanvasElement, kept: Keeping): void {
    const p = this.print,
      w = p.canvas.width,
      h = p.canvas.height;
    // the middle of the frame at the print's shape, so a phone's tall frame is a print and not a squeezed one
    const scale = Math.min(frame.width / w, frame.height / h);
    p.drawImage(frame, (frame.width - w * scale) / 2, (frame.height - h * scale) / 2, w * scale, h * scale, 0, 0, w, h);
    this.cardTotal.textContent = String(g.total);
    this.cardStars.textContent = '★'.repeat(g.stars) + '☆'.repeat(3 - g.stars);
    this.cardName.textContent = name ?? 'Nothing in frame';
    this.cardWords.textContent = critique(g);
    const line = keptLine(kept.kind, kept.replaced);
    this.cardKept.textContent = line ?? '';
    this.cardKept.hidden = line === null;
    TERMS.forEach((_, k) => {
      const v = g.terms[k];
      this.cardBars[k].style.transform = `scaleX(${v.toFixed(3)})`;
      this.cardBars[k].classList.toggle('low', v <= LOW);
    });
    const el = this.cardEl;
    el.hidden = true;
    // shown again, so its dealing in is played for every picture
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => (el.hidden = true), CARD_MS);
  }

  /** The card put away at once, as the album opens over it. */
  hideCard(): void {
    clearTimeout(this.cardTimer);
    this.cardEl.hidden = true;
  }
}
