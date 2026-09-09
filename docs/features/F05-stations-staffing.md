# F05 — Stations & staffing
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/stations.ts` · `shared/tests/stations.test.ts` · `game-server/src/sim/stations.ts` · `game-server/tests/stations.test.ts` · `game-server/src/sim/minigames/types.ts` · `game-server/src/sim/minigames/index.ts` · the **stub bodies** of `game-server/src/sim/minigames/{slammer,jig,dock}.ts` (F07/F08/F09 replace the bodies, never the exports) · `resources/js/game/render/Stations.ts` · `resources/js/game/render/stationGlyphs.ts`
**Touches** (one line each, in another owner's file): `shared/src/index.ts` → `export * from './sim/stations';` · `game-server/src/sim/systems.ts` → `stationsSystem` · `game-server/src/rooms/handlers.ts` → the `mg` and `leave` entries (F05 owns those two) plus one appended call in F06's `interact` entry and one in its `action` entry · `resources/js/game/scenes/Factory.ts` → `createStationsLayer(this)` in the mount list.
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/02-factory-floor.md` · `docs/03-stations.md` · `docs/04-minigames.md` (rules 5–6, Unjam) · `docs/05-flow-mechanics.md` · `docs/13-config-schema.md` (Station block) · `docs/14-roadmap.md` · `docs/decisions/0012-output-to-hands.md`

## Goal
When this is done a player can walk onto one of a `press` station's work tiles, press `E`, read a clipboard joke for 3 s (or not, if they worked here in the last minute), and be the station's operator: the station shows WORKING with a progress ring while a mini-game module runs the cycle, STARVED with a *NEED PARTS* bubble when its input shelf lacks what the recipe needs, and *NEED HANDS* when nobody is on it. Standing on a `stand` station's work tile (the dock) *is* being at that station — no press, no clipboard, no snap, arrows keep walking. A second and third body joining move `workers`/`efficiency` along the staffing curve; bodies past the curve's peak stand there asking *what can I do?* every ~6 s, freezing the operator's mini-game for half a second each time. Every product a module finishes lands in the operator's hands and auto-shelves if the output shelf has room. The three M1 mini-games (F07–F09) plug into `MINIGAMES` and never touch join/leave, staffing, cycle timing, or shelves.

## Scope
**In (M1):**
- Station runtime objects built from `StationConfig`: footprint, work tiles, rack tiles, input/output shelf caps, floor ring; one `StationState` row per station, kept current every tick.
- Membership: `press` stations join/leave through `interact` (`E`) and `leave` (`Esc`); `stand` stations gain and lose members in the tick from the player's tile. Roles `work` / `rack` / `helper`; the 3 s clipboard with the 60 s memory (`press` only); the line comes from `clipboardLines(world.level)`.
- Worker counting → `efficiency` through F02's staffing curve; `peakWorkers`; extras; the interrupt cadence (`copy.bubbles.whatCanIDo` every 6 s per extra, 0.5 s pause on the station); `interruptsPerSecond`.
- The cycle rule `max(execution + 0.5 · bubbles, machine)` gating the next cycle, `progress`, and the hands-full gate (ADR 0012).
- `StationState.state`: F05 writes `jammed`; the module writes `idle|starved|working` (through `status?()` or the cycle rule); F10 writes `damaged`, which F05 treats as offline.
- Input pull from the input shelf only (exposed to modules as `ctx.consume` over F06's `items.shelfPull`); output emit through `items.createItem` + `items.deliverOutput`.
- `jam` / `unjam` / `pauseStation` entry points for F06.
- `MINIGAMES` registry with one stub module per M1 station type; `StationState.mg` written only by modules, through `ctx.setMg`.
- Tally sites F05 owns: `tally.bump('kegsMade')`, `tally.bumpPlayer(userId, 'produced')`, `tally.bumpPlayer(userId, 'bubbles')`.
- Client: footprints, machine block + label, work tiles (yellow outline), rack tiles, shelves with item glyphs and `n/cap`, floor-ring dashes, state label, station bubbles, progress ring.

**Out (later milestones):**
- `damaged`, Repair and Incidents are F10's. F05 never enters `damaged`; while a station is damaged it makes no cycle, accepts no join, forwards no op, and writes neither `state` nor `progress`, and `stations.onInteract` returns `false` on that station's work tile so F03's `interact` chain reaches `hazards.tryBeginRepair`.
- Tool-cart contention spinner *waiting for crimper…* (M2 Casing Prep; no cart in M1 stations).
- Churn: `cycleSeconds` is called with `churnSensitive: cfg.churnSensitive, churnDepth: 0` in M1; F11's Groove system supplies a real depth in M2.
- Cross Training halving the clipboard (M4 upgrade); second Jig / Parts Rack curve replacement (M4, config only); line hats and two-line layouts (M2 — `line` is copied through and nothing else).
- The Unjam hold itself (chore `'unjam'`, `hazards.unjamSeconds`, *WAITING FOR VENDOR SUPPORT*) — F06's; F05 only exposes `unjam`.
- Both `utilization` fields, `FactoryState.score` and `groove` — F11's.
- Mini-game overlays and the overlay registry, the beacon-pole colour, the clipboard panel and the per-station debug rows — F04's (`minigames/{types,Host,Stub,index}.ts`, `render/Floor.ts`, `ui/Debug.ts`).

## Design
### Files
| Path | Responsibility |
|---|---|
| `shared/src/sim/stations.ts` | Pure staffing/cycle rules: clipboard rule, worker counting, `peakWorkers`, extras, interrupt cadence, `armedAt`, tile geometry (`footprintOf`, `joinZoneOf`, `roleForTile`), `STATION_LABEL`, `ACTION_OP`. No Colyseus, no `World`, no clock reads. |
| `shared/tests/stations.test.ts` | vitest for everything in the file above. |
| `game-server/src/sim/stations.ts` | Builds `Station` runtime objects, owns `world.stations`, runs `tick`, handles join/leave/mg/interact, writes `StationState` and the staffing fields of `PlayerState`, exposes `stationsSystem`. |
| `game-server/tests/stations.test.ts` | vitest over `makeWorld` (F03's `game-server/tests/helpers/world.ts`). |
| `game-server/src/sim/minigames/types.ts` | `MinigameModule`, `MinigameInstance`, `StationCtx`, `OutputSpec`, `CycleResult`, `LeaveReason`. |
| `game-server/src/sim/minigames/index.ts` | `MINIGAMES: Record<StationType, MinigameModule>`. |
| `game-server/src/sim/minigames/slammer.ts` | Stub `slammerModule`: `E` completes a prime keg. F07 replaces the body, not the export. |
| `game-server/src/sim/minigames/jig.ts` | Stub `jigModule`: `E` consumes one casing + one keg and completes a stick; `starved` when either is missing. F08 replaces the body. |
| `game-server/src/sim/minigames/dock.ts` | Stub `dockModule`: no ops, never starved, no output, `onInteract` returns `false`. F09 replaces the body. |
| `resources/js/game/render/Stations.ts` | One Phaser container per station in `layers.stations`: footprint, machine, tiles, shelves, ring, label, bubbles, progress ring; redraws from `StationState` change callbacks. |
| `resources/js/game/render/stationGlyphs.ts` | Draws an item glyph (keg / casing / stick / crate / parts) into a `Phaser.GameObjects.Graphics` at a size, tinted by quality. F06 may reuse it. |

### Interfaces
**Consumes**

From the contracts (§3, §4, §7, §8): `FactoryState`, `StationState`, `PlayerState`, `ItemState`, `StationType`, `ItemType`, `FuseLength`, `Role`-bearing `StationConfig` (`joinMode`, `workTiles`, `rackTiles`, `inputShelf?`, `outputShelf?`, `floorRing`, `nominalSeconds`, `floorSeconds`, `staffing`, `churnSensitive`, `minigame`), `LevelConfig`, `LayoutConfig`, messages `interact { t? }`, `leave {}`, `mg { stationId, op, t, v? }`, `MgOp`, `FxKind`.

From F02 (`@shared`):
```ts
export function efficiencyFor(curve: StaffingCurve, workers: number): number;   // sim/curve.ts
export interface CycleInputs { floorSeconds: number; efficiency: number; churnSensitive: boolean; churnDepth: number;
                               lastCycleWasPerfect: boolean; executionSeconds: number; bubblesThisCycle: number }
export function cycleSeconds(i: CycleInputs): number;                            // sim/cycle.ts
export type Tile = [number, number];                                            // sim/tiles.ts
export function tileOf(x: number, y: number): Tile;  export function packTile(tx: number, ty: number, width: number): number;
export function tileKey(x: number, y: number): string;                          // 'x,y' — F05 never defines its own
export const CYCLE: { churnFactorMax: number; perfectRearmFactor: number; interruptSecondsPerBubble: number };
export const copy: Copy;  export function clipboardLines(level: Pick<LevelConfig, 'copy'>): string[];
```

From F03 (`game-server/src/sim/World.ts`), the surface F05 touches:
```ts
world.state: FactoryState;  world.level: LevelConfig;  world.layout: LayoutConfig;  world.now: number;   // === state.clock
world.rng.next(): number;   world.tileOf(x, y): Tile;  world.packTile(tx, ty): number;
world.stationConfig(id: string): StationConfig;        world.stations: Map<string, Station>;             // filled by build
world.players: Map<string, PlayerRuntime>;             world.runtime(sessionId: string): PlayerRuntime;
world.inputClock(sessionId: string, tMs: number): number;   // clock seconds, clamped to [clock − 0.2, clock]
world.tally: RunTally;      world.fx(kind, x, y, extra?): void;
world.registerSystem(system: System): void;            // stationsSystem is appended to SYSTEMS (F03's file)
```
F03 also owns `PlayerState.x/y/facing/moving/speed`, freezes a player whose `stationId !== ''` at a `joinMode === 'press'` station (§2), and clears expired bubbles in `bubblesSystem`.

From F06 (`game-server/src/sim/items.ts` and `shared/src/sim/items.ts`):
```ts
export function createItem(world: World, type: ItemType, attrs?: Partial<Pick<ItemState,
  'quality'|'prime'|'dents'|'fuseLength'|'fill'|'capLoose'|'frayed'|'orderId'>>): ItemState;
export function deliverOutput(world: World, station: StationState, item: ItemState, operatorId: string): 'shelf' | 'hands';
export function shelfPull(world: World, station: StationState, side: 'in' | 'out', index?: number): ItemState | null;
export const BUBBLE_SECONDS = 2;
```
F06 calls back into F05: `stations.jam(world, stationId)` when an item is *thrown or knocked* onto a work tile (never for a deliberate `E` put-down), `stations.unjam(world, stationId)` when the unjam hold completes, and `stations.pauseStation(world, stationId, seconds)` for the 0.5 s *WHO THREW THAT* pause.

From F10: `hazards.tickHazards` writes `StationState.state = 'damaged'` and ejects members with `stations.leave(world, player)`; it rolls `hazards.sparks.jammedPer10s` itself off `state === 'jammed'` — F05 rolls nothing.

From F11: `world.tally.bump('kegsMade')`, `world.tally.bumpPlayer(userId, 'produced' | 'bubbles')`. F11 writes both `utilization` fields; F05 keeps no statistics of its own.

From F04 (client): `Factory` (`scene.conn`, `scene.layers.stations`), `Connection` (`conn.config: { level, layout, copy }`, `conn.state`, `conn.callbacks`, `conn.clock.now()`), `TILE`, `tileToPx`. F04 draws the clipboard panel from `me.bubble`, the beacon poles from `StationState.beacon`, the banner, and the debug rows.

From F12: `config/game/copy.json` keys `clipboard`, `bubbles.whatCanIDo`, `stations.needHands`, `stations.needParts`; level files whose station blocks match §Data & config.

**Produces**

`shared/src/sim/stations.ts` (pure):
```ts
export type Role = 'work' | 'rack' | 'helper';
export function footprintOf(cfg: StationConfig, layout: LayoutConfig): { bbox: { x0: number; y0: number; x1: number; y1: number }; machine: Tile[] };
//   bbox = bounding box of anchor ∪ workTiles ∪ rackTiles ∪ inputShelf.tile ∪ outputShelf.tile (the present ones);
//   machine = the layout's wall tiles inside the bbox
export function joinZoneOf(cfg: StationConfig): Set<string>;               // workTiles ∪ rackTiles ∪ floorRing.tiles as tileKey
export function roleForTile(cfg: StationConfig, tile: Tile): Role | null;  // work / rack / helper (floor ring) / null
export function clipboardSecondsFor(lastLeftAt: number | undefined, now: number,
                                    clipboardSeconds: number, memorySeconds: number): number;
//   0 when lastLeftAt !== undefined && now − lastLeftAt <= memorySeconds, else clipboardSeconds
export function countWorkers(members: ReadonlyArray<{ clipboardUntil: number }>, now: number): number;
export function peakWorkers(curve: StaffingCurve): number;                 // smallest key whose value is the curve max
export function extrasFor(curve: StaffingCurve, workers: number): number;  // max(0, workers − peakWorkers)
export function interruptsPerSecond(extras: number, everySeconds: number): number;
export function pickExtras<T extends { joinedAt: number; sessionId: string; role: Role }>(members: readonly T[], extras: number): T[];
//   the `extras` idlest members: helper before rack before work, then most recently joined (ties by sessionId asc)
export function firstBubbleAt(now: number, everySeconds: number, u: number): number;   // now + everySeconds · (0.5 + 0.5 · u)
export function bubblesDue(nextBubbleAt: number, now: number, everySeconds: number): { count: number; nextBubbleAt: number };
export function armedAt(startedAt: number, input: CycleInputs): number;    // startedAt + cycleSeconds(input)
export const STATION_LABEL: Record<StationType, string>;                   // 'BOOM POWDER' | 'ASSEMBLY' | 'DOCK'
export const ACTION_OP: Record<StationType, MgOp>;                         // { boom_powder: 'charge', assembly: 'crimp', dock: 'shove' }
```

`game-server/src/sim/stations.ts` (names, signatures and the `Station` shape are contracts §10.2):
```ts
export interface Member { sessionId: string; role: Role; tile: string; joinedAt: number; nextBubbleAt: number | null }
export interface Cycle { startedAt: number; pausedSeconds: number; bubbles: number; completedAt: number | null }
export interface Station {
  cfg: StationConfig; st: StationState;
  machine: Tile[]; joinZone: Set<string>; ring: number[];            // ring = packed floor-ring tiles
  members: Map<string, Member>;                                      // key = sessionId
  cycle: Cycle | null; armedAt: number; lastCycleWasPerfect: boolean; pausedUntil: number;
  lastLeftAt: Map<string, number>;                                   // sessionId → world.now at leave (clipboard memory)
  clipboardIndex: number;
  mg: MinigameInstance;
}
export function build(world: World): void;                           // fills world.stations and state.stations
export function tick(world: World, dt: number): void;
export function onInteract(world: World, player: PlayerState): boolean;
export function leave(world: World, player: PlayerState): void;      // E / Esc / disconnect / ejection by F10
export function onMg(world: World, player: PlayerState, msg: MgMsg): void;
export function onPlayerLeft(world: World, sessionId: string): void;
export function jam(world: World, stationId: string): void;
export function unjam(world: World, stationId: string): void;
export function pauseStation(world: World, stationId: string, seconds: number): void;
export const stationsSystem: System;                                 // { name: 'stations', init: build, tick }
```

`game-server/src/sim/minigames/types.ts` + `index.ts` — the one server mini-game interface (contracts §10.3); F07/F08/F09 implement it:
```ts
export type LeaveReason = 'esc' | 'stepOff' | 'disconnect';
export interface OutputSpec { type: ItemType; quality: number; prime: boolean; dents: number; fuseLength: FuseLength;
  fill: number; capLoose: boolean; frayed: boolean; orderId: string; handsOf: string }   // handsOf = operator sessionId
export interface CycleResult { item?: OutputSpec; perfect: boolean }
export interface StationCtx {
  world: World; station: Station; cfg: StationConfig; now: number;
  phase: 'idle' | 'executing' | 'rearming' | 'blocked' | 'jammed';
  paused: boolean;                                                   // now < station.pausedUntil
  rearmAt: number;                                                   // = station.armedAt
  operators: PlayerState[]; rackHands: PlayerState[]; helpers: PlayerState[];   // clipboard-done members
  sessionIdOf(player: PlayerState): string;
  inputShelf(): ItemState[];                                         // shelf order
  consume(itemId: string): ItemState;                                // items.shelfPull(world, st, 'in', index)
  beginCycle(): boolean;                                             // false unless phase === 'idle' and no operator is carrying
  complete(result: CycleResult): 'shelved' | 'hands' | 'none';       // items.createItem + items.deliverOutput
  abort(): void;
  setMg(value: object): void;                                        // JSON.stringify → st.mg only when the string changed
  setProgress(p: number): void;                                      // overrides the time-based progress this tick
  fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void;
  bubble(sessionId: string, text: string, seconds: number): void;
}
export interface MinigameInstance {
  onJoin(ctx: StationCtx, player: PlayerState, role: Role): void;
  onLeave(ctx: StationCtx, player: PlayerState, reason: LeaveReason): void;   // 'stepOff' only at 'stand' stations
  onInteract(ctx: StationCtx, player: PlayerState): boolean;         // true = consumed; false = F05 treats E as leave
  onMessage(ctx: StationCtx, player: PlayerState, op: MgOp, v: number | string | undefined, t: number): void;   // t = raw client performance.now() ms — forwarded to the module unchanged (contracts §10.3)
  tick(ctx: StationCtx, dt: number): void;                           // never while jammed/damaged; must not advance timers while ctx.paused
  starved(ctx: StationCtx): boolean;
  status?(ctx: StationCtx): { state: 'idle' | 'starved' | 'working'; progress: number } | null;
}
export interface MinigameModule { create(station: Station): MinigameInstance }   // join mode comes from cfg.joinMode
export const MINIGAMES: Record<StationType, MinigameModule>;         // { boom_powder: slammerModule, assembly: jigModule, dock: dockModule }
```
Modules are called only while `phase === 'running'`, never while the station is `jammed` or `damaged`; `onMessage` is never called for a member still on the clipboard or while `ctx.paused`. Modules own `st.mg` (through `setMg`) and `state`/`progress` (through `status?()`) exclusively.

`resources/js/game/render/Stations.ts`: `export function createStationsLayer(scene: Factory): { destroy(): void }`.
`resources/js/game/render/stationGlyphs.ts`: `export function drawItemGlyph(g: Phaser.GameObjects.Graphics, item: Pick<ItemState, 'type' | 'quality' | 'prime'>, x: number, y: number, size: number): void`.

Schema fields written by F05 (contracts §3): `StationState.{id, type, line, anchorX, anchorY, workers, efficiency, interruptsPerSecond, inputCap, outputCap, pausedUntil}` and `state = 'jammed'` (through `jam`/`unjam`); `PlayerState.{stationId, workTile, clipboardUntil, bubble, bubbleUntil}`, plus `x`/`y`/`moving` at a `press` join only (the §7 snap). Never written here: `st.mg`, `st.jamUntil`, `st.floorCount`, `st.beacon`, `st.utilization`, `st.inputShelf`/`outputShelf` contents, `PlayerState.utilization`.

### Data & config
Level top-level keys read (`clipboardMemorySeconds` and `interrupts.*` are optional with the §13 defaults applied by `validateLevelConfig`, so F05 never branches on `undefined`):

| Key | Value | Source |
|---|---|---|
| `clipboardSeconds` | `3` | docs/02, 13 |
| `clipboardMemorySeconds` | `60` (§13 default) | docs/02 "worked in the last 60 s" |
| `interrupts.everySeconds` | `6` (§13 default) | docs/02 "every ~6 s" |
| `interrupts.pauseSeconds` | `0.5` (§13 default) | docs/02, 05 |

Per-station keys read from `StationConfig`, with the M1 values F12's level files carry (tiles are F12's, shown as the shape only):

| Key | `powder-a` | `assembly-a` | `dock-a` |
|---|---|---|---|
| `type` | `boom_powder` | `assembly` | `dock` |
| `joinMode` | `press` | `press` | `stand` |
| `line` | `a` | `a` | `a` |
| `workTiles` (count) | 1 | 2 | 4 |
| `rackTiles` (count) | 0 | 1 | 0 |
| `inputShelf` | absent | `{ tile, capacity: 8, accepts: ['keg','casing'] }` | absent |
| `outputShelf` | `{ tile, capacity: 6 }` | `{ tile, capacity: 4 }` | absent |
| `floorRing.tiles` | list | list | list |
| `nominalSeconds` | `2.8` | `6.0` | `1.0` |
| `floorSeconds` | `1.4` | `5.0` | `1.0` |
| `staffing` | `{1:1.0, 2:1.05, 3:0.9, 4:0.75}` | `{1:0.6, 2:1.0, 3:1.15, 4:1.1, 5:0.95, 6:0.8, 8:0.5}` | `{1:1.0, 2:1.6, 3:1.9, 4:1.8, 5:1.5, 6:1.2, 8:1.0}` |
| `churnSensitive` | `true` | `false` | `false` |
| `minigame` | F07's block | F08's block (incl. optional `casings`) | F09's block |

An absent shelf means `inputCap` / `outputCap` `0` (contracts §3: the dock has both at 0). Derived: `peakWorkers` = 2 (powder), 3 (assembly), 3 (dock); `interruptsPerSecond` at 10 workers on assembly = 7 / 6 ≈ 1.17.

Copy read (never inline, contracts §14): `clipboardLines(world.level)` for the clipboard bubble, `copy.bubbles.whatCanIDo` for the interrupt bubble (server), `copy.stations.needParts` / `copy.stations.needHands` for the station bubbles (client, from `conn.config.copy`).

Constants that are not config: the interrupt bubble's display time = F06's `BUBBLE_SECONDS` (2 s); the clipboard bubble's display time = the clipboard duration.

Time base: every `*Until` / `*At` this feature writes or reads (`clipboardUntil`, `bubbleUntil`, `pausedUntil`, `armedAt`, `joinedAt`, `lastLeftAt`) is `world.now` = `FactoryState.clock` seconds. `mg.t` arrives as raw `performance.now()` ms and is **forwarded to the module unchanged** (contracts §10.3); a module that judges against server time converts once itself with `world.inputClock(ctx.sessionIdOf(player), t)`. F05 never converts it.

### Behaviour
**Build (`stationsSystem.init` → `build(world)`, once at room creation).** For each `StationConfig` in `world.level.stations`: compute `footprintOf(cfg, world.layout)` and `joinZoneOf(cfg)`; create a `StationState` with `id/type/line`, `anchorX/anchorY = anchor`, `state 'idle'`, `progress 0`, `workers 0`, `efficiency 0`, `interruptsPerSecond 0`, `inputCap = inputShelf?.capacity ?? 0`, `outputCap = outputShelf?.capacity ?? 0`, `floorCount 0`, `jamUntil 0`, `pausedUntil 0`, `mg ''` (`beacon` and `utilization` keep their schema defaults `'off'` / `0`); put it in `state.stations[id]`; create the `Station` with `armedAt = 0`, `lastCycleWasPerfect = false`, `ring` = the packed `floorRing.tiles`, `mg = MINIGAMES[cfg.type].create(station)`. Two stations whose join zones overlap is a config error `validateLevelOnLayout` already rejects; `build` throws with both ids as a second net.

**Tile under a player** = `world.tileOf(p.x, p.y)`. A `press` join snaps the player to the tile centre (`x = tx + 0.5`, `y = ty + 0.5`, `moving = false`); a `stand` station never snaps.

**Interact (`stations.onInteract`).** F03's chain calls it only when `items.onInteract` returned `false`; a `false` return here lets F10's `tryBeginRepair` have the press.
0. If the player's tile is a work tile of a `stand` station: `station.mg.onInteract(ctx, player)` and return its result — regardless of `carrying`, with no clipboard and no join/leave semantics (membership is the tick's, below).
1. Else if the station is `damaged` → return `false`.
2. Else if `player.stationId !== ''`: the module gets `onInteract` first; `true` → return `true`. Otherwise `leave(world, player)` and return `true`.
3. Else if `player.carrying !== ''` → return `false`: you cannot join with full hands, and an operator holding output keeps `E` for F06's put-down.
4. Find the `press` station whose `joinZone` holds the player's tile. None → return `false`.
5. `role = roleForTile(cfg, tile)`. If `role !== 'helper'` and another member already holds `tile` → return `false` (the tile is taken; you stand in the aisle). Otherwise join:
   - `clip = clipboardSecondsFor(station.lastLeftAt.get(sessionId), now, level.clipboardSeconds, level.clipboardMemorySeconds)`.
   - Add `Member { sessionId, role, tile: tileKey(tx, ty), joinedAt: now, nextBubbleAt: null }`.
   - Write `player.stationId = id`, `workTile = role === 'helper' ? '' : tileKey(tx, ty)`, `clipboardUntil = now + clip`; snap the position.
   - If `clip > 0`: `player.bubble = clipboardLines(world.level)[station.clipboardIndex++ % length]`, `bubbleUntil = clipboardUntil`.
   - `station.mg.onJoin(ctx, player, role)`. Return `true`.

**Leave (`stations.leave`)** — from `E` (above), `Esc` (the `leave` message), disconnect (`onPlayerLeft`), or F10's ejection. `station.mg.onLeave(ctx, player, reason)` runs first so the module can reset that player's state; then delete the member, `lastLeftAt.set(sessionId, now)`, clear `stationId`, `workTile`, `clipboardUntil = 0`, and clear `bubble`/`bubbleUntil` when the bubble is still the clipboard line. If the leaver was a `work` member and a cycle is in progress (`cycle !== null && completedAt === null`) the cycle is **forfeit**: `abort()`. Reasons: `'esc'` for `E`/`Esc`, `'stepOff'` for the `stand` tick, `'disconnect'` for `onPlayerLeft` and F10's ejection. A `leave` message from a player with `stationId === ''`, or from a player at a `stand` station, is ignored — `stand` membership is the tick's alone. That refusal lives in the `leave` **handler**, not in `leave` itself, so F10's two-argument `stations.leave(world, player)` still ejects a dock crew from a machine it has just damaged.

**Mini-game input (`stations.onMg`).** Drop the message unless `player.stationId === msg.stationId`, the member's `clipboardUntil <= now`, `st.state !== 'jammed'`, `st.state !== 'damaged'` and `now >= station.pausedUntil`. Otherwise `station.mg.onMessage(ctx, player, msg.op, msg.v, msg.t)`. Ops the module does not know are ignored by the module. The `action` chain's last link (contracts §11) calls `onMg` the same way with `op = ACTION_OP[cfg.type]` and `t = msg.t`, for an overlay that let `Space` fall through to the floor.

**Tick (`stations.tick(world, dt)`, 20 Hz, `phase === 'running'` only).** Per station, in this order:
1. **`stand` membership.** For a `joinMode === 'stand'` station: every floor player whose tile is one of `workTiles` and whose `stationId === ''` becomes a member (`role` from `roleForTile`, `workTile` set, `clipboardUntil = 0`, no snap, no clipboard, `mg.onJoin`); every member whose tile is no longer one of `workTiles` leaves with reason `'stepOff'`.
2. **Workers.** Members whose `clipboardUntil <= now`: `st.workers = countWorkers(...)`; `st.efficiency = efficiencyFor(cfg.staffing, st.workers)`; `extras = extrasFor(cfg.staffing, st.workers)`; `st.interruptsPerSecond = interruptsPerSecond(extras, level.interrupts.everySeconds)`.
3. **Interrupts.** `extraSet = pickExtras(workingMembers, extras)`. A member entering the set gets `nextBubbleAt = firstBubbleAt(now, everySeconds, world.rng.next())`; one leaving it gets `nextBubbleAt = null`. For each member in the set with `now >= nextBubbleAt`, `bubblesDue` says how many fire: each one sets `player.bubble = copy.bubbles.whatCanIDo`, `bubbleUntil = now + BUBBLE_SECONDS`, bumps `tally.bumpPlayer(player.userId, 'bubbles')`, raises `station.pausedUntil = max(pausedUntil, now + level.interrupts.pauseSeconds)`, and adds `cycle.bubbles++` when a cycle is executing. A player on the clipboard is never an extra.
4. **Offline.** If `st.state === 'jammed'` or `'damaged'`: `state` and `progress` are left untouched (F05 owns `jammed`, F10 owns `damaged`), no module tick, no cycle change; jump to step 8. The check also gates step 1 — an offline station seats nobody, or the tick would put a crew F10 just ejected straight back onto a burning machine.
5. **Phase.** With `operators` = `work` members past the clipboard:
   - no operators → `idle` (a cycle was already aborted at leave);
   - cycle executing (`cycle && completedAt === null`) → `executing`; while `now < pausedUntil`, `cycle.pausedSeconds += dt`;
   - cycle completed and `now < armedAt` → `rearming`;
   - `now >= armedAt` and any operator has `carrying !== ''` → `blocked` (ADR 0012: hands full, the machine takes no input);
   - otherwise `idle` (armed, hands free, waiting for the player to start).
6. **Module tick.** `station.mg.tick(ctx, dt)` with `ctx.paused = now < station.pausedUntil`. Modules must not advance their own timers while paused.
7. **State + progress.** `mg.status?.(ctx)` returning non-null → written verbatim. Otherwise the cycle rule: `executing` or `rearming` → `st.state = 'working'` with `progress = clamp((now − cycle.startedAt) / max(cfg.nominalSeconds, cfg.floorSeconds / max(st.efficiency, 0.01)), 0, 1)` while executing and `1` while rearming; else operators exist and `mg.starved(ctx)` → `starved`, `progress 0`; else `idle`, `progress 0`. A `setProgress(p)` call during this tick replaces the computed `progress`.
8. **Counts.** `st.pausedUntil = station.pausedUntil`. `st.floorCount` is **F06's** (contracts §3 writer table): `items.tick` recomputes it from `cfg.floorRing.tiles` every tick, and F05 never writes it. `Station.ring` is the packed form of the same tiles, published by §10.2 for whoever needs it.

**Cycle (through `StationCtx`).**
- `beginCycle()`: `false` unless the phase is `idle` (armed, hands free, not jammed, not damaged). On success `cycle = { startedAt: now, pausedSeconds: 0, bubbles: 0, completedAt: null }`, returns `true`. The module calls it on the first real input of a rep (Slammer: first mash; Jig: seat; Dock: shove).
- `complete(result)`: only while executing. `executionSeconds = (now − cycle.startedAt) − cycle.pausedSeconds`; `station.armedAt = armedAt(cycle.startedAt, { floorSeconds: cfg.floorSeconds, efficiency: st.efficiency, churnSensitive: cfg.churnSensitive, churnDepth: 0, lastCycleWasPerfect: station.lastCycleWasPerfect, executionSeconds, bubblesThisCycle: cycle.bubbles })`; then `lastCycleWasPerfect = result.perfect`, `cycle.completedAt = now`. With `result.item`: `createItem(world, item.type, {...})` then `deliverOutput(world, st, created, item.handsOf)`; `'shelf'` is returned to the module as `'shelved'` and fires `fx 'clink'` at the shelf tile, `'hands'` fires nothing (the module owns the show). No item → `'none'`. When the output type is `keg`, `tally.bump('kegsMade')`; every `work` and `rack` member gets `tally.bumpPlayer(userId, 'produced')`. When `now >= armedAt` on a later tick the cycle is cleared (`cycle = null`). Because pauses freeze execution and each bubble adds `CYCLE.interruptSecondsPerBubble`, `armedAt − startedAt = max(wall, machine)` — docs/05's rule, with the Perfect ×0.75 re-arm applying to the *next* cycle's machine term.
- `abort()`: `cycle = null`, `progress 0`, `armedAt` untouched (a forfeit does not skip the re-arm floor).
- The efficiency in the machine term is the value at completion; a body that joins mid-cycle changes the next cycle's floor, not this one's. Efficiency 0 cannot happen at completion: `complete` requires an operator past the clipboard, so `workers ≥ 1`.

**Starved.** `mg.starved(ctx)` is the module's reading of `ctx.inputShelf()` against its recipe: Powder never (the chutes are infinite), Assembly when no `casing` or no `keg` with pours left is on the shelf, Dock never in M1 (sticks are staged on lane tiles by F09, not pulled). Floor-ring items never satisfy it — pulls come from the input shelf only, so a station can read STARVED with kegs all over its ring. That is the design.

**Jam.** `jam(world, id)`: `st.state = 'jammed'`; an executing cycle stays frozen (not forfeit); the module gets no ticks and no ops. `unjam(world, id)`: `st.state = 'idle'` (the next tick recomputes) and the cycle, if any, resumes with `startedAt += (now − jammedAt)` so the frozen time does not count as execution. `st.jamUntil` is F06's chore progress bar and is not read here. `pauseStation(world, id, s)`: `station.pausedUntil = max(pausedUntil, now + s)`.

**Client (`render/Stations.ts`).** Built once from `conn.config.level.stations` + `conn.config.layout` into `scene.layers.stations` (and rebuilt when the `config` reply swaps the scaled level in), then repainted on the scene's `POST_UPDATE` — one key per station over the fields it draws, so a station nothing has happened to costs a string compare a frame. A shelf glyph depends on `state.stations` *and* on the `state.items` row behind each id, so one dirty check over both beats two subscriptions that have to agree:
- Footprint: bbox tint rect (alpha 0.15, line colour by `line`). Machine block: filled rect over `footprintOf(...).machine` with `STATION_LABEL[type]` centred. Work tiles: 2 px yellow (`#ffd400`) outline per tile; rack tiles: 2 px orange (`#ff9a00`).
- Shelf tiles: a slotted rectangle; up to `cap` glyphs from `drawItemGlyph` for the ids on `inputShelf`/`outputShelf` (2 columns, 8 px glyphs; keg tint by quality — 0.4 grey `#8a8a8a`, 0.7 pale `#c8c8c8`, 1.0 white, `prime` adds a yellow halo), and `n/cap` text under the tile, red when full. Shelved items (`holder === stationId`, `x === -1`) are drawn **only** here; F06 draws floor, lane, held and in-flight items.
- Floor ring: 1 px dashed grey outline per ring tile.
- State label above the machine: `STARVED` (red) / `JAMMED` (red) / `DAMAGED` (grey); nothing for idle or working. Station bubble: `copy.stations.needParts` while `state === 'starved'`; `copy.stations.needHands` while `state === 'idle' && workers === 0 && phase === 'running'`.
- Progress ring: a 24 px arc around the machine centre, shown only while `state === 'working'`, filling `progress`.
- The beacon pole, the banner, the clipboard panel and the debug rows belong to F04 and are not drawn here.

## Acceptance criteria
- [x] `build` creates one `StationState` per config station with `inputCap`/`outputCap` from config (`0` when the shelf is absent), `mg ''`, and throws when two stations' join zones overlap.
- [x] `E` on a free work tile of a `press` station with empty hands sets `stationId`, `workTile`, snaps the avatar to the tile centre and stops movement; `E` while carrying never joins.
- [x] `E` on an occupied work tile does nothing; `E` on a floor-ring tile joins as a helper with `workTile === ''`.
- [x] Walking onto a `dock-a` work tile sets `stationId`/`workTile` with no clipboard and no snap; walking off clears them and calls `onLeave(..., 'stepOff')`; `E` there reaches the module even while carrying a stick, and a `leave` message is ignored while `stations.leave(world, player)` still ejects the member.
- [x] First join to a `press` station shows a `clipboardLines(level)` line over the player for exactly 3 s and drops `mg` ops during it; rejoining within 60 s of leaving shows no clipboard and accepts ops immediately; rejoining 61 s after leaving shows it again.
- [x] `st.workers` equals the members past the clipboard; `st.efficiency` follows the curve (assembly: 1 → 0.6, 2 → 1.0, 3 → 1.15, 7 → 0.65 interpolated, 9 → 0.5 held).
- [x] With 3 members on `powder-a` (peak 2) the last joiner emits `copy.bubbles.whatCanIDo` every 6 s (the first between 3 and 6 s after their clipboard ends), `st.pausedUntil` jumps 0.5 s, `interruptsPerSecond` reads `0.1667`, and each bubble bumps `tally.bumpPlayer(userId, 'bubbles')`.
- [x] A cycle completed in 1.0 s wall on `powder-a` at efficiency 1.05 cannot start the next until 1.4 / 1.05 = 1.333 s after it started; a cycle completed in 2.0 s can start again immediately; after a Perfect the floor is 1.0 s.
- [x] An executing cycle with two bubbles (1.0 s paused) and 1.5 s of real execution re-arms at `startedAt + max(2.5, machine)`.
- [x] `complete` with a keg and a free output shelf → the item is on `outputShelf` the same tick, `tally.kegsMade` is 1 and every work/rack member has `produced` 1; with a full shelf → `PlayerState.carrying` is the new item, the station reads `idle`, and `beginCycle` refuses until the operator's hands are empty.
- [x] `mg.status?.(ctx)` returning `{ state, progress }` is written verbatim and wins over the cycle rule; `setProgress(0.5)` during the module tick overrides the computed progress for that tick.
- [x] While `st.state === 'damaged'` F05 makes no cycle, accepts no join, forwards no op, writes neither `state` nor `progress`, and `onInteract` returns `false` on that station's work tile — at a `stand` station too, where the tick also stops re-seating the bodies standing on the lane.
- [x] Leaving (E, Esc, disconnect, ejection) mid-cycle forfeits it: `progress 0`, `state` no longer `working`, `armedAt` unchanged, and `onLeave` sees the right reason.
- [ ] `assembly-a` with an operator and an empty input shelf reads `starved` and the client shows `copy.stations.needParts`; a keg on its floor ring does not change that; shelving one casing and one keg clears it.
- [x] `jam` freezes progress and drops ops; `unjam` resumes the same cycle with the jammed seconds excluded from execution time.
- [x] `st.floorCount` counts only floor items (`holder === ''`, not in flight) on the station's ring tiles — delegated: contracts §3 gives the field to F06, whose `items.tick` writes it and whose tests cover it.
- [x] The client draws, for every station: bbox tint, machine block with label, yellow work-tile outlines, orange rack-tile outlines, shelf slots with glyphs and `n/cap`, dashed ring, state label, station bubbles, and a progress ring only while `working`.

## Test plan
**Unit — `shared/tests/stations.test.ts`**
- it charges the clipboard on a first visit
- it waives the clipboard when the last leave was within 60 s
- it charges the clipboard again at 60.001 s after leaving
- it counts only members whose clipboard has elapsed
- it finds the peak worker count as the smallest key at the curve max (powder 2, assembly 3, dock 3)
- it reports zero extras at or below the peak and workers − peak above it
- it derives interruptsPerSecond as extras / everySeconds
- it picks the most recently joined members as extras, ties by sessionId
- it spends the aisle before the machine: helper, then rack, then work, whoever arrived last
- it schedules the first bubble between 3 and 6 s after becoming an extra
- it emits exactly one bubble per 6 s and carries the remainder forward (bubblesDue at 6.0, 11.9, 12.1)
- it re-arms at startedAt + max(execution + 0.5 · bubbles, floor / efficiency) over F02's `cycleSeconds` (powder 1.0 s exec at eff 1.05 → 1.333; 2.0 s → 2.0; 1.5 s + 2 bubbles → 2.5) and applies the 0.75 factor after a Perfect
- it derives the footprint bbox from the named tiles and the machine from the layout's walls inside it
- it maps work, rack, ring and outside tiles to work / rack / helper / null

**Unit — `game-server/tests/stations.test.ts`** (vitest over F03's `makeWorld({ level, layout, players })`; the mini-game instance is replaced by a spy for the ctx tests)
- it builds one StationState per config station with caps from config and `mg ''`
- it joins on E at a press station, snaps the avatar, and refuses a join while carrying
- it adds and removes dock members from the tick as a player walks on and off a lane, with reason `'stepOff'`
- it drops mg ops during the clipboard and accepts them after, forwarding `msg.t` to the module unchanged
- it forfeits an executing cycle when the operator leaves
- it gates beginCycle on armedAt and on empty hands, and returns `'shelved'` / `'hands'` from complete
- it bumps `kegsMade`, `produced` and `bubbles` on the tally
- it writes `status()` verbatim and honours `setProgress`
- it reports starved from the module
- it emits bubbles from extras at the cadence and pauses the station
- it freezes on `jam` and resumes on `unjam` without counting jammed time
- it makes no cycle, accepts no join and writes no state while `damaged`

**In-app verification** (`DEV_ALLOW_NO_TICKET=1`, three browser tabs, `data-debug=1`):
1. Tab 1 walks onto `powder-a`'s work tile and presses `E`. Screenshot: the clipboard line over the avatar, the yellow outline, F04's debug rows reading `w=0 eff=0` for 3 s then `w=1 eff=1`. Press `Esc`, walk off, come back within 60 s, `E`: no clipboard.
2. Tab 1 presses `E` again (the stub Slammer's `onInteract`): a keg glyph appears on the output shelf, `1/6`; repeat until `6/6` turns red and the 7th keg is in the avatar's hands; the ring stops filling on further presses until `E` on a floor tile puts the keg down.
3. Tabs 2 and 3 join `powder-a`'s ring tiles. Screenshot within 10 s: `w=3 eff=0.9 ips=0.17`, a *what can I do?* bubble over tab 3's avatar, and tab 1's progress ring frozen for a beat.
4. Tab 2 joins `assembly-a`'s work tile. Screenshot: `STARVED` label and the *NEED PARTS* bubble; leave: *NEED HANDS*.
5. Haul one keg to `assembly-a`'s input shelf (F06) and confirm `1/8` on the shelf with the label still `STARVED` (no casing).
6. Tab 3 walks onto a `dock-a` lane tile carrying a stick: the debug rows show `stationId dock-a` with no clipboard, the avatar keeps walking between lanes, and walking off clears it.

## Tasks
- [x] `shared/src/sim/stations.ts`: `footprintOf`, `joinZoneOf`, `roleForTile` + tests.
- [x] `shared/src/sim/stations.ts`: `clipboardSecondsFor`, `countWorkers` + tests.
- [x] `shared/src/sim/stations.ts`: `peakWorkers`, `extrasFor`, `interruptsPerSecond`, `pickExtras` + tests.
- [x] `shared/src/sim/stations.ts`: `firstBubbleAt`, `bubblesDue` + tests.
- [x] `shared/src/sim/stations.ts`: `armedAt` over F02's `cycleSeconds`, `STATION_LABEL`, `ACTION_OP` + tests; append `export * from './sim/stations';` to `shared/src/index.ts`.
- [x] `game-server/src/sim/minigames/types.ts` + `index.ts` + the three stub modules (`slammerModule` completes a prime keg on `E`; `jigModule` consumes a casing + a keg on `E` and completes a stick, and reports `starved` without them; `dockModule` is inert) + a test that `MINIGAMES` holds one module per `StationType` and the stubs produce what they claim.
- [x] `game-server/src/sim/stations.ts`: `build` + test.
- [x] `game-server/src/sim/stations.ts`: `onInteract` / `leave` / `onPlayerLeft` with the clipboard + tests.
- [x] `game-server/src/sim/stations.ts`: tick step 1, `stand` membership and `'stepOff'` + test.
- [x] `game-server/src/sim/stations.ts`: tick steps 2–3 (workers, efficiency, extras, bubbles, pause, `bubbles` tally) + test.
- [x] `game-server/src/sim/stations.ts`: `StationCtx` (`beginCycle` / `complete` / `abort` / `consume` / `setMg` / `setProgress` / `sessionIdOf`), `onMg`, tick steps 5–7 + tests (gating, forfeit, `status`, starved, `kegsMade`/`produced`).
- [x] `game-server/src/sim/stations.ts`: `jam` / `unjam` / `pauseStation`, the `damaged` offline rule, tick steps 4 and 8 (`pausedUntil`) + tests.
- [x] Wire-up: `stationsSystem` into F03's `SYSTEMS`, the `mg` and `leave` entries in `handlers.ts`, and the appended `stations.onInteract` / `stations.onMg` lines in F06's `interact` and `action` entries + a handler test.
- [x] `resources/js/game/render/stationGlyphs.ts`: `drawItemGlyph` + test.
- [x] `resources/js/game/render/Stations.ts`: the static layer (footprint, machine, work/rack outlines, ring) from `conn.config`.
- [x] `resources/js/game/render/Stations.ts`: the dynamic parts (shelf contents, state label, station bubbles, progress ring), repainted on the scene's POST_UPDATE only when the state they read changed; add `createStationsLayer(this)` to `Factory.create()`'s mount list.
- [ ] In-app verification steps 1–6; screenshots into the ticket.

## Risks & open questions
- **`build` runs at room creation, not at `start`.** Contracts §10.2 pin `stationsSystem = { name: 'stations', init: build, tick }`, so `Station.cfg` comes from the unscaled `world.level`. Every M1 breakpoint is one line, so `scaleLevel` returns the same station list and nothing changes at `start`. A breakpoint that adds a line (M2) needs `build` to re-run in `onStart` — one line on the system object.
- **`peakWorkers` appears twice in the docs.** Contracts §10.2 put it in F05's pure module; F02's own §Files still lists it under `shared/src/sim/curve.ts`. F05 exports it per the contracts; if F02 keeps its copy, F05 should import it instead and drop its own — a one-line change either way.
- **Machine tiles must be walls.** `footprintOf` derives the machine from the layout's wall tiles inside the bbox, so F12's layouts must mark the machine body and the shelf tiles in `walls` (contracts §8 says they are furniture and normally walls) or the block draws empty and players walk through it. F05 adds no collision.
- **Helper join by accident.** Empty-handed `E` on a ring tile joins as a helper. If playtests show haulers joining by mistake, the fix is to require every work tile occupied before a helper join is accepted — one condition in `onInteract`, no contract change.
- **Roadmap wording is stale.** docs/14 lists "overflow ladder (shelf → floor → jam)" and puts Unjam in M2, while ADR 0012 makes a jam an oops consequence and docs/16's M1 hazards include jam sparks. This doc follows the contracts: F05 owns `jammed` and `unjam`, F06 owns the 4 s hold, F10 rolls the jam sparks.

**Contract change requested** (edits to `docs/features/00-contracts.md` — everything else this doc used to ask for is in v2):
1. §10.2 / §11: the `action` chain ends in "`stations` (mg fallback) for an overlay that sends `action` while carrying", but `ActionMsg` is `{ t }` with no op and no key state. F05 resolves it with a pure map `ACTION_OP: Record<StationType, MgOp>` (`{ boom_powder: 'charge', assembly: 'crimp', dock: 'shove' }`) in `shared/src/sim/stations.ts`; add `ACTION_OP` to §10.2's pure export list, or drop the fallback link from §11.
2. §3 writer groups: `StationState.jamUntil` has no writer. F06 owns the unjam chore and its progress bar — add `jamUntil` to F06's group.
3. §3 writer groups vs §7: a `press` join snaps the avatar, so F05 writes `PlayerState.x`/`y`/`moving` at that one moment; §3 lists those three under F03 (and `x`/`y` under F10) only. Add "F05 at a `press` join (snap)" to the group.
4. ~~§3 writer groups: `StationState.floorCount` is listed under both F05 and F06.~~ **Resolved in v2.1 the other way:** §3 lists `floorCount` under F06 alone and §10.2 does not claim it, so F06 keeps it and F05's step 8 writes only `pausedUntil`.
