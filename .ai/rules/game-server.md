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

## Restart the server after any `shared/` or `config/game/` change

`tsx` does not watch, and `schema.json`, the level JSON and the compiled sim rules are all
read into memory once at boot. A server left running across a config or schema change keeps
validating against the copy it loaded, so the disk, the tests and the DB can all be correct
while the game refuses to start.

The symptom is a join failure naming a key that plainly exists:
`COULDN'T CLOCK IN — /stations/1/minigame/crimp/leadSeconds: is not a key this schema knows`.
Nothing in any suite catches it — every test imports the current files.

After touching `shared/src/**` or `config/game/**`: kill whatever holds :2567 and restart
`cd game-server && npm run dev`. If the change was to a level or layout, run
`php artisan game:levels:sync` too — the `levels` table holds seeded copies, and a room built
from a stale row serves the old numbers even after a restart.
