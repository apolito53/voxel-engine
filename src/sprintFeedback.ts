export const BASE_CAMERA_FOV = 75;
export const SPRINT_FOV_MULTIPLIER = 1.15;
export const ADS_FOV_MULTIPLIER = 0.85;
export const SPRINT_FOV_RESPONSE = 10;
export const SPRINT_FEEDBACK_ACTIVE_CLASS = "is-active";

export function getSprintFeedbackTargetFov(active: boolean): number {
  return active ? BASE_CAMERA_FOV * SPRINT_FOV_MULTIPLIER : BASE_CAMERA_FOV;
}

export function getPlayerCameraTargetFov(sprintActive: boolean, adsActive: boolean): number {
  const sprintFov = getSprintFeedbackTargetFov(sprintActive);
  return adsActive ? sprintFov * ADS_FOV_MULTIPLIER : sprintFov;
}

export function smoothSprintFeedbackFov(currentFov: number, targetFov: number, delta: number): number {
  if (delta <= 0 || currentFov === targetFov) return currentFov;

  const blend = 1 - Math.exp(-SPRINT_FOV_RESPONSE * delta);
  const nextFov = currentFov + (targetFov - currentFov) * blend;
  return Math.abs(targetFov - nextFov) < 0.01 ? targetFov : nextFov;
}
