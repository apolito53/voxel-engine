# Working Memory

Current handoff: 2026-11-07, darker cloud shadows for `v0.19.2`.

## Current State

Cloud shadows now use 100% maximum daytime depth coverage instead of 60%, so
patch interiors read darker. This is a small tuning change in
`src/shadows.ts`; the existing daylight fade and radial fade across the shadow
map's outer 35% remain. The owned instanced depth material in
`src/cloudLayer.ts` retains stable ordered coverage for those fades.

The shared directional shadow map, sun-shadow strength, tilted depth-range
policy, terrain receivers, Lamp emission, block light, cloud geometry/wind, and
terrain streaming remain unchanged. Cloud Shadows still defaults on for Normal
and higher and off for Potato/Low. Its Custom preference survives global shadows
being off, and off/night skips cloud casting and restores the original sun rig.
See [lighting and sky](docs/architecture.md#lighting-and-sky) and
[settings](docs/controls.md#settings) for the owning contracts.

## Verification And Delivery

Full local validation passed on its first run: all 335 engine robustness tests,
typecheck, 106-file source hygiene, 17-file Markdown links, production build, and
whitespace checks. The existing cloud-casting test now requires full noon depth
coverage while retaining dawn/night, global shadows, toggle, wind, and lifecycle
checks. The known vendor chunk-size warning remains. Output is retained in
ignored `logs/cloud-shadows-darker-validate.log`; the previous temporary npm shim
was reused because npm is absent from PATH.

An in-app browser comparison in the separate `Sky Review` world matched the
previous noon/Normal view at feet `(-160, 110, 157)`, yaw `0`, pitch `-0.85`.
Shadow interiors are visibly darker, the outer fade stays soft, and no WebGL or
runtime errors were reported. Evidence is retained in ignored
`logs/visual-runs/2026-11-07-cloud-shadows-darker/`. The earlier `v0.19.1`
review verified the unchanged toggle, persistence, global-shadow gate, and night
behavior. Implementation and review are complete; remote branch and configured
delivery status are checked during Git delivery. Reserved Vite
`127.0.0.1:5173` and collector `127.0.0.1:5174` services were reused; no ports
or services changed.

## Remaining Follow-up

No further gameplay or sky tuning is selected. The
[current gameplay shortlist](TODO.md#current-recommended-next-slice) remains
equipment/pickup gameplay and sound work. Existing
[local-logger gaps](TODO.md#development-follow-up-local-diagnostics) and
[intermittent Rapier/CI validation failures](TODO.md#development-follow-up-ci-rigid-debris-validation)
remain tracked once in TODO. No diagnostics, physics, dependencies, or test
runner behavior changed here.
