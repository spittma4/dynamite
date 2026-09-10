# F11 — Metrics, tally, Groove integration and the report card
**Status:** [x] Design reviewed · [x] Implemented · [x] Unit tests green · [ ] Verified in the running app
**Owns:** `game-server/src/sim/tally.ts` · `game-server/src/sim/metrics.ts` · `game-server/src/sim/groove.ts` · `game-server/src/sim/day.ts` · `game-server/tests/tally.test.ts` · `game-server/tests/metrics.test.ts` · `game-server/tests/groove.test.ts` · `game-server/tests/report.test.ts` · `resources/js/game/scenes/Report.ts` · `resources/js/game/report/format.ts` · `resources/js/game/__tests__/report-format.test.ts`
**Touches (one-line edits, listed exactly in §Files):** F03 `game-server/src/sim/systems.ts` (two `SYSTEMS` lines) · F04 `resources/js/game/main.ts` (one scene-list line)
**Reads:** `docs/features/00-contracts.md` (§3, §4, §8, §9, §10.1, §10.7, §10.9, §11, §12, §13) · `docs/18-days-grades-and-payday.md` · `docs/10-metrics.md` · `docs/05-flow-mechanics.md` (Groove, Clean Sweep, Accounting, Bottleneck estimate) · `docs/16-hazards-and-explosions.md` (Metrics) · `docs/17-oops-carry-and-throw.md` (Metrics) · `docs/decisions/0008`, `0010`, `0012`

## Goal

While the shift runs, F11 is the factory's instrument panel: it counts what every system does
(`world.tally`), samples what the floor looks like (utilization, WIP, order cycle times), integrates
the Groove bar from those samples and fires CLEAN SWEEP, and keeps `FactoryState.score` moving so the
number on the debug overlay means something. When F03 ends the day, F11 turns all of that into the
report card: a two-column joke in which the INDIVIDUAL PERFORMANCE column hands the Powder player a
gold-star EXCELLENT certificate while the FACTORY PERFORMANCE column says DISASTER, a big A–F letter,
a P&L that turns profit into coin, **kegs made vs. kegs used** in bold, a WIP sparkline, a bottleneck
line that explains itself, and the hazards and oops tallies with names attached. F03 broadcasts that
payload and posts the run; F01 stores it and lists the history. Everyone presses NEXT DAY and the page
reloads into a fresh room on the day Laravel has advanced to.

## Scope

**In (M1):**
- `RunTally` — the counters every other system bumps at the moment an event happens (contract §10.7
  tally sites): kegs made/used, defects, incidents, items destroyed by type, and per-player
  produced/bubbles/drops/sooted/fusesStomped/niceSaves/truckRides.
- Per-tick metrics: station whole-shift and rolling-30 s utilization (written to
  `StationState.utilization`), starved and blocked seconds, mean input-shelf fullness, per-player
  seconds per station and utilization (written to `PlayerState.utilization`), WIP sampled once per
  second, order start/complete times.
- `FactoryState.score` rewritten once per second from F02's `gradeDay` (contract §3: nothing else
  writes it).
- The Groove system: builds F02's `GrooveSample` each tick, drains `world.grooveEvents`, applies
  `grooveDelta` + `applyGroove` to `FactoryState.groove`, runs `cleanSweepStep` and raises the
  `CLEAN SWEEP` banner with the `snapTo` bump.
- `buildReport(world, reason)` → `ReportPayload` (F02's type), handed to F03 through
  `world.setReport` from `reportSystem.onDayEnd`.
- Client `Report` scene and its pure formatting helpers.

**Out:**
- The day loop itself — start gate, `clock`, end conditions, `report` broadcast, `POST /internal/runs`,
  abandonment, the fresh room for the next day: **F03** (contract §10.7). F11 never writes `phase`,
  `clock` or `shiftSeconds` and never calls `world.requestEnd`.
- `shared/src/report.ts`, `shared/src/sim/grade.ts`, `shared/src/sim/bottleneck.ts` and their tests:
  **F02**. F11 consumes `gradeDay`, `verdictFor`, `profitAndLoss`, `utilizationLabel`,
  `bottleneckStation` and never re-derives a score, a letter, a verdict, a multiplier or a P&L line.
- The Laravel run store (`runs`, `run_players`, `StoreRun`, the internal route, the factory page's run
  history): **F01** (contract §5 "Run store").
- Payday vote, purchases, `factory_upgrades`, Management's ribbon (M4).
- Complaints from Hotfix returns, `rework` and returned items in waste (M2 — F02's pure functions
  accept them; F11 feeds `0` per contract §9).
- Per-line utilization rows and the ten-row performance review above 6 players (M2).
- Customer feedback stars (M2; needs Hotfixes). Reverb `DayEnded` broadcast (M4).
- Rush-order revenue bonus (`economy.price.rushBonus`, M3).

## Design

### Files

| Path | Responsibility |
|---|---|
| `game-server/src/sim/tally.ts` | `RunTally` and its key types: the counters other systems bump during a shift. |
| `game-server/tests/tally.test.ts` | Vitest for `bump`, `bumpPlayer`, `destroyed`, `reset`. |
| `game-server/src/sim/metrics.ts` | `createMetrics`, `metricsTick`, `snapshotMetrics`, `gradeInputsFor`; owns the accumulators (module-level `WeakMap<World, MetricsState>`) and both `utilization` schema fields plus `FactoryState.score`. |
| `game-server/tests/metrics.test.ts` | Scripted-world sampling: station, player, WIP, order timings, score. |
| `game-server/src/sim/groove.ts` | `grooveSystem`: builds `GrooveSample`, drains `world.grooveEvents`, writes `FactoryState.groove`, fires `CLEAN SWEEP`. |
| `game-server/tests/groove.test.ts` | Sample construction, delta application, clean-sweep hold/cooldown/banner. |
| `game-server/src/sim/day.ts` | `isSandbox`, `buildReport`, `reportSystem`. |
| `game-server/tests/report.test.ts` | Report shape and values from a scripted world; `reportSystem` lifecycle. |
| `resources/js/game/report/format.ts` | Pure string helpers the scene uses: `formatClock`, `levelTitle`, `stationName`, `pnlLines`, `hazardLines`. |
| `resources/js/game/__tests__/report-format.test.ts` | Vitest for `format.ts` (F11's test, in F04's `__tests__` directory because F04's root `vitest.config.ts` globs it — contract §12 "their tests"). |
| `resources/js/game/scenes/Report.ts` | Phaser scene `Report`: renders the payload, NEXT DAY / BACK TO FACTORY. |
| **Modify** `game-server/src/sim/systems.ts` (F03) | Two lines: `grooveSystem` after `dockSystem`, `reportSystem` last (contract §11). |
| **Modify** `resources/js/game/main.ts` (F04) | One line: append `ReportScene` to the Phaser scene list (contract §6). |

### Interfaces

**Consumes**

- **F02 `shared/src/report.ts`** — `ReportPayload`, `Grade`, `Verdict`, `PlayerLabel`, `EndReason`,
  `PlayerReport`, `StationReport`, `BottleneckSummary`, `Pnl`, `Materials`. F11 declares none of them.
- **F02 `shared/src/sim/grade.ts`** — `gradeDay(i: GradeInputs, grading, day): DayGrade`,
  `profitAndLoss(i: PnlInputs, economy, multiplier): Pnl`, `utilizationLabel(u): PlayerLabel`
  (`verdictFor` and `letterFor` are called by `gradeDay`, not by F11).
  `GradeInputs = { ordersCompleted, ordersTotal, peakWip, complaints, shipped, avgCycleSeconds,
  incidents, cleanSweeps, niceSaves, bookDone, remainingSeconds, exploded }`;
  `PnlInputs = { shipped: Partial<Record<Product, number>>, waste: Partial<Record<ItemType, number>> }`.
- **F02 `shared/src/sim/bottleneck.ts`** — `StationPressure`, `bottleneckStation(list): string`
  (ties to the first entry; `''` for an empty list; a station passed with `inputShelfFullness 0` can
  never win).
- **F02 `shared/src/sim/groove.ts`** — `GrooveSample`, `GrooveEvents`, `CleanSweepState`,
  `grooveDelta(w, s, e, dt)`, `applyGroove(groove, delta)`, `cleanSweepStep(state, s, clock, cfg)`.
- **F03 `World`** (contract §10.1) — `level` (a `ScaledLevel` after `start`), `layout`, `state`,
  `factory`, `seed`, `now` (= `state.clock`), `readonly tally: RunTally`,
  `readonly grooveEvents: GrooveEvents`, `setReport(report)`, and the `System` interface
  (`init?`, `onStart?`, `tick?`, `onDayEnd?(world, status, reason)`). `SYSTEMS` in
  `game-server/src/sim/systems.ts`. Test helper `makeWorld({ level?, layout?, seed?, players? })`
  from `game-server/tests/helpers/world.ts` — every server test uses it.
- **Contract §3 schema (read-only except the four fields below)** — `FactoryState.{phase, clock,
  shiftSeconds, day, levelKey, bookTotal, bookRemaining, groove, banner, bannerUntil, players,
  stations, items, orders, fuses, truck}`, `PlayerState.{userId, name, stationId, workTile}`,
  `StationState.{id, state, inputShelf, inputCap, outputShelf, outputCap}`, `ItemState.{type, holder,
  orderId}`, `OrderState.{product, status, shipped}`, `TruckState.phase`.
- **Contract §8 level config** — `day.{shiftSeconds, endsOn, earlyFinishBonusPerMinute,
  earlyFinishCap}`, `grading.*`, `economy.{price, wasteCost}`, `groove.{weights, cleanSweep}`,
  `hazards.bannerSeconds`, `stations[].id`.
- **F12 copy** — F11 reads no copy on the server. The client reads `conn.config.copy.report.*`
  (contract §8) and `fill` from `@shared`: `individualHeading`, `factoryHeading`, `topPerformer`
  (placeholders `{name}`, `{station}`), `materials` (placeholders `{purchased}`, `{shipped}`),
  `certificate`, `repeatDay`, `fireMarshal`, `loss`. `report.sandbox` has no M1 reader (a Sandbox day
  sends no `report`).
- **F05 `shared/src/sim/stations.ts`** — `STATION_LABEL` (contract §10.2), read through `@shared` by
  `format.ts` so the report names a station the same way the floor does.
- **F04 client core** — `game.registry` holds `conn` (`room`, `sessionId`, `config: { level, layout,
  copy }`); the Factory scene starts `Report` with `{ payload, factoryUrl }` on the `report` message
  and clears the reconnect token when `phase` becomes `'ended'` (contract §6).
- **Other systems' tally bumps** — contract §10.7 tally sites, restated in §Behaviour › The tally.

**Produces**

`game-server/src/sim/tally.ts`

```ts
export type TallyKey = 'kegsMade' | 'kegsUsed' | 'defects' | 'incidents';
export type PlayerTallyKey = 'produced' | 'bubbles' | 'drops' | 'sooted' | 'fusesStomped' | 'niceSaves' | 'truckRides';
export type DestroyCause = 'blast' | 'fizzle';
export type ItemCounts = Record<ItemType, number>;                 // ItemType from @shared (keg|casing|stick|crate|parts)
export class RunTally {
  counts: Record<TallyKey, number>;
  destroyedByType: ItemCounts;                                     // by item type; the cause is validated, not stored
  players: Map<string, Record<PlayerTallyKey, number>>;            // key = PlayerState.userId
  bump(key: TallyKey): void;
  bumpPlayer(userId: string, key: PlayerTallyKey): void;
  destroyed(type: ItemType, cause: DestroyCause): void;            // bumps destroyedByType (Contract change requested 1)
  reset(): void;
}
```

`game-server/src/sim/metrics.ts`

```ts
export interface StationMetrics { workingTicks: number; totalTicks: number; starvedSeconds: number; blockedSeconds: number;
  inputFullnessSum: number; fullnessSamples: number; rolling: Uint8Array; rollingIndex: number; rollingSum: number }
export interface PlayerMetrics { userId: string; name: string; firstSeenTick: number; presentSeconds: number;
  workingSeconds: number; secondsAtStation: Record<string, number> }
export interface OrderTiming { startedAt: number | null; completedAt: number | null }   // clock seconds
export interface MetricsState { ticks: number; wipTimeline: number[]; stations: Map<string, StationMetrics>;
  players: Map<string, PlayerMetrics>; orders: Map<string, OrderTiming> }
export const ROLLING_WINDOW_TICKS = 600;                            // 30 s at 20 Hz
export function createMetrics(world: World): void;                  // (re)sets the WeakMap entry; called from reportSystem.onStart
export function metricsTick(world: World, dt: number): void;        // reportSystem.tick
export function snapshotMetrics(world: World): MetricsState;        // read-only view for buildReport (throws before createMetrics)
export function gradeInputsFor(world: World, reason: EndReason | null): GradeInputs;   // reason null = the 1 Hz in-shift score
```

`snapshotMetrics` and `gradeInputsFor` are exported only so `day.ts` can read them; no other feature
imports them. `MetricsState` lives in a module-level `WeakMap<World, MetricsState>` (contract §14).

`game-server/src/sim/groove.ts`

```ts
export const GROOVE_WINDOW_SECONDS = 60;                            // on-time window for GrooveSample.onTimeShipRate
export const grooveSystem: System;                                  // { name: 'groove', tick }
```

`game-server/src/sim/day.ts`

```ts
export function isSandbox(world: World): boolean;                    // world.level.day.endsOn === 'never'
export function buildReport(world: World, reason: EndReason): ReportPayload;
export const reportSystem: System;                                  // { name: 'report', onStart, tick: metricsTick, onDayEnd }
```

`resources/js/game/report/format.ts`

```ts
export function formatClock(seconds: number): string;                       // 'm:ss'
export function levelTitle(level: LevelConfig): string;                     // level.name.toUpperCase()
export function stationName(id: string, level: LevelConfig): string;        // STATION_LABEL[type]; '(no station)' for ''
export function pnlLines(p: ReportPayload, copy: Copy): string[];
export function hazardLines(p: ReportPayload): string[];                    // omits a segment whose count is 0
```

`resources/js/game/scenes/Report.ts`

```ts
export interface ReportSceneData { payload: ReportPayload; factoryUrl: string }
export class ReportScene extends Phaser.Scene { constructor(); init(data: ReportSceneData): void; create(): void }   // key 'Report'
```

Schema fields written by F11 and by nobody else (contract §12): `StationState.utilization`,
`PlayerState.utilization`, `FactoryState.score`, `FactoryState.groove` (after F03 seeds it at
`start`), and `FactoryState.banner`/`bannerUntil` for `'CLEAN SWEEP'` only.

### Data & config

Every number F11 uses comes from the level (contract §8) or from F02; F11 defines no tuning key.

| Key | Baseline value | Used for |
|---|---|---|
| `day.shiftSeconds` | 600 | `remainingSeconds` on a book finish; `0` in Sandbox |
| `day.endsOn` | `'either'` (`'never'` in Sandbox) | `isSandbox` |
| `day.earlyFinishBonusPerMinute` · `day.earlyFinishCap` | 5 · 10 | passed through in `L.day` to `gradeDay` |
| `grading.{weights, thresholds, targets, multiplier, verdict}` | docs/18 | passed through in `L.grading` to `gradeDay` |
| `economy.price` | `{ red_stick: 10 }` | revenue, inside `profitAndLoss` |
| `economy.wasteCost` | `{ keg: 4, casing: 2, stick: 6, crate: 8 }` | waste, inside `profitAndLoss` |
| `groove.weights` | docs/05 (incl. `truckComplete` 10) | `grooveDelta` |
| `groove.cleanSweep` | `{ holdSeconds, snapTo, cooldownSeconds }` | `cleanSweepStep` and the snap |
| `hazards.bannerSeconds` | 3 (default, §13) | how long `CLEAN SWEEP` stays up |
| `stations[].id` | `powder-a`, `assembly-a`, `dock-a` | the report's station rows, in level order |

Constants that stay in F11's code: `ROLLING_WINDOW_TICKS = 600` (30 s at 20 Hz) and
`GROOVE_WINDOW_SECONDS = 60`. `HERO_POINTS_PER_EVENT` and `UTILIZATION_LABELS` are F02's
(`shared/src/sim/constants.ts`, §13) and are read inside `gradeDay`/`utilizationLabel`.

### Behaviour

#### The tally (`tally.ts`) — who bumps what

`world.tally` is the single place event counts live (contract §10.7). `RunTally` itself is four
counters, an `ItemCounts` record, and a per-user map created lazily on first bump. `reset()` zeroes
all three. Sites, by the system that owns the moment:

| Call | Owner | When |
|---|---|---|
| `bump('kegsMade')` | F05 | `complete()` delivers an item of type `keg` |
| `bump('kegsUsed')` | F08 | the Jig's pour takes a keg's last pour and the keg leaves the input shelf |
| `bump('defects')` | F08 | the Jig emits a stick with `capLoose \|\| frayed \|\| fill !== 1.0` |
| `bump('incidents')` | F10 | a chain reaches `hazards.incidentThreshold` kegs |
| `destroyed('keg', 'blast')` | F10 | a keg goes off (floor, shelf, hands, or Blast Bin) |
| `destroyed('stick', 'fizzle')` | F06 | a dropped stick fizzles |
| `bumpPlayer(userId, 'produced')` | F05 | at completion, once for every work/rack member of the station |
| `bumpPlayer(userId, 'bubbles')` | F05 | a `copy.bubbles.whatCanIDo` congestion bubble is raised |
| `bumpPlayer(userId, 'drops')` | F06 | an involuntary drop (bump, uncaught throw); deliberate put-downs are not drops |
| `bumpPlayer(userId, 'sooted')` | F10 | a blast soots a player who was not already sooted |
| `bumpPlayer(userId, 'fusesStomped')` | F10 | a stomp completes |
| `bumpPlayer(userId, 'niceSaves')` | F10 | a lit keg lands in a Blast Bin |
| `bumpPlayer(userId, 'truckRides')` | F09 | `departTruck` drives a player off from `layout.truckBay` |

`kegsExploded = destroyedByType.keg` and `fizzles = destroyedByType.stick`: `'blast'` is the only
cause that destroys a keg and `'fizzle'` the only one that destroys a stick, so the counts are exact.
`rework` and `complaints` have no M1 source; `buildReport` passes `0` and the report prints
`Rework 0`. `cleanSweeps` does have one: `grooveSystem` counts every `cleanSweepStep` fire and
`gradeInputsFor` reads it through `cleanSweepCount(world)`, so a clean sweep earns hero points in M1
(contract §9).

#### Metrics sampling (`metrics.ts`)

`createMetrics(world)` writes a fresh `MetricsState` into the WeakMap with `ticks 0`, an empty station
map, an empty player map, an empty order map, and `wipTimeline` seeded with a single `0` so
`wipTimeline[i]` is the WIP at whole second `i`.

`metricsTick(world, dt)` runs as `reportSystem.tick` — last in `SYSTEMS`, so every other system has
already written the schema for this tick (contract §11). Every tick (`dt = 0.05`):

- Per station in `state.stations` (accumulator created on first sight): `totalTicks++`;
  `working = st.state === 'working'`; `workingTicks += working ? 1 : 0`; `starvedSeconds += dt` while
  `'starved'`; `blockedSeconds += dt` while `'jammed'` (jammed only — `'damaged'` is not blocked
  time); rolling ring of `ROLLING_WINDOW_TICKS` bytes:
  `rollingSum -= rolling[i]; rolling[i] = working ? 1 : 0; rollingSum += rolling[i]; i = (i + 1) % 600`.
- Per player in `state.players`, keyed by `userId` (accumulator created on first sight with
  `firstSeenTick = ticks`; `name` refreshed each tick): `presentSeconds += dt`; when `stationId !== ''
  && workTile !== ''` → `secondsAtStation[stationId] += dt` and, if that station's `state === 'working'`,
  `workingSeconds += dt`. A player who leaves keeps their accumulator, so they still appear on the
  report and in `run_players`.
- `ticks++`. Every 20th tick (once per second of sim time):
  - `wipTimeline.push(state.items.size)` — WIP is everything not yet shipped and not destroyed; the
    dock removes shipped items and hazards/oops remove destroyed ones.
  - Per station: `inputFullnessSum += inputCap > 0 ? inputShelf.length / inputCap : 0` (a station with
    no input shelf contributes 0 so `bottleneckStation` can never pick it — F02's rule);
    `fullnessSamples++`.
  - Orders: create a timing for each `state.orders` entry on first sight; when `startedAt === null`
    and any item in `state.items` has `orderId === id` → `startedAt = floor(clock)`; when
    `completedAt === null && status === 'complete'` → `completedAt = floor(clock)`.
  - `StationState.utilization = rollingSum / min(ROLLING_WINDOW_TICKS, totalTicks)` and
    `PlayerState.utilization = presentSeconds > 0 ? workingSeconds / presentSeconds : 0` for every
    player still in `state.players`. Writing at 1 Hz keeps the patch churn negligible.
  - `state.score = gradeDay(gradeInputsFor(world, null), L.grading, L.day).score` — the running
    report-card score the debug overlay shows (contract §3). In Sandbox `bookTotal` is 0, so the
    number is meaningless there and no report is ever built from it.

`gradeInputsFor(world, reason)` assembles F02's `GradeInputs` from the schema, the accumulators and the
tally: `ordersCompleted` = orders with `status === 'complete'`; `ordersTotal = state.bookTotal`;
`shipped = Σ orders[*].shipped`; `peakWip = max(wipTimeline)`;
`avgCycleSeconds = round(mean(completedAt − startedAt))` over orders with both set, `0` when none;
`complaints 0`; `incidents = tally.counts.incidents`; `cleanSweeps = cleanSweepCount(world)`;
`niceSaves = Σ tally.players[*].niceSaves`; `bookDone = reason === 'book'`;
`remainingSeconds = bookDone ? max(0, state.shiftSeconds − state.clock) : 0`;
`exploded = reason === 'exploded'`.

#### Groove integration (`groove.ts`)

`grooveSystem.tick` runs after `dockSystem` and before `reportSystem` (contract §11), so it sees every
`grooveEvents` write made earlier in the same tick. Per-World state (`WeakMap`): the `CleanSweepState`
and two ring buffers of `clock` timestamps.

1. Record the window events for `onTimeShipRate`: an order whose `status` moved to `'complete'` this
   tick pushes `clock` into the completions ring; `state.truck.phase` leaving `'docked'` pushes `clock`
   into the departures ring. Both rings drop entries older than `GROOVE_WINDOW_SECONDS`.
2. Build F02's `GrooveSample`: `onTimeShipRate` = completions ÷ departures in the window (`0` when no
   truck departed); `avgShelfFullness` = mean of `length / cap` over every input and output shelf with
   `cap > 0`; `floorItemCount` = items with `holder === ''`; `reworkShelfCount 0`;
   `starvedStationCount` / `jammedStationCount` from `state.stations`;
   `litFuseCount = state.fuses.size`.
3. `state.groove = applyGroove(state.groove, grooveDelta(L.groove.weights, sample, world.grooveEvents, dt))`,
   then zero every field of `world.grooveEvents` (the contract makes the groove system the drain).
4. `cleanSweepStep(cleanSweep, sample, state.clock, L.groove.cleanSweep)`; on `fire`:
   `state.groove = max(state.groove, L.groove.cleanSweep.snapTo)` and, **only when
   `state.clock >= state.bannerUntil`** (never stomp a banner another system just raised),
   `state.banner = 'CLEAN SWEEP'`, `state.bannerUntil = state.clock + L.hazards.bannerSeconds`.

Nothing else in F11 writes `groove`; F03 seeds it to `level.groove.start` at `start` and no other
feature writes it at all (contract §12).

#### Building the report (`buildReport`)

Let `m = snapshotMetrics(world)`, `t = world.tally`, `L = world.level`, `elapsed = state.clock`.

1. `ordersTotal = state.bookTotal`; `ordersCompleted` = orders with `status === 'complete'`;
   `throughput = round1(ordersCompleted × 600 / max(1, elapsed))` — orders per 10 minutes of shift
   played, so an early finish reads higher (contract §9).
2. `avgCycleSeconds`, `peakWip`, `wipTimeline` as computed in `gradeInputsFor` / sampled.
3. `stations = L.stations.map(s => ({ id: s.id, utilization: round2(workingTicks / max(1, totalTicks)) }))`
   — the whole-shift fraction, in level order (`StationState.utilization` is the rolling one).
4. `bottleneck`: `bottleneckStation(stations.map(s => ({ id, utilization, inputShelfFullness:
   inputFullnessSum / max(1, fullnessSamples) })))`, then `{ stationId, starvedSeconds:
   round(starvedSeconds), blockedSeconds: round(blockedSeconds) }` for that station (zeros when the
   list is empty and the id is `''`).
5. `players`: one entry per `m.players` value — `utilization = round2(workingSeconds /
   max(1, presentSeconds))`, `label = utilizationLabel(utilization)`, `topStation` = the station id
   with the largest `secondsAtStation` (`''` when never on a work tile), and
   `bubbles/drops/sooted/fusesStomped/niceSaves/truckRides` from `t.players` (zeros when never
   bumped). Sorted by `utilization` desc, then `firstSeenTick` asc.
6. `{ score, grade, verdict, multiplier } = gradeDay(gradeInputsFor(world, reason), L.grading, L.day)`.
7. `shippedByProduct[order.product] += order.shipped` over the orders that shipped something — an
   order still on `0` is skipped, so a product the level does not price cannot make `profitAndLoss`
   throw and lose the whole shift. `waste = { keg, casing, stick,
   crate }` = at-close counts of `state.items` by type (held, shelved, on the floor, in flight — all
   unshipped material; a half-used keg counts as a keg) **plus** `t.destroyedByType` by type.
   `parts` is omitted: `economy.wasteCost` has no entry for it and `PnlInputs.waste` is `Partial`.
   `pnl = profitAndLoss({ shipped: shippedByProduct, waste }, L.economy,
   reason === 'exploded' || reason === 'abandoned' ? 0 : multiplier)` — F02 rounds `coin` and never
   returns a negative one.
8. `materials = { purchased: t.counts.kegsMade, shipped: Σ orders[*].shipped }` (contract §9:
   purchased = kegs made, shipped = sticks that left on a truck — F09's `closeShift` departs a docked
   truck from its own `onDayEnd`, which runs before `reportSystem`'s).
9. `kegsMade`, `kegsUsed`, `defects` from `t.counts`; `rework: 0`;
   `kegsExploded = t.destroyedByType.keg`; `fizzles = t.destroyedByType.stick`; `fusesStomped`,
   `niceSaves`, `truckRides` summed over `t.players`.
10. `day = state.day`, `levelKey = state.levelKey`.

#### `reportSystem`

```ts
export const reportSystem: System = {
  name: 'report',
  onStart(world) { world.tally.reset(); createMetrics(world); },
  tick: metricsTick,
  onDayEnd(world, _status, reason) { if (!isSandbox(world)) world.setReport(buildReport(world, reason)); },
};
```

It is appended **last** to `SYSTEMS` so its `tick` samples a finished tick and its `onDayEnd` sees the
final state (contract §11). F03 consumes `world.report` in `finishDay`: it broadcasts the `report`
message and POSTs `{ ...report, factoryId, seed, startedAt, endedAt, status }` to `/internal/runs`.
In Sandbox (`day.endsOn === 'never'`) F03 skips both, so F11 builds nothing.

#### Client: `Report` scene

Started by F04's Factory scene on the `report` message with `{ payload, factoryUrl }`; `conn` comes
from `game.registry`, which supplies `conn.room`, `conn.sessionId` and
`conn.config.{ level, layout, copy }`. Rendering is Phaser text and graphics on a paper-coloured panel
(`#f3ead7` paper, `#2b2b2b` ink, `#8a8a8a` grey, `#c9a227` gold, `#b3261e` red), laid out from
`this.scale.width/height`, following docs/10:

1. Header: `DAY {day} · {levelTitle(conn.config.level)}` left; right `REPORT CARD: {grade}` in a 96 px
   serif letter — red with the rotated (−12°) stamp `copy.report.fireMarshal` when
   `verdict === 'EXPLODED'`.
2. Left column `copy.report.individualHeading` in `Georgia, serif`, under it the gold-star heading
   `copy.report.certificate`: one row per player `{name}  {utilization × 100}%  {label}` — the
   percentage always grey, `EXCELLENT` followed by a gold `★`; then
   `fill(copy.report.topPerformer, { name, station: stationName(topStation, level) })` for the first
   player.
3. Right column `copy.report.factoryHeading` in `"Courier New", monospace`, from `pnlLines`:
   `Orders completed {c} / {t}` · `Throughput {throughput} / 10 min` ·
   `Avg cycle time {formatClock(avgCycleSeconds)}` · `Peak WIP {peakWip}` · `Rework {rework}` · blank ·
   `Verdict: {verdict}` · `Revenue {revenue} − Waste {waste} = {profit}` (a red rotated
   `copy.report.loss` stamp when `profit < 0`) · `× {grade} ({multiplier}) = {coin} coin`
   (`× EXPLODED = 0 coin` when `verdict === 'EXPLODED'`).
4. Station block: `STATION UTILIZATION` with a grey bar per station (`utilization × 240` px) and the
   percentage; right of it `BOTTLENECK: {stationName(bottleneck.stationId, level)}` and, on that
   station's row, `← starved {s} s, blocked {b} s`; on the `boom_powder` row, in bold (20 px, ink),
   `← {kegsMade} kegs made, {kegsUsed} used`. Below the block, also bold,
   `fill(copy.report.materials, { purchased, shipped })`.
5. `WIP OVER TIME` sparkline: `wipTimeline` as a polyline in a 300 × 40 px box; a series longer than
   300 points takes the max of each pixel column's bucket; y scaled to `peakWip` (a flat zero line
   when `peakWip === 0`).
6. Lines from `hazardLines(payload)`: `"WHAT CAN I DO?" bubbles emitted: {name n · …}` (players with
   `bubbles > 0`, desc; omitted when none) · `Kegs exploded: {n}   Fuses stomped: {name n · …}
   Sooted: {names}` · `Fizzles: {n}   Nice Saves: {name n}   Truck rides: {name n}   Most dropped:
   {name} ({n})` — a segment is omitted when its count is 0.
7. `verdict === 'EXPLODED'` adds the caption `copy.report.fireMarshal` under the header; a `D` or `F`
   grade adds the banner `copy.report.repeatDay` above the buttons.
8. Buttons, shown to everyone (the room never unlocks, so the next day is a fresh room — contract
   §10.7): `NEXT DAY` (click or Enter) → `conn.room.leave()` then `location.reload()`; the reconnect
   token was already removed by F04 when `phase` became `'ended'` (contract §6), so the reload joins a
   new room on the day Laravel advanced to. `BACK TO FACTORY` → `conn.room.leave()` then
   `window.location.assign(factoryUrl)`.

The client never computes a grade, a verdict or a number; every figure is read from the payload.

## Acceptance criteria

- [x] `RunTally.bump`, `bumpPlayer` and `destroyed` create their slots lazily and `reset()` zeroes the
      counters, the destroyed record and the player map.
- [x] `StationState.utilization` equals the fraction of the last 600 ticks the station was `working`,
      refreshed every 20 ticks; before 600 ticks the denominator is `totalTicks`.
- [x] The report's station utilization is the whole-shift `workingTicks / totalTicks`, rounded to two
      places, one row per `level.stations` entry in level order.
- [x] A station `'starved'` for 84 ticks reports `starvedSeconds` 4; `'jammed'` reports into
      `blockedSeconds`; `'damaged'` reports into neither.
- [x] `wipTimeline` has `floor(elapsed) + 1` entries, each the item count at that whole second, and
      `peakWip` is its maximum.
- [x] An order's cycle time is `completedAt − startedAt` in whole seconds and `avgCycleSeconds`
      averages only completed orders (0 when none).
- [x] A player on a work tile of a `working` station accrues working seconds; on the floor they accrue
      only present seconds; `PlayerState.utilization = working / present`, written once per second.
- [x] A player who leaves mid-shift keeps their accumulator and still appears in the report's
      `players` array.
- [x] `state.score` is rewritten once per second from `gradeDay` and never by any other system.
- [x] The bottleneck is `bottleneckStation` over `utilization × mean input fullness`; a station with
      `inputCap 0` is passed fullness 0 and is never chosen.
- [x] `grooveSystem` moves `state.groove` every tick from `grooveDelta` and leaves
      `world.grooveEvents` zeroed afterwards.
- [x] `GrooveSample.onTimeShipRate` is completions ÷ truck departures over the last 60 s and 0 when no
      truck departed in the window.
- [x] A clean floor held for `groove.cleanSweep.holdSeconds` snaps `groove` up to `snapTo`, sets
      `banner = 'CLEAN SWEEP'` for `hazards.bannerSeconds`, and does not fire again within
      `cooldownSeconds`.
- [x] `grooveSystem` leaves `banner` alone while `clock < bannerUntil`.
- [x] `buildReport` returns every `ReportPayload` key with the right type, players sorted by
      utilization desc then first seen, and per-player stomps/saves/rides summed into the totals.
- [x] `buildReport` derives `kegsExploded` from `destroyedByType.keg` and `fizzles` from
      `destroyedByType.stick`.
- [x] `buildReport` charges waste for items at close plus destroyed items by type and omits `parts`.
- [x] `buildReport` leaves a product nobody shipped out of `shipped`, so an unpriced product only
      reaches `profitAndLoss` when it actually earned revenue.
- [x] `buildReport` prices sticks on a truck that has not left as shipped revenue while the order is
      still incomplete.
- [x] `reportSystem.onStart` resets the tally and the metrics; `onDayEnd` calls `world.setReport` with
      the reason F03 passed; on a Sandbox level it sets no report.
- [x] `throughput` is `round1(ordersCompleted × 600 / max(1, clock))`.
- [ ] The Report scene shows both columns, the grade letter, the P&L lines, the bold kegs made/used
      line, the sparkline, the bottleneck line and the hazards/oops lines from the payload alone.
- [x] `hazardLines` omits a segment whose count is 0 and the bubbles line when nobody bubbled.
- [ ] NEXT DAY is shown to every player; it leaves the room and reloads the page. BACK TO FACTORY
      leaves the room and navigates to `factoryUrl`.

## Test plan

**`game-server/tests/tally.test.ts`** (vitest, `makeWorld`)
- it starts with every counter at zero
- it bumps a factory counter
- it creates a player record on the first bump and increments it thereafter
- it counts a destroyed item under its type
- it clears counters, destroyed counts and players on reset

**`game-server/tests/metrics.test.ts`** (vitest, `makeWorld({ players: 3 })`)
- it counts working ticks into whole-shift station utilization
- it writes rolling utilization to StationState.utilization every 20 ticks
- it uses the tick count as the denominator before the window is full
- it accumulates starved seconds and blocked seconds separately
- it ignores damaged ticks for both
- it samples WIP once per second and records the peak
- it records order start on the first item bound to the order
- it records order completion when the status becomes complete
- it averages cycle time over completed orders only
- it attributes player seconds per station only while on a work tile
- it computes player utilization as working over present seconds
- it keeps a player who left mid-shift
- it writes PlayerState.utilization once per second
- it rewrites state.score once per second from gradeDay
- it passes book done and remaining seconds only for a book finish

**`game-server/tests/groove.test.ts`** (vitest, `makeWorld`)
- it builds the sample from floor items, shelves, starved and jammed stations and lit fuses
- it reports an on-time ship rate of zero when no truck departed in the window
- it divides completions by departures inside the sixty-second window
- it applies the delta to state.groove and clamps at the ends
- it zeroes grooveEvents after every tick
- it fires a clean sweep after the hold and snaps groove up to snapTo
- it raises the CLEAN SWEEP banner for hazards.bannerSeconds
- it does not fire again inside the cooldown
- it leaves a live banner from another system alone

**`game-server/tests/report.test.ts`** (vitest, `makeWorld`)
- it builds a report with every ReportPayload key and type
- it reports whole-shift station utilization in level order
- it picks the bottleneck and reports its starved and blocked seconds
- it sorts players by utilization then first seen
- it derives kegsExploded and fizzles from the destroyed counts
- it sums per-player stomps, saves and rides into the totals
- it charges waste for at-close and destroyed items and omits parts
- it zeroes the multiplier and the coin for an exploded day
- it zeroes the multiplier and the coin for an abandoned day
- it prices sticks on a docked truck as shipped but not complete
- it computes throughput per ten minutes of shift played
- it reports materials purchased as kegs made and shipped as sticks that left
- it resets the tally and metrics on onStart
- it sets no report on a sandbox level

**`resources/js/game/__tests__/report-format.test.ts`** (vitest, `npm run test:client`)
- it formats a clock as minutes and seconds
- it upper-cases the level name for the title
- it maps a station id to its label and an empty id to no station
- it renders the P&L lines from the payload
- it stamps a loss line for a negative profit
- it omits a hazard segment whose count is zero
- it omits the bubbles line when nobody bubbled

**In-app verification** (dev: `DEV_ALLOW_NO_TICKET=1`, three browser tabs, a local copy of Level 1
with `shiftSeconds` 90 for speed)
1. Start a day; open the debug overlay → `score` changes once a second and the Groove bar moves as
   kegs pile on the floor and clear. Screenshot the overlay.
2. Clear the floor and keep the shelves under half for four seconds → the `CLEAN SWEEP` banner appears
   once and does not repeat inside the cooldown; the Groove bar snaps up. Screenshot.
3. Let the clock run out with a few kegs made and one order shipped → all three tabs show the report.
   Screenshot: both columns, the letter, the bold kegs made/used line, the sparkline, the bottleneck
   line, the hazards lines.
4. Compare the report's station utilization bars with the numbers the debug overlay showed during the
   shift (rolling vs. whole-shift; they should bracket each other).
5. Blow up the factory (redline the Slammer with a full pile) → red F, `copy.report.fireMarshal`
   stamp, `× EXPLODED = 0 coin`, `Kegs exploded` and `Sooted` lines populated with names. Screenshot.
6. Tab 2 clicks NEXT DAY → the page reloads into a fresh room and the HUD reads Day 2 (F01 advanced it
   from the posted run). Tab 1 clicks BACK TO FACTORY → the factory page loads.
7. Run a Sandbox level to the point where a truck has left, then close the last tab → no report is
   drawn and the game-server log shows no `POST /internal/runs`.

## Tasks

- [ ] 1. `game-server/src/sim/tally.ts` (`RunTally`, `TallyKey`, `PlayerTallyKey`, `DestroyCause`,
      `ItemCounts`) + `game-server/tests/tally.test.ts` green.
- [ ] 2. `metrics.ts`: `createMetrics`, the WeakMap, per-station accumulation and the rolling
      `StationState.utilization` write — the five station tests in `metrics.test.ts` green.
- [ ] 3. `metrics.ts`: per-player accumulation and the `PlayerState.utilization` write — the four
      player tests green.
- [ ] 4. `metrics.ts`: the 1 Hz block (WIP, input fullness, order timings) — the WIP and order tests
      green.
- [ ] 5. `metrics.ts`: `snapshotMetrics`, `gradeInputsFor` and the 1 Hz `state.score` write — the last
      two `metrics.test.ts` tests green.
- [ ] 6. `game-server/src/sim/groove.ts`: the window rings and `GrooveSample` construction — the first
      three `groove.test.ts` tests green.
- [ ] 7. `groove.ts`: `grooveDelta`/`applyGroove` and draining `world.grooveEvents`; append the
      `grooveSystem` line to `systems.ts` after `dockSystem` — the delta tests green.
- [ ] 8. `groove.ts`: `cleanSweepStep`, the `snapTo` bump and the banner rules — the clean-sweep tests
      green.
- [ ] 9. `game-server/src/sim/day.ts`: `isSandbox` and `buildReport` — the first twelve
      `report.test.ts` tests green.
- [ ] 10. `day.ts`: `reportSystem` (`onStart`, `tick`, `onDayEnd`, the Sandbox branch); append its line
      last in `systems.ts` — the remaining `report.test.ts` tests green.
- [x] 11. `resources/js/game/report/format.ts` + `__tests__/report-format.test.ts` green under
      `npm run test:client`.
- [ ] 12. `resources/js/game/scenes/Report.ts`: header, both columns, station block, sparkline, hazard
      lines; register `ReportScene` in `main.ts`. In-app verification steps 3–5 with screenshots.
- [ ] 13. Report scene buttons (NEXT DAY, BACK TO FACTORY) and the EXPLODED / repeat-day captions;
      in-app verification steps 1, 2, 6, 7; tick the Status boxes.

## Risks & open questions

- **Counters live in other people's code.** Every site in the tally table is a one-line call in a
  system F11 does not own. If a site is missed the report shows 0 for that line and no F11 test can
  catch it — only the in-app steps. Each owning feature carries the bump in its own acceptance
  criteria (contract §10.7).
- **`state.score` in Sandbox is noise.** `bookTotal` is 0, so `onTime` is 0 and the running score sits
  low. Nothing reads it there (no report, no run row); the debug overlay is the only surface.
- **Sandbox runs unbounded.** `wipTimeline` grows one number per second (3.6 k an hour) and is never
  serialised in Sandbox because no report is built. Acceptable; if a Sandbox session runs for hours
  the array is the only thing that grows.
- **Banner arbitration.** F10 and F11 both write `banner`. `grooveSystem` ticks after `hazardsSystem`,
  so it only raises `CLEAN SWEEP` when the current banner has expired. A hazard banner therefore
  always wins the tick it is raised in; the contract fixes no other rule.
- **Keying player metrics by `userId`.** `run_players` is per user and a reconnecting player keeps
  their `sessionId`, but a player who leaves and rejoins gets a new one. Keying the accumulators by
  `userId` (as `RunTally.players` already is) merges the two sessions into one report row, which is
  what the report card is for.

**Contract change requested**

1. **§10.7 `RunTally` cannot compile as written — accepted.** The class declared both a field
   `destroyed: ItemCounts` and a method `destroyed(type, cause): void`; TypeScript rejects the
   duplicate member name. The method name is baked into F06 (§10.4) and F10 (§10.5) call sites, so the
   field was renamed. §9 and §10.7 now say `destroyedByType: ItemCounts` and `tally.ts` implements it.
2. **§8 `Copy.report` placeholder names are not pinned.** F11 renders `report.topPerformer` and
   `report.materials` through `fill(...)`. It fills `{name}` and `{station}` in the first and
   `{purchased}` and `{shipped}` in the second; §8 lists the keys but not their placeholders, so F12's
   wording and this list have to agree.

## Waste accounting — the counters split (contracts v2.2, 2026-09-09)

This doc above describes ONE destroy counter. There are now two, and the split is load-bearing.

`wasteOf` originally charged the P&L from `destroyedByType`, which is bumped at only two of the
ten `destroyItem` call sites — so material vaporised anywhere else was billed to nobody, and an
incident could make the day *more* profitable. The obvious fix, bumping `destroyed(type, cause)`
at the other sites, is wrong: §9 defines `kegsExploded = destroyedByType.keg` and
`fizzles = destroyedByType.stick`, so a wiped shelf would print `Fizzles: 4` for an incident in
which nothing fizzled.

So `RunTally` gained `wastedByType: ItemCounts` and `scrap(type)` alongside `destroyedByType`,
and `wasteOf` sums both:

- **The hazard lines** (`kegsExploded`, `fizzles`) read `destroyedByType`, which only a blast or
  a fizzle bumps.
- **The P&L** reads both, so every loss is billed exactly once under exactly one of them.

Scrapped (material lost): a damaged station's shelf wipe, an item with nowhere free to land, a
disconnect's carried item, the truck rider's cargo, the Jig's bailed half-used keg, and a keg
swallowed by the Blast Bin — that last one matters, because leaving it free made the bin a
waste-erasing disposal chute.

**Not scrapped**, and this is the one that would do real damage: the Jig's conversions — parts
onto the cradle, a keg drained by its last pour, a casing seated. That material becomes the
stick. Charging it would bill the factory for every stick it successfully sells, quietly making
a flawless shift unprofitable. Because the Jig funnels conversions and the bail keg through one
generic effect, `JigEffect` carries a `scrap?: true` discriminator that only `bail` sets.

Contracts §9 and §10.7 are authoritative; see also `docs/features/F10-hazards.md`.
