import { BLOCK_FRAGMENT_COUNT, normalizeBlockFragmentCount } from "./blockFragments";
import type { QualityPreset, QualityPresetId } from "./qualityPresets";

export const QUALITY_SETTINGS_STORAGE_PREFIX = "voxel-quality-settings:";
export const RENDER_DISTANCE_MIN = 1;
export const RENDER_DISTANCE_MAX = 36;
export const RENDER_DISTANCE_STEP = 1;
export const SHADOW_MAP_SIZE_OPTIONS = [0, 1024, 2048, 4096, 8192] as const;
export const SHADOW_QUALITY_MIN_LEVEL = 0;
export const SHADOW_QUALITY_MAX_LEVEL = SHADOW_MAP_SIZE_OPTIONS.length - 1;
export const BLOCK_FRAGMENT_MIN_COUNT = 1;
export const BLOCK_FRAGMENT_MAX_COUNT = BLOCK_FRAGMENT_COUNT;

export type QualitySettings = {
  readonly loadRadius: number;
  readonly shadowMapSize: number;
  readonly blockFragmentCount: number;
};

export function createDefaultQualitySettings(preset: QualityPreset): QualitySettings {
  return {
    loadRadius: normalizeRenderDistance(preset.loadRadius),
    shadowMapSize: normalizeShadowMapSize(preset.shadows ? preset.shadowMapSize : 0),
    blockFragmentCount: normalizeBlockFragmentCount(preset.blockFragmentCount)
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
  return {
    loadRadius: normalizeRenderDistance(settings.loadRadius, fallback.loadRadius),
    shadowMapSize: normalizeShadowMapSize(settings.shadowMapSize, fallback.shadowMapSize),
    blockFragmentCount: normalizeBlockFragmentCount(
      settings.blockFragmentCount ?? fallback.blockFragmentCount
    )
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

export function formatRenderDistance(loadRadius: number): string {
  const normalizedDistance = normalizeRenderDistance(loadRadius);
  return `${normalizedDistance} ${normalizedDistance === 1 ? "chunk" : "chunks"}`;
}

export function formatShadowQuality(shadowMapSize: number): string {
  const normalizedMapSize = normalizeShadowMapSize(shadowMapSize);
  return normalizedMapSize <= 0 ? "Off" : `${normalizedMapSize}px`;
}

export function formatBlockFragmentCount(fragmentCount: number): string {
  const normalizedFragmentCount = normalizeBlockFragmentCount(fragmentCount);
  return `${normalizedFragmentCount} ${normalizedFragmentCount === 1 ? "cube" : "cubes"}`;
}

function clampRenderDistance(value: number): number {
  return Math.max(RENDER_DISTANCE_MIN, Math.min(RENDER_DISTANCE_MAX, value));
}

function getQualitySettingsStorageKey(presetId: QualityPresetId): string {
  return `${QUALITY_SETTINGS_STORAGE_PREFIX}${presetId}`;
}
