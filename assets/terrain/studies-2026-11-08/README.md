# Terrain art direction studies

Pixel Workshop terrain studies from 2026-11-08. Anthony selected **Sunwashed
with the stronger noise pass** as the winning direction. Keep the complete
Sunwashed, Wildwood and Mineral Frontier sets for future biome work, including
their editable sources and exported previews. The current Moss & Ember
direction is superseded as an art choice and preserved as an archive.
Sunwashed's grass, dirt, stone and bark now feed the complete v0.24.0 material
set pixel for pixel; see [the active art workflow](../../../docs/terrain-art.md).
The other study directions remain preserved for future biomes.

| Direction | Visual intent | Material emphasis |
| --- | --- | --- |
| Sunwashed — selected | Warm, open landscapes with the stronger mottled grain | Olive grass, pale limestone, warm earth |
| Wildwood — retained for biomes | Stronger contrast and deliberate angular clusters | Deep teal foliage, violet stone, ochre earth |
| Mineral Frontier — retained for biomes | Dry, weathered terrain with geological structure | Sage grass, rusty layers, umber earth |

Each direction has grass, stone, earth (`dirt`) and bark studies. Compare the
large patches as well as individual tiles: attractive isolated sprites do not
establish that a hillside or cliff reads well. These are material studies;
lighting, full scenes, grass-to-earth side caps, foliage volumes and the Lamp
are covered by the complete Sunwashed runtime set and its in-world review.

## Editable files

Each direction folder (`sunwashed/`, `wildwood/`, `mineral-frontier/`) contains
`<material>-sheet.pixel.json` and its PNG export, plus the assembled
`<material>-patch.pixel.json` and PNG. Open/import a native document in Pixel
Workshop to edit its pixels. Sheet tiles are 32 by 32 pixels; the 8 by 8 sheet
contains 64 alternatives: four interiors for each of 16 corner configurations.
Patches show 10 by 6 blocks using the same layout
for all directions and materials, with no rotations.

The compact [study data](studies.json) supplies the in-conversation comparison.
Its palette-indexed rows contain the same 64 tiles, with `NW=1`, `NE=2`,
`SE=4`, `SW=8` corner bits. The flat tile index is `mask + alternative * 16`;
`variantsPerMask` is four. The ordered `symbols` string indexes each direction's
palette. `patchMasks`, `patchVariants` and `patchSeed` reproduce the exported
layout, which the comparison also uses at its default seed.

The [previous moderate study](previous-moderate/studies.json) and its 12 patch
PNGs are preserved under `previous-moderate/` for the Previous pass comparison.
The [initial uniform study](previous-uniform/studies.json) and its 12 patches
remain under `previous-uniform/`; that older baseline has one interior per mask.

## Tiling proposal

Neighboring tiles share corner identities and matching edge pixels. A shared
grid of corner values chooses compatible tiles, allowing tonal patches and
marks to continue across block boundaries. A coarse seeded field varies the
density of corner identities across several blocks; a separate cell hash picks
one of four compatible interiors. The 64 variants combine shared edge profiles
with different interior compositions; the set uses no rotated copies.

Anthony requested more noise in both layout and patterns, then found the
moderate increase still too restrained. The current studies use stronger
coarse and medium tonal grain, irregular 1–5px clumps, rougher patch boundaries,
broken strokes and uneven mark density. Grass's smooth corner wash is reduced
so the mottled shapes dominate. Border samples remain identical across all
compatible alternatives. Bark keeps vertical grain and sedimentary stone keeps
horizontal beds. The Previous pass switch holds palette, seed, corner masks
and interior choices fixed while comparing stronger noise with the moderate
pass. Repetition still exists
in a finite tile family. Larger world-space color fields remain a follow-up
option beyond this layout-density experiment.

The v0.24.0 renderer chooses shared corners and one of four interior alternatives
per world-meter cell. It preserves world anchoring, greedy faces, shared
partial-terrain projection and stable appearance after edits. The study viewer
uses its own layout seed; the selected material pixels are the same in both.
Material transitions such as grass-to-earth or moss-to-stone require their own
neighbor-aware art and selection rules.

## Reproduction and review

The [authoring recipe](../../../scripts/author_art_studies.mjs) uses the same
pinned Pixel Workshop engine as [the existing art workflow](../../../docs/terrain-art.md).
From the repository root, run:

```powershell
node scripts/author_art_studies.mjs logs/visual-runs/2026-11-07-art-upgrade/workshop-engine
```

The recipe regenerates these studies, so preserve hand edits before rerunning
it. The engine snapshot is ignored local authoring infrastructure, not a game
dependency. Use another checkout of the documented pinned revision if needed.
Sunwashed's visual direction and stronger noise level are selected and form
the runtime set. Future biome integration of the retained alternatives remains
exploratory.

The [verification report](verification.json) records opacity, uniqueness and
all compatible edge-pixel comparisons for every set. PNGs and editable native
sheet/patch pixels were also compared independently. Material patches were
visually reviewed, including refinements to vary interior compositions, reduce
repeated badges and introduce organic grain. The comparison's material,
earlier/current pass, pattern, close-up, grid,
rearrangement and saved-state paths were checked without a live browser;
browser layout and in-game lighting remain unverified.
