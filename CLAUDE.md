# Snappy: working on it

A game where the player explores an environment and takes pictures of
things. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics)
and the sound from [artshape-sound](https://github.com/onion2k/artshape-sound).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too. What is in `src/` is still the
template's stub, a sled shoving balls into a hole, until the first feature
replaces it; the model features below are the stub's until then.

## The factory

This repo is a line that turns ideas into a browser game that loads fast,
draws fast and has no bugs, one feature at a time, and it holds those three
properties as numbers from the first commit. Every change goes down the same
line: a spec agreed, tests written and seen failing, the change built, every
gate run, the result looked at, the report made with evidence, then a
commit. The line does not skip a station, and it stops when a gate is red:
a red gate is fixed before anything else lands, never skipped with
`--no-verify` and never made green by moving its baseline.

The three properties are bug free (`src/invariants.ts` and the fuzzer; every
bug found becomes a test, and a rule where it is one; the tests themselves
held by `mutate`), loads fast and draws fast (`perf`, `bench`, and a rung to
step down to when a feature cannot fit the budget). The same seed gives the
same game, so every failure can be played again.

## Gates

What each holds, and where its figure and its tolerance are kept. A figure
is not copied here; read it from its file.

| Gate          | Holds                                                 | Figure kept in                   | Tolerance, in                                            |
| ------------- | ----------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `perf`        | boot, the least of 24 frames, the gzipped download    | `smoke/perf-baseline.json`       | `smoke/judging.ts`                                       |
| `perf`        | the same, against the budget                          | `BUDGET` in `smoke/perf.spec.ts` | none: a budget is a limit                                |
| `bench`       | the physics' frame against the reference arithmetic   | `scripts/bench-baseline.json`    | `TOLERANCE`, `scripts/benching.ts`                       |
| `pace:check`  | the autopilot's minutes to bank ten balls             | `scripts/pace-baseline.json`     | `TOLERANCE`, `scripts/pace.ts`                           |
| `leaks`       | bodies, slots, save bytes, heap, over an hour of play | ceilings in `scripts/leaks.ts`   | the ceilings                                             |
| `look`        | the scenes, to the pixel                              | `smoke/screens/`                 | `TOLERANCE`, `smoke/look.spec.ts`                        |
| `mutate`      | surviving mutants, per logic file, held exactly       | `mutation-baseline.json`         | none; the score floor is `break` in `stryker.config.mjs` |
| `fuzz`        | `src/invariants.ts`, over seeds 1-12 by default       | none                             | none                                                     |
| `determinism` | the same seed played twice, hashed, seeds 1-6         | none                             | none                                                     |

A budget is what the game may cost at all; a baseline is what it cost at
the last commit, held both ways, so a step toward a budget is noticed as
much as a step over it. The perf tolerances are the measured wobble of a
headless boot and a GPU frame, and say so in `smoke/judging.ts`. The
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
    npm run check          all of it: check:quick, fuzz, determinism, leaks, pace, bench, mutate, smoke with perf and look (~25 s; ~80 s with no mutation report yet)
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random; -- --seed N plays one failure again
    npm run determinism | leaks | pace | bench | perf | look | smoke | mutate
                           each gate on its own, as in Gates; check runs leaks:check and
                           pace:check; mutate:judge -- src/a.ts judges one file

A unit test is allowed thirty seconds, and `vitest.config.ts` says why.

`--update` on `pace:check` or `bench`, `npm run perf:update`, `mutate:update`
and `look:update` write a baseline again. Only through `/gate-moved`, only
for a change meant to move it, and the commit says why. Look at every picture.
The bench writes its baseline from two readings, and only where they agree:
a baseline written while the machine is at other work fails every run after
it.

## How the code is laid out

- `src/game.ts` is the game without the picture: everything that happens in
  the arena, a step at a time. It tells what happened through `GameEvents`,
  and knows nothing of the renderer or the page.
- `src/main.ts` is the page. It turns those events into words on the screen
  and draws the frame. There is no game logic here.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold. `src/autopilot.ts` plays the game by
  itself, for the gates.
- Content (the floor, the hole, the balls) lives in `arena.ts`. The save
  lives in `progress.ts`. Chance comes from `random.ts`, handed in.
- `src/physics.ts` is the game's side of artshape-physics, and nothing else
  imports the package directly. A change a package needs goes in that repo,
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

- **In the arena:** the ball and the hole. The ball is a body kind in
  `arena.ts`, drawn by `scene.ts`, banked by `game.ts`, counted by
  `invariants.ts`, read by `debug.ts`, and pictured in `smoke/look.spec.ts`.
  These are the stub's, and the first feature to land replaces them with
  Snappy's own: a thing to be pictured, and the camera that pictures it.
- **Tools:** the fuzzer (`scripts/fuzzer.ts`), the pace gate
  (`scripts/pace.ts`), the bench (`scripts/bench.ts`, its arithmetic in
  `scripts/benching.ts`) and the mutation gate (`scripts/mutation-check.ts`,
  its judgement in `scripts/mutation-judge.ts`). Each has unit tests of its
  own working parts. The bench passed a frame made thirty times slower
  until it was made to fail one on purpose: a gate is trusted once it has
  been seen to fail what it is for.

## Replacing the stub

The stub gives way one feature at a time, through `/feature`, every gate
green at each step. `arena.ts` is the content and usually goes first; the
tile grid, the rock and the hole are the physics package's terms and can
stay. The ball is the one body kind: a new kind is a radius and a name in
the content, a mesh and a group in `scene.ts`, and a line in the invariants.
The sled is the player's machine and goes last, since the autopilot, the
fuzzer's `aim` and the smoke tests all drive it. When a thing a gate holds
goes, the gate is handed its replacement in the same change: a gate that
holds nothing is worse than none, because it looks like it does.

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
  be emptied somewhere, and its ceiling named in `scripts/leaks.ts`.
- **Loading is the first frame's business.** Everything the first frame
  needs is built before `ready`; everything else after it. A dependency is
  weighed against the download budget before it is added.
- **Every kind of thing is handled everywhere.** A new body kind, event,
  save field or scene has to work in every path it can reach.
- **Save compatibility.** A new save field needs a default in `progress.ts`
  and a save in the new shape in `test/saves/`; the corpus test fails until
  it is there. The save is `bank`, `banked`, `muted` (false) and `volume`
  (1, from 0 to 1; anything else loads as 1).
- **Match the style.** Comments are full sentences in the house voice,
  saying why and not what. Prettier decides the formatting.

## Definition of done

The house's nine points, in `~/.claude/CLAUDE.md`. Here, they mean: unit
tests in `test/`, a stage in `smoke/progress.spec.ts`, an action in
`scripts/fuzzer.ts` and a rule in `src/invariants.ts`, a size in
`scripts/leaks.ts` for anything kept, the perf figures before and after in
the report and within budget, `measureFrame` in any other scene touched, and
a picture in `smoke/look.spec.ts`. New tests mutation-checked by hand, and
the gate run over the files the change touched: `npx stryker run --force
--mutate src/a.ts,src/b.ts`, then `npm run mutate:judge -- src/a.ts
src/b.ts`. `npm run check` green, and `npm run fuzz -- --seeds 1-24` clean.

## Edge-case checklist

For anything new in the arena, check what it does:

- **the hole:** pushed down it
- **the sled:** shoved by it, driven over, pinned against the rock
- **save:** saved, reloaded, and loaded from an old save without the field
- **sound:** before the first gesture (no context made; a bank is logged and
  silent, nothing queued, no error; a mute made then is kept, and goes into
  the context when it is made; the API's `wake()` stands in for the gesture),
  paused (no music: the sound steps with the game and not with the page), muted (`m` or `mute()`, kept in the save; the voices
  still count), and a save without the fields, or with `muted` as a string
  or a volume out of range (the defaults)
- **rock:** against the wall and in the corners; never left in rock
- **scale:** many at once, at capacity (`BODY_CAPACITY`); and what it costs
  a frame at that many
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
with `pause`, `seed`, `teleport`, `place`, `deposit` and `drive`, plays it
with `step(frames)`, and reads it back with `state`, `bodies`, `events`,
`invariants`, `content` and `save`. `mute`, `volume` and `wake` (the first
gesture) work the sound. `measureFrame` and `bootMs` are
the perf gate's. Unit tests get a game without a page from `newGame(seed)` in
`test/helpers.ts`, and `memoryStore` in `src/progress.ts` stands in for a save. A new rule or kind of thing gains its reading here
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
