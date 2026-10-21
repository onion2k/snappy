# Spec: the photo mode

## Context

Snappy is a game about photographing odd things, and so far the player can only drive and look round. The user
wants the photo feature: a button or key into a first-person viewfinder, looked about with the mouse or a finger,
a shutter, a focus point shown by depth-of-field blur (auto focus too), things worth a picture highlighted before
the shutter, and each picture graded and then thrown away (the album comes later). Agreed: a first set of oddities
is added now to be photographed (a rubber duck, a UFO, a garden gnome), and the blur is a real depth-of-field pass
added to artshape-render's game path, released as v0.47.0 and pinned here.

## Where it stands now

- No subjects in the world; `KINDS` has scenery and built things only. The rover's head has `headYaw`, `headPitch`
  and `HEAD.height` 3.4 over its pivots; the chase camera is `src/camera.ts`.
- artshape-render's game renderer has no depth of field (its post is bloom, vignette, grain, tone, dither); its
  still-life renderer has one (`render/post.ts`), which shows the sums.
- Frame 3.79 ms against 8; download 176,482 B against 400 KB; the full check about 3 minutes against 5.

## What

- **Into the viewfinder:** F, or a camera button on screen, puts the player in first person at the rover's camera
  eye; F, Escape or the button again takes them back to the chase camera where it was. The rover stops while they
  look (driving keys do nothing in the viewfinder), and its head turns with the view.
- **Looking:** a drag (mouse or one finger) turns and tilts the view, held to half a turn either way of the rover's
  heading and from 50° down to 60° up; the wheel or a pinch zooms the lens from 24 to 135 mm.
- **Focus:** auto by default: it focuses on the oddity nearest the middle of the frame, or failing one, on whatever
  is under the middle. A click or tap without a drag sets the focus on what is under it and holds it (manual); A,
  or the AF button, goes back to auto. What is out of focus is blurred by its distance from the focus (the
  depth-of-field pass), and a small focus mark shows where it is.
  The blur is drawn at three times the thin lens's strength (`LENS.look`), chosen from a sheet on 2026-10-21 because a
  few pixels of blur read as none in a flat-shaded picture; the grade keeps the honest lens, so stars do not change.
  The HUD shows the focus distance in metres beside the focal length.
- **Highlights:** every oddity in the frame and seen (not hidden behind the ground, rock or something built) gets
  corner brackets and its name, brighter when it is in focus. Nothing else is bracketed.
- **The shutter:** Space, a click on the shutter button, or a tap on it: a flash, then a card with the grade (out of
  a hundred, and up to three stars) and what made it, for a few seconds, then the picture is gone.
- **The grade** is worked out from geometry, never from pixels (`src/score.ts`), for the best oddity in the frame,
  each term nought to one, multiplied: **in frame** (the share of it inside), **seen** (the share of points on it a
  ray reaches), **size** (best filling a sixth to a half of the frame), **placement** (near a third-line crossing,
  or the middle for the UFO), **facing** (its front toward the lens; the gnome and duck have one), **focus** (its
  blur at the focus set, from the lens), **steady** (how fast the view was turning at the shutter), and **light**
  (the sun behind the camera rather than in its face). No oddity in frame: nought, and the card says so.
- **The oddities:** rubber ducks on still water, garden gnomes in gardens and woods, a UFO or two hovering over hills,
  about a dozen in all, placed by the world, never in the only way and reachable to see. A UFO bobs by game time.

## Acceptance

1. F or the camera button enters the viewfinder at the rover's eye and leaves it to the chase camera as it was; the
   rover does not move while in it; the test API can do both.
2. A drag turns and tilts the view within its limits; the wheel or a pinch zooms the lens within 24-135 mm.
3. Auto focus picks the oddity nearest the middle, else what is under the middle; a click or tap sets and holds a
   focus; A returns to auto. The focus distance is read back by the test API.
4. The depth-of-field pass blurs by distance from the focus; a game that does not ask for it draws as before to the
   pixel (artshape-render's own test); it is off outside the viewfinder.
5. Every oddity in frame and seen is bracketed, none that is hidden; in focus is shown.
6. The shutter grades the picture: nought to a hundred, nought with no oddity in frame, the same picture graded the
   same every time (a pure function, seeded), each term tested on the fixture; the card shows it, then it is thrown
   away (nothing kept, no save field).
7. Oddities are reachable to be seen from somewhere the rover can stand, never in water deep enough to hide them,
   never inside rock or anything built; the world's tests hold it.
8. Nothing allocated per frame in the viewfinder's logic; the fuzzer enters it, aims, focuses and shoots, clean on
   seeds 1-24, with "a grade is nought to a hundred" an invariant; frame within budget in the viewfinder with the
   blur; download growth reported; check within 5 minutes.

## Edge cases

- **the camera:** an oddity in frame and out, half in (in-frame share), behind something (seen share, and no
  brackets), too far off to count (size), pictured twice (each graded on its own: nothing is kept yet).
- **the shutter:** pressed while turning (steady), while paused (does nothing), many times in a frame (one picture a
  press, the card replaced), with nothing in frame (nought).
- **the album:** not reachable (pictures are thrown away).
- **the rover:** entering the viewfinder while driving stops it; leaving gives the controls back.
- **phone:** a finger drags, a tap focuses, the shutter and camera buttons are big enough; a slower GPU drops the blur
  first (a rung).
- **sound:** a shutter click (artshape-sound's voice), silent before the first gesture, muted with M.
- **save:** nothing new saved.

## Decisions (recommendations)

- F for the viewfinder, Space for the shutter, A for auto focus, Escape to leave; on screen, a camera button and,
  in the viewfinder, a shutter button and an AF button.
- The lens 24-135 mm, starting at 50.
- The card shows for three seconds; stars at 40, 60 and 80.
- About a dozen oddities: five ducks, five gnomes, two UFOs.

## Performance

The depth-of-field pass is the risk: a gather blur at half the frame's size, about 0.3-0.6 ms at 1280x800, only in
the viewfinder; measured with `perf:gpu` in artshape-render and a viewfinder scene in Snappy's perf; its rung is to
turn it off. The oddities are a few hundred triangles each, a dozen of them.

## How it is built

Contracts first (me): `KINDS` gains `duck`, `ufo`, `gnome`; a `SUBJECTS` table (radius, height, front or symmetric,
display name) in `world/types.ts`; the fixture gains a duck and a gnome. Then three Opus builders in parallel:

1. **Depth of field** in artshape-render (its own repo): `Post.focus` (distance, depth of the sharp band, strength),
   a half-size circle-of-confusion gather from the scene's depth, off by default to the pixel, its GPU tests, perf
   figure, released as v0.47.0 when the user agrees.
2. **The oddities** in Snappy: placed by the world (`world/finds.ts`), models in `models/` (a rubber duck, a saucer
   with a dome and lights, a gnome with a red hat), each with a triangle ceiling, and the world's tests.
3. **The viewfinder and the grade** in Snappy: `src/viewfinder.ts` (look, lens, focus, auto focus), `src/sight.ts`
   (a ray over the terrain and against rock, what is built and the oddities), `src/score.ts` (the terms), with tests
   on the fixture.

Then me: the page (main.ts: keys, buttons, drag, tap; scene.ts: the eye, the blur, the oddities drawn; the HUD:
brackets, focus mark, card), the test API, the fuzzer action and invariant, smoke stages, look pictures, perf, the pin
bump. Then a fresh Opus reviewer over the pictures and the feel, one round of fixes.

## Verification

Unit tests for each module; `npm run check` within 5 minutes; `npm run fuzz -- --seeds 1-24`; look pictures of the
viewfinder (a duck in focus with the background blurred, brackets showing) read and written through `/gate-moved`;
perf in the viewfinder within budget; artshape-render's `test:gpu` and `perf:gpu` green before its release.
