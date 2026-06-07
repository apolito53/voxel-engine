export const PARTIAL_MESH_RENDER_LOW_FPS_THRESHOLD = 55;
export const PARTIAL_MESH_RENDER_RECOVERY_FPS = 58;
export const PARTIAL_MESH_RENDER_PRESSURE_TRIANGLES = 30000;
export const PARTIAL_MESH_RENDER_RECOVERY_TRIANGLES = 15000;
export const PARTIAL_MESH_RENDER_MIN_BUDGET = 16;
export const PARTIAL_MESH_RENDER_MIN_BUDGET_RATIO = 0.6;

const PARTIAL_MESH_RENDER_PRESSURE_RISE_PER_SECOND = 1.5;
const PARTIAL_MESH_RENDER_PRESSURE_DECAY_PER_SECOND = 0.75;

export type PartialMeshRenderPressureState = {
  readonly stress: number;
  readonly nominalRegionBudget: number;
  readonly effectiveRegionBudget: number;
};

export type PartialMeshRenderPressureInput = {
  readonly deltaSeconds: number;
  readonly observedFps: number;
  readonly nominalRegionBudget: number;
  readonly visibleTriangles: number;
};

export function createPartialMeshRenderPressureState(
  nominalRegionBudget: number
): PartialMeshRenderPressureState {
  const normalizedBudget = normalizeRegionBudget(nominalRegionBudget);
  return {
    stress: 0,
    nominalRegionBudget: normalizedBudget,
    effectiveRegionBudget: normalizedBudget
  };
}

export function getPartialMeshPressureEffectiveRegionBudget(
  nominalRegionBudget: number,
  stress: number
): number {
  const normalizedBudget = normalizeRegionBudget(nominalRegionBudget);
  if (normalizedBudget <= 0) return 0;

  const normalizedStress = clamp01(stress);
  const budgetRatio = 1 - normalizedStress * (1 - PARTIAL_MESH_RENDER_MIN_BUDGET_RATIO);
  const pressureFloor = Math.min(normalizedBudget, PARTIAL_MESH_RENDER_MIN_BUDGET);
  return Math.max(
    pressureFloor,
    Math.min(normalizedBudget, Math.round(normalizedBudget * budgetRatio))
  );
}

export function updatePartialMeshRenderPressureState(
  state: PartialMeshRenderPressureState,
  input: PartialMeshRenderPressureInput
): PartialMeshRenderPressureState {
  const nominalRegionBudget = normalizeRegionBudget(input.nominalRegionBudget);
  const deltaSeconds = normalizeDeltaSeconds(input.deltaSeconds);
  const underPressure =
    input.visibleTriangles >= PARTIAL_MESH_RENDER_PRESSURE_TRIANGLES &&
    input.observedFps < PARTIAL_MESH_RENDER_LOW_FPS_THRESHOLD;
  const recovering =
    input.visibleTriangles <= PARTIAL_MESH_RENDER_RECOVERY_TRIANGLES ||
    input.observedFps >= PARTIAL_MESH_RENDER_RECOVERY_FPS;

  // This governor intentionally reacts after a bad frame and makes the next
  // one cheaper. It does not try to delete terrain or rebuild meshes; it only
  // lowers how many existing partial-region meshes may draw near the camera.
  const nextStress = underPressure
    ? clamp01(state.stress + deltaSeconds * PARTIAL_MESH_RENDER_PRESSURE_RISE_PER_SECOND)
    : recovering
      ? clamp01(state.stress - deltaSeconds * PARTIAL_MESH_RENDER_PRESSURE_DECAY_PER_SECOND)
      : state.stress;

  return {
    stress: nextStress,
    nominalRegionBudget,
    effectiveRegionBudget: getPartialMeshPressureEffectiveRegionBudget(nominalRegionBudget, nextStress)
  };
}

function normalizeRegionBudget(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeDeltaSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
