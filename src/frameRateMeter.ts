const DEFAULT_FRAME_RATE_WINDOW_SECONDS = 1;
const LOW_FPS_SAMPLE_FRACTION = 0.1;
const MIN_FRAME_DELTA_SECONDS = 0.001;

export type FrameRateSample = {
  readonly fps: number;
  readonly lowFps: number;
  readonly latestFrameMs: number;
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  readonly sampleCount: number;
};

export class RollingFrameRateMeter {
  private readonly windowSeconds: number;
  private readonly frameDeltasSeconds: number[] = [];
  private totalSeconds = 0;

  constructor(windowSeconds = DEFAULT_FRAME_RATE_WINDOW_SECONDS) {
    this.windowSeconds = Math.max(MIN_FRAME_DELTA_SECONDS, windowSeconds);
  }

  reset(): void {
    this.frameDeltasSeconds.length = 0;
    this.totalSeconds = 0;
  }

  push(rawDeltaSeconds: number): FrameRateSample {
    const deltaSeconds = normalizeFrameDelta(rawDeltaSeconds);
    this.frameDeltasSeconds.push(deltaSeconds);
    this.totalSeconds += deltaSeconds;
    this.trimOldFrames();
    return this.getSample(deltaSeconds);
  }

  getSample(latestDeltaSeconds = this.frameDeltasSeconds[this.frameDeltasSeconds.length - 1] ?? 0): FrameRateSample {
    if (this.frameDeltasSeconds.length === 0 || this.totalSeconds <= 0) {
      return {
        fps: 0,
        lowFps: 0,
        latestFrameMs: 0,
        averageFrameMs: 0,
        worstFrameMs: 0,
        sampleCount: 0
      };
    }

    const sampleCount = this.frameDeltasSeconds.length;
    const averageFrameSeconds = this.totalSeconds / sampleCount;
    const worstFrameSeconds = Math.max(...this.frameDeltasSeconds);
    return {
      // FPS is calculated from elapsed time, not by averaging instantaneous FPS.
      // That keeps uneven frame pacing from reporting a suspiciously pretty
      // number while the player can clearly feel dropped or delayed frames.
      fps: sampleCount / this.totalSeconds,
      lowFps: 1 / getAverageWorstFrameSeconds(this.frameDeltasSeconds),
      latestFrameMs: latestDeltaSeconds * 1000,
      averageFrameMs: averageFrameSeconds * 1000,
      worstFrameMs: worstFrameSeconds * 1000,
      sampleCount
    };
  }

  private trimOldFrames(): void {
    while (
      this.frameDeltasSeconds.length > 1 &&
      this.totalSeconds - this.frameDeltasSeconds[0] >= this.windowSeconds
    ) {
      const oldest = this.frameDeltasSeconds.shift();
      if (oldest === undefined) return;
      this.totalSeconds -= oldest;
    }
  }
}

function normalizeFrameDelta(rawDeltaSeconds: number): number {
  if (!Number.isFinite(rawDeltaSeconds) || rawDeltaSeconds <= 0) {
    return MIN_FRAME_DELTA_SECONDS;
  }
  return Math.max(MIN_FRAME_DELTA_SECONDS, rawDeltaSeconds);
}

function getAverageWorstFrameSeconds(frameDeltasSeconds: readonly number[]): number {
  const worstSampleCount = Math.max(1, Math.ceil(frameDeltasSeconds.length * LOW_FPS_SAMPLE_FRACTION));
  const worstSamples = [...frameDeltasSeconds]
    .sort((a, b) => b - a)
    .slice(0, worstSampleCount);
  const totalWorstSeconds = worstSamples.reduce((sum, deltaSeconds) => sum + deltaSeconds, 0);
  return totalWorstSeconds / worstSamples.length;
}
