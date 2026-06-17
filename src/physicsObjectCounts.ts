// Physics cores and debris shards both live in the historical `toys` array, but
// they are not the same kind of budget pressure. Debris shards are visual/physics
// aftermath that can be shed aggressively; cores are player/Nova gameplay shots.
export const PHYSICS_CORE_ACTIVE_BUDGET = 128;

export type PhysicsObjectBudgetSample = {
  readonly isInstancedFragment: boolean;
  readonly isExpired: boolean;
};

export function isActiveDebrisPhysicsObject(toy: PhysicsObjectBudgetSample): boolean {
  return toy.isInstancedFragment && !toy.isExpired;
}

export function isActivePhysicsCore(toy: PhysicsObjectBudgetSample): boolean {
  return !toy.isInstancedFragment && !toy.isExpired;
}

export function countActiveDebrisPhysicsObjects(toys: Iterable<PhysicsObjectBudgetSample>): number {
  let count = 0;
  for (const toy of toys) {
    if (isActiveDebrisPhysicsObject(toy)) count += 1;
  }
  return count;
}

export function countActivePhysicsCores(toys: Iterable<PhysicsObjectBudgetSample>): number {
  let count = 0;
  for (const toy of toys) {
    if (isActivePhysicsCore(toy)) count += 1;
  }
  return count;
}

export function getDebrisPhysicsObjectsOverBudget(
  toys: Iterable<PhysicsObjectBudgetSample>,
  debrisBudget: number
): number {
  return Math.max(0, countActiveDebrisPhysicsObjects(toys) - Math.max(0, debrisBudget));
}

export function getPhysicsCoresOverBudget(
  toys: Iterable<PhysicsObjectBudgetSample>,
  coreBudget = PHYSICS_CORE_ACTIVE_BUDGET
): number {
  return Math.max(0, countActivePhysicsCores(toys) - Math.max(0, coreBudget));
}
