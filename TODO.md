# TODO

Shortlist of ideas worth keeping visible without pretending they are committed scope yet.

## Future Nova Chat Hook

- Add an optional live Nova chat path so the in-game companion can answer typed player questions with a real model response instead of only canned local reactions.
- Keep API credentials out of browser code. The safe shape is a tiny local/backend proxy for text chat, then a browser-safe short-lived token flow if we later move to realtime voice.
- Feed Nova compact game context from the engine event bus: active world name/seed, selected block, quality preset, player speed/mode, recent block damage, rubble events, and frame hitches.
- Start with explicit player-initiated chat so token usage is controlled. Event-triggered autonomous commentary can stay canned or heavily rate-limited until the behavior is actually fun.
- Likely first implementation: pause-menu or hotkey chat panel that streams Responses API text into the Nova HUD/chat log.
- Later stretch goal: Realtime API voice mode, if it still feels useful once the text version proves itself.

Official docs to re-check before implementation:
- Responses streaming: https://developers.openai.com/api/docs/guides/streaming
- Realtime WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
- Realtime client secrets: https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets
