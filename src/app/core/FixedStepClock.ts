/** Bounded wall-clock accumulator. Hidden tabs never accumulate catch-up work. */
export class FixedStepClock {
  private previous: number | undefined;
  private accumulated = 0;
  readonly step: number;
  readonly maxSteps: number;
  constructor(step = 1 / 60, maxSteps = 3) { this.step = step; this.maxSteps = maxSteps; }

  reset(now?: number) { this.previous = now; this.accumulated = 0; }

  advance(now: number): number {
    if (this.previous === undefined) { this.previous = now; return 0; }
    const elapsed = Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    this.accumulated += Math.min(elapsed, this.step * this.maxSteps);
    const steps = Math.min(this.maxSteps, Math.floor((this.accumulated + 1e-9) / this.step));
    this.accumulated = Math.max(0, this.accumulated - steps * this.step);
    return steps;
  }
}
