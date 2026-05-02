export const MAX_SIMULATION_DELTA_SECONDS = 0.04;
export const IDLE_RESUME_GAP_SECONDS = 1;

export function clampSimulationDelta(rawDeltaSeconds: number): number {
  if (!Number.isFinite(rawDeltaSeconds) || rawDeltaSeconds <= 0) {
    return 0;
  }
  return Math.min(rawDeltaSeconds, MAX_SIMULATION_DELTA_SECONDS);
}

export function shouldSkipExpensiveFrame(pageHidden: boolean, rawDeltaSeconds: number): boolean {
  // Hidden tabs and lock-screen resumes are bad times to pay for chunk, physics,
  // minimap, and render work. The next visible frame starts from a fresh clock
  // sample instead of trying to digest an overnight gap.
  return pageHidden || rawDeltaSeconds > IDLE_RESUME_GAP_SECONDS;
}
