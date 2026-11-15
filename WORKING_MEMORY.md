# Working Memory

## Sunlight at terrain contacts

The outdoor sand-step recording exposed a pale line along the base of intact
and carved walls. A matched Chrome pit reproduced it with an 8192px shadow map.
Even zero receiver bias left a visible line. Full and partial terrain now
write the first sun-facing surface to the map. A slope allowance in the packed
directional depth keeps the filter from striping lit floors. See
[lighting and sky](docs/architecture.md#lighting-and-sky).

Release v0.25.2 uses the existing terrain geometry, shadow pass and leaf-cutout
predicate. Chrome fixtures covered intact steps, carved sand, a thin shelf with
an opening, legacy height patches, and leaf shadows across 1024, 2048 and 8192px
settings. A low-sun 1024px control also distinguished shallow patch shadows
from filtering at the edge of the finite floor. The 195 focused world,
lighting, partial-terrain and worker cases, typecheck and production build passed.
The controlled captures use disposable scenes and a matched camera.
Evidence is in the shadow-contact worktree under
`logs/visual-runs/2026-11-15-sun-contact/`.

The [leaf material](docs/terrain-art.md#leaf-cutouts) and
[sky bird flyovers](docs/wildlife.md) have their own guides. The
[sealed-room ambient comparison](TODO.md#completed-foundation-individual-light-sources)
remains open.
