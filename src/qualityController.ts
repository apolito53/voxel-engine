import * as THREE from "three";
import {
  CUSTOM_PRESET_ID,
  CUSTOM_QUALITY_BASE_STORAGE_KEY,
  DEFAULT_QUALITY_PRESET,
  LEGACY_POTATO_STORAGE_KEY,
  QUALITY_PRESET_ORDER,
  QUALITY_PRESETS,
  type BuiltInQualityPresetId,
  type QualityPreset,
  type QualityPresetId,
  QUALITY_STORAGE_KEY,
  SUPER_ULTRA_PRESET_ID,
  SUPER_ULTRA_STORAGE_KEY
} from "./qualityPresets";
import {
  readQualitySettingsPreference,
  writeQualitySettingsPreference,
  normalizeQualitySettings,
  normalizeRenderDistance,
  createDefaultQualitySettings,
  getShadowMapSizeForQualityLevel,
  type QualitySettings
} from "./qualitySettings";
import { CHUNK_SIZE } from "./voxelConstants";

const CAMERA_FAR_FOG_MARGIN_CHUNKS = 2;

export type QualityChangeSource = "preset" | "settings";

type QualityControllerOptions = {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly skyLight: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  readonly qualitySelect: HTMLSelectElement;
  readonly superUltraToggleRow: HTMLElement;
  readonly superUltraToggle: HTMLInputElement;
  readonly updateSunShadowAnchor: () => void;
  readonly onQualityChanged: (source: QualityChangeSource) => void;
};

export class QualityController {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly skyLight: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly superUltraToggleRow: HTMLElement;
  private readonly superUltraToggle: HTMLInputElement;
  private readonly updateSunShadowAnchor: () => void;
  private readonly onQualityChanged: (source: QualityChangeSource) => void;
  private superUltraEnabled = readSuperUltraPreference();
  private customBasePresetId: BuiltInQualityPresetId = this.readCustomBasePreference();
  private presetId: QualityPresetId = this.readQualityPreference();
  private settings: QualitySettings = this.readSettingsForPreset(this.presetId);

  constructor(options: QualityControllerOptions) {
    this.renderer = options.renderer;
    this.camera = options.camera;
    this.sun = options.sun;
    this.skyLight = options.skyLight;
    this.fog = options.fog;
    this.qualitySelect = options.qualitySelect;
    this.superUltraToggleRow = options.superUltraToggleRow;
    this.superUltraToggle = options.superUltraToggle;
    this.updateSunShadowAnchor = options.updateSunShadowAnchor;
    this.onQualityChanged = options.onQualityChanged;
  }

  get preset(): QualityPreset {
    return this.createEffectivePreset();
  }

  get currentPresetId(): QualityPresetId {
    return this.presetId;
  }

  get loadRadius(): number {
    return this.settings.loadRadius;
  }

  get streamLoadRadius(): number {
    return this.preset.loadRadius;
  }

  get initialLoadRadius(): number {
    // High and ultra should not freeze world entry by synchronously building every distant chunk.
    return Math.min(this.loadRadius, QUALITY_PRESETS.low.fogStartRadius);
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

  get blockFragmentCount(): number {
    return this.settings.blockFragmentCount;
  }

  get shadowMapSize(): number {
    return this.settings.shadowMapSize;
  }

  initialize(): void {
    this.syncQualitySelect();
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

    if (this.customBasePresetId === SUPER_ULTRA_PRESET_ID) {
      this.customBasePresetId = "ultra";
      writeCustomBasePreference(this.customBasePresetId);
      if (this.presetId === CUSTOM_PRESET_ID) {
        this.applyCurrentPreset(true, "preset");
      }
    }

    if (this.presetId === SUPER_ULTRA_PRESET_ID) {
      this.setPreset("ultra");
    }
  }

  setPreset(presetId: unknown, persist = true): void {
    this.presetId = this.normalizeQualityPresetId(presetId);
    this.settings = this.readSettingsForPreset(this.presetId);
    this.syncQualitySelect();
    this.applyCurrentPreset(true, "preset");
    if (persist) writeQualityPreference(this.presetId);
  }

  setRenderDistance(loadRadius: unknown): void {
    this.updateSettings({
      ...this.settings,
      loadRadius: normalizeRenderDistance(loadRadius, this.settings.loadRadius)
    }, false);
  }

  setShadowQualityLevel(level: unknown): void {
    this.updateSettings({
      ...this.settings,
      shadowMapSize: getShadowMapSizeForQualityLevel(level)
    }, true);
  }

  setBlockFragmentCount(fragmentCount: unknown): void {
    this.updateSettings({
      ...this.settings,
      blockFragmentCount: Number(fragmentCount)
    }, false);
  }

  forkCurrentPresetToCustom(): void {
    if (this.presetId === CUSTOM_PRESET_ID) return;

    const previousPresetId = this.presetId;

    this.customBasePresetId = previousPresetId;
    this.settings = normalizeQualitySettings(
      this.settings,
      createDefaultQualitySettings(QUALITY_PRESETS[previousPresetId])
    );
    writeCustomBasePreference(this.customBasePresetId);
    writeQualitySettingsPreference(CUSTOM_PRESET_ID, this.settings, QUALITY_PRESETS[previousPresetId]);
    this.presetId = CUSTOM_PRESET_ID;
    this.syncQualitySelect();
    writeQualityPreference(this.presetId);
    this.applyCurrentPreset(false, "settings");
  }

  private updateSettings(nextSettings: QualitySettings, resetShadowMap: boolean): void {
    const previousBasePreset = this.getBasePreset();

    this.settings = normalizeQualitySettings(nextSettings, this.settings);

    if (this.presetId !== CUSTOM_PRESET_ID) {
      const previousPresetId: BuiltInQualityPresetId = this.presetId;

      // Slider edits fork the currently selected preset into Custom. Built-in
      // presets stay clean defaults, so a wild tuning session never mutates
      // "Normal" or "Ultra" behind the player's back.
      this.customBasePresetId = previousPresetId;
      writeCustomBasePreference(this.customBasePresetId);
      this.presetId = CUSTOM_PRESET_ID;
      this.syncQualitySelect();
      writeQualityPreference(this.presetId);
    }

    writeQualitySettingsPreference(CUSTOM_PRESET_ID, this.settings, previousBasePreset);
    this.applyCurrentPreset(resetShadowMap, "settings");
  }

  private applyCurrentPreset(resetShadowMap: boolean, source: QualityChangeSource): void {
    const preset = this.preset;

    this.renderer.setPixelRatio(this.renderPixelRatio);
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.autoUpdate = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.sun.intensity = preset.sunIntensity;
    this.configureSunShadow(preset, resetShadowMap);
    this.skyLight.intensity = preset.skyIntensity;
    this.fog.near = preset.fogNear;
    this.fog.far = preset.fogFar;
    this.camera.far = preset.cameraFar;
    this.camera.updateProjectionMatrix();
    this.updateSunShadowAnchor();

    this.qualitySelect.value = this.presetId;
    this.qualitySelect.setAttribute("aria-label", `Quality preset: ${preset.label}`);
    document.body.dataset.quality = this.presetId;
    this.syncSuperUltraToggle();

    this.onQualityChanged(source);
  }

  getSelectableQualityPresets(): QualityPresetId[] {
    return this.superUltraEnabled
      ? [CUSTOM_PRESET_ID, ...QUALITY_PRESET_ORDER, SUPER_ULTRA_PRESET_ID]
      : [CUSTOM_PRESET_ID, ...QUALITY_PRESET_ORDER];
  }

  private syncQualitySelect(): void {
    const selectablePresets = this.getSelectableQualityPresets();
    const previousValue = this.qualitySelect.value;
    this.qualitySelect.replaceChildren(
      ...selectablePresets.map((presetId) => {
        const option = document.createElement("option");
        option.value = presetId;
        option.textContent = QUALITY_PRESETS[presetId].label;
        return option;
      })
    );
    this.qualitySelect.value = selectablePresets.includes(this.presetId)
      ? this.presetId
      : previousValue;
  }

  private syncSuperUltraToggle(): void {
    const showSuperUltraOptIn = shouldShowSuperUltraOptIn(this.presetId);

    this.superUltraToggle.checked = this.superUltraEnabled;
    this.superUltraToggle.setAttribute("aria-checked", String(this.superUltraEnabled));
    this.superUltraToggleRow.hidden = !showSuperUltraOptIn;
    this.superUltraToggleRow.setAttribute("aria-hidden", String(!showSuperUltraOptIn));
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
    this.sun.shadow.intensity = preset.shadowIntensity;

    if (resetShadowMap) this.resetSunShadowMap();
  }

  private createEffectivePreset(): QualityPreset {
    const basePreset = this.getBasePreset();
    const fogStartRadius = this.settings.loadRadius;
    const loadRadius = fogStartRadius + basePreset.fogFalloffRadius;
    const shadowMapSize = this.settings.shadowMapSize;
    const shadows = shadowMapSize > 0;
    const fogNear = fogStartRadius * CHUNK_SIZE;
    const fogFar = loadRadius * CHUNK_SIZE;
    const cameraFar = Math.max(
      basePreset.cameraFar,
      fogFar + CAMERA_FAR_FOG_MARGIN_CHUNKS * CHUNK_SIZE
    );

    return {
      ...basePreset,
      label: this.presetId === CUSTOM_PRESET_ID ? QUALITY_PRESETS.custom.label : basePreset.label,
      shadows,
      shadowMapSize: shadows ? shadowMapSize : basePreset.shadowMapSize,
      shadowIntensity: shadows ? basePreset.shadowIntensity : 0,
      fogStartRadius,
      loadRadius,
      unloadRadius: loadRadius + 1,
      fogNear,
      fogFar,
      cameraFar,
      blockFragmentCount: this.settings.blockFragmentCount
    };
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

  private normalizeBuiltInPresetId(presetId: unknown, fallback: BuiltInQualityPresetId): BuiltInQualityPresetId {
    if (!isBuiltInQualityPresetId(presetId)) return fallback;
    if (presetId === SUPER_ULTRA_PRESET_ID && !this.superUltraEnabled) return "ultra";
    return presetId;
  }

  private getBasePreset(): QualityPreset {
    if (this.presetId === CUSTOM_PRESET_ID) return QUALITY_PRESETS[this.customBasePresetId];
    return QUALITY_PRESETS[this.presetId];
  }

  private readSettingsForPreset(presetId: QualityPresetId): QualitySettings {
    if (presetId === CUSTOM_PRESET_ID) {
      return readQualitySettingsPreference(CUSTOM_PRESET_ID, QUALITY_PRESETS[this.customBasePresetId]);
    }

    return createDefaultQualitySettings(QUALITY_PRESETS[presetId]);
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

  private readCustomBasePreference(): BuiltInQualityPresetId {
    try {
      return this.normalizeBuiltInPresetId(
        localStorage.getItem(CUSTOM_QUALITY_BASE_STORAGE_KEY),
        DEFAULT_QUALITY_PRESET
      );
    } catch {
      return DEFAULT_QUALITY_PRESET;
    }
  }
}

export function shouldShowSuperUltraOptIn(presetId: QualityPresetId): boolean {
  // The opt-in should feel like a spicy extension of Ultra, not a warning that
  // follows the player through every quality tier. Keep it visible in Super
  // Ultra too so the opt-out does not vanish after the user enables it.
  return presetId === "ultra" || presetId === SUPER_ULTRA_PRESET_ID;
}

function isQualityPresetId(presetId: unknown): presetId is QualityPresetId {
  return (
    typeof presetId === "string" &&
    Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, presetId)
  );
}

function isBuiltInQualityPresetId(presetId: unknown): presetId is BuiltInQualityPresetId {
  return isQualityPresetId(presetId) && presetId !== CUSTOM_PRESET_ID;
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

function writeCustomBasePreference(presetId: BuiltInQualityPresetId): void {
  try {
    localStorage.setItem(CUSTOM_QUALITY_BASE_STORAGE_KEY, presetId);
  } catch {
    // Custom settings still work for this session even if local storage refuses the save.
  }
}
