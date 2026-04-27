import type { QualityPresetId } from "./qualityPresets";

// Budgets are stored per quality preset so Super Ultra can be outrageous
// without dragging potato mode into the furnace on the next launch.
export const PHYSICS_OBJECT_BUDGET_STORAGE_PREFIX = "voxel-physics-object-budget:";
export const DEFAULT_PHYSICS_OBJECT_BUDGET = 96;
export const MIN_PHYSICS_OBJECT_BUDGET = 32;
export const MAX_PHYSICS_OBJECT_BUDGET = 1024;
export const PHYSICS_OBJECT_BUDGET_STEP = 16;

export type PhysicsBudgetDirection = "decrease" | "increase";

export function normalizePhysicsObjectBudget(
  value: unknown,
  fallbackBudget = DEFAULT_PHYSICS_OBJECT_BUDGET
): number {
  if (value === null || value === undefined || value === "") {
    return normalizeFallbackBudget(fallbackBudget);
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return normalizeFallbackBudget(fallbackBudget);

  const steppedValue = Math.round(numericValue / PHYSICS_OBJECT_BUDGET_STEP) * PHYSICS_OBJECT_BUDGET_STEP;
  return clampPhysicsObjectBudget(steppedValue);
}

export function stepPhysicsObjectBudget(
  currentBudget: number,
  direction: PhysicsBudgetDirection,
  fallbackBudget = DEFAULT_PHYSICS_OBJECT_BUDGET
): number {
  const delta = direction === "increase"
    ? PHYSICS_OBJECT_BUDGET_STEP
    : -PHYSICS_OBJECT_BUDGET_STEP;
  return normalizePhysicsObjectBudget(currentBudget + delta, fallbackBudget);
}

export function readPhysicsObjectBudgetPreference(
  presetId: QualityPresetId,
  fallbackBudget = DEFAULT_PHYSICS_OBJECT_BUDGET
): number {
  try {
    return normalizePhysicsObjectBudget(
      localStorage.getItem(getPhysicsObjectBudgetStorageKey(presetId)),
      fallbackBudget
    );
  } catch {
    return normalizeFallbackBudget(fallbackBudget);
  }
}

export function writePhysicsObjectBudgetPreference(
  presetId: QualityPresetId,
  budget: number,
  fallbackBudget = DEFAULT_PHYSICS_OBJECT_BUDGET
): void {
  try {
    localStorage.setItem(
      getPhysicsObjectBudgetStorageKey(presetId),
      String(normalizePhysicsObjectBudget(budget, fallbackBudget))
    );
  } catch {
    // Local storage is just a convenience; budget changes still apply for this session.
  }
}

function getPhysicsObjectBudgetStorageKey(presetId: QualityPresetId): string {
  return `${PHYSICS_OBJECT_BUDGET_STORAGE_PREFIX}${presetId}`;
}

function normalizeFallbackBudget(fallbackBudget: number): number {
  if (!Number.isFinite(fallbackBudget)) return DEFAULT_PHYSICS_OBJECT_BUDGET;

  // The fallback comes from preset data, but still run it through the same
  // safety rails so bad future tuning cannot bypass the UI limits.
  const steppedFallback = Math.round(fallbackBudget / PHYSICS_OBJECT_BUDGET_STEP) * PHYSICS_OBJECT_BUDGET_STEP;
  return clampPhysicsObjectBudget(steppedFallback);
}

function clampPhysicsObjectBudget(value: number): number {
  return Math.min(MAX_PHYSICS_OBJECT_BUDGET, Math.max(MIN_PHYSICS_OBJECT_BUDGET, value));
}
