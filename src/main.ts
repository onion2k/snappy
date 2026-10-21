/**
 * The page: the game drawn, and what the player does to it. Everything that
 * happens in the world happens in `game.ts`; this reads the keys and the
 * thumb stick, steps the game, moves the chase camera after the rover, and
 * draws the frame through the scene on the game path of artshape-render,
 * and makes the sound's context on the first gesture. There is no game
 * logic here.
 *
 * In the viewfinder (F, or the camera button) the camera is the rover's own
 * eye, as the game's `Viewfinder` places and aims it: a drag turns it, the
 * wheel or a pinch zooms the lens, a click or a tap without a drag focuses,
 * A goes back to auto focus and Space takes the picture. The renderer's
 * depth of field is laid on the frame from the focus, and the marks over it
 * (`hud.ts`) from what `Brackets` says; out of it, the post is the look's
 * own again, the very record it was.
 *
 * The album (Tab, or the album button) opens over the game and stops it, from driving or from the viewfinder, and
 * closing it goes back to exactly that. Its page's picture is drawn by the same renderer and scene as the game, at the
 * lens and the moment the album kept (`drawPage`): the view laid over the mount's window, the camera at the kept eye
 * through the kept lens, the blur from the kept focus, the clouds, sails, grass and UFOs at the kept time, and the
 * rover and its tracks left out, as they are not kept. Settled, so a page is the same picture every time it is drawn.
 */
import { createContext } from 'artshape-render/gpu/context';
import { FOCUS_REACH, type Focus } from 'artshape-render/game/focus';
import { GameRenderer, type Post } from 'artshape-render/game/renderer';
import { AlbumMode, albumKey } from './albummode';
import { swipeTurn } from './albumpages';
import { AlbumView } from './albumview';
import { Brackets } from './brackets';
import { ChaseCamera, dragOrbit } from './camera';
import { createApi, type CameraState } from './debug';
import { frameCost } from './frame-cost';
import { Game } from './game';
import { ViewfinderHud } from './hud';
import { Input } from './input';
import { daylight } from './look';
import { WIND } from './models/grass';
import { Progress } from './progress';
import { seeded } from './random';
import { Scene, type Played } from './scene';
import { shotBlur } from './score';
import { FrameRung, RUNG_STEPS, rungDt } from './view';
import { Shot, aimOf, fovOf } from './viewfinder';
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
/** The chase camera's field of view, in degrees: the viewfinder's is its lens's. */
const CHASE_FOV = 40;
/**
 * How far a press may wander, in CSS pixels all told, and still be a tap and not a drag: in the viewfinder a tap
 * focuses, and a finger set down and lifted moves a few pixels without meaning to.
 */
const TAP_SLOP = 8;
/** How far ahead of the eye the renderer's camera is aimed in the viewfinder, in units: any distance does. */
const AIM_AHEAD = 10;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('bootMsg')!;
const stats = document.getElementById('stats')!;
const help = document.getElementById('help')!;
const vfHelp = document.getElementById('vfHelp')!;
const cameraBtn = document.getElementById('cameraBtn') as HTMLButtonElement;
const shutterBtn = document.getElementById('shutterBtn') as HTMLButtonElement;
const afBtn = document.getElementById('afBtn') as HTMLButtonElement;
const albumBtn = document.getElementById('albumBtn') as HTMLButtonElement;
const stage = document.getElementById('stage')!;

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
  cam.fov = CHASE_FOV;
  cam.near = NEAR;
  cam.far = FAR;

  // ---- the game, and what it says has happened ----

  const query = new URLSearchParams(location.search);
  const progress = new Progress();
  /** What has happened, a line each, for the test API: a picture taken. */
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

  // ---- the viewfinder: its marks, its blur, and what tells of a picture ----

  const hud = new ViewfinderHud();
  const brackets = new Brackets();
  /** The look's own post, kept to be put back exactly on leaving; and the one the viewfinder draws with. */
  let lookPost: Post = renderer.post;
  const lensFocus: Focus = { distance: 50, band: 0, strength: 0 };
  /** The depth of field's band, strength and depth, worked out each frame from the lens (`shotBlur`). */
  const dof = new Float64Array(3);
  /** Where the renderer's camera is aimed in the viewfinder, along the look from the eye. */
  const vfTarget = new Float64Array(3);
  /** Whether the page is showing the viewfinder: it follows the game's, whoever raised it. */
  let showing = false;
  /** Whether the page has booted: the camera's keys do nothing before, while the scene and the frame loop are made. */
  let booted = false;
  /** Whether the frame-time rung still allows the viewfinder its blur: the first thing a slow machine gives up. */
  let lensBlur = true;
  /**
   * Whether the next frame settles what the scene cuts out of the camera's way at once: the frame after the viewfinder
   * is lowered, whose cut was along the lens's line and not the chase camera's, so a crown over the rover was drawn
   * whole for the half second it took to be cut again (photo review, 14).
   */
  let settleCut = false;
  /** The album over the game: whether it is open, its pages, and what the game was when it was opened. */
  const mode = new AlbumMode<Post>(game.album.capacity, renderer.post);
  game.events = {
    photo(g, kept) {
      const name = g.best >= 0 ? game.oddityNames[g.best] : null;
      // the picture as taken: drawn now, so the canvas holds this frame while the print is copied from it in this task
      draw(0);
      hud.flash();
      hud.card(g, name, canvas, kept);
      sound.shutter();
      eventLog.push(`photo ${g.total} ${name ?? 'nothing'}`);
    },
  };
  /** The page made to match the game: in the viewfinder, its marks, buttons, help and blur; out, the chase's. */
  const syncPhoto = () => {
    const on = game.photographing;
    if (on === showing) return;
    showing = on;
    document.body.classList.toggle('photo', on);
    hud.show(on);
    shutterBtn.hidden = afBtn.hidden = !on;
    help.hidden = on;
    vfHelp.hidden = !on;
    cameraBtn.setAttribute('aria-label', on ? 'Back to driving' : 'Camera');
    // a drag or a pinch begun in one is not carried into the other
    fingers.clear();
    if (on) {
      lookPost = renderer.post;
      renderer.post = { ...lookPost, focus: lensFocus };
    } else {
      renderer.post = lookPost;
      cam.fov = CHASE_FOV;
      scene.lens[0] = CHASE_FOV;
      settleCut = true;
    }
  };
  const setPhoto = (on: boolean) => {
    game.photo(on);
    syncPhoto();
  };
  /** The shutter, as a player presses it: not while the game is stopped. */
  const press = () => {
    if (!paused) game.shutter();
  };
  // a button never takes the keyboard's focus, so Space is always the shutter and never a press of the last button
  const albumView = new AlbumView();
  for (const b of [cameraBtn, shutterBtn, afBtn, albumBtn, albumView.prev, albumView.next])
    b.addEventListener('pointerdown', (e) => e.preventDefault());
  cameraBtn.addEventListener('click', () => setPhoto(!game.photographing));
  shutterBtn.addEventListener('click', press);
  afBtn.addEventListener('click', () => game.viewfinder.auto());
  albumBtn.addEventListener('click', () => void openAlbum(!mode.open));
  albumView.prev.addEventListener('click', () => turnPage(-1));
  albumView.next.addEventListener('click', () => turnPage(1));
  addEventListener('keydown', (e) => {
    if (!booted || e.metaKey || e.ctrlKey || e.altKey) return;
    // Tab is the album's, and never moves the keyboard's focus about the page, held down or not; while the album is
    // open only its own keys work (and M, which is the sound's), as `albumKey` says
    if (e.code === 'Tab') e.preventDefault();
    const act = albumKey(e.code, e.repeat, mode.open);
    if (act === 'open') void openAlbum(true);
    else if (act === 'close') void openAlbum(false);
    else if (act === 'prev') turnPage(-1);
    else if (act === 'next') turnPage(1);
    if (act !== 'game' || e.repeat) return;
    if (e.code === 'KeyF') setPhoto(!game.photographing);
    else if (e.code === 'Escape') setPhoto(false);
    else if (!game.photographing) return;
    else if (e.code === 'Space') press();
    else if (e.code === 'KeyA') game.viewfinder.auto();
  });
  /**
   * A camera set by hand through the test API's `look`, which holds until the rover is driven, teleported or the view
   * zoomed: the look pictures are taken from it.
   */
  let manual: { target: [number, number, number]; position: [number, number, number]; distance: number } | null = null;

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (mode.open) return;
      // in the viewfinder the wheel is the lens: turned toward the player, a longer one
      if (game.photographing) {
        game.viewfinder.zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM));
        return;
      }
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
  /** How far the press has wandered, in CSS pixels all told: a tap is one that has hardly moved, and one finger. */
  let travelled = 0;
  const apart = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('pointerdown', (e) => {
    // over an album page the view is its picture, and a drag on it is a swipe, which the album takes
    if (mode.open) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // kept to the view as it is dragged off it, where the browser can: it refuses a pointer it has already let go of
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // the drag still turns the view while it is over it
    }
    if (fingers.size === 1) travelled = 0;
    if (fingers.size === 2) {
      spread = apart();
      travelled = Infinity;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x,
      dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    travelled += Math.abs(dx) + Math.abs(dy);
    if (fingers.size === 1 && game.photographing) {
      // the view dragged as a picture is: the point under the finger kept under it, a frame's height a field of view
      const k = (game.viewfinder.fov * Math.PI) / 180 / Math.max(1, canvas.clientHeight);
      game.viewfinder.look(dx * k, dy * k);
      return;
    }
    if (fingers.size === 1) {
      manual = null;
      dragOrbit(dx, dy, canvas.clientHeight, turned);
      chase.orbitBy(turned[0], turned[1]);
      return;
    }
    if (fingers.size !== 2) return;
    const now = apart();
    if (spread > 0 && now > 0) {
      // fingers opening zoom in: the chase camera nearer, or a longer lens
      if (game.photographing) game.viewfinder.zoomBy(now / spread);
      else {
        manual = null;
        chase.zoomBy(spread / now);
      }
    }
    spread = now;
  });
  const lift = (e: PointerEvent) => {
    if (!fingers.delete(e.pointerId)) return;
    spread = 0;
    // a tap in the viewfinder, one finger set down and lifted without a drag, focuses on what is under it
    if (e.type === 'pointerup' && fingers.size === 0 && travelled < TAP_SLOP && game.photographing) {
      const box = canvas.getBoundingClientRect();
      const nx = ((e.clientX - box.left) / box.width) * 2 - 1,
        ny = 1 - ((e.clientY - box.top) / box.height) * 2;
      game.viewfinder.focusAt(nx, ny, game.ground, game.subjects);
    }
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
  /** The most device pixels a CSS pixel is drawn with: the rung's (`RUNG_STEPS`), a quarter fewer pixels at the first rung down. */
  let pixelCap: number = RUNG_STEPS[0].pixel;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, pixelCap);
    width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    cam.aspect = width / height;
    scene.lens[0] = cam.fov;
    scene.lens[1] = cam.aspect;
    // an album page's shape is the picture's own, and not the viewfinder's, which is the screen's
    if (!mode.open) game.viewfinder.aspect = cam.aspect;
    renderer.resize(width, height);
  };
  const relayout = () => {
    // with the album open, its window and the view over it laid again, and the page drawn at its new shape
    if (mode.open) {
      albumView.lay(stage, mode.pages.oddity >= 0, albumShot.aspect);
      resize();
      drawPage();
    } else resize();
  };
  addEventListener('resize', relayout);
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
    renderer.economy.occlusion = step.occlusion;
    lensBlur = step.focus;
    // the canvas drawn again at the rung's pixel ratio, as a resize does
    if (step.pixel !== pixelCap) {
      pixelCap = step.pixel;
      relayout();
    }
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
    // the chase camera waits where it was while the player looks through the viewfinder, to be there on leaving it
    if (!game.photographing) {
      chase.keyTurn = input.look();
      if (chase.keyTurn !== 0) manual = null;
      chase.update(game.rover, game.ground, dt);
    }
    // after the game, so that a game that is not stepping has no music
    sound.step(dt);
  }
  /**
   * One frame drawn. `settled` is for a frame whose picture must be the whole of the game's state and the camera's,
   * nothing a frame behind: the test API's, a paused frame and the first. Only the frame loop's playing frames spread a
   * chunk crossing's work over two (`frameWork` in `view.ts`).
   */
  function draw(dt: number, settled = true) {
    syncPhoto();
    let target: ArrayLike<number> = manual ? manual.target : chase.target,
      eye: ArrayLike<number> = manual ? manual.position : chase.position;
    const vf = game.viewfinder;
    if (showing) {
      // the rover's own eye, looking along the view, through the lens's field
      eye = vf.eye;
      aimOf(vf.shot, AIM_AHEAD, vfTarget);
      target = vfTarget;
      cam.fov = vf.fov;
      scene.lens[0] = cam.fov;
      // the blur from the lens: what the grade calls sharp drawn sharp, and the rest as blurred as it says
      shotBlur(vf.shot, vf.mark, FOCUS_REACH, dof);
      lensFocus.distance = dof[2];
      lensFocus.band = dof[0];
      // a strength of nought runs no pass at all: the rung's relief is the whole of the blur's cost
      lensFocus.strength = lensBlur ? dof[1] : 0;
    }
    for (let k = 0; k < 3; k++) {
      cam.target[k] = target[k];
      cam.position[k] = eye[k];
    }
    renderer.time = game.t;
    // a frame of no time settles the cut at once, and a settled one does a crossing's work whole
    scene.frame(game, eye, target, settleCut ? 0 : dt, settled || settleCut);
    settleCut = false;
    cam.update();
    if (showing) {
      brackets.update(vf.shot, game.subjects, game.ground);
      hud.frame(vf, brackets, game.oddityNames, canvas.clientWidth, canvas.clientHeight);
    }
    const t = performance.now();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', dt);
    smoothed += (performance.now() - t - smoothed) * 0.05;
    if (frames % 30 === 0) stats.textContent = `${smoothed.toFixed(1)} ms`;
  }
  // ---- the album: its pages, and a page's picture drawn as it was taken ----

  const pages = mode.pages;
  /** The album's post: the look's, with the page's blur. */
  const albumFocus: Focus = { distance: 50, band: 0, strength: 0 };
  /** The kept picture's lens, its focus mark, where the camera is aimed along it, and its blur. */
  const albumShot = new Shot();
  const albumMark = new Float64Array(2);
  const albumTarget = new Float64Array(3);
  const albumBlur = new Float64Array(3);
  /**
   * The game as the scene reads it for a page, at the moment the picture was taken: its time, and the UFOs where their
   * bob had them then. The rover and the tracks are the game's own, and left out of the drawing (`hidePlayer`).
   */
  const albumLift = new Float64Array(game.subjects.count);
  const albumPlayed: Played = { rover: game.rover, tracks: game.tracks, t: 0, subjects: { lift: albumLift } };

  /**
   * The page's picture drawn: the scene at the kept eye, aimed along the kept look as the viewfinder aims, through the
   * kept lens's vertical field of view at the picture's own shape (the view is laid over the mount at that shape, so
   * all of what was taken shows and nothing it did not), blurred from the kept focus and mark as the viewfinder blurs
   * (and not at a rung that gave the blur up), at the kept time, with no rover and no tracks; settled, so it is the same
   * every time. The grass's trample is left out of the frame, as the rover's history of this session and not the
   * picture's, and the grain rolled to the kept time, so a page drawn before a reload is the page drawn after it; both
   * are put back for the game's frames. The page of nothing pictured draws the game as it stands behind the album.
   */
  function drawPage() {
    const i = pages.oddity;
    if (i < 0) {
      scene.hidePlayer = false;
      draw(0);
      return;
    }
    const album = game.album;
    album.shotOf(i, albumShot, albumMark);
    const t = album.timeOf(i);
    albumPlayed.t = t;
    game.liftsAt(t, albumLift);
    const eye = albumShot.eye;
    aimOf(albumShot, AIM_AHEAD, albumTarget);
    cam.fov = fovOf(albumShot.focal);
    cam.aspect = albumShot.aspect;
    scene.lens[0] = cam.fov;
    scene.lens[1] = cam.aspect;
    shotBlur(albumShot, albumMark, FOCUS_REACH, albumBlur);
    albumFocus.distance = albumBlur[2];
    albumFocus.band = albumBlur[0];
    albumFocus.strength = lensBlur ? albumBlur[1] : 0;
    for (let k = 0; k < 3; k++) {
      cam.target[k] = albumTarget[k];
      cam.position[k] = eye[k];
    }
    renderer.time = t;
    scene.hidePlayer = true;
    scene.frame(albumPlayed, eye, albumTarget, 0, true);
    cam.update();
    const clock = renderer.postClock;
    renderer.postClock = t;
    renderer.economy.trample = false;
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', 0);
    renderer.economy.trample = true;
    renderer.postClock = clock;
  }

  /**
   * The page `pages` stands on written and drawn, the view laid over its window at the picture's shape, and sized again
   * if that moved it.
   */
  function showPage() {
    const i = pages.oddity;
    if (i >= 0) game.album.shotOf(i, albumShot, albumMark);
    albumView.write(game.album, pages);
    if (albumView.lay(stage, i >= 0, albumShot.aspect)) resize();
    drawPage();
  }

  /** A page turned on or back, if there is one that way: the album does not go round from either end. */
  function turnPage(by: number) {
    if (mode.turn(by)) showPage();
  }

  /**
   * The album opened over the game, stopped, at its first page; or closed, and the game exactly as it was, as the
   * album's mode kept it: stopped or not, in the viewfinder or not, its post, the time not moved, and the frame drawn
   * at the chase camera or the lens again, settled. The drive hears no keys while it is open, so the arrows that turn
   * its pages do not steer, and nothing held as it opens or closes drives after. Resolves once the page's picture is
   * drawn with everything it needs built, its blur's passes among them.
   */
  async function openAlbum(on: boolean): Promise<void> {
    if (!booted) return;
    if (on) {
      if (!mode.enter(paused, game.photographing, renderer.post, game.album)) return;
      paused = true;
      input.shut = true;
      fingers.clear();
      swipe.id = -1;
      hud.hideCard();
      // the look's own post, which the viewfinder keeps aside while it is up, with the page's blur on it
      renderer.post = { ...(showing ? lookPost : renderer.post), focus: albumFocus };
      albumBtn.setAttribute('aria-label', 'Close the album');
      albumBtn.title = 'Close the album (Tab or Esc)';
      albumView.show(true);
      showPage();
      // a page's blur is drawn by passes the frame may not have built yet: until they are, it is drawn sharp
      await renderer.prepare();
      // it may have been closed while the passes were built
      if (mode.open) drawPage();
      return;
    }
    const before = mode.leave();
    if (!before) return;
    input.shut = false;
    albumView.show(false);
    albumView.lay(stage, false, 0);
    albumBtn.setAttribute('aria-label', 'Album');
    albumBtn.title = 'Album (Tab)';
    // nothing the player can do raises or lowers the viewfinder while the album is open; the test API could
    if (game.photographing !== before.photographing) setPhoto(before.photographing);
    else renderer.post = before.post;
    scene.hidePlayer = false;
    resize();
    cam.fov = showing ? game.viewfinder.fov : CHASE_FOV;
    scene.lens[0] = cam.fov;
    paused = before.paused;
    // the frame drawn back where the game is, and what the page cut or pressed settled at once there
    settleCut = true;
    draw(0);
  }

  // a swipe across an open album turns its page: a press and its lift, far enough across
  const swipe = { id: -1, x: 0, y: 0 };
  addEventListener('pointerdown', (e) => {
    if (!mode.open) return;
    swipe.id = e.pointerId;
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  addEventListener('pointerup', (e) => {
    if (!mode.open || e.pointerId !== swipe.id) return;
    swipe.id = -1;
    const by = swipeTurn(e.clientX - swipe.x, e.clientY - swipe.y);
    if (by !== 0) turnPage(by);
  });
  addEventListener('pointercancel', () => (swipe.id = -1));

  // the first frame drawn before the page is ready, so everything it compiles is in
  draw(0);
  await renderer.prepare();
  await renderer.ready;
  boot.classList.add('gone');
  stats.hidden = false;
  help.hidden = false;
  cameraBtn.hidden = false;
  albumBtn.hidden = false;

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
    cuts: () => scene.cutsDown,
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
    blurred: () => showing && lensBlur,
    openAlbum,
    async albumPage(n) {
      if (mode.go(n)) showPage();
      await ctx.device.queue.onSubmittedWorkDone();
    },
    albumState: () => ({ open: mode.open, page: pages.page, pages: pages.pages }),
    async raise(on) {
      setPhoto(on);
      // the first frame that asks for the blur starts its passes building; until they are in, the frame is sharp
      draw(0);
      if (on) await renderer.prepare();
    },
  });

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // a frame's own timestamp can come before the moment the loop was set up, and the music refuses time that runs back
    const raw = (now - last) / 1000,
      dt = Math.min(Math.max(raw, 0), 1 / 20);
    last = now;
    if (measuring) return;
    // an album page is drawn when it changes, and stands while it is read
    if (mode.open) return;
    if (paused) {
      draw(0);
      return;
    }
    simulate(dt);
    draw(dt, false);
    if (asked === null && rung.step(rungDt(raw))) toRung(rung.rung);
  };
  ready = true;
  booted = true;
  bootMs = performance.now();
  requestAnimationFrame(frame);
}
