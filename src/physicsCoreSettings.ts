export const PHYSICS_CORE_SETTINGS_STORAGE_KEY = "voxel-physics-core-settings";
export const PHYSICS_CORE_BASE_RADIUS = 0.35;
export const PHYSICS_CORE_SIZE_MIN_PERCENT = 10;
export const PHYSICS_CORE_SIZE_MAX_PERCENT = 120;
export const PHYSICS_CORE_SIZE_STEP_PERCENT = 5;
export const PHYSICS_CORE_DEFAULT_SIZE_PERCENT = 30;
export const PHYSICS_CORE_VELOCITY_MIN_PERCENT = 60;
export const PHYSICS_CORE_VELOCITY_MAX_PERCENT = 500;
export const PHYSICS_CORE_VELOCITY_STEP_PERCENT = 5;
export const PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT = 140;
export const PHYSICS_CORE_BOUNCE_MIN_COUNT = 1;
export const PHYSICS_CORE_BOUNCE_MAX_COUNT = 12;
export const PHYSICS_CORE_BOUNCE_STEP_COUNT = 1;
export const PHYSICS_CORE_DEFAULT_BOUNCE_COUNT = 1;
export const PHYSICS_CORE_HUE_MIN_DEGREES = 0;
export const PHYSICS_CORE_HUE_MAX_DEGREES = 360;
export const PHYSICS_CORE_HUE_STEP_DEGREES = 5;
export const PHYSICS_CORE_DEFAULT_HUE_DEGREES = 350;
export const PHYSICS_CORE_DEFAULT_TRAIL_ENABLED = true;

export type PhysicsCoreSettings = {
  readonly sizePercent: number;
  readonly velocityPercent: number;
  readonly terrainBounceCount: number;
  readonly hueDegrees: number;
  readonly trailEnabled: boolean;
};

export const DEFAULT_PHYSICS_CORE_SETTINGS: PhysicsCoreSettings = {
  sizePercent: PHYSICS_CORE_DEFAULT_SIZE_PERCENT,
  velocityPercent: PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT,
  terrainBounceCount: PHYSICS_CORE_DEFAULT_BOUNCE_COUNT,
  hueDegrees: PHYSICS_CORE_DEFAULT_HUE_DEGREES,
  trailEnabled: PHYSICS_CORE_DEFAULT_TRAIL_ENABLED
};

export function normalizePhysicsCoreSettings(
  settings: Partial<PhysicsCoreSettings>,
  fallback: PhysicsCoreSettings = DEFAULT_PHYSICS_CORE_SETTINGS
): PhysicsCoreSettings {
  return {
    sizePercent: normalizePhysicsCoreSizePercent(settings.sizePercent, fallback.sizePercent),
    velocityPercent: normalizePhysicsCoreVelocityPercent(settings.velocityPercent, fallback.velocityPercent),
    terrainBounceCount: normalizePhysicsCoreBounceCount(settings.terrainBounceCount, fallback.terrainBounceCount),
    hueDegrees: normalizePhysicsCoreHueDegrees(settings.hueDegrees, fallback.hueDegrees),
    trailEnabled: typeof settings.trailEnabled === "boolean" ? settings.trailEnabled : fallback.trailEnabled
  };
}

export function normalizePhysicsCoreSizePercent(
  value: unknown,
  fallback = PHYSICS_CORE_DEFAULT_SIZE_PERCENT
): number {
  return normalizeSteppedPercent(
    value,
    fallback,
    PHYSICS_CORE_SIZE_MIN_PERCENT,
    PHYSICS_CORE_SIZE_MAX_PERCENT,
    PHYSICS_CORE_SIZE_STEP_PERCENT
  );
}

export function normalizePhysicsCoreVelocityPercent(
  value: unknown,
  fallback = PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT
): number {
  return normalizeSteppedPercent(
    value,
    fallback,
    PHYSICS_CORE_VELOCITY_MIN_PERCENT,
    PHYSICS_CORE_VELOCITY_MAX_PERCENT,
    PHYSICS_CORE_VELOCITY_STEP_PERCENT
  );
}

export function normalizePhysicsCoreBounceCount(
  value: unknown,
  fallback = PHYSICS_CORE_DEFAULT_BOUNCE_COUNT
): number {
  return normalizeSteppedPercent(
    value,
    fallback,
    PHYSICS_CORE_BOUNCE_MIN_COUNT,
    PHYSICS_CORE_BOUNCE_MAX_COUNT,
    PHYSICS_CORE_BOUNCE_STEP_COUNT
  );
}

export function normalizePhysicsCoreHueDegrees(
  value: unknown,
  fallback = PHYSICS_CORE_DEFAULT_HUE_DEGREES
): number {
  return normalizeSteppedPercent(
    value,
    fallback,
    PHYSICS_CORE_HUE_MIN_DEGREES,
    PHYSICS_CORE_HUE_MAX_DEGREES,
    PHYSICS_CORE_HUE_STEP_DEGREES
  );
}

export function getPhysicsCoreRadius(settings: PhysicsCoreSettings): number {
  return PHYSICS_CORE_BASE_RADIUS * (normalizePhysicsCoreSizePercent(settings.sizePercent) / 100);
}

export function getPhysicsCoreVelocityMultiplier(settings: PhysicsCoreSettings): number {
  return normalizePhysicsCoreVelocityPercent(settings.velocityPercent) / 100;
}

export function formatPhysicsCorePercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatPhysicsCoreBounceCount(value: number): string {
  const bounceCount = normalizePhysicsCoreBounceCount(value);
  return `${bounceCount} bounce${bounceCount === 1 ? "" : "s"}`;
}

export function formatPhysicsCoreHue(value: number): string {
  return `${Math.round(normalizePhysicsCoreHueDegrees(value))}°`;
}

export function readPhysicsCoreSettingsPreference(): PhysicsCoreSettings {
  try {
    const stored = globalThis.localStorage?.getItem(PHYSICS_CORE_SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_PHYSICS_CORE_SETTINGS;
    return normalizePhysicsCoreSettings(JSON.parse(stored) as Partial<PhysicsCoreSettings>);
  } catch {
    return DEFAULT_PHYSICS_CORE_SETTINGS;
  }
}

export function writePhysicsCoreSettingsPreference(settings: PhysicsCoreSettings): void {
  try {
    globalThis.localStorage?.setItem(
      PHYSICS_CORE_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizePhysicsCoreSettings(settings))
    );
  } catch {
    // Local storage is a convenience; current-session tuning still applies.
  }
}

function normalizeSteppedPercent(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  step: number
): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : fallback;
  const steppedValue = Math.round(safeValue / step) * step;
  return Math.min(max, Math.max(min, steppedValue));
}
