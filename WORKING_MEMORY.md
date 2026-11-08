# Working Memory

Current handoff: 2026-11-08, `v0.23.0` bird wildlife. Delivery branch is `main`;
managed implementation: `voxel-friendly-npcs/voxel-engine`, branch
`codex/bird-wildlife`. The canonical checkout's separate Moss & Ember art pass
remains untouched and excluded (still based on `34ccaf8`). Reconcile that dirty
checkout deliberately before using it; do not publish art as part of syncing.

[Wildlife](docs/wildlife.md) owns the first bird slice: 12 formation birds around
130–140m near the cloud base, cruising ~9.5m/s, plus three faster lower solos.
Solos approach exposed loaded leaf/wood, rest with folded wings/feet supported,
and take off. Perch/terrain edits revalidate live geometry; constrained takeoff
keeps wings folded until flight clearance exists. One depth-writing instanced
batch caps rendering at 15 birds / 180 parts. Formation haze is independent of
terrain fog; solos retain terrain fog. No extra streaming, persistence, nesting,
combat, or audio. [Automation](docs/automation.md#codex-pilot-bridge) owns fixtures.

Anthony chose Friendly Wanderers as an opt-in Debug experiment, default off.
The saved browser preference gates spawning/E interaction; disabling clears
immediately. Enabling twice preserves the visit. [NPC guide](docs/friendly-npcs.md).

Verification: wildlife17/17, NPC14/14; focused affected-consumer union154/154;
isolated current debris96/96; TypeScript,118-file source hygiene,7 selectors,
20-file docs links, production build and whitespace checks passed. The build
keeps its existing chunk advisory. Three combined full-suite attempts failed
at the tracked partial-rubble/fast-fall Rapier assertions, including WASM errors.
The unchanged e7581d0 baseline passed370/370 and96/96 debris in a bounded audit;
that does not establish cause. Renderer UUID RNG is scoped/restored in its new
synchronous test. No physics/assertion changes; do not claim the flake resolved.
See the existing TODO watchlist and ignored logs/bird-wildlife-* receipts.

Chrome verified woodland perches/rest/takeoff, high flocks on Normal/Potato,
default-off/enable/disable and idempotence, identical paused bird snapshots,
direct world switch, clear/reseed, exit, and double teardown/reload. No console
errors observed in the final check. A 10-second canvas recording captured all
four solo states; local evidence is under logs/visual-runs/2026-11-08-bird-wildlife/.
The existing5174 collector stored its video under canonical logs/visual-runs/
2026-11-08/2026-11-08t06-16-58-871z-bird-canopy-flight-l6ps3v/.
Natural-tree and bounded simulation checks are not ecosystem acceptance.
