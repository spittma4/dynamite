# F02 — Shared package: schema, messages, config types + validation + defaults, pure sim rules
**Status:** [x] Design reviewed · [x] Implemented · [x] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/` (package.json, tsconfig.json, vitest.config.ts, `src/index.ts`, `src/schema/`, `src/messages.ts`, `src/config/{types.ts,schema.json,validate.ts,defaults.ts}`, `src/report.ts`, `src/sim/constants.ts`, `src/sim/tiles.ts`, `src/sim/curve.ts`, `src/sim/cycle.ts`, `src/sim/groove.ts`, `src/sim/scale.ts`, `src/sim/grade.ts`, `src/sim/bottleneck.ts`, `shared/tests/` for each of those plus the fixtures). Other owners add only their own `src/sim/<module>.ts` + `tests/<module>.test.ts` and append one `export * from './sim/<module>';` line to `src/index.ts` (contracts §1, §12): `movement.ts` F03, `stations.ts` F05, `items.ts` F06, `slammer.ts` F07, `jig.ts` F08, `orders.ts`/`dock.ts` F09, `hazards.ts` F10, `copy.ts` F12. The root `package.json` (workspaces) is F01's; the root `vitest.config.ts` is F04's.
**Reads:** `docs/features/00-contracts.md` §1–§5, §7–§13 · `docs/05-flow-mechanics.md` · `docs/12-data-model.md` · `docs/13-config-schema.md` · `docs/18-days-grades-and-payday.md` · `docs/19-scaling-3-to-10.md` · `docs/14-roadmap.md` · numbers cross-checked against `docs/02`, `03`, `04`, `10`, `16`, `17`.

## Goal

When this is done there is one TypeScript package, `shared/`, that the game server imports by relative
path and the client imports as `@shared`, and both agree on every rule that decides an outcome: the
authoritative state classes, the message names and payloads, the level/layout config types with a JSON
Schema that Laravel also reads and a defaults table that fills every optional tuning key, and the pure
functions for staffing efficiency, cycle time, Groove, player-count scaling, the report card, the P&L,
and the bottleneck estimate. A designer can change any number in a level JSON — or leave an optional
one out — and `validateLevelConfig` either names the fault or hands back a config with every default
applied, so no consumer ever branches on `undefined`. An engineer can write
`efficiencyFor(assembly.staffing, 7)` and get `0.65` on both sides of the wire; the end-of-day report's
grade is the same number whether Node or Laravel prints it.

## Scope

**In (M1):**
- `shared/` package scaffold: `package.json` (`"type": "module"`), `tsconfig.json`, `vitest.config.ts`, `src/index.ts` barrel.
- `@colyseus/schema` classes exactly per contracts §3 (`FactoryState`, `PlayerState`, `StationState`, `ItemState`, `FuseState`, `OrderState`, `TruckState`) with the §3 defaults and the string-union types for every enumerated field.
- `messages.ts` per contracts §4 and §7: name constants, payload types, and runtime guards for the five client messages that carry data.
- `config/types.ts`, `config/schema.json` (JSON Schema draft-07), `config/defaults.ts` (contracts §13), `config/validate.ts` (ajv on Node) for the M1 level config (contracts §8) and for `LayoutConfig`.
- `sim/constants.ts`, `sim/tiles.ts`, `sim/curve.ts`, `sim/cycle.ts`, `sim/groove.ts`, `sim/scale.ts` (one-line breakpoint; two-line shape in place), `sim/grade.ts`, `sim/bottleneck.ts`.
- `report.ts` types per contracts §9.
- Vitest tests for every pure function using the numbers in the design docs, plus a reference M1 level + layout fixture that passes validation.

**Out (later milestones):**
- Two-line cloning in `scaleLevel` (station `-b` suffixes, anchors from the layout, shared-station resizing) — **M2**. M1 throws a `RangeError` if a level's chosen breakpoint has `lines: 2`.
- `tileable(shape, pieces)` for Packing crate shapes — **M2** (Packing) / **M2+** (order-shaped crates); `sim/tiles.ts` in M1 is tile-index helpers only.
- Config keys for QA/Packing stations, events, upgrades, Payday, Hotfix, tolerances, Sand Bucket — **M2/M3/M4**. The M1 schema rejects unknown keys (root, `hazards` and `StationConfig` are `additionalProperties: false`) so nobody ships a key nothing reads; `dock.minigame.rattlyOkMs` and `laneIsSlot` are M2 and rejected.
- Rush-order revenue bonus (`economy.price.rushBonus`) — **M3**.
- A Node CLI for Laravel's admin JSON editor "validate" button (the semantic checks beyond the JSON Schema) — **M4**.
- Groove music layers, klaxon, and the ON FIRE flourish — **M2** presentation. The Groove *numbers* (`grooveDelta`, bands, Clean Sweep) are M1 because `FactoryState.groove`, the `CLEAN SWEEP`/`NICE SAVE` banners, and the grade's `cleanSweeps` term are in the M1 contract.

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/package.json` | `@dynamite/shared`, private, `"type": "module"`; `exports`: `"."` → `./src/index.ts`, `"./config/validate"` → `./src/config/validate.ts`, `"./config/schema.json"` → `./src/config/schema.json`; deps `@colyseus/schema` (pinned to the version `colyseus@0.18` depends on), `ajv`; dev `typescript`, `vitest`; scripts `test`, `typecheck`. |
| `shared/tsconfig.json` | `strict`, `target ES2022`, `module ESNext`, `moduleResolution bundler`, `resolveJsonModule`, `isolatedModules`, decorator flag per the installed schema version (Task 1). |
| `shared/vitest.config.ts` | `include: ['tests/**/*.test.ts']`. |
| `shared/src/index.ts` | Barrel: schema, messages, config types + defaults, report types, sim. **Does not** export `config/validate.ts` (keeps ajv out of the client bundle). Every other module owner appends one `export *` line here. |
| `shared/src/schema/types.ts` | The thirteen string unions for the enumerated schema fields, listed under Interfaces. |
| `shared/src/schema/FactoryState.ts` | Root state class. |
| `shared/src/schema/PlayerState.ts` | Player class. |
| `shared/src/schema/StationState.ts` | Station class. |
| `shared/src/schema/ItemState.ts` | Item class. |
| `shared/src/schema/FuseState.ts` | Fuse class. |
| `shared/src/schema/OrderState.ts` | Order class. |
| `shared/src/schema/TruckState.ts` | Truck class. |
| `shared/src/schema/index.ts` | Re-exports the seven classes and `types.ts`. |
| `shared/src/messages.ts` | Message name constants, payload types, `is*Msg` guards. |
| `shared/src/config/types.ts` | `LevelConfig`, `StationConfig`, `LayoutConfig`, `HazardsConfig`, `OrdersConfig` and their sub-types. |
| `shared/src/config/schema.json` | JSON Schema draft-07 for `LevelConfig` (root) with `definitions.LayoutConfig`. Read by Laravel by path. |
| `shared/src/config/defaults.ts` | Contracts §13: the default for every optional level key, and `applyDefaults(level)`. |
| `shared/src/config/validate.ts` | ajv wrapper + semantic rules + defaults: `validateLevelConfig`, `validateLayoutConfig`, `validateLevelOnLayout`. Node only. |
| `shared/src/report.ts` | `ReportPayload`, `RunPayload`, and the types they use. |
| `shared/src/sim/constants.ts` | Contract-fixed numbers that are not in the level JSON. |
| `shared/src/sim/tiles.ts` | Tile packing, `'x,y'` keys, `tileOf`, bounds, 8-neighbourhood, facing. |
| `shared/src/sim/curve.ts` | `efficiencyFor`, `peakWorkers`. |
| `shared/src/sim/cycle.ts` | `machineSeconds`, `cycleSeconds`. |
| `shared/src/sim/groove.ts` | `grooveDelta`, `applyGroove`, `grooveBand`, `churnDepth`, `cleanSweepStep`. |
| `shared/src/sim/scale.ts` | `breakpointFor`, `scaleLevel`. |
| `shared/src/sim/grade.ts` | `gradeDay`, `letterFor`, `verdictFor`, `profitAndLoss`, `utilizationLabel`. |
| `shared/src/sim/bottleneck.ts` | `bottleneckStation` (docs/05 pressure formula). |
| `shared/tests/fixtures/level-m1.json` | Reference one-line level with the docs' numbers; the worked example F12's levels must also pass. F01 copies it into `config/game/levels/` (renaming `key`) until F12 lands. |
| `shared/tests/fixtures/layout-one-line.json` | 28×18 layout the fixture level sits on, including `truckBay` and `props`. |
| `shared/tests/schema.test.ts` · `messages.test.ts` · `defaults.test.ts` · `validate.test.ts` · `tiles.test.ts` · `curve.test.ts` · `cycle.test.ts` · `groove.test.ts` · `scale.test.ts` · `grade.test.ts` · `bottleneck.test.ts` | One test file per module. |

### Interfaces

**Consumes**
- Contracts §3 field names and types (the schema classes are a transcription, not a design).
- Contracts §4 message names and payloads; §7 `mg` ops and join modes.
- Contracts §8 `LevelConfig`/`StationConfig`/`LayoutConfig` keys; §9 `ReportPayload`/`RunPayload`; §13 the default table.
- `@colyseus/schema`: `Schema`, `type`, `MapSchema`, `ArraySchema`.
- `ajv` (draft-07 is Ajv 8's default dialect), in `config/validate.ts` only.
- `Copy` from `shared/src/copy.ts` (F12) — a type-only import in `messages.ts` for `ConfigMsg`.
- From the game server (F03): the config blob from `GET /internal/factories/{id}/config?players=N` — `level` is a `LevelConfig`, `layout` a `LayoutConfig`; F03 calls `validateLevelConfig`, `validateLayoutConfig`, `validateLevelOnLayout` at room create and throws `new Error(errors.join('\n'))` on `ok: false`, then `scaleLevel` at `start`.
- From the client (F04): Vite alias `@shared` → `./shared/src`; the client imports the barrel only (no subpath imports) and never `config/validate`; the client tsconfig includes `../../shared/src` with the same decorator setting as `shared/tsconfig.json`.

**Produces** — every name below is exported from `shared/src/index.ts` unless marked *validate-only*.

Schema (`shared/src/schema/`), transcribed from contracts §3:

```ts
export type Phase = 'lobby' | 'running' | 'ended';
export type StationType = 'boom_powder' | 'assembly' | 'dock';
export type StationRunState = 'idle' | 'starved' | 'working' | 'jammed' | 'damaged';
export type ItemType = 'keg' | 'casing' | 'stick' | 'crate' | 'parts';
export type ShelfSide = 'in' | 'out' | '';
export type Chore = '' | 'stomp' | 'unjam' | 'sweep' | 'repair';
export type Banner = 'WHOOPS' | 'INCIDENT' | 'EXPLODED' | 'NICE SAVE' | 'CLEAN SWEEP' | 'HOT STREAK' | 'TAILGATE' | '';
export type Beacon = 'off' | 'gold' | 'red';
export type TruckPhase = 'away' | 'docked' | 'leaving';
export type OrderStatus = 'open' | 'partial' | 'complete' | 'failed';
export type FuseLength = 'short' | 'long' | '';
export type Line = 'a' | 'b';
export type Product = 'red_stick';

export class FactoryState extends Schema {
  levelKey: string; layoutKey: string; day: number; phase: string;   // Phase
  clock: number; shiftSeconds: number; host: string;
  groove: number; score: number; coin: number;
  bookTotal: number; bookRemaining: number;
  players: MapSchema<PlayerState>; stations: MapSchema<StationState>;
  items: MapSchema<ItemState>; orders: MapSchema<OrderState>; fuses: MapSchema<FuseState>;
  spillTiles: ArraySchema<number>; scorchTiles: ArraySchema<number>;
  truck: TruckState; banner: string; bannerUntil: number; width: number; height: number;
}
export class PlayerState extends Schema {
  userId: string; name: string; colour: number; line: string;
  x: number; y: number; facing: number; moving: boolean; speed: number;
  stationId: string; workTile: string; clipboardUntil: number;
  carrying: string;                                   // item id, 'broom', or ''
  chore: string; choreUntil: number;                  // Chore
  stunnedUntil: number; sooted: boolean; combo: number;
  bubble: string; bubbleUntil: number; drivenOffUntil: number; seq: number; utilization: number;
}
export class StationState extends Schema {
  id: string; type: string; line: string; anchorX: number; anchorY: number;
  state: string; progress: number;                    // StationRunState
  workers: number; efficiency: number; interruptsPerSecond: number;
  inputShelf: ArraySchema<string>; outputShelf: ArraySchema<string>; inputCap: number; outputCap: number;
  floorCount: number; utilization: number; jamUntil: number; pausedUntil: number; beacon: string; mg: string;
}
export class ItemState extends Schema {
  id: string; type: string; x: number; y: number; holder: string; shelf: string;
  inFlight: boolean; flightT: number; fromX: number; fromY: number; toX: number; toY: number;
  quality: number; prime: boolean; dents: number; fuseLength: string; fill: number;
  capLoose: boolean; frayed: boolean; orderId: string; lit: boolean;
}
export class FuseState extends Schema { itemId: string; x: number; y: number; secondsLeft: number; chain: boolean }
export class OrderState extends Schema { id: string; product: string; qty: number; shipped: number; status: string; truckId: number; fuseLength: string }
export class TruckState extends Schema { id: number; phase: string; arrivesAt: number; leavesAt: number; slots: number; loaded: number; beepPhase: number }
```

Semantics fixed here for every consumer:
- **One time base.** `FactoryState.clock` is seconds, advances every tick in *every* phase, and resets
  to 0 on `start`. Every `*Until`/`*At` field (`bannerUntil`, `clipboardUntil`, `choreUntil`,
  `stunnedUntil`, `bubbleUntil`, `drivenOffUntil`, `jamUntil`, `pausedUntil`, `arrivesAt`, `leavesAt`)
  and every timestamp inside `StationState.mg` is in `clock` seconds, so the client compares them with
  its `ServerClock` estimate of `clock`, never with `Date.now()`. Client input timestamps (`mg.t`,
  `action.t`, `interact.t`) are `performance.now()` ms and reach `clock` seconds only through F03's
  `World.inputClock(sessionId, tMs)`.
- **Locations** (contracts §3): floor `holder === '' && x >= 0`; held `holder = sessionId, x = y = -1`;
  shelved `holder = stationId, shelf ∈ 'in'|'out', x = y = -1`; dock lane `holder = 'dock-a', shelf = '', x/y` = the lane tile; in flight `holder = '', inFlight = true`.
- `StationState.mg` is `''` when the overlay has nothing to draw, otherwise `JSON.stringify` of a plain
  object whose shape the station's module defines (§7); a client that fails to parse it treats it as `''`.
- `FactoryState.score` is the running report-card score from `gradeDay`, written only by F11.
- `spillTiles`/`scorchTiles` hold `packTile(x, y, width)` indices. `fuses` is keyed by item id for a keg
  fuse and `'t-' + packTile(x, y, width)` for a spill-tile fuse.
- `carrying` is an item id, the sentinel `'broom'`, or `''`; the broom is not an `ItemState`.
- `inputCap`/`outputCap` are 0 when the station has no shelf of that side (both 0 at the dock).

Messages (`shared/src/messages.ts`), per contracts §4:

```ts
export const ClientMsg = { input: 'input', interact: 'interact', action: 'action', mg: 'mg',
  leave: 'leave', emote: 'emote', start: 'start', config: 'config' } as const;
export const ServerMsg = { config: 'config', fx: 'fx', toast: 'toast', report: 'report' } as const;

export type Axis = -1 | 0 | 1;
export type EmoteKind = 'stop' | 'help' | 'go' | 'what';
export type ToastKind = 'info' | 'warn' | 'good' | 'bad';
export type MgOp = 'mash' | 'charge' | 'release' | 'seat' | 'pour' | 'knot' | 'crimp' | 'pick' | 'fetch' | 'swing' | 'toss' | 'shove' | 'tailgate';
export type FxKind = 'thunk' | 'spark' | 'fuse' | 'blast' | 'fizzle' | 'snap' | 'whump' | 'horn' | 'slam' | 'chime' | 'clink' | 'pfft' | 'bonk' | 'slop';

export type InputMsg = { dx: Axis; dy: Axis; seq: number };
export type InteractMsg = { t?: number };
export type ActionMsg = { t: number };
export type MgMsg = { stationId: string; op: MgOp; t: number; v?: number | string };
export type LeaveMsg = Record<string, never>;
export type EmoteMsg = { kind: EmoteKind };
export type StartMsg = Record<string, never>;
export type ConfigRequestMsg = Record<string, never>;
export type FxMsg = { kind: FxKind; x: number; y: number; size?: number; text?: string };   // x/y in tile units
export type ToastMsg = { text: string; kind: ToastKind };
export type ConfigMsg = { level: LevelConfig; layout: LayoutConfig; copy: Copy };

export function isInputMsg(p: unknown): p is InputMsg;
export function isInteractMsg(p: unknown): p is InteractMsg;
export function isActionMsg(p: unknown): p is ActionMsg;
export function isMgMsg(p: unknown): p is MgMsg;
export function isEmoteMsg(p: unknown): p is EmoteMsg;
```

Guards exist because client payloads are untrusted and four server features would otherwise each
hand-roll the same checks. `isMgMsg` checks `op` against the `MgOp` list and `v` against
`number | string | undefined`; `isInteractMsg` accepts `{}` and `{ t: number }`; per-op `v` meaning is
the station module's to check.

Config (`shared/src/config/types.ts`) — full key list in Data & config:

```ts
export type Tile = [number, number];
export type StaffingCurve = Record<string, number>;          // JSON keys are strings: { "1": 1.0, "2": 1.05 }
export interface LevelConfig { key; name; notes?; day; players; layout; groove; clipboardSeconds;
  clipboardMemorySeconds?; interrupts?; movement?; bpm; windowFloorsMs; carry; stations; recipes;
  orders: OrdersConfig; hazards: HazardsConfig; grading; scoring?; economy; scaling; copy? }
export interface StationConfig { id; type; line; joinMode: 'press' | 'stand'; anchor; workTiles; rackTiles;
  inputShelf?; outputShelf?; floorRing; nominalSeconds; floorSeconds; staffing; churnSensitive; minigame }
export type MinigameConfig = BoomPowderMinigame | AssemblyMinigame | DockMinigame;   // discriminated by the station's type
export interface HazardsConfig { fuseSeconds; chainFuseSeconds; blastRadius; chainWindowSeconds;
  sparks: { slammerRedline; jammedPer10s; crimpOnDented }; fuel: { floorKeg; spillTile; shelfKeg };
  incidentThreshold; factoryExplosionThreshold; explosionEndsRound; dangerWarningAt; stompSeconds;
  stunSeconds; knockbackTiles; litKegCarry; unjamSeconds?; sweepSecondsPerTile?; repairSeconds?; bannerSeconds? }
export interface OrdersConfig { firstAt; everySeconds; truckWaitSeconds;
  mix: { type: string; weight: number }[]; qtyPerTruck: { base; rampPerMinute } }
export interface LayoutConfig { key; width; height; walls: number[]; spawn: Tile;
  breakRoom: [number, number, number, number]; blastBins: Tile[]; dockDoor: [number, number, number];
  truckBay: [number, number, number, number]; ramp: Tile[]; beaconPoles: Record<string, Tile>;
  orderBoard: Tile; props: { toolCart: Tile; countdownSign: Tile; returnsPile: Tile; broomHook: Tile } }
```

`HazardsConfig` lives here (not in F10's `sim/hazards.ts`) because the schema owns the key list; F10
imports it. `OrdersConfig` likewise types `LevelConfig.orders` (see Contract change requested 4).

Defaults (`shared/src/config/defaults.ts`) — contracts §13:

```ts
export const LEVEL_DEFAULTS: {
  movement: { tilesPerSecond: 4; playerRadius: 0.35; bumpStaggerSeconds: 0.3; floorItemSpeed: 0.4; spillSpeed: 0.6 };
  clipboardMemorySeconds: 60;
  interrupts: { everySeconds: 6; pauseSeconds: 0.5 };
  carry: { putDownSeconds: 0.3; hitStaggerSeconds: 0.5 };
  hazards: { unjamSeconds: 4; sweepSecondsPerTile: 1.5; repairSeconds: 10; bannerSeconds: 3 };
  groove: { weights: { truckComplete: 10 } };
  scoring: { perOrder: 100 };
  grading: { advanceOn: 'C' };
  minigame: { boom_powder: { heat: { overholdMs: 500 }; comboBannerSeconds: 2 };
              assembly: { casings: { stock: 3; dentChance: 0.3 } };
              dock: { tailgateHoldSeconds: 0.5; leaveSeconds: 1.5 } };
};
export function applyDefaults(level: LevelConfig): LevelConfig;   // deep copy; fills every missing leaf above
```

Validation (`shared/src/config/validate.ts`, *validate-only*: import as `@dynamite/shared/config/validate` or `../shared/src/config/validate`):

```ts
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
export function validateLevelConfig(input: unknown): ValidationResult<LevelConfig>;   // value = applyDefaults(input)
export function validateLayoutConfig(input: unknown): ValidationResult<LayoutConfig>;
export function validateLevelOnLayout(level: LevelConfig, layout: LayoutConfig): string[];   // [] = ok
```

Sim:

```ts
// curve.ts
export function efficiencyFor(curve: StaffingCurve, workers: number): number;
export function peakWorkers(curve: StaffingCurve): number;

// cycle.ts
export interface CycleInputs { floorSeconds: number; efficiency: number; churnSensitive: boolean; churnDepth: number; lastCycleWasPerfect: boolean; executionSeconds: number; bubblesThisCycle: number }
export function machineSeconds(i: CycleInputs): number;
export function cycleSeconds(i: CycleInputs): number;

// groove.ts
export interface GrooveSample { onTimeShipRate: number; avgShelfFullness: number; floorItemCount: number; reworkShelfCount: number; starvedStationCount: number; jammedStationCount: number; litFuseCount: number }
export interface GrooveEvents { fizzles: number; niceSaves: number; blastKegs: number; primeSticks: number; trucksComplete: number }
export type GrooveBand = 'onFire' | 'groove' | 'baseline' | 'churn' | 'meltdown';
export function grooveDelta(w: GrooveWeights, s: GrooveSample, e: GrooveEvents, dtSeconds: number): number;
export function applyGroove(groove: number, delta: number): number;              // clamp 0–100
export function grooveBand(groove: number, t: GrooveThresholds): GrooveBand;
export function churnDepth(groove: number, t: GrooveThresholds): number;         // 0–1
export interface CleanSweepState { heldSince: number | null; lastFiredAt: number | null }
export function cleanSweepStep(state: CleanSweepState, s: GrooveSample, clock: number, c: CleanSweepConfig): { state: CleanSweepState; fire: boolean };

// scale.ts
export type ScaledLevel = LevelConfig & { breakpoint: ScalingBreakpoint; lines: Line[] };
export function breakpointFor(level: LevelConfig, players: number): ScalingBreakpoint;
export function scaleLevel(level: LevelConfig, players: number): ScaledLevel;

// grade.ts
export interface GradeInputs { ordersCompleted: number; ordersTotal: number; peakWip: number; complaints: number; shipped: number; avgCycleSeconds: number; incidents: number; cleanSweeps: number; niceSaves: number; bookDone: boolean; remainingSeconds: number; exploded: boolean }
export interface DayGrade { score: number; grade: Grade; verdict: Verdict; multiplier: number }
export function gradeDay(i: GradeInputs, grading: GradingConfig, day: DayConfig): DayGrade;
export function letterFor(score: number, t: GradeThresholds): Grade;
export function verdictFor(onTime: number, peakWip: number, grading: GradingConfig, exploded: boolean): Verdict;
export interface PnlInputs { shipped: Partial<Record<Product, number>>; waste: Partial<Record<ItemType, number>> }
export function profitAndLoss(i: PnlInputs, economy: EconomyConfig, multiplier: number): Pnl;
export function utilizationLabel(utilization: number): PlayerLabel;

// bottleneck.ts
export interface StationPressure { id: string; utilization: number; inputShelfFullness: number }
export function bottleneckStation(stations: StationPressure[]): string;         // '' when the list is empty

// tiles.ts — the only definitions of these in the repo (contracts §10)
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export function tileOf(x: number, y: number): Tile;                               // Math.floor both
export function packTile(x: number, y: number, width: number): number;
export function unpackTile(index: number, width: number): Tile;
export function tileKey(x: number, y: number): string;                            // 'x,y'
export function parseTileKey(key: string): Tile | null;
export function inBounds(x: number, y: number, width: number, height: number): boolean;
export function neighbours8(x: number, y: number, width: number, height: number): Tile[];
export function facingFrom(dx: number, dy: number, previous: Facing): Facing;
export function facingVector(f: Facing): { dx: number; dy: number };            // unit length
```

Report (`shared/src/report.ts`), per contracts §9:

```ts
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Verdict = 'EXPLODED' | 'DISASTER' | 'ROUGH' | 'FINE' | 'SMOOTH' | 'FLOW';
export type PlayerLabel = 'EXCELLENT' | 'GOOD' | 'NEEDS FOCUS';
export type RunStatus = 'ended' | 'exploded' | 'abandoned';
export type EndReason = 'book' | 'clock' | 'exploded' | 'abandoned';
export interface BottleneckSummary { stationId: string; starvedSeconds: number; blockedSeconds: number }
export interface StationReport { id: string; utilization: number }
export interface PlayerReport { userId: string; name: string; utilization: number; label: PlayerLabel; topStation: string;
  bubbles: number; drops: number; sooted: number; fusesStomped: number; niceSaves: number; truckRides: number }
export interface Pnl { revenue: number; waste: number; profit: number; multiplier: number; coin: number }   // profit, coin integers
export interface Materials { purchased: number; shipped: number }   // purchased = kegs made; shipped = sticks that left on a truck
export interface ReportPayload { day; levelKey; grade: Grade; score; verdict: Verdict;
  ordersCompleted; ordersTotal; throughput; avgCycleSeconds; peakWip; wipTimeline: number[];
  kegsMade; kegsUsed; defects; rework; kegsExploded; fusesStomped; fizzles; niceSaves; truckRides;
  bottleneck: BottleneckSummary; stations: StationReport[]; players: PlayerReport[]; pnl: Pnl; materials: Materials }
export type RunPayload = ReportPayload & { factoryId: string; seed: number; startedAt: string; endedAt: string; status: RunStatus };
```

Field semantics fixed here: `throughput` = orders completed per **10 minutes** of shift played
(`round1(ordersCompleted × 600 / max(1, clockAtEnd))`); `avgCycleSeconds` = mean of (completed −
started) over completed orders, 0 when none; `wipTimeline` is one sample per second from shift start;
`kegsUsed` = kegs taken off an input shelf by the Jig; `kegsExploded` = kegs destroyed by a blast;
`fizzles` = sticks destroyed by fizzle; `fusesStomped`/`niceSaves`/`truckRides` are sums over players;
`sooted` on `PlayerReport` is a **count**, not the boolean of `PlayerState.sooted`; `rework`,
`complaints` and `cleanSweeps` are 0 in M1; `startedAt`/`endedAt` are ISO-8601 UTC strings;
`seed` is the room's RNG seed; `factoryId` is a **string** (Laravel's `integer` rule accepts it).
F11 builds the payload; F02 only defines the shape and the pure functions it is built from.

Constants (`shared/src/sim/constants.ts`) — see Data & config for values.

### Data & config

**Level config keys the M1 schema accepts (root `additionalProperties: false`).** `?` marks an
optional key whose default `validateLevelConfig` applies (contracts §13); values are the starting
numbers from the docs.

| Key | Starting value | Source |
|---|---|---|
| `key` | `"level-01-basic-flow"` pattern `^[a-z0-9-]+$` | docs/13 |
| `name` | string | docs/13 |
| `notes?` | free string; nothing reads it | contracts §13 |
| `day` | `{ shiftSeconds: 600, orderBook: 11, endsOn: 'either', earlyFinishBonusPerMinute: 5, earlyFinishCap: 10 }`; `endsOn` enum `either\|book\|clock\|never` | docs/18, contracts §8 |
| `players` | `{ min: 3, max: 10 }` (`max ≤ 10`, `min ≤ max`; `min ≥ 1` only when `endsOn === 'never'`, else `min ≥ 3`) | docs/19, contracts §8 |
| `layout` | `"one-line"` — default layout key; a breakpoint may override | docs/13, docs/19 |
| `groove.start` | `50` | docs/05 |
| `groove.weights` | `{ onTimeShip: 8, shelfFullness: -4, floorItem: -0.5, rework: -1, starved: -2, jammed: -1, litFuse: -3, fizzle: -2, niceSave: 3, blastKeg: -10, primeStick: 1, truckComplete?: 10 }` — every Groove impulse lives here; there is no `hazards.niceSaveGroove`, `hazards.blastGroovePerKeg`, `carry.drop.fizzleGroove` or `scoring.grooveOnComplete` | docs/13, docs/16, docs/17, docs/04; contracts §8 |
| `groove.thresholds` | `{ onFire: 85, groove: 70, churn: 30, meltdown: 10 }` | docs/13 |
| `groove.cleanSweep` | `{ holdSeconds: 3, snapTo: 60, cooldownSeconds: 90 }` | docs/13 |
| `clipboardSeconds` | `3` | docs/13 |
| `clipboardMemorySeconds?` | `60` (F05) | contracts §13 |
| `interrupts?` | `{ everySeconds: 6, pauseSeconds: 0.5 }` (F05) | contracts §13 |
| `movement?` | `{ tilesPerSecond: 4, playerRadius: 0.35, bumpStaggerSeconds: 0.3, floorItemSpeed: 0.4, spillSpeed: 0.6 }` (F03 movement + `World.tileSpeed`, F04 prediction) | contracts §2, §13 |
| `bpm` | `150` | docs/13 |
| `windowFloorsMs` | `{ ok: 100, perfect: 45 }` | docs/13, docs/04 |
| `carry` | `{ slowdown: 0.2, throwTiles: 2, throwFlightSeconds: 0.5, catchOkMs: 150, catchPerfectMs: 75, drop: { kegKnockOverOnHit: true, stickFizzleChance: 0.3, crateRattlyOnDrop: true }, truckRideSeconds: 20, footprints: false, putDownSeconds?: 0.3, hitStaggerSeconds?: 0.5 }` | docs/17, contracts §13 |
| `stations[]` | `StationConfig` (below), 1–16 entries | docs/13 |
| `recipes` | `{ keg: { station: 'boom_powder', inputs: {}, output: { type: 'keg', pours: 2 } }, red_stick: { station: 'assembly', inputs: { casing: 1, pour: 1, fuse: 1, cap: 1 }, output: { type: 'stick', product: 'red_stick' } } }` — `inputs` is `Record<string, integer ≥ 1>`; `output.product` optional; `cycleMultiplier` optional (default 1) | docs/13 |
| `orders` | `{ firstAt: 20, everySeconds: 60, truckWaitSeconds: 20, mix: [{ type: 'red_stick', weight: 10 }], qtyPerTruck: { base: 8, rampPerMinute: 0.5 } }` | docs/13 |
| `hazards` | `{ fuseSeconds: 6, chainFuseSeconds: 1.5, blastRadius: 1, chainWindowSeconds: 3, sparks: { slammerRedline: 1.0, jammedPer10s: 0.5, crimpOnDented: 0.3 }, fuel: { floorKeg: 1, spillTile: 1, shelfKeg: 1 }, incidentThreshold: 4, factoryExplosionThreshold: 10, explosionEndsRound: true, dangerWarningAt: 0.5, stompSeconds: 1.0, stunSeconds: 2, knockbackTiles: 2, litKegCarry: true, unjamSeconds?: 4, sweepSecondsPerTile?: 1.5, repairSeconds?: 10, bannerSeconds?: 3 }` — `additionalProperties: false`; blast-bin positions are `LayoutConfig.blastBins` | docs/16, docs/17, contracts §8, §13 |
| `grading.weights` | `{ onTime: 50, wip: 20, quality: 15, cycle: 15, incident: -5, heroCap: 10 }` | docs/18 |
| `grading.thresholds` | `{ A: 90, B: 75, C: 60, D: 40 }` | docs/18 |
| `grading.targets` | `{ wip: 16, cycleSeconds: 240 }` | docs/18 |
| `grading.multiplier` | `{ A: 1.5, B: 1.25, C: 1.0, D: 0.75, F: 0.5 }` | docs/18 |
| `grading.verdict` | `{ flow: 1.0, smooth: 0.75, fine: 0.5, rough: 0.25 }` — `onTime` lower bounds; below `rough` is DISASTER | docs/10 names the verdicts; thresholds are this doc's |
| `grading.advanceOn?` | `'C'` — highest grade rank that unlocks the next level (F01 `StoreRun`) | contracts §5, §13 |
| `scoring?` | `{ perOrder: 100 }` — read by F09 `truckCredit` for the departure toast only; never added to `FactoryState.score` | contracts §8, §13 |
| `economy` | `{ price: { red_stick: 10 }, wasteCost: { keg: 4, casing: 2, stick: 6, crate: 8 } }` — `price` is `Record<Product, number>`; `wasteCost` is `Partial<Record<ItemType, number>>` (a type with no entry costs 0) | docs/18 |
| `scaling.breakpoints[]` | `[{ maxPlayers: 6, lines: 1, truckEverySeconds: 60, orderBook: 11 }, { maxPlayers: 10, lines: 2, truckEverySeconds: 45, orderBook: 20, layout: 'two-line' }]` — `layout` optional; `lines` enum `1\|2`; ascending `maxPlayers` | docs/19 |
| `copy?` | `{ clipboard: string[] }` with `additionalProperties: true` on this object only, because joke text must be editable without a schema change (docs/13). Absent → `clipboardLines()` falls back to the global `copy.clipboard`. | docs/02, docs/13 |

**`StationConfig`** (`additionalProperties: false`):

| Key | Constraint | Fixture values (powder-a · assembly-a · dock-a) |
|---|---|---|
| `id` | `^(powder\|assembly\|dock)-[ab]$` and equals `STATION_SHORT[type] + '-' + line` | `powder-a` · `assembly-a` · `dock-a` |
| `type` | `StationType` | `boom_powder` · `assembly` · `dock` |
| `line` | `Line`; M1 template stations are all `'a'` | `a` |
| `joinMode` | required, `'press' \| 'stand'` (contracts §7) | `press` · `press` · `stand` |
| `anchor` | `Tile`, in bounds; furniture, normally a wall | assembly uses docs/13's `[12, 8]` |
| `workTiles` | `Tile[]`, ≥ 1 | 1 · 2 (`[[13,9],[14,9]]`) · 4 |
| `rackTiles` | `Tile[]`, may be empty | `[]` · `[[16,9]]` · `[]` |
| `inputShelf` | optional/nullable `{ tile: Tile, capacity: integer ≥ 1, accepts: ItemType[] ≥ 1 }` | absent · `{ tile: [12,9], capacity: 8, accepts: ['keg','casing'] }` · absent |
| `outputShelf` | optional/nullable `{ tile: Tile, capacity: integer ≥ 1 }` | capacity 6 · capacity 4 (`tile [12,11]`) · absent |
| `floorRing` | `{ tiles: Tile[] }`, ≥ 1 | 9 tiles · 9 tiles (docs/13 list) · 4 tiles |
| `nominalSeconds` / `floorSeconds` | `> 0`, `floorSeconds ≤ nominalSeconds` | 2.8 / 1.4 · 6.0 / 5.0 · 1.0 / 1.0 (dock: one shove per 1 Hz beep — derived from `beepHz`, not a documented number) |
| `staffing` | keys positive-integer strings, values `≥ 0`, ≥ 1 entry | `{1:1.0, 2:1.05, 3:0.9, 4:0.75}` · `{1:0.6, 2:1.0, 3:1.15, 4:1.1, 5:0.95, 6:0.8, 8:0.5}` · `{1:1.0, 2:1.6, 3:1.9, 4:1.8, 5:1.5, 6:1.2, 8:1.0}` (docs/05 table) |
| `churnSensitive` | boolean | `true` · `false` · `false` (docs/04: only the Slammer's band drifts in the Churn) |
| `minigame` | by `type`, below | |

`minigame` by station type (all windows in ms; docs/13 station comments, docs/04; `?` keys default per §13):

- `boom_powder`: `{ heat: { minChargeSeconds: 0.7, maxChargeSeconds: 1.5, okMsAtMaxCharge: 225, okMsAtMinCharge: 105, deadCenterMs: 50, churnBandDrift: 0.08, overholdMs?: 500 }, comboTiers: [10, 25, 50], overflowSpills: true, comboBannerSeconds?: 2 }`
- `assembly`: `{ pour: { beatsByQuality: { "1.0": 5, "0.7": 7, "0.4": 8 }, perfectMs: 60, okMs: 140, primeKegWindowMultiplier: 1.5 }, knots: { long: 3, short: 2, secondsPerKnot: 0.4, perfectMs: 60, okMs: 140 }, crimp: { clicks: 3, clickSeconds: 0.2, perfectMs: 80, okMs: 200 }, toss: { arcSeconds: 0.5, perfectMs: 120, okMs: 250 }, casings?: { stock: 3, dentChance: 0.3 } }` — `casings` configures F08's input-shelf feeder, the M1 casing supply
- `dock`: `{ beepHz: 1, perfectMs: 70, okMs: 180, tailgateWindowSeconds: 3, tailgateHoldSeconds?: 0.5, leaveSeconds?: 1.5 }`

**`LayoutConfig`** (contracts §8): `key` pattern `^[a-z0-9-]+$`; `width`, `height` integers ≥ 8;
`walls` packed `y × width + x` indices each `< width × height` — the **complete impassable set**
(border, station footprints, every drawn shelf tile, poles, boards, carts, signs, hooks);
`spawn`, `orderBoard`, `blastBins`, `ramp`, `beaconPoles` values and all four `props` tiles in bounds;
`breakRoom: [x, y, w, h]`, `truckBay: [x, y, w, h]` and `dockDoor: [x, y, w]` inside bounds;
`ramp: Tile[]` ≥ 1; `props: { toolCart, countdownSign, returnsPile, broomHook }` all required.
Work, rack, ring, `ramp`, `truckBay`, `spawn`, `blastBins`, `props.returnsPile` and `breakRoom` tiles
are never walls; `blastBins` and `props.returnsPile` are floor tiles with a meaning when an item lands.
Fixture: 28 × 18 (docs/02 MVP map), one blast bin at `[3,3]` (docs/16).

**Constants** (`sim/constants.ts`) — contracts §13's "constants that stay in code": numbers fixed by
the contract and not tunable per level.

| Name | Value | Source |
|---|---|---|
| `TICK_HZ` / `TICK_SECONDS` | `20` / `0.05` | contracts §2 |
| `TILE_PX` | `32` | contracts §2 |
| `STUNNED_SPEED_MULT` | `0` | contracts §2 |
| `INPUT_HEARTBEAT_MS` | `250` | contracts §4 |
| `MAX_CLIENTS` / `RECONNECT_SECONDS` | `10` / `30` | contracts §5, docs/19 |
| `PLAYER_COLOURS` | `8` | contracts §3 |
| `MAX_INPUT_BACKDATE_S` | `0.2` | contracts §7, §10.1 (F03 `inputClock` clamp) |
| `CYCLE` | `{ churnFactorMax: 1.15, perfectRearmFactor: 0.75, interruptSecondsPerBubble: 0.5 }` | docs/05 |
| `HERO_POINTS_PER_EVENT` | `2` | docs/18 (`2 × cleanSweeps + 2 × niceSaves`) |
| `UTILIZATION_LABELS` | `{ excellent: 0.9, good: 0.6 }` — `excellent` docs/09; `good` chosen so docs/10's 77% reads GOOD and 44% NEEDS FOCUS | |
| `ITEM_ID_PREFIX` | `{ keg: 'k', casing: 'c', stick: 's', crate: 'x', parts: 'p' }` | contracts §3 |
| `STATION_SHORT` | `{ boom_powder: 'powder', assembly: 'assembly', dock: 'dock' }` | contracts §3 |
| `BANNERS` | the `Banner` union as an array | contracts §3 |

`WALK_SPEED`, `FLOOR_ITEM_SPEED_MULT`, `SPILL_SPEED_MULT`, `BUMP_STAGGER_SECONDS`, `PUT_DOWN_SECONDS`,
`CLIPBOARD_RECENCY_SECONDS`, `UNJAM_SECONDS` and `INTERRUPT_EVERY_SECONDS` do **not** exist: those
numbers are the optional config keys above, defaulted in `defaults.ts` (contracts §13).

**Schema defaults** (what `new X()` holds, contracts §3): strings `''`, numbers `0`, booleans `false`,
except `FactoryState.day 1`, `phase 'lobby'`, `groove 50`, `truck = new TruckState()`;
`PlayerState.line 'a'`; `StationState.state 'idle'`, `beacon 'off'`; `ItemState.x/y -1`, `quality 1`;
`OrderState.product 'red_stick'`, `status 'open'`, `fuseLength 'long'`; `TruckState.phase 'away'`;
`FuseState.x/y -1`. The server overwrites `levelKey`, `layoutKey`, `shiftSeconds`, `groove`, `width`,
`height` from config at room create.

### Behaviour

Everything in `sim/` is pure: no I/O, no clock reads, no randomness; state goes in and comes out. The
**server** calls these each tick or at day end and writes the results into the schema; the **client**
may call `efficiencyFor`, `grooveBand`, `churnDepth`, `utilizationLabel`, and `tiles.ts` for display and
own-avatar prediction. The client never calls `gradeDay` or `profitAndLoss` to decide anything; it
renders the `report` message.

**`efficiencyFor(curve, workers)`** (docs/05 "Staffing curve"):
1. `workers` must be an integer ≥ 0; otherwise throw `RangeError`.
2. Parse keys to integers, sort ascending. `curve` has ≥ 1 key (validated).
3. `workers === 0` → `0`.
4. Exact key → its value.
5. `workers > maxKey` → value at `maxKey` (hold).
6. Otherwise linear interpolation between the nearest key below (`k0`, or the implicit `(0, 0)` when `workers < minKey`) and above (`k1`): `v0 + (v1 − v0) × (workers − k0) / (k1 − k0)`. Assembly at 7 → `0.80 + (0.50 − 0.80) × 0.5 = 0.65`.

**`peakWorkers(curve)`**: the smallest key holding the maximum value (Assembly → 3, Dock → 3, Powder → 2). F05 derives aisle bodies and interrupt rate from `workers − peakWorkers`.

**`machineSeconds` / `cycleSeconds`** (docs/05 "Cycle"), called by F05 with `churnSensitive: cfg.churnSensitive, churnDepth: 0` in M1:
1. `efficiency ≤ 0` → `machineSeconds = Infinity` (a station nobody works never completes; the server keeps it `idle`/`starved`).
2. `churnFactor = churnSensitive ? 1 + (CYCLE.churnFactorMax − 1) × clamp(churnDepth, 0, 1) : 1` (lerp 1.0 → 1.15).
3. `machineSeconds = floorSeconds / efficiency × churnFactor × (lastCycleWasPerfect ? CYCLE.perfectRearmFactor : 1)`.
4. `interruptSeconds = CYCLE.interruptSecondsPerBubble × bubblesThisCycle`.
5. `cycleSeconds = max(executionSeconds + interruptSeconds, machineSeconds)`.
Assembly, 3 workers, execution 6.0, no bubbles: machine `5 / 1.15 = 4.348`, cycle `6.0`. Solo (0.6): machine `8.333`, execution 8.5 → `8.5`. Three bubbles: `6 + 1.5 = 7.5`.

**`grooveDelta(w, s, e, dt)`** (docs/05 "Groove", docs/16, docs/17, docs/04): rate terms integrate over `dt`, event terms are per event:
`dt × (w.onTimeShip × s.onTimeShipRate + w.shelfFullness × s.avgShelfFullness + w.floorItem × s.floorItemCount + w.rework × s.reworkShelfCount + w.starved × s.starvedStationCount + w.jammed × s.jammedStationCount + w.litFuse × s.litFuseCount) + w.fizzle × e.fizzles + w.niceSave × e.niceSaves + w.blastKeg × e.blastKegs + w.primeStick × e.primeSticks + w.truckComplete × e.trucksComplete`.
F11's `grooveSystem` builds the sample (`onTimeShipRate` = orders settled complete in the last 60 s ÷
trucks departed in that window, 0 when none; `avgShelfFullness` = mean of `length / capacity` over
shelves with capacity > 0), drains `world.grooveEvents` for the event counts, and calls `applyGroove`,
which clamps to 0–100. Nothing else writes `FactoryState.groove`.

**`grooveBand`**: `groove ≤ meltdown` → `meltdown`; `≤ churn` → `churn`; `≥ onFire` → `onFire`; `≥ groove` → `groove`; else `baseline`. Checked in that order so 10 is `meltdown` and 30 is `churn`. **`churnDepth`** = `clamp((churn − groove) / churn, 0, 1)` (docs/05: `(30 − groove) / 30`).

**`cleanSweepStep(state, sample, clock, cfg)`** (docs/05 "Clean Sweep"; `clock` is `FactoryState.clock` seconds):
1. `clean = floorItemCount === 0 && avgShelfFullness < 0.5 && reworkShelfCount === 0`.
2. Not clean → `heldSince = null`, `fire = false`.
3. Clean and `heldSince === null` → `heldSince = clock`.
4. Fire when `clock − heldSince ≥ holdSeconds` and (`lastFiredAt === null` or `clock − lastFiredAt ≥ cooldownSeconds`); on fire set `lastFiredAt = clock`, `heldSince = clock`.
5. On `fire` F11 sets `groove = max(groove, snapTo)`, `banner = 'CLEAN SWEEP'`, and counts it for the grade.

**`breakpointFor(level, players)`** / **`scaleLevel(level, players)`** (docs/19, contracts §8):
1. `players < players.min` or `> players.max` → `RangeError('players out of range')`.
2. Breakpoint = first entry (ascending `maxPlayers`) with `maxPlayers ≥ players`; none → `RangeError('no breakpoint')`.
3. `lines === 2` → `RangeError('two-line scaling is M2')`.
4. Return `{ ...level, breakpoint, lines: ['a'], stations: <the level's stations expanded per line — unchanged in M1, already '-a'>, layout: breakpoint.layout ?? level.layout, day: { ...level.day, orderBook: breakpoint.orderBook }, orders: { ...level.orders, everySeconds: breakpoint.truckEverySeconds } }`.
The result **is** a `LevelConfig`: `world.level` is this object after `start`, so `level.day.*`,
`level.hazards.*`, `level.grading.*`, `level.movement.*` and `level.stations` all still resolve, and
consumers read the breakpoint's values through `level.day.orderBook` and `level.orders.everySeconds`
rather than reading `orders.everySeconds` or `day.orderBook` from the unscaled file. Laravel keeps one
layout per level in M1 and does not re-implement this.

**`gradeDay(i, grading, day)`** (docs/18):
1. `onTime = ordersTotal > 0 ? ordersCompleted / ordersTotal : 0`.
2. `wipTerm = clamp(1 − peakWip / targets.wip, 0, 1)`.
3. `qualityTerm = 1 − complaints / max(1, shipped)` (M1: F11 passes `complaints = 0`; Hotfix and spec returns are M2).
4. `cycleTerm = ordersCompleted > 0 ? clamp(1 − (avgCycleSeconds / targets.cycleSeconds − 1), 0, 1) : 0` — no completed orders earns nothing for cycle time.
5. `hero = min(weights.heroCap, HERO_POINTS_PER_EVENT × (cleanSweeps + niceSaves))`.
6. `early = bookDone ? min(day.earlyFinishCap, day.earlyFinishBonusPerMinute × floor(remainingSeconds / 60)) : 0`.
7. `raw = weights.onTime × onTime + weights.wip × wipTerm + weights.quality × qualityTerm + weights.cycle × cycleTerm + weights.incident × incidents + hero + early`.
8. `score = max(0, round(raw))` (can exceed 100 with bonuses; not capped).
9. `grade = exploded ? 'F' : letterFor(score, thresholds)`; `letterFor`: `≥ A → A`, `≥ B → B`, `≥ C → C`, `≥ D → D`, else `F`.
10. `verdict = verdictFor(onTime, peakWip, grading, exploded)`.
11. `multiplier = exploded ? 0 : grading.multiplier[grade]` — an explosion pays 0 coin (docs/18 "Explosion … Coin 0"). An abandoned run is not exploded, so F11 passes `0` to `profitAndLoss` itself.

**`verdictFor(onTime, peakWip, grading, exploded)`** (docs/10): `exploded → EXPLODED`. Otherwise band by `onTime` against `grading.verdict`: `≥ flow → FLOW`, `≥ smooth → SMOOTH`, `≥ fine → FINE`, `≥ rough → ROUGH`, else `DISASTER`; then if `peakWip > targets.wip` demote one step (`FLOW → SMOOTH → FINE → ROUGH → DISASTER`, DISASTER stays). docs/10's example (4/11 = 0.36 → ROUGH; WIP 37 > 16 → DISASTER) reproduces.

**`profitAndLoss(i, economy, multiplier)`** (docs/18):
1. `revenue = Σ shipped[p] × price[p]`; a shipped product with no price → `RangeError` (config bug, caught by validation of `orders.mix` against `economy.price`).
2. `waste = Σ waste[t] × (wasteCost[t] ?? 0)` — F11 counts items on the floor or a shelf at close, destroyed, and returned, by type; a type with no `wasteCost` entry (scrap `parts`) costs 0 and never throws.
3. `profit = revenue − waste` (negative allowed; the report stamps LOSS).
4. `coin = round(max(0, profit) × multiplier)`, an integer.
docs/10's line: revenue 480 − waste 212 = 268 × 0.75 → 201.

**`utilizationLabel(u)`**: `≥ 0.9 → EXCELLENT`, `≥ 0.6 → GOOD`, else `NEEDS FOCUS`.

**`bottleneckStation(stations)`** (docs/05): `pressure = utilization × inputShelfFullness`; return the id with the highest pressure, ties to the first in list order; `''` for an empty list. A station with no input shelf (Powder, Dock) is passed with `inputShelfFullness = 0` and can never be the bottleneck, which docs/05 says is correct.

**`tiles.ts`**: `packTile = y × width + x` (contracts §3; docs/12's `x × W + y` is superseded), the same
packing as `spillTiles`, `scorchTiles` and `LayoutConfig.walls`. `tileOf(x, y) = [floor(x), floor(y)]`.
`facingFrom(dx, dy, previous)` maps the 8 input directions to `0 = east` clockwise: `(1,0)→0 (1,1)→1
(0,1)→2 (−1,1)→3 (−1,0)→4 (−1,−1)→5 (0,−1)→6 (1,−1)→7`; `(0,0)` returns `previous` (standing still
keeps the facing). `facingVector` returns the unit vector, diagonals `±0.70710678`. `neighbours8` omits
out-of-bounds tiles (blast radius 1 at the map edge). No other module defines `tileOf`, `packTile`,
`unpackTile`, `tileKey` or `facingFrom`: F03's `World.tileOf`/`World.packTile` and F05/F06/F10 all
re-export or call these.

**`applyDefaults(level)`** (`defaults.ts`): a deep copy of the input with every missing leaf in
`LEVEL_DEFAULTS` filled in — per leaf, not per object, so `{ movement: { tilesPerSecond: 5 } }` keeps 5
and still gains `playerRadius 0.35`, `bumpStaggerSeconds 0.3`, `floorItemSpeed 0.4`, `spillSpeed 0.6`.
Station minigame defaults are applied by station `type`. It never overwrites a value the file supplies
and never invents a key the schema forbids.

**Validation** (`validate.ts`), run by the game server at room create and by tests; Laravel validates
structure with the same `schema.json` through a PHP draft-07 validator and stores `levels.config`
verbatim — Node is the only side that applies defaults and scales.
1. `validateLevelConfig`: ajv (`allErrors: true`) against the root schema. Errors are `"<instancePath>: <message>"`. If structurally valid, the semantic rules below, all collected; if they pass, the result is `{ ok: true, value: applyDefaults(input) }`:
   - station ids unique, and `id === STATION_SHORT[type] + '-' + line`;
   - every `staffing` key is a positive-integer string; at least one entry;
   - every `okMs`/`catchOkMs`/`okMsAtMinCharge`/`okMsAtMaxCharge` ≥ `windowFloorsMs.ok`; every `perfectMs`/`catchPerfectMs`/`deadCenterMs` ≥ `windowFloorsMs.perfect` (docs/13: "validator rejects any tighter window");
   - `floorSeconds ≤ nominalSeconds`;
   - each recipe's `station` type has at least one station of that type;
   - each `orders.mix[].type` is some recipe's `output.product` and has an `economy.price` entry;
   - `scaling.breakpoints` strictly ascending `maxPlayers`, last `maxPlayers ≥ players.max`, first breakpoint covers `players.min`;
   - `day.endsOn === 'never'` ⇔ `day.shiftSeconds === 0 && day.orderBook === 0`;
   - `players.min ≥ 3` unless `endsOn === 'never'` (then ≥ 1); `players.max ≤ 10`; `min ≤ max`.
2. `validateLayoutConfig`: ajv against `definitions.LayoutConfig`; then every `walls` index `< width × height`; `spawn`/`orderBoard`/`blastBins`/`ramp`/`beaconPoles`/`props.*` tiles in bounds; `breakRoom`, `dockDoor` and `truckBay` rectangles inside bounds and at least one tile wide and deep (a zero-sized rectangle covers nothing, so every other check passes vacuously); `blastBins`, `props.returnsPile`, `spawn` and every `breakRoom` tile are not walls (contracts §8: bins and the pile are floor tiles an item lands on, and spawn and the break room are where the crew stands).
3. `validateLevelOnLayout(level, layout)` (contracts §8, verbatim): every station `workTiles`, `rackTiles` and `floorRing` tile in bounds and **not** a wall; every `anchor` and shelf `tile` in bounds (they are furniture and normally *are* walls); each shelf tile has ≥ 1 orthogonal in-bounds non-wall neighbour; no two stations share a work, rack, shelf or ring tile; `ramp` equals the dock station's `workTiles`; `truckBay` contains no wall; every `beaconPoles` key is a station id.

**Package wiring**: `game-server` imports `../../shared/src/index.ts` through its own
`game-server/src/shared.ts` (and `../shared/src/config/validate` for the validators); the client imports
the `@shared` barrel only (F04's Vite alias) and never `config/validate`. The root `package.json`'s
`"workspaces": ["shared", "game-server"]` (F01) hoists one `@colyseus/schema` copy for the server, the
client build and shared's tests, and `shared`/`game-server` pin the identical version.

## Acceptance criteria

- [x] `cd shared && npm test` runs every test file listed under Files and passes; `npm run typecheck` passes with `strict`.
- [x] `new FactoryState()` holds every field named in contracts §3 with the §3 defaults (including `host ''`, `layoutKey ''`, `StationState.pausedUntil 0`, `FuseState.x/y −1`, `OrderState.fuseLength 'long'`); a populated state encodes and decodes with `@colyseus/schema` to equal field values.
- [x] The unions match contracts §3: `ItemType` includes `'parts'`, `Chore` includes `'repair'`, `Banner` includes `'TAILGATE'`, and `ITEM_ID_PREFIX.parts === 'p'`.
- [x] `ClientMsg`/`ServerMsg` contain exactly the eight and four names in contracts §4; `isMgMsg` accepts every op in §7 (including `'swing'`) and rejects any other string; `FxKind` includes `'slop'`; `isInteractMsg({})` and `isInteractMsg({ t: 12 })` are both true.
- [x] `validateLevelConfig(fixture)` returns `ok: true`; removing any required key returns `ok: false` with an error naming the path; an unknown top-level key, an unknown `hazards` key (`sandBucket`, `sparks.hotfix`) and an unknown `StationConfig` key are rejected.
- [x] `validateLevelConfig` returns the config **with defaults applied**: a fixture copy with every contracts §13 optional key deleted comes back with `movement.tilesPerSecond 4`, `movement.playerRadius 0.35`, `movement.bumpStaggerSeconds 0.3`, `movement.floorItemSpeed 0.4`, `movement.spillSpeed 0.6`, `clipboardMemorySeconds 60`, `interrupts { everySeconds 6, pauseSeconds 0.5 }`, `carry.putDownSeconds 0.3`, `carry.hitStaggerSeconds 0.5`, `hazards.unjamSeconds 4`, `hazards.sweepSecondsPerTile 1.5`, `hazards.repairSeconds 10`, `hazards.bannerSeconds 3`, `groove.weights.truckComplete 10`, `scoring.perOrder 100`, `grading.advanceOn 'C'`, powder `heat.overholdMs 500` and `comboBannerSeconds 2`, assembly `casings { stock 3, dentChance 0.3 }`, dock `tailgateHoldSeconds 0.5` and `leaveSeconds 1.5`; a file that supplies any of them keeps its own value.
- [x] `validateLevelConfig` rejects an `okMs` of 99 and a `perfectMs` of 44, a duplicate station id, a station without `joinMode`, a recipe on a station type with no station, and an `orders.mix` product with no recipe or price.
- [x] Sandbox rules: a level with `endsOn 'never'`, `shiftSeconds 0`, `orderBook 0`, `players.min 1` validates; `endsOn 'never'` with `shiftSeconds 600` is rejected; `players.min 2` on an `either` level is rejected.
- [x] `validateLayoutConfig` rejects a wall index of `width × height`, a spawn outside the map, a missing `truckBay` or `props.broomHook`, a `props.returnsPile`, `spawn` or `breakRoom` tile that is a wall, and a `breakRoom`, `truckBay` or `dockDoor` rectangle with a zero width or height; `validateLevelOnLayout` rejects a work tile on a wall, accepts an anchor and a shelf tile that are walls, rejects a shelf tile walled in on all four sides, rejects a `ramp` that is not the dock's `workTiles`, and rejects a `truckBay` containing a wall.
- [x] `efficiencyFor(assembly, 3) === 1.15`, `efficiencyFor(assembly, 7) === 0.65`, `efficiencyFor(assembly, 9) === 0.5`, `efficiencyFor(powder, 8) === 0.75`, `efficiencyFor(any, 0) === 0`.
- [x] `cycleSeconds` returns `max(execution + 0.5 × bubbles, floor / efficiency × churn × perfect)` for the Assembly and Slammer numbers in Behaviour, and `Infinity` at efficiency 0.
- [x] `grooveDelta` integrates rate terms over `dt` and adds event terms once, including `+10` per `trucksComplete`; `grooveBand(30) === 'churn'`, `grooveBand(10) === 'meltdown'`, `grooveBand(70) === 'groove'`, `grooveBand(85) === 'onFire'`; `churnDepth(15) === 0.5`.
- [x] `cleanSweepStep` fires only after 3 continuous clean seconds and not again within 90 s.
- [x] `scaleLevel(validateLevelConfig(fixture).value, 4)` — the level as F03 actually holds it, defaults applied — returns an object that is still a full `LevelConfig`: `day.orderBook 11`, `orders.everySeconds 60`, `layout 'one-line'`, `hazards`, `grading`, `movement.tilesPerSecond 4` and `stations` (the three fixture ids) all present — plus `breakpoint.maxPlayers 6` and `lines ['a']`; `scaleLevel(fixture, 2)` and `(fixture, 11)` throw `RangeError`; a level whose breakpoint has `lines: 2` throws `RangeError` for 7 players.
- [x] `gradeDay` on the docs/10 example inputs (4/11 orders, peak WIP 37, 0 complaints, avg cycle 372 s, 0 incidents, 0 clean sweeps, 1 nice save, book not done) returns `score 42`, `grade 'D'`, `verdict 'DISASTER'`, `multiplier 0.75`; a flawless day (11/11, peak WIP 0, 0 complaints, avg cycle 200 s, 0 incidents, no hero events, book done with 0 s left) returns `score 100`, `'A'`, `'FLOW'`, `1.5`; an exploded day returns `'F'`, `'EXPLODED'`, `0`.
- [x] `profitAndLoss({ shipped: { red_stick: 48 }, waste: { keg: 41, stick: 8 } }, economy, 0.75)` returns `{ revenue: 480, waste: 212, profit: 268, multiplier: 0.75, coin: 201 }`; a loss returns `coin 0` and a negative `profit`; `waste: { parts: 3 }` adds 0 and does not throw.
- [x] `utilizationLabel` returns EXCELLENT for 0.98 and 0.9, GOOD for 0.77 and 0.6, NEEDS FOCUS for 0.44.
- [x] `bottleneckStation` on the docs/10 station block returns `'assembly-a'`.
- [x] `packTile(13, 9, 28) === 265` and `unpackTile(265, 28)` is `[13, 9]`; `tileOf(13.6, 9.2)` is `[13, 9]`; `facingFrom(1, 1, 0) === 1`; `neighbours8(0, 0, 28, 18).length === 3`.
- [ ] `shared/src/index.ts` does not export anything from `config/validate.ts`; a Vite production build of the client (once F04 exists) contains no `ajv` chunk.
- [ ] `game-server` (once F03 exists) starts a room with the fixture level and logs the scaled station ids `powder-a, assembly-a, dock-a`.

## Test plan

Unit tests (vitest, `shared/tests/`):

- `schema.test.ts` — it constructs every state class with the documented defaults (`host ''`, `layoutKey ''`, `pausedUntil 0`, `FuseState.x/y −1`, `OrderState.fuseLength 'long'`, `ItemState.x/y −1`, `quality 1`); it encodes and decodes a FactoryState holding one player, three stations, one item, one fuse, one order; it exposes `truck` as a child schema; it accepts `'parts'` as an item type and `'repair'` as a chore.
- `messages.test.ts` — it lists exactly the contract's eight client and four server message names; it accepts a valid input message and rejects `dx: 2`; it accepts every `MgOp` including `'swing'` and rejects `'steer'`; it accepts `interact` with and without `t` and rejects a non-numeric `t`; it rejects an emote kind outside the four; it lists all fourteen `FxKind` values including `'slop'`.
- `defaults.test.ts` — it fills a missing `movement` block; it keeps a supplied `movement.tilesPerSecond` and still fills the four siblings; it fills `clipboardMemorySeconds`, `interrupts`, `carry.putDownSeconds`/`hitStaggerSeconds`, the four optional `hazards` keys, `groove.weights.truckComplete`, `scoring.perOrder` and `grading.advanceOn`; it fills the minigame defaults per station type (powder `overholdMs`/`comboBannerSeconds`, assembly `casings`, dock `tailgateHoldSeconds`/`leaveSeconds`); it does not mutate its input. It strips the fixture with `bareLevelFixture()` from `tests/fixtures/`, which `validate.test.ts` reuses to prove the same table through `validateLevelConfig`.
- `validate.test.ts` — it accepts the reference fixture; it names the path of a missing required key; it rejects an unknown top-level key, an unknown `hazards` key and an unknown station key; it returns the config with §13 defaults applied; it rejects an OK window under 100 ms; it rejects a Perfect window under 45 ms; it rejects duplicate station ids; it rejects an id that does not match type and line; it rejects a station with no `joinMode`; it rejects `floorSeconds > nominalSeconds`; it rejects a recipe whose station type has no station; it rejects an order mix product with no recipe; it rejects an order mix product with no price; it rejects `players.min` of 2 on an `either` level; it accepts `players.min` of 1 on a `never` level; it rejects `endsOn 'never'` with a non-zero `shiftSeconds`; it rejects breakpoints out of order; it rejects a wall index out of range; it rejects a spawn outside the map; it rejects a layout with no `truckBay` or an incomplete `props`; it rejects a `returnsPile` on a wall; it rejects a spawn on a wall; it rejects a break-room tile on a wall; it rejects a `breakRoom`, `truckBay` or `dockDoor` rectangle with no tiles in it; it rejects a work tile on a wall; it accepts an anchor and a shelf tile on a wall; it rejects a shelf tile with no non-wall orthogonal neighbour; it rejects two stations sharing a ring tile; it rejects a `ramp` that differs from the dock's work tiles; it rejects a `truckBay` containing a wall; it rejects a beacon pole for an unknown station; it accepts a level without `copy`; it accepts a level whose `copy` carries its own clipboard lines and extra joke keys, and rejects a `copy` with no `clipboard`.
- `curve.test.ts` — it returns 0 for 0 workers; it returns the value at an exact key; it interpolates between keys (Assembly 7 → 0.65); it holds the max key's value above it (Assembly 9 → 0.5, Powder 8 → 0.75); it interpolates from zero below the smallest key (`{2: 1.0}` at 1 → 0.5); it throws on negative or fractional workers; it finds the peak worker count (Assembly 3, Dock 3, Powder 2).
- `cycle.test.ts` — it lets execution dominate at optimal staffing (6.0 over 4.348); it lets the machine dominate when execution is fast (Assembly solo: execution 4 → 8.333); it re-arms 25% faster after a Perfect (3.261); it applies the churn factor only to churn-sensitive stations (×1.15 at depth 1, ×1.075 at depth 0.5); it adds 0.5 s per bubble; it returns Infinity at efficiency 0; it lets a hot Slammer run at 1.4 s.
- `groove.test.ts` — it adds 8 per second at full on-time shipping; it subtracts 4 per second at full shelves; it subtracts 0.5 per floor item per second; it subtracts 3 per lit fuse per second; it subtracts 2 per fizzle regardless of dt; it adds 3 per nice save; it subtracts 10 per blast keg; it adds 1 per prime stick; it adds 10 per completed truck; it clamps to 0 and 100; it bands 85/70/50/30/10 as onFire/groove/baseline/churn/meltdown; it computes churn depth 0 at 30, 0.5 at 15, 1 at 0; it does not fire Clean Sweep before 3 s; it fires at 3 s; it resets the hold when the floor gets an item; it does not fire again inside 90 s; it fires again after 90 s.
- `scale.test.ts` — it picks the first breakpoint for 3 and 6 players; it picks the second for 7; it throws below `players.min`; it throws above `players.max`; it returns a full LevelConfig from a validated level (`hazards`, `grading`, `movement`, `recipes` still present); it passes the one-line stations through unchanged; it overrides `day.orderBook` and `orders.everySeconds` from the breakpoint; it falls back to the level layout when the breakpoint has none; it exposes `breakpoint` and `lines`; it throws for a two-line breakpoint.
- `grade.test.ts` — it grades a flawless day A/FLOW at 100; it grades the docs/10 example D/DISASTER at 42; it grades an exploded day F/EXPLODED with multiplier 0; it caps the hero bonus at 10; it subtracts 5 per incident; it gives no cycle points with no completed orders; it adds 5 per whole remaining minute up to 10 only when the book is done; it rounds the score before choosing the letter; it maps 90/89/75/60/40/39 to A/B/B/C/D/F; it demotes the verdict one step when peak WIP exceeds the target; it never demotes below DISASTER; it computes the docs/10 P&L (480 − 212 = 268 → 201 coin at ×0.75); it rounds coin to an integer; it pays 0 coin on a loss and on multiplier 0; it charges nothing for a waste type with no cost; it throws on a shipped product with no price; it labels 0.98/0.9 EXCELLENT, 0.77/0.6 GOOD, 0.44 NEEDS FOCUS.
- `bottleneck.test.ts` — it picks the station with the highest utilization × input fullness; it gives a starved-input station zero pressure; it returns '' for no stations; it breaks ties by list order.
- `tiles.test.ts` — it packs and unpacks a tile at width 28; it floors a float position to a tile; it formats and parses 'x,y' keys and returns null for garbage; it reports bounds; it returns 3 neighbours at a corner and 8 in the interior; it maps the 8 directions to facings 0–7 clockwise from east; it keeps the previous facing for (0,0); it returns unit vectors for diagonals.

In-app verification (F02 has no screen of its own; the evidence is the consumers):

1. `cd shared && npm test && npm run typecheck` — screenshot the green run.
2. From `game-server` (after F03 lands): `npx tsx -e "import { validateLevelConfig } from '../shared/src/config/validate'; import fs from 'node:fs'; for (const f of fs.readdirSync('../config/game/levels')) console.log(f, validateLevelConfig(JSON.parse(fs.readFileSync('../config/game/levels/' + f, 'utf8'))).ok)"` — every level prints `true`. Until F12 lands, run it on `shared/tests/fixtures/level-m1.json`.
3. Start `game-server` with the fixture level and 4 dev clients; the F03 boot log shows the scaled station ids and the debug overlay (F04) shows `efficiency 1.15` at Assembly with 3 players on its work/rack tiles and `0.65` with 7 in Sandbox.
4. `npm run build` at the root (after F04): `grep -l ajv public/build/assets/*.js` prints nothing.

## Tasks

- [x] 1. Scaffold `shared/package.json`, `tsconfig.json`, `vitest.config.ts`; run `npm view colyseus@0.18 dependencies` and pin that `@colyseus/schema` version; read its README for the decorator form it supports and set `experimentalDecorators` accordingly; `npm test` runs zero tests green.
- [x] 2. `src/schema/types.ts` + the seven schema classes + `schema/index.ts` (contracts §3 fields, unions and defaults); `tests/schema.test.ts`.
- [x] 3. `src/messages.ts` with constants, types and guards (contracts §4); `tests/messages.test.ts`.
- [x] 4. `src/report.ts` types (contracts §9); no test file — consumed by `messages.ts` and `grade.ts`, covered by `npm run typecheck`.
- [x] 5. `src/sim/constants.ts` (the §13 "stays in code" list only); covered by `npm run typecheck`.
- [x] 6. `src/sim/tiles.ts` incl. `tileOf`; `tests/tiles.test.ts`.
- [x] 7. `src/config/types.ts` (level, station, minigame, hazards, orders, layout); `npm run typecheck`.
- [x] 8. `src/config/schema.json` draft-07 with `definitions.LayoutConfig`; `tests/fixtures/level-m1.json` and `layout-one-line.json` with the numbers in Data & config (incl. `joinMode`, `truckBay`, `props`).
- [x] 9. `src/config/defaults.ts` (`LEVEL_DEFAULTS`, `applyDefaults`); `tests/defaults.test.ts`.
- [x] 10. `src/config/validate.ts` structural pass (ajv) returning `applyDefaults`'d values — fixture accepted, missing key and unknown key rejected; `tests/validate.test.ts` first third.
- [x] 11. `validate.ts` semantic rules (window floors, ids, `joinMode`, staffing keys, recipes, mix, breakpoints, Sandbox/`players.min`) — second third of `validate.test.ts`.
- [x] 12. `validateLayoutConfig` and `validateLevelOnLayout` (contracts §8 rule list); remaining `validate.test.ts` cases.
- [x] 13. `src/sim/curve.ts`; `tests/curve.test.ts`.
- [x] 14. `src/sim/cycle.ts`; `tests/cycle.test.ts`.
- [x] 15. `src/sim/groove.ts` — `grooveDelta` (incl. `trucksComplete`), `applyGroove`, `grooveBand`, `churnDepth`; first half of `tests/groove.test.ts`.
- [x] 16. `cleanSweepStep`; second half of `groove.test.ts`.
- [x] 17. `src/sim/scale.ts` returning a full `LevelConfig` + `breakpoint`/`lines`; `tests/scale.test.ts`.
- [x] 18. `src/sim/grade.ts` — `letterFor`, `verdictFor`, `gradeDay`; first half of `tests/grade.test.ts`.
- [x] 19. `profitAndLoss`, `utilizationLabel`; second half of `grade.test.ts`.
- [x] 20. `src/sim/bottleneck.ts`; `tests/bottleneck.test.ts`.
- [x] 21. `src/index.ts` barrel (everything except `config/validate`); `npm run typecheck`; hand F03 the import path `../../shared/src/index.ts`, F04 the alias target `./shared/src`, and every module owner the one `export *` line they append.
- [x] 22. In-app verification steps 1–2; tick the status boxes; steps 3–4 once F03/F04 land.

## Risks & open questions

- **`@colyseus/schema` version and decorator form.** Contracts §3 says "5"; docs/12 uses `@type()` decorators. Task 1 verifies both against the installed `colyseus@0.18` rather than assuming. If the installed version only supports standard decorators, `experimentalDecorators` stays off and the client tsconfig (F04) must match.
- **Two module instances of `@colyseus/schema`.** If `shared/node_modules` and `game-server/node_modules` each hold a copy, the `@type()` metadata registers on a different context from the one Colyseus encodes with and the room silently syncs nothing. Mitigation is the root workspaces (F01, contracts §1) plus a one-line boot assertion in F03.
- **Laravel cannot run the semantic checks or apply defaults.** `schema.json` covers structure; the window-floor, id, recipe, breakpoint and Sandbox rules live in TS, and only Node fills the §13 defaults. Until the M4 admin editor gets a Node CLI, a level that passes Laravel's schema check but fails `validateLevelConfig` is refused by the game server at room create with the error list — F03 surfaces that in its log and as a `toast` to the joining client.
- **Numbers this doc introduces** (not in any design doc): `grading.verdict` thresholds `{1.0, 0.75, 0.5, 0.25}`; `UTILIZATION_LABELS.good = 0.6`; the dock's `nominalSeconds`/`floorSeconds` of 1.0 in the fixture. All three are config or constants so they can be tuned without code; they are checked against the docs/10 example so they at least reproduce the one worked report we have.
- **`economy.wasteCost` has no `parts` entry.** `parts` items (F08's spool + cap) can be litter at close, so `profitAndLoss` treats a missing `wasteCost` entry as 0 rather than throwing or inviting an invented price. If M2 wants scrap parts to cost something, add the key to `economy.wasteCost` — the schema already allows any `ItemType` key.
- **The fixture level ships the optional §13 keys that F12's baseline ships** (`joinMode`, `overholdMs`, `comboBannerSeconds`, `casings`, `tailgateHoldSeconds`, `leaveSeconds`, `repairSeconds`, `bannerSeconds`, `truckComplete`, `advanceOn`) and omits the rest (`movement`, `interrupts`, `clipboardMemorySeconds`, `carry.putDownSeconds`/`hitStaggerSeconds`, `hazards.unjamSeconds`/`sweepSecondsPerTile`, `scoring`), so the default path is exercised by the same file every consumer copies.

**Contract change requested** — all four were adopted in contracts **v2.1** and this feature is
built to that text: `ScaledLevel` has no `players` key, `Axis` is declared only in `messages.ts`,
`peakWorkers` only in `sim/curve.ts`, and `OrdersConfig` only in `config/types.ts`.

1. **§8 / §10.1 `ScaledLevel`.** `LevelConfig & { players: number; breakpoint; lines }` cannot be
   built: `LevelConfig.players` is `{ min, max }`, so `players` would have to be both, and a
   `players: number` override (via `Omit`) makes `ScaledLevel` unassignable to `World.level:
   LevelConfig` and to `ConfigMsg.level`. Per orchestrator ruling 6 ("a `LevelConfig` … plus a
   `breakpoint` field") this doc ships `ScaledLevel = LevelConfig & { breakpoint: ScalingBreakpoint;
   lines: Line[] }`, keeps `players: { min, max }` (F03 needs `players.max` for `maxClients` and
   `players.min` for the start gate), and leaves the seat count to `breakpointFor`'s argument and
   `state.players.size`. Contracts §8 should drop `players: number` from `ScaledLevel`.
2. **§4 vs §10.8 `Axis`.** `messages.ts` (F02) and `shared/src/sim/movement.ts` (F03) both declare
   `export type Axis = -1 | 0 | 1`, and both files are re-exported by the barrel — an ambiguous
   export. F03's `movement.ts` should `import type { Axis } from '../messages'` instead of declaring it.
3. **§10.2 `peakWorkers`.** Declared by F02's `sim/curve.ts` and listed again among the pure exports of
   F05's `shared/src/sim/stations.ts`. Same ambiguity. F05 should call F02's.
4. **§10.6 `OrdersConfig`.** `LevelConfig.orders` needs this interface in `config/types.ts` (the schema
   owns the level's key list, as it does for `HazardsConfig`), but §10.6 also declares `OrdersConfig` in
   F09's `shared/src/sim/orders.ts`. F09 should import it from `../config/types` rather than re-declare it.
