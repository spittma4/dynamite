# F08 — The Jig (Assembly)
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/jig.ts` · `shared/tests/jig.test.ts` · `game-server/src/sim/minigames/jig.ts` · `game-server/tests/minigames/jig.test.ts` · `resources/js/game/minigames/Jig.ts` · `resources/js/game/minigames/JigWorldFx.ts`
**Touches:** `shared/src/index.ts` (one `export * from './sim/jig';` line, F02) · `resources/js/game/minigames/index.ts` (the two `assembly` entries, F04) · `config/game/copy.json` (one key `events.primeStick`, F12)
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/04-minigames.md` (The Jig) · `docs/03-stations.md` (Assembly) · `docs/06-orders-quality-rework.md` (Attributes, Defect sources) · `docs/13-config-schema.md` · `docs/14-roadmap.md` · `docs/05-flow-mechanics.md` (Cycle) · `docs/16-hazards-and-explosions.md` (Sparks) · `docs/17-oops-carry-and-throw.md` (Butterfingers)

## Goal

A player who joins a jig work tile of `assembly-a` sees an overlay in the bottom third of the screen: a
shelf picker showing every casing with its dents, then one phrase on the factory beat — the fill line
rising to the mark, two or three knots sliding in on the left or right lane, three ratchet clicks — that
they play with `Space`, `←`, `→`. A second player on the rack tile picks short or long against the order
chip, fetches a spool and cap, and tosses the set across the aisle on a swing arc that everyone on the
floor can see; a Perfect toss lands in the cradle and A's knots arm instantly, a miss litters the aisle in
front of everyone. Every stick that leaves the jig carries exactly the attributes the two players earned
(dents, fill, fray, cap, powder quality, fuse length, order), and a flawless cycle produces one brass
flash, one chime, a Groove impulse and a stick that gleams on the shelf. A solo player can run the whole
station, visibly slower, by walking to the rack for parts and carrying them back.

## Scope

**In (M1):**
- Roles from F05's membership: A is the earliest-joined `work` member, B the earliest-joined `rack`
  member, later work members are helpers with no inputs (they count for F05's staffing curve only).
- The casing feeder: while the day runs, the adapter keeps `minigame.casings.stock` casings on
  `assembly-a`'s input shelf, dented with probability `minigame.casings.dentChance`. Casing Prep is M2;
  this is the M1 casing supply (contracts §13 default `{ stock: 3, dentChance: 0.3 }`).
- A's phrase driven by the server clock at `bpm` 150 (0.4 s/beat): SEAT (picker with dents, binds
  `orderId` from `activeOrderId`), POUR (5/7/8 beats by keg quality, ±60/±140 ms, ×1.5 with a prime keg,
  weak 0.6 / overfill 1.2 + spill), KNOTS (long 3 / short 2, lanes from the seeded RNG, ±60/±140 ms,
  2+ missed → `frayed`), CRIMP (a 0.4 s lead-in then three 0.4 s clicks, tap on the third, ±80/±180 ms, miss → `capLoose`,
  a `crimpOnDented` roll on a dented casing through F10).
- PRIME STICK: clean seat + Perfect pour from a 1.0 keg + all knots Perfect + Perfect crimp →
  `fx chime`, station-local brass flash, `grooveEvents.primeSticks++`, `ItemState.prime = true`.
- B: `pick` short/long, `fetch` (0.6 s) creating a carried `parts` item, `swing` (arc 0.5 s), `toss`
  judged ±120/±250 ms: Perfect → cradle armed; OK → jig surface, 0.5 s tax; miss → `parts` floor item on
  the aisle tile that blocks the next swing until hauled. Full cradle bounces the set. A body in the
  aisle takes the hit.
- Solo / hauler path: a player *standing* on a jig work tile (not joined — a `press` station refuses a
  join with full hands) while carrying a `parts` item arms an empty cradle; there is no toss-to-self.
- Kegs hold `recipes.keg.output.pours` pours; the jig tracks `poursLeft`; an empty keg is destroyed.
- Bail (Esc, `E`, disconnect, F10 ejection): mid-pour spill, mid-knots the part set is discarded,
  mid-crimp the stick pops off with a loose cap through F06's drop table.
- F05 interrupt pauses and F05/F10 blocked spans (`jammed`/`damaged`) shift the phrase's pending beats.
- `StationState.mg` JSON for the overlay through `ctx.setMg`; `state`/`progress` through `status(ctx)`;
  client overlay (A panel, B panel), in-world toss arc and PRIME STICK flash through F04's `StationView`.
- Tally: `kegsUsed` when a keg leaves the input shelf, `defects` on every stick with
  `capLoose || frayed || fill !== 1.0`.

**Out (later milestones):**
- Colour on casings and the DIE/colour beat; dents made by Casing Prep (M2 — Stamp & Crimp). M1 casings
  are red; `ItemState.dents` is drawn whatever its source.
- Churn's ±100 ms knot delay (M2 — Groove/Churn).
- Mega Boom (2 pours, cycle ×1.6) and the `cycleMultiplier` recipe key (M2 — product attributes).
- Second Jig / Parts Rack upgrades, 4-tile jigs (M4).
- QA's chalk mark on the jig and Rework returning ½ pours (M2).
- Putting a hauled `parts` set anywhere other than the cradle (parts stay clutter until then).

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/jig.ts` | Pure Jig state machine: types, `createJigState`, `reduceJig` (mutates state, returns effects), `toMg`, `stationStatus`, and the timing helpers (`judge`, `pourBeats`, `pourWindow`, `nextBeat`, `laneSequence`, `knotTimes`, `crimpClicks`, `isFrayed`, `isPrimeStick`, `deriveAisleTile`). No I/O, no Colyseus, no World; `rng: () => number` is passed in. |
| `shared/tests/jig.test.ts` | Vitest for everything in `shared/src/sim/jig.ts`. |
| `game-server/src/sim/minigames/jig.ts` | `export const jigModule: MinigameModule` — the body of F05's `minigames/jig.ts` stub. Builds the per-tick `JigTickView` from the `StationCtx` and the World, feeds events to `reduceJig`, applies the returned effects through `ctx` / F06 / F09 / F10, runs the casing feeder, returns `status(ctx)`. |
| `game-server/tests/minigames/jig.test.ts` | Vitest for the adapter over F03's `makeWorld` helper: feeder, view building, effect application, `mg` and `status` writes. |
| `resources/js/game/minigames/Jig.ts` | `export const jigOverlay: OverlayFactory` — the station overlay for the player at the jig: seat picker, phrase bar with needle, judgement pops and sounds, B panel; maps `OverlayKey`s to `mg` ops. |
| `resources/js/game/minigames/JigWorldFx.ts` | `export const jigView: () => StationView` — in-world drawing every client sees regardless of where they stand: the toss arc rack → jig, the cradle contents on the jig sprite, the PRIME STICK brass flash. |

### Interfaces

**Consumes**

From the contracts (§3, §4, §7, §8, §13):
- `FactoryState.{clock, phase, stations, items, orders, players, width, height}`;
  `StationState.{id, anchorX, anchorY, inputShelf, outputShelf, inputCap, outputCap, state, progress, mg, pausedUntil}`;
  `PlayerState.{workTile, stationId, carrying, facing, bubble, bubbleUntil}`;
  `ItemState.{id, type, x, y, holder, shelf, quality, prime, dents, fuseLength, fill, capLoose, frayed, orderId}`;
  `OrderState.{id, status, fuseLength}`.
- `mg` message `{ stationId, op, t, v? }` with the assembly ops `seat` (`v` = shelf index), `pour`,
  `knot` (`v` `'l'|'r'`), `crimp`, `pick` (`v` `'short'|'long'`), `fetch`, `swing`, `toss`. Every `t` is
  the client's `performance.now()` ms and reaches server seconds only through `world.inputClock`.
- `fx` kinds `'chime'` (PRIME STICK) and `'bonk'` (cradle bounce). No other fx: knot zips, the toss
  *tink* and the *chunk* of an ordinary stick are played client-side from `mg.last`.
- `LevelConfig.{bpm, recipes.keg.output.pours, hazards.sparks.crimpOnDented}`;
  `StationConfig.{id, joinMode ('press'), workTiles, rackTiles, inputShelf, outputShelf, minigame}` for
  `assembly-a`; `LayoutConfig` only through `world` helpers.

From F02 (`@shared` barrel): types `Tile`, `FuseLength`, `ItemType`, `MgOp`, `FxKind`, `LevelConfig`,
`StationConfig`, and the schema classes; `tileOf`, `tileKey` (`sim/tiles.ts` — the jig defines neither);
`MAX_INPUT_BACKDATE_S` (`sim/constants.ts`); `copy` and `fill` (`copy.ts`); `FACING_DIRS` and
`BUBBLE_SECONDS` (pure `sim/items.ts`).

```ts
// F03 — game-server/src/sim/World.ts
world.now: number                                     // getter, === state.clock (seconds)
world.level: LevelConfig                              // ScaledLevel after startDay, §13 defaults applied
world.state: FactoryState
world.stationConfig(id: string): StationConfig
world.playersAt(tx: number, ty: number): string[]     // floor players (stationId === '')
world.itemsAt(tx: number, ty: number): string[]       // holder === '' && !inFlight
world.rng.next(): number                              // seeded, [0, 1)
world.inputClock(sessionId: string, tMs: number): number      // clock seconds, clamped to [clock − MAX_INPUT_BACKDATE_S, clock]
world.tally.bump(key: 'kegsUsed' | 'defects'): void
world.grooveEvents.primeSticks: number                // drained by F11's grooveSystem each tick

// F05 — game-server/src/sim/minigames/types.ts + stations.ts
export interface MinigameModule { create(station: Station): MinigameInstance }   // join mode comes from cfg.joinMode
export interface MinigameInstance {
  onJoin(ctx: StationCtx, player: PlayerState, role: Role): void;
  onLeave(ctx: StationCtx, player: PlayerState, reason: LeaveReason): void;
  onInteract(ctx: StationCtx, player: PlayerState): boolean;
  onMessage(ctx: StationCtx, player: PlayerState, op: MgOp, v: number | string | undefined, t: number): void;
  tick(ctx: StationCtx, dt: number): void;
  starved(ctx: StationCtx): boolean;
  status?(ctx: StationCtx): { state: 'idle' | 'starved' | 'working'; progress: number } | null;
}
// StationCtx members the jig uses: world, station, cfg, now, phase, paused, rearmAt, operators,
// rackHands, helpers, sessionIdOf(player), inputShelf(), consume(itemId), beginCycle(), complete(result),
// abort(), setMg(value), fx(kind, x, y, extra?), bubble(sessionId, text, seconds)
// Station members the jig uses: st (StationState), members (Map<sessionId, Member> with joinedAt)

// F06 — game-server/src/sim/items.ts
createItem(world, type: ItemType, attrs?): ItemState
destroyItem(world, itemId: string): void
giveToPlayer(world, item: ItemState, sessionId: string): boolean
placeNear(world, item: ItemState, t: Tile): boolean
shelfPush(world, station: StationState, side: 'in' | 'out', item: ItemState): boolean
dropItem(world, item: ItemState, origin: Tile, dir: Tile, culpritId: string): DropOutcome
addSpill(world, t: Tile): void

// F09 — game-server/src/sim/orders.ts
activeOrderId(world): string                          // lowest-numbered 'open' order, '' when none

// F10 — game-server/src/sim/hazards.ts
sparkRing(world, stationId: string, cause: SparkCause): SparkResult   // caller rolls hazards.sparks.crimpOnDented
```

```ts
// F04 — resources/js/game/minigames/{types,index}.ts, scenes/Factory.ts
export type OverlayKey = 'left' | 'right' | 'up' | 'down' | 'space' | 'interact' | 'esc';
export interface OverlayContext { scene: Factory; room: Room<FactoryState>; sessionId: string; state: FactoryState;
  container: Phaser.GameObjects.Container; width: number; height: number; stationId: string; stationType: StationType;
  clock: ServerClock; serverClock(): number; anchorPx(): { x: number; y: number };
  send(op: MgOp, v?: number | string): void; sendInteract(): void; sendAction(): void }
export interface MinigameOverlay { capturesMovement: boolean; mount(ctx): void;
  update(station: StationState, me: PlayerState, serverNow: number): void;
  onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean; unmount(): void }
export interface StationView { create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void;
  update(station: StationState, serverNow: number): void; destroy(): void }
export const minigames: Record<StationType, OverlayFactory>;             // F08 fills the `assembly` entry
export const stationViews: Partial<Record<StationType, () => StationView>>;   // F08 fills the `assembly` entry
```

**Produces**

`shared/src/sim/jig.ts` (every exported name is prefixed so the `@shared` barrel stays collision-free —
F02 already exports a report `Grade`):

```ts
export type JigLane = 'l' | 'r';
export type JigGrade = 'perfect' | 'ok' | 'miss';
export type JigPhase = 'seat' | 'pour' | 'parts' | 'knots' | 'crimp';
export type JigBPhase = 'idle' | 'fetching' | 'holding' | 'swinging';
export type JigCradle = 'empty' | 'armed' | 'surface';
export type JigNote = '' | 'early' | 'late' | 'lane' | 'full' | 'body';
export interface JigWindow { perfectMs: number; okMs: number }

export interface JigConfig {                                   // StationConfig.minigame for type assembly, plus two level numbers
  bpm: number;                                                 // level.bpm
  pour: { beatsByQuality: Record<string, number>; perfectMs: number; okMs: number; primeKegWindowMultiplier: number };
  knots: { long: number; short: number; secondsPerKnot: number; perfectMs: number; okMs: number };
  crimp: { clicks: number; leadSeconds: number; clickSeconds: number; perfectMs: number; okMs: number };
  toss: { arcSeconds: number; perfectMs: number; okMs: number };
  casings: { stock: number; dentChance: number };               // §13 default { stock: 3, dentChance: 0.3 }
  kegPours: number;                                             // recipes.keg.output.pours
}
export interface JigTiles { jig: Tile[]; rack: Tile[]; aisle: Tile }

export interface JigMg {                                       // StationState.mg, JSON
  tiles: JigTiles;
  a: string; b: string;                                        // sessionIds, '' when empty
  phase: JigPhase; bpm: number;
  beatStartAt: number;                                         // clock second of the current phase's first beat
  rearmFrom: number; rearmAt: number;                          // the re-arm bar's ends (clock seconds)
  seated: { dents: number; colour: 'red'; orderId: string } | null;
  fill: number;                                                // 0 until the pour resolves, then 0.6 | 1.0 | 1.2
  pour: { startAt: number; targetAt: number; beats: number; primeKeg: boolean } | null;
  keg: { quality: number; prime: boolean; poursLeft: number } | null;
  lanes: JigLane[]; knotAt: number[]; knotIndex: number; knotGrades: JigGrade[];
  crimpClickAt: number[];                                      // three clock-second times
  cradle: JigCradle; cradleFuse: FuseLength | ''; surfaceReadyAt: number;
  bPhase: JigBPhase; bPick: FuseLength; bFetchDoneAt: number; swingStartAt: number;
  aisleBlocked: boolean;
  orderChip: { orderId: string; fuseLength: FuseLength }[];     // next two 'open' orders
  last: { who: 'a' | 'b'; step: 'pour' | 'knot' | 'crimp' | 'toss'; grade: JigGrade; note: JigNote; at: number } | null;
  primeAt: number;                                             // clock second of the last PRIME STICK, 0 if none
}
export interface JigState extends JigMg {                      // private fields never leave the server
  cfg: JigConfig;
  casingItemId: string; kegItemId: string; aTile: Tile;
  pourGrade: JigGrade | ''; primePour: boolean; lastTickAt: number;
}

export interface JigTickView {
  now: number; dt: number;
  paused: boolean;                                             // ctx.paused
  cycleIdle: boolean;                                          // ctx.phase === 'idle' — what ctx.beginCycle() tests
  rearmAt: number;                                             // ctx.rearmAt
  operators: string[]; rackHands: string[];                    // sessionIds, earliest Member.joinedAt first
  shelf: { index: number; itemId: string; type: ItemType; dents: number; quality: number; prime: boolean }[];
  casingCount: number; shelfRoom: number;                      // feeder inputs (inputCap − inputShelf.length)
  activeOrderId: string;                                       // orders.activeOrderId(world)
  orders: { orderId: string; fuseLength: FuseLength }[];        // status 'open', lowest-numbered first
  aisleFloorItem: boolean; bodyOnAisle: string;                // any floor item / sessionId standing on tiles.aisle
  partsOnJigTile: { sessionId: string; itemId: string; fuseLength: FuseLength } | null;
  aCarrying: string; bCarrying: string;                        // A's and B's PlayerState.carrying
}

export type JigEvent =
  | { t: 'tick'; view: JigTickView }
  | { t: 'input'; sessionId: string; op: MgOp; v?: number | string; at: number }   // at = world.inputClock(...)
  | { t: 'leave'; sessionId: string }
  | { t: 'refused' };                                          // ctx.beginCycle() returned false

export interface JigStickInit { quality: number; prime: boolean; dents: number; fuseLength: FuseLength;
  fill: number; capLoose: boolean; frayed: boolean; orderId: string }

export type JigEffect =
  | { e: 'beginCycle' }                                        // ctx.beginCycle(); false is fed back as { t: 'refused' }
  | { e: 'consume'; itemId: string }                           // ctx.consume(itemId)
  | { e: 'destroyItem'; itemId: string }                       // items.destroyItem
  | { e: 'stockCasing'; dents: number }                        // items.createItem('casing', { dents }) + items.shelfPush(…, 'in', item)
  | { e: 'createParts'; fuseLength: FuseLength; sessionId: string }   // items.createItem('parts', { fuseLength }) + items.giveToPlayer
  | { e: 'partsToFloor'; itemId: string; tile: Tile }          // items.placeNear
  | { e: 'complete'; item: JigStickInit; perfect: boolean; handsOf: string }   // ctx.complete({ item: OutputSpec, perfect })
  | { e: 'dropStick'; item: JigStickInit; origin: Tile; culpritId: string }    // items.createItem + items.dropItem + ctx.abort()
  | { e: 'abort' }                                             // ctx.abort()
  | { e: 'spill'; tile: Tile }                                 // items.addSpill
  | { e: 'spark' }                                             // rng roll on hazards.sparks.crimpOnDented → hazards.sparkRing(world, cfg.id, 'crimpOnDented')
  | { e: 'fx'; kind: FxKind; x: number; y: number; text?: string }              // ctx.fx
  | { e: 'bubble'; sessionId: string }                         // ctx.bubble(sessionId, copy.bubbles.whoThrewThat, BUBBLE_SECONDS)
  | { e: 'primeStick' }                                        // world.grooveEvents.primeSticks++
  | { e: 'tally'; key: 'kegsUsed' | 'defects' };               // world.tally.bump(key)

export function createJigState(cfg: JigConfig, tiles: JigTiles): JigState
export function reduceJig(state: JigState, event: JigEvent, rng: () => number): JigEffect[]   // mutates state
export function toMg(state: JigState): JigMg
export function stationStatus(state: JigState, view: JigTickView): { state: 'idle' | 'starved' | 'working'; progress: number }

export function judge(offsetMs: number, w: JigWindow, scale?: number): JigGrade      // inclusive bounds; scale defaults to 1
export function pourBeats(quality: number, beatsByQuality: Record<string, number>): number
export function pourWindow(cfg: JigConfig['pour'], primeKeg: boolean): JigWindow
export function nextBeat(clock: number, beatSeconds: number): number
export function laneSequence(rng: () => number, count: number): JigLane[]
export function knotTimes(startAt: number, count: number, secondsPerKnot: number): number[]
export function crimpClicks(lastKnotAt: number, clicks: number, leadSeconds: number, clickSeconds: number): number[]
export function isFrayed(grades: JigGrade[]): boolean
export function isPrimeStick(s: { dents: number; pourGrade: JigGrade | ''; kegQuality: number; knotGrades: JigGrade[]; crimpGrade: JigGrade }): boolean
export function deriveAisleTile(rack: Tile, jig: Tile): Tile
```

`shared/src/index.ts` gains `export * from './sim/jig';` (one line, F02's file).

`game-server/src/sim/minigames/jig.ts`: `export const jigModule: MinigameModule`. F05's
`MINIGAMES.assembly` already points at it; there is no registration side effect. `StationState.mg` for
every `assembly` station is written by `ctx.setMg(toMg(state))` (F05 stringifies and writes on change).

`resources/js/game/minigames/Jig.ts`: `export const jigOverlay: OverlayFactory`.
`resources/js/game/minigames/JigWorldFx.ts`: `export const jigView: () => StationView`. F04's
`minigames/index.ts` gets `assembly: jigOverlay` in `minigames` and `assembly: jigView` in `stationViews`
(two lines, F04's file).

Items produced: `stick` items (`s-<n>`) with `quality`, `prime`, `dents`, `fuseLength`, `fill`,
`capLoose`, `frayed`, `orderId` set; `parts` items (`p-<n>`) with only `type`, `fuseLength` and the
holder meaningful (every other field is its schema default); `casing` items (`c-<n>`) with `dents` from
the feeder.

### Data & config

Read from `assembly-a`'s `StationConfig` and the level (values are F12's baseline; every optional key
already has §13's default applied by `validateLevelConfig`):

| Key | Value | Used for |
|---|---|---|
| `bpm` | 150 | `beatSeconds = 60 / bpm = 0.4` |
| `minigame.pour.beatsByQuality` | `{ "1.0": 5, "0.7": 7, "0.4": 8 }` | pour length in beats; a quality below every key (a knocked-over keg) uses the smallest key's value; otherwise the largest key ≤ quality |
| `minigame.pour.perfectMs / okMs` | 60 / 140 | pour window |
| `minigame.pour.primeKegWindowMultiplier` | 1.5 | ±90 / ±210 ms with a `prime` keg |
| `minigame.knots.long / short` | 3 / 2 | knots per fuse length |
| `minigame.knots.secondsPerKnot` | 0.4 | knot spacing (one beat) |
| `minigame.knots.perfectMs / okMs` | 60 / 140 | knot window |
| `minigame.crimp.clicks / leadSeconds / clickSeconds` | 3 / 0.4 / 0.4 | ratchet lead-in and spacing |
| `minigame.crimp.perfectMs / okMs` | 80 / 180 | crimp window (EL-186: `okMs < clickSeconds/2`, so click 2 can never score) |
| `minigame.toss.arcSeconds` | 0.5 | swing duration; the judged moment is `swingStartAt + arcSeconds` |
| `minigame.toss.perfectMs / okMs` | 120 / 250 | toss window |
| `minigame.casings` | `{ stock: 3, dentChance: 0.3 }` (§13 default; level files may omit it) | the feeder's target casing count and dent probability |
| `recipes.keg.output.pours` | 2 | `keg.poursLeft` when a keg is taken |
| `workTiles` / `rackTiles` | from the level (`mvp-small`: `[[13,8],[14,8]]` / `[[16,8]]`) | jig tiles / rack tile; `tiles.aisle = deriveAisleTile(rackTiles[0], nearest jig tile)` = `[15,8]` on that map |
| `inputShelf.capacity`, `accepts` | 8, `["keg","casing"]` | the seat picker draws only casings; the first keg by shelf index is the next pour source; the feeder tops casings up to `casings.stock` while the shelf has room |
| `outputShelf.capacity` | 4 | `ctx.complete` shelves the stick when there is room, else it lands in A's hands |
| `hazards.sparks.crimpOnDented` | 0.3 | rolled by F08 with `world.rng.next()` before `hazards.sparkRing` |
| `groove.weights.primeStick` | (F12's baseline) | the size of the PRIME STICK Groove impulse; F11 applies it from `grooveEvents.primeSticks` |
| `windowFloorsMs` | `{ ok: 100, perfect: 45 }` | F02's validator; every window above satisfies it |
| `MAX_INPUT_BACKDATE_S` | 0.2 | F02 `sim/constants.ts`; how long a beat stays open after its OK window before it auto-misses |
| `BUBBLE_SECONDS` | (F06) | the WHO THREW THAT bubble's duration |

Numbers from the design docs that are not config keys: fill values 0.6 weak / 1.0 / 1.2 overfill
(docs/06); surface tax 0.5 s (docs/04); fetch 0.6 s (docs/04).

Constants F08 introduces (not in the design docs, stated here so a reviewer can object): the PRIME STICK
brass flash lasts 0.6 s (client only).

Copy: `config/game/copy.json` gains one key, `events.primeStick`, sent as the `fx chime` text; the aisle
bubble is `copy.bubbles.whoThrewThat`. No string is inline.

Schema fields written: `StationState.mg` (via `ctx.setMg`), `StationState.state` (`idle`/`starved`/
`working` only) and `progress` (both returned from `status(ctx)`; F05 writes them and leaves them alone
while `jammed`/`damaged`); `PlayerState.bubble`/`bubbleUntil` on the aisle body (via `ctx.bubble`); every
`ItemState` field named in `JigStickInit` on new sticks, `fuseLength` on `parts` items and `dents` on
feeder casings (all through F06). F08 never writes `FactoryState.groove`, `score`, `banner`, `beacon`,
`workers`, `efficiency`, `interruptsPerSecond` or `floorCount`.

### Behaviour

All times are `FactoryState.clock` seconds. `beat = 60 / bpm = 0.4`. An input's time is
`at = world.inputClock(sessionId, msg.t)`. A beat is *open* from its scheduled time minus `okMs` until
`scheduled + okMs + MAX_INPUT_BACKDATE_S`; when it closes with no input it auto-resolves as a miss. The
server owns every outcome; the client only draws and sends.

**Feeder (every tick, before the phrase).** While `view.casingCount < cfg.casings.stock` and
`view.shelfRoom > 0`, emit one `stockCasing` per tick with
`dents = rng() < cfg.casings.dentChance ? 1 + floor(rng() × 2) : 0` (1–2 dings, so the seat decision and
the crimp spark stay alive in M1). One casing per tick keeps the shelf refill visible and the RNG draw
order deterministic. The feeder never pushes past `inputCap` and never touches kegs — powder comes from
the Slammer.

**Roles (every tick, from `view.operators` / `view.rackHands`; F05 assigns `work`/`rack`/`helper` by
tile).**
1. `a = view.operators[0]` (earliest `Member.joinedAt`) when `a === ''`; later work members are helpers:
   no inputs are accepted from them and they are promoted the tick A leaves.
2. `b = view.rackHands[0]` or `''`. When B changes or leaves: `fetching` is cancelled (nothing was made
   yet); `swinging` is cancelled (the set stays in their hands as a carried `parts` item); `bPhase`
   becomes `idle`, or `holding` when the new B already carries a `parts` item.
3. Inputs from a session that is neither `a` nor `b` are ignored.
4. F05 calls `onLeave` for every departure (E, Esc, disconnect, F10 ejection); the adapter feeds it as
   `{ t: 'leave' }` so a bail resolves immediately. The tick's reconciliation runs the same `bail` path
   if a member ever disappears from `view.operators` without the hook.

**Cradle from hands (every tick).** A `press` station refuses a join with full hands, so the hauler and
the solo player never *join* while carrying: `view.partsOnJigTile` is the first player **standing** on a
jig work tile (`world.playersAt`) whose carried item is a `parts` item. When `cradle === 'empty'` and
that player exists: `cradle = 'armed'`, `cradleFuse = their fuseLength`, effect `destroyItem(itemId)`.
With a full cradle they keep carrying and the rule fires when it empties. This is the only way parts
reach the cradle other than B's toss; there is no toss-to-self.

**A — SEAT** (`op: 'seat'`, `v` = index into `station.inputShelf`), accepted only when: `phase === 'seat'`,
`view.cycleIdle`, `now ≥ view.rearmAt`, not paused, `view.aCarrying === ''` (hands full → the picker says
HANDS FULL — the same predicate `ctx.beginCycle()` tests), the shelf entry at `v` is a `casing`, and a
pour is available (`keg.poursLeft > 0` or a `keg` on the shelf). Anything else is ignored (the client
re-renders from state).
1. Effect `beginCycle` first. A `false` return is fed back as `{ t: 'refused' }`, which restores
   `phase = 'seat'` and drops the remaining effects (nothing has been consumed yet).
2. `casingItemId = shelf[v].itemId`; effect `consume(casingItemId)` then `destroyItem(casingItemId)` —
   the casing now lives in the jig and re-emerges as the stick. `seated = { dents, colour: 'red',
   orderId: view.activeOrderId }` (F09's lowest-numbered open order; `''` when none is open).
3. `aTile` = A's `workTile`. → *POUR*.

**A — POUR.**
1. Keg selection: if `kegItemId === ''` or `keg.poursLeft === 0`, take the first `keg` on the shelf by
   index: `consume`, `keg = { quality, prime, poursLeft: cfg.kegPours }`, effect
   `tally('kegsUsed')`. With no keg the phase is `pour` with `pour === null` and the station reads
   `starved` until one arrives (the tick retries).
2. `pour.startAt = nextBeat(now, beat)` (the smallest multiple of `beat` ≥ `now`),
   `pour.beats = pourBeats(keg.quality, cfg.pour.beatsByQuality)`,
   `pour.targetAt = startAt + beats × beat` (2.0 s prime, 2.8 s damp, 3.2 s dud),
   `pour.primeKeg = keg.prime`, `beatStartAt = startAt`. `keg.poursLeft −= 1`; when it reaches 0, effect
   `destroyItem(kegItemId)` and `kegItemId = ''` (`keg` stays in `mg` so the overlay shows an empty keg
   until the next one is taken).
3. The fill rises linearly: `fillAt(t) = (t − startAt) / (targetAt − startAt)` (1.0 at the mark, 1.2 at
   `targetAt + 0.2 × beats × beat`).
4. `op: 'pour'` at `at`: `offset = (at − targetAt) × 1000`,
   `grade = judge(offset, pourWindow(cfg.pour, keg.prime))`. Perfect or OK → `fill = 1.0`,
   `primePour = grade === 'perfect'`. Miss with `offset < 0` → `fill = 0.6`, note `early`. Miss with
   `offset > 0` → `fill = 1.2`, note `late`, effect `spill(aTile)`. Any tap ends the pour (the keg
   lifts), even at fill 0.1.
5. No tap once the fill has reached 1.2 *and* the beat has closed (`targetAt + okMs + MAX_INPUT_BACKDATE_S`,
   the rule every other step already uses; a wide prime-keg window outlives the overfill) → resolved as a
   late miss exactly as above, judged at the overfill so the fill and the spill are unchanged.
6. `pourGrade = grade`, `last = { who: 'a', step: 'pour', grade, note, at }`. → *PARTS*.

**PARTS (waiting for the cradle).** `cradle === 'armed'` → *KNOTS* now. `cradle === 'surface'` → *KNOTS*
when `now ≥ surfaceReadyAt` (the tick promotes `surface` → `armed` at that moment). Otherwise wait; the
station reads `starved`. The OK-toss tax is automatic: A presses nothing (`E` is F05's join/leave key, so
docs/04's "A taps `E`" becomes a 0.5 s wait).

**A — KNOTS.**
1. On entry: `cradle = 'empty'`, `n = cfg.knots[cradleFuse]`, `lanes = laneSequence(rng, n)` (each lane
   `rng() < 0.5 ? 'l' : 'r'`, drawn in order, so a seed reproduces the sequence),
   `knotAt = knotTimes(nextBeat(now, beat), n, cfg.knots.secondsPerKnot)` = `[start + 0.4, start + 0.8,
   start + 1.2]` (the marker needs one beat to slide in; long = 3 knots over 1.2 s, short = 2 over
   0.8 s), `beatStartAt = start`, `knotIndex = 0`, `knotGrades = []`; `cradleFuse` is kept for the stick.
2. `op: 'knot'` with `v` at `at` always judges knot `knotIndex` (no backtracking): `v !== lanes[knotIndex]`
   → miss, note `lane`; else `judge((at − knotAt[knotIndex]) × 1000, cfg.knots)` with note `early`/`late`
   on a miss. A tap earlier than the OK window still consumes the knot (spamming ← eats the phrase).
   Push the grade, `knotIndex += 1`, set `last`.
3. A knot whose beat closes (`now > knotAt[i] + okMs/1000 + MAX_INPUT_BACKDATE_S` = 0.34 s after its
   beat) with no tap → miss, note `late`.
4. When `knotIndex === n`: `frayed = isFrayed(knotGrades)` (two or more misses). → *CRIMP*. The
   wrong-spool tell is emergent: a short set on a long-fuse order plays two zips; A can bail (below) and
   B fetches again.

**A — CRIMP.**
1. `crimpClickAt = crimpClicks(knotAt[n − 1], cfg.crimp.clicks, cfg.crimp.leadSeconds, cfg.crimp.clickSeconds)` =
   `[last + 0.2, last + 0.4, last + 0.6]`, `beatStartAt = knotAt[n − 1]`. The phase flips as soon as the
   last knot is judged (at the latest 0.34 s after its beat, before click 3 at 0.6 s). A `crimp` op that
   arrives while `phase === 'knots'` is ignored.
2. `op: 'crimp'` at `at`: `grade = judge((at − crimpClickAt[2]) × 1000, cfg.crimp)` (a tap on click 2,
   −200 ms, is OK by the inclusive bound; on click 1, −400 ms, a miss). No tap by
   `crimpClickAt[2] + okMs/1000 + MAX_INPUT_BACKDATE_S` → miss.
3. Miss → `capLoose = true`; if `seated.dents > 0` → effect `spark` (the adapter rolls
   `hazards.sparks.crimpOnDented` and calls `hazards.sparkRing(world, cfg.id, 'crimpOnDented')`). A clean
   casing never sparks.
4. Build the stick: `item = { quality: keg.quality, prime, dents: seated.dents, fuseLength: cradleFuse,
   fill, capLoose, frayed, orderId: seated.orderId }` with
   `prime = isPrimeStick({ dents, pourGrade, kegQuality: keg.quality, knotGrades, crimpGrade })`: dents 0
   ∧ pour Perfect ∧ keg quality 1.0 ∧ every knot Perfect ∧ crimp Perfect. ("PRIME pour" is read as a
   Perfect-judged pour from a 1.0 keg — the DEAD CENTER `prime` flag on the keg widens the window but is
   not required — so damp powder can never launder into a prime stick.) Effect
   `complete(item, perfect: prime, handsOf: a)`; the adapter maps it to `ctx.complete({ item: OutputSpec,
   perfect })`, which returns `'shelved'` when the 4-slot output shelf has room and `'hands'` otherwise
   (A then holds the stick and SEAT is refused until they put it down). Effect `tally('defects')` when
   `capLoose || frayed || fill !== 1.0`.
5. PRIME STICK → effects `fx chime` at the station anchor with `text: copy.events.primeStick`,
   `primeStick` (`grooveEvents.primeSticks++`, weighted by `groove.weights.primeStick` in F11's groove
   system) and `primeAt = now`. An ordinary stick → nothing beyond `last` (the client plays *chunk*). No
   combo, no shake.
6. Clear `seated`, `fill`, `pour`, `lanes`, `knotAt`, `knotGrades`, `crimpClickAt`, `pourGrade`,
   `primePour`, `casingItemId`; `rearmFrom = now`. → *SEAT*. `rearmAt` arrives from `ctx.rearmAt`
   (F05's `station.armedAt`) on the next tick and the picker shows a re-arm bar from `rearmFrom` to it.

Worked cycle (prime keg, long fuse, B Perfect, 2 workers): SEAT at 100.13 → pour 100.4–102.4, Perfect tap
102.4 → cradle already armed → knots at 102.8 / 103.2 / 103.6 → clicks 103.8 / 104.0 / 104.2 → stick at
104.2; execution 4.07 s; F05's rule gives `machineSeconds = 5.0 / 1.0 × 0.75 = 3.75`, so `rearmAt` is
104.2. Solo (efficiency 0.6): `5.0 / 0.6 = 8.33` s, matching the ≈ 8.5 s solo cycle in docs/03.

**B — PICK / FETCH / SWING / TOSS.**
1. On becoming B: `bPick = view.orders[0]?.fuseLength ?? 'long'`. `op: 'pick'` (`v`) sets `bPick` at any
   time; it is sticky across tosses.
2. `op: 'fetch'`: accepted only in `idle` with `view.bCarrying === ''`. `bPhase = 'fetching'`,
   `bFetchDoneAt = now + 0.6`. When `now ≥ bFetchDoneAt` (tick): effect `createParts(bPick, b)` (F06
   creates `p-<n>` with `fuseLength` and `giveToPlayer` sets `PlayerState.carrying`),
   `bPhase = 'holding'`.
3. `op: 'swing'`: accepted only in `holding` and when `!view.aisleFloorItem` (a blocked aisle refuses the
   swing; `aisleBlocked` is shown so B hauls or waits). `bPhase = 'swinging'`, `swingStartAt = at`.
4. `op: 'toss'` (or the swing closing unreleased at
   `swingStartAt + arcSeconds + okMs/1000 + MAX_INPUT_BACKDATE_S` = 0.95 s): let `p` be B's carried parts
   item and `offset = (at − (swingStartAt + cfg.toss.arcSeconds)) × 1000`. In order:
   - `view.bodyOnAisle !== ''` → effects `partsToFloor(p, aisle)` and `bubble(bodyOnAisle)`,
     `last = miss/body`.
   - else `cradle !== 'empty'` → effects `fx bonk` at the nearest jig tile and `partsToFloor(p, aisle)`,
     `last = miss/full`. No timing judgement: the restraint rule.
   - else `grade = judge(offset, cfg.toss)`: Perfect → `cradle = 'armed'`, `cradleFuse = p.fuseLength`,
     effect `destroyItem(p)`; OK → `cradle = 'surface'`, `cradleFuse`, `surfaceReadyAt = now + 0.5`,
     effect `destroyItem(p)`; miss → effect `partsToFloor(p, aisle)`, note `early`/`late`.
   - `bPhase = 'idle'`, set `last` with `who: 'b'`.
5. `aisleBlocked = view.aisleFloorItem` every tick: any floor item on `tiles.aisle` blocks (a keg dropped
   there is the same clutter). `partsToFloor` is `items.placeNear`, so a set thrown at an occupied aisle
   tile lands beside it rather than vanishing. Hauling is F06's generic pick-up; carrying the set onto a
   jig work tile arms the cradle by the *cradle from hands* rule.
6. Toss-on-the-crimp is cadence, not a rule: nothing couples the toss judgement to A's clicks.

**Bail** (`{ t: 'leave' }` for A — Esc, `E`, disconnect or an F10 ejection), by phase:
- `seat`: nothing.
- `pour` with `pour !== null` and unresolved: the keg tips off → effect `spill(aTile)`; if
  `kegItemId !== ''` effect `destroyItem(kegItemId)` (its remaining pour is lost, `keg = null`);
  `pour = null`, `fill = 0`; the casing stays seated and the phase stays `pour` so the next A resumes
  from a fresh pour.
- `parts`: nothing is lost; the phase waits.
- `knots`: the part set is discarded (fuse and cap are gone — no item), `lanes`/`knotAt`/`knotGrades`
  cleared, `cradle` untouched → `parts`. This is the "wrong spool, swap it" path.
- `crimp`: the stick pops off: effect `dropStick(item with capLoose true and prime false, origin: aTile,
  culpritId: a)` — the adapter creates the stick with `items.createItem` and drops it with
  `items.dropItem(world, item, aTile, FACING_DIRS[player.facing], a)` (F06's drop table, 30 % fizzle;
  facing 0 when the player is already gone) — then effect `abort` (`ctx.abort()`), and the jig is cleared
  → `seat`.

The cycle F05 opened at SEAT is closed by `ctx.abort()` only on the crimp bail; every other bail keeps
the cycle open for the next A. The keg (`poursLeft`) survives every bail except the mid-pour tip.

**Pause and blocked spans.** F05 drops `mg` messages while the station is paused, jammed or damaged, and
never calls `tick` while `jammed`/`damaged`. So: while `view.paused`, each tick shifts every pending
timestamp (`pour.startAt`/`targetAt`, `knotAt[i ≥ knotIndex]`, `crimpClickAt`, `surfaceReadyAt`,
`bFetchDoneAt`, `swingStartAt`, `beatStartAt`) by `view.dt` and advances nothing else. A jam or damage
shows up as a gap: the tick compares `view.now` with `state.lastTickAt` and shifts every pending
timestamp by `view.now − lastTickAt − view.dt` when that is positive. `rearmAt`/`rearmFrom` are never
shifted (they are F05's machine timer). The client draws a pause with the **live** clock — the marks
were shifted for it, so the needle already stands still and freezing the clock too would walk it
backwards — and freezes the needle only while `state` is `jammed` or `damaged`, where no tick has run
and no mark has moved.

**Station state and progress** (`stationStatus(state, view)`, returned from `status(ctx)`; F05 writes it
verbatim unless the station is `jammed` or `damaged`, which F05/F10 own): `starved` when
(`phase === 'seat'` ∧ `a !== ''` ∧ `now ≥ rearmAt` ∧ (no casing on the shelf ∨ no pour available)) ∨
(`phase === 'pour'` ∧ `pour === null`) ∨ (`phase === 'parts'` ∧ `cradle === 'empty'`); `working` when
`phase !== 'seat'` ∨ `now < rearmAt`; else `idle`. `progress`: `seat` →
`clamp((now − rearmFrom) / max(rearmAt − rearmFrom, 0.001), 0, 1)` while re-arming, else 0; `pour` →
`0.25 + 0.25 × min(fillAt(now), 1)`; `parts` → 0.5; `knots` → `0.5 + 0.25 × knotIndex / n`; `crimp` →
`0.75 + 0.25 × clamp((now − beatStartAt) / 0.6, 0, 1)`. `starved(ctx)` returns the same starvation
predicate.

**Adapter (`game-server/src/sim/minigames/jig.ts`).** `jigModule.create(station)` builds one `JigState`
per assembly station from `world.stationConfig(station.cfg.id)` plus `level.bpm`,
`level.recipes.keg.output.pours` and `minigame.casings`, with
`tiles = { jig: workTiles, rack: rackTiles, aisle: deriveAisleTile(rackTiles[0], nearest work tile) }`.
Each `tick(ctx, dt)` it builds `JigTickView` from `ctx` and `world` — `operators`/`rackHands` from
`ctx.operators`/`ctx.rackHands` ordered by `station.members.get(sessionId).joinedAt` and mapped through
`ctx.sessionIdOf`; `shelf` from `ctx.inputShelf()` in shelf order; `activeOrderId` from F09's
`activeOrderId(world)` and `orders` from `state.orders` (status `open` — what `activeOrderId` counts, so a
truck that left short cannot leave its `partial` at the head of the chip — lowest-numbered first,
first two); `aisleFloorItem`/`bodyOnAisle` from `world.itemsAt`/`world.playersAt` on `tiles.aisle`;
`partsOnJigTile` from `world.playersAt` over the jig work tiles — calls `reduceJig`, then applies the
effects **in order** through the mapping in the `JigEffect` union above (`beginCycle` first; a `false`
return is fed straight back as `{ t: 'refused' }`), then `ctx.setMg(toMg(state))` (F05 stringifies and
writes only on change — about ten patches per cycle). `onMessage(ctx, player, op, v, t)` forwards
`{ t: 'input', sessionId: ctx.sessionIdOf(player), op, v, at: world.inputClock(sessionId, t) }`; unknown
ops are ignored. `onLeave(ctx, player, reason)` forwards `{ t: 'leave', sessionId }` for any reason (a
`press` station bails the same way for `esc` and `disconnect`). `onJoin` reconciles roles at once so a
new B's `bPick` defaults from the order chip. `onInteract` returns `false` — the jig has no use for `E`,
so F05 treats it as leave. `status(ctx)` returns `stationStatus(state, lastView)`.

**Client — overlay (`Jig.ts`, `jigOverlay`).** `capturesMovement: true`. F04's Host mounts it when
`me.stationId === 'assembly-a'`, `me.workTile !== ''` and the clipboard has expired; it reads
`JSON.parse(station.mg)` on every state change and `ctx.serverClock()` every frame, and picks the A
panel, the B panel or a read-only spectator panel from `mg.a` / `mg.b` / `ctx.sessionId`.
- *A panel.* Phase `seat`: the picker draws every `casing` on `station.inputShelf` as a chip with 0–3
  dings from `ItemState.dents`, in shelf order; `left`/`right` move a client-side cursor (sticky between
  cycles, defaulting to the first casing); `space` sends `seat` with the chip's shelf index. The picker
  greys with a reason label: `RE-ARMING` (bar from `mg.rearmFrom` to `mg.rearmAt`), `NO POWDER`,
  `NO CASINGS`, `HANDS FULL`. A keg gauge beside it shows `keg.quality` (grey / steaming / plain /
  glowing when `prime`) and `poursLeft` pips. Phase `pour`: a bar from `pour.startAt` to the overfill
  point with the mark at `targetAt` and one tick per beat; the fill line rises with
  `fillAt(serverClock())`. Phase `parts`: the cradle icon (`empty` / `surface` with a 0.5 s timer /
  `armed`) and `WAITING FOR PARTS`. Phase `knots`: two lanes; each knot is a marker at `knotAt[i]` in
  lane `lanes[i]` carrying the `←` or `→` glyph, past knots coloured by `knotGrades[i]`. Phase `crimp`:
  three click ticks, the third bold. One needle for all phases at
  `x = (serverClock() − beatStartAt) / phaseSeconds`, frozen only while `state` is `jammed` or `damaged`.
  Keys: `left`/`right` → `knot` `'l'`/`'r'` in `knots` (cursor moves in `seat`), `space` → `seat` /
  `pour` / `crimp` by phase; all consumed. `esc` and `interact` return `false` so F04's floor behaviour
  (leave / interact) still fires.
- *Pops and sound* from `mg.last` (each new `at`): `PERFECT` / `OK` / `MISS` text with the note (`EARLY`,
  `LATE`, `WRONG LANE`, `FULL`, `BODY IN THE AISLE`), knot zips at a pitch rising with `knotIndex`,
  *tink* on a Perfect toss, *chunk* when `phase` returns to `seat` without `primeAt` changing.
- *B panel.* Order chip listing `orderChip` (two entries, fuse-length glyph each), the pick cursor on
  `bPick` (`left` short, `right` long → `pick`), the fetch bar to `bFetchDoneAt`, the swing marker
  sweeping rack → jig over `arcSeconds` from `swingStartAt`, a `FULL` badge when `cradle !== 'empty'` and
  an `AISLE BLOCKED` badge when `aisleBlocked`. Keys: `space` or `up` down → `fetch` when
  `bPhase === 'idle'`, `swing` when `holding`; while the key stays down and `bPhase` becomes `holding`,
  send `swing` immediately; the same key up → `toss` when `swinging`. `repeat` events are consumed and
  send nothing.
- *World view (`JigWorldFx.ts`, `jigView`, every client).* One `StationView` per assembly station,
  created by F04's `Factory.create()` and updated every frame: while `bPhase === 'swinging'`, a parabola
  from the rack tile to the nearest jig tile with a spool sprite at
  `(serverNow − swingStartAt) / arcSeconds`; the cradle contents drawn on the jig sprite (`surface` sits
  askew, `armed` sits in the cradle); a brass flash over the station anchor for 0.6 s from `primeAt`; the
  seated casing on the jig with its dings.

## Acceptance criteria

- [ ] A player joined to a jig work tile of `assembly-a` gets the A overlay; a player on the rack tile
      gets the B overlay; a second jig-tile player gets a spectator overlay with no inputs and is
      promoted when A leaves. (On F12's `mvp-small` those tiles are `[13,8]`/`[14,8]` and `[16,8]`.)
- [ ] With the day running, the input shelf holds `minigame.casings.stock` casings within a few ticks,
      roughly `dentChance` of them dented, and never exceeds `inputCap`.
- [ ] The seat picker lists only casings, in shelf order, each drawn with its `dents`; `seat` with an
      index that is not a casing is a no-op.
- [ ] Seating calls `ctx.beginCycle()`, removes the casing from `inputShelf`, and sets `mg.seated.orderId`
      to `activeOrderId(world)` (`''` when no order is open); the pour starts on the next 0.4 s beat.
- [ ] A 1.0 keg pours in 5 beats (2.0 s), 0.7 in 7 (2.8 s), 0.4 in 8 (3.2 s); a keg's second pour
      destroys it; taking a keg bumps `tally.kegsUsed`.
- [ ] Pour taps within ±60 ms are Perfect, within ±140 OK (±90/±210 with a `prime` keg); early misses
      give `fill 0.6`, late misses `fill 1.2` and a spill tile on A's work tile; an untapped pour
      overfills when the fill reaches 1.2.
- [ ] Knot lanes are reproduced by the seed; a long set schedules 3 knots at +0.4/+0.8/+1.2 s, a short
      set 2; a wrong-lane or early tap consumes the knot as a miss; a knot auto-misses 0.34 s after its
      beat; two or more misses set `frayed`.
- [ ] The crimp is judged against the third click (±80/±180 ms); a miss sets `capLoose`; on a dented
      casing it rolls `hazards.sparks.crimpOnDented` and calls `sparkRing(world, 'assembly-a',
      'crimpOnDented')`, on a clean one it does not.
- [ ] The finished stick has `quality`, `prime`, `dents`, `fuseLength`, `fill`, `capLoose`, `frayed`,
      `orderId` set from the cycle and reaches A's hands or the output shelf through `ctx.complete`,
      whose `perfect` is true only for a PRIME STICK; a stick with `capLoose`, `frayed` or
      `fill !== 1.0` bumps `tally.defects`.
- [ ] PRIME STICK (dents 0, Perfect pour from a 1.0 keg, all knots Perfect, Perfect crimp) sends
      `fx chime` with `copy.events.primeStick`, increments `grooveEvents.primeSticks`, sets `primeAt`,
      and the stick gleams on the shelf; any OK anywhere produces an ordinary stick with none of that.
      F08 never writes `FactoryState.groove` itself.
- [ ] B's `fetch` takes 0.6 s and puts a `parts` item with `bPick`'s fuse length in B's hands; `fetch`
      is refused while carrying anything.
- [ ] A toss released within ±120 ms of `swingStartAt + 0.5` arms the cradle instantly; within ±250 ms it
      lands on the surface and arms 0.5 s later; outside that the `parts` item lands on the aisle tile
      (or beside it, via `placeNear`) and `aisleBlocked` becomes true until it is picked up.
- [ ] A toss at a non-empty cradle bounces (`fx bonk`, parts on the aisle) regardless of timing; a toss
      with a player on the aisle tile drops on them and gives them the `copy.bubbles.whoThrewThat` bubble.
- [ ] A player standing on a jig work tile while carrying a `parts` item arms an empty cradle and the
      item disappears; with a full cradle they keep carrying until it empties; joining that tile with
      full hands is refused by F05 and the mechanic still works.
- [ ] Leaving mid-pour spills, destroys the keg and keeps the casing seated; leaving mid-knots discards
      the set and returns to `parts`; leaving mid-crimp drops a `capLoose` stick on the jig tile through
      `items.dropItem` and calls `ctx.abort()`.
- [ ] An F05 interrupt shifts every pending beat by the pause and no ops are judged during it; a jam or a
      damaged span shifts them by the whole gap when ticking resumes.
- [ ] `status(ctx)` reads `starved` with A present and no casing, no pour, or an empty cradle in `parts`;
      `working` during the phrase and re-arm; `idle` otherwise; F05 writes it verbatim and leaves it
      alone while `jammed`/`damaged`; `mg` is rewritten only when its JSON changes.
- [ ] Every client sees the toss arc while `bPhase === 'swinging'` and the brass flash after a
      PRIME STICK, wherever they are standing.

## Test plan

Unit (`shared/tests/jig.test.ts`, vitest, a stub `rng` and hand-built `JigTickView`s):

- judge: it grades an offset inside ±perfect as Perfect, inclusive at the bound · it grades between
  perfect and ok as OK · it grades outside ok as Miss · it scales both windows by the prime-keg
  multiplier.
- pourBeats: it pours 5 beats from a 1.0 keg, 7 from 0.7, 8 from 0.4 · it uses the smallest key for a
  quality below every key.
- nextBeat: it snaps a clock to the next 0.4 s beat and leaves an exact beat alone.
- feeder: it stocks one casing per tick until `casings.stock` is reached · it dents a casing when the rng
  rolls under `dentChance` and not otherwise · it stops when the shelf has no room.
- seat: it refuses an index that is not a casing · it refuses while A carries something · it refuses
  before `rearmAt` · it refuses while the cycle is not idle · it refuses without a pour available · it
  emits beginCycle first, takes the casing off the shelf, destroys it and binds `view.activeOrderId` ·
  it binds `orderId` `''` when no order is open · a refused beginCycle returns the phase to seat.
- pour: it starts on the next beat after the seat · it takes the first keg by shelf index, bumps
  `kegsUsed` and destroys the keg on its second pour · it marks a Perfect or OK tap as fill 1.0 · it
  marks an early miss as fill 0.6 · it marks a late miss as fill 1.2 with a spill on A's tile · it
  resolves an untapped pour as overfill when the fill reaches 1.2 · it widens the windows ×1.5 with a
  prime keg · it stays in pour with `pour` null and reads starved when no keg exists.
- knots: it draws the lane sequence from the seeded rng (same seed → same lanes) · it draws 3 lanes for
  long and 2 for short · it schedules knots every 0.4 s from the next beat · it judges a right-lane tap
  against its beat · it misses a wrong-lane tap · it consumes a knot on an early tap · it auto-misses a
  knot 0.34 s after its beat · it frays on two misses and not on one.
- crimp: it schedules three clicks 0.2 s apart after the last knot · it judges the tap against the third
  click ±80/±180 · it ignores a crimp op while knots are pending · a miss sets capLoose · a miss on a
  dented casing emits spark · a miss on a clean casing does not.
- stick: it builds the stick with the casing dents, keg quality, cradle fuse length, fill, capLoose and
  frayed · it emits complete with `perfect` false for an ordinary stick and clears the jig · it emits
  `tally('defects')` for a loose cap, a fray and a wrong fill, and not for a clean 1.0 stick · it sets
  `rearmFrom` at completion.
- prime stick: it is prime with a clean seat, Perfect pour from a 1.0 keg, all knots Perfect and Perfect
  crimp · it is not prime with a dent · with an OK knot · with an OK crimp · with a Perfect pour from a
  0.7 keg · it emits chime, `primeStick` and sets `primeAt`.
- B: pick sets bPick · fetch takes 0.6 s then creates a carried parts item · fetch is refused while
  carrying · swing is refused while the aisle is blocked · a Perfect toss arms the cradle instantly · an
  OK toss lands on the surface and arms 0.5 s later · a missed toss puts the parts on the aisle tile · a
  toss at a full cradle bounces regardless of timing · a toss with a body on the aisle drops on them and
  emits the bubble effect · an unreleased swing resolves as a miss 0.95 s after it started · a B who
  leaves mid-swing keeps the set and returns to idle.
- cradle from hands: a player standing on a jig tile carrying parts arms an empty cradle · they keep
  carrying while the cradle is full and arm it when it empties.
- roles: the earliest-joined work member is A · the next work member is promoted when A leaves · inputs
  from a helper are ignored · inputs from a stranger are ignored.
- bail: leaving mid-pour spills, destroys the keg and keeps the casing seated · leaving in parts loses
  nothing · leaving mid-knots discards the set and returns to parts · leaving mid-crimp emits dropStick
  and abort.
- pause and gap: a paused tick shifts every pending timestamp by dt and judges nothing · a tick after a
  jam gap shifts them by the gap · `rearmAt`/`rearmFrom` are never shifted.
- stationStatus: it reads starved, working and idle per the table · progress rises through the phrase ·
  progress tracks the re-arm bar between `rearmFrom` and `rearmAt`.
- aisle: `deriveAisleTile` returns the tile between the rack and the nearest jig tile.
- toMg: it projects only the public fields (no `cfg`, no item ids, no `lastTickAt`).

Adapter (`game-server/tests/minigames/jig.test.ts`, vitest, F03's `makeWorld({ players: 2 })`):

- it stocks the input shelf with casings while the day runs and stops at `casings.stock`.
- it orders `operators` by `Member.joinedAt` and puts the earliest in `mg.a`.
- it maps a `seat` message through `world.inputClock` and consumes the shelf item.
- it delivers the finished stick through `ctx.complete` (shelf when there is room, hands when full).
- it rolls `hazards.sparks.crimpOnDented` before calling `sparkRing` on a dented crimp miss.
- it bumps `world.tally.kegsUsed` and `world.tally.defects` and `world.grooveEvents.primeSticks`.
- it writes `st.mg` only when the JSON changes and returns `status(ctx)` for `st.state`/`progress`.

In-app verification (`composer run dev`, `npm run dev` in `game-server`, `DEV_ALLOW_NO_TICKET=1` with
join options `{ name, factoryId }`, two browsers, `data-debug=1`):

1. Browser 1 joins a jig work tile: screenshot the A overlay in `seat` with the fed casings on the shelf,
   at least one dented — dings visible on the chip.
2. Seat, watch the fill rise; tap on the mark: screenshot the `PERFECT` pop and the bar. Repeat with a
   damp keg and count 7 beat ticks.
3. Browser 2 joins the rack tile: screenshot the B panel with the order chip; fetch, swing, release on
   the arc: screenshot the in-world arc from browser 1's view and the `tink` cradle state.
4. Play the knots and crimp; on a flawless cycle screenshot the brass flash over the station and confirm
   the debug overlay shows the Groove bar rising and the shelf stick gleaming.
5. Miss a toss on purpose: screenshot the spool on the aisle tile and the `AISLE BLOCKED` badge; pick it
   up with browser 1, stand on the jig tile, confirm the cradle arms and the item disappears.
6. Toss into a full cradle: hear *bonk*, see the set on the aisle.
7. Solo run in one browser: join the rack, fetch, leave, walk to the jig tile (cradle arms), join, seat,
   pour, knots, crimp; confirm the cycle completes in about 8.5 s from the debug clock.
8. Leave mid-pour: confirm the spill tile on the work tile and the casing still drawn on the jig.

## Tasks

- [ ] 1. `shared/src/sim/jig.ts` types + `judge`, `pourBeats`, `pourWindow`, `nextBeat`, `laneSequence`,
      `knotTimes`, `crimpClicks`, `isFrayed`, `isPrimeStick`, `deriveAisleTile`, and the
      `export * from './sim/jig';` line in `shared/src/index.ts`; their tests in `shared/tests/jig.test.ts`.
- [ ] 2. `createJigState`, `toMg`, role assignment and the feeder from the tick view, `stationStatus`;
      tests for the feeder, roles, promotion, helper rejection and the status table.
- [ ] 3. SEAT + POUR in `reduceJig` (beginCycle/refused, keg selection, `kegsUsed`, judgement, spill,
      auto-overfill, starved-without-keg); tests.
- [ ] 4. PARTS wait, KNOTS, CRIMP, stick build, `defects`, PRIME STICK, `complete`/`rearmFrom`; tests.
- [ ] 5. B: pick/fetch/swing/toss, cradle, surface tax, aisle litter, bounce, body, unreleased swing, B
      leaving; cradle from hands; tests.
- [ ] 6. Bail per phase, pause shifting and the blocked-gap shift; tests. Run
      `npx vitest run shared/tests/jig.test.ts` green.
- [ ] 7. `game-server/src/sim/minigames/jig.ts`: `jigModule`, view builder, feeder effects, effect
      application through `ctx`/F06/F09/F10, `ctx.setMg`, `status`/`starved`; tests in
      `game-server/tests/minigames/jig.test.ts` over `makeWorld`, plus `npm run typecheck` in
      `game-server`.
- [ ] 8. `resources/js/game/minigames/Jig.ts`: A panel (picker, phrase bar, needle, pops, sounds), key
      mapping, `capturesMovement`; the `assembly` entry in F04's `minigames`. Verified in the app
      (screenshot of the A overlay).
- [ ] 9. `Jig.ts` B panel and key mapping (pick, fetch/swing/toss with key-up). Verified in the app
      (screenshot of the B panel mid-swing).
- [ ] 10. `resources/js/game/minigames/JigWorldFx.ts`: `jigView` (toss arc, cradle and casing on the jig
      sprite, PRIME STICK flash) and the `assembly` entry in F04's `stationViews`; `events.primeStick`
      added to `config/game/copy.json`. Verified in the app from a second browser.
- [ ] 11. In-app verification steps 1–8 with screenshots; tick the status boxes.

## Risks & open questions

- **`mg` churn.** The Jig rewrites `mg` roughly ten times per 6 s cycle (~600 bytes each). Acceptable at
  20 Hz for one station; if F03 measures it as a problem the per-beat fields (`knotIndex`, `last`) move
  to an `fx`-style message.
- **Docs/04 says A taps `E` after an OK toss.** `E` is F05's join/leave key at a `press` station, so the
  0.5 s surface tax is automatic. Same outcome for the cycle time; one fewer input for A.
- **Blocked spans are invisible to the module.** F05 does not tick a `jammed`/`damaged` station at all,
  so the jig infers the pause from the gap between `view.now` and its own `lastTickAt`. If F05 ever
  starts ticking blocked stations (or coalesces ticks), that inference double-shifts; a `blockedSeconds`
  field on `StationCtx` would be the cleaner fix and is worth raising at F05 review.
- **Promotion latency.** A helper becomes A on the tick after the old A's `onLeave`, i.e. up to 50 ms
  later, and then has to sit through the clipboard. That is the intended cost of a swap, but it makes a
  deliberate A-swap mid-phrase strictly worse than bailing at the seat; watch it in playtest.
- **Casing dents are the only source of `crimpOnDented`.** With `dentChance 0.3` and the feeder as the
  only supplier, the spark rate on Level 1 is entirely a config decision; F12 may want a per-level value
  once M1 is playable.

**Contract change requested**

Everything F08 needs is in the contracts v2 except these three, which the contracts do not cover:

1. **`copy.events.primeStick`.** §8 lets a feature append *its own top-level section* to `copy.json` and
   to `Copy`, and `Copy.events` is an open `Record<string, string>`, but no rule says who may add a key
   inside another feature's section. F08 appends the single key `events.primeStick` to F12's
   `config/game/copy.json` (no change to the `Copy` type) as the text of its `fx chime`. If F12 would
   rather own the key, it costs F08 nothing.
2. **A mini-game module's server test file.** §12 gives F03 `game-server/**` "core tests" and gives each
   mini-game owner only its module file; no row names
   `game-server/tests/minigames/<module>.test.ts`. F08 claims `game-server/tests/minigames/jig.test.ts`
   (the same pattern F07 and F09 will need) and uses F03's `makeWorld`.
3. **`kegsUsed` wording.** §9 defines it as "kegs taken off an input shelf by the Jig"; §10.7's tally
   table says "`kegsUsed` F08 (last pour taken)". F08 implements §9's definition — one bump when the keg
   leaves the shelf, not when its last pour is used — so `Materials.purchased`/`kegsUsed` counts kegs,
   not pours.

## EL-186 — the crimp retune (2026-09-09)

The crimp shipped as three 0.2 s clicks judged against the third with a ±200 ms OK window, and
it was unplayable for two compounding reasons. There was no anticipation beat: `crimpClicks`
started its loop one `clickSeconds` after the last knot, so the first click arrived 200 ms after
the beat the player was still resolving while the knots got a full 400 ms. And `judge` is
symmetric, so ±200 ms around the third click opened the window exactly on the *second* click —
tapping the wrong one scored OK.

`crimp.leadSeconds` is now a required key and `crimpClicks` takes it as its own parameter,
because the gap *before* the ratchet and the gap *inside* it are different design problems that
were only ever the same number by accident. All five levels ship
`{ clicks: 3, leadSeconds: 0.4, clickSeconds: 0.4, perfectMs: 80, okMs: 180 }`.

The root cause was a hole in ADR 0009: `validateLevelConfig` floor-checked tolerance windows and
no tempo field at all, so a level could be physically impossible and still validate. Three rules
close it (`docs/features/F14-difficulty-tuning.md` has the derivations) — a spacing floor, a
coupling rule `okMs < spacing / 2` so an OK window can never reach a neighbouring mark, and a
lead-in rule so a window cannot open before its own cue.
