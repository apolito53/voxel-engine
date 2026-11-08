# Working Memory

Current handoff: 2026-11-07, pause workspace for `v0.21.0`.

The menu now keeps Settings, Inventory, and Builder visible as primary tabs,
with Resume in a pinned header and Nova Terminal, Exit to Home, and player
release notes in a pinned footer. A responsive content area replaces the narrow
submenu stack. Settings groups existing controls into Graphics, World & Time,
Tools & HUD, Audio, Physics, and Experimental, with a desktop category rail,
wrapped narrow-screen categories, and short section headings. The full mapping
and keyboard behavior live in [controls](docs/controls.md#world-flow).

`menuNavigation.ts` owns selected/hidden DOM tabs, roving focus, arrow/Home/End
keys, and focus containment. `main.ts` retains runtime pause/resume and shortcut
policy. The first pause in each loaded world opens Settings > Graphics; tab
choices then last for the world session. I opens Inventory and closes it back
to play, while actual text-entry controls keep their typing behavior. Escape
closes release notes before resuming, and held-key repeats cannot peel through
layers or oscillate pause/play. Inventory content, saved preferences, world
storage, rendering, physics, dependencies, services, and port assignments keep
their existing owners and behavior. Every preexisting pause control ID remains.
New-world content/category scroll resets defer until the first visible pause;
hidden menus have no layout box, so assigning scrollTop during load is ineffective.

The final full `validate` passed all 358 engine robustness tests (352 existing
plus six menu contracts), typecheck, source hygiene (109 files), documentation
links (17 files), production build, and whitespace checks. The focused menu
subset also passes. The exact final source passed on its first run, including
the reviewed shortcut, focus-reveal, and visible-layout scroll-reset fixes.
Ignored receipts are `logs/menu-overhaul-validate-final.log` and the earlier
`logs/menu-overhaul-validate.log`. A prior menu gate reproduced the known
fast-fall/Rapier failure and passed on one rerun; its original output is preserved
in `logs/menu-overhaul-validate-rapier-fast-fall.log`. No physics change is implied.

Live IAB review passed at 1280x720, 390x844, 844x390, and 390x390: no horizontal
overflow, pinned header/footer, visible End/Home category focus, and no outer
shell/page scroll. Release notes display player-facing v0.21.0 changes, contain
Tab/Shift+Tab, close with Escape before the pause menu, and return trigger focus.
Pause focus wraps between Resume and the footer. I works from sliders
and respects text-entry/select controls. Inventory selection and Resume returned
to play with actual IAB pointer lock. Exiting while Graphics was scrolled down,
reloading the owned Sky Review world, and pausing restored Settings/Graphics
with content and rail scroll both zero. Existing user maps were untouched.
The final desktop capture is ignored
`logs/visual-runs/2026-11-07-menu-overhaul/desktop-graphics-final.jpg`.

Chrome was unavailable in the browser inventory, so a separate Chrome smoke
was not performed. The Escape-repeat guard was source-reviewed; live held-key
autorepeat could not be exercised through the available browser controls.
Implementation, independent source review, and the available browser checks
are complete. Git history and configured CI/deployment results remain the
publication records.

The prior sun-glare contracts and GPU receipts remain in
[lighting and sky](docs/architecture.md#lighting-and-sky),
[automation](docs/automation.md#codex-pilot-bridge), and ignored
`logs/visual-runs/2026-11-07-sun-glare/`. Known intermittent fast-fall/Rapier and
partial-height-rubble failures remain tracked in
[TODO](TODO.md#development-follow-up-ci-rigid-debris-validation); a passing menu
run does not resolve them. Existing local logger gaps remain tracked once in
[TODO](TODO.md#development-follow-up-local-diagnostics).
