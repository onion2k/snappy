# Snappy

A game where the player explores an environment and takes pictures of
things. Built on [artshape-render](https://github.com/onion2k/artshape-render),
[artshape-physics](https://github.com/onion2k/artshape-physics) and
[artshape-sound](https://github.com/onion2k/artshape-sound), and started from
the artshape game template on 2026-10-19.

## How it is played

Not yet. What is here is the ground the first feature builds on: a walled
floor in the toon daylight of ooergolf, with three sample shapes on it to
show the look. Drag to orbit, wheel to zoom, **M** to mute the music. The
template's demo, a sled shoving balls into a hole, was taken out before the
first feature.

## What is here

    npm run dev            the game at http://localhost:5206
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run perf           boot time, a frame's cost and the download, held to a budget and a baseline
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run mutate         the unit tests, held by the mutants they kill
    npm run check          all of it

The template's fuzzer, determinism check, leak watch, bench and pace gate
held only its demo's play, and went with it. Each comes back with the
feature that gives it something to hold; `CLAUDE.md` says which.

`CLAUDE.md` says how a change is made, what each gate holds, and the edge
cases a new thing has to meet. `/feature`, `/bug`, `/gate-moved` and
`/commit` are in `.claude/skills`.

## Layout

    src/game.ts        the game without the picture: the clock, the world, the save
    src/main.ts        the page: the frame drawn, the camera orbited
    src/look.ts        the look, golf's toon daylight
    src/sun.ts         where the sun is
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/arena.ts       content: the floor and the rock
    src/progress.ts    the save, and where it is kept
    src/physics.ts     the game's side of artshape-physics
    src/sound.ts       the game's side of artshape-sound
    src/scene.ts       what is drawn: the floor, the rock, the sample shapes
    scripts/           the mutation gate
    test/              unit tests, and a corpus of every save shape
    smoke/             Playwright: boots, plays, looks right, costs what it did
