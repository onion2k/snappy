/**
 * The chase camera on the fixture: where it stands, how it swings round
 * behind the rover, its zoom, and that its line to the rover never goes
 * into the ground and rises over the cottage.
 */
import { describe, expect, it } from 'vitest';
import { CAMERA_CLEAR, CHASE, ChaseCamera, cameraProblems, dragOrbit, stillAt, tiltAt, wrap } from '../src/camera';
import { seeded } from '../src/random';
import { ROVER, Rover } from '../src/rover';
import { FIXTURE, fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import type { Ground } from '../src/world/types';

const DT = 1 / 60;
const g = groundOf(fixtureWorld());

function roverAt(tx: number, ty: number, yaw: number, ground: Ground = g) {
  const r = new Rover(ground);
  expect(r.teleport(...fixtureAt(tx, ty), yaw)).toBe(true);
  return r;
}

/** How far from straight down the camera looks, in degrees. */
function tiltOf(cam: ChaseCamera): number {
  const dx = cam.position[0] - cam.target[0],
    dy = cam.position[1] - cam.target[1],
    dz = cam.position[2] - cam.target[2];
  return (Math.atan2(Math.hypot(dx, dy), dz) * 180) / Math.PI;
}

/** The lowest the camera's line to its target comes to the ground, sampled finely: above nought is clear. */
function clearance(cam: ChaseCamera, ground: Ground = g): number {
  let least = Infinity;
  for (let k = 4; k <= 128; k++) {
    const f = k / 128;
    const x = cam.target[0] + (cam.position[0] - cam.target[0]) * f,
      y = cam.target[1] + (cam.position[1] - cam.target[1]) * f,
      z = cam.target[2] + (cam.position[2] - cam.target[2]) * f;
    least = Math.min(least, z - ground.heightAt(x, y));
  }
  return least;
}

/** Run the camera after a rover for `seconds`. */
function follow(cam: ChaseCamera, r: Rover, seconds: number, ground: Ground = g) {
  for (let f = 0; f < Math.round(seconds / DT); f++) cam.update(r, ground, DT);
}

describe('where it stands', () => {
  it('stands twelve metres back, tilted about sixty-two degrees from straight down, behind the rover', () => {
    const r = roverAt(28, 18, 0.7);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    expect(cam.distance).toBe(CHASE.home);
    expect(CHASE.home).toBe(120);
    expect(tiltOf(cam)).toBeCloseTo(62, 0);
    // over a broadleaf's crown (4.2 m) and under a conifer's (5.2 m): the eye is 120 cos 62 degrees, some 56 units, up
    expect(cam.position[2] - g.heightAt(cam.position[0], cam.position[1])).toBeGreaterThan(50);
    const back = Math.hypot(...[0, 1, 2].map((i) => cam.position[i] - cam.target[i]));
    expect(back).toBeCloseTo(120, 0);
    // behind: the camera is the other way from the heading
    const ahead = (cam.position[0] - r.x) * Math.cos(r.yaw) + (cam.position[1] - r.y) * Math.sin(r.yaw);
    expect(ahead).toBeLessThan(-50);
  });

  it('looks a little ahead of the rover standing, about a second ahead going, and back toward it reversing', () => {
    const r = roverAt(2, 15.5, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    // standing, the rover sits below the middle of the screen
    expect(cam.target[0] - r.x).toBeCloseTo(CHASE.lead.still * CHASE.home, 6);
    for (let f = 0; f < 150; f++) {
      r.step(DT, { throttle: 1, steer: 0 });
      cam.update(r, g, DT);
    }
    expect(cam.target[0] - r.x).toBeGreaterThan(18);
    expect(cam.target[0] - r.x).toBeLessThanOrEqual(CHASE.lead.most * CHASE.home + 1e-9);
    expect(Math.abs(cam.target[1] - r.y)).toBeLessThan(0.5);
    for (let f = 0; f < 150; f++) {
      r.step(DT, { throttle: -1, steer: 0 });
      cam.update(r, g, DT);
    }
    expect(cam.target[0] - r.x).toBeLessThan(0);
    expect(cam.target[0] - r.x).toBeGreaterThanOrEqual(-CHASE.lead.back * CHASE.home - 1);
  });

  it('keeps the rover at the same place on the screen at every zoom', () => {
    const r = roverAt(28, 18, 0);
    for (const zoom of [0.01, 1, 100]) {
      const cam = new ChaseCamera();
      cam.zoomBy(zoom);
      cam.snap(r, g);
      expect((cam.target[0] - r.x) / cam.distance).toBeCloseTo(stillAt(cam.distance), 6);
    }
  });

  it('looks further ahead standing the further out it is, from a tenth at home to three tenths right out', () => {
    expect(stillAt(CHASE.near)).toBe(CHASE.lead.still);
    expect(stillAt(CHASE.home)).toBe(CHASE.lead.still);
    expect(stillAt(CHASE.far)).toBeCloseTo(0.3, 9);
    expect(stillAt((CHASE.home + CHASE.far) / 2)).toBeCloseTo(0.2, 9);
    // and going, never less far than standing
    const r = roverAt(2, 15.5, 0);
    const cam = new ChaseCamera();
    cam.zoomBy(100);
    cam.snap(r, g);
    for (let f = 0; f < 120; f++) {
      r.step(DT, { throttle: 1, steer: 0 });
      cam.update(r, g, DT);
    }
    expect(cam.target[0] - r.x).toBeGreaterThan(0.25 * CHASE.far);
  });

  it('swings round behind a new heading slowly, and settles there', () => {
    const r = roverAt(28, 18, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    r.teleport(r.x, r.y, Math.PI / 2);
    follow(cam, r, 0.25);
    expect(cam.azimuth).toBeGreaterThan(0.05);
    expect(cam.azimuth).toBeLessThan(Math.PI / 4);
    follow(cam, r, 3);
    expect(cam.azimuth).toBeCloseTo(Math.PI / 2, 2);
    expect(cam.position[1]).toBeLessThan(r.y - 50);
  });

  it('takes the short way round', () => {
    const r = roverAt(16, 2, 3);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    r.teleport(r.x, r.y, -3);
    follow(cam, r, 3);
    expect(Math.cos(cam.azimuth + 3)).toBeCloseTo(1, 3);
    // through the half turn and not back round through nought: it never faces east on the way
    cam.snap(roverAt(16, 2, 3), g);
    r.teleport(r.x, r.y, -3);
    for (let f = 0; f < 120; f++) {
      cam.update(r, g, DT);
      expect(Math.cos(cam.azimuth)).toBeLessThan(-0.9);
    }
  });

  it('holds still when no time passes', () => {
    const r = roverAt(16, 2, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    const before = Array.from(cam.position);
    r.teleport(r.x, r.y, 2);
    cam.update(r, g, 0);
    expect(Array.from(cam.position)).toEqual(before);
  });
});

describe('the zoom', () => {
  it('goes from four metres to fifty, easing there', () => {
    const r = roverAt(28, 18, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    cam.zoomBy(0.01);
    expect(cam.zoom).toBe(CHASE.near);
    expect(CHASE.near).toBe(40);
    follow(cam, r, 0.05);
    expect(cam.distance).toBeGreaterThan(CHASE.near);
    follow(cam, r, 2);
    expect(cam.distance).toBeCloseTo(CHASE.near, 1);
    cam.zoomBy(100);
    expect(cam.zoom).toBe(CHASE.far);
    expect(CHASE.far).toBe(500);
    follow(cam, r, 2);
    expect(cam.distance).toBeCloseTo(CHASE.far, 0);
    cam.zoomBy(Number.NaN);
    cam.zoomBy(0);
    expect(cam.zoom).toBe(CHASE.far);
  });

  it('looks lower near in, at the rover, and further toward the horizon zoomed out', () => {
    const r = roverAt(28, 18, 0);
    const cam = new ChaseCamera();
    cam.zoomBy(0.01);
    cam.snap(r, g);
    const near = tiltOf(cam);
    cam.zoomBy(100);
    cam.snap(r, g);
    const far = tiltOf(cam);
    expect(near).toBeCloseTo(CHASE.tilt.near, 6);
    expect(far).toBeCloseTo(CHASE.tilt.far, 6);
    expect(far).toBeGreaterThan(near);
    // right out, the horizon is far enough under the top of a 40-degree lens's view for an eighth to a quarter of it
    // to be sky over flat ground
    const above =
      (Math.tan((20 * Math.PI) / 180) - Math.tan(((90 - far) * Math.PI) / 180)) / (2 * Math.tan((20 * Math.PI) / 180));
    expect(above).toBeGreaterThan(0.12);
    expect(above).toBeLessThan(0.25);
  });
});

describe('the ground and what stands on it', () => {
  it('never goes into the ground, by the ramp, the bank, the plateau or the ledge, at any zoom or heading', () => {
    const places = [
      [6, 23.5], // on the ramp
      [10, 23.5], // on the plateau, by the bank's top
      [15, 23.5], // at the bank's foot
      [10, 18], // under the plateau's eased north side
      [18.5, 23.5], // at the ledge's foot
      [21, 23.5], // on the ledge, by its edge
      [3, 7.5], // at the pond's edge
      [14.5, 7.5], // beside the rock
    ];
    for (const [tx, ty] of places)
      for (const zoom of [0.01, 1, 100])
        for (let k = 0; k < 8; k++) {
          const r = roverAt(tx, ty, (k * Math.PI) / 4);
          const cam = new ChaseCamera();
          cam.zoomBy(zoom);
          cam.snap(r, g);
          const at = `${tx},${ty} heading ${k} zoom ${zoom}`;
          expect(clearance(cam), at).toBeGreaterThan(0);
          expect(cam.position[2] - g.heightAt(cam.position[0], cam.position[1]), at).toBeGreaterThanOrEqual(
            CHASE.margin - 1e-9,
          );
          expect(cameraProblems(cam, g), at).toEqual([]);
          follow(cam, r, 0.5);
          expect(clearance(cam), at).toBeGreaterThan(0);
          expect(cameraProblems(cam, g), at).toEqual([]);
        }
  });

  it('never goes into the ground following the rover about the fixture', () => {
    const random = seeded(3);
    const r = new Rover(g, fixtureWorld().start);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    const d = { throttle: 1, steer: 0 };
    let worst = Infinity;
    for (let f = 0; f < 6000; f++) {
      if (f % 90 === 0) {
        d.throttle = random() * 2 - 0.6;
        d.steer = random() * 2 - 1;
        if (random() < 0.2) cam.zoomBy(0.5 + random() * 1.5);
      }
      r.step(DT, d);
      cam.update(r, g, DT);
      worst = Math.min(worst, clearance(cam));
      const wrong = cameraProblems(cam, g);
      if (wrong.length) throw new Error(`frame ${f}: ${wrong.join('; ')}`);
    }
    expect(worst).toBeGreaterThan(0);
  });

  it('rises when the cottage stands between it and the rover, and comes back down after', () => {
    // east of the cottage, facing east, so the camera is behind it to the west, over the cottage
    const open: Ground = { ...g, topAt: (x, y) => g.heightAt(x, y) };
    const tx = FIXTURE.cottage[2] + 2,
      ty = FIXTURE.cottage[1] + 1;
    const plain = new ChaseCamera();
    plain.snap(roverAt(tx, ty, 0, open), open);
    const r = roverAt(tx, ty, 0);
    const cam = new ChaseCamera();
    cam.snap(roverAt(tx + 4, ty, 0), g);
    follow(cam, r, 1.5);
    expect(cam.position[2]).toBeGreaterThan(plain.position[2] + 10);
    expect(tiltOf(cam)).toBeLessThan(tiltOf(plain) - 5);
    // the line passes over the cottage's roof, as tall as the ground's top says, wherever it crosses it
    for (let k = 1; k < 128; k++) {
      const f = k / 128;
      const x = cam.target[0] + (cam.position[0] - cam.target[0]) * f,
        y = cam.target[1] + (cam.position[1] - cam.target[1]) * f,
        z = cam.target[2] + (cam.position[2] - cam.target[2]) * f;
      if (g.solidAt(x, y)) expect(z).toBeGreaterThan(g.topAt(x, y));
    }
    // driven north out from behind it, the camera comes back down, not at once
    r.teleport(...fixtureAt(tx, ty + 6), 0);
    follow(cam, r, 0.1);
    expect(tiltOf(cam)).toBeLessThan(tiltOf(plain) - 2);
    follow(cam, r, 4);
    expect(tiltOf(cam)).toBeCloseTo(tiltOf(plain), 0);
  });

  it('rises at once when it would be in the ground, and not only in time', () => {
    // a cliff twenty units tall just behind the rover, which nothing in the fixture is: a line at the far zoom's low
    // angle runs into it
    const [x, y] = fixtureAt(28, 18);
    const cliff: Ground = { ...g, heightAt: (px, py) => g.heightAt(px, py) + (px < x - 6 ? 20 : 0) };
    const cam = new ChaseCamera();
    cam.zoomBy(100);
    // placed on the plain ground, and then the cliff is there: as though the rover had been put down by it
    const at = { x, y, z: ROVER.wheelRadius, yaw: 0, speed: 0 };
    cam.snap(at, g);
    cam.update(at, cliff, DT);
    expect(clearance(cam, cliff)).toBeGreaterThan(0);
  });

  it('never puts its eye inside the cottage or the rock, at any zoom, driven round them', () => {
    for (const zoom of [0.01, 1, 100]) {
      const random = seeded(5);
      const r = roverAt(FIXTURE.cottage[0] - 2, FIXTURE.cottage[1] + 0.5, 0);
      const cam = new ChaseCamera();
      cam.zoomBy(zoom);
      cam.snap(r, g);
      const d = { throttle: 1, steer: 0 };
      for (let f = 0; f < 2400; f++) {
        if (f % 60 === 0) {
          d.throttle = random() * 2 - 0.5;
          d.steer = random() * 2 - 1;
          // and now and then put down close by the cottage or the rock, facing anywhere
          if (random() < 0.3) {
            const [x, y] = random() < 0.5 ? fixtureAt(26.5, 8.5) : fixtureAt(18.5, 7);
            r.teleport(x + random() * 4 - 2, y + random() * 4 - 2, random() * 7);
          }
        }
        r.step(DT, d);
        cam.update(r, g, DT);
        const wrong = cameraProblems(cam, g);
        if (wrong.length) throw new Error(`zoom ${zoom}, frame ${f}: ${wrong.join('; ')}`);
      }
    }
  });

  it('puts its eye over a roof that stands where it would be', () => {
    // a tower forty units tall over everything west of the rover, where the eye stands: the line to the rover is
    // in front of it, so only the eye's own check lifts it
    const [x, y] = fixtureAt(28, 18);
    const tower: Ground = { ...g, topAt: (px, py) => g.heightAt(px, py) + (px < x - 50 ? 80 : 0) };
    const cam = new ChaseCamera();
    cam.snap({ x, y, z: ROVER.wheelRadius, yaw: 0, speed: 0 }, tower);
    expect(cam.position[2]).toBeGreaterThanOrEqual(tower.topAt(cam.position[0], cam.position[1]) + CHASE.margin - 1e-9);
    expect(cameraProblems(cam, tower)).toEqual([]);
  });
});

describe('lifting over what is near', () => {
  it('puts its eye over a tower too tall for any tilt to clear', () => {
    // a tower two hundred units tall over everything from just behind where it looks, zoomed right in: even looking
    // straight down the eye would be inside it, so it is lifted outright
    const [x, y] = fixtureAt(28, 18);
    const tower: Ground = { ...g, topAt: (px, py) => g.heightAt(px, py) + (px < x + 3 ? 200 : 0) };
    const cam = new ChaseCamera();
    cam.zoomBy(0.01);
    cam.snap({ x, y, z: ROVER.wheelRadius, yaw: 0, speed: 0 }, tower);
    expect(cam.position[2]).toBeGreaterThanOrEqual(200 + CHASE.margin - 1e-9);
    expect(cameraProblems(cam, tower)).toEqual([]);
  });

  it('looks over the lip of a terrace that is right behind where it looks', () => {
    // a terrace ten units tall whose face is a third of a unit behind where it looks, toward the eye; the rover low,
    // the standing lead back, so where it looks is the foot of the face
    const [x, y] = fixtureAt(28, 18);
    const lip = x - 0.3;
    const terrace: Ground = {
      ...g,
      heightAt: (px, py) => g.heightAt(px, py) + (px < lip ? 10 : 0),
      topAt: (px, py) => g.heightAt(px, py) + (px < lip ? 10 : 0),
    };
    const cam = new ChaseCamera();
    cam.snap({ x: x - CHASE.lead.still * CHASE.home, y, z: ROVER.wheelRadius, yaw: 0, speed: 0 }, terrace);
    for (let d = 0; d <= 3; d += 0.05) {
      const f = d / Math.hypot(cam.position[0] - cam.target[0], cam.position[1] - cam.target[1]);
      const px = cam.target[0] + (cam.position[0] - cam.target[0]) * f,
        py = cam.target[1] + (cam.position[1] - cam.target[1]) * f;
      expect(cam.target[2] + (cam.position[2] - cam.target[2]) * f, `${d} back`).toBeGreaterThan(
        terrace.heightAt(px, py),
      );
    }
  });

  it('does not lift for the cottage when the cottage is ahead of the rover, between it and where it looks', () => {
    // zoomed out, looking a long way ahead, past the cottage: the cottage is not between the eye and the rover
    const r = roverAt(FIXTURE.cottage[0] - 2, FIXTURE.cottage[1] + 0.5, 0);
    const cam = new ChaseCamera();
    cam.zoomBy(100);
    cam.snap(r, g);
    expect(cam.target[0]).toBeGreaterThan(fixtureAt(FIXTURE.cottage[2], 0)[0]);
    expect(tiltOf(cam)).toBeCloseTo(CHASE.tilt.far, 1);
  });
});

describe('what is wrong with a camera', () => {
  const [x, y] = fixtureAt(28, 18);
  const at = (ex: number, ey: number, ez: number) => ({ position: [ex, ey, ez], target: [x, y, 1.4] });

  it('is nothing for a camera over open ground', () => {
    expect(cameraProblems(at(x - 60, y, 60), g)).toEqual([]);
  });

  it('is its eye under the ground, or too near it', () => {
    expect(cameraProblems(at(x - 60, y, -1), g).join()).toMatch(/the ground under it/);
    expect(cameraProblems(at(x - 60, y, CAMERA_CLEAR / 2), g).join()).toMatch(/the ground under it/);
  });

  it('is its eye inside the cottage or the rock', () => {
    const [cx, cy] = fixtureAt(FIXTURE.cottage[0], FIXTURE.cottage[1]);
    expect(cameraProblems({ position: [cx, cy, 30], target: [cx + 30, cy, 1.4] }, g).join()).toMatch(/inside/);
    const [rx, ry] = fixtureAt(FIXTURE.rock[0], FIXTURE.rock[1] + 2);
    expect(cameraProblems({ position: [rx, ry, 5], target: [rx - 20, ry, 1.4] }, g).join()).toMatch(/inside/);
  });

  it('is its line passing under the ground, or not a number', () => {
    const [px, py] = fixtureAt(10, 23.5);
    const [fx, fy] = fixtureAt(15.5, 23.5);
    // from the plateau's height, looking through the bank at the ground beyond it
    expect(cameraProblems({ position: [fx + 40, fy, 6], target: [px - 30, py, 1] }, g).join()).toMatch(/passes under/);
    expect(cameraProblems(at(NaN, y, 60), g).join()).toMatch(/not a number/);
  });
});

describe('looking round', () => {
  const DEG = Math.PI / 180;
  /** The camera's bearing from the rover across the ground, anticlockwise from +x: behind is the heading turned half round. */
  const bearing = (cam: ChaseCamera, r: Rover) => Math.atan2(cam.position[1] - r.y, cam.position[0] - r.x);

  it('turns round the rover at once, by as much as it is turned, and holds there while the rover stands', () => {
    const r = roverAt(16, 2, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    expect(bearing(cam, r)).toBeCloseTo(Math.PI, 1);
    cam.orbitBy(Math.PI / 2, 0);
    follow(cam, r, 0.5);
    // turned a quarter round, anticlockwise: it faces north now, and stands south of where it looks
    expect(wrap(cam.azimuth - Math.PI / 2)).toBeCloseTo(0, 3);
    expect(cam.position[1]).toBeLessThan(cam.target[1] - 50);
    const at = bearing(cam, r);
    follow(cam, r, 5);
    expect(bearing(cam, r)).toBeCloseTo(at, 3);
    expect(cam.offset).toBeCloseTo(Math.PI / 2, 6);
  });

  it('tilts toward the horizon and down again, held within thirty and eighty degrees from straight down', () => {
    const r = roverAt(16, 2, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    cam.orbitBy(0, 10 * DEG);
    follow(cam, r, 1);
    expect(tiltOf(cam)).toBeCloseTo(72, 0);
    cam.orbitBy(0, 2);
    follow(cam, r, 1);
    expect(tiltOf(cam)).toBeCloseTo(CHASE.orbit.most, 0);
    // held at the end itself, and not past it to be cut back each frame, so a tilt back the other way acts at once
    expect(cam.bend).toBeCloseTo(CHASE.orbit.most * DEG - tiltAt(cam.zoom), 6);
    cam.orbitBy(0, -4);
    follow(cam, r, 1);
    expect(tiltOf(cam)).toBeCloseTo(CHASE.orbit.least, 0);
    expect(cam.bend).toBeCloseTo(CHASE.orbit.least * DEG - tiltAt(cam.zoom), 6);
  });

  it('comes back behind the rover, keeping its tilt, once it has been driven a second, and not for a tap', () => {
    const r = roverAt(3, 15.5, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    cam.orbitBy(Math.PI * 0.8, 15 * DEG);
    // a tap: a third of a second of driving, then still
    for (let f = 0; f < 20; f++) {
      r.step(DT, { throttle: 1, steer: 0 });
      cam.update(r, g, DT);
    }
    for (let f = 0; f < 60; f++) {
      r.step(DT, { throttle: 0, steer: 0 });
      cam.update(r, g, DT);
    }
    expect(cam.offset, 'held after a tap').toBeCloseTo(Math.PI * 0.8, 3);
    // driven along the road: past a second it lets go, and three seconds on it is behind and at its own tilt
    for (let f = 0; f < 4 * 60; f++) {
      r.step(DT, { throttle: 1, steer: 0 });
      cam.update(r, g, DT);
    }
    expect(Math.abs(cam.offset)).toBeLessThan(0.05);
    expect(Math.abs(wrap(cam.azimuth - r.yaw))).toBeLessThan(0.08);
    // the turn comes back, and the player's own tilt is kept
    expect(cam.bend).toBeCloseTo(15 * DEG, 6);
  });

  it('keeps the tilt and clears the turn after two seconds of driving', () => {
    const r = roverAt(3, 15.5, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    cam.orbitBy(0.3, 0.2);
    for (let f = 0; f < 2 * 60; f++) {
      r.step(DT, { throttle: 1, steer: 0 });
      cam.update(r, g, DT);
    }
    expect(Math.abs(cam.bend - 0.2)).toBeLessThan(1e-6);
    expect(Math.abs(cam.offset)).toBeLessThan(0.05);
  });

  it('turns with Q and E as long as they are held, and holds where they leave it', () => {
    const r = roverAt(16, 2, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    cam.keyTurn = 1;
    follow(cam, r, 0.5);
    expect(cam.offset).toBeCloseTo(CHASE.orbit.keys * 0.5, 2);
    cam.keyTurn = -1;
    follow(cam, r, 0.25);
    expect(cam.offset).toBeCloseTo(CHASE.orbit.keys * 0.25, 2);
    cam.keyTurn = 0;
    follow(cam, r, 2);
    expect(cam.offset).toBeCloseTo(CHASE.orbit.keys * 0.25, 2);
    // held past half a turn, round and round: both angles stay within half a turn of nought, and agree
    cam.keyTurn = 1;
    for (let f = 0; f < 3 * 60; f++) {
      cam.update(r, g, DT);
      expect(Math.abs(cam.offset)).toBeLessThanOrEqual(Math.PI);
      expect(Math.abs(cam.azimuth)).toBeLessThanOrEqual(Math.PI);
    }
    expect(wrap(cam.offset - CHASE.orbit.keys * 3.25)).toBeCloseTo(0, 2);
    expect(wrap(cam.azimuth - (r.yaw + cam.offset))).toBeCloseTo(0, 1);
  });

  it('never puts its eye in the ground or the cottage, at any turn and tilt, by the cottage, the bank and the ledge', () => {
    for (const [tx, ty] of [
      [22, 8.5],
      [16, 24],
      [19, 23],
      [10, 24],
    ] as const) {
      const r = roverAt(tx, ty, 0);
      for (let turn = 0; turn < 8; turn++)
        for (const tilt of [-0.5, 0.5]) {
          const cam = new ChaseCamera();
          cam.snap(r, g);
          cam.orbitBy((turn * Math.PI) / 4, tilt);
          follow(cam, r, 0.5);
          expect(cameraProblems(cam, g), `at ${tx},${ty} turned ${turn}/8, tilted ${tilt}`).toEqual([]);
        }
    }
  });

  it('takes nothing it cannot use, and starts again behind the rover when snapped', () => {
    const r = roverAt(16, 2, 0);
    const cam = new ChaseCamera();
    cam.snap(r, g);
    cam.orbitBy(NaN, 0);
    cam.orbitBy(0, Infinity);
    expect(cam.offset).toBe(0);
    expect(cam.bend).toBe(0);
    cam.orbitBy(1, 0.1);
    cam.snap(r, g);
    expect(cam.offset).toBe(0);
    expect(cam.bend).toBe(0);
  });

  it('reads a drag as a turn and a tilt: the view’s height across is half a turn, up or down a quarter', () => {
    const out = new Float64Array(2);
    dragOrbit(800, 0, 800, out);
    expect(out[0]).toBeCloseTo(-Math.PI, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    dragOrbit(0, -400, 800, out);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(Math.PI / 4, 6);
    dragOrbit(10, 10, 0, out);
    expect(Number.isFinite(out[0]) && Number.isFinite(out[1])).toBe(true);
  });
});
