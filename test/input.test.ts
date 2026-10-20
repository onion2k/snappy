/**
 * The controls: the keys, the touch stick's arithmetic, how they combine,
 * and the test API's override. The stick's element is the page's and is
 * not tested here; the stick itself is plain numbers in and out.
 */
import { describe, expect, it } from 'vitest';
import { Input, STICK, Stick } from '../src/input';

/** A key event as the browser sends one, enough of it for the input. */
function key(type: 'keydown' | 'keyup', code: string, extra: { repeat?: boolean; metaKey?: boolean } = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, key: code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...extra });
  return e;
}

function setup() {
  const target = new EventTarget();
  const input = new Input(target);
  const press = (code: string, extra = {}) => {
    const e = key('keydown', code, extra);
    target.dispatchEvent(e);
    return e;
  };
  const lift = (code: string) => target.dispatchEvent(key('keyup', code));
  return { target, input, press, lift };
}

describe('the keys', () => {
  it('drive with W and S, and turn with A and D, left positive', () => {
    const { input, press, lift } = setup();
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
    press('KeyW');
    expect(input.read()).toEqual({ throttle: 1, steer: 0 });
    press('KeyA');
    expect(input.read()).toEqual({ throttle: 1, steer: 1 });
    lift('KeyW');
    lift('KeyA');
    press('KeyS');
    press('KeyD');
    expect(input.read()).toEqual({ throttle: -1, steer: -1 });
  });

  it('drive with the arrows the same, and keep them from scrolling the page', () => {
    const { input, press, lift } = setup();
    for (const [code, throttle, steer] of [
      ['ArrowUp', 1, 0],
      ['ArrowDown', -1, 0],
      ['ArrowLeft', 0, 1],
      ['ArrowRight', 0, -1],
    ] as const) {
      const e = press(code);
      expect(e.defaultPrevented).toBe(true);
      expect(input.read()).toEqual({ throttle, steer });
      lift(code);
    }
    expect(press('Space').defaultPrevented).toBe(true);
    expect(press('KeyW').defaultPrevented).toBe(false);
  });

  it('cancel each other out when both ways are held', () => {
    const { input, press } = setup();
    press('KeyW');
    press('ArrowDown');
    press('KeyA');
    press('KeyD');
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
  });

  it('keep driving while one of two keys for the same way is still held', () => {
    const { input, press, lift } = setup();
    press('KeyW');
    press('ArrowUp');
    lift('KeyW');
    expect(input.read().throttle).toBe(1);
  });

  it('are all let go when the window loses focus, and a held key repeating after does not press it again', () => {
    const { target, input, press } = setup();
    press('KeyW');
    press('KeyA');
    input.stick.press(1, 0, -STICK.radius, 0, 0);
    target.dispatchEvent(new Event('blur'));
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
    press('KeyW', { repeat: true });
    expect(input.read().throttle).toBe(0);
    // a repeat is still kept from scrolling the page
    expect(press('ArrowUp', { repeat: true }).defaultPrevented).toBe(true);
  });

  it('drive nothing while shut, as over the album, and nothing held when it shut or pressed while it was drives after', () => {
    const { input, press, lift } = setup();
    // the arrows held to turn the album's pages, and W held from driving up to it
    press('KeyW');
    press('KeyQ');
    input.stick.press(1, 0, -STICK.radius, 0, 0);
    input.shut = true;
    expect(input.read(), 'what was held when it shut is let go').toEqual({ throttle: 0, steer: 0 });
    expect(input.look()).toBe(0);
    expect(input.stick.held).toBe(false);
    press('ArrowLeft');
    press('ArrowRight');
    press('KeyD');
    expect(input.read(), 'pressed while shut').toEqual({ throttle: 0, steer: 0 });
    // the arrows still kept from scrolling the page behind the album
    expect(press('ArrowUp').defaultPrevented).toBe(true);
    input.shut = false;
    expect(input.read(), 'and still held as it opens again').toEqual({ throttle: 0, steer: 0 });
    press('ArrowLeft', { repeat: true });
    expect(input.read().steer, 'a held arrow repeating is not a press').toBe(0);
    lift('ArrowLeft');
    lift('KeyW');
    // a fresh press after drives, as ever
    press('KeyW');
    expect(input.read().throttle).toBe(1);
    expect(input.shut).toBe(false);
  });

  it('are let go again when it opens, of anything pressed while shut that slipped through', () => {
    const { input, press } = setup();
    input.shut = true;
    press('KeyS');
    input.shut = false;
    expect(input.read().throttle).toBe(0);
  });

  it("take no notice of a key pressed with the command or control key, which is the browser's", () => {
    const { input, press } = setup();
    press('KeyW', { metaKey: true });
    expect(input.read().throttle).toBe(0);
  });

  it('are no longer heard once the input is disposed of', () => {
    const { input, press } = setup();
    input.dispose();
    press('KeyW');
    expect(input.read().throttle).toBe(0);
  });

  it('reads into the same object every frame', () => {
    const { input } = setup();
    expect(input.read()).toBe(input.read());
  });
});

describe('the stick', () => {
  const R = STICK.radius;

  it('drives forward when pushed up, and turns left when pushed left', () => {
    const s = new Stick();
    expect(s.press(7, 100, 100 - R, 100, 100)).toBe(true);
    expect(s.throttle).toBeCloseTo(1, 6);
    expect(s.steer).toBe(0);
    s.move(7, 100 - R, 100);
    expect(s.steer).toBeCloseTo(1, 6);
    expect(s.throttle).toBe(0);
    s.move(7, 100 + R, 100);
    expect(s.steer).toBeCloseTo(-1, 6);
    s.move(7, 100, 100 + R);
    expect(s.throttle).toBeCloseTo(-1, 6);
  });

  it('does nothing inside its dead zone, and rises smoothly from its edge', () => {
    const s = new Stick();
    s.press(1, 0, -R * STICK.dead * 0.9, 0, 0);
    expect(s.throttle).toBe(0);
    s.move(1, 0, -R * (STICK.dead + 0.01));
    expect(s.throttle).toBeGreaterThan(0);
    expect(s.throttle).toBeLessThan(0.05);
    s.move(1, 0, (-R * (STICK.dead + 1)) / 2);
    expect(s.throttle).toBeCloseTo(0.5, 6);
  });

  it('is held to its ring: pushed past it, it reads full and its knob stays on the ring', () => {
    const s = new Stick();
    s.press(1, 0, -3 * R, 0, 0);
    expect(s.throttle).toBeCloseTo(1, 6);
    expect(Math.hypot(s.knobX, s.knobY)).toBeCloseTo(R, 6);
  });

  it('goes diagonally when pushed diagonally, and straight when pushed nearly straight', () => {
    const s = new Stick();
    s.press(1, R * 0.7, -R * 0.7, 0, 0);
    expect(s.throttle).toBeGreaterThan(0.6);
    expect(s.steer).toBeLessThan(-0.6);
    // a thumb a few degrees off straight up still drives straight
    s.move(1, R * Math.sin(0.12), -R * Math.cos(0.12));
    expect(s.steer).toBe(0);
    expect(s.throttle).toBeCloseTo(1, 6);
  });

  it('follows the finger that took it, and lets go only for that one', () => {
    const s = new Stick();
    s.press(1, 0, -R, 0, 0);
    expect(s.press(2, 0, R, 0, 0)).toBe(false);
    s.move(2, 0, R);
    expect(s.throttle).toBeCloseTo(1, 6);
    s.release(2);
    expect(s.held).toBe(true);
    s.release(1);
    expect(s.held).toBe(false);
    expect([s.throttle, s.steer, s.knobX, s.knobY]).toEqual([0, 0, 0, 0]);
  });
});

describe('keys and the stick together, and the override', () => {
  it('takes whichever asks for more on each axis', () => {
    const { input, press } = setup();
    press('KeyW');
    input.stick.press(1, -STICK.radius * 0.6, -STICK.radius * 0.3, 0, 0);
    const d = input.read();
    expect(d.throttle).toBe(1);
    expect(d.steer).toBeGreaterThan(0.3);
    expect(d.steer).toBeLessThan(1);
  });

  it('drives from the stick alone', () => {
    const { input } = setup();
    input.stick.press(1, 0, STICK.radius, 0, 0);
    expect(input.read().throttle).toBeCloseTo(-1, 6);
  });

  it('gives way to the override, whatever is held', () => {
    const { input, press } = setup();
    press('KeyW');
    input.stick.press(1, 0, STICK.radius, 0, 0);
    input.override = { throttle: 0.25, steer: -0.5 };
    expect(input.read()).toEqual({ throttle: 0.25, steer: -0.5 });
    input.override = null;
    expect(input.read().throttle).toBe(1);
  });
});

describe('the keys that look round', () => {
  it('turn the view with Q to the left and E to the right, and both or neither not at all', () => {
    const { input, press, lift } = setup();
    expect(input.look()).toBe(0);
    press('KeyQ');
    expect(input.look()).toBe(1);
    press('KeyE');
    expect(input.look()).toBe(0);
    lift('KeyQ');
    expect(input.look()).toBe(-1);
    lift('KeyE');
    expect(input.look()).toBe(0);
  });

  it('do not drive, and are let go on blur', () => {
    const { target, input, press } = setup();
    press('KeyQ');
    expect(input.read()).toEqual({ throttle: 0, steer: 0 });
    target.dispatchEvent(new Event('blur'));
    expect(input.look()).toBe(0);
  });
});
