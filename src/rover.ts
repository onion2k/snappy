/**
 * The rover: a fifty-centimetre, six-wheeled thing on rocker-bogie arms,
 * driven like a tank. This is its state and how it moves, a step at a time,
 * against a `Ground` it is handed, so it is tested on the fixture and drives
 * the real world unchanged. It knows nothing of the page or the renderer;
 * the model reads its pose, its arms and its wheels from here.
 *
 * Every move is checked before it is made, at each wheel by the same rule
 * the drive graph is built by (`canMove`, here as `moveAllowed`), and
 * against the body's outline for walls, so it never ends anywhere it may
 * not stand. A move that is refused is tried again turned along the
 * obstacle, so it slides along a wall rather than sticking to it.
 *
 * Frame of reference: x is the way it faces, y to its left, z up. `yaw` is
 * the heading, anticlockwise from +x. `pitch` is nose up, and `roll` is left
 * side up, both in radians: drawn, the body is turned by yaw about z, then
 * by `-pitch` about its own y (a right-handed turn about y puts the nose
 * down), then by `roll` about its own x.
 */
import { standable } from './world/drive';
import { DRIVE, type Ground, type Surface } from './world/types';

/** What drives it, each from -1 to 1: throttle forward, steer to the left. */
export interface Drive {
  throttle: number;
  steer: number;
}

/**
 * How it is made, in units (10 cm), shared with the model so what is drawn
 * is what moves. The wheels are numbered front, middle, rear, left before
 * right: wheel `i` is on axle `i >> 1` and side `i & 1` (0 left, 1 right).
 *
 * Each side has a rocker, pivoting on the body at its middle (x = 0) at
 * axle height, carrying the front wheel ahead and the bogie's pivot behind;
 * the bogie carries the middle and rear wheels either side of its own
 * pivot. The arms are straight lines between those points as far as the
 * motion goes, and the model may bend them as it likes so long as the ends
 * stay put. `z` is the height of the rocker pivots' axis, the body's origin.
 */
export const ROVER = {
  length: 5,
  width: 3.5,
  wheelRadius: 0.8,
  wheelWidth: 0.6,
  /** Between the wheels' middles, left to right. */
  track: 2.9,
  /** Each axle's distance ahead of the rocker pivot: front, middle, rear. */
  axleX: [1.9, 0, -1.9] as readonly number[],
  /** The bogie's pivot, on the rocker, halfway between the middle and rear wheels. */
  bogieX: -0.95,
  /**
   * The outline that meets walls: the body and the wheels' outer faces, its
   * corners cut so it can turn close to a wall. Ahead to the front tyres'
   * faces, back to the rear ones, and out to the wheels' sides.
   */
  hull: { front: 2.7, rear: -2.7, side: 1.75, cut: 0.6 },
  /** How far each arm may swing from straight before it meets its stop, in radians: the model's limits too. */
  rockerTravel: 0.5,
  bogieTravel: 0.6,
  /**
   * How far a wheel as drawn may be from where the ground holds it, in
   * units: the body's sway takes it a little off, and no more than this.
   */
  slack: 0.3,
} as const;

export const WHEELS = 6;

/**
 * How it drives, said in one place so it can be tuned. A 50 cm rover at
 * 2.5 m/s covers five times its length a second, which reads as zippy; the
 * rest is chosen to keep it lively without being twitchy.
 */
export const HANDLING = {
  /** Top speed on each surface, by `SURFACE`: grass, dirt, sand, mud, stone (stone rides like a road). */
  top: [20, 25, 12, 12, 25] as readonly number[],
  /** Top speed with the wheels in water, however shallow. */
  wet: 12,
  /** Reversing is this share of the forward speed: it is a rover, not a racer. */
  reverse: 0.55,
  /**
   * The motors close the gap to the speed asked for at `1 / settle` of it a
   * second, but never quicker than `accel` (or `brake`, when slowing): from
   * rest to 25 is a straight push at 70 for a quarter of a second and an
   * easing in after it, within a unit a second of top speed in half a
   * second, so it sets off with a shove and arrives at speed without a jolt.
   * Let go, it stops in about four tenths.
   */
  settle: 0.12,
  accel: 70,
  brake: 110,
  /**
   * Its turn on the spot, in radians a second: right round in 1.5 s. At top
   * speed it turns `atSpeed` less, so it carves an arc about two body lengths
   * across rather than spinning in the road; `turnSettle` is how quickly the
   * tracks take up a new turn, in seconds, which takes the edge off a tap.
   */
  spin: (2 * Math.PI) / 1.5,
  atSpeed: 0.45,
  turnSettle: 0.08,
  /** Climbing its steepest slope costs this share of its speed: the motors labour. Downhill costs nothing. */
  climb: 0.25,
} as const;

/**
 * The body rides on its arms like a spring: it follows the pose the wheels
 * give at `omega` radians a second, damped to about half of critical, so a
 * step is taken with a nod and a small bounce rather than a jolt, and it
 * settles in a quarter of a second. On top of that it leans with
 * what it does: nose up as it sets off and down as it brakes (`accel`
 * radians for each unit a second squared), and out of a turn (`turn` for
 * each unit a second squared it is pulled sideways), to at most `most`.
 * Pitch is free, since the rockers turn the other way about their pivot;
 * roll lifts one side's pivots, so it is kept small.
 */
const SWAY = { omega: 16, damping: 0.45, accel: 0.0007, turn: 0.0008, most: 0.08 } as const;

/**
 * The head on its mast, and what it looks at. Driving, it looks into the
 * turn, `steer` radians for a full steer and `turn` seconds of the turn
 * ahead, at most `most` either way, and a little down at the way ahead
 * (`ahead`). Stood still for `idle` seconds, it turns round toward whoever
 * is looking at it (`lookAt`), up to `round` either way, which is short of
 * straight back so it never swings through the back and round, and looks up
 * at them, from `down` to `up`; on driving off it turns forward again. It
 * turns as a critically damped spring at `quick` radians a second driving
 * and `slow` when it turns to look, so noticing someone is unhurried.
 * `height` is the head's height over the body's origin, which is where it
 * is looked up from. The eyes blink every `every` seconds and up to
 * `spread` more, the lid down and up in `length`, and one blink in `twice`
 * is a double blink, `again` after the first.
 */
export const HEAD = {
  steer: 0.3,
  turn: 0.15,
  most: 0.75,
  ahead: -0.08,
  idle: 2,
  round: 2.9,
  down: -0.35,
  up: 0.8,
  quick: 9,
  slow: 4.5,
  height: 3.4,
  every: 2.6,
  spread: 2.8,
  length: 0.16,
  twice: 0.25,
  again: 0.3,
} as const;

/** A whole number mixed into a number from 0 to 1, the same everywhere: the blinks' timing, with no chance in it. */
function mix(k: number): number {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** How far the teleport looks for somewhere to stand: rings this far apart, in units, and this many of them. */
const TELEPORT = { step: 1, rings: 80 } as const;
/** The longest step it takes at once: a frame at 60 Hz, so no wheel moves further than `DRIVE.probe` in one. */
const SUBSTEP = 1 / 60;
/** The longest frame it believes in: a stall longer than this is played as this, not as a leap. */
const LONGEST = 0.1;
/** The steepest grade it climbs, as rise over run, from `DRIVE`. */
const MAX_GRADE = Math.tan((DRIVE.maxSlope * Math.PI) / 180);

/**
 * Where a wheel touches, as offsets ahead of its axle along the heading: a
 * wheel is a circle, so it rides the highest of the ground ahead and behind
 * it lifted by the circle's height there. The offsets are spaced evenly in
 * angle round the tyre, so each one adds an even share of height, and an
 * edge is climbed in small rises rather than jumped.
 */
const TREAD = (() => {
  const angles = [0, 15, 30, 45, 60, 75, 87];
  const along: number[] = [],
    lift: number[] = [];
  for (const a of angles)
    for (const sign of a === 0 ? [1] : [1, -1]) {
      along.push(sign * ROVER.wheelRadius * Math.sin((a * Math.PI) / 180));
      lift.push(ROVER.wheelRadius * Math.cos((a * Math.PI) / 180));
    }
  return { along: Float64Array.from(along), lift: Float64Array.from(lift) };
})();

/** The hull's eight points, ahead and to the left, and for each the wheel nearest it, which its height is judged against. */
const HULL = (() => {
  const { front, rear, side, cut } = ROVER.hull;
  const points = [
    [front, side - cut],
    [front, -(side - cut)],
    [front - cut, side],
    [front - cut, -side],
    [rear, side - cut],
    [rear, -(side - cut)],
    [rear + cut, side],
    [rear + cut, -side],
  ];
  const nearest = points.map(([x, y]) => (x > 0 ? 0 : 4) + (y > 0 ? 0 : 1));
  return {
    x: Float64Array.from(points.map((p) => p[0])),
    y: Float64Array.from(points.map((p) => p[1])),
    wheel: Uint8Array.from(nearest),
    reach: Float64Array.from(
      points.map(([x, y], i) => Math.hypot(x - ROVER.axleX[nearest[i] >> 1], y - wheelY(nearest[i] & 1))),
    ),
  };
})();
const HULL_POINTS = 8;

/**
 * Points over the whole of the body, its edges among them, no more than
 * `BODY_STEP` apart each way, asked on every move whether they are in
 * anything solid. A lamp post of radius 0.6 slipped between the hull's eight
 * corners and stood up through the body: a circle that wide anywhere under
 * the body, or with its middle come to the body's edge, holds a point at
 * this spacing (a cut corner's edge is shorter than the circle is wide, so a
 * corner catches it there), and no step carries it across the edge between
 * two looks. A tile's square corner pushed in from the side is caught the same
 * way. Only the eight corners are judged against a rising face.
 */
const BODY_STEP = 0.8;
const BODY = (() => {
  const { front, rear, side, cut } = ROVER.hull;
  const nx = Math.ceil((front - rear) / BODY_STEP),
    ny = Math.ceil((2 * side) / BODY_STEP);
  const x: number[] = [],
    y: number[] = [];
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= ny; j++) {
      const px = rear + ((front - rear) * i) / nx,
        py = -side + (2 * side * j) / ny;
      // only inside the cut corners, which the outline goes round
      const over = Math.max(0, (px > 0 ? px - front : rear - px) + cut) + Math.max(0, Math.abs(py) - side + cut);
      if (over > cut + 1e-9) continue;
      x.push(px);
      y.push(py);
    }
  return { x: Float64Array.from(x), y: Float64Array.from(y) };
})();

/** A wheel's distance to the left of the middle: its side's. */
function wheelY(side: number): number {
  return side === 0 ? ROVER.track / 2 : -ROVER.track / 2;
}
const WHEEL_X = Float64Array.from({ length: WHEELS }, (_, i) => ROVER.axleX[i >> 1]);
const WHEEL_Y = Float64Array.from({ length: WHEELS }, (_, i) => wheelY(i & 1));

/**
 * The turns a refused move is tried at, nearest first, each side in turn:
 * up to 60 degrees off, so it slides along a wall met at a glance and stops
 * at one met within 30 degrees of square on, rather than creeping sideways
 * along it. The move is shortened to what goes along the wall.
 */
const SLIDE = Float64Array.from([15, -15, 30, -30, 45, -45, 60, -60].map((d) => (d * Math.PI) / 180));
/**
 * The nudges tried when a turn on the spot is refused, back, to either
 * side and ahead, so it can twist off a wall it is against. Each is as far
 * as the turn swings the hull's corners, `NUDGE` times the turn, so a small
 * correction is a small shuffle and not a hop.
 */
const NUDGE = Math.hypot(ROVER.hull.front, ROVER.hull.side) * 1.5;
const NUDGES = Float64Array.from([-1, 0, 0, 1, 0, -1, 1, 0]);

/**
 * The drive rule's `canMove`, the same test in the same order, with its
 * distance taken by a square root: V8's `Math.hypot` makes an array on every
 * call, and this runs six times a move, several moves a frame. A test holds
 * the two to the same answer over thousands of moves, so the rover cannot
 * drift from the rule the drive graph is built by; once `canMove` drops
 * `Math.hypot`, this goes and the rover calls it.
 */
export function moveAllowed(g: Ground, ax: number, ay: number, bx: number, by: number): boolean {
  if (!standable(g, bx, by)) return false;
  const dx = bx - ax,
    dy = by - ay;
  return Math.abs(g.heightAt(bx, by) - g.heightAt(ax, ay)) <= DRIVE.step + MAX_GRADE * Math.sqrt(dx * dx + dy * dy);
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** A number from the controls, or nought if it is not one. */
const axis = (v: number) => (v > 0 ? (v > 1 ? 1 : v) : v < 0 ? (v < -1 ? -1 : v) : 0);

export class Rover {
  x = 0;
  y = 0;
  /** The rocker pivots' height: the body's origin. */
  z: number = ROVER.wheelRadius;
  yaw = 0;
  /** Along the heading, in units a second; negative in reverse. */
  speed = 0;
  /** Radians a second, anticlockwise. */
  yawRate = 0;
  /** The body's nose-up angle, sway and all. */
  pitch = 0;
  /** The body's left-side-up angle, sway and all. */
  roll = 0;
  /** What the ground is under its middle, and how deep the water there. */
  surface: Surface = 0;
  wet = 0;
  /** Whether something stopped part of the last step: a wall, a bank, deep water. */
  blocked = false;
  /** The controls as the last step had them, each -1 to 1: for the sound of the motors, and the model's. */
  throttle = 0;
  steer = 0;
  /** The head's turn against the body, anticlockwise, and its tilt, up positive, in radians: for the model to pose. */
  headYaw = 0;
  headPitch = 0;
  /** The eyelids, from 0 open to 1 shut. */
  blink = 0;
  /** How long it has stood still with nothing asked of it, in seconds. */
  still = 0;

  /** Where each wheel touches, in the world. */
  readonly wheelX = new Float64Array(WHEELS);
  readonly wheelY = new Float64Array(WHEELS);
  /** The height each wheel's axle is held at by the ground under it. */
  readonly wheelRest = new Float64Array(WHEELS);
  /** The height each wheel's axle is drawn at, from the body's pose and the arms' angles. */
  readonly wheelZ = new Float64Array(WHEELS);
  /** How far each wheel has turned, in radians, forward positive: what it has rolled over its radius. */
  readonly spin = new Float64Array(WHEELS);
  /** How far each side has rolled, in units, forward positive: the tracks are laid from this. */
  readonly rolled = new Float64Array(2);
  /** Each side's rocker against the body, front end up; and each bogie against its rocker, middle wheel up. */
  readonly rocker = new Float64Array(2);
  readonly bogie = new Float64Array(2);

  private readonly ground: Ground;
  // the pose a move would leave it in, worked out before it is taken
  private readonly candX = new Float64Array(WHEELS);
  private readonly candY = new Float64Array(WHEELS);
  private readonly candH = new Float64Array(WHEELS);
  // the pose itself, set before `contacts` or `tryMove` is called rather than handed to them: a number passed to a
  // call V8 does not inline is boxed, and the slides call these many times a frame
  private goX = 0;
  private goY = 0;
  private goYaw = 0;
  private candC = 1;
  private candS = 0;
  // the body's sway, as the angles' rates of change
  private pitchRate = 0;
  private rollRate = 0;
  private lastSpeed = 0;
  private readonly slope = new Float64Array(2);
  // what a substep works with, held here rather than handed to it: a number passed to a call V8 does not inline is
  // boxed, a few bytes of garbage a frame for nothing
  private tick = 0;
  private lean = 0;
  private sway = 0;
  // whoever is looking at it, as the page last said, and whether anyone has
  private lookX = 0;
  private lookY = 0;
  private lookZ = 0;
  private looked = false;
  private headYawRate = 0;
  private headPitchRate = 0;
  // the rover's own clock, from its steps, for the blinks: when the next starts, the last started, and how many so far
  private clock = 0;
  private nextBlink: number = HEAD.every;
  private blinkAt = -1;
  private blinks = 0;

  constructor(ground: Ground, start?: { x: number; y: number; yaw: number }) {
    this.ground = ground;
    if (start) this.teleport(start.x, start.y, start.yaw);
  }

  /**
   * Put it at a point, facing `yaw`, at rest. If it cannot stand there, it
   * is put at the nearest place it can, looked for in rings outward, facing
   * the way asked if that fits and turned by eighths of a turn if not.
   * False if there is nowhere within `TELEPORT`'s rings, which leaves it where it was.
   */
  teleport(x: number, y: number, yaw: number): boolean {
    for (let ring = 0; ring <= TELEPORT.rings; ring++) {
      const radius = ring * TELEPORT.step;
      const around = ring === 0 ? 1 : Math.ceil(2 * Math.PI * ring);
      for (let k = 0; k < around; k++) {
        const a = (2 * Math.PI * k) / around;
        const px = x + radius * Math.cos(a),
          py = y + radius * Math.sin(a);
        for (let turn = 0; turn < 8; turn++) {
          // the asked heading first, then an eighth either side, a quarter either side, and so on
          const t = ((turn + 1) >> 1) * (turn & 1 ? 1 : -1);
          const pyaw = yaw + (t * Math.PI) / 4;
          this.goX = px;
          this.goY = py;
          this.goYaw = pyaw;
          this.contacts();
          if (this.fits(false)) {
            this.place();
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Where whoever is looking at it stands, the camera's eye, which the page says each frame: the head turns to it when idle. */
  lookAt(x: number, y: number, z: number): void {
    this.lookX = x;
    this.lookY = y;
    this.lookZ = z;
    this.looked = true;
  }

  /**
   * One step of `dt` seconds with the controls as they are. A long step is
   * cut into frames, so nothing moves further at once than the drive rule
   * looks, and the result does not hang on the frame rate.
   */
  step(dt: number, drive: Drive): void {
    if (!(dt > 0)) return;
    const t = dt > LONGEST ? LONGEST : dt;
    const n = Math.ceil(t / SUBSTEP - 1e-9);
    this.throttle = axis(drive.throttle);
    this.steer = axis(drive.steer);
    this.tick = t / n;
    this.blocked = false;
    for (let i = 0; i < n; i++) this.substep();
    // the head once a frame, over the whole of it: a spring this slow is steady at the longest frame
    this.tick = t;
    this.look();
  }

  /**
   * What is wrong with where it is, or null: off the world, in rock or in
   * something built, in deep water, on a slope it could not stand on, its
   * wheels across a ledge, or a wheel drawn off the ground, up a face it
   * could not climb, or past its stop.
   * The invariants ask this; it is worked out afresh from x, y and yaw.
   */
  misplaced(): string | null {
    if (!Number.isFinite(this.x + this.y + this.z + this.yaw + this.pitch + this.roll)) return 'not a number';
    this.goX = this.x;
    this.goY = this.y;
    this.goYaw = this.yaw;
    this.contacts();
    if (this.over()) return `over something solid at ${this.x.toFixed(2)}, ${this.y.toFixed(2)}`;
    if (!this.fits(false)) return `not standable at ${this.x.toFixed(2)}, ${this.y.toFixed(2)}`;
    for (let i = 0; i < WHEELS; i++) {
      if (Math.abs(this.wheelZ[i] - this.wheelRest[i]) > ROVER.slack) return `wheel ${i} off the ground`;
      const under = this.ground.heightAt(this.wheelX[i], this.wheelY[i]) + ROVER.wheelRadius;
      if (this.wheelRest[i] < under - 1e-6) return `wheel ${i} below the ground`;
      if (this.wheelRest[i] > under + DRIVE.step + MAX_GRADE * ROVER.wheelRadius) return `wheel ${i} up a wall`;
    }
    for (let s = 0; s < 2; s++)
      if (Math.abs(this.rocker[s]) > ROVER.rockerTravel || Math.abs(this.bogie[s]) > ROVER.bogieTravel)
        return `side ${s} past its stop`;
    return null;
  }

  private substep() {
    const g = this.ground,
      h = this.tick,
      throttle = this.throttle,
      steer = this.steer;
    // how fast the ground lets it go: each wheel's surface or water, shared, and less for a climb
    let top = 0;
    for (let i = 0; i < WHEELS; i++) {
      const wx = this.wheelX[i],
        wy = this.wheelY[i];
      top += g.waterDepthAt(wx, wy) > 0 ? HANDLING.wet : HANDLING.top[g.surfaceAt(wx, wy)];
    }
    top /= WHEELS;
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    g.slopeAt(this.x, this.y, this.slope);
    const grade = (this.slope[0] * c + this.slope[1] * s) * (this.speed < 0 ? -1 : 1);
    if (grade > 0) top *= 1 - HANDLING.climb * Math.min(1, grade / MAX_GRADE);

    // the motors: toward the speed asked for, quick at first and easing in, held to what they can give
    const want = throttle * (throttle < 0 ? top * HANDLING.reverse : top);
    const gaining = want * this.speed >= 0 && Math.abs(want) > Math.abs(this.speed);
    const most = (gaining ? HANDLING.accel : HANDLING.brake) * h;
    this.speed += clamp(((want - this.speed) * h) / HANDLING.settle, -most, most);

    const turn = steer * HANDLING.spin * (1 - HANDLING.atSpeed * Math.min(1, Math.abs(this.speed) / HANDLING.top[1]));
    this.yawRate += (turn - this.yawRate) * (1 - Math.exp(-h / HANDLING.turnSettle));

    // turn first, then go: each is tried and, if refused, given up or slid, so one does not stop the other
    let turned = 0;
    if (this.yawRate !== 0) {
      const yaw = this.yaw + this.yawRate * h;
      this.goX = this.x;
      this.goY = this.y;
      this.goYaw = yaw;
      let done = this.tryMove();
      const nudge = NUDGE * Math.abs(this.yawRate * h);
      for (let k = 0; !done && k < NUDGES.length; k += 2) {
        // a nudge back, aside or ahead, in the body's frame, to twist off a wall
        this.goX = this.x + nudge * (NUDGES[k] * c - NUDGES[k + 1] * s);
        this.goY = this.y + nudge * (NUDGES[k] * s + NUDGES[k + 1] * c);
        this.goYaw = yaw;
        done = this.tryMove();
      }
      if (done) turned = this.yawRate * h;
      else {
        this.yawRate = 0;
        this.blocked = true;
      }
    }

    let ahead = 0;
    const d = this.speed * h;
    if (d !== 0) {
      const hc = Math.cos(this.yaw),
        hs = Math.sin(this.yaw);
      this.goX = this.x + d * hc;
      this.goY = this.y + d * hs;
      this.goYaw = this.yaw;
      if (this.tryMove()) ahead = d;
      else {
        this.blocked = true;
        for (let k = 0; k < SLIDE.length; k++) {
          // the move turned along what stopped it, and only as long as its share that goes that way
          const a = SLIDE[k],
            len = d * Math.cos(a);
          const mc = Math.cos(this.yaw + a),
            ms = Math.sin(this.yaw + a);
          this.goX = this.x + len * mc;
          this.goY = this.y + len * ms;
          this.goYaw = this.yaw;
          if (this.tryMove()) {
            ahead = len * Math.cos(a);
            break;
          }
        }
        if (ahead === 0) this.speed = 0;
      }
    }

    // the wheels roll by what each side went: ahead, less or more for the turn
    const across = (turned * ROVER.track) / 2;
    this.rolled[0] += ahead - across;
    this.rolled[1] += ahead + across;
    for (let i = 0; i < WHEELS; i++) this.spin[i] = this.rolled[i & 1] / ROVER.wheelRadius;

    // the body's lean: what it was asked to do, which the sway answers
    const accel = (this.speed - this.lastSpeed) / h;
    this.lastSpeed = this.speed;
    this.lean = clamp(accel * SWAY.accel, -SWAY.most, SWAY.most);
    this.sway = clamp(this.speed * this.yawRate * SWAY.turn, -SWAY.most, SWAY.most);
    this.pose();
  }

  /** The head, a frame on: where it wants to look, sprung toward it, and the eyelids. */
  private look() {
    const h = this.tick;
    const moving =
      this.throttle !== 0 || this.steer !== 0 || Math.abs(this.speed) > 0.5 || Math.abs(this.yawRate) > 0.2;
    this.still = moving ? 0 : this.still + h;
    let yaw = 0,
      pitch = 0,
      rate: number = HEAD.quick;
    if (this.still > HEAD.idle && this.looked) {
      // round toward whoever looks, short of straight back; past that it stays on the side it is already turned to
      const dx = this.lookX - this.x,
        dy = this.lookY - this.y;
      // brought within half a turn here rather than by a helper, whose answer V8 boxed: sixteen bytes a frame
      yaw = Math.atan2(dy, dx) - this.yaw;
      yaw -= 2 * Math.PI * Math.round(yaw / (2 * Math.PI));
      if (yaw > HEAD.round || yaw < -HEAD.round) yaw = this.headYaw < 0 ? -HEAD.round : HEAD.round;
      pitch = Math.max(
        HEAD.down,
        Math.min(HEAD.up, Math.atan2(this.lookZ - this.z - HEAD.height, Math.sqrt(dx * dx + dy * dy))),
      );
      rate = HEAD.slow;
    } else if (moving) {
      yaw = Math.max(-HEAD.most, Math.min(HEAD.most, this.steer * HEAD.steer + this.yawRate * HEAD.turn));
      pitch = HEAD.ahead;
    }
    this.headYawRate += (rate * rate * (yaw - this.headYaw) - 2 * rate * this.headYawRate) * h;
    this.headYaw += this.headYawRate * h;
    this.headPitchRate += (rate * rate * (pitch - this.headPitch) - 2 * rate * this.headPitchRate) * h;
    this.headPitch += this.headPitchRate * h;

    this.clock += h;
    if (this.clock >= this.nextBlink) {
      this.blinkAt = this.clock;
      this.blinks++;
      // now and then a second blink straight after, which reads as a thing that is thinking
      const twice = mix(this.blinks * 2 + 1) < HEAD.twice;
      this.nextBlink = this.clock + (twice ? HEAD.again : HEAD.every + HEAD.spread * mix(this.blinks * 2));
    }
    const u = this.blinkAt < 0 ? 1 : (this.clock - this.blinkAt) / HEAD.length;
    this.blink = u >= 1 ? 0 : 1 - Math.abs(2 * u - 1);
  }

  /** Move to the pose in `goX`, `goY` and `goYaw` if the move is allowed, and say whether it was. */
  private tryMove(): boolean {
    this.contacts();
    if (!this.fits(true)) return false;
    this.x = this.goX;
    this.y = this.goY;
    this.yaw = this.goYaw;
    for (let i = 0; i < WHEELS; i++) {
      this.wheelX[i] = this.candX[i];
      this.wheelY[i] = this.candY[i];
    }
    return true;
  }

  /** Where the wheels would touch in the pose in `goX`, `goY` and `goYaw`, into the candidate. */
  private contacts() {
    const x = this.goX,
      y = this.goY;
    const c = Math.cos(this.goYaw),
      s = Math.sin(this.goYaw);
    for (let i = 0; i < WHEELS; i++) {
      this.candX[i] = x + WHEEL_X[i] * c - WHEEL_Y[i] * s;
      this.candY[i] = y + WHEEL_X[i] * s + WHEEL_Y[i] * c;
    }
    this.candC = c;
    this.candS = s;
  }

  /**
   * Whether the candidate pose may be stood in: every wheel on standable
   * ground (and, for a move, got there by an allowed move from where it
   * is), no ledge between neighbouring wheels, no corner of the hull against
   * a face taller than an edge it rolls over, and nothing solid anywhere
   * under its body.
   */
  private fits(moving: boolean): boolean {
    const g = this.ground;
    for (let i = 0; i < WHEELS; i++) {
      const ok = moving
        ? moveAllowed(g, this.wheelX[i], this.wheelY[i], this.candX[i], this.candY[i])
        : standable(g, this.candX[i], this.candY[i]);
      if (!ok) return false;
      this.candH[i] = g.heightAt(this.candX[i], this.candY[i]);
    }
    // no ledge between neighbouring wheels: the ground between them is walked as the drive graph walks a move, in
    // steps no longer than it looks, none rising past an edge. Each wheel's own move keeps it off a ledge it crosses,
    // but turning on the spot by a ledge's corner can bring the corner in between two wheels that crossed nothing
    // (the fuzzer's seed 21 found one), so a move is walked as well as a put-down
    for (let side = 0; side < 2; side++)
      for (let axle = 0; axle < 2; axle++) if (!this.level(axle * 2 + side, axle * 2 + 2 + side)) return false;
    for (let axle = 0; axle < 3; axle++) if (!this.level(axle * 2, axle * 2 + 1)) return false;
    const c = this.candC,
      s = this.candS;
    for (let k = 0; k < HULL_POINTS; k++) {
      const hx = this.goX + HULL.x[k] * c - HULL.y[k] * s,
        hy = this.goY + HULL.x[k] * s + HULL.y[k] * c;
      if (g.solidAt(hx, hy)) return false;
      // a face rising ahead of the wheels: the body would be in it before the wheel met it
      if (g.heightAt(hx, hy) - this.candH[HULL.wheel[k]] > DRIVE.step + MAX_GRADE * HULL.reach[k]) return false;
    }
    return !this.over();
  }

  /** Whether anything solid is under the candidate pose's body, anywhere, not only at its edge. */
  private over(): boolean {
    const g = this.ground;
    const c = this.candC,
      s = this.candS;
    for (let k = 0; k < BODY.x.length; k++)
      if (g.solidAt(this.goX + BODY.x[k] * c - BODY.y[k] * s, this.goY + BODY.x[k] * s + BODY.y[k] * c)) return true;
    return false;
  }

  /** Whether the ground between candidate wheels `a` and `b` rises nowhere past an edge the rover rolls over. */
  private level(a: number, b: number): boolean {
    const g = this.ground;
    const ax = this.candX[a],
      ay = this.candY[a],
      dx = this.candX[b] - ax,
      dy = this.candY[b] - ay;
    const n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / DRIVE.probe);
    const run = Math.sqrt(dx * dx + dy * dy) / n;
    let h = this.candH[a];
    for (let k = 1; k <= n; k++) {
      const next = g.heightAt(ax + (dx * k) / n, ay + (dy * k) / n);
      if (Math.abs(next - h) > DRIVE.step + MAX_GRADE * run) return false;
      h = next;
    }
    return true;
  }

  /** Put it down at the candidate pose, known to fit, at rest, its body settled. */
  private place() {
    this.x = this.goX;
    this.y = this.goY;
    this.yaw = this.goYaw;
    for (let i = 0; i < WHEELS; i++) {
      this.wheelX[i] = this.candX[i];
      this.wheelY[i] = this.candY[i];
    }
    this.speed = this.yawRate = this.lastSpeed = 0;
    this.pitchRate = this.rollRate = 0;
    this.tick = this.lean = this.sway = 0;
    this.pose();
  }

  /**
   * The body and its arms, from where the wheels touch. Each wheel's axle is
   * held where the ground lifts it; each bogie lies along its two wheels,
   * and each rocker from its front wheel to its bogie's pivot. The body sits
   * on the two rocker pivots, its pitch the rockers' average (the
   * differential that joins them) and its roll the slope between them. Then
   * the sway: the body is sprung toward that pose, and the arms take up the
   * difference. With no time to spring in, it is put there outright.
   */
  private pose() {
    const g = this.ground,
      h = this.tick,
      lean = this.lean,
      sway = this.sway;
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    for (let i = 0; i < WHEELS; i++) this.tread(i, c, s);
    const span = ROVER.axleX[0] - ROVER.bogieX,
      bogieHalf = ROVER.axleX[1] - ROVER.bogieX;
    let pivotL = 0,
      pivotR = 0,
      pitch = 0;
    for (let side = 0; side < 2; side++) {
      const front = this.wheelRest[side],
        mid = this.wheelRest[2 + side],
        rear = this.wheelRest[4 + side];
      const hub = (mid + rear) / 2;
      const rockerWorld = Math.atan2(front - hub, span);
      const pivot = front - (ROVER.axleX[0] * (front - hub)) / span;
      this.rocker[side] = rockerWorld;
      this.bogie[side] = Math.atan2(mid - rear, 2 * bogieHalf);
      pitch += rockerWorld / 2;
      if (side === 0) pivotL = pivot;
      else pivotR = pivot;
    }
    this.z = (pivotL + pivotR) / 2;
    const roll = Math.atan2(pivotL - pivotR, ROVER.track);

    if (h === 0) {
      this.pitch = pitch;
      this.roll = roll;
    } else {
      // a damped spring, stepped semi-implicitly, which is steady at this rate and step
      const w = SWAY.omega,
        z = SWAY.damping;
      this.pitchRate += (w * w * (pitch + lean - this.pitch) - 2 * z * w * this.pitchRate) * h;
      this.pitch += this.pitchRate * h;
      this.rollRate += (w * w * (roll + sway - this.roll) - 2 * z * w * this.rollRate) * h;
      this.roll += this.rollRate * h;
    }

    // the arms against the body, and the wheels where the drawn arms put them
    const half = ROVER.track / 2;
    for (let side = 0; side < 2; side++) {
      const rockerWorld = this.rocker[side],
        bogieWorld = this.bogie[side];
      this.rocker[side] = rockerWorld - this.pitch;
      this.bogie[side] = bogieWorld - rockerWorld;
      const pivot = this.z + (side === 0 ? half : -half) * Math.sin(this.roll);
      const hub = pivot + ROVER.bogieX * Math.sin(rockerWorld);
      this.wheelZ[side] = pivot + ROVER.axleX[0] * Math.sin(rockerWorld);
      this.wheelZ[2 + side] = hub + bogieHalf * Math.sin(bogieWorld);
      this.wheelZ[4 + side] = hub - bogieHalf * Math.sin(bogieWorld);
    }
    this.surface = g.surfaceAt(this.x, this.y);
    this.wet = g.waterDepthAt(this.x, this.y);
  }

  /**
   * The height wheel `i`'s axle rides at, into `wheelRest`: the highest the tyre meets along the
   * tread, leaving out any face taller than an edge it climbs, which the
   * wheel stops against rather than rides up.
   */
  private tread(i: number, c: number, s: number) {
    const g = this.ground;
    const x = this.wheelX[i],
      y = this.wheelY[i];
    const under = g.heightAt(x, y);
    let best = under + ROVER.wheelRadius;
    for (let k = 1; k < TREAD.along.length; k++) {
      const a = TREAD.along[k];
      const h = g.heightAt(x + a * c, y + a * s);
      if (h - under > DRIVE.step + MAX_GRADE * Math.abs(a)) continue;
      const lifted = h + TREAD.lift[k];
      if (lifted > best) best = lifted;
    }
    this.wheelRest[i] = best;
  }
}
