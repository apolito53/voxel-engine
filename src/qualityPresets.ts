export const QUALITY_STORAGE_KEY = "voxel-quality-preset";
export const CUSTOM_QUALITY_BASE_STORAGE_KEY = "voxel-custom-quality-base";
export const SUPER_ULTRA_STORAGE_KEY = "voxel-super-ultra-enabled";
export const LEGACY_POTATO_STORAGE_KEY = "voxel-potato-mode";
export const DEFAULT_QUALITY_PRESET = "normal";
export const CUSTOM_PRESET_ID = "custom";
export const SUPER_ULTRA_PRESET_ID = "superUltra";
export const QUALITY_PRESET_ORDER = ["potato", "low", "normal", "high", "ultra"] as const;

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
  readonly fogNear: number;
  readonly fogFar: number;
  readonly cameraFar: number;
  readonly loadRadius: number;
  readonly unloadRadius: number;
  readonly chunkLoads: number;
  readonly chunkRebuilds: number;
  readonly physicsObjectBudget: number;
  readonly blockFragmentCount: number;
  readonly debrisActiveRadiusMeters: number;
  readonly minimapInterval: number;
  readonly minimapRowsPerFrame: number;
  readonly sunIntensity: number;
  readonly skyIntensity: number;
};

// Quality presets are intentionally plain data so render distance, lighting,
// streaming budgets, minimap cost, and physics body defaults can be tuned
// without spelunking the game loop.
export const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  potato: {
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
    fogNear: 18,
    fogFar: 44,
    cameraFar: 120,
    loadRadius: 2,
    unloadRadius: 3,
    chunkLoads: 1,
    chunkRebuilds: 1,
    physicsObjectBudget: 64,
    blockFragmentCount: 54,
    debrisActiveRadiusMeters: 8,
    minimapInterval: 0.45,
    minimapRowsPerFrame: 3,
    sunIntensity: 2.8,
    skyIntensity: 1.35
  },
  low: {
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
    fogNear: 35,
    fogFar: 68,
    cameraFar: 180,
    loadRadius: 3,
    unloadRadius: 4,
    chunkLoads: 1,
    chunkRebuilds: 2,
    physicsObjectBudget: 128,
    blockFragmentCount: 72,
    debrisActiveRadiusMeters: 12,
    minimapInterval: 0.35,
    minimapRowsPerFrame: 4,
    sunIntensity: 3.2,
    skyIntensity: 1.65
  },
  normal: {
    label: "Normal",
    distanceScale: 2,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowCameraSize: 80,
    shadowCameraFar: 260,
    shadowBias: -0.00012,
    shadowNormalBias: 0.055,
    shadowIntensity: 0.78,
    fogNear: 55,
    fogFar: 220,
    cameraFar: 450,
    loadRadius: 6,
    unloadRadius: 7,
    chunkLoads: 2,
    chunkRebuilds: 4,
    physicsObjectBudget: 192,
    blockFragmentCount: 108,
    debrisActiveRadiusMeters: 20,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 8,
    sunIntensity: 3.45,
    skyIntensity: 1.45
  },
  custom: {
    label: "Custom",
    distanceScale: 2,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowCameraSize: 80,
    shadowCameraFar: 260,
    shadowBias: -0.00012,
    shadowNormalBias: 0.055,
    shadowIntensity: 0.78,
    fogNear: 55,
    fogFar: 220,
    cameraFar: 450,
    loadRadius: 6,
    unloadRadius: 7,
    chunkLoads: 2,
    chunkRebuilds: 4,
    physicsObjectBudget: 192,
    blockFragmentCount: 108,
    debrisActiveRadiusMeters: 20,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 8,
    sunIntensity: 3.45,
    skyIntensity: 1.45
  },
  high: {
    label: "High",
    distanceScale: 4,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowCameraSize: 88,
    shadowCameraFar: 360,
    shadowBias: -0.0001,
    shadowNormalBias: 0.06,
    shadowIntensity: 0.8,
    fogNear: 95,
    fogFar: 440,
    cameraFar: 900,
    loadRadius: 12,
    unloadRadius: 13,
    chunkLoads: 4,
    chunkRebuilds: 6,
    physicsObjectBudget: 512,
    blockFragmentCount: 144,
    debrisActiveRadiusMeters: 32,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 10,
    sunIntensity: 3.55,
    skyIntensity: 1.5
  },
  ultra: {
    label: "Ultra",
    distanceScale: 6,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowCameraSize: 96,
    shadowCameraFar: 520,
    shadowBias: -0.00008,
    shadowNormalBias: 0.065,
    shadowIntensity: 0.82,
    fogNear: 135,
    fogFar: 660,
    cameraFar: 1300,
    loadRadius: 18,
    unloadRadius: 19,
    chunkLoads: 6,
    chunkRebuilds: 8,
    physicsObjectBudget: 1024,
    blockFragmentCount: 180,
    debrisActiveRadiusMeters: 48,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 12,
    sunIntensity: 3.65,
    skyIntensity: 1.55
  },
  [SUPER_ULTRA_PRESET_ID]: {
    label: "Super Ultra",
    distanceScale: 12,
    pixelRatioLimit: 2,
    shadows: true,
    shadowMapSize: 8192,
    shadowCameraSize: 112,
    shadowCameraFar: 720,
    shadowBias: -0.00008,
    shadowNormalBias: 0.07,
    shadowIntensity: 0.82,
    fogNear: 270,
    fogFar: 1320,
    cameraFar: 2600,
    loadRadius: 36,
    unloadRadius: 37,
    chunkLoads: 10,
    chunkRebuilds: 10,
    physicsObjectBudget: 4096,
    blockFragmentCount: 216,
    debrisActiveRadiusMeters: 72,
    minimapInterval: 0.15,
    minimapRowsPerFrame: 14,
    sunIntensity: 3.75,
    skyIntensity: 1.6
  }
};
