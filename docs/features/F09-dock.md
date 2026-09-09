# F09 — The Dock (Shipping)
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/orders.ts` · `shared/src/sim/dock.ts` · `shared/tests/orders.test.ts` · `shared/tests/dock.test.ts` · `game-server/src/sim/orders.ts` · `game-server/src/sim/minigames/dock.ts` · `game-server/tests/dock.test.ts` · `resources/js/game/minigames/Dock.ts` · `resources/js/game/minigames/dock/TruckSprite.ts` · `resources/js/game/minigames/dock/BayWall.ts`
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/04-minigames.md` (The Dock) · `docs/03-stations.md` (Shipping) · `docs/06-orders-quality-rework.md` (Orders) · `docs/18-days-grades-and-payday.md` (The day) · `docs/13-config-schema.md` (orders, dock, economy keys) · `docs/05-flow-mechanics.md` (Groove, accounting) · `docs/17-oops-carry-and-throw.md` (the truck ride) · `docs/19-scaling-3-to-10.md` (cadence by breakpoint) · `docs/14-roadmap.md`

## Goal

A truck backs up to the dock door 20 s into the shift and every 60 s after that, waits 20 s with its
reversing alarm beeping once a second and the bay light strobing on each beep, and leaves regardless.
A player walks a stick onto one of the four ramp lanes, presses `E` to set it down, and taps `Space`
on a beep to shove it in: a clean shove THUDs and the truck sags on its springs, a sloppy one scrapes
in, a miss stalls the stick halfway and blocks that lane until the next beep. When the last slot
fills, a 3 s window opens in which anyone on the ramp can hold `E` for half a second to SLAM the
tailgate — horn twice, the truck leaves now. Every truck is one order from the day's book with its
own fuse length; a full truck completes the order and feeds the Groove integrator, a partial truck
dumps whatever was still on the ramp onto the Returns pile, and anyone standing in the truck bay when
it pulls out gets a ride to the highway. When the book empties, `bookRemaining` hits 0 and F03 ends
the day. From across the floor you can read the countdown on the bay wall, the strobe, the
silhouettes filling on the truck bed, and the horn.

## Scope

**In (M1):**
- The order book for the day: one `OrderState` per truck, `red_stick` only, `qty` = 8 ramping to 13
  over the shift, a per-order `fuseLength`, `bookTotal`/`bookRemaining` on `FactoryState`.
- Truck cadence and phases (`away` → `docked` → `leaving` → `away`) on `FactoryState.clock`;
  `TruckState` written every tick.
- The four ramp lanes as the dock's work tiles (`joinMode: 'stand'`): set a stick (`E`), shove on the
  beep (`Space`), stall on a miss, pick an unshoved stick back up, refuse the wrong fuse length.
- Server-judged shove windows (Perfect ±70 ms, OK ±180 ms) against `world.inputClock`.
- Departure: per-stick + per-order credit in the toast only, `grooveEvents.trucksComplete++` on a full
  truck, horn, partial trucks send laned sticks to the Returns pile via `items.placeNear`.
- Tailgate Slam: 3 s window on the filling shove, 0.5 s `E` hold, SLAM + horn ×2 + `TAILGATE` banner,
  truck leaves now.
- The truck ride: every player standing in `layout.truckBay` at departure is driven off and walks back
  in at the break-room door.
- Sandbox (`day.endsOn === 'never'`): no book, orders created lazily, trucks keep arriving, the dock
  never ends the day.
- Day end: the book emptying leaves `bookRemaining === 0` for F03's end check; the clock ending the
  shift runs `closeShift` from the dock System's `onDayEnd`.
- Client: overlay (beep row pulsing from `serverClock()`, keys legend, lane status) plus a per-viewer
  `StationView` holding the in-world truck sprite with slot silhouettes and slot lamps, the bay-wall
  countdown, the bay-light strobe and the Returns pile label.

**Out (later milestones):**
- Crates on the truck, Lane = Slot, the RATTLY-crate OK window, Clean Load (+2 Groove) — M2 (the
  `rattlyOkMs` and `laneIsSlot` keys are not accepted by the M1 schema).
- Returns being *reopened* (haul back to Packing), Hotfix returns landing on the pile — M2.
- Groove score multipliers (×1.25 / ×1.5) — M2.
- Weighted product mix, multi-line orders, tolerances, Rush Orders, ambiguous orders — M2/M3.
- Two-line breakpoint (6 lanes, truck every 45 s, one truck per line) — M2; M1 has one `TruckState`.
- `FactoryState.score` and `FactoryState.groove`: F11 owns both. The dock's credit is a toast number
  and its full truck is a `grooveEvents.trucksComplete` impulse.
- The level tuning that makes the book finishable inside a shift — F12.

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/orders.ts` (create) | Pure order-book math: truck schedule, ramped qty, per-order spec incl. fuse length, order status, departure credit. |
| `shared/tests/orders.test.ts` (create) | Vitest for the above. |
| `shared/src/sim/dock.ts` (create) | Pure dock helpers: beep index/phase, shove judgement, tailgate window end, lane lookup, `DockMg` type + parser. |
| `shared/tests/dock.test.ts` (create) | Vitest for the above. |
| `game-server/src/sim/orders.ts` (create) | World-mutating order book: `initOrders`, `activeOrderId`, `settleOrder`. |
| `game-server/src/sim/minigames/dock.ts` (replaces F05's stub body) | `dockModule` (the `MinigameModule` for `StationType 'dock'`), `dockTick` (cadence, holds, `beepPhase`, `mg`), `departTruck`, `closeShift`, `dockSystem`. |
| `game-server/tests/dock.test.ts` (create) | Server behaviour tests on F03's `makeWorld()` with a scripted clock. |
| `resources/js/game/minigames/Dock.ts` (create) | `dockOverlay: OverlayFactory` (beep row, lane chips, legend, keys) and `dockStationView: () => StationView` (owns the two objects below). |
| `resources/js/game/minigames/dock/TruckSprite.ts` (create) | In-world truck on `layout.truckBay`: bed with `slots` silhouettes filled per `loaded`, lamps per `hits`, spring sag, drive-in/drive-out tween. |
| `resources/js/game/minigames/dock/BayWall.ts` (create) | Countdown text on the bay wall, bay-light strobe on the beep, `SLAM IT` flash during the tailgate window, `RETURNS` label with the pile count. |
| `shared/src/index.ts` (touch, F02-owned, two lines) | `export * from './sim/orders';` and `export * from './sim/dock';`. |
| `game-server/src/sim/systems.ts` (touch, F03-owned, one line) | `dockSystem` between `hazardsSystem` and `grooveSystem`. |
| `resources/js/game/minigames/index.ts` (touch, F04-owned, two lines) | `minigames.dock = dockOverlay` and `stationViews.dock = dockStationView`. |

### Interfaces

**Consumes** — every name below is fixed by `00-contracts.md` v2.

From the contracts' shared surface (§3, §4, §7, §8): `FactoryState` (`clock`, `phase`, `groove`,
`bookTotal`, `bookRemaining`, `orders`, `items`, `truck`, `banner`, `bannerUntil`), `StationState`
(`id`, `type`, `state`, `progress`, `mg`), `TruckState`, `OrderState` (incl. `fuseLength`),
`ItemState`, `PlayerState` (`x`, `y`, `carrying`, `drivenOffUntil`, `stationId`, `workTile`, `bubble`,
`bubbleUntil`), the `mg` message `{ stationId, op, t, v? }`, the `fx`/`toast` server messages,
`LevelConfig.{orders, day, economy, scoring, carry, stations[].minigame, stations[].workTiles}`,
`LayoutConfig.{ramp, dockDoor, truckBay, breakRoom, props.returnsPile}`, `Copy.bubbles.sawTheHighway`,
F02 `tileOf`/`Tile`/`FuseLength`/`ITEM_ID_PREFIX`.

| Owner | Name | Signature | Used for |
|---|---|---|---|
| F03 `World` (§10.1) | `world.state` · `world.level` · `world.layout` | `FactoryState` · `ScaledLevel` · `LayoutConfig` | everything; `level.day.orderBook` and `level.orders.everySeconds` are the scaled values |
| F03 `World` | `world.now` | `number` (getter, `= state.clock`) | the one time base |
| F03 `World` | `world.inputClock(sessionId, tMs)` | `(string, number) => number` — clock seconds, clamped to `[clock − 0.2, clock]` | shove judgement |
| F03 `World` | `world.fx(kind, x, y, extra?)` · `world.toast(to, text, kind)` | positional; outboxes `FactoryRoom` drains | THUD / scrape / STALL / HONK / SLAM, departure toasts |
| F03 `World` | `world.rng.next()` | `() => number` | per-order fuse length |
| F03 `World` | `world.stations` · `world.tileOf(x, y)` · `world.tally.bumpPlayer(userId, key)` · `world.grooveEvents` | `Map<string, Station>` · `Tile` · `void` · `GrooveEvents` | the dock station, truck-bay test, `truckRides`, `trucksComplete` |
| F03 systems (§11) | `System` · `SYSTEMS` | `{ name, init?, onStart?, tick?, onDayEnd? }` | `dockSystem` appended after `hazardsSystem` |
| F03 tests | `makeWorld({ level?, layout?, seed?, players? })` | `game-server/tests/helpers/world.ts` | every server test |
| F05 (§10.3) | `MinigameModule` · `MinigameInstance` · `StationCtx` · `Station` | see §10.3 | `dockModule` implements them; join mode comes from `StationConfig.joinMode` |
| F05 | `ctx.setMg(value)` · `ctx.setProgress(p)` · `ctx.sessionIdOf(player)` · `ctx.fx(...)` | see §10.3 | `mg` writes, operator ids, lane fx |
| F06 items (§10.4) | `items.takeCarried(world, sessionId)` | `=> ItemState \| null` | empties the hands onto a lane |
| F06 items | `items.giveToPlayer(world, item, sessionId)` | `=> boolean` (false when hands full) | picking a lane stick back up |
| F06 items | `items.placeNear(world, item, t)` | `=> boolean` — `placeOnFloor` at `t`, else ring search ≤ 2 | the Returns pile |
| F06 items | `items.destroyItem(world, itemId)` | `=> void` | a stick that boarded the truck; a carried item that rode along |
| F12 copy (§8) | `copy.bubbles.sawTheHighway` | `string` | the truck-ride bubble |
| F04 client (§10.9) | `MinigameOverlay` · `OverlayFactory` · `OverlayContext` · `StationView` · `minigames` · `stationViews` | see §10.9 | the overlay, the per-viewer truck/bay view |
| F04 client | `ctx.send(op, v?)` · `ctx.serverClock()` · `ctx.container` · `ctx.anchorPx()` | see §10.9 | shove/tailgate, beep row, panel |
| F04 client | the `fx` layer renders `text` at `(x, y)` for every kind (§4) | — | THUD / scrape / STALL / HONK / SLAM |

**Produces**

`shared/src/sim/orders.ts`

```ts
export interface OrdersConfig { firstAt: number; everySeconds: number; truckWaitSeconds: number;
  mix: { type: string; weight: number }[]; qtyPerTruck: { base: number; rampPerMinute: number } }
export interface TruckSlot { index: number; arrivesAt: number; leavesAt: number }
export interface OrderSpec { id: string; product: string; qty: number; truckId: number;
  arrivesAt: number; leavesAt: number; fuseLength: FuseLength }
export function truckSchedule(cfg: OrdersConfig, index: number): TruckSlot;              // index 0-based
export function qtyForTruck(cfg: OrdersConfig, arrivesAt: number): number;
export function orderSpecAt(cfg: OrdersConfig, index: number, rng: () => number): OrderSpec;
  // id 'o-<index+1>', truckId = index + 1, product = mix[0].type, fuseLength = rng() < 0.5 ? 'short' : 'long'
export function orderStatusFor(qty: number, shipped: number): 'complete' | 'partial' | 'failed';
export function truckCredit(loaded: number, slots: number, pricePerStick: number, perOrder: number):
  { credit: number; complete: boolean };
```

`shared/src/sim/dock.ts`

```ts
export interface ShoveWindows { perfectMs: number; okMs: number }
export interface DockMg {
  truck: { phase: 'away' | 'docked' | 'leaving'; arrivesAt: number; leavesAt: number; slots: number; loaded: number; hits: string };
  lanes: { tile: Tile; itemId: string; stalled: boolean }[];
  beepAt: number; beepPeriodMs: number;
  windows: ShoveWindows;
  tailgateUntil: number;
  returnsTile: Tile;
}
export function nearestBeep(beepAtMs: number, periodMs: number, beepCount: number, tMs: number):
  { index: number; deltaMs: number };                                   // index clamped to [0, beepCount − 1]
export function judgeShove(deltaMs: number, w: ShoveWindows): 'perfect' | 'ok' | 'miss';
export function beepPhase(beepAtSec: number, periodMs: number, nowSec: number): number;  // 0–1; 0 on a beep and before the first
export function tailgateWindowEnd(nowSec: number, leavesAt: number, windowSeconds: number): number;  // min(now + window, leavesAt)
export function laneIndexAt(lanes: readonly Tile[], x: number, y: number): number;       // −1 when not on a lane
export function parseDockMg(json: string): DockMg | null;
```

`game-server/src/sim/orders.ts`

```ts
export function initOrders(world: World): void;      // book > 0: pre-creates every OrderState, bookTotal = bookRemaining = orderBook; 'never': none. Arms truck 1
export function activeOrderId(world: World): string; // lowest-numbered 'open' order, '' when none (F08 binds ItemState.orderId at SEAT)
export function settleOrder(world: World, orderId: string, shipped: number): OrderStatus;
export function ensureOrder(world: World, index: number): OrderState | null;   // internal to F09's two server files:
  // creates the OrderState for truck `index` when it is missing and (index < bookTotal || endsOn === 'never'); the only order source in Sandbox
```

`game-server/src/sim/minigames/dock.ts`

```ts
export const dockModule: MinigameModule;             // create(station) → the dock MinigameInstance
export function dockTick(world: World, dt: number): void;
export function departTruck(world: World, reason: 'timer' | 'tailgate' | 'whistle'): void;
export function closeShift(world: World): void;      // docked → departTruck('whistle')
export const dockSystem: System;                     // { name: 'dock', onStart: initOrders, tick: dockTick,
                                                     //   onDayEnd: (w, _status, reason) => { if (reason === 'clock') closeShift(w); } }
```

`resources/js/game/minigames/Dock.ts`

```ts
export const dockOverlay: OverlayFactory;            // MinigameOverlay with capturesMovement: false
export const dockStationView: () => StationView;     // owns TruckSprite + BayWall, one per viewer
```

Messages sent: `fx` with kinds `thunk` (text `THUD`), `clink` (`scrape`), `bonk` (`STALL`, `FULL`,
`BUSY`, `WRONG FUSE`), `horn` (`HONK`, or `HONK HONK` on a slam), `slam` (`SLAM`); one `toast` per
departure. `mg` ops consumed: `shove` (no `v`), `tailgate` (`v: 'down' | 'up'`).

State written: `FactoryState.truck.*`, `bookTotal`, `bookRemaining`, `orders.*` (`shipped`, `status`,
and `fuseLength` at creation), `banner`/`bannerUntil` (`'TAILGATE'`); `StationState.mg` for the dock
station and, through `status(ctx)`, its `state`/`progress`; `ItemState.holder/shelf/x/y` for a stick
staged on a lane; at departure `PlayerState.{drivenOffUntil, stationId, workTile, x, y, bubble,
bubbleUntil}` for a rider. Never `FactoryState.score` and never `FactoryState.groove`.

`StationState.mg` for the dock is `JSON.stringify(DockMg)`, rewritten only on a change (phase, lane
set/clear/stall, load, tailgate open/close) — never per tick. Inside instance callbacks the write goes
through `ctx.setMg(mg)`; from `dockTick` the same helper compares and assigns `station.st.mg` (the
module owns that field exclusively, §10.3).

### Data & config

Read from the scaled `LevelConfig` (values below are Level 2's baseline; F12 owns the numbers):

| Key | Value | Used for |
|---|---|---|
| `orders.firstAt` | `20` | first truck's `arrivesAt` |
| `orders.everySeconds` | `60` | cadence (the breakpoint's `truckEverySeconds` after `scaleLevel`) |
| `orders.truckWaitSeconds` | `20` | `leavesAt − arrivesAt`; `beepCount = truckWaitSeconds × beepHz` |
| `orders.qtyPerTruck.base` | `8` | slots |
| `orders.qtyPerTruck.rampPerMinute` | `0.5` | slots ramp |
| `orders.mix` | `[{ "type": "red_stick", "weight": 10 }]` | M1 reads `mix[0].type` only |
| `day.orderBook` | F12's per-level number (the breakpoint's value after `scaleLevel`) | number of orders = number of trucks; `0` in Sandbox |
| `day.endsOn` | `'either'` (`'never'` in Sandbox) | the lazy-order branch |
| `economy.price[product]` | `10` | per-stick credit (toast) |
| `scoring.perOrder` | `100` (optional, §13 default) | full-truck bonus in the toast |
| `carry.truckRideSeconds` | F12's number | `drivenOffUntil` |
| `stations[dock-a].workTiles` | the 4 `layout.ramp` tiles | lanes, in array order (lane 0 = first) |
| `stations[dock-a].minigame.beepHz` | `1` | `beepPeriodMs = 1000 / beepHz` |
| `stations[dock-a].minigame.perfectMs` | `70` | shove window |
| `stations[dock-a].minigame.okMs` | `180` | shove window |
| `stations[dock-a].minigame.tailgateWindowSeconds` | `3` | window after the filling shove |
| `stations[dock-a].minigame.tailgateHoldSeconds` | `0.5` (optional, §13 default) | hold to slam |
| `stations[dock-a].minigame.leaveSeconds` | `1.5` (optional, §13 default) | length of the `leaving` phase |
| `layout.ramp` | 4 tiles | equals the dock's `workTiles` (F02 validates it) |
| `layout.dockDoor` | `[x, y, w]` | where the client draws the door and the horn fx |
| `layout.truckBay` | `[x, y, w, h]` | the truck sprite's ground and the truck-ride test |
| `layout.props.returnsPile` | `[x, y]` | `items.placeNear` target; the `RETURNS` label |
| `layout.breakRoom` | `[x, y, w, h]` | where a rider walks back in |

`stations[dock-a].joinMode` is `'stand'`: F05 sets `stationId`/`workTile` from the tile and routes `E`
to this module regardless of `carrying`; F03 does not freeze the player. The dock reads neither
`nominalSeconds`, `floorSeconds`, `staffing`, `churnSensitive`, `rackTiles` (`[]`) nor `floorRing`;
`dock-a` has no `inputShelf`/`outputShelf` and F05 sets both caps to 0. `windowFloorsMs` (`ok 100`,
`perfect 45`) is F02's validator floor; 180/70 pass it.

Constants in code (§14 — functional numbers with no designer meaning): `TAILGATE_BANNER_SECONDS = 2`
and the departure toast strings.

### Behaviour

**Order book (`initOrders`, the dock System's `onStart`).**

1. `level.day.orderBook > 0` → for each `index` in `0 … orderBook − 1`,
   `spec = orderSpecAt(level.orders, index, () => world.rng.next())` and add
   `OrderState { id, product, qty, shipped: 0, status: 'open', truckId, fuseLength }` from it
   (`orderSpecAt` sizes `qty` with `qtyForTruck`); `bookTotal = bookRemaining = orderBook`.
   `endsOn === 'never'` → no book is pre-created and `bookTotal = bookRemaining = 0`.
2. Truck 1 is armed either way: `ensureOrder(world, 0)`, then `truck = { id: 1, phase: 'away',
   arrivesAt: firstAt, leavesAt: firstAt + truckWaitSeconds, slots: qtyForTruck(cfg, firstAt),
   loaded: 0, beepPhase: 0 }`.

`ensureOrder(world, index)` creates the `OrderState` from `orderSpecAt(cfg, index, rng)` when
`state.orders` has none for that index and `index < bookTotal || endsOn === 'never'` — a no-op on a
book level, and the only order source in Sandbox. `truckSchedule(cfg, k) = { index: k, arrivesAt:
firstAt + k·everySeconds, leavesAt: arrivesAt + truckWaitSeconds }`; `qtyForTruck(cfg, arrivesAt) =
floor(base + rampPerMinute · arrivesAt / 60)` — 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13 for trucks
1–11 (docs/04's "8–13 sticks"). `activeOrderId` is the lowest-numbered `open` order: the docked
truck's order while docked, otherwise the next truck's.

**Truck state machine (`dockTick(world, dt)`, every tick while `phase === 'running'`, `now =
world.now`).** The dock keeps its runtime in a module-level `WeakMap<World, DockRuntime>`: `index`
(0-based truck), `lanes[i] = { itemId, stalled, lastBeep }` (`lastBeep −1` when none), `holds:
Map<sessionId, number>`, `leavingUntil`, and `hits` (one `'P'`/`'O'` per boarded stick — a `DockMg`
field, not a `TruckState` one). The dock station is the single `world.stations` entry whose
`cfg.type === 'dock'`.

1. `away`: when `now ≥ truck.arrivesAt` → `phase = 'docked'`, `mg.beepAt = arrivesAt`,
   `lanes[*].lastBeep = −1`, rewrite `mg`.
2. `docked`: `truck.beepPhase = beepPhase(arrivesAt, beepPeriodMs, now)` every tick. Beep `n`
   (`0 ≤ n < truckWaitSeconds × beepHz`, so 20 beeps) is at `arrivesAt + n / beepHz`; the last beep is
   a full second before `leavesAt`, so every beep is judgeable. Tailgate holds are checked (below).
   When `now ≥ truck.leavesAt` → `departTruck(world, 'timer')`.
3. `leaving`: `beepPhase = 0`; when `now ≥ leavingUntil` → `index += 1`; if
   `index < state.bookTotal || level.day.endsOn === 'never'` → `ensureOrder(world, index)`, then
   `phase = 'away'`, `id = index + 1`,
   `arrivesAt`/`leavesAt` from `truckSchedule`, `slots = qtyForTruck`, `loaded = 0`, `hits = ''`,
   rewrite `mg`. Otherwise the truck stays `leaving` — the book is done and F03 ends the day.

The schedule is fixed: a tailgate never moves the next truck's `arrivesAt`.

**Station state.** `status(ctx)` returns `{ state: 'working', progress: loaded / slots }` while the
truck is `docked` and `{ state: 'idle', progress: 0 }` otherwise; F05 writes it verbatim (§10.2), so
the dock never assigns `st.state`/`st.progress`. `starved(ctx)` is always `false` — the dock has no
input shelf. The instance's `tick` is a no-op: the cadence is world state and runs in `dockTick`,
which the `SYSTEMS` order puts after `stationsSystem`, so `progress` trails the truck by one 50 ms
tick.

**Setting a stick (`onInteract(ctx, player)`, `E` on a lane tile).** `lane = laneIndexAt(cfg.workTiles,
player.x, player.y)`; `−1` → return `false`. Resolution order, first match wins:

1. `tailgateUntil > now` → return `true`, do nothing (during the window `E` means SLAM and nothing else).
2. Player carries an item of `type === 'stick'`:
   - `truck.loaded === truck.slots && phase === 'docked'` → `ctx.fx('bonk', tile, { text: 'FULL' })`,
     return `true` (stick stays in hand).
   - `activeOrderId(world) !== ''` and the stick's `fuseLength !== order.fuseLength` →
     `fx bonk 'WRONG FUSE'`, return `true` (short fuses are two knots and would otherwise be strictly
     faster — the exploit F08 names).
   - lane already holds a stick → `fx bonk 'BUSY'`, return `true`.
   - otherwise `it = items.takeCarried(world, ctx.sessionIdOf(player))`; set the dock-lane location
     from §3 — `it.holder = station.st.id`, `it.shelf = ''`, `it.x = tile[0] + 0.5`, `it.y = tile[1] +
     0.5`; `lanes[lane] = { itemId: it.id, stalled: false, lastBeep: −1 }`; rewrite `mg`; return
     `true`. Allowed in every truck phase — staging on the lanes before the horn is the M1 lesson.
3. Player carries a non-stick item → return `false` (F06's generic put-down applies; a keg on the ramp
   is floor clutter like anywhere else and the dock never tracks it).
4. Empty hands, lane holds an unstalled stick → `items.giveToPlayer(world, it, sessionId)` (F06 sets
   `holder = sessionId`, `x = y = −1`); on `true`, `lanes[lane] = { itemId: '', stalled: false,
   lastBeep: −1 }`; rewrite `mg`; return `true`.
5. Empty hands, lane stalled → return `true`, nothing (a stalled stick is halfway into the truck; only
   a shove moves it).
6. Empty hands, empty lane → return `false`.

**Shove (`onMessage(ctx, player, 'shove', undefined, t)`).** `t` is the client's raw `performance.now()`
ms as forwarded by F05. Ignore silently when `phase !== 'docked'`, the player is not on a lane, or the
lane has no stick. Otherwise:

1. `tMs = world.inputClock(ctx.sessionIdOf(player), t) · 1000`.
2. `{ index: n, deltaMs } = nearestBeep(arrivesAt · 1000, beepPeriodMs, beepCount, tMs)`.
3. `n === lanes[lane].lastBeep` → ignore (one judgement per lane per beep).
4. `lanes[lane].lastBeep = n`; `j = judgeShove(deltaMs, windows)`.
5. `perfect` → `fx thunk 'THUD'`; `ok` → `fx clink 'scrape'`. Both: `items.destroyItem(world, itemId)`
   (the stick left with the truck), `truck.loaded += 1`, `hits += 'P' | 'O'`, `order.shipped += 1`,
   lane cleared. When `loaded === slots` → `tailgateUntil = tailgateWindowEnd(now, leavesAt,
   tailgateWindowSeconds)`. Rewrite `mg`.
6. `miss` → `lanes[lane].stalled = true`, `fx bonk 'STALL'`; rewrite `mg`. A stalled lane is judged
   normally on any later beep; Perfect/OK completes it, another miss keeps it stalled. Nothing goes to
   Returns on a stall.

A stalled stick when the truck is already full (the last slot went in on another lane) cannot board;
it rides the lane to departure and goes to Returns.

**Tailgate (`onMessage` with `op: 'tailgate'`).** `v === 'down'`: if `phase === 'docked'`,
`tailgateUntil > now`, and the player is on a lane → `holds.set(sessionId, now)` (server time, not
`t`). `v === 'up'`, and `onLeave(ctx, player, reason)` for every reason → `holds.delete(sessionId)`.
In `dockTick` while docked: for each hold with `now − start ≥ tailgateHoldSeconds`, `tailgateUntil >
now` and the player still on a lane → `departTruck(world, 'tailgate')` (first hold wins; all holds
cleared). A `down` sent before the window opened is ignored, so a player already holding `E` when the
truck fills must re-press. When `now ≥ tailgateUntil` the window closes and the truck leaves on its
timer with the same credit (no penalty branch).

**Departure (`departTruck(world, reason)`).** `order` is the docked truck's order (`truckId ===
truck.id`).

1. `{ credit, complete } = truckCredit(loaded, slots, level.economy.price[order.product],
   level.scoring.perOrder)` — `credit = loaded × price + (complete ? perOrder : 0)`. Nothing is added
   to `FactoryState.score`; the number appears only in the toast (step 5).
2. `settleOrder(world, order.id, loaded)`: `shipped = loaded`, `status = orderStatusFor(qty, shipped)`
   (`complete` when `shipped === qty`, `partial` when `0 < shipped < qty`, `failed` when `0`).
3. `bookTotal > 0` → `bookRemaining -= 1` (untouched in Sandbox, where it stays 0).
4. `complete` → `world.grooveEvents.trucksComplete += 1` (F11's `grooveSystem` applies
   `groove.weights.truckComplete`); `reason !== 'whistle'` → `fx horn 'HONK'` at the dock door centre.
   `reason === 'tailgate'` → additionally `fx slam 'SLAM'` at the door, the horn's text is
   `HONK HONK`, `banner = 'TAILGATE'`, `bannerUntil = now + TAILGATE_BANNER_SECONDS`.
5. `world.toast('all', text, kind)` with the credit: complete → `` `TRUCK OUT ${loaded}/${slots} — ${credit}` ``
   `'good'`; `0 < loaded < slots` → `` `TRUCK LEFT WITH ${loaded}/${slots} — ${credit}` `` `'warn'`;
   `loaded === 0` → `'TRUCK LEFT EMPTY — 0'` `'bad'`. Functional strings with numbers, so they live in
   the module rather than `copy.json` (§14).
6. Every lane holding a stick (stalled or not) → `items.placeNear(world, item, layout.props.returnsPile)`
   (F06 sets `holder = ''` and spreads the pile around the tile); lanes reset to `{ itemId: '', stalled:
   false, lastBeep: −1 }`. Sticks set on lanes *after* this moment stay for the next truck.
7. The truck ride: for every player whose `world.tileOf(x, y)` lies inside `layout.truckBay` →
   `drivenOffUntil = now + level.carry.truckRideSeconds`; a `carrying` that is neither `''` nor
   `'broom'` → `items.destroyItem(world, carrying)` (it went with the truck; no waste metric);
   `stationId = workTile = ''`; `x, y` = the break-room door tile
   (`breakRoom[0] + breakRoom[2] + 0.5`, `breakRoom[1] + 1 + 0.5`); `bubble =
   copy.bubbles.sawTheHighway`, `bubbleUntil = drivenOffUntil + 2`;
   `world.tally.bumpPlayer(userId, 'truckRides')`. F03's movement already holds a player still while
   `drivenOffUntil > clock` and F04 hides the avatar.
8. `tailgateUntil = 0`, `holds.clear()`, `phase = 'leaving'`, `leavingUntil = now + leaveSeconds`,
   `beepPhase = 0`; rewrite `mg`. Nothing here ends the day: F03 sees `bookRemaining === 0` on the
   same tick and calls `requestEnd('ended', 'book')` itself.

**Shift end by the clock (`closeShift`).** The dock System's `onDayEnd` calls it when `reason ===
'clock'`, before `reportSystem` builds the report (`SYSTEMS` order). If `phase === 'docked'` →
`departTruck(world, 'whistle')` (credit and returns as above, no horn). `away` or `leaving` → nothing.
Sticks still in players' hands or on the floor are not shipped.

**Sandbox (`day.endsOn === 'never'`).** `initOrders` creates no orders and `bookTotal` stays 0;
`dockTick` step 3 keeps cycling trucks forever, creating each `OrderState` on demand from
`orderSpecAt(cfg, index, rng)`; `bookRemaining` is never decremented, so F03's book end condition
never fires and no `report` is built. Settled orders stay in `state.orders` for the client's order
board.

**Client (`dockOverlay` + `dockStationView`).** Neither decides an outcome; both draw from `state`,
`parseDockMg(station.mg)` and `serverClock()`.

- *Overlay* (`capturesMovement: false`; mounted by F04's Host while `me.stationId !== '' &&
  me.workTile !== ''`, which at a `stand` station means "standing on a lane", with no clipboard to
  wait out): a beep row inside `ctx.container` with a marker sweeping left→right once per
  `beepPeriodMs` and snapping at `beepPhase === 0`, the ±`okMs` band and ±`perfectMs` core drawn to
  scale; four lane chips reading `EMPTY` / `READY` / `STALLED`, the local lane highlighted; the legend
  `E set · SPACE shove on the beep · hold E slam (full truck) · ESC leave`. While `away` the row is
  grey and reads `NEXT TRUCK 0:38`.
- *Keys* (`onKey(key, down, repeat)`, ignoring `repeat`): `space` down on a lane whose chip is `READY`
  or `STALLED` while `truck.phase === 'docked'` → `ctx.send('shove')`, return `true`. `interact` down
  while `mg.tailgateUntil > ctx.serverClock()` → `ctx.send('tailgate', 'down')`, return `true`; the
  matching `interact` up → `ctx.send('tailgate', 'up')`, return `true`. Any other `interact` returns
  `false` so F04's floor behaviour still sends `interact` — that is how a stick reaches the lane.
  `esc` returns `false` (F04 sends `leave`; F05 calls `onLeave(ctx, player, 'esc')`, which clears the
  hold — there is no cycle to forfeit). Arrows are never consumed; they keep walking.
- *StationView* (`create(scene, station, layer)`, one per viewer, updated every frame): builds
  `TruckSprite` and `BayWall` and keeps `scene.conn` for `room.state` and `config.layout`.
  - *TruckSprite* on `layout.truckBay`: `away` → parked off-map; `docked` → bed aligned to the bay,
    `slots` stick silhouettes in a 2-column grid with the first `loaded` filled, a lamp above slot `i`
    lit when `hits[i] === 'P'`, bed offset down 1 px per loaded stick (the sag); `leaving` → tween out
    over `leaveSeconds`; on the `docked` transition tween in over 0.4 s.
  - *BayWall* above `layout.dockDoor`: `docked` → `mm:ss` of `leavesAt − serverNow`; `away`/`leaving` →
    `NEXT mm:ss` of `arrivesAt − serverNow`; `tailgateUntil > serverNow` → `SLAM IT` flashing at 4 Hz
    instead. Bay light: a rectangle on the wall flashing for 120 ms whenever the beep wraps
    (client-timed from `beepAt` + `beepPeriodMs`, so it is steady regardless of patch jitter).
    `RETURNS` label at `mg.returnsTile` with the count of items whose `holder === ''` within Chebyshev
    distance 1 of that tile (`placeNear` spreads the pile).
- Horn, slam, THUD, scrape, STALL, FULL, BUSY and WRONG FUSE text are rendered by F04's fx layer from
  the `fx` messages; the dock sends them with `text`.

**Edge cases decided.** Two players cannot share a lane tile (F05's one-body-per-work-tile rule); if
they do, the `lastBeep` guard means only the first shove per beep counts. A `shove` whose clamped `t`
lands nearer the (non-existent) beep 20 than beep 19 is judged against beep 19 (index clamp) and
misses. A stick knocked or thrown onto a lane tile by F06 is a floor item (`holder === ''`) the dock
ignores; the dock never enters `jammed`. `world.inputClock` already clamps a stale `t` to
`clock − 0.2 s`, so a lagging client is judged as if it pressed 200 ms ago at worst. If
`truckWaitSeconds` or `beepHz` change, `beepCount` follows.

## Acceptance criteria

- [ ] At shift start on a book level `state.orders` holds `day.orderBook` orders `o-1..o-N`, all
      `open`, `qty` 8 for `o-1`, each with a `fuseLength` of `'short'` or `'long'`, and
      `bookTotal === bookRemaining === N`.
- [ ] In Sandbox (`endsOn 'never'`) `state.orders` holds only the armed truck's order at start,
      `bookTotal === bookRemaining === 0`, trucks keep arriving, and each truck's order is created
      when that truck is armed.
- [ ] `truck.phase` is `away` with `arrivesAt 20` at `clock 0`, `docked` at `clock 20`, `leaving` at
      `clock 40`, and `away` with `id 2`, `arrivesAt 80` at `clock 41.5`.
- [ ] Truck 3 (`arrivesAt 140`) has 9 slots; truck 11 (`arrivesAt 620`) has 13.
- [ ] While docked `truck.beepPhase` runs 0→1 once per second starting at `arrivesAt`; it is 0 while
      away or leaving.
- [ ] `E` with a matching stick in hand on an empty lane moves the stick from the hands to the lane
      (`holder` = the dock station id, `shelf ''`, `x,y` = the lane tile centre) and `mg.lanes[i].itemId`
      names it.
- [ ] `E` with a stick whose `fuseLength` differs from the active order's sends `fx bonk 'WRONG FUSE'`
      and leaves it in the hands.
- [ ] `E` with a keg in hand on a lane is not consumed by the dock (returns `false`).
- [ ] `E` with empty hands on a lane holding an unstalled stick puts the stick back in the hands and
      clears the lane; on a stalled lane it does nothing.
- [ ] A shove whose `inputClock` time is within ±70 ms of a beep destroys the stick, increments
      `loaded` and `order.shipped`, appends `P` to `hits`, and sends `fx thunk 'THUD'`.
- [ ] A shove between ±70 and ±180 ms does the same with `O` and `fx clink 'scrape'`.
- [ ] A shove beyond ±180 ms sets `lanes[i].stalled`, sends `fx bonk 'STALL'` and leaves the stick on
      the lane; an OK shove on the next beep completes it.
- [ ] A second shove on the same lane and the same beep is ignored.
- [ ] A shove while `away`, on an empty lane, or when the truck is full changes nothing.
- [ ] Setting a stick on a full docked truck sends `fx bonk 'FULL'` and leaves it in the hands.
- [ ] At `leavesAt` with `loaded 5 / slots 8`: the order is `partial` with `shipped 5`, `bookRemaining`
      drops by 1, every stick still on a lane is on or beside the Returns tile with `holder ''`, lanes
      are empty, and a `warn` toast reads `TRUCK LEFT WITH 5/8 — 50`.
- [ ] At `leavesAt` with `loaded 0` the order is `failed` and the toast is `bad`.
- [ ] A full truck leaving sets the order `complete`, increments `grooveEvents.trucksComplete`, sends
      `fx horn 'HONK'`, and toasts `TRUCK OUT 8/8 — 180` as `good`. `state.score` and `state.groove`
      are untouched.
- [ ] The shove that fills the last slot sets `mg.tailgateUntil = min(now + 3, leavesAt)`.
- [ ] `tailgate 'down'` inside the window followed by 0.5 s of holding on a lane departs the truck
      immediately with full credit, `fx slam 'SLAM'`, `fx horn 'HONK HONK'` and `banner 'TAILGATE'`.
- [ ] `tailgate 'down'` before the window, an `'up'` before 0.5 s, or stepping off the lane before
      0.5 s does not depart the truck; it leaves at `leavesAt`.
- [ ] `E` on a lane during the tailgate window sets and picks up nothing.
- [ ] The next truck's `arrivesAt` after a tailgate departure is still `firstAt + k·everySeconds`.
- [ ] A player standing in `layout.truckBay` at departure gets `drivenOffUntil = clock +
      carry.truckRideSeconds`, loses a carried item, is placed at the break-room door with the
      `sawTheHighway` bubble, and has `truckRides` bumped.
- [ ] When the last order settles, `bookRemaining === 0` on the same tick and the dock itself ends
      nothing.
- [ ] `closeShift` on a docked truck applies partial credit and sends no horn; on an away truck it
      changes nothing.
- [ ] `status(ctx)` reports `working` with `progress = loaded/slots` while docked and `idle` with 0
      otherwise; the dock writes `st.state`/`st.progress` nowhere else.
- [ ] `station.mg` parses as `DockMg` and is rewritten on phase, lane, load and tailgate changes only
      (0 writes across 20 idle ticks).
- [ ] In the running app the bay-wall countdown, the strobe on each beep, the truck sliding in with 8
      silhouettes, silhouettes filling on shoves, the lamp on a THUD, the horn text, the `SLAM IT`
      flash, and the `RETURNS` label with a count are all visible from the Powder station.

## Test plan

**Unit — `shared/tests/orders.test.ts`**
- it schedules truck k at `firstAt + k·everySeconds` and leaves `truckWaitSeconds` later
- it sizes a truck as `floor(base + rampPerMinute·arrivesAt/60)` (8 at 20 s, 9 at 140 s, 13 at 620 s)
- it builds the spec for index k with id `o-<k+1>`, `truckId k+1` and `mix[0].type` as the product
- it assigns a fuse length from the injected rng (`0.4` → `short`, `0.6` → `long`)
- it resolves `complete` / `partial` / `failed` from shipped against qty
- it credits price per stick and adds `perOrder` only when complete

**Unit — `shared/tests/dock.test.ts`**
- it finds the nearest beep and its signed delta, clamping the index to the last beep
- it judges perfect within ±70 ms, ok within ±180 ms, miss beyond
- it reports beep phase 0–1 from the server clock and 0 before the first beep
- it caps the tailgate window at `leavesAt`
- it maps a tile to its lane index or −1
- it parses a `DockMg` string and returns null for anything else

**Server — `game-server/tests/dock.test.ts`** (vitest; `makeWorld({ players: 2 })` from
`game-server/tests/helpers/world.ts`, then `state.clock` is advanced and `dockTick(world, dt)` called
directly; message paths go through `dockModule`'s instance)
- it fills the book at `onStart` with ids, quantities and fuse lengths, and arms truck 1
- it creates only the armed truck's order in Sandbox and keeps cycling trucks
- it moves the truck away → docked → leaving → away on the config timeline with ramped slots
- it reports `working` with `loaded/slots` while docked and `idle` otherwise via `status`
- it rewrites `mg` only on changes (0 writes across 20 idle ticks)
- it sets a carried stick on an empty lane, does not consume a keg, and refuses a wrong fuse length
- it loads on perfect and ok, stalls on a miss, and clears a stalled lane on the next beep's ok shove
- it ignores a second shove on the same beep and any shove while away or on an empty lane
- it refuses a stick with `FULL` when the truck is full
- it toasts partial credit, settles the order partial, and moves laned sticks to the Returns pile on
  timer departure
- it completes the order, bumps `grooveEvents.trucksComplete` and honks on a full truck, touching
  neither `score` nor `groove`
- it drives off a player standing in the truck bay and places them at the break-room door with
  `drivenOffUntil` set and `truckRides` bumped
- it opens the tailgate window on the filling shove, capped at `leavesAt`
- it slams after a 0.5 s hold inside the window and departs with full credit
- it ignores a hold started before the window, released early, or abandoned by stepping off
- it keeps the next truck's schedule fixed after a tailgate
- it leaves `bookRemaining 0` when the last truck departs and ends nothing itself
- it applies partial credit without a horn when `onDayEnd` runs with reason `'clock'`

**In-app verification** (`DEV_ALLOW_NO_TICKET=1`, two browsers, level 1):
1. Start the day; screenshot the bay wall at `0:15` showing `NEXT 0:05`; at `0:20` the truck slides in
   with 8 silhouettes and the light strobes once per second.
2. Carry a matching stick to lane 1, press `E`, tap `Space` on a beep; screenshot the THUD text, the
   filled silhouette and the lit lamp. Tap deliberately off-beat; screenshot the `STALL` text and the
   `STALLED` chip; shove on the next beep and confirm it boards. Carry a stick of the other fuse
   length to a lane; screenshot `WRONG FUSE`.
3. Let a truck leave with 3 of 8; screenshot the `TRUCK LEFT WITH 3/8 — 30` toast and two sticks lying
   by the `RETURNS` tile with the label reading `2`.
4. Stage 8 sticks on and beside the lanes before `1:20`, load all 8 in the window, hold `E`; screenshot
   `SLAM IT`, then `SLAM` + `HONK HONK` and the `TAILGATE` banner, with the truck gone before `1:40`.
5. Stand the second browser's player in the truck bay at a departure; screenshot the avatar gone, then
   back at the break-room door with the "I SAW THE HIGHWAY" bubble.
6. From the Powder work tile, screenshot the dock showing the countdown, strobe and truck bed legible
   at that distance.

## Tasks

- [ ] `shared/src/sim/orders.ts`: `OrdersConfig`, `TruckSlot`, `OrderSpec`, `truckSchedule`,
      `qtyForTruck` + tests.
- [ ] `shared/src/sim/orders.ts`: `orderSpecAt` (incl. fuse length), `orderStatusFor`, `truckCredit`
      + tests; append `export * from './sim/orders';` to `shared/src/index.ts`.
- [ ] `shared/src/sim/dock.ts`: `ShoveWindows`, `nearestBeep`, `judgeShove`, `beepPhase` + tests.
- [ ] `shared/src/sim/dock.ts`: `tailgateWindowEnd`, `laneIndexAt`, `DockMg`, `parseDockMg` + tests;
      append `export * from './sim/dock';` to `shared/src/index.ts`.
- [ ] `game-server/src/sim/orders.ts`: `initOrders` (book and Sandbox branches), `activeOrderId`,
      `settleOrder` + server test for the book at start.
- [ ] `game-server/src/sim/minigames/dock.ts`: runtime, `dockModule` skeleton (`onJoin`, `tick`,
      `starved`, `status`), `dockTick` phase machine, the `mg` writer, `dockSystem`; register the line
      in `game-server/src/sim/systems.ts`; cadence, status and `mg`-write-on-change tests.
- [ ] `game-server/src/sim/minigames/dock.ts`: `onInteract` set / pick / FULL / BUSY / WRONG FUSE
      + tests.
- [ ] `game-server/src/sim/minigames/dock.ts`: `onMessage` shove judgement through `world.inputClock`,
      stall, `lastBeep` guard + tests.
- [ ] `game-server/src/sim/minigames/dock.ts`: `departTruck` credit toast, returns via `placeNear`,
      horn, `grooveEvents.trucksComplete`, `bookRemaining` + partial and full tests.
- [ ] `game-server/src/sim/minigames/dock.ts`: the truck ride at departure + test.
- [ ] `game-server/src/sim/minigames/dock.ts`: tailgate window, holds, slam, `onLeave` + tests.
- [ ] `game-server/src/sim/minigames/dock.ts`: `closeShift` through `dockSystem.onDayEnd` + Sandbox
      lazy orders + tests.
- [ ] `resources/js/game/minigames/dock/TruckSprite.ts`: bed on `truckBay`, silhouettes, lamps, sag,
      tweens.
- [ ] `resources/js/game/minigames/dock/BayWall.ts`: countdown, strobe, `SLAM IT`, `RETURNS` label.
- [ ] `resources/js/game/minigames/Dock.ts`: `dockOverlay` (beep row, lane chips, legend, keys) and
      `dockStationView`; register both entries in `resources/js/game/minigames/index.ts`.
- [ ] In-app verification steps 1–6 with screenshots; tick the status boxes.

## Risks & open questions

- **The `interact` chain reaches F06 first.** §11 dispatches `interact` as `items.onInteract` →
  `stations.onInteract`. If F06's put-down fires on a lane tile for a player carrying a stick, the
  dock's `onInteract` never runs and the stick lands as floor clutter instead of on the lane. The dock
  needs F06 to decline a put-down on a `stand` station's work tile; listed under **Contract change
  requested** below.
- **One truck, one dock.** M1 has a single `TruckState` and a single `dock-a`. The M2 two-line
  breakpoint needs a truck per dock station; `dockTick` finds its station by `cfg.type === 'dock'` so
  the loop is easy to widen, but the schema change is M2's.
- **Order-map growth in Sandbox.** Settled orders stay in `state.orders` for the client's order board;
  a very long Sandbox session grows the map. Acceptable in M1; a cap is M2's if it ever bites.
- **`up` as shove.** `docs/04` offers `↑` as an alternative shove key. At the dock `↑` must keep
  walking (the dock is `capturesMovement: false`), so M1 binds `Space` only; revisit if the playtest
  wants a push key.

**Contract change requested** — everything F09 previously asked for is in `00-contracts.md` v2. What
remains is what v2 still does not settle:

1. **§11 dispatch, `interact` at a `stand` station.** The chain runs `items.onInteract` before
   `stations.onInteract`, and §10.4 does not say F06 declines when the player's tile is a work tile of
   a `stand` station. Add to §11 (or F06's rules): *"`items.onInteract` returns `false` without acting
   when the player's tile is a work tile of a station whose `joinMode === 'stand'`."* Without it, `E`
   with a stick in hand on a lane puts the stick on the floor and the dock is unplayable.
2. **§3 writers vs the dock-lane location.** §3's writer table gives `ItemState.*` to F06, but §3's
   Locations paragraph defines a dock-lane item (`holder` = dock station id, `shelf ''`, `x/y` = the
   lane tile) that no `items` export produces. Either add F09 to the `ItemState.{holder,shelf,x,y}`
   writer line for lane staging, or add `items.stageOnLane(world, item, stationId, t)` to §10.4.
3. **§3 writers vs the truck ride.** §10.6 requires F09 to write `PlayerState.{x, y, stationId,
   workTile, bubble, bubbleUntil}` for a rider; §3 lists F09 only for `drivenOffUntil`. Extend the §3
   F09 writer line with those fields (at departure only).
4. **`MinigameInstance.onMessage`'s `t`.** §10.3 does not say whether F05 forwards the raw client
   `performance.now()` ms or an already-converted `clock` value. F09 assumes raw ms and converts with
   `world.inputClock` per §10.6; one sentence in §10.3 would pin it for F07/F08 too.
5. **Banner duration for `TAILGATE`.** §13 gives `hazards.bannerSeconds` (3, read by F10) but no key
   for a non-hazard banner. F09 keeps a 2 s module constant; if banners are meant to share one
   duration, say so in §3 and F09 will read `hazards.bannerSeconds`.
