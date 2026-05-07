import { PHYSICS_OBJECT_BUDGET_STEP } from "./physicsBudget";

export const MIN_RIGID_DEBRIS_BODY_BUDGET = 32;
export const MAX_RIGID_DEBRIS_BODY_BUDGET = 768;
const RIGID_DEBRIS_BODY_BUDGET_RATIO = 0.75;

export function getRigidDebrisBodyBudget(physicsObjectBudget: number): number {
  if (!Number.isFinite(physicsObjectBudget)) return MIN_RIGID_DEBRIS_BODY_BUDGET;

  // Rapier cuboids are much more CPU-expensive than the old cheap toy entries,
  // so a 4096 "physics objects" stress budget should not become 4096 active
  // rigid-body debris cubes. Keep a generous slice, then hard-cap the solver.
  const proportionalBudget = Math.floor(
    (physicsObjectBudget * RIGID_DEBRIS_BODY_BUDGET_RATIO) /
    PHYSICS_OBJECT_BUDGET_STEP
  ) * PHYSICS_OBJECT_BUDGET_STEP;
  return Math.min(
    MAX_RIGID_DEBRIS_BODY_BUDGET,
    Math.max(MIN_RIGID_DEBRIS_BODY_BUDGET, proportionalBudget)
  );
}
