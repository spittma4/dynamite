# F06 — Items, carry, throw, drop table, hauling, jam/unjam, spills
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/items.ts` · `shared/tests/items.test.ts` · `game-server/src/sim/items.ts` · `game-server/src/sim/itemThrow.ts` · `game-server/src/sim/itemDrop.ts` · `game-server/src/sim/chores.ts` · `game-server/tests/items.test.ts` · `resources/js/game/render/Items.ts`
**Touches** (one line each, in another owner's file — contracts §1, §12): `game-server/src/rooms/handlers.ts` (the `interact` and `action` entries) · `game-server/src/sim/systems.ts` (the `itemsSystem` line) · `shared/src/index.ts` (`export * from './sim/items';`) · `resources/js/game/scenes/Factory.ts` (`createItemsLayer(this)` in `Factory.create()`'s mount list)
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/17-oops-carry-and-throw.md` · `docs/02-factory-floor.md` (Physical WIP and the overflow ladder) · `docs/16-hazards-and-explosions.md` (fuel definitions) · `docs/decisions/0012-output-to-hands.md` · `docs/13-config-schema.md` (station block) · `docs/04-minigames.md` (Sweeping, Unjam) · `docs/14-roadmap.md`

## Goal

When this is done every keg, casing, stick and parts bundle on the floor is a real entity everyone can
see: it sits on a shelf, in someone's hands, on a floor tile, on a dock lane, or in the air. A player
walks up to a shelf and presses `E` to take the newest item, walks it anywhere and presses `E` to put
it on a shelf with room or on the floor tile they face. A station's finished product lands in the
operator's hands and auto-shelves if the shelf has room; if not, the operator is visibly holding it.
`Space` throws the carried item two tiles in a half-second arc; a teammate facing the thrower who taps
`E` as it arrives catches it (a *snap* for a Perfect). Anything not caught, anything dropped from a
bump, and anything thrown at someone whose hands are full follows the drop table: kegs roll a tile and
get knocked over into a powder spill, sticks fizzle 30% of the time and soot the nearest player. An
item that lands on a machine's work tile jams it until someone holds the lever for 4 s under a
*WAITING FOR VENDOR SUPPORT* bar. Spills slow everyone until someone takes the broom off its hook and
sweeps them. The pile on the floor is made of things someone chose to put down, and everyone can see it.

## Scope

**In (M1):**
- Item entities (`ItemState`) with ids `k-<n>` / `c-<n>` / `s-<n>` / `p-<n>` (`ITEM_ID_PREFIX`, F02); create and destroy.
- Shelves: push/pull against `inputCap` / `outputCap`, `accepts` filter on input shelves.
- Hands: one item; `carrying` on `PlayerState`; `canDeliver` / `deliverOutput` (hands → auto-shelf, ADR 0012); `giveToPlayer` / `takeCarried` for the station modules (F08 `fetch`, F09 lane staging).
- Floor items: one per tile, `floorCount` per station, the pure tile-speed factor (floor item 0.4, spill 0.6).
- `interact` on the floor: pick up the faced floor item, pull from a faced shelf, put down on a faced shelf with room or on the faced empty floor tile (0.3 s lock).
- Throw (`action` while carrying): 2-tile arc, 0.5 s, flight fields on `ItemState`; catch with ±150 ms OK / ±75 ms Perfect judged through `world.inputClock`; throws never land on shelves.
- Drop table for kegs, sticks and inert items (casing, parts): bump-while-carrying, uncaught throw, hands-full hit, and the station modules' butterfingers hook (`dropItem`).
- Hands-full hit: `copy.bubbles.whoThrewThat` bubble + 0.5 s stagger.
- Jam: item landing or rolling onto a `boom_powder` / `assembly` work tile calls F05 `stations.jam`; Unjam chore (4 s, `chore = 'unjam'`).
- Spill tiles (`FactoryState.spillTiles`) with `addSpill` / `removeSpill` for F07/F08 and F10; sweeping chore with the broom (1.5 s per tile).
- Every landing and every floor put-down is offered to F10 first via `hazards.onItemLanded`; a fizzle always calls `hazards.spark(world, x, y, 'fizzle')`.
- Client: item sprites with the keg quality spectrum, floor and dock-lane items, arc interpolation, carried item over the avatar, the chore progress bar.

**Out (later milestones):**
- Crate items and the RATTLY / burst rules — M2 (`x-<n>` ids are reserved, never created in M1).
- Powder footprints — M2 (`carry.footprints` stays `false`).
- Scorch tiles and sweeping them — M2 (F10 owns `scorchTiles`).
- Hand Truck (carry 3), Conveyor, Bigger Shelf — M4 upgrades.
- Broom whack — open question 17, not planned.
- Blast bins, stomp, fuses, `ItemState.lit` — F10 (F06 hands it every landing through `onItemLanded`).
- The truck ride — F09 `departTruck` (contracts §10.6); F06 only supplies `destroyItem` for the carried item.
- Spill blobs, scorch tiles, beacon poles and the banner on the client — F04 (`render/Floor.ts`, HUD).
- The jam lever glyph — F05 (`render/stationGlyphs.ts`).
- Key-up tracking for holds: chores here are press-to-start, cancelled by movement (see Behaviour § Chores).

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/items.ts` | Pure rules: `FACING_DIRS`, facing test, landing-tile math, catch judgement, delivery branch, shelf acceptance, the drop table (`rollDrop`), the tile-speed factor. No Colyseus, no World; tile helpers come from F02 `tiles.ts`. |
| `shared/tests/items.test.ts` | Vitest for everything above, seeded RNG for the fizzle chance. |
| `game-server/src/sim/items.ts` | The system entry: id counters, create/destroy, shelves, hands, `interact` dispatch, `canDeliver` / `deliverOutput`, `giveToPlayer` / `takeCarried`, `placeOnFloor` / `placeNear`, spills, `tileSpeedFactor`, `releaseCarried`, `tick`, `itemsSystem`. |
| `game-server/src/sim/itemThrow.ts` | Throw start, flight advance, catch judgement in `clock` seconds, landing resolution after the catch window. |
| `game-server/src/sim/itemDrop.ts` | Applies a `DropOutcome` to the world: roll, spill, damp, fizzle (soot, groove event, spark), dents, jam, hands-full hit. |
| `game-server/src/sim/chores.ts` | Unjam and sweep: start, cancel on movement, completion. |
| `game-server/tests/items.test.ts` | World-level tests on F03's `makeWorld`: `deliverOutput` branches, jam-on-landing, bump consumption, chore completion. |
| `resources/js/game/render/Items.ts` | Phaser layer: item sprites (floor, dock lane, flight arc, carried) and the chore progress bar. Reads state only. |

### Interfaces

**Consumes**

From the contracts (§3, §4): `FactoryState.{items, spillTiles, width, height, clock, phase}`,
`PlayerState.{userId,x,y,facing,moving,carrying,chore,choreUntil,stunnedUntil,sooted,bubble,bubbleUntil,stationId,workTile}`,
`StationState.{id,type,state,inputShelf,outputShelf,inputCap,outputCap,floorCount,anchorX,anchorY}`,
all `ItemState` fields; messages `interact { t?: number }`, `action { t: number }`; `fx` kinds
`thunk | snap | clink | fizzle | bonk | pfft` (F07 may `Fx.override` how `thunk`/`clink`/`pfft` render).

From `LevelConfig` (§8, §13): `carry.*`, `movement.floorItemSpeed`, `movement.spillSpeed`,
`hazards.{litKegCarry, unjamSeconds, sweepSecondsPerTile}`, `stations[].{id,type,workTiles,inputShelf,outputShelf}`,
`recipes[].output.type` (the recipe whose `station === cfg.type`). From `LayoutConfig`: `walls`,
`blastBins`, `props.broomHook`. From `Copy` (`@shared`): `copy.chores.unjam`, `copy.chores.sweep`,
`copy.bubbles.whoThrewThat`.

From F03 (`game-server/src/sim/World.ts`, §10.1) — the whole surface F06 uses:

```ts
world.level: LevelConfig;                            // a ScaledLevel after startDay; defaults applied
world.layout: LayoutConfig; world.state: FactoryState;
world.now: number;                                   // getter, === state.clock (seconds)
world.rng.next(): number;                            // seeded, [0, 1)
world.stationConfig(id: string): StationConfig;      // joinMode, workTiles, shelves
world.stations: Map<string, Station>;                // F05 fills it; F06 reads cfg/st/ring
world.tileOf(x, y): Tile; world.packTile(tx, ty): number;   // F02 tiles.ts, never redefined here
world.isWall(tx, ty): boolean; world.isSpill(tx, ty): boolean;
world.playersAt(tx, ty): string[]; world.itemsAt(tx, ty): string[]; world.reindexItems(): void;
world.inputClock(sessionId: string, tMs: number): number;   // clock seconds, clamped [clock − 0.2, clock]
world.tally: RunTally;                               // destroyed('stick','fizzle'), bumpPlayer(userId,'drops')
world.grooveEvents: GrooveEvents;                    // fizzles++
world.fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void;
world.on('bump', (e: BumpEvent) => void): () => void;       // { a, b, mover, x, y, dx, dy }
```

Test worlds come from F03's `game-server/tests/helpers/world.ts` `makeWorld({ level?, layout?, seed?, players? })`.

From F05 (`game-server/src/sim/stations.ts`): `jam(world, stationId): void`, `unjam(world, stationId): void`.
From F10 (`game-server/src/sim/hazards.ts`): `spark(world, x, y, cause: SparkCause): SparkResult` (F06 passes
`'fizzle'` and never rolls a probability) and `onItemLanded(world, itemId, x, y): 'saved' | 'landed'`
(F10 owns the blast-bin test and fuel).
From F04 (`resources/js/game/scenes/Factory.ts`): `scene.avatarPosition(sessionId): { x, y } | null` (px,
predicted for self) and `scene.conn.config.{level, copy}`.

**Produces**

`shared/src/sim/items.ts` (pure; `Tile = [number, number]` and `tileOf` / `packTile` / `tileKey` come from
F02 `shared/src/sim/tiles.ts`):

```ts
export const FACING_DIRS: readonly Tile[];                     // index = PlayerState.facing, 0 = east, clockwise
export function facesTile(facing: number, from: Tile, target: Tile): boolean;  // target's direction from `from` is facing ±1 (mod 8)
export function landingTile(from: Tile, facing: number, throwTiles: number, blocked: (t: Tile) => boolean): Tile | null;
export function judgeCatch(pressMs: number, arrivalMs: number, okMs: number, perfectMs: number): 'perfect' | 'ok' | 'miss';
export function resolveDelivery(shelfLen: number, cap: number, operatorCarrying: string): 'shelf' | 'hands' | null;
export function canShelve(shelfLen: number, cap: number, accepts: readonly ItemType[], itemType: ItemType): boolean;
export type DropContext = {
  blocked(t: Tile): boolean;                 // wall, off-map, shelf tile, blast bin (bin allowed for a lit item)
  occupied(t: Tile): boolean;                // a player stands there or a floor item lies there
  workTileOwner(t: Tile): string | null;     // station id whose workTiles include t, else null
};
export type DropOutcome =
  | { kind: 'keg'; restTile: Tile; knockedOver: boolean; jamStationId: string | null }
  | { kind: 'stick'; restTile: Tile; fizzle: boolean; jamStationId: string | null }
  | { kind: 'inert'; restTile: Tile; jamStationId: string | null };   // casing, parts, (M2) crate
export function rollDrop(itemType: ItemType, origin: Tile, dir: Tile, ctx: DropContext,
                         rng: () => number, cfg: { stickFizzleChance: number; kegKnockOverOnHit: boolean }): DropOutcome;
export function tileSpeedFactor(hasFloorItem: boolean, isSpill: boolean,
                                cfg: { floorItemSpeed: number; spillSpeed: number }): number;
export const BUBBLE_SECONDS = 2;                                // whoThrewThat display time
```

`game-server/src/sim/items.ts` (imported as `items`; contracts §10.4 verbatim):

```ts
export function createItem(world: World, type: ItemType,
  attrs?: Partial<Pick<ItemState, 'quality'|'prime'|'dents'|'fuseLength'|'fill'|'capLoose'|'frayed'|'orderId'>>): ItemState;
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
export function tileSpeedFactor(world: World, t: Tile): number;
export function dropItem(world: World, item: ItemState, origin: Tile, dir: Tile, culpritId: string): DropOutcome;
export function onInteract(world: World, player: PlayerState, tMs?: number): boolean;   // true = consumed
export function onAction(world: World, player: PlayerState, tMs: number): boolean;      // true = threw or started a sweep
export function tick(world: World, dt: number): void;
export const itemsSystem: System;                                    // { name: 'items', init: subscribe world.on('bump'), tick }
```

Messages: no new message names. `fx` emitted (tile centres, `(tx + 0.5, ty + 0.5)`): `thunk` (landing),
`clink` (OK catch, chore end), `snap` (Perfect catch, `text: 'PERFECT'`), `fizzle` (stick fizzle),
`bonk` (refused put-down / refused throw / hands-full hit / bump drop / second unjammer), `pfft` (keg
knocked over, item destroyed with nowhere to go). `StationState.mg`: untouched by F06.

`resources/js/game/render/Items.ts`:

```ts
export function createItemsLayer(scene: Factory): { update(nowMs: number): void; destroy(): void };
```

### Data & config

Config read (`world.level`, defaults already applied by `validateLevelConfig` — F06 never branches on `undefined`):

| Key | Value | Where it is defined | Used for |
|---|---|---|---|
| `carry.throwTiles` | `2` | §8 (required) | throw distance |
| `carry.throwFlightSeconds` | `0.5` | §8 | flight duration |
| `carry.catchOkMs` | `150` | §8 | OK catch window and landing deferral |
| `carry.catchPerfectMs` | `75` | §8 | Perfect catch window |
| `carry.drop.kegKnockOverOnHit` | `true` | §8 | keg knock-over rule (false → keg stops without spilling) |
| `carry.drop.stickFizzleChance` | `0.3` | §8 | fizzle probability |
| `carry.putDownSeconds` | `0.3` | §13 default | movement lock after a floor put-down |
| `carry.hitStaggerSeconds` | `0.5` | §13 default | stagger after a hands-full hit |
| `hazards.unjamSeconds` | `4` | §13 default | Unjam hold |
| `hazards.sweepSecondsPerTile` | `1.5` | §13 default | sweep hold per tile |
| `hazards.litKegCarry` | `true` | §8 | whether `E` may pick up a lit item |
| `movement.floorItemSpeed` | `0.4` | §13 default | pure `tileSpeedFactor` (F03's `world.tileSpeed` is what movement multiplies by) |
| `movement.spillSpeed` | `0.6` | §13 default | pure `tileSpeedFactor` |
| `stations[].inputShelf?` | `{ tile, capacity, accepts: ItemType[] }` | §8 | shelf tile, cap, filter (absent → no input shelf) |
| `stations[].outputShelf?` | `{ tile, capacity }` | §8 | shelf tile, cap (absent → no output shelf) |
| `stations[].workTiles` | per level | §8 | jam tiles, refused put-downs |
| `recipes[].output.type` | `'keg'` / `'stick'` | §8 | what an output shelf accepts back (recipe with `station === cfg.type`) |
| `layout.walls`, `layout.blastBins` | per layout | §8 | blocked tiles for landing and placement |
| `layout.props.broomHook` | `[x, y]` | §8 | the broom's home tile |
| `copy.chores.unjam` / `copy.chores.sweep` | `"WAITING FOR VENDOR SUPPORT"` / `"SWEEPING"` | §8 `Copy` (F12) | chore bar labels |
| `copy.bubbles.whoThrewThat` | joke line | §8 `Copy` (F12) | hands-full-hit bubble |

`StationState.inputCap` / `outputCap` are set by F05 from the same station block (0 when the shelf is
absent — the dock has both at 0); F06 reads the state fields and never the config copy, so an upgrade
patch changes one place. The station's floor ring is `world.stations.get(id)!.ring` (packed tiles, F05).

Schema fields written by F06 (contracts §3 writers): `ItemState.*` (all), `FactoryState.spillTiles`,
`StationState.{inputShelf, outputShelf, floorCount}`, `PlayerState.{carrying, chore('unjam'|'sweep'),
choreUntil, stunnedUntil, sooted, bubble, bubbleUntil}`. F06 never writes `StationState.state`,
`progress`, `jamUntil` (F05 via `jam`/`unjam`), `ItemState.lit` (F10), `groove` or `score` (F11).

Per-world private state (a module-level `WeakMap<World, Store>` in `game-server/src/sim/items.ts`, so
rooms never share it and nothing outlives the room):
`Store = { nextId: Record<ItemType, number>; flights: Map<string, Flight>; chores: Map<string, ChoreTarget>; bumps: BumpEvent[] }`
where `Flight = { itemId, throwerId, from: Tile, throwerTile: Tile, landing: Tile, dir: Tile, startedAt, arrivesAt, resolveAt }`
(all three times in `clock` seconds) and `ChoreTarget = { kind: 'unjam'; stationId: string; tile: Tile } | { kind: 'sweep'; tile: Tile }`.
The floor index is F03's — `world.itemsAt(tx, ty)` — and F06 calls `world.reindexItems()` after any
change to an item's location so later calls inside the same tick see it. The broom is not an item:
`PlayerState.carrying === 'broom'` is the whole model; it is "on the hook" whenever no player carries it.

### Behaviour

**Geometry.** `FACING_DIRS = [E(1,0), SE(1,1), S(0,1), SW(-1,1), W(-1,0), NW(-1,-1), N(0,-1), NE(1,-1)]`
as `[dx, dy]` tuples. A player's tile is `world.tileOf(p.x, p.y)`; the faced tile is that tile plus
`FACING_DIRS[p.facing]`. A tile is *blocked for items* when `world.isWall` is true (walls are the complete
impassable set, contracts §8), it is off the map, it is any station's `inputShelf.tile` / `outputShelf.tile`,
or it is in `layout.blastBins` — except that an item with `lit === true` may land on a bin tile, which is
how hot potato reaches F10.

**Sessions.** `onInteract` / `onAction` receive a `PlayerState` (contracts §10.4). F06 resolves the
sessionId it needs for `inputClock`, `holder`, `playersAt` and `giveToPlayer` with a private helper that
scans `state.players` (≤ 10 entries) for the entry identical to `player`; `tally.bumpPlayer` takes
`player.userId`. F03's handler wrapper has already dropped `interact` / `action` while
`clock < player.stunnedUntil` (§11), so F06 does not re-check the stagger.

**Ids and lifecycle.** `createItem` allocates `k-1, k-2, …` per type per world using F02
`ITEM_ID_PREFIX` (`keg 'k'`, `casing 'c'`, `stick 's'`, `parts 'p'`; `crate 'x'` reserved for M2 and
never created in M1), with schema defaults (`quality 1`, `prime false`, `dents 0`, `fill 0`,
`fuseLength 'long'`, `x = y = -1`, `holder ''`) that `attrs` override, adds it to `state.items` and
returns the schema object. `destroyItem` removes the id from whichever of: a player's `carrying`, a
station's shelf array, a dock lane (`holder` a station id with `x >= 0`), the flight map; then deletes
it from `state.items`, calls `world.reindexItems()` and refreshes `floorCount` for stations whose ring
contained its tile. F10 deletes its own `FuseState`.

**Shelves.** Arrays of ids; `shelfPush` appends when `canShelve(len, cap, accepts, type)`: `len < cap`
and, for `side === 'in'`, `accepts` includes the type; for `side === 'out'`, the type equals the
`output.type` of the recipe whose `station === station.type`. On push: `holder = station.id`,
`shelf = side`, `x = y = -1`. `shelfPull` removes index `index ?? len - 1` and returns the item with
`holder = station.id`, `shelf = ''` (in the machine); the caller (F05's `ctx.consume`, or the pick-up
path below) sets the next holder. Stations pull the index they name — F05 passes
`inputShelf.indexOf(itemId)`; players always take the newest.

**Delivery (ADR 0012).** `canDeliver` is `resolveDelivery(outputShelf.length, outputCap, operator.carrying) !== null`;
F05 checks it before arming a cycle (`ctx.beginCycle`). `deliverOutput`: `'shelf'` → `shelfPush(out)`; `'hands'` →
`giveToPlayer(world, item, operatorId)`; `null` → throw `Error('deliverOutput precondition')` (a caller
bug, never a game state). F05's `ctx.complete` is `createItem` + `deliverOutput` and maps `'shelf'` to
its own `'shelved'`.

**Hands.** `giveToPlayer` returns false when the target already carries something; on success
`holder = sessionId`, `carrying = item.id`, `x = y = -1`. `takeCarried` clears `carrying`, sets
`holder = ''`, `x = y = -1` and returns the item (null when hands are empty) — F09 stages lane sticks
with it, F08 hands over `parts`.

**Floor.** `placeOnFloor` succeeds only when the tile is not blocked, holds no floor item and no player
stands on it (`world.playersAt(t)` empty); it sets `x, y = t`, `holder = ''`, `shelf = ''`,
`inFlight = false`, calls `world.reindexItems()`, refreshes `floorCount` (floor items whose packed tile
is in that station's `ring`), then offers the tile to F10 with `hazards.onItemLanded(world, item.id, x, y)`
— `'saved'` means F10 consumed the item (blast bin, contained WHUMP) and the caller stops.
`placeNear` is `placeOnFloor` at `t`, else the same ring search the drop table uses (radius 1 then 2,
in `FACING_DIRS` order); false when nothing within 2 is free. `tileSpeedFactor(world, t)` returns
`tileSpeedFactor(hasFloorItem, isSpill, level.movement)` — `0.4` on a floor item, `0.6` on a spill,
the lower of the two on both, `1` otherwise; movement itself multiplies by F03's `world.tileSpeed`,
which computes the same value.

**`interact` dispatch.** `handlers.ts` calls `items.onInteract(world, player, t?)` first; `false` lets
`stations.onInteract` and then F10's `tryBeginRepair` try (§11). `p` = the player, `F` = the faced tile,
`now` = `world.now`:

0. `p.stationId !== ''` and `world.stationConfig(p.stationId).joinMode === 'stand'` (the dock) → only
   rule 2 applies; anything else returns `false` so the station module gets the press regardless of
   `carrying` (§11).
1. `p.chore !== ''` → consumed, nothing (a chore ignores extra presses).
2. **Catch.** If some flight `f` has `landing === tileOf(p)`, the presser is not `f.throwerId`,
   `facesTile(p.facing, tileOf(p), f.throwerTile)` and
   `judgeCatch(pressMs, f.arrivesAt · 1000, catchOkMs, catchPerfectMs) !== 'miss'` where
   `pressMs = world.inputClock(sessionId, tMs ?? now · 1000) · 1000` — then if `p.carrying === ''`:
   `giveToPlayer`, `inFlight = false`, delete the flight, `fx snap { text: 'PERFECT' }` for perfect or
   `fx clink` for ok at the landing tile. If `p.carrying !== ''`: **hands-full hit** — resolve the
   flight now with `p` as the obstacle (below). Consumed either way.
3. **Carrying (not the broom).** `F` is a shelf tile → `shelfPush` on that station's side; full or wrong
   type → `fx bonk` at `F`, item stays in hands. `F` is a work tile or blocked → return `false`. `F` is
   a floor tile with a floor item or a player on it → `fx bonk`, consumed. `F` is an empty floor tile →
   `placeOnFloor`, `carrying = ''`, `stunnedUntil = max(stunnedUntil, now + carry.putDownSeconds)`. Consumed.
4. **Carrying the broom.** `F` is `layout.props.broomHook` → `carrying = ''`, consumed. Anything else → `false`.
5. **Hands free.** `F` has a floor item → pick up (`giveToPlayer`, `world.reindexItems()`, `floorCount`
   updated); an item with `lit === true` is allowed only when `hazards.litKegCarry` (else `fx bonk`).
   Else `F` is a shelf tile with items → `shelfPull(last)` into hands. Else `F` is `layout.props.broomHook`
   and no player carries the broom → `carrying = 'broom'`. Else `F` belongs to a station (work, rack or
   shelf tile) whose `state === 'jammed'` and no other player has an unjam chore on it → start **Unjam**
   (`chore = 'unjam'`, `choreUntil = now + hazards.unjamSeconds`, target stored). Else return `false`.

Rules 3–5 apply whether or not `p.stationId` is set at a `press` station: an operator holding output at
the work tile can put it on the faced floor tile or shelf without leaving. Because a pick-up on a jammed
work tile wins over the lever (rule 5 order), clearing the item and then unjamming is two presses, which
is the intended sequence.

**`action` dispatch.** `items.onAction(world, player, t)` runs first; `false` lets
`hazards.tryBeginStomp` and then F05's `stations.onMg` fallback try (§11). Carrying an item and
`chore === ''` → **throw**; carrying the broom and standing on a spill tile → **sweep** (below);
otherwise `false`. An overlay sends `action` instead of `mg` while `carrying !== ''` (a station won't
take input with full hands, ADR 0012), so the operator's `Space` throws.

**Throw.** `from = tileOf(p)`, `dir = FACING_DIRS[p.facing]`,
`L = landingTile(from, p.facing, carry.throwTiles, blocked)`: the far tile `from + 2·dir` if not blocked,
else the near tile `from + dir` if not blocked, else `null` → `fx bonk` at `from`, item stays in hands.
Diagonal facings throw `(±2, ±2)`. With `L`: `takeCarried`, `inFlight = true`, `flightT = 0`,
`fromX/fromY = p.x/p.y`, `toX/toY = L` centre, `x/y = from`; flight record `{ startedAt = now,
arrivesAt = now + carry.throwFlightSeconds, resolveAt = arrivesAt + catchOkMs / 1000 }`. No drop is
counted yet (only on an uncaught landing). Each tick `flightT = min(1, (now − startedAt) / throwFlightSeconds)`
and `x/y = lerp(from, L, flightT)`. Nothing collides mid-arc, and the loop tolerates an item removed
mid-flight (F10 blast, F09 truck): a flight whose id is gone from `state.items` is dropped silently.

**Landing (uncaught).** At `now >= resolveAt` with the flight still present: `inFlight = false`,
`tally.bumpPlayer(thrower.userId, 'drops')`, the player standing on `L` (if any) is the obstacle, and the
**drop table** runs at `origin = L` with `dir`. If that player's hands were full (they pressed nothing,
or pressed with full hands in rule 2): `bubble = copy.bubbles.whoThrewThat`,
`bubbleUntil = now + BUBBLE_SECONDS`, `stunnedUntil = max(stunnedUntil, now + carry.hitStaggerSeconds)`,
`fx bonk` at `L`. Landing on a blast-bin tile is reachable only for a lit item; the bin itself is F10's
call inside `onItemLanded`, which every placement goes through.

**Drop table** (`rollDrop`, pure; `applyDrop` in `itemDrop.ts` writes the world):
- **Keg.** `next = origin + dir`. If `kegKnockOverOnHit` and (`blocked(next)` or `occupied(next)` or a
  player stands on `origin`) → `knockedOver` at `restTile = origin`; else `restTile = next`. Apply:
  `placeOnFloor(restTile)`; knocked over → `addSpill(restTile)`, `quality = max(0.4, quality − 0.3)`,
  `prime = false`, `fx pfft`; else `fx thunk`. `jamStationId = workTileOwner(restTile)` when that
  station's type is `boom_powder` or `assembly`.
- **Stick.** `fizzle = rng() < carry.drop.stickFizzleChance`. Fizzle: `fx fizzle` at `origin`, the
  nearest player (Euclidean from the tile centre, first in `state.players` insertion order on ties) gets
  `sooted = true`, `world.grooveEvents.fizzles++` (F11 applies `groove.weights.fizzle`),
  `world.tally.destroyed('stick', 'fizzle')`, `destroyItem`, then `hazards.spark(world, origin.x, origin.y, 'fizzle')`
  — always, no roll; F10 decides whether the tile has fuel. No fizzle: `dents += 1`, `placeOnFloor(origin)`,
  `fx thunk`. `jamStationId` as for kegs, using `origin`, only when the stick survived.
- **Inert** (casing, parts): `placeOnFloor(origin)`, `fx thunk`, jam check.
- `restTile` occupied by a floor item (only possible for `origin`, since `next` is checked): `placeNear`
  puts it on the nearest free unblocked tile (radius 1, then 2, in `FACING_DIRS` order); nothing free
  within 2 → destroyed with `fx pfft`. Decided, not deferred: two floor items never share a tile.
- After placement, `jamStationId !== null` → `stations.jam(world, jamStationId)` and every player whose
  `stationId === jamStationId` gets the `whoThrewThat` bubble (no stagger). The item stays on the work
  tile as a floor item.

**Bumps.** `itemsSystem.init` subscribes `world.on('bump')` and buffers the events; `items.tick` drains
the buffer (movement emits them earlier in the same tick, §11). For each event whose `mover` carries an
item id: `dir = mover === e.a ? [e.dx, e.dy] : [-e.dx, -e.dy]` (`[0, 0]` → `FACING_DIRS[facing]`),
`dropItem(world, item, tileOf(mover), dir, mover)`, `tally.bumpPlayer(userId, 'drops')`, `fx bonk`.
Broom carriers never drop.

**`dropItem`** (also the station modules' butterfingers hook — F08's crimp): removes the item from the
culprit's hands (or from the station when `holder` is a station id), runs the drop table at
`origin` / `dir`, returns the outcome.

**`releaseCarried`** (called on disconnect before `stations.onPlayerLeft`, §11): the broom →
`carrying = ''`; an item → the player's own tile (their feet are the one occupancy this placement
ignores, since the room removes them a line later), else `placeNear`, else `destroyItem`. No spill, no
fizzle, no tally — a disconnect is not an oops.

**Chores** (`chores.ts`). Press-to-start; a chore is cancelled (`chore = ''`, `choreUntil = 0`, target
deleted, no fx) when `p.moving` is true, `tileOf(p)` differs from the start tile, `stunnedUntil > now`,
or (unjam) the station is no longer `'jammed'`. Completion at `now >= choreUntil`: **unjam** →
`stations.unjam(world, stationId)`, `fx clink` at the lever tile; **sweep** → `removeSpill(tile)`,
`fx clink`. Sweep starts on `action` while carrying the broom and `isSpill(tileOf(p))`: `chore = 'sweep'`,
`choreUntil = now + hazards.sweepSecondsPerTile`; each tile needs its own press. F10's `'stomp'` and
`'repair'` chores are untouched by this module (they share the client bar). Only one unjammer per station
("nobody can help"); a second starter gets `fx bonk`.

**Spills.** `addSpill` pushes `world.packTile(t)` if absent and the tile is not blocked; `removeSpill`
splices it. F07 calls `addSpill` for the Slammer's 4th press, F08 for the Jig's over-pour; F10 reads
spills as fuel and converts them to scorch in M2.

**Tick order inside `items.tick(world, dt)`** (the system runs after `stations` and before `hazards`,
§11): bumps → flights (advance, resolve) → chores (cancel, complete) → `floorCount` refresh for stations
touched this tick.

**Client** (`render/Items.ts`, state-driven, never decides an outcome):
- One sprite per `ItemState` from `items.onAdd` / `onRemove`. Keg texture by quality: `quality <= 0.4`
  grey/deflated, `0.7` with a steam puff, `1.0 && !prime` normal, `prime` glowing (additive tint pulse).
  Stick shows `dents` as up to 3 crack marks; casing and parts plain.
- Drawn at its tile centre `((x + 0.5), (y + 0.5)) × 32` whenever `x >= 0 && !inFlight` — floor items and
  staged dock-lane items (`holder = 'dock-a'`, `shelf = ''`) alike — at a depth below avatars. Hidden when
  `x === -1` and `holder` is a station id (shelved: F05's station renderer draws shelf contents). Held
  (`holder` is a key in `state.players`): drawn at `scene.avatarPosition(holder)` offset `(0, −20)` px,
  depth above the avatar; `carrying === 'broom'` draws the broom sprite the same way.
- In flight: when `inFlight` flips true the layer records `localStart = nowMs`; each frame
  `t = clamp(max(flightT, (nowMs − localStart) / (throwFlightSeconds · 1000)), 0, 1)`, position
  `lerp(from, to, t) × 32` and lift `sin(π t) × 20` px (client-only cosmetic); a shadow sprite stays on
  the ground path.
- Chore bar: for players with `chore !== ''`, a 28 × 4 px bar above the avatar; `start` recorded locally
  when `chore` changes from `''`; fill `= (nowMs − start) / (choreUntil · 1000 − start)` clamped, label
  `scene.conn.config.copy.chores[chore]` (F10's `stomp` and `repair` use the same bar and the same block).
- Spill blobs, scorch tiles, beacon poles and the banner are F04's `Floor.ts` / HUD; the jam lever glyph
  is F05's `stationGlyphs.ts`.

## Acceptance criteria

- [ ] A keg produced at Powder with an output shelf below `outputCap` appears in `outputShelf` on the same tick with `holder = 'powder-a'`, `shelf = 'out'`, `x = y = -1`.
- [ ] With the output shelf at `outputCap`, the next keg appears with `holder = <operator sessionId>` and the operator's `carrying` set; `canDeliver` returns false while they hold it.
- [ ] Facing a shelf with items and pressing `E` with free hands takes the newest item (last array element) into hands.
- [ ] Facing an empty floor tile and pressing `E` while carrying places the item on that tile, sets `carrying = ''`, and locks movement for `carry.putDownSeconds`.
- [ ] Facing a full shelf and pressing `E` while carrying leaves the item in hands and emits `fx bonk`.
- [ ] Pressing `E` while carrying and facing a work tile does not place the item (F06 returns false); at a `stand` station F06 returns false for every press except a catch.
- [ ] `tileSpeedFactor` reports 0.4 on a tile with a floor item, 0.6 on a spill tile and 1 on a clean tile.
- [ ] `Space` while carrying puts the item in flight with `toX/toY` two tiles away in the facing direction; it lands one tile short when the far tile is a wall or shelf; it is refused with `fx bonk` when both are blocked.
- [ ] A player on the landing tile facing the thrower who presses `E` within ±150 ms of `arrivesAt` (judged on `world.inputClock`) holds the item; within ±75 ms the server emits `fx snap` with `text: 'PERFECT'`, otherwise `fx clink`.
- [ ] A player on the landing tile with full hands gets `bubble = copy.bubbles.whoThrewThat` for 2 s and `stunnedUntil` `carry.hitStaggerSeconds` ahead, and the thrown item follows the drop table.
- [ ] An uncaught keg thrown down an open aisle comes to rest one tile beyond the landing tile with `fx thunk`, and `tally.bumpPlayer(thrower, 'drops')` is bumped once.
- [ ] An uncaught keg whose next tile is a wall, a shelf, a floor item, or a player stops on the landing tile, that tile joins `spillTiles`, quality drops by 0.3 (never below 0.4), `prime` clears, and `fx pfft` fires.
- [ ] Over 1000 seeded stick drops, between 270 and 330 fizzle; each fizzle destroys the stick, soots the nearest player, increments `grooveEvents.fizzles` and `tally.destroyed('stick','fizzle')`, and calls `hazards.spark` with cause `'fizzle'`.
- [ ] A stick that does not fizzle lands with `dents` increased by 1.
- [ ] Every landing and every floor put-down calls `hazards.onItemLanded(world, itemId, x, y)`; a `'saved'` return leaves no item on the floor.
- [ ] A bump event whose mover carries an item drops it at the mover's tile in the bump direction; a mover carrying the broom drops nothing.
- [ ] An item landing or rolling onto a `boom_powder` or `assembly` work tile calls `stations.jam` for that station and bubbles its workers; landing on a `dock` work tile does not.
- [ ] Facing a jammed station's tile and pressing `E` starts `chore = 'unjam'` with `choreUntil = now + hazards.unjamSeconds`; walking away cancels it; staying the full hold calls `stations.unjam` and emits `fx clink`.
- [ ] Facing the broom hook (`layout.props.broomHook`) and pressing `E` sets `carrying = 'broom'`; `Space` on a spill tile starts `chore = 'sweep'` for `hazards.sweepSecondsPerTile`, after which that index leaves `spillTiles`.
- [ ] `createItem(world, 'parts')` yields `p-1` and the drop table treats it as `inert`.
- [ ] `giveToPlayer` refuses a player whose hands are full; `takeCarried` returns the item with `holder = ''`, `x = y = -1`; `placeNear` falls back to a ring search when the target tile is taken.
- [ ] A player who disconnects while carrying leaves the item on their tile with no spill and no tally change.
- [ ] Two floor items never share a tile; a placement onto an occupied tile is refused or relocated by ring search.
- [ ] Client: floor items render at their tile, a stick staged on a dock lane (`holder = 'dock-a'`, `x >= 0`) renders at the lane tile, in-flight items follow a rising arc from `fromX/Y` to `toX/Y`, a carried item renders above its carrier's avatar, and a player in a chore shows a filling bar labelled from `copy.chores`.

## Test plan

**Unit — `shared/tests/items.test.ts`** (vitest, `mulberry32(seed)` RNG in the test file):

- `FACING_DIRS`: "it maps all eight facings to unit steps starting east and going clockwise".
- `facesTile`: "it accepts a target within one facing step of the player's facing" · "it rejects a target behind the player".
- `landingTile`: "it lands two tiles along the facing direction" · "it lands two tiles diagonally for odd facings" · "it lands on the near tile when the far tile is blocked" · "it returns null when both tiles are blocked".
- `judgeCatch`: "it judges a press within 75 ms as perfect" · "it judges a press within 150 ms as ok" · "it judges an early press outside 150 ms as a miss" · "it judges a late press outside 150 ms as a miss".
- `resolveDelivery`: "it shelves when the shelf has room" · "it hands over when the shelf is full and the operator is empty-handed" · "it returns null when the shelf is full and the operator is carrying".
- `canShelve`: "it refuses a push at capacity" · "it refuses a type the input shelf does not accept" · "it accepts an allowed type below capacity".
- `rollDrop` keg: "a keg rolls one tile when the next tile is clear" · "a keg is knocked over when the next tile is blocked" · "a keg is knocked over when the next tile is occupied" · "a keg is knocked over when a player stands on the origin" · "a keg that rolls onto a work tile reports the station id" · "a keg stops without knocking over when kegKnockOverOnHit is false".
- `rollDrop` stick: "a stick fizzles 30% of the time under a seeded rng" (1000 rolls, 270–330) · "a stick that does not fizzle rests on the origin" · "a fizzled stick reports no jam".
- `rollDrop` inert: "a casing rests on the origin and reports a work-tile owner" · "a parts bundle is inert".
- `tileSpeedFactor`: "a floor item slows the tile to 0.4" · "a spill slows the tile to 0.6" · "a tile with both takes the lower factor" · "a clean tile is 1".

**Unit — `game-server/tests/items.test.ts`** (F03's `makeWorld({ players: 2 })`; `vi.mock` on
`../src/sim/stations` for `jam`/`unjam` and on `../src/sim/hazards` for `spark`/`onItemLanded`):

- "it allocates k-1, k-2 then s-1 and p-1 per world".
- "deliverOutput shelves when the output shelf has room" · "deliverOutput hands over when the shelf is full" · "deliverOutput throws when neither shelf nor hands can take it".
- "giveToPlayer refuses full hands and takeCarried empties them" · "placeNear ring-searches around an occupied tile".
- "a landing on an assembly work tile calls stations.jam once" · "a landing on a dock work tile does not jam".
- "every floor placement calls hazards.onItemLanded and a 'saved' return leaves no floor item".
- "a bump by a carrying mover applies the drop table and bumps the player's drops tally".
- "a hands-full catcher gets the whoThrewThat bubble and the stagger".
- "a catch is judged through world.inputClock" (offset client `t`, still perfect).
- "a fizzle bumps grooveEvents.fizzles, tally.destroyed and sparks with cause 'fizzle'".
- "an unjam chore completes after hazards.unjamSeconds and calls stations.unjam" · "an unjam chore cancels when the player moves".
- "a sweep chore removes the spill index after hazards.sweepSecondsPerTile".
- "releaseCarried places the item without a spill".
- "quality never drops below 0.4 after two knock-overs".
- "a flight whose item is destroyed mid-air resolves without throwing".

**In-app verification** (two browsers, Level 1, `DEV_ALLOW_NO_TICKET=1`, debug overlay on):

1. Run the Slammer until the shelf reads 6/6; screenshot the operator holding the seventh keg (carried sprite over the avatar).
2. Press `E` facing an aisle tile: keg on the floor, overlay shows the tile speed 0.4 when walking over it; screenshot.
3. Throw a keg down the aisle to browser B standing two tiles away facing A: B taps `E` on arrival; screenshot the `PERFECT` snap text. Repeat with B carrying: screenshot the whoThrewThat bubble.
4. Throw a keg at a wall: screenshot the spill blob (F04's layer) and the steaming (damp) keg; walk over the spill and confirm the debug speed reads 0.6.
5. Drop sticks (throw at nothing) until one fizzles: screenshot the soot puff and the groove bar moving after F11's tick.
6. Throw a keg onto the Jig's work tile: screenshot F05's lever glyph; hold `E` on the lever; screenshot the *WAITING FOR VENDOR SUPPORT* bar at ~50%; confirm the station resumes.
7. Take the broom, stand on the spill, press `Space`: screenshot the *SWEEPING* bar; confirm the blob disappears.

## Tasks

- [ ] `shared/src/sim/items.ts`: `FACING_DIRS`, `facesTile` (F02 `Tile`/`tileOf` imported, never redefined) + tests.
- [ ] `shared/src/sim/items.ts`: `landingTile`, `judgeCatch` + tests.
- [ ] `shared/src/sim/items.ts`: `resolveDelivery`, `canShelve`, `tileSpeedFactor` + tests.
- [ ] `shared/src/sim/items.ts`: `rollDrop` for keg, stick and inert + seeded tests; append `export * from './sim/items';` to `shared/src/index.ts`.
- [ ] `game-server/src/sim/items.ts`: store, `createItem` (incl. `parts`), `destroyItem`, `floorItemAt`, `placeOnFloor`, `placeNear`, `floorCount` refresh + id and ring-search tests.
- [ ] `game-server/src/sim/items.ts`: `shelfPush`, `shelfPull`, `canDeliver`, `deliverOutput`, `giveToPlayer`, `takeCarried` + the delivery and hands tests.
- [ ] `game-server/src/sim/items.ts`: `addSpill`, `removeSpill`, `isSpill`, `tileSpeedFactor(world, t)` + spill test.
- [ ] `game-server/src/sim/items.ts`: `onInteract` rules 0 and 3–5 (stand-station bail-out, put-down, pick-up, shelf pull, broom, lever) and the `interact` entry in `handlers.ts` + tests for the put-down lock and the refused shelf.
- [ ] `game-server/src/sim/itemThrow.ts`: `startThrow`, flight advance, the catch branch (rule 2, `world.inputClock`), landing resolution through `hazards.onItemLanded` + catch tests.
- [ ] `game-server/src/sim/itemDrop.ts`: `applyDrop` (spill, damp, fizzle, dents, ring search, jam, bubbles) and `dropItem` + jam/dock and fizzle tests.
- [ ] `game-server/src/sim/items.ts`: `itemsSystem` (bump subscription in `init`, tick order), its line in `game-server/src/sim/systems.ts`, and `releaseCarried` + bump and disconnect tests.
- [ ] `game-server/src/sim/chores.ts`: unjam and sweep start/cancel/complete, the `onAction` throw/sweep branch and the `action` entry in `handlers.ts` + the three chore tests.
- [ ] `resources/js/game/render/Items.ts`: sprite lifecycle, quality textures, floor/lane/held placement, and the `createItemsLayer(this)` line in `Factory.create()`.
- [ ] `resources/js/game/render/Items.ts`: flight arc and the chore bar.
- [ ] Run the in-app verification steps and attach screenshots; tick the status boxes.

## Risks & open questions

- **Hold vs press-to-start.** Docs say "hold `E` 4 s"; the contracts define key-up only for the dock's
  `tailgate` op, so Unjam and sweep stay press-to-start, cancel-on-move. If a key-up message is ever
  added, both chores adopt it and the cancel rule becomes "released or moved".
- **The put-down lock is also an input lock.** `carry.putDownSeconds` is written to `stunnedUntil`, and
  F03's handler wrapper drops `interact`/`action` while `clock < stunnedUntil` (§11), so the 0.3 s after
  a put-down eats a fast second press. Intended (it is the "commit to the pile" beat), but worth watching
  in playtest before shrinking the value.
- **Catch on a WAN.** `world.inputClock` clamps a press to `[clock − 0.2, clock]`, so a client more than
  200 ms behind has its catch judged at `clock` and loses the early half of the OK window. Nothing F06
  can widen without changing `MAX_INPUT_BACKDATE_S` (F02).
- **Lane tiles are not floor tiles.** A staged dock-lane stick has `holder = 'dock-a'` and `x >= 0`, so
  F06's occupancy test (floor items only) lets a thrown item land on the same tile. See the contract note
  below.
- **`floorCount` writes** are F06's because F06 owns floor items; F05 must not recompute it (contracts §3
  lists it under both — see below).

**Contract change requested** (to `00-contracts.md`) — only what contracts v2 does not yet cover:

1. §3 "Writers by field group" lists `StationState.floorCount` under both F05 and F06. F06 writes it
   (§10.4 gives items the floor accounting); drop it from the F05 line.
2. §10.4 keeps `items.tileSpeedFactor(world, t)` while §10.1 gives `World.tileSpeed(tx, ty)` the same job
   and §2 makes movement use the latter. Either name the caller of `items.tileSpeedFactor` or delete it
   so F06 ships no export nobody calls.
3. §10.4 gives `onInteract`/`onAction` a `PlayerState` but every use of `inputClock`, `holder`,
   `playersAt` and `giveToPlayer` needs the sessionId; §10.3 offers `sessionIdOf` only on `StationCtx`.
   Add `World.sessionIdOf(player: PlayerState): string` (or pass the sessionId to the two entry points);
   until then F06 scans `state.players`.
4. §10.7 assigns the `sooted` player tally to F10, but F06's fizzle is the other way a player gets sooted;
   say whether F06 also bumps `tally.bumpPlayer(userId, 'sooted')` or the report deliberately counts blast
   soot only.
5. §3 says "two floor items never share a tile" but a staged dock-lane item is not a floor item; say
   whether a dock lane tile is blocked for landings and put-downs (F06 would add it to `blocked`) or
   whether an item may land on top of a staged stick.
