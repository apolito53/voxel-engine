# Working Memory

Current handoff: 2026-11-07, unified clock-driven sunlight for `v0.19.4`.

The implementation supplies one solar vector from `lighting.ts` to
the visible sun/moon, real DirectionalLight, shadow basis, cloud shading, and
Cloud Shadow Guides. It preserves the established fixed-azimuth orbit. Baked
voxel colors retain neutral ambient/sky/underside readability; clock updates do
not remesh terrain. Lamp, sealed-cavity, block-light, fog, wind, quality and
worker contracts remain separate. Focused behavior lives in
[lighting and sky](docs/architecture.md#lighting-and-sky).

Shadow near/far fits the finite existing rendered terrain even when clouds are
off or the sun is shallow. Cloud fitting uses the real visible horizon, both
cloud planes, actual camera height and snap margin; unsupported low sun fades
out without altering the true vector. The depth pass clips using the same cloud
horizon and explicit main-camera position. Guides share that projection/gate,
report low sun separately from night, and expose solar/light directions plus
coverage through [Codex Pilot](docs/automation.md#codex-pilot-bridge). Small solar
updates retain the bounded contact cadence; substantial clock jumps refresh now.

Full `validate` passes at `v0.19.4`: all 344 engine robustness tests, typecheck,
107-file source hygiene, 17-file Markdown links, production build, and whitespace
checks. Receipt: ignored `logs/unified-sun-validate.log`. A focused lighting run
also passed 45 selected tests (`logs/unified-sun-focused-tests.log`). New regression
coverage includes multi-time alignment, all-preset tilted cloud corners,
high-flight horizon limits, shallow terrain near/far, neutral baked walls,
matching depth/visible horizon uniforms, and guide gate/refresh behavior. The
first full test attempt stopped after 219 passes at the already tracked Rapier
borrow/assertion failure in the fast-falling rigid-debris collider test;
evidence is retained in ignored `logs/unified-sun-tests.log`. The successful
full rerun does not resolve that intermittent issue. Dependencies, physics,
runner behavior, ports and services are unchanged; the existing temporary npm
shim is reused.

Anthony completed his own playtest on 2026-11-07, reported that the result
looks good, and explicitly authorized pushing it. That supplies the visual
acceptance for this implementation; no final automated browser check is claimed.
The separate `Sun Sync Review` world belongs to this test; Anthony's saved
`Default World` data was untouched.

Implementation and verification are complete for normal `main` delivery.
Git history and configured CI/deployment results remain the publication records.
No other sky or gameplay work is selected. Existing
[local logger gaps](TODO.md#development-follow-up-local-diagnostics) and
[intermittent Rapier/CI failures](TODO.md#development-follow-up-ci-rigid-debris-validation)
remain tracked once in TODO.
