# Feature Spitballs

Loose ideas live here before they deserve a plan. This file is intentionally
messier than `TODO.md`: half-formed features, "that might be fun" notes,
gameplay sparks, and technical experiments that are not commitments yet.

When an idea starts to look real, promote it into `TODO.md` with clearer
constraints, risks, and likely first steps. When it ships, move durable facts to
the focused docs or `CODEBASE_INDEX.md`.

## World Feel

- Day/night cycle with simple lighting mood shifts before any survival loop.
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
- Blueprint export/import for small structures.
- Ghost placement previews for copied structures and larger brushes.

## Destruction And Materials

- Material reactions: brittle stone, soft sand, springy wood, crumbly rubble,
  heat-scarred ember blocks.
- Stress/support experiments where unsupported shapes crack, sag, or collapse in
  controlled local bubbles.
- Explosive or pressure-wave cores that damage by falloff rather than exact
  impact only.
- Heat/cold damage channels if materials ever need more flavor than HP.
- Persistent partial-block saving once the current in-memory bite lattice becomes
  too fun to lose on reload.

## Physics Toys

- Magnet core that pulls loose debris and small physics objects.
- Repulsor core for clearing tunnels or making dramatic debris sprays.
- Sticky core that pins fragments or temporary objects together.
- Spring/joint tool for building goofy contraptions.
- Gravity bubble or low-gravity field for stress testing debris and traversal.
- One deliberately absurd "break the lab" mode that exists only for profiling
  and laughs.

## Movement And Player Feel

- Mantle/climb onto ledges where a one-block jump feels slightly too stiff.
- Slide tuning variants for downhill terrain and low ceilings.
- Grapple or tether tool as a traversal toy.
- Glider or fall-control item if vertical terrain becomes more interesting.
- Swimming or buoyancy only after water exists as real gameplay terrain.

## Items And Progression Seeds

- Separate build tools from weapon/tool items once the hotbar starts feeling
  crowded.
- Scanner item that reads block material, HP, support state, and recent damage.
- Beacon or waypoint item for marking test sites in large worlds.
- Drill item as a sustained version of the current core destruction loop.
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
