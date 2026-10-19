# Snappy

A game where the player explores an environment and takes pictures of
things. Built on [artshape-render](https://github.com/onion2k/artshape-render),
[artshape-physics](https://github.com/onion2k/artshape-physics) and
[artshape-sound](https://github.com/onion2k/artshape-sound), and started from
the artshape game template on 2026-10-19.

## How it is played

Not yet. What is in `src/` is still the template's stub until the first
feature lands: a sled on a walled floor, driven with **W A S D** or the
arrows, shoving balls into a hole. Drag to orbit, wheel to zoom, **M** to
mute. It is there so every gate has something to hold, and it gives way one
feature at a time through `/feature`.

## What is here

    npm run dev            the game at http://localhost:5206
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook)
    npm run fuzz           a monkey plays it, and the rules are checked
    npm run determinism    the same seed played twice, hashed
    npm run leaks          a long game, watching what must stay bounded
    npm run pace:check     how it plays, held to a baseline both ways
    npm run bench          what the physics costs a frame, held to a baseline
    npm run perf           boot time, a frame's cost and the download, held to a budget and a baseline
    npm run smoke          the real thing in headless Chromium on the GPU
    npm run look           what it looks like, held to a picture
    npm run check          all of it

`CLAUDE.md` says how a change is made, what each gate holds, and the edge
cases a new thing has to meet. `/feature`, `/bug`, `/gate-moved` and
`/commit` are in `.claude/skills`.

## Layout

    src/game.ts        the game without the picture
    src/main.ts        the page: events into words, the frame drawn
    src/debug.ts       window.game, the test API
    src/invariants.ts  what must always hold
    src/autopilot.ts   the game played by itself, for the gates
    src/arena.ts       content: for now the stub's floor, hole and balls
    src/progress.ts    the save, and where it is kept
    src/physics.ts     the game's side of artshape-physics
    src/sound.ts       the game's side of artshape-sound
    src/scene.ts       the arena as it is drawn
    src/sled.ts        the stub's machine, which goes last
    scripts/           the gates, each with its baseline beside it
    test/              unit tests, and a corpus of every save shape
    smoke/             Playwright: boots, drives, plays through, looks right
