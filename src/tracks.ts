/**
 * The rover's tracks: a mark under each rear wheel every little way it
 * rolls, on soft ground and out of water, kept in a fixed ring so the
 * oldest is written over and the pool never grows. Each mark knows when it
 * was laid, so the page can fade it by age; nothing here draws.
 *
 * It follows the rover from what the rover already keeps, how far each
 * side has rolled, so the rover need know nothing of it.
 */
import type { Rover } from './rover';
import { soft, type Ground } from './world/types';

/**
 * How many marks are kept, and how far apart they are laid, in units. At
 * 0.6 apart a side, 2048 marks is about 600 units of track behind the
 * rover, sixty metres, half a minute of driving at full speed: as far back
 * as the camera sees and more. `perFrame` is the most laid a side in one
 * frame, so a stalled page does not lay a long line of them at once.
 */
export const TRACKS = { capacity: 2048, spacing: 0.6, perFrame: 4 } as const;

/** What the tracks read of the rover. */
type Follows = Pick<Rover, 'rolled' | 'wheelX' | 'wheelY' | 'yaw'>;

export class Tracks {
  readonly capacity = TRACKS.capacity;
  readonly x = new Float32Array(TRACKS.capacity);
  readonly y = new Float32Array(TRACKS.capacity);
  /** The ground's height under the mark; the page lifts it a hair to keep it out of the ground. */
  readonly z = new Float32Array(TRACKS.capacity);
  readonly yaw = new Float32Array(TRACKS.capacity);
  /** When each mark was laid, in game seconds. */
  readonly born = new Float64Array(TRACKS.capacity);
  /** 0 for the left wheel's line, 1 for the right's. */
  readonly side = new Uint8Array(TRACKS.capacity);
  /** How many slots hold a mark: it climbs to the capacity and stays there. */
  count = 0;
  /** The slot the next mark goes in: once full, the oldest. */
  next = 0;

  private readonly ground: Ground;
  // how far each side had rolled when its last mark was laid, or NaN before the rover is first followed
  private readonly last = new Float64Array([Number.NaN, Number.NaN]);

  constructor(ground: Ground) {
    this.ground = ground;
  }

  /**
   * Lay what the rover has rolled over since it was last followed: a mark
   * for each `spacing` a side has gone, forward or back, put where that
   * side's rear wheel was when it had gone that far.
   */
  follow(rover: Follows, now: number): void {
    const g = this.ground;
    const c = Math.cos(rover.yaw),
      s = Math.sin(rover.yaw);
    for (let side = 0; side < 2; side++) {
      const rolled = rover.rolled[side];
      if (Number.isNaN(this.last[side])) {
        this.last[side] = rolled;
        continue;
      }
      let gone = rolled - this.last[side];
      const dir = gone < 0 ? -1 : 1;
      let laid = 0;
      while (gone * dir >= TRACKS.spacing && laid < TRACKS.perFrame) {
        this.last[side] += dir * TRACKS.spacing;
        gone = rolled - this.last[side];
        // where the wheel was when it had rolled that far: back along the heading by what it has rolled since, if the
        // ground there takes a mark; written here rather than handed to a call, which would box each number
        const x = rover.wheelX[4 + side] - c * gone,
          y = rover.wheelY[4 + side] - s * gone;
        if (soft(g.surfaceAt(x, y)) && !(g.waterDepthAt(x, y) > 0)) {
          const i = this.next;
          this.x[i] = x;
          this.y[i] = y;
          this.z[i] = g.heightAt(x, y);
          this.yaw[i] = rover.yaw;
          this.side[i] = side;
          this.born[i] = now;
          this.next = (i + 1) % TRACKS.capacity;
          if (this.count < TRACKS.capacity) this.count++;
        }
        laid++;
      }
      // a frame that went further than the most it lays is not made up later
      if (gone * dir >= TRACKS.spacing) this.last[side] = rolled;
    }
  }

  /** How long ago mark `i` was laid, in game seconds. */
  age(i: number, now: number): number {
    return now - this.born[i];
  }

  /** No marks: a new world, or a new game. The rover is followed afresh from where it is. */
  clear(): void {
    this.count = 0;
    this.next = 0;
    this.last[0] = this.last[1] = Number.NaN;
  }
}
