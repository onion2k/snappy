/**
 * The controls: W A S D or the arrows on a keyboard, and a thumb stick on a
 * phone, read as one throttle and one steer; and Q and E, which turn the
 * view round the rover. Tank controls, the same for
 * both: forward and back drive, left and right turn on the spot. Something
 * other than a person, the test API, can hold the controls instead.
 *
 * The stick here is only arithmetic, numbers in and numbers out; its
 * element and its pointer events are `touch.ts`, the page's.
 */
import type { Drive } from './rover';

/**
 * The stick's ring, in CSS pixels, and its dead zone, as a share of the
 * ring: a resting thumb wanders a few pixels, and that should not creep.
 * `snap` is how far off straight, as a tangent (about 12 degrees), a push
 * still counts as straight: a thumb is never quite square, and driving
 * straight is most of driving.
 */
export const STICK = { radius: 56, dead: 0.18, snap: 0.21 } as const;

/** One thumb's stick: where it was pressed, where the knob is, and what that asks for. */
export class Stick {
  /** The pointer holding it, or -1. */
  pointer = -1;
  /** The knob's offset from the middle of the ring, in pixels, held inside the ring: for drawing. */
  knobX = 0;
  knobY = 0;
  throttle = 0;
  steer = 0;
  private cx = 0;
  private cy = 0;

  get held(): boolean {
    return this.pointer !== -1;
  }

  /** A pointer comes down at (x, y) on a ring centred at (cx, cy). False if another already holds it. */
  press(id: number, x: number, y: number, cx: number, cy: number): boolean {
    if (this.held) return false;
    this.pointer = id;
    this.cx = cx;
    this.cy = cy;
    this.move(id, x, y);
    return true;
  }

  move(id: number, x: number, y: number): void {
    if (id !== this.pointer) return;
    const R = STICK.radius;
    let dx = x - this.cx,
      dy = y - this.cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) {
      dx *= R / d;
      dy *= R / d;
    }
    this.knobX = dx;
    this.knobY = dy;
    // the push past the dead zone, from nought at its edge to one at the ring, the way it points
    const m = Math.min(d, R) / R;
    const scale = m <= STICK.dead ? 0 : (m - STICK.dead) / (1 - STICK.dead) / m;
    // up the screen is forward, and left is a left turn, which is the positive way
    let throttle = (-dy / R) * scale,
      steer = (-dx / R) * scale;
    if (Math.abs(steer) < STICK.snap * Math.abs(throttle)) {
      throttle = (throttle < 0 ? -1 : 1) * Math.sqrt(throttle * throttle + steer * steer);
      steer = 0;
    } else if (Math.abs(throttle) < STICK.snap * Math.abs(steer)) {
      steer = (steer < 0 ? -1 : 1) * Math.sqrt(throttle * throttle + steer * steer);
      throttle = 0;
    }
    // plus nought, which makes a negative nought plain nought
    this.throttle = throttle + 0;
    this.steer = steer + 0;
  }

  /** The pointer lifts, or is lost. Only the one holding it lets it go. */
  release(id: number): void {
    if (id === this.pointer) this.reset();
  }

  reset(): void {
    this.pointer = -1;
    this.knobX = this.knobY = this.throttle = this.steer = 0;
  }
}

/** The keys that drive, by `KeyboardEvent.code`: where the key is, so W A S D are under the same fingers on every layout. */
const KEYS: Record<string, number> = {
  KeyW: 1,
  ArrowUp: 2,
  KeyS: 4,
  ArrowDown: 8,
  KeyA: 16,
  ArrowLeft: 32,
  KeyD: 64,
  ArrowRight: 128,
  KeyQ: 256,
  KeyE: 512,
};
const FORWARD = 1 | 2,
  BACK = 4 | 8,
  LEFT = 16 | 32,
  RIGHT = 64 | 128,
  LOOK_LEFT = 256,
  LOOK_RIGHT = 512;
/** Keys the page would scroll for: kept from it, repeats and all. */
const QUIET = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  /** Driving held by something other than a person: read before anything else while it is set. */
  override: Drive | null = null;
  readonly stick = new Stick();
  /** The keys held, one bit each. */
  private down = 0;
  // read into this each frame, so reading makes nothing
  private readonly drive: Drive = { throttle: 0, steer: 0 };
  private readonly target: EventTarget;

  /** Listens on `target`, the window: keys, and the blur that lets them all go. */
  constructor(target: EventTarget) {
    this.target = target;
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private readonly onDown = (e: Event) => {
    const k = e as KeyboardEvent;
    if (QUIET.has(k.code)) e.preventDefault();
    // a repeat is never a press: a key held through a blur stays let go until it is pressed again
    if (k.repeat || k.metaKey || k.ctrlKey || k.altKey) return;
    this.down |= KEYS[k.code] ?? 0;
  };

  private readonly onUp = (e: Event) => {
    this.down &= ~(KEYS[(e as KeyboardEvent).code] ?? 0);
  };

  /** The window lost focus: a key let go elsewhere is never heard, so everything is let go now. */
  private readonly onBlur = () => this.release();

  /** Let go of every key and the stick. */
  release(): void {
    this.down = 0;
    this.stick.reset();
  }

  /** What the controls ask for now: the override if there is one, or the keys and the stick, whichever asks for more. */
  read(): Drive {
    const d = this.drive;
    if (this.override) {
      d.throttle = this.override.throttle;
      d.steer = this.override.steer;
      return d;
    }
    const down = this.down;
    const throttle = (down & FORWARD ? 1 : 0) - (down & BACK ? 1 : 0),
      steer = (down & LEFT ? 1 : 0) - (down & RIGHT ? 1 : 0);
    const s = this.stick;
    d.throttle = Math.abs(s.throttle) > Math.abs(throttle) ? s.throttle : throttle;
    d.steer = Math.abs(s.steer) > Math.abs(steer) ? s.steer : steer;
    return d;
  }

  /** Which way Q and E turn the view now: one for Q (round to the left), minus one for E, nought for both or neither. */
  look(): number {
    return (this.down & LOOK_LEFT ? 1 : 0) - (this.down & LOOK_RIGHT ? 1 : 0);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.release();
  }
}
