import type { PerformanceHitchLogPass } from "./performanceHitchLog";
import packageManifest from "../package.json";

export const VISUAL_TEST_RECORDER_GLOBAL_NAME = "__VOXEL_VISUAL_TEST__";

const LOCAL_VISUAL_TEST_ENDPOINT = "http://127.0.0.1:5174/__voxel_visual_test";
const DEFAULT_RECORD_FPS = 30;
const MIN_RECORD_FPS = 5;
const MAX_RECORD_FPS = 60;
const DEFAULT_FRAME_SAMPLE_FPS = 1;
const MIN_FRAME_SAMPLE_FPS = 0;
const MAX_FRAME_SAMPLE_FPS = 4;
const DEFAULT_MAX_SECONDS = 20;
const MIN_MAX_SECONDS = 1;
const MAX_MAX_SECONDS = 120;
const DEFAULT_POST_RUN_SETTLE_MS = 1200;
const MIN_POST_RUN_SETTLE_MS = 0;
const MAX_POST_RUN_SETTLE_MS = 10000;
const MAX_SAMPLED_FRAMES = 240;
const FRAME_SAMPLE_MIME_TYPE = "image/webp";
const FRAME_SAMPLE_QUALITY = 0.82;

export type VisualTestRecordingStatus = "recording" | "idle";
export type VisualTestRunStatus = "passed" | "failed" | "stopped";

export type VisualTestRecorderOptions = {
  readonly label?: string;
  readonly fps?: number;
  readonly frameSampleFps?: number;
  readonly maxSeconds?: number;
  readonly logPass?: PerformanceHitchLogPass | null;
  readonly metadata?: Record<string, unknown>;
};

export type NormalizedVisualTestRecorderOptions = Required<Omit<VisualTestRecorderOptions, "logPass" | "metadata">> & {
  readonly logPass: PerformanceHitchLogPass | null;
  readonly metadata: Record<string, unknown>;
};

export type VisualTestRecorderStopOptions = {
  readonly status?: VisualTestRunStatus;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
};

export type VisualTestRecorderSnapshot = {
  readonly status: VisualTestRecordingStatus;
  readonly label: string | null;
  readonly startedAtMs: number | null;
  readonly durationMs: number;
  readonly frameSamples: number;
  readonly mimeType: string | null;
};

export type VisualTestUploadResult = {
  readonly ok: boolean;
  readonly label: string;
  readonly status: VisualTestRunStatus;
  readonly durationMs: number;
  readonly videoBytes: number;
  readonly frameSamples: number;
  readonly mimeType: string;
  readonly server?: {
    readonly directory?: string;
    readonly manifestPath?: string;
    readonly videoPath?: string;
    readonly reviewPath?: string;
  };
  readonly error?: string;
};

export type VisualPilotRecordOptions = VisualTestRecorderOptions & {
  readonly settleMs?: number;
};

export type NormalizedVisualPilotRecordOptions = NormalizedVisualTestRecorderOptions & {
  readonly settleMs: number;
};

type VisualFrameSample = {
  readonly index: number;
  readonly capturedAtMs: number;
  readonly dataUrl: string;
};

type VisualRecordingState = {
  readonly startedAtMs: number;
  readonly startedAtIso: string;
  readonly options: NormalizedVisualTestRecorderOptions;
  readonly stream: MediaStream;
  readonly recorder: MediaRecorder;
  readonly chunks: Blob[];
  readonly frameSamples: VisualFrameSample[];
  readonly mimeType: string;
  sampleTimer: number | null;
  readonly maxTimer: number;
};

export type VisualTestRecorderApi = {
  snapshot(): VisualTestRecorderSnapshot;
  start(options?: VisualTestRecorderOptions): Promise<VisualTestRecorderSnapshot>;
  stop(options?: VisualTestRecorderStopOptions): Promise<VisualTestUploadResult>;
  recordPilotPlay(script?: string, options?: VisualPilotRecordOptions): Promise<unknown>;
};

export class VisualTestRecorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly getMetadata: () => Record<string, unknown>;
  private state: VisualRecordingState | null = null;

  constructor(options: {
    readonly canvas: HTMLCanvasElement;
    readonly getMetadata?: () => Record<string, unknown>;
  }) {
    this.canvas = options.canvas;
    this.getMetadata = options.getMetadata ?? (() => ({}));
  }

  snapshot(): VisualTestRecorderSnapshot {
    if (!this.state) {
      return {
        status: "idle",
        label: null,
        startedAtMs: null,
        durationMs: 0,
        frameSamples: 0,
        mimeType: null
      };
    }

    return {
      status: "recording",
      label: this.state.options.label,
      startedAtMs: this.state.startedAtMs,
      durationMs: performance.now() - this.state.startedAtMs,
      frameSamples: this.state.frameSamples.length,
      mimeType: this.state.mimeType
    };
  }

  async start(options: VisualTestRecorderOptions = {}): Promise<VisualTestRecorderSnapshot> {
    if (this.state) throw new Error("A visual test recording is already running.");
    if (!canRecordCanvas(this.canvas)) {
      throw new Error("This browser cannot record the game canvas with captureStream().");
    }
    if (typeof MediaRecorder === "undefined") {
      throw new Error("This browser does not expose MediaRecorder for visual test capture.");
    }

    const normalized = normalizeVisualTestRecorderOptions({
      ...options,
      metadata: {
        ...this.getMetadata(),
        ...(options.metadata ?? {})
      }
    });
    const stream = this.canvas.captureStream(normalized.fps);
    const mimeType = chooseMediaRecorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const state: VisualRecordingState = {
      startedAtMs: performance.now(),
      startedAtIso: new Date().toISOString(),
      options: normalized,
      stream,
      recorder,
      chunks: [],
      frameSamples: [],
      mimeType: recorder.mimeType || mimeType || "video/webm",
      sampleTimer: null,
      maxTimer: window.setTimeout(() => {
        void this.stop({ status: "stopped", error: "Visual recording hit its maxSeconds safety stop." });
      }, normalized.maxSeconds * 1000)
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    });
    recorder.start(250);
    this.state = state;
    this.captureFrameSample(state);
    this.startFrameSampler(state);
    return this.snapshot();
  }

  async stop(options: VisualTestRecorderStopOptions = {}): Promise<VisualTestUploadResult> {
    const state = this.state;
    if (!state) throw new Error("No visual test recording is running.");
    this.state = null;
    this.stopTimers(state);
    this.captureFrameSample(state);

    const stopped = waitForRecorderStop(state.recorder);
    if (state.recorder.state !== "inactive") state.recorder.stop();
    await stopped;
    this.stopTracks(state);

    const videoBlob = new Blob(state.chunks, { type: state.mimeType });
    const durationMs = performance.now() - state.startedAtMs;
    const status = options.status ?? "stopped";
    const uploadPayload = {
      type: "voxel.visual-test-recording",
      appVersion: packageManifest.version,
      label: state.options.label,
      status,
      error: options.error,
      href: window.location.href,
      userAgent: navigator.userAgent,
      startedAtIso: state.startedAtIso,
      endedAtIso: new Date().toISOString(),
      durationMs,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight
      },
      recorder: {
        fps: state.options.fps,
        frameSampleFps: state.options.frameSampleFps,
        mimeType: state.mimeType,
        videoBytes: videoBlob.size,
        frameSamples: state.frameSamples.length
      },
      logPass: state.options.logPass,
      metadata: {
        ...state.options.metadata,
        ...(options.metadata ?? {})
      },
      videoDataUrl: await blobToDataUrl(videoBlob),
      frameSamples: state.frameSamples
    };

    const uploadResult = await uploadVisualTestRecording(uploadPayload);
    return {
      ok: uploadResult.ok,
      label: state.options.label,
      status,
      durationMs,
      videoBytes: videoBlob.size,
      frameSamples: state.frameSamples.length,
      mimeType: state.mimeType,
      server: uploadResult.ok ? uploadResult.server : undefined,
      error: uploadResult.ok ? undefined : uploadResult.error
    };
  }

  dispose(): void {
    if (!this.state) return;
    this.stopTimers(this.state);
    this.stopTracks(this.state);
    this.state = null;
  }

  private startFrameSampler(state: VisualRecordingState): void {
    if (state.options.frameSampleFps <= 0) return;
    const intervalMs = 1000 / state.options.frameSampleFps;
    const timer = window.setInterval(() => {
      this.captureFrameSample(state);
    }, intervalMs);
    state.sampleTimer = timer;
  }

  private captureFrameSample(state: VisualRecordingState): void {
    if (state.frameSamples.length >= MAX_SAMPLED_FRAMES) return;
    try {
      state.frameSamples.push({
        index: state.frameSamples.length,
        capturedAtMs: performance.now() - state.startedAtMs,
        dataUrl: this.canvas.toDataURL(FRAME_SAMPLE_MIME_TYPE, FRAME_SAMPLE_QUALITY)
      });
    } catch {
      // Cross-origin or WebGL buffer restrictions should not kill the video.
      // The WebM recording is the primary artifact; frame samples are a review aid.
    }
  }

  private stopTimers(state: VisualRecordingState): void {
    window.clearTimeout(state.maxTimer);
    if (state.sampleTimer !== null) window.clearInterval(state.sampleTimer);
  }

  private stopTracks(state: VisualRecordingState): void {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
  }
}

export function normalizeVisualTestRecorderOptions(
  options: VisualTestRecorderOptions = {}
): NormalizedVisualTestRecorderOptions {
  return {
    label: sanitizeVisualTestLabel(options.label ?? "visual-test"),
    fps: Math.round(clampFinite(options.fps, DEFAULT_RECORD_FPS, MIN_RECORD_FPS, MAX_RECORD_FPS)),
    frameSampleFps: clampFinite(options.frameSampleFps, DEFAULT_FRAME_SAMPLE_FPS, MIN_FRAME_SAMPLE_FPS, MAX_FRAME_SAMPLE_FPS),
    maxSeconds: clampFinite(options.maxSeconds, DEFAULT_MAX_SECONDS, MIN_MAX_SECONDS, MAX_MAX_SECONDS),
    logPass: options.logPass ?? null,
    metadata: options.metadata ?? {}
  };
}

export function normalizeVisualPilotRecordOptions(
  options: VisualPilotRecordOptions = {}
): NormalizedVisualPilotRecordOptions {
  return {
    ...normalizeVisualTestRecorderOptions(options),
    settleMs: Math.round(clampFinite(
      options.settleMs,
      DEFAULT_POST_RUN_SETTLE_MS,
      MIN_POST_RUN_SETTLE_MS,
      MAX_POST_RUN_SETTLE_MS
    ))
  };
}

function canRecordCanvas(canvas: HTMLCanvasElement): canvas is HTMLCanvasElement & {
  captureStream: (frameRate?: number) => MediaStream;
} {
  return typeof canvas.captureStream === "function";
}

function chooseMediaRecorderMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

async function uploadVisualTestRecording(payload: Record<string, unknown>): Promise<{
  readonly ok: true;
  readonly server: NonNullable<VisualTestUploadResult["server"]>;
} | {
  readonly ok: false;
  readonly error: string;
}> {
  try {
    const response = await fetch(LOCAL_VISUAL_TEST_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : `Visual test upload failed with ${response.status}.`
      };
    }
    return {
      ok: true,
      server: {
        directory: typeof body.directory === "string" ? body.directory : undefined,
        manifestPath: typeof body.manifestPath === "string" ? body.manifestPath : undefined,
        videoPath: typeof body.videoPath === "string" ? body.videoPath : undefined,
        reviewPath: typeof body.reviewPath === "string" ? body.reviewPath : undefined
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Visual test upload failed."
    };
  }
}

function waitForRecorderStop(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === "inactive") return Promise.resolve();
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    }, { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read recording blob.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

function sanitizeVisualTestLabel(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return safe.length > 0 ? safe : "visual-test";
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
