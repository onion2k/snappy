/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens in the world happens in `game.ts`; this reads the keys and the
 * thumb stick, steps the game, moves the chase camera after the rover, and
 * draws the frame through the scene on the game path of artshape-render,
 * and makes the sound's context on the first gesture. There is no game
 * logic here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { GameRenderer } from 'artshape-render/game/renderer';
import { ChaseCamera, dragOrbit } from './camera';
import { createApi, type CameraState } from './debug';
import { frameCost } from './frame-cost';
import { Game } from './game';
import { Input } from './input';
import { daylight } from './look';
import { WIND } from './models/grass';
import { Progress } from './progress';
import { seeded } from './random';
import { Scene } from './scene';
import { FrameRung, RUNG_STEPS } from './view';
import { GameSound, LazySound } from './sound';
import { mountStick } from './touch';

/** How many millimetres a world unit is: the renderer fixes a few real sizes by it. */
const MM_PER_UNIT = 100;
const LIGHT_CAPACITY = 16,
  EFFECT_CAPACITY = 16,
  PARTICLE_CAPACITY = 1024;
/**
 * The camera's nearest and farthest, in units: near enough for the rover close to, and far enough for the backdrop's
 * mountains, which stand some four hundred metres from the world's middle.
 */
const NEAR = 1,
  FAR = 7000;
/** How much a notch of the wheel zooms: a factor a pixel of its turn. */
const WHEEL_ZOOM = 0.0015;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;
const stats = document.getElementById('stats')!;
const help = document.getElementById('help')!;

main().catch((err: unknown) => {
  bootMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
});

async function main() {
  // ---- the renderer ----

  const ctx = await createContext(canvas);
  bootMsg.textContent = 'compiling shaders…';
  const renderer = new GameRenderer(ctx, LIGHT_CAPACITY, EFFECT_CAPACITY, PARTICLE_CAPACITY, MM_PER_UNIT);
  await daylight(renderer, ctx);
  const cam = renderer.camera;
  cam.fov = 40;
  cam.near = NEAR;
  cam.far = FAR;

  // ---- the game, and what it says has happened ----

  const query = new URLSearchParams(location.search);
  const progress = new Progress();
  /** What has happened, a line each, for the test API: nothing is told yet. */
  const eventLog: string[] = [];
  // ?seed=N makes chance the same from before the game is built, for a test that wants the same game every run
  const seed = query.get('seed');
  // The context is not made at boot: it costs about a tenth of a second and is silent until a gesture anyway, so it
  // is made when the user first acts, and the boot gate measures the page without it. Until then the sound is a
  // silence that keeps the save's mute and volume for when it is made. The page makes the context, because which one
  // the browser has (Safari's older ones only a webkitAudioContext) is the page's to say.
  const sound = new LazySound({
    volume: progress.save.volume,
    muted: progress.save.muted,
    make: (options) =>
      new GameSound({
        context: new AudioContext(),
        // The sound's chance is its own, one past the game's: a sound that drew from the game's source would move
        // everything the game does with chance. Seeded, a run's sound is repeatable.
        random: seed !== null ? seeded(+seed + 1) : undefined,
        ...options,
      }),
  });
  bootMsg.textContent = 'making the world…';
  const game = new Game(progress, seed !== null ? { random: seeded(+seed) } : {});

  // a browser starts the context only on a gesture, so the first key or click makes it; until then a sound is silent
  const wake = () => sound.wake();
  addEventListener('keydown', wake, { once: true });
  addEventListener('pointerdown', wake, { once: true });
  const setMuted = (on: boolean) => {
    sound.mute(on);
    progress.setMuted(on);
  };
  addEventListener('keydown', (e) => {
    if (!e.repeat && e.key.toLowerCase() === 'm') setMuted(!sound.muted);
  });

  // ---- the controls, and the camera that follows ----

  const input = new Input(window);
  mountStick(input.stick, document.body);
  const chase = new ChaseCamera();
  chase.snap(game.rover, game.ground);
  /**
   * A camera set by hand through the test API's `look`, which holds until the rover is driven, teleported or the view
   * zoomed: the look pictures are taken from it.
   */
  let manual: { target: [number, number, number]; position: [number, number, number]; distance: number } | null = null;

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      manual = null;
      chase.zoomBy(Math.exp(e.deltaY * WHEEL_ZOOM));
    },
    { passive: false },
  );
  // a drag on the view with one pointer, a mouse or a finger (the stick is an element of its own and takes its own),
  // turns the camera round the rover to look about; two fingers pinch, the camera taken out as they close and in as
  // they open
  const fingers = new Map<number, { x: number; y: number }>();
  let spread = 0;
  const turned = new Float64Array(2);
  const apart = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // kept to the view as it is dragged off it, where the browser can: it refuses a pointer it has already let go of
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // the drag still turns the view while it is over it
    }
    if (fingers.size === 2) spread = apart();
  });
  canvas.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x,
      dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    if (fingers.size === 1) {
      manual = null;
      dragOrbit(dx, dy, canvas.clientHeight, turned);
      chase.orbitBy(turned[0], turned[1]);
      return;
    }
    if (fingers.size !== 2) return;
    const now = apart();
    if (spread > 0 && now > 0) {
      manual = null;
      chase.zoomBy(spread / now);
    }
    spread = now;
  });
  const lift = (e: PointerEvent) => {
    fingers.delete(e.pointerId);
    spread = 0;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  // ---- the scene: everything the first frame needs, before the page says it is ready ----

  bootMsg.textContent = 'drawing the world…';
  const scene = new Scene(game.map, game.ground, renderer);
  await scene.build(chase.target);
  renderer.wind = { ...WIND };

  let width = 1,
    height = 1;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    cam.aspect = width / height;
    scene.lens[0] = cam.fov;
    scene.lens[1] = cam.aspect;
    renderer.resize(width, height);
  };
  addEventListener('resize', resize);
  resize();

  /** Whether a frame is being measured: the frame loop stands still while one is. */
  let measuring = false;

  /**
   * What a frame of the scene as it stands costs, drawn to a texture of our own rather than the canvas, so no wait
   * to be shown is counted. The frame loop draws nothing meanwhile: its frame, sixty times a second, fell in one
   * sample in three and read as a frame taking twice as long.
   */
  async function measureFrame(warm?: number): Promise<number> {
    const target = ctx.device.createTexture({
      label: 'measuring target',
      size: [width, height],
      format: ctx.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const view = target.createView();
    measuring = true;
    try {
      return await frameCost(
        () => {
          return renderer.frame(view, 'redraw', 1 / 60);
        },
        () => ctx.device.queue.onSubmittedWorkDone(),
        warm,
      );
    } finally {
      measuring = false;
      target.destroy();
    }
  }

  // ---- each frame ----

  /**
   * The rung the page draws at: stepped down, one at a time, while the frames run long, and never while a frame is
   * being measured or a test is stepping the game (`?rung=N` sets one, for a test that wants a rung's picture).
   */
  const rung = new FrameRung();
  const toRung = (k: number) => {
    const step = RUNG_STEPS[Math.max(0, Math.min(RUNG_STEPS.length - 1, k))];
    scene.setTreesRing(step.trees);
    renderer.economy.grass = step.grass;
    renderer.economy.occlusion = step.finish;
    if (!step.finish) renderer.economy.antialias = 'fxaa';
  };
  const asked = query.get('rung');
  if (asked !== null) {
    rung.rung = Math.max(0, Math.min(RUNG_STEPS.length - 1, +asked || 0));
    toRung(rung.rung);
  }

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    // whoever is looking: the chase camera, which the rover's head turns to when it has idled a while
    game.rover.lookAt(chase.position[0], chase.position[1], chase.position[2]);
    game.step(dt, input.read());
    chase.keyTurn = input.look();
    if (chase.keyTurn !== 0) manual = null;
    chase.update(game.rover, game.ground, dt);
    // after the game, so that a game that is not stepping has no music
    sound.step(dt);
  }
  /**
   * One frame drawn. `settled` is for a frame whose picture must be the whole of the game's state and the camera's,
   * nothing a frame behind: the test API's, a paused frame and the first. Only the frame loop's playing frames spread a
   * chunk crossing's work over two (`frameWork` in `view.ts`).
   */
  function draw(dt: number, settled = true) {
    const target = manual ? manual.target : chase.target,
      eye = manual ? manual.position : chase.position;
    for (let k = 0; k < 3; k++) {
      cam.target[k] = target[k];
      cam.position[k] = eye[k];
    }
    renderer.time = game.t;
    scene.frame(game, eye, target, dt, settled);
    cam.update();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms`;
  }
  // the first frame drawn before the page is ready, so everything it compiles is in
  draw(0);
  await renderer.prepare();
  await renderer.ready;
  boot.classList.add('gone');
  stats.hidden = false;
  help.hidden = false;

  // ---- the test API, and the frame loop ----

  // ?paused=1 starts the game stopped where it was built, so a test sees the
  // same world every run: no frame of its own has run, and every one after is
  // the test's, of a length it chose
  let paused = query.has('paused');
  let ready = false;
  let bootMs = 0;
  const cameraState = (): CameraState => {
    const target = manual ? manual.target : chase.target,
      position = manual ? manual.position : chase.position;
    return {
      target: [target[0], target[1], target[2]],
      position: [position[0], position[1], position[2]],
      distance: manual ? manual.distance : chase.distance,
      azimuth: chase.azimuth,
      tilt: chase.tilt,
      offset: chase.offset,
    };
  };
  window.game = createApi({
    game,
    ready: () => ready,
    bootMs: () => bootMs,
    paused: () => paused,
    setPaused: (p) => {
      paused = p;
    },
    simulate,
    draw,
    frame: () => frames,
    look(x, y, view) {
      // round the point from `azimuth` (anticlockwise from +x) and `polar` down from overhead, `radius` away
      const azimuth = view.azimuth ?? 0,
        polar = view.polar ?? 0.9,
        radius = view.radius ?? 90;
      const z = game.ground.heightAt(x, y);
      manual = {
        target: [x, y, z],
        position: [
          x + radius * Math.sin(polar) * Math.cos(azimuth),
          y + radius * Math.sin(polar) * Math.sin(azimuth),
          z + radius * Math.cos(polar),
        ],
        distance: radius,
      };
    },
    camera: cameraState,
    override(drive) {
      input.override = drive ? { throttle: drive.throttle, steer: drive.steer } : null;
      if (drive) manual = null;
    },
    snap() {
      manual = null;
      chase.snap(game.rover, game.ground);
    },
    zoom(factor) {
      manual = null;
      chase.zoomBy(factor);
    },
    orbit(turn, tilt) {
      manual = null;
      chase.orbitBy(turn, tilt);
    },
    measureFrame,
    wake,
    sound: () => ({
      awake: sound.awake,
      voices: sound.voices,
      muted: sound.muted,
      volume: sound.volume,
      beat: sound.beat,
    }),
    mute: setMuted,
    events: eventLog,
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // a frame's own timestamp can come before the moment the loop was set up, and the music refuses time that runs back
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20);
    last = now;
    if (measuring) return;
    if (paused) {
      draw(0);
      return;
    }
    simulate(dt);
    draw(dt, false);
    if (asked === null && rung.step(dt)) toRung(rung.rung);
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
