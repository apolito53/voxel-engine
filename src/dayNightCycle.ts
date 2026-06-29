export const DAY_NIGHT_DEFAULT_TIME_OF_DAY = 0.42;
export const DAY_NIGHT_DEFAULT_CYCLE_SECONDS = 1200;
export const DAY_NIGHT_MIN_CYCLE_SECONDS = 300;
export const DAY_NIGHT_MAX_CYCLE_SECONDS = 3600;
export const DAY_NIGHT_FRAME_DELTA_CLAMP_SECONDS = 0.25;

const DAY_SECONDS = 24 * 60 * 60;
const TWO_PI = Math.PI * 2;

export type DayNightPhase = "midnight" | "night" | "dawn" | "day" | "dusk";

export type DayNightState = {
  readonly timeOfDay: number;
  readonly cycleEnabled: boolean;
  readonly cycleLengthSeconds: number;
};

export type SavedDayNightState = DayNightState & {
  readonly savedAt: number;
};

export type RgbColorTuple = readonly [number, number, number];

export type DayNightVisualState = {
  readonly timeOfDay: number;
  readonly clockLabel: string;
  readonly phase: DayNightPhase;
  readonly dayFactor: number;
  readonly nightFactor: number;
  readonly twilightFactor: number;
  readonly sunIntensityScale: number;
  readonly skyIntensityScale: number;
  readonly terrainOutdoorExposure: number;
  readonly terrainOutdoorTint: RgbColorTuple;
  readonly directionalLightColor: RgbColorTuple;
  readonly skyLightColor: RgbColorTuple;
  readonly groundLightColor: RgbColorTuple;
  readonly skyTopColor: RgbColorTuple;
  readonly skyHorizonColor: RgbColorTuple;
  readonly skyLowerColor: RgbColorTuple;
  readonly fogColor: RgbColorTuple;
  readonly horizonMatteColor: RgbColorTuple;
  readonly sunColor: RgbColorTuple;
  readonly moonColor: RgbColorTuple;
  readonly starIntensity: number;
  readonly cloudOpacity: number;
  readonly sunDiscIntensity: number;
  readonly moonDiscIntensity: number;
  readonly fogHex: string;
};

export type DayNightDebugSnapshot = {
  readonly clockLabel: string;
  readonly phase: DayNightPhase;
  readonly cycleLabel: string;
  readonly sunIntensityScale: number;
  readonly skyIntensityScale: number;
  readonly fogHex: string;
};

type AdvanceOptions = {
  readonly active: boolean;
  readonly unpaused: boolean;
  readonly visible: boolean;
};

export function createDefaultDayNightState(
  overrides: Partial<DayNightState> = {}
): DayNightState {
  return {
    timeOfDay: normalizeTimeOfDay(overrides.timeOfDay, DAY_NIGHT_DEFAULT_TIME_OF_DAY),
    cycleEnabled: overrides.cycleEnabled ?? true,
    cycleLengthSeconds: normalizeCycleLengthSeconds(
      overrides.cycleLengthSeconds,
      DAY_NIGHT_DEFAULT_CYCLE_SECONDS
    )
  };
}

export function normalizeDayNightState(
  value: unknown,
  fallback: DayNightState = createDefaultDayNightState()
): DayNightState {
  if (!isRecord(value)) return fallback;

  return createDefaultDayNightState({
    timeOfDay: normalizeTimeOfDay(value.timeOfDay, fallback.timeOfDay),
    cycleEnabled: typeof value.cycleEnabled === "boolean" ? value.cycleEnabled : fallback.cycleEnabled,
    cycleLengthSeconds: normalizeCycleLengthSeconds(value.cycleLengthSeconds, fallback.cycleLengthSeconds)
  });
}

export function createSavedDayNightState(
  state: DayNightState = createDefaultDayNightState(),
  savedAt = Date.now()
): SavedDayNightState {
  const normalized = normalizeDayNightState(state);
  return {
    ...normalized,
    savedAt
  };
}

export function normalizeSavedDayNightState(value: unknown): SavedDayNightState | null {
  if (!isRecord(value)) return null;

  return {
    ...normalizeDayNightState(value),
    savedAt: readFiniteNumber(value.savedAt, Date.now())
  };
}

export function advanceDayNightState(
  state: DayNightState,
  deltaSeconds: number,
  options: AdvanceOptions
): DayNightState {
  const normalized = normalizeDayNightState(state);
  if (!normalized.cycleEnabled || !options.active || !options.unpaused || !options.visible) {
    return normalized;
  }

  const clampedDelta = clampNumber(deltaSeconds, 0, DAY_NIGHT_FRAME_DELTA_CLAMP_SECONDS);
  if (clampedDelta <= 0) return normalized;

  return {
    ...normalized,
    timeOfDay: normalizeTimeOfDay(
      normalized.timeOfDay + clampedDelta / normalized.cycleLengthSeconds,
      normalized.timeOfDay
    )
  };
}

export function createDayNightVisualState(state: DayNightState): DayNightVisualState {
  const normalized = normalizeDayNightState(state);
  const timeOfDay = normalized.timeOfDay;
  const solarHeight = Math.sin((timeOfDay - 0.25) * TWO_PI);
  const dayFactor = smoothstep(-0.08, 0.25, solarHeight);
  const nightFactor = 1 - smoothstep(-0.28, 0.06, solarHeight);
  const twilightFactor = Math.max(0, 1 - Math.abs(solarHeight + 0.03) / 0.34) *
    (1 - Math.max(0, solarHeight - 0.22));

  const fogColor = normalizeColor(
    addWeightedColors([
      [hexToRgb(0x050916), nightFactor],
      [hexToRgb(0xd18f60), twilightFactor * 0.55],
      [hexToRgb(0xb6d8ee), dayFactor]
    ])
  );
  const skyTopColor = normalizeColor(
    addWeightedColors([
      [hexToRgb(0x020411), nightFactor],
      [hexToRgb(0x2a244a), twilightFactor * 0.8],
      [hexToRgb(0x49a9ff), dayFactor]
    ])
  );
  const skyHorizonColor = normalizeColor(
    addWeightedColors([
      [hexToRgb(0x0a1020), nightFactor],
      [hexToRgb(0xffb075), twilightFactor * 0.85],
      [hexToRgb(0xc6e5f5), dayFactor]
    ])
  );
  const skyLowerColor = normalizeColor(
    addWeightedColors([
      [hexToRgb(0x030612), nightFactor],
      [hexToRgb(0x8a5d58), twilightFactor * 0.45],
      [hexToRgb(0xa7d0e8), dayFactor]
    ])
  );

  return {
    timeOfDay,
    clockLabel: formatTimeOfDay(timeOfDay),
    phase: getDayNightPhase(timeOfDay),
    dayFactor,
    nightFactor,
    twilightFactor,
    sunIntensityScale: clampNumber(dayFactor + twilightFactor * 0.18, 0, 1.08),
    skyIntensityScale: clampNumber(0.045 + dayFactor * 0.95 + twilightFactor * 0.18, 0.045, 1.1),
    terrainOutdoorExposure: clampNumber(0.07 + dayFactor * 0.93 + twilightFactor * 0.1, 0.07, 1.06),
    terrainOutdoorTint: normalizeColor(
      addWeightedColors([
        [hexToRgb(0x42546b), nightFactor],
        [hexToRgb(0xffc58f), twilightFactor * 0.32],
        [hexToRgb(0xffffff), dayFactor]
      ])
    ),
    directionalLightColor: normalizeColor(
      addWeightedColors([
        [hexToRgb(0x6d7895), nightFactor],
        [hexToRgb(0xffb36e), twilightFactor * 0.7],
        [hexToRgb(0xfff0d0), dayFactor]
      ])
    ),
    skyLightColor: normalizeColor(
      addWeightedColors([
        [hexToRgb(0x26334f), nightFactor],
        [hexToRgb(0xd29777), twilightFactor * 0.45],
        [hexToRgb(0xb9d9ff), dayFactor]
      ])
    ),
    groundLightColor: normalizeColor(
      addWeightedColors([
        [hexToRgb(0x080d13), nightFactor],
        [hexToRgb(0x40332a), twilightFactor * 0.35],
        [hexToRgb(0x394228), dayFactor]
      ])
    ),
    skyTopColor,
    skyHorizonColor,
    skyLowerColor,
    fogColor,
    horizonMatteColor: fogColor,
    sunColor: normalizeColor(
      addWeightedColors([
        [hexToRgb(0xff9e45), twilightFactor * 0.5],
        [hexToRgb(0xfff4c0), Math.max(dayFactor, 0.05)]
      ])
    ),
    moonColor: hexToRgb(0xcbd8ff),
    starIntensity: clampNumber(nightFactor * 1.25 - twilightFactor * 0.25, 0, 1),
    cloudOpacity: clampNumber(0.22 + dayFactor * 0.42 + twilightFactor * 0.1, 0.18, 0.68),
    sunDiscIntensity: clampNumber(dayFactor * 1.35 + twilightFactor * 0.45, 0, 1.45),
    moonDiscIntensity: clampNumber(nightFactor * 0.65, 0, 0.75),
    fogHex: colorToHexLabel(fogColor)
  };
}

export function createDayNightDebugSnapshot(
  state: DayNightState,
  visual: DayNightVisualState
): DayNightDebugSnapshot {
  return {
    clockLabel: visual.clockLabel,
    phase: visual.phase,
    cycleLabel: state.cycleEnabled ? `${formatCycleLengthSeconds(state.cycleLengthSeconds)} cycle` : "paused",
    sunIntensityScale: visual.sunIntensityScale,
    skyIntensityScale: visual.skyIntensityScale,
    fogHex: visual.fogHex
  };
}

export function getDayNightPhase(timeOfDay: number): DayNightPhase {
  const normalized = normalizeTimeOfDay(timeOfDay);
  if (normalized < 0.08 || normalized >= 0.92) return "midnight";
  if (normalized < 0.19) return "night";
  if (normalized < 0.32) return "dawn";
  if (normalized < 0.68) return "day";
  if (normalized < 0.81) return "dusk";
  return "night";
}

export function normalizeTimeOfDay(value: unknown, fallback = DAY_NIGHT_DEFAULT_TIME_OF_DAY): number {
  const numberValue = readFiniteNumber(value, fallback);
  return ((numberValue % 1) + 1) % 1;
}

export function normalizeCycleLengthSeconds(
  value: unknown,
  fallback = DAY_NIGHT_DEFAULT_CYCLE_SECONDS
): number {
  return clampNumber(readFiniteNumber(value, fallback), DAY_NIGHT_MIN_CYCLE_SECONDS, DAY_NIGHT_MAX_CYCLE_SECONDS);
}

export function formatTimeOfDay(timeOfDay: number): string {
  const totalSeconds = Math.round(normalizeTimeOfDay(timeOfDay) * DAY_SECONDS) % DAY_SECONDS;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function formatCycleLengthSeconds(seconds: number): string {
  return `${Math.round(normalizeCycleLengthSeconds(seconds) / 60)} min`;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function addWeightedColors(colors: readonly (readonly [RgbColorTuple, number])[]): RgbColorTuple {
  let totalWeight = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const [color, weight] of colors) {
    const safeWeight = Math.max(0, weight);
    red += color[0] * safeWeight;
    green += color[1] * safeWeight;
    blue += color[2] * safeWeight;
    totalWeight += safeWeight;
  }

  if (totalWeight <= 0) return [0, 0, 0];
  return [red / totalWeight, green / totalWeight, blue / totalWeight];
}

function normalizeColor(color: RgbColorTuple): RgbColorTuple {
  return [
    clampNumber(color[0], 0, 1),
    clampNumber(color[1], 0, 1),
    clampNumber(color[2], 0, 1)
  ];
}

function hexToRgb(hex: number): RgbColorTuple {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255
  ];
}

function colorToHexLabel(color: RgbColorTuple): string {
  const red = Math.round(clampNumber(color[0], 0, 1) * 255);
  const green = Math.round(clampNumber(color[1], 0, 1) * 255);
  const blue = Math.round(clampNumber(color[2], 0, 1) * 255);
  const value = (red << 16) | (green << 8) | blue;
  return `#${value.toString(16).padStart(6, "0")}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
