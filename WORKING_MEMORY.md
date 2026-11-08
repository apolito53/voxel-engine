# Working Memory

Current handoff: 2026-11-08. `v0.22.0` adds the first friendly NPC population.
Normal delivery is `main`; the clean implementation lives in the managed
`voxel-friendly-npcs/voxel-engine` worktree on `codex/friendly-npcs`.

Mira, Bram, and Fern spawn on safe loaded terrain near the restored entry pose,
roam locally, idle, notice/wave, and offer authored dialogue through `E`.
[The NPC guide](docs/friendly-npcs.md) owns scope, navigation, lifecycle and
limits; [automation](docs/automation.md#codex-pilot-bridge) owns pilot fixtures.
NPCs are transient per visit, capped at three (fewer when no safe spawn exists).
There is no NPC persistence, combat, job system, or general long-range routing.
Invalid support/body clearance hides a person and retries nearby safe terrain.
Nova Pilot retains its separate owner.

Verification: all 370 engine cases, all seven selector checks, TypeScript,
source hygiene (112 files), documentation links (19 files), production build,
and whitespace checks passed. The build keeps its existing large-chunk warning.
Chrome verified visible Superflat/varied-terrain spawn, walking/attention, `E`,
pointer lock, unchanged pause snapshots and blocked paused interaction, exit,
direct world switch, clear/reseed, and idempotent teardown/reload. Dialogue fits
and avoids Nova's toast at desktop, 390x844 and 844x390. No runtime exceptions
occurred in the final teardown/reload check. These are bounded smoke checks,
not long-session or arbitrary-maze navigation acceptance.

Ignored receipts: `logs/npc-full-tests.log`, `logs/npc-build.log`, and
`logs/visual-runs/2026-11-08-friendly-npcs/` in the managed worktree.
Existing intermittent Rapier tests and local diagnostics gaps remain in TODO.

The canonical checkout has a separate uncommitted Moss & Ember terrain-art pass
based on `34ccaf8`. It was left untouched and excluded from this delivery;
its original art handoff remains there. Reconcile it with remote main carefully
before using that checkout for further implementation; do not publish the art
merely as part of syncing NPCs. Its normal local app/collector were preserved.
