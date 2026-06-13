const DEFAULT_FRAME_TIMING_BLEND = 0.18;

export type FrameTimings = {
  playerMs: number;
  chunkMs: number;
  physicsMs: number;
  meshMs: number;
  minimapMs: number;
  renderMs: number;
  otherMs: number;
  frameMs: number;
};

export type PhysicsTimingStats = {
  toyUpdateMs: number;
  impactApplyMs: number;
  rigidDebrisTotalMs: number;
  rigidDebrisFlushMs: number;
  rigidDebrisStaticColliderCollectMs: number;
  rigidDebrisStaticColliderSyncMs: number;
  rigidDebrisStepMs: number;
  rigidDebrisSyncMs: number;
  debrisSettlerMs: number;
  budgetEnforcementMs: number;
  groundCleanupMs: number;
  toyBroadphaseMs: number;
  rubbleSettleMs: number;
  renderProxySyncMs: number;
  framePhysicsMeasuredMs: number;
};

const FRAME_TIMING_KEYS = [
  "playerMs",
  "chunkMs",
  "physicsMs",
  "meshMs",
  "minimapMs",
  "renderMs",
  "otherMs",
  "frameMs"
] as const satisfies readonly (keyof FrameTimings)[];

export function createEmptyFrameTimings(): FrameTimings {
  return {
    playerMs: 0,
    chunkMs: 0,
    physicsMs: 0,
    meshMs: 0,
    minimapMs: 0,
    renderMs: 0,
    otherMs: 0,
    frameMs: 0
  };
}

export function createEmptyPhysicsTimingStats(): PhysicsTimingStats {
  return {
    toyUpdateMs: 0,
    impactApplyMs: 0,
    rigidDebrisTotalMs: 0,
    rigidDebrisFlushMs: 0,
    rigidDebrisStaticColliderCollectMs: 0,
    rigidDebrisStaticColliderSyncMs: 0,
    rigidDebrisStepMs: 0,
    rigidDebrisSyncMs: 0,
    debrisSettlerMs: 0,
    budgetEnforcementMs: 0,
    groundCleanupMs: 0,
    toyBroadphaseMs: 0,
    rubbleSettleMs: 0,
    renderProxySyncMs: 0,
    framePhysicsMeasuredMs: 0
  };
}

export function smoothFrameTimings(
  previous: FrameTimings,
  sample: FrameTimings,
  initialized: boolean,
  blend = DEFAULT_FRAME_TIMING_BLEND
): FrameTimings {
  if (!initialized) {
    return cloneFrameTimings(sample);
  }

  const clampedBlend = Math.max(0, Math.min(1, blend));
  const next = createEmptyFrameTimings();
  for (const key of FRAME_TIMING_KEYS) {
    next[key] = previous[key] + (sample[key] - previous[key]) * clampedBlend;
  }
  return next;
}

function cloneFrameTimings(timings: FrameTimings): FrameTimings {
  return {
    playerMs: timings.playerMs,
    chunkMs: timings.chunkMs,
    physicsMs: timings.physicsMs,
    meshMs: timings.meshMs,
    minimapMs: timings.minimapMs,
    renderMs: timings.renderMs,
    otherMs: timings.otherMs,
    frameMs: timings.frameMs
  };
}
