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

export type PhysicsCoreSettings = {
  readonly sizePercent: number;
  readonly velocityPercent: number;
};

export const DEFAULT_PHYSICS_CORE_SETTINGS: PhysicsCoreSettings = {
  sizePercent: PHYSICS_CORE_DEFAULT_SIZE_PERCENT,
  velocityPercent: PHYSICS_CORE_DEFAULT_VELOCITY_PERCENT
};

export function normalizePhysicsCoreSettings(
  settings: Partial<PhysicsCoreSettings>,
  fallback: PhysicsCoreSettings = DEFAULT_PHYSICS_CORE_SETTINGS
): PhysicsCoreSettings {
  return {
    sizePercent: normalizePhysicsCoreSizePercent(settings.sizePercent, fallback.sizePercent),
    velocityPercent: normalizePhysicsCoreVelocityPercent(settings.velocityPercent, fallback.velocityPercent)
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

export function getPhysicsCoreRadius(settings: PhysicsCoreSettings): number {
  return PHYSICS_CORE_BASE_RADIUS * (normalizePhysicsCoreSizePercent(settings.sizePercent) / 100);
}

export function getPhysicsCoreVelocityMultiplier(settings: PhysicsCoreSettings): number {
  return normalizePhysicsCoreVelocityPercent(settings.velocityPercent) / 100;
}

export function formatPhysicsCorePercent(value: number): string {
  return `${Math.round(value)}%`;
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
