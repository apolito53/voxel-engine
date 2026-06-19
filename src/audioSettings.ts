import { clamp } from "./math";

export type AudioSettings = {
  readonly enabled: boolean;
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly uiVolume: number;
};

export type AudioVolumeChannel = "masterVolume" | "sfxVolume" | "uiVolume";

export const AUDIO_SETTINGS_STORAGE_KEY = "voxel-sandbox-audio-settings";
export const AUDIO_VOLUME_MIN_PERCENT = 0;
export const AUDIO_VOLUME_MAX_PERCENT = 100;
export const AUDIO_VOLUME_STEP_PERCENT = 1;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  masterVolume: 0.8,
  sfxVolume: 1,
  uiVolume: 0.9
};

export function normalizeAudioSettings(value: unknown, fallback = DEFAULT_AUDIO_SETTINGS): AudioSettings {
  const source = isAudioSettingsLike(value) ? value : {};

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    masterVolume: normalizeAudioVolume(source.masterVolume, fallback.masterVolume),
    sfxVolume: normalizeAudioVolume(source.sfxVolume, fallback.sfxVolume),
    uiVolume: normalizeAudioVolume(source.uiVolume, fallback.uiVolume)
  };
}

export function normalizeAudioVolume(value: unknown, fallback = 1): number {
  const numericValue = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numericValue)) return clamp(fallback, 0, 1);
  return clamp(numericValue, 0, 1);
}

export function normalizeAudioVolumePercent(value: unknown, fallbackPercent: number): number {
  const numericValue = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numericValue)) return clamp(Math.round(fallbackPercent), 0, 100);
  return clamp(Math.round(numericValue), 0, 100);
}

export function audioVolumeToPercent(volume: number): number {
  return normalizeAudioVolumePercent(volume * 100, DEFAULT_AUDIO_SETTINGS.masterVolume * 100);
}

export function audioVolumeFromPercent(percent: unknown, fallbackVolume: number): number {
  return normalizeAudioVolumePercent(percent, audioVolumeToPercent(fallbackVolume)) / 100;
}

export function formatAudioVolumePercent(volume: number): string {
  return `${audioVolumeToPercent(volume)}%`;
}

export function readAudioSettingsPreference(): AudioSettings {
  try {
    const raw = globalThis.localStorage?.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function writeAudioSettingsPreference(settings: AudioSettings): void {
  try {
    globalThis.localStorage?.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAudioSettings(settings)));
  } catch {
    // Storage can be unavailable in private windows or test environments.
    // Audio remains usable for the current session even when persistence fails.
  }
}

function isAudioSettingsLike(value: unknown): value is Partial<AudioSettings> {
  return typeof value === "object" && value !== null;
}
