# 00 — Contracts v2 (read before any feature doc)

Every feature is built by someone who has not read the other features. This file is the
agreement between them: who owns which file, the shapes that cross boundaries, and the names
everyone must use. **A feature that needs to change a contract changes this file first and says
so in its doc.** Where a feature doc and this file disagree, this file wins.

**v2.1 (2026-09-05)** — v2 reconciled the twelve feature docs (~80 change requests, 43 issues);
v2.1 applied the re-check's 6 blockers + 10 majors: `ScaledLevel` without `players`, `Axis`/
`peakWorkers`/`OrdersConfig` single-owner, `RunTally.destroyedByType`, `onMessage` `t` = raw ms,
the stub rule for `sim/{stations,tally}.ts`, copy shipping in wave 1, test-file ownership, and the
writer-table gaps. **v2.2 (2026-09-09)** — `RunTally.wastedByType` + `scrap(type)` split the P&L's
counter from the report's hazard lines, so scrapped material is billed as waste without being
reported as an explosion or a fizzle (§9, §10.7). **v2.3 (2026-09-09)** — the money is integral by
schema (`economy.price.*` and `economy.wasteCost.*` are `integer`, because Laravel rejects a
fractional `pnl.profit`), `pnl.waste` bills every type the level prices, and `materials.shipped`
counts sticks loaded onto a truck (§9, §10.7). **This file wins over any feature doc.**

Design source: `docs/00`–`19` and `docs/decisions/`. This file is the implementation-level
distillation for M0 + M1 (the MVP: Powder → Assembly → Dock, 3–6 players, one line). v2 absorbs
the contract changes requested by F01–F12 and the reconciliation of their module APIs; §10–§13
are the reconciled surfaces.

## 1. Repository layout and ownership

```
dynamite/                       Laravel 13 app at the root (created by the Laravel installer)
├── package.json                root: "workspaces": ["shared", "game-server"]; deps for the client   F01 creates; F04 adds client deps + scripts
├── vitest.config.ts            root: runs resources/js/game/__tests__ (script test:client)         F04
├── app/  routes/  database/  resources/views/  config/  tests/     F01 (F12 adds Level::isSandbox, sandbox tests)
├── resources/js/app.js         Livewire/Flux bootstrap                  F01
├── resources/js/game/          Phaser 4 client (TypeScript)             F04 core; F05–F11 add modules (§12)
├── resources/views/play.blade.php   the page that mounts the game       F01 (F04 owns the mount contract, §6)
├── shared/                     TS shared by client + server             F02 core; F03, F05–F10, F12 add sim/*.ts and copy.ts
├── game-server/                Node 22 + Colyseus 0.18 (own package)   F03 core; F05–F11 add sim/*.ts
├── config/game/levels/*.json   level configs (seeded into `levels`)     F12 (F02 owns the schema)
├── config/game/layouts/*.json  tilemaps                                 F12
├── config/game/copy.json       joke lines                               F12 (features append sections, §8)
├── docs/features/              these docs; tick the boxes as you go
└── vite.config.js              two entries: app.js and game/main.ts     F01 creates, F04 adds the entry + alias
```

Rules:
- A feature edits only the files it owns in §12, plus `shared/src/sim/<its-module>.ts` and
  `shared/tests/<its-module>.test.ts`. "Touches" in §12 are one-line edits to another owner's file
  (an import, a registry entry, an export line) and are the only cross-owner edits allowed.
- A feature that adds `shared/src/sim/<module>.ts` (or `shared/src/copy.ts`) appends
  `export * from './sim/<module>';` to `shared/src/index.ts` (F02 owns the file; one line each).
  `shared/src/config/validate.ts` is **not** exported from the barrel (Node-only, ajv).
- `shared` and `game-server` pin the identical `@colyseus/schema` version; the root workspaces make
  it one hoisted copy for the server, the client build and `shared`'s tests.
- The client imports from `@shared` (the barrel `shared/src/index.ts`) only; the server imports
  through `game-server/src/shared.ts` (the one file that knows the relative path); validators are
  imported as `../shared/src/config/validate` (server) or `@dynamite/shared/config/validate`.
- Schema fields, messages and config keys change only through §3, §4, §7, §8 of this file.
- **Test-file ownership follows module ownership:** a feature that owns a `game-server/src/**`
  module also owns `game-server/tests/<module>.test.ts` (mini-games: `tests/minigames/<module>.test.ts`);
  a feature that owns a `resources/js/game/**` module also owns its test under
  `resources/js/game/__tests__/`. F03 owns `game-server/tests/helpers/**` and the core-module tests;
  F04 owns the client `__tests__/` directory and its vitest config.
- **Copy ships in wave 1.** F12 delivers `config/game/copy.json`, `shared/src/copy.ts` and the
  `export * from './copy';` barrel line **in wave 1, before F02's `messages.ts`** (F02's `ConfigMsg`
  type-imports `Copy`; F03/F04 need the runtime value in wave 2). Every other F12 file stays in
  wave 5. Until F10 lands, `Copy.hazards.sparks` is keyed by the local union
  `'slammerRedline' | 'jammed' | 'fizzle' | 'crimpOnDented'`, swapped for
  `import type { SparkCause } from './sim/hazards'` when F10 arrives.
- **Stub rule.** When a wave-N feature's file is typed by a later feature, the earlier owner ships a
  compiling stub and the later owner replaces the body: F03 ships the stub bodies of
  `game-server/src/sim/{stations,tally}.ts` (the §10.2 `Station` interface + a no-op `stationsSystem`;
  the §10.7 `RunTally` class with working counters) until F05 and F11 land; F05 ships the stub bodies
  of `minigames/{slammer,jig,dock}.ts` until F07/F08/F09 land.
- Don't reformat files you don't own.

## 2. Runtime topology and env

| Process | How it runs | Env |
|---|---|---|
| Laravel | Herd serves `https://dynamite.test` (site linked to this dir). `composer run dev` runs `vite` + `queue:listen` (no `serve`). | `DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT=5432 DB_DATABASE=dynamite DB_USERNAME=postgres DB_PASSWORD=` · `GAME_SERVER_URL=http://127.0.0.1:2567` · `GAME_SERVER_WS_URL=ws://127.0.0.1:2567` · `GAME_SERVER_SECRET=<shared>` |
| game-server | `cd game-server && npm run dev` (tsx watch) on `:2567` | `PORT=2567` · `LARAVEL_URL=https://dynamite.test` · `GAME_SERVER_SECRET=<shared>` · `LEVELS_DIR=../config/game/levels` (fallback when Laravel is unreachable; layouts resolved as `path.join(LEVELS_DIR, '../layouts')`) · `DEV_ALLOW_NO_TICKET=1` (dev only: join with `{ name, factoryId }`) |
| Client | built by Vite into the Laravel page | reads `data-*` attributes from the mount div (§6) |

Tick: **20 Hz** fixed step — `this.setTimestep(cb, 50)` in `FactoryRoom` (`setSimulationInterval` is a
deprecated alias in 0.18); catch-up capped at 5 steps per callback. Colyseus patch rate default.

Tile: **32 px**; positions are **tile units** (floats); tile `(tx, ty)` covers `[tx, tx+1) × [ty, ty+1)`;
`tileOf(x, y) = [floor(x), floor(y)]`; a snapped player stands at `tx + 0.5, ty + 0.5`.

Movement (numbers from `level.movement.*`, §13): `tilesPerSecond` 4; carrying `× (1 − carry.slowdown)`
= ×0.8; on a floor-item tile `× movement.floorItemSpeed` (0.4); on a spill tile `× movement.spillSpeed`
(0.6); frozen (×0) while `!connected`, `chore !== ''`, `stunnedUntil > clock`, `drivenOffUntil > clock`,
or `stationId !== ''` at a station whose `StationConfig.joinMode === 'press'` (a `'stand'` station —
the dock — never freezes). `PlayerState.speed` is the effective tiles/s the server used on its last
tick with every multiplier applied. 8-direction from `{ dx, dy }`; diagonals normalised. One
integrator (`shared/src/sim/movement.ts`, §10.8) runs on both sides; soft push, bump and stagger
(`movement.bumpStaggerSeconds`) are server-only.

## 3. Authoritative state — `shared/src/schema/`

Colyseus `@colyseus/schema` 5 classes (F02). The server writes; the client only reads. Types: `n` =
number, `s` = string, `b` = boolean. String unions live in `shared/src/schema/types.ts`.

```ts
FactoryState {
  levelKey s; layoutKey s; day n; phase s ('lobby'|'running'|'ended');
  clock n;                          // seconds; advances every tick in EVERY phase; reset to 0 on `start`
  shiftSeconds n;                   // 0 when day.endsOn === 'never'
  host s;                           // sessionId allowed to send `start` (owner's session if connected, else earliest joiner)
  groove n (0–100); score n; coin n;
  bookTotal n; bookRemaining n;     // orders in the day's book; both 0 when endsOn === 'never'
  players  MapSchema<PlayerState>  (key = sessionId)
  stations MapSchema<StationState> (key = station id from config, e.g. 'powder-a')
  items    MapSchema<ItemState>    (key = item id)
  orders   MapSchema<OrderState>   (key = order id)
  fuses    MapSchema<FuseState>    (key = item id for keg fuses, 't-<packed tile>' for spill-tile fuses)
  spillTiles ArraySchema<n>        // packed tile index y*width + x (packTile)
  scorchTiles ArraySchema<n>
  truck    TruckState
  banner s; bannerUntil n;          // 'WHOOPS'|'INCIDENT'|'EXPLODED'|'NICE SAVE'|'CLEAN SWEEP'|'HOT STREAK'|'TAILGATE'|''
  width n; height n;                // tilemap size
}
PlayerState {
  userId s; name s; colour n (0–7 palette index); line s ('a');
  x n; y n; facing n (0–7, 0 = east, clockwise); moving b; speed n;
  stationId s ('' = on the floor); workTile s ('x,y' or ''); clipboardUntil n;
  carrying s (item id, 'broom', or ''); chore s (''|'stomp'|'unjam'|'sweep'|'repair'); choreUntil n;
  stunnedUntil n; sooted b; combo n;
  bubble s; bubbleUntil n;          // transient speech; text from copy.bubbles.* / copy.emotes.* / clipboard line
  drivenOffUntil n;                 // truck ride
  seq n;                            // last input seq applied (for client reconciliation)
  utilization n;                    // shift-to-date, 0–1 (F11)
}
StationState {
  id s; type s ('boom_powder'|'assembly'|'dock'); line s; anchorX n; anchorY n;
  state s ('idle'|'starved'|'working'|'jammed'|'damaged'); progress n (0–1);
  workers n; efficiency n; interruptsPerSecond n;
  inputShelf ArraySchema<s>; outputShelf ArraySchema<s>; inputCap n; outputCap n;   // caps 0 when the shelf is absent (dock: both 0)
  floorCount n; utilization n (rolling 30 s, F11); jamUntil n; pausedUntil n; beacon s ('off'|'gold'|'red');
  mg s;                             // '' or JSON.stringify of the station's public mini-game object (§7); rewritten only on change
}
ItemState {
  id s; type s ('keg'|'casing'|'stick'|'crate'|'parts');
  x n; y n;                         // tile position when on the floor, in flight, or on a dock lane; -1 when held or shelved
  holder s;                         // sessionId (held), stationId (shelved, or staged on a dock lane), '' (floor/flight)
  shelf s ('in'|'out'|'');
  inFlight b; flightT n (0–1); fromX n; fromY n; toX n; toY n;
  quality n (0.4 dud · 0.7 damp · 1.0 prime); prime b; dents n; fuseLength s (''|'short'|'long'); fill n; capLoose b; frayed b;
  orderId s; lit b;
}
FuseState { itemId s ('' for a spill-tile fuse); x n; y n; secondsLeft n; chain b }   // x/y = the burning tile, kept current for a carried keg
OrderState { id s; product s ('red_stick'); qty n; shipped n; status s ('open'|'partial'|'complete'|'failed'); truckId n; fuseLength s ('short'|'long') }
TruckState { id n; phase s ('away'|'docked'|'leaving'); arrivesAt n; leavesAt n; slots n; loaded n; beepPhase n (0–1) }
```

Rules fixed here:
- **Time base.** Every `*Until` / `*At` field and every timestamp inside `StationState.mg` is in
  `FactoryState.clock` seconds. The client compares with its `ServerClock` estimate of `clock`, never
  `Date.now()`. Client input timestamps (§4 `t`) are `performance.now()` ms and reach `clock` seconds
  only through `World.inputClock` (§10.1).
- **Locations.** Floor: `holder === ''`, `x >= 0`. Held: `holder` = sessionId, `x = y = -1`. Shelved:
  `holder` = stationId, `shelf ∈ 'in'|'out'`, `x = y = -1`. Dock lane: `holder = 'dock-a'`, `shelf = ''`,
  `x/y` = the lane tile. In flight: `holder = ''`, `inFlight = true`. The client draws any item with
  `x >= 0 && !inFlight` at its tile centre; floor accounting (`floorCount`, tile occupancy, drop table)
  counts only `holder === ''`. Two floor items never share a tile.
- `FactoryState.score` is the running report-card score from `gradeDay` (written by F11's metrics
  tick and at day end); nothing else writes it.
- Schema defaults (`new X()`): strings `''`, numbers `0`, booleans `false`, except `day 1`, `phase 'lobby'`,
  `groove 50`, `line 'a'`, `state 'idle'`, `beacon 'off'`, `ItemState.x/y -1`, `quality 1`, `OrderState.product 'red_stick'`,
  `status 'open'`, `OrderState.fuseLength 'long'`, `TruckState.phase 'away'`, `FuseState.x/y -1`.
- Writers by field group: F03 — `levelKey layoutKey day phase clock shiftSeconds host coin width height groove(start)`,
  `PlayerState.{userId name colour line x y facing moving speed seq bubble bubbleUntil stunnedUntil(bump)}`;
  F05 — `StationState.{id type line anchorX anchorY workers efficiency interruptsPerSecond inputCap outputCap pausedUntil jammed-state}`,
  `PlayerState.{stationId workTile clipboardUntil bubble bubbleUntil x y moving (at a press join, the §7 snap)}`; the station's mini-game module —
  `StationState.{state(idle|starved|working) progress mg}` (+ F07 `beacon 'gold'|'off'`, `combo`, `banner 'HOT STREAK'`);
  F06 — `ItemState.*`, `spillTiles`, `StationState.{inputShelf outputShelf floorCount jamUntil}`, `PlayerState.{carrying chore(unjam|sweep) choreUntil stunnedUntil sooted bubble bubbleUntil}`;
  F09 — `truck.*`, `orders.*`, `bookTotal bookRemaining`, `banner 'TAILGATE'`,
  `PlayerState.{drivenOffUntil x y stationId workTile bubble bubbleUntil (at truck departure only)}`;
  F10 — `fuses`, `scorchTiles`, `ItemState.lit`, `StationState.{state('damaged'|'idle' after repair) progress(while damaged) beacon('red'|'off')}`,
  `PlayerState.{chore('stomp'|'repair') x y stunnedUntil sooted}`, `banner 'WHOOPS'|'INCIDENT'|'EXPLODED'|'NICE SAVE'`;
  F11 — `groove` (integration), `score`, `banner 'CLEAN SWEEP'`, both `utilization` fields.
  `beacon`: red wins over gold within a tick (hazards tick after stations).

Ids: items `k-<n>` keg, `c-<n>` casing, `s-<n>` stick, `x-<n>` crate, `p-<n>` parts
(`ITEM_ID_PREFIX`, F02). Stations `<STATION_SHORT[type]>-<line>`: `powder-a`, `assembly-a`, `dock-a`.
Orders `o-<n>`. The broom is not an item: `PlayerState.carrying === 'broom'` is the whole model.

## 4. Messages — `shared/src/messages.ts`

Client → server (`room.send(name, payload)`). Every `t` is the client's `performance.now()` in ms.

| name | payload | meaning |
|---|---|---|
| `input` | `{ dx: -1\|0\|1, dy: -1\|0\|1, seq: number }` | movement intent; sent on change and every 250 ms as a heartbeat; accepted in every phase |
| `interact` | `{ t?: number }` | `E`: pick up / put down / join or leave a work tile / lever / catch / set a stick on a lane. `t` absent → server receipt time |
| `action` | `{ t: number }` | `Space` on the floor: throw if carrying, sweep if carrying the broom on a spill, else stomp if on a lit tile |
| `mg` | `{ stationId, op: MgOp, t: number, v?: number \| string }` | mini-game input; `op` per station (§7) |
| `leave` | `{}` | `Esc`: leave the station (forfeits the cycle) |
| `emote` | `{ kind: 'stop'\|'help'\|'go'\|'what' }` | speech bubble (`copy.emotes[kind]`); works in the lobby |
| `start` | `{}` | host starts the day from `lobby` |
| `config` | `{}` | request the config bundle; answered with the `config` reply below (also pushed unsolicited in `onJoin` and after a successful reconnection) |

Server → client (`room.onMessage`):

| name | payload |
|---|---|
| `config` | `{ level: LevelConfig, layout: LayoutConfig, copy: Copy }` — `level` is `world.level` (the scaled level with defaults applied; `stations` ids match `state.stations`); `copy` is the server's `copy` from `@shared` |
| `fx` | `{ kind: FxKind, x, y, size?: number, text?: string }` — `x`/`y` in tile units (tile centres for tile-anchored effects); the client renders `text` at `(x, y)` for every kind |
| `toast` | `{ text: string, kind: 'info'\|'warn'\|'good'\|'bad' }` |
| `report` | `ReportPayload` (§9) at day end; never sent when `day.endsOn === 'never'` |

```ts
export type MgOp = 'mash'|'charge'|'release'|'seat'|'pour'|'knot'|'crimp'|'pick'|'fetch'|'swing'|'toss'|'shove'|'tailgate';
export type FxKind = 'thunk'|'spark'|'fuse'|'blast'|'fizzle'|'snap'|'whump'|'horn'|'slam'|'chime'|'clink'|'pfft'|'bonk'|'slop';
export type InputMsg = { dx: Axis; dy: Axis; seq: number };   export type InteractMsg = { t?: number };
export type ActionMsg = { t: number };                          export type MgMsg = { stationId: string; op: MgOp; t: number; v?: number | string };
export type LeaveMsg = Record<string, never>;                   export type EmoteMsg = { kind: EmoteKind };
export type StartMsg = Record<string, never>;                   export type ConfigRequestMsg = Record<string, never>;
export type FxMsg = { kind: FxKind; x: number; y: number; size?: number; text?: string };
export type ToastMsg = { text: string; kind: ToastKind };
export type ConfigMsg = { level: LevelConfig; layout: LayoutConfig; copy: Copy };
export const ClientMsg = { input, interact, action, mg, leave, emote, start, config } as const;
export const ServerMsg = { config, fx, toast, report } as const;
export function isInputMsg / isInteractMsg / isActionMsg / isMgMsg / isEmoteMsg (p: unknown): p is …;
```

Guards check shape only; per-op `v` meaning is the station module's to check.

## 5. Laravel ↔ game-server

**Signature.** Every server-to-server call carries `X-Dynamite-Signature`. Canonical string =
`method.toUpperCase() + pathname + rawBody` with no separators, where `pathname` is the URL path only
(no scheme, host or **query string**: `/internal/factories/7/config`) and `rawBody` is the exact bytes
sent (`''` for GET). Value = lowercase hex `hmac_sha256(secret, canonical)`. Built on the PHP side by
`App\Game\InternalSignature::sign(string $method, string $path, string $body, string $secret)` and
verified with `hash_equals` after lowercasing the header; on the Node side by
`signRequest(method: 'GET' | 'POST', path: string, body: string, secret: string): string`
(`game-server/src/laravel/signature.ts`). Failure → `401 { "error": "invalid_signature" }`.

| Call | Who | Shape |
|---|---|---|
| `POST /game/ticket` (session auth, CSRF, JSON) | browser | body `{ factory_id }` → `200 { ticket, ws_url, room: 'factory' }`; `422` bad id; `403` not a member |
| `GET /internal/factories/{id}/config?players=N` | node | `players` optional `integer\|between:1,10` (validated, not branched on in M1) → `200 { factory: { id, name, day, coin, ownerUserId }, level: LevelConfig, layout: LayoutConfig, members: [{ userId, name }] }`; `404 { error: 'not_found' \| 'no_active_level' }`. Laravel returns `levels.config` verbatim; Node validates, applies defaults and scales |
| `POST /internal/runs` | node | body `RunPayload` (§9) → `201 { ok: true, runId }` on insert; `200 { ok: true, runId }` when `(factoryId, seed, startedAt)` was already stored (idempotent retries); `422` on validation failure |

**Ticket** = `base64url(json) + '.' + hex(hmac_sha256(secret, base64url(json)))` where the JSON is
`{ userId: <int>, factoryId: <int>, name: <string>, exp: <int Unix seconds, now + 60> }`; `base64url` =
base64 with `+/` → `-_` and padding stripped; HMAC hex lowercase. Node (`verifyTicket`) accepts
`userId`/`factoryId` as a non-empty string or finite integer and coerces both to strings; `name`
1–32 chars after trim; `exp > now` (no skew). `factory.ownerUserId` and `members[].userId` are JSON
integers on the wire and strings inside Node (`String()`).

**Room.** Colyseus room `factory`, `defineRoom(FactoryRoom).filterBy(['factoryId'])` — `filterBy`
matches **client join options**, so one room per factory requires `factoryId` at the top level of
the options. Join options `{ ticket, factoryId }` (or `{ name, factoryId }` when
`DEV_ALLOW_NO_TICKET=1`); `factoryId` is the string from `data-factory-id`. `onAuth` verifies the
ticket, throws `'ticket factory mismatch'` when `claims.factoryId !== String(options.factoryId)`,
throws `'not a member'` when `members` is non-empty and does not contain `userId` (skipped under
`DEV_ALLOW_NO_TICKET`), and returns `AuthPayload { userId, name, factoryId }`. `maxClients =
level.players.max`. Reconnect: `allowReconnection(client, 30)`; a reconnecting player keeps the
same `sessionId` and `PlayerState`. Same `userId` from a second tab: newest wins. The room locks at
`start` and never unlocks; the next day is a fresh room.

**Run store (F01).** `StoreRun` in one transaction with `Factory::lockForUpdate()`: existing
`(factory_id, seed, started_at)` → return it (200); else insert `runs` (`level_id` from `levelKey`,
`status`, `grade`, `profit = pnl.profit`, `coin_earned = pnl.coin`, `metrics` = whole body) and
`run_players` (one per `players[]` entry whose `userId` is a `users.id`; `stats` = the entry);
`status ∈ ended|exploded` → `factories.day += 1`, `factories.coin += pnl.coin`; `status === 'ended'`
and `rank(grade) <= rank(grading.advanceOn)` (A=0 … F=4) → with `cap = (int) Level::active()->max('sort')`,
`factories.unlocked_level = max(unlocked_level, min(level.sort + 1, cap))` when `cap > 0`, and untouched
when `cap` is 0 (**v2.2, F01**: the cap bounds the *raise* only — the v2.1 formula
`min(max(unlocked_level, level.sort + 1), Level::active()->max('sort'))` lowered stored progress when a
level was deactivated and zeroed it when no level was active). `started_at` is compared and stored
truncated to the second, the precision the column holds, so the idempotency key means the same thing on
both sides. `runs.status` check
`('ended','exploded','abandoned')`; `grade`, `profit`, `coin_earned`, `ended_at` NOT NULL; unique
`(factory_id, seed, started_at)`. `Level::isSandbox()` = stored `config.day.endsOn === 'never'`;
`Level::isUnlockedFor($factory)` = `isSandbox() || sort <= unlocked_level`.

## 6. Client mount

Route `GET /factories/{factory}/play` (name `factories.play`, `auth` + `can:view,factory`), rendering
`resources/views/play.blade.php` as a standalone page (`body { margin: 0; background: #000 }`,
`#game { width: 100vw; height: 100vh }` — the client needs a definite size and fits the canvas
inside it with `Scale.FIT`, centred):

```html
<div id="game" data-ticket-url="{{ route('game.ticket') }}" data-factory-id="{{ $factory->id }}"
     data-ws-url="{{ config('game.ws_url') }}" data-csrf="{{ csrf_token() }}" data-debug="{{ $debug ? 1 : 0 }}"
     data-factory-url="{{ route('factories.show', $factory) }}"></div>
@vite('resources/js/game/main.ts')
```

`$debug` is true when `config('app.debug')`, `?debug=1`, or `effectiveLevel()->isSandbox()`.
`readMount(el): MountData { ticketUrl, factoryId, wsUrl, csrf, debug, factoryUrl }` parses exactly
those six attributes. `main.ts` POSTs the ticket URL, joins with `{ ticket, factoryId }`, awaits the
first state sync and the `config` reply, starts Phaser (scenes `Boot` → `Factory` → `Report`; F11
appends `Report` to the scene list). Vite alias `@shared` → `./shared/src`. Reconnect token:
`sessionStorage['dynamite.reconnect.<factoryId>']`, written on join, removed on a failed reconnect
and **whenever `phase` becomes `'ended'`** (the next day is a fresh room).

## 7. Mini-game ops (`mg` message) and server judgement

The server owns timing. A judged input's time is `world.inputClock(sessionId, msg.t)` (§10.1): the
client's `performance.now()` mapped through a per-client offset and clamped to
`[clock − MAX_INPUT_BACKDATE_S, clock]` (`MAX_INPUT_BACKDATE_S = 0.2`, F02 constants). The Slammer
needs no conversion: it judges only press-to-press intervals measured on the same client clock,
clamped to `± windowFloorsMs.ok` (100 ms) of the server-measured interval. Windows are milliseconds
from config; never a dial fraction. The client never decides an outcome.

| Station | `op` | `v` | Server effect |
|---|---|---|---|
| `boom_powder` | `mash` | `'l'\|'u'\|'r'` (chute) | records mash timestamps; a 4th press → overflow spill (`overflowSpills`), fx `slop` |
| | `charge` | — | begins the climb; `t_charge = clamp(2·t_mash, minChargeSeconds, maxChargeSeconds)` |
| | `release` | — | judged: dead-center / band / early / late → keg with quality; late → `sparkRing(…, 'slammerRedline')`; overhold past `heat.overholdMs` fires by itself |
| `assembly` | `seat` | index into input shelf | seats a casing; binds `orderId = activeOrderId(world)` |
| | `pour` | — | tap judged against the fill mark |
| | `knot` | `'l'\|'r'` | tap judged against the lane's knot beat |
| | `crimp` | — | tap judged against the third click; a miss on `dents > 0` may `sparkRing(…, 'crimpOnDented')` |
| | `pick` | `'short'\|'long'` | B chooses fuse length |
| | `fetch` | — | B takes spool + cap (0.6 s) → a `parts` item in B's hands |
| | `swing` | — | B starts the arc (key-down) |
| | `toss` | — | B releases; judged against `swingStartAt + toss.arcSeconds` |
| `dock` | `shove` | — | tap judged against the beep; one judgement per lane per beep |
| | `tailgate` | `'down'\|'up'` | E keydown/keyup on a lane while `mg.tailgateUntil > clock`; the server measures the `tailgateHoldSeconds` hold on its own clock |

`StationState.mg` per station type: `boom_powder` = `encodeMg(SlammerMg)` (`shared/src/sim/slammer.ts`);
`assembly` = `JSON.stringify(toMg(JigState))` (`shared/src/sim/jig.ts`); `dock` = `JSON.stringify(DockMg)`
parsed by `parseDockMg` (`shared/src/sim/dock.ts`). Each carries what its overlay needs (phase,
`clock`-second timestamps, combo, lanes…) and is rewritten only on change.

Join modes (`StationConfig.joinMode`): `'press'` — `E` on a work/rack/ring tile with empty hands
joins, the clipboard applies, the avatar snaps to the tile centre, movement freezes; `'stand'` —
standing on a work tile *is* being at the station (`stationId`/`workTile` set and cleared by the
stations tick), no clipboard, no snap, arrows keep walking, `E` goes to the module regardless of
`carrying`. `powder-a`/`assembly-a` are `press`; `dock-a` is `stand`.

## 8. Level config — `shared/src/config/types.ts`

`LevelConfig` top-level keys (root `additionalProperties: false`; `?` = optional, default in §13):
`key name notes? day players layout groove clipboardSeconds clipboardMemorySeconds? interrupts?
movement? bpm windowFloorsMs carry stations recipes orders hazards grading scoring? economy scaling copy?`.

- `day: { shiftSeconds, orderBook, endsOn: 'either'|'book'|'clock'|'never', earlyFinishBonusPerMinute, earlyFinishCap }`.
  `endsOn === 'never'` (Sandbox) ⇔ `shiftSeconds === 0 && orderBook === 0`: the day starts on `start`,
  `clock` counts up, no book, orders/trucks keep arriving, the day never ends by book or clock, an
  explosion follows `explosionEndsRound`, no `report`, no `POST /internal/runs`, the room disposes
  when the last client leaves.
- `players: { min, max }`: `min ≥ 1` allowed only when `endsOn === 'never'`, else `min ≥ 3`; `max ≤ 10`; `min ≤ max`.
  `players.min` is the start gate (may be 1 — see ADR 0013 — but only when a `scaling.breakpoints` entry has `maxPlayers <= 2`; `validateLevelConfig` enforces it) (connected players).
- `groove: { start, weights: { onTimeShip, shelfFullness, floorItem, rework, starved, jammed, litFuse, fizzle, niceSave, blastKeg, primeStick, truckComplete? }, thresholds: { onFire, groove, churn, meltdown }, cleanSweep: { holdSeconds, snapTo, cooldownSeconds } }`.
  Every Groove impulse lives in `groove.weights` — there is no `hazards.niceSaveGroove`,
  `hazards.blastGroovePerKeg`, `carry.drop.fizzleGroove` or `scoring.grooveOnComplete`.
- `carry: { slowdown, throwTiles, throwFlightSeconds, catchOkMs, catchPerfectMs, drop: { kegKnockOverOnHit, stickFizzleChance, crateRattlyOnDrop }, truckRideSeconds, footprints, putDownSeconds?, hitStaggerSeconds? }`.
- `hazards` (`HazardsConfig`, defined in `config/types.ts`, F02): `{ fuseSeconds, chainFuseSeconds, blastRadius, chainWindowSeconds, sparks: { slammerRedline, jammedPer10s, crimpOnDented }, fuel: { floorKeg, spillTile, shelfKeg }, incidentThreshold, factoryExplosionThreshold, explosionEndsRound, dangerWarningAt, stompSeconds, stunSeconds, knockbackTiles, litKegCarry, unjamSeconds?, sweepSecondsPerTile?, repairSeconds?, bannerSeconds? }`.
  Unknown keys under `hazards` are rejected (`sandBucket`, `sparks.hotfix`, `blastBins` are not M1 keys; bins are `LayoutConfig.blastBins`).
- `grading: { weights, thresholds, targets, multiplier, verdict: { flow: 1.0, smooth: 0.75, fine: 0.5, rough: 0.25 }, advanceOn?: 'A'|'B'|'C'|'D' }`.
  `verdict.*` are `onTime` lower bounds; `peakWip > targets.wip` demotes one step; exploded overrides.
- `scoring?: { perOrder }` — read by F09 `truckCredit` for the departure toast only; never added to `FactoryState.score`.
- `recipes`, `orders`, `economy`, `scaling`, `windowFloorsMs`, `bpm`, `clipboardSeconds`, `copy?: { clipboard: string[] }`
  (`additionalProperties: true` on `copy` only) as in F02 §Data.

`StationConfig` keys (`additionalProperties: false`): `id type line joinMode anchor workTiles rackTiles
inputShelf? outputShelf? floorRing nominalSeconds floorSeconds staffing churnSensitive minigame`.
`joinMode: 'press' | 'stand'` (required). `inputShelf?: { tile, capacity, accepts: ItemType[] }`,
`outputShelf?: { tile, capacity }` — absent (or `null`) for powder input and both dock shelves;
`rackTiles` may be `[]`. An output shelf accepts the `output.type` of the recipe whose `station ===
type`. `minigame` by type:
- `boom_powder`: `{ heat: { minChargeSeconds, maxChargeSeconds, okMsAtMaxCharge, okMsAtMinCharge, deadCenterMs, churnBandDrift, overholdMs? }, comboTiers, overflowSpills, comboBannerSeconds? }`
- `assembly`: `{ pour: { beatsByQuality, perfectMs, okMs, primeKegWindowMultiplier }, knots: { long, short, secondsPerKnot, perfectMs, okMs }, crimp: { clicks, clickSeconds, perfectMs, okMs }, toss: { arcSeconds, perfectMs, okMs }, casings?: { stock, dentChance } }`
  (`casings` configures F08's input-shelf feeder — the M1 casing supply)
- `dock`: `{ beepHz, perfectMs, okMs, tailgateWindowSeconds, tailgateHoldSeconds?, leaveSeconds? }` (`rattlyOkMs`, `laneIsSlot` are M2 and not accepted)

`LayoutConfig`: `{ key, width, height, walls: number[] (packed y*width + x, same packing as spillTiles),
spawn: Tile, breakRoom: [x,y,w,h], blastBins: Tile[], dockDoor: [x,y,w], truckBay: [x,y,w,h], ramp: Tile[],
beaconPoles: { [stationId]: Tile }, orderBoard: Tile, props: { toolCart: Tile, countdownSign: Tile,
returnsPile: Tile, broomHook: Tile } }` — `truckBay` and all four `props` required. `walls` is the
**complete impassable set**: border, station footprints, every drawn shelf tile, poles, boards, carts,
signs, hooks. Work, rack, ring, `ramp`, `truckBay`, `spawn`, `blastBins`, `props.returnsPile` and
`breakRoom` tiles are never walls; `blastBins` and `props.returnsPile` are floor tiles with a meaning
when an item lands. Station anchors and shelf `tile`s are furniture and normally walls.

Validation (`shared/src/config/validate.ts`, Node-only): `validateLevelConfig(input): ValidationResult<LevelConfig>`
returns the config **with §13 defaults applied** (consumers never branch on `undefined`);
`validateLayoutConfig(input): ValidationResult<LayoutConfig>`; `validateLevelOnLayout(level, layout): string[]`
(`[]` = ok) checks: work, rack and ring tiles in bounds and not walls; anchor and shelf tiles in bounds;
each shelf tile has ≥ 1 orthogonal in-bounds non-wall neighbour; no two stations share a work/rack/shelf/ring
tile; `ramp` equals the dock station's `workTiles`; `truckBay` contains no wall. `ValidationResult<T> =
{ ok: true; value: T } | { ok: false; errors: string[] }`; the room throws `new Error(errors.join('\n'))`
on `ok: false`. `shared/src/config/schema.json` is the JSON Schema (draft-07, self-contained) Laravel
validates with by path.

Scaling (`shared/src/sim/scale.ts`): `breakpointFor(level, players): ScalingBreakpoint` = first breakpoint
with `maxPlayers >= players`; `scaleLevel(level, players): ScaledLevel` where
`ScaledLevel = LevelConfig & { breakpoint: ScalingBreakpoint; lines: Line[] }` =
`{ ...level, breakpoint, lines, stations (expanded per line), layout: breakpoint.layout ?? level.layout,
day: { ...level.day, orderBook: breakpoint.orderBook }, orders: { ...level.orders, everySeconds: breakpoint.truckEverySeconds, qtyPerTruck: breakpoint.qtyPerTruck ?? level.orders.qtyPerTruck } }`.
`ScalingBreakpoint` carries an optional `qtyPerTruck: { base, rampPerMinute }` — small crews need
smaller trucks, not just fewer (ADR 0013).
The `config` reply's `level` is `world.level`: the unscaled level with §13 defaults applied while
`phase === 'lobby'`, the `ScaledLevel` once `phase === 'running'` — the client re-sends `config`
on the lobby→running flip and replaces `conn.config`. `world.level` is a `ScaledLevel` after `start`; consumers read `level.day.orderBook` and
`level.orders.everySeconds`. `players` stays `{ min, max }` (F03 reads `players.max` for
`maxClients`, `players.min` for the start gate); the seat count is `breakpointFor`'s argument
and `state.players.size`. Laravel keeps one layout per level in M1.

Level files (F12): `level-01-basic-flow`, `level-02-too-much-powder` (baseline), `level-03-the-bottleneck`,
`level-04-too-many-helpers`, `sandbox` (`endsOn 'never'`, `players.min 1`); layout `mvp-small`.
Levels 2 and 4 ship `orderBook 10` so the last truck leaves before `shiftSeconds − truckWaitSeconds`.

Copy (`shared/src/copy.ts`, F12): `config/game/copy.json` is the single source of joke text.

```ts
export type BannerKey = Exclude<Banner, ''>;
export interface Copy {
  clipboard: string[];
  chores: { unjam: string; sweep: string; stomp: string; repair: string };
  bubbles: { whatCanIDo: string; whoThrewThat: string; sawTheHighway: string };
  stations: { needHands: string; needParts: string };
  emotes: { stop: string; help: string; go: string; what: string };
  banners: Record<BannerKey, string>;
  hazards: { sparks: Record<SparkCause, string> };
  report: { individualHeading: string; factoryHeading: string; topPerformer: string; materials: string; certificate: string; repeatDay: string; fireMarshal: string; loss: string; sandbox: string };
  events: Record<string, string>;
  standupBubbles: string[];
}
export const copy: Copy;
export function clipboardLines(level: Pick<LevelConfig, 'copy'>): string[];   // level.copy?.clipboard ?? copy.clipboard
export function fill(template: string, vars: Record<string, string | number>): string;
```

Server reads `copy` from `@shared` (via `game-server/src/shared.ts`); the client reads
`conn.config.copy` (the `config` reply) and `fill` from `@shared`. No other path. Features append
their own top-level section to `copy.json` and `Copy`; nobody edits another's. No string is inline.

## 9. Report and run payloads — `shared/src/report.ts` (F02)

```ts
export type Grade = 'A'|'B'|'C'|'D'|'F';
export type Verdict = 'EXPLODED'|'DISASTER'|'ROUGH'|'FINE'|'SMOOTH'|'FLOW';
export type PlayerLabel = 'EXCELLENT'|'GOOD'|'NEEDS FOCUS';
export type RunStatus = 'ended'|'exploded'|'abandoned';
export type EndReason = 'book'|'clock'|'exploded'|'abandoned';
export interface BottleneckSummary { stationId: string; starvedSeconds: number; blockedSeconds: number }
export interface StationReport { id: string; utilization: number }
export interface PlayerReport { userId: string; name: string; utilization: number; label: PlayerLabel; topStation: string;
  bubbles: number; drops: number; sooted: number; fusesStomped: number; niceSaves: number; truckRides: number }
export interface Pnl { revenue: number; waste: number; profit: number; multiplier: number; coin: number }   // profit, coin integers
export interface Materials { purchased: number; shipped: number }   // purchased = kegs made; shipped = sticks loaded onto a truck
export interface ReportPayload { day; levelKey; grade: Grade; score; verdict: Verdict;
  ordersCompleted; ordersTotal; throughput; avgCycleSeconds; peakWip; wipTimeline: number[];
  kegsMade; kegsUsed; defects; rework; kegsExploded; fusesStomped; fizzles; niceSaves; truckRides;
  bottleneck: BottleneckSummary; stations: StationReport[]; players: PlayerReport[]; pnl: Pnl; materials: Materials }
export type RunPayload = ReportPayload & { factoryId: string; seed: number; startedAt: string; endedAt: string; status: RunStatus };
```

Semantics: `throughput` = orders completed per 10 minutes of shift played
(`round1(ordersCompleted × 600 / max(1, clockAtEnd))`); `avgCycleSeconds` = mean (completed − started)
over completed orders; `wipTimeline` one sample per second from shift start; `kegsUsed` = kegs taken
off an input shelf by the Jig; `kegsExploded` = `tally.destroyedByType.keg` (blast cause); `fizzles` = sticks
destroyed by fizzle; **the hazard lines and the P&L read different counters** — `kegsExploded` and
`fizzles` come from `destroyedByType` (a blast or a fizzle, and nothing else), while `pnl.waste` is
what stood at the whistle plus `destroyedByType` plus `wastedByType`, so material scrapped by a
wiped shelf, a truck ride or a bail is billed without inventing an explosion that never happened;
every loss is counted under exactly one of the two, so the sum bills it once;
`fusesStomped`/`niceSaves`/`truckRides` = sums over players; `rework`,
`complaints` are 0 in M1; `cleanSweeps` = the number of times `grooveSystem`'s `cleanSweepStep`
fired during the shift (F11 counts it and passes it to `gradeDay`); `startedAt`/`endedAt` ISO-8601 UTC; `seed` = the room's RNG
seed; `factoryId` is sent as a string (Laravel's `integer` rule accepts it); `status` `abandoned` is
posted when the room disposes while `running`.

`pnl.profit` and `pnl.coin` are integers because Laravel's `StoreRunRequest` validates them as
`integer` and rejects the whole run otherwise, so `economy.price.*` and `economy.wasteCost.*` are
`integer` in `shared/src/config/schema.json`: a level cannot price a stick at 12.5 and lose the
crew its day. `materials.shipped` counts sticks loaded onto a truck — the credit is booked as the
crew loads it, so a truck still at the door when the shift ends counts what is aboard.

`shared/src/sim/grade.ts` (F02): `gradeDay(i: GradeInputs, grading, day): DayGrade`, `letterFor`,
`verdictFor(onTime, peakWip, grading, exploded)`, `profitAndLoss({ shipped, waste }: PnlInputs, economy, multiplier): Pnl`
(multiplier 0 when exploded or abandoned; `coin` rounded), `utilizationLabel(u): PlayerLabel`;
`shared/src/sim/bottleneck.ts`: `bottleneckStation(stations: StationPressure[]): string`. Node computes;
Laravel stores what Node sends and never recomputes.

## 10. Module APIs

Exact exported names, signatures and owners. `Tile = [number, number]` (F02) everywhere;
`tileOf(x, y): Tile`, `packTile(x, y, width)`, `unpackTile`, `tileKey(x, y)`, `facingFrom` live in
F02 `shared/src/sim/tiles.ts` and no module defines its own. Pure shared functions take
`rng: () => number`; the server passes `() => world.rng.next()`.

### 10.1 World — `game-server/src/sim/World.ts` (F03)

```ts
export type DayEndStatus = 'ended' | 'exploded' | 'abandoned';
export interface System {
  name: string;
  init?(world: World): void;                                        // once, at room creation (lobby)
  onStart?(world: World): void;                                     // at `start`, after phase = 'running', in SYSTEMS order
  tick?(world: World, dt: number): void;                            // every fixed step (§11 says which phases)
  onDayEnd?(world: World, status: DayEndStatus, reason: EndReason): void;
}
export interface BumpEvent { a: string; b: string; mover: string; x: number; y: number; dx: -1|0|1; dy: -1|0|1 }
  // sessionIds; mover = the moving party (a if both); dx/dy = sign(b − a) rounded; x/y = contact point
export interface WorldEvents {
  bump: BumpEvent;
  playerJoined: { sessionId: string };
  playerLeft: { sessionId: string };                                // seat gone for good
  dayEnded: { status: DayEndStatus; reason: EndReason };
}
export interface PlayerRuntime { intent: { dx: Axis; dy: Axis; seq: number }; lastInputAt: number; lastEmoteAt: number;
  connected: boolean; joinIndex: number; contacts: Set<string>; clockOffsetMs: number }
export interface AuthPayload { userId: string; name: string; factoryId: string }
export interface WorldInit { config: FactoryConfigResponse; state: FactoryState; seed: number; log?: (msg: string) => void }
export type Outbound = { to: 'all' | string; name: 'fx'; payload: FxMsg } | { to: 'all' | string; name: 'toast'; payload: ToastMsg };
export class World {
  readonly factory: { id: string; name: string; day: number; coin: number; ownerUserId: string };
  readonly members: Array<{ userId: string; name: string }>;
  level: LevelConfig;                     // defaults applied; a ScaledLevel after startDay
  readonly layout: LayoutConfig; readonly state: FactoryState; readonly rng: Rng; readonly seed: number;
  get now(): number;                      // === state.clock
  readonly players: Map<string, PlayerRuntime>;
  readonly stations: Map<string, Station>;   // filled by stations.build (F05)
  readonly tally: RunTally;               // F11 type
  readonly grooveEvents: GrooveEvents;    // F02 type; zeroed by grooveSystem after each tick
  readonly outbox: Outbound[];
  endRequested: { status: DayEndStatus; reason: EndReason } | null;
  report: ReportPayload | null;
  constructor(init: WorldInit);
  stationConfig(id: string): StationConfig;                          // throws for an unknown id
  tileOf(x: number, y: number): Tile;                                 // = tiles.tileOf
  packTile(tx: number, ty: number): number;                           // = tiles.packTile(tx, ty, state.width)
  isWall(tx: number, ty: number): boolean;                            // layout.walls or out of bounds
  isSpill(tx: number, ty: number): boolean;
  playersAt(tx: number, ty: number): string[];                        // floor players only (stationId === '' or a 'stand' station)
  itemsAt(tx: number, ty: number): string[];                          // holder === '' && !inFlight
  tileSpeed(tx: number, ty: number): number;                          // min(movement.floorItemSpeed if items, movement.spillSpeed if spill, 1)
  reindexPlayers(): void; reindexItems(): void;
  addPlayer(sessionId: string, auth: AuthPayload): PlayerState;
  removePlayer(sessionId: string): void;                              // emits playerLeft
  setConnected(sessionId: string, connected: boolean): void;
  runtime(sessionId: string): PlayerRuntime;                          // throws for unknown sessionId
  inputClock(sessionId: string, tMs: number): number;                 // clock seconds; clamp [clock − MAX_INPUT_BACKDATE_S, clock]
  registerSystem(system: System): void;
  init(): void;                                                       // every system.init in order
  startDay(scaled: ScaledLevel): void;                                // phase 'running', clock 0, re-spawn (position and intent; lastInputAt 0, seq kept), system.onStart in order
  tick(dt: number): void;                                             // §11
  requestEnd(status: DayEndStatus, reason: EndReason): void;          // consumed at the end of the current tick
  setReport(report: ReportPayload): void;                             // called by reportSystem inside onDayEnd
  on<K extends keyof WorldEvents>(event: K, fn: (e: WorldEvents[K]) => void): () => void;
  emit<K extends keyof WorldEvents>(event: K, e: WorldEvents[K]): void;
  fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void;   // to 'all'
  toast(to: 'all' | string, text: string, kind: ToastKind): void;
}
```

`inputClock`: the handler wrapper for `mg`/`action`/`interact` records `clockOffsetMs = min over the
client's last 32 timed messages of (state.clock·1000 − t)`; `inputClock(sessionId, tMs) =
clamp((tMs + clockOffsetMs) / 1000, clock − MAX_INPUT_BACKDATE_S, clock)`.

Other F03 exports: `game-server/src/sim/rng.ts` `class Rng { constructor(seed); next(): number; int(min, maxExclusive); chance(p); pick(items) }`;
`game-server/src/sim/systems.ts` `export const SYSTEMS: System[]` (§11 order; each owner appends its line);
`game-server/src/rooms/handlers.ts` `HandlerContext { world; sessionId; player: PlayerState; room: RoomControls }`,
`RoomControls { startDay(): void; sendConfig(sessionId: string): void }` (the `config` reply is a per-client
send, not an outbox broadcast), `MessageHandler = (ctx, payload: unknown) => void`,
`MESSAGE_HANDLERS: Record<'input'|'interact'|'action'|'mg'|'leave'|'emote'|'start'|'config', MessageHandler>`;
`game-server/src/rooms/lobby.ts` `chooseHost(players, states, ownerUserId)`, `canStart(world, sessionId)`,
`pickColour(taken: number[])`, `spawnTiles(layout, isSolid, count)`;
`game-server/src/rooms/index.ts` `rooms = { factory: defineRoom(FactoryRoom).filterBy(['factoryId']) }`
— the registration is a value so `filterBy` can be asserted without a socket; `src/index.ts` only boots it;
`game-server/src/rooms/FactoryRoom.ts` `class FactoryRoom` (`onCreate`, `onAuth`, `onJoin`, `onLeave`, `onDispose`, `startDay()`, `finishDay(status)`),
`JoinOptions`; `game-server/src/auth/ticket.ts` `verifyTicket`, `signTicket`, `TicketClaims`, `TicketResult`;
`game-server/src/laravel/api.ts` `FactoryConfigResponse`, `fetchFactoryConfig(env, factoryId, players, fetchImpl?)`,
`postRun(env, run, fetchImpl?)`, `LaravelUnreachableError`; `game-server/src/config/levels.ts`
`loadLocalFactoryConfig`, `resolveFactoryConfig`; `game-server/src/env.ts` `Env`, `loadEnv`.
Test helper `game-server/tests/helpers/world.ts` (F03): `makeWorld({ level?, layout?, seed?, players?: number }): World`
— real schema classes, F02's fixtures, every `SYSTEMS` entry registered, `init()` run; `players` seats
that many dev players. Every server test file uses it.

### 10.2 Stations — `game-server/src/sim/stations.ts` (F05)

```ts
export type Role = 'work' | 'rack' | 'helper';                      // shared/src/sim/stations.ts
export interface Member { sessionId: string; role: Role; tile: string; joinedAt: number; nextBubbleAt: number | null }
export interface Cycle { startedAt: number; pausedSeconds: number; bubbles: number; completedAt: number | null }
export interface Station {
  cfg: StationConfig; st: StationState;
  machine: Tile[]; joinZone: Set<string>; ring: number[];           // ring = packed floor-ring tiles
  members: Map<string, Member>;                                     // key = sessionId
  cycle: Cycle | null; armedAt: number; lastCycleWasPerfect: boolean; pausedUntil: number;
  lastLeftAt: Map<string, number>; clipboardIndex: number;
  mg: MinigameInstance;
}
export function build(world: World): void;                          // fills world.stations and state.stations
export function tick(world: World, dt: number): void;
export function onInteract(world: World, player: PlayerState): boolean;
export function leave(world: World, player: PlayerState): void;     // E / Esc / disconnect / ejection by F10
export function onMg(world: World, player: PlayerState, msg: MgMsg): void;
export function onPlayerLeft(world: World, sessionId: string): void;
export function jam(world: World, stationId: string): void;
export function unjam(world: World, stationId: string): void;
export function pauseStation(world: World, stationId: string, seconds: number): void;
export const stationsSystem: System;                                // { name: 'stations', init: build, tick }
```

Pure (`shared/src/sim/stations.ts`): `footprintOf(cfg, layout): { bbox; machine: Tile[] }` (machine =
the layout's wall tiles inside the bbox), `joinZoneOf(cfg): Set<string>`, `roleForTile(cfg, tile): Role | null`,
`clipboardSecondsFor(lastLeftAt, now, clipboardSeconds, memorySeconds)`, `countWorkers`,
`extrasFor`, `interruptsPerSecond`, `pickExtras`, `firstBubbleAt`, `bubblesDue`, `armedAt`,
`STATION_LABEL`, `ACTION_OP: Record<StationType, MgOp>` = `{ boom_powder: 'charge', assembly: 'crimp', dock: 'shove' }`
(the §11 `action` → `stations.onMg` fallback needs it; `ActionMsg` carries no op). Tile keys via F02
`tileKey(x, y)`. F05 imports `peakWorkers` from `../curve` (F02 owns it); it is not re-exported here.

Rules: F05 calls F02 `efficiencyFor(cfg.staffing, workers)` and `cycleSeconds(CycleInputs)` with
`churnSensitive: cfg.churnSensitive, churnDepth: 0` (M1); `stations.tick` writes `st.state`/`progress`
as: `jammed`/`damaged` → untouched (F06/F10 own them); else `mg.status?.(ctx)` non-null → written
verbatim; else the cycle rule (`working` while executing/rearming, `starved` when `mg.starved(ctx)`,
else `idle`). While `damaged` F05 makes no cycle, accepts no join, forwards no op, writes neither
`state` nor `progress`. F05 bumps `tally.bump('kegsMade')` when `complete()` delivers a `keg`,
`tally.bumpPlayer(userId, 'produced')` for every work/rack member at completion, and
`tally.bumpPlayer(userId, 'bubbles')` for each `whatCanIDo` bubble; it keeps no private stats.
Clipboard text = `clipboardLines(world.level)[station.clipboardIndex++ % length]`; station bubbles
`copy.stations.needParts/needHands` are client-drawn.

### 10.3 Mini-game modules — `game-server/src/sim/minigames/` (F05 types; F07/F08/F09 bodies)

```ts
// types.ts (F05)
export type LeaveReason = 'esc' | 'stepOff' | 'disconnect';
export interface OutputSpec { type: ItemType; quality: number; prime: boolean; dents: number; fuseLength: FuseLength; fill: number;
  capLoose: boolean; frayed: boolean; orderId: string; handsOf: string }        // handsOf = operator sessionId
export interface CycleResult { item?: OutputSpec; perfect: boolean }
export interface StationCtx {
  world: World; station: Station; cfg: StationConfig; now: number;
  phase: 'idle' | 'executing' | 'rearming' | 'blocked' | 'jammed';
  paused: boolean;                                                  // now < station.pausedUntil
  rearmAt: number;                                                  // = station.armedAt
  operators: PlayerState[]; rackHands: PlayerState[]; helpers: PlayerState[];   // clipboard-done members
  sessionIdOf(player: PlayerState): string;   // reverse index kept by reindexPlayers; throws for a player not in state.players
  inputShelf(): ItemState[];                                        // shelf order
  consume(itemId: string): ItemState;                               // items.shelfPull(world, st, 'in', index)
  beginCycle(): boolean;                                            // false unless phase === 'idle' and no operator is carrying
  // `complete` returns 'none' when nothing was delivered (no `item` in the result, or it was
  // destroyed); the cycle still re-arms.
  complete(result: CycleResult): 'shelved' | 'hands' | 'none';      // items.createItem + items.deliverOutput
  abort(): void;
  setMg(value: object): void;                                       // JSON.stringify → st.mg only when changed
  setProgress(p: number): void;                                     // overrides the time-based progress this tick
  fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void;
  bubble(sessionId: string, text: string, seconds: number): void;
}
export interface MinigameInstance {
  onJoin(ctx: StationCtx, player: PlayerState, role: Role): void;
  onLeave(ctx: StationCtx, player: PlayerState, reason: LeaveReason): void;   // 'stepOff' only at 'stand' stations
  onInteract(ctx: StationCtx, player: PlayerState): boolean;        // true = consumed; false = F05 treats E as leave
  onMessage(ctx: StationCtx, player: PlayerState, op: MgOp, v: number | string | undefined, t: number): void;
  // `t` is the client's raw `performance.now()` ms exactly as sent — F05 forwards it unchanged.
  // A module that judges against server time converts once: `world.inputClock(ctx.sessionIdOf(player), t)`.
  tick(ctx: StationCtx, dt: number): void;                          // never while jammed/damaged; must not advance timers while ctx.paused
  starved(ctx: StationCtx): boolean;
  status?(ctx: StationCtx): { state: 'idle' | 'starved' | 'working'; progress: number } | null;
}
export interface MinigameModule { create(station: Station): MinigameInstance }   // join mode comes from cfg.joinMode
// index.ts (F05)
export const MINIGAMES: Record<StationType, MinigameModule>;        // { boom_powder: slammerModule, assembly: jigModule, dock: dockModule }
// slammer.ts (F07)  export const slammerModule: MinigameModule;
// jig.ts (F08)      export const jigModule: MinigameModule;
// dock.ts (F09)     export const dockModule: MinigameModule;
```

Modules own `st.mg` exclusively and are called only while `phase === 'running'`. Shared pure
modules: `shared/src/sim/slammer.ts` (F07: `SlammerMg`, `encodeMg`, `decodeMg`, `chargeSeconds`,
`okWindowMs`, `heatOf`, `targetMs`, `judgeRelease`, `kegFor`, `bandDrift`, `comboTier`, `boundedMs`,
`idleMg`, `KEG_QUALITY` — no spark-tile picker); `shared/src/sim/jig.ts` (F08: `JigConfig` incl.
`casings`, `JigMg`, `JigState`, `JigEvent`, `JigEffect`, `createJigState`, `reduceJig`, `toMg`,
`stationStatus`, timing helpers); `shared/src/sim/orders.ts` + `shared/src/sim/dock.ts` (F09, §10.6).

### 10.4 Items — `game-server/src/sim/items.ts` (F06)

```ts
export function createItem(world: World, type: ItemType, attrs?: Partial<Pick<ItemState, 'quality'|'prime'|'dents'|'fuseLength'|'fill'|'capLoose'|'frayed'|'orderId'>>): ItemState;
export function destroyItem(world: World, itemId: string): void;    // clears hands, shelf slot, floor index, flight, lane
export function floorItemAt(world: World, t: Tile): ItemState | null;
export function placeOnFloor(world: World, item: ItemState, t: Tile): boolean;   // false when blocked or occupied
export function placeNear(world: World, item: ItemState, t: Tile): boolean;      // placeOnFloor at t, else ring search radius ≤ 2
export function giveToPlayer(world: World, item: ItemState, sessionId: string): boolean;   // false when hands full
export function takeCarried(world: World, sessionId: string): ItemState | null;  // holder '', x/y −1; null when empty
export function releaseCarried(world: World, sessionId: string): void;           // disconnect: gentle put-down, no drop table
export function canDeliver(world: World, station: StationState, operatorId: string): boolean;
export function deliverOutput(world: World, station: StationState, item: ItemState, operatorId: string): 'shelf' | 'hands';
export function shelfPush(world: World, station: StationState, side: 'in' | 'out', item: ItemState): boolean;
export function shelfPull(world: World, station: StationState, side: 'in' | 'out', index?: number): ItemState | null;
export function addSpill(world: World, t: Tile): void; export function removeSpill(world: World, t: Tile): void; export function isSpill(world: World, t: Tile): boolean;
export function dropItem(world: World, item: ItemState, origin: Tile, dir: Tile, culpritId: string): DropOutcome;
export function stageOnLane(world: World, item: ItemState, stationId: string, t: Tile): void;   // holder = stationId, shelf = '', x/y = t (F09's dock lanes)
export function onInteract(world: World, player: PlayerState, tMs?: number): boolean;   // true = consumed
export function onAction(world: World, player: PlayerState, tMs: number): boolean;      // true = threw or started a sweep
export function tick(world: World, dt: number): void;
export const itemsSystem: System;                                    // { name: 'items', init: subscribe world.on('bump'), tick }
```

Pure (`shared/src/sim/items.ts`): `FACING_DIRS: readonly Tile[]` (integer steps, index = facing),
`facesTile`, `landingTile`, `judgeCatch(pressMs, arrivalMs, okMs, perfectMs)`, `resolveDelivery`,
`canShelve`, `DropContext`, `DropOutcome` (kinds `keg` | `stick` | `inert` — `casing` and `parts` are
`inert`), `rollDrop`, `tileSpeedFactor(hasFloorItem, isSpill, cfg)`, `BUBBLE_SECONDS`.

Rules: `onInteract` returns `false` without acting — except for a mid-flight catch — when
`player.stationId !== ''` and `world.stationConfig(player.stationId).joinMode === 'stand'`, so the
station module gets the press regardless of `carrying` (this is what keeps the dock playable).
A `chore` is cleared when the player moves off the start tile, `p.moving` is true, or
`stunnedUntil > now` — a blast knockback therefore cancels it and F10 needs no `cancelChore`.
Bumps are consumed from `world.on('bump')` buffered until `tick`; `pressMs` for a catch =
`world.inputClock(sessionId, tMs)·1000`; a fizzle calls `hazards.spark(world, x, y, 'fizzle')`
(always) and `world.tally.destroyed('stick', 'fizzle')` and `grooveEvents.fizzles++`; every landing
and floor put-down calls `hazards.onItemLanded(world, item.id, x, y)` (the bin test lives in F10);
uncaught landings and bump drops `tally.bumpPlayer(userId, 'drops')`; a lit item may be picked up when
`hazards.litKegCarry`; the flight loop tolerates an item removed mid-flight; thrown/knocked items on a
work tile call `stations.jam`; unjam completion calls `stations.unjam`; chore labels are
`copy.chores.unjam/sweep`; the `whoThrewThat` bubble text is `copy.bubbles.whoThrewThat`; hold times
`hazards.unjamSeconds`, `hazards.sweepSecondsPerTile`, `carry.putDownSeconds`, `carry.hitStaggerSeconds`.
Client: `resources/js/game/render/Items.ts` `createItemsLayer(scene: Factory): { update(nowMs): void; destroy(): void }`
draws floor/lane/held/in-flight items and the chore bar; spill blobs, scorch, beacon poles and the
banner are F04's.

### 10.5 Hazards — `game-server/src/sim/hazards.ts` (F10)

```ts
export type SparkCause = 'slammerRedline' | 'jammed' | 'fizzle' | 'crimpOnDented';   // shared/src/sim/hazards.ts
export type SparkResult = 'lit' | 'already' | 'noFuel' | 'inactive';
export function tickHazards(world: World, dt: number): void;
export function spark(world: World, x: number, y: number, cause: SparkCause): SparkResult;
export function sparkRing(world: World, stationId: string, cause: SparkCause): SparkResult;   // highest-fuel ring tile nearest the anchor
export function tryBeginStomp(world: World, sessionId: string): boolean;
export function tryBeginRepair(world: World, sessionId: string, stationId: string): boolean;   // toggles; second call cancels
export function onItemLanded(world: World, itemId: string, x: number, y: number): 'saved' | 'landed';
export function resetHazards(world: World): void;
export const hazardsSystem: System;                                  // { name: 'hazards', onStart: resetHazards, tick: tickHazards }
```

Callers roll `hazards.sparks.<cause>` with `world.rng.next()` before calling `sparkRing`: F07 late
release (`slammerRedline`, `'powder-a'`), F08 crimp miss on `dents > 0` (`crimpOnDented`,
`'assembly-a'`). The one exception: `tickHazards` tracks continuous-jam seconds per `jammed` station
and rolls `jammedPer10s` itself every 10 s. F10 writes `world.grooveEvents.blastKegs += kegs`,
`grooveEvents.niceSaves++`, `tally.bump('incidents')`, `tally.destroyed('keg', 'blast')`,
`tally.bumpPlayer(userId, 'sooted' | 'fusesStomped' | 'niceSaves')`; ejects workers via
`stations.leave(world, player)`; removes shelved items on damage via `items.destroyItem`; ends the day
via `world.requestEnd('exploded', 'exploded')`; toasts `copy.hazards.sparks[cause]`; banner duration
`hazards.bannerSeconds`; repair hold `hazards.repairSeconds`, label `copy.chores.repair`. Pure module
`shared/src/sim/hazards.ts` keeps `HazardsConfig` out (it lives in `config/types.ts`) and uses F02
`packTile`/`unpackTile`/`tileOf`. Client: `resources/js/game/hazards/HazardsLayer.ts`
`createHazardsLayer(scene: Factory): { destroy(): void }` (fuse sparkles, blast fx, red beacon pulse
+ stripes, repair sign; no scorch tiles, no banner).

### 10.6 Dock and orders — F09

```ts
// shared/src/sim/orders.ts
import type { OrdersConfig } from '../config/types';   // declared by F02 — never re-declared here
export interface ShoveWindows { perfectMs: number; okMs: number }
export interface TruckSlot { index: number; arrivesAt: number; leavesAt: number }
export interface OrderSpec { id: string; product: string; qty: number; truckId: number; arrivesAt: number; leavesAt: number; fuseLength: FuseLength }
export function truckSchedule(cfg: OrdersConfig, index: number): TruckSlot;
export function qtyForTruck(cfg: OrdersConfig, arrivesAt: number): number;
export function orderSpecAt(cfg: OrdersConfig, index: number, rng: () => number): OrderSpec;   // id 'o-<index+1>', fuseLength rng() < 0.5 ? 'short' : 'long'
export function orderStatusFor(qty: number, shipped: number): 'complete' | 'partial' | 'failed';
export function truckCredit(loaded: number, slots: number, pricePerStick: number, perOrder: number): { credit: number; complete: boolean };
// shared/src/sim/dock.ts
export interface DockMg { truck: { phase; arrivesAt; leavesAt; slots; loaded; hits: string }; lanes: { tile: Tile; itemId: string; stalled: boolean }[];
  beepAt: number; beepPeriodMs: number; windows: ShoveWindows; tailgateUntil: number; returnsTile: Tile }
export function nearestBeep(beepAtMs, periodMs, beepCount, tMs): { index: number; deltaMs: number };
export function judgeShove(deltaMs: number, w: ShoveWindows): 'perfect' | 'ok' | 'miss';
export function beepPhase(beepAtSec, periodMs, nowSec): number;
export function tailgateWindowEnd(nowSec, leavesAt, windowSeconds): number;
export function laneIndexAt(lanes: readonly Tile[], x: number, y: number): number;
export function parseDockMg(json: string): DockMg | null;
// game-server/src/sim/orders.ts
export function initOrders(world: World): void;                     // orderBook > 0: pre-creates every OrderState, bookTotal = bookRemaining = orderBook; 'never': none
export function activeOrderId(world: World): string;                // lowest-numbered 'open' order, '' when none (F08 binds orderId at SEAT)
export function settleOrder(world: World, orderId: string, shipped: number): OrderStatus;
// game-server/src/sim/minigames/dock.ts
export const dockModule: MinigameModule;
export function dockTick(world: World, dt: number): void;
export function departTruck(world: World, reason: 'timer' | 'tailgate' | 'whistle'): void;
export function closeShift(world: World): void;                     // docked → departTruck('whistle')
export const dockSystem: System;   // { name: 'dock', onStart: initOrders, tick: dockTick, onDayEnd: (w, status, reason) => reason === 'clock' && closeShift(w) }
```

Rules: shove time = `world.inputClock(sessionId, msg.t)·1000`; a stick whose `fuseLength !==
activeOrder.fuseLength` is refused at the lane (`fx bonk 'WRONG FUSE'`); `departTruck` never writes
`score` or `groove` — a complete truck is `grooveEvents.trucksComplete++`; `bookRemaining` is
untouched when `bookTotal === 0`; when `endsOn === 'never'` `dockTick` creates the next `OrderState`
on demand (`index < bookTotal || endsOn === 'never'`); returns go to `items.placeNear(world, item,
layout.props.returnsPile)`; the **truck ride** is F09's: at departure every player whose tile lies in
`layout.truckBay` gets `drivenOffUntil = clock + carry.truckRideSeconds`, a carried non-broom item
`destroyItem`ed, `stationId = workTile = ''`, position = the break-room door tile, `bubble =
copy.bubbles.sawTheHighway`, `tally.bumpPlayer(userId, 'truckRides')`. Departure toasts use
`world.toast('all', text, kind)`; `truckCredit(...).credit` appears in the toast only.

### 10.7 Day loop, tally, metrics, groove, report — F03 + F11

Day loop (F03, `FactoryRoom` + `World`): `start` handler → `canStart(world, sessionId)` (`phase ===
'lobby'`, `sessionId === state.host`, connected ≥ `level.players.min`; refusals `toast warn` `'Only the
host can start'` / `` `Need ${min} players to start` ``) → `scaled = scaleLevel(world.level,
connectedCount)` → `world.startDay(scaled)` → `room.lock()`. Ends (in `World.tick`, while running,
after every system): `endsOn ∈ {either, book}` and `bookTotal > 0 && bookRemaining === 0` →
`requestEnd('ended', 'book')`; else `endsOn ∈ {either, clock}` and `clock >= shiftSeconds` →
`requestEnd('ended', 'clock')`; `'never'` → neither. Consuming `endRequested`: `phase = 'ended'`,
players frozen, `system.onDayEnd(world, status, reason)` in `SYSTEMS` order, `emit('dayEnded')`.
Then `finishDay(status)`: unless `endsOn === 'never'`, `broadcast('report', world.report)` and
`postRun({ ...report, factoryId: String(factory.id), seed, startedAt, endedAt, status })` with one
retry after 2 s (payload logged on the second failure). `onDispose` while `running` →
`requestEnd('abandoned', 'abandoned')`, one `tick(0)`, `finishDay('abandoned')` without the broadcast.
The room never unlocks; NEXT DAY on the client clears the reconnect token, `room.leave()`,
`location.reload()` → a fresh room with Laravel's advanced `day`.

```ts
// game-server/src/sim/tally.ts (F11)
export type TallyKey = 'kegsMade' | 'kegsUsed' | 'defects' | 'incidents';
export type PlayerTallyKey = 'produced' | 'bubbles' | 'drops' | 'sooted' | 'fusesStomped' | 'niceSaves' | 'truckRides';
export type DestroyCause = 'blast' | 'fizzle';
export type ItemCounts = Record<ItemType, number>;
export class RunTally { counts: Record<TallyKey, number>; destroyedByType: ItemCounts; wastedByType: ItemCounts; players: Map<string, Record<PlayerTallyKey, number>>;
  bump(key: TallyKey): void; bumpPlayer(userId: string, key: PlayerTallyKey): void; destroyed(type: ItemType, cause: DestroyCause): void;
  scrap(type: ItemType): void;      // material lost to neither blast nor fizzle: bills `pnl.waste`, never a hazard line
  reset(): void }
// game-server/src/sim/metrics.ts (F11) — MetricsState kept in a module-level WeakMap<World, MetricsState>
export function createMetrics(world: World): void;                  // reset at onStart
export function snapshotMetrics(world: World): MetricsSnapshot;     // read by day.ts buildReport
export function gradeInputsFor(world: World, reason: EndReason): GradeInputs;   // feeds F02 gradeDay
export function metricsTick(world: World, dt: number): void;        // samples wip/utilization/order timings; writes both utilization fields and state.score (1 Hz)
// game-server/src/sim/groove.ts (F11)
export const grooveSystem: System;   // { name: 'groove', tick }: builds GrooveSample, drains world.grooveEvents, grooveDelta + applyGroove, cleanSweepStep → banner 'CLEAN SWEEP'
// game-server/src/sim/day.ts (F11)
export function isSandbox(world: World): boolean;                   // world.level.day.endsOn === 'never'
export function buildReport(world: World, reason: EndReason): ReportPayload;   // F02 gradeDay/profitAndLoss/utilizationLabel/bottleneckStation
export const reportSystem: System;   // { name: 'report', onStart: reset tally + metrics, tick: metricsTick, onDayEnd: (w, status, reason) => w.setReport(buildReport(w, reason)) }
```

Tally sites: `kegsMade` F05 `complete()`; `kegsUsed` F08 (last pour taken); `defects` F08 (`capLoose ||
frayed || fill !== 1.0`); `produced` F05; `bubbles` F05; `drops` F06; `incidents`, `destroyed('keg','blast')`,
`sooted`, `fusesStomped`, `niceSaves` F10; `destroyed('stick','fizzle')` F06; `truckRides` F09.
`scrap(type)` sites — every `destroyItem` that loses material and is not already a `destroyed`:
F10 `damageStation` (each item on both shelves, kegs excepted: they stay as fuel) and
`onItemLanded`'s blast bin; F06 `dropItem` (nothing free within two tiles) and `releaseCarried`'s
`placeNear` failure; F09 the truck rider's carried item; F08 `bail`'s half-used keg. Never scrapped,
because nothing was lost: F09's stick loaded on a truck (revenue); F08's conversions — parts onto
the cradle, the keg emptied by its last pour (destroyed when that pour *lands*, so a bail or the
whistle still finds it standing), the casing seated — and its `stockCasing` overflow and
`createParts` with hands full (both created and binned in the same call, so neither ever entered
the factory); and any site that already called `destroyed`, which `pnl.waste` reads too.
`pnl.waste` counts every item type and `profitAndLoss` bills what the level prices: a type with no
`economy.wasteCost` entry costs nothing, and no type is dropped before it gets there.
`JigEffect`'s `{ e: 'destroyItem'; itemId; scrap?: true }` carries the flag, because the pure jig
funnels both kinds through one effect and the adapter cannot tell them apart from the call site.
`GrooveSample`: `onTimeShipRate` = orders settled complete in the last 60 s ÷ trucks departed in that
window, `avgShelfFullness` over stations with a cap > 0, `floorItemCount` = items with `holder === ''`,
`reworkShelfCount 0`, starved/jammed counts from `state.stations`, `litFuseCount = state.fuses.size`.
`GrooveEvents = { fizzles, niceSaves, blastKegs, primeSticks, trucksComplete }` (F02); F08 writes
`grooveEvents.primeSticks++` for a PRIME STICK.

Client (F11): `resources/js/game/scenes/Report.ts` `class ReportScene extends Phaser.Scene` (key
`'Report'`), `ReportSceneData { payload: ReportPayload; factoryUrl: string }` (`conn` from
`game.registry`); NEXT DAY for everyone; BACK TO FACTORY → `room.leave()` then
`location.assign(factoryUrl)`; text from `copy.report.*` via `conn.config.copy`.

### 10.8 Shared movement — `shared/src/sim/movement.ts` (F03; F04 consumes)

```ts
import type { Axis } from '../messages';        // declared by F02 in messages.ts — never re-declared here
export interface MoveInput { dx: Axis; dy: Axis }
export interface MoveResult { x: number; y: number; facing: Facing; moved: boolean }
export type SolidFn = (tx: number, ty: number) => boolean;
export function makeWallLookup(layout: LayoutConfig): SolidFn;      // true off-map or when walls contains ty*width + tx
export function stepPosition(pos: { x: number; y: number; facing: Facing }, intent: MoveInput, dt: number, isSolid: SolidFn, speed: number, radius: number): MoveResult;
export function pushOutOfSolid(x: number, y: number, radius: number, isSolid: SolidFn): { x: number; y: number };
```

Facing comes from F02 `facingFrom(dx, dy, previous)` (`tiles.ts`); `stepPosition` returns it. Axis
separation, `ε = 1e-6`, out-of-bounds solid. The server calls it with `speed` from §2 and `radius =
level.movement.playerRadius`; the client calls it with `me.speed` and `conn.config.level.movement.playerRadius`
for own-avatar prediction. There is no `shared/src/sim/move.ts`.

### 10.9 Client overlays and views — `resources/js/game/minigames/` (F04; F07/F08/F09 implement)

```ts
// types.ts
export type OverlayKey = 'left' | 'right' | 'up' | 'down' | 'space' | 'interact' | 'esc';
export interface OverlayContext {
  scene: Factory; room: Room<FactoryState>; sessionId: string; state: FactoryState;
  container: Phaser.GameObjects.Container;                          // the panel; draw inside (0,0)–(width,height)
  width: number; height: number; stationId: string; stationType: StationType;
  clock: ServerClock; serverClock(): number;                        // = clock.now(), estimated FactoryState.clock seconds
  anchorPx(): { x: number; y: number };
  send(op: MgOp, v?: number | string): void;                        // room.send('mg', { stationId, op, t: performance.now(), v })
  sendInteract(): void;                                             // room.send('interact', { t: performance.now() })
  sendAction(): void;                                               // room.send('action', { t: performance.now() })
}
export interface MinigameOverlay {
  capturesMovement: boolean;                                        // true: arrows → onKey only; false (dock): arrows → intent
  mount(ctx: OverlayContext): void;
  update(station: StationState, me: PlayerState, serverNow: number): void;   // every frame while mounted
  onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean;  // true = consumed
  unmount(): void;
}
export type OverlayFactory = () => MinigameOverlay;
export interface StationView {                                      // one per station of the type, on every client
  create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void;
  update(station: StationState, serverNow: number): void;
  destroy(): void;
}
// index.ts — F07/F08/F09 each replace their entry (Stub until then)
export const minigames: Record<StationType, OverlayFactory>;
export const stationViews: Partial<Record<StationType, () => StationView>>;
// fx/Fx.ts
export class Fx { play(m: FxMsg): void; override(kind: FxKind, handler: (scene: Factory, m: FxMsg) => void): void }   // handler replaces the default for that kind
// input/Keys.ts — KeyEvents.overlayKey: (key: OverlayKey, down: boolean, repeat: boolean) => void; setOverlayRouting(on: boolean)
// scenes/Factory.ts
export class Factory extends Phaser.Scene { readonly conn: Connection; readonly layers: FactoryLayers; readonly keys: Keys; readonly fx: Fx;
  avatarPosition(sessionId: string): { x: number; y: number } | null }   // px; predicted for self, interpolated for others
// net/connection.ts
export interface ClientConfig { level: LevelConfig; layout: LayoutConfig; copy: Copy }
```

Host rules: the overlay mounts when `me.stationId !== '' && me.workTile !== ''` and the clipboard has
expired (the clipboard panel shows `me.bubble`); `onKey` true → Host suppresses the default for that
key; false → the floor behaviour fires (`interact` → `sendInteract`, `space` → `sendAction`, `esc` →
`leave`) — the dock relies on `interact` still being sent. `Factory.create()` ends with the fixed mount
list `createStationsLayer(this)` (F05), `createItemsLayer(this)` (F06), `createHazardsLayer(this)`
(F10), then one `StationView` per station of a registered type, updated every frame. HUD: when
`state.shiftSeconds === 0` show elapsed `mmss(clock)` and hide the BOOK glyphs; banner text =
`conn.config.copy.banners[state.banner]`; lobby "ENTER starts the shift" only when `state.host ===
conn.sessionId`. Implementations: `minigames/Slammer.ts` + `SlammerWorld.ts` (F07),
`minigames/Jig.ts` + `JigWorldFx.ts` (F08), `minigames/Dock.ts` + `dock/TruckSprite.ts` +
`dock/BayWall.ts` (F09) — each exports an `OverlayFactory` and a `() => StationView`.

## 11. Dispatch and tick order

Message dispatch (`game-server/src/rooms/handlers.ts`). The wrapper (F03) validates the payload with
the F02 guard, updates `clockOffsetMs` for `mg`/`action`/`interact`, drops `interact`/`action` while
`clock < player.stunnedUntil`, and never lets an exception kill the room.

| message | chain (first `true` stops) | entry owner |
|---|---|---|
| `input` | F03 movement intent | F03 |
| `emote` | F03 bubble = `copy.emotes[kind]` | F03 |
| `start` | F03 `canStart` → `room.startDay()` | F03 |
| `config` | F03 reply `{ level: world.level, layout: world.layout, copy }` | F03 |
| `interact` | `items.onInteract(world, player, t?)` → `stations.onInteract(world, player)` (a `stand` station's module gets `onInteract` first, regardless of `carrying`) → if the player's tile is a work tile of a station with `state === 'damaged'`: `hazards.tryBeginRepair(world, sessionId, stationId)` | F06 (F05 and F10 append their call) |
| `action` | `items.onAction(world, player, t)` (throw / sweep) → `hazards.tryBeginStomp(world, sessionId)` → `stations.onMg` fallback for an overlay that sends `action` while carrying | F06 (F10 and F05 append) |
| `leave` | `stations.leave(world, player)` | F05 |
| `mg` | `stations.onMg(world, player, msg)` (dropped unless `player.stationId === msg.stationId`, clipboard done, not jammed/damaged/paused) | F05 |
| disconnect (after the 30 s grace) | `items.releaseCarried(world, sessionId)` → `stations.onPlayerLeft(world, sessionId)` → `world.removePlayer` | F03 — `FactoryRoom.onLeave` calls all three directly (plain imports, no Touches needed); F05 and F06 register no `playerLeft` listener for this path |

`SYSTEMS` order (`game-server/src/sim/systems.ts`; each owner appends its own line):

```
movementSystem (F03) → bubblesSystem (F03) → stationsSystem (F05) → itemsSystem (F06) → hazardsSystem (F10)
→ dockSystem (F09) → grooveSystem (F11) → reportSystem (F11, tick = metricsTick)
```

`World.tick(dt)`: `state.clock += dt` (every phase); `reindexPlayers()`, `reindexItems()`; each
`system.tick` in order — only `movementSystem` and `bubblesSystem` run while `phase === 'lobby'`,
every system runs while `'running'`, none while `'ended'`; then the end check (§10.7); then
`endRequested` is consumed (`onDayEnd` hooks in `SYSTEMS` order — `reportSystem` last so it sees the
final state). After each step `FactoryRoom` drains `world.outbox` and, if the step consumed
`endRequested`, runs `finishDay`. Within a tick: `bump` events are emitted by movement and consumed by
`items.tick`; `tickHazards` runs after stations so a red beacon overrides gold; `dockTick` runs after
hazards; `grooveSystem` drains `grooveEvents` written by any earlier system in the same tick.

## 12. Ownership

One owner per file. "Touches" are the only permitted edits to another owner's file.

| Area | Files | Owner | Touches |
|---|---|---|---|
| Laravel app, routes, migrations (incl. `runs`, `run_players`), models, actions (incl. `StoreRun`), requests, controllers, Livewire, `play.blade.php`, `config/game.php`, Pest tests, root `package.json` | `app/**`, `routes/**`, `database/**`, `resources/views/**`, `config/game.php`, `tests/**` | F01 | F12: `Level::isSandbox`, `isUnlockedFor`, `PlayController` `$debug`, `LevelFactory::sandbox`, `tests/Feature/Levels/*` |
| Schema classes, messages, config types + `schema.json` + `validate.ts` + `defaults.ts`, `report.ts`, `sim/{constants,tiles,curve,cycle,groove,scale,grade,bottleneck}.ts`, `shared/src/index.ts`, fixtures | `shared/src/**` (except the module files below), `shared/tests/**` (same) | F02 | one `export *` line per module owner; F12 `copy.ts` line |
| `shared/src/sim/movement.ts`, `game-server/**` core (`index.ts`, `env.ts`, `shared.ts`, `auth/`, `laravel/`, `config/`, `rooms/`, `sim/{World,systems,rng,movement,bubbles}.ts`, the **stub bodies** of `sim/{stations,tally}.ts` until F05/F11 land, `tests/helpers/world.ts`, core-module tests, `scripts/smoke.ts`) | as listed | F03 | `systems.ts`: one line per system owner; `handlers.ts`: F06 (`interact`, `action`), F05 (`mg`, `leave`) |
| Client core (`main.ts`, `mount.ts`, `net/`, `scenes/{Boot,Factory}.ts`, `render/{Floor,Avatars,palette,Interpolation}.ts`, `predict/`, `input/`, `ui/`, `fx/Fx.ts`, `minigames/{types,Host,Stub,index}.ts`, `__tests__/`), root `vitest.config.ts`, `tsconfig.json`, `vite.config.js` entry + alias | `resources/js/game/**` (except the module files below) | F04 | `minigames/index.ts`: F07/F08/F09 entries; `Factory.create()` mount list: F05/F06/F10 one line each; `main.ts` scene list: F11 |
| Stations (replaces F03's `stations.ts` stub) | `shared/src/sim/stations.ts`, `game-server/src/sim/stations.ts`, `game-server/src/sim/minigames/{types,index}.ts`, the stub bodies of `minigames/{slammer,jig,dock}.ts` until their owner lands, `resources/js/game/render/{Stations,stationGlyphs}.ts` | F05 | — (no `render/overlays.ts`) |
| Items | `shared/src/sim/items.ts`, `game-server/src/sim/{items,itemThrow,itemDrop,chores}.ts`, `resources/js/game/render/Items.ts` | F06 | — |
| Slammer | `shared/src/sim/slammer.ts`, `game-server/src/sim/minigames/slammer.ts`, `resources/js/game/minigames/{Slammer,SlammerWorld,slammerAudio}.ts` | F07 | `Fx.override` calls for `thunk/pfft/clink/slop` |
| Jig | `shared/src/sim/jig.ts`, `game-server/src/sim/minigames/jig.ts`, `resources/js/game/minigames/{Jig,JigWorldFx}.ts` | F08 | — |
| Dock + orders | `shared/src/sim/{orders,dock}.ts`, `game-server/src/sim/orders.ts`, `game-server/src/sim/minigames/dock.ts`, `resources/js/game/minigames/Dock.ts`, `resources/js/game/minigames/dock/{TruckSprite,BayWall}.ts` | F09 | — |
| Hazards | `shared/src/sim/hazards.ts`, `game-server/src/sim/{hazards,hazardsApply}.ts`, `resources/js/game/hazards/{HazardsLayer,FuseFx,BlastFx,DangerBeacon,RepairSign}.ts` | F10 | — (no `ScorchTiles.ts`, no `BannerText.ts`) |
| Day report (replaces F03's `tally.ts` stub) | `game-server/src/sim/{tally,metrics,groove,day}.ts`, `resources/js/game/scenes/Report.ts`, `resources/js/game/report/format.ts`, their tests | F11 | — (no Laravel files, no `grade.ts`/`report.ts`, no `runPost.ts`, no `FactoryRoom` edits) |
| Levels, layout, copy (**`copy.json` + `copy.ts` in wave 1**, the rest wave 5) | `config/game/**`, `shared/src/copy.ts`, `shared/tests/{levels,copy}.test.ts`, `docs/PLAYTEST.md` | F12 | see F01 and F02 rows |

Field ownership resolved: `StationState.state/progress` — the mini-game module (`idle|starved|working`
via `status?`), F05 writes `jammed` (via `jam`/`unjam`), F10 writes `damaged`; both `utilization`
fields — F11; `FactoryState.score` — F11; `groove` — F11's `grooveSystem` (nobody else writes it);
`beacon` — module `gold|off`, F10 `red|off` (red wins); `banner` — per §3 writers; `packTile`/`tileOf`
— F02 only; the overlay registry — F04 only; the run store — F01 only; `grade.ts`/`report.ts` — F02
only; `FactoryRoom` day loop — F03 only.

## 13. Defaults — `shared/src/config/defaults.ts` (F02)

Optional level keys and the defaults `validateLevelConfig()` applies. Level files may omit any of them;
consumers read the applied value and never branch on `undefined`.

| Key | Default | Read by |
|---|---|---|
| `movement.tilesPerSecond` | `4` | F03 movement (F04 integrates `PlayerState.speed`, never the base) |
| `movement.playerRadius` | `0.35` | F03, F04 |
| `movement.bumpStaggerSeconds` | `0.3` | F03 |
| `movement.floorItemSpeed` | `0.4` | F03 `World.tileSpeed` |
| `movement.spillSpeed` | `0.6` | F03 `World.tileSpeed` |
| `clipboardMemorySeconds` | `60` | F05 |
| `interrupts.everySeconds` | `6` | F05 |
| `interrupts.pauseSeconds` | `0.5` | F05 |
| `carry.putDownSeconds` | `0.3` | F06 |
| `carry.hitStaggerSeconds` | `0.5` | F06 |
| `hazards.unjamSeconds` | `4` | F06 |
| `hazards.sweepSecondsPerTile` | `1.5` | F06 |
| `hazards.repairSeconds` | `10` | F10 |
| `hazards.bannerSeconds` | `3` | F10 |
| `groove.weights.truckComplete` | `10` | F11 `grooveSystem` |
| `scoring.perOrder` | `100` | F09 `truckCredit` (toast only) |
| `grading.advanceOn` | `'C'` | F01 `StoreRun` |
| `stations[type=boom_powder].minigame.heat.overholdMs` | `500` | F07 |
| `stations[type=boom_powder].minigame.comboBannerSeconds` | `2` | F07 |
| `stations[type=assembly].minigame.casings` | `{ stock: 3, dentChance: 0.3 }` | F08 feeder |
| `stations[type=dock].minigame.tailgateHoldSeconds` | `0.5` | F09 |
| `stations[type=dock].minigame.leaveSeconds` | `1.5` | F09 |
| `notes` | *(none — optional string)* | nobody |

Constants that stay in code (`shared/src/sim/constants.ts`, F02): `TICK_HZ 20` / `TICK_SECONDS 0.05`,
`TILE_PX 32`, `STUNNED_SPEED_MULT 0`, `INPUT_HEARTBEAT_MS 250`, `MAX_CLIENTS 10`, `RECONNECT_SECONDS 30`,
`PLAYER_COLOURS 8`, `MAX_INPUT_BACKDATE_S 0.2`, `CYCLE { churnFactorMax 1.15, perfectRearmFactor 0.75, interruptSecondsPerBubble 0.5 }`,
`HERO_POINTS_PER_EVENT 2`, `UTILIZATION_LABELS { excellent 0.9, good 0.6 }`,
`ITEM_ID_PREFIX { keg 'k', casing 'c', stick 's', crate 'x', parts 'p' }`, `STATION_SHORT`, `BANNERS`.
`WALK_SPEED`, `FLOOR_ITEM_SPEED_MULT`, `SPILL_SPEED_MULT`, `BUMP_STAGGER_SECONDS`, `PUT_DOWN_SECONDS`,
`CLIPBOARD_RECENCY_SECONDS`, `UNJAM_SECONDS`, `INTERRUPT_EVERY_SECONDS` do not exist — those numbers are
the config keys above.

## 14. Conventions

- TypeScript strict everywhere; explicit return types on exported functions; no `any`.
- Pure functions in `shared/src/sim/` with vitest tests beside them (`shared/tests/`); no I/O, no
  clock reads, no randomness inside — `rng: () => number` is passed in.
- Server systems are plain modules operating on a `World` (§10.1) that holds config, state, RNG
  (seeded) and tile lookups; per-module private state lives in a module-level `WeakMap<World, …>`.
  No system reaches into Colyseus directly except `FactoryRoom`.
- Client renders from state callbacks; it never mutates state. Own-avatar prediction only.
- Laravel: `declare(strict_types=1)`, Actions in `app/Actions`, thin controllers, Pest tests, Pint.
  Livewire + Flux (free) for the shell.
- Config over code: every number a designer might tune lives in the level JSON (with §13 defaults).
- Copy (joke lines) in `config/game/copy.json` through `Copy`; never inline. Functional strings with
  numbers (`TRUCK LEFT WITH 3/8`, `Need 3 players to start`) are code.
- Consequences are player-caused, never random: callers roll `hazards.sparks.*` for a named cause.
