# Play notes, 2026-10-21: six fixes, six commits

State: building, part 6 of 6.

Copied to `plans/play-notes.md` in the repo as the first act of building, and
ticked there (the kit's `checks/plans.md`). Built on `sonnet` or by the
`builder` agent, one part at a time, in the order of the boxes (part 3 before part 2, as it needs no choice from the user); each part is its own
commit on `main` (the remote's default branch, unprotected) and its own push,
as the user asked for here on 2026-10-21. Per the user's word, no mutation
run and no full `npm run check` for these: the pre-commit `check:quick`, the
unit tests of the part, the perf gate (`npm run perf`) where a part touches a
frame, `npm run look` where it touches a picture, and `npm run fuzz` for the
two parts that touch the game's rules. Pictures and baselines that move are
written again through `/gate-moved` in the same commit, every picture looked
at.

## Context

Six things from the user's latest play. What the code says about each, read
on 2026-10-21 (artshape-render is **0.48.0**; CLAUDE.md says 0.47 and should be
corrected in passing in part 3):

1. **Depth of field "doesn't work".** It is set correctly every frame
   (`src/main.ts:451-455`, `shotBlur` in `src/score.ts:154`) and the renderer
   draws it (`node_modules/artshape-render/src/game/focus.ts`). But at the
   fixed f/2.8 with a 24 mm sensor the blur is physically honest and tiny: at
   the 50 mm start lens focused at 50 units the background blurs about 3 px
   at 800 px tall; a 24 mm with nothing in frame focuses at 5000 and blurs
   nothing. Only a close subject or a long lens shows it. Separately, the
   `FrameRung` drops it for good at its first rung (`src/view.ts:289-295`),
   and the page clamps `dt` to 1/20 before `rung.step` (`main.ts:724`), so
   `RUNG.ignore` never fires and a 30 Hz-capped browser steps down in 2 s,
   while driving, before the camera is ever raised.
2. **Downgraded for focus despite autofocus.** Autofocus (`viewfinder.ts:
430-460`) and the grade (`score.ts:258-273`) agree: both measure to the
   subject's `middle`. A **tap** does not: `focusAt` casts to the subject's
   bounding cylinder (`sight.ts` `meetSubjects`), one radius short of the
   middle, and at f/2.8 on a long lens that is "Out of focus" (duck at 30 units
   on 135 mm: blur 0.10 mm against the 0.03 mm sharp limit, term 0.14). Any
   click that travels under `TAP_SLOP` (8 px) is a tap and switches to manual
   (`main.ts:319-329`), silently. The brackets call `blur <= 2*sharp` sharp
   (`score.ts:273`) where the grade halves the term there, so the gold mark
   lies. The critique says "tap on it", which makes it worse.
3. **A tree cut from the sight line pops.** `cutAway` (`scene.ts:899-920`)
   eases a `size` 1→0 in about 0.1 s but draws nothing of the ease: at 0.5 it
   swaps the whole tree (scale 0) for the knee-high clump (`treesLow`,
   `kit.ts:199-214`) in one frame. The renderer has no alpha, opacity,
   stencil or mask per placement or group; the only per-placement levers are
   the matrix (`KitBatch.resize`, `shrink[0]` uniform, `shrink[1]` height) and
   `tint` (rgb + roughness). An x-ray circle or a real dissolve needs a change
   in artshape-render (a writer for the per-placement card cut would give a
   dithered dissolve). Out of scope here; named at the end.
4. **The driving camera is too high.** `CHASE.tilt.home = 49°` from straight
   down (`camera.ts:60`), by distance only, never by speed; the eye is 7.9 m
   up at 12 m back. The player's own tilt is eased back to 0 after a second's
   driving (`camera.ts:250-254`). The spec says "about 50°" and 9 m
   (`docs/specs/landscape-rover.md:68-71`), already out of date on distance.
5. **Ruins snap in and out.** Built things are never culled: every one is in
   the `built` pool for the whole world. What snaps is the same `cutAway`:
   wall (30 tall), tower (46) and arch (42) are "tall" (`view.ts:104`), tested
   every frame against the sight line and the foot of the picture
   (`inFront`, `NEAR_BUILT 0.35`, `LOOM 0.4`), with `HOLD = 4` units of
   hysteresis against a 36-unit wall, and swapped whole for their capped feet.
   The camera lifts fast over walls and sinks slowly (`lift {up:10,
down:1.5}`), so the line clears, the wall grows back, the camera sinks, the
   wall is cut: a slow cycle. On top, `ChunkView.update` (`view.ts:63-71`)
   re-chooses with no hysteresis whenever the camera's _target_ (which leads
   the rover by up to 0.28 × distance) crosses a chunk edge, and small scenery
   has a hard 2-chunk edge with no dithering.
6. **Perf.** Baseline on this M4 Pro: boot 1293 ms, least frame 3.81 ms,
   driven worst 3.9 ms, download 200,694 B (`smoke/perf-baseline.json`);
   budget 3000 / 8 / 400 KiB. The player's machine is unknown. Suspects, in
   order: pixels × 4× MSAA × passes (depth prepass, occlusion, 16-step fog,
   post) at pixel ratio up to 1.5; nothing culled into the 2048² shadow map,
   the prepass and the main pass (all 100 chunks' ground, every building,
   every far tree, 72 clouds); 262k grass blades; the rung that does nothing
   for a driver until its second step, is blind between 45 and 60 fps, and
   lowers neither resolution nor MSAA until the last rung; and per-frame
   uploads that need not happen (the whole 2048-mark track buffer on any
   frame a mark lands, `scene.ts:1093`; clouds, rover and 36 wade rings every
   frame, `scene.ts:822-828, 1060`; the renderer's own `[...static,
...dynamic]` array a frame, in that repo).

## The parts

Each part: tests first and seen failing, the change, `check:quick`, the
part's own gates, `/commit` (summary sentence in the house voice, body with
what and why, baselines in the same commit), then `git push origin main`.
Report each part with its figures before and after.

- [x] **Part 1. A tap focuses where the grade looks, and says so.**
      Bug fix (`/bug` shape). Files: `src/viewfinder.ts` (`focusAt`/`focusAlong`),
      `src/score.ts:273`, `src/hud.ts`, `src/main.ts:319-329`.
  - `focusAt`: when the cast meets an oddity, set `v[4]` to the distance to
    that oddity's `middle` (as `autofocus` does), not the cylinder hit;
    ground and trees keep the hit distance. `focused` is set to it.
  - Brackets' sharp flag: `blur <= GRADE.focus.sharp`, so the gold mark and
    the grade agree.
  - A tap that lands on no oddity while on auto stays on auto (it would only
    focus on grass and lose the subject); a tap on an oddity goes manual as
    now. The HUD's `MF` label is drawn larger/brighter for two seconds after a
    tap switches mode, so a player knows they left auto. Keep it small.
  - Critique line for poor focus: "Out of focus: go back to auto (A)."
  - Tests: `test/viewfinder.test.ts` gains `focusAt` with subjects: the focus
    equals the distance to the middle, within 1e-9; a tap on nothing keeps
    auto. `test/photo-grades.test.ts` gains a row: duck at 30 units, 135 mm,
    tap-focused, expected the same stars as autofocused (this is the row seen
    failing first). `test/brackets` or `score` test: sharp flag flips at
    `sharp`, not `2*sharp`.
  - Gates: unit, `npm run fuzz -- --seeds 1-12`, `npm run look` (the photo
    views may move if the mark changes: `/gate-moved` on each).
  - Out of scope: autofocus choosing by grade rather than nearest-centre.

- [x] **Part 3. A tree in the way sinks out of it over a few frames.**
      Files: `src/scene.ts` (`cutAway`, 899-920; the stale comments at 112-115
      and 894), `src/models/kit.ts` (`KitBatch.resize`/`kitMatrix`), CLAUDE.md
      (0.47 → 0.48; the line on fades).
  - Draw the ease that already exists. Over `size` 1→0 (about six frames at
    `SHRINK_RATE 7`) the full tree shrinks uniformly about its foot with
    `shrink[0] = size` and, at the same time, the clump grows `shrink[0] =
1 - size`. Growing back is the same in reverse at `GROW_RATE`. A paused
    frame (`dt = 0`) still settles at once. Nothing is squashed (height alone
    is never scaled: `kit.ts:174-176`'s rule stands), and a shrinking tree
    is a tree getting smaller, not a felled wood; say so in the comment.
    Buildings keep the halfway swap (a shrinking tower reads wrong; their
    fix is part 5).
  - Cost: `resize` is called for each tracked tree whose `size` moved that
    frame, not for every tree, so it is a handful of matrix writes a frame
    and no allocation. The `trees` and `treesLow` groups are already
    dynamic.
  - Tests: `test/scene.test.ts` (the wood flicker tests at 139 and 221 as a
    model): after one step of being blocked the full tree's scale is between
    0 and 1 and the clump's is its complement; after 0.3 s the tree is at 0
    and the clump at 1; with `dt = 0` it is at once; a restore after a chunk
    refill (`restoreTrees`) keeps a half-shrunk tree at its size.
    `test/alloc.test.ts` still shows no allocation.
  - Gates: unit, `npm run perf` (the driven run crosses woods: before and
    after, report), `npm run look` (the stills are settled, so pictures
    should not move; if `pine` or `autumn` do, `/gate-moved`).
  - Seen moving: in headless Playwright with `npm run shots` extended by
    a short driven sequence of three frames through a wood saved to
    `reports/shots/`, looked at by the user (the look gate holds stills
    only; CLAUDE.md says motion is a person's call).
  - Out of scope, named for the report: a true dissolve (a public writer for
    the per-placement card cut in artshape-render, tree uvs and a noise
    image) and an x-ray circle (a new masked pass). Both are that repo's.

- [x] **Part 2. The depth of field can be seen.**
      Files: `src/score.ts` (`depthOfField`, 136-146), `src/main.ts`, `src/hud.ts`,
      `src/view.ts`, `test/score.test.ts`, `test/view.test.ts`,
      `docs/specs/photo.md` (note the choice).
  - Add `LENS.look = 3` (name it for what it is: the toon frame's blur is
    drawn `look` times the thin lens's, since a 3 px blur reads as none in a
    flat-shaded picture; the _grade_ keeps the honest lens, so stars do not
    change). Apply it to `strength` only (not `band`, not `distance`) in
    `shotBlur`/`depthOfField`. Pick the factor by looking: make a sheet of
    the `game-photo-duck` view at ×1, ×2, ×3, ×4 with `npm run shots` (add a
    `?blur=` query read by the page for the sheet only, removed after) and
    put it to the user before fixing the number; 3 is the estimate.
  - The HUD shows the focus distance beside the mm, in metres to one place
    (units ÷ 10), so the player sees what the lens is on.
  - `main.ts`: hand `rung.step` the raw `(now - last)/1000`, clamped only for
    the simulation, so `RUNG.ignore` works as `view.test.ts:250-255` says it
    does. (The deeper rung fix is part 6.)
  - Tests: `depthOfField` strength is `look` × the previous (pin the old
    number first, see it fail); grade of the duck rows unchanged; view test:
    a frame of 0.3 s is ignored by the page's path (test through
    `FrameRung` with the raw dt; add a unit test of a helper if the page's
    clamp has to be split out).
  - Gates: unit, `npm run perf` (blur strength does not change its cost: a
    frame measured in the viewfinder is in `smoke/views.ts` `game-photo-*`;
    report before and after), `npm run look` with `/gate-moved` for the photo
    views that now blur more: look at each.

- [x] **Part 4. The driving camera looks further ahead.**
      A matter of taste, shown first. Files: `src/camera.ts` (`CHASE.tilt`,
      `lead`, 250-254), `test/camera.test.ts` (50-56, 181-186, 373, 427-442,
      445-468), `docs/specs/landscape-rover.md:68-71`, `smoke/screens/*`.
  - First, a sheet: `npm run shots` of `start`, `village` and `pine` at
    `tilt.home` 49 (now), 56, 62 and 68, through a `?tilt=` query read by the
    page for the sheet only. Put it to the user with the eye heights (120 ×
    cos: 78.7, 67, 56, 45 units against a conifer's 52 and a cottage's 60)
    and which crowns the eye drops below at each. Build only the one chosen.
  - Then: set `tilt.home` to the choice, scaling `near` by the same step so
    the zoom-in still looks lower than home. Keep the player's own tilt
    (`look[1]`) while driving and ease only the turn (`look[0]`) back, so a
    player who raises the view keeps it. If the chosen tilt puts the eye
    below crowns, the sight-line cut will fire more: say so in the report
    with a count of cuts over the driven perf run before and after (add it to
    `debug.ts`'s reading if not there).
  - Tests: the camera tests re-pinned to the new numbers (each seen failing
    first); a new one: driving for two seconds keeps `look[1]` and clears
    `look[0]`. Invariants (`cameraProblems`) unchanged and green over `npm
run fuzz -- --seeds 1-12`.
  - Gates: `npm run look`: every game view moves (`tiltAt` interpolates
    through home): `/gate-moved` on each, every picture looked at and said
    to show its scene. `npm run perf` before and after (a lower eye draws
    more trees whole). `npm run pace:check` (the autopilot is not the camera,
    so it should not move; if it does, stop and ask). Spec line updated to
    the new angle and the real 12 m.

- [x] **Part 5. What is built stays put; chunks do not re-choose at an edge.**
      Files: `src/view.ts` (`HOLD`, `SightLine.blocks`, `inFront`, `ChunkView.
update`), `src/scene.ts` (`cutAway` for `housesCut`), `test/view.test.ts`,
      `test/scene.test.ts`.
  - Built pieces: hysteresis of their own, `HOLD_BUILT = 16` units (a tower
    is 30 across, a wall 36 long), passed where `hold` is for `housesCut`; and
    `inFront` (the foot-of-picture cut) no longer applies to built things,
    only `inLine` does: a ruin at the foot of the picture is what the rover is
    seen among, and the camera already lifts over it. Grow-back for built
    things at a slower rate (`GROW_BUILT = 0.6`) so the camera's slow sink
    cannot beat it into a cycle: cut once, it stays cut until the line is
    clearly past.
  - `ChunkView.update`: re-choose only when the target is more than
    `SLACK = 0.25` chunk (48 units) past the edge of the chunk it last chose
    for, measured from that chunk's bounds, so a target idling or easing on
    an edge chooses once.
  - Small scenery (`kit` pool) dithered at its 2-chunk edge as the tall trees
    are at 712-718, so a crossing does not land a row of bushes at once.
    Check the kit pool's room (`mostInRing`) still covers it, or grow it and
    say by how much in the report.
  - Tests (`test/view.test.ts`): a wall 2 units past the line with `hold` 16
    stays cut; a wall at the foot of the picture is not cut by `inFront`; a
    target 10 units over a chunk edge does not re-choose, 60 does; and back
    the other way. `test/scene.test.ts`: a camera lifting and sinking over a
    wall for five seconds (drive the real `ChaseCamera` as the flicker tests
    do) swaps the wall at most once. `test/world*.test.ts` unchanged.
  - Gates: unit, `npm run perf` (fewer refills on the driven run: before and
    after, and the crossing count printed by `npm run perf`), `npm run look`
    (`ruin` and `village` may move: `/gate-moved`, looked at), `npm run
determinism` (chunk choice is drawn, not simulated, so it must not move).

- [x] **Part 6. The frame costs less, and a slow machine is caught sooner.**
      Measure first, change second, measure last. Files: `src/scene.ts`,
      `src/view.ts` (`RUNG_STEPS`, `RUNG`, `FrameRung`), `src/main.ts`
      (`toRung`, pixel ratio), `scripts/`/`smoke/` where a figure is read,
      `test/view.test.ts`, `test/scene.test.ts`, `test/alloc.test.ts`.
  - **Measure:** `npm run shots` for every view's frame cost (`reports/shots/
frames.json`) and `npm run perf` on a quiet machine, before anything.
    Also `?rung=4` through the same, to know what the bottom rung is worth.
    Put the table in the report. The GPU is not timed by the on-screen `ms`
    (CPU encode only); say so, and if artshape-render exposes a timestamp
    query use it, else leave the figure as it is and name it.
  - **Uploads:** write the tracks' buffer only for the marks touched since the
    last upload (a dirty range: `draws.move(group, matrices, count)` takes the
    whole; if the renderer has no offset write, upload only when a mark was
    laid _and_ at most every `MARK.every` seconds, batching the colour pass
    with it). Upload the wade rings only when one is alive or was last frame;
    clouds and rover stay (they move every frame).
  - **Rungs:** the first rung must help a driver: reorder to (1) pixel ratio
    capped at 1 and the viewfinder blur off, (2) far trees to 4, (3) grass
    0.6, (4) MSAA → FXAA and occlusion off, (5) far trees to the kit ring,
    grass 0.45. Judge the rung by the raw frame interval, with `ignore`
    working (part 2), and treat a steady interval within 10% of 1/30 s for
    `hold` seconds as a capped display, not a slow machine: no step. Still no
    stepping back up (the comment's reason stands).
  - **Culling, only if the measurements say it is the cost:** keep the far
    ground chunks (ring > 3) out of the shadow map and the prepass as the
    coarse ground already is (`terrain.ts:758-765`: do the same for the
    coarse rock groups), and clouds out of the shadow map. Each change
    measured on its own with `npm run perf`; one that moves the least frame
    less than its tolerance (15%) is dropped, not kept on faith. Pictures that
    change go through `/gate-moved`.
  - Tests: `view.test.ts` re-pinned to the new rung table (seen failing);
    a capped 30 Hz interval for 5 s does not step; 25 ms frames for 2 s do.
    `scene.test.ts`: no tracks upload on a frame with no new mark (count
    `move` calls through a fake `draws`); rings not uploaded when none alive.
    `alloc.test.ts` green.
  - Gates: unit, `npm run perf` before and after with the baseline written
    through `/gate-moved` (and the download to the byte: say the delta),
    `npm run look` on every scene touched by a culling change, `npm run fuzz
-- --seeds 1-12`, `npm run leaks` (the tracks' pool is watched there).
  - Out of scope: a GPU timestamp readout if the renderer lacks one; a
    lower shadow map; stepping back up.

## Verification, over all six

- After the sixth push: `npm run check:quick` green on `main`, and `npm run
perf` and `npm run look` green against the baselines committed with each
  part. `npm run fuzz -- --seeds 1-24` once at the end. (No `mutate`, no full
  `check`, as asked; said in the last report.)
- The user plays it: the blur visible on a close subject; a tap on a duck
  grading as autofocus does; a tree in the way shrinking away over a few
  frames; the camera lower; the fort hill's walls standing while driven
  round; and the frame figures from part 6 in the report.
- Not held by anything after this: motion (a person's call), another GPU.

## Named and not done

- A dissolve or an x-ray mask: artshape-render changes (card cut writer; a
  masked pass), then a version bump here.
- Autofocus choosing the subject the grade would, when two are in frame.
- Stepping a rung back up; a GPU-time figure on screen.
- The stale 0.171 ms frame in `smoke/judging.ts` and `src/frame-cost.ts`
  comments (fix in part 6's commit if touched).
