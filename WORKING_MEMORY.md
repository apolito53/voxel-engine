# Working Memory

## Partial terrain sunlight · v0.24.2

A light hit can move a voxel into the partial renderer before any of its 27
sub-cells break. Its four vertical faces had inward triangle winding, which
reversed their lighting on the two-sided terrain material. Partial regions also
received sun shadows while omitting their surviving geometry from the shadow
map. Both paths now match the visible shape of the terrain. See
[lighting and sky](docs/architecture.md#lighting-and-sky).

A Chrome sand-wall comparison placed intact, lightly damaged, and visibly
chipped sections side by side. Under the same low sun, the original middle
section lit up and the ground shadow stopped at the first damaged section.
The corrected wall shades continuously and the shadow follows the surviving
pieces. At the Normal preset's full shadow coverage, writing both sides into
the map striped the flat crater floor. The depth pass now uses back faces,
matching intact terrain. A suspended legacy height patch supplies an exposed
bottom face for overhead sunlight. The winding and shadow-caster regressions each failed on the prior
code. The world, lighting, partial-terrain and worker groups, TypeScript,
source hygiene and the production build passed.

Sealed-room ambient shading has a separate [follow-up](TODO.md#completed-foundation-individual-light-sources).
The previous [bird acceleration release](docs/wildlife.md) and
[Sunwashed materials](docs/terrain-art.md) remain documented by their owners.
