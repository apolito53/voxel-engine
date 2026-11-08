# Working Memory

Current handoff: 2026-11-07, camera sun glare for `v0.20.0`.

`sunGlare.ts` owns the warm camera halo/veil and the real-scene sun-disk
occlusion query. It consumes the shared live solar direction, fades off-axis
and at night, and warms around golden hour. Graphics settings expose Off–200%
strength plus independent, default-on Glare Occlusion; built-ins use 100% on
Normal and above, 65% Low, and Off on Potato. Older Custom settings inherit
their actual base. Controls and lifecycle/cost contracts live in
[lighting and sky](docs/architecture.md#lighting-and-sky), with an explicit
[Codex Pilot diagnostic](docs/automation.md#codex-pilot-bridge).

The original direct scene color/antialiasing path stays intact. A tiny cropped
camera uses the same world transform and actual visible materials/depth,
including carved terrain, clouds, and solid objects. GPU disk reduction/history
gives fractional exposure; fully blocked disks extinguish all glare. Transparent
guides/glows/trails remain non-solid. Occlusion Off skips/releases query/history;
glare Off releases all effect resources and restores the single scene draw.
No world lighting, shadows, terrain, workers, physics, dependencies, services,
or port assignments changed.

Full `validate` passes on the final runtime revision: all 352 engine robustness
tests, typecheck, source hygiene (108 files), docs links (17 files), production
build, and whitespace checks. The nine-test focused subset also passes,
covering settings migration, multi-time projection/crop, render workload gates,
state restoration/failure fallback, history invalidation, resize/context/disposal.
Receipts: ignored `logs/sun-glare-validate.log` and
`logs/sun-glare-focused-tests.log`. The renderer counters preserve the original
main-scene baseline and accumulate supplemental work; fallback emits one bounded
event through the existing local diagnostic collector.

Two earlier validation attempts reproduced the known partial-height-rubble and
fast-fall/Rapier WASM-borrow failures, retained in ignored
`logs/sun-glare-validate-rapier-{failure,fast-fall}.log`. The passing final run
does not resolve these [tracked intermittent physics failures](TODO.md#development-follow-up-ci-rigid-debris-validation).

Live browser checks in separate owned review worlds confirmed clear sun
visibility 1, cloud/wall cover 0, partial wall-edge exposure about 0.451, off-axis
and night gating, no-occlusion query release, and glare-Off resource release.
The Graphics UI kept the disabled occlusion preference while strength was Off.
Custom 125%/occlusion-Off persisted across reload; review preferences were then
restored to Normal, 100%, occlusion On. The final runtime also passed the GPU
partial-cover recheck and reported no browser errors. Captures and GPU/counter
receipts are retained under ignored
`logs/visual-runs/2026-11-07-sun-glare/`.

At one fixed IAB/NVIDIA view (1280x720, Normal-derived settings, pixel ratio 1.5),
F3 recorded 9 draws with glare Off, 10 for simple glare, and 14 with occlusion.
The latter reprocesses scene geometry; the small target only bounds pixel work.
These are scene-specific workload checks, not a general frame-rate benchmark.
The owned `Sky Review` tab was left above the clouds at frozen 17:31 with glare
enabled; the occlusion wall is isolated in `Superflat Lab 4`. No existing user
maps were edited.

Implementation, source review, and visual verification are complete for normal
`main` delivery. Git history and configured CI/deployment results remain the
publication records. Existing local logger gaps remain tracked once in
[TODO](TODO.md#development-follow-up-local-diagnostics).
