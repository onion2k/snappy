/**
 * The viewfinder: the player looking out through the rover's own camera eye, in first person, to take a picture. It
 * holds where the lens is and which way it looks, the lens's focal length and so the frame's height, where it is
 * focused and whether by hand or by itself, and how fast the view is turning, which the grade reads at the shutter. It
 * knows nothing of the page or the renderer: the page hands it the drag, the wheel and the tap, and reads back the
 * eye, the field of view and the focus for the picture and its blur, and the head's turn for the rover's model.
 *
 * The look is held to half a turn either way of the rover's heading, so the head never turns through its own back,
 * and from 50 degrees down to 60 up, past which the mast is in the way below and the head's hinge above. The rover
 * stands still while the player looks: the page does not drive it, and the eye is placed from where it was entered.
 *
 * The lens is a full-frame camera's, its sensor 24 mm tall, so a focal length means what it means on a real camera:
 * 24 mm is a wide view 53 degrees tall, 50 is the normal lens at 27, and 135 a long one at 10. Its aperture is fixed
 * at f/2.8, a fast lens wide open: at the few metres a duck is shot from, that is a depth of field of tens of
 * centimetres, so focus is a thing the player can get wrong and the blur shows it.
 *
 * Every number that changes as it is used is kept in typed arrays, the `Shot`'s own among them, since V8 boxes a
 * fraction written to an object's field: nothing here allocates once it is made, and the page asks it every frame.
 */
import { HEAD } from './rover';
import { castInto, HIT, seenPoints, type Subjects } from './sight';
import type { Ground } from './world/types';

const DEG = Math.PI / 180;

/** The lens: its focal lengths in mm, the sensor's height in mm, and its fixed aperture as an f-number. */
export const LENS = { least: 24, most: 135, start: 50, sensor: 24, aperture: 2.8 } as const;

/** How far the look turns either way of the rover's heading, and tilts down and up, in radians. */
export const LOOK = { turn: Math.PI, down: 50 * DEG, up: 60 * DEG } as const;

/**
 * Where the lens is on the rover, in units, from `models/rover.ts`: the mast stands `mast` ahead of the rocker
 * pivots and turns the head `HEAD.height` over them; the lens's glass is `ahead` in front of the head's turn and `up`
 * over it, and so swings with the head's turn and tilt.
 */
export const EYE = { mast: 1.0, ahead: 1.1, up: 0.64 } as const;

/**
 * Focus distances, in units: the nearest the lens focuses (twenty centimetres, a macro's close, and well clear of the
 * longest lens's own focal length, at which the thin lens's sums run to infinity); how far it focuses at the sky or
 * past the world's edge, where all of the world is as good as infinitely far; and where it starts.
 */
export const FOCUS = { nearest: 2, far: 5000, start: 50 } as const;

/**
 * How the turn rate is eased, its time constant in seconds: a drag arrives as a few events a frame or none, so the
 * rate a frame at a time leaps and falls back, and a tenth of a second evens that out to how the hand is moving.
 */
const RATE_EASE = 0.1;

/** The frame's height in degrees for a focal length in mm, through the full-frame sensor. */
export function fovOf(focal: number): number {
  return (2 * Math.atan(LENS.sensor / 2 / focal)) / DEG;
}

/**
 * A shot's focus as a depth along the view, which is what the depth-of-field pass reads: the focus is a distance along
 * the ray through the focus mark (`mark`, across and up from the middle, minus one to one), so off the middle it is that
 * much nearer the lens's plane. One sum for the viewfinder and for the album's pages, so a page is blurred as the
 * picture was.
 */
export function focusDepthOf(shot: Shot, mark: ArrayLike<number>): number {
  const v = shot.v,
    th = LENS.sensor / 2 / v[2];
  const a = mark[0] * th * v[3],
    b = mark[1] * th;
  return v[4] / Math.sqrt(1 + a * a + b * b);
}

/**
 * A number held between two. Only for what the page asks now and then, a drag or the wheel: what runs every frame holds
 * its numbers with `Math.min` and `Math.max`, which V8 always inlines, since a fraction handed to this where it was not
 * inlined was boxed, going in and coming back.
 */
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * A picture as the grade reads it: where the lens is, which way it looks, its lens and focus, the frame's shape, and
 * how fast it was turning. Kept in arrays and read through names, so the viewfinder writes one every frame without
 * boxing; a test makes its own and sets what it likes. Angles are in radians: `yaw` anticlockwise from +x, `pitch` up.
 */
export class Shot {
  readonly eye = new Float64Array(3);
  /** yaw, pitch, focal (mm), aspect (width over height), focus (units), aperture (f-number), turn rate (rad/s). */
  readonly v = new Float64Array([0, 0, LENS.start, 1.6, FOCUS.start, LENS.aperture, 0]);
  get yaw(): number {
    return this.v[0];
  }
  set yaw(a: number) {
    this.v[0] = a;
  }
  get pitch(): number {
    return this.v[1];
  }
  set pitch(a: number) {
    this.v[1] = a;
  }
  get focal(): number {
    return this.v[2];
  }
  set focal(mm: number) {
    this.v[2] = mm;
  }
  get aspect(): number {
    return this.v[3];
  }
  set aspect(a: number) {
    this.v[3] = a;
  }
  get focus(): number {
    return this.v[4];
  }
  set focus(d: number) {
    this.v[4] = d;
  }
  get aperture(): number {
    return this.v[5];
  }
  set aperture(n: number) {
    this.v[5] = n;
  }
  get turnRate(): number {
    return this.v[6];
  }
  set turnRate(r: number) {
    this.v[6] = r;
  }
  /** The frame's height, in degrees, from the lens. */
  get fov(): number {
    return fovOf(this.v[2]);
  }
}

/**
 * Where a camera at `shot`'s eye is aimed to look along its look, `ahead` units out, into `out`: the renderer's camera
 * is a position and a target, and the viewfinder and an album page both aim it so. Any distance does.
 */
export function aimOf(shot: Shot, ahead: number, out: Float64Array): void {
  const v = shot.v,
    e = shot.eye,
    cp = Math.cos(v[1]);
  out[0] = e[0] + Math.cos(v[0]) * cp * ahead;
  out[1] = e[1] + Math.sin(v[0]) * cp * ahead;
  out[2] = e[2] + Math.sin(v[1]) * ahead;
}

/**
 * A shot's frame as a camera: the eye, the way it looks, the frame's right and up, and the tangents of half its
 * height and width; and a point put on the screen by it, in `at`: across and up from the middle, minus one to one at
 * the frame's edges, and its depth along the view. A screen point here has y up, as the renderer's clip space does.
 */
export class ViewFrame {
  /** eye 0-2, forward 3-5, right 6-8, up 9-11, tan of half the height 12, of half the width 13. */
  readonly m = new Float64Array(14);
  readonly at = new Float64Array(3);

  of(shot: Shot): void {
    const m = this.m,
      v = shot.v;
    const cy = Math.cos(v[0]),
      sy = Math.sin(v[0]),
      cp = Math.cos(v[1]),
      sp = Math.sin(v[1]);
    m[0] = shot.eye[0];
    m[1] = shot.eye[1];
    m[2] = shot.eye[2];
    m[3] = cp * cy;
    m[4] = cp * sy;
    m[5] = sp;
    // right is the heading turned a quarter clockwise, and level, so its height is nought and left out of the sums;
    // up is square to both
    m[6] = sy;
    m[7] = -cy;
    m[8] = 0;
    m[9] = -sp * cy;
    m[10] = -sp * sy;
    m[11] = cp;
    m[12] = LENS.sensor / 2 / v[2];
    m[13] = m[12] * v[3];
  }

  /** Put `p` on the screen into `at`; false if it is not in front of the eye, when `at` is left as it was. */
  project(p: ArrayLike<number>): boolean {
    const m = this.m;
    const dx = p[0] - m[0],
      dy = p[1] - m[1],
      dz = p[2] - m[2];
    const depth = dx * m[3] + dy * m[4] + dz * m[5];
    if (!(depth > 1e-6)) return false;
    this.at[0] = (dx * m[6] + dy * m[7]) / (depth * m[13]);
    this.at[1] = (dx * m[9] + dy * m[10] + dz * m[11]) / (depth * m[12]);
    this.at[2] = depth;
    return true;
  }

  /** The way through the screen point (nx, ny), as a unit vector into `out`. */
  ray(nx: number, ny: number, out: Float64Array): void {
    const m = this.m;
    const a = nx * m[13],
      b = ny * m[12];
    const x = m[3] + a * m[6] + b * m[9],
      y = m[4] + a * m[7] + b * m[10],
      z = m[5] + b * m[11];
    const k = 1 / Math.sqrt(x * x + y * y + z * z);
    out[0] = x * k;
    out[1] = y * k;
    out[2] = z * k;
  }
}

export type FocusMode = 'auto' | 'manual';

/** What the test API reads of a viewfinder, as plain numbers. */
export interface ViewfinderState {
  active: boolean;
  eye: number[];
  yaw: number;
  pitch: number;
  focal: number;
  fov: number;
  focus: number;
  mode: FocusMode;
  focused: number;
  turnRate: number;
  headYaw: number;
  headPitch: number;
}

export class Viewfinder {
  active = false;
  mode: FocusMode = 'auto';
  /** The oddity the focus is on, by its index among the subjects, or -1 for the ground or the sky. A whole number. */
  focused = -1;
  /**
   * Where the focus is on the screen, across and up from the middle, minus one to one, y up: the point tapped, held
   * there as the view turns, as a camera's focus point is; on auto, the middle of the oddity it found, or the middle of
   * the frame. The page draws the focus mark here, and the blur's plane goes through it (`focusDepth`).
   */
  readonly mark = new Float64Array(2);
  /** The picture as it stands: the eye, the look, the lens, the focus and the turn rate, which the grade reads. */
  readonly shot = new Shot();
  /** The rover's rocker pivots, x, y, z, and its heading, as entered: the eye is placed from them. */
  private readonly base = new Float64Array(4);
  /** How far the view has turned since the last update, in radians across the frame. */
  private readonly moved = new Float64Array(1);
  private readonly frame = new ViewFrame();
  private readonly dir = new Float64Array(3);
  private readonly hit = new Float64Array(2);
  private readonly middle = new Float64Array(3);
  /** How far each oddity is from the middle of the frame, squared, or -1 out of frame: made to the subjects' count once. */
  private near = new Float64Array(0);

  /** Where the lens is. */
  get eye(): Float64Array {
    return this.shot.eye;
  }
  get yaw(): number {
    return this.shot.v[0];
  }
  get pitch(): number {
    return this.shot.v[1];
  }
  get focal(): number {
    return this.shot.v[2];
  }
  /** The frame's height in degrees, for the page's camera. */
  get fov(): number {
    return fovOf(this.shot.v[2]);
  }
  get focus(): number {
    return this.shot.v[4];
  }
  /**
   * The focus as a depth along the view, which is what the depth-of-field pass reads: the focus is a distance along
   * the ray through the mark, so off the middle it is that much nearer the lens's plane. For the page, now and then.
   */
  get focusDepth(): number {
    return focusDepthOf(this.shot, this.mark);
  }
  get turnRate(): number {
    return this.shot.v[6];
  }
  /** The screen's width over its height, which the page sets as the window changes. */
  get aspect(): number {
    return this.shot.v[3];
  }
  set aspect(a: number) {
    if (a > 0 && Number.isFinite(a)) this.shot.v[3] = a;
  }
  /** The head's turn for the rover's model, relative to its body: the look's own, since the rover stands still. */
  get headYaw(): number {
    return this.shot.v[0] - this.base[3];
  }
  get headPitch(): number {
    return this.shot.v[1];
  }

  /** Into the viewfinder at the rover's eye, looking level along its heading, focus on auto. The lens is kept. */
  enter(rover: { x: number; y: number; z: number; yaw: number }): void {
    const b = this.base;
    b[0] = rover.x;
    b[1] = rover.y;
    b[2] = rover.z;
    b[3] = rover.yaw;
    this.shot.v[0] = rover.yaw;
    this.shot.v[1] = 0;
    this.shot.v[6] = 0;
    this.moved[0] = 0;
    this.mode = 'auto';
    this.focused = -1;
    this.mark[0] = this.mark[1] = 0;
    this.active = true;
    this.place();
  }

  leave(): void {
    this.active = false;
  }

  /**
   * Turn the view by `turn` radians anticlockwise and tilt it `tilt` up, held to the look's limits. What it turns
   * counts toward the turn rate, as it is seen across the frame: a turn looking well up or down sweeps less of it.
   */
  look(turn: number, tilt: number): void {
    if (!this.active || !Number.isFinite(turn) || !Number.isFinite(tilt)) return;
    const v = this.shot.v,
      heading = this.base[3];
    const yaw = heading + clamp(v[0] - heading + turn, -LOOK.turn, LOOK.turn);
    const pitch = clamp(v[1] + tilt, -LOOK.down, LOOK.up);
    const across = (yaw - v[0]) * Math.cos(v[1]),
      up = pitch - v[1];
    this.moved[0] += Math.sqrt(across * across + up * up);
    v[0] = yaw;
    v[1] = pitch;
    this.place();
  }

  /** A longer lens (a factor over one) or a wider one, held to the lens's ends. */
  zoomBy(factor: number): void {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    this.shot.v[2] = clamp(this.shot.v[2] * factor, LENS.least, LENS.most);
  }

  /**
   * Focus by hand on what is under the screen point (nx, ny), each from minus one to one, y up, and hold it there
   * until `auto`. A point off the screen is not a tap on the picture, and does nothing.
   */
  focusAt(nx: number, ny: number, g: Ground, subjects: Subjects | null): void {
    if (!this.active || !(Math.abs(nx) <= 1) || !(Math.abs(ny) <= 1)) return;
    this.frame.of(this.shot);
    this.frame.ray(nx, ny, this.dir);
    this.focusAlong(g, subjects);
    this.mark[0] = nx;
    this.mark[1] = ny;
    this.mode = 'manual';
  }

  /** Back to auto focus, which takes hold on the next update. */
  auto(): void {
    this.mode = 'auto';
  }

  /**
   * A frame of `dt` seconds: the turn rate eased toward how far the view turned since the last, and, on auto, the
   * focus put on the oddity nearest the middle of the frame among those in it and seen, or else on what the middle
   * of the frame looks at.
   */
  update(dt: number, g: Ground, subjects: Subjects | null): void {
    if (!this.active || !(dt > 0)) return;
    const v = this.shot.v;
    const k = 1 - Math.exp(-dt / RATE_EASE);
    v[6] += (this.moved[0] / dt - v[6]) * k;
    this.moved[0] = 0;
    if (this.mode === 'auto') this.autofocus(g, subjects);
  }

  /** A copy of what it holds, as plain numbers, for the test API. */
  state(): ViewfinderState {
    return {
      active: this.active,
      eye: [...this.shot.eye],
      yaw: this.yaw,
      pitch: this.pitch,
      focal: this.focal,
      fov: this.fov,
      focus: this.focus,
      mode: this.mode,
      focused: this.focused,
      turnRate: this.turnRate,
      headYaw: this.headYaw,
      headPitch: this.headPitch,
    };
  }

  /** The eye on the head: the mast ahead of the pivots along the body, and the lens on the head turned and tilted. */
  private place(): void {
    const b = this.base,
      v = this.shot.v,
      e = this.shot.eye;
    const cp = Math.cos(v[1]),
      sp = Math.sin(v[1]);
    const out = EYE.ahead * cp - EYE.up * sp;
    e[0] = b[0] + Math.cos(b[3]) * EYE.mast + Math.cos(v[0]) * out;
    e[1] = b[1] + Math.sin(b[3]) * EYE.mast + Math.sin(v[0]) * out;
    e[2] = b[2] + HEAD.height + EYE.ahead * sp + EYE.up * cp;
  }

  /** The focus on what the ray in `dir` meets first, held to the lens's range. */
  private focusAlong(g: Ground, subjects: Subjects | null): void {
    castInto(g, subjects, this.shot.eye, this.dir, FOCUS.far, this.hit);
    this.shot.v[4] = Math.max(FOCUS.nearest, Math.min(FOCUS.far, this.hit[0]));
    this.focused = this.hit[1] >= 0 ? this.hit[1] | 0 : -1;
  }

  /**
   * The oddities in frame, nearest the middle first, are tried until one is seen; the focus is put on its middle. A
   * frame holds a few at most, so trying them in turn is cheaper than sorting them.
   */
  private autofocus(g: Ground, subjects: Subjects | null): void {
    const f = this.frame;
    f.of(this.shot);
    const n = subjects ? subjects.count : 0;
    if (this.near.length < n) this.near = new Float64Array(n);
    const near = this.near,
      aspect = this.shot.v[3],
      m = this.middle;
    for (let i = 0; i < n; i++) {
      near[i] = -1;
      subjects!.middle(i, m);
      if (!f.project(m)) continue;
      const x = f.at[0],
        y = f.at[1];
      if (x < -1 || x > 1 || y < -1 || y > 1) continue;
      near[i] = x * x * aspect * aspect + y * y;
    }
    for (let tries = 0; tries < n; tries++) {
      let best = -1;
      for (let i = 0; i < n; i++) if (near[i] >= 0 && (best < 0 || near[i] < near[best])) best = i;
      if (best < 0) break;
      if (seenPoints(g, this.shot.eye, subjects!, best) > 0) {
        subjects!.middle(best, m);
        const e = this.shot.eye;
        const dx = m[0] - e[0],
          dy = m[1] - e[1],
          dz = m[2] - e[2];
        this.shot.v[4] = Math.max(FOCUS.nearest, Math.min(FOCUS.far, Math.sqrt(dx * dx + dy * dy + dz * dz)));
        this.focused = best;
        // it was found in frame, so it is drawn in front of the lens and the mark is where
        f.project(m);
        this.mark[0] = f.at[0];
        this.mark[1] = f.at[1];
        return;
      }
      near[best] = -1;
    }
    f.ray(0, 0, this.dir);
    this.focusAlong(g, subjects);
    this.mark[0] = this.mark[1] = 0;
  }
}

/** The turn rate past which a number is not believed: a hundred turns a second. */
const WILD_RATE = 200 * Math.PI;

/**
 * What is wrong with a viewfinder, as lines saying what: a number that is not one, the look turned or tilted past its
 * limits, the lens past its ends, the focus outside its range, or the turn rate below nought or wild. For the
 * invariants, the fuzzer and the test API.
 */
export function viewfinderProblems(vf: Viewfinder): string[] {
  const s = vf.shot,
    v = s.v,
    e = s.eye;
  const out: string[] = [];
  for (let k = 0; k < 3; k++) if (!Number.isFinite(e[k])) return [`the viewfinder's eye is not a number: ${e[k]}`];
  for (let k = 0; k < v.length; k++) if (!Number.isFinite(v[k])) return [`the viewfinder is not a number: ${v[k]}`];
  // the look is held to its limits exactly, but the turn is worked from the heading and back, a rounding either way
  const slack = 1e-9;
  if (Math.abs(vf.headYaw) > LOOK.turn + slack)
    out.push(`the viewfinder is turned ${vf.headYaw.toFixed(3)} off the heading`);
  if (v[1] < -LOOK.down - slack || v[1] > LOOK.up + slack) out.push(`the viewfinder's pitch is ${v[1].toFixed(3)}`);
  if (v[2] < LENS.least || v[2] > LENS.most) out.push(`the viewfinder's lens is ${v[2]} mm`);
  if (v[4] < FOCUS.nearest || v[4] > FOCUS.far) out.push(`the viewfinder's focus is at ${v[4]}`);
  if (v[6] < 0 || v[6] > WILD_RATE) out.push(`the viewfinder's turn rate is ${v[6]}`);
  if (!(v[3] > 0)) out.push(`the viewfinder's aspect is ${v[3]}`);
  if (vf.focused !== HIT.ground && (vf.focused < 0 || !Number.isInteger(vf.focused)))
    out.push(`the viewfinder is focused on ${vf.focused}`);
  return out;
}
