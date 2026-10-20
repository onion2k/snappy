/**
 * Saves from every shape the game has ever written, kept in `test/saves`, all
 * still loading and playing. A player's save outlives the code that wrote it.
 *
 * A save whose shape is new needs a file here. The last test sees to that: it
 * fails when the game writes a field no file in the corpus has.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

const DIR = new URL('saves/', import.meta.url);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const FRESH = { muted: false, volume: 1, album: [] };
const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8');

/**
 * What each save was worth when it was written, and what loading it must keep. The first two were written when the
 * game had a bank, and carry its fields: they are ignored now, and the mute and volume are kept. The first three were
 * written before the album, and load with it empty; the fourth has two pictures and a third of an oddity the world
 * does not have, which the game leaves out.
 */
const KEPT: Record<string, Record<string, unknown>> = {
  '01-first.json': { muted: false, volume: 1 },
  '02-sound.json': { muted: true, volume: 0.4 },
  '03-look.json': { muted: true, volume: 0.6 },
  '04-album.json': { muted: false, volume: 0.8 },
};

/** The oddities each save's album pictures, once the game has loaded it. */
const PICTURED: Record<string, string[]> = {
  '01-first.json': [],
  '02-sound.json': [],
  '03-look.json': [],
  '04-album.json': ['mill pond duck', 'orchard gnome'],
};

describe('saves from every shape the game has written', () => {
  it('has a file for every shape, oldest first', () => {
    expect(files).toEqual(Object.keys(KEPT).sort());
  });

  for (const file of files) {
    describe(file, () => {
      it('loads with its mute and volume kept, and nothing else', () => {
        const save = new Progress(memoryStore(read(file))).save;
        for (const [key, was] of Object.entries(KEPT[file])) expect(save[key as keyof typeof save]).toEqual(was);
        expect(Object.keys(save).sort()).toEqual(['album', 'muted', 'volume']);
      });

      it('loads its album, what is right of it, into the game', () => {
        const game = new Game(new Progress(memoryStore(read(file))), { random: seeded(7) });
        expect(game.album.toSave().map((e) => e.name)).toEqual(PICTURED[file]);
        expect(game.progress.save.album).toEqual(game.album.toSave());
      });

      it('plays on from where it left off, and breaks no rule', () => {
        const game = new Game(new Progress(memoryStore(read(file))), { random: seeded(7) });
        for (let f = 0; f < 300; f++) game.step(1 / 60);
        expect(checkInvariants(game)).toEqual([]);
      });

      it('comes back as it went, written again in the shape of today', () => {
        const store = memoryStore(read(file));
        const before = new Progress(store).save;
        expect(store.json, 'loading alone must not write').toBe(read(file));
        const game = new Game(new Progress(store));
        expect(store.json, 'nor loading the game').toBe(read(file));
        game.persist();
        const after = new Progress(memoryStore(store.json)).save;
        // the album comes back as the game read it, without what it left out
        expect(after).toEqual({ ...before, album: game.album.toSave() });
        expect(after.album).toHaveLength(PICTURED[file].length);
      });
    });
  }

  it('takes defaults for what an old save lacks, and shrugs at what it cannot read', () => {
    expect(new Progress(memoryStore('{}')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('not json')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('[1]')).save).toEqual(FRESH);
    expect(new Progress(memoryStore('null')).save).toEqual(FRESH);
  });

  it('ignores the bank an old save carries, and keeps its mute and volume', () => {
    const old = '{"bank": 12, "banked": 15, "muted": true, "volume": 0.4}';
    const progress = new Progress(memoryStore(old));
    expect(progress.save).toEqual({ muted: true, volume: 0.4, album: [] });
    expect('bank' in progress.save).toBe(false);
    expect('banked' in progress.save).toBe(false);
  });

  it('takes sound as saved only when it is a boolean and a volume from 0 to 1', () => {
    const sound = (json: string) => {
      const { muted, volume } = new Progress(memoryStore(json)).save;
      return { muted, volume };
    };
    expect(sound('{"muted": true, "volume": 0.25}')).toEqual({ muted: true, volume: 0.25 });
    expect(sound('{"muted": false, "volume": 0}')).toEqual({ muted: false, volume: 0 });
    expect(sound('{"muted": "true"}'), 'a string is not a boolean').toEqual({ muted: false, volume: 1 });
    expect(sound('{"muted": 1}'), 'a number is not a boolean').toEqual({ muted: false, volume: 1 });
    expect(sound('{"muted": null, "volume": null}')).toEqual({ muted: false, volume: 1 });
    expect(sound('{"other": 2}'), 'missing').toEqual({ muted: false, volume: 1 });
    for (const v of ['1.5', '-0.1', '"loud"', '1e999', 'null'])
      expect(sound(`{"muted": true, "volume": ${v}}`), `volume ${v}`).toEqual({ muted: true, volume: 1 });
  });

  it('keeps the album as the list it was, for the game to read, and an empty one for anything else', () => {
    const album = (json: string) => new Progress(memoryStore(json)).save.album;
    expect(album('{"album": [1, {"name": "x"}]}'), 'a list, whatever is in it').toEqual([1, { name: 'x' }]);
    expect(album('{"album": []}')).toEqual([]);
    for (const v of ['{}', '"pictures"', 'null', '3', 'true'])
      expect(album(`{"muted": true, "album": ${v}}`), `album ${v}`).toEqual([]);
  });

  it('saves a mute when it is made, and a reload keeps it', () => {
    const store = memoryStore();
    const progress = new Progress(store);
    progress.setMuted(true);
    expect(new Progress(memoryStore(store.json)).save.muted).toBe(true);
    progress.setMuted(false);
    expect(new Progress(memoryStore(store.json)).save.muted).toBe(false);
  });

  it('has the shape the game writes now: a new field means a new file here', () => {
    const game = new Game(new Progress(memoryStore()));
    game.persist();
    const now = Object.keys(JSON.parse(JSON.stringify(game.progress.save)) as object).sort();
    const newest = Object.keys(JSON.parse(read(files[files.length - 1])) as object).sort();
    expect(newest, 'add a save in the new shape to test/saves').toEqual(now);
  });
});
