import type { CodexPilotPlayScriptId } from "./codexPilot";
import { normalizeCodexPilotPlayScriptId } from "./codexPilot";
import type { VisualPilotRecordOptions } from "./visualTestRecorder";

export const DEFAULT_VISUAL_TEST_SCENARIO_ID = "debris-grounding";

export type VisualTestScenarioId = CodexPilotPlayScriptId;

export type VisualTestScenario = {
  readonly id: VisualTestScenarioId;
  readonly title: string;
  readonly description: string;
  readonly pilotScript: CodexPilotPlayScriptId;
  readonly tags: readonly string[];
  readonly aliases?: readonly string[];
  readonly defaultOptions: VisualPilotRecordOptions;
};

export type VisualTestScenarioSummary = Omit<VisualTestScenario, "defaultOptions"> & {
  readonly defaultOptions: Required<Pick<VisualPilotRecordOptions, "label" | "fps" | "frameSampleFps" | "maxSeconds" | "settleMs">>;
};

const VISUAL_TEST_SCENARIOS: readonly VisualTestScenario[] = [
  {
    id: "preview-parity",
    title: "Preview Parity",
    description: "Fresh Superflat wall, Core Aim Preview enabled, projectile and hitscan core impacts, and a short sweep for checking predicted target overlays against real damage.",
    pilotScript: "preview-parity",
    tags: ["preview", "physics-core", "hitscan", "partial-blocks"],
    aliases: ["preview", "parity", "aim-preview"],
    defaultOptions: {
      label: "scenario-preview-parity",
      fps: 30,
      frameSampleFps: 1,
      maxSeconds: 26,
      settleMs: 1200
    }
  },
  {
    id: "debris-grounding",
    title: "Debris Grounding",
    description: "Fresh Superflat wall, repeated projectile-core impacts, settle watch, and parallax sweep for debris clipping/ground contact review.",
    pilotScript: "debris-grounding",
    tags: ["debris", "physics-core", "grounding", "performance"],
    aliases: ["debris", "grounding", "debris-clip"],
    defaultOptions: {
      label: "scenario-debris-grounding",
      fps: 30,
      frameSampleFps: 1,
      maxSeconds: 28,
      settleMs: 1600
    }
  },
  {
    id: "hitscan-tunnel",
    title: "Hitscan Tunnel",
    description: "Fresh Superflat wall, ADS hitscan drilling burst, and side sweep for visual tunnel continuity and loose-debris clearing.",
    pilotScript: "hitscan-tunnel",
    tags: ["hitscan", "tunnel", "partial-blocks", "debris-clearing"],
    aliases: ["tunnel", "drill", "hitscan"],
    defaultOptions: {
      label: "scenario-hitscan-tunnel",
      fps: 30,
      frameSampleFps: 1,
      maxSeconds: 24,
      settleMs: 1200
    }
  },
  {
    id: "wall-range",
    title: "Wall Range",
    description: "Baseline wall target with projectile cores, ADS hitscan, and a short strafe check.",
    pilotScript: "wall-range",
    tags: ["baseline", "physics-core", "hitscan"],
    aliases: ["wall", "baseline"],
    defaultOptions: {
      label: "scenario-wall-range",
      fps: 30,
      frameSampleFps: 1,
      maxSeconds: 24,
      settleMs: 1200
    }
  },
  {
    id: "builder-fixture",
    title: "Builder Fixture",
    description: "Fresh Superflat builder staging shot with spawned platform, wall, and pillar fixtures for composition and admin-tool review.",
    pilotScript: "builder-fixture",
    tags: ["builder", "admin", "fixtures"],
    aliases: ["builder", "fixtures"],
    defaultOptions: {
      label: "scenario-builder-fixture",
      fps: 30,
      frameSampleFps: 1,
      maxSeconds: 18,
      settleMs: 900
    }
  },
  {
    id: "free-roam",
    title: "Free Roam",
    description: "Lightweight movement and hitscan burst in the current world, falling back to Superflat if no world is loaded.",
    pilotScript: "free-roam",
    tags: ["movement", "current-world", "smoke"],
    aliases: ["roam"],
    defaultOptions: {
      label: "scenario-free-roam",
      fps: 30,
      frameSampleFps: 1,
      maxSeconds: 16,
      settleMs: 700
    }
  }
];

export function listVisualTestScenarios(): readonly VisualTestScenarioSummary[] {
  return VISUAL_TEST_SCENARIOS.map(createVisualTestScenarioSummary);
}

export function getVisualTestScenario(id: unknown = DEFAULT_VISUAL_TEST_SCENARIO_ID): VisualTestScenario {
  const normalized = normalizeVisualTestScenarioId(id);
  return VISUAL_TEST_SCENARIOS.find((scenario) => scenario.id === normalized) ?? VISUAL_TEST_SCENARIOS[0];
}

export function normalizeVisualTestScenarioId(id: unknown): VisualTestScenarioId {
  if (typeof id !== "string") return DEFAULT_VISUAL_TEST_SCENARIO_ID;
  const normalized = id.trim().toLowerCase();
  for (const scenario of VISUAL_TEST_SCENARIOS) {
    if (scenario.id === normalized || scenario.aliases?.includes(normalized)) {
      return scenario.id;
    }
  }
  const pilotScript = normalizeCodexPilotPlayScriptId(normalized);
  return pilotScript === "wall-range" && normalized !== "wall-range"
    ? DEFAULT_VISUAL_TEST_SCENARIO_ID
    : pilotScript;
}

function createVisualTestScenarioSummary(scenario: VisualTestScenario): VisualTestScenarioSummary {
  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    pilotScript: scenario.pilotScript,
    tags: scenario.tags,
    aliases: scenario.aliases,
    defaultOptions: {
      label: scenario.defaultOptions.label ?? `scenario-${scenario.id}`,
      fps: scenario.defaultOptions.fps ?? 30,
      frameSampleFps: scenario.defaultOptions.frameSampleFps ?? 1,
      maxSeconds: scenario.defaultOptions.maxSeconds ?? 20,
      settleMs: scenario.defaultOptions.settleMs ?? 1200
    }
  };
}
