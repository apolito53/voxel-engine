import type { ItemAction } from "./items";

export type ClickFireMode = "semi" | "full";

export const DEFAULT_CLICK_FIRE_MODE: ClickFireMode = "semi";
export const FULL_AUTO_TERRAFORMER_INTERVAL_MS = 140;
export const FULL_AUTO_BUILD_INTERVAL_MS = 140;
export const FULL_AUTO_PHYSICS_CORE_INTERVAL_MS = 180;
export const FULL_AUTO_HITSCAN_CORE_INTERVAL_MS = 240;

export function normalizeClickFireMode(value: unknown, fallback: ClickFireMode = DEFAULT_CLICK_FIRE_MODE): ClickFireMode {
  if (value === "semi" || value === "full") return value;
  return fallback;
}

export function toggleClickFireMode(mode: ClickFireMode): ClickFireMode {
  return mode === "semi" ? "full" : "semi";
}

export function formatClickFireMode(mode: ClickFireMode): string {
  return mode === "semi" ? "Semi Auto" : "Full Auto";
}

export function formatClickFireModeShort(mode: ClickFireMode): string {
  return mode === "semi" ? "SEMI" : "FULL";
}

export function getFullAutoClickActionIntervalMs(action: ItemAction): number {
  switch (action.kind) {
    case "terrain:mine-block":
      return FULL_AUTO_TERRAFORMER_INTERVAL_MS;
    case "terrain:erase-block":
    case "terrain:place-block":
      return FULL_AUTO_BUILD_INTERVAL_MS;
    case "physics:throw-core":
      return FULL_AUTO_PHYSICS_CORE_INTERVAL_MS;
    case "physics:fire-hitscan-core":
      return FULL_AUTO_HITSCAN_CORE_INTERVAL_MS;
    case "none":
      return FULL_AUTO_TERRAFORMER_INTERVAL_MS;
  }
}
