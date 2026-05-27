# Controls And Settings

This page is the full player/admin control reference. The short version lives in
the root README.

## World Flow

- The home screen creates, loads, or deletes local IndexedDB worlds.
- `Superflat Lab` creates a flat grass/dirt/stone test world using the reserved
  `superflat` seed.
- Loading a world restores the last saved player feet position and look
  direction.
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
- `Shift` sprints on the ground or uses the stronger flight speed boost. Active
  sprint/boost widens FOV and adds peripheral speed lines.
- `F` toggles flight mode.
- `Esc` pauses and releases the mouse.

## HUD And Debug Keys

- The HUD shows the selected lane/item, movement mode, and Nova state in a
  compact status card.
- Quick controls sit in low-profile hint chips away from the reticle.
- `F3` toggles the grouped debug overlay. It shows Perf, Player, World, Physics,
  Debris, and Render panels with smoothed FPS, frame time, player speed, signed
  X/Y/Z velocity, CPU buckets, rigid debris counts, partial-block pressure,
  instanced debris counts, and renderer stats.
- `F4` cycles the built-in quality presets.
- `F6` toggles Core Aim Preview. Physics Core draws a dotted throw arc; Hitscan
  Core draws a straight dotted beam. Both show the predicted impact ring and
  3x3x3 bite-lattice cells affected by the next terrain hit. Camera-facing
  cells draw bright white, while hidden/far-side cells draw as a softer red
  ghost.
- `F8` toggles the scripted test avatar.

## Items And Blocks

- `G` toggles the active lane between `Items` and `Blocks`.
- `Mouse wheel` selects within the active lane.
- Number keys map to the current lane.
- The `Items` lane contains `Unarmed`, `Mining Tool`, `Physics Core`, and
  `Hitscan Core`.
- `Unarmed` is intentionally inert on both clicks for now.
- `Mining Tool` uses held `Left click` to mine the targeted terrain block.
  Mining spends 1 damage per tick; material controls block HP, cadence, and chip
  debris flavor.
- In the `Blocks` lane, `Left click` does nothing and `Right click` places the
  selected block brush into adjacent space.
- A translucent selected-block-color ghost previews the placement volume before
  committing it.
- In the `Items` lane, selected Physics Core uses `Left click` to throw a core
  from the lowered right-side muzzle.
- Selected Hitscan Core uses `Left click` to fire an instant core trace from the
  lowered right-side muzzle.
- Holding `Right click` while firing a core uses centered reticle ADS with a
  slight 15% zoom.
- `X` despawns active physics cores while keeping loose debris and parked rubble
  experiments.

## Builder Panel

Pause menu `Builder` opens admin build controls:

- Switch between item and block lanes.
- Pick from the block palette.
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
- Render distance
- Shadow quality

`Gameplay` owns:

- Projectile core size
- Projectile core velocity
- Projectile/hitscan core color
- Projectile core trail toggle
- Core Aim Preview toggle
- Health Bars toggle
- Despawn All Objects

`Experimental` owns the controls most likely to create CPU/GPU stress:

- Physics Object Budget
- Max Break Debris
- Max Ground Debris
- Ground Debris Lifetime
- Allow Super Ultra Mode

Quality slider edits switch the dropdown to `Custom` so built-in presets stay
clean. `Gameplay > Health Bars` toggles block/rubble damage bars and clears any
visible bars when turned off. `Gameplay > Despawn All Objects` performs the
drastic full cleanup: physics cores, loose debris VFX, and any existing rubble
cover.

## Quality Presets

- `Potato`: 0.5x render distance, no shadows, 64 physics bodies, 54 max debris
  shards/block, 8m active debris bubble.
- `Low`: low-end baseline, no shadows, 128 physics bodies, 72 max debris
  shards/block, 12m active debris bubble.
- `Normal`: 2x render distance, shadows, 192 physics bodies, 108 max debris
  shards/block, 20m active debris bubble.
- `High`: 4x render distance, sharper local shadows, 512 physics bodies, 144 max
  debris shards/block, 32m active debris bubble.
- `Ultra`: 6x render distance, sharper local shadows, 1024 physics bodies, 180
  max debris shards/block, 48m active debris bubble.
- `Super Ultra`: 12x render distance, highest local shadow resolution, 4096
  physics bodies, 216 max debris shards/block, 72m active debris bubble. This is
  a stress-test mode and requires an opt-in from the pause menu once `Ultra` is
  selected.
- `Custom`: created automatically when settings sliders are changed, using the
  selected built-in preset as its baseline.
