# Spec: the rover's head, one eye, and a better-made rover

## Context

The user likes the rover's body and wheels but finds the head too like
Wall-E: a box with two big round eyes under a brim (`headParts` in
`src/models/rover.ts`, `EYES`, `HEAD_SCALE` 1.2, slot `eyes` 13). They want a
single eye, then a higher polygon count and better quality across the model,
worked on by Opus over a few iterations.

## Where it stands now

- **Triangles:** 2,504 for the whole rover (`roverTriangles()`), held under
  3,000 by `test/models-rover.test.ts`.
- **Parts:** 14 slots (`SLOTS`). The pose API (`poseRover`, `poseOf`,
  `RoverPose` with `headYaw`, `headPitch`, `blink`) is read by `scene.ts`
  and tested by `models-rover-pose.test.ts`.
- **What draws the rover:** only one rover is drawn, so its triangles cost
  almost nothing a frame. The game's frame is 3.78 ms against an 8 ms budget.
  The mesh is made in code, so the download grows only by the code.
- **Where it shows:** every one of the 11 look pictures, the preview views
  `rover`, `rover-back`, `rover-side`, `rover-tilt`, and the shots
  `game-idle` and `game-close`.

## What

- **One eye.** A single big camera eye on a head that reads as a camera, not
  a face: a round lens set in a deep barrel or hood, glass with an iris ring
  and a glint, perhaps an aperture ring and a small status light. It is cute
  through its proportions and how it moves, not through Wall-E's two eyes.
  The blink becomes a lid or a shutter closing over the one eye, still
  driven by `blink`. The head still turns (`headYaw`) and tips (`headPitch`)
  as it does now.
- **More polygons and more quality, everywhere it shows:**
  - **Wheels:** rounder, with real tread blocks and hub detail.
  - **Arms:** proper bevels on the rocker-bogie arms, and joints that read.
  - **Body:** panel lines and edge chamfers on the body and deck.
  - **Back:** the power unit with fins.
  - **Parts that move:** the mast, the antenna and the high-gain dish.

  The body's and wheels' shape and proportions stay as they are: the user
  likes them. Colours stay white and orange.

- **Budget:** under 12,000 triangles (recommended; about 5× now), held by
  the test, which moves from 3,000 to 12,000.

## Acceptance

1. **One eye only.** The head has a single eye, and no part of the model is
   a pair of eyes. A test holds that the eye slot is one lens, centred on
   the head's face.
2. **Blink works on the one eye.** `blink` 0 to 1 still closes it: the lid
   covers the lens at 1, and the eye is fully open at 0.
3. **The pose contract is unchanged.** Every existing pose test passes,
   `poseRover` makes nothing (the alloc test), and the drawn wheels sit where
   the logic puts them (`models-rover-pose.test.ts`).
4. **Within the triangle budget:** under 12,000, every wheel counted.
5. **Body and wheels keep their shape:** the overall outline (length 5,
   width 3.5, wheel radius 0.8, wheel width 0.6, the arms' pivots) is
   unchanged. A test holds each part's bounds near today's.
6. **Pictured and read:** the preview's rover views and the game's idle and
   chase views are reviewed over iterations, and every look picture is
   rewritten through `/gate-moved`, each read.
7. **Perf:** the frame stays within tolerance of 3.78 ms, and the download's
   change is reported to the byte.

## Decisions (recommendations; agreeing the spec agrees these)

- **The eye: a single round camera lens** in a short barrel on a rounded
  head, with an iris ring, glass and a glint. A shutter or lid blinks over
  it. The alternative is a visor-style eye (one wide slit, like a scanner),
  which is less cute.
- **Budget 12,000 triangles.** Plenty for chamfers and tread; one rover
  costs nothing a frame either way.

## How it is built

1. **One fresh Opus builder,** working in a worktree from `ac3f9d1`. It owns
   `src/models/rover.ts` and `test/models-rover*.ts`, and runs
   `npm run shots` with `SHOTS_VIEWS` limited to the rover's views to see its
   work.
2. **Three iterations:** builder, then a fresh Opus reviewer that reads the
   pictures and returns a ranked critique, then the builder again. Each round
   adds close-ups from the front, three-quarter, side and back, the blink
   half and fully shut, and the game's idle and chase views.
3. **Then the gates** (me): `check:quick`, the mutation and fuzz run in
   `npm run check`, `look:update` and `perf:update` through `/gate-moved`
   with every picture read, and commit when asked.

## Verification

- **Tests:** `npx vitest run test/models-rover*.test.ts test/alloc.test.ts`.
- **Pictures:** `SHOTS_VIEWS=... npm run shots` for the rover views.
- **The whole line:** `npm run check` green within the 5-minute budget,
  with `look` and `perf` rewritten and each picture read.
