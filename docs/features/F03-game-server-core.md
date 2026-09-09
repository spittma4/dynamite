# F03 — Game server core: Colyseus room, ticket auth, world, movement, day loop
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `game-server/` (package, `src/index.ts`, `src/env.ts`, `src/shared.ts`, `src/auth/`, `src/laravel/`, `src/config/`, `src/rooms/`, `src/sim/World.ts`, `src/sim/systems.ts`, `src/sim/rng.ts`, `src/sim/movement.ts`, `src/sim/bubbles.ts`, `tests/` incl. `tests/helpers/world.ts`, `scripts/smoke.ts`) · `shared/src/sim/movement.ts` · `shared/tests/movement.test.ts`
**Touches:** `shared/src/index.ts` — appends `export * from './sim/movement';` (F02 owns the file; one line). Later owners append their own line to `game-server/src/sim/systems.ts` (`SYSTEMS`) and replace their entries in `game-server/src/rooms/handlers.ts` (F06: `interact`, `action`; F05: `mg`, `leave`).
**Reads:** `docs/features/00-contracts.md` (v2 — binding), `docs/11-architecture.md`, `docs/02-factory-floor.md` (Movement, Space), `docs/19-scaling-3-to-10.md` (Netcode), `docs/17-oops-carry-and-throw.md` (bump rule), `docs/14-roadmap.md`, `docs/12-data-model.md` (factory owner), `docs/13-config-schema.md` (key names), ADR 0001, ADR 0002. Colyseus 0.18 API verified against the `colyseus/colyseus` master source (`packages/core/src/Room.ts`, `Server.ts`, `Transport.ts`, `matchmaker/RegisteredHandler.ts`, `index.ts`) and `docs.colyseus.io` (`/room/lifecycle`, `/room/reconnection`, `/state/schema`, `/matchmaker`, `/migrating/0.18`) on 2026-09-04.

## Goal

When this is done, a player who clicks *Enter factory* in the Laravel shell lands in a Colyseus room
that belongs to their factory and nobody else's, sees every teammate's avatar walk around the M1 map
at 20 Hz, can bump into them, wave an emote bubble, and — if they are the host and at least
`players.min` people are present — press *Start* to begin the shift. The room owns the one time base
(`FactoryState.clock`), the start gate, the end conditions (`day.endsOn`), the report broadcast, the
run POST, and the 30-second held seat. Every later feature (stations, items, hazards, orders, groove,
report) plugs into this room as a `System` on the `World`; none of them touches Colyseus.

## Scope

**In (M1):**
- `game-server/` package: Node 22, TypeScript strict, `tsx` for dev and prod, `vitest`.
- Bootstrap with `defineServer` + `server.listen` from `colyseus` 0.18 (not `@colyseus/tools`; see Files).
- Ticket verification per contracts §5, with `DEV_ALLOW_NO_TICKET=1` dev join `{ name, factoryId }`.
- Laravel API client with the HMAC signature of contracts §5; local `LEVELS_DIR` fallback when Laravel
  is unreachable.
- `FactoryRoom`: one room per factory (`filterBy(['factoryId'])`), `onAuth`/`onJoin`/`onLeave`/`onDispose`,
  `allowReconnection(client, RECONNECT_SECONDS)`, phases `lobby → running → ended`, host-only `start`,
  `players.min` gate, room lock at start, fixed 50 ms simulation step, outbox draining, run posting at
  day end (including `abandoned`).
- The day loop of contracts §10.7: `clock` in every phase, `day.endsOn` gating (`either`/`book`/`clock`/`never`),
  `world.requestEnd(status, reason)` consumed at the end of the tick, `report` broadcast and
  `POST /internal/runs` with one retry, `abandoned` on dispose, a fresh room for the next day.
- Sandbox support: `day.endsOn === 'never'` never ends by book or clock, broadcasts no `report`, posts
  no run, and lets `players.min` be 1.
- `World`: config, state, seeded RNG, wall grid, per-tile player/item lookups, `stationConfig`,
  `tileOf`/`packTile`, `inputClock`, `tally`, `grooveEvents`, `stations`, typed events, ordered `System`
  registry, outbox for `fx`/`toast`, day-end request.
- Movement: input intent with `seq`, `movement.tilesPerSecond`, 8 directions normalised, wall collision,
  soft player–player push, `bump` event + stagger, carrying/frozen/floor-item/spill speed modifiers,
  facing, `seq` echo. One integrator in `shared/src/sim/movement.ts` shared with F04's prediction.
- Emotes → speech bubble from `copy.emotes`; bubble and banner expiry.
- Message handlers for every name in contracts §4. F03 implements `input`, `emote`, `start`, `config`;
  `interact`, `action`, `mg`, `leave` are no-op stubs with a debug log until F05/F06 replace them.
- `game-server/tests/helpers/world.ts` `makeWorld(...)` — the one server test fixture every server
  feature uses.
- Unit tests for ticket verification, request signing, level fallback, RNG, movement integration
  (shared and server), World, day loop, lobby rules, handlers.
- `scripts/smoke.ts`: three headless `@colyseus/sdk` clients that join, walk, and start a day, so the
  room can be verified before the Phaser client exists.

**Out (later milestones):**
- Two-line layouts, per-line hats, `maxPlayers > 6` playtests — M2 (docs/19).
- Hard player collision toggle — M2 if playtests ask (docs/02 "hard collision is a one-line change").
- Chaos events, Order Board — M3.
- Reverb lobby presence, admin force-end, Payday, deploy as systemd — M4.
- Powder footprints — M2 (docs/17).
- Horizontal scaling, multiple processes, `@colyseus/tools` / PM2 port offsets — never (docs/11 "no
  horizontal scaling story").

## Design

### Files

| Path | Responsibility |
|---|---|
| `game-server/package.json` | `"type": "module"`, `engines.node >=22`; deps `colyseus ^0.18.10`, `@colyseus/schema ^5.0.27` (identical version to `shared`); dev deps `tsx`, `typescript ^5`, `vitest`, `@types/node`, `@colyseus/sdk ^0.18` (smoke script only). Scripts: `dev` = `tsx watch src/index.ts`, `start` = `tsx src/index.ts`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `smoke` = `tsx scripts/smoke.ts`. |
| `game-server/tsconfig.json` | `strict`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `experimentalDecorators: true`, `useDefineForClassFields: false`, `include: ["src", "tests", "scripts", "../shared/src"]`. `useDefineForClassFields` must be **false**: `@colyseus/schema` 5's field decorators are the legacy kind, and `define` semantics would re-initialise each decorated field to `undefined` after the decorator installed its accessor. `Bundler` resolution (not `NodeNext`) because `tsx` runs the sources directly and every import here is extension-less. |
| `game-server/.env.example` | The env keys from contracts §2 with local defaults. |
| `game-server/src/env.ts` | Reads and validates env once into `Env`; exits with a clear message when `GAME_SERVER_SECRET` is missing and `DEV_ALLOW_NO_TICKET` is not `1`. |
| `game-server/src/shared.ts` | The one file that knows the relative path to `shared/`. Re-exports the barrel `../../shared/src/index.ts` (schema classes, message types + guards, config types, `copy`/`clipboardLines`/`fill`, `tiles.ts`, `constants.ts`, `report.ts`, `scale.ts`, `stepPosition`/`makeWallLookup`/`pushOutOfSolid`) and, separately, the Node-only validators from `../../shared/src/config/validate` (`validateLevelConfig`, `validateLayoutConfig`, `validateLevelOnLayout`), which are deliberately not in the barrel. |
| `game-server/src/index.ts` | `defineServer({ rooms, gracefullyShutdown: true, express })` then `server.listen(env.PORT)`. Express adds `GET /healthz` → `{ ok: true }`. Boot only: it listens at import time, so nothing it declares can be unit-tested. |
| `game-server/src/rooms/index.ts` | `rooms = { factory: defineRoom(FactoryRoom).filterBy(['factoryId']) }` — the registration as a value, so `tests/rooms.test.ts` can assert the filter that keeps one factory out of another's room. |
| `game-server/src/auth/ticket.ts` | `verifyTicket`, `signTicket`, `TicketClaims`, `TicketResult` (contracts §5). |
| `game-server/src/laravel/signature.ts` | `signRequest(method, path, body, secret)` → lowercase hex HMAC over the URL path **without** the query string. |
| `game-server/src/laravel/api.ts` | `FactoryConfigResponse`, `fetchFactoryConfig`, `postRun` over `fetch` with the signature header; throws `LaravelUnreachableError`. |
| `game-server/src/config/levels.ts` | `loadLocalFactoryConfig` (reads `LEVELS_DIR`), `resolveFactoryConfig` (Laravel first, local fallback), both run through `validateLevelConfig` / `validateLayoutConfig` / `validateLevelOnLayout`. |
| `game-server/src/rooms/FactoryRoom.ts` | The only Colyseus-aware file: lifecycle, reconnection, phases, fixed step, outbox draining, `startDay`, `finishDay`, run posting, disconnect chain. |
| `game-server/src/rooms/handlers.ts` | `MESSAGE_HANDLERS`: one entry per client message name from contracts §4, plus the validating wrapper (F02 guard, `clockOffsetMs` update, stunned drop, exception containment). F03 implements `input`, `emote`, `start`, `config`; F06 replaces `interact`/`action`, F05 replaces `mg`/`leave` (one-line touches). |
| `game-server/src/rooms/lobby.ts` | Pure rules: `chooseHost`, `canStart`, `pickColour`, `spawnTiles`. |
| `game-server/src/sim/World.ts` | `World` class, `System`, `WorldEvents`, `BumpEvent`, `PlayerRuntime`, `AuthPayload`, `WorldInit`, `Outbound`, `DayEndStatus`, outbox, day loop. |
| `game-server/src/sim/systems.ts` | `SYSTEMS: System[]` — the ordered registration list later features append to. |
| `game-server/src/sim/rng.ts` | `Rng` (mulberry32) — seeded, deterministic. |
| `game-server/src/sim/movement.ts` | `movementSystem`: intents → positions, push, bump, speed, facing, `seq` echo. |
| `game-server/src/sim/bubbles.ts` | `bubblesSystem`: clears expired `PlayerState.bubble` and `FactoryState.banner`. |
| `game-server/tests/helpers/world.ts` | `makeWorld({ level?, layout?, seed?, players? }): World` — real schema classes, F02's fixtures, every `SYSTEMS` entry registered, `init()` run; `players` seats that many dev players. Every server test file in every feature uses it. |
| `shared/src/sim/movement.ts` | Pure integration (contracts §10.8) used by the server and by F04's own-avatar prediction. |
| `shared/tests/movement.test.ts` | Tests for the pure integration. |
| `game-server/tests/*.test.ts` | `ticket`, `signature`, `levels`, `rng`, `World`, `dayLoop`, `movement`, `bubbles`, `handlers`, `lobby`, `rooms`. |
| `game-server/scripts/smoke.ts` | Dev tool: three bots join with `{ name, factoryId }`, send inputs, `start`, print positions and phase. |

Why `defineServer` and not `@colyseus/tools`: `@colyseus/tools`' `listen(config(...))` adds PM2 port
offsetting and Colyseus Cloud socket handling we will never use; `defineServer` is the documented 0.18
entry point, returns a `Server` with `listen()`, and picks `@colyseus/ws-transport` by default. Why
`tsx` in production: one private VPS, one process; a `tsc` build with `rootDir: ..` to include `shared/`
buys nothing at this scale.

### Interfaces

**Consumes**

- Contracts §3 schema classes from `shared/src/schema/` (F02): `FactoryState`, `PlayerState`, `ItemState`
  and the field names listed there; `Facing` and the string unions from `shared/src/schema/types.ts`.
- Contracts §4 message names, payload types and guards from `shared/src/messages.ts` (F02):
  `input { dx, dy, seq }`, `interact { t? }`, `action { t }`, `mg { stationId, op, t, v? }`, `leave {}`,
  `emote { kind }`, `start {}`, `config {}`; server → client `config`, `fx`, `toast`, `report`;
  `isInputMsg`/`isInteractMsg`/`isActionMsg`/`isMgMsg`/`isEmoteMsg`.
- Contracts §8 from `shared/src/config/types.ts` (F02): `LevelConfig`, `LayoutConfig`, `StationConfig`
  (incl. the required `joinMode`), `ScaledLevel`; `shared/src/config/validate.ts` (Node-only)
  `validateLevelConfig(input): ValidationResult<LevelConfig>` — it **returns** `{ ok, value | errors }`
  with §13 defaults applied, it does not throw — plus `validateLayoutConfig` and `validateLevelOnLayout`;
  `shared/src/sim/scale.ts` `scaleLevel(level, players): ScaledLevel`.
- Contracts §8 copy from `shared/src/copy.ts` (F12): `copy` (for `copy.emotes[kind]` and the `config`
  reply). No string is inline.
- Contracts §10 tiles from `shared/src/sim/tiles.ts` (F02): `Tile`, `tileOf`, `packTile`, `unpackTile`,
  `tileKey`, `facingFrom` — re-exported by `World`, never redefined.
- Contracts §13 constants from `shared/src/sim/constants.ts` (F02): `TICK_SECONDS`, `INPUT_HEARTBEAT_MS`,
  `MAX_INPUT_BACKDATE_S`, `RECONNECT_SECONDS`, `MAX_CLIENTS`, `PLAYER_COLOURS`.
- Contracts §9 `ReportPayload`, `RunPayload`, `EndReason`, `RunStatus` from `shared/src/report.ts` (F02).
- Contracts §10 module types owned elsewhere and surfaced on `World`: `RunTally` (F11
  `game-server/src/sim/tally.ts`), `GrooveEvents` (F02), `Station` (F05 `game-server/src/sim/stations.ts`).
- Contracts §5 endpoints (F01): `GET /internal/factories/{id}/config?players=N`, `POST /internal/runs`.
- Colyseus 0.18 (`colyseus`): `Room`, `Client`, `AuthContext`, `CloseCode`, `defineServer`, `defineRoom`;
  `@colyseus/schema` 5 `MapSchema`.

**Produces**

`game-server/src/auth/ticket.ts`
```ts
export interface TicketClaims { userId: string; factoryId: string; name: string; exp: number } // exp = Unix seconds
export type TicketFailure = 'malformed' | 'bad-signature' | 'bad-claims' | 'expired';
export type TicketResult = { ok: true; claims: TicketClaims } | { ok: false; reason: TicketFailure };
export function verifyTicket(ticket: string, secret: string, nowSeconds?: number): TicketResult;
export function signTicket(claims: TicketClaims, secret: string): string; // tests + smoke script; mirrors Laravel
```

`game-server/src/laravel/signature.ts`
```ts
export function signRequest(method: 'GET' | 'POST', path: string, body: string, secret: string): string; // lowercase hex
```

`game-server/src/laravel/api.ts`
```ts
export interface FactoryConfigResponse {
  factory: { id: string; name: string; day: number; coin: number; ownerUserId: string };
  level: LevelConfig; layout: LayoutConfig; members: Array<{ userId: string; name: string }>;
}
export class LaravelUnreachableError extends Error { constructor(message: string, readonly cause?: unknown) }
export function fetchFactoryConfig(env: Env, factoryId: string, players: number, fetchImpl?: typeof fetch): Promise<FactoryConfigResponse>;
export function postRun(env: Env, run: RunPayload, fetchImpl?: typeof fetch): Promise<{ ok: true; runId: number }>;
```

`game-server/src/config/levels.ts`
```ts
export function loadLocalFactoryConfig(levelsDir: string, factoryId: string): FactoryConfigResponse;
export function resolveFactoryConfig(env: Env, factoryId: string, players: number, fetchImpl?: typeof fetch): Promise<{ config: FactoryConfigResponse; source: 'laravel' | 'local' }>;
```

`game-server/src/env.ts`
```ts
export interface Env { PORT: number; LARAVEL_URL: string; GAME_SERVER_SECRET: string; LEVELS_DIR: string; DEV_ALLOW_NO_TICKET: boolean }
export function loadEnv(source?: NodeJS.ProcessEnv): Env;
```

`game-server/src/sim/rng.ts`
```ts
export class Rng {
  constructor(seed: number);            // 32-bit; mulberry32
  next(): number;                       // [0, 1)
  int(minInclusive: number, maxExclusive: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}
```

`shared/src/sim/movement.ts` (contracts §10.8; F04 consumes it for own-avatar prediction)
```ts
export type Axis = -1 | 0 | 1;
export interface MoveInput { dx: Axis; dy: Axis }
export interface MoveResult { x: number; y: number; facing: Facing; moved: boolean }
export type SolidFn = (tx: number, ty: number) => boolean;
export function makeWallLookup(layout: LayoutConfig): SolidFn;   // true off-map or when walls contains ty*width + tx
export function stepPosition(pos: { x: number; y: number; facing: Facing }, intent: MoveInput, dt: number, isSolid: SolidFn, speed: number, radius: number): MoveResult;
export function pushOutOfSolid(x: number, y: number, radius: number, isSolid: SolidFn): { x: number; y: number };
```
Facing comes from F02's `facingFrom(dx, dy, previous)` (`shared/src/sim/tiles.ts`); this module defines
no facing table of its own. There is no `shared/src/sim/move.ts`.

`game-server/src/sim/World.ts` (contracts §10.1)
```ts
export type DayEndStatus = 'ended' | 'exploded' | 'abandoned';
export interface System {
  name: string;
  init?(world: World): void;                                        // once, at room creation (lobby)
  onStart?(world: World): void;                                     // at `start`, after phase = 'running', in SYSTEMS order
  tick?(world: World, dt: number): void;                            // every fixed step (see Behaviour for phases)
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
  startDay(scaled: ScaledLevel): void;                                // phase 'running', clock 0, re-spawn, system.onStart in order
  tick(dt: number): void;                                             // see Behaviour
  requestEnd(status: DayEndStatus, reason: EndReason): void;          // consumed at the end of the current tick
  setReport(report: ReportPayload): void;                             // called by reportSystem inside onDayEnd
  on<K extends keyof WorldEvents>(event: K, fn: (e: WorldEvents[K]) => void): () => void;
  emit<K extends keyof WorldEvents>(event: K, e: WorldEvents[K]): void;
  fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void;   // to 'all'
  toast(to: 'all' | string, text: string, kind: ToastKind): void;
}
```

`game-server/src/sim/systems.ts`
```ts
export const SYSTEMS: System[] = [movementSystem, bubblesSystem];
// Each later owner appends exactly one line, in contracts §11 order:
// stationsSystem (F05) → itemsSystem (F06) → hazardsSystem (F10) → dockSystem (F09)
// → grooveSystem (F11) → reportSystem (F11, last: onDayEnd must see the final state).
```

`game-server/src/rooms/handlers.ts`
```ts
export interface HandlerContext { world: World; sessionId: string; player: PlayerState; room: RoomControls }
export interface RoomControls { startDay(): void; sendConfig(sessionId: string): void }   // the only Colyseus-side actions a handler may trigger
export type MessageHandler = (ctx: HandlerContext, payload: unknown) => void;
export const MESSAGE_HANDLERS: Record<'input' | 'interact' | 'action' | 'mg' | 'leave' | 'emote' | 'start' | 'config', MessageHandler>;
```
Entry owners (contracts §11): `input`, `emote`, `start`, `config` — F03. `interact` and `action` — F06
replaces the stub (F05 and F10 then append their call inside F06's entry). `mg` and `leave` — F05
replaces the stub. Until then each stub logs `handler <name> not implemented` at debug and returns.

`game-server/src/rooms/lobby.ts`
```ts
export function chooseHost(players: Map<string, PlayerRuntime>, states: Map<string, PlayerState>, ownerUserId: string): string; // '' when nobody connected
export function canStart(world: World, sessionId: string): { ok: true } | { ok: false; reason: 'not-lobby' | 'not-host' | 'too-few'; min: number };
export function pickColour(taken: number[]): number;      // lowest free 0..PLAYER_COLOURS-1, else joinIndex % PLAYER_COLOURS
export function spawnTiles(layout: LayoutConfig, isSolid: SolidFn, count: number): Tile[];
```

`game-server/src/rooms/FactoryRoom.ts`
```ts
export class FactoryRoom extends Room<{ state: FactoryState }> {
  maxClients: number;                    // set in onCreate from level.players.max
  state = new FactoryState();
  onCreate(options: { factoryId: string }): Promise<void>;
  onAuth(client: Client, options: JoinOptions, context: AuthContext): AuthPayload;
  onJoin(client: Client, options: JoinOptions, auth: AuthPayload): void;
  onLeave(client: Client, code: number): Promise<void>;
  onDispose(): Promise<void>;
  startDay(): void;
  finishDay(status: DayEndStatus): Promise<void>;
}
export type JoinOptions = { ticket: string; factoryId: string } | { name: string; factoryId: string }; // dev form only with DEV_ALLOW_NO_TICKET=1
```

`game-server/tests/helpers/world.ts`
```ts
export function makeWorld(opts?: { level?: LevelConfig; layout?: LayoutConfig; seed?: number; players?: number }): World;
```
Real schema classes, F02's `shared/tests/fixtures/level-m1.json` + `layout-one-line.json` by default,
every `SYSTEMS` entry registered, `init()` run, and `players` dev players seated on the spawn ring.

**State written by F03** (contracts §3 writer list): `FactoryState.{levelKey layoutKey day phase clock
shiftSeconds host coin width height groove(start)}`; `PlayerState.{userId name colour line x y facing
moving speed seq bubble bubbleUntil stunnedUntil(bump stagger)}`. `bubblesSystem` additionally clears
`PlayerState.bubble`/`bubbleUntil` and `FactoryState.banner`/`bannerUntil` when their `Until` passes —
expiry only, never a value. F03 writes neither `score` nor `groove` after room creation (F11 owns both),
nor `bookTotal`/`bookRemaining` (F09).

### Data & config

Config keys read (contracts §8; `?` keys carry the §13 default that `validateLevelConfig` has already
applied, so F03 never branches on `undefined`):

| Key | M1 value | Required? |
|---|---|---|
| `level.players.min` | 3 (1 on `sandbox`) | required — the start gate, counted over **connected** players |
| `level.players.max` | ≤ 10 | required — `maxClients` |
| `level.day.shiftSeconds` | 600 (0 when `endsOn === 'never'`) | required |
| `level.day.endsOn` | `'either'` (`'never'` on `sandbox`) | required — the end-condition gate |
| `level.day.orderBook` | 8–10 (0 when `never`) | required — read only to know a book exists; F09 owns `bookTotal`/`bookRemaining` |
| `level.groove.start` | 50 | required — written once at room creation |
| `level.carry.slowdown` | 0.2 → carrying speed ×0.8 | required |
| `level.movement.tilesPerSecond` | 4 | optional, default 4 |
| `level.movement.playerRadius` | 0.35 | optional, default 0.35 |
| `level.movement.bumpStaggerSeconds` | 0.3 | optional, default 0.3 |
| `level.movement.floorItemSpeed` | 0.4 | optional, default 0.4 |
| `level.movement.spillSpeed` | 0.6 | optional, default 0.6 |
| `level.stations[].joinMode` | `press` / `press` / `stand` | required — a `'stand'` station never freezes movement |
| `layout.width`, `layout.height` | 28 × 18 (`mvp-small`) | required |
| `layout.walls` | packed `y*width + x` | required |
| `layout.spawn` | `Tile` | required |
| `level.key`, `layout.key` | strings | required |

Env (contracts §2): `PORT=2567`, `LARAVEL_URL=https://dynamite.test`, `GAME_SERVER_SECRET`,
`LEVELS_DIR=../config/game/levels` (layouts resolved as `path.join(LEVELS_DIR, '../layouts')` — there is
no `LAYOUTS_DIR`), `DEV_ALLOW_NO_TICKET=1`.

Constants read from F02 `shared/src/sim/constants.ts`: `TICK_SECONDS` 0.05 (the 50 ms step),
`INPUT_HEARTBEAT_MS` 250, `MAX_INPUT_BACKDATE_S` 0.2 (the `inputClock` clamp), `RECONNECT_SECONDS` 30,
`MAX_CLIENTS` 10, `PLAYER_COLOURS` 8.

Constants owned by F03 (not designer-tunable; each is stated once in code with the reason):

| Constant | Value | Why |
|---|---|---|
| `MAX_STEPS_PER_CALLBACK` | 5 | contracts §2: cap catch-up after a stall at 250 ms so a hiccup cannot spiral |
| `INPUT_STALE_SECONDS` | 1.0 | four missed `INPUT_HEARTBEAT_MS` beats → treat as stopped |
| `EMOTE_BUBBLE_SECONDS` | 2 | how long an emote bubble stays up |
| `EMOTE_COOLDOWN_SECONDS` | 0.5 | per player |
| `CONTACT_RELEASE_MARGIN` | 0.1 tiles | hysteresis so a jittering pair does not re-bump |
| `CLOCK_OFFSET_SAMPLES` | 32 | window for `PlayerRuntime.clockOffsetMs` (contracts §10.1) |
| `LOBBY_PLAYERS_HINT` | 3 | `?players=` sent at room creation (smallest legal party). Laravel validates but ignores it in M1 — do not "fix" this into a 422 |
| `NAME_MAX_CHARS` | 32 | ticket claim validation (contracts §5) |
| `POST_RUN_RETRY_SECONDS` | 2 | one retry; private-playtest durability without a queue |

### Behaviour

**Bootstrap (`index.ts`).** `loadEnv()`; `defineServer({ rooms: { factory: defineRoom(FactoryRoom).filterBy(['factoryId']) }, gracefullyShutdown: true, express: app => app.get('/healthz', …) })`;
`await server.listen(env.PORT)`; log `dynamite game-server :2567`. `filterBy` matches **client join
options**, so every join sends `factoryId` at the top level; one live, unlocked room per `factoryId`.

**Ticket verification (`auth/ticket.ts`).**
1. Split on `.`; exactly two non-empty parts, else `malformed`.
2. `expected = hex(hmac_sha256(secret, part1))`; compare with `part2` using `crypto.timingSafeEqual` on
   equal-length buffers (length mismatch → `bad-signature` without comparing).
3. `JSON.parse(base64url_decode(part1))` — `base64url` is base64 with `+/` → `-_` and padding stripped;
   parse failure → `malformed`.
4. Claims: `userId` and `factoryId` are a non-empty string or a finite integer, coerced to string with
   `String()`; `name` is a string of 1–`NAME_MAX_CHARS` chars after trim; `exp` is a finite number (Unix
   seconds). Otherwise `bad-claims`.
5. `exp > nowSeconds` else `expired` (no skew allowance; Laravel issues 60 s).

Signature is checked before claims are inspected, so a tampered payload is always `bad-signature`.

**Request signing (`laravel/signature.ts`).** Contracts §5: the canonical string is
`method.toUpperCase() + pathname + body` with no separators, where `pathname` is the URL path **without**
the query string (`/internal/factories/7/config`) and `body` is the exact bytes sent (`''` for GET). The
value is lowercase hex `hmac_sha256(secret, canonical)` in `X-Dynamite-Signature`. `fetchFactoryConfig`
still sends `?players=N` in the URL; the query is deliberately outside the signed string, matching F01's
`InternalSignature::sign` + `hash_equals` verification.

**Config resolution (`config/levels.ts`).** `resolveFactoryConfig` calls `fetchFactoryConfig`; on
`LaravelUnreachableError` (network error, non-2xx, invalid JSON) it logs a warning and calls
`loadLocalFactoryConfig`, which reads the alphabetically first `*.json` in `LEVELS_DIR` (the seeded files
put `level-01-…` first), its layout by key from `path.join(LEVELS_DIR, '../layouts/<key>.json')`, and
returns `factory: { id: factoryId, name: 'Local factory', day: 1, coin: 0, ownerUserId: '' }`,
`members: []`. Both paths run `validateLevelConfig`, `validateLayoutConfig` and
`validateLevelOnLayout(level, layout)`; each returns a `ValidationResult`, and on `ok: false` the loader
throws `new Error(errors.join('\n'))` — the room fails to create and the client gets the error. The
returned `level` already has the §13 defaults applied.

**Room creation (`onCreate({ factoryId })`).**
1. `resolveFactoryConfig(env, factoryId, LOBBY_PLAYERS_HINT)`.
2. `this.maxClients = level.players.max`.
3. `seed = crypto.randomInt(2**31)`; `world = new World({ config, state: this.state, seed })`; register
   every entry of `SYSTEMS` in order; `world.init()`.
4. State: `levelKey`, `layoutKey`, `width`, `height`, `day = factory.day`, `coin = factory.coin`,
   `shiftSeconds = level.day.shiftSeconds` (0 when `endsOn === 'never'`), `groove = level.groove.start`,
   `phase = 'lobby'`, `clock = 0`, `host = ''`.
5. Register `onMessage` for each key of `MESSAGE_HANDLERS` through the wrapper below. A `'*'` handler logs
   unknown names at debug.
6. `this.setTimestep(delta => this.pump(delta), TICK_SECONDS * 1000)`. `pump` accumulates wall-clock ms
   and runs `world.tick(TICK_SECONDS)` once per full step, at most `MAX_STEPS_PER_CALLBACK` times,
   discarding the remainder beyond that. After each step: drain `world.outbox` (`to === 'all'` →
   `this.broadcast(name, payload)`, else `this.clients.get(to)?.send(name, payload)`), then if the step
   consumed `endRequested`, run `finishDay(status)`.

**Message wrapper (contracts §11).** Every registered handler runs inside one wrapper that: validates the
payload with the F02 guard for that name and drops it at debug on failure; for `mg`, `action` and
`interact` updates `runtime.clockOffsetMs` (below) from `payload.t` when present; drops `interact` and
`action` while `state.clock < player.stunnedUntil`; and catches and logs any exception so a bad payload
never kills the room.

**`inputClock` (contracts §10.1).** `clockOffsetMs` = the minimum of `state.clock * 1000 − t` over that
client's last `CLOCK_OFFSET_SAMPLES` timed messages. `inputClock(sessionId, tMs) =
clamp((tMs + clockOffsetMs) / 1000, clock − MAX_INPUT_BACKDATE_S, clock)`. Every judged input in every
feature (`mg`, catches, shoves) goes through it; F07's press-to-press intervals need no conversion.

**Auth (`onAuth(client, options)`).**
- If `options.ticket` is a string: `verifyTicket(ticket, secret)`; failure → `throw new Error('ticket ' + reason)`.
  Then `claims.factoryId !== String(options.factoryId)` → `throw new Error('ticket factory mismatch')`.
  Return `{ userId, name, factoryId }` from the claims.
- Else if `env.DEV_ALLOW_NO_TICKET` and `options.name` is a 1–`NAME_MAX_CHARS` char string: return
  `{ userId: 'dev-' + slug(name), name, factoryId: String(options.factoryId) }`.
- Else `throw new Error('ticket required')`.
- Membership: when `world.members` is non-empty and `userId` is not in it → `throw new Error('not a member')`
  (skipped under `DEV_ALLOW_NO_TICKET`).

The return value becomes `client.auth` and the third argument of `onJoin`.

**Join (`onJoin(client, options, auth)`).**
1. Same `userId` already present (another tab): if that seat is awaiting reconnection, reject its deferred
   and `world.removePlayer(old)`; if it is live, `oldClient.leave(CloseCode.CONSENTED)` and remove. The
   newest tab wins.
2. `world.addPlayer(client.sessionId, auth)`: `colour = pickColour(taken)`, `line = 'a'`, `joinIndex` = a
   running counter, position = the centre of `spawnTiles(layout, isSolid, joinIndex + 1)[joinIndex]`
   (spawn tile, then a ring of offsets `[1,0] [-1,0] [0,1] [0,-1] [1,1] [-1,1] [1,-1] [-1,-1] [2,0] [-2,0]`
   skipping walls), `facing = 2` (south), everything else zero/empty. Emits `playerJoined`.
3. `state.host = chooseHost(...)`: the factory owner's session if connected, else the connected player with
   the lowest `joinIndex`.
4. `client.send('config', { level: world.level, layout: world.layout, copy })` — unsolicited, so the client
   has walls and station footprints before its first render.
5. Reconnection resumes with the same `sessionId`, so a returning player never passes through `onJoin`;
   their `PlayerState` was kept.

**`config` handler.** `room.send('config', {})` → the same `client.send('config', { level: world.level,
layout: world.layout, copy })`. `world.level` is the `ScaledLevel` after `start`, so its `stations` ids
match `state.stations`. Sent unsolicited in `onJoin` and again after a successful reconnection.

**Leave (`onLeave(client, code)`).**
```
if code !== CloseCode.CONSENTED:
  world.setConnected(sessionId, false)        // movement freezes them (speed 0, moving false)
  try { await this.allowReconnection(client, RECONNECT_SECONDS)
        world.setConnected(sessionId, true); recomputeHost()
        client.send('config', { level, layout, copy }); return }
  catch { /* expired or rejected */ }
if world.players.has(sessionId):              // idempotent: onLeave may run again with FAILED_TO_RECONNECT
  items.releaseCarried(world, sessionId)      // contracts §11 disconnect chain
  stations.onPlayerLeft(world, sessionId)
  world.removePlayer(sessionId)               // emits playerLeft
recomputeHost()
```
The two module calls are the §11 chain; F06 and F05 append their line here on the same one-line-touch
rule as `handlers.ts`. While a seat is held the player stays in `state.players` at their last position and
counts as **not connected** for `canStart`.

**Start (`start` handler → `room.startDay()`).** `canStart(world, sessionId)` requires `phase === 'lobby'`,
`sessionId === state.host`, and `connectedCount >= level.players.min`. On failure the sender gets
`toast { kind: 'warn', text }` with `'Only the host can start'` or `` `Need ${min} players to start` `` —
functional strings with numbers, so they are code, not `copy.json`. On success:
1. `scaled = scaleLevel(world.level, connectedCount)` (F02; no second Laravel call — the `?players=` hint
   at creation was only for the lobby floor). `scaled` is a `ScaledLevel`: a whole `LevelConfig` with the
   breakpoint's `stations`, `layout`, `day.orderBook` and `orders.everySeconds` applied, plus `players`,
   `breakpoint` and `lines`.
2. `world.startDay(scaled)`: `level = scaled`, `phase = 'running'`, `clock = 0`, `startedAt = new Date().toISOString()`,
   every player re-placed on the spawn ring in `joinIndex` order with `facing = 2`, `moving = false`,
   `stunnedUntil = 0`, `bubble = ''`; then `system.onStart(world)` in `SYSTEMS` order.
3. `await this.lock()` — no late joins during or after a shift; reconnection uses the held seat, not
   matchmaking, so it still works. The room never unlocks; NEXT DAY on the client leaves and reloads into
   a fresh room once this one disposes.

**World tick (`world.tick(dt)`), `dt = TICK_SECONDS`** (contracts §11).
1. `state.clock += dt` — in **every** phase (lobby, running, ended). `clock` is the one time base: every
   `*Until`/`*At` field and every timestamp in `StationState.mg` is in `clock` seconds.
2. `reindexPlayers()`, `reindexItems()` (packed-tile → id maps, floor-only).
3. Each registered system's `tick` in `SYSTEMS` order. While `phase === 'lobby'` only `movementSystem` and
   `bubblesSystem` run (emotes and walking work in the lobby); while `'running'` every system runs; while
   `'ended'` none does.
4. End check, while `phase === 'running'` and nothing is already requested (contracts §10.7):
   `endsOn ∈ {either, book}` and `bookTotal > 0 && bookRemaining === 0` → `requestEnd('ended', 'book')`;
   else `endsOn ∈ {either, clock}` and `clock >= shiftSeconds` → `requestEnd('ended', 'clock')`;
   `endsOn === 'never'` → neither, ever. Book wins when both land on the same tick.
5. Consume `endRequested` when set and `phase !== 'ended'`: `phase = 'ended'`; every player `moving = false`,
   `speed = 0`; `system.onDayEnd(world, status, reason)` in `SYSTEMS` order (`reportSystem` is last, so it
   sees the final state and calls `world.setReport`); `emit('dayEnded', { status, reason })`. `clock` is not
   clamped — it keeps advancing after the shift. `endRequested` stays set for the room to read once.

**Day end (`finishDay(status)` in the room).** When `world.level.day.endsOn === 'never'` there is
no report and no run: log and return. Otherwise, if `world.report` is set,
`this.broadcast('report', world.report)` and `postRun(env, { ...report, factoryId: String(factory.id),
seed, startedAt, endedAt: new Date().toISOString(), status })`, retrying once after `POST_RUN_RETRY_SECONDS`
and logging the full payload at error level on the second failure (`201` on insert and `200` on an
idempotent retry are both success). If no report was produced (before F11 exists): log
`no report system registered; run not posted`. `onDispose` while `phase === 'running'` calls
`world.requestEnd('abandoned', 'abandoned')`, runs one final `world.tick(0)` so the `onDayEnd` hooks fire,
then `finishDay('abandoned')` without the broadcast.

**Movement system (`sim/movement.ts`, first every tick).** For each player in sessionId order:
1. If `clock - runtime.lastInputAt > INPUT_STALE_SECONDS`, `intent.dx = intent.dy = 0` (seq kept).
2. `frozen = !connected || chore !== '' || stunnedUntil > clock || drivenOffUntil > clock ||
   (stationId !== '' && world.stationConfig(stationId).joinMode === 'press')`. A `'stand'` station — the
   dock — never freezes: its players keep walking between lanes.
3. `speed = frozen ? 0 : movement.tilesPerSecond × (carrying !== '' ? 1 − carry.slowdown : 1) ×
   world.tileSpeed(...world.tileOf(x, y))` — 4, 3.2 carrying, 1.6 on a floor item, 2.4 on a spill, 0 frozen.
   `PlayerState.speed` is written with every multiplier applied, because F04 predicts with it.
4. `r = stepPosition({ x, y, facing }, intent, dt, isSolid, speed, movement.playerRadius)`; write `x`, `y`,
   `facing`, `moving = r.moved`, `speed`, `seq = intent.seq`. Players with `drivenOffUntil > clock` are
   skipped entirely (F09's truck ride owns their position).
5. Soft push, over every unordered pair of connected floor players (`stationId === ''` or a `'stand'`
   station, not driven off): `d = |b − a|`; if `d < 2r`, separate along the unit vector (if `d < 1e-6` use
   `(1, 0)`) by `(2r − d)/2` each; a player who did not move this tick and whose partner did still gets
   pushed (soft-collide, docs/02); each pushed position passes through `pushOutOfSolid`. If the pair is not
   in `contacts` and at least one has `moving === true`: `emit('bump', { a, b, mover, x, y, dx, dy })` —
   `mover` is the moving party (`a` when both moved), `x`/`y` the contact midpoint, `dx`/`dy` the rounded
   sign of `b − a` — and both get `stunnedUntil = max(stunnedUntil, clock + movement.bumpStaggerSeconds)`,
   and the pair is added to both `contacts`. If `d > 2r + CONTACT_RELEASE_MARGIN`, remove the pair from
   `contacts`. F06 consumes `bump` and applies the drop table (docs/17); F03 only reports the contact.
6. `world.reindexPlayers()` so `stationsSystem` and the rest see the new tiles this same tick.

**Pure integration (`shared/src/sim/movement.ts`).**
- `makeWallLookup(layout)` returns a `SolidFn` that is `true` off-map and when `layout.walls` contains
  `ty * layout.width + tx` (the same packing as `spillTiles`, decoded once into a `Set`).
- `stepPosition`: if `dx = dy = 0` or `speed <= 0` → position unchanged, `facing = facingFrom(dx, dy, pos.facing)`,
  `moved = false`. Else `len = (dx && dy) ? √2 : 1`, `vx = dx / len × speed`, `vy = dy / len × speed`. Move
  x: `nx = x + vx·dt`; rows spanned = `floor(y − r + ε) … floor(y + r − ε)`; if `vx > 0` and any
  `isSolid(floor(nx + r), row)` → `nx = floor(nx + r) − r − ε`; if `vx < 0` and any `isSolid(floor(nx − r), row)`
  → `nx = floor(nx − r) + 1 + r + ε`. Then move y the same way against the columns spanned by `nx`.
  `ε = 1e-6`. `moved = |nx − x| + |ny − y| > 1e-9`. Out-of-bounds tiles are solid via `isSolid`, so the map
  edge is a wall. Axis separation gives wall sliding for free.
- `pushOutOfSolid`: if the circle overlaps a solid tile after a push, move it the shortest axis-aligned
  distance out; used only after pushes (steps never enter walls).

F04 calls `stepPosition` with `me.speed` and `conn.config.level.movement.playerRadius` for own-avatar
prediction, then snaps to the server `x, y` for the echoed `seq` and replays later inputs.

**Input handler.** Payload must satisfy `isInputMsg` (`dx, dy ∈ {-1, 0, 1}`, `seq` a finite non-negative
integer); otherwise debug-log and drop. `seq < runtime.intent.seq` → drop (late packet); equal or higher →
`intent = { dx, dy, seq }`, `lastInputAt = clock`. Accepted in every phase; integration simply yields no
movement when frozen, and `seq` is still echoed so the client's reconciliation never stalls.

**Emote handler.** `kind` must satisfy `isEmoteMsg`; `clock - lastEmoteAt < EMOTE_COOLDOWN_SECONDS` → drop;
else `bubble = copy.emotes[kind]` (from `@shared`, never inline), `bubbleUntil = clock + EMOTE_BUBBLE_SECONDS`,
`lastEmoteAt = clock`. Works in the lobby too, which is why `bubblesSystem` runs there.

**Bubbles system (`sim/bubbles.ts`, second of F03's systems).** Each tick: any player with `bubble !== ''`
and `bubbleUntil <= clock` → `bubble = ''`; `state.banner !== ''` and `bannerUntil <= clock` → `banner = ''`.
Any feature that sets a bubble or banner writes both fields in `clock` seconds and relies on this expiry.

**Sandbox (`day.endsOn === 'never'`).** `shiftSeconds` is 0 and `orderBook` is 0. `start` still gates on
`players.min` (which may be 1). `clock` counts up from 0 and the end check never fires, so the day only ends
when F10 requests `'exploded'` (subject to `hazards.explosionEndsRound`) or the room disposes. `finishDay`
broadcasts no `report` and posts no run; the room disposes when the last client leaves.

**Server vs client.** Server: everything above. Client (F04): sends `input` on change and every
`INPUT_HEARTBEAT_MS`, predicts its own avatar with `stepPosition`, interpolates others from `x, y`, renders
`bubble`, `facing`, `moving`, `stunnedUntil`, `phase`, `host`, the `config` reply and the `report` message.
The client never decides a position, a bump, or a phase.

**Edge cases decided.**
- Two clients with one `userId`: newest wins; the older seat is released immediately.
- A player who drops mid-lobby and never returns is removed after `RECONNECT_SECONDS` and `host` moves on;
  a day cannot start while the count of *connected* players is below `players.min`.
- Host drops during `running`: `host` is recomputed but has no effect after start.
- `start` sent while `running`/`ended`: reason `not-lobby` is silently dropped (nothing useful to say).
- Last client leaves during `running`: room disposes → run posted as `abandoned` (except Sandbox).
- Laravel down at day end: retry once, then the payload is in the server log; nothing else is lost because
  the room did not depend on the response.
- Laravel down at room creation: local level, `members: []` (no membership check), `ownerUserId: ''`
  (host = earliest joiner). Logged as a warning on every such room.
- Overlapping spawn: `spawnTiles` never returns the same tile twice; at 11+ requests it wraps to the spawn
  tile (cannot happen with `maxClients = MAX_CLIENTS`).
- Corner-touch: a circle whose edge is exactly on a tile boundary is not overlapping (`ε`).
- Pushing a player anchored at a `press` station: they do not move; the mover takes the whole separation.
- A client sending `mg`/`action`/`interact` with a `t` far in the future: `inputClock` clamps to `clock`,
  and the offset window only ever lowers, so a liar cannot buy latency.

## Acceptance criteria

- [ ] `cd game-server && npm run dev` starts on `:2567` and `GET /healthz` returns `{ ok: true }`.
- [ ] Starting without `GAME_SERVER_SECRET` and without `DEV_ALLOW_NO_TICKET=1` exits non-zero with a
      message naming the variable.
- [ ] A join with a ticket signed by the shared secret for factory `7` and join option `factoryId: '7'`
      succeeds; the same ticket with `factoryId: '8'` is rejected; an expired or tampered ticket is rejected
      with a message starting `ticket `.
- [ ] Two clients joining with different `factoryId` values land in two rooms; two with the same
      `factoryId` land in one.
- [ ] `GET /internal/factories/7/config?players=3` is accepted by Laravel: the signature is computed over
      `GET` + `/internal/factories/7/config` + `''`, with the query excluded.
- [ ] Every joined player appears in `state.players` with a distinct `colour` and a distinct spawn tile,
      `line = 'a'`, `facing = 2`, and receives an unsolicited `config` message carrying `level`, `layout`
      and `copy`; `room.send('config', {})` returns the same payload.
- [ ] Holding a direction moves the avatar `movement.tilesPerSecond` tiles in one second (±1 tick);
      diagonally the same distance along the diagonal; walking into a wall stops at the wall with the
      radius clear of it; walking diagonally into a wall slides along it.
- [ ] `PlayerState.seq` equals the `seq` of the last accepted `input` within one tick of receipt, and
      `PlayerState.speed` equals the effective tiles/s used that tick.
- [ ] Two avatars walking into each other are pushed apart, both stop for `movement.bumpStaggerSeconds`, and
      exactly one `bump` event is emitted per contact with `mover`, `dx`, `dy` set.
- [ ] A player standing on a `joinMode: 'stand'` station's work tile (the dock) keeps walking; a player at a
      `'press'` station has `speed = 0`.
- [ ] A client that stops sending input is stationary within `INPUT_STALE_SECONDS`.
- [ ] `emote { kind: 'stop' }` shows `bubble = copy.emotes.stop` for 2 s in the lobby; a second emote within
      0.5 s is ignored; the bubble clears on its own.
- [ ] `start` from a non-host client yields `toast { kind: 'warn' }` and the phase stays `lobby`; `start`
      from the host below `players.min` yields the `Need N players to start` toast; at or above it sets
      `phase = 'running'`, `clock = 0`, and the room is locked (a further `joinOrCreate` with the same
      `factoryId` creates a new room).
- [ ] `state.clock` advances in every phase — lobby, running and ended — and resets to 0 on `start`.
- [ ] With `endsOn: 'either'`, the day ends `'clock'` at `shiftSeconds` and ends `'book'` the tick after
      `bookRemaining` reaches 0; with `endsOn: 'never'` neither fires and `clock` keeps counting.
- [ ] `world.inputClock(sessionId, t)` returns `clock` for a `t` at or ahead of the server and never less
      than `clock − MAX_INPUT_BACKDATE_S` for a stale one.
- [ ] A client whose socket drops (not `room.leave()`) keeps its `PlayerState` and can `reconnect(token)`
      within `RECONNECT_SECONDS` with the same `sessionId` and receives a fresh `config`; after the grace
      the player is removed and `playerLeft` fires once.
- [ ] `room.leave()` (consented) removes the player immediately.
- [ ] With a report system registered, day end broadcasts `report` and `POST /internal/runs` is received
      with an `X-Dynamite-Signature` Laravel accepts (`201` first, `200` on a replay); the last client
      leaving mid-shift posts `status: 'abandoned'`.
- [ ] On a Sandbox level no `report` is broadcast and no run is posted, in either the timer or the
      last-client-leaves path.
- [ ] With Laravel stopped, a room still creates from `LEVELS_DIR` and logs the fallback; a level that fails
      `validateLevelConfig` or `validateLevelOnLayout` fails room creation with the joined error text.
- [ ] `interact`, `action`, `mg`, `leave` messages are accepted without error and logged at debug until
      their owner replaces the entry; an `interact` or `action` arriving while `clock < stunnedUntil` is
      dropped.
- [ ] `makeWorld({ players: 3 })` returns a `World` with three seated players, every `SYSTEMS` entry
      registered and `init()` already run.
- [ ] `npm test` in `game-server/` and `shared/` is green; `npm run typecheck` is clean.

## Test plan

**Unit — `game-server/tests/ticket.test.ts`**
- it accepts a ticket signed with the shared secret and returns its claims as strings
- it rejects a ticket signed with a different secret as bad-signature
- it rejects a ticket whose payload was altered after signing as bad-signature
- it rejects a ticket whose exp is in the past as expired
- it treats a ticket whose exp equals now as expired
- it rejects a ticket that is not two dot-separated parts as malformed
- it rejects a ticket with a missing name or a name longer than 32 chars as bad-claims
- it coerces numeric userId and factoryId to strings
- it round-trips signTicket → verifyTicket

**Unit — `game-server/tests/signature.test.ts`**
- it signs uppercase method + path + body with hmac-sha256 lowercase hex (known vector)
- it signs a GET with an empty body
- it excludes the query string from the signed path

**Unit — `game-server/tests/levels.test.ts`** (fixture level + layout in `tests/fixtures/`)
- it loads the alphabetically first level file and its layout from LEVELS_DIR
- it applies the §13 defaults to a level file that omits the optional keys
- it throws the joined validation errors when the level or the level-on-layout check fails
- it returns the Laravel config when fetch succeeds
- it falls back to the local level when fetch throws or returns non-2xx
- it sends the X-Dynamite-Signature header computed over the path without the query
- it treats a 200 from POST /internal/runs as success on a retry

**Unit — `game-server/tests/rng.test.ts`**
- it produces the same sequence for the same seed
- it produces values in [0, 1)
- it returns ints within [min, max)

**Unit — `shared/tests/movement.test.ts`**
- it moves 4 tiles in twenty 0.05 s steps at 4 tiles/s
- it normalises diagonal input to unit length
- it stops at a wall edge minus the radius
- it slides along a wall when moving diagonally into it
- it treats out-of-bounds tiles as solid
- it decodes packed wall indices in makeWallLookup
- it keeps the current facing when input is zero and takes facingFrom otherwise
- it returns moved false when speed is zero
- it pushes a circle out of a solid tile along the shortest axis

**Unit — `game-server/tests/World.test.ts`** (built with `makeWorld`)
- it marks layout walls and out-of-bounds tiles as solid
- it indexes floor players and floor items by packed tile and ignores held or shelved items
- it computes tileSpeed as the minimum of the floor-item and spill multipliers
- it returns the station config by id and throws for an unknown id
- it advances state.clock in lobby, running and ended and resets it to 0 on startDay
- it maps a client timestamp through inputClock and clamps it to [clock − 0.2, clock]
- it runs system init, onStart, tick and onDayEnd in registration order
- it ticks only movement and bubbles in the lobby, every system while running, none while ended
- it routes fx and toast into the outbox
- it emits playerLeft once on removePlayer

**Unit — `game-server/tests/dayLoop.test.ts`**
- it ends on the clock with reason 'clock' when endsOn is either or clock
- it ends on the book with reason 'book' when bookTotal > 0 and bookRemaining reaches 0
- it never ends on the clock when endsOn is book, nor on the book when endsOn is clock
- it prefers 'book' over 'clock' when both are true in the same tick
- it never ends by book or clock when endsOn is never
- it keeps the first end request, so F10's 'exploded' outranks a same-tick 'clock'
- it consumes endRequested once, freezes players and passes status and reason to onDayEnd
- it stores a report set by an onDayEnd hook on world.report
- it drops a lobby intent at the whistle, so a client that has gone silent does not walk into the shift
  (`startDay` rewinds the clock behind `lastInputAt`, which would otherwise disarm the staleness guard
  for as long as the lobby ran)

**Unit — `game-server/tests/rooms.test.ts`**
- it registers the factory room filtered by factoryId

**Unit — `game-server/tests/movement.test.ts`**
- it applies the latest intent per tick and echoes its seq
- it ignores an input whose seq is lower than the last applied
- it stops a player after 1 s without input
- it moves a carrying player at 3.2 tiles/s and writes the effective speed to PlayerState.speed
- it freezes a stunned player, a player at a press station, a player in a chore, a driven-off player and a
  disconnected player
- it does not freeze a player standing on a stand station's work tile
- it moves at 1.6 tiles/s on a floor-item tile and 2.4 on a spill tile
- it pushes two overlapping players apart equally and never into a wall
- it gives the whole separation to the mover when the other is anchored at a press station
- it emits one bump with mover, dx and dy and staggers both when two players first touch
- it does not emit a second bump while the pair stays in contact and does again after they separate by 0.1

**Unit — `game-server/tests/FactoryRoom.test.ts`** (the room driven through its lifecycle, transport stubbed)
- it holds the seat for RECONNECT_SECONDS and hands it back on reconnection
- it retries the run post once after a failure and stores the run on the second try
- it logs the payload when the run post fails twice

**Unit — `game-server/tests/bubbles.test.ts`, `handlers.test.ts`, `lobby.test.ts`**
- it clears a bubble and a banner once their until passes
- it sets bubble copy.emotes.stop for 2 s on emote and rate-limits to one per 0.5 s
- it drops an input with dx outside −1..1 or a non-integer seq
- it drops interact and action while clock is below stunnedUntil
- it updates clockOffsetMs from a timed message and keeps the minimum over the window
- it replies to config with level, layout and copy
- it logs and ignores an unimplemented message
- it makes the connected factory owner host, else the earliest-joined connected player
- it refuses start when not host, not in lobby, or below players.min
- it assigns the lowest free colour and wraps at 8
- it spawns players on distinct non-wall tiles around spawn

**In-app verification** (Laravel via Herd, `npm run dev` in `game-server/`, `npm run smoke` for bots when
F04 is not yet available; the Phaser client and its debug overlay once F04 exists):
1. Start the server; `curl https://…/healthz`. Screenshot the terminal showing the listen line.
2. Run `npm run smoke -- --factory 7 --players 3`: bots join with `{ name, factoryId }`, walk a square, and
   the script prints each bot's `x, y, seq, speed` every second and `phase` on change. Confirm 4 tiles/s and
   the `seq` echo in the printout, and that the room fetched its config from Laravel (no fallback warning).
3. In two browsers with F04: walk into a wall (stops flush), walk diagonally along it (slides), walk into
   each other (push + stagger), press an emote (bubble for 2 s). Screenshot the overlay showing `seq`, RTT
   and 20 Hz.
4. Press *Start* as a non-host (toast), as the host below `players.min` (toast), then at it (HUD clock
   starts). Screenshot the HUD.
5. In one browser, DevTools → Network → Offline for 10 s → back online: the avatar is still there, moves
   again, and the debug overlay shows a fresh `config`. Repeat for 40 s: the avatar disappears at ~30 s.
   Screenshot both.
6. Set `shiftSeconds: 20` in a local level file with Laravel stopped; start; at 20 s the phase flips to
   `ended`, `clock` keeps counting, and the log shows the fallback warning and `no report system registered`.
   Then with Laravel up and F11 merged: the `runs` row appears
   (`psql -c 'select id, status, grade from runs order by id desc limit 1'`).
7. Load the `sandbox` level: `start` works with one player, the day never ends, and leaving posts no run
   (`select count(*) from runs` unchanged).
8. Open the same account in a second tab: the first tab is disconnected, the second walks.

## Tasks

- [ ] 1. Scaffold `game-server/` (`package.json`, `tsconfig.json`, `.env.example`, `src/env.ts`,
      `src/shared.ts`) and append `export * from './sim/movement';` to `shared/src/index.ts`;
      `npm run typecheck` passes against F02's `shared/`.
- [ ] 2. `src/auth/ticket.ts` + `tests/ticket.test.ts`.
- [ ] 3. `src/laravel/signature.ts`, `src/laravel/api.ts` + `tests/signature.test.ts`.
- [ ] 4. `src/config/levels.ts` + `tests/levels.test.ts` with `tests/fixtures/level-01-test.json` and
      `tests/fixtures/layouts/mvp-small.json`.
- [ ] 5. `src/sim/rng.ts` + `tests/rng.test.ts`.
- [ ] 6. `shared/src/sim/movement.ts` + `shared/tests/movement.test.ts`.
- [ ] 7. `src/sim/World.ts` (incl. `stationConfig`, `tileOf`/`packTile`, `inputClock`, `tally`,
      `grooveEvents`, `stations`) and `tests/helpers/world.ts` + `tests/World.test.ts`.
- [ ] 8. The day loop in `World` (`requestEnd`, `endsOn` gating, `onDayEnd`, `dayEnded`) +
      `tests/dayLoop.test.ts`.
- [ ] 9. `src/sim/movement.ts` + `tests/movement.test.ts`.
- [ ] 10. `src/sim/bubbles.ts`, `src/rooms/handlers.ts` (incl. the wrapper and the `config` reply),
      `src/sim/systems.ts` + `tests/bubbles.test.ts`, `tests/handlers.test.ts`.
- [ ] 11. `src/rooms/lobby.ts` + `tests/lobby.test.ts`.
- [ ] 12. `src/rooms/FactoryRoom.ts`, `src/index.ts`; `npm run dev` boots; `/healthz` answers.
- [ ] 13. `scripts/smoke.ts`; run it against the dev server with `DEV_ALLOW_NO_TICKET=1` and with a real
      ticket from `POST /game/ticket`; tick in-app steps 1–2.
- [ ] 14. Reconnection, lock-at-start, day end, Sandbox and abandoned-run paths verified in-app
      (steps 3–8); tick the Status boxes.

## Risks & open questions

- **Reconnection into a locked room.** The docs say reconnection uses the held seat rather than
  matchmaking; in-app step 5 must be run after `start` (locked) as well as in the lobby. If a locked room
  refuses reconnection, the fallback is to not lock and instead reject late joins in `onAuth` when
  `phase !== 'lobby'`.
- **Bump stagger is server-only knowledge for the predicting client.** Own-avatar prediction cannot foresee
  a bump (other players are interpolated), so the first `movement.bumpStaggerSeconds` after a collision will
  reconcile with a small correction. The synced `stunnedUntil` lets F04 stop predicting the moment the
  stagger arrives.
- **Spill multiplier reading.** docs/02 says "60% slow"; contracts §2 and §13 read it as speed ×0.6. If it
  meant ×0.4, change `movement.spillSpeed` in the level files — no code change.
- **Solid tiles other than walls.** Machine bodies and shelves must be in `layout.walls` (F12);
  `makeWallLookup` treats nothing else as solid, and `validateLevelOnLayout` checks that work, rack and ring
  tiles are *not* walls. If F05 later wants stations to block via their config instead, that is an M2 change.
- **`LOBBY_PLAYERS_HINT` is advisory.** The `?players=3` sent at room creation is validated by Laravel and
  ignored in M1 (one layout per level); the real scaling happens in `scaleLevel` at `start`. Do not turn the
  mismatch on Level 3/4 (`players.min 4`) into a 422.
- **Tick API naming.** In 0.18 `setSimulationInterval` is a deprecated alias of `setTimestep`; this doc uses
  `setTimestep` with a fixed accumulator, matching contracts §2. (`setFixedTimestep(step, 20)` also exists
  and ties into 0.18's own client-prediction netcode; not used, to keep F04's prediction on `stepPosition`.)
- **Disconnect chain ordering.** Contracts §11 puts `items.releaseCarried` and `stations.onPlayerLeft`
  before `world.removePlayer`, but §12 lists no "Touches" for `FactoryRoom.ts`. F03 ships the two call sites
  in `onLeave`; F06 and F05 fill them when they land, on the same one-line rule as `handlers.ts`. Flagged
  below.

**Contract change requested** (all against `docs/features/00-contracts.md`):

1. §12 "Touches" for `game-server/src/rooms/FactoryRoom.ts`: the §11 disconnect chain
   (`items.releaseCarried` → `stations.onPlayerLeft` → `world.removePlayer`) needs two lines in a file the
   ownership table gives F03 alone, with no touch allowance. Either name F06 and F05 as touching
   `FactoryRoom.ts`'s disconnect path (mirroring the `handlers.ts` row), or restate the chain as two
   `world.on('playerLeft')` subscriptions registered in `itemsSystem.init` and `stationsSystem.init` and fix
   their relative order. Until this is settled F03 implements the call sites itself.
2. §3 writer list: nobody is named as the writer that **clears** `FactoryState.banner`/`bannerUntil` and
   `PlayerState.bubble`/`bubbleUntil` on expiry. F03's `bubblesSystem` (§12 gives it the file) does it;
   §3 should say so explicitly so no other feature adds a second expiry pass.
3. §11 vs the tick-order ruling: §11 says `movementSystem` **and** `bubblesSystem` run while
   `phase === 'lobby'`; the reconciliation summary says "movement only". This doc follows §11, because
   lobby emotes (§4 "works in the lobby") need an expiry pass. Confirm §11 is the intended wording.
4. §4/§10.8: `InputMsg` in F02's `shared/src/messages.ts` is typed with `Axis`, which §10.8 exports from
   F03's `shared/src/sim/movement.ts` — a wave-1 file importing from a wave-2 one. Either move `Axis` to
   F02's `shared/src/schema/types.ts` (and re-export it from `movement.ts`) or state that `messages.ts`
   imports it from `./sim/movement`.
