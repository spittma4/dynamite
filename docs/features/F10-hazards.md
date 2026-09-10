# F10 — Hazards: fuel, sparks, fuses, chains, Whoops/Incident/Explosion, beacon, hot potato, Blast Bin
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/hazards.ts` · `shared/tests/hazards.test.ts` · `game-server/src/sim/hazards.ts` · `game-server/src/sim/hazardsApply.ts` · `game-server/tests/hazards.test.ts` · `resources/js/game/hazards/{HazardsLayer,FuseFx,BlastFx,DangerBeacon,RepairSign}.ts`
**Touches** (one line each, per contracts §1/§12): `shared/src/index.ts` (`export * from './sim/hazards';`) · `game-server/src/sim/systems.ts` (`hazardsSystem`) · `game-server/src/rooms/handlers.ts` (appends `tryBeginRepair` to F06's `interact` entry and `tryBeginStomp` to F06's `action` entry) · `resources/js/game/scenes/Factory.ts` (`createHazardsLayer(this)` in the mount list).
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/16-hazards-and-explosions.md` · `docs/17-oops-carry-and-throw.md` (hot potato) · `docs/05-flow-mechanics.md` (Groove) · `docs/14-roadmap.md` · `docs/13-config-schema.md` · `docs/02-factory-floor.md` (floor ring) · `docs/decisions/0008-explosion-is-the-only-loss.md`

## Goal

Kegs left on the floor and powder spilled on it are fuel, and every careless act (a redlined Slammer, a machine left jammed, a stick that fizzles on the pile, a crimp miss on a dented casing) is a spark. A spark on fuel lights a six-second hissing fuse that anyone can see; a player can stomp it out (stand on it, `Space`, hold still 1 s), pick the lit keg up and run it to the sand-filled Blast Bin for a NICE SAVE, or watch it go off and chain through the pile. One to three kegs is a WHOOPS (soot, scorch, Groove hit); four to nine is an INCIDENT (the nearest station is DAMAGED until someone files the incident report for 10 s); ten or more is THE FACTORY EXPLODING — the day ends as EXPLODED, or on Level 1 and Sandbox every station is damaged and play continues. A red DANGER beacon over a station and hazard stripes around the pile warn when its floor ring holds half the explosion threshold. Nothing here is random: the pile was built by the players, the spark was rolled by the act that caused it, and the fuse gives six seconds of warning.

## Scope

**In (M1):**
- Fuel map from state: floor kegs (1), spill tiles (1), shelf kegs (1, blast-only).
- `spark`/`sparkRing` entry points for F06 (fizzle), F07 (Slammer redline), F08 (crimp on dented). Those callers roll the probability; F10 lights a fuse only if the tile has fuel. The one roll F10 makes itself: `tickHazards` tracks continuous-jam seconds per `jammed` station and rolls `hazards.sparks.jammedPer10s` every 10 s (contracts §10.5).
- Fuses: 6 s keg fuse, 1.5 s chain fuse, spill-tile fuses, `FactoryState.fuses` mirror, `ItemState.lit`.
- Stomp chore (`action` on a fuse tile, 1 s hold → pfft).
- Blast: radius 1, chain propagation (floor kegs, spill tiles, adjacent shelf kegs), keg destroyed, spill → scorch, knockback 2 tiles + stun 2 s + sooted, `grooveEvents.blastKegs` per keg (F11 applies `groove.weights.blastKeg`; `groove.weights.litFuse` drains per lit fuse per second from `state.fuses.size`).
- Chain accounting (3 s rolling window) → WHOOPS / INCIDENT (nearest station damaged, its non-keg stock scrapped, 10 s repair hold) / EXPLODED (`world.requestEnd('exploded', 'exploded')`, or setback: every station damaged when `hazards.explosionEndsRound === false`).
- DANGER beacon (`StationState.beacon = 'red'`, yielding back to `off` and never over-writing a module's `gold` below the line) and client hazard stripes around the pile.
- Hot potato: a lit keg can be carried and thrown (F06 does the carrying); landing or being put down on a `layout.blastBins` tile → whump, keg gone, no chain, `grooveEvents.niceSaves++`, NICE SAVE banner; going off while held → blast centred on the holder; going off in flight → blast at the flight position.
- Repair routing: F05 treats `damaged` as offline and the `interact` chain reaches `tryBeginRepair` on a damaged station's work tile (contracts §11).
- Client fx: fuse sparkle on the item/tile, blast ring + soot puff + camera shake, white flash on the factory explosion, beacon red pulse, hazard stripes, repair sign with the *FILING INCIDENT REPORT* progress bar, whump sand puff + confetti.
- Tally for F11's report: `tally.destroyed('keg', 'blast')` (report `kegsExploded`), `tally.bump('incidents')`, `tally.bumpPlayer(userId, 'sooted' | 'fusesStomped' | 'niceSaves')`.

Doc 16 places Incident, station damage, scorch tiles, the DANGER beacon and sooted sprites in M2. They are built here because the M1 setback flag already needs damage + repair + emptied shelves (Incident is the same mechanic on one station), and the contracts already carry `scorchTiles`, `beacon`, `sooted` and the `'damaged'` station state.

**Out (later milestones):**
- Sand Bucket (M2) and the Hotfix spark (M2): `hazards.sandBucket` and `hazards.sparks.hotfix` are **not** M1 keys — contracts §8 rejects unknown keys under `hazards`, so neither appears in any level file until its milestone adds it to the schema.
- Dock Blast Bin (M2): `layout.blastBins` may hold more than one tile from day one; the M1 layout ships one by Powder.
- Sweeping of scorch (M2): spill sweeping is F06's in M1 (`hazards.sweepSecondsPerTile`); scorch tiles persist until the next day and are cosmetic (doc 16 says both "cosmetic" and "40% slow"; the slow would need a `World.tileSpeed` term and is left for M2).
- Music tick-tock and HUD fuse icon on DANGER (M2 beacon polish); all audio (no audio pipeline exists in the M1 contracts — F10's fx are visual).
- Blast Shield and Second Bucket upgrades (M4).
- Per-pile chains for the two-line map (M2 scaling): M1 has one line, so a chain is factory-global.

**Owned by others, not F10:** scorch-tile and spill rendering, the banner text and the beacon-pole colour on the client (F04 `Floor.ts` / `Hud`); the avatar chore bar (F06 `Items.ts`); the level JSON `hazards` block and `copy.json` (F12); `schema.json`, `config/types.ts` `HazardsConfig` and the defaults table (F02).

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/hazards.ts` (create) | Pure, RNG-free rules: fuel map, spark → fuse, fuse expiry, blast area, blast resolution to an effect list, knockback target, chain accounting and tiers, nearest station, beacon rule, chore status, blast-bin check. Imports `HazardsConfig` from `../config/types` (F02) and `Tile`/`tileOf`/`packTile`/`unpackTile`/`tileKey` from `./tiles` (F02); defines neither. |
| `shared/tests/hazards.test.ts` (create) | Vitest for everything above, including multi-step chain propagation on a small grid. |
| `game-server/src/sim/hazards.ts` (create) | The server system: per-`World` private `HazardsState`, `tickHazards`, `spark`, `sparkRing`, `tryBeginStomp`, `tryBeginRepair`, `onItemLanded`, `resetHazards`, `hazardsSystem`. Builds views from schema, calls the pure module, hands effects to `hazardsApply`. |
| `game-server/src/sim/hazardsApply.ts` (create) | The only place F10 mutates schema: apply `BlastEffect[]`, mirror private fuses into `FactoryState.fuses`, `damageStation`, `repairStation`, set/clear banner, emit fx and toasts through `world.fx`/`world.toast`. |
| `game-server/tests/hazards.test.ts` (create) | Server-side vitest on `makeWorld()` (F03's `game-server/tests/helpers/world.ts`): mirror, escalations, chores, tally and `grooveEvents` writes, day end. |
| `resources/js/game/hazards/HazardsLayer.ts` (create) | `createHazardsLayer(scene: Factory): { destroy(): void }` — owns the sub-renderers below, reads `scene.conn.config.{layout, copy}`, subscribes to state, installs its `Fx.override` handlers. |
| `resources/js/game/hazards/FuseFx.ts` (create) | One flickering sparkle per `FactoryState.fuses` entry, positioned from `FuseState.x/y` (or `scene.avatarPosition(holderSessionId)` for a carried keg); dims while a stomper stands on it. |
| `resources/js/game/hazards/BlastFx.ts` (create) | `Fx.override` handlers for `blast` (ring + soot puff + camera shake, plus a white flash at `size >= 3`), `whump` (sand puff + confetti), `fuse` and `spark` (ignition flash). `pfft` and `chime` stay on F04's default renderer. |
| `resources/js/game/hazards/DangerBeacon.ts` (create) | Red pulsing lamp at `layout.beaconPoles[stationId]` while `beacon === 'red'`; yellow/black hazard stripes on the tiles bordering every floor-fuel tile while any beacon is red. The pole's base colour is F04's. |
| `resources/js/game/hazards/RepairSign.ts` (create) | For each station with `state === 'damaged'`: a DAMAGED sign at the anchor and a progress bar from `StationState.progress`, labelled `conn.config.copy.chores.repair`. |

### Interfaces

**Consumes**

From the contracts (§3 state): `FactoryState.{phase, clock, width, height, items, players, stations, fuses, spillTiles, scorchTiles, banner, bannerUntil}`; `ItemState.{id, type, x, y, holder, shelf, inFlight, flightT, fromX, fromY, toX, toY, lit}`; `PlayerState.{userId, x, y, facing, carrying, chore, choreUntil, stunnedUntil, sooted, stationId, workTile}`; `StationState.{id, anchorX, anchorY, state, progress, beacon, inputShelf, outputShelf}`.

From the contracts (§4 messages): server → client `fx` with kinds `'spark' | 'fuse' | 'blast' | 'whump' | 'pfft' | 'chime'` and `toast { text, kind: 'warn' | 'good' }`. F10 registers no message handler of its own; it appends two calls to F06's `interact` and `action` entries in `handlers.ts` (§11 dispatch).

From the contracts (§8 config): `LevelConfig.hazards: HazardsConfig` (defined in `shared/src/config/types.ts`, F02; `repairSeconds` and `bannerSeconds` are optional with §13 defaults 10 and 3, already applied by `validateLevelConfig`); `StationConfig.{anchor, workTiles, inputShelf?.tile, outputShelf?.tile}`; `LayoutConfig.{width, height, walls, blastBins, beaconPoles}`. F10 never branches on `undefined` config.

From F03 (`game-server/src/sim/World.ts`, §10.1): `world.state`, `world.level`, `world.layout`, `world.now` (= `state.clock`), `world.rng.next()`, `world.stationConfig(id)`, `world.tileOf(x, y)`, `world.packTile(tx, ty)`, `world.isWall(tx, ty)`, `world.stations` (F05's `Station`, for `ring: number[]`), `world.tally`, `world.grooveEvents`, `world.fx(kind, x, y, extra?)`, `world.toast(to, text, kind)`, `world.requestEnd('exploded', 'exploded')`, and the test helper `makeWorld({ level?, layout?, seed?, players? })` from `game-server/tests/helpers/world.ts`. F10 appends `hazardsSystem` to `SYSTEMS` (after `itemsSystem`, before `dockSystem`).

From F05 (`game-server/src/sim/stations.ts`, §10.2): `leave(world, player)` to eject workers from a damaged station; `unjam(world, stationId)` so F05 clears its own jam bookkeeping (`jamUntil` is F05's field) when a jammed station is damaged. F05 treats `state === 'damaged'` as offline: no cycle, no input pull, no join, no forwarded ops, and it writes neither `state` nor `progress` while damaged.

From F06 (`game-server/src/sim/items.ts`, §10.4): `destroyItem(world, itemId)` for every removal F10 causes (blast origin, nice save, shelf clearing on damage — it clears hands, shelf slot, floor index, flight and lane), and `removeSpill(world, t)` when a spill tile scorches (`spillTiles` is F06's field).

From F02: `copy.hazards.sparks[cause]` and `copy.chores.repair` via `@shared` (server: `game-server/src/shared.ts`; client: `conn.config.copy`); `packTile`/`unpackTile`/`tileOf`/`tileKey` from `sim/tiles.ts`; `HazardsConfig` from `config/types.ts`; `Beacon` from `schema/types.ts`.

Behaviour F10 relies on from other features (all of it pinned in contracts v2, nothing requested):
- F06: pickup of an item with `lit === true` is allowed when `level.hazards.litKegCarry`; every throw landing and floor put-down calls `onItemLanded(world, item.id, x, y)` after `x/y/holder` are written; the flight loop tolerates an item id that no longer exists; a stick that fizzles calls `spark(world, x, y, 'fizzle')` (always, no roll); the `action` chain reaches `tryBeginStomp(world, sessionId)` when `items.onAction` returned false.
- F07: a Slammer release judged `late` rolls `world.rng.next() < level.hazards.sparks.slammerRedline` and calls `sparkRing(world, 'powder-a', 'slammerRedline')`.
- F08: a CRIMP miss on a casing with `dents > 0` rolls `world.rng.next() < level.hazards.sparks.crimpOnDented` and calls `sparkRing(world, 'assembly-a', 'crimpOnDented')`.
- F03: `interact`/`action` are dropped while `clock < stunnedUntil`; movement speed is ×0 while stunned; `hazardsSystem.tick` runs after `stationsSystem` and `itemsSystem` and before `dockSystem`/`grooveSystem`/`reportSystem`, and only while `phase === 'running'`.
- F04: renders `PlayerState.sooted`, the banner (`copy.banners[state.banner]`), scorch tiles, spill blobs and the beacon-pole base colour, and interpolates position changes, which is what makes the knockback visible; `Factory.create()` mounts `createHazardsLayer(this)`.
- F11: `grooveSystem` reads `state.fuses.size` as `litFuseCount` and drains `grooveEvents`; `reportSystem` builds `kegsExploded`, `fusesStomped`, `niceSaves` and `players[].sooted` from `world.tally`. Nobody calls into F10 at day start — `hazardsSystem.onStart` is `resetHazards`.
- F12: the level files carry the `hazards` block (`explosionEndsRound: false` on `level-01-basic-flow` and `sandbox`) and `copy.json` carries `chores.repair` and `hazards.sparks.{slammerRedline, jammed, fizzle, crimpOnDented}`.

**Produces**

`shared/src/sim/hazards.ts` (all exported, all pure, no RNG, no clock reads):

```ts
export type SparkCause = 'slammerRedline' | 'jammed' | 'fizzle' | 'crimpOnDented';
export type FuelMode = 'spark' | 'blast';
export type ChainTier = 'none' | 'whoops' | 'incident' | 'exploded';

export interface FuelItem { id: string; type: ItemType; x: number; y: number; holder: string; shelf: '' | 'in' | 'out'; inFlight: boolean }
export interface FuelView {
  width: number; height: number;
  items: ReadonlyArray<FuelItem>;
  spillTiles: ReadonlyArray<number>;
  shelfTileOf: (stationId: string, shelf: 'in' | 'out') => Tile | undefined;
}
export interface FuelCell { x: number; y: number; floorKegs: string[]; spill: boolean; shelfKegs: string[] }
export type FuelMap = ReadonlyMap<number, FuelCell>;                              // key = packTile
export function buildFuelMap(view: FuelView): FuelMap;
export function fuelAt(map: FuelMap, x: number, y: number, width: number, weights: HazardsConfig['fuel'], mode: FuelMode): number;
export function ringFuel(map: FuelMap, ring: ReadonlyArray<Tile>, width: number, weights: HazardsConfig['fuel']): number;

export interface Fuse { key: string; itemId: string; x: number; y: number; expiresAt: number; chain: boolean }
export type FuseMap = ReadonlyMap<string, Fuse>;                                  // key = item id | 't-<packed tile>'
export function tileFuseKey(tile: number): string;                               // 't-' + tile
export function lightFromSpark(map: FuelMap, x: number, y: number, width: number, clock: number, cfg: HazardsConfig, fuses: FuseMap): Fuse | null;
export function pickRingSparkTile(map: FuelMap, ring: ReadonlyArray<Tile>, anchor: Tile, width: number, weights: HazardsConfig['fuel']): Tile;
export function expiredFuses(fuses: FuseMap, clock: number): string[];           // keys with clock + 1e-6 >= expiresAt, sorted

export function blastArea(x: number, y: number, radius: number, width: number, height: number): Tile[];
export interface BlastPlayer { id: string; x: number; y: number; facing: number }   // id = sessionId
export interface BlastView extends FuelView { walls: ReadonlySet<number>; players: ReadonlyArray<BlastPlayer> }
export type BlastEffect =
  | { kind: 'destroyItem'; itemId: string }
  | { kind: 'lightFuse'; fuse: Fuse }
  | { kind: 'scorch'; tile: number }
  | { kind: 'knockback'; sessionId: string; x: number; y: number };
export interface BlastResult { origin: Tile; kegs: 0 | 1; effects: BlastEffect[] }
export function resolveBlast(view: BlastView, fuse: Fuse, fuses: FuseMap, clock: number, cfg: HazardsConfig): BlastResult;
export function knockbackTarget(player: BlastPlayer, originX: number, originY: number, walls: ReadonlySet<number>, width: number, height: number, tiles: number): Tile;

export interface Chain { count: number; lastBlastAt: number; firedTier: ChainTier }
export function advanceChain(chain: Chain | null, clock: number, kegs: number, cfg: HazardsConfig): { chain: Chain; escalation: ChainTier };
export function nearestUndamagedStation(stations: ReadonlyArray<{ id: string; anchorX: number; anchorY: number; state: string }>, x: number, y: number): string | null;
export function explosionAction(cfg: HazardsConfig): 'endDay' | 'setback';
export function dangerBeacon(current: Beacon, ringFuel: number, cfg: HazardsConfig): Beacon;
export function isBlastBin(bins: ReadonlyArray<Tile>, x: number, y: number): boolean;

export interface Chore { sessionId: string; kind: 'stomp' | 'repair'; target: string; tile: Tile; until: number }
export function choreStatus(chore: Chore, player: { x: number; y: number; stunnedUntil: number }, clock: number, targetOk: boolean): 'running' | 'done' | 'cancelled';
```

`game-server/src/sim/hazards.ts` — exactly the surface in contracts §10.5:

```ts
export type SparkResult = 'lit' | 'already' | 'noFuel' | 'inactive';
export function tickHazards(world: World, dt: number): void;
export function spark(world: World, x: number, y: number, cause: SparkCause): SparkResult;
export function sparkRing(world: World, stationId: string, cause: SparkCause): SparkResult;
export function tryBeginStomp(world: World, sessionId: string): boolean;
export function tryBeginRepair(world: World, sessionId: string, stationId: string): boolean;   // toggles: a second call cancels
export function onItemLanded(world: World, itemId: string, x: number, y: number): 'saved' | 'landed';
export function resetHazards(world: World): void;
export const hazardsSystem: System;    // { name: 'hazards', onStart: resetHazards, tick: tickHazards }
```

Schema written by F10 (contracts §3 writer list): `FactoryState.fuses` (key = item id for keg fuses, `t-<packed tile>` for spill-tile fuses; `FuseState { itemId, x, y, secondsLeft, chain }`, `itemId = ''` for tile fuses), `FactoryState.scorchTiles` (append), `banner ∈ 'WHOOPS' | 'INCIDENT' | 'EXPLODED' | 'NICE SAVE'` + `bannerUntil`, `ItemState.lit`, `PlayerState.{chore ('stomp' | 'repair' | ''), choreUntil, x, y, stunnedUntil, sooted}`, `StationState.{state ('damaged', and 'idle' after repair), progress (while damaged), beacon ('red', or 'off' when clearing its own red)}`. Everything else goes through its owner: item removal and spill removal through F06, worker ejection and jam clearing through F05, `groove`/`score` through F11's `grooveEvents`/`tally`, the day end through `world.requestEnd`. F10 never writes `moving`, `spillTiles`, `inputShelf`, `outputShelf`, `jamUntil`, `carrying`, `groove` or `score`.

Messages emitted (positional `world.fx`): `fx('spark', x, y)`, `fx('fuse', x, y)`, `fx('blast', x, y, { size: 1 })` / `{ size: 3 }` for the factory explosion, `fx('whump', x, y)`, `fx('pfft', x, y)`, `fx('chime', x, y)`; `world.toast('all', copy.hazards.sparks[cause], 'warn')` when a fuse is lit.

Client: `createHazardsLayer(scene: Factory): { destroy(): void }` from `resources/js/game/hazards/HazardsLayer.ts`; F04's `Factory.create()` mount list calls it after the tilemap and avatar layers exist. `BlastFx` installs its handlers with `scene.fx.override(kind, handler)` — a runtime call on F04's `Fx`, not an edit to `fx/Fx.ts`.

### Data & config

`LevelConfig.hazards` (type `HazardsConfig` in F02's `config/types.ts`; values from docs/16, keys per contracts §8 — unknown keys under `hazards` are rejected):

```jsonc
"hazards": {
  "fuseSeconds": 6, "chainFuseSeconds": 1.5, "blastRadius": 1, "chainWindowSeconds": 3,
  "sparks": { "slammerRedline": 1.0, "jammedPer10s": 0.5, "crimpOnDented": 0.3 },
  "fuel":   { "floorKeg": 1, "spillTile": 1, "shelfKeg": 1 },
  "incidentThreshold": 4, "factoryExplosionThreshold": 10,
  "explosionEndsRound": true,            // false on level-01-basic-flow and sandbox
  "dangerWarningAt": 0.5,
  "stompSeconds": 1.0, "stunSeconds": 2, "knockbackTiles": 2,
  "litKegCarry": true,
  "unjamSeconds": 4, "sweepSecondsPerTile": 1.5,   // F06's holds, same block
  "repairSeconds": 10,                   // optional, §13 default 10
  "bannerSeconds": 3                     // optional, §13 default 3
}
```

Doc 16's `hazards.blastBins` is not a key: bin geometry is `LayoutConfig.blastBins` (contracts §8). Groove numbers are not hazard keys either: the −10 per keg is `groove.weights.blastKeg`, the +3 for a save is `groove.weights.niceSave`, the −3 per second per lit fuse is `groove.weights.litFuse`; F11's `grooveSystem` applies all three. `hazards.sparks.*` are rolled by the calling feature (the sole exception, `jammedPer10s`, is rolled in `tickHazards`).

Other config read: `Station.ring` (F05's packed floor-ring tiles, from `StationConfig.floorRing` — Powder has 9 tiles on the MVP map) · `StationConfig.{anchor, workTiles}` · `StationConfig.inputShelf?.tile` / `outputShelf?.tile` (absent on the dock; Powder's output capacity 6 on the MVP map is where doc 16's "9 + 6 = 15" comes from) · `layout.{walls, blastBins ([[3, 3]] on the MVP map), beaconPoles, width, height}`.

`config/game/copy.json` keys read (F12 owns the file): `chores.repair` = "FILING INCIDENT REPORT" (client, via `conn.config.copy`) and `hazards.sparks.{slammerRedline, jammed, fizzle, crimpOnDented}` (server toast text, via `import { copy } from '../shared'`).

Private server state (`HazardsState`, one per `World`, in a module-level `WeakMap<World, HazardsState>`): `fuses: Map<string, Fuse & { lastHolder: string }>` (source of truth; `FactoryState.fuses` is the mirror), `chain: Chain | null`, `chores: Map<sessionId, Chore>`, `jamSeconds: Map<stationId, number>` (continuous-jam accumulator), `walls: Set<number>` (built once from `layout.walls`).

### Behaviour

Tile conventions from the contracts: an entity at `(x, y)` is on tile `tileOf(x, y)`; floor items sit at tile centres; packed index = `y * width + x` (`packTile`); Chebyshev distance for the blast area. Every `*Until`/`*At` value F10 reads or writes is in `FactoryState.clock` seconds. Everything below runs only while `phase === 'running'` — F03 only ticks systems then, and `spark`/`sparkRing` return `'inactive'` in any other phase.

**1. Fuel map** (`buildFuelMap`, rebuilt at the top of every tick and after every blast within a tick):
- Item with `type === 'keg'`, `holder === ''`, `inFlight === false` → `floorKegs` of its tile.
- Item with `type === 'keg'`, `holder` = a station id, `shelf ∈ {'in','out'}` → `shelfKegs` of `shelfTileOf(holder, shelf)`.
- Each `spillTiles` entry → `spill = true` on that tile.
- Held kegs (`holder` = sessionId), in-flight kegs, casings, sticks, crates and parts contribute nothing. A held keg is in someone's hands, not on the floor or a shelf (doc 16's fuel table); this is also what makes carrying a lit keg *away* a valid play — a blast beside you does not light the keg you hold.
- `fuelAt(mode='spark')` = `floorKegs.length × fuel.floorKeg + (spill ? fuel.spillTile : 0)`; `mode='blast'` adds `shelfKegs.length × fuel.shelfKeg`. `ringFuel` sums `fuelAt(spark)` over the station's ring tiles (floor fuel only, per doc 16's "floor fuel within any station's ring").

**2. Sparks** (`spark`, `sparkRing`; the caller has already rolled the probability):
- `spark(world, x, y, cause)`: out of bounds or `fuelAt(spark) === 0` → `fx('spark', x, y)` at the tile, return `'noFuel'`. A fuse already exists on that tile (a keg fuse whose current tile is `(x, y)`, or `t-<tile>`) → `'already'`. Otherwise light: if the tile holds floor kegs, the fuse goes on the lowest item id among them (`key = itemId`, `ItemState.lit = true`); if it holds only a spill, a tile fuse (`key = tileFuseKey(tile)`, `itemId = ''`). `expiresAt = clock + fuseSeconds` (6), `chain = false`. Emit `fx('fuse', x, y)` and `toast('all', copy.hazards.sparks[cause], 'warn')`. Return `'lit'`.
- `sparkRing(world, stationId, cause)`: reads `world.stations.get(stationId)?.ring`, unpacks it, chooses the tile via `pickRingSparkTile` — highest `fuelAt(spark)`, ties broken by Euclidean distance to `stationConfig(stationId).anchor`, then by ring order — and calls `spark` there. A ring with no fuel still gets `fx('spark', …)` on the tile nearest the anchor, so players learn that redlining sparks even when nothing catches. Unknown `stationId` or an empty ring → `'noFuel'`.
- Shelf kegs are never lit by a spark (blast-only fuel).
- Jam sparks: `tickHazards` adds `dt` to `jamSeconds[id]` for every station with `state === 'jammed'` and resets the entry to 0 when it is not. Each time an accumulator crosses a 10 s boundary it rolls `world.rng.next() < hazards.sparks.jammedPer10s` and on success calls `sparkRing(world, id, 'jammed')`. This is the only roll F10 makes.

**3. Fuse tick** (in `tickHazards`, after the fuel map):
- For every keg fuse, update `(x, y)` to the keg's current tile: floor → `tileOf(item.x, item.y)`; held → the holder's `tileOf`; in flight → `tileOf(lerp(fromX, toX, flightT), lerp(fromY, toY, flightT))`; shelved → its shelf tile. Tile fuses keep their tile. While the keg is held, the private fuse also records `lastHolder = holder` — that sessionId is who gets the NICE SAVE credit when the keg reaches a bin, since `onItemLanded` carries no thrower.
- Orphans are removed silently (no fx, no tally): a keg fuse whose item is no longer in `state.items` (consumed by a station or destroyed elsewhere), or a tile fuse whose tile is no longer in `spillTiles`.
- Mirror every private fuse into `FactoryState.fuses` (`itemId`, `x`, `y`, `secondsLeft = max(0, expiresAt − clock)`, `chain`); delete mirror entries with no private counterpart. The mirror is what F11's `grooveSystem` counts as `litFuseCount`, so it is rewritten every tick.
- `expiredFuses(fuses, clock)` returns keys with `clock + 1e-6 >= expiresAt`, sorted by key so a tick with several expiries is deterministic. Each is blasted in order (step 5); a key already removed by an earlier blast in the same tick is skipped.

**4. Chores** (`tryBeginStomp`, `tryBeginRepair`, chore tick):
- The server cannot see key-up (`action`/`interact` payloads carry no up/down flag), so "hold 1 s" means: start with the key, then stand still. Moving off the tile cancels.
- `tryBeginStomp(world, sessionId)`: requires `carrying === ''`, `chore === ''` and a fuse whose `(x, y)` equals the player's tile (F03 has already dropped the message if `clock < stunnedUntil`). Sets `chore = 'stomp'`, `choreUntil = clock + stompSeconds` (1.0) and records `Chore { kind: 'stomp', target: fuseKey, tile }`. Returns `false` when any condition fails, so the `action` chain can fall through to F05.
- `tryBeginRepair(world, sessionId, stationId)`: requires that station's `state === 'damaged'`, the player's tile ∈ its `workTiles`, and `carrying === ''`. If the player already has a `repair` chore on this station it is cancelled (`chore = ''`) and `false` is returned — `E` toggles. Otherwise `chore = 'repair'`, `choreUntil = clock + hazards.repairSeconds` (10). Several players may repair the same station concurrently; each has their own timer.
- Each tick, `choreStatus(chore, player, clock, targetOk)`: `'cancelled'` if the player's tile ≠ `chore.tile`, or `clock < stunnedUntil`, or `!targetOk`; `'done'` if `clock + 1e-6 >= chore.until`; else `'running'`. `targetOk` for a stomp = the fuse still exists and is still at `chore.tile` (a keg picked up mid-stomp cancels the stomp); for a repair = the station is still `damaged`.
- Stomp done: delete the fuse (private + mirror), `item.lit = false` if it was a keg fuse, `fx('pfft', …)` at the tile, `tally.bumpPlayer(player.userId, 'fusesStomped')`, `chore = ''`, `choreUntil = 0`. Two players stomping the same fuse: the first to finish extinguishes it; the other's chore cancels next tick.
- Repair done: `station.state = 'idle'`, `station.progress = 0`, `fx('chime', anchor)`, `chore = ''` for every player repairing that station. While damaged, F10 writes `station.progress = max over active repairers of (1 − (until − clock) / repairSeconds)`, 0 when nobody is repairing.
- Cancelled: `chore = ''`, `choreUntil = 0`. F10 only ever clears chores it owns; an F06 chore (`unjam`, `sweep`) is left to F06's own hold check, which the knockback's move and stun already break.

**5. Blast** (`resolveBlast` → effects → `hazardsApply`), for one expired fuse:
1. Origin = the fuse's `(x, y)` (a held keg blasts on the holder's tile; an in-flight keg at its current flight tile; a shelved keg on the shelf tile). `kegs = 1` for a keg fuse, `0` for a tile fuse.
2. Area = `blastArea(origin, hazards.blastRadius = 1)` = the 3×3 block centred on the origin, clipped to the map. Walls do not block a radius-1 blast (a wall tile holds no fuel anyway).
3. Effects, in this order:
   - `destroyItem` for the origin keg. The applier calls `items.destroyItem(world, itemId)`, which clears hands, the shelf slot, the floor index, the flight entry and the lane; F10 writes none of those fields itself. Other items in the area are untouched — sticks, casings, crates and parts have fuel 0 and survive (doc 16: "sticks are sealed").
   - For every other tile in the area (and the origin tile itself for shelf kegs sharing the origin's shelf tile): each floor keg and each shelf keg → `lightFuse` with `expiresAt = min(existing, clock + chainFuseSeconds)` (1.5) and `chain = true` (a burning fuse is shortened, never lengthened; a fresh one is created with `lit = true`). Each spill tile in the area that is not the origin → a chained tile fuse, 1.5 s. This is how spill "spreads a blast along the floor": each spill tile blasts 1.5 s later and lights its own neighbours.
   - `scorch` for the origin tile if it is a spill (it burned with the keg) and always for a tile-fuse origin. The applier calls `items.removeSpill(world, tile)` and appends the packed index to `scorchTiles` (once). A scorch tile has no fuel.
   - `knockback` for every player whose tile is in the area: target = `knockbackTarget(player, origin, walls, width, height, hazards.knockbackTiles = 2)`. Direction `d` = normalised `(player − originCentre)` where `originCentre = (ox + 0.5, oy + 0.5)`; if that vector is shorter than 1e-6 (standing dead centre — the holder of a keg that went off in hand), `d` = the opposite of the player's `facing` (0 = east, clockwise, eight directions). The target is reached by stepping 0.25 tiles along `d` up to 2 tiles, stopping at the last step whose tile is inside the map and not a wall. The applier sets `x`, `y` to the target, `stunnedUntil = clock + hazards.stunSeconds` (2), `sooted = true` (with `tally.bumpPlayer(userId, 'sooted')` on the transition to sooted), cancels the player's own stomp/repair chore, and — if the player was at a station — calls `stations.leave(world, player)`. Carried items are **not** dropped: the stun already stops the player, and a forced drop would make fuel the player never chose to put down (doc 02: "the pile is made of things someone chose to put down"). `moving` and `speed` stay F03's to write on its next movement tick, which is frozen while stunned.
4. The applier then emits `fx('blast', x, y, { size: 1 })`, adds `kegs` to `world.grooveEvents.blastKegs`, calls `tally.destroyed('keg', 'blast')` once per destroyed keg, and rebuilds the fuel map.
5. Chain accounting (`advanceChain`): if `chain` exists and `clock − chain.lastBlastAt <= chainWindowSeconds` (3), `count += kegs` and `lastBlastAt = clock`; otherwise a new chain `{ count: kegs, lastBlastAt: clock, firedTier: 'none' }`. Tile-only blasts extend the window but add 0 kegs. The tier for `count` is `'exploded'` at `>= factoryExplosionThreshold` (10), `'incident'` at `>= incidentThreshold` (4), `'whoops'` at `>= 1`, else `'none'`. `escalation` = that tier if it is higher than `firedTier`, else `'none'`; `firedTier` becomes the tier. Only the highest newly crossed tier fires per blast (a shelf of six going off at once can jump 3 → 9 and fires `incident` once, or 5 → 15 and fires `exploded` without a separate `incident`).

**6. Escalations** (`hazardsApply`):
- `whoops`: `banner = 'WHOOPS'`, `bannerUntil = clock + hazards.bannerSeconds` (3).
- `incident`: `banner = 'INCIDENT'`; `nearestUndamagedStation(stations, origin)` by Euclidean distance from the origin tile to `(anchorX, anchorY)`, ties by lowest station id; `null` (all damaged) → banner only. `damageStation(world, id)`: if the station is `jammed`, `stations.unjam(world, id)` first (F05 owns `jamUntil`); then `state = 'damaged'`, `progress = 0`, `items.destroyItem(world, itemId)` for every **non-keg** id on `inputShelf` and `outputShelf` (F06 empties the arrays), each one billed with `tally.destroyed(type, 'blast')` so `day.ts` still counts it as waste, `stations.leave(world, player)` for every player with `stationId === id`, `fx('blast', anchor, { size: 1 })`. Kegs on the shelves are **left where they are**: a keg is fuel wherever it stands, and doc 16's 9 + 6 = 15 is only reachable if an incident half way through a chain does not defuse the shelf beside it. `beacon` is untouched (the pile is still there), and `tally.bump('incidents')` belongs to the escalation, not to the station — one bump per escalation, so a setback that damages three machines is still one incident.
- `exploded` with `explosionEndsRound === true` (`explosionAction` → `'endDay'`): `banner = 'EXPLODED'`, `sooted = true` for every player (each a `tally.bumpPlayer(userId, 'sooted')` on transition), `fx('blast', origin, { size: 3 })` (the client's white flash), then `world.requestEnd('exploded', 'exploded')` — consumed at the end of the tick by F03, which runs `onDayEnd` and `finishDay`. Remaining fuses stop mattering: `hazardsSystem.tick` no longer runs once `phase === 'ended'`.
- `exploded` with `explosionEndsRound === false` (`'setback'`): `banner = 'EXPLODED'`, `fx('blast', origin, { size: 3 })`, one `tally.bump('incidents')`, `damageStation` for every station. Only players in blast areas are sooted. Remaining fuses keep burning and the chain continues; if a later chain crosses 10 again, the setback fires again. This is the Level 1 and Sandbox path (`endsOn: 'never'` changes nothing here — contracts §8: an explosion in Sandbox follows `explosionEndsRound`).
- Banner expiry: when `clock >= bannerUntil` and `banner` is one of F10's four values, F10 sets `banner = ''`. Other features clear their own.

**7. DANGER beacon** (every tick, after blasts): for each station in `world.stations` with a non-empty `ring`, `dangerBeacon(st.beacon, ringFuel, cfg)` → `'red'` when `ringFuel >= dangerWarningAt × factoryExplosionThreshold` (0.5 × 10 = 5). Below the line it returns `'off'` only when the current value is `'red'`, leaving a module's `'gold'` alone; F07 re-asserts `gold` on its own tick, and because `hazardsSystem` ticks after `stationsSystem`, red wins within a tick (contracts §3). The client draws the red pulse at `layout.beaconPoles[stationId]` and, while any beacon is red, hazard stripes on every tile bordering a floor-fuel tile (floor keg or spill, derived from state — the client has no station config).

**8. Hot potato and the Blast Bin** (`onItemLanded`, called by F06 for throw landings and floor put-downs):
- `item.lit && isBlastBin(layout.blastBins, x, y)` → `'saved'`: delete the fuse (private + mirror), `items.destroyItem(world, itemId)`, `fx('whump', x, y)`, `world.grooveEvents.niceSaves++`, `tally.bumpPlayer(userId, 'niceSaves')` for the fuse's `lastHolder` when that player is still seated, `banner = 'NICE SAVE'`, `bannerUntil = clock + bannerSeconds`. No chain: the bin is sand.
- `item.lit` elsewhere → `'landed'`; the fuse keeps its timer and now sits on the new tile (a lit keg thrown onto the pile chains normally on expiry; a lit keg put on a shelf blasts on the shelf tile and lights every keg on it).
- Not lit → `'landed'`. The bin deliberately does **not** swallow unlit kegs: that would make dumping the surplus a disposal path and defang "stop making powder". F06 goes one better and treats a bin as furniture to anything that is not on fire (`items.blockedForItems` refuses an unlit item the tile), so `onItemLanded` only ever sees an unlit item there through a direct call — the `'landed'` answer is the guard, not a route.
- Going off while held: origin = the holder's tile, so the holder is knocked back opposite their facing, stunned and sooted, and `items.destroyItem` empties their hands. Catching a thrown lit keg is F06's catch with the fuse riding along.
- Stomping requires standing on the fuse tile; shelf tiles are walls, so a lit keg on a shelf can only be grabbed, not stomped.

**9. Groove and tally**: F10 writes `world.grooveEvents.blastKegs += kegs` and `grooveEvents.niceSaves++`, and keeps `state.fuses` accurate so F11's `grooveSystem` can read `litFuseCount = state.fuses.size`. It never touches `state.groove` or `state.score`. Report numbers come from `world.tally`: `destroyed('keg', 'blast')` (→ `kegsExploded`), `bump('incidents')`, `bumpPlayer(userId, 'sooted' | 'fusesStomped' | 'niceSaves')`.

**10. Day reset** (`resetHazards`, run as `hazardsSystem.onStart` at `start`): clears private fuses, chain, chores, jam accumulators; clears `FactoryState.fuses` and `scorchTiles`; sets `lit = false` on all items; `sooted = false` and F10's `chore`/`choreUntil` cleared on all players; any `damaged` station → `idle`, `progress 0`; any `red` beacon → `off`; F10's banner → `''`.

**Server vs client**: the server owns every decision above and every schema write. The client only draws: sparkles from `state.fuses` (`scene.avatarPosition(holderSessionId)` for a carried keg, otherwise the tile centre in px; flicker 8 Hz, 16 Hz under 2 s; dimmed to grey while any player with `chore === 'stomp'` stands on that tile), the one-shot fx it overrides (`blast` ring expanding 0 → 48 px over 300 ms with a soot puff and `cameras.main.shake(200, 0.004 × size)`, plus a full-screen white rectangle fading over 600 ms at `size >= 3`; `whump` a sand-coloured puff plus 40 confetti particles in the eight avatar palette colours; `spark` and `fuse` a 150 ms yellow flash), the red beacon pulse and stripes, and the repair sign. `pfft` and `chime` use F04's default renderer; scorch tiles, spill blobs, the banner and the avatar chore bar are F04's and F06's. Knockback motion is F04's interpolation of the position change; own-avatar prediction reconciles via `seq`.

## Acceptance criteria

- [x] With one keg on the Powder floor ring and no spill, `sparkRing(world, 'powder-a', 'slammerRedline')` lights a fuse on that keg with `secondsLeft` 6 and `ItemState.lit === true`, emits `fx('fuse', …)` and a toast reading `copy.hazards.sparks.slammerRedline`.
- [x] `sparkRing` on an empty ring emits `fx('spark', …)` at the ring tile nearest the anchor and lights nothing.
- [x] A spark on a spill tile with no keg lights a `t-<tile>` fuse with `itemId === ''`.
- [x] A spark never lights a shelf keg.
- [x] A fuse lit at clock 10.00 blasts on the tick where clock reaches 16.00 (120 ticks at 50 ms), not before.
- [x] A station held `jammed` for 10 s with `sparks.jammedPer10s = 1` sparks its ring exactly once; at 20 s it has sparked twice; clearing the jam resets the accumulator.
- [x] Standing on a fuse tile and sending `action` sets `chore = 'stomp'`; standing still for 1 s removes the fuse, emits `fx('pfft', …)`, clears `lit`, and bumps that player's `fusesStomped` in `world.tally`. Moving before 1 s clears `chore` and the fuse keeps burning.
- [x] A blast lights a 1.5 s `chain: true` fuse on every floor keg, spill tile and shelf keg in the 3×3 around the origin and nothing at distance 2.
- [x] A line `keg · spill · spill · keg` blasts end to end: the far keg is destroyed 4.5 s after the first blast and both spill tiles are in `scorchTiles` and no longer in `spillTiles`.
- [x] A full 9-tile Powder ring beside an output shelf holding 6 kegs, sparked once, destroys 15 kegs and escalates to `exploded` (all fifteen in setback mode; an ending explosion stops the chain on the blast that crosses 10, which is the point at which the day is over anyway).
- [x] Every player in the 3×3 is moved 2 tiles away from the origin (stopping before walls), has `stunnedUntil = clock + 2`, `sooted === true`, and keeps whatever they were carrying.
- [x] A keg going off in a player's hands blasts at that player's tile, knocks them back opposite their facing, and leaves their hands empty via `items.destroyItem`.
- [x] Each keg blast adds 1 to `world.grooveEvents.blastKegs` and calls `tally.destroyed('keg', 'blast')`; `state.fuses.size` equals the number of burning fuses; F10 never writes `state.groove`.
- [x] A chain of 1–3 kegs shows `banner = 'WHOOPS'` for 3 s; 4–9 shows `'INCIDENT'`, `tally.counts.incidents` is 1, and the nearest undamaged station becomes `damaged` with both shelves empty and its workers ejected through `stations.leave`; ≥ 10 shows `'EXPLODED'`.
- [x] Two keg blasts 3.0 s apart are one chain; 3.05 s apart are two chains.
- [x] With `explosionEndsRound: true`, reaching 10 kegs calls `world.requestEnd('exploded', 'exploded')` once and every player is sooted.
- [x] With `explosionEndsRound: false`, reaching 10 kegs damages every station, requests no end, and the day continues.
- [x] Holding `E` on a damaged station's work tile for 10 s (standing still, empty-handed) returns it to `idle`; `StationState.progress` rises 0 → 1 meanwhile; pressing `E` again mid-hold cancels.
- [x] `StationState.beacon` for Powder is `'red'` when its ring holds ≥ 5 floor fuel and returns to `'off'` below; a `'gold'` beacon below the line is left alone, and a beacon set to `'gold'` by the Slammer earlier in the same tick reads `'red'` after `hazardsSystem` ticks.
- [x] A lit keg landing on `layout.blastBins[0]` is removed with no blast, `fx('whump', …)`, `banner = 'NICE SAVE'`, `grooveEvents.niceSaves` 1 and that player's `niceSaves` tally 1; a lit keg landing elsewhere keeps its fuse; an unlit keg is refused the bin tile by F06's `blockedForItems` and `onItemLanded` answers `'landed'` for one anyway.
- [x] `resetHazards` leaves no fuses, scorch, chores, damaged stations, red beacons, sooted players or F10 banner.
- [ ] In the browser: the fuse sparkle sits on the keg (and follows a carrier), the blast shows a ring, soot puff and screen shake, F04 draws the scorch marks the server appended, the beacon pulses red with stripes around the pile, F04's HUD shows the WHOOPS/INCIDENT/EXPLODED/NICE SAVE banner text, a damaged station shows *FILING INCIDENT REPORT* with a filling bar, and the factory explosion flashes white.

## Test plan

Unit tests in `shared/tests/hazards.test.ts` (vitest), grouped as in the module:

Fuel counting
- it counts a floor keg as 1 fuel on its tile
- it counts a spill tile as 1 fuel
- it counts a shelf keg for blast mode only
- it places a shelved keg on its station's shelf tile
- it ignores held kegs, in-flight kegs, casings, sticks, crates and parts
- it sums ring fuel over the station's ring tiles from floor fuel only

Sparks and fuse timing
- it lights a 6 s fuse on the lowest-id floor keg of a sparked tile
- it lights a 6 s tile fuse on a spill with no keg
- it lights nothing on a tile without fuel
- it does not relight a burning fuse
- it never lights a shelf keg from a spark
- it picks the ring tile with the most fuel, nearest the anchor on ties
- it expires a fuse on the 120th 50 ms tick and not on the 119th
- it returns expired keys sorted

Blast and chain propagation (small grid, effects applied to a plain model by a test helper, time stepped with `expiredFuses`)
- it destroys the origin keg only
- it lights 1.5 s chain fuses on the 8 neighbours and not at distance 2
- it shortens a burning fuse to 1.5 s instead of lengthening it
- it lights every keg on an adjacent shelf and kegs sharing the origin's shelf tile
- it carries a blast along a line of spill tiles and scorches each one
- it scorches a spill on the origin tile immediately
- it leaves sticks, casings, crates and parts in the area untouched
- a full 9-tile ring beside a 6-keg shelf chains to 15 kegs
- it knocks players in the 3×3 back 2 tiles away from the origin
- it stops a knockback at a wall and at the map edge
- it knocks the holder of a keg that goes off in hand opposite their facing

Thresholds → outcome
- 1 keg escalates to whoops, 4 to incident, 10 to exploded, each once per chain
- it fires only the highest tier when a blast crosses two tiers at once
- blasts 3.0 s apart share a chain and 3.05 s apart do not
- a spill-only blast extends the window but adds no kegs
- it picks the nearest undamaged station by anchor distance, lowest id on ties
- it returns null when every station is damaged
- explosionAction is setback when explosionEndsRound is false

Blast bin, beacon, chores
- it recognises a blast-bin tile and nothing else
- the beacon turns red at ring fuel 5 of threshold 10 and off below
- the beacon leaves gold alone below the line
- a stomp completes after 1 s standing still on the fuse tile
- a stomp cancels when the player leaves the tile, is stunned, or the fuse moves
- a repair completes after 10 s and cancels when the station is no longer damaged

Server tests in `game-server/tests/hazards.test.ts`, all on `makeWorld({ players: 3 })`:
- it mirrors private fuses into `state.fuses` with `secondsLeft` and deletes orphans
- it keeps a carried keg's fuse tile on the holder each tick
- a redline spark toasts `copy.hazards.sparks.slammerRedline` and lights the ring's fullest tile
- it rolls `jammedPer10s` once per 10 s of continuous jam and resets when the jam clears
- a blast destroys the keg through `items.destroyItem`, scorches through `items.removeSpill`, and writes `grooveEvents.blastKegs` and `tally.destroyed('keg','blast')`
- an incident damages the nearest station, scraps the non-keg stock on both shelves (billed through `tally.destroyed`), leaves the kegs standing as fuel, ejects its workers via `stations.leave` and bumps `tally.counts.incidents` once
- a full 9-tile ring beside a 6-keg output shelf, sparked once, walks WHOOPS → INCIDENT → EXPLODED, and destroys all fifteen kegs when the level plays the explosion as a setback
- an explosion with `explosionEndsRound: true` calls `world.requestEnd('exploded','exploded')` exactly once; with `false` it damages every station and requests nothing
- `tryBeginStomp` returns false while carrying, and the completed stomp bumps the player's `fusesStomped`
- `tryBeginRepair` toggles, fills `StationState.progress`, and returns the station to `idle`
- a lit keg put down or thrown into the bin through F06's own verbs is saved (whump, banner, `grooveEvents.niceSaves`, the carrier's `niceSaves` tally), one put down anywhere else keeps its fuse, and an unlit one is refused the tile
- `resetHazards` (via `hazardsSystem.onStart`) clears fuses, scorch, chores, damage, red beacons and sooted players

In-app verification (Sandbox level, `explosionEndsRound: false`, three browsers, `data-debug=1`):
1. Make five kegs at the Slammer and put them on the Powder floor ring. Confirm the beacon pole turns red and stripes appear around the pile — screenshot.
2. Redline a release. Confirm the sparkle on one keg, the "REDLINED THE SLAMMER" toast, and the Groove drain in the debug overlay. Stand on it and hold `Space`: sparkle dims, pfft at 1 s, fuse gone — screenshot the dimmed sparkle.
3. Redline again; pick the lit keg up (`E`), walk two tiles, throw (`Space`) into the bin at `(3, 3)`. Confirm whump, confetti, NICE SAVE banner and the Groove bump — screenshot the banner.
4. Redline again and do nothing. At 6 s: blast ring, soot puff, screen shake, players next to it thrown 2 tiles and black-faced, WHOOPS banner, chain sparkles on the neighbours, second and third blasts at 1.5 s intervals, scorch marks where spills were — screenshot mid-chain.
5. Fill the ring (9) and the output shelf (6) and redline. Confirm INCIDENT at the 4th keg (nearest station shows DAMAGED + *FILING INCIDENT REPORT*, its workers back on the floor, the shelf kegs still standing), then EXPLODED at the 10th with the white flash, every station damaged, play continuing. Hold `E` on a damaged station's work tile for 10 s and watch the bar fill — screenshot the bar at ~50%.
6. Switch to Level 2 (`explosionEndsRound: true`), repeat step 5: the day ends on the 10th keg, everyone is sooted, and the report shows verdict EXPLODED with `kegsExploded` ≥ 10 — screenshot the report.

## Tasks

- [ ] `shared/src/sim/hazards.ts`: `SparkCause`/`FuelMode`/`ChainTier`, the fuel view types, `buildFuelMap`, `fuelAt`, `ringFuel` (importing `HazardsConfig` from `config/types` and the tile helpers from `sim/tiles`) + the six fuel tests in `shared/tests/hazards.test.ts`; append `export * from './sim/hazards';` to `shared/src/index.ts`.
- [ ] `lightFromSpark`, `tileFuseKey`, `pickRingSparkTile`, `expiredFuses` + the eight spark/timing tests.
- [ ] `blastArea`, `knockbackTarget`, `resolveBlast` + a test helper that applies `BlastEffect[]` to a plain grid model, then the eleven blast/propagation tests (finish with the 9 + 6 = 15 case).
- [ ] `advanceChain`, `nearestUndamagedStation`, `explosionAction`, `dangerBeacon`, `isBlastBin`, `choreStatus` + the remaining shared tests. All shared tests green.
- [ ] `game-server/src/sim/hazardsApply.ts`: fuse mirror, effect applier (destroy via `items.destroyItem`, light, scorch via `items.removeSpill` + `scorchTiles`, knockback with `stations.leave`), `damageStation`/`repairStation`, banner set/clear, fx + toast emission, `grooveEvents` and `tally` writes + the mirror/blast/incident server tests.
- [ ] `game-server/src/sim/hazards.ts`: `HazardsState` WeakMap, view builders from schema, `tickHazards(world, dt)` (fuel map → fuse positions/orphans → jam accumulators → chores → expiries + escalations → beacons → banner expiry → mirror), `spark`, `sparkRing`, `hazardsSystem`; append the system to `game-server/src/sim/systems.ts` + the spark/jam/explosion server tests.
- [ ] `tryBeginStomp`, `tryBeginRepair`, `onItemLanded`, `resetHazards`; append `hazards.tryBeginRepair` to F06's `interact` entry and `hazards.tryBeginStomp` to F06's `action` entry in `game-server/src/rooms/handlers.ts` + the chore/bin/reset server tests.
- [ ] Client `HazardsLayer.ts` + `FuseFx.ts` + `BlastFx.ts` (`Fx.override` for `blast`, `whump`, `fuse`, `spark`); append `createHazardsLayer(this)` to `Factory.create()`; verify steps 2–4 in the browser.
- [ ] Client `DangerBeacon.ts` + `RepairSign.ts`; verify steps 1, 5, 6 and attach the screenshots.

## Risks & open questions

- **`pfft` and `chime` renderers.** F10 emits both but overrides neither, so they use F04's default `Fx` handlers. F07 also lists `Fx.override('pfft', …)` in its touches; if its puff reads wrong for a stomp, the fix is one shared handler in F07's override, not a second registration from F10 (the last override wins).
- **Chore cancellation across owners.** A knockback cancels only F10's `stomp`/`repair` chores. If F06's `unjam`/`sweep` hold does not cancel itself when the player is moved or stunned, a knocked-back player would keep an invisible chore; the contracts do not state F06's cancel rule (see *Contract change requested*).
- **`stations.unjam` on damage.** Damaging a jammed station calls F05's `unjam` so `jamUntil` and F05's jam bookkeeping are cleared by their owner. If `unjam` turns out to emit its own fx or toast, the damage moment gets a spurious "unjammed" cue and F05 should split a silent variant — nothing else moves.
- **Held kegs are not fuel** is a reading of doc 16's fuel table (floor, spill, shelf only). If playtests want a blast to light the keg in a bystander's hands, `buildFuelMap` gains one branch and one test; nothing else moves.
- **Knockback vs. soft-collision.** The applier teleports the player 2 tiles; if F03's soft push separates two knocked-back players on the next tick, that is acceptable and needs no handling.
- **Scorch is cosmetic in M1.** The 40 % slow doc 16 also mentions would need a term in `World.tileSpeed` (F03) and is deferred with Sweeping.

**Contract change requested** (edits to `docs/features/00-contracts.md`):

1. §10.4 does not say when an F06 chore (`unjam`, `sweep`) ends. F10 assumes a hold cancels when the player is moved or stunned, because a blast knockback does both and F10 will not write `chore` values it does not own. If F06's holds do not cancel themselves, the contracts need either that rule under §10.4 or an exported `items.cancelChore(world, player)` for F10 to call.

## Waste accounting (contracts v2.2, 2026-09-09)

`damageStation`'s shelf wipe used to bump `tally.destroyed(type, 'blast')`, which is the counter
§9 reads for `kegsExploded` and `fizzles` — so an incident that emptied an output shelf reported
sticks as having fizzled when nothing had. It now calls `tally.scrap(type)`, which feeds the P&L
without touching the hazard lines. `onItemLanded`'s Blast Bin scraps too: a keg the sand eats was
bought and never sold, and leaving it untallied made the bin a way to erase waste.

`applyBlast` is deliberately unchanged. `BlastResult.kegs` is `0 | 1` and `resolveBlast` emits
exactly one `destroyItem` — the keg whose fuse burned down — which `destroyed('keg', 'blast')`
already bills; a chain of four kegs is four separate blasts. An earlier review claimed one bump
per blast regardless of count and it was wrong; the regression test added while checking passed
against unmodified code and was kept.

See `docs/features/F11-day-report-grade.md` for the full split.
