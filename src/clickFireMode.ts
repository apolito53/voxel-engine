export type ClickFireMode = "semi" | "full";

export const DEFAULT_CLICK_FIRE_MODE: ClickFireMode = "semi";

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
