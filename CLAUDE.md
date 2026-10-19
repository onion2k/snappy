# Snappy: working on it

A game where the player explores an environment and takes pictures of
things. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics)
and the sound from [artshape-sound](https://github.com/onion2k/artshape-sound).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too. There is no game in `src/` yet: a
walled floor in golf's toon daylight, with three sample shapes on it and a
camera to orbit them, the ground the first feature builds on. The template's
demo (a sled shoving balls into a hole) was taken out on 2026-10-19.

## The factory

This repo is a line that turns ideas into a browser game that loads fast,
draws fast and has no bugs, one feature at a time, and it holds those three
properties as numbers from the first commit. Every change goes down the same
line: a spec agreed, tests written and seen failing, the change built, every
gate run, the result looked at, the report made with evidence, then a
commit. The line does not skip a station, and it stops when a gate is red:
a red gate is fixed before anything else lands, never skipped with
`--no-verify` and never made green by moving its baseline.

The three properties are bug free (`src/invariants.ts`, and the fuzzer once
there is a player to play it; every bug found becomes a test, and a rule
where it is one; the tests themselves held by `mutate`), loads fast and draws fast (`perf`, and a rung to step down
to when a feature cannot fit the budget). The same seed gives the
same game, so every failure can be played again.

## Gates

What each holds, and where its figure and its tolerance are kept. A figure
is not copied here; read it from its file.

| Gate     | Holds                                              | Figure kept in                   | Tolerance, in                                            |
| -------- | -------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `perf`   | boot, the least of 24 frames, the gzipped download | `smoke/perf-baseline.json`       | `smoke/judging.ts`                                       |
| `perf`   | the same, against the budget                       | `BUDGET` in `smoke/perf.spec.ts` | none: a budget is a limit                                |
| `look`   | the scenes, to the pixel                           | `smoke/screens/`                 | `TOLERANCE`, `smoke/look.spec.ts`                        |
| `mutate` | surviving mutants, per logic file, held exactly    | `mutation-baseline.json`         | none; the score floor is `break` in `stryker.config.mjs` |

Five of the template's gates were deleted with its demo on 2026-10-19,
since each held only the demo's play, and a gate that holds nothing looks
as if it does. Each comes back from `~/projects/artshape-game-template`,
cut to the game's own terms, with the feature that gives it something to
hold:

- **`fuzz`** (`scripts/fuzzer.ts`, `fuzz.ts`) and **`determinism`**
  (`determinism.ts`, `determinism-check.ts`): with the player, the first
  thing a person can do, and so the first thing a monkey can.
- **`bench`** (`bench.ts`, `benching.ts`): with the first bodies in the
  physics world.
- **`leaks`** (`leaks.ts`, `leak-check.ts`): with the first thing kept,
  most likely the album of pictures taken.
- **`pace`** (`pace.ts`, `pace-check.ts`): with the first goal, the
  minutes it takes an autopilot to reach it.

A budget is what the game may cost at all; a baseline is what it cost at
the last commit, held both ways, so a step toward a budget is noticed as
much as a step over it. The perf tolerances are the measured wobble of a
headless boot and a GPU frame, and say so in `smoke/judging.ts`. The toon
frame is steady on a quiet machine and three times slower while another
session draws on the GPU, so perf is run, and its baseline written, with no
other session's browsers running. The
download does not wobble, so it is held to the byte: a change that adds to
it writes the perf baseline again and says by how much, and one that
should not have is looked into.

The survivors do not wobble either: the count for each file is held
exactly, both ways, and a change that moves it writes the baseline again
and says why. A new file of logic is added to `stryker.config.mjs`; the
page, the picture, the browser's events and the test API are left out, as
none of them is unit-tested.

## Commands

    npm run dev            the game at http://localhost:5206
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook; ~10 s)
    npm run check          all of it: check:quick, mutate, smoke with perf and look
    npm test               unit tests (Vitest, test/)
    npm run perf | look | smoke | mutate
                           each gate on its own, as in Gates; mutate:judge -- src/a.ts
                           judges one file

A unit test is allowed thirty seconds, and `vitest.config.ts` says why.

`npm run perf:update`, `mutate:update` and `look:update` write a baseline
again. Only through `/gate-moved`, only for a change meant to move it, and
the commit says why. Look at every picture. A baseline written while the
machine is at other work fails every run after it.

## How the code is laid out

- `src/game.ts` is the game without the picture: everything that happens in
  the arena, a step at a time. It tells what happened through `GameEvents`,
  and knows nothing of the renderer or the page.
- `src/main.ts` is the page. It turns those events into words on the screen
  and draws the frame. There is no game logic here.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold.
- Content (the floor and the rock) lives in `arena.ts`. The save lives in
  `progress.ts`. Chance comes from `random.ts`, handed in.
- `src/look.ts` is the whole look, golf's toon daylight, set on the renderer
  by `daylight()`; `src/sun.ts` is where the sun is. `src/scene.ts` is what
  is drawn: the floor, the rock and the three sample shapes.
- `src/physics.ts` is the game's side of artshape-physics, and nothing else
  imports the package directly. Its world holds the floor and the rock, and
  no bodies yet. A change a package needs goes in that repo,
  with a version bump here.
- `src/sound.ts` is the game's side of artshape-sound, and the only file
  that imports it, behind `GameSound`. The page holds a `LazySound`: the
  sound is made on the first key or click (or the API's `wake()`), and until
  then it keeps the save's mute and volume and is silent. The page makes the
  `AudioContext` when it wakes it, and works the mute (`m`).

## Skills

In `.claude/skills`, and they come with every game copied from here:
`/feature`, `/bug`, `/gate-moved` and `/commit`.

## Model features

What to copy the shape of, when building something new:

- **The look:** `src/look.ts`, golf's (ooergolf's `src/look.ts`, taken
  2026-10-19, at artshape-render 0.45.0), its values unchanged and its turf
  and water left out. A colour is tuned against it: golf's grass on the
  floor, a darker warm stone on the rock, golf's toys on the samples, all in
  `scene.ts`.
- **In the arena:** nothing yet. The three sample shapes in `scene.ts` are
  drawn only, to show the look, and go when the first thing to be pictured
  comes. A new thing is its content in `arena.ts`, drawn by `scene.ts`,
  stepped by `game.ts`, held by `invariants.ts`, read by `debug.ts`, and
  pictured in `smoke/look.spec.ts`.
- **Tools:** the mutation gate (`scripts/mutation-check.ts`, its judgement
  in `scripts/mutation-judge.ts`), with unit tests of its own working
  parts, and the perf gate (`smoke/perf.spec.ts`, judged in
  `smoke/judging.ts`). A gate is trusted once it has been seen to fail
  what it is for.

## Where the first features start

The floor and the rock are the physics package's terms, and stay until the
environment to explore replaces them. The samples go with the first thing
to be pictured. The first feature with a player brings back `fuzz` and
`determinism` in the same change, and each later gate comes with the
feature that gives it something to hold, as in Gates.

## Rules for the code

- **No tight coupling.** A module takes what it needs as arguments or
  options. It does not import game state, and lower modules do not import
  content. `main.ts` is the only place that wires everything together.
- **Chance is handed in.** `Game` takes a `random`; nothing in `src/` calls
  `Math.random` itself.
- **Nothing is made each frame.** Pools are sized once and written into;
  the renderer's groups are fixed and `move` writes them. A per-frame
  allocation is a frame-time bug and a garbage-collection stutter.
- **Nothing is kept for ever.** A list, map or cache that is added to has to
  be emptied somewhere, and its ceiling named in `scripts/leaks.ts`, which
  the first thing kept brings back.
- **Loading is the first frame's business.** Everything the first frame
  needs is built before `ready`; everything else after it. A dependency is
  weighed against the download budget before it is added.
- **Every kind of thing is handled everywhere.** A new body kind, event,
  save field or scene has to work in every path it can reach.
- **Save compatibility.** A new save field needs a default in `progress.ts`
  and a save in the new shape in `test/saves/`; the corpus test fails until
  it is there. The save is `muted` (false) and `volume` (1, from 0 to 1;
  anything else loads as 1). A save from the demo's day, with `bank` and
  `banked`, loads with those ignored.
- **Match the style.** Comments are full sentences in the house voice,
  saying why and not what. Prettier decides the formatting.

## Definition of done

The house's nine points, in `~/.claude/CLAUDE.md`. Here, they mean: unit
tests in `test/`, a stage in `smoke/progress.spec.ts`, a rule in
`src/invariants.ts` and, once the fuzzer is back, an action in
`scripts/fuzzer.ts`; a size in `scripts/leaks.ts` for anything kept (the
first thing kept brings the leaks gate back); the perf figures before and after in
the report and within budget, `measureFrame` in any other scene touched, and
a picture in `smoke/look.spec.ts`. New tests mutation-checked by hand, and
the gate run over the files the change touched: `npx stryker run --force
--mutate src/a.ts,src/b.ts`, then `npm run mutate:judge -- src/a.ts
src/b.ts`. `npm run check` green, and once it is back, `npm run fuzz --
--seeds 1-24` clean.

## Edge-case checklist

For anything new in the arena, check what it does:

- **save:** saved, reloaded, and loaded from an old save without the field
- **sound:** before the first gesture (no context made; nothing queued, no error; a mute made then is kept, and goes into
  the context when it is made; the API's `wake()` stands in for the gesture),
  paused (no music: the sound steps with the game and not with the page), muted (`m` or `mute()`, kept in the save; the voices
  still count), and a save without the fields, or with `muted` as a string
  or a volume out of range (the defaults)
- **rock:** against the wall and in the corners; never left in rock
- **scale:** many at once, at capacity (`BODY_CAPACITY`); and what it costs
  a frame at that many, in the toon look
- **phone:** narrow screen, and a slower GPU: which rung it steps down to
- **the camera:** in frame and out of it, half in, behind something,
  too far off to count, and pictured twice (counted once)
- **the shutter:** pressed while moving, while paused, many times in a
  frame, and with nothing in frame
- **the album:** a picture taken, kept in the save, reloaded, and loaded
  from an old save without it; the album at its ceiling
- **exploring:** reached from every place the player can stand, never out
  of reach behind rock, and never in the way of the only path

## Test API

`window.game`, in `src/debug.ts`, and its types are shared with the smoke
tests, so a call that is not there does not compile. A test sets a scene
with `pause`, `resume` and `seed`, plays it with `step(frames)`, and reads it
back with `state` (`t`, `frame`, `paused`), `events`, `invariants`,
`content` (the floor) and `save`. `mute`, `wake` (the first gesture) and
`sound` work the sound. `look` aims the camera, and `measureFrame` and
`bootMs` are the perf gate's. Unit tests get a game without a page from
`newGame(seed)` in `test/helpers.ts`, and `memoryStore` in `src/progress.ts`
stands in for a save. A new rule or kind of thing gains its reading here
before a test reaches into the game's insides.

Seen or measured, it is in headless Playwright (`start()` in
`smoke/game.ts`), never the in-app pane, which pauses when hidden. Time is
the API's, never a timeout. A test save goes in through `start(page, { save
})`, never over the player's.

## What is not held

Said so that a green `npm run check` is not read as more than it holds.

- **A phone, or any other GPU.** Every figure is this machine's, headless,
  at 1280×800. The rungs a slower machine steps down to have no gate;
  `look` has one viewport and no phone-width picture.
- **Moving pictures.** `look` is still scenes; motion is seen by a person.
- **Play.** With no player there is no fuzzer, no determinism check, no
  leak watch, no bench and no pace gate: see Gates for what brings each
  back.
- **Structure and dependencies.** Nothing reads the imports for coupling,
  and nothing audits what is pinned or its licence; `package-lock.json` and
  a person do.
- **Secrets, security headers, code scanning.** Nothing; the game holds no
  secret and has no server.
- **The commit message's shape.** Only a `pre-commit` hook, no `commit-msg`
  hook; `/commit` is what holds it.
- **Another browser.** Chromium only, on a real WebGPU.

## How a change lands

Commit only when asked, through `/commit`: a sentence summary in the house
voice, a body saying what changed and why, two commits when a refactor and
a feature land together. The pre-commit hook runs `check:quick`. The
remote is `github.com/onion2k/snappy`; there is no release notes file and
no tag yet.

- **Merge style:** a merge commit.
- **Where a change is made:** read from the remote each time, never
  assumed to be `main`.
- **An agent may, unasked:** nothing. Push, PR, merge and tag each wait for
  the user's word. No grant has been given.
- **Stale after:** 30 days.
- **Worktrees** under `.claude/worktrees` are sessions' own: a session
  leaves another's alone.

Merge style, what an agent may do and stale-after were settled by the user
on 2026-10-18. The headings Gates, Test API, What is not held and How a
change lands were written that day from the code, to the guardrails kit's
v0.8.0 list, on top of 1f8fe23.
