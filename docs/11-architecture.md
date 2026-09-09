# 11 — Architecture

## The decision in one paragraph

*Confirmed by Sam on 2026-09-04 via the plan review: option B (Laravel + Node/Colyseus) and
Livewire + Flux for the shell.*

**Laravel owns the company. Node owns the factory floor.** Laravel (13.x, PHP 8.4) handles
accounts, factories, saves, upgrades, level config, run history, and admin; it talks to
Postgres. A small **Colyseus** (0.18) game server in TypeScript runs the authoritative 20 Hz
simulation for each active room and never touches the database. The browser runs a
**Phaser 4** client for the floor and a **Livewire + Flux** shell for everything around it.
**Reverb** stays — for the lobby, not the tick.

See [ADR 0001](decisions/0001-authoritative-node-game-server.md),
[0002](decisions/0002-colyseus.md), [0003](decisions/0003-phaser-over-pixi.md),
[0007](decisions/0007-livewire-flux-shell.md).

## Why not run the sim in Laravel + Reverb?

It was the first instinct and it's worth being precise about why not.

| Concern | Reverb-as-game-server | Colyseus |
|---------|-----------------------|----------|
| What it is | Pusher-protocol **pub/sub broadcaster** | Room-based **authoritative state server** |
| Sim loop | You'd write a long-running Artisan command with a ReactPHP/Amp event loop and hand-roll rooms, tick, and reconnection | `setSimulationInterval`, rooms, `onJoin/onLeave`, reconnection tokens are the framework |
| Player input path | HTTP POST (~30–60 ms + no ordering) or Pusher client events (fire-and-forget, no server-side handler as a first-class concept) | `room.send()` → `onMessage()`, ordered, ~RTT/2 |
| State sync | JSON blobs on every broadcast, or you write delta encoding | `@colyseus/schema` binary deltas, only changed fields go on the wire |
| 8 players × 20 Hz | Fighting the framework the whole way | The shape it was built for |
| Where PHP shines | Auth, CRUD, admin, persistence, config validation | — |

Reverb is kept for what it's good at: broadcasting *"Priya joined your factory"*, *"shift
started"*, and live **Payday vote tallies** to the Livewire screens, where Laravel is already
the source of truth.

## Topology

```
┌─────────────────────────── Browser ───────────────────────────┐
│  Livewire + Flux shell        │   Phaser 4 game client (TS)   │
│  login · lobby · factory ·    │   renders state, predicts own  │
│  upgrades · admin · report    │   avatar, runs mini-game UI    │
└──────┬────────────┬───────────┴───────────────┬───────────────┘
       │ HTTPS      │ WS (Reverb)               │ WS (Colyseus)
       ▼            ▼                           ▼
┌────────────────────────────┐        ┌──────────────────────────┐
│  Laravel 13                │  HMAC  │  game-server (Node 22)   │
│  auth · factories · levels │◀──────▶│  Colyseus 0.18           │
│  runs · admin · Reverb     │  HTTP  │  FactoryRoom: 20 Hz sim  │
└──────────────┬─────────────┘        │  stateless between rounds│
               ▼                      └──────────────────────────┘
        ┌────────────┐
        │  Postgres  │
        └────────────┘
```

## The seam: three internal calls

All Laravel ↔ Node traffic is server-to-server over HTTP with a shared HMAC secret
(`GAME_SERVER_SECRET`). Node has no DB credentials.

| Direction | Call | When |
|-----------|------|------|
| Browser → Laravel | `POST /game/ticket` → `{ ticket }` | Player clicks *Enter factory*. Ticket = HMAC-signed `{ userId, factoryId, name, exp: +60s }`. |
| Node → Laravel | `GET /internal/factories/{id}/config` | Room create. Returns the **merged** level config + owned upgrades as one JSON blob. Node caches it for the room's life. |
| Node → Laravel | `POST /internal/runs` | Day end. Body = the metrics report + grade + P&L (computed with `shared/sim/grade.ts`) + per-player stats. Laravel writes `runs` + `run_players`, credits coin, opens Payday, broadcasts `DayEnded` via Reverb. |

Colyseus `onAuth(client, { ticket })` verifies the HMAC and expiry, then `onJoin` creates the
`PlayerState`. Reconnection uses Colyseus's built-in `allowReconnection` (30 s grace).

## Repo layout (monorepo, one Laravel app + one Node package)

```
dynamite/
├── app/ …                      Laravel (Actions, Models, Livewire components)
├── resources/js/
│   ├── app.ts                  Livewire/Flux bootstrap
│   └── game/                   Phaser client — scenes, entities, minigames, net/
├── game-server/                Node + Colyseus (own package.json, tsconfig)
│   └── src/rooms/FactoryRoom.ts, sim/ (imports ../shared)
├── shared/                     TS shared by client + server: schema types, sim/*.ts
│                               (pure functions: curve, groove, overflow), config JSON schema
├── config/game/levels/*.json   Level configs (seeded into `levels` table; admin edits DB copy)
├── docs/
└── vite.config.ts              Builds app.ts and game/ as two entries
```

`shared/` is the only way client and server agree on rules. Laravel validates admin-edited
configs against `shared/config.schema.json` (via a PHP JSON-schema validator) so Node never
receives a malformed level.

## Dev loop

- **Laravel via Herd** at `dynamite.test`. Herd serves PHP, so `composer run dev` only needs
  to run `vite`, `reverb:start`, and `queue:listen` — drop `serve` from the default script.
- **Postgres** via Herd's bundled `psql`/services (or Docker if you'd rather). Stick to plain
  Postgres features (jsonb, no extensions) so hosting stays boring.
- **Game server** `cd game-server && npm run dev` (tsx watch) on `:2567`.
- One `.env` key each way: `GAME_SERVER_URL`, `GAME_SERVER_SECRET`, and on the Node side
  `LARAVEL_URL`, `GAME_SERVER_SECRET`.

## Deploy (private, don't go crazy)

One VPS. nginx → PHP-FPM for Laravel; Reverb as a systemd service on `:8080`; the game server
as a systemd service on `:2567` (Colyseus has a `@colyseus/tools` `listen()` that handles
this); Postgres local. nginx proxies `/reverb` and `/game` WebSocket paths so the browser
only ever talks to one host. Forge or a hand-written nginx config both work; there is no
autoscaling story and there doesn't need to be.

## Client architecture (Phaser)

- `BootScene` → `LobbyGateScene` (asks Laravel for a ticket, joins the room) → `FactoryScene`.
- `FactoryScene` owns the tilemap, entity sprites, the HUD, and a `NetClient` that applies
  Colyseus schema callbacks to entity views.
- Own-avatar **prediction**: apply input locally at once, reconcile to server position with
  a small lerp. Others: interpolate between the last two server positions.
- Mini-games are **Phaser containers** (not DOM) mounted by `MinigameHost` when the server
  says `player.stationId` is set and you're on a work tile. They send inputs as
  `room.send('mg', { stationId, step, value, t })`. The server judges.
- Debug overlay is a text layer driven purely by state.

## What is deliberately *not* here

- No matchmaking. A factory is a private room; you join by being a member.
- No horizontal scaling of game servers. One process, N rooms, `maxClients: 10` per room
  ([19](19-scaling-3-to-10.md)). Fine to ~60 concurrent players.
- No client-side authority for anything that affects score.
- No ORM on the Node side. It gets a config blob and returns a metrics blob.
