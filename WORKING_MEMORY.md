# Working Memory

Current handoff: 2026-11-07, focused test execution. App remains `v0.21.1`.

Native system groups and literal title selectors now wrap the existing engine
registry. Use [the testing guide](docs/testing.md) for the canonical command map,
consumer combinations, discovery, and full-gate boundaries. `test:focused`
executes only selected cases; `test:groups` validates complete ownership without
running bodies. `npm test` retains its full checks, adds selector regressions,
and rejects arguments with a focused-command hint. No game/runtime behavior or
saved worlds changed in this tooling work.

Focused verification passed: 7/7 selector regressions, coverage of all 358
engine cases across 15 nonempty unambiguous groups, menus 9/9, repeated
inventory/worker union 12/12, and pause-menu title refinement 1/1. All local links
in 18 Markdown files resolve, and `git diff --check` passed. The actual
`npm test -- --group menus` invocation rejects before running its checks.
Full `validate` passed on Node 24: TypeScript, source hygiene, all seven selector
regressions, all 358 engine cases, the 18-file docs check, production build, and
the whitespace diff check. The build retains its existing large-chunk advisory.
No browser playtest was needed for this Node-only test-tooling change.

The pause workspace has Settings, Inventory, Builder, and Debug primary tabs.
Debug contains Core Aim Preview, Health Bars, and Cloud Shadow Guides; their
existing bindings and saved preferences remain in place. F6 still toggles the
aim preview. Control Hints and tool tuning remain in Settings > Tools & HUD;
Experimental retains Super Ultra stress-test quality. Navigation and the full
control map are in [controls](docs/controls.md#world-flow).

The earlier pause Debug tab `validate` gate passed on the first run: typecheck,
source hygiene (109 files), 358/358 engine tests including the menu ownership contract, links
for 17 Markdown files, production build, and `git diff --check`. The ignored
receipt is `logs/pause-debug-validate.log`.

Live IAB checks passed at 788x865, 390x844, and 844x390. All four tabs fit
without horizontal overflow; short-screen scrolling exposes Cloud Shadow Guides
above the pinned footer. End, Home, Left/Right, I, and Escape worked across
tabs, pause, and resume. All three controls updated their existing saved keys;
F6 toggled Core Aim Preview, and F3 showed and hid its overlay without closing
pause. The owned Sky Review world is paused on Debug with its Custom quality and
original preferences restored: aim preview off, health bars on, cloud guides
off, control hints off, and F3 off. The ignored captures are
`logs/visual-runs/2026-11-07-pause-debug/debug-tab.png`,
`logs/visual-runs/2026-11-07-pause-debug/narrow-debug-tab.png`, and
`logs/visual-runs/2026-11-07-pause-debug/short-debug-tab.png`.

Known intermittent fast-fall/Rapier and partial-height-rubble failures remain tracked in
[TODO](TODO.md#development-follow-up-ci-rigid-debris-validation); the passing
menu gate does not resolve them. Existing local logger gaps remain tracked in
[TODO](TODO.md#development-follow-up-local-diagnostics).
