/**
 * The chase camera: above and behind the rover, twelve metres back and
 * looking down at it about forty-nine degrees from straight down, high
 * enough at home to be well over the trees' crowns and far enough out to
 * see the lie of the land round it, swinging round behind its heading slowly enough that a
 * turn is seen and not cut to, and looking ahead the way it goes, so the
 * rover sits below the middle of the screen with the way ahead above it.
 * The wheel or a pinch brings it in or takes it out; right out, it tilts up
 * far enough for the horizon and the clouds.
 *
 * It never puts its line to the rover into the ground: the ground is looked
 * at along the line, and where a hill or a terrace would cut it the camera
 * swings up over it at once. Something built or rock behind the rover, as
 * tall as the ground's `topAt` says, lifts it too, easing up quickly and
 * back down slowly so it does not bob as the rover passes a wall. And the
 * eye itself is never inside anything: wherever it would be, it is put
 * above the top of what stands there.
 *
 * It only says where the camera is and where it looks, as numbers; the
 * page hands them to the renderer, and nothing here draws.
 */
import { TILE, type Ground } from './world/types';

/** What the camera reads of the rover. */
export interface Followed {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
}

const DEG = Math.PI / 180;
/** How far above the ground the rover's rocker pivots ride on the flat: the height `Followed.z` is given at. */
const PIVOT = 0.8;

/**
 * How it is set. Distances are from where it looks to where it stands, in
 * units: 40 to 500 is four to fifty metres, and it starts at twelve. Home
 * is out where the game looked finished in review, though not so far that
 * the rover is lost on the grass (at fourteen it was some thirty pixels
 * tall); nearer is for close-ups of the rover, and right out is for the
 * land and the sky.
 */
export const CHASE = {
  near: 40,
  far: 500,
  home: 120,
  /**
   * Its angle from straight down, in degrees, at each end of the zoom and at
   * home, and in between by distance. At home, 62: the eye is 120 cos 62 degrees,
   * some 56 units or 5.6 m, up: over a broadleaf's crown (4.2 m) and under a conifer's (5.2 m) and a cottage's
   * ridge (6 m), so the sight-line cut and the lift over buildings do more of the work than they did at 49, and the
   * player sees the way ahead (chosen from a sheet of 49, 56, 62 and 68 on 2026-10-21). Near in it looks
   * lower, so the rover is seen as a thing and not a plan. Right out, 79.5:
   * with the page's 40-degree lens the horizon is 10.5 degrees over the
   * middle of the screen, which leaves the top quarter of it for the sky and
   * the clouds, the backdrop's hills taking some of that. Past 80 the sky is
   * more than a quarter of the screen and the land under the rover less.
   */
  tilt: { near: 67, home: 62, far: 79.5 },
  /** The steepest it goes when lifted over something, in degrees from straight down: straight down has no "up" to turn by. */
  steepest: 3,
  /**
   * How quickly it swings behind the heading, as a critically damped
   * spring's rate in radians a second: about a second and a half to settle
   * after a turn, which is slow enough to be seen and quick enough to drive by.
   */
  swing: 3,
  /**
   * How far ahead of the rover it looks, as shares of its distance, so it
   * reads alike at every zoom. Standing, `still` puts the rover about 60% of
   * the way down the screen from home inward; from home out it grows to
   * `stillFar` right out, so the far view looks out over the land ahead and
   * the rover is near its foot rather than the land behind it filling the
   * lower half. Going, the lead is the rover's speed times `time`, up to
   * `most` (34 units at home, the rover about 75% down), so a second of the
   * way ahead is in view. Reversing, it looks back toward the
   * rover and past it, `behind` times as far for the speed as going forward,
   * since reversing is slow, to at most `back`. Eased in at `ease` a second.
   */
  lead: { still: 0.1, stillFar: 0.3, time: 1, most: 0.28, back: 0.12, behind: 2, ease: 2 },
  /** How quickly it follows the rover, as the share of the way it goes in a second, as a rate: a soft follow, and the lead makes up the lag. */
  follow: 12,
  /** How quickly its height follows the rover's, the same way: a bump is not a bob of the whole view. */
  rise: 6,
  /** How far above the rover's rocker pivots it looks: at the body's middle. */
  above: 0.6,
  /** How quickly it eases to a new zoom. */
  zoomEase: 6,
  /**
   * The player's own look round, by dragging the view or with Q and E. `least` and `most` are the tilt's ends, in
   * degrees from straight down: lower than 30 looks into the trees, higher than 80 is mostly sky. `keys` is how fast
   * Q and E turn it, in radians a second. It holds while the rover stands or creeps; once it has gone faster than
   * `drive` for `wait` seconds its turn eases back behind the heading at `back`, so the controls, which turn the rover
   * itself, match the view whenever it is driven; the player's tilt is kept.
   */
  orbit: { least: 30, most: 80, keys: 1.8, drive: 5, wait: 1, back: 2 },
  /** How far above the ground, or a roof, its line and its eye keep, in units; the line's is reached `marginRun` units out. */
  margin: 3,
  marginRun: 20,
  /** How quickly it lifts over something solid, and how slowly it comes back down, as rates. */
  lift: { up: 10, down: 1.5 },
} as const;

/** How near the camera's eye may come to the ground or a roof under it, in units, before it is wrong. */
export const CAMERA_CLEAR = 0.5;
/**
 * How far over the ground under it the camera's target is kept; how near the target a tile is judged from at the
 * nearest, nearer than which the target is lifted over it instead (a tile judged from nought would need the line
 * straight up); and how far inside a tile's edge it is looked at.
 */
const NEAR_CLEAR = 0.3;
const NEAREST = 1;
const EDGE = 1e-3;
/** How many places along the camera's line the check looks. */
const LINE_SAMPLES = 64;

/** A whole turn, in radians. */
const TURN = 2 * Math.PI;
/** An angle brought within half a turn either way of nought. */
export const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** The share of the way a rate eases in `dt`. */
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/**
 * A drag across the view as a turn and a tilt, in radians: a drag the view's height across turns it half way round,
 * and the same up or down tilts it a quarter turn. Dragged right, the land turns right under it, so the camera goes
 * round the other way; dragged up, it looks further out.
 */
export function dragOrbit(dx: number, dy: number, height: number, out: Float64Array): void {
  const h = height > 0 ? height : 1;
  out[0] = (-dx / h) * Math.PI;
  out[1] = (-dy / h) * (Math.PI / 2);
}

/** How far ahead it looks standing, as a share of its distance: `still` to home, growing to `stillFar` right out. */
export function stillAt(distance: number): number {
  const { home, far, lead } = CHASE;
  return lead.still + (lead.stillFar - lead.still) * clamp((distance - home) / (far - home), 0, 1);
}

/** The tilt at a distance, in radians from straight down. */
export function tiltAt(distance: number): number {
  const { near, home, far, tilt } = CHASE;
  const d = clamp(distance, near, far);
  const deg =
    d < home
      ? tilt.near + ((tilt.home - tilt.near) * (d - near)) / (home - near)
      : tilt.home + ((tilt.far - tilt.home) * (d - home)) / (far - home);
  return deg * DEG;
}

export class ChaseCamera {
  /** Where it looks. */
  readonly target = new Float64Array(3);
  /** Where it stands. */
  readonly position = new Float64Array(3);
  /** The way it faces across the ground, anticlockwise from +x: the rover's heading, caught up with. */
  azimuth = 0;
  /** How far from where it looks it stands now, and how far it is easing to. */
  distance: number = CHASE.home;
  zoom: number = CHASE.home;
  /** Its angle from straight down, in radians, as it was last placed. */
  tilt = tiltAt(CHASE.home);
  /**
   * The player's look round: how far it is turned from behind the heading, in radians, and how far tilted from the
   * zoom's own tilt; and which way Q or E turns it now, one, nought or minus one, set by the page each frame (a whole
   * number, so setting it makes nothing).
   */
  keyTurn = 0;
  /**
   * The look round's turn and tilt, and how long the rover has been going faster than `CHASE.orbit.drive`, in seconds:
   * held in an array and not in fields, since a field written a fraction every frame was boxed each time by V8, a
   * number made a frame while Q or E was held (the allocation test caught it).
   */
  private readonly look = new Float64Array(3);
  get offset(): number {
    return this.look[0];
  }
  get bend(): number {
    return this.look[1];
  }

  private azimuthRate = 0;
  private leadX = 0;
  private leadY = 0;
  /** How much it is lifted for something solid in the way, in radians of tilt. */
  private lifted = 0;
  // where the rover was across the ground when it was last placed, held here rather than handed on, which would box it
  private roverX = 0;
  private roverY = 0;

  /**
   * Turn it round the rover by `turn` radians, anticlockwise, and tilt it by `tilt` toward the horizon: at once, and held
   * until the rover is driven, the tilt kept within `CHASE.orbit`'s ends.
   */
  orbitBy(turn: number, tilt: number): void {
    if (!Number.isFinite(turn) || !Number.isFinite(tilt)) return;
    const look = this.look;
    look[0] = wrap(look[0] + turn);
    this.azimuth = wrap(this.azimuth + turn);
    const base = tiltAt(this.zoom);
    look[1] = clamp(look[1] + tilt, CHASE.orbit.least * DEG - base, CHASE.orbit.most * DEG - base);
    look[2] = 0;
  }

  /** Bring it nearer (under one) or further (over one), within the zoom's ends. */
  zoomBy(factor: number): void {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    this.zoom = clamp(this.zoom * factor, CHASE.near, CHASE.far);
  }

  /** Put it where it settles behind the rover, at once: a new game, or a teleport. */
  snap(r: Followed, g: Ground): void {
    this.look.fill(0);
    this.azimuth = wrap(r.yaw);
    this.azimuthRate = 0;
    this.distance = this.zoom;
    const ahead = this.distance * stillAt(this.distance);
    this.leadX = Math.cos(r.yaw) * ahead;
    this.leadY = Math.sin(r.yaw) * ahead;
    this.target[0] = r.x + this.leadX;
    this.target[1] = r.y + this.leadY;
    this.target[2] = Math.max(r.z, g.heightAt(this.target[0], this.target[1]) + PIVOT) + CHASE.above;
    this.roverX = r.x;
    this.roverY = r.y;
    this.place(g, 0);
  }

  /** Follow the rover for `dt` seconds. */
  update(r: Followed, g: Ground, dt: number): void {
    if (!(dt > 0)) return;
    this.distance += (this.zoom - this.distance) * ease(CHASE.zoomEase, dt);

    // the player's look round: Q and E turn it; it holds while the rover stands or creeps, and once it has been driven
    // a while its turn eases back behind the heading; the tilt is the player's to keep
    const o = CHASE.orbit,
      look = this.look;
    if (this.keyTurn !== 0) {
      const turn = this.keyTurn * o.keys * dt;
      // wrapped in place: `wrap` called here was not inlined by V8 and boxed its result, a number a frame. The azimuth
      // is wrapped by the swing below, in this same step
      const turned = look[0] + turn;
      look[0] = turned - TURN * Math.round(turned / TURN);
      this.azimuth += turn;
      look[2] = 0;
    }
    look[2] = Math.abs(r.speed) > o.drive ? look[2] + dt : 0;
    if (look[2] > o.wait) {
      const back = ease(o.back, dt);
      look[0] -= look[0] * back;
    }

    // a critically damped swing toward the heading and the look round, the short way round
    const w = CHASE.swing;
    this.azimuthRate += (w * w * wrap(r.yaw + look[0] - this.azimuth) - 2 * w * this.azimuthRate) * dt;
    this.azimuth = wrap(this.azimuth + this.azimuthRate * dt);

    // the lead: a little ahead standing, more going, and back toward it reversing
    const { time, most, back, behind } = CHASE.lead;
    const d = this.distance,
      still = stillAt(d);
    const lead =
      r.speed >= 0
        ? Math.max(still * d, Math.min(r.speed * time, Math.max(most, still) * d))
        : Math.max(-back * d, still * d + r.speed * time * behind);
    const k = ease(CHASE.lead.ease, dt);
    this.leadX += (Math.cos(r.yaw) * lead - this.leadX) * k;
    this.leadY += (Math.sin(r.yaw) * lead - this.leadY) * k;

    const f = ease(CHASE.follow, dt);
    this.target[0] += (r.x + this.leadX - this.target[0]) * f;
    this.target[1] += (r.y + this.leadY - this.target[1]) * f;
    this.target[2] += (r.z + CHASE.above - this.target[2]) * ease(CHASE.rise, dt);
    // never below the ground where it looks, which the lead can put up a hill the rover has not reached yet
    const floor = g.heightAt(this.target[0], this.target[1]) + PIVOT + CHASE.above;
    if (this.target[2] < floor) this.target[2] = floor;
    this.roverX = r.x;
    this.roverY = r.y;
    this.place(g, dt);
  }

  /**
   * Stand back from the target along the azimuth at the zoom's tilt, lifted
   * as the ground and anything standing behind the rover need. With `dt`
   * nought the lift for something solid is taken at once. Last, the eye is
   * put over whatever stands where it would be.
   */
  private place(g: Ground, dt: number) {
    const tx = this.target[0],
      ty = this.target[1];
    const bx = -Math.cos(this.azimuth),
      by = -Math.sin(this.azimuth);
    // where it looks is over the ground there: the lead can put it anywhere ahead, down a slope or under a lip
    const floor = g.heightAt(tx, ty) + NEAR_CLEAR;
    let tz = Math.max(this.target[2], floor);
    const nominal = clamp(tiltAt(this.distance) + this.look[1], CHASE.orbit.least * DEG, CHASE.orbit.most * DEG);
    const reach = this.distance * Math.sin(nominal);
    // how far back along the line the rover is: a wall between it and where it looks is not in the way of seeing it
    const rover = (this.roverX - tx) * bx + (this.roverY - ty) * by;

    // the steepest the line must climb to clear the ground, and what stands on it. The line is walked tile by tile,
    // since a terrace or a wall is a whole tile and the line may cross only the corner of one: each tile it crosses
    // is looked at where the line goes in, in its middle and where it comes out, and judged as though all of it stood
    // where the line goes in. What it crosses within `NEAREST` of where it looks is too near to be climbed over by any
    // tilt, so where it looks is lifted over that instead: a lead that ends at the foot of a terrace looks at its lip
    // the steepest rise the line must climb, as rise over run, since the angle grows with it and only the steepest
    // needs its angle: one arctangent after the walk rather than six a tile, each of which V8 made a number for
    let ground = -1e9,
      solid = -1e9;
    const { minX, minY } = g.bounds;
    const ix = Math.floor((tx - minX) / TILE),
      iy = Math.floor((ty - minY) / TILE);
    // the line's way across the ground, kept off nought so a line along a row of tiles never divides by it
    const ux = (bx >= 0 ? 1 : -1) * Math.max(Math.abs(bx), 1e-9),
      uy = (by >= 0 ? 1 : -1) * Math.max(Math.abs(by), 1e-9);
    const across = TILE / Math.abs(ux),
      along = TILE / Math.abs(uy);
    // how far along the line the next tile edge is met, across x and across y, and where the line went into this tile
    let nextX = ((ix + (ux > 0 ? 1 : 0)) * TILE + minX - tx) / ux;
    let nextY = ((iy + (uy > 0 ? 1 : 0)) * TILE + minY - ty) / uy;
    let enter = 0;
    while (enter < reach) {
      // two two-way leasts: Math.min of three makes an array in V8, and the least by a conditional boxed its answer
      const leave = Math.min(Math.min(nextX, nextY), reach);
      const watch = leave > rover + 1;
      const near = Math.max(enter, NEAREST);
      const margin = CHASE.margin * Math.min(1, leave / CHASE.marginRun);
      for (let k = 0; k < 3; k++) {
        // in at the edge, the middle, and out at the edge, each a hair inside the tile: by arithmetic, since a number
        // chosen by a conditional was boxed
        const d = enter + EDGE + (leave - enter - 2 * EDGE) * k * 0.5;
        const x = tx + bx * d,
          y = ty + by * d;
        const h = g.heightAt(x, y);
        if (enter < NEAREST) tz = Math.max(tz, h + NEAR_CLEAR);
        const e = (h + margin - tz) / near;
        ground = Math.max(ground, e);
        if (watch) {
          const s = (g.topAt(x, y) + margin - tz) / near;
          solid = Math.max(solid, s);
        }
      }
      if (nextX < nextY) nextX += across;
      else nextY += along;
      enter = leave;
    }
    const climb = Math.atan(ground),
      over = Math.atan(solid);
    this.target[2] = tz;
    const steepest = CHASE.steepest * DEG;
    // a tilt from straight down is a quarter turn less the line's climb
    const byGround = Math.max(steepest, Math.min(nominal, Math.PI / 2 - climb));
    const bySolid = Math.max(steepest, Math.min(byGround, Math.PI / 2 - over));

    // lifted for the solid quickly, let down slowly; for the ground, at once
    const want = nominal - bySolid;
    if (dt === 0) this.lifted = want;
    else this.lifted += (want - this.lifted) * ease(want > this.lifted ? CHASE.lift.up : CHASE.lift.down, dt);
    let tilt = Math.min(nominal - this.lifted, byGround);

    // the eye over whatever stands under it, ground or roof, which the samples saw only nearby once it was lifted:
    // swung up toward straight down, and if that is not enough, lifted outright
    for (let i = 0; i < 4; i++) {
      const back = this.distance * Math.sin(tilt);
      const under = g.topAt(tx + bx * back, ty + by * back) + CHASE.margin;
      const up = tz + this.distance * Math.cos(tilt);
      if (up >= under) break;
      tilt = Math.max(steepest, Math.min(tilt, Math.PI / 2 - Math.atan2(under - tz, back) - 1e-6));
    }
    this.tilt = tilt;
    const back = this.distance * Math.sin(tilt);
    const ex = tx + bx * back,
      ey = ty + by * back;
    const ez = tz + this.distance * Math.cos(tilt),
      roof = g.topAt(ex, ey) + CHASE.margin;
    this.position[0] = ex;
    this.position[1] = ey;
    this.position[2] = Math.max(ez, roof);
  }
}

/**
 * What is wrong with where a camera stands, as lines saying what and where:
 * not a number, its eye under the ground or inside something built or rock
 * (within `CAMERA_CLEAR` of either), or its line to where it looks passing
 * under the ground. For the invariants, the fuzzer and the test API.
 */
export function cameraProblems(cam: { position: ArrayLike<number>; target: ArrayLike<number> }, g: Ground): string[] {
  const ex = cam.position[0],
    ey = cam.position[1],
    ez = cam.position[2];
  const tx = cam.target[0],
    ty = cam.target[1],
    tz = cam.target[2];
  if (!Number.isFinite(ex + ey + ez + tx + ty + tz)) return [`the camera is not a number: eye ${ez}, target ${tz}`];
  const out: string[] = [];
  const at = `${ex.toFixed(1)}, ${ey.toFixed(1)}, ${ez.toFixed(2)}`;
  const ground = g.heightAt(ex, ey),
    top = g.topAt(ex, ey);
  if (!(ez > ground + CAMERA_CLEAR))
    out.push(`the camera's eye is at ${at}, the ground under it at ${ground.toFixed(2)}`);
  else if (!(ez > top + CAMERA_CLEAR))
    out.push(`the camera's eye is at ${at}, inside what stands there to ${top.toFixed(2)}`);
  for (let k = 0; k <= LINE_SAMPLES; k++) {
    const f = k / LINE_SAMPLES;
    const x = tx + (ex - tx) * f,
      y = ty + (ey - ty) * f;
    const z = tz + (ez - tz) * f,
      h = g.heightAt(x, y);
    if (z < h) {
      out.push(
        `the camera's line to where it looks passes under the ground at ${x.toFixed(1)}, ${y.toFixed(1)}, ` +
          `${Math.round(f * 100)}% of the way to the eye, ${(h - z).toFixed(2)} under (eye ${at}, target ` +
          `${tx.toFixed(1)}, ${ty.toFixed(1)}, ${tz.toFixed(2)})`,
      );
      break;
    }
  }
  return out;
}
