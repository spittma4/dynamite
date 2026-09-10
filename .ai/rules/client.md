# resources/js/game/ — the Phaser client

- Phaser 4.2, TypeScript strict, one Vite entry `resources/js/game/main.ts` (added to
  `vite.config.js` `input` next to `app.js`; alias `@shared` → `./shared/src`).
- The client renders from state and sends input. It never mutates state and never decides
  a mini-game outcome. Own-avatar prediction only, reconciled with `PlayerState.seq`.
- Everything is drawn in Phaser (Graphics, Container, Text, simple sprites); no DOM UI
  inside the game. The mount is `#game` with `data-*` attributes per the contracts §6.
- Scenes: `Boot` → `Factory` → `Report`. Overlays are Phaser containers mounted by
  `minigames/Host.ts` from the registry in `minigames/index.ts` (station type → class).
- Squares with faces are the M1 art budget. Colour palette index from `PlayerState.colour`;
  red line hat; soot tint when `sooted`.
- Keys: WASD/arrows walk; `E` interact; `Space` action; `Esc` leave; `Q`/`E` selectors;
  `Tab` order board; `Shift`+arrows emotes; `~` debug overlay. Inside an overlay the same
  keys drive the mini-game.
- Effects come from `fx` messages; keep them cheap (tweens, particles, text pops).
- Audio shipped in M1 (F18). `resources/js/game/audio/` owns the only `AudioContext` in the
  client — never create another. Call `gameAudio.play(cue)` or book ahead with `at()`; every
  cue is declared in `audio/cues.ts` with a `seenAs` naming the visual that carries the same
  fact, and a test fails if one is added without it. Audio is never the only channel.

## Verified `@colyseus/sdk` 0.18 API (from the current docs — prefer this over memory)

- `import { Client, Callbacks } from '@colyseus/sdk'`; `const client = new Client(wsUrl)`;
  `const room = await client.joinOrCreate<FactoryState>('factory', { ticket })`.
- State listeners: `const cb = Callbacks.get(room)`;
  `cb.onAdd('players', (player, sessionId) => { cb.listen(player, 'x', (v, prev) => …) })`;
  `cb.onRemove('players', (player, sessionId) => …)`; `cb.listen(room.state, 'groove', …)`.
  Do not use the removed `room.state.players.onAdd(...)` style.
- Messages: `room.send('input', { dx, dy, seq })`; `room.onMessage('fx', (m) => …)`.
- Reconnect: keep `room.reconnectionToken`; `client.reconnect(token)` within the grace window.
- Phaser 4.2: the dedicated Phaser 4 doc index is thin; use the Phaser 3.90 docs
  (`/phaserjs/phaser`) for `Game`, `Scene`, `Graphics`, `Container`, `Text`, keyboard input —
  the scene/game-object API carried over — and check the Phaser 4 release notes for
  renderer/texture changes before relying on anything beyond those basics.

## A sign a panel quotes is derived from the level, never a constant
The floor's shelf signs are built by `shelfLabel('in', station.inputShelf.accepts, …)` out of the level
JSON, so any sentence that quotes one reads the same level — `kegShelfSign(level)` in
`render/dropTargets.ts`. A `KEGS_IN` constant built for `['keg']` was quoted by the help panel and the
Slammer's hands panel; playtest N2 added `parts` to that shelf, the floor began painting
`KEGS · FUSE SETS IN`, and both panels went on sending players to a sign that no longer exists. Pass the
derived string in (`HelpFacts.assemblyShelf`, `handsLinesKeg(throwTiles, inSign)`) and assert the row
against `shelfLabel(...)` rather than a literal, or the drift returns with the next `accepts` change.
