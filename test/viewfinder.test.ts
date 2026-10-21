/**
 * The viewfinder on the fixture world: into it at the rover's eye and out again, the look held to its limits, the
 * lens, auto focus on the oddity nearest the middle or else on what is under it, focus set by a tap and held, and the
 * view's turn rate.
 */
import { describe, expect, it } from 'vitest';
import { HEAD } from '../src/rover';
import { Subjects } from '../src/sight';
import {
  EYE,
  FOCUS,
  LENS,
  LOOK,
  Shot,
  ViewFrame,
  Viewfinder,
  aimOf,
  fovOf,
  viewfinderProblems,
} from '../src/viewfinder';
import { FIXTURE_DUCK, FIXTURE_WATER, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import type { Ground, Placement } from '../src/world/types';

const map = fixtureWorld();
const g = groundOf(map);
const DEG = Math.PI / 180;
const [duckX, duckY] = fixtureAt(...FIXTURE_DUCK);

const odd = (kind: Placement['kind'], tx: number, ty: number, yaw = 0, z = 0): Placement => {
  const [x, y] = fixtureAt(tx, ty);
  return { kind, x, y, z, yaw, scale: 1, biome: 0, vary: 0.5 };
};
/** A rover stood somewhere, as much of one as the viewfinder reads. */
const rover = (x: number, y: number, yaw = 0, z = 0.8) => ({ x, y, z, yaw });

describe('into the viewfinder and out', () => {
  it('starts out of it, with the lens at 50 and focus on auto', () => {
    const vf = new Viewfinder();
    expect(vf.active).toBe(false);
    expect(vf.focal).toBe(LENS.start);
    expect(LENS.start).toBe(50);
    expect(vf.mode).toBe('auto');
  });

  it('enters at the rover camera eye, on its mast and head, facing its heading level', () => {
    const vf = new Viewfinder();
    vf.enter(rover(10, 20, Math.PI / 2, 1.5));
    expect(vf.active).toBe(true);
    expect(vf.yaw).toBeCloseTo(Math.PI / 2, 12);
    expect(vf.pitch).toBe(0);
    // the mast a unit ahead of the pivots, and the lens ahead of the head's turn and up from it
    expect(vf.eye[0]).toBeCloseTo(10, 9);
    expect(vf.eye[1]).toBeCloseTo(20 + EYE.mast + EYE.ahead, 9);
    expect(vf.eye[2]).toBeCloseTo(1.5 + HEAD.height + EYE.up, 9);
    expect(vf.headYaw).toBe(0);
    expect(vf.headPitch).toBe(0);
  });

  it('leaves to nothing of its own, and enters again level and on auto, the lens kept', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(1, 0.3);
    vf.zoomBy(2);
    vf.focusAt(0, 0, g, null);
    vf.leave();
    expect(vf.active).toBe(false);
    vf.enter(rover(0, 0, 1));
    expect(vf.yaw).toBeCloseTo(1, 12);
    expect(vf.pitch).toBe(0);
    expect(vf.mode).toBe('auto');
    expect(vf.focal).toBe(100);
  });

  it('turns the head with the view, relative to the body', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0, 2));
    vf.look(0.5, -0.2);
    expect(vf.headYaw).toBeCloseTo(0.5, 12);
    expect(vf.headPitch).toBeCloseTo(-0.2, 12);
    expect(vf.yaw).toBeCloseTo(2.5, 12);
  });

  it('moves its eye with the head: turned round, it is behind the mast; looking down, lower and nearer it', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0, 0, 0));
    vf.look(Math.PI, 0);
    expect(vf.eye[0]).toBeCloseTo(EYE.mast - EYE.ahead, 9);
    vf.look(0, -LOOK.down);
    const p = -LOOK.down;
    expect(vf.eye[0]).toBeCloseTo(EYE.mast - (EYE.ahead * Math.cos(p) - EYE.up * Math.sin(p)), 9);
    expect(vf.eye[2]).toBeCloseTo(HEAD.height + EYE.ahead * Math.sin(p) + EYE.up * Math.cos(p), 9);
  });
});

describe('the look', () => {
  it('is held to half a turn either way of the heading', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0, 1));
    vf.look(10, 0);
    expect(vf.headYaw).toBe(Math.PI);
    vf.look(-30, 0);
    expect(vf.headYaw).toBe(-Math.PI);
    expect(LOOK.turn).toBe(Math.PI);
  });

  it('is held from 50 degrees down to 60 up', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(0, 5);
    expect(vf.pitch).toBeCloseTo(60 * DEG, 12);
    vf.look(0, -5);
    expect(vf.pitch).toBeCloseTo(-50 * DEG, 12);
  });

  it('takes no notice of a turn that is not a number, or of looking while out of the viewfinder', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(NaN, 0.1);
    vf.look(0.1, Infinity);
    expect(vf.yaw).toBe(0);
    expect(vf.pitch).toBe(0);
    vf.leave();
    vf.look(0.5, 0.5);
    expect(vf.headYaw).toBe(0);
  });
});

describe('the lens', () => {
  it('zooms from 24 to 135 mm and no further', () => {
    const vf = new Viewfinder();
    vf.zoomBy(1.5);
    expect(vf.focal).toBeCloseTo(75, 12);
    vf.zoomBy(100);
    expect(vf.focal).toBe(135);
    vf.zoomBy(0.001);
    expect(vf.focal).toBe(24);
    expect(LENS.least).toBe(24);
    expect(LENS.most).toBe(135);
  });

  it('takes no notice of a zoom that is nought, below it or not a number', () => {
    const vf = new Viewfinder();
    vf.zoomBy(0);
    vf.zoomBy(-2);
    vf.zoomBy(NaN);
    vf.zoomBy(Infinity);
    expect(vf.focal).toBe(50);
  });

  it('gives the frame’s height in degrees from a full-frame sensor, 24 mm tall', () => {
    expect(fovOf(50)).toBeCloseTo((2 * Math.atan(12 / 50)) / DEG, 9);
    expect(fovOf(24)).toBeCloseTo(53.13, 2);
    expect(fovOf(135)).toBeCloseTo(10.16, 2);
    const vf = new Viewfinder();
    expect(vf.fov).toBeCloseTo(fovOf(50), 12);
  });
});

describe('the frame', () => {
  it('is aimed along the look from the eye, as far ahead as asked, for the renderer’s camera', () => {
    const s = new Shot();
    s.eye.set([10, 20, 3]);
    const out = new Float64Array(3);
    const aim = (yaw: number, pitch: number, ahead = 10) => {
      s.yaw = yaw;
      s.pitch = pitch;
      aimOf(s, ahead, out);
      return [...out].map((v) => Math.round(v * 1e9) / 1e9);
    };
    expect(aim(0, 0)).toEqual([20, 20, 3]);
    expect(aim(Math.PI / 2, 0)).toEqual([10, 30, 3]);
    expect(aim(Math.PI, 0, 4)).toEqual([6, 20, 3]);
    expect(aim(0, Math.PI / 2)).toEqual([10, 20, 13]);
    expect(aim(-Math.PI / 2, -Math.PI / 6, 2)).toEqual([10, 18.267949192, 2]);
    // the look's way, whatever the turn: what the frame puts in its middle
    const f = new ViewFrame();
    s.yaw = 0.7;
    s.pitch = -0.3;
    f.of(s);
    aimOf(s, 25, out);
    expect(f.project(out)).toBe(true);
    expect(f.at[0]).toBeCloseTo(0, 9);
    expect(f.at[1]).toBeCloseTo(0, 9);
    expect(f.at[2]).toBeCloseTo(25, 9);
  });

  it('puts what is straight ahead in the middle, and what is up and right up and right', () => {
    const shot = new Shot();
    shot.yaw = Math.PI / 2;
    shot.focal = 50;
    shot.aspect = 1.6;
    const f = new ViewFrame();
    f.of(shot);
    expect(f.project([0, 10, 0])).toBe(true);
    expect(f.at[0]).toBeCloseTo(0, 12);
    expect(f.at[1]).toBeCloseTo(0, 12);
    expect(f.at[2]).toBeCloseTo(10, 12);
    // looking north, east is to the right
    f.project([1, 10, 1]);
    expect(f.at[0]).toBeGreaterThan(0);
    expect(f.at[1]).toBeGreaterThan(0);
    // the top edge of the frame is half the field of view up
    const t = Math.tan((fovOf(50) / 2) * DEG);
    f.project([0, 10, 10 * t]);
    expect(f.at[1]).toBeCloseTo(1, 9);
    f.project([10 * t * 1.6, 10, 0]);
    expect(f.at[0]).toBeCloseTo(1, 9);
    expect(f.project([0, -10, 0])).toBe(false);
  });

  it('sends a ray through a point on the screen to land where that point is drawn', () => {
    const shot = new Shot();
    shot.yaw = 0.7;
    shot.pitch = -0.3;
    shot.focal = 85;
    shot.aspect = 1.6;
    const f = new ViewFrame();
    f.of(shot);
    const dir = new Float64Array(3);
    f.ray(0.5, -0.25, dir);
    expect(Math.hypot(dir[0], dir[1], dir[2])).toBeCloseTo(1, 12);
    f.project([dir[0] * 20, dir[1] * 20, dir[2] * 20]);
    expect(f.at[0]).toBeCloseTo(0.5, 9);
    expect(f.at[1]).toBeCloseTo(-0.25, 9);
  });
});

describe('auto focus', () => {
  // the duck from 30 east of it, looking west and down at its middle
  const aimAtDuck = (vf: Viewfinder, extra = 0) => {
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    const dz = FIXTURE_WATER + 1.2 - vf.eye[2];
    vf.look(extra, Math.atan2(dz, 30));
  };

  it('focuses on the oddity in the middle of the frame, at its middle', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    aimAtDuck(vf);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(0);
    const m = new Float64Array(3);
    s.middle(0, m);
    expect(vf.focus).toBeCloseTo(Math.hypot(m[0] - vf.eye[0], m[1] - vf.eye[1], m[2] - vf.eye[2]), 9);
  });

  it('picks the oddity nearer the middle of two in frame', () => {
    const vf = new Viewfinder();
    // two gnomes ahead on the open ground east of the cottage, one straight ahead and one off to the left and nearer
    const s = new Subjects([odd('gnome', 28, 6), odd('gnome', 26.5, 4)]);
    vf.enter(rover(...fixtureAt(28, 1), Math.PI / 2));
    vf.zoomBy(24 / 50);
    vf.look(0, -0.15);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(0);
    // turned left, the other is nearer the middle
    vf.look(0.4, 0);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(1);
  });

  it('passes over an oddity hidden from the lens, and falls back to what is under the middle', () => {
    const vf = new Viewfinder();
    // a gnome behind the cottage, straight ahead
    const s = new Subjects([odd('gnome', 28, 8.5)]);
    const [x, y] = fixtureAt(19, 8.5);
    vf.enter(rover(x, y, 0));
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(-1);
    // the cottage's wall, four and a half tiles ahead of the rover, less the eye's way ahead of it
    const [wall] = fixtureAt(23.5, 8.5);
    expect(vf.focus).toBeCloseTo(wall - vf.eye[0], 1);
  });

  it('passes over the duck behind a tree, and focuses on the tree in the middle instead', () => {
    // a broadleaf on the line, halfway to the duck, in a copy of the fixture's placements: its trunk is in the way
    const tree: Placement = { kind: 'broadleaf', x: duckX + 15, y: duckY, z: 0, yaw: 0, scale: 1, biome: 0, vary: 0.5 };
    const vf = new Viewfinder();
    const s = new Subjects([...map.placements, tree]);
    aimAtDuck(vf);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(-1);
    expect(vf.focus).toBeLessThan(16);
    expect(vf.focus).toBeGreaterThan(12);
    // without it, the duck
    const open = new Viewfinder();
    aimAtDuck(open);
    open.update(1 / 60, g, Subjects.of(map));
    expect(open.focused).toBe(0);
  });

  it('falls back to the ground under the middle, with no oddity in frame', () => {
    const vf = new Viewfinder();
    const [x, y] = fixtureAt(15.5, 15.5);
    vf.enter(rover(x, y, Math.PI / 2, 0.8));
    vf.look(0, -30 * DEG);
    vf.update(1 / 60, g, Subjects.of(map));
    expect(vf.focused).toBe(-1);
    // the road is flat and at nought: the eye's height over it, along a ray thirty degrees down
    expect(vf.focus).toBeCloseTo(vf.eye[2] / Math.sin(30 * DEG), 1);
  });

  it('focuses far off at the sky, and never nearer than the lens can', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(0, 1);
    vf.update(1 / 60, g, null);
    expect(vf.focus).toBe(FOCUS.far);
    // stood against the cottage, its wall nearer than the lens focuses
    const [wall, y] = fixtureAt(23.5, 8.5);
    vf.enter(rover(wall - 1 - EYE.mast - EYE.ahead, y, 0));
    vf.update(1 / 60, g, null);
    expect(vf.focus).toBe(FOCUS.nearest);
  });

  /**
   * A gnome whose middle is drawn at (nx, ny), `d` from the lens, for a viewfinder looking north-east and a little up
   * from the open ground east of the cottage, so every line from the lens is clear of the ground.
   */
  const aimed = () => {
    const vf = new Viewfinder();
    vf.enter(rover(...fixtureAt(27, 1), Math.PI / 3));
    vf.look(0, 0.1);
    const f = new ViewFrame();
    f.of(vf.shot);
    const dir = new Float64Array(3);
    const at = (nx: number, ny: number, d = 20): Placement => {
      f.ray(nx, ny, dir);
      return {
        ...odd('gnome', 0, 0),
        x: vf.eye[0] + dir[0] * d,
        y: vf.eye[1] + dir[1] * d,
        z: vf.eye[2] + dir[2] * d - 2.5,
      };
    };
    return { vf, at, dir, f };
  };

  it('weighs a distance across the frame by its width, so the nearer on the screen is chosen', () => {
    const { vf, at } = aimed();
    // across 0.45 of a frame 1.6 times as wide as tall is further than up 0.6
    const s = new Subjects([at(0.45, 0), at(0, 0.6, 30)]);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(1);
    expect(vf.focus).toBeCloseTo(30, 9);
  });

  it('passes over an oddity whose middle is a hair outside any edge of the frame', () => {
    const { vf, at } = aimed();
    for (const [nx, ny] of [
      [1.02, 0],
      [-1.02, 0],
      [0, 1.02],
      [0, -1.02],
    ]) {
      vf.update(1 / 60, g, new Subjects([at(nx, ny)]));
      expect(vf.focused, `${nx}, ${ny}`).toBe(-1);
      expect(vf.focus).toBe(FOCUS.far);
    }
    vf.update(1 / 60, g, new Subjects([at(0.98, 0.98)]));
    expect(vf.focused).toBe(0);
  });

  it('tries the next nearest the middle when the nearest is hidden', () => {
    const { vf, at, f } = aimed();
    // a tall post fifteen out along the line to a gnome near the middle, and a gnome well off to the side in the clear
    const near = at(0.05, 0);
    const post = new Float64Array(3);
    f.ray(0.05, 0, post);
    const px = vf.eye[0] + post[0] * 15,
      py = vf.eye[1] + post[1] * 15;
    const walled: Ground = { ...g, topAt: (x, y) => (Math.hypot(x - px, y - py) < 1.5 ? 50 : g.topAt(x, y)) };
    const s = new Subjects([near, at(0.8, 0)]);
    vf.update(1 / 60, walled, s);
    expect(vf.focused).toBe(1);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(0);
  });

  it('does nothing out of the viewfinder', () => {
    const vf = new Viewfinder();
    vf.update(1 / 60, g, Subjects.of(map));
    expect(vf.focus).toBe(FOCUS.start);
    expect(vf.focused).toBe(-1);
  });
});

describe('focus by a tap', () => {
  it('sets the focus on what is under the point, and holds it as the view turns', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    // the duck is level with the lens, a little down: where it is drawn, found by the frame
    const f = new ViewFrame();
    f.of(vf.shot);
    f.project([duckX, duckY, FIXTURE_WATER + 1.2]);
    const nx = f.at[0],
      ny = f.at[1];
    vf.focusAt(nx, ny, g, s);
    expect(vf.mode).toBe('manual');
    expect(vf.focused).toBe(0);
    // the duck's middle, 30 across the water and a little under the lens
    expect(vf.focus).toBeGreaterThan(30);
    expect(vf.focus).toBeLessThan(31);
    const held = vf.focus;
    vf.look(0.4, 0);
    vf.update(1 / 60, g, s);
    expect(vf.focus).toBe(held);
    // a tap on the water near the bottom of the frame, looking down, focuses nearer
    vf.look(0, -0.5);
    vf.focusAt(0, -0.9, g, s);
    expect(vf.focused).toBe(-1);
    expect(vf.focus).toBeLessThan(held);
  });

  it('focuses a tap on the duck at the distance to its middle, as auto focus does, not at its cylinder', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    const f = new ViewFrame();
    f.of(vf.shot);
    const m = new Float64Array(3);
    s.middle(0, m);
    f.project(m);
    vf.focusAt(f.at[0], f.at[1], g, s);
    const e = vf.shot.eye;
    expect(vf.mode).toBe('manual');
    expect(vf.focused).toBe(0);
    expect(vf.focus).toBeCloseTo(Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]), 9);
  });

  it('keeps auto, and the focus where it was, for a tap on nothing', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    vf.update(1 / 60, g, s);
    const held = vf.focus,
      focused = vf.focused;
    vf.focusAt(0, -0.9, g, s);
    expect(vf.mode).toBe('auto');
    expect(vf.focus).toBe(held);
    expect(vf.focused).toBe(focused);
  });

  it('still focuses where a tap lands on nothing once it is on manual', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    vf.focusAt(0, -0.9, g, null);
    expect(vf.mode).toBe('auto');
    vf.mode = 'manual';
    vf.focusAt(0, -0.9, g, s);
    expect(vf.mode).toBe('manual');
    expect(vf.focused).toBe(-1);
  });

  it('is let go on entering again, back on auto with nothing focused on', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(0);
    vf.enter(rover(0, 0));
    expect(vf.focused).toBe(-1);
  });

  it('takes a tap in the very corner of the screen', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    // on manual, a tap on nothing still focuses where it lands
    vf.mode = 'manual';
    vf.focusAt(1, -1, g, null);
    expect(vf.mode).toBe('manual');
    expect(vf.mark[0]).toBe(1);
    expect(vf.mark[1]).toBe(-1);
  });

  it('goes back to auto, which focuses again on the next frame', () => {
    const vf = new Viewfinder();
    const s = Subjects.of(map);
    vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));
    vf.focusAt(0, -0.9, g, s);
    vf.auto();
    expect(vf.mode).toBe('auto');
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(0);
  });

  it('takes no notice of a point not on the screen, or a tap out of the viewfinder', () => {
    const vf = new Viewfinder();
    vf.focusAt(0, 0, g, null);
    expect(vf.mode).toBe('auto');
    vf.enter(rover(0, 0));
    vf.focusAt(NaN, 0, g, null);
    vf.focusAt(0, 1.5, g, null);
    expect(vf.mode).toBe('auto');
  });
});

describe('the turn rate', () => {
  it('is how fast the view turns, eased over a tenth of a second, and nought held still', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    for (let f = 0; f < 60; f++) {
      vf.look(0.05, 0);
      vf.update(1 / 60, g, null);
    }
    expect(vf.turnRate).toBeCloseTo(3, 2);
    for (let f = 0; f < 60; f++) vf.update(1 / 60, g, null);
    expect(vf.turnRate).toBeLessThan(0.01);
  });

  it('eases toward the rate a frame at a time, by the share of a tenth of a second the frame is', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(0.05, 0);
    vf.update(1 / 60, g, null);
    expect(vf.turnRate).toBeCloseTo(3 * (1 - Math.exp(-1 / 6)), 12);
  });

  it('counts a tilt as a turn, and a turn looking up or down as less across the frame', () => {
    const a = new Viewfinder(),
      b = new Viewfinder();
    a.enter(rover(0, 0));
    b.enter(rover(0, 0));
    b.look(0, -LOOK.down);
    for (let f = 0; f < 60; f++) {
      a.look(0, f % 2 ? 0.05 : -0.05);
      b.look(0.05, 0);
      a.update(1 / 60, g, null);
      b.update(1 / 60, g, null);
    }
    expect(a.turnRate).toBeCloseTo(3, 1);
    expect(b.turnRate).toBeCloseTo(3 * Math.cos(LOOK.down), 1);
  });

  it('is not a turn when the look is held at its limit', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(0, 5);
    vf.update(1 / 60, g, null);
    for (let f = 0; f < 60; f++) {
      vf.look(0, 0.05);
      vf.update(1 / 60, g, null);
    }
    expect(vf.turnRate).toBeLessThan(0.01);
  });

  it('starts from nought on entering, and a frame of no time changes nothing', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    vf.look(1, 0);
    vf.update(0, g, null);
    expect(vf.turnRate).toBe(0);
    vf.update(1 / 60, g, null);
    expect(vf.turnRate).toBeGreaterThan(0);
    vf.enter(rover(0, 0));
    expect(vf.turnRate).toBe(0);
  });
});

describe('the shot it gives', () => {
  it('is its eye, look, lens and focus, the aperture fixed', () => {
    const vf = new Viewfinder();
    vf.enter(rover(3, 4, 0.5));
    vf.aspect = 1.25;
    vf.look(0.2, 0.1);
    const s = vf.shot;
    expect([...s.eye]).toEqual([...vf.eye]);
    expect(s.yaw).toBeCloseTo(0.7, 12);
    expect(s.pitch).toBeCloseTo(0.1, 12);
    expect(s.focal).toBe(50);
    expect(s.aspect).toBe(1.25);
    expect(s.focus).toBe(vf.focus);
    expect(s.aperture).toBe(LENS.aperture);
    expect(s.fov).toBeCloseTo(fovOf(50), 12);
  });

  it('takes the screen’s shape from the page, but not one that is not a shape', () => {
    const vf = new Viewfinder();
    vf.aspect = 2;
    expect(vf.aspect).toBe(2);
    for (const bad of [0, -1, NaN, Infinity]) {
      vf.aspect = bad;
      expect(vf.aspect).toBe(2);
    }
  });

  it('is a shot whose every number is set and read back by name', () => {
    const s = new Shot();
    s.aperture = 8;
    s.turnRate = 0.5;
    s.focus = 12;
    s.yaw = 1;
    s.pitch = -0.5;
    s.focal = 85;
    s.aspect = 2;
    expect([s.yaw, s.pitch, s.focal, s.aspect, s.focus, s.aperture, s.turnRate]).toEqual([1, -0.5, 85, 2, 12, 8, 0.5]);
    expect([...s.v]).toEqual([1, -0.5, 85, 2, 12, 8, 0.5]);
    expect(s.fov).toBeCloseTo(fovOf(85), 12);
  });

  it('reads back as plain numbers for the test API', () => {
    const vf = new Viewfinder();
    vf.enter(rover(3, 4, 0.5));
    const st = vf.state();
    expect(st.active).toBe(true);
    expect(st.eye).toEqual([...vf.eye]);
    expect(st.mode).toBe('auto');
    expect(st.fov).toBeCloseTo(fovOf(50), 12);
    expect(Object.keys(st).sort()).toEqual(
      [
        'active',
        'eye',
        'yaw',
        'pitch',
        'focal',
        'fov',
        'focus',
        'mode',
        'focused',
        'turnRate',
        'headYaw',
        'headPitch',
      ].sort(),
    );
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
  });
});

describe('what is wrong with a viewfinder', () => {
  it('is nothing, however it is worked', () => {
    const vf = new Viewfinder();
    expect(viewfinderProblems(vf)).toEqual([]);
    vf.enter(rover(0, 0));
    vf.look(9, 9);
    vf.zoomBy(9);
    vf.update(1 / 60, g, Subjects.of(map));
    expect(viewfinderProblems(vf)).toEqual([]);
  });

  it('says what, when a number is not one or past its limit', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    const shot = vf.shot;
    shot.pitch = 2;
    expect(viewfinderProblems(vf).join()).toMatch(/pitch/);
    shot.pitch = 0;
    shot.focal = 300;
    expect(viewfinderProblems(vf).join()).toMatch(/lens/);
    shot.focal = 50;
    shot.focus = 0.1;
    expect(viewfinderProblems(vf).join()).toMatch(/focus/);
    shot.focus = 10;
    shot.eye[1] = NaN;
    expect(viewfinderProblems(vf).join()).toMatch(/not a number/);
    shot.eye[1] = 0;
    shot.yaw = 5;
    expect(viewfinderProblems(vf).join()).toMatch(/turned/);
    shot.yaw = 0;
    shot.turnRate = -1;
    expect(viewfinderProblems(vf).join()).toMatch(/turn rate/);
    shot.turnRate = 0;
    expect(viewfinderProblems(vf)).toEqual([]);
  });

  it('holds each limit exactly: at it is right, a hair past it is wrong', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    const v = vf.shot.v;
    const edges: [number, number, number][] = [
      [1, -LOOK.down, -LOOK.down - 1e-6],
      [1, LOOK.up, LOOK.up + 1e-6],
      [0, LOOK.turn, LOOK.turn + 1e-6],
      [0, -LOOK.turn, -LOOK.turn - 1e-6],
      [2, LENS.least, LENS.least - 1e-6],
      [2, LENS.most, LENS.most + 1e-6],
      [4, FOCUS.nearest, FOCUS.nearest - 1e-6],
      [4, FOCUS.far, FOCUS.far + 1e-6],
      [6, 0, -1e-6],
      [6, 100, 1e4],
      [3, 1e-6, 0],
    ];
    for (const [k, right, wrong] of edges) {
      const was = v[k];
      v[k] = right;
      expect(viewfinderProblems(vf), `${k} at ${right}`).toEqual([]);
      v[k] = wrong;
      expect(viewfinderProblems(vf), `${k} at ${wrong}`).toHaveLength(1);
      v[k] = was;
    }
    for (let k = 0; k < 3; k++) {
      const was = vf.eye[k];
      vf.eye[k] = Infinity;
      expect(viewfinderProblems(vf).join()).toMatch(/eye is not a number/);
      vf.eye[k] = was;
    }
    v[5] = NaN;
    expect(viewfinderProblems(vf).join()).toMatch(/not a number/);
    v[5] = LENS.aperture;
    for (const [focused, wrong] of [
      [0, false],
      [-1, false],
      [3, false],
      [-2, true],
      [1.5, true],
    ] as const) {
      vf.focused = focused;
      expect(viewfinderProblems(vf).length > 0, `${focused}`).toBe(wrong);
    }
  });
});

describe('the focus mark, and the depth the blur is focused at', () => {
  const s = Subjects.of(map);
  const enterEastOfDuck = (vf: Viewfinder) => vf.enter(rover(duckX + 30 + EYE.mast + EYE.ahead, duckY, Math.PI, 0.8));

  it('is in the middle on entering, and on auto with no oddity in frame', () => {
    const vf = new Viewfinder();
    vf.enter(rover(0, 0));
    expect([...vf.mark]).toEqual([0, 0]);
    vf.look(0, 1);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(-1);
    expect([...vf.mark]).toEqual([0, 0]);
  });

  it('is on the oddity auto focus found, where its middle is drawn', () => {
    const vf = new Viewfinder();
    enterEastOfDuck(vf);
    // turned a little so the duck is off the middle, but still the nearest it
    vf.look(0.05, -0.1);
    vf.update(1 / 60, g, s);
    expect(vf.focused).toBe(0);
    const f = new ViewFrame();
    f.of(vf.shot);
    const m = new Float64Array(3);
    s.middle(0, m);
    f.project(m);
    expect(vf.mark[0]).toBeCloseTo(f.at[0], 9);
    expect(vf.mark[1]).toBeCloseTo(f.at[1], 9);
    expect(vf.mark[0]).not.toBeCloseTo(0, 2);
    // and the depth the blur is focused at is the duck's own depth along the view
    expect(vf.focusDepth).toBeCloseTo(f.at[2], 9);
  });

  it('is where the tap was, held there as the view turns, and back to auto goes with the next frame', () => {
    const vf = new Viewfinder();
    enterEastOfDuck(vf);
    vf.mode = 'manual';
    vf.focusAt(0.3, -0.4, g, s);
    expect([...vf.mark]).toEqual([0.3, -0.4]);
    vf.look(0.2, 0.1);
    vf.update(1 / 60, g, s);
    expect([...vf.mark]).toEqual([0.3, -0.4]);
    vf.auto();
    vf.update(1 / 60, g, s);
    expect(vf.mark[0]).not.toBe(0.3);
    vf.enter(rover(0, 0));
    expect([...vf.mark]).toEqual([0, 0]);
  });

  it('puts the blur’s plane through what a tap off the middle focused on: its depth along the view', () => {
    const vf = new Viewfinder();
    enterEastOfDuck(vf);
    vf.look(0, -0.4);
    vf.mode = 'manual';
    vf.focusAt(0.6, -0.5, g, s);
    const f = new ViewFrame();
    f.of(vf.shot);
    const dir = new Float64Array(3);
    f.ray(0.6, -0.5, dir);
    const hit = [0, 1, 2].map((k) => vf.eye[k] + dir[k] * vf.focus);
    f.project(hit);
    expect(vf.focusDepth).toBeCloseTo(f.at[2], 9);
    expect(vf.focusDepth).toBeLessThan(vf.focus);
    // in the middle, the depth is the distance
    vf.focusAt(0, 0, g, s);
    expect(vf.focusDepth).toBeCloseTo(vf.focus, 12);
  });
});
