# game-server/ — the authoritative simulation

- Node 22, TypeScript, ESM, `tsx` for dev, vitest for tests. Colyseus 0.18.5.
- One process, N rooms. Room `factory`, `filterBy(['factoryId'])`. The room owns the
  20 Hz `setSimulationInterval`; systems in `src/sim/*` are plain modules that take a
  `World` and never import Colyseus (only `FactoryRoom` does).
- The server judges every mini-game input against its own clock (`world.now()` in
  seconds, monotonic from shift start), tolerating the client's `t` by ±RTT/2. The client
  never decides an outcome.
- State mutation happens only inside the tick or a message handler; systems expose
  `tick(world, dt)` and small verbs (`items.deliverOutput(world, station, item)`,
  `hazards.spark(world, x, y, cause)`, `stations.completeCycle(world, station, opts)`,
  `day.endShift(world, reason)`) named in the feature docs.
- Seeded RNG on the world (`world.rng()`); tests pass a fixed seed or a stub.
- Env via `dotenv`: `PORT`, `LARAVEL_URL`, `GAME_SERVER_SECRET`, `LEVELS_DIR`,
  `DEV_ALLOW_NO_TICKET`. Never log the secret.
- Tests: unit-test the systems on a hand-built `World` with a tiny layout (e.g. 8×6) —
  no sockets. One smoke test may boot a room with `@colyseus/testing`
  (`colyseus.sdk.joinOrCreate('factory', opts)`) if cheap.

## Verified Colyseus 0.18 API (from the current docs — prefer this over memory)

- Bootstrap: `import { defineServer } from '@colyseus/core'` and
  `import { WebSocketTransport } from '@colyseus/ws-transport'`;
  `const server = defineServer({ transport: new WebSocketTransport({ server: httpServer }) })`
  with a manual `http.createServer(app)` (Express optional). The `colyseus` meta-package
  re-exports these. Check `node_modules/colyseus` for the exact export names before use.
- Rooms: `class FactoryRoom extends Room { maxClients = 10; state = new FactoryState();
  messages = { input: (client, payload) => {…}, … }; onCreate(options) {} onJoin(client,
  options) {} onLeave(client, code) {} onDispose() {} }` — the declarative `messages` map
  replaces `this.onMessage(...)` registrations (0.16+). `onAuth(client, options, context)`
  returns the auth data (`{ userId, name, factoryId }`) or throws.
- Simulation: `this.setSimulationInterval((dt) => …, 50)` for 20 Hz; `dt` is milliseconds.
- Reconnection: in `onLeave`, `await this.allowReconnection(client, 30)` inside try/catch.
- Room filtering: `filterBy(['factoryId'])` when defining the room so one room per factory.
- Schema fields marked `.fullStateOnly()` are only sent at join; set them in `onCreate`.

## Do not start a game server — the owner runs one

Sam keeps `cd game-server && npm run dev` in a terminal tab. Starting a second one fights for
:2567 and doubles the memory. Check first (`lsof -nP -iTCP:2567 -sTCP:LISTEN`) and use the one
that is there. If it needs restarting, ask — do not kill a process you did not start.

## `tsx watch` does not reload a JSON change

`npm run dev` is `tsx watch src/index.ts`, and `game-server/src/shared.ts` re-exports
`../../shared/src/index` by relative path, so `.ts` edits under `shared/` do reload.
`shared/src/config/schema.json` is a JSON import and was observed NOT to reload: a server left
running across a `schema.json` edit kept validating against the copy it booted with.

The symptom is a join failure naming a key that plainly exists:
`COULDN'T CLOCK IN — /stations/1/minigame/crimp/leadSeconds: is not a key this schema knows`.
Nothing in any suite catches it, because every test imports the current files. Restarting the
server clears it.

If the change was to a level or layout, run `php artisan game:levels:sync` too — the `levels`
table holds seeded copies, and a room built from a stale row serves the old numbers even after
a restart. That sync is also how a fresh level reaches an already-running server, which is why
a stale schema and a fresh level can collide in exactly the way above.
