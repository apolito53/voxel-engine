export const MAX_SIMULATION_DELTA_SECONDS = 0.04;
export const IDLE_RESUME_GAP_SECONDS = 1;
export const IDLE_HIBERNATE_AFTER_SECONDS = 5 * 60;
export const IDLE_HEARTBEAT_MS = 5000;

export type FrameLoopHibernateState = {
  readonly pageHidden: boolean;
  readonly inactiveSeconds: number;
  readonly hasActiveWork: boolean;
};

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

export function shouldHibernateAnimationLoop(state: FrameLoopHibernateState): boolean {
  if (state.pageHidden) return true;
  if (state.hasActiveWork) return false;

  // A visible-but-idle world should not keep the GPU and browser event loop hot
  // forever. This is especially important for overnight lock-screen sessions:
  // some browser/driver combinations keep allocating small render resources even
  // when RAF is throttled, so the engine needs its own hard stop.
  return state.inactiveSeconds >= IDLE_HIBERNATE_AFTER_SECONDS;
}
