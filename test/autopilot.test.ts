/**
 * The autopilot on the fixture: it follows routes written by hand, as the
 * drive graph's A* will hand it one, up the ramp, round the rock, and to a
 * stop at the end.
 */
import { describe, expect, it } from 'vitest';
import { Autopilot, PILOT } from '../src/autopilot';
import { ROVER, Rover, type Drive } from '../src/rover';
import { PLATEAU, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';

const DT = 1 / 60;
const g = groundOf(fixtureWorld());

/** A route through tile middles, as x, y pairs in units. */
function route(...tiles: [number, number][]): Float32Array {
  return Float32Array.from(tiles.flatMap(([tx, ty]) => fixtureAt(tx, ty)));
}

/** Fly a route from its first point for at most `seconds`, checking the rover each frame. */
function fly(path: Float32Array, yaw: number, seconds: number, each?: (r: Rover, d: Drive) => void) {
  const r = new Rover(g);
  expect(r.teleport(path[0], path[1], yaw)).toBe(true);
  const pilot = new Autopilot(path);
  const d: Drive = { throttle: 0, steer: 0 };
  let t = 0;
  while (!pilot.done && t < seconds) {
    pilot.drive(r, DT, d);
    r.step(DT, d);
    expect(r.misplaced()).toBeNull();
    each?.(r, d);
    t += DT;
  }
  return { r, pilot, t };
}

describe('the autopilot', () => {
  it('drives from the start, along the road and up the ramp to the plateau', () => {
    const path = route([15.5, 15.5], [3, 17], [2, 23.5], [6, 23.5], [10, 23.5]);
    const { r, pilot, t } = fly(path, Math.PI, 20);
    expect(pilot.done).toBe(true);
    expect(Math.hypot(r.x - path[8], r.y - path[9])).toBeLessThan(PILOT.arrive + 0.5);
    expect(r.z).toBeCloseTo(PLATEAU + ROVER.wheelRadius, 0);
    // about 115 units of road and grass, at up to 25 and 20 a second, with three turns
    expect(t).toBeLessThan(10);
  });

  it('turns to face its first waypoint before it sets off, when it starts facing away', () => {
    const path = route([16, 18], [16, 24]);
    let firstMove = -1;
    const { pilot } = fly(path, -Math.PI / 2, 10, (r, d) => {
      if (firstMove < 0 && d.throttle > 0.1) firstMove = r.yaw;
    });
    expect(pilot.done).toBe(true);
    expect(Math.cos(firstMove - Math.PI / 2)).toBeGreaterThan(Math.cos(1.2));
  });

  it('follows a route that hugs the rock, round its corner, without being stopped by it', () => {
    const path = route([14, 12.5], [18, 12.5], [18.5, 8], [18.5, 2]);
    let blocked = 0;
    const { pilot, t } = fly(path, 0, 20, (r) => {
      if (r.blocked) blocked++;
    });
    expect(pilot.done).toBe(true);
    expect(t).toBeLessThan(8);
    expect(blocked).toBeLessThan(30);
  });

  it('slows coming up to a sharp corner, before it turns, and not on the straight', () => {
    const path = route([2, 15.5], [14, 15.5], [14, 2]);
    let comingUp = Infinity,
      onStraight = 0;
    const [cx] = fixtureAt(14, 15.5);
    fly(path, 0, 10, (r) => {
      // still on the straight, facing along it, a little short of the corner
      if (r.x > cx - 8 && r.x < cx - 6 && Math.abs(r.yaw) < 0.1) comingUp = Math.min(comingUp, r.speed);
      if (Math.abs(r.x - fixtureAt(7, 0)[0]) < 2) onStraight = Math.max(onStraight, r.speed);
    });
    expect(onStraight).toBeGreaterThan(23);
    expect(comingUp).toBeLessThan(onStraight * 0.85);
  });

  it('comes to a stop at the end, and asks for nothing once there', () => {
    const path = route([16, 18], [16, 22]);
    const { r, pilot } = fly(path, Math.PI / 2, 10);
    expect(pilot.done).toBe(true);
    const d: Drive = { throttle: 1, steer: 1 };
    pilot.drive(r, DT, d);
    expect(d).toEqual({ throttle: 0, steer: 0 });
    for (let f = 0; f < 30; f++) r.step(DT, d);
    expect(Math.abs(r.speed)).toBeLessThan(0.5);
  });

  it('is done at once with no route, or a route of one point', () => {
    expect(new Autopilot(new Float32Array(0)).done).toBe(true);
    const r = new Rover(g, fixtureWorld().start);
    const pilot = new Autopilot(Float32Array.of(r.x, r.y));
    const d: Drive = { throttle: 0, steer: 0 };
    pilot.drive(r, DT, d);
    expect(pilot.done).toBe(true);
  });

  it('backs off and tries again when something it did not expect stops it', () => {
    // a route straight through the rock, which no planner would give: it must not sit pushing at the face
    const path = route([13, 7.5], [20, 7.5]);
    let backed = false;
    fly(path, 0, 6, (_r, d) => {
      if (d.throttle < 0) backed = true;
    });
    expect(backed).toBe(true);
  });

  it('goes round a lamp post that stands on the line of its route', () => {
    // the fixture's lamp is in the middle of tile 16, 18: a route a point a tile, half a tile either side of it, as a
    // planner for a point would give, runs the rover's nose into the post
    const path = route([16, 15.5], [16, 16.5], [16, 17.5], [16, 18.5], [16, 19.5], [16, 20.5], [16, 22]);
    const { pilot, r } = fly(path, Math.PI / 2, 15);
    expect(pilot.done).toBe(true);
    expect(r.y).toBeGreaterThan(fixtureAt(0, 21)[1]);
  });

  it('can be handed a new route, and follows that', () => {
    const r = new Rover(g, fixtureWorld().start);
    const pilot = new Autopilot(new Float32Array(0));
    pilot.follow(route([15.5, 15.5], [20, 15.5]));
    expect(pilot.done).toBe(false);
    const d: Drive = { throttle: 0, steer: 0 };
    for (let f = 0; f < 600 && !pilot.done; f++) {
      pilot.drive(r, DT, d);
      r.step(DT, d);
    }
    expect(pilot.done).toBe(true);
    expect(r.x).toBeGreaterThan(fixtureAt(19, 0)[0]);
  });
});
