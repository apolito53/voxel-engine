# Working Memory

Current handoff: 2026-11-15, v0.25.0 leaf light transmission. Anthony accepted
the Sunwashed terrain overhaul and chose foliage as the next area, beginning
with Minecraft-like light transmission through leaf blocks.

Leaves retain their block ID, collision, support, health and saved terrain
semantics. Their separate optical-opacity rule passes sky connectivity and
normally attenuated Lamp block light, including damaged leaves. Stable 32px
clustered cutouts share the visible and directional-shadow shader predicate;
successive planes vary their holes. Full/worker/partial meshing retains surfaces
behind leaves. Full and damaged foliage both cast cutout-aware shadows, retaining
the v0.24.2 back-face depth rule that avoids stripes on carved floors.
See [leaf cutouts](docs/terrain-art.md#leaf-cutouts) for owners and boundaries.

The existing sky baseline remains binary outdoor/sealed connectivity. Filtered
direct sunlight comes from the cutout shadow map; this pass does not introduce
a global skylight field. Opaque rooms and bushes keep their existing rules.

Sunwashed's selected stronger-noise RGB artwork, all editable Workshop sources,
and the Sunwashed/Wildwood/Mineral Frontier studies are preserved unchanged.
See [terrain art](docs/terrain-art.md). Further foliage art and biomes remain
open directions awaiting Anthony's next choice.

Concurrent bird acceleration and doubled flight-speed limits from v0.24.1
are retained; see [wildlife](docs/wildlife.md). Friendly Wanderers remains an
opt-in experiment. This handoff supersedes the stale v0.24.0 delivery-pending
snapshot; that Sunwashed implementation was delivered and accepted.

The concurrent v0.24.2 carved-terrain fixes are retained: outward flat-face
winding, exposed height-patch undersides, and partial shadow casting. See
[lighting and sky](docs/architecture.md#lighting-and-sky). The separate
sealed-room ambient follow-up remains in [TODO](TODO.md#completed-foundation-individual-light-sources).

Verified after reconciliation: 221/221 focused world, lighting, partial-terrain,
worker and wildlife cases (420 registered), TypeScript, 121-file source hygiene,
21-file documentation links, production build and whitespace checks. Chrome
checked generated trees, a leaf canopy and dappled shade, stone behind leaves,
carved stone/leaf junctions, night Lamp spill, damaged leaves and the combined
partial-shadow depth pass. A fresh launch reported no console errors. Release
notes show v0.25.0 followed by the retained v0.24.2 and v0.24.1 entries. The
existing large-bundle build advisory remains.

Local review uses the canonical server on reserved 5173. The existing 5174
collector reports healthy to the host, but a Chrome fetch and deliberately
labeled diagnostic probe did not reach the known log archives during this pass.
The delivery gap is recorded in [TODO](TODO.md); no performance conclusions
are based on missing logs. Useful visual evidence is kept untracked under
`logs/visual-runs/2026-11-15-foliage-light/`.
