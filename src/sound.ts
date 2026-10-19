/**
 * The sound is a package of its own, artshape-sound, which knows nothing of
 * arenas: a patch is a handful of numbers, a song is a tempo and a
 * pattern, and what the game hears is whichever it asks for by name. This is
 * the game's side of it: the music, for now, and the place a sound the game
 * makes will be loaded. Everything in the game that makes a noise goes through here, so the
 * package stays behind one door, and a change it needs goes in its own repo
 * with a version bump here. It knows nothing of the page: the context, the
 * first gesture and the key are main.ts's.
 *
 * `LazySound` is what the page holds: the context is dear to make (about a
 * tenth of a second at boot) and silent until a gesture anyway, so the
 * `GameSound` is made when the user first acts, and until then the save's
 * mute and volume are kept here and the sound is a silence. Without it the
 * boot gate would measure the page with a cost the player never waits on.
 */
import { Audio } from 'artshape-sound/audio';
import { Player } from 'artshape-sound/player';
import { calm } from 'artshape-sound/songs';

export interface SoundOptions {
  /** The page's own AudioContext, so that which one the browser has is the page's to say. */
  context: BaseAudioContext;
  /** Chance for the sounds' small variations: its own source, never the game's. */
  random?: () => number;
  volume?: number;
  muted?: boolean;
}

export class GameSound {
  private readonly audio: Audio;
  private readonly music: Player;

  constructor({ context, random, volume, muted }: SoundOptions) {
    this.audio = new Audio({ context, random, volume, muted });
    this.music = new Player(this.audio, calm);
  }

  /** The music on by `dt` seconds of game time: a game that is not stepping has no music. */
  step(dt: number) {
    this.music.step(dt);
  }

  /** Start the context, on the first gesture: a browser keeps it suspended until one. */
  resume() {
    return this.audio.resume();
  }

  mute(on: boolean) {
    this.audio.mute(on);
  }

  get muted() {
    return this.audio.muted;
  }

  get volume() {
    return this.audio.volume;
  }

  set volume(value: number) {
    this.audio.volume = value;
  }

  /** How many sounds are playing now. */
  get voices() {
    return this.audio.voices;
  }

  /** Where the music is, in beats from its start. */
  get beat() {
    return this.music.beat;
  }
}

export interface LazySoundOptions {
  /** What the save says now: they go into the sound when it is made. */
  volume: number;
  muted: boolean;
  /** Makes the sound, and so the context: the page's, since which one the browser has is the page's to say. */
  make: (options: { volume: number; muted: boolean }) => GameSound;
}

/** The game's sound, made on the first gesture; before it, every call is a silence and the setting is only kept. */
export class LazySound {
  private sound: GameSound | null = null;
  private muteSetting: boolean;
  private volumeSetting: number;
  private readonly make: LazySoundOptions['make'];

  constructor({ volume, muted, make }: LazySoundOptions) {
    this.volumeSetting = volume;
    this.muteSetting = muted;
    this.make = make;
  }

  /** Whether the context has been made. */
  get awake() {
    return this.sound !== null;
  }

  /** Make the sound, with the setting as it stands, and start it; once, however often it is asked. */
  wake() {
    if (this.sound) return;
    this.sound = this.make({ volume: this.volumeSetting, muted: this.muteSetting });
    void this.sound.resume();
  }

  step(dt: number) {
    this.sound?.step(dt);
  }

  mute(on: boolean) {
    this.muteSetting = on;
    this.sound?.mute(on);
  }

  get muted() {
    return this.sound?.muted ?? this.muteSetting;
  }

  get volume() {
    return this.sound?.volume ?? this.volumeSetting;
  }

  get voices() {
    return this.sound?.voices ?? 0;
  }

  get beat() {
    return this.sound?.beat ?? 0;
  }
}
