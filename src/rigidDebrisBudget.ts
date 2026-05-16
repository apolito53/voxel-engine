import { PHYSICS_OBJECT_BUDGET_STEP } from "./physicsBudget";

export const MIN_RIGID_DEBRIS_BODY_BUDGET = 32;
export const MAX_RIGID_DEBRIS_BODY_BUDGET = 768;
export const GROUND_DEBRIS_BUDGET_STORAGE_KEY = "voxel-ground-debris-budget";
export const DEFAULT_GROUND_DEBRIS_BUDGET = 128;
export const MIN_GROUND_DEBRIS_BUDGET = 0;
export const MAX_GROUND_DEBRIS_BUDGET = MAX_RIGID_DEBRIS_BODY_BUDGET;
export const GROUND_DEBRIS_BUDGET_STEP = PHYSICS_OBJECT_BUDGET_STEP;
const RIGID_DEBRIS_BODY_BUDGET_RATIO = 0.75;

export function getRigidDebrisBodyBudget(physicsObjectBudget: number): number {
  if (!Number.isFinite(physicsObjectBudget)) return MIN_RIGID_DEBRIS_BODY_BUDGET;

  // Rapier cuboids are much more CPU-expensive than the old cheap toy entries,
  // so a 4096 "physics objects" stress budget should not become 4096 active
  // rigid-body debris shards. Keep a generous slice, then hard-cap the solver.
  const proportionalBudget = Math.floor(
    (physicsObjectBudget * RIGID_DEBRIS_BODY_BUDGET_RATIO) /
    PHYSICS_OBJECT_BUDGET_STEP
  ) * PHYSICS_OBJECT_BUDGET_STEP;
  return Math.min(
    MAX_RIGID_DEBRIS_BODY_BUDGET,
    Math.max(MIN_RIGID_DEBRIS_BODY_BUDGET, proportionalBudget)
  );
}

export function getEffectiveRigidDebrisBodyBudget(
  physicsObjectBudget: number,
  groundDebrisBudget: number
): number {
  return Math.min(
    getRigidDebrisBodyBudget(physicsObjectBudget),
    normalizeGroundDebrisBudget(groundDebrisBudget)
  );
}

export function normalizeGroundDebrisBudget(
  value: unknown,
  fallbackBudget = DEFAULT_GROUND_DEBRIS_BUDGET
): number {
  if (value === null || value === undefined || value === "") {
    return normalizeGroundDebrisBudgetFallback(fallbackBudget);
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return normalizeGroundDebrisBudgetFallback(fallbackBudget);

  const steppedValue = Math.round(numericValue / GROUND_DEBRIS_BUDGET_STEP) * GROUND_DEBRIS_BUDGET_STEP;
  return clampGroundDebrisBudget(steppedValue);
}

export function readGroundDebrisBudgetPreference(): number {
  try {
    return normalizeGroundDebrisBudget(localStorage.getItem(GROUND_DEBRIS_BUDGET_STORAGE_KEY));
  } catch {
    return DEFAULT_GROUND_DEBRIS_BUDGET;
  }
}

export function writeGroundDebrisBudgetPreference(budget: number): void {
  try {
    localStorage.setItem(GROUND_DEBRIS_BUDGET_STORAGE_KEY, String(normalizeGroundDebrisBudget(budget)));
  } catch {
    // Local storage is only a convenience; the current session value still applies.
  }
}

export function formatGroundDebrisBudget(budget: number): string {
  const normalizedBudget = normalizeGroundDebrisBudget(budget);
  return `${normalizedBudget} ${normalizedBudget === 1 ? "shard" : "shards"}`;
}

function normalizeGroundDebrisBudgetFallback(fallbackBudget: number): number {
  if (!Number.isFinite(fallbackBudget)) return DEFAULT_GROUND_DEBRIS_BUDGET;
  const steppedFallback = Math.round(fallbackBudget / GROUND_DEBRIS_BUDGET_STEP) * GROUND_DEBRIS_BUDGET_STEP;
  return clampGroundDebrisBudget(steppedFallback);
}

function clampGroundDebrisBudget(value: number): number {
  return Math.min(MAX_GROUND_DEBRIS_BUDGET, Math.max(MIN_GROUND_DEBRIS_BUDGET, value));
}
