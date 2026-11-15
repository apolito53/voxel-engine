# Working Memory

Current handoff: 2026-11-15, v0.25.3 irregular leaf gaps. Anthony identified
the v0.25.0 mask as a repeating grid of plus signs and asked to randomize it.
The new mask replaces identical stamps with overlapping integer noise fields
at different scales/orientations and fine boundary grain. Gap shapes, sizes
and local density vary across block boundaries; the pattern stays fixed in
world space with no time or camera input.

The selected Sunwashed RGB art and editable Workshop/study sources are intact.
Leaves retain their ID, collision, support, perches, health, sky connectivity
and normally attenuated Lamp light. Visible, glare-query and full/partial
shadow passes still share the exact cutout predicate. Layers use different
plane seeds; opposing faces on the same plane agree. See
[leaf cutouts](docs/terrain-art.md#leaf-cutouts) for the implementation contract.

The existing sky baseline remains binary outdoor/sealed connectivity, with
filtered direct sunlight supplied by cutout shadows. The concurrent v0.25.2
terrain contact-shadow fix is retained: terrain uses sun-facing shadow depth
with a filter-slope allowance. The v0.24.2 partial winding/underside fixes and
v0.25.1 one-way sky bird flyovers are also retained; see
[lighting](docs/architecture.md#lighting-and-sky) and [wildlife](docs/wildlife.md).
The separate sealed-room
ambient follow-up remains in [TODO](TODO.md#completed-foundation-individual-light-sources).

Verified after integrating the concurrent bird and contact-shadow updates:
158/158 focused world, lighting and wildlife cases (426 registered), TypeScript,
source hygiene, production build, documentation links and whitespace checks.
The new regression
rejects stamped plus motifs and checks varied gap sizes, density, row phases
and within-pixel stability. Independent checks covered negative-coordinate
and interpolation arithmetic, with sampled openness near 38% versus 37.5%
previously. Chrome checked the same broad leaf wall before/after, canopy
shadowing and generated trees; the final shader reload reported no errors.
Screenshots are untracked in
`logs/visual-runs/2026-11-15-natural-leaf-gaps/`.

Canonical review is reserved on 5173. The existing 5174 collector's browser
delivery gap remains recorded in [TODO](TODO.md); no performance conclusions
were drawn from missing diagnostic logs. Further foliage art and biome work
remain directions awaiting Anthony's next choice.
