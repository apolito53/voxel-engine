# Project Instructions

## Start Here

Read [README.md](README.md), [WORKING_MEMORY.md](WORKING_MEMORY.md), and
[CRYSTALIZED_MEMORY.md](CRYSTALIZED_MEMORY.md) when starting or resuming
substantive work. Use [CODEBASE_INDEX.md](CODEBASE_INDEX.md#task-router) to find
the relevant owners, then read only the focused docs needed for the task.
Consult [TODO.md](TODO.md) for actionable work and [SPITBALL.md](SPITBALL.md)
for tentative ideas when planning. A backlog entry does not authorize its
implementation.

On Anthony's machine, also follow `C:/Users/apoli/projects/AGENTS.md`, including
its model roles and delegation defaults, storage conventions, port registry,
local logging standard, and implementation closeout. These rules also apply to
this project's managed worktrees outside that directory. Current task-specific
instructions take precedence over defaults.

Inspect the branch, remote, and dirty/staged work before editing. Preserve
concurrent work and respect the current writer's ownership; use an isolated
worktree when necessary.

## Source And Documentation Ownership

- Executable behavior belongs to the focused owners in `src/`, runtime and
  validation tooling in `scripts/`, and server handlers in `api/`. Confirm
  changeable claims against their owning source.
- Maintain [player release notes](PLAYER_CHANGELOG.md) alongside production
  releases. The start and pause menus display these; `CHANGELOG.md` retains the
  technical history.
- [CODEBASE_INDEX.md](CODEBASE_INDEX.md) is the compact task router and
  ownership map. Keep it below 30,000 bytes, with lines no longer than 320
  characters. Update affected routes when owners or entry points change.
- [docs/architecture.md](docs/architecture.md) owns deeper runtime contracts,
  extraction boundaries, and parked architectural decisions. Follow its
  main-thread/worker, durable terrain, and resource-disposal boundaries.
- [docs/README.md](docs/README.md) routes to focused controls, destruction,
  companion, diagnostics, and automation documentation. Extend the owning doc
  instead of copying its contents into an index or memory file.
- Update incoming links in the same change that adds, renames, or retires an
  important document. Keep README and codebase-index routes useful.

## Memory, Tasks, And Ideas

- [WORKING_MEMORY.md](WORKING_MEMORY.md) is a short, replaceable snapshot of
  current state, unresolved work, verification, and the next useful action.
  Rewrite obsolete context; do not append a session diary. Completed work can
  leave a brief completion state without inventing another task.
- [CRYSTALIZED_MEMORY.md](CRYSTALIZED_MEMORY.md) holds selective durable
  decisions, constraints, and lessons with reasons and source links. Integrate
  corrections and remove superseded material rather than accumulating history.
- [TODO.md](TODO.md) holds concrete work. [SPITBALL.md](SPITBALL.md) preserves
  possibilities, questions, and playful experiments. When an idea is chosen,
  move or link its concrete steps into TODO without creating competing lists.

Maintain these files during substantive work and before handoff. Keep them
project-specific, concise, and supported by evidence. Exclude credentials,
private personal continuity, command transcripts, and generated log bulk.

## Runtime And Validation

Before starting or changing a dedicated-port service, consult the central
`C:/Users/apoli/projects/PORT_REGISTRY.md` and current listeners; register the
assignment before launch. A stopped service retains its reservation. Do not
silently fall back to another port or stop an unrelated process.

Use [docs/performance-hitch-logging.md](docs/performance-hitch-logging.md) for
diagnostics. Start a fresh pass and inspect current logs/F3 counters before
performance changes. Preserve useful repro evidence and keep generated logs
untracked. Track verified logging-standard gaps in TODO rather than declaring
coverage from instructions alone.

- Documentation or routing changes: `node scripts/check_docs_links.mjs` and
  `git diff --check`.
- Behavior changes, including shared helpers: run the smallest useful tests for
  the changed behavior, affected direct consumers, and shared contracts, plus
  relevant lint or `npm.cmd run typecheck`. Use the same checks during iteration
  and at ordinary commit or push. Choose native groups or title selectors from
  [the testing guide](docs/testing.md); `npm.cmd run test:focused` runs only
  selected engine cases. `npm.cmd run test` retains the full gate and rejects
  arguments. Keep group ownership and its documented command map current.
- A planned milestone or release checkpoint or a broad, high-risk, or
  shared-infrastructure change can justify `npm.cmd run validate`. Run checks
  explicitly requested by the task. A build, deployment, ordinary commit, or
  push alone does not require the full local suite; honor required delivery
  builds, GitHub push/PR CI, and task-specific gates.
- For layout, style, or text changes, visually check the affected surface;
  run behavior tests only when behavior also changes. Smoke-test startup,
  integration, or browser-only runtime boundaries in a real browser when
  affected, including worker, rendering, lighting, or pointer-lock behavior.
  Use Chrome for pointer lock and first-person feel.

Use [docs/testing.md](docs/testing.md) for the system-to-command map and
[CODEBASE_INDEX.md](CODEBASE_INDEX.md#validation) for validation routing.
Do not search generated `node_modules/`, `dist/`, or `.test-dist/` during routine
source discovery. Keep `.env.local`, `.vercel/`, tokens, and other secrets out
of output and commits.

## Implementation Closeout

Run relevant checks, update affected documentation/memory/planning files, and
commit only the intended changes. Fetch and reconcile the normal delivery
branch, usually `main`, before integration; preserve unrelated work and never
force-push. Completed authorized implementation includes pushing to the existing
remote and reading back the branch SHA. Check the resulting configured CI or
deployment status relevant to delivery and report what was actually verified.

Routine commit/push needs no additional permission. Use a PR when requested or
required by remote protection. A task-specific local-only or experimental-branch
instruction overrides the default; this does not authorize publishing older
pending work. Scheduled housekeeping retains its no-commit/no-push scope.
