# Spec: the album

## Context

The photo mode grades each picture and throws it away. The album is feature 7 of `docs/plan.md`: the best
picture of each oddity is kept in the save as its numbers and redrawn when the player looks at it, a page an
oddity, which gives the game its goal (twelve oddities, each pictured well). It brings back the `leaks` gate, since
it is the first thing the game keeps. Agreed with the user: pictures kept as numbers and redrawn by the game
renderer; the best of each oddity, filled automatically; opened with Tab or a button over a paused game.

Feature 6 of the plan (a traced photograph) was not built: the album redraws with the game renderer, raster and
depth of field, as the viewfinder drew it.

## Where it stands now

- The save is `{ muted, volume }` (`src/progress.ts`, corpus `test/saves/01-03`). `game.shutter()` grades into the one
  reused `game.picture` (`src/game.ts`) and tells `GameEvents.photo(grade)`; nothing is kept.
- A `Shot` is the eye and seven numbers (`src/viewfinder.ts`: yaw, pitch, focal, aspect, focus, aperture, turn rate);
  the focus mark (`Viewfinder.mark`) is needed too, for `focusDepth` off the middle.
- Everything drawn that moves runs on game time `t` (clouds, sails, the UFOs' bob, grass wind through
  `renderer.time`); tracks and trampled grass are history and cannot be redrawn from `t`.
- `scene.frame(game, eye, target, dt, settled)` refills its pools at once when settled, so a camera put anywhere in
  the world draws there that frame. The rover is drawn always.
- Frame 3.84 ms of 8; download 196,245 B of 400 KB; the full check 3 min 47 s of 5.

## What

- **What is kept.** For each oddity, its best picture: the oddity's name (the world's, as the key), the lens (eye,
  yaw, pitch, focal, aspect, focus, the focus mark), the game time it was taken at, and its grade (total, stars, the
  eight terms to two places). About 250 bytes; twelve at most.
- **When it is kept.** On the shutter, a picture whose total is above nought is kept for its oddity if there is none
  yet or it beats the one kept (strictly; a tie keeps the older). The save is written then. The card says so:
  "Into the album" for the first, "Better than the album's 64" for a better one, nothing otherwise.
- **The album.** Tab, or an album button by the camera button, opens it over the game, which is paused (from driving
  or from the viewfinder); Tab, Escape or the button closes it and the game goes on as it was. Its pages are the
  oddities pictured, in the world's order, each the picture redrawn full frame inside a mount: its name, its grade and
  stars, its terms, and "5 of 12 oddities pictured". Left and right arrows, a swipe or the page buttons turn the page.
  With nothing pictured it is one page saying how to take one.
- **The redraw.** The scene drawn at the kept lens and moment: the camera at the eye, the field of view from the
  focal length at the kept aspect, the depth of field from the focus and mark, `t` for the clouds, sails, grass and the UFOs' bob, and
  no rover and no tracks (history, not kept; said on the page's small print). Settled, so it is the same picture every
  time, and held by `look` to the pixel. On closing, the scene goes back to the chase camera or the viewfinder,
  settled.

## Acceptance

1. A picture of an oddity graded above nought is kept when it is the first or better; a worse, an equal, one of
   nothing, or one of a hidden oddity is not; the save holds at most one picture an oddity.
2. The save keeps the album through a reload; a save without `album` loads with an empty album; an album that is not
   a list, or an entry with a field missing, not finite, out of range, or of an oddity the world does not have, is
   left out and the rest loads (`test/saves/04-album.json`, and the corpus test).
3. Tab or the button opens the album paused from driving and from the viewfinder, and closing goes back to exactly
   that, the game's time not moved; the pages turn by keys, swipe and buttons, and wrap at neither end.
4. A page redraws its picture the same every time (a `look` picture of an album page from a save); the picture is
   drawn without the rover and its tracks.
5. Nothing allocated a frame by the album's logic; the shutter's keeping allocates nothing once warm.
6. `leaks` is back: an hour by hand, short in `npm run check`, watching the album's count (ceiling: the oddities),
   the save's bytes, the tracks and the heap.
7. The fuzzer keeps pictures (its seeking shots fill the album) and reloads them; "the album holds at most one
   picture an oddity, each of an oddity the world has, graded 1-100, its numbers finite" is an invariant. Clean on
   seeds 1-24; the check within 5 minutes.

## Edge cases

- **the album:** the first picture, a better one, a worse and an equal one; at its ceiling (all twelve, and a
  thirteenth shutter); a save from before it; a save with a bad entry; an oddity removed from the world.
- **the shutter:** many presses in a frame (each judged against the last kept), while paused (nothing), a picture of
  nothing or of a hidden oddity (not kept).
- **the album open:** while the card shows (the card goes), while the viewfinder is up (back to it after), Tab and
  F and Space while open (only the album's keys work), the window resized (the page laid again at the picture's
  own kept aspect, as large as the mount's window holds it and letterboxed in it, the kept field of view held, so the
  whole of what was taken shows and nothing it did not).
- **sound:** a page turn is silent; nothing new to wake.
- **phone:** the album button big enough, a swipe turns the page, the mount and words fit at 375 px.
- **slower GPU:** the redraw takes the rung's blur setting, as the viewfinder does.

## Decisions

- Tab and an album button; arrows, swipe and page buttons; Escape closes.
- A strict improvement replaces; ties keep the older.
- Entries keyed by the oddity's name, so a world that reorders its oddities keeps its pictures, and one that drops an
  oddity drops its picture on load.
- No rover in the redraw, rather than keeping its pose: the eye is on its head, and a pose would mean keeping its
  suspension and wheels too.

## How it is built

- `src/album.ts` (logic, mutated): `Kept` (typed arrays, no allocation to judge), `Album` with `consider(grade, shot,
mark, t, name)` returning none / first / better, `readAlbum(raw, names)` for the save, `albumProblems` for the
  invariants. `progress.ts` gains `album` with its default; `Game` holds the album, keeps on the shutter, and tells
  `photo(grade, kept)`.
- The page: `main.ts` (Tab, the button, pause and back, the redraw through `scene.frame` with a stand-in `Played` at
  the kept `t`, the rover and tracks hidden), `src/albumview.ts` for the mount and pages (the HUD's way), `index.html`
  markup and phone layout, the card's line. Test API: `album()`, `openAlbum(on)`, `albumPage(n)`, and `shutter()`
  saying what was kept.
- Gates: `scripts/leaks.ts` and `leak-check.ts` from the template (`~/projects/artshape-game-template`), watching the
  album, the save's bytes, the tracks and the heap, run short in `check`; a stage in `smoke/progress.spec.ts`; a
  `look` picture of an album page; perf of a page turn reported.
- Built by the `builder` agent on Sonnet (switch the session or the agent's model): first the logic and the save
  with their tests, then the page, the API, smoke and look, then `leaks`; a reviewer over the pages and the feel, one
  round of fixes. `CLAUDE.md` gains the album in the layout, the save, the Test API, the gates table (`leaks`), and the
  checklist.

## Verification

Unit tests for `album.ts`, the save corpus and the game's keeping; `npm run fuzz -- --seeds 1-24`; `npm run leaks`
for an hour by hand and short in `check`; smoke: a picture taken, the album opened, a page turned, a reload, an old
save; the album page's `look` picture read and written through `/gate-moved`; `npm run check` green within 5 minutes.
