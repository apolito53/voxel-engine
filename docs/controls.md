# Controls And Settings

This page is the full player/admin control reference. The short version lives in
the root README.

## World Flow

- The home screen creates, loads, or deletes local IndexedDB worlds. New worlds
  choose a `World Type`: `Varied Terrain`, `Floating Islands`, or `Classic
  Legacy`.
- `Superflat Lab` creates a flat grass/dirt/stone test world using the reserved
  `superflat` seed.
- Loading a world restores the last saved player feet position, look direction,
  and world time of day.
- `Resume` captures the mouse after pausing.
- `Exit to Home` returns to the world list. Switch worlds from the home screen,
  not the pause menu.

## Movement

- `WASD` moves the player.
- `Mouse` looks around while playing.
- `Space` jumps, or flies upward while flight mode is active.
- `C` crouches smoothly on foot, or flies downward while flight mode is active.
- `C` while sprinting forward, or landing crouched with enough speed, starts a
  committed slide with an 80% entry-speed pop. Hold `W` to glide longer and
  press `Space` to spring-jump out of the slide.
- Low damaged-terrain ledges step up automatically with a short vertical ease,
  so one-sub-block Terraformer cuts can form usable stairs without popping the
  camera upward. Two-to-four-sub-block ledges require a sprint vault that keeps
  horizontal momentum. Taller reachable ledges use the pull-up clamber only
  while `Space` is held; while falling, holding `Space` can catch a nearby
  reachable edge and climb even before direct body contact.
- `Shift` sprints on the ground or uses the stronger flight speed boost. Active
  sprint/boost widens FOV and adds peripheral speed lines.
- `F` toggles flight mode.
- `Esc` pauses and releases the mouse.

## HUD And Debug Keys

- The bottom hotbar shows the selected lane and active item/block slot.
- Quick controls are hidden by default. Enable `Control Hints` in
  `Settings > Gameplay` to show the left-aligned hint stack.
- The debug overlay starts hidden on every page load.
- `F3` toggles the grouped debug overlay. Its section menu can hide panels, and
  each visible panel can collapse in place. It shows Perf, Player, World,
  Physics, Debris, Lights, Sky, Render, and Combat panels with smoothed FPS, frame
  time, player speed, signed X/Y/Z velocity, CPU buckets, rigid debris counts,
  Lamp source/proxy pressure, partial-block
  pressure, instanced debris counts, debris support-wake/cleanup counters,
  current clock/phase/cycle state, day/night light scales, fog color,
  renderer stats, and the latest tool/core damage events with affected terrain
  sub-cell indexes. The Combat panel also
  shows whether those events are queued, written, or failed for local disk
  logging.
- `F4` cycles the built-in quality presets.
- `F6` toggles Core Aim Preview. Physics Core draws a dotted throw arc; Hitscan
  Core draws a straight dotted beam. Both show the predicted impact ring and
  3x3x3 bite-lattice cells affected by the next terrain hit. Camera-facing
  cells draw bright white, while hidden/far-side cells draw as a softer red
  ghost.
- `F8` toggles the scripted test avatar.
- The first-pass sound engine unlocks after the first normal click/key press and
  plays procedural cues for UI clicks, world load/exit, item selection, core
  shots, terrain damage/destruction, rubble activity, Nova reactions,
  footsteps, and landings.

## Items And Blocks

- `G` toggles the active lane between `Items` and `Blocks`.
- `T` toggles click actions between `Semi Auto` and `Full Auto`.
- `Mouse wheel` selects within the active lane.
- Number keys map to the current lane.
- The bottom hotbar shows the current lane and the active semi/full-auto click
  mode.
- Pause menu `Loadout` opens selection cards for `Tools` and `Blocks`; choosing
  a card switches to that lane, selects the item/block, and resumes gameplay.
- The `Items` lane contains `Unarmed`, `Terraformer`, `Physics Core`, and
  `Hitscan Core`.
- `Unarmed` is intentionally inert on both clicks for now.
- `Terraformer` uses `Left click` to delete the exact highlighted sub-block
  cells from the targeted terrain. In full-auto mode, holding `Left click`
  repeats the current edit at a bounded cadence. `ArrowUp` and `ArrowDown`
  adjust its cubic sub-cell brush size while it is selected.
- In the `Blocks` lane, `Left click` erases the targeted block brush and `Right
  click` places the selected block brush into adjacent space. Full-auto mode
  repeats held erase/place actions.
- `Lamp` blocks are placeable from the Blocks lane. Every visible Lamp face is
  shader-emissive so dense fixtures and Lamp walls glow consistently regardless
  of camera/player position, while a fixed 32-source nearest-point proxy layer
  adds warm spill onto surrounding terrain. Extra Lamp sources stay
  emissive-only instead of going dark. Local Lamp shadow maps are parked until
  the emitter volume can be excluded from its own shadows.
- A translucent selected-block-color ghost previews the placement volume before
  committing it.
- In the `Items` lane, selected Physics Core uses `Left click` to throw a core
  from the lowered right-side muzzle. Full-auto mode repeats held core throws.
- Gameplay settings can raise the Physics Core bounce count. Each terrain hit
  that actually damages blocks spends one bounce, so higher values let a core
  ricochet through pits before self-destructing. Surviving damaging rebounds
  lose some speed, so the setting buys extra chaos without making the core
  ignore impact energy.
- Thrown Physics Cores also have a hard lifetime and start a short fade/despawn
  countdown once they stay below useful terrain-damage speed.
- Selected Hitscan Core uses `Left click` to fire an instant core trace from the
  lowered right-side muzzle. Full-auto mode repeats held hitscan shots.
- Holding `Right click` while firing a core uses centered reticle ADS with a
  slight 15% zoom.
- `X` despawns active physics cores while keeping loose debris and parked rubble
  experiments.

## Builder Panel

Pause menu `Builder` opens admin build controls:

- Switch between item and block lanes.
- Use the block currently selected in `Loadout > Blocks`.
- Tune the odd-sized place/erase brush.
- Run place/erase at the current target.
- Spawn quick fixtures such as target, wall, platform, and pillar using the
  selected block.

Nova Terminal exposes matching admin commands:

- `superflat`
- `spawn target [block]`
- `spawn wall [block] [width] [height]`
- `spawn pillar [block] [height]`
- `spawn platform [block] [size]`

## Settings

Pause menu `Settings` is split into three tabs.

`Graphics` owns:

- Quality preset
- Fog start distance
- Shadow quality
- Debris Shadows toggle for loose-fragment shadow casting

`Gameplay` owns:

- Projectile core size
- Projectile core velocity
- Projectile core bounce count
- Terraformer size
- Day/Night Cycle toggle
- Time of Day slider
- Projectile/hitscan core color
- Projectile core trail toggle
- Core Aim Preview toggle
- Health Bars toggle
- Sound toggle
- Master/SFX/UI volume sliders
- Despawn All Objects

`Experimental` owns the controls most likely to create CPU/GPU stress:

- Physics Object Budget
- Break Burst Shards, the per-block spawn ceiling for the initial destruction spray
- Active Ground Debris Cap, the post-impact cap for loose shard bodies kept
  around after they touch support or sleep past the short burst grace
- Ground Debris Lifetime
- Cycle Length, which changes the default 20-minute day/night cycle from 5 to
  60 minutes
- Allow Super Ultra Mode

Quality slider edits switch the dropdown to `Custom` so built-in presets stay
clean. `Gameplay > Health Bars` toggles block/rubble damage bars and clears any
visible bars when turned off. `Gameplay > Sound` mutes or enables the procedural
Web Audio layer, with separate master, SFX, and UI volume sliders persisted in
local storage. Default audio levels favor audible terrain, movement, and UI
feedback while keeping core launch sounds from dominating the mix. The
`Gameplay > Despawn All Objects` button performs the drastic full cleanup:
physics cores, loose debris VFX, and any existing rubble cover.
The fog start distance is the clear chunk radius. Far terrain hits a short,
dense fog wall over the preset's falloff band, while the engine streams a hidden
extra horizon behind that opacity so the hard chunk cutoff stays out of sight.
Chunks beyond the opaque fog wall plus one safety ring stay loaded but stop
drawing, which keeps streaming continuity without paying draw calls for fully
hidden terrain. Voxel terrain uses horizontal world-distance fog, so the dense
wall stays aligned with the radial chunk horizon even from high altitude.
Normal terrain worlds also draw a cheap fog-colored horizon
matte below the wall, so flying high shows a distant atmospheric base instead
of open sky where chunks are intentionally hidden. Floating-islands worlds
leave this fake floor disabled so the void remains visible.
Runtime sky visuals are procedural: the old sunlit skybox remains in the repo
as a legacy asset, but active worlds render a gradient sky dome with sun/moon
disks, stars, and cloud bands that stay above the horizon. The world clock
shifts fog, background, horizon matte, outdoor terrain exposure, and sky/light
colors together. The sun and moon visuals move through the sky, but the
directional shadow anchor remains fixed in this first pass so terrain shading
and chunk meshes do not remesh during the cycle.

## Quality Presets

- `Potato`: 0.5x clear distance, no shadows, 64 physics bodies, 54 max debris
  shards/block, 8m active debris bubble, 28m local-light radius, one-chunk fog wall.
- `Low`: low-end baseline, no shadows, 128 physics bodies, 72 max debris
  shards/block, 12m active debris bubble, 40m local-light radius, one-chunk fog wall.
- `Normal`: 2x clear distance, shadows, 192 physics bodies, 108 max debris
  shards/block, 20m active debris bubble, 56m local-light radius, one-chunk fog wall.
- `High`: 4x clear distance, sharper shadows, debris shadows, 512 physics
  bodies, 144 max debris shards/block, 32m active debris bubble, 72m local-light radius,
  two-chunk fog wall.
- `Ultra`: 6x clear distance, sharper shadows, debris shadows, 1024 physics
  bodies, 180 max debris shards/block, 48m active debris bubble, 96m local-light radius,
  two-chunk fog wall.
- `Super Ultra`: 12x clear distance, highest shadow resolution, debris shadows,
  4096 physics bodies, 216 max debris shards/block, 72m active debris bubble, 128m
  local-light radius, two-chunk fog wall. This is a stress-test mode and requires an
  opt-in from the pause menu once `Ultra` is selected.
- `Custom`: created automatically when settings sliders are changed, using the
  selected built-in preset as its baseline.
