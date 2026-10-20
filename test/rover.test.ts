/**
 * The rover on the fixture world: how fast it goes on each ground, what
 * stops it and how it slides, how it sits on its wheels, and that a long
 * random drive never leaves it anywhere it should not be.
 */
import { describe, expect, it } from 'vitest';
import { seeded } from '../src/random';
import { HANDLING, HEAD, ROVER, Rover, WHEELS, moveAllowed, type Drive } from '../src/rover';
import { canMove, standable } from '../src/world/drive';
import { FIXTURE, LAMP_RADIUS, PLATEAU, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { DRIVE, SURFACE, TILE } from '../src/world/types';

const DT = 1 / 60;
const g = groundOf(fixtureWorld());
const EAST = 0,
  NORTH = Math.PI / 2,
  WEST = Math.PI;

/** A rover put down at a tile (fractions allowed), facing `yaw`. */
function roverAt(tx: number, ty: number, yaw = 0): Rover {
  const r = new Rover(g);
  const [x, y] = fixtureAt(tx, ty);
  expect(r.teleport(x, y, yaw)).toBe(true);
  return r;
}

/** Drive for `seconds`, checking after every frame that it is where it may be. */
function drive(r: Rover, seconds: number, throttle: number, steer = 0, each?: (r: Rover) => void) {
  const d: Drive = { throttle, steer };
  for (let f = 0; f < Math.round(seconds / DT); f++) {
    r.step(DT, d);
    expect(r.misplaced()).toBeNull();
    each?.(r);
  }
}

/** The ground speed over `seconds` of driving, from where it got to. */
function groundSpeed(r: Rover, seconds: number): number {
  const x = r.x,
    y = r.y;
  drive(r, seconds, 1);
  return Math.hypot(r.x - x, r.y - y) / seconds;
}

/** The left edge of tile column `tx`, in units. */
const edgeX = (tx: number) => fixtureAt(tx, 0)[0] - TILE / 2;

describe('the rover sizes', () => {
  it('is fifty centimetres long, and its wheels sit inside that', () => {
    expect(ROVER.length).toBe(5);
    expect(ROVER.wheelRadius).toBeGreaterThan(0.6);
    expect(ROVER.wheelRadius).toBeLessThan(1);
    expect(ROVER.axleX[0] + ROVER.wheelRadius).toBeLessThanOrEqual(ROVER.hull.front);
    expect(ROVER.track + ROVER.wheelWidth).toBeLessThanOrEqual(ROVER.width + 0.01);
  });
});

describe('speed by ground', () => {
  it('reaches and holds its top speed on the road, on grass, in mud, on sand and in the shallows', () => {
    // each run starts on its ground, gets going for a second, and is measured over the next
    const road = roverAt(2, 15.5, EAST);
    drive(road, 1, 1);
    const grass = roverAt(16, 0.6, EAST);
    drive(grass, 1, 1);
    const mud = roverAt(20.6, 12.5, EAST);
    drive(mud, 0.6, 1);
    const sand = roverAt(12.5, 4.5, NORTH);
    drive(sand, 1, 1);
    const shallows = roverAt(5, 4.8, NORTH);
    drive(shallows, 0.6, 1);
    const v = {
      road: groundSpeed(road, 1),
      grass: groundSpeed(grass, 1),
      mud: groundSpeed(mud, 0.8),
      sand: groundSpeed(sand, 1),
      shallows: groundSpeed(shallows, 1),
    };
    expect(shallows.wet).toBeGreaterThan(0);
    expect(v.road).toBeCloseTo(25, 0);
    expect(v.grass).toBeCloseTo(20, 0);
    expect(v.mud).toBeCloseTo(12, 0);
    expect(v.sand).toBeCloseTo(12, 0);
    expect(v.shallows).toBeCloseTo(12, 0);
    expect(mud.surface).toBe(SURFACE.mud);
    expect(sand.surface).toBe(SURFACE.sand);
  });

  it('gets going over about four tenths of a second, and stops a little quicker', () => {
    const r = roverAt(2, 15.5, EAST);
    drive(r, 0.2, 1);
    expect(r.speed).toBeGreaterThan(8);
    expect(r.speed).toBeLessThan(20);
    drive(r, 0.3, 1);
    expect(r.speed).toBeGreaterThan(23);
    drive(r, 0.4, 0);
    expect(r.speed).toBeLessThan(1);
  });

  it('reverses slower than it goes forward', () => {
    const r = roverAt(28, 15.5, EAST);
    drive(r, 1.5, -1);
    expect(r.speed).toBeLessThan(0);
    expect(-r.speed).toBeCloseTo(25 * HANDLING.reverse, 0);
  });

  it('takes no notice of a throttle or steer out of range, or not a number', () => {
    const r = roverAt(2, 15.5, EAST);
    drive(r, 1, 5);
    expect(r.speed).toBeLessThanOrEqual(25.001);
    drive(r, 0.5, Number.NaN, Number.NaN);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(r.speed).toBeLessThan(1);
  });
});

describe('turning', () => {
  it('turns on the spot, right round in about a second and a half, the sides spinning opposite ways', () => {
    const r = roverAt(16, 2, EAST);
    const x = r.x,
      y = r.y,
      left = r.spin[0],
      right = r.spin[1];
    let turned = 0,
      last = r.yaw,
      frames = 0;
    while (turned < 2 * Math.PI && frames < 300) {
      r.step(DT, { throttle: 0, steer: 1 });
      turned += Math.atan2(Math.sin(r.yaw - last), Math.cos(r.yaw - last));
      last = r.yaw;
      frames++;
    }
    expect(frames * DT).toBeGreaterThan(1.3);
    expect(frames * DT).toBeLessThan(1.9);
    expect(Math.hypot(r.x - x, r.y - y)).toBeLessThan(0.01);
    // turning left, the left side rolls backwards and the right side forwards, every wheel on a side alike
    expect(r.spin[0]).toBeLessThan(left - 1);
    expect(r.spin[1]).toBeGreaterThan(right + 1);
    for (let i = 2; i < WHEELS; i++) expect(r.spin[i]).toBe(r.spin[i & 1]);
  });

  it('turns right for a negative steer, and wider at speed than at rest', () => {
    const r = roverAt(16, 0.7, EAST);
    drive(r, 0.6, 0, -1);
    expect(r.yaw).toBeLessThan(0);
    const still = Math.abs(r.yawRate);
    const fast = roverAt(2, 15.5, EAST);
    drive(fast, 1, 1);
    drive(fast, 0.3, 1, 1);
    expect(fast.yawRate).toBeGreaterThan(0);
    expect(fast.yawRate).toBeLessThan(still);
  });

  it('rolls its wheels forward as it drives forward', () => {
    const r = roverAt(2, 15.5, EAST);
    drive(r, 0.5, 1);
    const rolled = r.rolled[0];
    expect(rolled).toBeGreaterThan(5);
    expect(r.spin[0]).toBeCloseTo(rolled / ROVER.wheelRadius, 6);
  });
});

describe('what stops it', () => {
  it('climbs the ramp to the plateau, nose up the slope', () => {
    const r = roverAt(2, 23.5, EAST);
    let steepest = 0;
    drive(r, 3, 1, 0, (r) => (steepest = Math.max(steepest, r.pitch)));
    expect(r.x).toBeGreaterThan(fixtureAt(FIXTURE.plateau[0], 0)[0]);
    expect(r.z).toBeCloseTo(PLATEAU + ROVER.wheelRadius, 0);
    // the ramp rises a tile's width for 1.5 units: about fourteen degrees
    expect(steepest).toBeGreaterThan(Math.atan(1.5 / TILE) - 0.03);
    expect(steepest).toBeLessThan(Math.atan(1.5 / TILE) + 0.06);
  });

  it('sits nose up on the ramp, and level on the flat', () => {
    const r = roverAt(6.5, 23.5, EAST);
    drive(r, 0.5, 0);
    expect(r.pitch).toBeCloseTo(Math.atan(1.5 / TILE), 1);
    expect(Math.abs(r.roll)).toBeLessThan(0.02);
    const down = roverAt(6.5, 23.5, WEST);
    drive(down, 0.5, 0);
    expect(down.pitch).toBeCloseTo(-Math.atan(1.5 / TILE), 1);
    const flat = roverAt(16, 2, EAST);
    expect(flat.pitch).toBe(0);
    expect(flat.z).toBeCloseTo(ROVER.wheelRadius, 6);
  });

  it('rolls to the side across the ramp', () => {
    const r = roverAt(6.5, 23.5, NORTH);
    drive(r, 0.5, 0);
    // facing north on a slope rising east, the right side is the high one
    expect(r.roll).toBeCloseTo(-Math.atan(1.5 / TILE), 1);
  });

  it('neither goes down the bank nor climbs it', () => {
    const top = roverAt(10, 23.5, EAST);
    drive(top, 3, 1);
    expect(top.x).toBeLessThan(edgeX(FIXTURE.bank[0] + 1));
    expect(top.z).toBeGreaterThan(PLATEAU - 1);
    const foot = roverAt(15.5, 23.5, WEST);
    drive(foot, 3, 1);
    expect(foot.x).toBeGreaterThan(edgeX(FIXTURE.bank[0] + 1));
    expect(foot.z).toBeLessThan(PLATEAU - 3);
  });

  it('neither climbs the ledge nor drops off it, and its nose stops at the face', () => {
    const below = roverAt(17, 23.5, EAST);
    drive(below, 2, 1);
    expect(below.x + ROVER.hull.front).toBeLessThanOrEqual(edgeX(FIXTURE.ledge[0]) + 0.5);
    expect(below.x + ROVER.hull.front).toBeGreaterThan(edgeX(FIXTURE.ledge[0]) - 0.6);
    const above = roverAt(23, 23.5, WEST);
    drive(above, 2, 1);
    expect(above.x).toBeGreaterThan(edgeX(FIXTURE.ledge[0]));
    expect(above.z).toBeGreaterThan(2);
  });

  it('does not ride a wheel up the face of the ledge when driven into it aslant', () => {
    for (const yaw of [-1, -0.5, 0.5, 1]) {
      const r = roverAt(16.5, 23.5, yaw);
      // the drive checks each frame that no wheel is up a face it could not climb
      drive(r, 1, 1);
      drive(r, 1, 1, yaw > 0 ? -0.4 : 0.4);
    }
  });

  it('slides along the rock when driven into it at an angle, and keeps moving', () => {
    // from the west of the rock, heading north-east into its face
    const r = roverAt(14.5, 5, Math.PI / 4);
    const y = r.y;
    let lastY = r.y,
      stalled = 0;
    drive(r, 2.5, 1, 0, (r) => {
      if (r.y - lastY < 0.05) stalled++;
      lastY = r.y;
    });
    expect(r.x + ROVER.hull.side).toBeLessThan(edgeX(FIXTURE.rock[0]) + 1.5);
    expect(r.y - y).toBeGreaterThan(25);
    expect(stalled).toBeLessThan(8);
  });

  it('stops dead driven square into the rock, and turns away from it', () => {
    const r = roverAt(14, 7.5, EAST);
    drive(r, 1.5, 1);
    expect(r.speed).toBeLessThan(5);
    const x = r.x;
    drive(r, 0.5, 1);
    expect(r.x - x).toBeLessThan(0.5);
    // it can turn away though its corners are against the face: it shuffles off the rock as it turns
    drive(r, 0.45, 0, 1);
    drive(r, 1, 1);
    expect(r.y).toBeGreaterThan(fixtureAt(0, 9)[1]);
  });

  it('stops at deep water, and backs out of it', () => {
    const r = roverAt(2, 7.5, EAST);
    drive(r, 3, 1);
    expect(r.x).toBeLessThan(edgeX(FIXTURE.deep[0]));
    for (let i = 0; i < WHEELS; i++) expect(standable(g, r.wheelX[i], r.wheelY[i])).toBe(true);
    const x = r.x;
    // backing out is slow: reverse, in water, and up the pond's shelving side
    drive(r, 1.5, -1);
    expect(r.x).toBeLessThan(x - 6);
  });

  it('stops at the cottage, and at the edge of the world', () => {
    const r = roverAt(21, 8.5, EAST);
    drive(r, 2, 1);
    expect(r.x + ROVER.hull.front).toBeLessThanOrEqual(edgeX(FIXTURE.cottage[0]) + 0.5);
    const edge = roverAt(1.5, 15.5, WEST);
    drive(edge, 2, 1);
    expect(edge.x - ROVER.hull.front).toBeGreaterThanOrEqual(g.bounds.minX - 0.5);
  });
});

describe('a lamp post', () => {
  const [lx, ly] = fixtureAt(16, 18);

  /**
   * How far the lamp's middle is outside the rover's outline, the octagon its hull is, in units: negative is inside
   * it. The farthest of its edges' lines, which outside a corner is a little less than the true distance.
   */
  function clear(r: Rover): number {
    const c = Math.cos(r.yaw),
      s = Math.sin(r.yaw);
    const ax = Math.abs((lx - r.x) * c + (ly - r.y) * s),
      ay = Math.abs(-(lx - r.x) * s + (ly - r.y) * c);
    const { front, side, cut } = ROVER.hull;
    return Math.max(ax - front, ay - side, (ax + ay - (front + side - cut)) / Math.SQRT2);
  }

  /** A rover south of the lamp, `across` units east of its line, facing north. */
  function south(across: number): Rover {
    const r = new Rover(g);
    expect(r.teleport(lx + across, ly - 10, NORTH)).toBe(true);
    expect(r.x).toBeCloseTo(lx + across, 6);
    return r;
  }

  it('is slid off when met on a cut corner of the bumper, as a wall met aslant is, and passed', () => {
    for (const across of [-2.2, -1.9, 1.9, 2.2]) {
      const r = south(across);
      let least = Infinity;
      drive(r, 1.5, 1, 0, (r) => (least = Math.min(least, clear(r))));
      // past it, north of it, and its post never more than a hair inside the outline's line
      expect(r.y, `${across}`).toBeGreaterThan(ly + 5);
      expect(least, `${across}`).toBeGreaterThan(LAMP_RADIUS - 0.4);
    }
  });

  it('stops the rover met on the flat of its bumper, as a wall met square on does, and never inside it', () => {
    for (const across of [-1.6, -1.2, -0.6, 0.6, 1.2, 1.6]) {
      const r = south(across);
      let least = Infinity;
      drive(r, 1.5, 1, 0, (r) => (least = Math.min(least, clear(r))));
      expect(least, `${across}`).toBeGreaterThan(LAMP_RADIUS - 0.4);
    }
  });

  it('stops the rover met square on, and lets it back off and go round', () => {
    const r = south(0);
    let least = Infinity;
    drive(r, 1.5, 1, 0, (r) => (least = Math.min(least, clear(r))));
    expect(r.y).toBeLessThan(ly);
    expect(least).toBeGreaterThan(LAMP_RADIUS - 0.4);
    drive(r, 0.6, -1);
    drive(r, 0.3, 0, 1);
    drive(r, 1.5, 1, 0, (r) => (least = Math.min(least, clear(r))));
    expect(least).toBeGreaterThan(LAMP_RADIUS - 0.4);
  });

  it('is never under the body, turning on the spot beside it', () => {
    const r = new Rover(g);
    expect(r.teleport(lx - ROVER.hull.side - LAMP_RADIUS - 0.2, ly, NORTH)).toBe(true);
    let least = Infinity;
    drive(r, 3, 0, 1, (r) => (least = Math.min(least, clear(r))));
    expect(least).toBeGreaterThan(LAMP_RADIUS - 0.4);
  });

  it('is never put under the rover, and the rover put over it is told of', () => {
    const r = new Rover(g);
    expect(r.teleport(lx, ly, 0.3)).toBe(true);
    expect(r.misplaced()).toBeNull();
    expect(clear(r)).toBeGreaterThan(0);
    r.x = lx + 1;
    r.y = ly;
    expect(r.misplaced()).toMatch(/over something solid/);
  });
});

describe('where it is put', () => {
  it('is put on the nearest standable place when teleported into rock or deep water', () => {
    for (const [tx, ty] of [
      [16.5, 7.5],
      [7.5, 7.5],
      [24.5, 8.5],
      [12.8, 24],
    ]) {
      const r = new Rover(g);
      const [x, y] = fixtureAt(tx, ty);
      expect(r.teleport(x, y, 0)).toBe(true);
      expect(r.misplaced()).toBeNull();
      expect(Math.hypot(r.x - x, r.y - y)).toBeLessThan(TILE * 3);
    }
  });

  it('is not put down astride the ledge, its wheels on two levels', () => {
    // lengthways along the ledge's west face, the left wheels below it and the right ones on top
    for (const yaw of [NORTH, -NORTH]) {
      const r = new Rover(g);
      expect(r.teleport(edgeX(FIXTURE.ledge[0]), fixtureAt(0, 23.5)[1], yaw)).toBe(true);
      let low = Infinity,
        high = -Infinity;
      for (let i = 0; i < WHEELS; i++) {
        low = Math.min(low, r.wheelRest[i]);
        high = Math.max(high, r.wheelRest[i]);
      }
      expect(high - low).toBeLessThan(DRIVE.step);
    }
  });

  it('stays where it is put when that is standable', () => {
    const r = new Rover(g);
    const [x, y] = fixtureAt(16, 2);
    r.teleport(x, y, 1);
    expect([r.x, r.y, r.yaw, r.speed]).toEqual([x, y, 1, 0]);
  });

  it('starts where it is asked to', () => {
    const [x, y] = fixtureAt(15.5, 15.5);
    const r = new Rover(g, { x, y, yaw: 0 });
    expect(r.x).toBe(x);
    expect(r.misplaced()).toBeNull();
  });

  it('says what is wrong when it is somewhere it should not be', () => {
    const r = roverAt(16, 2);
    r.x = fixtureAt(16.5, 7.5)[0];
    r.y = fixtureAt(16.5, 7.5)[1];
    expect(r.misplaced()).not.toBeNull();
  });
});

describe('the wheels', () => {
  it('sit on the ground and within their travel all the way up the ramp and over a step', () => {
    const r = roverAt(2, 23.5, EAST);
    const check = (r: Rover) => {
      for (let s = 0; s < 2; s++) {
        expect(Math.abs(r.rocker[s])).toBeLessThan(ROVER.rockerTravel);
        expect(Math.abs(r.bogie[s])).toBeLessThan(ROVER.bogieTravel);
      }
      for (let i = 0; i < WHEELS; i++) expect(Math.abs(r.wheelZ[i] - r.wheelRest[i])).toBeLessThan(ROVER.slack);
    };
    drive(r, 3, 1, 0, check);
    // a one-unit step, which it rolls over: a terrace only half the ledge's height, made up for this test
    const stepped = { ...g, heightAt: (x: number, y: number) => g.heightAt(x, y) + (x > 0 ? DRIVE.step * 0.9 : 0) };
    const s = new Rover(stepped);
    s.teleport(-12, -80, EAST);
    let rose = 0;
    drive(s, 1.5, 1, 0, (r) => {
      check(r);
      rose = Math.max(rose, r.rocker[0], r.bogie[0]);
    });
    expect(s.x).toBeGreaterThan(5);
    expect(s.z).toBeCloseTo(ROVER.wheelRadius + DRIVE.step * 0.9, 1);
    expect(rose).toBeGreaterThan(0.1);
  });

  it('roll over a step rather than jumping it: no wheel takes the whole step in one frame', () => {
    const stepped = { ...g, heightAt: (x: number, y: number) => g.heightAt(x, y) + (x > 0 ? DRIVE.step * 0.9 : 0) };
    const s = new Rover(stepped);
    s.teleport(-12, -80, EAST);
    const last = new Float64Array(s.wheelRest);
    const rising = new Float64Array(WHEELS);
    drive(s, 1.5, 1, 0, (r) => {
      for (let i = 0; i < WHEELS; i++) {
        const rise = r.wheelRest[i] - last[i];
        // a tyre meets an edge part way up its face, so it is lifted part of the way at once and rolls up the rest
        expect(rise).toBeLessThan(DRIVE.step * 0.9 * 0.8);
        if (rise > 0.01) rising[i]++;
        last[i] = r.wheelRest[i];
      }
    });
    for (let i = 0; i < WHEELS; i++) expect(rising[i]).toBeGreaterThanOrEqual(2);
  });

  it('lets the body sway a little when it sets off and when it turns at speed', () => {
    const r = roverAt(2, 15.5, EAST);
    let nose = 0;
    drive(r, 0.3, 1, 0, (r) => (nose = Math.max(nose, r.pitch)));
    expect(nose).toBeGreaterThan(0.01);
    expect(nose).toBeLessThan(0.1);
    let lean = 0;
    drive(r, 0.6, 1, 1, (r) => (lean = Math.max(lean, r.roll)));
    expect(lean).toBeGreaterThan(0.01);
    expect(lean).toBeLessThan(0.1);
  });
});

describe('a long random drive', () => {
  it('never leaves the rover anywhere it should not be (criterion 6)', () => {
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed);
      const r = new Rover(g, fixtureWorld().start);
      const d: Drive = { throttle: 0, steer: 0 };
      let until = 0,
        moved = 0;
      for (let f = 0; f < 12_000; f++) {
        if (f >= until) {
          until = f + 20 + Math.floor(random() * 120);
          d.throttle = random() < 0.15 ? 0 : random() * 2 - 1;
          d.steer = random() < 0.5 ? 0 : random() * 2 - 1;
          // now and then, put it down somewhere at random, rock and water included
          if (random() < 0.04) {
            const b = g.bounds;
            r.teleport(b.minX + random() * (b.maxX - b.minX), b.minY + random() * (b.maxY - b.minY), random() * 6);
          }
        }
        const x = r.x,
          y = r.y;
        // a frame now and then that the page took long over
        r.step(random() < 0.01 ? 0.1 : DT, d);
        moved += Math.hypot(r.x - x, r.y - y);
        const wrong = r.misplaced();
        if (wrong) throw new Error(`seed ${seed}, frame ${f}: ${wrong}`);
        for (let s = 0; s < 2; s++) {
          expect(Math.abs(r.rocker[s])).toBeLessThan(ROVER.rockerTravel);
          expect(Math.abs(r.bogie[s])).toBeLessThan(ROVER.bogieTravel);
        }
      }
      expect(moved).toBeGreaterThan(1000);
    }
  });
});

describe('the drive rule', () => {
  it('is the same as canMove, the rule the drive graph is built by, over thousands of short moves', () => {
    const random = seeded(7);
    const b = g.bounds;
    let refused = 0;
    for (let k = 0; k < 20_000; k++) {
      const ax = b.minX + random() * (b.maxX - b.minX),
        ay = b.minY + random() * (b.maxY - b.minY);
      const a = random() * 2 * Math.PI,
        len = random() * DRIVE.probe;
      const bx = ax + len * Math.cos(a),
        by = ay + len * Math.sin(a);
      const want = canMove(g, ax, ay, bx, by);
      expect(moveAllowed(g, ax, ay, bx, by)).toBe(want);
      if (!want) refused++;
    }
    // and with a ledge in every move, so the rise is what decides
    const stepped = { ...g, heightAt: (x: number, y: number) => g.heightAt(x, y) + (x > 0 ? DRIVE.step + 0.05 : 0) };
    for (let k = 0; k < 2000; k++) {
      const ax = -0.4 + random() * 0.4,
        bx = random() * 0.4,
        y = -80 + random();
      expect(moveAllowed(stepped, ax, y, bx, y)).toBe(canMove(stepped, ax, y, bx, y));
    }
    expect(refused).toBeGreaterThan(500);
  });
});

describe('the head and the eyes', () => {
  /** Step with the controls as given, the camera at a point, for `seconds`, calling `each` after every frame. */
  function watch(r: Rover, seconds: number, d: Drive, eye: [number, number, number], each?: (r: Rover) => void) {
    for (let f = 0; f < Math.round(seconds / DT); f++) {
      r.lookAt(...eye);
      r.step(DT, d);
      each?.(r);
    }
  }

  it('looks into a turn while driving, not past its stop', () => {
    const r = roverAt(16, 2, EAST);
    const behind: [number, number, number] = [r.x - 60, r.y, 60];
    watch(r, 0.6, { throttle: 1, steer: 1 }, behind);
    expect(r.headYaw).toBeGreaterThan(0.3);
    expect(r.headYaw).toBeLessThanOrEqual(HEAD.most + 0.05);
    expect(r.headPitch).toBeLessThan(0);
    watch(r, 0.6, { throttle: 1, steer: -1 }, behind);
    expect(r.headYaw).toBeLessThan(-0.3);
  });

  it('turns round and looks up at the camera after standing still a while, and forward again on driving off', () => {
    const r = roverAt(16, 2, EAST);
    // the camera behind and to the left, and above
    const eye: [number, number, number] = [r.x - 40, r.y + 40, 60];
    watch(r, 1.5, { throttle: 0, steer: 0 }, eye);
    expect(Math.abs(r.headYaw)).toBeLessThan(0.05);
    watch(r, 2.5, { throttle: 0, steer: 0 }, eye);
    expect(r.still).toBeGreaterThan(HEAD.idle);
    expect(r.headYaw).toBeCloseTo((3 * Math.PI) / 4, 1);
    expect(r.headPitch).toBeGreaterThan(0.4);
    watch(r, 0.8, { throttle: 1, steer: 0 }, eye);
    expect(Math.abs(r.headYaw)).toBeLessThan(0.15);
    expect(r.still).toBe(0);
  });

  it('takes its time turning to look, but turns into a steer at once', () => {
    const r = roverAt(16, 2, EAST);
    const eye: [number, number, number] = [r.x - 40, r.y + 40, 60];
    watch(r, HEAD.idle + 0.1, { throttle: 0, steer: 0 }, eye);
    watch(r, 0.15, { throttle: 0, steer: 0 }, eye);
    // a quarter of a second after it starts to turn round, not yet half the way (a turn into a steer is two thirds there)
    expect(r.headYaw).toBeLessThan(((3 * Math.PI) / 4) * 0.45);
    const s = roverAt(16, 2, EAST);
    watch(s, 0.15, { throttle: 0, steer: 1 }, eye);
    expect(s.headYaw).toBeGreaterThan(HEAD.most * 0.3);
  });

  it('turns round no further than short of straight back, and stays on the side it chose', () => {
    const r = roverAt(16, 2, EAST);
    let most = 0;
    watch(r, 5, { throttle: 0, steer: 0 }, [r.x - 80, r.y, 60], (r) => (most = Math.max(most, Math.abs(r.headYaw))));
    expect(Math.abs(r.headYaw)).toBeCloseTo(HEAD.round, 1);
    expect(most).toBeLessThan(HEAD.round + 0.1);
  });

  it('looks ahead when nobody has said where the camera is', () => {
    const r = roverAt(16, 2, EAST);
    for (let f = 0; f < 300; f++) r.step(DT, { throttle: 0, steer: 0 });
    expect(r.headYaw).toBe(0);
    expect(r.headPitch).toBe(0);
  });

  it('blinks every few seconds, the lids shutting and opening, the same every time', () => {
    const lids = (r: Rover) => {
      const seen: number[] = [];
      let starts = 0,
        last = 0,
        shut = 0;
      for (let f = 0; f < 60 * 30; f++) {
        r.step(DT, { throttle: 0, steer: 0 });
        expect(r.blink).toBeGreaterThanOrEqual(0);
        expect(r.blink).toBeLessThanOrEqual(1);
        if (r.blink > 0 && last === 0) starts++;
        shut = Math.max(shut, r.blink);
        last = r.blink;
        seen.push(r.blink);
      }
      return { seen, starts, shut };
    };
    const a = lids(roverAt(16, 2, EAST)),
      b = lids(roverAt(16, 2, EAST));
    expect(a.seen).toEqual(b.seen);
    // thirty seconds at one every three to five and a half, some of them twice
    expect(a.starts).toBeGreaterThan(30 / (HEAD.every + HEAD.spread));
    expect(a.starts).toBeLessThan(30 / HEAD.every + 6);
    expect(a.shut).toBeGreaterThan(0.8);
  });

  it('blinks twice in quick succession now and then', () => {
    const r = roverAt(16, 2, EAST);
    const starts: number[] = [];
    let last = 0;
    for (let f = 0; f < 60 * 120; f++) {
      r.step(DT, { throttle: 0, steer: 0 });
      if (r.blink > 0 && last === 0) starts.push(f * DT);
      last = r.blink;
    }
    let doubles = 0;
    for (let i = 1; i < starts.length; i++) if (starts[i] - starts[i - 1] < HEAD.again + 0.05) doubles++;
    expect(doubles).toBeGreaterThan(0);
    expect(doubles).toBeLessThan(starts.length / 2);
  });
});

describe('held for the viewfinder', () => {
  it('stops dead when halted, and stands where it was while it is stepped with nothing', () => {
    const r = roverAt(16, 2, EAST);
    drive(r, 1, 1, 0.5);
    expect(Math.abs(r.speed)).toBeGreaterThan(1);
    r.halt();
    expect(r.speed).toBe(0);
    expect(r.yawRate).toBe(0);
    const [x, y, yaw] = [r.x, r.y, r.yaw];
    drive(r, 1, 0);
    expect([r.x, r.y, r.yaw]).toEqual([x, y, yaw]);
  });

  it('turns its head exactly as it is held, and springs back once let go', () => {
    const r = roverAt(16, 2, EAST);
    r.hold[0] = 1;
    r.hold[1] = 2.5;
    r.hold[2] = -0.6;
    r.step(DT, { throttle: 0, steer: 0 });
    expect(r.headYaw).toBe(2.5);
    expect(r.headPitch).toBe(-0.6);
    // held, it takes no notice of a camera to look at however long it stands
    for (let f = 0; f < 300; f++) {
      r.lookAt(r.x - 40, r.y, 60);
      r.step(DT, { throttle: 0, steer: 0 });
    }
    expect(r.headYaw).toBe(2.5);
    r.hold[0] = 0;
    for (let f = 0; f < 60; f++) r.step(DT, { throttle: 1, steer: 0 });
    expect(Math.abs(r.headYaw)).toBeLessThan(0.15);
  });
});
