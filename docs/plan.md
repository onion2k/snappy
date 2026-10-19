# Snappy: the plan

Written 2026-10-19, while the template's stub was being taken out, from the
brief and from what artshape-render v0.45.0, artshape-physics v0.8.0 and
artshape-sound v0.2.0 can do today. It says what the game is, how it is to be
built on those packages, and in what order the features land. Each feature
below goes down the line through `/feature` on its own, with its own spec; this
file is the map, not the specs.

## The game

The player is a small six-wheeled rover with a camera on a mast. They drive it
about a landscape, seen from behind and above, looking for things that should
not be there: a rubber duck, a UFO, a garden gnome, a traffic cone on a hill, a
grand piano in a stream. When they find one they stop, drop into the camera's
view, frame it, set the lens, and press the shutter. The picture is developed
in front of them, a beat at a time, and scored for how good a photograph it is.
The best picture of each thing goes into the album.

The game is a showcase for artshape-render, so the photograph is the point: the
world is drawn every frame by the game renderer, but the picture is made by the
still-life renderer and its path tracer, the "honest answer" the raster is held
to, with a real thin lens, exposure, grain and vignette. Driving looks good;
the photo looks better than the game, and that gap is the reward.

## The three modes

1. **Driving.** Third person. A chase camera behind and above the rover, the
   game renderer (`artshape-render/game`) drawing every frame: terrain, grass,
   faceted scenery from `parts/lowpoly.ts`, water from the flow kinds, fog, a
   sun. W A S D or the arrows drive; skid steering, as six wheels would.
2. **Viewfinder.** First person, from the mast. The world is still the game
   renderer's, but the game pauses its clock (nothing drifts while framing),
   the frame wears a viewfinder overlay (thirds, a focus point, the exposure
   meter), and the post pass's depth of field and focus peaking show what the
   lens will do. Mouse looks; the wheel zooms the focal length (18-200 mm);
   keys open and close the aperture and move the focus; space is the shutter.
3. **Developing.** The shot, held as numbers (see _The photograph_), is drawn
   once by the still-life renderer and then traced, sample by sample, while the
   score is read out a line at a time. Then back to driving.

## The photograph

A picture is **never kept as pixels**. It is a `Shot`: the seed, the world's
time of day, the camera's position, heading, pitch and roll, the focal length,
the aperture, the focus distance, and the rover's speed at the shutter. The
same seed gives the same world, so a `Shot` draws the same picture every time.
That is what lets the album live in the save in a few dozen bytes a picture,
what lets `look` picture an album page to the pixel, and what lets the fuzzer
take thousands of photographs without a GPU.

How it is drawn, in `src/photo.ts` (the page's side, not the game's):

- The scene's meshes, which the game renderer has as instance groups, are
  handed to the still-life `Renderer` as the same groups with still-life
  materials (the two paths share geometry and no shading). The materials are
  chosen per thing: the duck is a glossy plastic, the UFO a polished metal with
  lit enamel, the gnome a painted ceramic, so each subject shows off a part of
  the material model.
- The `TraceCamera` takes the lens: focal length to field of view on a sensor
  of fixed size (36 mm), aperture to `aperture` radius in world units, the
  focus distance as `focus`. The tracer's `seed` is the `Shot`'s, so a trace is
  the same trace every time.
- The post pass adds the exposure the meter chose, grain and vignette.
- The developing tray shows the raster first and the trace taking over from
  it, for as many samples as the budget below allows.

## Scoring

The score is worked out by the game, **from geometry and never from pixels**, in
`src/score.ts`: a pure function of the world, the subject and the `Shot`. That
keeps it headless, seeded, unit-tested and mutation-checked like the rest of
the logic, and means the page cannot disagree with the game about a score. Each
term is nought to one and named, so the developing tray can read them out:

| Term          | What it measures                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| **In frame**  | the share of the subject's bounding sphere inside the frustum; nought below a half, and no picture is scored  |
| **Seen**      | the share of a few points on the subject a ray reaches from the lens past the terrain and the scenery         |
| **Size**      | how much of the frame the subject fills, best between a sixth and a half, falling off either side             |
| **Placement** | how near the subject's middle sits to a third-line crossing, or dead centre for a symmetrical thing (the UFO) |
| **Facing**    | the angle between the subject's own front and the line to the lens; the duck wants its face                   |
| **Focus**     | the circle of confusion at the subject's distance, from the aperture, the focal length and the focus distance |
| **Steady**    | the rover's speed at the shutter: a picture taken moving is shaken                                            |
| **Light**     | the subject lit by the sun from the camera's side, not into it, and not in its own shadow                     |

The total is a weighted product, so one bad term spoils a picture as it would a
real one, then out of a hundred, with stars for 40, 60, 80. Each subject has
weights of its own (a UFO wants the sky behind it, a duck in a stream wants to
be low and near the water), so subjects are puzzles and not just places.

A bonus for the thing doing what it does is in _Later_.

## Built on what is there

- **The rover is not a physics body.** artshape-physics is spheres and discs.
  The rover is kinematic: its middle moved by skid steering, its height and
  tilt fitted to the six wheel points read from the terrain with `heightAt`,
  each wheel's suspension taking the difference so the wheels are seen to ride
  over the bumps. It is a pusher (an oriented box with an owner) in the
  physics world, so it shoves loose balls (pebbles, a beach ball) and is kept
  out of the rock grid. A slope too steep is a wall to it, read from `slopeAt`.
- **The landscape** is the physics package's terrain (heights a tile, smoothed
  as a B-spline) with the rock grid for cliffs, surfaces for grass, sand and
  mud (they slow the rover), and water as a tile far below with clear water
  drawn over it. Its picture is a mesh made from the same heights, so what the
  rover rides is what is drawn.
- **Subjects** are content in `arena.ts` (to be renamed `world.ts`): a name, a
  mesh made from the renderer's generators or its lowpoly kit, a still-life
  material, a bounding sphere, a front, a few sight points, and a place. Some
  move on a seeded path (the UFO hovers and drifts; the duck bobs on the
  water's own `heightAt` from `waves.ts`).
- **No raycast is in the physics.** Seeing (the **Seen** term, and the
  viewfinder's "something is in the way") is Snappy's own: a ray marched over
  the terrain's `heightAt` and tested against the scenery's bounding spheres
  and the rock grid, in `src/sight.ts`, unit-tested on its own.
- **Sound:** the motors' whine with the speed, the wheels on each surface, the
  shutter, and the developing tray's tick per term.

## Budgets and rungs

The download, boot and frame are held as they are now (`smoke/perf.spec.ts`).
What is new:

- **Driving frame**, with the chase camera moving: `'keep'` holds nothing when
  the camera moves, so the whole scene is drawn every frame. The game renderer
  carries this ("no culling, no LOD" was measured to eight thousand movers),
  but a landscape is larger than an arena; the first feature measures it, and
  fog is the rung that shortens the far plane.
- **The still-life renderer and the tracer** are fetched only when the first
  picture is taken, so they cost the download nothing at boot. The perf gate
  gains a figure for that second fetch.
- **Developing**, held as samples in a time: as many traced samples as fit in
  three seconds on this machine, held to a baseline like `bench`. The rung for
  a slower machine is fewer samples and a smaller picture, and on the lowest
  the raster alone.

## Risks, to be settled by a spike first

1. **The photo and the drive do not match.** The two renderers share no
   shading, so a duck seen in the viewfinder (game path) will not look like the
   duck in the picture (still-life path). That is meant to be the reward, but if
   the colours or the light differ by much it reads as a bug. The spike draws
   one scene both ways and the sun, the sky and the colours are tuned until the
   picture reads as the same place, better.
2. **The tracer in a game.** It was made for one piece on a table. A landscape
   of a few hundred thousand triangles through its BVH worker may be slow to
   build. The spike measures the build and a sample at 1280 by 800, and if it is
   too slow the picture is traced only near the subject and the rest is the
   raster's (a depth cut, as a photographer's background is soft anyway).
3. **Traced pictures to the pixel.** The tracer is seeded, but `look` holding a
   traced picture exactly may not survive the GPU's float order. If it does
   not, `look` holds the raster development and the trace is held by a looser
   figure of its own (its mean and its noise), said so in _What is not held_.
4. **A mesh landscape against the lowpoly scenery's toy look.** The showcase
   wants the picture to look photographic; the kit is faceted. Faceted is kept
   for the scenery, and the subjects (the things pictured) get the still-life
   path's real parts: a revolve for the duck, sheets for the UFO's hull.

## Order of work

Each is one `/feature`, every gate green at each step, a gate handed its new
thing in the same change as the old one goes. The stub is already being taken
out, so the first feature lands on whatever is left of the gates' harness.

0. **Spike** (no commit to `main`; a branch, thrown away): one hill, one duck,
   drawn both ways and traced. Settles risks 1-3 with numbers, which go into
   the first spec.
1. **The landscape.** Terrain, rock, surfaces and water from a seed, drawn
   with grass, scenery and fog under a fixed camera. The invariants: nothing
   is left in rock, every tile the player could stand on is reached from the
   start. `look` pictures it; `perf` measures it.
2. **The rover.** Six wheels, skid steering, suspension, the chase camera.
   It replaces the sled: the autopilot, the fuzzer's `aim` and the smoke
   tests' `drive` are rewritten to drive it. The pace gate becomes minutes to
   reach every subject.
3. **Subjects.** Three to start: the duck, the UFO, the gnome. Placed by the
   seed, never behind rock and never in the only path. The invariants count
   them.
4. **The viewfinder.** First person, the lens (focal length, aperture,
   focus), depth of field and peaking from the post pass, the overlay. The
   game's clock stops while framing.
5. **The score.** `score.ts` and `sight.ts`, all of it headless. The fuzzer
   gains "take a picture from anywhere" and the invariants "a score is nought
   to a hundred, and nought for a subject out of frame". This lands before the
   picture is drawn, so the gates hold it from the start.
6. **The photograph.** `photo.ts`: the still-life renderer and the tracer
   fetched on the first picture, the developing tray. `look` pictures a
   developed shot.
7. **The album.** The best `Shot` of each subject in the save, re-drawn from
   its numbers, a page per subject. Save field `album`, with a default and a
   save in `test/saves/`. `leaks` holds its ceiling (one shot a subject).
8. **Time of day.** The sun moves with the game's clock, so light is a choice:
   come back at dusk for the UFO.
9. **More subjects,** a few at a time, each showing off a material: the
   piano's lacquer, a glass bottle, a gold coin in the stream.

Then _Later_: a subject doing what it does (the UFO's beam on), photo
challenges ("the duck, from below, at f/2"), a phone's controls.

## What changes in the project's file

As each feature lands, `CLAUDE.md` changes with it: the model features become
the rover and a subject; the edge-case checklist's sled and hole entries become
the rover (on a slope, against rock, in water, pushing a ball) and the subject;
the save is `album`, `muted` and `volume`; the gates table names the pace
gate's new figure and the developing budget.

## Who builds it

This plan, and each feature's spec, on Opus in plan mode. Each spec agreed is
built on Sonnet, in a session switched to it or by the `builder` agent.
