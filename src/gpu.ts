import * as THREE from "three";

export type GpuInfo = {
  readonly vendor: string;
  readonly renderer: string;
};

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

function readGlString(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  parameter: number
): string {
  return String(gl.getParameter(parameter) ?? "unknown");
}
