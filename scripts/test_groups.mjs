// Each registered case has one primary owner. Select several groups when a
// change crosses these boundaries; job payloads and render consumers stay with
// their system rather than being swept into the shared worker-pool group.
export const TEST_GROUPS = {
  world: {
    description: "Terrain generation, chunks, meshing, streaming, spatial queries, and saves",
    prefixes: [
      "world ", "chunk generation ", "chunk mesh ", "chunk meshing ",
      "chunk greedy meshing ", "chunk streaming ", "chunk top-column ", "chunk storage ",
      "terrain generation ", "classic terrain ", "seeded terrain ",
      "floating-islands terrain ", "expanded world height ", "varied ", "superflat terrain ",
      "legacy varied-world ", "legacy saved worlds ", "raycast ",
      "block color ", "block texture ", "partial terrain edits coalesce into the existing pending chunk save"
    ]
  },
  lighting: {
    description: "Lamp fields and proxies, sky, clouds, day/night, shadows, and sun glare",
    prefixes: [
      "voxel block light ", "instanced debris shader ", "mesh-time block light ",
      "block-light build ", "lamp ", "stale block-light ", "opaque partial transitions ",
      "cross-chunk lamp ", "local light ", "accepted block-light ",
      "cloud", "day-night ", "horizon matte ", "procedural sky ", "sky disk, ",
      "baked voxel face shading ", "chunk sky exposure ", "moving shadow depth ",
      "terrain-only shadow depth ", "directional shadow ", "custom shadows ", "sun "
    ]
  },
  "partial-terrain": {
    description: "Terraformer, damage lattices, partial geometry/cavity light, and impact craters",
    prefixes: [
      "block damage ", "block material rules ", "terraformer ", "partial block ",
      "partial terrain separates ", "partial terrain mesh ", "partial mesh ",
      "damage brush", "visible partial apertures ", "partial cavity ",
      "wrinkled cavity ", "neighboring partial apertures ", "diagonally touching partial cavities ",
      "chunk-edge partial apertures ", "closed partial cavities ", "tiny fast partial-block ",
      "tiny fast off-center ", "large fast partial-block ", "tiny slow partial-block ",
      "fractured terrain ", "impact crater ", "destroyed impact craters "
    ]
  },
  player: {
    description: "Movement, footprint support, collision, sprint feedback, and pointer lock",
    prefixes: [
      "player movement ", "player footprint ", "player collision ", "player debug ",
      "sprint feedback ", "pointer lock "
    ]
  },
  cores: {
    description: "Physics/hitscan cores, aim previews, launch rules, settings, and toy contacts",
    prefixes: [
      "physics core", "physics impacts ", "physics toy ", "fast small physics cores ",
      "small fast physics cores ", "hitscan ", "destroying an impacted block ",
      "surviving terrain damage bounces ", "player physics core ", "player core "
    ]
  },
  debris: {
    description: "Fragment budgets/rendering, cleanup, Rapier, settling, support invalidation, and rubble",
    prefixes: [
      "debris ", "block fracture ", "block fragments ", "material debris ",
      "quality-scaled block fracture ", "terrain impact fragment counts ", "aggressive debris ",
      "settled debris ", "forever debris ", "zero debris ", "stale airborne debris ",
      "stuck debris ", "rigid debris ", "vfx debris ", "expired quality-scaled fragments ",
      "orphan fragments ", "terrain support invalidation ", "batched rubble ", "rubble ",
      "hybrid rubble ", "forced rubble ", "adjacent rubble ", "quality-reduced fragments ",
      "single-piece rubble ", "terrain impacts resolve ", "supported rubble ",
      "unsupported rubble ", "one full block worth of rubble ", "large supported rubble "
    ]
  },
  inventory: {
    description: "Item action registry, creative/finite inventory, hotbar lanes, and click fire mode",
    prefixes: ["item registry ", "hotbar ", "inventory ", "click fire mode "]
  },
  menus: {
    description: "Pause tabs, settings ownership, keyboard focus, deletion copy, and release notes",
    prefixes: [
      "menu tab", "vertical settings tabs ", "keyboard reveals focused categories ",
      "pause menu ", "delete-world dialog ", "changelog "
    ]
  },
  builder: {
    description: "Builder brushes, admin commands/fixtures, and target highlighting",
    prefixes: ["builder brush ", "admin ", "target block highlighter "]
  },
  companion: {
    description: "Nova Pilot, context, chat, and terminal routing",
    prefixes: ["nova "]
  },
  audio: {
    description: "Persisted audio settings and volume normalization",
    prefixes: ["audio settings "]
  },
  workers: {
    description: "Shared WorkerPool dispatch, priorities, fallback, revisions, and telemetry",
    prefixes: ["workerpool ", "worker pool "]
  },
  diagnostics: {
    description: "Combat/hitch logs, event bus, frame-loop policy, and frame/FPS diagnostics",
    prefixes: [
      "combat log ", "event bus ", "frame timing ", "rolling frame rate ",
      "performance hitch ", "remote hitch ", "frame loop "
    ]
  },
  automation: {
    description: "Test avatar, Codex pilot inputs, visual scenario/recorder helpers",
    prefixes: ["test avatar ", "codex pilot ", "visual test "]
  },
  settings: {
    description: "Quality presets/custom settings and physics object budgets",
    prefixes: ["quality settings ", "quality presets ", "physics object budget "]
  }
};
