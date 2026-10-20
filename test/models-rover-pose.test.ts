import { UNDER_MUTATION } from './helpers';
import { describe, expect, it } from 'vitest';
import { SLOT, SLOTS, poseOf, poseRover, restPose } from '../src/models/rover';
import { Rover } from '../src/rover';
import { fixtureAt, fixtureWorld } from '../src/world/fixture';
import { groundOf } from '../src/world/ground';
import { heapSwing } from './models-helpers';

const ground = groundOf(fixtureWorld());
/** The model's slot for the logic's wheel `i`: down the left side, then the right. */
const slotOf = (i: number) => SLOT.wheel + (i & 1) * 3 + (i >> 1);

describe('the rover as drawn from its logic', () => {
  it('puts every wheel where the logic holds it, climbing the ramp and turning', () => {
    const [x, y] = fixtureAt(2, 24);
    const rover = new Rover(ground, { x, y, yaw: 0 });
    const pose = restPose();
    const m = new Float32Array(SLOTS * 16);
    let checked = 0;
    for (let f = 0; f < 240; f++) {
      rover.step(1 / 60, { throttle: 1, steer: f > 150 ? 0.4 : 0 });
      poseOf(rover, pose);
      poseRover(m, pose);
      for (let i = 0; i < 6; i++) {
        const o = slotOf(i) * 16;
        // the logic keeps the drawn axle's height, and the wheel's place on the ground under it
        expect(m[o + 14], `wheel ${i} at frame ${f}`).toBeCloseTo(rover.wheelZ[i], 1);
        expect(Math.hypot(m[o + 12] - rover.wheelX[i], m[o + 13] - rover.wheelY[i]), `wheel ${i}`).toBeLessThan(0.2);
        checked++;
      }
    }
    expect(checked).toBe(240 * 6);
    // and it did climb, and lean, so the arms were turned
    expect(Math.abs(rover.pitch)).toBeGreaterThan(0.05);
  });

  it('spins each wheel by the logic’s own wheel', () => {
    const rover = new Rover(ground, { x: 0, y: 0, yaw: 0 });
    for (let i = 0; i < 6; i++) rover.spin[i] = i + 1;
    const pose = restPose();
    poseOf(rover, pose);
    for (let i = 0; i < 6; i++) expect(pose.wheelSpin[slotOf(i) - SLOT.wheel]).toBe(i + 1);
  });

  it.skipIf(UNDER_MUTATION)('makes nothing as it reads the logic', () => {
    const rover = new Rover(ground, { x: 0, y: 0, yaw: 0 });
    const pose = restPose();
    expect(heapSwing(() => poseOf(rover, pose))).toBeLessThan(256 * 1024);
  });
});
