export const GROUND_DEBRIS_LIFETIME_STORAGE_KEY = "voxel-ground-debris-lifetime";
export const DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS = 12;
export const FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS = -1;
export const MIN_GROUND_DEBRIS_LIFETIME_SECONDS = 0;
export const MAX_GROUND_DEBRIS_LIFETIME_SECONDS = 60;
export const GROUND_DEBRIS_LIFETIME_STEP_SECONDS = 1;
export const GROUND_DEBRIS_CLEANUP_BURST_GRACE_SECONDS = 0.9;

export function normalizeGroundDebrisLifetime(
  value: unknown,
  fallbackSeconds = DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS
): number {
  if (value === null || value === undefined || value === "") {
    return normalizeGroundDebrisLifetimeFallback(fallbackSeconds);
  }

  if (value === "forever") return FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS;

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return normalizeGroundDebrisLifetimeFallback(fallbackSeconds);
  }
  if (numericValue === FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS) {
    return FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS;
  }

  const steppedValue = Math.round(numericValue / GROUND_DEBRIS_LIFETIME_STEP_SECONDS) *
    GROUND_DEBRIS_LIFETIME_STEP_SECONDS;
  return clampGroundDebrisLifetime(steppedValue);
}

export function readGroundDebrisLifetimePreference(): number {
  try {
    return normalizeGroundDebrisLifetime(localStorage.getItem(GROUND_DEBRIS_LIFETIME_STORAGE_KEY));
  } catch {
    return DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS;
  }
}

export function writeGroundDebrisLifetimePreference(lifetimeSeconds: number): void {
  try {
    localStorage.setItem(
      GROUND_DEBRIS_LIFETIME_STORAGE_KEY,
      String(normalizeGroundDebrisLifetime(lifetimeSeconds))
    );
  } catch {
    // Local storage is only a convenience; the current session value still applies.
  }
}

export function getEffectiveGroundDebrisLifetimeSeconds(lifetimeSeconds: number): number | null {
  const normalizedLifetime = normalizeGroundDebrisLifetime(lifetimeSeconds);
  return normalizedLifetime === FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS
    ? null
    : normalizedLifetime;
}

export function formatGroundDebrisLifetime(lifetimeSeconds: number): string {
  const normalizedLifetime = normalizeGroundDebrisLifetime(lifetimeSeconds);
  if (normalizedLifetime === FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS) return "Forever";
  return `${normalizedLifetime}s`;
}

function normalizeGroundDebrisLifetimeFallback(fallbackSeconds: number): number {
  if (!Number.isFinite(fallbackSeconds)) return DEFAULT_GROUND_DEBRIS_LIFETIME_SECONDS;
  if (fallbackSeconds === FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS) {
    return FOREVER_GROUND_DEBRIS_LIFETIME_SECONDS;
  }
  const steppedFallback = Math.round(fallbackSeconds / GROUND_DEBRIS_LIFETIME_STEP_SECONDS) *
    GROUND_DEBRIS_LIFETIME_STEP_SECONDS;
  return clampGroundDebrisLifetime(steppedFallback);
}

function clampGroundDebrisLifetime(value: number): number {
  return Math.min(
    MAX_GROUND_DEBRIS_LIFETIME_SECONDS,
    Math.max(MIN_GROUND_DEBRIS_LIFETIME_SECONDS, value)
  );
}
