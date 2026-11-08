# Working Memory

Current handoff: 2026-11-08, `v0.23.1` independent bird routes. Delivery branch
is `main`; implementation lives in managed `voxel-friendly-npcs/voxel-engine`,
branch `codex/bird-wildlife`. The canonical checkout's separate terrain art
work remains untouched and excluded (still based on `34ccaf8`). Reconcile that
dirty checkout deliberately; do not publish art as part of syncing.

[Wildlife](docs/wildlife.md) owns 12 cloud-height formation birds and three
faster lower solos that approach trees, perch, rest, and take off. The old
entry-centered circles looked like birds orbiting the player. Birds now choose
irregular destination routes within fixed world habitats. Nearby player motion
does not retarget them; distant travel still controls population residency.
Route leaders recover from unavailable or unloaded air through bounded fixed
world candidates. Visible movement remains swept; a single loaded chunk can
hold a formation until enough terrain streams for its next leg.

Cloud heights, speed limits, loaded-only collision, terrain-edit reactions,
folded-wing takeoff, the 15-bird instanced batch, fog, pause and disposal remain
in their existing owners. [Automation](docs/automation.md#codex-pilot-bridge)
exposes copied `flightTarget` and `habitatCenter` for route diagnostics.
Friendly Wanderers remains an opt-in Debug experiment, default off; Anthony
has not settled its role. See [NPCs](docs/friendly-npcs.md).

Verification for this fix: wildlife 23/23 (six new route/streaming cases),
TypeScript, 118-file source hygiene, 20-file docs links, production build and
whitespace checks passed. Both orbit regressions failed against the shipped
`0d3a4bc` source before the fix. Independent matched simulations found broad
passes and identical routes after a nearby 9m observer move. Both formations
recovered after initial missing air and later leader-column unload. Three
natural-forest fixtures retained solo landing/takeoff without intersections.
Chrome confirmed 15 birds, high formations, solo perches, default-off wanderers,
and no console errors. Ignored receipts: `logs/bird-routes-*` and
`logs/visual-runs/2026-11-08-bird-routes/`.

The full local suite was not repeated for this focused fix. The prior bird
release's configured CI passed; the existing TODO Rapier-flake watchlist remains
unresolved, with no physics/assertion edits. Natural-tree and bounded route
checks do not establish an ecosystem or migration behavior.
