# Spike: one hill, one duck, both renderers

Step 0 of `docs/plan.md`. Written 2026-10-19 against artshape-render v0.45.0
(as pinned in `package.json`). A spike answers questions with numbers and is
then thrown away: none of its code lands on `main`. What lands is
`docs/spike-findings.md`, its pictures, and a change to the plan where the
numbers say so.

## What it has to settle

Each question has a figure, and a line it is judged against that is fixed now,
before the figure is known, so the answer is not argued for after the fact.

### Risk 1: the photo and the drive do not match

The game renderer (`game/`) and the still-life renderer (`render/`) share
geometry and no shading. The same hill and duck, from the same camera, are
drawn by each.

- **Measured:** the mean colour of four regions (the sky, the hill in sun, the
  hill in shade, the duck), each in CIELAB, and ΔE between the two pictures for
  each region; the sun's direction from the shadows (does the still-life key
  light land where the game's sun does?).
- **Passes if** every region is within ΔE 10 after an afternoon of tuning the
  still-life side's environment, key light and exposure (never the game's:
  the drive is the reference the player has seen). Over 10 in any region, the
  plan changes: the viewfinder shows the still-life raster and not the game's.
- **Seen by a person too:** the two pictures side by side go in the findings,
  and the user says whether they read as the same place.

### Risk 2: the tracer in a landscape

The still-life path was made for one piece on a table. It is handed a
landscape.

- **Measured,** in headless Chromium at 1280×800 on this machine, three times
  each, the median kept:
  - the BVH build, in milliseconds, for the hill and duck alone, then with 200
    and 1000 lowpoly trees from `parts/lowpoly.ts` beside them (about 40 k and
    200 k triangles);
  - milliseconds a traced sample at each size;
  - the samples a picture needs before it reads clean (a person judges from a
    strip of 1, 4, 16, 64 and 256 samples, and the findings say which);
  - the download the first traced frame fetches (`tracer` and `bvh` chunks,
    gzipped).
- **Passes if** at 1000 trees the BVH builds in under 1.5 s and the clean
  count of samples fits in 3 s. If not, the findings say which of the plan's
  fallbacks it is: traced near the subject only, fewer trees in the picture,
  or a smaller picture.

### Risk 3: traced pictures held to the pixel

`look` holds scenes to the pixel. The tracer is seeded (`seed` and the sample
index go into its `pcg`).

- **Measured:** the same scene traced to 64 samples five times in five fresh
  pages, and the count of pixels that differ, and by how much, between each
  pair. Then the same across a reload of the browser.
- **Passes if** all five are identical. If they differ only by a little (no
  channel by more than 2 of 255), `look` can hold them with a tolerance and
  the findings name it. Past that, `look` holds the raster development and the
  trace is held by its mean and its noise, and _What is not held_ says so.

### What it will meet on the way, and must note, not fix

Read from the code before writing this, and expected to bite:

- **There is no table-less scene.** `TableName` is a list of tables; nothing
  turns the table off. The spike tries the plainest table (`matte`) sunk under
  the hill, and notes whether it shows or shades anything.
- **There is no coloured plastic.** The plastics are white, black and grey; a
  yellow duck has no material. The spike tries enamel (`amber`) on a white
  plastic duck, and notes what the honest answer is. Both of these, if the
  answer is a change, are changes to artshape-render, in that repo, with a
  version bump here: the spike says what they are, and does not make them.
- **No sky to suit a field.** The presets are `studio`, `dusk`, `gallery` and
  `daylight`, and `setEnvironmentImage` takes an HDRI. The spike uses
  `daylight` and notes whether it reads as outdoors.
- **The ground has no material.** Grass and earth are diffuse colours; the
  still-life's nearest is a matte finish on a plastic. Noted, as the duck.

## The scene

- A hill: a terrain of 32×32 tiles from artshape-physics, one raised mound,
  meshed from `heightAt` at four vertices a tile, coloured as grass.
- A duck: a revolve of a silhouette for the body and a second for the head,
  about a unit tall, sitting on the hill's shoulder. Ugly is fine.
- The sun at 35° up, from the camera's left. The game side as the template
  lights it (`bakeEnvironment`, the sun, the light pool empty); the still-life
  side with `setEnvironment('daylight')` and `setKeyLight` pointed the same
  way.
- One camera: 6 units from the duck, 1.5 up, a 50 mm lens on a 36 mm sensor;
  for the tracer, `aperture` for f/2.8 and `focus` on the duck.
- Trees for risk 2 only, placed by a seeded `random.ts`, never touching the
  duck.

## How it is run

- In a worktree of its own (`.claude/worktrees/spike`), cut from the first
  commit after the stub is taken out; until there is one, in a directory of
  its own outside the repo with the same `package.json` pins. Never in this
  checkout, where the stub's removal is going on.
- A page of its own (`spike.html`, `src/spike.ts`) that builds the scene,
  draws it whichever way a query string says, and puts its figures on
  `window.spike`. No `Game`, no physics world stepped, no sound.
- A Playwright spec (`smoke/spike.spec.ts`) that opens the page for each
  case, reads the figures and saves the pictures. Headless, with the
  project's Playwright setup, never the in-app pane. Time is the page's
  own counters (GPU timestamps where the renderer gives them, else
  `performance.now()` about an `onSubmittedWorkDone`), never a timeout.
- The machine is quiet while it runs; each figure is the median of three.

## What it hands back

`docs/spike-findings.md`:

- For each risk: the figures, the line, passed or not, and what the plan does
  about it.
- The pictures, in `docs/spike/`: the two renderers side by side, the sample
  strip, the tree counts.
- What artshape-render would need (a table turned off, a coloured plastic, a
  sky), each as a sentence a spec in that repo can start from.
- The changes to `docs/plan.md` it calls for, made in the same change as the
  findings.

## Out of scope

Driving, the rover, the viewfinder, the score, the album, input, sound, the
gates. No change to artshape-render or artshape-physics. No tuning of the game
renderer's look. Nothing in `src/` on `main`.

## Done when

All three risks have a figure and a verdict against the line above, the user
has looked at the side-by-side and said whether it reads as one place, the
findings and the plan's changes are written, and the worktree is deleted.
