# Crystallized Memory

Selective decisions and lessons worth preserving across tasks. The complete
runtime contracts live in [docs/architecture.md](docs/architecture.md), with
owners and risk pointers in [CODEBASE_INDEX.md](CODEBASE_INDEX.md).

- The engine is a browser-first proving ground. Make systems portable through
  small data/query boundaries and focused owners; split packages when a real
  second consumer earns the cost. See the architecture's
  [design posture](docs/architecture.md#design-posture) and
  [bolt-on direction](docs/architecture.md#bolt-on-direction).
- Friendly NPCs begin as a bounded, transient per-visit population. Navigation
  reads loaded terrain and surviving partial collision boxes through a small
  query boundary; missing chunks are impassable. Keep simulation, presentation,
  and world lifecycle separate. See [friendly NPCs](docs/friendly-npcs.md).
- Full voxels and sparse 3x3x3 partial-block lattices own durable terrain truth.
  Loose debris is presentation, so its quality budget must not change gameplay
  material or damage accounting. Automatic debris-to-rubble conversion remains
  parked until deliberately chosen as gameplay. See
  [terrain truth](docs/architecture.md#terrain-truth-and-partial-damage) and
  [cores, debris, and rubble](docs/architecture.md#cores-debris-and-rubble).
- The `v0.18.0` inventory foundation deliberately keeps an unlimited creative
  catalog alongside a finite saved Backpack. Equipment and pickup/drop need an
  explicit gameplay decision before introducing resource consumption. Persist
  stable item IDs and preserve older world saves. See
  [inventory and persistence](docs/architecture.md#items-inventory-and-persistence).
- Menu navigation is presentation state, not saved world data. Keep tab/focus
  behavior in `menuNavigation.ts`, pause/shortcut policy in `main.ts`, and
  controls bound to their existing preference/inventory owners. See
  [the pause workspace controls](docs/controls.md#world-flow).
- Sky atmosphere, elevated clouds, and terrain visibility have independent
  distance roles. Clouds occupy fixed world elevation and use elapsed active
  play time for wind; saved clock edits only affect their lighting. Preserve
  real depth ordering when flying through/above clouds and the atmosphere
  camera-range floor on all presets without increasing terrain streaming. See
  [lighting and sky](docs/architecture.md#lighting-and-sky).
- Cloud shadows share the existing directional map. Their elevated casters
  require lifting the light along the live clock-driven solar direction and
  extending far by the same displacement. The sky disk, real light, cloud
  shading, shadow basis and guides must agree; never bake a permanent noon
  direction into terrain colors. Fit terrain near/far from finite rendered
  bounds, then check both cloud planes at every tilted frustum corner. Gate
  cloud casting by its actual horizon and camera height before low sun makes
  the projection unbounded; keep the true vector and clip cloud depth to the
  visible main-camera horizon. Preserve Lamp emission/block light. See the same
  [lighting and sky contract](docs/architecture.md#lighting-and-sky).
  Cloud-shadow debug guides share that live projection, gate and owned wind; sampled
  terrain contacts must honor partial geometry and reject paths through unloaded
  terrain rather than inventing a flat footprint or claiming pixel ownership.
- Partial-mesh draw caps and reduced rigid-debris solver cadence were tried
  and reverted: their visible cost outweighed the benefit. Reopen performance
  work from a named repro and fresh diagnostics; preserve the lesson before
  repeating those approaches. See
  [the optimization dead ends](docs/performance-hitch-logging.md#parked-optimization-dead-end).
- Camera sun glare preserves the established direct scene color path: custom
  sky/cloud shaders author display color, while standard materials perform
  their output transform. Keep optical composition separate unless a future
  color-pipeline change deliberately reconciles both. Sun occlusion comes from
  actual scene depth and the same main-camera world transform, including
  partial terrain and clouds; transparent presentation guides remain non-solid.
  See [lighting and sky](docs/architecture.md#lighting-and-sky).
