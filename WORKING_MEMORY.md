# Working Memory

Current handoff: 2026-11-15, `v0.24.1` bird acceleration and speed tuning.
Implementation uses managed `voxel-friendly-npcs/voxel-engine`, branch
`codex/bird-wildlife`, based on main `4c0fc2a`. Delivery branch is `main`.
The completed Sunwashed art from `v0.24.0` is retained; its editable sources,
three study directions, exports, and connected surface contracts remain in
[terrain art](docs/terrain-art.md).

[Wildlife](docs/wildlife.md) owns two high formations of six and three lower
solo birds. Cruise targets doubled to 19/22m/s and hard caps to 24/30m/s for
formations/solos respectively. Positive speed changes build at 6/8m/s², starting
from rest after placement, recycle and hidden recovery. Tree approach/descent
stay controlled; vertical takeoff accelerates before joining normal flight.
Actual turns/avoidance can reduce speed. Keep the independent world habitats
and destinations introduced in `v0.23.1`; nearby player motion is not a target.

Loaded-only collision, partial terrain truth, cloud altitude, bounded population,
perch support, pause/visibility gates and renderer disposal remain in their
existing owners. Friendly Wanderers remains an opt-in Debug experiment, default
off; Anthony has not settled its role. See [NPCs](docs/friendly-npcs.md).

Verification: wildlife 26/26, TypeScript, 120-file source hygiene, 21-file docs
links, production build, and whitespace checks passed. New cases measure
actual speed across frame rates, hidden recovery, takeoff, and a short blocked
hold. The terrain-height-cache case now warms up flight before isolating its
existing climb assertion. No full local suite was needed for this focused task.
Receipts live in ignored `logs/bird-acceleration-*` and
`logs/visual-runs/2026-11-15-bird-acceleration/`. Chrome sampling confirmed zero
initial speed and gradual actual velocity growth. Independent matched runs
measured average physical travel at 19.15m/s for formations (previous 9.80) and
18.14m/s for solos (previous 10.32), with every solo ID still perching across
three natural forests. These bounded checks do not establish an ecosystem.

The known Rapier-flake watchlist remains in TODO; this task changes no physics.
Use focused wildlife checks for iteration; configured push CI retains the full
validation gate. The old untracked `logs/bird-routes-delivery.txt` receipt is
preserved and excluded from this change.
