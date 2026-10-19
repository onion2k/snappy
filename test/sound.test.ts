/**
 * The game's door to artshape-sound, held to what it hands the package and
 * what it hands back. The package is replaced here by one that writes down
 * what it was asked, because a real Audio needs a browser's AudioContext and
 * the sound itself is the package's own to hold, and is heard in the smoke
 * tests. What is held is that the right sounds are loaded and played, that
 * the song is stepped by the game's time and nothing else, and that the
 * setting goes in and comes out unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const asked = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('artshape-sound/audio', () => ({
  Audio: class {
    volume: number;
    muted: boolean;
    voices = 3;
    constructor(options: { volume?: number; muted?: boolean }) {
      asked.calls.push(['audio', options]);
      this.volume = options.volume ?? 1;
      this.muted = options.muted ?? false;
    }
    load(name: string) {
      asked.calls.push(['load', name]);
    }
    play(name: string) {
      asked.calls.push(['play', name]);
    }
    resume() {
      asked.calls.push(['resume']);
      return Promise.resolve();
    }
    mute(on: boolean) {
      asked.calls.push(['mute', on]);
      this.muted = on;
    }
  },
}));
vi.mock('artshape-sound/player', () => ({
  Player: class {
    beat = 0;
    constructor(_audio: unknown, song: { bpm: number }) {
      asked.calls.push(['player', song.bpm]);
    }
    step(dt: number) {
      asked.calls.push(['step', dt]);
      this.beat += dt;
    }
  },
}));

const { GameSound, LazySound } = await import('../src/sound');
const context = {} as BaseAudioContext;

beforeEach(() => {
  asked.calls.length = 0;
});

describe('the game sound', () => {
  it('loads the bank and the drop, and a player on the calm song', () => {
    new GameSound({ context });
    expect(asked.calls.filter((c) => c[0] === 'load').map((c) => c[1])).toEqual(['bank', 'drop']);
    expect(asked.calls.filter((c) => c[0] === 'player')).toEqual([['player', 90]]);
  });

  it('hands the package the context, the chance, the volume and the mute it was given', () => {
    const random = () => 0.5;
    new GameSound({ context, random, volume: 0.3, muted: true });
    expect(asked.calls[0]).toEqual(['audio', { context, random, volume: 0.3, muted: true }]);
  });

  it('plays the bank for a bank and the drop for a drop', () => {
    const sound = new GameSound({ context });
    asked.calls.length = 0;
    sound.banked();
    sound.dropped();
    expect(asked.calls).toEqual([
      ['play', 'bank'],
      ['play', 'drop'],
    ]);
  });

  it('steps the song by the time it is given, and reads its beat back', () => {
    const sound = new GameSound({ context });
    sound.step(1 / 60);
    sound.step(1 / 60);
    expect(asked.calls.filter((c) => c[0] === 'step')).toEqual([
      ['step', 1 / 60],
      ['step', 1 / 60],
    ]);
    expect(sound.beat).toBeCloseTo(2 / 60, 12);
  });

  it('resumes the context, mutes and unmutes, and keeps the volume across it', () => {
    const sound = new GameSound({ context, volume: 0.6 });
    void sound.resume();
    expect(asked.calls.at(-1)).toEqual(['resume']);
    expect(sound.muted).toBe(false);
    sound.mute(true);
    expect(sound.muted).toBe(true);
    expect(sound.volume).toBe(0.6);
    sound.mute(false);
    expect(sound.muted).toBe(false);
    sound.volume = 0.2;
    expect(sound.volume).toBe(0.2);
  });

  it('reports the voices sounding', () => {
    expect(new GameSound({ context }).voices).toBe(3);
  });
});

describe('the sound made on the first gesture', () => {
  const lazy = (volume = 1, muted = false) => {
    const made: { volume: number; muted: boolean }[] = [];
    const sound = new LazySound({
      volume,
      muted,
      make: (options) => {
        made.push(options);
        return new GameSound({ context, ...options });
      },
    });
    return { sound, made };
  };

  it('makes nothing until it is woken, and says so', () => {
    const { sound, made } = lazy();
    expect(sound.awake).toBe(false);
    expect(made).toEqual([]);
    expect(asked.calls).toEqual([]);
  });

  it('is silent, and steps and plays nothing, before it is woken', () => {
    const { sound } = lazy();
    sound.banked();
    sound.dropped();
    sound.step(1 / 60);
    expect(asked.calls).toEqual([]);
    expect(sound.voices).toBe(0);
    expect(sound.beat).toBe(0);
  });

  it('answers the save before it is woken, and a mute made meanwhile', () => {
    const { sound } = lazy(0.4, true);
    expect(sound.muted).toBe(true);
    expect(sound.volume).toBe(0.4);
    sound.mute(false);
    expect(sound.muted).toBe(false);
  });

  it('makes the sound with what the save said, and the last mute, and resumes it at once', () => {
    const { sound, made } = lazy(0.4, true);
    sound.mute(false);
    sound.wake();
    expect(made).toEqual([{ volume: 0.4, muted: false }]);
    expect(asked.calls[0]).toMatchObject(['audio', { volume: 0.4, muted: false }]);
    expect(asked.calls.at(-1)).toEqual(['resume']);
    expect(sound.awake).toBe(true);
  });

  it('makes the sound muted when the save was muted, and nothing is changed in between', () => {
    const { sound, made } = lazy(0.7, true);
    sound.wake();
    expect(made).toEqual([{ volume: 0.7, muted: true }]);
    expect(sound.muted).toBe(true);
  });

  it('is made once however many times it is woken', () => {
    const { sound, made } = lazy();
    sound.wake();
    sound.wake();
    expect(made).toHaveLength(1);
    expect(asked.calls.filter((c) => c[0] === 'resume')).toHaveLength(1);
  });

  it('plays, steps and mutes through the sound once it is woken', () => {
    const { sound } = lazy();
    sound.wake();
    asked.calls.length = 0;
    sound.banked();
    sound.dropped();
    sound.step(1 / 60);
    sound.mute(true);
    expect(asked.calls).toEqual([
      ['play', 'bank'],
      ['play', 'drop'],
      ['step', 1 / 60],
      ['mute', true],
    ]);
    expect(sound.muted).toBe(true);
    expect(sound.voices).toBe(3);
    expect(sound.beat).toBeCloseTo(1 / 60, 12);
  });
});
