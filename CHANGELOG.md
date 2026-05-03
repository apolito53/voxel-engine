# Changelog

## 0.2.12 - 2026-05-02

### Added

- Added a scroll-selected hotbar lane containing `Unarmed`, each placeable block, and `Physics Core`.
- Added regression coverage for hotbar item order, labels, break eligibility, wheel direction, and wraparound selection.
- Added a TODO note for the future equipment/items iteration.

### Changed

- Removed `T` as the player physics-core launch control.
- Right click now uses the selected hotbar item: selected blocks place into the targeted adjacent space, while selected Physics Core throws a core.
- Left click now breaks terrain only while `Unarmed`, leaving selected blocks/cores from accidentally demolishing the target.
- Updated HUD, README, and codebase index control references for the new selection model.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded `Default World`, confirmed the HUD starts on `Unarmed`, mouse wheel selection advances through block items, and no fresh console errors appeared.

## 0.2.11 - 2026-05-02

### Added

- Saved worlds now remember the player's last feet position plus yaw/pitch look direction, restoring that location when the world is loaded again.
- Added a bounded player-location autosave path that writes periodically during play and also saves on pause, page hide, and `Exit to Home`.
- Added regression coverage for player-location metadata persistence and deep cloning in the saved-world registry.

### Changed

- World loading now preloads and ensures chunks around the saved player location instead of always starting around the origin.
- Player teleports now reset movement/crouch/slide state from a feet-position anchor so crouched exits do not reload the camera inside terrain.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, paused to trigger the player-location save path, and confirmed no fresh app console errors.

## 0.2.10 - 2026-05-02

### Added

- Added a typed in-browser engine event bus for decoupled gameplay events such as world load, Nova toggles, physics core throws, block damage/destruction, rubble formation, quality/settings changes, palette selection, core cleanup, and frame spikes.
- Added Nova Pilot reactions as the first event-bus consumer: Nova now pulses and shows short rate-limited HUD messages when meaningful engine events happen.
- Added regression coverage for event-bus unsubscribe behavior and Nova reaction throttling/expiration.

### Changed

- Routed existing main-loop events through the event bus instead of baking all future companion/gameplay reactions directly into `main.ts`.
- Added a lightweight `#nova-message` HUD panel for companion chatter.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the Nova message panel shows on world load, toggled Nova off/on with `N`, triggered the Nova-thrown core reaction with `B`, and checked for fresh app console errors.

## 0.2.9 - 2026-05-02

### Added

- Added the Nova Pilot companion as a visible in-world hover pilot that starts alongside loaded worlds, orbits near the player, stays above nearby terrain, and can be toggled with `N`.
- Added `B` as a Nova-thrown physics-core launch, using the pilot's position and aim direction instead of the player's camera muzzle.
- Added regression coverage for Nova's companion positioning fallback and pilot-thrown core launch direction.

### Changed

- Shared player-thrown and Nova-thrown physics-core construction through one helper so sleep/damage tuning stays consistent.
- Updated HUD, README, and codebase index entries for the new companion controls and module ownership.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the HUD rendered `| Nova`, toggled Nova off/on with `N`, spawned a Nova core with `B`, spawned a player core with `T`, cleared active cores with `X`, and checked for fresh app console errors.

## 0.2.8 - 2026-05-02

### Changed

- Reworked sprint/flight boost lines from side-mounted parallel streaks into faint center-out radial spokes that are masked toward the screen edges.
- Softened boost overlay opacity and transition timing so the FOV pop remains readable without the overlay dominating the view.
- Restored physics-core rebounds against rubble cover so cores bounce with meaningful speed instead of dying on settled debris.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the HUD/debug overlay rendered, and checked for fresh app console errors.

## 0.2.7 - 2026-05-02

### Changed

- Added hidden-tab and overnight-resume frame guards so chunk streaming, physics, minimap, and rendering skip expensive work while the page is hidden or recovering from a long frame gap.
- Reset debug timing and minimap meters after visibility/focus resumes so stale overnight deltas do not poison the HUD smoothing window.
- Made `Despawn All Objects` release high-water instanced debris batches instead of only hiding fragment instances, allowing long stress tests to give those GPU buffers back.

### Added

- Added regression coverage for frame delta clamping, hidden/resume frame skipping, and lazy recreation of disposed fragment instancing batches.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the debug HUD rendered with `frag inst 0 batches 0 cap 0`, and checked for fresh app console errors.

## 0.2.6 - 2026-05-02

### Changed

- Reworked settled rubble from one proxy mesh per occupied cell into bounded multi-cell patches, so neighboring piles read as connected debris fields instead of scattered floor tiles.
- Lowered rubble patch height and skipped internal patch side faces, reducing the blocky slab look while keeping rubble queryable for cover and core collision.
- Updated the debug HUD label from rubble `piles` to rubble `patches`.

### Added

- Added a regression test proving adjacent rubble cells merge into one rendered patch while still raycasting as cover.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, confirmed the debug HUD reports rubble `patches`, and checked for fresh app console errors.

## 0.2.5 - 2026-05-02

### Changed

- Raised the rubble-to-terrain promotion threshold from 36 to 48 pieces, making compacted `Rubble` blocks require roughly two high-quality block fractures worth of material.
- Kept the visual rubble pile cap at 36 pieces while allowing hidden pile material to continue accumulating toward terrain compaction.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.2.4 - 2026-05-02

### Changed

- Doubled the rubble-to-terrain promotion threshold from 18 to 36 pieces, so one full 27-piece block fracture remains destructible cover instead of immediately refilling the hole it came from.
- Updated rubble docs to describe compaction as a dense-pile behavior rather than a normal one-block break result.

### Added

- Added a regression test proving one maximum-quality block fracture stays as a rubble proxy while larger accumulated piles can still compact into generated `Rubble` terrain.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: reloaded the app, loaded `Default World`, and checked for fresh console errors.

## 0.2.3 - 2026-05-02

### Added

- Added a generated `Rubble` terrain block that compacted rubble piles can promote into once a cell gathers enough settled pieces.
- Added rubble support checks: unsupported rubble piles fall one voxel cell at a time, and falling piles merge into piles directly below them.
- Added tests for falling/merging rubble piles and promotion from cover proxy into solid terrain.

### Changed

- Rubble settlement now runs each active frame after physics impacts, so destroying support blocks can make existing piles drop or compact.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded a world, toggled debug HUD, confirmed the rubble stats line renders, and checked for fresh console errors.

## 0.2.2 - 2026-05-02

### Changed

- Reassigned `X` to despawn only thrown physics cores, preserving loose debris and settled rubble piles for ongoing destruction tests.
- Removed the redundant settings-menu core-despawn button; the settings menu now keeps only the drastic `Despawn All Objects` cleanup action.
- Updated HUD and README control copy so the quick hotkey and full cleanup button describe their different blast radii.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: confirmed HUD says `X despawn cores`, Settings only exposes `Despawn All Objects`, pressed `X`, and checked for fresh console errors.

## 0.2.1 - 2026-05-02

### Changed

- Tuned block-fragment launch speeds downward so destroyed blocks break into nearby debris instead of spraying pieces far from the fracture site.
- Split fragment block-collision response from thrown-core collision response: fragments now lose horizontal speed on ground contact, bounce less, and settle into rubble piles faster.
- Added a settings-menu `Despawn Physics Cores` button for clearing thrown cores without deleting loose debris or rubble piles.
- Added a regression test that keeps grounded fragments from skating away before they become rubble cover.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 0.2.0 - 2026-05-02

### Added

- Added persistent rubble cover proxies: settled debris fragments now merge into cheap gameplay piles instead of remaining as long-lived individual physics shards.
- Added destructible rubble behavior: moving physics cores collide with rubble piles, bounce away, and chip pile health on meaningful impacts.
- Added rubble raycast support so future shooter line-of-sight, bullet, and cover checks can query piles without touching every visual shard.
- Added rubble statistics to the debug HUD for pile count, piece count, and maximum cover height.

### Changed

- Absorbed sleeping debris into rubble piles before object-object broadphase work, reducing per-frame physics pressure while preserving tactical destruction hooks.
- Bumped the project version to `0.2.0` and started release notes for engine-level milestones.

### Validation

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`
- Browser smoke at `http://localhost:5173/`: loaded a world, toggled debug HUD, confirmed the rubble stats line was present, and checked for fresh console errors.

## 0.1.0 - 2026-05-02

### Added

- Initial strict TypeScript voxel sandbox engine baseline with chunk streaming, saved worlds, quality presets, player movement, destructible blocks, physics cores, instanced debris rendering, and engine robustness tests.
