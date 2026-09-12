export const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;

/** Preserve fixed physics steps without replaying a long stall in one frame. */
export class FixedStepAccumulator {
  private accumulated = 0;

  reset(): void { this.accumulated = 0; }

  advance(elapsed: number, update: (dt: number) => void): void {
    // Drop excess wall time, keeping the fractional step for smooth cadence.
    // Under overload the simulation slows instead of compounding the stall.
    this.accumulated += Math.min(Math.max(0, elapsed), FIXED_DT * MAX_STEPS);
    const steps = Math.min(MAX_STEPS, Math.floor((this.accumulated + 1e-10) / FIXED_DT));
    this.accumulated = Math.max(0, this.accumulated - steps * FIXED_DT);
    for (let i = 0; i < steps; i++) update(FIXED_DT);
  }
}
