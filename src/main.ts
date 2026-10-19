/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens in the arena happens in `game.ts`; this turns its events into
 * words on the screen and draws the frame, on the game path of
 * artshape-render, and makes the sound's context on the first gesture. There is no game logic here.
 */
import { createContext } from 'artshape-render/gpu/context';
import { Orbit } from 'artshape-render/gpu/camera';
import { GameRenderer } from 'artshape-render/game/renderer';
import { createApi } from './debug';
import { frameCost } from './frame-cost';
import { Game } from './game';
import { daylight } from './look';
import { Progress } from './progress';
import { seeded } from './random';
import { ARENA_BOX, Scene } from './scene';
import { GameSound, LazySound } from './sound';

/** How many millimetres a world unit is: the renderer fixes a few real sizes by it. */
const MM_PER_UNIT = 100;
const LIGHT_CAPACITY = 16,
  EFFECT_CAPACITY = 16,
  PARTICLE_CAPACITY = 1024;

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
  renderer.camera.fov = 40;
  renderer.camera.near = 2;
  renderer.camera.far = 500;
  // the map is fitted to the box round the whole arena, as a small course's is in golf
  renderer.setSunShadow(ARENA_BOX);

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
  const game = new Game(progress, seed !== null ? { random: seeded(+seed) } : {});
  const { world } = game;

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

  // ---- the scene ----

  const scene = new Scene();
  renderer.setStatic(scene.static(world.solid));

  const cam = renderer.camera;
  cam.target = [0, 0, 0];
  cam.position = [0, -70, 60];
  const orbit = new Orbit(cam, {
    element: canvas,
    minPolar: 0.2,
    maxPolar: 1.3,
    minDistance: 20,
    maxDistance: 160,
    rotateSpeed: 0.4,
    zoomSpeed: 0.8,
    panSpeed: 0,
    inertia: 0.5,
  });

  let width = 1,
    height = 1;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    cam.aspect = width / height;
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

  await renderer.ready;
  boot.classList.add('gone');
  stats.hidden = false;
  help.hidden = false;

  // ---- each frame ----

  let frames = 0;
  let smoothed = 0;
  function simulate(dt: number) {
    frames++;
    game.step(dt);
    // after the game, so that a game that is not stepping has no music
    sound.step(dt);
  }
  function draw(dt: number) {
    orbit.update();
    cam.update();
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms`;
  }

  // ---- the test API, and the frame loop ----

  // ?paused=1 starts the game stopped where it was built, so a test sees the
  // same arena every run: no frame of its own has run, and every one after is
  // the test's, of a length it chose
  let paused = query.has('paused');
  let ready = false;
  let bootMs = 0;
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
      cam.target = [x, y, 0];
      orbit.setSpherical(view);
      for (let i = 0; i < 400; i++) orbit.update();
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
    draw(dt);
  };
  ready = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
