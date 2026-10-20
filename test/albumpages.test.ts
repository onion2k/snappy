/**
 * The album's pages as the page turns them: a page an oddity pictured, in the world's order, turned by a step either
 * way and never past either end; one page saying how to take a picture when there are none; the words under each; and
 * which drag across the page is a swipe that turns it.
 */
import { describe, expect, it } from 'vitest';
import { AlbumPages, SWIPE, keptLine, pageLine, picturedLine, swipeTurn } from '../src/albumpages';

/** An album with these oddities pictured, as much of one as the pages read. */
const holding = (...indices: number[]) => ({
  pictured(out: Int32Array | number[]) {
    indices.forEach((i, k) => (out[k] = i));
    return indices.length;
  },
});

describe('the pages', () => {
  it('are the oddities pictured, in the order the album gives them, from the first', () => {
    const p = new AlbumPages(12);
    p.refresh(holding(2, 5, 9));
    expect(p.count).toBe(3);
    expect(p.pages).toBe(3);
    expect(p.page).toBe(0);
    expect(p.oddity).toBe(2);
    p.go(2);
    expect(p.oddity).toBe(9);
  });

  it('turn a page at a time either way, and not past either end', () => {
    const p = new AlbumPages(12);
    p.refresh(holding(2, 5, 9));
    expect(p.turn(-1), 'back from the first').toBe(false);
    expect(p.page).toBe(0);
    expect(p.turn(1)).toBe(true);
    expect(p.oddity).toBe(5);
    expect(p.turn(1)).toBe(true);
    expect(p.oddity).toBe(9);
    expect(p.turn(1), 'on from the last').toBe(false);
    expect(p.page).toBe(2);
    expect(p.turn(-1)).toBe(true);
    expect(p.page).toBe(1);
  });

  it('go to a page asked for, held to the pages there are, and say whether they moved', () => {
    const p = new AlbumPages(12);
    p.refresh(holding(0, 1, 2, 3));
    expect(p.go(3)).toBe(true);
    expect(p.page).toBe(3);
    expect(p.go(3)).toBe(false);
    expect(p.go(9)).toBe(false);
    expect(p.page).toBe(3);
    expect(p.go(-4)).toBe(true);
    expect(p.page).toBe(0);
    expect(p.go(1.4), 'the nearest whole page').toBe(true);
    expect(p.page).toBe(1);
    expect(p.go(Number.NaN), 'nothing for nothing').toBe(false);
    expect(p.page).toBe(1);
  });

  it('are one page of nothing pictured when the album is empty, which turns nowhere', () => {
    const p = new AlbumPages(12);
    p.refresh(holding());
    expect(p.count).toBe(0);
    expect(p.pages).toBe(1);
    expect(p.oddity).toBe(-1);
    expect(p.turn(1)).toBe(false);
    expect(p.turn(-1)).toBe(false);
    expect(p.page).toBe(0);
  });

  it('keep the page they were on when read again, unless it is gone, when they stand at the last', () => {
    const p = new AlbumPages(12);
    p.refresh(holding(1, 4, 7));
    p.go(1);
    p.refresh(holding(1, 4, 7, 8));
    expect(p.page).toBe(1);
    expect(p.oddity).toBe(4);
    p.go(3);
    p.refresh(holding(1, 4));
    expect(p.page).toBe(1);
    p.refresh(holding());
    expect(p.page).toBe(0);
    expect(p.oddity).toBe(-1);
  });

  it('read again make nothing, at the album’s capacity', () => {
    const p = new AlbumPages(12);
    const all = holding(...Array.from({ length: 12 }, (_, i) => i));
    p.refresh(all);
    expect(p.count).toBe(12);
    p.go(11);
    expect(p.oddity).toBe(11);
    // the order is the one array, made with the pages
    const order = p.order;
    p.refresh(all);
    expect(p.order).toBe(order);
  });
});

describe('the words under a page', () => {
  it('say how many oddities are pictured of how many', () => {
    expect(picturedLine(5, 12)).toBe('5 of 12 oddities pictured');
    expect(picturedLine(1, 12)).toBe('1 of 12 oddities pictured');
    expect(picturedLine(0, 12)).toBe('0 of 12 oddities pictured');
  });

  it('say which page it is, counted from one', () => {
    expect(pageLine(0, 5)).toBe('page 1 of 5');
    expect(pageLine(4, 5)).toBe('page 5 of 5');
  });
});

describe('a swipe', () => {
  it('turns on to the next page dragged left, and back dragged right, past the least', () => {
    expect(swipeTurn(-(SWIPE.least + 1), 0)).toBe(1);
    expect(swipeTurn(SWIPE.least + 1, 0)).toBe(-1);
  });

  it('turns nothing short of the least, at it, or dragged more down than across', () => {
    expect(swipeTurn(-(SWIPE.least - 1), 0)).toBe(0);
    expect(swipeTurn(-SWIPE.least, 0)).toBe(0);
    expect(swipeTurn(SWIPE.least, 0)).toBe(0);
    expect(swipeTurn(-(SWIPE.least + 20), SWIPE.least + 21)).toBe(0);
    expect(swipeTurn(SWIPE.least + 20, -(SWIPE.least + 21))).toBe(0);
    // as far down as across is not across
    expect(swipeTurn(-100, 100)).toBe(0);
    expect(swipeTurn(-100, 99)).toBe(1);
    expect(swipeTurn(0, 0)).toBe(0);
  });

  it('is the length a thumb flicks across a phone and no shorter than a tap’s wander', () => {
    expect(SWIPE.least).toBeGreaterThanOrEqual(32);
    expect(SWIPE.least).toBeLessThanOrEqual(80);
  });
});

describe('the card’s line on the album', () => {
  it('says a first picture of an oddity went into the album, and a better one what it beat', () => {
    expect(keptLine('first', 0)).toBe('Into the album');
    expect(keptLine('better', 64)).toBe("Better than the album's 64");
    expect(keptLine('better', 7)).toBe("Better than the album's 7");
  });

  it('says nothing of a picture not kept', () => {
    expect(keptLine('none', 0)).toBeNull();
    expect(keptLine('none', 64)).toBeNull();
  });
});
