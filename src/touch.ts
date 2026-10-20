/**
 * The thumb stick's element: a ring and a knob bottom left, shown on a
 * touch screen and nowhere else, feeding the `Stick` from pointer events.
 * It is the page's, so it is seen in the smoke tests and not unit-tested;
 * everything it decides is in the `Stick`.
 */
import { STICK, type Stick } from './input';

/** The square a thumb can land in, in CSS pixels: wider than the ring, so a thumb that misses it by a little still takes it. */
const ZONE = 176;
const KNOB = 48;
/** How far in from the screen's corner, past the safe area. */
const INSET = 20;

export interface StickElement {
  readonly element: HTMLElement;
  dispose(): void;
}

/**
 * Put the stick on the page. It shows on a coarse pointer, and also the
 * first time a finger touches anything, for a laptop with a touch screen.
 */
export function mountStick(stick: Stick, parent: HTMLElement): StickElement {
  const zone = document.createElement('div');
  zone.className = 'stick';
  zone.setAttribute('aria-hidden', 'true');
  Object.assign(zone.style, {
    position: 'fixed',
    left: `calc(${INSET}px + env(safe-area-inset-left, 0px))`,
    bottom: `calc(${INSET}px + env(safe-area-inset-bottom, 0px))`,
    width: `${ZONE}px`,
    height: `${ZONE}px`,
    display: 'none',
    touchAction: 'none',
    userSelect: 'none',
    webkitUserSelect: 'none',
    zIndex: '10',
  });
  const ring = document.createElement('div');
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${ZONE / 2 - STICK.radius}px`,
    top: `${ZONE / 2 - STICK.radius}px`,
    width: `${STICK.radius * 2}px`,
    height: `${STICK.radius * 2}px`,
    borderRadius: '50%',
    boxSizing: 'border-box',
    border: '3px solid rgba(255, 255, 255, 0.7)',
    background: 'rgba(30, 40, 50, 0.18)',
    opacity: '0.6',
    transition: 'opacity 120ms',
    pointerEvents: 'none',
  });
  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position: 'absolute',
    left: `${ZONE / 2 - KNOB / 2}px`,
    top: `${ZONE / 2 - KNOB / 2}px`,
    width: `${KNOB}px`,
    height: `${KNOB}px`,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.9)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
    pointerEvents: 'none',
  });
  zone.append(ring, knob);
  parent.append(zone);

  // the knob is moved by a transform each move: the one string a move makes, which the style needs
  const draw = () => {
    knob.style.transform = `translate(${stick.knobX}px, ${stick.knobY}px)`;
    ring.style.opacity = stick.held ? '1' : '0.6';
  };
  const show = () => {
    zone.style.display = 'block';
  };

  const down = (e: PointerEvent) => {
    const box = zone.getBoundingClientRect();
    if (!stick.press(e.pointerId, e.clientX, e.clientY, box.left + ZONE / 2, box.top + ZONE / 2)) return;
    zone.setPointerCapture(e.pointerId);
    e.preventDefault();
    draw();
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== stick.pointer) return;
    stick.move(e.pointerId, e.clientX, e.clientY);
    draw();
  };
  const up = (e: PointerEvent) => {
    stick.release(e.pointerId);
    draw();
  };
  const touched = (e: PointerEvent) => {
    if (e.pointerType === 'touch') show();
  };

  const coarse = matchMedia('(pointer: coarse)');
  const fits = () => {
    if (coarse.matches) show();
  };
  fits();
  coarse.addEventListener('change', fits);
  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  zone.addEventListener('lostpointercapture', up);
  window.addEventListener('pointerdown', touched, { capture: true });

  return {
    element: zone,
    dispose() {
      coarse.removeEventListener('change', fits);
      window.removeEventListener('pointerdown', touched, { capture: true });
      stick.reset();
      zone.remove();
    },
  };
}
