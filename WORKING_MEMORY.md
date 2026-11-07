# Working Memory

Current handoff: 2026-11-07, cloud shadows for `v0.19.1`.

## Current State

The real 144–156m voxel clouds now cast gentle moving daytime shade through
the existing directional sun shadow map. `src/cloudLayer.ts` owns the visible
and instanced depth materials, stable partial depth coverage, radial shadow-map
edge fade, active-time wind, reset, and disposal. `src/shadows.ts` owns daylight
gating and the depth-range policy. Cloud shadows change no terrain receiver
shader, Lamp emission, derived block light, sun direction, orthographic map
width/resolution, terrain fog, streaming radius, or saved world data.

`Settings > Graphics > Cloud Shadows` defaults on for Normal and higher and off
for Potato/Low. Edits fork into Custom; its preference persists separately from
global Shadow Quality. Global shadows Off disables the checkbox while retaining
its check state and explaining why. Off/night skip the cloud depth draw and
restore the original sun rig. When active, the sun moves farther along its
existing direction and far extends by exactly that amount, preserving terrain
coverage while containing the tilted cloud-plane intersections. Custom shadows
enabled from a Potato/Low base also gain visible shadow intensity.

The `v0.19.0` procedural atmosphere, fixed cloud altitude, active-time wind,
all-preset clouds, and independent 1800m atmosphere camera floor remain in
place. See [lighting and sky](docs/architecture.md#lighting-and-sky) and
[controls](docs/controls.md#settings) for the owning contracts.

## Verification And Delivery

Full local validation passed on the first run with all 335 engine robustness
tests: typecheck, 106-file source hygiene, 17-file Markdown links, production
build, and whitespace checks. New coverage includes defaults/backward-compatible
preferences, malformed flags and round-trip storage, Low-based Custom shadow
strength, daylight/caster gates, continued wind when disabled, the standard
instanced depth vertex path, owned depth-material disposal, and every tilted
frustum corner across preset bounds. The known large vendor chunk warning
remains. npm is absent from PATH; the installed Node plus the previous temporary
npm CLI/shim ran validation. Output is in ignored
`logs/cloud-shadows-validate.log`.

In-app browser review confirmed stepped cloud shade on terrain at noon without
a hard square boundary or WebGL errors. On/off captures show the shade being
removed; the menu checkbox works and its opt-out survives reload. Global Shadow
Quality Off disables the control while retaining its checked preference across
reload, and restoring Normal enables it again. Midnight review also passed
without runtime errors. Implementation and code review are complete; remote
branch and configured delivery status are checked during Git delivery.
Review uses the separate local
`Sky Review` world and ignored evidence under
`logs/visual-runs/2026-11-07-cloud-shadows/`, preserving existing played saves.
The reserved Vite `127.0.0.1:5173` and collector `127.0.0.1:5174` services
were reused; no ports or services changed.

## Remaining Follow-up

No additional gameplay or sky work is selected by this completed implementation.
The [current gameplay shortlist](TODO.md#current-recommended-next-slice) remains
equipment/pickup gameplay and sound work. Existing
[local-logger gaps](TODO.md#development-follow-up-local-diagnostics) and
[intermittent Rapier/CI validation failures](TODO.md#development-follow-up-ci-rigid-debris-validation)
remain tracked once in TODO. No diagnostics, physics, dependencies, or test
runner behavior changed here.
