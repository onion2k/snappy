/**
 * The album over the game, as the page works it: what opening it keeps of the game (stopped or not, in the viewfinder
 * or not, the post), what closing it puts back, which keys act while it is open and which do nothing, the pages turned
 * only while it is open; and the sum that fits a picture's kept shape inside the space the mount leaves for it.
 */
import { describe, expect, it } from 'vitest';
import { AlbumMode, albumKey, fitAspect } from '../src/albummode';

/** An album with these oddities pictured, as much of one as the pages read. */
const holding = (...indices: number[]) => ({
  pictured(out: Int32Array | number[]) {
    indices.forEach((i, k) => (out[k] = i));
    return indices.length;
  },
});

/** A post, as the renderer's is to the album: a thing kept and handed back as it was. */
const LOOK = { name: 'the look' };
const LENS = { name: 'the look with a lens' };

describe('the album opened and closed', () => {
  it('starts closed, keeping nothing', () => {
    const m = new AlbumMode(12, LOOK);
    expect(m.open).toBe(false);
    expect(m.leave(), 'closing what is not open puts nothing back').toBeNull();
  });

  it('opens over a game driving, at its first page, and closing gives it back driving and going', () => {
    const m = new AlbumMode(12, LOOK);
    expect(m.enter(false, false, LOOK, holding(2, 5))).toBe(true);
    expect(m.open).toBe(true);
    expect(m.pages.page).toBe(0);
    expect(m.pages.oddity).toBe(2);
    expect(m.leave()).toEqual({ paused: false, photographing: false, post: LOOK });
    expect(m.open).toBe(false);
  });

  it('opens over the viewfinder, stopped already, and closing gives back both and the lens’s post', () => {
    const m = new AlbumMode(12, LOOK);
    m.enter(true, true, LENS, holding(1));
    const back = m.leave()!;
    expect(back.paused).toBe(true);
    expect(back.photographing).toBe(true);
    expect(back.post).toBe(LENS);
  });

  it('opens once: opened again while open, it keeps what it kept the first time', () => {
    const m = new AlbumMode(12, LOOK);
    m.enter(false, true, LENS, holding(1));
    // the game the album stops, as it stands while the album is open: stopped, and whatever post the page drew with
    expect(m.enter(true, false, LOOK, holding(1))).toBe(false);
    expect(m.leave()).toEqual({ paused: false, photographing: true, post: LENS });
    expect(m.leave(), 'and closes once').toBeNull();
  });

  it('opens at the first page each time, read again from the album', () => {
    const m = new AlbumMode(12, LOOK);
    m.enter(false, false, LOOK, holding(2, 5, 9));
    m.turn(2);
    expect(m.pages.oddity).toBe(9);
    m.leave();
    m.enter(false, false, LOOK, holding(2, 5, 9, 11));
    expect(m.pages.page).toBe(0);
    expect(m.pages.pages).toBe(4);
  });

  it('turns its pages only while open', () => {
    const m = new AlbumMode(12, LOOK);
    m.pages.refresh(holding(2, 5));
    expect(m.turn(1), 'closed').toBe(false);
    expect(m.go(1), 'closed').toBe(false);
    expect(m.pages.page).toBe(0);
    m.enter(false, false, LOOK, holding(2, 5));
    expect(m.turn(1)).toBe(true);
    expect(m.turn(1), 'past the last').toBe(false);
    expect(m.go(0)).toBe(true);
    expect(m.pages.page).toBe(0);
  });
});

describe('the keys over the album', () => {
  it('Tab opens it and closes it, and a Tab held down does neither again', () => {
    expect(albumKey('Tab', false, false)).toBe('open');
    expect(albumKey('Tab', false, true)).toBe('close');
    expect(albumKey('Tab', true, false)).toBe('held');
    expect(albumKey('Tab', true, true)).toBe('held');
  });

  it('turns the page with the arrows while open, a page a repeat when one is held', () => {
    expect(albumKey('ArrowLeft', false, true)).toBe('prev');
    expect(albumKey('ArrowRight', false, true)).toBe('next');
    expect(albumKey('ArrowLeft', true, true)).toBe('prev');
    expect(albumKey('ArrowRight', true, true)).toBe('next');
  });

  it('closes on Escape while open, once, and not on its repeat', () => {
    expect(albumKey('Escape', false, true)).toBe('close');
    expect(albumKey('Escape', true, true)).toBe('held');
  });

  it('lets no other key act while open: not the camera, the shutter, the focus, the drive or the look', () => {
    for (const code of [
      'KeyF',
      'Space',
      'KeyA',
      'KeyW',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'KeyQ',
      'KeyE',
      'Enter',
    ])
      for (const repeat of [false, true]) expect(albumKey(code, repeat, true), code).toBe('held');
  });

  it('leaves every key but Tab to the game while closed', () => {
    for (const code of ['KeyF', 'Space', 'Escape', 'ArrowLeft', 'ArrowRight', 'KeyW'])
      expect(albumKey(code, false, false), code).toBe('game');
  });
});

describe('a picture fitted in the mount', () => {
  const fit = (aspect: number, w: number, h: number) => {
    // written over whatever it held, as the view's one array is each time
    const out = new Float64Array(4).fill(7);
    fitAspect(aspect, w, h, out);
    return [...out];
  };

  it('fills the width of a space taller than the picture, and stands in the middle of its height', () => {
    // a desktop picture on a phone: all of it, the whole width, with the mount above and below
    expect(fit(1.6, 339, 600)).toEqual([0, 194, 339, 212]);
  });

  it('fills the height of a space wider than the picture, and stands in the middle of its width', () => {
    // the mount's window at 1280 by 800 is a little wider than the picture taken at that shape
    expect(fit(1.6, 1064, 618)).toEqual([37, 0, 989, 618]);
    // a phone's picture, tall, on a desktop
    expect(fit(375 / 812, 1064, 618)).toEqual([389, 0, 285, 618]);
  });

  it('fills the whole of a space of the picture’s own shape', () => {
    expect(fit(1.6, 800, 500)).toEqual([0, 0, 800, 500]);
    expect(fit(1, 300, 300)).toEqual([0, 0, 300, 300]);
  });

  it('is whole pixels, as the view is laid', () => {
    for (const [a, w, h] of [
      [1.6, 1001, 617],
      [1.777, 333, 777],
      [0.4618, 1000, 333],
    ]) {
      const [left, top, width, height] = fit(a, w, h);
      for (const v of [left, top, width, height]) expect(Number.isInteger(v), `${a} ${w} ${h}`).toBe(true);
      expect(width).toBeLessThanOrEqual(w);
      expect(height).toBeLessThanOrEqual(h);
      expect(Math.abs(width / height - a) / a, 'its shape the picture’s, to a pixel').toBeLessThan(
        2 / Math.min(width, height),
      );
      expect(Math.abs(left * 2 + width - w)).toBeLessThanOrEqual(1);
      expect(Math.abs(top * 2 + height - h)).toBeLessThanOrEqual(1);
    }
  });

  it('takes the whole space for a shape that is not one, and nothing of a space of nothing', () => {
    for (const a of [0, -1, NaN, Infinity]) expect(fit(a, 400, 300), `${a}`).toEqual([0, 0, 400, 300]);
    expect(fit(1.6, 0, 300)).toEqual([0, 0, 0, 0]);
    expect(fit(1.6, 300, 0)).toEqual([0, 0, 0, 0]);
  });
});
