import * as THREE from "three";
import type { DayNightVisualState } from "./dayNightCycle";

// Match the visible disk's outer edge in skybox.ts, rather than sampling the
// much larger atmospheric halo around it. This is an optical effect only.
export const SUN_GLARE_DISC_COSINE = 0.99986;
export const SUN_GLARE_QUERY_SIZE = 32;
const DISC_TANGENT = Math.tan(Math.acos(SUN_GLARE_DISC_COSINE));

export type SunGlareGate = "active" | "off" | "home" | "night" | "off-screen" | "invalid" | "context-lost" | "unavailable" | "disposed";

export type SunGlareInput = {
  readonly inWorld: boolean;
  readonly solarDirection: THREE.Vector3;
  readonly visual: Pick<DayNightVisualState, "sunDiscIntensity" | "twilightFactor">;
  readonly strength: number;
  readonly occlusion: boolean;
  readonly deltaSeconds: number;
};

export type SunGlareFrame = {
  readonly gate: SunGlareGate;
  readonly sunUv: readonly [number, number] | null;
  readonly viewSunDirection: THREE.Vector3;
  readonly cropRadius: readonly [number, number];
  readonly alignment: number;
  readonly strength: number;
  readonly warmth: number;
};

export type SunGlareDebugSnapshot = {
  readonly gate: SunGlareGate;
  readonly configuredStrength: number;
  readonly occlusion: boolean;
  readonly sunUv: readonly [number, number] | null;
  readonly alignment: number;
  readonly unoccludedStrength: number;
  readonly visibility: number | null;
  readonly rawVisibility: number | null;
  readonly effectiveStrength: number | null;
  readonly querySize: number;
  readonly resourcesAllocated: boolean;
  readonly occlusionResourcesAllocated: boolean;
};

/** Project a direction, never a finite sun position, through the live camera. */
export function createSunGlareFrame(camera: THREE.PerspectiveCamera, input: SunGlareInput): SunGlareFrame {
  const base: SunGlareFrame = {
    gate: "invalid", sunUv: null, viewSunDirection: new THREE.Vector3(),
    cropRadius: [0, 0], alignment: 0, strength: 0, warmth: 0
  };
  if (!input.inWorld) return { ...base, gate: "home" };
  if (!Number.isFinite(input.strength) || input.strength <= 0) return { ...base, gate: "off" };
  const direction = input.solarDirection;
  if (![direction.x, direction.y, direction.z, input.visual.sunDiscIntensity,
    input.visual.twilightFactor].every(Number.isFinite) || direction.lengthSq() < 0.00001) return base;
  const solarHeight = direction.y / direction.length();
  if (solarHeight <= 0 || input.visual.sunDiscIntensity <= 0) return { ...base, gate: "night" };
  camera.updateMatrixWorld(true);
  if (!camera.projectionMatrix.elements.every(Number.isFinite)) return base;
  const viewSunDirection = direction.clone().transformDirection(camera.matrixWorldInverse);
  const forward = -viewSunDirection.z;
  if (forward <= 0.05) return { ...base, gate: "off-screen", viewSunDirection };
  const clip = new THREE.Vector4(viewSunDirection.x, viewSunDirection.y, viewSunDirection.z, 0)
    .applyMatrix4(camera.projectionMatrix);
  if (![clip.x, clip.y, clip.w].every(Number.isFinite) || clip.w <= 0.00001) return base;
  const x = clip.x / clip.w;
  const y = clip.y / clip.w;
  const sunUv = [(x + 1) * 0.5, (y + 1) * 0.5] as const;
  // Fade smoothly near the frame edge, then do no extra drawing for a distant
  // offscreen or behind-camera sun. The center falloff keeps it camera-facing.
  const alignment = smoothstep(0.45, 0.98, forward) * (1 - smoothstep(0.82, 1.15, Math.max(Math.abs(x), Math.abs(y))));
  if (alignment <= 0.0001) return { ...base, gate: "off-screen", sunUv, viewSunDirection };
  const horizon = smoothstep(0, 0.045, solarHeight);
  const warmth = Math.max(clamp(input.visual.twilightFactor, 0, 1), 1 - smoothstep(0.07, 0.32, solarHeight));
  const strength = clamp(input.strength, 0, 200) / 100 * alignment * horizon *
    clamp(input.visual.sunDiscIntensity, 0, 1.2) * (0.68 + warmth * 0.65);
  if (strength <= 0.00001) return { ...base, gate: "night", sunUv, viewSunDirection };
  // A conservative bound around the angular disk; the GPU weights only rays
  // inside its true round footprint. Copying/cropping the projection also
  // preserves zoom, aspect, roll and future view offsets.
  const radius = DISC_TANGENT / (forward * forward) * 1.15;
  const cropRadius = [radius * Math.abs(camera.projectionMatrix.elements[0]),
    radius * Math.abs(camera.projectionMatrix.elements[5])] as const;
  if (!cropRadius.every((value) => Number.isFinite(value) && value > 0)) return base;
  return { gate: "active", sunUv, viewSunDirection, cropRadius, alignment, strength, warmth };
}

/** Crop only projection; the probe keeps the exact main-camera world transform. */
export function configureSunGlareQueryCamera(
  target: THREE.PerspectiveCamera, camera: THREE.PerspectiveCamera, frame: SunGlareFrame
): void {
  if (!frame.sunUv) return;
  target.copy(camera, false);
  target.matrixAutoUpdate = false;
  target.matrixWorldAutoUpdate = false;
  target.matrix.copy(camera.matrixWorld);
  target.matrixWorld.copy(camera.matrixWorld);
  target.matrixWorldInverse.copy(camera.matrixWorldInverse);
  target.position.setFromMatrixPosition(camera.matrixWorld);
  const [radiusX, radiusY] = frame.cropRadius;
  const crop = new THREE.Matrix4().makeScale(1 / radiusX, 1 / radiusY, 1);
  crop.elements[12] = -(frame.sunUv[0] * 2 - 1) / radiusX;
  crop.elements[13] = -(frame.sunUv[1] * 2 - 1) / radiusY;
  target.projectionMatrix.multiplyMatrices(crop, camera.projectionMatrix);
  target.projectionMatrixInverse.copy(target.projectionMatrix).invert();
}

const FULLSCREEN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const VISIBILITY_FRAGMENT = `
  precision highp float;
  uniform sampler2D sceneDepth;
  uniform sampler2D previousVisibility;
  uniform mat4 inverseProjection;
  uniform vec3 viewSunDirection;
  uniform float historyValid;
  uniform float deltaSeconds;
  void main() {
    float exposed = 0.0;
    float total = 0.0;
    // Fixed 256 depth taps, evaluated for ONE pixel, with no CPU readback.
    for (int y = 0; y < 16; y++) {
      for (int x = 0; x < 16; x++) {
        vec2 uv = (vec2(float(x), float(y)) + 0.5) / 16.0;
        vec4 position = inverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(position.xyz / position.w);
        float disk = smoothstep(0.99986, 0.99991, dot(ray, viewSunDirection));
        float clear = step(1.0, texture2D(sceneDepth, uv).r);
        exposed += disk * clear;
        total += disk;
      }
    }
    float current = exposed / max(total, 0.00001);
    float previous = texture2D(previousVisibility, vec2(0.5)).r;
    // Cover quickly, reveal gently. Partial disk coverage remains fractional.
    float rate = current < previous ? 40.0 : 14.0;
    float blend = historyValid > 0.5 ? 1.0 - exp(-deltaSeconds * rate) : 1.0;
    float smoothed = mix(previous, current, blend);
    // Byte history can otherwise stall a few codes away from its target.
    // Fully covered disks extinguish immediately, including every broad halo.
    if (current < 0.00001 || abs(smoothed - current) < 0.04) smoothed = current;
    gl_FragColor = vec4(smoothed, current, 0.0, 1.0);
  }
`;

const GLARE_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 sunUv;
  uniform float aspect;
  uniform float strength;
  uniform float warmth;
  uniform float useOcclusion;
  uniform sampler2D visibility;
  void main() {
    float exposed = useOcclusion > 0.5 ? texture2D(visibility, vec2(0.5)).r : 1.0;
    vec2 offset = (vUv - sunUv) * vec2(aspect, 1.0);
    float radius = length(offset);
    float core = exp(-radius * 25.0) * 0.82;
    float halo = exp(-radius * 5.4) * 0.30;
    float veil = exp(-radius * radius * 1.7) * 0.09;
    float streak = exp(-abs(offset.y) * 115.0) * exp(-abs(offset.x) * 3.1) * 0.13;
    vec3 amber = mix(vec3(1.0, 0.84, 0.58), vec3(1.0, 0.49, 0.18), warmth);
    vec3 radiance = (amber * (halo + veil + streak) + mix(amber, vec3(1.0, 0.96, 0.83), 0.7) * core)
      * strength * exposed;
    // Photographic screen blend over the existing display-encoded backbuffer.
    // The original scene/color conversion stays untouched; this is not an HDR
    // scene buffer and must not run another output transform on its pixels.
    gl_FragColor = vec4(vec3(1.0) - exp(-radiance), 0.0);
  }
`;

type OverlayResources = {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
};

type OcclusionResources = {
  readonly query: THREE.WebGLRenderTarget;
  readonly history: readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  readonly material: THREE.ShaderMaterial;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly queryCamera: THREE.PerspectiveCamera;
  index: 0 | 1;
  valid: boolean;
};

export class SunGlare {
  private overlay: OverlayResources | null = null;
  private occlusion: OcclusionResources | null = null;
  private readonly drawingSize = new THREE.Vector2();
  private readonly readback = new Uint8Array(4);
  private disposed = false;
  private contextLost = false;
  private failed = false;
  private lastPosition: THREE.Vector3 | null = null;
  private lastSunUv: readonly [number, number] | null = null;
  private lastFrame: SunGlareFrame | null = null;
  private configuredStrength = 0;
  private occlusionEnabled = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly onFailure?: (error: unknown) => void
  ) {}

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, input: SunGlareInput): void {
    if (this.disposed) return;
    this.configuredStrength = input.strength;
    this.occlusionEnabled = input.occlusion;
    const frame = createSunGlareFrame(camera, input);
    this.lastFrame = frame;
    if (this.contextLost || this.failed || frame.gate !== "active") {
      if (frame.gate === "off" || !input.inWorld) this.releaseResources();
      this.reset();
      this.renderer.render(scene, camera);
      return;
    }

    const renderer = this.renderer;
    const autoReset = renderer.info.autoReset;
    try {
      // Preserve the exact original color pipeline, antialiasing and baseline.
      renderer.render(scene, camera);
      // Three resets its main counters after shadow rendering. Keep that same
      // baseline, then accumulate every supplemental draw without another reset.
      renderer.info.autoReset = false;
      const target = renderer.getRenderTarget();
      const viewport = renderer.getViewport(new THREE.Vector4());
      const scissor = renderer.getScissor(new THREE.Vector4());
      const scissorTest = renderer.getScissorTest();
      const autoClear = renderer.autoClear;
      const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
      const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
      try {
        const overlay = this.overlay ??= createOverlayResources();
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = false;
        renderer.setScissorTest(false);
        if (input.occlusion) {
          this.updateVisibility(scene, camera, frame, input.deltaSeconds, overlay.geometry);
        } else {
          this.releaseOcclusion();
        }
        renderer.setRenderTarget(target);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.autoClear = false;
        renderer.getDrawingBufferSize(this.drawingSize);
        overlay.material.uniforms.sunUv.value.set(...frame.sunUv!);
        overlay.material.uniforms.aspect.value = this.drawingSize.x / Math.max(1, this.drawingSize.y);
        overlay.material.uniforms.strength.value = frame.strength;
        overlay.material.uniforms.warmth.value = frame.warmth;
        overlay.material.uniforms.useOcclusion.value = input.occlusion ? 1 : 0;
        overlay.material.uniforms.visibility.value = this.occlusion?.history[this.occlusion.index].texture ?? null;
        renderer.render(overlay.scene, overlay.camera);
      } catch (error) {
        this.failed = true;
        this.releaseResources();
        console.warn("Sun glare disabled after a rendering failure; the original scene renderer remains available.", error);
        try { this.onFailure?.(error); } catch {
          // Diagnostic delivery must not interrupt the original scene renderer.
        }
      } finally {
        renderer.setRenderTarget(target);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.autoClear = autoClear;
        renderer.shadowMap.autoUpdate = shadowAutoUpdate;
        renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      }
    } finally {
      renderer.info.autoReset = autoReset;
    }
  }

  private updateVisibility(
    scene: THREE.Scene, camera: THREE.PerspectiveCamera, frame: SunGlareFrame,
    deltaSeconds: number, geometry: THREE.BufferGeometry
  ): void {
    const resources = this.occlusion ??= createOcclusionResources(geometry);
    const uv = frame.sunUv!;
    if (!this.lastPosition || this.lastPosition.distanceToSquared(camera.position) > 64 || !this.lastSunUv ||
      Math.hypot(uv[0] - this.lastSunUv[0], uv[1] - this.lastSunUv[1]) > 0.15) resources.valid = false;
    this.lastPosition ??= new THREE.Vector3();
    this.lastPosition.copy(camera.position);
    this.lastSunUv = uv;
    configureSunGlareQueryCamera(resources.queryCamera, camera, frame);
    const renderer = this.renderer;
    renderer.autoClear = true;
    renderer.setRenderTarget(resources.query);
    renderer.render(scene, resources.queryCamera);
    resources.material.uniforms.sceneDepth.value = resources.query.depthTexture;
    resources.material.uniforms.inverseProjection.value.copy(resources.queryCamera.projectionMatrixInverse);
    resources.material.uniforms.viewSunDirection.value.copy(frame.viewSunDirection);
    resources.material.uniforms.previousVisibility.value = resources.history[resources.index].texture;
    resources.material.uniforms.historyValid.value = resources.valid ? 1 : 0;
    resources.material.uniforms.deltaSeconds.value = Number.isFinite(deltaSeconds) ? clamp(deltaSeconds, 1 / 240, 0.1) : 1 / 60;
    const nextIndex = resources.index === 0 ? 1 : 0;
    renderer.setRenderTarget(resources.history[nextIndex]);
    renderer.render(resources.scene, resources.camera);
    resources.index = nextIndex;
    resources.valid = true;
  }

  /** Explicit diagnostic call only: ordinary frames never read pixels to CPU. */
  snapshot(): SunGlareDebugSnapshot {
    const frame = this.lastFrame;
    const gate = this.disposed ? "disposed" : this.contextLost ? "context-lost" : this.failed ? "unavailable" : frame?.gate ?? "off";
    let visibility: number | null = gate === "active" && !this.occlusionEnabled ? 1 : gate !== "active" ? 0 : null;
    let rawVisibility = visibility;
    if (gate === "active" && this.occlusion?.valid) {
      try {
        this.renderer.readRenderTargetPixels(this.occlusion.history[this.occlusion.index], 0, 0, 1, 1, this.readback);
        visibility = this.readback[0] / 255;
        rawVisibility = this.readback[1] / 255;
      } catch {
        // A diagnostic readback cannot break play or invent confirmed visibility.
      }
    }
    const strength = gate === "active" ? frame?.strength ?? 0 : 0;
    return {
      gate, configuredStrength: this.configuredStrength, occlusion: this.occlusionEnabled,
      sunUv: frame?.sunUv ?? null, alignment: frame?.alignment ?? 0,
      unoccludedStrength: strength, visibility, rawVisibility,
      effectiveStrength: visibility === null ? null : strength * visibility,
      querySize: this.occlusion ? SUN_GLARE_QUERY_SIZE : 0,
      resourcesAllocated: this.overlay !== null, occlusionResourcesAllocated: this.occlusion !== null
    };
  }

  reset(): void {
    if (this.occlusion) this.occlusion.valid = false;
    this.lastPosition = null;
    this.lastSunUv = null;
  }

  handleContextLoss(): void {
    this.contextLost = true;
    this.releaseResources();
  }

  handleContextRestore(): void {
    this.contextLost = false;
    this.failed = false;
    this.releaseResources();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseResources();
  }

  private releaseOcclusion(): void {
    if (!this.occlusion) return;
    this.occlusion.query.dispose();
    // Three owns disposal of the attached depth texture with its target.
    for (const target of this.occlusion.history) target.dispose();
    this.occlusion.material.dispose();
    this.occlusion = null;
    this.reset();
  }

  private releaseResources(): void {
    this.releaseOcclusion();
    if (!this.overlay) return;
    this.overlay.geometry.dispose();
    this.overlay.material.dispose();
    this.overlay = null;
  }
}

function createOverlayResources(): OverlayResources {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX, fragmentShader: GLARE_FRAGMENT,
    uniforms: {
      sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 }, strength: { value: 0 },
      warmth: { value: 0 }, useOcclusion: { value: 0 }, visibility: { value: null }
    },
    depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
  });
  return createFullscreenScene(geometry, material);
}

function createOcclusionResources(geometry: THREE.BufferGeometry): OcclusionResources {
  const query = new THREE.WebGLRenderTarget(SUN_GLARE_QUERY_SIZE, SUN_GLARE_QUERY_SIZE, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true, stencilBuffer: false
  });
  query.texture.name = "Sun glare tiny scene query";
  query.depthTexture = new THREE.DepthTexture(SUN_GLARE_QUERY_SIZE, SUN_GLARE_QUERY_SIZE, THREE.UnsignedIntType);
  query.depthTexture.name = "Sun glare visible scene depth";
  const history = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false
  })) as [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  for (const target of history) target.texture.name = "Sun glare visibility history";
  const material = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX, fragmentShader: VISIBILITY_FRAGMENT,
    uniforms: {
      sceneDepth: { value: null }, previousVisibility: { value: null },
      inverseProjection: { value: new THREE.Matrix4() }, viewSunDirection: { value: new THREE.Vector3() },
      historyValid: { value: 0 }, deltaSeconds: { value: 1 / 60 }
    },
    depthTest: false, depthWrite: false, toneMapped: false
  });
  const fullscreen = createFullscreenScene(geometry, material);
  return { query, history, material, scene: fullscreen.scene, camera: fullscreen.camera,
    queryCamera: new THREE.PerspectiveCamera(), index: 0, valid: false };
}

function createFullscreenScene(geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial): OverlayResources {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { geometry, material, scene, camera: new THREE.Camera() };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(min: number, max: number, value: number): number {
  const fraction = clamp((value - min) / (max - min), 0, 1);
  return fraction * fraction * (3 - 2 * fraction);
}
