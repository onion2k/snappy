/**
 * The rover driven by the game itself, along a route: for the gates that
 * measure how the game plays (the pace of a crossing, the same seed giving
 * the same game) without a person at the controls. It is handed the route
 * as the drive graph's A* finds it, a list of points, and asks for a
 * throttle and a steer each frame, as a person would.
 *
 * It is a measuring instrument first, so it must get about and not get
 * stuck: it turns on the spot to face a point well off its nose, slows for
 * a sharp corner, takes a point as passed once it is alongside it, and, if
 * something stops it all the same, backs off a little turned away and goes
 * again.
 */
import type { Drive } from './rover';

/** What the autopilot reads of the rover. */
export interface Piloted {
  x: number;
  y: number;
  yaw: number;
  yawRate: number;
}

/**
 * How it drives. Distances are in units, angles in radians, times in
 * seconds. `reach` is how near a point counts as reached, about a body
 * length; `arrive` the same for the last. It turns without going while the
 * point is more than `spin` off its nose, and goes flat out within `straight`
 * of it. `steer` is how hard it steers for each radian off, and `damp` how
 * much it eases off for how fast it is already turning, so it does not
 * swing past. A corner sharper than a right angle is taken at `corner` of
 * full speed, slowing over the last `brake` units to it; the last point is
 * come up to over `stop`. Going slower than `crawl` with the throttle open
 * for `stuck`, it backs off for `backOff`, then for `detour` aims `aside`
 * units to one side of where it was going, each stall the other side from
 * the last: a lamp or a signpost on the line of the route (which is planned
 * for a point, not for something as wide as the rover) is gone round.
 */
export const PILOT = {
  reach: 5,
  arrive: 2.5,
  spin: 1.1,
  straight: 0.2,
  steer: 2.5,
  damp: 0.15,
  corner: 0.35,
  brake: 14,
  stop: 10,
  stuck: 0.6,
  crawl: 1.5,
  backOff: 0.5,
  detour: 1.4,
  aside: 4,
} as const;

const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** A length, by a square root: V8's `Math.hypot` makes an array on every call, and this runs every frame. */
const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class Autopilot {
  /** The point it is driving to. */
  index = 1;
  /** Whether it has come to the last point; it asks for nothing more. */
  done = false;
  private route: Float32Array = new Float32Array(0);
  /** How long it has been stopped with the throttle open, and how long it has yet to back off for. */
  private stalled = 0;
  private backing = 0;
  private backSteer = 0;
  // how long it has yet to go round something, and which side, left (1) or right (-1)
  private detour = 0;
  private side = -1;
  // where the rover was last frame, to tell how far it really went
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(route: Float32Array) {
    this.follow(route);
  }

  /** A new route, from its first point: the rover is taken to be at or near it. */
  follow(route: Float32Array): void {
    this.route = route;
    this.index = 1;
    this.done = route.length < 4;
    this.stalled = this.backing = this.detour = 0;
    this.lastX = this.lastY = Number.NaN;
  }

  /** The controls for this frame, written into `out` and handed back. */
  drive(r: Piloted, dt: number, out: Drive): Drive {
    out.throttle = out.steer = 0;
    if (this.done) return out;
    const p = this.route,
      last = p.length / 2 - 1;

    // passed points are left behind: near enough, or alongside and past along the leg to them
    while (this.index < last) {
      const i = this.index;
      const px = p[2 * i],
        py = p[2 * i + 1];
      const lx = px - p[2 * i - 2],
        ly = py - p[2 * i - 1];
      const near = len(r.x - px, r.y - py) < PILOT.reach;
      const past = (r.x - px) * lx + (r.y - py) * ly > 0;
      if (!near && !past) break;
      this.index++;
    }
    const i = this.index;
    const tx = p[2 * i],
      ty = p[2 * i + 1];
    const dist = len(tx - r.x, ty - r.y);
    if (i === last && dist < PILOT.arrive) {
      this.done = true;
      return out;
    }

    if (this.backing > 0) {
      this.backing -= dt;
      out.throttle = -0.8;
      out.steer = this.backSteer;
      return out;
    }

    // going round what stopped it: aimed to one side of the point it was going to, across the way to it
    let ax = tx,
      ay = ty;
    if (this.detour > 0) {
      this.detour -= dt;
      const k = (this.side * PILOT.aside) / Math.max(dist, 1e-6);
      ax = tx - (ty - r.y) * k;
      ay = ty + (tx - r.x) * k;
    }
    const off = wrap(Math.atan2(ay - r.y, ax - r.x) - r.yaw);
    out.steer = clamp(off * PILOT.steer - r.yawRate * PILOT.damp, -1, 1);
    const a = Math.abs(off);
    let throttle =
      a >= PILOT.spin ? 0 : a <= PILOT.straight ? 1 : 1 - (a - PILOT.straight) / (PILOT.spin - PILOT.straight);
    if (i < last) {
      // the corner at this point: how far the next leg turns from the way to it, sharper slowing more
      const turn = Math.abs(wrap(Math.atan2(p[2 * i + 3] - ty, p[2 * i + 2] - tx) - Math.atan2(ty - r.y, tx - r.x)));
      const slow = 1 - (1 - PILOT.corner) * Math.min(1, turn / (Math.PI / 2));
      throttle = Math.min(throttle, slow + (1 - slow) * Math.min(1, dist / PILOT.brake));
    } else throttle = Math.min(throttle, clamp(dist / PILOT.stop, 0.25, 1));
    out.throttle = throttle;

    // stopped though it asks to go: something is in the way, so back off, turned the other way, and try again. How far
    // it really went is what tells, since pushing at a wall its speed rises each frame and is taken away again.
    const went = len(r.x - this.lastX, r.y - this.lastY);
    this.lastX = r.x;
    this.lastY = r.y;
    if (throttle > 0.3 && went < PILOT.crawl * dt) this.stalled += dt;
    else this.stalled = 0;
    if (this.stalled > PILOT.stuck) {
      this.stalled = 0;
      this.backing = PILOT.backOff;
      this.backSteer = off > 0 ? -0.6 : 0.6;
      this.detour = PILOT.detour;
      this.side = -this.side;
    }
    return out;
  }
}
