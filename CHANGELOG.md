# Changelog

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
