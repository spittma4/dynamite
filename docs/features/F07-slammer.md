# F07 — The Slammer (Boom Powder)
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/slammer.ts` · `shared/tests/slammer.test.ts` · `game-server/src/sim/minigames/slammer.ts` (replaces F05's stub body) · `game-server/tests/minigames/slammer.test.ts` · `resources/js/game/minigames/Slammer.ts` · `resources/js/game/minigames/SlammerWorld.ts` · `resources/js/game/minigames/slammerAudio.ts`
**Touches:** one `export * from './sim/slammer';` line in `shared/src/index.ts` (F02) · the two `boom_powder` entries in `resources/js/game/minigames/index.ts` (F04) · `scene.fx.override(...)` calls for `thunk`/`pfft`/`clink`/`slop`
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/04-minigames.md` (Rules, The Slammer) · `docs/03-stations.md` (Boom Powder) · `docs/16-hazards-and-explosions.md` (Sparks) · `docs/13-config-schema.md` · `docs/05-flow-mechanics.md` (Cycle) · `docs/decisions/0012-output-to-hands.md` · `docs/14-roadmap.md`

## Goal

A player who steps onto the Powder work tile gets the most fun station in the factory: mash the three
chutes (← ↑ →), hold Space while the gauge climbs, release on the gold hairline. How fast they mashed
sets how fast the gauge climbs and how small the OK band is — a hot hand makes a keg every 1.4 s with a
±105 ms window, a lazy one every 2.8 s with ±225 ms. Every release makes a keg whose quality is visible
on the shelf (grey dud · steaming damp · normal · glowing prime); a late release also drops a spark on
the station's floor ring. A fourth chute press slops a spill tile at their feet. The combo counter,
flag, hopper glow, thunk tempo and gold beacon are all in the world, so everyone on the floor can see
and hear exactly how fast — and how sloppy — the Powder player is going. When the 6-keg shelf is full
the keg lands in their hands and the plunger refuses input until they put it down, throw it, or leave
the tile and carry it away; the combo keeps ticking while they decide.

## Scope

**In (M1):**
- Server judgement of `mash` / `charge` / `release` for `boom_powder` stations with Heat
  (`t_charge = clamp(2·t_mash, 0.7, 1.5)`), an OK window interpolated in ms, and a fixed ±50 ms DEAD CENTER.
- Four outcomes → keg (`quality`, `prime`), combo, fx, and the late-release spark roll.
- Fourth-press overflow → spill tile at the operator's feet.
- HANDS phase (ADR 0012): combo persists while holding; the station takes no input until hands are free.
- Combo tiers 10 / 25 / 50: flag, steam + HOT STREAK banner + gold beacon, floor ripple. Combo resets on
  a miss and on every `onLeave` reason.
- Churn band drift ±8 % per cycle while Groove ≤ 30.
- Operator overlay (F04's `MinigameOverlay`): chute keys, gauge with band and gold hairline, needle, ms
  readout, outcome label, HANDS FULL panel.
- In-world `StationView` for every client: hopper glow ∝ heat, combo counter, flag, steam, ripple, thunk
  screen shake, confetti.
- Audio: minimal WebAudio beeps (thunk with pitch rising with combo, pfft, clink, slop). Kept in one file
  so it can be deleted without touching anything else.

**Out (later milestones or other features):**
- Choosing which floor-ring tile the spark lands on — F10's `sparkRing(world, stationId, cause)` (§10.5).
  F07 only rolls `hazards.sparks.slammerRedline` and calls it.
- Keg sprites and shelf/hands placement — F06 (`ItemState.quality`/`prime` drive the sprite).
- `StationState.state`/`progress`/`workers`/`efficiency` and the re-arm — F05 (§10.2). The Slammer writes
  no `status?()` override: F05's cycle rule already reads `working` while the plunger is armed.
- `tally.bump('kegsMade')` — bumped inside F05's `ctx.complete()` when the delivered item is a keg
  (§10.2). F07 makes the call that triggers it and keeps no counters of its own.
- The truck ride (`drivenOffUntil`) — F09's `departTruck` (§10.6), not F07's.
- Music layers and the brass sting as real audio (M2, Groove/music work).
- Sooted sprites, DANGER beacon polish, Incidents (M2, F10 follow-on).
- Bigger Shelf and Conveyor upgrades (M4).
- Two-line factories with two Powder stations (M2). F05 creates one instance per station
  (`MinigameModule.create(station)`), so nothing here assumes a single station, but it is only tested
  against one.
- Casing Prep's DUET and the Churn metronome jitter (M2; Stamp & Crimp is its own feature).

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/slammer.ts` | Pure functions: heat maths, window interpolation, release judgement, band drift, combo tier, lag-bounded interval, `SlammerMg` type + `encodeMg`/`decodeMg`/`idleMg`, keg quality constants. No I/O, no clock reads, no randomness (`r` is passed in). |
| `shared/tests/slammer.test.ts` | Vitest unit tests for every function above. |
| `game-server/src/sim/minigames/slammer.ts` | `export const slammerModule: MinigameModule` — `create(station)` returns the `MinigameInstance` for `type: 'boom_powder'`: op handling, per-instance private state, `ctx.setMg` writes, `ctx.complete`, spark roll, overflow spill, beacon/banner, hands detection, overhold auto-fire. |
| `game-server/tests/minigames/slammer.test.ts` | Module tests on a real `World` from `makeWorld` (F03, `game-server/tests/helpers/world.ts`) with a seated dev player driven through `stations.onInteract`/`stations.onMg`. |
| `resources/js/game/minigames/Slammer.ts` | `slammerOverlay: OverlayFactory` — key mapping, local prediction of chutes and the needle, gauge/band/hairline drawing, outcome label, HANDS FULL panel, `ctx.send(op, v?)`. |
| `resources/js/game/minigames/SlammerWorld.ts` | `slammerStationView: () => StationView` — in-world view for every client (operator or not): hopper glow, combo counter, flag, steam, ripple; installs the `thunk`/`pfft`/`clink`/`slop` handlers with `scene.fx.override`, with screen shake and confetti. |
| `resources/js/game/minigames/slammerAudio.ts` | WebAudio oscillator/noise beeps. Lazily creates the `AudioContext` on the first key press. |
| `shared/src/index.ts` (F02) — touch | Append `export * from './sim/slammer';` (§1). |
| `resources/js/game/minigames/index.ts` (F04) — touch | Replace the `boom_powder` entry of `minigames` with `slammerOverlay` and set `stationViews.boom_powder = slammerStationView`. |

`game-server/src/sim/minigames/index.ts` needs no edit: F05's `MINIGAMES` already maps
`boom_powder: slammerModule` and imports it from `./slammer` (§10.3). F07 replaces that file's body only.

### Interfaces

**Consumes**

From the contracts (§3, §4, §8, §13):
- `FactoryState`, `StationState`, `PlayerState`, `ItemState`, `ItemType`, `FuseLength` from `shared/src/schema/` (F02).
- `MgOp`, `FxKind`, `FxMsg` from `shared/src/messages.ts` (F02).
- `LevelConfig`, `StationConfig` from `shared/src/config/types.ts` (F02). `validateLevelConfig()` has already
  applied the §13 defaults, so `heat.overholdMs` and `comboBannerSeconds` are always present — never branch on `undefined`.
- `Tile`, `tileOf` from `shared/src/sim/tiles.ts` (F02). F07 defines no tile helpers.

From F03 (`game-server/src/sim/World.ts`, §10.1), reached through `ctx.world`:
- `world.state: FactoryState` · `world.level: LevelConfig` (a `ScaledLevel` after `start`) · `world.now: number` (getter for `state.clock`)
- `world.rng.next(): number` — seeded `[0, 1)`
- `world.tileOf(x, y): Tile`
- `world.stationConfig(id: string): StationConfig` (the module normally uses `ctx.cfg`)

From F05 (`game-server/src/sim/minigames/types.ts`, `game-server/src/sim/stations.ts`, §10.2/§10.3):
- `MinigameModule { create(station: Station): MinigameInstance }` — join mode comes from `cfg.joinMode`
  (`powder-a` is `'press'`); F07 exports `slammerModule` under this type.
- `MinigameInstance { onJoin(ctx, player, role), onLeave(ctx, player, reason), onInteract(ctx, player): boolean,
  onMessage(ctx, player, op, v, t), tick(ctx, dt), starved(ctx): boolean, status?(ctx) }`.
  `LeaveReason = 'esc' | 'stepOff' | 'disconnect'`; at a `press` station only `'esc'` (Esc, `E` with empty
  hands, ejection by F10) and `'disconnect'` occur — `'stepOff'` is a `stand`-station reason.
- `StationCtx`: `world`, `station: Station`, `cfg: StationConfig`, `now` (clock seconds), `phase`, `paused`,
  `rearmAt`, `operators`, `rackHands`, `helpers`, `sessionIdOf(player): string`, `beginCycle(): boolean`,
  `complete(result: CycleResult): 'shelved' | 'hands' | 'none'`, `abort()`, `setMg(value: object)`,
  `setProgress(p)`, `fx(kind, x, y, extra?)`, `bubble(sessionId, text, seconds)`.
  F07 uses none of `inputShelf()`, `consume()`, `setProgress()`, `bubble()` — Powder has no input shelf,
  F05 owns `progress`, and the Slammer says nothing.
- `OutputSpec` / `CycleResult` for `ctx.complete`.
- F05 forwards `onMessage` only for a player whose `stationId` is this station, whose clipboard has expired,
  and while the station is not jammed/damaged/paused (§11). `t` is the client's raw `performance.now()` ms
  from `msg.t` — F03's wrapper only records the clock offset; the Slammer judges intervals on that base
  and never converts (§7).

From F06 (`game-server/src/sim/items.ts`, §10.4):
- `addSpill(world: World, t: Tile): void` — the overflow spill. Everything else about the keg (creation,
  shelf, hands) happens inside `ctx.complete`.

From F10 (`game-server/src/sim/hazards.ts`, §10.5):
- `sparkRing(world: World, stationId: string, cause: SparkCause): SparkResult` — F07 rolls
  `level.hazards.sparks.slammerRedline` with `world.rng.next()` first (§10.5 "callers roll"), then calls it
  with `'slammerRedline'`. F10 picks the tile (highest-fuel ring tile nearest the anchor) and owns `fuses`.

From F04 (client, §10.9):
- `OverlayContext { scene: Factory; room; sessionId; state; container; width; height; stationId; stationType;
  clock: ServerClock; serverClock(): number; anchorPx(); send(op, v?); sendInteract(); sendAction() }`.
- `MinigameOverlay { capturesMovement; mount(ctx); update(station, me, serverNow); onKey(key, down, repeat): boolean; unmount() }`,
  `OverlayFactory = () => MinigameOverlay`, `OverlayKey = 'left' | 'right' | 'up' | 'down' | 'space' | 'interact' | 'esc'`.
- `StationView { create(scene: Factory, station: StationState, layer: Container); update(station, serverNow); destroy() }`
  and the registries `minigames` / `stationViews` in `minigames/index.ts`.
- `Fx.override(kind: FxKind, handler: (scene: Factory, m: FxMsg) => void)` on `scene.fx` — replaces F04's
  default renderer for that kind so both do not fire.
- `conn.config.level` / `conn.config.copy` (the `config` reply, §4) for anything the overlay needs beyond `mg`.

**Produces**

`shared/src/sim/slammer.ts`:

```ts
export type Chute = 'l' | 'u' | 'r';
export type SlammerPhase = 'idle' | 'mash' | 'charge' | 'hands';
export type SlammerOutcome = '' | 'dead_center' | 'prime' | 'late' | 'early';
export interface SlammerHeatConfig {
  minChargeSeconds: number; maxChargeSeconds: number;
  okMsAtMaxCharge: number; okMsAtMinCharge: number;
  deadCenterMs: number; churnBandDrift: number; overholdMs: number;
}
export interface SlammerMg {
  phase: SlammerPhase;
  mashed: Chute[];          // chutes pressed this cycle, in press order (0–3 entries)
  chargeStartAt: number;    // clock seconds when the charge began; 0 outside 'charge'
  tCharge: number;          // seconds; 0 outside 'charge'
  okMs: number;             // ± window; 0 outside 'charge'
  heat: number;             // 0 lazy … 1 hot; last charge's heat, persists until the next charge or leave
  bandOffset: number;       // Churn drift for the current/next cycle, −churnBandDrift … +churnBandDrift
  combo: number;
  tier: 0 | 1 | 2 | 3;
  lastOutcome: SlammerOutcome;
  lastErrorMs: number;      // signed ms of the last release (+ late, − early); 0 before the first release
  cfg: SlammerHeatConfig;   // copied from the station config on join so the overlay can predict
}
export const KEG_QUALITY: { readonly dud: 0.4; readonly damp: 0.7; readonly prime: 1.0 };
export function chargeSeconds(tMashSeconds: number, cfg: SlammerHeatConfig): number;
export function okWindowMs(tCharge: number, cfg: SlammerHeatConfig): number;
export function heatOf(tCharge: number, cfg: SlammerHeatConfig): number;
export function targetMs(tCharge: number, bandOffset: number): number;
export function gaugeTopMs(cfg: SlammerHeatConfig): number;
export function judgeRelease(errorMs: number, okMs: number, deadCenterMs: number): Exclude<SlammerOutcome, ''>;
export function kegFor(outcome: Exclude<SlammerOutcome, ''>): { quality: number; prime: boolean };
export function bandDrift(groove: number, churnThreshold: number, churnBandDrift: number, r: number): number;
export function comboTier(combo: number, tiers: readonly number[]): 0 | 1 | 2 | 3;
export function boundedMs(clientMs: number, serverMs: number, toleranceMs: number): number;
export function idleMg(cfg: SlammerHeatConfig, bandOffset: number): SlammerMg;
export function encodeMg(mg: SlammerMg): string;
export function decodeMg(s: string): SlammerMg | null;
```

`encodeMg(mg)` is `JSON.stringify` of a `SlammerMg` whose ms fields are already integers, which is exactly
what `ctx.setMg(mg)` writes into `StationState.mg` (§7 `boom_powder` = `encodeMg(SlammerMg)`, §10.3 "setMg:
`JSON.stringify` → `st.mg` only when changed"). The module always writes through `ctx.setMg` and never
assigns `st.mg`; `encodeMg` is the tested definition of that wire form and `decodeMg` is the client's
parse-and-shape-check. There is no spark-tile picker in this module (§10.3).

`game-server/src/sim/minigames/slammer.ts`:

```ts
export const slammerModule: MinigameModule;   // create(station) → the boom_powder MinigameInstance
```

Schema fields written by this feature: `StationState.mg` (via `ctx.setMg`), `StationState.beacon`
(`'gold'` / `'off'` only, never `'red'`), `PlayerState.combo`, `FactoryState.banner = 'HOT STREAK'` and
`FactoryState.bannerUntil` (§3 writers).

Messages sent (server → client, via `ctx.fx`): `thunk` (size 1 or 2), `pfft`, `clink`, `slop`, all at the
hopper tile centre.

Messages sent (client → server, via `ctx.send`): `mg` with `op: 'mash', v: 'l' | 'u' | 'r'`,
`op: 'charge'`, `op: 'release'`; F04 stamps `t = performance.now()`.

`resources/js/game/minigames/Slammer.ts`: `export const slammerOverlay: OverlayFactory`.
`resources/js/game/minigames/SlammerWorld.ts`: `export const slammerStationView: () => StationView`.
`resources/js/game/minigames/slammerAudio.ts`: `export const slammerAudio: { unlock(): void; thunk(combo: number, size: number): void; pfft(): void; clink(): void; slop(): void }`.

### Data & config

Read from `world.level` (the scaled level with §13 defaults applied); values from `docs/13`, `docs/16`, `docs/03`:

| Key | Start value | Used for |
|---|---|---|
| `stations[powder-a].minigame.heat.minChargeSeconds` | 0.7 | lower clamp of `t_charge` |
| `…heat.maxChargeSeconds` | 1.5 | upper clamp of `t_charge` |
| `…heat.okMsAtMaxCharge` | 225 | OK window at a 1.5 s climb |
| `…heat.okMsAtMinCharge` | 105 | OK window at a 0.7 s climb |
| `…heat.deadCenterMs` | 50 | DEAD CENTER window at any heat |
| `…heat.churnBandDrift` | 0.08 | band drift magnitude in the Churn |
| `…heat.overholdMs` | 500 | how long past the band's late edge the plunger blows by itself — optional key, §13 default 500 |
| `…minigame.comboTiers` | `[10, 25, 50]` | flag · steam + banner + gold beacon · ripple |
| `…minigame.overflowSpills` | `true` | whether a fourth press spills |
| `…minigame.comboBannerSeconds` | 2 | how long `banner = 'HOT STREAK'` shows — optional key, §13 default 2 |
| `stations[powder-a].workTiles` | 1 tile | the operator's tile (the overflow spill lands there) |
| `stations[powder-a].joinMode` | `'press'` | F05 freezes the operator and runs the clipboard before the overlay mounts |
| `hazards.sparks.slammerRedline` | 1.0 | probability F07 rolls before calling `sparkRing` |
| `groove.thresholds.churn` | 30 | band drift on when `groove ≤` this |
| `windowFloorsMs.ok` | 100 | lag tolerance for client-reported intervals (see Behaviour) |

`stations[powder-a].floorRing` is read by F10 inside `sparkRing`, not by F07.

Read by F05/F06 but load-bearing for this feature's numbers: `floorSeconds 1.4`, `nominalSeconds 2.8`,
`staffing {1: 1.0, 2: 1.05, 3: 0.9, 4: 0.75}`, `outputShelf.capacity 6`.

Keg qualities `0.4 / 0.7 / 1.0` are fixed by the `ItemState.quality` contract and by Assembly's
`pour.beatsByQuality` keys (`"1.0"`, `"0.7"`, `"0.4"`), so they are constants (`KEG_QUALITY`), not config.

### Behaviour

**Clocks and lag.** One time base: `ctx.now` is `FactoryState.clock` in seconds, and every timestamp the
module publishes (`mg.chargeStartAt`, `bannerUntil`) is in those seconds (§3). The server never compares a
client timestamp to its own clock. Every judged quantity is an *interval between two client presses*
(`release.t − charge.t`, `third mash.t − first mash.t`) measured by the same client on the same
`performance.now()` base; latency cancels, only jitter remains. The server measures the same interval as
`(ctx.now − stamp) · 1000` and trusts the client's number only within `± windowFloorsMs.ok` (100 ms) of its
own: `boundedMs(clientMs, serverMs, tol) = clamp(clientMs, serverMs − tol, serverMs + tol)`, falling back to
`serverMs` when `clientMs` is not finite or is negative (§7). Because `clock` advances once per 50 ms tick,
the server's own measurement is quantised by up to 50 ms — well inside the 100 ms tolerance, which is why
the tolerance is the `ok` floor and not something smaller. `World.inputClock` is for stations that judge
against server time; the Slammer needs no conversion.

**Private state.** F05 calls `slammerModule.create(station)` once per station and keeps the instance in
`Station.mg`, so the private state is the instance's own fields — no module-level `WeakMap` is needed:
`operatorId`, `mg: SlammerMg`, `mashFirstAt` / `mashThirdAt` / `chargeAt` (clock seconds), `mashFirstT` /
`mashThirdT` / `chargeT` (client ms), `bandCenterMs`, `okMs`, `chargeHeldMs` (pause-aware accumulator for
the overhold). Everything the overlay needs is in `mg`; everything only the judge needs stays private.

**Heat maths** (`shared/src/sim/slammer.ts`), with `cfg: SlammerHeatConfig = ctx.cfg.minigame.heat`:
- `chargeSeconds(tMash) = clamp(2·tMash, 0.7, 1.5)`. A 0.3 s mash → 0.7 s; 0.8 s → 1.5 s; 0.5 s → 1.0 s.
  Boundaries: 0.35 s → 0.7; 0.75 s → 1.5.
- `u = (tCharge − 0.7) / (1.5 − 0.7)`; `okWindowMs(tCharge) = 105 + (225 − 105)·u`. 0.7 → 105; 1.1 → 165;
  1.5 → 225. `heatOf(tCharge) = 1 − u`.
- `targetMs(tCharge, bandOffset) = tCharge · 1000 · (1 + bandOffset)`.
- `gaugeTopMs(cfg) = maxChargeSeconds·1000·(1 + churnBandDrift) + okMsAtMaxCharge + overholdMs` =
  1500·1.08 + 225 + 500 = **2345 ms** — the fixed length of the drawn gauge (overlay only).
- `judgeRelease(error, okMs, 50)`: `|error| ≤ 50` → `dead_center`; `|error| ≤ okMs` → `prime`;
  `error > okMs` → `late`; otherwise `early`. Both bounds inclusive.
- `kegFor`: `dead_center → {1.0, prime: true}`, `prime → {1.0, false}`, `late → {0.7, false}`,
  `early → {0.4, false}`.
- `bandDrift(groove, 30, 0.08, r)`: `groove > 30` → 0; otherwise `0.08 · (2r − 1)` (r from
  `world.rng.next()`), so `r = 0` → −0.08, `r = 0.5` → 0, `r → 1` → +0.08. Flat in the Churn, as `docs/04`
  states — it does not scale with `churnDepth`.
- `comboTier(combo, [10, 25, 50])` = count of tiers with `combo ≥ tier`: 9 → 0, 10 → 1, 25 → 2, 50 → 3.

**Server module** (`game-server/src/sim/minigames/slammer.ts`). Every handler ignores a player whose
`ctx.sessionIdOf(player) !== operatorId`. F05 already drops `mg` from a player who is not at this station,
whose clipboard is still running, or while the station is jammed/damaged/paused (§11), and never ticks the
instance while jammed or damaged (§10.3).

1. `create(station)` → the instance with `operatorId = ''` and `mg = idleMg(heat, 0)`.

2. `onJoin(ctx, player, role)`: ignore unless `role === 'work'` (rack hands and helpers add efficiency, they
   do not drive the plunger). `operatorId = ctx.sessionIdOf(player)`; `player.combo = 0`;
   `bandOffset = bandDrift(world.state.groove, level.groove.thresholds.churn, cfg.churnBandDrift, world.rng.next())`;
   `mg = idleMg(cfg.minigame.heat, bandOffset)`; `ctx.setMg(mg)`. Joining a `press` station requires empty
   hands (§7), so the phase always starts `idle`.

3. `onMessage` with `op: 'mash'`, `v ∈ {'l','u','r'}` (anything else ignored):
   - phase `charge` or `hands` → ignored (the plunger is down / hands are full).
   - phase `idle`: call `ctx.beginCycle()`; `false` (re-arming, or the operator is carrying) → ignored.
     Otherwise phase → `mash`, `mashed = [v]`, stamp `mashFirstAt = ctx.now`, `mashFirstT = t`.
   - phase `mash`, `v ∉ mashed`, `mashed.length < 3`: push `v`; on the third, stamp `mashThirdAt = ctx.now`,
     `mashThirdT = t`.
   - phase `mash` and (`v ∈ mashed` or `mashed.length === 3`): **overflow**. `ctx.fx('slop', hopperX, hopperY)`;
     if `cfg.minigame.overflowSpills` then `items.addSpill(world, world.tileOf(player.x, player.y))` — the
     operator's own tile, since a `press` station snaps them to the work tile centre. The mash state is
     unchanged (a repeated chute still needs the remaining ones; three mashed still wait for `charge`). The
     combo is unchanged — overflow is a fumble with its own consequence, not a release miss.
   - Every accepted press calls `ctx.setMg(mg)`.

4. `onMessage` with `op: 'charge'`: only when phase `mash` and `mashed.length === 3`, else ignored.
   - `tMashMs = boundedMs(mashThirdT − mashFirstT, (mashThirdAt − mashFirstAt)·1000, level.windowFloorsMs.ok)`.
   - `tCharge = chargeSeconds(tMashMs / 1000, cfg)`; `okMs = okWindowMs(tCharge, cfg)`;
     `heat = heatOf(tCharge, cfg)`; `bandCenterMs = targetMs(tCharge, mg.bandOffset)`.
   - `chargeAt = ctx.now`, `chargeT = t`, `chargeHeldMs = 0`; phase → `charge`; `mg.chargeStartAt = ctx.now`,
     `mg.tCharge`, `mg.okMs`, `mg.heat`; `ctx.setMg(mg)`.

5. `onMessage` with `op: 'release'`: only in phase `charge`, else ignored.
   - `heldMs = boundedMs(t − chargeT, (ctx.now − chargeAt)·1000, level.windowFloorsMs.ok)`;
     `errorMs = heldMs − bandCenterMs`; `outcome = judgeRelease(errorMs, okMs, cfg.deadCenterMs)`.
   - Apply **`resolve(outcome, errorMs)`** below.

6. `resolve(outcome, errorMs)` (also used by the overhold auto-fire, and by nothing else):
   - Combo: `dead_center` / `prime` → `combo + 1`; `late` / `early` → `0`.
     `tier = comboTier(combo, cfg.minigame.comboTiers)`. Mirror `player.combo = combo`.
   - fx at the hopper tile centre (`st.anchorX + 0.5`, `st.anchorY + 0.5`): `dead_center` → `thunk` with
     `size: 2`; `prime` → `thunk` with `size: 1`; `late` → `pfft`; `early` → `clink`.
   - Spark (late only): `if (world.rng.next() < level.hazards.sparks.slammerRedline)
     hazards.sparkRing(world, st.id, 'slammerRedline')`. F10 chooses the ring tile and owns `fuses`.
   - Keg: `{ quality, prime } = kegFor(outcome)`; `where = ctx.complete({ item: { type: 'keg', quality, prime,
     dents: 0, fuseLength: '', fill: 0, capLoose: false, frayed: false, orderId: '',
     handsOf: ctx.sessionIdOf(player) }, perfect: outcome === 'dead_center' })`. F05 creates the item,
     delivers it, schedules the re-arm (×0.75 after a perfect) and bumps `tally.kegsMade`.
   - Tier transitions, compared before/after: crossing up into tier 2 sets `world.state.banner = 'HOT STREAK'`
     and `bannerUntil = ctx.now + cfg.minigame.comboBannerSeconds` (2 s). F07 never clears `banner`; readers
     treat it as expired once `clock ≥ bannerUntil`. Tier changes emit no fx of their own — the client
     animates from `mg.tier`.
   - Next cycle: `bandOffset = bandDrift(…)` re-rolled now so the overlay knows it before the next mash.
     `mashed = []`, `chargeStartAt = 0`, `tCharge = 0`, `okMs = 0` (`heat` is kept), `lastOutcome = outcome`,
     `lastErrorMs = round(errorMs)`. Phase → `hands` when `where === 'hands'`, else `idle`
     (`'shelved'` and `'none'` both leave the plunger free). `ctx.setMg(mg)`.

7. `tick(ctx, dt)` — every 50 ms while `phase === 'running'`; calls `ctx.setMg` only on a transition:
   - `player = ctx.operators.find(p => ctx.sessionIdOf(p) === operatorId)`; if absent, do nothing (F05 will
     call `onLeave`).
   - `phase ∈ {idle, mash}` and `player.carrying !== ''` (they caught or were handed something) → phase
     `hands`, `mashed = []`. The station takes no input with full hands.
   - `phase === 'hands'` and `player.carrying === ''` → phase `idle`. The combo is untouched: it persists
     through hands.
   - `phase === 'charge'` and `!ctx.paused`: `chargeHeldMs += dt·1000` (an interrupt must not eat the
     player's hold, §10.3). When `chargeHeldMs > bandCenterMs + okMs + cfg.overholdMs` the plunger blows:
     `resolve('late', chargeHeldMs − bandCenterMs)`. Holding forever is not a way to avoid a miss.
   - Beacon reconcile: `desired = mg.tier >= 2 ? 'gold' : 'off'`; `if (st.beacon !== 'red') st.beacon = desired`.
     F10 may overwrite gold with red at any time and clears red to `'off'`; the next tick re-asserts gold if
     the combo still earns it. Hazards tick after stations, so red always wins (§3, §11).

8. `onLeave(ctx, player, reason)` for every reason: if phase is `mash` or `charge` call `ctx.abort()` (the
   cycle is forfeit — no keg, no spark); `combo = 0`, `tier = 0`, `player.combo = 0`, `heat = 0`,
   `mashed = []`, phase → `idle`, `lastOutcome = ''`, `operatorId = ''`; `ctx.setMg(mg)`;
   `st.beacon = 'off'` unless it is `'red'`. A keg already in the player's hands stays there (carrying it
   away is the third legal way to keep producing, at the cost of the combo).

9. `onInteract(ctx, player)` returns `false` always. `E` with full hands never reaches the module — `items.onInteract`
   runs first in the `interact` chain and puts the keg down (§11); `E` with empty hands means leave, which is
   exactly what `false` tells F05.

10. `starved(ctx)` returns `false`. Boom Powder has no input shelf (§8: absent for powder input), so it is
    never starved; F05's cycle rule gives `working` while the plunger is armed or re-arming and `idle`
    otherwise. The Slammer implements no `status?()`.

**Rates that fall out** (acceptance numbers, from `docs/03`/`04`): hot mash 0.3 s + climb 0.7 s = 1.0 s
execution, machine floor 1.4 s at efficiency 1.0 → one keg per 1.4 s (43/min); lazy 0.8 s + 1.5 s = 2.3 s,
plus the shelf/hands beat ≈ 2.8 s nominal (21/min). The 6-keg shelf fills in 9 s hot, 18 s lazy.

**Operator overlay** (`resources/js/game/minigames/Slammer.ts`), mounted by F04's `Host` when
`me.stationId === 'powder-a'`, `me.workTile !== ''` and the clipboard has expired. `capturesMovement = true`
— arrows are chutes here, never movement intent.

- `onKey(key, down, repeat)`, phases `idle` / `mash` / `charge`: `left` → `send('mash', 'l')`; `up` →
  `send('mash', 'u')`; `right` → `send('mash', 'r')`; `down` consumed and ignored; `space` down →
  `send('charge')`, `space` up → `send('release')`; `interact` and `esc` return `false` so F04's floor
  behaviour fires (`E` → `interact`, `Esc` → `leave`). `repeat === true` is consumed and ignored — a held
  chute key must not become a fourth press. Phase `hands`: `onKey` consumes nothing, so `E` puts the keg
  down (F06), `Space` throws it (F06), `Esc` leaves. The first key press of any kind calls
  `slammerAudio.unlock()`.
- `update(station, me, serverNow)` decodes `station.mg` with `decodeMg` whenever the string changes and
  ignores a `null` (a stale or malformed value never throws in the render loop).
- Local prediction, operator only (the analogue of own-avatar prediction): a chute key lights immediately in
  a local set; `mg.mashed` reconciles it on every state update. Space-down starts the needle at
  `needleStartLocal = performance.now()` only if the local set has three chutes, using
  `tChargeLocal = chargeSeconds((thirdLocalT − firstLocalT)/1000, mg.cfg)` and
  `okMsLocal = okWindowMs(tChargeLocal, mg.cfg)`, with `mg.bandOffset` (known since the previous cycle).
  When `mg.phase` becomes `charge`, `mg.tCharge`/`mg.okMs` replace the local values (they differ only if the
  server clamped the mash interval). If `mg.phase` stays `mash` after 2·RTT the needle is cancelled (the
  server refused the charge). If the overlay mounts while `mg.phase === 'charge'` (reconnect),
  `needleStartLocal = performance.now() − (ctx.serverClock() − mg.chargeStartAt)·1000`.
- Gauge: horizontal, 60 % of `ctx.width`, 24 px tall, fixed scale `pxPerMs = width / gaugeTopMs(mg.cfg)`
  (2345 ms). Band = `[target − okMs, target + okMs]` filled amber; gold hairline 2 px at `target` with a
  translucent gold strip `±deadCenterMs` (50 ms — constant width at any heat); the late region past the band
  tinted red up to `target + okMs + overholdMs`. Because the scale is fixed, a hot mash draws a **smaller
  band closer to the left** and the needle reaches it sooner — the greed is visible before the release.
  Needle = 3 px white line at `(now − needleStartLocal) · pxPerMs`, frozen for 800 ms at the release
  position while the outcome label shows.
- Readout right of the gauge: `±<okMs> ms` and the combo `<n>×`. Outcome label above the gauge on every
  `mg.phase` transition out of `charge`: `DEAD CENTER`, `PRIME BOOM`, `LATE +<lastErrorMs>`,
  `EARLY −<|lastErrorMs|>`. These are functional labels with numbers, not joke copy, so they live in the
  overlay as constants (§14); `config/game/copy.json` is untouched by F07.
- Chute keys: three 48 × 48 px squares left of the gauge, labelled ← ↑ →, lit when in `mashed` (or the local
  set), dimmed while `station.state === 'working'` after a release (F05's re-arm) with the plunger drawn
  rising from `station.progress`.
- HANDS FULL panel replaces the gauge while `mg.phase === 'hands'`: `HANDS FULL` and three lines:
  `E  put it down (0.3 s)` · `Space  throw it` · `Esc or E leaves (drops the combo)`. The combo readout
  stays visible and keeps its value.
- Everything is drawn inside `ctx.container` at `(0,0)–(ctx.width, ctx.height)`; `unmount()` destroys it.

**In-world view** (`resources/js/game/minigames/SlammerWorld.ts`), one per `boom_powder` station on every
client, anchored at the station's anchor tile (the hopper; F05's station sprite and F12's layouts put the
hopper at `anchor`). `create(scene, station, layer)` also installs the four fx handlers with
`scene.fx.override` — with one Powder station in M1 there is exactly one installer, and the override
replaces F04's default so both never fire.

- Hopper glow: a radial glow 1.5 tiles wide, alpha = `mg.heat`, tint from `#ffb340` (heat 0.3) to `#fff2c0`
  (heat 1), tweened over 300 ms on change. Off when `heat === 0`.
- Combo counter: `<combo>×` text 1 tile above the hopper while `combo ≥ 1`; scales 1.3× → 1× over 150 ms on
  increment.
- Flag: a pennant 1.5 tiles above the hopper, raised over 300 ms when `tier ≥ 1`; droops (rotates 60° down
  over 500 ms) when the tier returns to 0; hidden after the droop.
- Steam: on every `thunk` while `tier ≥ 2`, a 6-particle puff rising 1 tile over 600 ms.
- Ripple: on every `thunk` while `tier ≥ 3`, a stroked circle on the floor expanding 1 → 2 tiles and fading
  over 300 ms.
- fx handlers: `thunk` → hopper squash (scaleY 0.85 → 1, 120 ms), camera shake (`size 1`: 60 ms at intensity
  0.004; `size 2`: 120 ms at 0.008 plus a 100 ms white flash on the hopper), confetti burst of 24 particles
  (`size 2`: 48) from a 4 × 4 px texture generated at create, `slammerAudio.thunk(combo, size)`. `pfft` →
  grey puff + `slammerAudio.pfft()`. `clink` → hopper wobble + `slammerAudio.clink()`. `slop` → a brown
  splash over the rim + `slammerAudio.slop()`. Shake/particle/tint numbers are not in the design docs; they
  sit in one `SLAMMER_SHOW` constants block at the top of the file for the playtest to tune.

**Audio** (`slammerAudio.ts`, in for M1 as beeps): `unlock()` creates the `AudioContext` on the first key
press (browser gesture rule). `thunk(combo, size)`: sine sweep 90 → 45 Hz over 120 ms, frequency ×
`2^(min(combo, 24) / 24)` so the pitch doubles by 24×, gain 0.6 (`size 2`: 0.9 with a 40 ms noise burst).
`pfft`: band-passed noise 150 ms. `clink`: 1200 Hz sine, 60 ms. `slop`: sine 200 → 80 Hz over 200 ms. No
samples, no assets, no music layers.

**Edge cases decided**
- Two `release` messages for one charge: the second arrives in phase `idle`/`hands` and is ignored.
- `charge` with fewer than three chutes: ignored; the overlay's unlit keys are the tell.
- Repeated chute press before the third: overflow (spill), mash state unchanged; the player still needs the
  missing chute.
- Overflow on a tile that already has a spill: `items.addSpill` is a no-op; the `slop` fx still plays.
- Overhold: blows as **late** at `target + okMs + 500 ms` of un-paused hold; spark rules apply.
- An interrupt (`ctx.paused`) mid-charge: the overhold accumulator stops; the release is still judged on the
  client interval, so a paused player is neither helped nor punished by the pause.
- Player disconnects mid-charge: no keg until F05 calls `onLeave(ctx, player, 'disconnect')` after the 30 s
  window, or the player reconnects and releases (judged with the server interval after the tolerance clamp
  if their `t` base changed).
- `ctx.complete` returns `'none'` (F05 could deliver nowhere): treated as `'shelved'` for phase purposes —
  phase `idle`, next mash allowed.
- Beacon `'red'` set by F10 while the combo is ≥ 25: gold is not written; when F10 clears to `'off'` gold
  returns on the next tick.
- Groove crosses 30 mid-cycle: the current `bandOffset` stands; the roll happens at join and after each
  release only.
- `overflowSpills: false`: the fourth press plays `slop` and nothing else.
- `'stepOff'` never reaches this module: `powder-a` is a `press` station, so movement is frozen while
  joined and the only exits are `E`, `Esc`, F10's ejection and disconnect.

## Acceptance criteria

- [ ] A 0.3 s mash produces `tCharge 0.7`, `okMs 105`, `heat 1`; a 0.8 s mash produces `tCharge 1.5`,
      `okMs 225`, `heat 0`; a 0.5 s mash produces `tCharge 1.0`, `okMs 150`.
- [ ] Releasing within ±50 ms of the band centre calls `ctx.complete` with a `keg` `{ quality 1.0, prime true }`
      and `perfect: true`, increments the combo and emits `fx thunk size 2`.
- [ ] Releasing inside the band but outside ±50 ms completes with `{ 1.0, prime false }`, `perfect: false`,
      increments the combo and emits `fx thunk size 1`.
- [ ] Releasing late completes with `{ 0.7, false }`, sets the combo to 0, emits `fx pfft`, and — after
      rolling `hazards.sparks.slammerRedline` with `world.rng.next()` — calls
      `hazards.sparkRing(world, 'powder-a', 'slammerRedline')`.
- [ ] Releasing early completes with `{ 0.4, false }`, sets the combo to 0, emits `fx clink`, and never sparks.
- [ ] A fourth chute press (or a repeated chute) calls `items.addSpill` at the operator's tile, emits
      `fx slop`, and leaves the combo and mash state unchanged.
- [ ] `charge` is ignored until all three chutes are mashed; `mash` is ignored in `charge` and `hands`; a
      `mash` from a player who is not the operator is ignored.
- [ ] With the output shelf full, `ctx.complete` returns `'hands'`, `mg.phase === 'hands'`, the combo is
      unchanged, and the phase returns to `idle` on the tick after `player.carrying` becomes `''`.
- [ ] `onLeave` for any reason aborts an unfinished cycle, zeroes `combo`, `tier`, `heat`, `player.combo`,
      empties `mashed`, sets the phase to `idle`, and clears a gold beacon.
- [ ] Combo 10 → `tier 1`; 25 → `tier 2`, `beacon 'gold'`, `banner 'HOT STREAK'` with
      `bannerUntil = clock + 2`; 50 → `tier 3`. A miss returns the tier to 0 and the beacon to `'off'`; a
      `'red'` beacon is never overwritten.
- [ ] While `groove ≤ 30`, `bandOffset` is re-rolled in `[−0.08, +0.08]` after every release; while
      `groove > 30` it is 0.
- [ ] A client-reported interval more than 100 ms from the server-measured one is clamped to the server's
      ±100 ms.
- [ ] Holding Space 500 ms of un-paused time past the band's late edge auto-resolves as late with a spark
      roll; the accumulator does not advance while `ctx.paused`.
- [ ] `StationState.mg` always equals `encodeMg(mg)` for the module's current `SlammerMg`, and `decodeMg`
      round-trips it.
- [ ] The operator overlay lights each chute on its key press, starts the needle on Space-down, draws the
      band at `[target − okMs, target + okMs]` on a fixed 2345 ms scale, and shows the outcome label with
      the signed error; `capturesMovement` is `true` and `interact`/`esc` are never consumed.
- [ ] Every client sees the hopper glow at `heat`, the combo counter, the flag at 10×, steam at 25×, and the
      floor ripple at 50×, whether or not they are the operator.
- [ ] A level file that omits `heat.overholdMs` and `comboBannerSeconds` validates, and
      `validateLevelConfig()` hands the module 500 and 2.

## Test plan

**Unit — `shared/tests/slammer.test.ts`**
- it doubles the mash span into the charge time
- it clamps a hot mash to minChargeSeconds and a lazy mash to maxChargeSeconds
- it clamps exactly at the 0.35 s and 0.75 s boundaries
- it is okMsAtMaxCharge at the max climb and okMsAtMinCharge at the min climb
- it interpolates the OK window linearly between the two climbs
- it never produces an OK window under windowFloorsMs.ok with the shipped numbers
- it maps heat 1 to the min climb and heat 0 to the max climb
- it applies the band drift to the target time
- it draws the gauge top at 2345 ms for the shipped numbers
- it judges DEAD CENTER within ±deadCenterMs inclusive
- it judges PRIME inside the band and outside dead center
- it judges late past the band and early before it
- it maps outcomes to keg quality and prime
- it rolls zero drift above the churn threshold
- it rolls drift within ±churnBandDrift at or below the threshold
- it counts combo tiers at 10, 25 and 50
- it trusts a client interval within the tolerance
- it clamps a client interval to the server interval ± tolerance
- it falls back to the server interval for a non-finite or negative client interval
- it round-trips SlammerMg through encode and decode
- it decodes a malformed mg string to null

**Unit — `game-server/tests/minigames/slammer.test.ts`** (a real `World` from `makeWorld({ players: 1 })`
(F03), started with `world.startDay(scaleLevel(world.level, 1))`; the player is walked onto `powder-a`'s
work tile and joined with `stations.onInteract`, then driven with `stations.onMg`; assertions read
`state`, `world.outbox`, `state.spillTiles`, `state.items` and `state.fuses` — no module mocks;
`world.rng` is re-seeded per test for the two rolls)
- it enters mash on the first chute and lights that chute
- it refuses the first mash while the machine is re-arming
- it ignores a mash from a player who is not the operator
- it spills at the operator's tile and emits slop on a fourth press
- it spills on a repeated chute without clearing the mash
- it emits slop but does not spill when overflowSpills is false
- it keeps the combo through an overflow
- it ignores charge before three chutes
- it starts the charge with tCharge, okMs and heat from the mash span
- it clamps a lying client mash span to the server span ± tolerance
- it shelves a prime keg, combo +1 and thunk size 2 on DEAD CENTER
- it shelves a 1.0 keg, combo +1 and thunk size 1 in the band
- it shelves a 0.7 keg, resets the combo and sparks the ring when late
- it does not spark when the roll is at or above slammerRedline
- it shelves a 0.4 keg and resets the combo when early
- it completes the cycle with perfect only on DEAD CENTER
- it ignores a second release after the first
- it enters hands when the output shelf is full and returns to idle when carrying clears
- it refuses mash in hands
- it enters hands from idle when the operator is handed something
- it keeps the combo through hands
- it auto-fires late overholdMs past the band
- it does not advance the overhold accumulator while the station is paused
- it lights the beacon gold at tier 2 and clears it on a miss
- it never overwrites a red beacon
- it sets the HOT STREAK banner once when crossing 25
- it re-rolls the band drift after each release only in the Churn
- it mirrors the combo to PlayerState.combo
- it aborts an unfinished cycle and resets everything on leave for each reason
- it writes StationState.mg only when the public state changes

**In-app verification** (two browsers, level 1, `DEV_ALLOW_NO_TICKET=1`)
1. Walk player A onto `powder-a`'s work tile, let the clipboard expire. Screenshot the overlay: three unlit
   chute keys, empty gauge, `0×`.
2. Press ← ↑ → slowly (about 0.8 s), hold Space, release when the needle reaches the hairline. Expect
   `PRIME BOOM` or `DEAD CENTER`, a thunk with shake and confetti, a normal keg on the shelf, `1×` above the
   hopper. Screenshot the overlay with the band and readout `±225 ms`.
3. Press ← ↑ → as fast as possible, hold Space. Screenshot: the band is small and near the left, readout
   `±105 ms`, the hopper glows bright in both browsers.
4. Release well late. Expect `pfft`, a steaming keg on the shelf, `0×`, and a spark flash on the floor ring.
   Put one keg on the ring first, release late again: the keg's fuse lights (F10 picked the fuelled tile).
5. Press ← ↑ → then ← again: a spill tile appears under player A with a slop splash; the combo is unchanged.
6. Chain 10 clean releases: the flag rises. 25: steam on each thunk, `HOT STREAK` banner, the beacon pole
   gold — screenshot from player B's browser standing at the dock. 50: floor ripple per thunk.
7. Keep going until the shelf holds 6: the seventh keg stays in A's hands, the HANDS FULL panel shows, the
   combo counter keeps its value. Press E: the keg is on the floor, the plunger accepts the next mash, the
   combo continues.
8. Press Esc mid-charge: no keg, `0×`, flag droops, beacon off.
9. Hold Space and never release: the plunger blows by itself as late.
10. Kill and restart the game server mid-charge; reconnect within 30 s; release: judged without an error,
    and the needle resumes from `mg.chargeStartAt`.

## Tasks

- [ ] `shared/src/sim/slammer.ts`: types, `KEG_QUALITY`, `chargeSeconds`; tests for the three clamp cases and boundaries.
- [ ] `okWindowMs`, `heatOf`, `targetMs`, `gaugeTopMs`; tests at 0.7 / 1.1 / 1.5 s and the OK-floor check.
- [ ] `judgeRelease`, `kegFor`; boundary tests at ±50 and ±okMs.
- [ ] `bandDrift`, `comboTier`; tests around 30 and at 9/10/24/25/49/50.
- [ ] `boundedMs`; tests for trust, clamp and the non-finite/negative fallback.
- [ ] `idleMg`, `encodeMg`, `decodeMg`; round-trip and malformed tests. Append
      `export * from './sim/slammer';` to `shared/src/index.ts`.
- [ ] `game-server/src/sim/minigames/slammer.ts`: `slammerModule.create`, `onJoin`/`onLeave`/`onInteract`/`starved`
      and the instance's private state; `game-server/tests/minigames/slammer.test.ts` on `makeWorld` with the
      join/leave/abort tests.
- [ ] `onMessage` `mash` incl. overflow (`items.addSpill`) and `ctx.beginCycle` gating; tests.
- [ ] `onMessage` `charge` with the bounded mash span; tests.
- [ ] `onMessage` `release` and `resolve`: `ctx.complete` with the keg `OutputSpec`, fx, phase after
      `'shelved'`/`'hands'`/`'none'`; outcome tests.
- [ ] Spark roll on late → `hazards.sparkRing(world, 'powder-a', 'slammerRedline')`; roll-boundary tests.
- [ ] `tick`: hands detection both directions; tests.
- [ ] `tick`: overhold accumulator, pause behaviour and auto-fire; tests.
- [ ] Combo tiers, beacon reconcile (red wins), banner, `player.combo`; tests.
- [ ] Run the server and drive `powder-a` with a scripted Colyseus client sending the three ops; confirm the
      `mg` transitions and the shelf filling.
- [ ] `resources/js/game/minigames/Slammer.ts`: `slammerOverlay` mount/unmount, `capturesMovement`, key
      mapping, local chute prediction, `ctx.send`; wire the `boom_powder` entry of `minigames` in
      `resources/js/game/minigames/index.ts`.
- [ ] Gauge, band, hairline, needle prediction (incl. the mid-charge mount), outcome label, readout.
- [ ] HANDS FULL panel and phase-`hands` key pass-through.
- [ ] `resources/js/game/minigames/SlammerWorld.ts`: `slammerStationView` glow, counter, flag, steam, ripple
      from `mg`; set `stationViews.boom_powder`.
- [ ] `scene.fx.override` handlers for `thunk` / `pfft` / `clink` / `slop` with shake and confetti.
- [ ] `slammerAudio.ts` beeps and the unlock-on-first-key.
- [ ] In-app verification steps 1–10 with screenshots; tick the Status boxes.

## Risks & open questions

- **The gauge scale reading.** `okMs / tCharge` is a constant 0.15 at both ends of the heat range (105/700,
  225/1500), so a gauge whose top is the band would draw the same-sized band at every heat. This doc reads
  "the drawn band scales with heat" literally and uses a fixed px-per-ms scale (2345 ms wide). If the
  playtest wants the band at the top and the *rate* as the read instead, that is a change to the overlay's
  `pxPerMs` only.
- **Spark on the pile.** F10's `sparkRing` picks the highest-fuel ring tile nearest the anchor, so one stray
  keg on the ring plus one late release is a fuse every time (with `slammerRedline 1.0`). That is the intent
  in `docs/16` ("a spark on the pile you just built"); if it proves too sharp at M1, tune
  `hazards.sparks.slammerRedline` rather than F10's tile choice.
- **Overflow on a repeated chute** is a decision, not in the docs. `docs/04` says "each exactly once" and "a
  fourth press (any key) overflows"; treating a repeat as an overflow is the simplest rule that honours both.
  If it punishes fumbles too hard, the alternative is to ignore repeats and spill only on a press after three.
- **Screen shake for every client on every thunk** at a hot 1.4 s tempo may be too much on a small map.
  Numbers live in `SLAMMER_SHOW` for the playtest.
- **50 ms quantisation of the server-measured span.** `ctx.now` is `state.clock`, which advances once per
  tick, so the server's own measurement of a press-to-press interval can be up to 50 ms stale. That is why
  the clamp tolerance is `windowFloorsMs.ok` (100 ms) and not tighter; if the tolerance is ever lowered, the
  module needs a sub-tick timestamp instead.

**Contract change requested** (edits to `docs/features/00-contracts.md`):

Everything F07 asked for in v1 is in v2 (`fx.kind 'slop'`, `heat.overholdMs`, `comboBannerSeconds` as
optional keys with §13 defaults, the `boom_powder` `mg` = `encodeMg(SlammerMg)` line, the
`windowFloorsMs.ok` tolerance, and the reconciled §10.1/§10.3/§10.4/§10.5/§10.9 module APIs). What v2 still
does not settle:

1. **§10.3 `onMessage`'s `t` argument has no stated base.** F07 assumes F05 forwards `msg.t` unchanged (the
   client's raw `performance.now()` ms), which is what §7's "the Slammer needs no conversion" implies and
   what `World.inputClock` being a `World` method (not a `StationCtx` one) suggests. If F05 instead converts
   with `inputClock` before forwarding, the Slammer's press-to-press intervals become clock-quantised and
   `boundedMs` loses its point. One sentence in §10.3 fixing `t` as the raw client ms would close it.
2. **§10.3's enumeration of `shared/src/sim/slammer.ts` exports omits `gaugeTopMs`.** It is the fixed gauge
   length (`maxChargeSeconds·1000·(1 + churnBandDrift) + okMsAtMaxCharge + overholdMs`), used only by the
   overlay but kept in the shared module so it has a vitest test — the client test directory
   (`resources/js/game/__tests__`) is F04's. Either add the name to §10.3's list or accept an untested
   constant in `Slammer.ts`.
3. **§10.3's `ctx.complete` return `'none'` has no defined meaning.** F07 treats it as "no item was
   delivered anywhere" and leaves the plunger free (phase `idle`). If F05 means something else by it (for
   example a rejected cycle that should not re-arm), §10.3 should say so.
4. **The game-server test path for a mini-game module is not named in §12.** F07 writes
   `game-server/tests/minigames/slammer.test.ts` by analogy with §1's `shared/tests/<module>.test.ts` rule;
   §12's F03 row claims "core tests" and its Slammer row lists source files only.
