# Spec: the landscape and the rover (features 1 and 2 of docs/plan.md)

## Context

Snappy is a plain arena since the demo went (a341872): a 7 m walled floor, three
sample shapes, an orbit camera, no player. The user wants the world and the
player next, ahead of the spike: a large, high-quality toon landscape in
golf's look, and a cute six-wheeled rover driven about it in third person. It
is to be built by several Opus 5.5 agents, with a reviewer checking each one's
work over a few rounds, aiming at quality. The spike (step 0) waits; nothing
here depends on it, since the drive is drawn by the game renderer only.

On copying this spec to `docs/specs/landscape-rover.md` when building starts,
its Parts list is the live record of where the work stands.

## What

- **The world** is about 200 m across (2,000 units; one unit is 10 cm, as
  `MM_PER_UNIT = 100` already says). It is one hand-laid layout with seeded
  noise for the detail: the same layout every game, so it can be polished.
  - A river runs across it. It is deep in its channel, and shallow at fords
    and along its edges.
  - There is a lake, and ponds.
  - Hills have banks too steep to climb, and the higher ground has stepped
    ledges and outcrops.
  - Dirt roads join a village to the places worth finding. Each road crosses
    the river at a ford.
  - The edge of the world is mountains and deep water, with golf-style
    backdrop hills past them. There is no invisible wall.
- **Biomes** are told apart by tree kind and colour:
  - **Meadow:** round broadleaf in fresh green, flowers in the grass.
  - **Pine wood:** dark conifers, ferns, boulders.
  - **Autumn wood:** broadleaf in orange, red and gold.
  - **Heath:** sparse twisted trees, purple-tinged ground, many boulders.
  - **Wetland:** bushes and reeds along the river and the lake.

  Borders between biomes blend over a few tens of metres.

- **Built things** are cut from the renderer's lowpoly solids (`prism`, `block`,
  `slab`, `rod`, `dome`). In the village there are cottages with pitched
  roofs, a well, fences and a little church tower. The ruins are broken walls, a
  tower stump, an arch and a fallen column on hilltops and in the woods.
  Buildings are solid to the rover.
- **Sky:** golf's gradient, with faceted cloud meshes drifting on the wind by
  game time. The clouds' shadows cross the land, which is what a top-down view
  sees most. Zoomed out and tilted up, the horizon and the clouds show.
- **Water** is a plain blue water table at one level, in golf's `FLOW_WATER`
  ocean look. It is drawn in two parts, so the player can see which is which:
  - **Shallow** (no deeper than 1.2 units, 12 cm): a lighter, plain colour.
    The rover crosses it, slowed.
  - **Deep:** the ocean pattern. It is a wall to the rover.
- **The rover** is like a simplified Curiosity, made cute: 5 units (50 cm) long.
  - Six wheels on rocker-bogie arms that follow the ground, each wheel turning
    as it rolls.
  - A white and orange body, a mast with a big two-eyed camera head, an
    antenna, and the power unit at the back.
  - It leaves two tracks on dirt, sand, mud and grass (grass is also trampled).
    There are no tracks on stone, rock or water. Tracks fade with time.
- **Driving:** W A S D or the arrows. W and S drive, A and D turn on the
  spot (skid steer).
  - **On a phone:** a thumb stick, bottom left, with the same mapping (up is
    forward, sideways turns).
  - **Speeds:** 25 u/s (2.5 m/s) on road, 20 on grass, 12 in mud, sand and
    shallow water.
  - **What stops it:** it climbs slopes up to 22°. A steeper bank, a ledge
    taller than 1 unit, rock, a building or deep water stops it (it slides
    along, it is not stuck).
- **The camera** is a chase camera above and behind, tilted 62° from
  straight down, 12 m back. It shows roughly 15 m of land around the rover.
  It swings slowly behind the rover's heading. The wheel or a pinch zooms from
  4 m to 50 m. It was lowered from about 50° on 2026-10-21 so the player sees
  the way ahead; the player's own tilt is kept while driving, and their turn
  comes back behind the rover.

## Where it stands now

- **No rover, so no crossing time to measure.** Instead, the size is set from the speeds: 2,000 units at 20 u/s is 100 s
  straight; by road and ford, about 110-130 s.
- **Boot:** 119 ms. **Frame:** 0.656 ms against an 8 ms budget. **Download:**
  113,256 bytes against 400 KB (`smoke/perf-baseline.json`).
- **Golf, for comparison:** a 560-yard hole's worst view costs 3.9 ms a frame,
  at about 184k ground triangles and 200k triangles of woods.
- **The renderer has no culling.** Every placement is drawn three times (scene,
  sun map, occlusion). A whole 200 m world of trees would be several million
  triangles.

## Acceptance criteria

1. **The world is generated from content.** It is the same, to the byte, on
   every run and every seed. `worldHash()` holds this in a unit test.
2. **Every place is reachable.** Every tile the rover can stand on is reachable
   from the start along the drive graph, with symmetric edges, so a bank is a
   wall both ways and nothing traps the rover. Every landmark (village,
   each ruin) can be reached by the drive graph.
3. **Unclimbable banks have a way round.** At least six banks or ledges the
   rover cannot climb, each with another route to the top (a test names
   them).
4. **The river has fords.** Deep water blocks the rover. Shallow water is
   crossed, at reduced speed. The river has at least two fords, and a road
   uses each.
5. **Crossing takes 60-150 s.** The autopilot's path from the west edge to the
   east edge takes that long in game time (the pace gate, which returns).
6. **The rover never ends up anywhere it shouldn't.** Over the fuzzer's
   seeds, it is never in rock, in a building, in deep water, below the ground,
   or off the world. Its wheels sit within their travel of the ground.
7. **Tracks.** Two tracks are laid on soft ground and none on stone or in
   water. The tracks are a fixed pool (capacity named in the code), the oldest
   reused, so they never grow.
8. **Input.** The keys and the touch stick drive it, and the test API's
   `drive` overrides both. Keys are released on blur.
9. **The camera never clips into the ground** or a building. When something
   stands between it and the rover, it rises.
10. **Biomes show.** Each of the five biomes is pictured in `look`, along with
    the village, a ruin, a ford and the rover close up. Each picture is read and
    agreed by the user before its baseline is written.
11. **It is within budget.** The worst frame over the pictured views is under
    the 8 ms budget (aiming at golf's 4 ms). Boot stays under its 3 s budget,
    and the download stays under 400 KB. Each figure is reported before and
    after.
12. **Determinism.** The same seed, driven the same way, gives the same hash.
    The `determinism` gate returns.

## Edge cases (CLAUDE.md checklist)

- **The hole:** not reachable. There is no hole now.
- **Rock and buildings:**
  - **Against a wall:** the rover slides along it.
  - **In a corner:** it stops, and can turn out.
  - **Teleported into rock:** pushed to the nearest standable tile.
  - **Never left in rock:** an invariant.
- **Slopes:** the rover tilts with the ground.
  - **Too steep:** blocked, both ways.
  - **Along a ridge:** its wheels each find their own ground.
  - **Over a ledge's edge:** a ledge is a wall, so it does not drive off.
- **Water:**
  - **Shallow:** slowed, with no tracks. Splash particles are a stretch goal.
  - **Deep:** a wall.
  - **The rover's side half in deep water:** blocked by the wheel nearest it.
- **Save:** no new field. The rover starts in the village each load, and the old
  saves load unchanged.
- **Sound:** none added. The motors' sound is a later feature. Before the
  first gesture, paused and muted are all unchanged.
- **Scale:**
  - **Trees:** about 6-9k placements, drawn through a pool of the nearest few
    thousand (see Performance).
  - **Tracks:** the pool at capacity, held by an invariant and a unit test.
- **Phone:**
  - **Narrow screen:** the touch stick appears and the HUD fits.
  - **Slower GPU:** steps down a rung: the drawn radius first, then grass
    density, then shadows on far trees.
- **Paused:** no drive and no clouds move. The camera holds.
- **The camera, the shutter, the album:** not reachable yet.
- **Exploring:** held by criteria 2 and 3.

## Decisions (recommendations; agreeing the spec agrees these)

- **One authored layout**, with seeded detail, rather than a new world per
  seed. It can be polished and pictured, and the reviewers can name places.
  The cost: no variety per game, which a later feature can add.
- **Tank controls**, with the camera swinging behind the rover. The touch stick
  uses the same mapping, so one control scheme is tested. The alternative,
  camera-relative steering, is friendlier on touch but means two schemes.
- **Size about 200 m.** Bigger costs boot time and frame time roughly as its
  area. The world is a constant that can be moved after the first numbers.
- **The rover's start: the village square.**

## Performance risk, and how it is measured

- **The terrain** is a tile of 6 units (0.6 m), so 333 × 333 tiles. The
  physics' neighbour rule allows 3 units of rise per tile, a 1 in 2 slope
  (26°). The terrain is meshed at one vertex per 2 units near the rover and
  coarser far off: the world is cut into 32 × 32-tile chunks, and each chunk
  has two levels of detail chosen by distance.
- **Scenery** is chunked too. Static groups hold nothing far off. A fixed
  dynamic pool of the nearest chunks' placements is rewritten with `move` when
  the camera crosses a chunk border, so it costs nothing per frame between
  crossings. Far trees use `farTree` (16 triangles) with `shadow:false`
  and `occlusion:false`.
- **The physics world** holds the terrain, the steps, the rock and the
  surfaces, but no bodies. The hash cell is raised so the per-step `head`
  copy stays small.
- **Boot:** generation is timed by a unit test. If it is over 400 ms, it is
  moved behind `ready` for far chunks only.
- **Measured:**
  - `perf`, at the pictured views: the worst, the village, and zoomed out.
  - `measureFrame` at each look view.
  - A frame at capacity: the full tracks pool, every pool full.
  - The perf baseline rewritten through `/gate-moved`, with the reason.

## Test plan

- **Unit tests** (`test/`):
  - **World:** generation is deterministic (hash), the neighbour rule holds
    (the World constructs), reachability, the banks and their way round, fords
    on roads, landmarks reachable, the biome blend, and placements never in
    water, on roads or in buildings.
  - **Rover kinematics:** speeds per surface, slope limit both ways, sliding
    along a wall, deep water blocks, the wheels fitted to ground, and turning on
    the spot.
  - **The rest:** the tracks ring at capacity, the input mapping, the touch
    stick's dead zone, the camera rig not clipping, and the chunk pool choosing
    the nearest.
- **Smoke:**
  - **`progress.spec.ts`:** drive forward through a ford and up a road, and
    read back the position, the surface and the invariants.
  - **`game.spec.ts`:** the phone viewport shows the stick, and a drag on it
    moves the rover.
- **Fuzzer** returns (`scripts/fuzzer.ts`, from the template):
  - **Actions:** drive with random throttle and steer for random lengths;
    teleport to a random standable tile; zoom.
  - **Invariants:** criterion 6, the tracks pool size, and the camera above the
    ground.
  - `npm run fuzz -- --seeds 1-24` clean.
- **Gates that return:**
  - **`determinism`:** seeds 1-6.
  - **`pace`:** the autopilot crossing west to east, A* on the drive graph,
    criterion 5.
  - `bench` stays out, with no bodies. `leaks` returns with the album, as
    CLAUDE.md says, since tracks are a fixed pool.
- **Pictures** (`smoke/look.spec.ts`): rover close up, village, a ruin, a
  ford, deep lake shore, and one view each of meadow, pine, autumn, heath and
  wetland. Plus one zoomed out with sky and clouds.
- **Mutation:** every new logic file is added to `stryker.config.mjs`, then
  `mutate:judge` is run on the touched files.

## How it is built: the agents

All are Opus 5.5 at the user's word (the house default is Sonnet for building;
the user overrides it). Each builder works in its own worktree, owns its own
files, and builds test-first. I (this session) write the shared contracts
first, merge, wire and run the gates.

1. **Contracts** (me, before any agent): `src/world/types.ts` holds `WorldMap`
   (the grid, the terrain heights, the steps, the solid, the surface, the
   biome per tile, the water level, roads, placements and landmarks) and
   `Ground` (`heightAt`, `slopeAt`, `surfaceAt`, `waterDepthAt`, `blocked`).
   It also holds a small fixture world for the others to test against.
2. **In parallel, three builders:**
   - **World:** `src/world/*`, the layout, the noise, the river and water,
     roads, the village and ruin sites, biomes, placements, the drive graph,
     reachability and A*. Logic only, with all its tests.
   - **Rover:** `src/rover.ts` (kinematics, collision against `Ground`,
     rocker-bogie wheel fit), `src/tracks.ts`, `src/input.ts` (keys and the
     touch stick), and `src/camera.ts` (the chase rig). Logic, with tests,
     against the fixture.
   - **Models and look:** `src/models/*`, the rover mesh with its articulated
     parts, trees and bushes per biome palette, the building and ruin kit,
     clouds, the terrain chunk mesher, the water mesh (shallow and deep), and
     the backdrop. The sky and cloud setup go in `look.ts`. A
     `npm run shots` tool (Playwright, headless) saves the review views to
     `reports/shots/`.
3. **Integration** (me): merge the three, then wire `game.ts`, `main.ts`,
   `scene.ts` (the chunk pools) and `debug.ts` (`drive`, `release`, `teleport`,
   `rover()`, `world()`, `surfaceAt`). Bring back the fuzzer, determinism and
   pace, and write the smoke stages.
4. **Review rounds, three:** a fresh Opus reviewer each round, read-only.
   - **What it gets:** the shots (every view, plus a 12-frame drive strip),
     the perf figures and the diff.
   - **What it returns:** a ranked list on the look (composition, palette,
     scale, the rover's charm), the feel, the code against CLAUDE.md, and the
     gates.
   - **Then:** I give each item to the builder that owns it (resumed, so it
     keeps its context), merge, and shoot again.
   - **Stopping:** after three rounds, or sooner when a round finds nothing
     above minor.
5. **The final pass:** all of phase 4 of `/feature` once. That is
   `npm run check`, fuzz 1-24, the mutation check by hand, perf before and after,
   the pictures read, and the user agreeing them before the baselines are
   written.

## Parts

- [x] Contracts and fixture world. Proven by: typecheck, and a fixture test.
- [x] World generation. Proven by: the world unit tests (criteria 1-4).
- [x] Rover, tracks, input, camera logic. Proven by: their unit tests (6-9).
- [x] Models, look, shots tool. Proven by: shots read, model triangle ceilings
      in tests.
- [x] Integration, test API, smoke stages. Proven by: `check:quick`, `smoke`.
- [x] Fuzzer, determinism and pace back. Proven by: fuzz 1-24, `determinism`,
      `pace:check` (criteria 5, 12).
- [x] Review round 1, and fixes.
- [x] Review round 2, and fixes.
- [x] Review round 3, and fixes.
- [x] Perf and look. Proven by: `perf` under budget, pictures agreed, baselines
      written through `/gate-moved` (criteria 10, 11).
- [x] CLAUDE.md. Proven by: the model features, edge cases, test API and gates
      updated for the rover and world.

## Verification

`npm run check` green; `npm run fuzz -- --seeds 1-24` clean; `npm run
determinism`; `npm run pace:check`; `npm run perf` with the before figures
from `3e0287c` in a worktree; `npm run shots`, with every picture read; the
mutation run on the new files. Nothing is committed until asked.

## Where it ended (2026-10-20)

Built by three Opus builders (world, rover, models and look) over the
contracts, then three review rounds by a fresh Opus reviewer each, every
finding given to its owner. Reviews are in `reports/review-*.md` (not kept in
git). What the renderer cannot do (fade, outline or soften one group) is said
in CLAUDE.md; the look gate allows 24 pixels for the grass pass's own drift.
Follow-ups the last review named: the renderer's grass in a fixed order (then
the look tolerance back to nought), soft smudges on the heath ground and at
road edges, hard shadow shapes on the water, a white strip of edge-on clouds
on the far horizon, the backdrop's snow and banding, splash particles, the
motors' sound.
