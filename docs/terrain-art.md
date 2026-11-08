# Terrain Art

Sunwashed with the stronger noise pass is the selected terrain art in v0.24.0.
The complete set has 14 face families, each containing 64 opaque 32×32 tiles:
16 shared-corner patterns with four interior alternatives. The retained
[Sunwashed, Wildwood and Mineral Frontier studies](../assets/terrain/studies-2026-11-08/README.md)
remain available for future biome work, with their original comparison passes.

## Editable source and exports

- [Sunwashed manifest](../assets/terrain/sunwashed/manifest.json): the ordered
  list of 14 native Workshop sources, preview PNGs, edge modes and representative
  colors. Each editable sheet is 256×256, with tiles in an 8×8 grid.
- [Study provenance](../assets/terrain/sunwashed/provenance.json): exact pixel
  hashes connecting grass top, dirt, stone and bark to the selected study.
- [Export verification](../assets/terrain/sunwashed/verification.json): palette,
  opacity, tile counts and compatible-edge checks from the latest export.
- [Compact runtime art](../src/assets/terrain-art.json): RGB palette and indexed
  rows, decoded synchronously at material creation.
- [Runtime and UI atlas](../src/assets/terrain-atlas.png): 1024×896 pixels,
  32 columns by 28 rows. Each family occupies 64 consecutive tile slots.

All artwork is original and authored through Pixel Workshop's actual
`createDocument`, `applyCommands`, `composite` and PNG-export engine. The pinned
source is [Workshop commit 718f177](https://github.com/apolito53/pixel-workshop/tree/718f17700084a8c356e3babe6b17b7774a570c1e).
Workshop is an authoring tool, not a game dependency. Its 512px document limit
is why editable families are separate sheets rather than one oversized file.

## Editing and regenerating

Import the desired `.pixel.json` file from `assets/terrain/sunwashed/` into
Workshop, edit it, and save it back to the matching source path. Node 24 can
import the pinned shared TypeScript engine directly. From the repository root:

```powershell
node scripts/export_sunwashed_art.mjs C:/path/to/pixel-workshop
```

An optional second argument selects another source directory containing the
manifest and sheets. The exporter composites the native sources, checks their
edge contracts and opacity, limits the global palette to 91 indexed symbols,
and rebuilds the runtime JSON, atlas, family PNGs and verification report.
It preserves editable source files.

[author_sunwashed_art.mjs](../scripts/author_sunwashed_art.mjs) recreates the
native sources from the accepted study and the complementary face recipes.
Running it replaces those sources; use the exporter to preserve hand edits.
The ignored local engine snapshot from the initial pass remains under
`logs/visual-runs/2026-11-07-art-upgrade/workshop-engine/` in the canonical
checkout. A separate checkout of the pinned revision is equally suitable.

The earlier Moss & Ember sheet and its author/export scripts are preserved as
an archive. The active exporter is `export_sunwashed_art.mjs`; the older
`export_terrain_art.mjs` targets the superseded layout and must not overwrite
current runtime outputs.

## Connected patterns and face orientation

[blockTextureSelection.ts](../src/blockTextureSelection.ts) owns matching CPU
and GLSL integer hashes. World-meter cells share corner values, with image
`NW=1`, `NE=2`, `SE=4`, `SW=8`; an independent hash chooses one of four interiors.
A family's tile offset is `cornerMask + interiorAlternative * 16`. There are no
rotations or mirrors. The selector is stable at negative coordinates, across
chunk boundaries and after terrain edits without adding saved terrain data.

[blockTextureTiles.ts](../src/blockTextureTiles.ts) preserves world-space face
projection for greedy chunks, mesh workers and partial terrain. Top/bottom faces
use X/Z; side faces use the horizontal face axis and world Y. Tile selection
stays in the fragment shader, so greedy quads need no per-block subdivisions.
Irregular damage faces still use the existing dominant-axis projection.

Ten families connect on both image axes. Grass/moss side art deliberately puts
vegetation above earth, so those two families join horizontally; vertically
stacked caps retain their block-by-block boundary. Wood end grain and lamps
are object motifs with four alternatives repeated over the corner masks.
The manifest owns the mode of each family; do not require all 14 families to
connect in both directions.

The canvas atlas stores its first row at the top. With `CanvasTexture.flipY`
enabled, the shader maps image row R to GPU row `rows - 1 - R`. Local V grows
upward, so the top image corners use world cell `y + 1`. Nearest filtering,
no mipmaps and a half-texel inset preserve pixels without adjacent-tile bleed.
Keep this orientation consistent with UI crops and exporter row order.

## Color, previews and resources

Authored texture pixels own terrain hue. Full chunks, workers and partial
meshes carry neutral baked light; applying the former material tint again would
muddy the art. Keep existing Lamp emission, block light, sealed-room lighting,
day/night and fog paths. The Lamp tile's dark housing still participates in
its existing whole-face emission behavior.

`BLOCKS.color` holds representative Sunwashed tones in linear RGB for debris,
poofs, marks and Three.js brush previews. The 2D minimap converts them to display
sRGB before applying its existing height shade. Palette changes must preserve
that distinction; canvas bytes and Three.js linear channels differ.

Hotbar, Inventory, Backpack and Builder share CSS cube previews cropped from
the same two-dimensional atlas. Top and side families use the common face
mapping helper. Material instances own their small CanvasTexture and release
it through the existing lifecycle; no external image request can finish late.

## Verification

Use [the testing map](testing.md): world, lighting and partial-terrain cover the
shared material contract, with menus/inventory for preview consumers and workers
for shared mesh changes. The block-texture tests cover atlas order, malformed
pixels, negative-coordinate joins, family-specific edge modes, exact selected
study pixels, image/GPU orientation, menu crops and full/worker/partial UV parity.
A production build checks the JSON/PNG bundling boundary.

Inspect actual terrain in Chrome: repeated ground and walls, grass caps and
vertical bark, carved faces, lit and sealed Lamp surfaces, and menu previews at
normal and narrow widths. Native-sheet inspection and CPU hash tests do not
establish browser shader compilation or in-world lighting by themselves.
