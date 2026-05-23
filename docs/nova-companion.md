# Nova Companion

Nova is currently a local companion layer: visible pilot, reactions, contextual
terminal, and admin command routing. No OpenAI/API credentials live in browser
code.

## Nova Pilot

- `N` toggles the Nova Pilot companion.
- `B` asks Nova to throw a physics core from her own position.
- The pilot follows/orbits the player and emits local reaction pulses/chatter
  from engine events.

Key implementation owners are listed in `CODEBASE_INDEX.md`, especially
`src/novaPilot.ts`, `src/novaPilotReactions.ts`, `src/novaContext.ts`,
`src/novaChat.ts`, and `src/novaChatPanel.ts`.

## Nova Terminal

`Enter` or `F9` opens Nova Terminal. It accepts normal local chat plus commands.

Known commands include:

- `help`
- `superflat`
- `/spawn target`
- `spawn target [block]`
- `spawn wall [block] [width] [height]`
- `spawn pillar [block] [height]`
- `spawn platform [block] [size]`

The terminal uses the local runtime context journal so replies can reference
recent engine events such as world state, selected item, quality preset, block
damage, rubble events, and frame hitches.

## Future Model Hook

The parked direction in `TODO.md` is an optional live Nova chat path:

- Keep API credentials out of browser code.
- Use a tiny local/backend proxy for model calls.
- Start with explicit player-initiated text chat so token usage stays
  controlled.
- Feed the model the existing compact game context from the event bus journal.
- Consider realtime voice only after text chat proves useful.

Until that exists, Nova Terminal is deliberately local-only and browser-safe.
