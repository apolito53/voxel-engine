import * as THREE from "three";
import {
  DEFAULT_QUALITY_PRESET,
  LEGACY_POTATO_STORAGE_KEY,
  QUALITY_PRESET_ORDER,
  QUALITY_PRESETS,
  type QualityPreset,
  type QualityPresetId,
  QUALITY_STORAGE_KEY,
  SUPER_ULTRA_PRESET_ID,
  SUPER_ULTRA_STORAGE_KEY
} from "./qualityPresets";

type QualityControllerOptions = {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly skyLight: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  readonly qualityButton: HTMLButtonElement;
  readonly superUltraToggle: HTMLInputElement;
  readonly updateSunShadowAnchor: () => void;
  readonly onQualityChanged: () => void;
};

export class QualityController {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly skyLight: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly qualityButton: HTMLButtonElement;
  private readonly superUltraToggle: HTMLInputElement;
  private readonly updateSunShadowAnchor: () => void;
  private readonly onQualityChanged: () => void;
  private superUltraEnabled = readSuperUltraPreference();
  private presetId: QualityPresetId = this.readQualityPreference();

  constructor(options: QualityControllerOptions) {
    this.renderer = options.renderer;
    this.camera = options.camera;
    this.sun = options.sun;
    this.skyLight = options.skyLight;
    this.fog = options.fog;
    this.qualityButton = options.qualityButton;
    this.superUltraToggle = options.superUltraToggle;
    this.updateSunShadowAnchor = options.updateSunShadowAnchor;
    this.onQualityChanged = options.onQualityChanged;
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.presetId];
  }

  get loadRadius(): number {
    return this.preset.loadRadius;
  }

  get initialLoadRadius(): number {
    // High and ultra should not freeze world entry by synchronously building every distant chunk.
    return Math.min(this.loadRadius, QUALITY_PRESETS.low.loadRadius);
  }

  get unloadRadius(): number {
    return this.preset.unloadRadius;
  }

  get chunkLoadBudget(): number {
    return this.preset.chunkLoads;
  }

  get chunkRebuildBudget(): number {
    return this.preset.chunkRebuilds;
  }

  get minimapInterval(): number {
    return this.preset.minimapInterval;
  }

  get minimapRowsPerFrame(): number {
    return this.preset.minimapRowsPerFrame;
  }

  get renderPixelRatio(): number {
    return Math.min(window.devicePixelRatio, this.preset.pixelRatioLimit);
  }

  initialize(): void {
    this.syncSuperUltraToggle();
    this.setPreset(this.presetId, false);
  }

  cycle(): void {
    const selectablePresets = this.getSelectableQualityPresets();
    const currentIndex = selectablePresets.indexOf(this.presetId);
    const nextIndex = (currentIndex + 1) % selectablePresets.length;
    this.setPreset(selectablePresets[nextIndex] ?? DEFAULT_QUALITY_PRESET);
  }

  setSuperUltraEnabled(enabled: boolean, persist = true): void {
    this.superUltraEnabled = enabled;
    this.syncSuperUltraToggle();

    if (persist) writeSuperUltraPreference(this.superUltraEnabled);
    if (this.superUltraEnabled) {
      this.setPreset(SUPER_ULTRA_PRESET_ID);
      return;
    }

    if (this.presetId === SUPER_ULTRA_PRESET_ID) {
      this.setPreset("ultra");
    }
  }

  setPreset(presetId: unknown, persist = true): void {
    this.presetId = this.normalizeQualityPresetId(presetId);
    const preset = this.preset;

    this.renderer.setPixelRatio(this.renderPixelRatio);
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.autoUpdate = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.sun.intensity = preset.sunIntensity;
    this.configureSunShadow(preset, true);
    this.skyLight.intensity = preset.skyIntensity;
    this.fog.near = preset.fogNear;
    this.fog.far = preset.fogFar;
    this.camera.far = preset.cameraFar;
    this.camera.updateProjectionMatrix();
    this.updateSunShadowAnchor();

    this.qualityButton.textContent = `Quality: ${preset.label}`;
    this.qualityButton.setAttribute("aria-label", `Quality preset: ${preset.label}`);
    document.body.dataset.quality = this.presetId;

    this.onQualityChanged();
    if (persist) writeQualityPreference(this.presetId);
  }

  private getSelectableQualityPresets(): QualityPresetId[] {
    return this.superUltraEnabled
      ? [...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID]
      : [...QUALITY_PRESET_ORDER];
  }

  private syncSuperUltraToggle(): void {
    this.superUltraToggle.checked = this.superUltraEnabled;
    this.superUltraToggle.setAttribute("aria-checked", String(this.superUltraEnabled));
    document.body.classList.toggle("super-ultra-enabled", this.superUltraEnabled);
  }

  private configureSunShadow(preset: QualityPreset, resetShadowMap: boolean): void {
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.sun.shadow.camera.left = -preset.shadowCameraSize;
    this.sun.shadow.camera.right = preset.shadowCameraSize;
    this.sun.shadow.camera.top = preset.shadowCameraSize;
    this.sun.shadow.camera.bottom = -preset.shadowCameraSize;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = preset.shadowCameraFar;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = preset.shadowBias;
    this.sun.shadow.normalBias = preset.shadowNormalBias;

    if (resetShadowMap) this.resetSunShadowMap();
  }

  private resetSunShadowMap(): void {
    // Three.js allocates shadow render targets lazily; quality changes need a clean target.
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    if (this.sun.shadow.mapPass) {
      this.sun.shadow.mapPass.dispose();
      this.sun.shadow.mapPass = null;
    }
  }

  private normalizeQualityPresetId(presetId: unknown): QualityPresetId {
    if (!isQualityPresetId(presetId)) return DEFAULT_QUALITY_PRESET;
    if (presetId === SUPER_ULTRA_PRESET_ID && !this.superUltraEnabled) return "ultra";
    return presetId;
  }

  private readQualityPreference(): QualityPresetId {
    try {
      const storedPreset = localStorage.getItem(QUALITY_STORAGE_KEY);
      if (isQualityPresetId(storedPreset)) return this.normalizeQualityPresetId(storedPreset);

      // Keep old sessions intuitive: the previous "potato on" setting is now "low".
      if (localStorage.getItem(LEGACY_POTATO_STORAGE_KEY) === "true") return "low";
      return DEFAULT_QUALITY_PRESET;
    } catch {
      return DEFAULT_QUALITY_PRESET;
    }
  }
}

function isQualityPresetId(presetId: unknown): presetId is QualityPresetId {
  return (
    typeof presetId === "string" &&
    Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, presetId)
  );
}

function readSuperUltraPreference(): boolean {
  try {
    return localStorage.getItem(SUPER_ULTRA_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSuperUltraPreference(enabled: boolean): void {
  try {
    localStorage.setItem(SUPER_ULTRA_STORAGE_KEY, String(enabled));
  } catch {
    // The warning toggle is a convenience; Super Ultra can still be enabled this session.
  }
}

function writeQualityPreference(presetId: QualityPresetId): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, presetId);
    localStorage.removeItem(LEGACY_POTATO_STORAGE_KEY);
  } catch {
    // Local storage is a convenience here; quality changes should still work without it.
  }
}
