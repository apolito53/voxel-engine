import type { FrameTimings } from "./frameTimings";
import type { GpuTimerFrameStats } from "./renderBackend";

export type FrameRendererDiagnostics = {
  readonly calls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly geometries: number;
  readonly textures: number;
};

export type FrameMemoryDiagnostics = {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
} | null;

export type FrameLongTaskDiagnostics = {
  readonly observerSupported: boolean;
  readonly frameCount: number;
  readonly frameTotalMs: number;
  readonly frameMaxMs: number;
  readonly recentCount: number;
  readonly recentTotalMs: number;
  readonly recentMaxMs: number;
};

export type FrameDiagnosticsSnapshot = {
  readonly frameStartedAtMs: number;
  readonly frameEndedAtMs: number;
  readonly rafGapMs: number;
  readonly jsFrameMs: number;
  readonly measuredBucketTotalMs: number;
  readonly unaccountedFrameMs: number;
  readonly rafGapOverJsMs: number;
  readonly renderCallMs: number;
  readonly renderCallShare: number;
  readonly longTasks: FrameLongTaskDiagnostics;
  readonly renderer: FrameRendererDiagnostics;
  readonly gpu: GpuTimerFrameStats | null;
  readonly memory: FrameMemoryDiagnostics;
  readonly documentHidden: boolean;
  readonly visibilityState: string;
};

export type FrameDiagnosticsRendererInfo = {
  readonly render: {
    readonly calls: number;
    readonly triangles: number;
    readonly points: number;
    readonly lines: number;
  };
  readonly memory: {
    readonly geometries: number;
    readonly textures: number;
  };
};

type LongTaskEntry = {
  readonly startTime: number;
  readonly duration: number;
};

type PerformanceWithMemory = Performance & {
  readonly memory?: {
    readonly usedJSHeapSize?: number;
    readonly totalJSHeapSize?: number;
    readonly jsHeapSizeLimit?: number;
  };
};

const LONG_TASK_RETENTION_MS = 10_000;
const RECENT_LONG_TASK_WINDOW_MS = 2_000;

/**
 * Collects browser-side frame clues that normal subsystem timers cannot see.
 *
 * JavaScript can time our own update/render call, but it cannot directly time
 * GPU presentation, browser compositor stalls, GC pauses that land between RAFs,
 * or unrelated main-thread long tasks. This module keeps those clues attached to
 * hitch records so future optimization work has receipts instead of vibes.
 */
export class BrowserFrameDiagnostics {
  private readonly longTasks: LongTaskEntry[] = [];
  private readonly observer: PerformanceObserver | null = null;
  private readonly longTaskObserverSupported: boolean;

  constructor() {
    this.longTaskObserverSupported = isLongTaskObserverSupported();
    if (!this.longTaskObserverSupported) return;

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration
          });
        }
        this.pruneLongTasks(performance.now() - LONG_TASK_RETENTION_MS);
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      observer = null;
    }

    this.observer = observer;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.longTasks.length = 0;
  }

  captureFrame(input: {
    readonly frameStartedAtMs: number;
    readonly frameEndedAtMs: number;
    readonly rafGapMs: number;
    readonly timings: FrameTimings;
    readonly rendererInfo: FrameDiagnosticsRendererInfo;
    readonly gpuTimer?: GpuTimerFrameStats | null;
  }): FrameDiagnosticsSnapshot {
    const jsFrameMs = Math.max(0, input.frameEndedAtMs - input.frameStartedAtMs);
    const measuredBucketTotalMs = getMeasuredBucketTotalMs(input.timings);
    const longTasks = this.getLongTaskSnapshot(input.frameStartedAtMs, input.frameEndedAtMs);
    const renderCallMs = Math.max(0, input.timings.renderMs);

    return {
      frameStartedAtMs: input.frameStartedAtMs,
      frameEndedAtMs: input.frameEndedAtMs,
      rafGapMs: Math.max(0, input.rafGapMs),
      jsFrameMs,
      measuredBucketTotalMs,
      unaccountedFrameMs: Math.max(0, jsFrameMs - measuredBucketTotalMs),
      rafGapOverJsMs: Math.max(0, input.rafGapMs - jsFrameMs),
      renderCallMs,
      renderCallShare: jsFrameMs > 0 ? renderCallMs / jsFrameMs : 0,
      longTasks,
      renderer: cloneRendererDiagnostics(input.rendererInfo),
      gpu: input.gpuTimer ? { ...input.gpuTimer } : null,
      memory: readMemoryDiagnostics(),
      documentHidden: typeof document !== "undefined" ? document.hidden : false,
      visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown"
    };
  }

  private getLongTaskSnapshot(frameStartMs: number, frameEndMs: number): FrameLongTaskDiagnostics {
    const now = performance.now();
    this.pruneLongTasks(now - LONG_TASK_RETENTION_MS);

    const frameTasks = this.longTasks.filter((task) =>
      doesLongTaskOverlapRange(task, frameStartMs, frameEndMs)
    );
    const recentTasks = this.longTasks.filter((task) =>
      task.startTime + task.duration >= now - RECENT_LONG_TASK_WINDOW_MS
    );

    return {
      observerSupported: this.longTaskObserverSupported,
      frameCount: frameTasks.length,
      frameTotalMs: sumLongTaskDurations(frameTasks),
      frameMaxMs: getMaxLongTaskDuration(frameTasks),
      recentCount: recentTasks.length,
      recentTotalMs: sumLongTaskDurations(recentTasks),
      recentMaxMs: getMaxLongTaskDuration(recentTasks)
    };
  }

  private pruneLongTasks(minStartTimeMs: number): void {
    while (this.longTasks.length > 0) {
      const oldest = this.longTasks[0];
      if (!oldest || oldest.startTime + oldest.duration >= minStartTimeMs) break;
      this.longTasks.shift();
    }
  }
}

function isLongTaskObserverSupported(): boolean {
  if (typeof PerformanceObserver === "undefined") return false;
  const supportedTypes = PerformanceObserver.supportedEntryTypes;
  return Array.isArray(supportedTypes) && supportedTypes.includes("longtask");
}

function getMeasuredBucketTotalMs(timings: FrameTimings): number {
  return timings.playerMs +
    timings.chunkMs +
    timings.physicsMs +
    timings.meshMs +
    timings.minimapMs +
    timings.renderMs +
    timings.otherMs;
}

function cloneRendererDiagnostics(info: FrameDiagnosticsRendererInfo): FrameRendererDiagnostics {
  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures
  };
}

function readMemoryDiagnostics(): FrameMemoryDiagnostics {
  if (typeof performance === "undefined") return null;
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory) return null;

  const usedJSHeapSize = readFiniteNumber(memory.usedJSHeapSize);
  const totalJSHeapSize = readFiniteNumber(memory.totalJSHeapSize);
  const jsHeapSizeLimit = readFiniteNumber(memory.jsHeapSizeLimit);
  if (usedJSHeapSize === null || totalJSHeapSize === null || jsHeapSizeLimit === null) return null;

  return {
    usedJSHeapSize,
    totalJSHeapSize,
    jsHeapSizeLimit
  };
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function doesLongTaskOverlapRange(task: LongTaskEntry, startMs: number, endMs: number): boolean {
  const taskEndMs = task.startTime + task.duration;
  return task.startTime <= endMs && taskEndMs >= startMs;
}

function sumLongTaskDurations(tasks: readonly LongTaskEntry[]): number {
  return tasks.reduce((total, task) => total + task.duration, 0);
}

function getMaxLongTaskDuration(tasks: readonly LongTaskEntry[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.duration), 0);
}
