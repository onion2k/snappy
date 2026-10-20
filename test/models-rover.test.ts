import { UNDER_MUTATION } from './helpers';
import { describe, expect, it } from 'vitest';
import {
  RIG,
  ROVER_SIZE,
  SLOT,
  SLOTS,
  poseRover,
  restPose,
  roverGroups,
  roverParts,
  roverTriangles,
  type RoverPose,
} from '../src/models/rover';
import { HEAD } from '../src/rover';
import { heapSwing } from './models-helpers';

/** A matrix's translation, the slot's origin in the world. */
const origin = (m: Float32Array, slot: number) => [m[slot * 16 + 12], m[slot * 16 + 13], m[slot * 16 + 14]];

/** A pose with everything turned some way, from a seed. */
function anyPose(k: number): RoverPose {
  const r = (n: number) => Math.sin(k * 12.9898 + n * 78.233) * 0.5;
  return {
    x: r(1) * 400,
    y: r(2) * 400,
    z: r(3) * 20,
    yaw: r(4) * 12,
    pitch: r(5),
    roll: r(6),
    rockerL: r(7),
    rockerR: r(8),
    bogieL: r(9),
    bogieR: r(10),
    wheelSpin: [r(11) * 40, r(12) * 40, r(13) * 40, r(14) * 40, r(15) * 40, r(16) * 40],
    headYaw: r(17) * 3,
  };
}

describe('the rover', () => {
  it('turns its head where the logic has the head turn: at HEAD.height over the body', () => {
    expect(RIG.mast[2] + RIG.mastHeight).toBeCloseTo(HEAD.height, 6);
  });

  it('is cheap: under three thousand triangles, every wheel counted', () => {
    expect(roverTriangles()).toBeLessThan(3000);
    expect(roverTriangles()).toBeGreaterThan(500);
  });

  it('places every part at a slot there is', () => {
    for (const p of roverParts()) {
      expect(p.slot).toBeGreaterThanOrEqual(0);
      expect(p.slot + p.count).toBeLessThanOrEqual(SLOTS);
      expect(p.mesh.indices.length % 3).toBe(0);
    }
  });

  it('writes a finite matrix into every slot, whatever the pose', () => {
    const m = new Float32Array(SLOTS * 16).fill(NaN);
    for (let k = 0; k < 50; k++) {
      poseRover(m, anyPose(k));
      for (const v of m) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('stands at rest with every wheel on the ground under it, either side of its middle', () => {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, restPose(10, -4, 3, 0));
    for (let w = 0; w < 6; w++) {
      const [x, y, z] = origin(m, SLOT.wheel + w);
      expect(z).toBeCloseTo(3 + ROVER_SIZE.wheelRadius, 5);
      expect(y).toBeCloseTo(-4 + (w < 3 ? RIG.track : -RIG.track), 5);
      // on the logic's own axle, the order front, middle, rear on each side
      expect(x - 10).toBeCloseTo(ROVER_SIZE.axleX[w % 3], 5);
    }
  });

  it('is as wide as the rover is, at rest: its wheels on the logic\u2019s track', () => {
    expect(2 * RIG.track).toBeCloseTo(ROVER_SIZE.track, 6);
    expect(2 * RIG.track + ROVER_SIZE.wheelWidth).toBeCloseTo(ROVER_SIZE.width, 6);
  });

  it('turns with its yaw: facing +y its front wheels are ahead along y', () => {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, restPose(0, 0, 0, Math.PI / 2));
    expect(origin(m, SLOT.wheel)[1]).toBeCloseTo(RIG.front[0], 5);
    expect(origin(m, SLOT.wheel + 2)[1]).toBeCloseTo(-RIG.reach + RIG.bogie[0], 5);
  });

  it('lifts a front wheel when its rocker turns up, and leaves the other side where it was', () => {
    const a = new Float32Array(SLOTS * 16),
      b = new Float32Array(SLOTS * 16);
    const pose = restPose();
    poseRover(a, pose);
    poseRover(b, { ...pose, rockerL: 0.2 });
    expect(origin(b, SLOT.wheel)[2]).toBeGreaterThan(origin(a, SLOT.wheel)[2] + 0.2);
    expect(origin(b, SLOT.wheel + 3)).toEqual(origin(a, SLOT.wheel + 3));
  });

  it('spins a wheel about its axle without moving it', () => {
    const a = new Float32Array(SLOTS * 16),
      b = new Float32Array(SLOTS * 16);
    const pose = restPose();
    poseRover(a, pose);
    poseRover(b, { ...pose, wheelSpin: [1, 1, 1, 1, 1, 1] });
    for (let w = 0; w < 6; w++) {
      expect(origin(b, SLOT.wheel + w).map((v) => Math.round(v * 1e5))).toEqual(
        origin(a, SLOT.wheel + w).map((v) => Math.round(v * 1e5)),
      );
      // the wheel's own x axis has turned
      expect(b[(SLOT.wheel + w) * 16]).not.toBeCloseTo(a[(SLOT.wheel + w) * 16], 3);
    }
  });

  it('rolls every wheel the same way, forward, when each has rolled forward', () => {
    const m = new Float32Array(SLOTS * 16);
    poseRover(m, { ...restPose(), wheelSpin: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3] });
    // a point at the top of each wheel, its local (0, 0, R) for a left wheel and the same for a right one turned
    // half round: a forward roll carries it forward, to +x
    for (let w = 0; w < 6; w++) {
      const o = (SLOT.wheel + w) * 16;
      const topX = m[o + 8] * ROVER_SIZE.wheelRadius + m[o + 12];
      expect(topX).toBeGreaterThan(m[o + 12]);
    }
  });

  it('turns only the head with the head', () => {
    const a = new Float32Array(SLOTS * 16),
      b = new Float32Array(SLOTS * 16);
    poseRover(a, restPose());
    poseRover(b, { ...restPose(), headYaw: 0.8 });
    expect(Array.from(b.subarray(0, 16))).toEqual(Array.from(a.subarray(0, 16)));
    expect(b[SLOT.head * 16]).not.toBeCloseTo(a[SLOT.head * 16], 3);
    expect(Array.from(b.subarray(SLOT.wheel * 16, (SLOT.wheel + 6) * 16))).toEqual(
      Array.from(a.subarray(SLOT.wheel * 16, (SLOT.wheel + 6) * 16)),
    );
  });

  it.skipIf(UNDER_MUTATION)('makes nothing as it poses', () => {
    const m = new Float32Array(SLOTS * 16);
    const pose = anyPose(3);
    let k = 0;
    const swing = heapSwing(() => {
      pose.yaw = k++ * 0.001;
      poseRover(m, pose);
    });
    expect(swing).toBeLessThan(256 * 1024);
  });

  it('gives each group a view of the one array, so a pose moves them all', () => {
    const m = new Float32Array(SLOTS * 16);
    const groups = roverGroups(m);
    poseRover(m, restPose(50, 60, 0, 0));
    for (const g of groups) {
      expect(g.matrices.buffer).toBe(m.buffer);
      expect(g.matrices[12]).not.toBe(0);
    }
  });
});
