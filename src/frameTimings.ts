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
