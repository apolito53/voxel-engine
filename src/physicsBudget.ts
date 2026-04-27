export const PHYSICS_OBJECT_BUDGET_STORAGE_KEY = "voxel-physics-object-budget";
export const DEFAULT_PHYSICS_OBJECT_BUDGET = 96;
export const MIN_PHYSICS_OBJECT_BUDGET = 32;
export const MAX_PHYSICS_OBJECT_BUDGET = 256;
export const PHYSICS_OBJECT_BUDGET_STEP = 16;

export type PhysicsBudgetDirection = "decrease" | "increase";

export function normalizePhysicsObjectBudget(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_PHYSICS_OBJECT_BUDGET;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_PHYSICS_OBJECT_BUDGET;

  const steppedValue = Math.round(numericValue / PHYSICS_OBJECT_BUDGET_STEP) * PHYSICS_OBJECT_BUDGET_STEP;
  return clampPhysicsObjectBudget(steppedValue);
}

export function stepPhysicsObjectBudget(
  currentBudget: number,
  direction: PhysicsBudgetDirection
): number {
  const delta = direction === "increase"
    ? PHYSICS_OBJECT_BUDGET_STEP
    : -PHYSICS_OBJECT_BUDGET_STEP;
  return normalizePhysicsObjectBudget(currentBudget + delta);
}

export function readPhysicsObjectBudgetPreference(): number {
  try {
    return normalizePhysicsObjectBudget(localStorage.getItem(PHYSICS_OBJECT_BUDGET_STORAGE_KEY));
  } catch {
    return DEFAULT_PHYSICS_OBJECT_BUDGET;
  }
}

export function writePhysicsObjectBudgetPreference(budget: number): void {
  try {
    localStorage.setItem(PHYSICS_OBJECT_BUDGET_STORAGE_KEY, String(normalizePhysicsObjectBudget(budget)));
  } catch {
    // Local storage is just a convenience; budget changes still apply for this session.
  }
}

function clampPhysicsObjectBudget(value: number): number {
  return Math.min(MAX_PHYSICS_OBJECT_BUDGET, Math.max(MIN_PHYSICS_OBJECT_BUDGET, value));
}
