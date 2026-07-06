import {
  BLOCK_DEBRIS_MAX_FRAGMENT_COUNT,
  BLOCK_DEBRIS_MIN_FRAGMENT_COUNT,
  normalizeBlockFragmentCount
} from "./blockFragments";
import { BLOCK_LIGHT_MAX_LEVEL, BLOCK_LIGHT_MIN_LEVEL } from "./voxelBlockLight";
import type { QualityPreset, QualityPresetId } from "./qualityPresets";

export const QUALITY_SETTINGS_STORAGE_PREFIX = "voxel-quality-settings:";
export const RENDER_DISTANCE_MIN = 1;
export const RENDER_DISTANCE_MAX = 36;
export const RENDER_DISTANCE_STEP = 1;
export const SHADOW_MAP_SIZE_OPTIONS = [0, 1024, 2048, 4096, 8192] as const;
export const SHADOW_QUALITY_MIN_LEVEL = 0;
export const SHADOW_QUALITY_MAX_LEVEL = SHADOW_MAP_SIZE_OPTIONS.length - 1;
export const BLOCK_FRAGMENT_MIN_COUNT = BLOCK_DEBRIS_MIN_FRAGMENT_COUNT;
export const BLOCK_FRAGMENT_MAX_COUNT = BLOCK_DEBRIS_MAX_FRAGMENT_COUNT;
export const BLOCK_LIGHT_LEVEL_MIN = BLOCK_LIGHT_MIN_LEVEL;
export const BLOCK_LIGHT_LEVEL_MAX = BLOCK_LIGHT_MAX_LEVEL;
export const BLOCK_LIGHT_LEVEL_STEP = 1;

export type QualitySettings = {
  // Historical name kept for localStorage compatibility. This value is now the
  // clear-view chunk radius where fog begins, not the full streamed horizon.
  readonly loadRadius: number;
  readonly shadowMapSize: number;
  readonly blockFragmentCount: number;
  readonly debrisShadows: boolean;
  readonly blockLightMinLevel: number;
  readonly blockLightMaxLevel: number;
};

export function createDefaultQualitySettings(preset: QualityPreset): QualitySettings {
  return {
    loadRadius: normalizeRenderDistance(preset.fogStartRadius),
    shadowMapSize: normalizeShadowMapSize(preset.shadows ? preset.shadowMapSize : 0),
    blockFragmentCount: normalizeBlockFragmentCountSetting(preset.blockFragmentCount),
    debrisShadows: preset.debrisShadows,
    blockLightMinLevel: preset.blockLightMinLevel,
    blockLightMaxLevel: preset.blockLightMaxLevel
  };
}

export function readQualitySettingsPreference(
  presetId: QualityPresetId,
  preset: QualityPreset
): QualitySettings {
  const fallback = createDefaultQualitySettings(preset);

  try {
    const stored = localStorage.getItem(getQualitySettingsStorageKey(presetId));
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<QualitySettings>;
    return normalizeQualitySettings(parsed, fallback);
  } catch {
    return fallback;
  }
}

export function writeQualitySettingsPreference(
  presetId: QualityPresetId,
  settings: QualitySettings,
  preset: QualityPreset
): void {
  try {
    localStorage.setItem(
      getQualitySettingsStorageKey(presetId),
      JSON.stringify(normalizeQualitySettings(settings, createDefaultQualitySettings(preset)))
    );
  } catch {
    // Local storage is a convenience; settings still apply for this session.
  }
}

export function normalizeQualitySettings(
  settings: Partial<QualitySettings>,
  fallback: QualitySettings
): QualitySettings {
  const blockLightRange = normalizeBlockLightLevelRange(
    {
      minLevel: settings.blockLightMinLevel,
      maxLevel: settings.blockLightMaxLevel
    },
    {
      minLevel: fallback.blockLightMinLevel,
      maxLevel: fallback.blockLightMaxLevel
    }
  );

  return {
    loadRadius: normalizeRenderDistance(settings.loadRadius, fallback.loadRadius),
    shadowMapSize: normalizeShadowMapSize(settings.shadowMapSize, fallback.shadowMapSize),
    blockFragmentCount: normalizeBlockFragmentCountSetting(
      settings.blockFragmentCount ?? fallback.blockFragmentCount
    ),
    debrisShadows: normalizeBooleanSetting(settings.debrisShadows, fallback.debrisShadows),
    blockLightMinLevel: blockLightRange.minLevel,
    blockLightMaxLevel: blockLightRange.maxLevel
  };
}

export function normalizeRenderDistance(value: unknown, fallback = RENDER_DISTANCE_MIN): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return clampRenderDistance(fallback);
  return clampRenderDistance(Math.round(numericValue / RENDER_DISTANCE_STEP) * RENDER_DISTANCE_STEP);
}

export function normalizeShadowQualityLevel(value: unknown, fallbackMapSize = 0): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return getShadowQualityLevel(fallbackMapSize);
  return Math.max(
    SHADOW_QUALITY_MIN_LEVEL,
    Math.min(SHADOW_QUALITY_MAX_LEVEL, Math.round(numericValue))
  );
}

export function normalizeShadowMapSize(value: unknown, fallbackMapSize = 0): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return getShadowMapSizeForQualityLevel(getShadowQualityLevel(fallbackMapSize));
  }

  let nearest: number = SHADOW_MAP_SIZE_OPTIONS[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const option of SHADOW_MAP_SIZE_OPTIONS) {
    const distance = Math.abs(option - numericValue);
    if (distance < nearestDistance) {
      nearest = option;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function getShadowQualityLevel(shadowMapSize: number): number {
  const normalizedMapSize = normalizeShadowMapSize(shadowMapSize);
  const index = SHADOW_MAP_SIZE_OPTIONS.indexOf(
    normalizedMapSize as (typeof SHADOW_MAP_SIZE_OPTIONS)[number]
  );
  return index < 0 ? SHADOW_QUALITY_MIN_LEVEL : index;
}

export function getShadowMapSizeForQualityLevel(level: unknown): number {
  const normalizedLevel = normalizeShadowQualityLevel(level);
  return SHADOW_MAP_SIZE_OPTIONS[normalizedLevel] ?? 0;
}

export function normalizeBlockLightLevelSetting(value: unknown, fallback = BLOCK_LIGHT_LEVEL_MIN): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return clampBlockLightLevel(fallback);
  return clampBlockLightLevel(Math.round(numericValue / BLOCK_LIGHT_LEVEL_STEP) * BLOCK_LIGHT_LEVEL_STEP);
}

export function normalizeBlockLightLevelRange(
  range: {
    readonly minLevel?: unknown;
    readonly maxLevel?: unknown;
  },
  fallback: {
    readonly minLevel: number;
    readonly maxLevel: number;
  }
): { readonly minLevel: number; readonly maxLevel: number } {
  const minLevel = normalizeBlockLightLevelSetting(range.minLevel, fallback.minLevel);
  const maxLevel = normalizeBlockLightLevelSetting(range.maxLevel, fallback.maxLevel);

  // Persisted settings can come from older builds or manual localStorage edits.
  // Sorting the pair keeps the range valid without throwing away the user's
  // rough intent when the two handles were saved in the wrong order.
  return {
    minLevel: Math.min(minLevel, maxLevel),
    maxLevel: Math.max(minLevel, maxLevel)
  };
}

export function formatRenderDistance(loadRadius: number): string {
  const normalizedDistance = normalizeRenderDistance(loadRadius);
  return `${normalizedDistance} clear ${normalizedDistance === 1 ? "chunk" : "chunks"}`;
}

export function formatShadowQuality(shadowMapSize: number): string {
  const normalizedMapSize = normalizeShadowMapSize(shadowMapSize);
  return normalizedMapSize <= 0 ? "Off" : `${normalizedMapSize}px`;
}

export function formatBlockFragmentCount(fragmentCount: number): string {
  const normalizedFragmentCount = normalizeBlockFragmentCountSetting(fragmentCount);
  return `${normalizedFragmentCount} max shards/block`;
}

export function formatBlockLightLevel(level: number): string {
  return `Level ${normalizeBlockLightLevelSetting(level)}`;
}

function normalizeBlockFragmentCountSetting(fragmentCount: unknown): number {
  return Math.max(
    BLOCK_FRAGMENT_MIN_COUNT,
    Math.min(BLOCK_FRAGMENT_MAX_COUNT, normalizeBlockFragmentCount(Number(fragmentCount)))
  );
}

function normalizeBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function clampRenderDistance(value: number): number {
  return Math.max(RENDER_DISTANCE_MIN, Math.min(RENDER_DISTANCE_MAX, value));
}

function clampBlockLightLevel(value: number): number {
  return Math.max(BLOCK_LIGHT_LEVEL_MIN, Math.min(BLOCK_LIGHT_LEVEL_MAX, value));
}

function getQualitySettingsStorageKey(presetId: QualityPresetId): string {
  return `${QUALITY_SETTINGS_STORAGE_PREFIX}${presetId}`;
}
