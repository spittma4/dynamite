# ADR 0014 — Two difficulty dials: Dexterity and Pressure, never one slider

**Status:** accepted · 2026-09-09 · completes ADR 0009's flat-execution rule, which the
current validator only half enforces

## Decision

Difficulty is **two orthogonal settings**, set per factory in Laravel, applied in `shared/`,
never sent by the client:

- **DEXTERITY** — how hard the mini-games are to *physically execute*. It owns the tolerance
  windows and the **tempo** at which judged marks arrive.
- **PRESSURE** — how hard the system is to *keep up with*. It owns the order book, truck
  cadence, shift length, buffer depth and the station efficiency curves.

Each dial is an integer `0..4`. **Rung 2 is the level file as authored**: an untouched factory
runs exactly today's numbers, and both dials transform away from that baseline in both
directions. Nothing else in the level config is a difficulty dial (see the exclusion list).

### Dexterity owns (all from `shared/src/config/types.ts`)

| Kind | Fields |
|---|---|
| Tolerance windows | `carry.catchOkMs` / `catchPerfectMs` (`types.ts:94-95`); boom_powder `heat.okMsAtMaxCharge` / `okMsAtMinCharge` / `deadCenterMs` / `overholdMs?` (`types.ts:118-126`); assembly `pour.perfectMs` / `okMs` / `primeKegWindowMultiplier` (`types.ts:135-141`), `knots.perfectMs` / `okMs` (`types.ts:143-149`), `crimp.perfectMs` / `okMs` (`types.ts:151-156`), `toss.perfectMs` / `okMs` (`types.ts:158-162`); dock `perfectMs` / `okMs` (`types.ts:177-184`) |
| Tempo (how fast the marks come) | `bpm` (`types.ts:354`, the pour grid via `beatSeconds` at `shared/src/sim/jig.ts:393-394`); assembly `knots.secondsPerKnot` (`types.ts:146`), `crimp.clickSeconds` (`types.ts:153`), `crimp.leadSeconds` (new, below), `toss.arcSeconds` (`types.ts:159`), `pour.beatsByQuality` (`types.ts:137`); boom_powder `heat.minChargeSeconds` / `maxChargeSeconds` (`types.ts:119-120`, the charge rate — `shared/src/sim/slammer.ts:69`); dock `beepHz` / `tailgateWindowSeconds` / `tailgateHoldSeconds?` (`types.ts:178-182`); `carry.throwFlightSeconds` (`types.ts:93`, the catch's tempo) |

### Pressure owns

`day.shiftSeconds`, `day.orderBook` (`types.ts:19-20`); `orders.firstAt`, `everySeconds`,
`truckWaitSeconds`, `qtyPerTruck.base` / `rampPerMinute` (`types.ts:230-236`);
`scaling.breakpoints[].orderBook` / `truckEverySeconds` / `qtyPerTruck` (`types.ts:319-330`);
`stations[].staffing`, `nominalSeconds`, `floorSeconds` (`types.ts:200-202`);
`stations[].inputShelf.capacity` / `outputShelf.capacity` (`types.ts:106,111`);
`interrupts.everySeconds` / `pauseSeconds` (`types.ts:66-69`); `clipboardSeconds`
(`types.ts:350`); assembly `casings.stock` (`types.ts:165`).

### Neither dial touches

`hazards.*` (`types.ts:250-269`) — the explosion is the only loss and is player-caused
(ADR 0008); a dial that softens fuses removes the consequence rather than the difficulty.
`grading.*` and `economy.*` (`types.ts:300-317`) — if the settings moved the grade curve, two
runs' grades would not mean the same thing; the run records the dials instead.
`windowFloorsMs` (`types.ts:355`) and the new `tempoFloorsMs` beside it — those are the
fairness floors a hard rung clamps against, not dials (below).
`movement.*` and `carry.slowdown` / `throwTiles` — walk speed changes throughput *and* how a
floor reads (ADR 0013's forward-is-rightward line); it is level design, not a setting.
`players.min` / `max` and a breakpoint's `maxPlayers` / `lines` — crew size is its own axis
(ADR 0011, ADR 0013). `knots.long` / `short` (`types.ts:144-145`) — phrase length is the
recipe.

### The invariants

1. **Difficulty is a transform over a validated config whose output must itself validate.**
   `applyDifficulty(level: LevelConfig, settings): LevelConfig`, run at config load
   (`game-server/src/config/levels.ts:52`, immediately after `validateLevelConfig`), and
   `validateLevelConfig(applyDifficulty(level, s)).ok` must be true for every level × all 25
   settings pairs. That is a property test, not a code comment.
2. **Difficulty applies before scaling, and Pressure rewrites the breakpoint table.**
   `scaleLevel` overwrites `day.orderBook` and `orders.everySeconds` with the breakpoint's
   *absolute* numbers (`shared/src/sim/scale.ts:36,39-40`), so a Pressure setting applied
   after scaling would be silently discarded, and applying it after scaling would also produce
   a `ScaledLevel` carrying `breakpoint` and `lines` — extra keys that the root's
   `additionalProperties: false` rejects, so it could not be re-validated. Pressure therefore
   multiplies `orders.*`, `day.*` **and** every `scaling.breakpoints[]` entry, and
   `FactoryRoom.startDay` (`game-server/src/rooms/FactoryRoom.ts:201`) is unchanged.
3. **The fairness floors are a floor on Dexterity, not a target.** Two pairs, not one:
   `windowFloorsMs` (`{ ok: 100, perfect: 45 }` in every level file) and the new
   `tempoFloorsMs` (`{ markSpacing: 250, leadInMs: 400 }`). They are one system rather than
   four numbers, because a hard rung clamps `okMs` **up** to 100 ms while it is still
   shrinking the spacing: the coupling rule below (`okMs < spacing / 2`) survives clamping
   only while `markSpacing ≥ 2 × windowFloorsMs.ok`. 250 is that bound with 50 ms over it.
   Each pair is the tightest thing rung 4 may ever produce, not the value rung 4 produces.
   Rung 4 clamps at the floors; it never breaks them, and it does not aim for them. Rungs 0–1
   always pass, because widening a window and slowing a tempo cannot cross a floor from above.
4. **The client never sends a dial.** Settings ride the existing signed seam — Laravel's
   `GET /internal/factories/{id}/config` (contracts §5) — and reach the client only as the
   read-only state field it renders.
5. **A room runs the rungs it was created with, and the run records those.** The config call
   happens once, in `FactoryRoom.onCreate` (`game-server/src/rooms/FactoryRoom.ts:80-94`), and
   one room is one day: `startDay` locks the room and the comment beside it says the room never
   unlocks (`FactoryRoom.ts:201-205`), `finishDay` latches on `dayFinished`
   (`FactoryRoom.ts:209-211`), and `requestEnd` sets `phase = 'ended'` once
   (`game-server/src/sim/World.ts:495-497`). Three things follow, and all three are decisions
   rather than accidents. **The owner's write while a room is live is allowed and silently
   deferred** — nothing checks liveness, and nothing should, because the alternative is a
   Laravel form that refuses to save while strangers are playing. **It lands at the next room
   *create*, not the next shift**: matchmaking is filtered by factory
   (`game-server/src/rooms/index.ts:12`) and the live room is locked, so a crew that walks back
   in through the factory screen gets a fresh room and with it a fresh config. And
   **`FactoryState.dexterity` / `pressure` are written once at create and never rewritten**,
   with `finishDay` building `RunPayload` from that state (`FactoryRoom.ts:230-236`), so a run
   records the rungs the room actually ran and not the column's current value. That last one is
   a test, not a hope: change the column between `onCreate` and `finishDay`, assert the payload
   still carries the create-time pair.

## Why

Two failures look identical in a play report and have opposite fixes.

A crew that cannot hit a 200 ms window quits in the first four minutes. They never reach the
lesson, and their complaint ("this is too hard") is about their thumbs. A crew that turns the
whole game down never *meets* the lesson: an order book they cannot fail teaches nothing about
throughput, and the joke the game exists to tell — local productivity is not system throughput
— has no evidence to stand on.

One slider serves neither. It offers the second crew an exit from the first crew's problem:
whenever the line backs up, turning the slider down widens the windows *and* thins the book, so
the thing that would have taught them gets removed along with the thing that was annoying them.
Every player who is bad at rhythm games is also, by construction, excused from the allegory.

Split, the dials say something the game means. **A crew with slow thumbs should be able to set
Dexterity to zero embarrassment and still lose to a badly balanced line.** That is the lesson
landing rather than a controller problem, and it is only expressible because the two numbers are
separate. It also gives the failure report a vocabulary: "Dexterity 0, Pressure 3, still
drowning at Assembly" is a design finding; "difficulty 1, still losing" is not.

Pressure is also the dial with the interesting shape. Dexterity is a personal accommodation and
should be boring — set it once, forget it. Pressure is the content: the whole progression from
Level 1 to Level 4 is a Pressure curve applied to the same six stations, and a factory owner
raising Pressure on a level they have already beaten is asking the same question the level
designer asked.

## The defect that forced this — the tempo hole

ADR 0009 promises execution difficulty is flat across the factory and enforces it with two
millisecond floors. The enforcement covers half the promise.

`windowsOf` (`shared/src/config/validate.ts:70-111`) enumerates every number validation checks,
and every entry's floor is `ok` or `perfect` from `level.windowFloorsMs`
(`shared/src/config/validate.ts:71`); `semanticErrors` compares them at
`shared/src/config/validate.ts:225-228`. Those are **tolerance windows only**. Grepping
`validate.ts` for `clickSeconds`, `secondsPerKnot`, `arcSeconds`, `beatsByQuality`,
`ChargeSeconds`, `beepHz` and `bpm` returns nothing: **no tempo field is read by validation at
all.** A level may space judged marks as tightly as it likes and still pass.

Level 1 ships the consequence. `config/game/levels/level-01-basic-flow.json` gives assembly
`crimp: { clicks: 3, clickSeconds: 0.2, perfectMs: 80, okMs: 200 }` — every window above its
floor, so it validates. A playtester called it *"WAY fast and like impossible."* Two problems
compound:

- **(a) Counting to three at 5 Hz with no lead-in.** `enterCrimp` starts the ratchet from the last
  knot (`shared/src/sim/jig.ts:759-765`) and `crimpClicks` puts the clicks at `+0.2`, `+0.4`,
  `+0.6` s (`shared/src/sim/jig.ts:245-249`). The judged target is the *last* click
  (`shared/src/sim/jig.ts:876-879`). So the first click arrives 200 ms after the phrase's last
  knot with no anticipation beat, and the player must count three of them at double the knot
  grid — level 1's `secondsPerKnot: 0.4` is exactly one beat at `bpm: 150`
  (`shared/src/sim/jig.ts:393-394`).
- **(b) The tolerance window spans a whole click interval.** `judge` is symmetric on `|offset|`
  (`shared/src/sim/jig.ts:179-186`), so `okMs: 200` opens the OK window at `+0.4` s — which is
  *exactly click #2*. Hitting the wrong click scores OK. The window does not discriminate
  between the mark and its neighbour, which means the step cannot be read as rhythm at all.

That is the concrete reason this ADR is not a preferences feature. A difficulty system that
only writes millisecond windows would inherit this hole exactly: it would faithfully widen
`crimp.okMs` at low Dexterity and make the ambiguity *worse*. Tempo has to be a first-class
part of Dexterity, and validation has to floor it — with **two** numbers, because the two
faults above are not the same fault.

Fault (b) is a coupling failure between a window and a spacing, and it closes with a spacing
floor (`markSpacing`) plus `okMs < spacing / 2`. Fault (a) is not about spacing at all: three
clicks 400 ms apart are still unhittable if the first one arrives before the player has
registered that the crimp started. That needs a **lead-in floor** (`leadInMs`) — a minimum gap
between the cue and the first judged mark — and a lead-in floor needs a field to measure. The
crimp has none. `knotTimes` starts its phrase one beat late and says why
(`shared/src/sim/jig.ts:235-241`: *"The first marker needs a beat to slide in"*), while
`crimpClicks` puts click #1 at `+1 × clickSeconds` with no such beat (`jig.ts:244-250`). So
`crimp.leadSeconds` becomes a required key and `crimpClicks` takes it: the fix for fault (a) is
a schema change, not a number change, and a difficulty system that could only multiply existing
fields could not have made it.

Four rules land in `validate.ts` (spelled out below): the spacing floor, the coupling rule, the
lead-in floor, and `perfectMs ≤ okMs`, which nothing checks today either. Level 1's crimp fails
three of the four — only the ordering rule passes — and the retune is the tuning doc's job.

## Rejected

- **One "difficulty" slider.** The whole argument above. It lets a crew dodge the thesis by
  turning the game down, and it makes every play report ambiguous.
- **Per-level difficulty only** (harder levels are the only dial). This is what we have, and it
  is why a slow-thumbs crew has nowhere to go but "play Level 1 forever". It also confounds the
  two axes permanently: Level 3's lesson is Pressure, but its mini-games are the same speed, so
  a crew stuck on execution reads a Pressure lesson as a dexterity wall.
- **Auto-adjusting, rubber-band difficulty.** Poison here specifically. This game's subject is
  *measurement*: the day report's WIP, cycle time and on-time numbers are the punchline, and the
  grade is a claim about the crew's decisions. Rubber-banding makes the difficulty a function of
  how the crew is doing, so the numbers stop measuring the crew and start measuring the
  controller chasing them — two crews with different skill get the same score, which is exactly
  the "local productivity looks fine" illusion the game is written to puncture. It would also
  make the one honest thing on the report — "you shipped 34 of 40" — a lie by construction.
- **Trusting a client-side accessibility toggle.** The server judges every input against its own
  clock (contracts §7); a window the client believes in and the server does not is a bug factory.
- **Widening the fairness floors instead.** The floors are ADR 0009's guarantee that no station
  is a drudge seat. Lowering them to make room for a hard setting would let *every* level ship
  tighter, including for crews that never opened the settings.

## Consequences

New shared module `shared/src/sim/difficulty.ts` (transform + the rung tables), a property test
asserting invariant 1 across every level file, and five new semantic rules in
`shared/src/config/validate.ts` — three tempo rules (spacing, coupling, lead-in), the
`perfectMs ≤ okMs` ordering check nothing performs today, and the book-fits-the-shift rule that
lives only in a level test until Pressure starts moving all four of its terms. Laravel gets an owner-and-admin-only settings form on the
factory and carries the two integers through the config response.

Mid-shift, that form stays writable and the write goes nowhere until the next room (invariant
5). Any surface that shows the rungs to a crew — the in-game Settings panel is the one that
does — shows them read-only and says the change lands on their next *room*, not their next
shift. "Next shift" is the wrong promise: this room is the only shift it will ever run.

A run record must carry the settings, or grades stop being comparable — a B at Pressure 0 is not
a B. Levels are unaffected as files by the dials themselves: rung 2 is the identity transform,
so every level JSON keeps its current behaviour.

They are not unaffected by the tempo rules. Level 1's crimp is a validation failure now, not
merely bad tuning, and all five shipped level files carry the identical block
(`config/game/levels/*.json:118`) and all five gain `crimp.leadSeconds` in the same commit that
adds the rules — or every level stops loading. The tuning doc and this ADR ship together.

## Contract changes required

Diff-ready bullets for the v2.2 pass on `docs/features/00-contracts.md`. This is the complete
set this ADR requires; F14 (the tuning doc) restates them with the same names, shapes and
defaults and adds only what it owns on top — the rung tables and their `copy.json` labels, and
the §12 ownership row. Where the two ever differ on a shape, a default or a rule, that is a
defect in one of them and not a precedence puzzle to be resolved by reading order.

- **§8 (level config), new optional top-level key.** `tempoFloorsMs?: TempoFloorsMs` where
  `TempoFloorsMs = { markSpacing: number; leadInMs: number }`, added to the `LevelConfig` key
  list after `windowFloorsMs`. Writer: the level file. Default `{ markSpacing: 250, leadInMs:
  400 }` (§13). Read by `validateLevelConfig`. `schema.json`: object, `additionalProperties:
  false`, `required: ["markSpacing", "leadInMs"]`, `markSpacing` `{ type: 'number', minimum:
  250 }`, `leadInMs` `{ type: 'number', minimum: 400 }` — a level may raise its own floors and
  never lower them, exactly as `windowFloorsMs` carries `minimum: 100` / `45` today.
- **§13 (defaults), new row.** `tempoFloorsMs` | `{ markSpacing: 250, leadInMs: 400 }` |
  `applyDefaults`, read by `validateLevelConfig` (F02).
- **§8, new semantic rule T1 — mark-spacing floor.** `validateLevelConfig` rejects any judged
  mark spacing below `tempoFloorsMs.markSpacing`: assembly `crimp.clickSeconds × 1000`,
  `knots.secondsPerKnot × 1000`, the pour grid `60000 / bpm`, and dock `1000 / beepHz`.
  Message shape follows the existing window error: `<path>: 200 ms apart is tighter than the
  250 ms mark floor`.
- **§8, new semantic rule T2 — window/tempo coupling.** For each judged phase, `okMs < spacing
  / 2`, where `spacing` is that phase's mark spacing (crimp: `clickSeconds × 1000`; knots:
  `secondsPerKnot × 1000`; pour: `60000 / bpm`; dock's shove: `1000 / beepHz`). Message:
  `<path>.okMs: 200 ms reaches the neighbouring mark 200 ms away`.
- **§8, new semantic rule T3 — lead-in floor.** For each judged phase, `leadMs ≥
  tempoFloorsMs.leadInMs` **and** `okMs ≤ leadMs`: a window may not open before its own cue.
  `leadMs` is `crimp.leadSeconds × 1000`, `toss.arcSeconds × 1000`, `heat.minChargeSeconds ×
  1000`, and for the pour `min(beatsByQuality) × 60000 / bpm`.
- **§8, new semantic rule T4 — ordering.** `perfectMs ≤ okMs` for every pair `windowsOf`
  already collects. Unchecked today; a Dexterity transform that moves the two by different
  factors makes it reachable.
- **§8, new semantic rule T5 — the book fits the shift.** `firstAt + (orderBook − 1) ×
  everySeconds ≤ shiftSeconds − truckWaitSeconds` when `day.endsOn !== 'never'`. Today an
  assertion in a level test only; Pressure moves all four terms, so it becomes a validator rule.
- **§8 `StationConfig.minigame` (assembly), new required key.** `crimp.leadSeconds: number`, so
  `CrimpConfig` is `{ clicks, leadSeconds, clickSeconds, perfectMs, okMs }`. `schema.json` adds
  `leadSeconds` to the crimp `required` list with `{ type: 'number', exclusiveMinimum: 0 }`. No
  default — it is required, and all five shipped level files gain it in the same commit.
- **§10.3 `shared/src/sim/jig.ts`, one signature change.** `crimpClicks(lastKnotAt: number,
  clicks: number, leadSeconds: number, clickSeconds: number): number[]`, indexing from 0 so the
  first click lands at `lastKnotAt + leadSeconds`. `enterCrimp` passes `cfg.crimp.leadSeconds`.
- **§5, config response gains a key.** `GET /internal/factories/{id}/config?players=N` →
  `200 { factory, level, layout, members, difficulty }` where
  `difficulty: { dexterity: 0|1|2|3|4, pressure: 0|1|2|3|4 }`. Writer: Laravel (F01), from the
  factory's stored settings. Default `{ dexterity: 2, pressure: 2 }` when unset. Node coerces
  anything absent, non-numeric or out of range to rung 2 rather than erroring — a row holding a
  value from a future release must not make the room unbootable. Never accepted from a client or
  from join options. `FactoryConfigResponse` (§10.1) gains the same field.
- **§10, new module.** `shared/src/sim/difficulty.ts`, exporting `DifficultySettings`, `Rung`,
  `DEXTERITY_RUNGS`, `PRESSURE_RUNGS`, `DIFFICULTY_STEPS`, `DEFAULT_DIFFICULTY = { dexterity: 2,
  pressure: 2 }`, `difficultyOf(input: unknown): DifficultySettings` and
  `applyDifficulty(level: LevelConfig, settings: DifficultySettings): LevelConfig`. Called in
  `game-server/src/config/levels.ts` immediately after `validateLevelConfig` and **before**
  `scaleLevel`, and its result re-validated (invariant 1); rung 2 on both dials is the identity.
- **§3 (schema), two new `FactoryState` fields.** `dexterity n` and `pressure n`, schema default
  `2` — an exception to §3's "numbers default 0", listed beside `day 1` and `groove 50`. Writer:
  F03, once in `onCreate` from the config response, never rewritten (invariant 5); add both to
  the writers-by-field table under F03. Client reads them for the HUD and the day report;
  nothing in the sim branches on them.
- **§9 (run payload), new key.** `RunPayload.difficulty: { dexterity: number, pressure: number }`
  — on `RunPayload` only, not `ReportPayload`. Writer: Node at `finishDay`, copied from
  `FactoryState`, so it is the pair the room was created with. Stored in `runs.metrics` with the
  rest of the body (§5 run store needs no schema change).
