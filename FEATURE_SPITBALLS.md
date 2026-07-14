# Feature Spitballs

Loose ideas live here before they deserve a plan. This file is intentionally
messier than `TODO.md`: half-formed features, "that might be fun" notes,
gameplay sparks, and technical experiments that are not commitments yet.

## Index

- [Reader Note](#reader-note)
- [World Feel](#world-feel)
- [Terrain And Generation](#terrain-and-generation)
- [Building And Editing](#building-and-editing)
- [Destruction And Materials](#destruction-and-materials)
- [Damage Models And Game Modes](#damage-models-and-game-modes)
- [Physics Toys](#physics-toys)
- [Vehicles](#vehicles)
- [Movement And Player Feel](#movement-and-player-feel)
- [Input And Control Schemes](#input-and-control-schemes)
- [Entities And AI](#entities-and-ai)
- [Bots And Helpers](#bots-and-helpers)
- [Items And Progression Seeds](#items-and-progression-seeds)
- [World Saves And Sharing](#world-saves-and-sharing)
- [Test Lab And Automation Toys](#test-lab-and-automation-toys)
- [Nova Flavor](#nova-flavor)
- [Bigger Long Shots](#bigger-long-shots)

## Reader Note

For future Codex/Nova branches: treat this as an idea compost pile, not a
roadmap. Preserve weird sparks even when they are not ready, but keep each entry
short enough to scan.

Preferred format:

- One bullet per idea.
- Start with the player-facing fantasy when there is one.
- Add a short technical hook only when it helps future implementation.
- Use rough tags inside the bullet only when they clarify intent, for example
  `[feel]`, `[mechanic]`, `[tech]`, `[debug]`, `[maybe]`, or `[risky]`.
- If an idea becomes actionable, promote it to `TODO.md` with the goal, first
  slice, constraints, and validation shape.
- If an idea turns into shipped behavior or a firm engine decision, move the
  durable fact into the focused docs or `CODEBASE_INDEX.md`.

## World Feel

- Weather and calendar hooks layered on top of the shipped day/night cycle.
- Weather passes: rain, fog banks, wind gusts, lightning flashes, dust in sandy
  washes.
- Better biome identity: colder highlands, dry washes, denser groves, exposed
  stone ridges.
- Ambient world motion that stays cheap: drifting leaves, grass sway, dust
  puffs, small water-surface shimmer once water exists.
- World screenshots or postcards saved with each local world slot.

## Terrain And Generation

- Caves that are fun to traverse, not just noise tunnels.
- Rivers or dry riverbeds that give the terrain stronger navigation landmarks.
- Overhangs, arches, cliffs, and mesa shelves that stress chunk meshing in useful
  ways.
- Hand-authored micro-structures mixed into procedural terrain: ruins, wells,
  test bunkers, marker towers, weird little terrain set pieces.
- Seed preview on the create-world screen once generation is fast enough to do
  it without making the menu feel heavy.

## Building And Editing

- Undo/redo stack for Builder and Terraformer edits.
- Copy/paste selections, with rotate/mirror before placement.
- Symmetry modes for quick test structures.
- Paint/material brush that swaps block material without changing shape.
- `[feel]` Terraformer beam mode: make terrain editing feel like a visible tool
  with a sustained beam, impact glow, material chip feedback, and clear range
  falloff instead of only silent block/sub-cell edits.
- `[mechanic]` Custom Terraformer shapes: let players design or save a brush
  footprint/volume, then use that shape for repeatable carving instead of only
  fixed cube-ish brush sizes.
- `[mechanic]` Custom main-block placement/destruction shapes: separate
  build/break brush shape authoring from the Terraformer so normal block editing
  can use saved stamps, masks, or volumes too.
- `[mechanic]` Player-placeable terrain features: preset trees, hills, rock
  piles, test fixtures, and eventually buildings that can be previewed, rotated,
  and stamped into the world as authored feature bundles.
- Blueprint export/import for small structures.
- Ghost placement previews for copied structures and larger brushes.

## Destruction And Materials

- Material reactions: brittle stone, soft sand, springy wood, crumbly rubble,
  heat-scarred ember blocks.
- `[mechanic]` Distinct block physics/material traits: ricochet coefficient,
  light permeability, impact sound/feel, tool affinity, and debris behavior
  should eventually come from material data rather than one generic block HP
  table.
- `[feel]` Material-specific debris styles: leaves float down as soft fluffy
  pieces, stone throws larger jagged shards, wood splinters, dirt and sand read
  more like poofs/dust than hard fragments.
- `[mechanic]` Source-material debris behavior: when a block breaks, its
  material type can seed debris mass, bounce, drag, lifetime, particle shape,
  color, and settling rules so leaves flutter, sand puffs and settles fast, wood
  tumbles as splinters, and stone clatters as heavier chunks without making
  shard count affect gameplay value.
- `[mechanic]` Multi-type blocks as a deliberate revival of the old debris-pile
  idea: let a terrain cell represent mixed material/cover/fill data without
  turning ordinary loose debris cleanup back into permanent rubble by accident.
- Stress/support experiments where unsupported shapes crack, sag, or collapse in
  controlled local bubbles.
- Explosive or pressure-wave cores that damage by falloff rather than exact
  impact only.
- Heat/cold damage channels if materials ever need more flavor than HP.
- `[tech]` Block-face beautification pass for damaged terrain: revisit partial
  filling of sub-blocks so damaged faces look naturally chipped/filled instead
  of dangling jagged sub-block clusters.
- `[mechanic]` Player collision with partial blocks: Terraformer-carved stairs,
  ramps, and slopes should become walkable support, ideally tied to the
  block-face beautification/fill pass so the visual surface and collision shape
  agree instead of making pretty slopes that still collide like cube chunks.
- Persistent partial-block saving once the current in-memory bite lattice becomes
  too fun to lose on reload.

## Damage Models And Game Modes

- `[mechanic]` Split terrain damage from entity damage so some play modes can
  keep the environment indestructible while still letting weapons/tools affect
  enemies, props, vehicles, or scripted targets.
- `[tech]` Damage-channel contracts: terrain HP, entity HP, shield/armor, tool
  edits, and debug/admin damage may need separate routing before real combat or
  protected-build modes exist.
- `[maybe]` Per-world or per-mode destruction rules: creative sandbox, protected
  adventure map, combat arena, and benchmark lab should be able to choose
  different terrain/entity damage behavior without forking the whole engine.

## Physics Toys

- Magnet core that pulls loose debris and small physics objects.
- Repulsor core for clearing tunnels or making dramatic debris sprays.
- Sticky core that pins fragments or temporary objects together.
- Spring/joint tool for building goofy contraptions.
- Gravity bubble or low-gravity field for stress testing debris and traversal.
- One deliberately absurd "break the lab" mode that exists only for profiling
  and laughs.

## Vehicles

- `[mechanic]` Basic ground vehicle: simple suspension, chunky wheels, blocky
  collision, and enough traction/slide tuning to make voxel terrain traversal
  funny instead of miserable.
- `[mechanic]` Hover platform or speeder as the lower-friction first vehicle if
  wheels are too fussy against uneven terrain.
- `[tech]` Vehicle seats and ownership: entering/exiting, camera handoff,
  player collision suppression, control routing, and save cleanup need a small
  contract before vehicles become more than physics props.
- `[debug]` Vehicle test course in Superflat Lab with ramps, stairs, rubble,
  partial-block damage, and chunk-boundary crossings.

## Movement And Player Feel

- Mantle/climb onto ledges where a one-block jump feels slightly too stiff.
- Slide tuning variants for downhill terrain and low ceilings.
- Grapple or tether tool as a traversal toy.
- `[mechanic]` Spider-Man-ish grappling: swing arcs, tension, release momentum,
  valid anchor feedback, and enough air control to feel expressive rather than
  binary.
- `[active v0.19.x]` Physics-driven flight mode that pushes, tilts, accelerates,
  coasts, brakes, contacts terrain, and lands instead of the current clean
  debug-style toggle. `v0.19.0` supplies the separate chase camera and visible
  thruster-harness avatar needed to communicate that movement.
- `[mechanic]` Wall running or wall kicks for high-energy traversal once player
  collision and camera comfort can support it.
- `[feel]` Movement ability variants should preserve readable first-person
  camera motion and exact eye-ray tool aim; cool traversal is not worth nausea
  soup.
- Glider or fall-control item if vertical terrain becomes more interesting.
- Swimming or buoyancy only after water exists as real gameplay terrain.

## Input And Control Schemes

- `[ux]` Mobile device control support: when the engine detects a touch/mobile
  device, replace pointer-lock assumptions with two virtual joysticks, one for
  movement and one for camera/look, plus touch-friendly jump, crouch, sprint,
  action, and pause controls.
- `[tech]` Touch controls need their own input abstraction instead of pretending
  touch events are mouse movement. Movement/look/action state should feed the
  same player/tool command layer used by keyboard and mouse.
- `[mechanic]` Gamepad/controller support for players who do not want mouse and
  keyboard: left stick movement, right stick look, triggers for primary and
  secondary actions, face buttons for jump/crouch/interact, and bumpers or d-pad
  for hotbar/tool selection.
- `[ux]` Add per-control sensitivity, inversion, dead-zone, and remap settings
  once touch/gamepad support exists, with profiles saved per browser/device.
- `[debug]` Add automation or manual smoke scenes for touch-style controls and
  the browser Gamepad API so future control changes do not regress mobile or
  controller play while fixing desktop FPS behavior.

## Entities And AI

- `[mechanic]` Computer-controlled enemies as the first real entity-AI target:
  perception, pathing around voxel terrain, simple attack decisions, and damage
  routing separate from terrain destruction.
- `[tech]` AI navigation needs a cheap local representation first: chunk-aware
  walkable samples, climb/drop limits, avoidance around partial/rubble support,
  and graceful failure when terrain changes underneath the plan.
- `[debug]` Spawnable enemy fixtures for Superflat Lab and automation scenarios
  before enemies are allowed into normal generated worlds.
- `[maybe]` Friendly/neutral entities later, once hostile AI proves the entity
  lifecycle, save rules, and damage model are not terrible.

## Bots And Helpers

- `[mechanic]` Expand the Nova-bot idea into taskable helper bots: assistants
  that can be assigned jobs instead of only following, chatting, reacting, or
  throwing cores.
- `[mechanic]` Helper building/terraforming: in non-creative modes where the
  player does not personally have every editing tool, bots could execute
  authorized build, repair, flatten, tunnel, or terrain-shaping tasks inside a
  marked area.
- `[mechanic]` Resource collection someday: if the engine grows real resource
  tracking, helper bots could gather, haul, sort, or deliver materials instead
  of only manipulating free terrain.
- `[ux]` Bot tasking needs a clear command surface: select area, choose task,
  preview intended changes, approve cost/rules, then let the bot work without
  turning into invisible admin magic.
- `[tech]` Bot actions should use the same world-edit, item, damage, and future
  resource contracts as the player so helper behavior stays testable and does
  not bypass survival/adventure-mode limits.
- `[debug]` Superflat Lab bot fixtures could test pathing, build queues,
  interrupted jobs, terrain edits, resource pickup stubs, and chunk-boundary
  task handoff before bots exist in normal worlds.

## Items And Progression Seeds

- Separate build tools from weapon/tool items once the hotbar starts feeling
  crowded.
- Scanner item that reads block material, HP, support state, and recent damage.
- Beacon or waypoint item for marking test sites in large worlds.
- Drill item as a sustained version of the current core destruction loop.
- `[ux]` Move item-specific settings closer to active play: Terraformer shape,
  core tuning, beam behavior, and future tool options should have an in-game
  item/menu surface instead of living only in the pause-menu settings panels.
- Inventory only when pickups, crafting, or quantities are real enough to need
  it.

## World Saves And Sharing

- Save thumbnails and last-played timestamps in the world list.
- Duplicate world slot for destructive experiments.
- Export/import local worlds as files before attempting cloud sync.
- Optional cloud backup later, with clear "local first" behavior.
- Seed sharing flow that distinguishes generated terrain from edited chunk data.

## Test Lab And Automation Toys

- Scenario browser in the pause menu for repeatable stress scenes.
- Benchmark arena presets: chunk streaming, debris storm, partial-block carving,
  rubble cover, long-distance fog/render pressure.
- Replayable input traces for regression checks on movement, camera, and tools.
- Visual before/after capture for destruction tests.
- In-game debug bookmarks that teleport to known test fixtures.

## Nova Flavor

- Nova waypoint pings for marked terrain or recent damage sites.
- Short contextual comments for benchmark/test-lab events, heavily rate-limited.
- Optional "ask Nova what just happened" debug summary using the existing event
  journal.
- Companion gestures or light pulses tied to selected tools and damage events.

## Bigger Long Shots

- Local simulation host with the browser as renderer/input client.
- Mod/plugin layer for blocks, items, tools, and generation presets.
- Small scripting surface for test labs and custom scenario rules.
- Multiplayer is a someday-maybe idea only after save format, authority, and
  simulation ownership are much clearer.
