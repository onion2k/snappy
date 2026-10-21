# The frame's cost: FXAA and a pixel ratio of 1 as the look

State: building, part 2 of 2.

From the user's word on 2026-10-21 that the five levers measured that day
were all worth doing, and their choice from sheets of the three that are
look changes: FXAA in place of 4x MSAA, and the canvas drawn at a device
pixel ratio of 1 (was capped at 1.5). The grass's reach at 200 units was
shown and not chosen. Shadows and the screen-space occlusion have no cheap
lever: the sun map at 1024, the clouds not casting, the coarse rock and the
mid-ring ground not casting, the shadow's softness and the box's reach each
measured under 0.1 ms, so those two stay as rungs only, as they are.

Built on `sonnet` or by the `builder` agent; one commit a part on `main`,
pushed as the user asked for the day's commits. No mutation run and no full
`npm run check`, as for `plans/play-notes.md`; the perf gate, the look (every
picture moves with FXAA, each looked at), `check:quick` and `npm run fuzz --
--seeds 1-12`.

## Measured, 2026-10-21 (M4 Pro headless, `measureFrame` least of three, ms)

| view             | now, ratio 1 | FXAA | now, ratio 1.5 | FXAA at 1.5 |
| ---------------- | ------------ | ---- | -------------- | ----------- |
| start            | 4.15         | 3.25 | 5.32           | 3.97        |
| village          | 3.86         | 3.06 | 5.20           | 3.78        |
| wood             | 3.27         | 2.36 | 3.55           | 2.93        |
| far              | 5.03         | 3.47 | 6.39           | 4.19        |
| viewfinder, duck | 5.17         | 3.55 | 7.90           | 4.79        |

Ratio 1.5 is what the page draws at on a retina screen today; ratio 1 is
the left column. The budget is 8 ms.

## Parts

- [x] **Part 1. FXAA is the look's antialiasing.** `src/look.ts`
      `antialias: 'msaa'` → `'fxaa'`, its comment rewritten (the clean toy's
      four samples a pixel cost 0.9 to 1.6 ms a frame at ratio 1 and up to 3.1
      at 1.5, a fifth to a third of the frame, for edges FXAA softens only a
      touch in a flat-shaded picture; measured and chosen from a sheet,
      2026-10-21). `src/view.ts` `RUNG_STEPS`: `finish` now means the occlusion
      alone; `src/main.ts` `toRung` no longer swaps the antialiasing. The
      `RUNG_STEPS` doc and `test/view.test.ts` say so. `smoke/perf.spec.ts` and
      `src/frame-cost.ts` comments that name MSAA, if any, follow. Tests: the
      rung table re-pinned; a test in `test/look.test.ts` (or wherever the look
      is unit-tested; add a small one if nowhere) that the look asks for
      `'fxaa'`. Gates: perf (the frame falls; `perf:update` through
      `/gate-moved` with the figures), look (every picture moves at its edges:
      `look:update`, each looked at and said to show its scene), fuzz 1-12.
- [x] **Part 2. The canvas is drawn at a pixel ratio of 1.** `src/main.ts`
      `pixelCap` starts at 1 and the `pixel` field leaves `RUNG_STEPS` (every
      rung is 1); `relayout` keeps capping `devicePixelRatio` at it. The rungs
      then read: (0) everything, (1) the viewfinder's blur off and the far trees
      to 4 chunks, (2) grass 0.6, (3) occlusion off, (4) far trees to the ring
      drawn whole and grass 0.45; the doc says why rung 1 is two things (a blur
      off alone was worth nothing to a driver). Tests: the rung table re-pinned,
      `pixel` gone. Gates: perf (headless is ratio 1 already, so the figures
      should not move; say so), look (no picture should move; if one does, stop
      and ask), fuzz 1-12. `docs/specs/landscape-rover.md` or `photo.md`: a line
      where the frame's cost is described, if one names the ratio.

## Verification

`npm run check:quick` green on `main` after both; `npm run perf` and
`npm run look` green against the baselines each part wrote; the user's own
play on a retina screen is the judge of the softness.
