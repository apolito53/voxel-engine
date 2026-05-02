# Changelog

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
