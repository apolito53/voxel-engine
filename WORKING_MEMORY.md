# Working Memory

Current handoff: 2026-11-08, v0.24.0 Sunwashed art. Implementation is complete
and validated in `C:/Users/apoli/.codex/worktrees/voxel-sunwashed/voxel-engine`,
branch `codex/sunwashed-art`, based on main `c7bca00`. Delivery to main and its
remote CI/deployment checks are the remaining closeout steps.

Anthony selected Sunwashed with the stronger noise pass. The complete
[editable Sunwashed set](docs/terrain-art.md) contains 14 face families with
64 variants each (896 32px tiles) in a 1024×896 atlas. Grass, dirt, stone and
bark preserve the selected study pixels exactly. Shared-corner CPU/GLSL hashes
keep connected surfaces stable across negative coordinates, chunks and edits
without splitting greedy meshes. Vegetation side caps connect horizontally;
wood end grain and Lamps retain intentional object motifs.

All three [study directions](assets/terrain/studies-2026-11-08/README.md), their
native Workshop files, PNGs, original/moderate comparison passes and the older
Moss & Ember source remain preserved. Biome implementation is still future work.
The active exporter is scripts/export_sunwashed_art.mjs; the old Moss exporter
must not overwrite the current layout.

Terrain hue comes from the atlas with neutral baked vertex light. Matching
linear colors cover untextured debris, marks and poofs; minimap colors convert
to display sRGB once per block. Hotbar and menu cubes crop the same 2D atlas.
The latest bird wildlife and opt-in NPC work through v0.23.1 are retained. Birds use independent world routes rather than
entry-centered orbits; see [wildlife](docs/wildlife.md) for their route contracts.

Verified: full native test gate (405/405 engine cases, 7 selector regressions,
TypeScript, 120-file source hygiene, 21-file docs links), production build and
whitespace checks. Existing vendor/app chunk-size advisory remains. The known
Rapier flake did not reproduce in this final run; its watchlist stays in TODO.
Independent audits passed all relevant family edges, CPU-selected neighbor
joins, atlas orientation/crops, native/PNG/runtime pixel equality and archive
preservation. Chrome checked actual varied terrain, repeated material walls,
vertical bark/caps, carved stone, day/night Lamp emission and spill, desktop
Inventory/Builder and 390px Inventory, plus textured hotbar. No shader/console
errors observed. A user in-world acceptance playtest is not yet recorded.

Ignored screenshots: logs/visual-runs/2026-11-08-sunwashed-release/. Final test
receipt: logs/sunwashed-reconciled-validation.log. Review server is reserved at5185 and
uses the existing5174 collector; existing5173 service is preserved. The
canonical pending art patch/file hashes are backed up under its ignored
logs/visual-runs/2026-11-08-art-implementation/ before synchronization.
