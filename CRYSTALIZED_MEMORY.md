# Crystallized Memory

Selective decisions and lessons worth preserving across tasks. The complete
runtime contracts live in [docs/architecture.md](docs/architecture.md), with
owners and risk pointers in [CODEBASE_INDEX.md](CODEBASE_INDEX.md).

- The engine is a browser-first proving ground. Make systems portable through
  small data/query boundaries and focused owners; split packages when a real
  second consumer earns the cost. See the architecture's
  [design posture](docs/architecture.md#design-posture) and
  [bolt-on direction](docs/architecture.md#bolt-on-direction).
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
- Sky atmosphere, elevated clouds, and terrain visibility have independent
  distance roles. Clouds occupy fixed world elevation and use elapsed active
  play time for wind; saved clock edits only affect their lighting. Preserve
  real depth ordering when flying through/above clouds and the atmosphere
  camera-range floor on all presets without increasing terrain streaming. See
  [lighting and sky](docs/architecture.md#lighting-and-sky).
- Cloud shadows share the existing directional map. Their elevated casters
  require lifting the light along its fixed direction and extending far by the
  same displacement; check cloud-plane intersections at all tilted frustum
  corners, not just light altitude or a center ray. Keep the shadow plane and
  terrain range stable, fade cloud-only depth coverage before the map boundary,
  and preserve Lamp emission/block light. See the same
  [lighting and sky contract](docs/architecture.md#lighting-and-sky).
  Cloud-shadow debug guides share that fixed projection and owned wind; sampled
  terrain contacts must honor partial geometry and reject paths through unloaded
  terrain rather than inventing a flat footprint or claiming pixel ownership.
- Partial-mesh draw caps and reduced rigid-debris solver cadence were tried
  and reverted: their visible cost outweighed the benefit. Reopen performance
  work from a named repro and fresh diagnostics; preserve the lesson before
  repeating those approaches. See
  [the optimization dead ends](docs/performance-hitch-logging.md#parked-optimization-dead-end).
