# Snappy

A game where the player explores an environment and takes pictures of
things. Built on [artshape-render](https://github.com/onion2k/artshape-render),
[artshape-physics](https://github.com/onion2k/artshape-physics) and
[artshape-sound](https://github.com/onion2k/artshape-sound), and started from
the artshape game template on 2026-10-19.

## How to play

You are a little six-wheeled rover with a camera on a mast, in a landscape
about 190 m across: a village round a cobbled square, a river with three
fords, a lake and a marsh, ruins on the hills and in the woods, a windmill,
standing stones, and five biomes (meadow, pine wood, autumn wood, heath,
wetland). A dozen things are about the place that should not be: rubber
ducks on the ponds, garden gnomes, two UFOs. Find them and take their
picture; the best picture of each goes in your album.

**Driving.** `W A S D` or the arrows drive (on a phone, the thumb stick at
the bottom left). Drag, or `Q` and `E`, look round the rover, and the view
comes back behind you once you drive on; a tilt you set is kept. The wheel
or a pinch zooms the chase camera in and out. Shallow water is crossed,
slowly; deep water is a wall, and so is a bank too steep to climb, which
always has a way round. `M` mutes.

**Taking a picture.** `F`, or the camera button, raises the camera: the view
is now through the lens on the mast. Drag to look about; the wheel or a
pinch zooms the lens from 24 to 135 mm; anything worth a picture is
bracketed, with its name, and the focus mark turns gold when it is sharp.
The lens focuses by itself on what is in frame (`AF`); a click or a tap on
an oddity focuses on that one by hand (`MF`), and `A`, or the `AF` button,
goes back to auto. The readout beside the focal length says what distance
the lens is on. `Space`, or the shutter button, takes the picture; the game
stops while the camera is up. `F` or `Esc` lowers it.

**The grade.** Each picture is marked out of a hundred and given up to three
stars, from eight things: whether the subject is in frame and seen clear of
the trees, how much of the frame it fills (a sixth to a half is best), where
it sits (a third is better than the middle), whether it faces you, whether
it is in focus, whether you were moving, and whether you shot into the sun.
The card says what let the picture down. A picture graded above nought is
kept in the album if it is the first of that thing or better than the one
there.

**The album.** `Tab`, or the book button, opens it over a paused game; the
arrows, a swipe or the page buttons turn its pages, and `Tab` or `Esc`
closes it and puts you back exactly where you were. A page is the picture
drawn again from its numbers, so the album keeps a few hundred bytes a
picture, in the browser's own storage with your mute and volume.

## What is here

    npm run dev            the game at http://localhost:5206
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run fuzz           a monkey drives it, and the rules are checked
    npm run determinism    the same seed driven twice, hashed
    npm run pace           how long the autopilot takes to cross the world
    npm run perf           boot time, a frame's cost, a driven run's worst frame and the download, held to a budget and a baseline
    npm run map            the world from above, to reports/map.png
    npm run shots          every view, to reports/shots/
    npm run cost           what a frame of five views costs, at a rung
    npm run leaks          what the album and the tracks keep over long games, held to a ceiling
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run mutate         the unit tests, held by the mutants they kill
    npm run check          all of it

The template's bench is not here yet: it comes back with the first bodies
in the physics world; `npm run leaks` watches what the album and the tracks
keep over long games.

`CLAUDE.md` says how a change is made, what each gate holds, and the edge
cases a new thing has to meet. `/feature`, `/bug`, `/gate-moved` and
`/commit` are in `.claude/skills`.

## Layout

    src/game.ts        the game without the picture: the world, the rover, its tracks, the clock
    src/world/         the world: its contract, the drive rule, the layout, the generator, routes
    src/rover.ts       the rover; tracks.ts, camera.ts, autopilot.ts, input.ts, touch.ts beside it
    src/main.ts        the page: input, the chase camera, the frame
    src/scene.ts       what is drawn, a chunk at a time; view.ts its logic
    src/models/        the rover, the trees, the buildings, terrain, water, grass, sky
    src/look.ts        the look, golf's toon daylight
    src/sun.ts         where the sun is
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/progress.ts    the save, and where it is kept
    src/physics.ts     the game's side of artshape-physics
    src/sound.ts       the game's side of artshape-sound
    preview.html       a page for working on the models, not part of the game
    scripts/           the fuzzer, determinism, pace, mutation, the map
    test/              unit tests, and a corpus of every save shape
    smoke/             Playwright: boots, drives, looks right, costs what it did
