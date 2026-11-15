# Working Memory

Current handoff: 2026-11-15, `v0.25.1` sky bird flyovers. Implementation uses
managed `voxel-friendly-npcs/voxel-engine`, branch `codex/bird-wildlife`;
normal delivery is `main`. Reconciled with the delivered v0.25.0 foliage and
v0.24.2 partial-terrain sunlight fixes; canonical local work remains untouched.

Anthony's orbit recording showed high flocks repeatedly turning through a small
area. His ground-level spawning report was separate: the old 13/22m horizontal
spawn put formations almost straight above the camera. A matched 75-degree
camera test reproduced zero ground visibility versus sustained cloud-height
visibility. Short habitat-waypoint routes did not deliver across-sky behavior.

[Wildlife](docs/wildlife.md) now owns fixed one-way sky passes: invisible ingress
around 420m, one overhead crossing, natural departure, then a quiet interval.
The second slot starts 22s later. Alpha reaches zero beyond 380m; re-placement
occurs only while invisible. Following a flock keeps it flying straight beyond
its nominal endpoint until it fades. High silhouettes are enlarged for ground
readability. Cruise 19m/s, cap 24, buildup 6m/s² are retained. The scaled wing
envelope stays above the finite world ceiling, so high flocks never query or
stream terrain. Solos retain loaded-air collision, 30m/s cap, tree visits,
recovery, and pause/disposal. Copied pass diagnostics live in the
[pilot bridge](docs/automation.md#codex-pilot-bridge).

Verification: native wildlife 31/31, TypeScript, 121-file source hygiene,
21-file docs links, production build, and whitespace checks passed. Ground
projection and sky-query parity both failed on the prior source. Independent
review covered repeated invisible-only resets, following observers, teleports,
frame rates, unloaded sky, actual silhouettes, and retained solos. Chrome
checked a fixed ground pose on Normal and Potato, without tracking the flock
or flying upward. A grounded canvas recording uploaded to the local 5174
collector; local graphics preferences were restored. Evidence is untracked in
`logs/visual-runs/2026-11-15-bird-flyovers/` and the recording's dated directory.

Leaves retain collision, support, IDs and saved terrain while passing light;
full and partial cutouts share their shadow predicate. See
[leaf cutouts](docs/terrain-art.md#leaf-cutouts). Sunwashed art remains preserved.
The canonical foliage logging-delivery probe gap remains recorded in TODO;
this worktree's successful video upload does not prove that separate route.
The TODO Rapier watchlist is unchanged; no full local suite or physics changes
are part of this task. The old untracked `logs/bird-routes-delivery.txt` receipt
is preserved and excluded.
