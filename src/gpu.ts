import * as THREE from "three";
import type { GpuTimerFrameStats } from "./renderBackend";

export type GpuInfo = {
  readonly vendor: string;
  readonly renderer: string;
};

type WebGl2TimerExtension = {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
};

const GPU_TIMER_AVERAGE_BLEND = 0.12;

export function readGpuInfo(activeRenderer: THREE.WebGLRenderer): GpuInfo {
  const gl = activeRenderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

  return {
    vendor: debugInfo
      ? readGlString(gl, debugInfo.UNMASKED_VENDOR_WEBGL)
      : readGlString(gl, gl.VENDOR),
    renderer: debugInfo
      ? readGlString(gl, debugInfo.UNMASKED_RENDERER_WEBGL)
      : readGlString(gl, gl.RENDERER)
  };
}

export function compactText(value: unknown, maxLength: number): string {
  const text = String(value || "unknown");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export class WebGlGpuTimer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly extension: WebGl2TimerExtension | null;
  private readonly pendingQueries: WebGLQuery[] = [];
  private activeQuery: WebGLQuery | null = null;
  private lastFrameMs: number | null = null;
  private averageFrameMs: number | null = null;
  private disjointCount = 0;

  constructor(activeRenderer: THREE.WebGLRenderer) {
    const gl = activeRenderer.getContext();
    this.gl = isWebGl2Context(gl) ? gl : null;
    this.extension = this.gl
      ? this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as WebGl2TimerExtension | null
      : null;
  }

  beginFrame(): void {
    if (!this.gl || !this.extension || this.activeQuery) return;

    const query = this.gl.createQuery();
    if (!query) return;

    try {
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
      this.activeQuery = query;
    } catch {
      this.gl.deleteQuery(query);
      this.activeQuery = null;
    }
  }

  endFrame(): void {
    if (!this.gl || !this.extension || !this.activeQuery) return;

    const query = this.activeQuery;
    this.activeQuery = null;

    try {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.pendingQueries.push(query);
    } catch {
      this.gl.deleteQuery(query);
    }
  }

  collect(): GpuTimerFrameStats {
    if (!this.gl || !this.extension) return this.createStats(false);

    while (this.pendingQueries.length > 0) {
      const query = this.pendingQueries[0];
      if (!query) break;

      const available = Boolean(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE));
      if (!available) break;

      const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
      const elapsedNanoseconds = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
      this.gl.deleteQuery(query);
      this.pendingQueries.shift();

      if (disjoint || !Number.isFinite(elapsedNanoseconds)) {
        this.disjointCount += 1;
        continue;
      }

      this.lastFrameMs = Math.max(0, elapsedNanoseconds / 1_000_000);
      this.averageFrameMs = this.averageFrameMs === null
        ? this.lastFrameMs
        : this.averageFrameMs + (this.lastFrameMs - this.averageFrameMs) * GPU_TIMER_AVERAGE_BLEND;
    }

    return this.createStats(true);
  }

  dispose(): void {
    if (!this.gl) return;
    if (this.activeQuery) {
      this.gl.deleteQuery(this.activeQuery);
      this.activeQuery = null;
    }
    for (const query of this.pendingQueries) {
      this.gl.deleteQuery(query);
    }
    this.pendingQueries.length = 0;
  }

  private createStats(supported: boolean): GpuTimerFrameStats {
    return {
      supported,
      pendingQueries: this.pendingQueries.length + (this.activeQuery ? 1 : 0),
      lastFrameMs: this.lastFrameMs,
      averageFrameMs: this.averageFrameMs,
      disjointCount: this.disjointCount
    };
  }
}

function readGlString(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  parameter: number
): string {
  return String(gl.getParameter(parameter) ?? "unknown");
}

function isWebGl2Context(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): gl is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
}
