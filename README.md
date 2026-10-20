# Snappy

A game where the player explores an environment and takes pictures of
things. Built on [artshape-render](https://github.com/onion2k/artshape-render),
[artshape-physics](https://github.com/onion2k/artshape-physics) and
[artshape-sound](https://github.com/onion2k/artshape-sound), and started from
the artshape game template on 2026-10-19.

## How it is played

A little six-wheeled rover in a landscape about 190 m across: a village
round a cobbled square, a river with three fords, a lake and a marsh,
ruins on the hills and in the woods, a windmill, standing stones, and five
biomes (meadow, pine wood, autumn wood, heath, wetland). Drive with **W A S
D** or the arrows (on a phone, the thumb stick), zoom with the wheel or a
pinch, **M** to mute. Shallow water is crossed, deep water is not, and a
bank too steep to climb always has a way round. Nothing is pictured yet:
the camera and the album are next.

## What is here

    npm run dev            the game at http://localhost:5206
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run fuzz           a monkey drives it, and the rules are checked
    npm run determinism    the same seed driven twice, hashed
    npm run pace           how long the autopilot takes to cross the world
    npm run perf           boot time, a frame's cost, a driven run's worst frame and the download, held to a budget and a baseline
    npm run map            the world from above, to reports/map.png
    npm run shots          every view, to reports/shots/
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run mutate         the unit tests, held by the mutants they kill
    npm run check          all of it

The template's leak watch and bench are not here yet: each comes back with
the feature that gives it something to hold; `CLAUDE.md` says which.

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
