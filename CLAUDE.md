# Snappy: working on it

A game where the player explores an environment and takes pictures of
things. TypeScript, Vite, and WebGPU through
[artshape-render](https://github.com/onion2k/artshape-render), with the
physics from [artshape-physics](https://github.com/onion2k/artshape-physics)
and the sound from [artshape-sound](https://github.com/onion2k/artshape-sound).
The README says what the game is; this file says how it is made. The house
rules in `~/.claude/CLAUDE.md` apply too. What is in `src/` now is the world
and the player: a landscape about 190 m across in golf's toon daylight (a
river with fords, a lake, a village, ruins, five biomes), and a six-wheeled
rover driven about it in third person (features 1 and 2 of `docs/plan.md`,
specified in `docs/specs/landscape-rover.md`). Nothing is pictured yet: the
camera, the shutter and the album are the next features.

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
held by `mutate`), loads fast and draws fast (`perf`, and a rung to step
down to when a feature cannot fit the budget: `FrameRung` in `src/view.ts`). The same seed gives the
same game, so every failure can be played again.

## Gates

What each holds, and where its figure and its tolerance are kept. A figure
is not copied here; read it from its file.

| Gate          | Holds                                                                          | Figure kept in                   | Tolerance, in                                            |
| ------------- | ------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------- |
| `perf`        | boot, the least of 24 frames, the gzipped download, a driven run's worst frame | `smoke/perf-baseline.json`       | `smoke/judging.ts`                                       |
| `perf`        | the same, against the budget                                                   | `BUDGET` in `smoke/perf.spec.ts` | none: a budget is a limit                                |
| `pace:check`  | the autopilot's seconds to cross the world west to east                        | `scripts/pace-baseline.json`     | `TOLERANCE`, `scripts/pace.ts`; and the spec's 60-150 s  |
| `look`        | the scenes, to the pixel                                                       | `smoke/screens/`                 | `TOLERANCE`, `smoke/look.spec.ts`                        |
| `mutate`      | surviving mutants, per logic file, held exactly                                | `mutation-baseline.json`         | none; the score floor is `break` in `stryker.config.mjs` |
| `fuzz`        | `src/invariants.ts` and the camera's rules, over seeds 1-12 by default         | none                             | none                                                     |
| `determinism` | the same seed driven twice by the autopilot, hashed, seeds 1-6                 | none                             | none                                                     |

The world is held by its own unit tests in `test/world*.test.ts`: its hash
pinned, every tile the rover fits on reached from the start, the banks each
with a way round, the fords on roads. Two of the template's gates are not
back yet, since there is nothing for them to hold: **`bench`** comes with
the first bodies in the physics world, and **`leaks`** with the first thing
kept, most likely the album of pictures taken. The tracks are a fixed pool,
held by an invariant.

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
none of them is unit-tested, and so are the world's generator and the
models' meshes (see What is not held).

## Commands

    npm run dev            the game at http://localhost:5206
    npm run check:quick    formatting, types, lint, unit tests (the pre-commit hook; ~10 s)
    npm run check          all of it (~3 min): check:quick, fuzz, determinism, pace:check, mutate,
                           smoke with perf and look
    npm test               unit tests (Vitest, test/)
    npm run fuzz           the game played at random; -- --seed N plays one failure again
    npm run determinism | pace | perf | look | smoke | mutate
                           each gate on its own, as in Gates; mutate:judge -- src/a.ts
                           judges one file
    npm run map            the world from above, to reports/map.png
    npm run shots          every view, game and model, to reports/shots/, with frame costs

A unit test is allowed thirty seconds, and `vitest.config.ts` says why.

`npm run perf:update`, `pace:check -- --update`, `mutate:update` and `look:update` write a baseline
again. Only through `/gate-moved`, only for a change meant to move it, and
the commit says why. Look at every picture. A baseline written while the
machine is at other work fails every run after it.

## How the code is laid out

- `src/game.ts` is the game without the picture: the world, the rover and
  its tracks, the clock, a step at a time, driven by a `Drive`. It knows
  nothing of the renderer or the page. Nothing happens in it yet that it
  tells of; the first thing that does (a picture taken) adds `GameEvents`.
- `src/world/` is the world, made once from content and the same every
  game: `types.ts` is the contract every other module reads it by
  (`WorldMap`, `Ground`, `DRIVE`, the kinds), `drive.ts` the one rule of
  where the rover can go, `ground.ts` the ground read off a map,
  `generate.ts` the world itself from the hand-laid `layout.ts`, and
  `graph.ts` the drive graph, reachability and routes. `fixture.ts` is a
  small world made by hand for the tests.
- `src/rover.ts` is the rover (skid steer, rocker-bogie, its head),
  `src/tracks.ts` its tracks, `src/camera.ts` the chase camera,
  `src/autopilot.ts` a driver along a route for the gates, `src/input.ts`
  and `src/touch.ts` the keys and the thumb stick: all logic, handed a
  `Ground`, and none of it drawn.
- `src/main.ts` is the page: input, the camera, the frame. There is no game
  logic here. `src/scene.ts` is what is drawn, a chunk at a time round the
  camera, from the models in `src/models/`; `src/view.ts` is its testable
  logic (which chunks at what detail, what is cut out of the sight line,
  the rung). `preview.html` and `src/preview.ts` are a page for working on
  the models, never part of the game.
- `src/debug.ts` is `window.game`, the test API. `src/invariants.ts` lists
  the rules that must always hold.
- The save lives in `progress.ts`. Chance comes from `random.ts`, handed in.
- `src/look.ts` is the whole look, golf's toon daylight, set on the renderer
  by `daylight()`; `src/sun.ts` is where the sun is.
- `src/physics.ts` is the game's side of artshape-physics, and nothing else
  imports the package directly. Its world holds the map's ground, and no
  bodies yet. A change a package needs goes in that repo, with a version
  bump here.
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
  2026-10-19, at artshape-render 0.45.0). Colours are tuned against it in
  `src/models/palette.ts`.
- **A thing in the world:** a kind in `KINDS` (`world/types.ts`), placed by
  the world (`world/scatter.ts`, `built.ts`, `finds.ts`), solid by its
  footprint (`BUILT`) or an obstacle circle, modelled in `src/models/kit.ts`
  with a triangle ceiling in a test, drawn through the scene's chunk pools,
  cut from the sight line by `view.ts`, and pictured in `smoke/views.ts`.
- **The player:** the rover, in `rover.ts`, tested on the fixture world,
  held by `misplaced()` in the invariants, driven by the fuzzer, posed by
  `models/rover.ts`, and read by `debug.ts`'s `rover()`.
- **Tools:** the fuzzer (`scripts/fuzzer.ts`), the pace gate
  (`scripts/pace.ts`), the determinism check (`scripts/determinism.ts`) and
  the mutation gate (`scripts/mutation-check.ts`), each with unit tests of
  its own working parts, and the perf gate (`smoke/perf.spec.ts`, judged in
  `smoke/judging.ts`). A gate is trusted once it has been seen to fail
  what it is for.

## What the renderer cannot do yet

artshape-render 0.45 has no fade or alpha per placement, no outline or rim
light per group, and no shadow softness per group. So a tree cut from the
camera's sight line is swapped for a low variant rather than faded, and its
crown's shadow goes with it. A change for any of these goes in that repo,
with a version bump here.

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
  be emptied somewhere, and its ceiling named: a fixed pool (the tracks, the
  scene's chunk pools) or, from the first thing kept, `scripts/leaks.ts`.
- **One rule for where the rover goes.** `world/drive.ts` decides for the
  rover, the drive graph and the tests alike; a world is only proven
  reachable by the rule the rover moves by.
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
`src/invariants.ts` and an action in `scripts/fuzzer.ts`; a fixed pool or a
size in `scripts/leaks.ts` for anything kept (the first thing kept brings
the leaks gate back); the perf figures before and after in the report and
within budget, `measureFrame` in any other scene touched, and a picture in
`smoke/look.spec.ts` (its views in `smoke/views.ts`). New tests mutation-checked by hand, and
the gate run over the files the change touched: `npx stryker run --force
--mutate src/a.ts,src/b.ts`, then `npm run mutate:judge -- src/a.ts
src/b.ts`. `npm run check` green, and `npm run fuzz -- --seeds 1-24` clean.

## Edge-case checklist

For anything new in the world, check what it does:

- **save:** saved, reloaded, and loaded from an old save without the field
- **sound:** before the first gesture (no context made; nothing queued, no error; a mute made then is kept, and goes into
  the context when it is made; the API's `wake()` stands in for the gesture),
  paused (no music: the sound steps with the game and not with the page), muted (`m` or `mute()`, kept in the save; the voices
  still count), and a save without the fields, or with `muted` as a string
  or a volume out of range (the defaults)
- **the rover:** driven into it, along it, round it, turning on the spot
  beside it; it is a wall, an obstacle, or passable, and never stood in
- **rock and banks:** against the wall and in the corners; a slope too steep
  both ways; never left in rock
- **water:** in the shallows (slowed, no tracks) and at the deep's edge (a
  wall); half a body in deep water
- **the sight line:** between the camera and the rover (cut away, and back
  when it is past), and the camera never inside it
- **scale:** many at once, at a chunk pool's capacity; and what it costs a
  frame at that many, in the toon look, and at a chunk crossing
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
with `pause`, `resume`, `seed`, `teleport`, `drive` and `release`, plays it
with `step(frames)`, and reads it back with `state` (`t`, `frame`,
`paused`), `rover`, `camera`, `ground(x, y)`, `events`, `invariants` (the
camera's rules among them), `content` (the bounds, the start, the
landmarks) and `save`. `zoom` and `orbit` work the chase camera as the
wheel, a drag and Q and E do (`camera()` reads its azimuth, tilt and how far
it is turned), and `look` aims it by hand. `mute`, `wake` (the first gesture) and `sound` work the sound, and
`measureFrame` and `bootMs` are the perf gate's. Unit tests get a game without a page from
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
  at 1280×800. The rungs a slower machine steps down to (`FrameRung`) have
  unit tests and no picture or gate; `look` has one viewport and no
  phone-width picture.
- **Memory.** Nothing holds what the game keeps on the GPU. Every chunk's
  ground at every level is built at boot and switched by count, so a chunk
  crossing uploads nothing (2026-10-20: the driven run's worst frame 7.7 to
  about 3.2 ms, boot about 200 ms longer); that is some 2.4 million
  vertices, on the order of 70 MB, which a phone may not have.
- **Moving pictures.** `look` is still scenes; motion is seen by a person.
- **The world's generator and the mesh builders, by mutation.** `mutate`
  leaves out `src/world/` (but for the drive rule and the ground) and
  `src/models/` (but for the clouds' motion): a full run over them was on
  course for two days (2026-10-20). They are held by their own tests, the
  fuzzer, determinism and the pictures, not by their mutants.
- **Play, in part.** The fuzzer, determinism and pace hold the rover and
  the world; nothing holds a bench of the physics (no bodies) or a leak
  watch (nothing kept), and nothing judges whether the world is fun.
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
