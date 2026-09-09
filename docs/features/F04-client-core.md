# F04 — Client core: Phaser 4 boot, connection, floor render, avatars, prediction, HUD, debug overlay
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `resources/js/game/**` except the module files other features own (`render/{Stations,stationGlyphs}.ts` F05, `render/Items.ts` F06, `minigames/{Slammer,SlammerWorld,slammerAudio}.ts` F07, `minigames/{Jig,JigWorldFx}.ts` F08, `minigames/Dock.ts` + `minigames/dock/**` F09, `hazards/**` F10, `scenes/Report.ts` + `report/format.ts` F11) · the root `vitest.config.ts` · the root `tsconfig.json` · the `resources/js/game/main.ts` entry and the `@shared` alias in `vite.config.js` · the mount contract (contracts §6) · client deps and scripts in the root `package.json` (F01 owns the file)
**Touched by others:** `minigames/index.ts` (F07/F08/F09 replace their `minigames` entry and add their `stationViews` entry) · the `Factory.create()` mount list (F05 `createStationsLayer`, F06 `createItemsLayer`, F10 `createHazardsLayer` — one line each) · the `main.ts` scene list (F11 appends `Report`)
**Reads:** `docs/features/00-contracts.md` (v2 — binding), `docs/02-factory-floor.md`, `docs/04-minigames.md` (Rules for every mini-game), `docs/10-metrics.md` (Debug overlay), `docs/17-oops-carry-and-throw.md`, `docs/14-roadmap.md`, `docs/05-flow-mechanics.md` (Groove bands, bottleneck estimate), `docs/11-architecture.md` (client architecture), `docs/13-config-schema.md`, `docs/19-scaling-3-to-10.md` (line hats, emotes), `docs/decisions/0003-phaser-over-pixi.md`, `docs/decisions/0006-keyboard-first-minigames.md`

Verified against: Phaser **4.2.1** (`types/phaser.d.ts` from the published package) and Colyseus **0.18** docs (`@colyseus/sdk` 0.18.2, server `colyseus` 0.18.5, `@colyseus/schema` 5.0.27). Every Phaser/Colyseus call named below exists with the signature shown.

## Goal

A player who opens `https://dynamite.test/factories/{factory}/play` sees "CLOCKING IN…", is on the factory floor within a second, and walks a coloured square-with-a-face around the 28 × 18 MVP map at 4 tiles/s with no perceptible input lag and no rubber-banding, while 2–5 other squares walk around smoothly. The HUD shows the order book, the shift clock, the Groove bar in its band colour, their line chip, banners and toasts. Everything the server tells the client to show — spill and scorch tiles, speech bubbles, soot, stun wobble, one-shot effects, mini-game panels — is drawn from `FactoryState` or an `fx`/`toast` message. Refreshing the page puts the player back in their seat. With `?debug` on, `~` opens the overlay that shows, per station, exactly what the sim thinks is happening.

## Scope

**In (M1):**
- `main.ts`: read the mount div, connect, then start Phaser (`Boot` → `Factory`; F11 appends `Report`), per contracts §6.
- Connection: ticket POST with CSRF, `joinOrCreate('factory', { ticket, factoryId })`, the `config` message pair, automatic reconnection (SDK) and manual reconnection on page reload (stored token), status banners, token cleared when `phase` becomes `'ended'`.
- Server clock estimate from `FactoryState.clock`; RTT via `room.ping`.
- Floor: whole map on screen, scaled to fit the mount div; walls, break room, blast bins, dock door, ramp, order board, beacon poles, the four `layout.props` tiles; spill and scorch tiles from state.
- Avatars: 8-colour squares with faces, facing, walk bob, red line hat, name label, speech bubble, soot tint, stun wobble; own-avatar prediction + reconciliation through `stepPosition`; remote interpolation.
- Input: WASD/arrows → `input` (on change + 250 ms heartbeat), `E` → `interact`, `Space` → `action`, `Esc` → `leave`, `Shift`+arrows → `emote`, `Tab` (hold) → order board, `~` → debug overlay, `Enter` in lobby → `start`.
- HUD: book (hidden in Sandbox), shift clock or elapsed clock, Groove bar with band colours and label, line chip, banner from `copy.banners`, toasts.
- Debug overlay: per-station rows, globals, bottleneck estimate, patches/s, RTT, input lag, player rows, server ghost for the own avatar.
- FX: all 14 `fx` kinds as particles/tweens/text pops, plus `Fx.override` so a station feature can replace a kind.
- Mini-game host: the overlay registry and `Host`, the clipboard panel, three stub overlays, the per-viewer `StationView` registry, the fixed `Factory.create()` mount list.
- Root `vitest.config.ts` + `test:client`; the Vite entry + `@shared` alias; the root `tsconfig.json`.

**Out (later milestones):**
- Sprites/art, isometric view (after M1 per doc 15 #2/#9).
- Music layers, klaxon, red wash, Clean Sweep DING (M2 — doc 14).
- Blue line hats / two-line layout (M2), per-line HUD (never — doc 15 #21).
- DANGER fuse icon on the HUD, sooted-sprite polish (M2 — doc 16).
- Mouse input for mini-games (ADR 0006: optional, revisit if a mini-game needs it).
- Per-player RTT rows for other players (needs a state field; not requested for M1).
- Kanban board, chaos-event overlays (M3), Payday screens (M4, Livewire).
- Station footprints, items, hazard layers and the Report scene — F05, F06, F10, F11 own those files; F04 only calls their one-line mount entries.

## Design

### Files

| Path | Responsibility |
|---|---|
| `resources/js/game/main.ts` | Read `#game` data-\*, show the DOM status line, `Connection.join`, then build the Phaser `Game` with `[Boot, Factory]` and put `mount` + `conn` in `game.registry`. |
| `resources/js/game/mount.ts` | `readMount(el)`: parse and validate the six `data-*` attributes into `MountData`. |
| `resources/js/game/net/connection.ts` | `Connection`: ticket → join/reconnect, `config` request + reply, message routing, status events, `ping`, reconnect-token lifecycle. |
| `resources/js/game/net/ServerClock.ts` | Pure: estimates `FactoryState.clock` (seconds) between patches. |
| `resources/js/game/net/ticket.ts` | `fetchTicket(mount)`: the CSRF-signed POST. |
| `resources/js/game/scenes/Boot.ts` | Generates the shared textures, then starts `Factory`. |
| `resources/js/game/scenes/Factory.ts` | Owns the layers, the update loop, prediction/interpolation wiring, key routing, the mount list, `avatarPosition`, report handoff. |
| `resources/js/game/render/Floor.ts` | Draws walls, break room, blast bins, dock door, ramp, order board, beacon poles and `layout.props` from the layout; spill/scorch layer from state. |
| `resources/js/game/render/Avatars.ts` | One `AvatarView` per player: body, face, hat, name, bubble, soot, wobble, bob; y-sort. |
| `resources/js/game/render/palette.ts` | The 8 player colours, line colours, Groove band colours, banner colours, UI greys. |
| `resources/js/game/render/Interpolation.ts` | Pure: `RemoteTrack` sample buffer, render 100 ms in the past. |
| `resources/js/game/predict/Prediction.ts` | `OwnPrediction`: drives `stepPosition`, keeps position history, seq-echo lag, reconciles. |
| `resources/js/game/input/Keys.ts` | Phaser key bindings → typed events; overlay routing; blur reset. |
| `resources/js/game/input/intent.ts` | Pure: pressed keys → `MoveInput`, arrow → `EmoteKind`. |
| `resources/js/game/ui/Hud.ts` | Top band: line chip, book, clock, Groove bar; banner; toasts. |
| `resources/js/game/ui/grooveBand.ts` | Pure: groove value + thresholds → band, colour, label. |
| `resources/js/game/ui/format.ts` | Pure: `mmss(seconds)`, `pct(n)`, `fixed(n, d)`. |
| `resources/js/game/ui/OrderBoard.ts` | The `Tab` overlay: order rows + book count. |
| `resources/js/game/ui/Debug.ts` | The `~` overlay: text block refreshed 4×/s; server ghost. |
| `resources/js/game/ui/debugRows.ts` | Pure: state → row strings, bottleneck estimate, cycle tracker. |
| `resources/js/game/fx/Fx.ts` | `fx` message → particles/tweens/text pops; the kind table; `override`. |
| `resources/js/game/minigames/types.ts` | `MinigameOverlay`, `OverlayContext`, `OverlayKey`, `OverlayFactory`, `StationView`. |
| `resources/js/game/minigames/Host.ts` | Mount/unmount by `me.stationId`/`me.workTile`; clipboard panel; `handleKey`; `send` helpers. |
| `resources/js/game/minigames/Stub.ts` | One stub overlay class parameterised by title, legend and `capturesMovement`; shows `StationState.mg`. |
| `resources/js/game/minigames/index.ts` | `minigames` registry (three stub entries) and the empty `stationViews` registry. |
| `resources/js/game/__tests__/*.test.ts` | Vitest tests for every pure module above. |
| `vitest.config.ts` (create at the repo root) | Runs `resources/js/game/__tests__/**`; the root script `test:client`. |
| `vite.config.js` (modify) | Add `resources/js/game/main.ts` to `laravel({ input })`; `resolve.alias['@shared'] = <root>/shared/src`. |
| `tsconfig.json` (create at the repo root) | Client compiler options, the `@shared` path, includes. |
| `package.json` (modify — F01 owns it) | deps `phaser@4.2.1`, `@colyseus/sdk@0.18.2`, `@colyseus/schema@5.0.27`; devDeps `typescript`, `vitest`; scripts `typecheck`, `test:client`. |

### Interfaces

**Consumes**

- Mount (contracts §6): `#game` with `data-ticket-url`, `data-factory-id`, `data-ws-url`, `data-csrf`, `data-debug` (`'1'|'0'`), `data-factory-url`. The page (F01) gives `#game` a definite CSS size (`width: 100vw; height: 100vh`); the client fits the canvas inside it with `Scale.FIT`, centred.
- `POST {ticketUrl}` (§5): body `{ factory_id }` → `{ ticket, ws_url, room: 'factory' }`.
- Colyseus room `factory`, join options `{ ticket, factoryId }` (`factoryId` is the string from `data-factory-id`; `filterBy(['factoryId'])` matches it), `allowReconnection(client, 30)` (§5).
- `@shared` — the barrel `shared/src/index.ts` is the only import path (Vite alias `@shared` → `./shared/src`):
  - schema classes and fields exactly as §3: `FactoryState`, `PlayerState`, `StationState`, `ItemState`, `OrderState`, `FuseState`, `TruckState`; the string unions `StationType` and `Banner`. The root schema class is the third argument of `joinOrCreate` so the client decodes with the shared definitions.
  - messages (§4): `InputMsg`, `InteractMsg`, `ActionMsg`, `MgMsg`, `LeaveMsg`, `EmoteMsg`, `StartMsg`, `ConfigRequestMsg`, `ConfigMsg`, `FxMsg`, `ToastMsg`, `ClientMsg`, `ServerMsg`, `MgOp`, `FxKind`, `EmoteKind`, `ToastKind`, `Axis`.
  - config types (§8): `LevelConfig` (`groove.thresholds`, `clipboardSeconds`, `players.min`, `movement.playerRadius`), `LayoutConfig`.
  - `shared/src/sim/movement.ts` (§10.8, F03): `stepPosition(pos, intent, dt, isSolid, speed, radius): MoveResult`, `makeWallLookup(layout): SolidFn`, `MoveInput`, `MoveResult`, `SolidFn`. There is no `shared/src/sim/move.ts`.
  - `shared/src/sim/tiles.ts` (§10, F02): `tileOf`, `packTile`, `unpackTile`, `tileKey`, `facingFrom`, `Tile`, `Facing`.
  - `shared/src/sim/constants.ts` (§13, F02): `TILE_PX` (32), `INPUT_HEARTBEAT_MS` (250), `PLAYER_COLOURS` (8), `RECONNECT_SECONDS` (30).
  - `Copy`, `BannerKey` and `ReportPayload` (§8, §9) — `ReportPayload` is passed through to `Report` untouched.
- Phaser 4.2.1: `Phaser.Game`, `Phaser.Scene`, `Phaser.Scale.FIT` / `CENTER_BOTH`, `ScaleManager.resize(width, height)`, `add.graphics()` (`fillStyle fillRect lineStyle strokeRect fillCircle fillRoundedRect fillTriangle generateTexture`), `add.container(x, y, children)` + `Container.sort('y')`, `add.text(x, y, text, style)`, `add.particles(x, y, texture, config)` + `ParticleEmitter.explode(count, x, y)`, `tweens.add(config)`, `time.addEvent(config)`, `cameras.main.shake(duration, intensity)`, `input.keyboard.addKeys(string)`, `input.keyboard.addCapture(keycodes)`, `input.keyboard.on('keydown-<KEY>' | 'keyup-<KEY>')` (the native event carries `repeat`), `Phaser.Input.Keyboard.JustDown`, `Phaser.Math.Linear`, `Phaser.Math.Distance.Between`. In Phaser 4 `Container` does **not** implement `ScrollFactor`; the design never scrolls the camera so nothing needs it.
- `@colyseus/sdk` 0.18: `new Client(url)`, `client.joinOrCreate<FactoryState>(name, options, FactoryState)`, `client.reconnect(token)`, `Callbacks.get(room)` → `listen(prop|instance, prop, cb)`, `onAdd(prop, (item, key) => …)`, `onRemove`, `onChange(instance, cb)`; `room.send(name, payload)`, `room.onMessage(name, cb)`, `room.onStateChange(cb)`, `room.onDrop((code, reason))`, `room.onReconnect(cb)`, `room.onLeave((code, reason))`, `room.onError((code, message))`, `room.reconnectionToken`, `room.sessionId`, `room.ping(cb)`, `CloseCode.CONSENTED` (4000), `CloseCode.FAILED_TO_RECONNECT` (4003). `room.clock.serverNow()` is a local-clock stub for rooms without `defineInput()` and is therefore **not** used; see `ServerClock`.

**Produces** (other features rely on these)

```ts
// resources/js/game/mount.ts
export interface MountData { ticketUrl: string; factoryId: string; wsUrl: string; csrf: string; debug: boolean; factoryUrl: string }
export function readMount(el: HTMLElement): MountData          // throws Error(`game mount: missing data-${name}`)

// resources/js/game/net/ticket.ts
export interface TicketResponse { ticket: string; ws_url: string; room: 'factory' }
export function fetchTicket(mount: MountData): Promise<TicketResponse>;

// resources/js/game/net/connection.ts
export type ConnectionStatus = 'connecting' | 'joined' | 'reconnecting' | 'closed';
export interface ClientConfig { level: LevelConfig; layout: LayoutConfig; copy: Copy }
export interface ConnectionEvents {
  status: (status: ConnectionStatus, detail: string) => void;
  config: (config: ClientConfig) => void;                       // every `config` reply, including the ones pushed on join/reconnect
  fx: (m: FxMsg) => void;
  toast: (m: ToastMsg) => void;
  report: (r: ReportPayload) => void;
}
export class Connection {
  static join(mount: MountData): Promise<Connection>;           // resolves after the first state sync and the first `config` reply
  readonly room: Room<FactoryState>;
  readonly callbacks: ReturnType<typeof Callbacks.get<FactoryState>>;
  readonly sessionId: string;
  readonly clock: ServerClock;
  readonly status: ConnectionStatus;
  readonly rttMs: number;                                       // EMA of room.ping, refreshed every 2000 ms
  get config(): ClientConfig;                                   // replaced by each `config` reply
  get state(): FactoryState;
  get me(): PlayerState | undefined;                            // state.players.get(sessionId)
  send(name: 'input', p: InputMsg): void;
  send(name: 'interact', p: InteractMsg): void;
  send(name: 'action', p: ActionMsg): void;
  send(name: 'mg', p: MgMsg): void;
  send(name: 'leave', p: LeaveMsg): void;
  send(name: 'emote', p: EmoteMsg): void;
  send(name: 'start', p: StartMsg): void;
  send(name: 'config', p: ConfigRequestMsg): void;
  on<E extends keyof ConnectionEvents>(event: E, fn: ConnectionEvents[E]): () => void;   // returns unsubscribe
}

// resources/js/game/net/ServerClock.ts
export class ServerClock {
  onPatch(clockSeconds: number, nowMs: number): void;
  now(nowMs?: number): number;                                  // estimated FactoryState.clock right now, seconds
}

// resources/js/game/scenes/Factory.ts — what F05–F11 modules receive
export interface FactoryLayers {                                // draw order, bottom → top
  floor: Phaser.GameObjects.Container;     // tiles, walls, props, spill/scorch (F04)
  stations: Phaser.GameObjects.Container;  // F05 createStationsLayer
  items: Phaser.GameObjects.Container;     // F06 createItemsLayer
  avatars: Phaser.GameObjects.Container;   // F04
  fx: Phaser.GameObjects.Container;        // F04 Fx; F07/F08/F09/F10 in-world shows
  overlay: Phaser.GameObjects.Container;   // mini-game panels, order board, banners
}
export const HUD_HEIGHT = 48;                                   // px, the top band
export function tileToPx(t: number): number;                    // t * TILE_PX (positions are tile units, floats)
export class Factory extends Phaser.Scene {                     // key 'Factory'
  readonly conn: Connection; readonly layers: FactoryLayers; readonly keys: Keys; readonly fx: Fx;
  readonly floorWidth: number; readonly floorHeight: number;    // px
  avatarPosition(sessionId: string): { x: number; y: number } | null;   // px inside layers; predicted for self, interpolated for others
}

// resources/js/game/input/Keys.ts
export interface KeyEvents {
  intent: (dx: Axis, dy: Axis) => void;                         // on change only
  interact: (repeat: boolean) => void;  interactUp: () => void;
  action: (repeat: boolean) => void;    actionUp: () => void;
  leave: () => void;
  emote: (kind: EmoteKind) => void;
  board: (open: boolean) => void;                               // Tab held / released
  debug: () => void;                                            // ~ toggled (only when mount.debug)
  start: () => void;                                            // Enter
  overlayKey: (key: OverlayKey, down: boolean, repeat: boolean) => void;   // arrows, while overlay routing is on
}
export class Keys {
  constructor(scene: Phaser.Scene, debugEnabled: boolean);
  on<E extends keyof KeyEvents>(event: E, fn: KeyEvents[E]): () => void;
  setOverlayRouting(on: boolean): void;                         // arrows → overlayKey instead of intent
  readonly intent: MoveInput;
  resetAll(): void;                                             // called on window blur / hidden
}

// resources/js/game/fx/Fx.ts
export class Fx {
  constructor(scene: Factory, layer: Phaser.GameObjects.Container);
  play(m: FxMsg): void;                                         // any §4 kind
  override(kind: FxKind, handler: (scene: Factory, m: FxMsg) => void): void;   // replaces the default for that kind
}

// resources/js/game/ui/Hud.ts
export class Hud {
  banner(key: BannerKey, untilServerSeconds: number): void;             // text = conn.config.copy.banners[key]
  localBanner(text: string | null, colour?: number): void;                  // connection banners; overrides the server banner while set
  toast(m: ToastMsg): void;
  update(state: FactoryState, me: PlayerState | undefined, serverNow: number): void;
}

// resources/js/game/minigames/types.ts
export type OverlayKey = 'left' | 'right' | 'up' | 'down' | 'space' | 'interact' | 'esc';
export interface OverlayContext {
  scene: Factory; room: Room<FactoryState>; sessionId: string; state: FactoryState;
  container: Phaser.GameObjects.Container;                      // the panel; draw inside (0,0)–(width,height)
  width: number; height: number; stationId: string; stationType: StationType;
  clock: ServerClock; serverClock(): number;                     // = clock.now(), estimated FactoryState.clock seconds
  anchorPx(): { x: number; y: number };                          // the station anchor in layer px
  send(op: MgOp, v?: number | string): void;                     // room.send('mg', { stationId, op, t: performance.now(), v })
  sendInteract(): void;                                          // room.send('interact', { t: performance.now() })
  sendAction(): void;                                            // room.send('action', { t: performance.now() })
}
export interface MinigameOverlay {
  capturesMovement: boolean;                                     // true: arrows → onKey only; false (dock): arrows → intent
  mount(ctx: OverlayContext): void;
  update(station: StationState, me: PlayerState, serverNow: number): void;   // every frame while mounted
  onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean;           // true = consumed
  unmount(): void;                                               // destroy what mount() created
}
export type OverlayFactory = () => MinigameOverlay;
export interface StationView {                                   // one per station of the type, on every client
  create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void;
  update(station: StationState, serverNow: number): void;
  destroy(): void;
}

// resources/js/game/minigames/Host.ts
export class Host {
  constructor(scene: Factory);
  update(me: PlayerState | undefined, serverNow: number): void;
  handleKey(key: OverlayKey, down: boolean, repeat: boolean): boolean;   // true = the mounted overlay consumed it
  destroy(): void;
}

// resources/js/game/minigames/index.ts — F07/F08/F09 each replace their entry
export const minigames: Record<StationType, OverlayFactory>;     // Stub factories until their owner lands
export const stationViews: Partial<Record<StationType, () => StationView>>;   // empty in F04
```

Scene keys: `'Boot'`, `'Factory'`, `'Report'` (F11 appends `Report` to the `scene` array in `main.ts`).

### Data & config

Config keys read (from the `config` reply; values are the §13 defaults or the level file):

| Key | Where | Value | Used for |
|---|---|---|---|
| `level.groove.thresholds.onFire / groove / churn / meltdown` | `ClientConfig.level` | 85 / 70 / 30 / 10 | Groove bar band |
| `level.clipboardSeconds` | `ClientConfig.level` | 3 | Clipboard panel bar length |
| `level.movement.playerRadius` | `ClientConfig.level` | 0.35 (§13 default) | `stepPosition` radius for own-avatar prediction |
| `level.players.min` | `ClientConfig.level` | 3 (1 in Sandbox) | Lobby line `LOBBY · n/min players` |
| `layout.width × height` | `ClientConfig.layout` | 28 × 18 | Floor size, `scale.resize` |
| `layout.walls` (packed `y*width + x`) | `ClientConfig.layout` | per layout | Wall tiles; `makeWallLookup` for prediction |
| `layout.spawn, breakRoom, blastBins, dockDoor, ramp, beaconPoles, orderBoard, props.{toolCart, countdownSign, returnsPile, broomHook}` | `ClientConfig.layout` | per layout | Floor decoration |
| `copy.banners[state.banner]` | `ClientConfig.copy` | F12's copy.json | Banner text |

`layout.truckBay` is drawn by F09's `TruckSprite`/`BayWall`, not by `Floor`. The clipboard line is
`me.bubble` (F05 writes it from `clipboardLines(world.level)`); F04 reads no `copy.clipboard`.
`level.movement.tilesPerSecond` is the server's base speed and is not read here — the client
integrates `PlayerState.speed`, which already carries every multiplier.

Contract constants used, all imported from `@shared` (§13): `TILE_PX` 32, `INPUT_HEARTBEAT_MS` 250,
`PLAYER_COLOURS` 8, `RECONNECT_SECONDS` 30. Server tick 20 Hz. `shiftSeconds` is read from state, not
config.

Client constants (F04's own):

| Name | Value | Why |
|---|---|---|
| `HUD_HEIGHT` | 48 px | One text row plus the bar |
| `INTERP_DELAY_MS` | 100 | Two patches at 20 Hz; remote avatars always have a bracket |
| `HISTORY_MS` | 2000 | Position history kept for reconciliation |
| `LAG_INITIAL_MS / LAG_MIN_MS / LAG_MAX_MS / LAG_ALPHA` | 100 / 30 / 500 / 0.1 | Seq-echo lag estimate and its EMA |
| `SNAP_TILES` | 1.0 | Error beyond this is a teleport (knockback 2 tiles, truck ride, respawn) |
| `DEADBAND_TILES` | 0.02 | Below this, no correction |
| `NUDGE` | 0.3 | Fraction of the error applied per server update (converges in ~150 ms at 20 Hz) |
| `CLOCK_EXTRAPOLATE_MAX_S` | 0.25 | `ServerClock` never runs more than 250 ms past the last patch |
| `PING_INTERVAL_MS` | 2000 | `room.ping` cadence |
| `TOAST_MS / TOAST_MAX` | 3000 / 3 | Toast life and stack |
| `DEBUG_REFRESH_HZ` | 4 | Debug text rebuild rate |
| `EMOTE_MIN_INTERVAL_MS` | 500 | Client-side emote rate limit |
| Player palette (index → hex) | 0 `0xE0453A` red · 1 `0xF2921D` orange · 2 `0xF2D33B` yellow · 3 `0x4CB944` green · 4 `0x2BB5A0` teal · 5 `0x3B7DE0` blue · 6 `0x8E5BD6` purple · 7 `0xE86AA6` pink | The docs fix 8 indices, not the colours; these are new |
| Line colours | `a` `0xD62828`, `b` `0x2B6FD6` | doc 19: A red, B blue |
| Groove band colours | ON FIRE `0xF5C542` · IN THE GROOVE `0x4CB944` · baseline `0x9A9A9A` · THE CHURN `0xD9463D` · MELTDOWN `0x7A1E1E` | New; doc 05 names the bands |
| Banner colours | WHOOPS `0xF2D33B` · INCIDENT `0xF2921D` · EXPLODED `0xD9463D` · NICE SAVE `0x4CB944` · CLEAN SWEEP `0x2BB5A0` · HOT STREAK `0xF5C542` · TAILGATE `0xFFFFFF` | New; keyed by `FactoryState.banner`, text from `copy.banners` |

Schema fields written: none. The client never mutates state. Browser storage written:
`sessionStorage['dynamite.reconnect.<factoryId>']` = `room.reconnectionToken`, removed on a failed
reconnect and whenever `phase` becomes `'ended'` (contracts §6 — the next day is a fresh room).

### Behaviour

#### 1. Boot and connection

1. `main.ts` (order fixed by contracts §6 — connect, then start Phaser):
   1. `mount = readMount(document.getElementById('game'))`. A missing attribute throws before anything else (the page is broken, not the network).
   2. Put a centred DOM element inside `#game` reading "CLOCKING IN…" (20 px, white on `#1b1b1f`).
   3. `conn = await Connection.join(mount)`. On rejection, replace the text with red "COULDN'T CLOCK IN — `<message>` — reload to retry" and stop; Phaser never starts. No retry loop: the failure modes (bad ticket, server down) all need a reload or an operator.
   4. On success remove the DOM element and build the game:
      ```ts
      const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 896, height: 624,
        backgroundColor: '#1b1b1f', pixelArt: true, roundPixels: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [Boot, Factory] });
      game.registry.set('mount', mount);
      game.registry.set('conn', conn);
      ```
      896 × 624 is the MVP map (28 × 18 × 32) plus the HUD band; `Factory` resizes to the real layout. F11 appends `Report` to the `scene` array.
2. `Boot.create()`: generates textures with `Graphics.generateTexture` — `'dot'` (4 × 4 white square) for particles and `'px'` (1 × 1 white) for tinted rects — then `this.scene.start('Factory')`. `Factory` reads `conn`/`mount` from `this.registry`.
3. `Connection.join`:
   1. `client = new Client(mount.wsUrl)`.
   2. If `sessionStorage['dynamite.reconnect.<factoryId>']` exists: `room = await client.reconnect(token)`. On rejection (seat expired, token invalid) remove the key and fall through.
   3. Otherwise `fetchTicket(mount)`: `POST mount.ticketUrl` with headers `Content-Type: application/json`, `Accept: application/json`, `X-CSRF-TOKEN: mount.csrf`, `X-Requested-With: XMLHttpRequest`, `credentials: 'same-origin'`, body `{ factory_id: mount.factoryId }`. Non-2xx → `Error('ticket: HTTP <status>')`. Then `room = await client.joinOrCreate<FactoryState>('factory', { ticket, factoryId: mount.factoryId }, FactoryState)` — `factoryId` is required at the top level of the options because the server routes rooms with `filterBy(['factoryId'])` and `onAuth` rejects a ticket whose `factoryId` differs. If the ticket response's `ws_url` differs from `mount.wsUrl`, a new `Client(ws_url)` is used for the join (the response is Laravel's intent; the mount value serves the reconnect path, which runs before any ticket exists).
   4. Store `room.reconnectionToken`; re-store it inside `room.onReconnect`.
   5. Wire: `room.onMessage('config')` → replace `this.config` and emit `config` (the server pushes it on join and after a successful reconnection, and replies to a `config` request with the same message); `room.onMessage('fx' | 'toast' | 'report')` → events; `room.onStateChange` → `clock.onPatch(state.clock, performance.now())`, the patches/s counter, and — when `state.phase === 'ended'` — `sessionStorage.removeItem('dynamite.reconnect.<factoryId>')`; `room.onDrop` → status `'reconnecting'`; `room.onReconnect` → status `'joined'`; `room.onLeave(code)` → status `'closed'` with detail `FAILED_TO_RECONNECT` / `SERVER_SHUTDOWN` / `code N`; `room.onError` → `console.error` + status detail.
   6. `send('config', {})` and await the first `config` message; await the first `onStateChange` if it has not fired yet. Resolve.
   7. `setInterval(PING_INTERVAL_MS)` → `room.ping(ms => rttMs = rttMs === 0 ? ms : 0.5 * rttMs + 0.5 * ms)`.
4. Automatic reconnection uses the SDK defaults (15 retries, 100 ms → 5 s exponential backoff ≈ 30 s, matching `RECONNECT_SECONDS`). While reconnecting, `room.send` is queued by the SDK (max 10); `Keys` keeps producing intents but `Factory` stops sending while `status !== 'joined'` so the queue never fills with stale heartbeats.
5. Nothing in the client ever calls `room.leave()` during play. A closed tab is close code 1001, the server holds the seat 30 s, and a reload resumes it via step 3.2. (`Report`'s NEXT DAY / BACK TO FACTORY buttons are F11's and do call `room.leave()`.)
6. `Factory` re-sends `config` when `state.phase` flips from `'lobby'` to `'running'`: `world.level` becomes the scaled level at `start`, and every consumer of `conn.config.level` (station list, `day`, `orders.everySeconds`) needs the scaled values.

#### 2. Server clock

`ServerClock.onPatch(clock, now)` stores `(lastClock, lastAt)`. `now(t)` returns
`lastClock + min((t − lastAt) / 1000, 0.25)`. `FactoryState.clock` advances every tick in every phase
and resets to 0 on `start`, so this is a monotone estimate within a day. Every `*Until` / `*At`
comparison in the client (`bannerUntil`, `bubbleUntil`, `stunnedUntil`, `clipboardUntil`, `choreUntil`,
`drivenOffUntil`, `jamUntil`, `pausedUntil`, timers inside `StationState.mg`) uses `conn.clock.now()`,
never `Date.now()`. A stalled connection freezes timers 250 ms after the last patch rather than letting
them run ahead and expire early. Client input timestamps on the wire (`mg.t`, `action.t`,
`interact.t`) are `performance.now()` ms — the server maps them through `World.inputClock`.

#### 3. Floor and camera

- `Factory.create()`: `this.scale.resize(layout.width * TILE_PX, HUD_HEIGHT + layout.height * TILE_PX)`. The main camera never scrolls; `FactoryLayers` are six containers created in draw order, all children of `this.floor = this.add.container(0, HUD_HEIGHT)`. Tile `(tx, ty)` is at `(tx * TILE_PX, ty * TILE_PX)` inside `this.floor`; an entity at tile-unit position `(x, y)` is at `(x * TILE_PX, y * TILE_PX)`.
- `Floor.draw(layout)` into `layers.floor`, one `Graphics`: floor `0x3A3A44` with grid lines `0x000000` alpha 0.08 every tile; each wall index `i` → `(i % width, floor(i / width))` filled `0x1C1C22` with a 2 px `0x4A4A55` top edge; break room rect `0x2F4F3A` alpha 0.5 + text `BREAK ROOM`; each blast bin `0xC8A951` + `BLAST BIN`; dock door strip `[x, y, w]` `0x5A4632` + `DOCK`; ramp tiles `0x6E6E78` with a chevron (`fillTriangle`); order board tile `0x8B6B3E` + `ORDERS`; the four `props` tiles as labelled 24 × 24 rects (`toolCart` `0x6E6E78` `TOOLS`, `countdownSign` `0x8B6B3E` `SIGN`, `returnsPile` `0x5A4632` `RETURNS`, `broomHook` `0x6E6E78` `BROOM`); one beacon pole per `beaconPoles[stationId]`: 6 px circle whose colour follows `StationState.beacon` (`off` `0x333333`, `gold` `0xF5C542`, `red` `0xD9463D` blinking 2 Hz).
- Spill/scorch: a second `Graphics` rebuilt whenever `callbacks.onAdd/onRemove('spillTiles' | 'scorchTiles')` fires; index `i` unpacks with `unpackTile(i, layout.width)`: spill `0x9A7B2D` alpha 0.55, scorch `0x111111` alpha 0.5. F06 draws no spill and F10 draws no scorch.
- Station footprints, shelves, state words and progress bars are F05's `createStationsLayer(this)`; items are F06's; fuses, blasts, the red beacon pulse and the repair sign are F10's. `Factory.create()` ends with the fixed mount list in §11 below.
- Window resize: Phaser's `Scale.FIT` re-fits automatically; nothing to do.

#### 4. Avatars

`Avatars` listens `callbacks.onAdd('players')` / `onRemove('players')` and keeps
`Map<sessionId, AvatarView>` in `layers.avatars`; every frame it calls `layers.avatars.sort('y')` so
lower avatars draw over higher ones.

`AvatarView` is a `Container` at `(x * TILE_PX, y * TILE_PX)`:
- body: 24 × 24 `Graphics` square filled with `palette[colour]` (8 entries, `PLAYER_COLOURS`), 2 px `0x222222` outline;
- face: two 3 px black eye dots and a 6 px mouth line, offset from centre by `facingVector(facing) * 4 px` (facing 0 = east, clockwise: `(1,0) (1,1) (0,1) (−1,1) (−1,0) (−1,−1) (0,−1) (1,−1)`, normalised);
- hat: 20 × 5 rect on the top edge in the line colour (`a` red for every M1 player);
- name: 11 px white text, 2 px black stroke, centred 18 px below the body;
- bubble: white rounded rect with a 4 px tail, black 11 px text = `PlayerState.bubble`, above the body; visible while `clock.now() < bubbleUntil`;
- soot (`sooted`): body fill becomes `0x2A2A2A`, outline stays the player colour, eyes turn white — identity readable, shame visible;
- stun wobble (`clock.now() < stunnedUntil`): `rotation = sin(t · 2π · 6) · 0.14` rad; otherwise 0;
- walk bob: while `moving` (own avatar: intent non-zero and `speed > 0`), `body.y = −|sin(t · 2π · 4)| · 2` px;
- driven off (`clock.now() < drivenOffUntil`): the whole container hidden (the player is on the highway).

The own avatar takes `x, y, facing, moving` from `OwnPrediction`; remote avatars take `x, y` from
`RemoteTrack` and `facing, moving` straight from state. `Factory.avatarPosition(sessionId)` returns the
same px position F04 draws at (predicted for self, interpolated for others) and `null` for an unknown
session — F06 anchors carried items with it. Carried items are F06's; F04 draws nothing for `carrying`.

#### 5. Input → messages

`Keys` binds `W A S D UP DOWN LEFT RIGHT SHIFT SPACE E ESC TAB ENTER BACKTICK` via `addKeys` and
captures `TAB SPACE UP DOWN LEFT RIGHT` via `addCapture` (no page scroll, no focus loss). Rules:

| Key | Floor (no overlay) | Overlay routing on (`capturesMovement`) |
|---|---|---|
| W/A/S/D | intent | intent (the server ignores it at a `press` station; at the dock — `stand` — it walks) |
| arrows | intent, unless Shift is held | `overlayKey('left'\|'right'\|'up'\|'down', down, repeat)` |
| Shift + arrow (keydown, not repeat) | `emote`: ← `stop`, ↑ `help`, → `go`, ↓ `what`; arrows contribute nothing to intent while Shift is down | same |
| E | `interact(repeat)` on keydown, `interactUp` on keyup | same events; `Host` offers them to the overlay first |
| Space | `action(repeat)` / `actionUp` | same events; `Host` offers them to the overlay first |
| Esc | `leave` | same event; `Host` offers it to the overlay first |
| Tab | `board(true)` down / `board(false)` up | same |
| Enter | `start` | same |
| ` (backtick) | `debug` if `mount.debug` | same |

Intent: `dx = (D‖→ ? 1 : 0) − (A‖← ? 1 : 0)`, `dy = (S‖↓ ? 1 : 0) − (W‖↑ ? 1 : 0)`, arrows excluded
while Shift is down. `intent` fires only when the pair changes. `window` `blur` and `document`
`visibilitychange` → `resetAll()` → intent `(0, 0)`.

`setOverlayRouting(on)` switches the **arrows** between `intent` and `overlayKey`; `Host` calls it with
the mounted overlay's `capturesMovement` (dock: `false`, so arrows keep walking between lanes). `E`,
`Space` and `Esc` always fire their floor events; `Factory` offers each to `Host.handleKey` first and
sends the floor message only when the overlay did not consume it (§11).

`Factory` sends:
- `input { dx, dy, seq }` on every `intent` event and every `INPUT_HEARTBEAT_MS` (`time.addEvent({ delay: 250, loop: true })`) with the current intent; `seq` increments on every send; `prediction.noteSent(seq, performance.now())` records it. Sending stops when `conn.status !== 'joined'` or `state.phase === 'ended'`.
- `interact { t: performance.now() }`, `action { t: performance.now() }`, `leave {}`, `emote { kind }` (client-side limit: one per 500 ms), `start {}` (only when `phase === 'lobby'`), `config {}` (join and the lobby → running flip).

#### 6. Own-avatar prediction and reconciliation

Inputs are *intents* (sent on change plus a 250 ms heartbeat), not one command per tick, so classic
per-input replay does not apply: the server integrates the latest intent every tick for however long it
holds. The client therefore predicts continuously with the same integrator the server runs
(`stepPosition`, F03's `shared/src/sim/movement.ts`) and reconciles against its own position history at
the moment the server's sample was taken.

Setup: `isSolid = makeWallLookup(conn.config.layout)`, `radius = conn.config.level.movement.playerRadius`.

Every frame (`Factory.update(time, delta)`), with `me = conn.me`:
1. `r = stepPosition({ x, y, facing }, keys.intent, delta / 1000, isSolid, me.speed, radius)`; adopt `r.x`, `r.y`, `r.facing`; `moving = r.moved`; push `{ t: performance.now(), x, y }` onto the history ring (entries older than `HISTORY_MS` dropped). `me.speed` is the server's last effective tiles/s with every multiplier applied (4.0, ×0.8 carrying, ×0.4 on a floor-item tile, ×0.6 on a spill, 0 stunned / driven off / frozen at a `press` station); the client never computes multipliers itself.
2. Facing comes back from `stepPosition` (F02's `facingFrom`); zero intent keeps the previous facing.

On every `callbacks.onChange(me)` (each patch that touches me):
1. If `me.seq` advanced and `sentAt.has(me.seq)`: `sample = now − sentAt.get(me.seq)`; `lag = clamp(lag + 0.1 · (sample − lag), 30, 500)`; drop `sentAt` entries `≤ me.seq`. `lag` starts at 100 ms. This is the input→visible-state delay including the server tick and patch cadence — exactly the lookback reconciliation needs, and the "lag" number on the debug overlay.
2. `h = history.at(now − lag)` (linear interpolation between the bracketing entries; the newest entry if none is older).
3. `ex = me.x − h.x`, `ey = me.y − h.y`, `d = hypot(ex, ey)`.
4. `d > SNAP_TILES` → **snap**: `x = me.x`, `y = me.y`, history cleared (knockback, truck-ride respawn, explosion fling). `d > DEADBAND_TILES` → **nudge**: `x += ex · NUDGE`, `y += ey · NUDGE`. Otherwise nothing.
5. `onReconnect` → snap unconditionally.

Why this holds: for a constant intent both sides run `stepPosition` at the same speed along the same
walls, so `history(now − lag)` and the server's sample differ only by tick quantisation and jitter
(≈ 0.02–0.08 tiles at 4 tiles/s) — under or near the deadband. A direction change produces one
transient error of at most `jitter × speed`, nudged away over ~150 ms. Player–player soft pushes, the
bump stagger (`movement.bumpStaggerSeconds`) and `pushOutOfSolid` are server-only and arrive as ordinary
nudges. Stepping onto a floor-item or spill tile is likewise absorbed: the client learns the new `speed`
one `lag` late and the ≤ 0.2 tile overshoot is nudged back.

#### 7. Remote interpolation

`RemoteTrack.push(x, y, now)` keeps the last 4 samples (dropping duplicates where `x, y` did not
change). `at(renderMs)` with `renderMs = now − INTERP_DELAY_MS`: find samples `a ≤ renderMs ≤ b` and
return `Linear(a, b, (renderMs − a.t) / (b.t − a.t))`; if `renderMs` is past the newest sample (stalled
connection) return the newest — never extrapolate into a wall. `facing`/`moving` read straight from
state (no smoothing).

#### 8. HUD

The top band (48 px, `0x101014`) laid out left → right: line chip `NAME · LINE A` (rounded rect in the
line colour, white 12 px bold) · `BOOK n/N` with one 6 × 8 card glyph per order (filled while remaining,
up to 20) · centred clock in 24 px bold monospace · right: `GROOVE` bar 160 × 14 px, fill =
`groove / 100`, colour + label from `grooveBand(groove, thresholds)`:

| Condition | Band | Colour | Label |
|---|---|---|---|
| `groove ≥ onFire` (85) | `onFire` | `0xF5C542` | ON FIRE |
| `groove ≥ groove` (70) | `groove` | `0x4CB944` | IN THE GROOVE |
| `churn < groove < groove` | `baseline` | `0x9A9A9A` | (none) |
| `groove ≤ churn` (30) and `> meltdown` | `churn` | `0xD9463D` | THE CHURN |
| `groove ≤ meltdown` (10) | `meltdown` | `0x7A1E1E` | MELTDOWN |

Clock: `mmss(max(0, shiftSeconds − clock))` normally; when `state.shiftSeconds === 0` (Sandbox,
`day.endsOn === 'never'`) it shows the elapsed `mmss(clock)` instead and the BOOK glyphs are hidden
(`bookTotal` is 0 there).

Phase text replaces the clock: `lobby` → `LOBBY · n/min players · ENTER starts the shift` when
`state.host === conn.sessionId`, otherwise `LOBBY · n/min players · waiting for the host`; `ended` →
`SHIFT OVER`.

Banner: `state.banner` while `clock.now() < bannerUntil`, text = `conn.config.copy.banners[state.banner]`
— 44 px bold, 6 px black stroke, centred at 35 % of the floor height, colour from the banner-colour
table, scale tween 0.6 → 1 over 150 ms on change. `localBanner` (`RECONNECTING…` `0xF2D33B`,
`DISCONNECTED — reload to rejoin` `0xD9463D`) overrides it while set. F10 draws no banner.

Toasts: top-right under the band, newest on top, max 3 (oldest dropped), 3000 ms life, slide in 150 ms,
fade out 300 ms; colours `info` white, `warn` `0xF2D33B`, `good` `0x4CB944`, `bad` `0xD9463D`.

Order board (`Tab` held): centred panel in `layers.overlay` — `ORDER BOARD · BOOK n/N` and one row per
`state.orders`: `#id  product  shipped/qty  status`, sorted by id. Released → hidden. M3 refines.

Camera shake (only `fx: blast`, and only the floor camera exists) shakes the HUD too — accepted for M1.

#### 9. Debug overlay

Only when `mount.debug`; `~` toggles. Monospace 12 px text on a `0x000000` alpha 0.7 rect at the
top-left of the floor, rebuilt 4×/s from state:

```
tick 20.0/s  patches 20.1/s  clock 123.4  phase running  rtt 34ms  lag 61ms  players 4  items 37
groove 52  wip 37  orders open 3 partial 1 complete 4 failed 0  bottleneck assembly-a 0.92
station       st       w  eff   prog  in    out   flr  util  ips   last
powder-a      working  1  1.00  0.42  -     5/6   3    0.98  0.0   2.1s
assembly-a    starved  3  1.15  0.00  0/8   4/4   1    1.00  0.5   6.4s
dock-a        idle     0  0.00  0.00  -     -     0    0.27  0.0   -
name     x     y     seq   station     tile   speed
Sam      12.4  8.1   812   powder-a    12,9   0.0
```

- `tick/s` = distinct `state.clock` values seen in the last second; `patches/s` = `onStateChange` calls in the last second; `rtt` = `conn.rttMs`; `lag` = `prediction.lagMs`.
- `wip` = `state.items.size`; order counts by `OrderState.status`.
- Bottleneck (doc 05): `pressure = utilization × fullness`, `fullness = inputCap > 0 ? inputShelf.length / inputCap : 1` (a station with no input shelf counts as full); `argmax` over `state.stations`.
- `last` = seconds between the station's last two transitions into `working` (`debugRows.CycleTracker`), `-` until two have happened.
- Server ghost: while the overlay is on, a 24 × 24 red outline rect at the own `PlayerState.x, y` (authoritative) under the predicted avatar; the two should overlap except during a nudge.

#### 10. FX

`Fx.play(m)` renders at `(m.x · TILE_PX, m.y · TILE_PX)` in `layers.fx` (`m.x`/`m.y` are tile units,
tile centres for tile-anchored effects); `s = m.size ?? 1`; when `m.text` is set — for **every** kind —
a 14 px bold white text with 3 px black stroke rises 20 px over 600 ms and fades. Particles come from
one emitter on the `'dot'` texture created with `emitting: false` and fired with `explode(count, x, y)`
after setting the kind's config:

| kind | Particles (count · tint · speed px/s · lifespan ms · extra) | Tween / other |
|---|---|---|
| `thunk` | 8 · `0x9A9A9A` · 40–80 · 300 | — |
| `spark` | 6 · `0xFFB347` · 60–120 · 250 · `gravityY 200` | — |
| `fuse` | 10 · `0xFFE066` · 20–60 · 400 | — (the continuous hiss over the fuse's life is drawn from `FuseState` by F10) |
| `blast` | 40·s · `0xFF7A1A`→`0x222222` · 80–220·s · 600 | white circle radius 32·s px alpha 0.8 → 0 over 200 ms; `cameras.main.shake(250, 0.008·s)` |
| `fizzle` | 12 · `0x444444` · 10–30 upward · 500 | — |
| `snap` | 6 · `0xFFFFFF` · 40–90 · 200 | — |
| `whump` | 20 · `0xC8A951` · 20–50 · 500 | ring: stroked circle radius 8 → 40 px, alpha 0.8 → 0, 400 ms |
| `horn` | — | two stroked arcs scaling 8 → 48 px over 500 ms; text `HONK` 24 px if `m.text` absent |
| `slam` | 16 · `0x9A9A9A` · 30–70 · 350 | 24 px square squash `scaleY 1 → 0.6 → 1` over 200 ms |
| `chime` | 8 · `0xF5C542` · 30–60 · 400 | brass flash: 64 × 64 rect `0xF5C542` alpha 0.6 → 0 over 300 ms |
| `clink` | 3 · `0xBBBBBB` · 20–40 · 250 | text `clink` 12 px |
| `pfft` | 6 · `0xDDDDDD` · 10–25 upward · 450 | text `pfft` 12 px |
| `bonk` | 4 · `0xBBBBBB` · 20–40 · 250 | text `bonk` 12 px |
| `slop` | 10 · `0x6B4A2B` · 20–50 · 350 | — |

`Fx.override(kind, handler)` replaces the default for one kind (F07 overrides `thunk/pfft/clink/slop`
for the Slammer's own show); the default runs only while no handler is registered, so the two never
fire together. Juice budget (doc 04): screen shake only on `blast`; no shake, confetti or stings for
Tier C/D kinds. Confetti and the combo show are F07's, drawn through `Fx` or `layers.fx` directly.

#### 11. Mini-game host, stubs and the mount list

`Factory.create()` ends with a fixed list (each line added by that feature as a "touch"):
`createStationsLayer(this)` (F05), `createItemsLayer(this)` (F06), `createHazardsLayer(this)` (F10),
then one `StationView` per entry of `state.stations` whose `type` has a `stationViews` factory
(created on `onAdd('stations')`, destroyed on `onRemove`, `update(station, clock.now())` every frame on
every client, in `layers.stations`).

Every frame `Host.update(me, serverNow)`:
1. `active = me.stationId !== '' && me.workTile !== ''` and `station = state.stations.get(me.stationId)` exists.
2. `serverNow < me.clipboardUntil` → show the **clipboard panel** (no overlay, no key routing): title `CLIPBOARD`, line `me.bubble` (F05 writes the clipboard line into the bubble), bar filling over `level.clipboardSeconds` and ending at `clipboardUntil`.
3. Else if `active` and nothing is mounted (or the mounted `stationId` differs) → unmount the old, `overlay = minigames[station.type]()`, `overlay.mount(ctx)`, `keys.setOverlayRouting(overlay.capturesMovement)`.
4. Else if `!active` and mounted → `overlay.unmount()`, `keys.setOverlayRouting(false)`.
5. While mounted: `overlay.update(station, me, serverNow)`.

`Host.handleKey(key, down, repeat)` returns `overlay.onKey(key, down, repeat)` when an overlay is
mounted and the clipboard has expired, else `false`. `Factory` routes: `keys.on('interact')` →
`if (!host.handleKey('interact', true, repeat)) send('interact', { t: performance.now() })`;
`interactUp` → `handleKey('interact', false, false)`; `action`/`actionUp` → `'space'`, falling back to
`send('action', { t: performance.now() })`; `leave` → `'esc'`, falling back to `send('leave', {})`;
`overlayKey` (arrows, routing on) → `handleKey(key, down, repeat)`. A `false` return therefore always
leaves the floor behaviour intact — the dock overlay relies on `interact` still reaching the server
while it watches the same key for the tailgate hold.

Panel: in `layers.overlay` at `(0, floorHeight · 2/3)`, size `floorWidth × floorHeight / 3`, rounded
rect `0x101014` alpha 0.88, 2 px border in the line colour, a 12 px triangle tail on the top edge at
`ctx.anchorPx().x` (clamped inside the panel) — anchored to the station, camera never moves (doc 04
rule 5).

Stub overlay (`Stub.ts`, one class, three instances via `index.ts`): title 18 px bold, legend 12 px, and
`station.mg` pretty-printed at 10 px so overlay authors can watch the server's mini-game state before
their overlay exists. `onKey` returns `false` for every key, so the floor messages keep flowing.

| type | `capturesMovement` | title | legend |
|---|---|---|---|
| `boom_powder` | true | `BOOM POWDER — THE SLAMMER` | `← ↑ → mash (each once) · hold SPACE charge · release · E floor the keg · ESC bail` |
| `assembly` | true | `ASSEMBLY — THE JIG` | `A: ← → seat / knots · SPACE pour / crimp · ESC bail   B: ← → short/long · E spool, E cap · hold SPACE toss` |
| `dock` | false | `DOCK` | `E set a stick on your lane · SPACE shove on the beep · hold E tailgate · walk to change lanes` |

#### 12. Report handoff and phase end

`conn.on('report')` → `this.scene.start('Report', { payload, factoryUrl: mount.factoryUrl })` when
`this.scene.get('Report')` is registered (F11's `ReportScene` reads `conn` from `game.registry`); until
F11 lands, `Factory` keeps rendering with the `SHIFT OVER` phase text. `phase === 'ended'` stops input
sending and clears `sessionStorage['dynamite.reconnect.<factoryId>']` (the next day is a fresh room, so
a reload must take the ticket path). Sandbox (`shiftSeconds === 0`, `day.endsOn === 'never'`) never ends
and never receives a `report`; the HUD keeps counting elapsed time.

Edge cases decided: own `PlayerState` removed from `players` → `localBanner('DISCONNECTED — reload to
rejoin')`; `me` undefined for a frame (first patch not yet applied) → the update loop skips prediction,
Host and HUD that frame; `bubble` longer than 24 characters wraps at 24; two toasts in the same frame
stack in arrival order; `fx` outside the map is drawn where it says (nothing clips it).

## Acceptance criteria

- [ ] Opening the play page shows "CLOCKING IN…" then the floor within 1 s on localhost; the `#game` canvas fits the div at any window size with the whole map visible.
- [ ] A missing `data-*` attribute throws `game mount: missing data-<name>` before Phaser starts; `readMount` returns all six attributes including `factoryUrl`.
- [ ] The ticket POST carries `X-CSRF-TOKEN` and `{ factory_id }`; the join options are `{ ticket, factoryId }`; a 419/401 response shows the red "COULDN'T CLOCK IN" text and no canvas.
- [ ] The `config` reply (pushed on join and re-requested at the lobby → running flip) supplies `level`, `layout` and `copy`; walls, break room, blast bin, dock door, ramp, order board and the four `props` tiles are drawn at their tile positions; a spill tile appearing in `state.spillTiles` draws within one patch.
- [ ] Every player is a square in `palette[colour]` with a face pointing along `facing`, a red hat, and a name; `sooted` darkens the body; `stunnedUntil` in the future wobbles it; `bubble` shows above it until `bubbleUntil`; `drivenOffUntil` hides it.
- [ ] Holding D moves the own avatar right immediately (no visible delay) at 4 tiles/s; releasing stops it; diagonals are not faster than cardinals; the avatar cannot enter a wall tile and slides along walls — all of it through `stepPosition` with `movement.playerRadius`.
- [ ] With `server.simulateLatency(200)` on the game server, the own avatar shows no rubber-banding while walking and the debug ghost stays within 0.1 tile except during direction changes.
- [ ] A 2-tile knockback set by the server snaps the avatar within one patch.
- [ ] Remote avatars move smoothly at 20 Hz patches with no stutter; a stalled remote holds its last position.
- [ ] `input` is sent on every intent change and at least every 250 ms with a strictly increasing `seq`; nothing is sent while reconnecting or after `phase === 'ended'`.
- [ ] `E` sends `interact { t }`, `Space` sends `action { t }`, `Esc` sends `leave`, Shift+← / ↑ / → / ↓ send `emote` stop / help / go / what, `Enter` in lobby sends `start`; every `t` is `performance.now()`.
- [ ] Alt-tabbing away sends intent `(0, 0)`; no key stays stuck.
- [ ] The HUD shows `BOOK bookRemaining/bookTotal`, the clock counting down from `shiftSeconds`, the line chip, and the Groove bar in the band colour with the band label at 85/70/30/10 boundaries; with `shiftSeconds === 0` it counts elapsed time and hides the BOOK glyphs.
- [ ] In the lobby only the client whose `sessionId === state.host` sees "ENTER starts the shift".
- [ ] `state.banner` appears centred in its colour with the text from `copy.banners` until `bannerUntil`; a `toast` message appears top-right in its kind's colour for 3 s; three toasts stack.
- [ ] Holding Tab shows the order board listing every `OrderState`; releasing hides it.
- [ ] `~` toggles the debug overlay only when `data-debug="1"`; it shows tick/s, patches/s, RTT, lag, per-station rows, the bottleneck estimate and player rows, refreshed 4×/s.
- [ ] Each of the 14 `fx` kinds renders something visible at `(x · 32, y · 32)`; only `blast` shakes the camera; `text` renders as a rising label for every kind; `Fx.override('thunk', h)` makes `h` the only renderer for `thunk`.
- [ ] Stepping onto a work tile (server sets `stationId` + `workTile`) shows the stub panel for that station type in the bottom third with its legend and the raw `mg` JSON; at `powder-a`/`assembly-a` arrows no longer move the avatar; at `dock-a` (`capturesMovement false`) arrows still walk; leaving the tile removes the panel.
- [ ] While `clipboardUntil` is in the future the clipboard panel shows `me.bubble` and a bar that completes exactly at `clipboardUntil`.
- [ ] Killing the game server for 5 s shows `RECONNECTING…` and the session resumes with the same avatar; a page reload within 30 s resumes via the stored token without a new ticket; after 30 s a fresh ticket join happens; after `phase === 'ended'` the token is gone and a reload takes the ticket path.
- [ ] `npm run typecheck` passes with `strict` and no `any`; `npm run test:client` runs `resources/js/game/__tests__` green.

## Test plan

**Unit (vitest, `resources/js/game/__tests__/`, run by the root `vitest.config.ts` via `test:client`)**

`__tests__/Prediction.test.ts`
- it records history and interpolates a position between two samples
- it returns the newest sample when the lookup is newer than the history
- it updates lag from the seq echo with the 0.1 EMA and clamps to 30–500 ms
- it ignores a seq it never sent
- it does nothing when the error is under 0.02 tiles
- it nudges 30 % of the error when the error is under 1 tile
- it snaps and clears history when the error exceeds 1 tile
- it snaps on reconnect
- it advances the position by calling stepPosition with the configured radius and the server's speed

`__tests__/Interpolation.test.ts`
- it interpolates between the two samples that bracket the render time
- it holds the newest sample when the render time is past it
- it drops duplicate samples
- it keeps at most four samples

`__tests__/ServerClock.test.ts`
- it extrapolates from the last patch
- it never extrapolates more than 250 ms

`__tests__/intent.test.ts`
- it maps WASD and arrows to dx/dy and cancels opposite keys
- it excludes arrows from intent while Shift is held
- it maps Shift+arrows to stop/help/go/what

`__tests__/grooveBand.test.ts`
- it returns onFire at 85 and above
- it returns groove from 70 to 84
- it returns baseline strictly between churn and groove
- it returns churn at 30 and below down to 11
- it returns meltdown at 10 and below

`__tests__/format.test.ts`
- it formats 600 as 10:00 and 65 as 01:05 and clamps negatives to 00:00

`__tests__/debugRows.test.ts`
- it picks the bottleneck by utilization × input fullness
- it treats inputCap 0 as fullness 1
- it reports the last cycle as the gap between the last two entries into working
- it renders a station row with n/cap shelves and "-" for capless shelves

`__tests__/mount.test.ts`
- it parses the six attributes and debug "1" as true
- it throws naming the missing attribute

`__tests__/minigames.test.ts`
- it has a factory for boom_powder, assembly and dock that returns a MinigameOverlay
- it marks the dock overlay capturesMovement false and the other two true
- it starts with an empty stationViews registry that F07–F09 fill by station type

`__tests__/Fx.test.ts`
- it has an entry for every FxKind in the shared union
- it uses an overridden handler instead of the default for that kind

**In-app verification** (`composer run dev`, `cd game-server && npm run dev`, two browsers, `?debug=1`):
1. Open the play page in Chrome and Safari as two members. Screenshot: both avatars visible with names, hats, faces; HUD row complete. Attach to F04's ticket.
2. Toggle `~`; walk with WASD and arrows in both windows; screenshot the overlay with `tick 20`, `patches ~20`, `rtt`, `lag`, and the ghost overlapping the avatar.
3. Add `server.simulateLatency(200)` to the game server dev config; walk into walls and along them; record a 5 s GIF showing no rubber-banding and the ghost trailing by ≈ 0.8 tile at most during turns.
4. Press Shift+↑: bubble `HELP` (server-provided text) appears over your avatar in the other window. Press Tab: order board panel. Press Enter as the host in lobby: phase flips to `running`, the clock starts, and the client re-requests `config`.
5. Stop the game server 5 s and restart it: `RECONNECTING…` then back on the floor. Reload the page: back on the floor without a new ticket request in the Network tab. Wait 35 s disconnected then reload: a new ticket POST appears.
6. From the game server dev console, send one `fx` of each of the 14 kinds and one `toast` of each kind; screenshot the blast (shake visible in a GIF) and the toast stack.
7. Walk onto a Powder work tile (once F05 exists; before that, use the server's dev join): clipboard panel for 3 s showing `me.bubble`, then the Slammer stub with legend and `mg` JSON. Arrows do nothing to the avatar; `Esc` leaves and the panel disappears.
8. Load the `sandbox` level: the HUD shows elapsed time counting up, no BOOK glyphs, and no report arrives.

## Tasks

- [ ] Add client deps and scripts to the root `package.json` (`phaser@4.2.1`, `@colyseus/sdk@0.18.2`, `@colyseus/schema@5.0.27`, `typescript`, `vitest`; `typecheck`, `test:client`); create the root `tsconfig.json` (`strict`, `moduleResolution: bundler`, `lib ES2022+DOM`, `useDefineForClassFields: false`, `experimentalDecorators: true` for F02's schema classes, `paths` for `@shared`, includes `resources/js/game/**` and `shared/**`) and the root `vitest.config.ts` (include `resources/js/game/__tests__/**`, `@shared` alias). Verify `npm run typecheck` and `npm run test:client` on an empty suite.
- [ ] `vite.config.js`: add the `resources/js/game/main.ts` input and the `@shared` alias; `npm run build` emits the entry.
- [ ] `resources/js/game/mount.ts` + test (six attributes).
- [ ] `net/ServerClock.ts` + test.
- [ ] `net/ticket.ts`, `net/connection.ts`: join with `{ ticket, factoryId }`, reconnect-on-reload, `config` message handling, events, ping, status, token cleared on `phase === 'ended'`.
- [ ] `main.ts` + `scenes/Boot.ts`: DOM status line, connect-then-start order, registry entries, textures. Verify: "CLOCKING IN…" then a blank Factory scene with the resized canvas.
- [ ] `render/palette.ts`, `render/Floor.ts`: floor, walls, rooms, bins, door, ramp, board, props, beacon poles, spill/scorch. Verify against the MVP layout.
- [ ] `input/intent.ts` + test; `input/Keys.ts` (bindings, capture, Shift handling, repeat flags, blur reset, arrow routing).
- [ ] `predict/Prediction.ts` + test (drives `stepPosition`); `render/Interpolation.ts` + test.
- [ ] `render/Avatars.ts`: views, faces, hats, names, bubbles, soot, wobble, bob, y-sort; wire own prediction + remote tracks and `avatarPosition` in `Factory`; input sending with seq and heartbeat.
- [ ] `ui/format.ts`, `ui/grooveBand.ts` + tests; `ui/Hud.ts` (chip, book, clock incl. the Sandbox branch, bar, banner from `copy.banners`, toasts); `ui/OrderBoard.ts`.
- [ ] `ui/debugRows.ts` + test; `ui/Debug.ts` (overlay, counters, ghost).
- [ ] `fx/Fx.ts`: the 14-kind table plus `override` + test; verify each kind once from the server dev console.
- [ ] `minigames/types.ts`, `Stub.ts`, `index.ts` (`minigames` + `stationViews`) + test; `Host.ts` (clipboard panel, mount/unmount, `handleKey`, `send` helpers).
- [ ] `Factory.create()` mount list and the `StationView` lifecycle; report handoff and `phase === 'ended'` handling.
- [ ] Reconnection verification (in-app step 5) and the Sandbox HUD check (step 8); tick the status boxes.

## Risks & open questions

- **`config` delivery.** The contracts define `config` as a message pair: the server pushes it in `onJoin` and after a successful reconnection, and answers a client `config` message with the same reply. `Connection` therefore listens for the message and also sends one, rather than depending on `room.request` — the 0.18 docs list request/response as JS-SDK only, so if `@colyseus/sdk@0.18.x` exposes it the code path is an optimisation, not a requirement. Check on the first `npm install`.
- **Prediction near player–player pushes.** Soft pushes and `pushOutOfSolid` are server-only; a crowd pushing you hard shows as repeated nudges (each ≤ 30 % of the error). Acceptable for M1; if playtests show jitter in the Assembly aisle, the push rule would have to move into `stepPosition` (F03's call, and both sides would then need the players list).
- **Hold gestures reach the server as ops, not key-ups.** `interact`/`action` carry no key-up on the wire; holds are either server-side chores (stomp, sweep, unjam, repair — the server owns `choreUntil`) or mini-game ops (`tailgate 'down'|'up'`, `swing`/`toss`). `Keys` exposes `interactUp`/`actionUp` locally so `Host` can build the down/up pairs an overlay's `onKey` needs; nothing else consumes them.
- **Phaser 4 `Container` has no `ScrollFactor`.** Irrelevant while the camera never scrolls; a future scrolling camera (bigger maps in M2) needs a second camera for the HUD.
- **Camera shake moves the HUD.** Accepted for M1; a HUD camera with `ignore()` lists fixes it later.
- **Beacon rendering** splits between F04 (the pole colour from `StationState.beacon`) and F10 (the red pulse and hazard stripes). If the two read the same field on the same frame the pole must stay the single source of the colour — F04 draws nothing else on the pole.
- **Nothing draws stations until F05 lands.** `render/Stations.ts` is F05's; F04's floor, avatars, HUD and stub overlays are verifiable without it, and the debug overlay reads `state.stations` directly.

**Contract change requested**

None. Contracts v2 covers every surface this feature consumes or produces: the `config` message pair
(§4), `shared/src/sim/movement.ts` (§10.8), `PlayerState.speed` (§2), the `clock` time base (§3), tile-unit
`fx.x/y` and the 14 `FxKind`s (§4), packed `LayoutConfig.walls` (§8), the six mount attributes and the
`#game` sizing rule (§6), the overlay/`StationView`/`Fx.override` surface (§10.9), and the root
`vitest.config.ts` / `tsconfig.json` / `vite.config.js` ownership (§1, §12).
