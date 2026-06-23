import { CHUNK_SIZE } from "./voxelConstants";

export const QUALITY_STORAGE_KEY = "voxel-quality-preset";
export const CUSTOM_QUALITY_BASE_STORAGE_KEY = "voxel-custom-quality-base";
export const SUPER_ULTRA_STORAGE_KEY = "voxel-super-ultra-enabled";
export const LEGACY_POTATO_STORAGE_KEY = "voxel-potato-mode";
export const DEFAULT_QUALITY_PRESET = "normal";
export const CUSTOM_PRESET_ID = "custom";
export const SUPER_ULTRA_PRESET_ID = "superUltra";
export const QUALITY_PRESET_ORDER = ["potato", "low", "normal", "high", "ultra"] as const;
export const FOG_RENDER_SAFETY_CHUNKS = 1;

export type StandardQualityPresetId = (typeof QUALITY_PRESET_ORDER)[number];
export type BuiltInQualityPresetId = StandardQualityPresetId | typeof SUPER_ULTRA_PRESET_ID;
export type QualityPresetId = StandardQualityPresetId | typeof CUSTOM_PRESET_ID | typeof SUPER_ULTRA_PRESET_ID;

export type QualityPreset = {
  readonly label: string;
  readonly distanceScale: number;
  readonly pixelRatioLimit: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly shadowCameraSize: number;
  readonly shadowCameraFar: number;
  readonly shadowBias: number;
  readonly shadowNormalBias: number;
  readonly shadowIntensity: number;
  readonly fogStartRadius: number;
  readonly fogFalloffRadius: number;
  readonly fogHiddenRadius: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly cameraFar: number;
  readonly renderRadius: number;
  readonly loadRadius: number;
  readonly unloadRadius: number;
  readonly chunkLoads: number;
  readonly chunkRebuilds: number;
  readonly physicsObjectBudget: number;
  readonly blockFragmentCount: number;
  readonly debrisActiveRadiusMeters: number;
  readonly debrisShadows: boolean;
  readonly localLightBudget: number;
  readonly localLightRadiusMeters: number;
  readonly localLightShadowBudget: number;
  readonly localLightShadowMapSize: number;
  readonly minimapInterval: number;
  readonly minimapRowsPerFrame: number;
  readonly sunIntensity: number;
  readonly skyIntensity: number;
};

type QualityPresetRuntimeFields = "fogNear" | "fogFar" | "cameraFar" | "renderRadius" | "loadRadius" | "unloadRadius";
type QualityPresetDefinition = Omit<QualityPreset, QualityPresetRuntimeFields> & {
  readonly minCameraFar: number;
};

// The player-facing render distance is the clear-view radius. Fog reaches full
// opacity in a short hard-wall band before the actual streamed chunk edge, so
// the square load window hides behind atmosphere instead of becoming a visible
// blue terrain wall.
function createQualityPreset(definition: QualityPresetDefinition): QualityPreset {
  const { minCameraFar, ...preset } = definition;
  const fogOpaqueRadius = preset.fogStartRadius + preset.fogFalloffRadius;
  const loadRadius = fogOpaqueRadius + preset.fogHiddenRadius;
  const renderRadius = Math.min(loadRadius, fogOpaqueRadius + FOG_RENDER_SAFETY_CHUNKS);
  const fogNear = preset.fogStartRadius * CHUNK_SIZE;
  const fogFar = fogOpaqueRadius * CHUNK_SIZE;
  const cameraFar = Math.max(minCameraFar, fogFar + CHUNK_SIZE * 2);

  return {
    ...preset,
    fogNear,
    fogFar,
    cameraFar,
    renderRadius,
    loadRadius,
    unloadRadius: loadRadius + 1
  };
}

// Quality presets are intentionally plain data so render distance, lighting,
// streaming budgets, minimap cost, and physics body defaults can be tuned
// without spelunking the game loop.
export const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  potato: createQualityPreset({
    label: "Potato",
    distanceScale: 0.5,
    pixelRatioLimit: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowCameraSize: 72,
    shadowCameraFar: 180,
    shadowBias: -0.00015,
    shadowNormalBias: 0.035,
    shadowIntensity: 0,
    fogStartRadius: 2,
    fogFalloffRadius: 1,
    fogHiddenRadius: 2,
    minCameraFar: 120,
    chunkLoads: 1,
    chunkRebuilds: 1,
    physicsObjectBudget: 64,
    blockFragmentCount: 54,
    debrisActiveRadiusMeters: 8,
    debrisShadows: false,
    localLightBudget: 2,
    localLightRadiusMeters: 28,
    localLightShadowBudget: 0,
    localLightShadowMapSize: 256,
    minimapInterval: 0.45,
    minimapRowsPerFrame: 3,
    sunIntensity: 2.8,
    skyIntensity: 1.35
  }),
  low: createQualityPreset({
    label: "Low",
    distanceScale: 1,
    pixelRatioLimit: 1,
    shadows: false,
    shadowMapSize: 1024,
    shadowCameraSize: 88,
    shadowCameraFar: 220,
    shadowBias: -0.00015,
    shadowNormalBias: 0.035,
    shadowIntensity: 0,
    fogStartRadius: 3,
    fogFalloffRadius: 1,
    fogHiddenRadius: 2,
    minCameraFar: 180,
    chunkLoads: 1,
    chunkRebuilds: 2,
    physicsObjectBudget: 128,
    blockFragmentCount: 72,
    debrisActiveRadiusMeters: 12,
    debrisShadows: false,
    localLightBudget: 4,
    localLightRadiusMeters: 40,
    localLightShadowBudget: 0,
    localLightShadowMapSize: 256,
    minimapInterval: 0.35,
    minimapRowsPerFrame: 4,
    sunIntensity: 3.2,
    skyIntensity: 1.65
  }),
  normal: createQualityPreset({
    label: "Normal",
    distanceScale: 2,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowCameraSize: 80,
    shadowCameraFar: 260,
    shadowBias: -0.00012,
    shadowNormalBias: 0.028,
    shadowIntensity: 0.78,
    fogStartRadius: 6,
    fogFalloffRadius: 1,
    fogHiddenRadius: 2,
    minCameraFar: 450,
    chunkLoads: 2,
    chunkRebuilds: 4,
    physicsObjectBudget: 192,
    blockFragmentCount: 108,
    debrisActiveRadiusMeters: 20,
    debrisShadows: false,
    localLightBudget: 8,
    localLightRadiusMeters: 56,
    localLightShadowBudget: 1,
    localLightShadowMapSize: 512,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 8,
    sunIntensity: 3.45,
    skyIntensity: 1.45
  }),
  custom: createQualityPreset({
    label: "Custom",
    distanceScale: 2,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowCameraSize: 80,
    shadowCameraFar: 260,
    shadowBias: -0.00012,
    shadowNormalBias: 0.028,
    shadowIntensity: 0.78,
    fogStartRadius: 6,
    fogFalloffRadius: 1,
    fogHiddenRadius: 2,
    minCameraFar: 450,
    chunkLoads: 2,
    chunkRebuilds: 4,
    physicsObjectBudget: 192,
    blockFragmentCount: 108,
    debrisActiveRadiusMeters: 20,
    debrisShadows: false,
    localLightBudget: 8,
    localLightRadiusMeters: 56,
    localLightShadowBudget: 1,
    localLightShadowMapSize: 512,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 8,
    sunIntensity: 3.45,
    skyIntensity: 1.45
  }),
  high: createQualityPreset({
    label: "High",
    distanceScale: 4,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowCameraSize: 88,
    shadowCameraFar: 360,
    shadowBias: -0.0001,
    shadowNormalBias: 0.03,
    shadowIntensity: 0.8,
    fogStartRadius: 12,
    fogFalloffRadius: 2,
    fogHiddenRadius: 3,
    minCameraFar: 900,
    chunkLoads: 4,
    chunkRebuilds: 6,
    physicsObjectBudget: 512,
    blockFragmentCount: 144,
    debrisActiveRadiusMeters: 32,
    debrisShadows: true,
    localLightBudget: 12,
    localLightRadiusMeters: 72,
    localLightShadowBudget: 2,
    localLightShadowMapSize: 512,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 10,
    sunIntensity: 3.55,
    skyIntensity: 1.5
  }),
  ultra: createQualityPreset({
    label: "Ultra",
    distanceScale: 6,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowCameraSize: 96,
    shadowCameraFar: 520,
    shadowBias: -0.00008,
    shadowNormalBias: 0.032,
    shadowIntensity: 0.82,
    fogStartRadius: 18,
    fogFalloffRadius: 2,
    fogHiddenRadius: 3,
    minCameraFar: 1300,
    chunkLoads: 6,
    chunkRebuilds: 8,
    physicsObjectBudget: 1024,
    blockFragmentCount: 180,
    debrisActiveRadiusMeters: 48,
    debrisShadows: true,
    localLightBudget: 16,
    localLightRadiusMeters: 96,
    localLightShadowBudget: 3,
    localLightShadowMapSize: 1024,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 12,
    sunIntensity: 3.65,
    skyIntensity: 1.55
  }),
  [SUPER_ULTRA_PRESET_ID]: createQualityPreset({
    label: "Super Ultra",
    distanceScale: 12,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 8192,
    shadowCameraSize: 112,
    shadowCameraFar: 720,
    shadowBias: -0.00008,
    shadowNormalBias: 0.034,
    shadowIntensity: 0.82,
    fogStartRadius: 36,
    fogFalloffRadius: 2,
    fogHiddenRadius: 3,
    minCameraFar: 2600,
    chunkLoads: 10,
    chunkRebuilds: 10,
    physicsObjectBudget: 4096,
    blockFragmentCount: 216,
    debrisActiveRadiusMeters: 72,
    debrisShadows: true,
    localLightBudget: 24,
    localLightRadiusMeters: 128,
    localLightShadowBudget: 4,
    localLightShadowMapSize: 1024,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 14,
    sunIntensity: 3.75,
    skyIntensity: 1.6
  })
};
