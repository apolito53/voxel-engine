# Testing

Choose the smallest checks for the changed behavior and its direct consumers.
Use the same focused checks during iteration and at an ordinary commit or push.
The [codebase index](../CODEBASE_INDEX.md#task-router) routes to system owners;
the table below maps those systems to runnable checks.

## Focused engine tests

These aliases run selected cases from the existing engine robustness suite.
They bundle the complete TypeScript test registry so Node can resolve its
browser-oriented imports, then execute only the selected test bodies. They do
not run typechecking, source hygiene, docs checks, a build, or browser sessions.
Run those checks separately when the change calls for them.

| System or behavior | Command | Coverage and related consumers |
| --- | --- | --- |
| Terrain and world | `npm.cmd run test:world` | Seeded profiles/trees, chunks, meshing/materials, streaming, raycasts, storage/migrations. Add lighting for light producers, partial terrain for damaged geometry, workers for shared scheduling, and inventory for save contracts. |
| Lighting and atmosphere | `npm.cmd run test:lighting` | Lamp field/proxy lifecycle, light workers, sky/clouds/day-night, shadows/guides, sun glare. Add world for full-chunk mesh attributes, partial terrain for cavity/geometry consumers, and debris for fragment consumers. |
| Partial terrain and damage | `npm.cmd run test:partial-terrain` | Terraformer brushes, lattice damage, partial mesh regions/cavity lighting, collision boxes, crater marks. Add player for traversal, cores for swept hits/previews, debris for support invalidation, and world for saves. |
| Player | `npm.cmd run test:player` | Movement modes, steps/vaults/clambers, footprint support, partial collision, sprint FOV, pointer-lock detection. Add partial terrain for geometry contracts and cores for held-item launch behavior. |
| Cores | `npm.cmd run test:cores` | Physics/hitscan firing, launch rules, trajectories/aim previews, terrain hits, lifetimes, tuning, and toy contacts. Add partial terrain for carving/material truth and debris for shard contacts. |
| Debris and rubble | `npm.cmd run test:debris` | Fragment counts/shapes/rendering, cleanup, pressure, Rapier admission/support, settling, rubble. Includes existing intermittent Rapier cases; see [the watchlist](../TODO.md#development-follow-up-ci-rigid-debris-validation). |
| Inventory and items | `npm.cmd run test:inventory` | Item action descriptors, containers, stable selections, hotbar lanes/scrolling, click fire mode. Add world for saved inventory metadata and menus when UI bindings change. |
| Menus | `npm.cmd run test:menus` | Pause tabs, keyboard focus/disposal, setting location/bindings, deletion wording, release-note parsing. Add the affected setting/item group when behavior also changes. |
| Builder and admin tools | `npm.cmd run test:builder` | Builder brushes, admin parsing/fixtures, target highlight. Terraformer belongs to partial terrain. |
| Nova companion | `npm.cmd run test:companion` | Pilot reactions/offset, context journal, local chat, terminal routing. Add diagnostics when event contracts change. |
| Audio | `npm.cmd run test:audio` | Persisted audio settings/volume normalization. Browser audio unlock, actual sound, and teardown need a relevant manual/browser check. |
| Shared workers | `npm.cmd run test:workers` | WorkerPool priority, telemetry, dispatch, fallback, and revision guards. Add world, lighting, or partial terrain for the affected job payload/result consumer. |
| Diagnostics and runtime helpers | `npm.cmd run test:diagnostics` | Combat/hitch logging, event bus, frame-loop pause/resume policy, timing/FPS helpers. |
| Automation helpers | `npm.cmd run test:automation` | Avatar planning, Codex pilot input normalization, scenario/recorder helpers. This does not launch Chrome or execute a visual scenario. |
| Shared quality settings | `npm.cmd run test:settings` | Preset/custom normalization, scheduler/distance invariants, physics object budgets. Add the system consuming changed settings. |

Combine groups or select by test title without running unrelated cases:

```powershell
npm.cmd run test:focused -- --group player --group partial-terrain
npm.cmd run test:focused -- --group lighting --name "sun glare"
npm.cmd run test:menus -- --name "pause menu"
npm.cmd run test:focused -- --group inventory --filter "hotbar"
```

- `--group <name>` is repeatable; groups form a union. Group names are exact
  and case-sensitive, as listed in the table's commands.
- `--name <text>` and its alias `--filter <text>` match literal,
  case-insensitive substrings of registered test titles. They are repeatable
  and form a union; they do not accept regular expressions or glob patterns.
  For example, `--name "hotbar" --name "inventory"` selects either substring.
- When groups and names are both supplied, names refine the group union.
  Each selected case runs once, in its original registration order.
- Unknown options/groups, missing or blank values, each name with no registered
  match, and an empty combined selection fail with a nonzero exit code. A valid
  selector does not hide another invalid selector in the same request.
- With no arguments, `test:focused` (or `node scripts/run_tests.mjs`) runs all
  engine cases, still without the surrounding full-gate checks.

## Discovery and selector checks

```powershell
npm.cmd run test:focused -- --list
npm.cmd run test:focused -- --group lighting --name "sun glare" --list
npm.cmd run test:groups
npm.cmd run test:selectors
```

`--list` reports all group counts plus selected names, owning groups, and count.
`--check-groups` (the `test:groups` alias) checks the complete registry for
unclassified or ambiguously classified titles, duplicate names, and empty
groups. Both modes prepare the registry but execute no engine test bodies;
selectors still undergo the same validation. Every normal focused/full engine
run also checks complete group coverage before running its selection.

[scripts/test_groups.mjs](../scripts/test_groups.mjs) owns the name-family map.
Each engine case has one primary system group; direct consumers can require
several groups. Update this map and the table when a new family/system appears.
There are no intentionally separate engine cases or corpus/performance runs in
these groups. The focused suite contains robustness checks, including some
bounded stress cases, rather than a browser playtest or a performance benchmark.

`test:selectors` uses Node's built-in test runner for the argument, selection,
coverage, and execution-boundary contracts in
[tests/test_selection.test.mjs](../tests/test_selection.test.mjs). Its real-entry
checks exercise listing/error paths without running engine cases. Keep it
focused when changing [the selection layer](../scripts/test_selection.mjs) or
[the full gate](../scripts/run_full_tests.mjs).

## Full gate and other checks

| Check | Command | When to use it |
| --- | --- | --- |
| TypeScript | `npm.cmd run typecheck` | Changed source/shared types or direct consumer contracts. |
| Source hygiene | `npm.cmd run source:check` | Source encoding/hygiene changes; also part of the full test command. |
| Documentation links/index limits | `npm.cmd run docs:check` | Documentation/routing changes. Pair with `git diff --check`. |
| Full tests | `npm.cmd test` | TypeScript, source hygiene, selector regressions, every engine case, and docs links, in fail-fast order. Accepts no arguments; use `test:focused` for selectors. |
| Production build | `npm.cmd run build` | Required delivery build or a changed bundling/runtime boundary. A build alone does not require every test. |
| Full local validation | `npm.cmd run validate` | Full tests, production build, and whitespace diff check. Appropriate for milestones, shared infrastructure/high-risk changes, or explicitly requested gates. |

GitHub push/PR CI to `main` still runs `validate`. Report the checks that actually
ran and their boundary; a focused pass does not establish that skipped gates
passed. The known large vendor chunk warning is expected unless the build fails.

Use a real browser for affected startup, worker/rendering, integration, and
browser-only boundaries, and visually check changed layout/style/text. Use
Chrome for pointer lock and first-person feel. Select relevant
[visual scenarios and playtests](automation.md) separately; no focused command
starts services, opens browsers, or changes saved worlds. Performance work
starts with a named repro and fresh [diagnostics](performance-hitch-logging.md).
