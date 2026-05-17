import { PHYSICS_OBJECT_BUDGET_STEP } from "./physicsBudget";
import {
  MIN_RIGID_DEBRIS_BODY_BUDGET
} from "./rigidDebrisBudget";

export type DebrisPerformancePressureState = {
  readonly stress: number;
  readonly nominalRigidDebrisBodyBudget: number;
  readonly effectiveRigidDebrisBodyBudget: number;
  readonly lastObservedFps: number;
};

export type DebrisPerformancePressureInput = {
  readonly deltaSeconds: number;
  readonly observedFps: number;
  readonly nominalRigidDebrisBodyBudget: number;
  readonly activeRigidDebrisBodies: number;
  readonly fragmentInstances: number;
  readonly partialMeshTriangles: number;
};

export const DEBRIS_PRESSURE_TARGET_FPS = 60;
export const DEBRIS_PRESSURE_RECOVERY_FPS = 66;
export const DEBRIS_PRESSURE_LOAD_START_RATIO = 0.7;
export const DEBRIS_PRESSURE_MIN_BUDGET_RATIO = 1 / 3;
const DEBRIS_PRESSURE_PARTIAL_TRIANGLE_START = 12000;
const DEBRIS_PRESSURE_RISE_PER_SECOND = 2.4;
const DEBRIS_PRESSURE_RECOVERY_PER_SECOND = 0.45;

export function createDebrisPerformancePressureState(
  nominalRigidDebrisBodyBudget = MIN_RIGID_DEBRIS_BODY_BUDGET
): DebrisPerformancePressureState {
  const normalizedNominalBudget = normalizePositiveBudget(nominalRigidDebrisBodyBudget);
  return {
    stress: 0,
    nominalRigidDebrisBodyBudget: normalizedNominalBudget,
    effectiveRigidDebrisBodyBudget: normalizedNominalBudget,
    lastObservedFps: Number.POSITIVE_INFINITY
  };
}

export function updateDebrisPerformancePressureState(
  previous: DebrisPerformancePressureState,
  input: DebrisPerformancePressureInput
): DebrisPerformancePressureState {
  const deltaSeconds = clamp(input.deltaSeconds, 0, 0.25);
  const observedFps = Number.isFinite(input.observedFps)
    ? input.observedFps
    : Number.POSITIVE_INFINITY;
  const nominalBudget = normalizePositiveBudget(input.nominalRigidDebrisBodyBudget);
  const loadRatio = Math.max(input.activeRigidDebrisBodies, input.fragmentInstances) / Math.max(1, nominalBudget);
  const partialMeshPressure =
    loadRatio >= 0.45 && input.partialMeshTriangles >= DEBRIS_PRESSURE_PARTIAL_TRIANGLE_START ? 0.2 : 0;
  const fpsDeficit = Math.max(0, (DEBRIS_PRESSURE_TARGET_FPS - observedFps) / DEBRIS_PRESSURE_TARGET_FPS);
  const debrisIsLoaded = loadRatio >= DEBRIS_PRESSURE_LOAD_START_RATIO || input.activeRigidDebrisBodies >= nominalBudget;
  let nextStress = previous.stress;

  if (fpsDeficit > 0 && (debrisIsLoaded || partialMeshPressure > 0)) {
    const lowFpsSeverity = clamp(fpsDeficit * 2.5 + partialMeshPressure, 0.15, 1.5);
    const loadedSeverity = clamp((loadRatio - DEBRIS_PRESSURE_LOAD_START_RATIO) * 1.4, 0, 0.75);
    nextStress += deltaSeconds * DEBRIS_PRESSURE_RISE_PER_SECOND * (lowFpsSeverity + loadedSeverity);
  } else if (observedFps >= DEBRIS_PRESSURE_RECOVERY_FPS || input.activeRigidDebrisBodies < nominalBudget * 0.45) {
    nextStress -= deltaSeconds * DEBRIS_PRESSURE_RECOVERY_PER_SECOND;
  } else if (observedFps >= DEBRIS_PRESSURE_TARGET_FPS) {
    nextStress -= deltaSeconds * DEBRIS_PRESSURE_RECOVERY_PER_SECOND * 0.35;
  }

  const stress = clamp(nextStress, 0, 1);
  return {
    stress,
    nominalRigidDebrisBodyBudget: nominalBudget,
    effectiveRigidDebrisBodyBudget: getDebrisPressureEffectiveRigidDebrisBodyBudget(nominalBudget, stress),
    lastObservedFps: observedFps
  };
}

export function getDebrisPressureEffectiveRigidDebrisBodyBudget(
  nominalRigidDebrisBodyBudget: number,
  stress: number
): number {
  const nominalBudget = normalizePositiveBudget(nominalRigidDebrisBodyBudget);
  const clampedStress = clamp(stress, 0, 1);
  if (clampedStress <= 0) return nominalBudget;

  const pressureRatio = 1 - (1 - DEBRIS_PRESSURE_MIN_BUDGET_RATIO) * clampedStress;
  const steppedBudget = Math.floor(((nominalBudget * pressureRatio) + 0.000001) / PHYSICS_OBJECT_BUDGET_STEP) *
    PHYSICS_OBJECT_BUDGET_STEP;
  const pressureBudget = Math.min(nominalBudget, Math.max(MIN_RIGID_DEBRIS_BODY_BUDGET, steppedBudget));

  // A tiny amount of stress should still do visible work once the logs prove
  // the debris cap is participating. Otherwise the governor appears inert for
  // a while because step rounding keeps returning the same budget.
  if (pressureBudget >= nominalBudget && nominalBudget > MIN_RIGID_DEBRIS_BODY_BUDGET) {
    return Math.max(MIN_RIGID_DEBRIS_BODY_BUDGET, nominalBudget - PHYSICS_OBJECT_BUDGET_STEP);
  }

  return pressureBudget;
}

function normalizePositiveBudget(value: number): number {
  if (!Number.isFinite(value)) return MIN_RIGID_DEBRIS_BODY_BUDGET;
  return Math.max(MIN_RIGID_DEBRIS_BODY_BUDGET, Math.floor(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
