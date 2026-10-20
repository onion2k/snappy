# Spec: orbit the camera to look around

## Context

The chase camera always swings behind the rover's heading; the player can only zoom it (wheel, pinch). The user
wants orbit controls so the player can look around for which way to go. Agreed: the camera holds where the player
puts it while the rover is stopped, and once they drive for about a second it eases back behind the rover, so the
tank controls (A/D turn the rover itself) always match the view while driving.

## Where it stands now

- `src/camera.ts` `ChaseCamera`: `azimuth` follows `r.yaw` by a critically damped spring (`CHASE.swing` 3); tilt is
  `tiltAt(distance)` (49° at home, 54 near, 79.5 far); `zoomBy` eases the distance; `place` lifts the eye over ground
  and anything solid. `update` does nothing at `dt` 0.
- `src/main.ts`: the wheel and a two-finger pinch zoom; the touch stick (`touch.ts`) captures its own pointer; keys
  are W A S D and the arrows, M mutes.
- The camera's rules are in the invariants (`cameraProblems`), checked by the fuzzer and the test API.

## What

- **Mouse:** drag on the view (any button) orbits: sideways turns round the rover, up and down tilts between about
  30° and 80° from straight down (never under the ground: `place` still lifts it).
- **Keys:** Q and E turn the view round the rover (the arrows and W A S D stay driving).
- **Touch:** one finger dragged on the view, outside the stick, orbits; two fingers still pinch to zoom.
- **Recentre:** the view holds its offset while the rover is still or barely moving; after about a second of driving
  (speed over a quarter of top speed) it eases back behind the heading at the swing's rate, tilt back to the zoom's.
- The HUD help: "drag or Q/E to look around".

## Acceptance

1. `orbitBy(turn, tilt)` turns the camera round the rover by `turn` radians and tilts it by `tilt`, the tilt held
   within its ends; the eye stays over the ground and out of anything built (the camera invariants) at every
   azimuth and tilt.
2. Stopped, the orbit holds: after any number of frames the camera stays where it was put.
3. Driving, it comes back: after about a second over the threshold it eases back behind the heading and to the
   zoom's tilt, settling within three seconds; a short tap of throttle does not recentre it.
4. Input: a mouse drag, Q/E and a one-finger drag outside the stick each orbit; the stick and a pinch do not; keys
   are released on blur. The test API gains `orbit(turn, tilt)` and `camera()` reports `azimuth` and `tilt`.
5. Nothing allocated per frame (alloc test); the fuzzer gains an orbit action and stays clean on seeds 1-24.
6. A look picture of the view turned round to face the rover (its eye toward the camera); frame and download within
   tolerance, the change reported.

## Edge cases (CLAUDE.md checklist)

- **the camera:** orbited behind a cottage or a cliff (lifted over it, never inside), at full zoom (the sky still
  shows tilted up), at near zoom, orbited past straight down (clamped), orbited while the rover reverses (recentres
  the same way).
- **phone:** one finger orbits, two pinch, the stick unaffected.
- **paused:** a test's step at `dt` 0 changes nothing; orbiting while paused is not reachable in play.
- **the shutter, the album, save, sound:** not reachable (no save field; the orbit is not kept).

## Decisions

- Recentre after a second of driving (agreed).
- Q and E for keys (recommended; free of driving keys).
- Tilt range 30° to 80° from straight down (recommended: lower than 30 looks into the trees, higher than 80 is mostly
  sky).

## Performance

None measurable: a few sums a frame in the camera. Download grows by the code.

## Test plan

- `test/camera.test.ts`: orbit turns and clamps; holds when stopped; recentres after a second driving, not after a
  tap; never in the ground or a roof at any orbit on the fixture (cottage, cliff); allocation-free.
- `test/input.test.ts`: Q/E map to a turn, blur releases them, the drive mapping unchanged.
- A small pure `Orbit drag` helper (pixels to radians) tested on its own.
- `smoke/game.spec.ts`: a mouse drag on the view changes `camera().azimuth`; a one-finger drag on a phone does too,
  the stick still drives.
- `scripts/fuzzer.ts`: an `orbit` action; `smoke/look.spec.ts` + `views.ts`: a `look` scene turned to face the rover.

## Verification

`npx vitest run test/camera.test.ts test/input.test.ts test/alloc.test.ts`; `npm run check` (within 5 min); `npm run
fuzz -- --seeds 1-24`; the new picture read and written through `/gate-moved`; perf held.
