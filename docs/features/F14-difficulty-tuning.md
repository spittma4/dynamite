# F14 — Difficulty: two dials, a tempo floor, and the crimp retune
**Status:** [x] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app

**Landed so far — EL-186, Stage A only (tasks 1–4).** The tempo floors and the crimp retune, which
are a bug fix for ADR 0009's enforcement gap and were always worth landing on their own:
`TempoFloorsMs` and `LevelConfig.tempoFloorsMs?`, the required `CrimpConfig.leadSeconds`, the
`floors` resolution line at the top of `semanticErrors`, **T1–T3** in `validate.ts` — including
T3's second clause over `carry.throwFlightSeconds`, the judged window the first draft of the audit
missed — `crimpClicks`'s fourth parameter and `enterCrimp` passing it, `progressOf` deriving the
station bar's ratchet ramp from config instead of a 0.6 s constant, and the retuned `crimp` block
in all five level files plus every fixture and `devLevel.ts`.

**Deliberately not landed — EL-190.** **T4, T5, T5b and T6** are validator rules this doc groups
with T1–T3, and every shipped level already satisfies all four, so none of them can catch anything
today. Each is there because a dial can break it: T6 catches a charge range a Dexterity rung can
invert, T5/T5b catch a book a Pressure rung can push past the whistle, and T4 is the window
ordering the clamps have to preserve. They land with the transform that can violate them, and
their rejection tests land with it. `applyDifficulty`, `difficulty.ts`, the seam,
`FactoryState.dexterity` / `pressure` and both admin surfaces are likewise EL-190's.

**Two paths in the plan below are wrong and the work followed the code instead.** There is no
`shared/tests/jig.test.ts`: the Jig's tests live in `game-server/tests/minigames/jig.test.ts`
(alongside `dock` and `slammer`), which is where EL-186's three crimp cases went. The T1–T3
property cases went into `shared/tests/levels.test.ts` — the suite that already reads the five
shipped files off disk — rather than into a new file.

**Two known breaks outside EL-186's file scope, both handed over rather than edited.**

**1. `resources/js/game/__tests__/Jig.test.ts` — the client typecheck is red.** `leadSeconds` is
required, so the hand-built `AssemblyMinigame` at line 75 fails with
`TS2741: Property 'leadSeconds' is missing in type … but required in type 'CrimpConfig'`, and only
`npm run typecheck:client` covers that path — `shared` and `game-server` being green hides it. The
same file also still encodes the pre-retune 0.2 s ratchet as fixture data. Three lines:

| line | from | to |
|---|---|---|
| 75 | `crimp: { clicks: 3, clickSeconds: 0.2, perfectMs: 80, okMs: 200 },` | `crimp: { clicks: 3, leadSeconds: 0.4, clickSeconds: 0.4, perfectMs: 80, okMs: 180 },` |
| 343 | `crimpClickAt: [103.8, 104, 104.2]` | `crimpClickAt: [104, 104.4, 104.8]` |
| 350 | `expect(crimp?.to).toBeCloseTo(104.2 + 0.2 + MAX_INPUT_BACKDATE_S, 6)` | `expect(crimp?.to).toBeCloseTo(104.8 + 0.18 + MAX_INPUT_BACKDATE_S, 6)` |

`beatStartAt: 103.6` stays as it is — the last knot is still the anchor. Line 350's `0.2` is
`okMs / 1000` and has to move with the window, which is the reason this is three lines and not the
one the type error points at. Verify with `npm run typecheck:client`.

**2. `docs/features/F08-jig.md` still documents the bug as the spec.** A reader who trusts F08 will
reintroduce the coupling fault, so it needs the retune written through it: **:31** ("three 0.2 s
clicks, tap on the third, ±80/±200"), **:175** (the `CrimpConfig` type, no `leadSeconds`), **:259**
(the three-argument `crimpClicks` signature and `[last + 0.2, last + 0.4, last + 0.6]`), **:295-296**
(the config table at 3 / 0.2 and 80 / 200), **:416-422** (the walkthrough, including *"a tap on click
2, −200 ms, is OK by the inclusive bound"* — the exact defect this doc removes), **:646** (the
acceptance bullet at 0.2 s and ±80/±200) and **:701** (the manual-verification target "about 8.5 s"
for a solo cycle; the phrase is now 4.8 s and a solo cycle is machine-bound at 8.33 s, so the
wall-clock walkthrough is ~9.1 s). Until F08's owner takes it, F08's crimp section should be read as
superseded by *The crimp: two compounding faults, and the retune*, below.

**Owns:** `shared/src/sim/difficulty.ts` · `shared/tests/difficulty.test.ts` · `app/Enums/Dexterity.php` · `app/Enums/Pressure.php` · `database/migrations/*_add_difficulty_to_factories_table.php` · `app/Livewire/Admin/Factories/Index.php` · `resources/views/livewire/admin/factories/index.blade.php` · `tests/Feature/Difficulty/*`
**Touches:** F02 — `shared/src/config/types.ts`, `schema.json`, `defaults.ts`, `validate.ts` (the tempo floors, the `floors` default resolution, and the new semantic rules T1–T6), `shared/src/index.ts` (one `export *` line), `shared/src/schema/FactoryState.ts` (two fields), `shared/src/report.ts` (`RunPayload.difficulty`) · F12 — the `crimp` block in all five `config/game/levels/*.json`, a `difficulty` section in `config/game/copy.json` and in `Copy` · F03 — `game-server/src/laravel/api.ts` and `config/levels.ts` (one response field, one transform call), `FactoryRoom.onCreate` (two state writes), `finishDay` (one payload field) · F08 — `shared/src/sim/jig.ts` `crimpClicks` / `enterCrimp` · F04 — `resources/js/game/ui/Hud.ts` (two label lines in the `Tab` order board) · F11 — `resources/js/game/scenes/Report.ts` (one subtitle line under the day header) · F01 — `Factory` casts, `FactoryPolicy::tune`, `Factories\Show`, `FactoryConfigController`, `routes/web.php` admin group
**Reads:** `docs/decisions/0014-two-difficulty-dials.md` (**the decision this doc implements — binding over anything below**) · `docs/features/00-contracts.md` (v2.1 — binding; §3 schema, §5 the signed seam, §8 level config, §9 run payload, §12 ownership, §13 defaults) · ADR 0009 (flat execution difficulty; the ms floors) · ADR 0008 (the explosion is the only loss) · ADR 0011, ADR 0013 (crew size is its own axis) · `docs/features/F08-jig.md` · `docs/features/F12-levels-sandbox.md` · `docs/04-minigames.md` · `docs/13-config-schema.md` · `.ai/rules/config.md`

## Goal

A factory owner opens the factory page and sets two numbers: **Dexterity**, how hard the
mini-games are to physically execute, and **Pressure**, how hard the system is to keep up
with. ADR 0014 says why they are two and not one; this doc says what each rung actually
multiplies, where the transform runs, what stops it producing an illegal config, and what to
do about the crimp — the step where the missing half of ADR 0009's enforcement is currently
visible to players.

The end state: a crew with slow thumbs sets Dexterity to 0, plays a shift where nothing is a
reflex test, and still watches the powder pile reach the ceiling because nobody said "stop
making powder". A crew that finds the timing trivial sets Dexterity to 4 and finds it clamped
at the fairness floors, because a game about systems is never allowed to become a
reaction-time game.

## Scope

**In (M1):**
- `shared/src/sim/difficulty.ts`: the rung tables, `applyDifficulty`, `DEFAULT_DIFFICULTY`,
  `difficultyOf` (unknown input coerces to rung 2).
- Every field each dial multiplies, enumerated from `shared/src/config/types.ts` — no
  "timing fields", no "the usual suspects".
- The transform's position in the pipeline: after `validateLevelConfig`, before `scaleLevel`,
  with the output re-validated (ADR 0014 invariant 1 and 2).
- Clamping at the fairness floors, so that rungs 0–1 always pass and rungs 3–4 stop at the
  floor instead of breaking it.
- The tempo floor: `tempoFloorsMs` in config, the new semantic rules in `validate.ts`
  (T1–T3 tempo, T4 window ordering, T5/T5b the book, T6 the charge range), where each rule
  reads its floor from given that defaults land *after* `semanticErrors` runs, and the
  reasoning for each number.
- The crimp retune in all five shipped level files, fixing both the missing anticipation beat
  and the window that reaches the previous click, plus an audit of every other judged step.
- The seam: `difficulty` on the internal config response, `FactoryState.dexterity` /
  `pressure`, `RunPayload.difficulty`.
- Owner surface on the factory page; site-admin surface under `/admin/factories`.

**Out (later milestones):**
- Per-station difficulty. One dial per axis is the point; per-station knobs put the lesson
  back behind a settings screen.
- Changing a dial mid-day. The room reads its config once (ADR 0014, Consequences).
- Rubber-banding, and any dial over `hazards`, `grading` or `economy` (ADR 0014, Rejected).
- Ranking across settings. The run records the rungs; comparing a B at Pressure 0 with a B at
  Pressure 4 is an M4 problem.

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/difficulty.ts` | `DifficultySettings`, `DEXTERITY_RUNGS` / `PRESSURE_RUNGS` (the names), `DIFFICULTY_STEPS` (the factor tables), `DEFAULT_DIFFICULTY`, `difficultyOf(input: unknown): DifficultySettings`, `applyDifficulty(level: LevelConfig, settings: DifficultySettings): LevelConfig`. Pure: no I/O, no clock, no RNG. |
| `shared/tests/difficulty.test.ts` | Rung 2 is the identity; each factor's direction; every field touched and every field not; clamping, including the charge range; the sandbox guard; integer fields; the property test over five levels × 25 settings pairs × every crew size in `players.min..max`, asserting the *scaled* book. |
| `app/Enums/Dexterity.php`, `app/Enums/Pressure.php` | Int-backed enums, cases 0–4, TitleCase keys (contracts §14), `label()` for the Blade selects. |
| `database/migrations/*_add_difficulty_to_factories_table.php` | `factories.dexterity` and `factories.pressure`, `unsignedTinyInteger`, default 2. |
| `app/Livewire/Admin/Factories/Index.php` + its view | The site admin's table of factories with the same two selects, inside the existing `can:admin` group (`routes/web.php:31-34`). Every write method opens with `$this->authorize('admin')` — the route middleware does not re-run on a Livewire update, and `Admin\Levels\Index::toggleActive` already writes it that way (`app/Livewire/Admin/Levels/Index.php:22-24`). |
| `tests/Feature/Difficulty/*` | Pest: column defaults, who may set what, the internal config response, the run record. |

### The rungs

Each dial is an integer 0–4 (ADR 0014) and **rung 2 is the level file as authored** — the
identity transform, so an untouched factory runs exactly today's numbers and every existing
level JSON keeps its behaviour with no edit. Each rung also has a name, because a number in a
select box tells a crew nothing:

```ts
export const DEXTERITY_RUNGS = ['mittens', 'workGloves', 'bareHands', 'quickFingers', 'hairTrigger'] as const;
export const PRESSURE_RUNGS  = ['slowWeek', 'steadyBook', 'fullBook', 'rushOrder', 'quarterEnd'] as const;
export type Rung = 0 | 1 | 2 | 3 | 4;
export interface DifficultySettings { dexterity: Rung; pressure: Rung }
export const DEFAULT_DIFFICULTY: DifficultySettings = { dexterity: 2, pressure: 2 };
```

The names are indices, not values: the wire, the database column and `FactoryState` all carry
the integer (ADR 0014's contract bullets), and the name exists only to key the label in
`config/game/copy.json`. Names are camelCase like every other multi-word union in this repo
(`SparkCause.slammerRedline`, contracts §10.5); the labels themselves are joke text and are
never inline (contracts §14).

| rung | Dexterity | Pressure |
|---|---|---|
| 0 | `mittens` — thick gloves; every beat longer and wider | `slowWeek` — short book, patient trucks, deep shelves |
| 1 | `workGloves` | `steadyBook` |
| 2 | `bareHands` — **the level as written** | `fullBook` — **the level as written** |
| 3 | `quickFingers` | `rushOrder` |
| 4 | `hairTrigger` — as tight as the fairness floors allow | `quarterEnd` — the book nobody in this room agreed to |

### DEXTERITY — what each rung multiplies

Two factors. `windows` multiplies every tolerance in milliseconds; `tempo` multiplies every
interval in seconds and divides every rate.

| rung | `windows` (w) | `tempo` (s) |
|---|---|---|
| 0 `mittens` | 1.40 | 1.40 |
| 1 `workGloves` | 1.20 | 1.20 |
| 2 `bareHands` | 1.00 | 1.00 |
| 3 `quickFingers` | 0.85 | 0.90 |
| 4 `hairTrigger` | 0.70 | 0.80 |

**Every rung satisfies `w ≤ s`, and that is load-bearing.** The window/tempo coupling rule
(ADR 0014, `okMs < spacing / 2`) reads after the transform as
`2 × okMs × w < spacing × s`, which follows from the untransformed rule whenever `w / s ≤ 1`.
A table whose windows never widen faster than the beat preserves the coupling for *every*
level without the transform having to re-derive it, and the table is tested for exactly this.

Fields multiplied by `w` — every tolerance ADR 0014 assigns to Dexterity:

| field | where |
|---|---|
| `carry.catchOkMs`, `carry.catchPerfectMs` | types.ts:94-95 |
| `heat.okMsAtMaxCharge`, `heat.okMsAtMinCharge`, `heat.deadCenterMs`, `heat.overholdMs` | types.ts:121-125 |
| `pour.perfectMs`, `pour.okMs` | types.ts:138-139 |
| `knots.perfectMs`, `knots.okMs` | types.ts:147-148 |
| `crimp.perfectMs`, `crimp.okMs` | types.ts:154-155 |
| `toss.perfectMs`, `toss.okMs` | types.ts:160-161 |
| dock `minigame.perfectMs`, `minigame.okMs` | types.ts:179-180 |

Fields multiplied by `s` — longer is slower is easier:

| field | where |
|---|---|
| `knots.secondsPerKnot` | types.ts:146 |
| `crimp.clickSeconds`, `crimp.leadSeconds` (new, below) | types.ts:153 |
| `toss.arcSeconds` | types.ts:159 |
| `heat.minChargeSeconds`, `heat.maxChargeSeconds` | types.ts:119-120 — scaled together as one interval, not as two independent numbers; see *Clamping* |
| `carry.throwFlightSeconds` | types.ts:93 — the catch's tempo; a longer flight is more time to line the catch up |
| dock `minigame.tailgateWindowSeconds` | types.ts:181 |

Fields divided by `s` — rates, and one duration that runs the other way:

| field | where | why |
|---|---|---|
| `bpm` | types.ts:354 | the Jig's whole grid (`beatSeconds`, `shared/src/sim/jig.ts:393-395`) |
| dock `minigame.beepHz` | types.ts:178 | the shove's marker series |
| dock `minigame.tailgateHoldSeconds` | types.ts:182 | Dexterity owns it, but a *longer* hold is harder, not easier — it is the one duration on this list whose direction is inverted, and the table applies `1 / s` rather than `s` |

Two fields Dexterity owns (so no other dial may touch them) and that the transform
deliberately leaves at 1.0, each because scaling it would square an effect already applied:

- **`pour.beatsByQuality`** (types.ts:137). The pour's target is `beats × 60 / bpm`
  (`shared/src/sim/jig.ts:700-709`), and `bpm` is already divided by `s`, so the pour's tempo
  moves correctly with no change to the beat *count*. Multiplying both would make the pour
  scale by `s²` — 5 beats becoming 7 at rung 0 on top of a 40 % slower beat. The counts are
  also integers, so scaling them quantises the dial (5 → 7 is a 40 % jump the player feels as
  a different mini-game, not an easier one).
- **`pour.primeKegWindowMultiplier`** (types.ts:140). A ratio applied to windows that already
  scale by `w` (`pourWindow`, `shared/src/sim/jig.ts:189-193`). Scaling it too would square
  the prime-keg advantage at rung 0 and erase it at rung 4.

Not Dexterity's at all, per ADR 0014: `knots.long` / `knots.short` and `crimp.clicks` — phrase
length is the recipe; `movement.*` and `carry.slowdown` / `throwTiles` — walk speed is level
design.

### PRESSURE — what each rung multiplies

Seven factors, one per group ADR 0014 assigns to Pressure. They move together inside a rung,
so a designer sees one number; they are separate in the table so that a playtest finding can
name which group was wrong.

| rung | `book` | `cadence` | `shift` | `staffing` | `machine` | `buffer` | `friction` |
|---|---|---|---|---|---|---|---|
| 0 `slowWeek` | 0.70 | 1.35 | 1.15 | 1.10 | 0.90 | 1.30 | 1.50 |
| 1 `steadyBook` | 0.85 | 1.15 | 1.05 | 1.05 | 0.95 | 1.15 | 1.20 |
| 2 `fullBook` | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 3 `rushOrder` | 1.15 | 0.85 | 1.00 | 0.95 | 1.05 | 0.85 | 0.85 |
| 4 `quarterEnd` | 1.30 | 0.75 | 1.00 | 0.90 | 1.10 | 0.70 | 0.70 |

| factor | fields (all `types.ts`) | direction |
|---|---|---|
| `book` | `day.orderBook` (18-20), `orders.qtyPerTruck.base` / `.rampPerMinute` (225-236), and the same two on every `scaling.breakpoints[]` entry (319-330) | how many sticks are asked for |
| `cadence` | `orders.firstAt`, `orders.everySeconds`, `orders.truckWaitSeconds` (231-233), and `breakpoints[].truckEverySeconds` | seconds of slack between and at trucks |
| `shift` | `day.shiftSeconds` (19) | see below — it only ever lengthens |
| `staffing` | every value of every `stations[].staffing` curve (202) | what a body is worth |
| `machine` | `stations[].nominalSeconds`, `stations[].floorSeconds` (200-201) | how long the machine takes |
| `buffer` | `stations[].inputShelf.capacity` (105), `stations[].outputShelf.capacity` (111), assembly `casings.stock` (165) | how much slack the line holds before it backs up |
| `friction` | `interrupts.everySeconds` ×, `interrupts.pauseSeconds` ÷ (66-69), `clipboardSeconds` ÷ (350) | what an extra body costs the people already working |

Details that are not optional:

- **Integer fields round and never reach zero:** `day.orderBook`,
  `orders.qtyPerTruck.base`, both breakpoint equivalents, the two shelf capacities and
  `casings.stock` go through `x === 0 ? 0 : Math.max(1, Math.round(x * f))`. The zero case is
  what keeps Sandbox legal.
- **The whole `day` block is skipped when `endsOn === 'never'`.** `validate.ts:187-195` requires
  that mode to mean `shiftSeconds === 0 && orderBook === 0` *and nothing else*; a `shift` factor
  applied to 0 is still 0, but the guard is explicit rather than accidental.
- **Both `machine` fields scale by the same factor**, so the existing rule `floorSeconds ≤
  nominalSeconds` (validate.ts:135-137) survives every rung by construction.
- **Absent shelves stay absent.** Powder has no input shelf and the dock has neither
  (contracts §8); the transform skips `undefined`/`null` rather than materialising a capacity.
- **`staffing` multiplies the curve's height, never its shape.** Level 4's cliff — 1.15 at three
  workers, 0.8 at four (`config/game/levels/level-04-too-many-helpers.json:108`) — is a cliff at
  every Pressure rung, so the fourth body still costs the pair throughput, which is the entire
  level. `efficiencyFor` interpolates and holds (`shared/src/sim/curve.ts:27-51`) and
  `peakWorkers` picks the maximum (curve.ts:54-62); both are scale-invariant, so nothing
  downstream learns this happened.
- **`shift` never shortens the day.** Rungs 3 and 4 leave `shiftSeconds` alone. A shorter shift
  with a bigger book is a double squeeze that the book-fits-the-shift rule below rejects
  anyway, and ten minutes is a promise about how long a sitting takes: cutting it to seven and
  a half is less game, not more difficulty. The easy rungs lengthen it, because a slow crew's
  problem is genuinely that the whistle comes too soon.
- **Casings are never hauled, so `buffer` is the only Pressure lever at Assembly's input.** The
  Jig feeds itself: one casing per tick onto its own input shelf up to `casings.stock`, dented
  with probability `dentChance` (`shared/src/sim/jig.ts:568-581`; contracts §13 default
  `{ stock: 3, dentChance: 0.3 }`). Fuses are likewise fetched from Assembly's own rack tile,
  not carried across the floor — B's `fetch` makes a `parts` item out of nothing after 0.6 s
  (`shared/src/sim/jig.ts:953-959`), and `bPick` defaults to the active order's fuse length the
  moment B takes the rack tile (`shared/src/sim/jig.ts:548-556`). There is no casing haul to
  make longer, and `dentChance` is not a dial: it feeds the `crimpOnDented` spark roll
  (contracts §10.5), and `hazards.*` is off limits to both dials.

Neither dial touches `hazards.*`, `grading.*`, `economy.*`, `windowFloorsMs`, `movement.*`,
`carry.slowdown` / `throwTiles`, `players.min` / `max`, or a breakpoint's `maxPlayers` /
`lines` — the exclusion list is ADR 0014's and this doc adds nothing to it.

### Where the transform runs, and why the order is what it is

`applyDifficulty` runs in `game-server/src/config/levels.ts`, inside `validated()`
(levels.ts:46-65), **immediately after `validateLevelConfig` and before anything else sees the
level** — and its output is validated again:

```
validateLevelConfig(raw)  →  applyDifficulty(level, settings)  →  validateLevelConfig(again)
                                                               →  validateLayoutConfig / validateLevelOnLayout
                                                               →  … later, at start: scaleLevel(level, players)
```

`scaleLevel` (`shared/src/sim/scale.ts:24-43`) is **unchanged** and
`FactoryRoom.startDay` (`game-server/src/rooms/FactoryRoom.ts:199-206`) is **unchanged**. Two
reasons, both from ADR 0014 invariant 2 and both checkable in the code:

1. `scaleLevel` overwrites `day.orderBook` and `orders.everySeconds` with the breakpoint's
   *absolute* numbers (scale.ts:36-40). A Pressure factor applied after scaling would be
   silently discarded on exactly the two fields the dial exists to move — a bug invisible in a
   unit test that scales a fixture, and visible at a table with six people as "the dial does
   nothing". Applying it first, and rewriting every `scaling.breakpoints[]` entry with it, is
   what makes the dial mean the same thing at every crew size.
2. `scaleLevel` returns a `ScaledLevel = LevelConfig & { breakpoint; lines }` (scale.ts:10),
   and the schema root is `additionalProperties: false` (contracts §8, confirmed in
   `schema.json`). A `ScaledLevel` therefore *cannot* be re-validated, so a transform composed
   inside `scaleLevel` could never satisfy invariant 1 — "the output must itself validate" —
   which is the invariant that stops a hard rung shipping an illegal config.

Difficulty is applied **exactly once**, at room create, on the one path every room takes
(`FactoryRoom.onCreate` → `resolveFactoryConfig`, FactoryRoom.ts:80-94). `applyDifficulty` is
deliberately not idempotent and carries no marker field to make it so: a marker would be dead
weight guarding a single call site. The room reads its config once, so the dials cannot change
mid-day (ADR 0014, Consequences), and the local-level fallback (levels.ts:67-83) takes the
same path with `DEFAULT_DIFFICULTY`.

Because the transform lands before the room exists, the client needs no special handling at
all: the `config` reply already carries `world.level` (contracts §8), so the lobby, the
overlays and the server judge the same transformed numbers with no new message.

### Clamping — why an easy rung always passes and a hard one stops

Clamping is part of the transform, not a check after it:

```
okMs      → max(okMs × w, windowFloorsMs.ok)                     // 100 in every shipped level
perfectMs → max(perfectMs × w, windowFloorsMs.perfect)           // 45
spacing   → max(spacing × s, tempoFloorsMs.markSpacing / 1000)   // clickSeconds, secondsPerKnot
lead      → max(lead × s, tempoFloorsMs.leadInMs / 1000)         // leadSeconds, arcSeconds, minChargeSeconds
maxCharge → minCharge' + (maxCharge − minCharge) × s             // the charge range scales as an interval
bpm       → min(bpm / s, 60000 / tempoFloorsMs.markSpacing)      // 240 at the default floor
beepHz    → min(beepHz / s, 1000 / tempoFloorsMs.markSpacing)    // 4 Hz
```

Rungs 0–1 widen windows and lengthen intervals, so they cannot cross a floor from above and
always pass — ADR 0014 invariant 3. Rungs 3–4 stop at the floor and report nothing: the crew
asked for tighter and got the tightest this game is willing to be. That is what a floor is
for. ADR 0009's "no OK window under ±100 ms, no Perfect under ±45 ms" has to be true of the
config the room actually runs, not merely of the file on disk, and before this feature nothing
in the pipeline could have made it untrue — now something can, so the clamp is the guarantee.

The two rate fields clamp downward because they are reciprocals of an interval. The campaign
never reaches those clamps (`bpm` 150 → 187.5 at rung 4, `beepHz` 1 → 1.25), but a level
authored at `bpm` 220 would, and the transform must not be the thing that breaks a floor.

**The charge line is there because one clamp can otherwise invert a range.**
`heat.minChargeSeconds` sits on the `lead` line and `heat.maxChargeSeconds` does not, so a level
authored close to the lead floor comes apart at a hard rung. At `min 0.40 / max 0.45` and
Dexterity 4 (`s = 0.80`), multiplying both endpoints gives `min` 0.40 — clamped *up* — and `max`
0.36: the range is inverted, and re-validation cannot see it, because no validator rule compares
the two and `windowsOf` collects only millisecond windows. The runtime does not raise either.
`climbFraction` returns 0 whenever the span is not positive
(`shared/src/sim/slammer.ts:60-66`), so `heatOf` pins to 1, the gauge reads always-hot,
`okWindowMs` freezes at `okMsAtMinCharge`, and the Slammer quietly stops being a mini-game. The
shipped campaign is nowhere near it (0.7 / 1.5), which is precisely why no amount of playing
would find it.

Scaling the range **as an interval** — clamp `min`, then add the scaled span — removes the fault
by construction and changes nothing anywhere else: when `min` does not clamp,
`min × s + (max − min) × s` is exactly `max × s`, so the two formulas agree on every shipped
level and differ only on the case that was broken. Level 1 at rung 4: `min` 0.56, `max`
0.56 + 0.64 = 1.20, which is what `max × 0.80` would have given anyway. The 0.40 / 0.45 level at
rung 4: `min` 0.40 (clamped), `max` 0.40 + 0.04 = 0.44, still a range.

**T6 — the last of the new validator rules, below — is the other half, and it is not redundant
with the clamp.** The interval form guarantees
`max' > min'` only when the *file* had `max > min`; a level that ships the inversion itself was
wrong before any dial touched it, and no transform can repair that. T6 rejects it at the gate.
The `difficulty.test.ts` case is built by hand at 0.40 / 0.45 — no shipped fixture reaches the
fault, and using one would make the test pass for the wrong reason.

### The tempo floor

`validate.ts` collects every window and compares it to `level.windowFloorsMs` (`windowsOf`,
validate.ts:70-112; the loop at validate.ts:225-229). `grep -n
'clickSeconds\|secondsPerKnot\|arcSeconds\|beepHz\|bpm' shared/src/config/validate.ts` returns
**nothing**: no tempo field has ever been read by validation. New config, sitting beside
`windowFloorsMs` (types.ts:79-82; the level files carry it at line 35):

```ts
export interface TempoFloorsMs { markSpacing: number; leadInMs: number }
// LevelConfig.tempoFloorsMs?: TempoFloorsMs   — §13 default { markSpacing: 250, leadInMs: 400 }
```

`schema.json` gives `markSpacing` `minimum: 250` and `leadInMs` `minimum: 400`, exactly as
`windowFloorsMs` carries `minimum: 100` / `45` today — a level may raise its own floor, never
lower it.

**Where the floors come from at the moment each rule reads them, which is not where you would
guess.** `validateLevelConfig` runs `semanticErrors(level)` on the level *as parsed* and only
returns `applyDefaults(level)` afterwards (validate.ts:52-61). So a new rule that reads
`level.tempoFloorsMs` directly reads `undefined` on every file that omits the key — which today
is all five: `grep -l tempoFloorsMs config/game/levels/*.json` returns nothing. T1–T3 are the
first semantic rules in this validator to depend on a *defaulted* key; every rule that exists
today reads a required one (`windowsOf` destructures `level.windowFloorsMs` at validate.ts:71,
and the schema lists it in `required`). `semanticErrors` therefore resolves the floors itself,
in one line at the top:

```ts
const floors = level.tempoFloorsMs ?? LEVEL_DEFAULTS.tempoFloorsMs;
```

`LEVEL_DEFAULTS` is already exported (defaults.ts:14) from the module `validate.ts` already
imports (validate.ts:5), so this costs an identifier, not a dependency. The alternative —
calling `applyDefaults` before `semanticErrors` and validating the filled level — is a change to
§13's contract about *when* defaults land, it moves every existing rule onto a copied object for
no gain, and neither this doc nor ADR 0014 asks for it. Making `tempoFloorsMs` required instead
would force five file edits for a floor that is identical in all five and reject every level
authored before this feature.

`applyDifficulty` has the opposite problem and does not share it: the transform only ever runs on
the value `validateLevelConfig` *returned*, which is `applyDefaults(level)` (validate.ts:60), so
it reads `level.tempoFloorsMs.markSpacing` with no fallback of its own. The two halves fail
differently and so get a test each — one that the validator rejects a 200 ms click spacing on a
level carrying no `tempoFloorsMs` key at all, and one that `applyDefaults` fills the key.

**`markSpacing` 250 ms** (ADR 0014's number) sits above three bounds:

1. *It must be at least twice the OK floor.* A hard rung clamps `okMs` **up** to 100 ms while
   the spacing is still shrinking, so the coupling rule below survives clamping only if
   `spacing ≥ 2 × windowFloorsMs.ok = 200 ms`. This is the bound that makes the two floors one
   system rather than two numbers, and 250 leaves 50 ms over it.
2. *Below roughly 200 ms inter-onset, a series stops being separate marks.* Synchronising to an
   isochronous sequence works from about 200 ms up to about 2 s; under that boundary listeners
   hear one rhythmic texture and tap subdivisions of it rather than tracking it. A step that
   asks the player to *count* marks — "tap on the third click" — is strictly harder than
   synchronising to them and needs headroom above the boundary, not a seat on it.
3. *A player who reacts rather than predicts must not be locked out.* Median simple visual
   reaction time is around 250 ms with a tail past 300. At exactly 250 ms spacing the series is
   playable by anticipation only — which is fine, and is why the second floor exists.

**`leadInMs` 400 ms** started as this doc's addition and is now in ADR 0014's invariant 3, though
not yet in its contract bullet; it is what makes 250 defensible. A series can
be tight only if the player was given a beat to lock onto it, so every judged step gets a
minimum gap between the cue that it is coming and its first mark: finish resolving the previous
step, register the new marker, prepare the tap — simple reaction time (~250 ms) plus margin.
400 ms is also exactly one beat at the campaign's `bpm` 150
(`config/game/levels/level-01-basic-flow.json:34`), so on the shipped levels the floor reads as
"one beat of warning" — which is precisely what the knots already get and the crimp does not
(`shared/src/sim/jig.ts:236-243`: *"The first marker needs a beat to slide in, so the knots
start one beat late"*).

Five rules join `semanticErrors` (validate.ts:221-237), beside the existing window loop. Each
reads `floors` — the resolved pair above — never `level.tempoFloorsMs`:

| rule | statement | applies to |
|---|---|---|
| **T1 spacing floor** | `spacingMs ≥ floors.markSpacing`, where spacing is `crimp.clickSeconds × 1000`, `knots.secondsPerKnot × 1000`, the pour grid `60000 / bpm`, and dock `1000 / beepHz` (ADR 0014) | every marker series |
| **T2 coupling** | `okMs < spacingMs / 2` — an OK window can never reach a neighbouring mark, and two adjacent OK windows never touch (ADR 0014) | crimp, knots, pour, shove |
| **T3 lead-in** | `leadMs ≥ floors.leadInMs` **and** `okMs ≤ leadMs` — a window may not open before its own cue. The second clause alone where the cue is the player's own act | `crimp.leadSeconds` / `crimp.okMs`; `toss.arcSeconds` / `toss.okMs`; pour `min(beatsByQuality) × 60000 / bpm` / `pour.okMs`; second clause only: the Slammer at **both** ends of its charge (below) and `carry.throwFlightSeconds` / `carry.catchOkMs` |
| **T4 ordering** | `perfectMs ≤ okMs` | every pair `windowsOf` already collects — carry's catch, each assembly phase, the dock, and `heat.deadCenterMs` against the narrower of its two OK windows |
| **T6 charge range** | `heat.minChargeSeconds < heat.maxChargeSeconds` | boom_powder — see *Clamping*, where a Dexterity rung can invert a range a level authored correctly |

**T3 on the Slammer needs both ends of the charge, not the widest window.** `heat` carries three
windows — `okMsAtMaxCharge` 225, `okMsAtMinCharge` 105 and `deadCenterMs` 50 — and `okWindowMs`
interpolates linearly between the first two across the charge (`shared/src/sim/slammer.ts:72-76`),
so "when does the OK window open" is a function of the release time rather than one number. That
opening is `tCharge × 1000 − okWindowMs(tCharge)`, linear in `tCharge`, so testing the two
endpoints tests the whole interval: `heat.okMsAtMinCharge ≤ heat.minChargeSeconds × 1000` **and**
`heat.okMsAtMaxCharge ≤ heat.maxChargeSeconds × 1000`. Level 1 clears both with room (105 ≤ 700,
225 ≤ 1500). Comparing the *widest* window against the *shortest* charge would be the tidier
one-liner and would be wrong in the direction that matters — it rejects a legal level, since an
`okMsAtMaxCharge` of 900 against a 2.0 s max charge opens at 1100 ms and is fine. A rule written
to catch a real fault should not also catch things that are not faults.

One more rule earns its place because Pressure can now push a shipped level over it, and it
currently lives only as an assertion in F12's level test. It has two clauses, because the book
a crew actually plays is not the book the file states:

| rule | statement | applies to |
|---|---|---|
| **T5 the authored book fits the shift** | `firstAt + (orderBook − 1) × everySeconds ≤ shiftSeconds − truckWaitSeconds`, when `endsOn !== 'never'` | the top-level `day` / `orders` block |
| **T5b every breakpoint's book fits the shift** | the same inequality with `scaling.breakpoints[i].orderBook` and `.truckEverySeconds` substituted, against the level's own `firstAt`, `truckWaitSeconds` and `shiftSeconds`, for every `i`, when `endsOn !== 'never'` | every entry in `scaling.breakpoints` |

**T5b is the clause that binds gameplay.** `scaleLevel` overwrites `day.orderBook` and
`orders.everySeconds` with the breakpoint's absolute numbers (scale.ts:36-40), `World.level` is
a `ScaledLevel` from `startDay` on (`game-server/src/sim/World.ts:119`), and `initOrders` sizes
the book from `world.level.day.orderBook` (`game-server/src/sim/orders.ts:47`) —
so the top-level number is what the lobby and the level editor show, and the breakpoint's number
is what the trucks run on. T5 alone would check a value no room ever plays. Pressure's `book` and
`cadence` factors rewrite every breakpoint (the field table above), including the
`maxPlayers <= 2` entry ADR 0013 requires of any level with `players.min < 3`
(validate.ts:198-210) — so without T5b, ADR 0013's guarantee that a solo player is never handed
a book they cannot finish would hold only at Pressure ≤ 2, silently. **F14 refines that
guarantee rather than weakening it: T5b is what keeps "startable and unwinnable" unshippable at
every Pressure rung, and ADR 0013 wants a line saying so.**

Both clauses are checkable inside `validateLevelConfig` on the unscaled file, which is the whole
point: a breakpoint carries only `orderBook` and `truckEverySeconds` (types.ts:319-330), while
`firstAt`, `truckWaitSeconds` and `shiftSeconds` are the level's own and survive scaling
untouched. So T5b needs nothing `scaleLevel` produces — which matters, because a `ScaledLevel`
can never be re-validated (invariant 1, above). T5 belongs beside `checkDayAndPlayers`
(validate.ts:187-218); T5b belongs inside `checkScaling` (validate.ts:164-185), where the other
per-breakpoint rules already live and already name the array rather than a field.

Error text follows the existing shape (validate.ts:227): `<path>: 200 ms apart is tighter than
the 250 ms mark floor`, `<path>.okMs: 200 ms reaches the neighbouring mark 200 ms away`,
`scaling.breakpoints[0]: a book of 9 every 90 s runs 160 s past the whistle`.

### The crimp: two compounding faults, and the retune

All five level files ship the identical block
(`config/game/levels/level-01-basic-flow.json:118`):

```json
"crimp": { "clicks": 3, "clickSeconds": 0.2, "perfectMs": 80, "okMs": 200 }
```

`enterCrimp` schedules the ratchet from the last knot's *scheduled* time
(`shared/src/sim/jig.ts:759-766`) via `crimpClicks` (jig.ts:245-251), so with `lastKnotAt = T`
the clicks land at `T+0.2`, `T+0.4`, `T+0.6`. The tap is judged against the last one
(jig.ts:876-883) by the symmetric `judge` (jig.ts:179-186).

**Fault (a) — no anticipation beat.** The first click arrives 200 ms after the knot the player
is still resolving, and the whole ratchet is over in 600 ms. `crimpClicks` starts its loop at
`i = 1` in units of `clickSeconds`, where `knotTimes` starts at `i = 1` in units of
`secondsPerKnot` — one beat, 400 ms. The knots got the anticipation beat; the crimp got a
click. Lead-in 200 ms against a floor of 400: **T3 fails.**

**Fault (b) — the window spans a whole click interval.** `judge` is symmetric on `|offset|`
and inclusive (`off <= w.okMs`), so ±200 ms around the target at `T+0.6` opens at `T+0.4` —
*exactly click 2*. Tapping the wrong click scores OK. `okMs 200` is not `< spacing / 2 = 100`:
**T2 fails**, and 200 ms spacing is under the 250 ms floor: **T1 fails too.** Three of four
rules, on the one step the player has to count.

The replacement block, identical in all five files:

```json
"crimp": { "clicks": 3, "leadSeconds": 0.4, "clickSeconds": 0.4, "perfectMs": 80, "okMs": 180 }
```

`crimp.leadSeconds` is a new required key on `CrimpConfig`, and it is the reason `crimpClicks`
gains a parameter: the gap *before* the ratchet and the gap *inside* it are different design
problems that were only ever the same number by accident.

```ts
// shared/src/sim/jig.ts (F08), replacing lines 245-251
export function crimpClicks(lastKnotAt, clicks, leadSeconds, clickSeconds): number[] {
    const times: number[] = [];
    for (let i = 0; i < clicks; i++) times.push(lastKnotAt + leadSeconds + i * clickSeconds);
    return times;
}
```

The arithmetic, with the last knot at `T`:

| check | numbers | verdict |
|---|---|---|
| T1 spacing floor | 400 ms ≥ 250 ms | ✓ 150 ms over |
| T2 coupling | `180 < 400 / 2 = 200` | ✓ 20 ms margin |
| T3 lead-in | lead 400 ms ≥ 400 ms; `okMs 180 ≤ 400` | ✓ at the floor |
| T4 ordering | `80 ≤ 180` | ✓ |
| ADR 0009 floors | `180 ≥ 100`, `80 ≥ 45` | ✓ |
| fault (b) gone | clicks at `T+0.4 / T+0.8 / T+1.2`, target `T+1.2`; a tap on click 2 is 400 ms out, `\|400\| > 180` → `miss` | ✓ |

And the phrase now reads in one metre. At `bpm` 150 the beat is 400 ms; the pour runs 5, 7 or
8 beats, the knots one beat apart, and the crimp is four beats — *rest, click, click, TAP*.
Every marker in A's phrase sits on the same grid, which is what "one gesture per station"
(ADR 0009) is supposed to feel like, and it is the shape the knots have had all along.

**Audit of every other judged step in the shipped campaign.** All five level files carry
identical mini-game blocks, so one table covers the whole campaign:

| step | spacing | T1 (≥250) | `okMs` | T2 (`ok < spacing/2`) | lead | T3 (≥400, `ok ≤ lead`) |
|---|---|---|---|---|---|---|
| jig knots (`secondsPerKnot` 0.4) | 400 ms | ✓ | 140 | ✓ `140 < 200` | 400 ms (one beat, jig.ts:237-243) | ✓ |
| jig pour (beat grid `60000/bpm`) | 400 ms | ✓ | 140 | ✓ `140 < 200` | 2000 ms (5 beats, prime keg) | ✓ |
| dock shove (`beepHz` 1) | 1000 ms | ✓ | 180 | ✓ `180 < 500` | free-running beep | n/a |
| jig toss (`arcSeconds` 0.5) | single target | n/a | 250 | n/a | 500 ms | ✓ |
| slammer release (charge 0.7–1.5 s) | single target | n/a | 105 at min, 225 at max | n/a | 700 ms / 1500 ms | ✓ both ends: `105 ≤ 700`, `225 ≤ 1500` |
| carry catch (`throwFlightSeconds` 0.5) | single target | n/a | 150 | n/a | 500 ms | ✓ second clause only: `150 ≤ 500` |
| **jig crimp (as shipped)** | **200 ms** | **✗** | **200** | **✗** | **200 ms** | **✗** |

Nothing else violates a rule, which is the useful half of the finding: the tempo hole was
exploited in exactly one place, and the playtester found that place. Two entries want a note
rather than a fix:

- **The toss has the least margin on T3.** `okMs 250` against a 500 ms arc — the OK window opens
  exactly at the arc's midpoint, so B cannot score by mashing `swing` and `toss` together
  (jig.ts:962-967, jig.ts:1012). It passes with 250 ms to spare, and it is why T3 states
  `okMs ≤ leadMs` explicitly: at `arcSeconds` 0.25 that mash would have been an OK.
- **A prime keg's pour window is the one thing the audit found that T2 does not catch.**
  `pourWindow` multiplies both windows by `primeKegWindowMultiplier` 1.5
  (`shared/src/sim/jig.ts:189-193`), so a prime keg's effective OK window is `140 × 1.5 = 210` ms
  against a 400 ms beat — 10 ms past the half-beat T2 draws the line at. T2 is specified above
  against the *authored* `pour.okMs`, and deliberately so: checking the widened window would reject
  all five shipped levels at rung 2, and the prime keg is a reward rather than a series the player
  has to count — there is only one judged mark in a pour, so a tap a whole beat early still misses
  by 400 ms. It is recorded here because it is the only place in the campaign where a window can
  cross the coupling line, and because the fix, if a playtest ever wants one, is `pour.okMs` 130 or
  a multiplier of 1.4 rather than a change to the rule.
- **`knots.secondsPerKnot` and `carry.throwFlightSeconds` are not under T3's *lead floor*, and that
  is load-bearing rather than an oversight.** Both give the player a real lead-in — one beat before
  the first knot (`knotTimes`), the flight before a catch — and both clear 400 ms as authored. But
  the Dexterity table above puts them on the *tempo* line, where `secondsPerKnot` clamps to
  `markSpacing` (0.25 s) and `throwFlightSeconds` clamps to nothing at all. At rung 4 they become
  0.32 s and 0.40 s, so a lead floor over them would make `applyDifficulty`'s own output fail
  re-validation and break ADR 0014 invariant 1. `crimp.leadSeconds` and `toss.arcSeconds` are on
  the `lead` line, clamp to `leadInMs`, and survive every rung — which is why they are the two
  fields the lead floor names.
- **The catch is under T3's second clause, and the first draft of this audit missed it entirely.**
  `judgeCatch` (`shared/src/sim/items.ts:112-124`) is the same symmetric perfect/ok/miss judge as
  `judge` and `judgeShove`, and its cue is the throw: `arrivesAt = now + carry.throwFlightSeconds`
  (`game-server/src/sim/itemThrow.ts:113`). `windowsOf` floor-checked `catchOkMs` and
  `catchPerfectMs` against `windowFloorsMs` and nothing checked the flight, so a level with
  `throwFlightSeconds` 0.1 and `catchOkMs` 110 validated clean and then scored OK at every moment
  of the flight *and* 5 ms before the thrower let go — a mash, which is the exact fault the second
  clause exists to prevent. As shipped the campaign is fair (150 ms against a 500 ms flight), so
  this is a hole in the guarantee rather than in the content, and `cuesOf` now emits a `carry` cue
  with `anticipated: false` beside the Slammer's two. Clause 2 is transform-safe here without a
  clamp, because the Dexterity table keeps `w ≤ s`: `catchOkMs × w ≤ flight × 1000 × w ≤
  flight × 1000 × s`.
- **The retuned crimp costs the Jig 0.6 s of execution per stick** (a 1.2 s ratchet instead of
  0.6 s), and an earlier draft of this bullet named the wrong victim. The cycle rule is
  `max(execution + interrupts, machine)` with `machine = floorSeconds / efficiency × 0.75` after a
  Perfect (docs/05:40-45), and a flawless long-fuse phrase off a good keg went 4.2 s → 4.8 s. Worked
  against Assembly's staffing curve (`{1: 0.6, 2: 1.0, 3: 1.15}`, `floorSeconds` 5.0):

  | crew at Assembly | machine | execution | cycle before → after | change |
  |---|---|---|---|---|
  | solo | `5.0 / 0.6` = 8.33 s | 4.2 → 4.8 s | 8.33 → 8.33 s | none — machine-bound with 3.5 s to spare |
  | pair | 5.00 s | 4.2 → 4.8 s | 5.00 → 5.00 s | none — still machine-bound |
  | pair, chaining Perfects | `5.00 × 0.75` = 3.75 s | 4.2 → 4.8 s | 4.20 → 4.80 s | **−12.5 % throughput** |
  | trio | `5.0 / 1.15` = 4.35 s | 4.2 → 4.8 s | 4.35 → 4.80 s | −9 % |

  So no shipped level's *demand* moved: level 3 asks ~0.13 sticks/s against a pair's 0.20, and a
  pair is machine-bound at 5.0 s either side of the retune. What moved is the **skill ceiling**. The
  Perfect re-arm bonus is now fully masked — a phrase longer than the machine means playing
  flawlessly buys nothing — and the marginal value of a third body at Assembly fell from 13 %
  (5.00 → 4.35) to 4 % (5.00 → 4.80), and to nothing on a Perfect streak. ADR 0009 wants a skill
  ceiling at *every* station; this retune taxed only the players who had reached Assembly's.
- **If a playtest wants that ceiling back, the lever is the crimp's length, not its windows.**
  `clicks` 3 → 2 keeps `leadSeconds` 0.4 and `clickSeconds` 0.4, lands the ratchet in 0.8 s, brings
  the long-fuse phrase to 4.4 s and clears every floor (T1 400 ≥ 250, T2 `180 < 200`, T3 lead
  400 ≥ 400 and `180 ≤ 400`). EL-186 did **not** pull it, because three clicks is canon in three
  places this workstream does not own: `docs/04-minigames.md:182` (*"Three eighth-note ratchet
  clicks. Tap `Space` on the third"*), `docs/04:187` and `:201` (*toss-on-the-crimp*, B's half of
  the phrase), and the client's own on-screen instruction
  `resources/js/game/minigames/Jig.ts:1151` (`'CRIMP ON THE THIRD CLICK'`). Shipping `clicks: 2`
  from a level file alone would tell the player to tap a click that does not exist. It is a design
  change for docs/04's owner, made across all four files at once, never a config edit.
  `orders.qtyPerTruck.base` and the `machine` group remain the levers for a Pressure problem —
  F14 exists precisely so that nobody pays for one with their thumbs.

### Worked examples

**Dexterity 4 (`hairTrigger`) on the retuned Level 1** — the hard end is where clamping fires
and the invariants have to survive it (`w = 0.70`, `s = 0.80`):

| field | authored | × factor | to the room | why |
|---|---|---|---|---|
| `knots.okMs` | 140 | 98 | **100** | `windowFloorsMs.ok` |
| `knots.perfectMs` | 60 | 42 | **45** | `windowFloorsMs.perfect` |
| `knots.secondsPerKnot` | 0.40 | 0.32 | 0.32 | above the 0.25 floor |
| `crimp.okMs` | 180 | 126 | 126 | |
| `crimp.clickSeconds` | 0.40 | 0.32 | 0.32 | |
| `crimp.leadSeconds` | 0.40 | 0.32 | **0.40** | `tempoFloorsMs.leadInMs` |
| `bpm` | 150 | 187.5 | 187.5 | beat 320 ms, over the floor |
| `beepHz` | 1 | 1.25 | 1.25 | 800 ms |
| `toss.arcSeconds` | 0.50 | 0.40 | 0.40 | at the lead floor |
| `heat.deadCenterMs` | 50 | 35 | **45** | perfect floor |
| `heat.okMsAtMinCharge` | 105 | 73.5 | **100** | ok floor |
| `carry.throwFlightSeconds` | *level value* | × 0.80 | — | no floor applies |

T2 after clamping: knots `100 < 160` ✓, crimp `126 < 160` ✓, pour `100 < 160` ✓, shove
`126 < 400` ✓. That headroom exists because the spacing floor (250) is more than twice the
window floor (100) — bound 1 of the tempo-floor argument, doing its job.

**Dexterity 0 (`mittens`)** clamps nothing, and T2 holds by the `w ≤ s` property: knots
`196 < 280`, crimp `252 < 280`, beat 560 ms, shove `252 < 700`.

**Pressure at the extremes, checked against T5 and T5b** (`shiftSeconds` 600 as authored). The
`bp≤2` rows are Level 1's small-crew breakpoint — the one ADR 0013 requires and the one a solo
player actually plays:

| level | rung | shift | book | firstAt | everySeconds | wait | last truck leaves | ≤ shift |
|---|---|---|---|---|---|---|---|---|
| 1 | 4 `quarterEnd` | 600 | 10 | 15 | 45 | 15 | 435 | ✓ |
| 2 / 4 | 4 | 600 | 13 | 15 | 45 | 15 | 570 | ✓ |
| 3 | 4 | 600 | 17 | 15 | 33.75 | 15 | 570 | ✓ |
| 1 `bp≤2` | 4 | 600 | 5 | 15 | 67.5 | 15 | 300 | ✓ |
| 1 | 0 `slowWeek` | 690 | 6 | 27 | 81 | 27 | 459 | ✓ |
| 3 | 0 | 690 | 9 | 27 | 60.75 | 27 | 540 | ✓ |
| 1 `bp≤2` | 0 | 690 | 3 | 27 | 121.5 | 27 | 297 | ✓ |
| sandbox | any | 0 | 0 | 27 / 15 | 81 / 45 | — | `day` untouched | n/a |

The extremes are not the tight cases, which is the argument for having the validator do this
rather than a designer's eye. **Rung 3 is tighter than rung 4 on Levels 2 and 4**: `book` 1.15
gives a book of 12 while `cadence` 0.85 only stretches the interval to 51 s, so the last truck
leaves at 595 against a 600 s shift — five seconds of slack. Rung 4 adds a thirteenth truck and
still ends thirty seconds clear, because dropping the interval to 45 s buys back more than the
extra truck costs. Every shipped level clears both clauses at all five Pressure rungs; that 5 s
is the whole margin the campaign has, and it is why moving `orders.everySeconds` in a level file
is now a change that has to be re-validated rather than eyeballed.

### Admin surface and the seam

**Storage.** `factories.dexterity` and `factories.pressure`, `unsignedTinyInteger` default 2,
cast to `App\Enums\Dexterity` / `App\Enums\Pressure` on the model — the table they join is
`database/migrations/2026_09_05_123703_create_factories_table.php:13-23`. One pair of columns,
not one for the owner and one for the admin: two sets need a precedence rule, and a precedence
rule is a support ticket waiting to happen.

**The owner sets them** on the factory page, beside the level picker that already lives there
(`app/Livewire/Factories/Show.php:36-54`). Two `updated*` hooks, each opening with
`$this->authorize('tune', $this->factory)` — for the reason that component already documents at
Show.php:36-41: a Livewire update posts to its own endpoint and never re-runs the route's
`can:view` middleware, so every write has to authorize itself. `FactoryPolicy` gains
`tune(User $user, Factory $factory): bool` = the factory's owner or a site admin; today the
policy has only `view` (`app/Policies/FactoryPolicy.php:16-19`). Level selection stays open to
any member and difficulty does not: the owner is the one who signed up to be embarrassed by the
report. **A co-owner is a member for this purpose.** F13 adds `co_owner` in the same wave and
gives it the crew powers (`docs/features/F13-menu-settings-crew.md:108`, `:182`); `tune` names
`ownerUserId` and the `admin` gate and nothing else, so a co-owner gets 403 — promoting a friend
so they can kick a troll is not the same act as handing them the dial the run record is stamped
with. That is a decision rather than an oversight, so it gets its own Pest case.

**A site admin overrides them** at `/admin/factories`, a Livewire index inside the existing
`['auth', 'can:admin']` group (`routes/web.php:31-34`; the gate is defined at
`app/Providers/AppServiceProvider.php:31`), writing the same two columns. The admin section
already owns the level editor (`app/Livewire/Admin/Levels/Edit.php`); this is its factory-side
equivalent and needs no new authorization *concept*.

It does need the check written out on every write, and route middleware is exactly what will not
supply it: **`can:admin` in `routes/web.php` guards the first page load and nothing after it**,
because a Livewire update posts to Livewire's own endpoint. This is the same trap
`Show::updatedLevelId` documents for `can:view` (Show.php:36-41), one component tree over. Both
existing admin components already write the check out — `Levels\Index::toggleActive` opens with
`$this->authorize('admin')` (`app/Livewire/Admin/Levels/Index.php:22-24`) and `Levels\Edit::save`
does it again at Edit.php:79 even though `mount` already did at Edit.php:27 — and F14 copies
them rather than inventing anything. Every write method on `Admin\Factories\Index` opens with
`$this->authorize('admin')`, and the Pest suite proves it the only way that proves anything: by
calling the component method directly as a non-admin, not by requesting the route.

**How it reaches the room.** `GET /internal/factories/{id}/config` — the HMAC-signed
server-to-server call of contracts §5 — gains one field beside `factory`, `level`, `layout` and
`members` (`app/Http/Controllers/Internal/FactoryConfigController.php:33-48`):

```json
"difficulty": { "dexterity": 2, "pressure": 2 }
```

Node adds it to `FactoryConfigResponse` (`game-server/src/laravel/api.ts:10-15`) and passes it
through `difficultyOf` inside `validated()` (`game-server/src/config/levels.ts:46-65`): anything
out of range, absent, or not a number becomes rung 2 rather than an error, because a factory row
holding a value from a future release must not make the room unbootable.
`loadLocalFactoryConfig` (levels.ts:67-83) supplies `DEFAULT_DIFFICULTY` for the
Laravel-unreachable path. `FactoryRoom.onCreate` writes `state.dexterity` and `state.pressure`
once (contracts §3 addition below), and `finishDay` copies them into `RunPayload.difficulty`.

Both state fields are **`@type('number')` with an initialiser of `2`**, not the `uint8` ADR 0014's
contract bullet writes. There is no `uint8` anywhere in this repo: every field in
`shared/src/schema/FactoryState.ts` is `@type('number')` (FactoryState.ts:17-40), and inventing a
narrower encoding for two integers that change once per room would be the first of its kind for
no measured saving. The `2` initialiser is the exception §3 already makes for `day 1` and
`groove 50` (contracts §3, `00-contracts.md:161-162`) — it matters because a room that somehow
skipped the write should read as "the level as authored", not as rung 0.

**Not the ticket.** The ticket is minted per player from a browser POST
(`app/Actions/IssueGameTicket.php:33-42`) and carries `{ userId, factoryId, name, exp }`.
Difficulty is a property of the room, not of a seat: every player in a room must run identical
numbers, or the server's judgements stop matching anybody's overlay. The config call happens
once, at `onCreate` (`game-server/src/rooms/FactoryRoom.ts:80-94`), from the factory row. The
client is never asked and never believed (ADR 0014 invariant 4).

**Nor the join options, and that gets a test rather than a sentence.** `onAuth` reads whatever
the client put in `options` — `factoryId`, `ticket`, `name` — so "the
dials are not join options" is a property of what the code *omits* — three `optionOf` calls and
no fourth (FactoryRoom.ts:120, :121, :138) — and omissions rot silently.
The adversarial case joins with `{ factoryId, ticket, difficulty: { dexterity: 0, pressure: 0 } }`
and asserts both that `state.dexterity` / `state.pressure` still hold the config response's pair
and that `world.level` is byte-identical to the transform of the stored pair — the second half
matters because a dial that leaked through `options` would show up in the level numbers long
before anyone noticed the state fields were right.

**What the client and the record get.** `FactoryState.dexterity` / `pressure` are read-only
state; nothing in the sim branches on them, and no message carries them a second time. Three
surfaces read those two fields, and only two of them are F14's to write:

| surface | file | owner | what F14 adds |
|---|---|---|---|
| the `Tab` order board | `resources/js/game/ui/Hud.ts` (`board`, Hud.ts:206-251) | **F04 — a Touch** | two lines under the `ORDER BOARD · <book>` header (Hud.ts:237), from `copy.difficulty.*` |
| the report card | `resources/js/game/scenes/Report.ts` (`header`, Report.ts:125-135) | **F11 — a Touch** | one subtitle under `DAY n · <level title>` (Report.ts:133-135), from `copy.difficulty.*` |
| the Settings panel | `resources/js/game/ui/SettingsPanel.ts` | **F13 — owns it** | nothing; F13 writes and tests that line itself |

The HUD line goes in the `Tab` board rather than the permanent top band because the band is
already four things wide (chip, book, clock, Groove) and the rungs never change during a day —
a value that is constant for ten minutes does not earn permanent pixels. The board is the right
neighbour anyway: it already reads `this.conn.state` (Hud.ts:212) and already prints the book,
which is the number Pressure moved.

The report card reads the same two state fields rather than the payload, which is why
contract change 7 puts `difficulty` on `RunPayload` and **not** on `ReportPayload`:
`ReportScene` already pulls the live `Connection` out of the registry for `config`
(Report.ts:75-77) and `Connection` deliberately outlives the scene (`main.ts:198-199`: *"F11's
`Report` takes over at day end"*), so `conn.state` is still there when the card is drawn.
Adding the rungs to `ReportPayload` would be a second copy of a number the scene is already
holding the source for.

**F13's Settings panel is the third reader, and it is F13's line to write.** `Esc` → Settings
prints the same two rungs beside the level numbers they produced, off the same two schema
fields — `conn.state.dexterity` / `conn.state.pressure`, indexed into `DEXTERITY_RUNGS` /
`PRESSURE_RUNGS` and printed through `copy.difficulty` (`docs/features/F13-menu-settings-crew.md:61`,
`:111`, `:166`). F13 owns `resources/js/game/ui/SettingsPanel.ts` (F13:3) and F14 touches
nothing there; F13 in turn asks F14 for no new export and no new message field (F13:314).

That the three surfaces all read `FactoryState` and none reads a message is deliberate, and
F13:166 states the reason from its side: contracts §4 fixes
`ConfigMsg = { level; layout; copy }` (`00-contracts.md:214`), so a `ConfigMsg.difficulty`
would be a second copy of two integers already on state — worse, a field on `ClientConfig` that
nothing on the server writes. F14 widens the *HTTP* config reply (contract change 5) and
`FactoryState` (change 6), and leaves the message alone.

`RunPayload.difficulty` goes into `runs.metrics` with the rest of the body (F01's `StoreRun`
stores the whole payload, contracts §5), so a B earned at Pressure 0 is legible as one forever.

## Acceptance criteria

- [ ] Rung 2 on both dials is the identity: `applyDifficulty(level, { dexterity: 2, pressure: 2 })`
      deep-equals its input for all five shipped levels.
- [x] `validateLevelConfig` rejects the pre-retune crimp block with three distinct errors (T1, T2,
      T3) naming `stations.assembly-a.minigame.crimp`.
- [x] `crimpClicks` places the first click a whole `leadSeconds` after the last knot and the rest
      `clickSeconds` apart, and `enterCrimp` passes both — proved with the two set apart, since at
      the shipped 0.4 / 0.4 one number doing both jobs is indistinguishable from two.
- [x] On the retuned numbers a tap on the second click grades `miss` / `early`, a tap within 80 ms
      of the third grades `perfect`, and one 190 ms out — an OK on the shipped 200 ms window —
      grades `miss`.
- [x] The station progress bar empties on the click the tap is judged against: at the shipped
      numbers it reads 1/3 of the crimp's quarter at the first click and reaches 1.0 only at the
      third, rather than pinning full for the last 600 ms of the ratchet
      (`game-server/tests/minigames/jig.test.ts`).
- [x] `validateLevelConfig` rejects a `carry` block whose `catchOkMs` is wider than
      `throwFlightSeconds`, and accepts a flight below the 400 ms lead floor whose window still
      fits inside it.
- [x] Every shipped level satisfies T1, T2 and T3 restated as arithmetic over the files on disk,
      not only via the validator that encodes them (`shared/tests/levels.test.ts`).
- [x] All five shipped levels return `ok: true` after the retune; `shared/tests/levels.test.ts`
      passes unchanged apart from the crimp numbers.
- [ ] For every shipped level and all 25 `(dexterity, pressure)` pairs,
      `validateLevelConfig(applyDifficulty(level, s)).ok` is true; and for every crew size from
      `players.min` to `players.max`, `scaleLevel(transformed, n)` not only returns but produces a
      `day.orderBook` / `orders.everySeconds` pair that still satisfies T5b's inequality. "It
      scaled without throwing" is a weaker claim than the one that matters: the breakpoint's four
      numbers are the ones a crew plays.
- [ ] Every Dexterity rung satisfies `windows ≤ tempo`; the test asserts it over the table, not
      over a fixture.
- [ ] Dexterity 4 on Level 1 clamps `knots.okMs` to 100, `knots.perfectMs` to 45,
      `heat.deadCenterMs` to 45, `heat.okMsAtMinCharge` to 100 and `crimp.leadSeconds` to 0.40,
      and leaves every other field at its multiplied value. Dexterity 0 clamps nothing.
- [ ] `applyDifficulty` on Sandbox leaves `day` byte-identical (`shiftSeconds 0`, `orderBook 0`,
      `endsOn 'never'`) at all 25 pairs while still moving `orders.everySeconds`.
- [ ] `day.orderBook`, `orders.qtyPerTruck.base`, both breakpoint equivalents, both shelf
      capacities and `casings.stock` are integers ≥ 1 (or exactly 0) at all 25 pairs; powder's
      absent input shelf and the dock's two absent shelves stay absent.
- [ ] Every `scaling.breakpoints[]` entry is rewritten, so `scaleLevel(transformed, 2).day.orderBook`
      equals `round(breakpoint.orderBook × book)` — the proof that Pressure ran *before* scaling.
- [ ] T5b holds for Level 1's `maxPlayers: 2` breakpoint at all five Pressure rungs — ADR 0013's
      small-crew guarantee, checked where a solo player actually meets it. The property test
      covers the general case; this one is named because it is the guarantee, not a sample.
- [ ] `floorSeconds ≤ nominalSeconds` and `peakWorkers(staffing)` are unchanged at every Pressure
      rung.
- [ ] `applyDifficulty` changes no field outside the enumerated lists: a deep diff against the
      input names only those keys.
- [ ] A level authored at `heat` `minChargeSeconds 0.40` / `maxChargeSeconds 0.45` still has
      `min < max` at all five Dexterity rungs, and a level file that ships `min ≥ max` is rejected
      by T6. The 0.40 / 0.45 level is built in the test, not borrowed from `config/game/levels`.
- [ ] `validateLevelConfig` rejects a 200 ms click spacing on a level that carries **no**
      `tempoFloorsMs` key, and `applyDefaults` fills the key on that same level.
- [ ] A factory created with no explicit settings reports rung 2 / rung 2, and the internal config
      response carries them; the room boots at the defaults when the column holds an out-of-range
      value.
- [ ] Joining with `difficulty` in the join options changes nothing: both state fields still hold
      the config response's pair, and `world.level` is byte-identical to the transform of the
      stored pair (ADR 0014 invariant 4).
- [ ] The columns changed between `onCreate` and `finishDay` do not change the run: the payload
      carries the pair the room was created with (ADR 0014 invariant 5).
- [ ] A non-admin calling a write method on `Admin\Factories\Index` directly gets
      `AuthorizationException` and both columns are unchanged; a co-owner and a non-member calling
      `Show::updatedDexterity` both get 403.
- [ ] `RunPayload.difficulty` reaches `runs.metrics`.
- [ ] Both Touched client surfaces print both labels from `copy.difficulty.*` and never the integer:
      the `Tab` order board (`ui/Hud.ts`, F04) from `conn.state`, and the report card header
      (`scenes/Report.ts`, F11) from the `Connection` it already holds. Neither reads a new message
      field, and `ReportPayload` is unchanged.
- [ ] In the running game: two days on Level 1, one at Dexterity 0 / Pressure 2 and one at
      Dexterity 4 / Pressure 2. Both playable, the second visibly tighter; the crimp's third click
      is reachable in both, and a tap on the second click scores `miss` in both. Screenshot the Jig
      overlay in each.
- [ ] In the running game: a day at Dexterity 2 / Pressure 0 on Level 2 still produces the powder
      pile — the lesson survives the easiest Pressure rung.
- [ ] `cd shared && npm test && npm run typecheck`; `php artisan test --compact`;
      `vendor/bin/pint --format agent`; `npm run build` at the root. All green.

## Test plan

**shared — `shared/tests/difficulty.test.ts` (F14):**

- it leaves the level untouched at rung two on both dials
- it keeps every dexterity rung's window factor at or below its tempo factor
- it widens every window and lengthens every tempo field at dexterity zero
- it divides bpm and beepHz by the tempo factor
- it shortens the tailgate hold as dexterity falls
- it leaves beatsByQuality and primeKegWindowMultiplier alone
- it leaves knots.long, knots.short and crimp.clicks alone
- it leaves movement and carry.slowdown alone
- it clamps a window that falls below windowFloorsMs instead of breaking it
- it clamps a tempo field that falls below tempoFloorsMs instead of breaking it
- it keeps the slammer's charge range the right way round when the minimum clamps *(the
  hand-built 0.40 / 0.45 level, at every dexterity rung)*
- it leaves the charge range identical to a plain multiply when the minimum does not clamp
- it scales the order book, the truck cadence and every breakpoint together
- it lengthens the shift on the easy rungs and never shortens it
- it scales the staffing curve's height without moving its peak worker count
- it scales nominalSeconds and floorSeconds by the same factor
- it rounds every integer field to at least one, and leaves a zero at zero
- it skips a station's absent shelves
- it leaves the whole day block alone when endsOn is never
- it leaves hazards, grading and economy alone
- it validates every shipped level under every settings pair, at every crew size from
  `players.min` to `players.max`, and the *scaled* book still fits the shift *(the property test:
  five levels × 25 pairs × the crew range, asserting `validateLevelConfig(...).ok` on the
  transform and T5b's inequality on `scaleLevel(transformed, n)`, not merely that `scaleLevel`
  returned)*
- it falls back to rung two for an out-of-range or missing value

**shared — additions to F02's `shared/tests/validate.test.ts`:**

- it rejects a crimp whose OK window reaches the previous click
- it rejects a crimp whose lead-in is shorter than the lead floor
- it rejects a knot spacing below the mark floor
- it rejects a bpm whose beat is below the mark floor
- it rejects a perfect window wider than its OK window
- it rejects a dead-centre band wider than the narrower heat OK window
- it rejects a book whose last truck leaves after the whistle
- it rejects a breakpoint whose book runs past the whistle while the top-level book fits
- it rejects a slammer whose OK window opens before the earliest legal release
- it rejects a slammer whose minimum charge is not below its maximum
- it refuses a catch window that opens before the throw
- it accepts a flight shorter than the lead floor while the window still fits it *(the clause-2-only
  shape: a lead floor here would reject `applyDifficulty`'s own output)*
- it reads the mark floor from the §13 default on a level that carries no tempoFloorsMs key
  *(the case that fails today for the ordering reason above, not merely for the missing rule)*

**shared — additions to F02's `shared/tests/defaults.test.ts`:**

- it fills tempoFloorsMs on a level that omits it

**shared — additions to F08's `shared/tests/jig.test.ts`:**

- it places the first ratchet click one lead-in after the last knot
- it scores a tap on the second click as a miss under the retuned numbers
- it scores a tap on the third click as perfect
- it fills the crimp bar across the whole ratchet, not the first click *(the across-the-room tell:
  `progressOf` derives the ramp from `leadSeconds + (clicks − 1) × clickSeconds` rather than the
  0.6 s constant that was only ever right for the pre-retune tuning)*

**game-server — additions to `game-server/tests/levels.test.ts` and
`game-server/tests/FactoryRoom.test.ts` (F03; those are the real paths — there is no `tests/config/`
or `tests/rooms/` directory):**

- it applies the factory's difficulty between validation and layout checks
- it re-validates the transformed level and throws with the validator's own errors
- it runs at rung two when Laravel sends an out-of-range value
- it runs at rung two on the local-level fallback
- it writes both rungs into FactoryState once at room create
- it copies both rungs into the run payload at finishDay
- **adversarial —** it ignores a difficulty in the join options: state and `world.level` both still
  match the config response's pair
- it posts the rungs the room was created with after the factory row changed mid-shift *(ADR 0014
  invariant 5: rewrite the stub's config response between `onCreate` and `finishDay`)*

**Laravel — `tests/Feature/Difficulty/` (Pest, F14):**

- `FactorySettingsTest`: defaults on a new factory; the owner may tune; a site admin may tune any
  factory; a value outside 0–4 is rejected before it reaches the column. Then the four refusals,
  every one of them calling the component method directly rather than requesting the route,
  because the route is not what would break:
  - a plain member calling `Show::updatedDexterity` gets 403 and both columns are unchanged
  - a **co-owner** calling `Show::updatedDexterity` gets 403 — F13 gives co-owners the crew, not
    the dials, and this case is what stops that drifting
  - a non-member of the factory calling it gets 403
  - **the admin back door:** a non-admin calling the write method on `Admin\Factories\Index`
    directly (`Livewire::actingAs($user)->test(Admin\Factories\Index::class)->call(...)`) gets
    `AuthorizationException` and the columns are unchanged — `can:admin` on the route never ran
- `InternalConfigDifficultyTest`: the signed config response carries the stored pair; a legacy
  row without the columns answers with the defaults
- `RunDifficultyTest`: a posted run keeps `difficulty` inside `runs.metrics`

**Client — additions to F04's `resources/js/game/__tests__/` and F11's report tests:**

- it names both rungs on the order board from the copy bundle, not from the integer
- it names both rungs in the report header from the copy bundle, not from the integer

**In-app (after the unit gates):**

1. Factory page: set Dexterity 0 / Pressure 0, reload, confirm both persist and the labels come
   from `copy.json`.
2. `/admin/factories`: as the site admin, change the same factory to 4 / 4; confirm the owner's
   page shows the admin's values.
3. Level 1, three sessions, Dexterity 4 / Pressure 4: play a full day. Screenshot the Jig overlay
   mid-crimp, the `Tab` order board showing both labels, and the report card showing both labels.
   Three surfaces, one pair of numbers, no disagreement between them.
4. Same crew, same level, Dexterity 0 / Pressure 0: play a full day. Screenshot. The two report
   cards side by side are the evidence that the dials are independent — same grade shape,
   different reasons.
5. Level 2 at Dexterity 2 / Pressure 0 with three people: confirm the powder pile still forms and
   somebody still has to say it out loud.

## Tasks

**This lands in three commits, not one, and the boundaries are not arbitrary.** F14 contains four
independent risk surfaces — a validator change that turns all five shipped levels red the moment
it lands, a new pure module with a 125-case property test, a game-server seam change in a file
F11 is actively rewriting, and a Laravel migration with two authorization surfaces. One review
cannot hold all four, and the first can leave `main` unbootable on its own. The split below is by
blast radius, and each stage is green and shippable by itself.

**Stage A — the tempo hole (no difficulty concept at all).** This is a bug fix for ADR 0009's
enforcement gap and is worth landing whether or not the dials ever ship. Tasks 1–4 are **one
commit**: between task 2 and task 4 the five shipped levels do not validate and no room boots, so
the tree is only correct at both ends.

- [x] 1. Config shape: `TempoFloorsMs`, `LevelConfig.tempoFloorsMs?`, `CrimpConfig.leadSeconds` in
      `types.ts` + `schema.json` + `defaults.ts`, and the `floors` resolution line at the top of
      `semanticErrors`. Test first (`validate.test.ts`'s no-key case, `defaults.test.ts`'s fill
      case). Green.
- [x] 2. **T1–T3 only** in `validate.ts` (`marksOf` / `cuesOf` / `checkTempo`), beside the
      existing window loop. Test first (the rejection cases, using the pre-retune crimp as the
      fixture). Green — and the five shipped levels now fail, which is the bug reproduced at the
      gate. T4, T5, T5b and T6 move to EL-190 with the transform that can violate them; see the
      status block at the top.
- [x] 3. `crimpClicks` gains `leadSeconds`; `enterCrimp` passes it (F08's `shared/src/sim/jig.ts`).
      Test first (the crimp cases, in `game-server/tests/minigames/jig.test.ts`). Green.
- [x] 4. The retuned `crimp` block in all five level files, with the reasoning in each file's
      `notes` (`.ai/rules/config.md`). `shared/tests/levels.test.ts` goes green again.
      **F12 is editing these five files right now** — re-read each one immediately before the edit
      and change only the `crimp` object and the `notes` entry.
- [x] 5. `progressOf` derives the crimp's ramp from `leadSeconds + (clicks − 1) × clickSeconds`
      instead of `CRIMP_PROGRESS_SECONDS`, which the retune left describing a ratchet half the
      length of the real one. Test first, in `game-server/tests/minigames/jig.test.ts`. Green.
- [x] 6. T3's second clause over the catch (`cuesOf` gains a `carry` cue, `anticipated: false`).
      Test first, in `shared/tests/validate.test.ts`, plus the property case over the five files.
      Green.
- [ ] A. Stage gate: `cd shared && npm test && npm run typecheck` ✓; `cd game-server && npm test`
      ✓ (its fixtures carry crimp blocks too) and `npx tsc --noEmit` ✓. `npm run typecheck:client`
      still fails on the one client fixture named in the status block, so the stage is not
      committable until that workstream lands its three lines.

**Stage B — the transform and the seam (a no-op until Stage C).** Everything defaults to rung 2
on both dials, which is the identity, so this stage is observably invisible: the same levels, the
same numbers, two new state fields reading 2. That is what makes it safe to land alone.

- [ ] 5. `shared/src/sim/difficulty.ts` + `shared/tests/difficulty.test.ts`, test first, one case
      at a time down the list above. One `export *` line in `shared/src/index.ts`.
- [ ] 6. `FactoryConfigResponse.difficulty`, `difficultyOf` inside `validated()`, the re-validate
      step, `loadLocalFactoryConfig`'s default. Server tests first, the join-options case included.
- [ ] 7. `FactoryState.dexterity` / `pressure`; `FactoryRoom.onCreate` writes them;
      `RunPayload.difficulty`; `finishDay` copies them. Server tests first.
- [ ] B. Stage gate: both vitest suites and `npm run build`. Commit. **This is the only stage that
      touches `finishDay`**, and F11 has `game-server/src/sim/{day,metrics,groove}.ts` and
      `tally.ts` open — sequence task 7 after F11's report work lands, or take the one-line
      `finishDay` edit as the last thing in the stage and re-read the method first.

**Stage C — the surfaces.** Nothing here changes a number; it lets a human choose one.

- [ ] 8. Laravel: migration, enums, `Factory` casts, `FactoryPolicy::tune`, `Factories\Show` hooks,
      `FactoryConfigController` field. Pest first — the four refusal cases before the happy path.
- [ ] 9. `/admin/factories` Livewire index + view, every write method opening with
      `$this->authorize('admin')`. Pest first, back-door case first.
- [ ] 10. `config/game/copy.json` `difficulty` section + the `Copy` type; then the two client
      Touches — two label lines in `Hud.board` (F04's `resources/js/game/ui/Hud.ts`) and one
      subtitle in `ReportScene.header` (F11's `resources/js/game/scenes/Report.ts`), both from
      `copy.difficulty.*`. `copy.test.ts` covers the keys; the two client cases cover the render.
      Neither file is F14's: land contract change 14 first, so the touch is recorded where F04's
      and F11's owners look rather than only in F14's own row.
- [ ] 11. Full gate and the five in-app steps; screenshots; tick the boxes and the row in
      `docs/features/README.md`.

The contract changes split the same way. Stage A makes bullets 1, 2, 3, 8, 9, 10, 11 and 15 true;
Stage B makes 4, 5, 6 and 7 true; Stage C makes 12 true. Bullets 13 and 14 are the ownership rows
and describe the finished feature, so they land whole. All of them still go into the single v2.2
pass — the staging says which commit makes each one true, not that `00-contracts.md` gets edited
three times.

## Risks & open questions

- **The retune slows the Jig by 0.6 s of execution per stick, and it is the skill ceiling that
  pays.** Measured above: solo and an ordinary pair are machine-bound and do not move at all, while
  a pair chaining Perfects loses 12.5 % and the third body at Assembly loses most of its value. No
  level's *demand* is at risk. The instinct will be to shorten the ratchet or narrow the window
  again; the window is the fault this feature exists to remove, and the length is docs/04's call
  across four files, not a config edit (above). Move `orders.qtyPerTruck.base` or the `machine`
  group and say so in the level's `notes`.
- **The crimp is now the widest window in A's phrase — ±80/±180 against the knots' ±60/±140 — and
  this doc did not change that.** Window-over-spacing is 45 % at the crimp against 35 % at the
  knots and 18 % at the Dock, so the beat that decides `capLoose`, the `crimpOnDented` spark and
  PRIME is the most forgiving input A makes. Three things argue it is not a defect and one argues
  it might be, and the call belongs to docs/04's owner rather than to a bug fix: (a) ADR 0009's
  floors bound windows from *below* and forbid downstream being *harder*, never easier, so nothing
  is violated; (b) ±80/±200 is authored at `docs/04-minigames.md:182` against the knots' ±60/±140
  at `:181` — the crimp is the one step whose difficulty is *identifying* the mark rather than
  hitting it, and a wider OK pays for the counting; (c) it is not the loosest gate on a PRIME run
  either — `primeKegWindowMultiplier` 1.5 makes the prime keg's pour ±90 Perfect, wider than the
  crimp's ±80, and the binding gate is three knots at ±60. Against that: ±80 means the climax
  essentially never fails a run the knots survived. If a playtest wants it tightened, ±60/±140
  clears every floor (T1 400 ≥ 250, T2 `140 < 200`, ADR 0009 `140 ≥ 100` / `60 ≥ 45`, and at
  Dexterity 4 98/42 clamp to 100/45) — but it should not be pulled in the same pass as the tempo
  fix, because the complaint that started EL-186 was that the crimp was *too hard*, and moving both
  at once makes the playtest unreadable.
- **The ratchet has no sound, and that is the other half of "find the third click".** A
  `grep -rniE 'audiocontext|this\.sound|\.wav|\.ogg|\.mp3|oscillator' resources/js/` returns
  nothing: there is no metronome, no per-click tick, no chunk on completion. `drawCrimp`
  (`resources/js/game/minigames/Jig.ts:1130-1157`) draws all three click lines statically from the
  phase's first frame, so a 1.2 s ratchet on a five-mark phrase is played entirely by eye off one
  overlay bar. The retune made the third click *reachable*; a rising per-click tick with a distinct
  third-click accent is what makes it *findable*, and it is F08 task 8's ("pops, sounds"), not
  this doc's. **Do not retune the crimp again to compensate for a missing sound.**
- **`assembly-a`'s `nominalSeconds` 6.0 is now the flawless worst case rather than an expectation
  with slack.** The worst honest phrase — dud keg (8 beats), long fuse, every mark flawless — is
  6.0 s exactly, where before the retune it was 5.4 s. `nominalSeconds` has no runtime effect at
  the Jig (the station's own `stationStatus` supplies `state` and `progress`, so
  `stations.ts:727`'s cycle-rule fallback never runs for it) and `bottleneckStation` reads
  utilization × shelf fullness, so nothing is mistuned — but docs/05:49 calls it "the balancing
  expectation for the bottleneck estimator and the report", and an expectation the best case
  already meets is misleading. Either raise it to ~6.8 in all five files and `devLevel.ts`
  (`floorSeconds` 5.0 still clears validate.ts:333) or leave it; EL-186 left it and recorded the
  arithmetic in each level's `notes`, because moving a balancing number is F12's call.
- **Dexterity moves the spark rate without touching `hazards`.** A crimp miss on a dented casing
  rolls `hazards.sparks.crimpOnDented` (contracts §10.5), so an easier rung produces fewer sparks
  and a harder one more — through the player's hands, which is how ADR 0008 wants consequences to
  arrive. Worth watching all the same: if Dexterity 4 on Level 2 explodes for timing reasons
  rather than pile reasons, the dial is teaching the wrong lesson and the answer is `crimp.okMs`,
  never `sparks.crimpOnDented`.
- **Twenty-five combinations, six crew sizes, five levels, and nobody will play them all.** The
  property test covers all of them precisely because humans will not. It is cheap: the transform
  is pure, `scaleLevel` is pure, and the validator runs in milliseconds.
- **Pressure 4 on a small-crew breakpoint may be unwinnable, and T5 alone would not have caught
  it.** ADR 0013's `maxPlayers <= 2` breakpoint exists so a solo player gets a finishable book;
  multiplying it by 1.30 is a choice a solo player is allowed to make. What guarantees the trucks
  still fit inside the shift is **T5b**, not T5: `scaleLevel` replaces `day.orderBook` and
  `orders.everySeconds` with the breakpoint's absolute numbers (scale.ts:36-40), so a rule reading
  only the top-level block checks a book no solo player ever plays. Without the per-breakpoint
  clause, ADR 0013's "startable, unwinnable" — the failure its validation rule exists to make
  unshippable — would come back at Pressure 3 and 4 with nothing checking for it. **This doc
  refines ADR 0013's guarantee to hold at every Pressure rung; ADR 0013 needs an amendment line
  saying so, and it is not one this doc can write.** Unwinnable-by-*throughput* is still
  reachable, and deliberately so: T5b bounds the truck timetable, never whether a crew of one can
  fill the trucks. If the playtest says solo at Pressure 4 is a wall rather than a challenge, the
  answer is a line in the UI, not a hidden clamp — a difficulty setting that silently refuses to
  be hard is worse than one that is.
- **`markSpacing` 250 ms is the floor, not the target.** The physiology argument (bound 2 and 3)
  says a 250 ms series is playable by anticipation only. That is acceptable *because* `leadInMs`
  guarantees the beat to lock onto — the two floors only work as a pair, and a future change that
  removes the lead-in floor must raise `markSpacing` to about 300 ms to compensate.
- **A level author may raise `tempoFloorsMs` above its own numbers** and make the level reject
  itself. That is the intended failure mode — loud, at validation, in the admin editor — not a
  silent clamp.
- **`applyDifficulty` is not idempotent and has no guard.** One call site, asserted by the server
  test. A second consumer would need a marker field or a wrapper type; adding one now would be
  speculative code for a caller that does not exist.
- **Level authors can still ship an unfair level through the fields no dial touches** — a
  `nominalSeconds` of 0.2, a staffing curve of zeroes. The fairness floors cover execution, which
  is what ADR 0009 promised; the rest is playtesting's job.
- **Stage A goes through a state where nothing boots, so it has to land whole.** Task 2 makes the
  five shipped levels invalid and task 4 makes them valid again; a commit between the two leaves
  `main` with a game server that throws at `onCreate` on every factory. That is the honest shape
  of the fix — the levels really are illegal under the rule ADR 0009 always implied — but it means
  Stage A is one commit and one review, and it means a rebase that splits tasks 2 and 4 across
  commits is a mistake rather than a tidy-up. It also collides with F12, which owns the same five
  files: re-read each one immediately before editing the `crimp` block.
- **The next semantic rule that needs a default will hit the same trap this one did.** Defaults
  land at validate.ts:60 and semantic rules run at validate.ts:56, while the sibling module's own
  comment says defaults are applied "before anyone reads the config" (defaults.ts:9-13) — true of
  every consumer except the one inside the same function. T1–T3 resolve the pair
  themselves and the contract bullet records why. If a later feature makes that a third and fourth
  occurrence, the right move is to reorder `validateLevelConfig` deliberately — as an F02 change
  with its own argument — not to keep sprinkling `?? LEVEL_DEFAULTS`.

## Contract changes required

Diff-ready bullets for the v2.2 pass. Items 1–7 restate ADR 0014's own contract bullets with the
key names and defaults this doc settles; items 8–15 are additions this doc makes on top of it.
The *Tasks* section says which stage makes each one true.

1. **§8 `LevelConfig`, new optional top-level key.** `tempoFloorsMs?: TempoFloorsMs` where
   `TempoFloorsMs = { markSpacing: number; leadInMs: number }`, listed after `windowFloorsMs`.
   Writer: the level file. Owner F02 (`shared/src/config/types.ts`). `schema.json`: object,
   `additionalProperties: false`, required `["markSpacing", "leadInMs"]`, `markSpacing`
   `{ type: 'number', minimum: 250 }`, `leadInMs` `{ type: 'number', minimum: 400 }`.
   *(ADR 0014's own contract bullet still names one key, `markSpacing` 250, but its invariant 3
   now carries the pair `{ markSpacing: 250, leadInMs: 400 }`; the v2.2 pass should take the
   invariant's version. The tempo-floor section above has the argument that the two only work as
   a pair.)*
2. **§13 defaults, new row.** `tempoFloorsMs` → `{ markSpacing: 250, leadInMs: 400 }`, applied in
   `applyDefaults` (`shared/src/config/defaults.ts`, F02). **Read by `applyDifficulty` and by
   every consumer downstream of `validateLevelConfig`'s return value — but *not* by the semantic
   rules that need it.** `validateLevelConfig` runs `semanticErrors(level)` on the raw input at
   validate.ts:56 and only returns `applyDefaults(level)` at validate.ts:60, so T1–T3 resolve the
   pair themselves with `level.tempoFloorsMs ?? LEVEL_DEFAULTS.tempoFloorsMs`. This is the first
   §13 default a semantic rule depends on; the row should say so, because the obvious reading of
   "applied before anyone reads the config" (defaults.ts:9-13) is wrong for this one caller.
3. **§8 validation, three new semantic rules.** T1 mark-spacing floor over
   `crimp.clickSeconds × 1000`, `knots.secondsPerKnot × 1000`, `60000 / bpm` and `1000 / beepHz`;
   T2 coupling `okMs < spacingMs / 2` on the same four; T3 lead-in
   `leadMs ≥ tempoFloorsMs.leadInMs && okMs ≤ leadMs` over `crimp.leadSeconds` / `crimp.okMs`,
   `toss.arcSeconds` / `toss.okMs`, `min(beatsByQuality) × 60000 / bpm` / `pour.okMs`, and
   boom_powder at **both** ends of the charge —
   `heat.okMsAtMinCharge ≤ heat.minChargeSeconds × 1000` and
   `heat.okMsAtMaxCharge ≤ heat.maxChargeSeconds × 1000`, because `okWindowMs` interpolates
   between the two (`shared/src/sim/slammer.ts:72-76`) and the window's opening time is linear in
   the charge, so the endpoints bound the interval. Placed in `semanticErrors`
   (validate.ts:221-237), owner F02.
4. **§10, new module.** `shared/src/sim/difficulty.ts` (owner F14) exporting
   `DifficultySettings`, `Rung`, `DEXTERITY_RUNGS`, `PRESSURE_RUNGS`, `DIFFICULTY_STEPS`,
   `DEFAULT_DIFFICULTY = { dexterity: 2, pressure: 2 }`, `difficultyOf(input: unknown):
   DifficultySettings`, `applyDifficulty(level: LevelConfig, settings: DifficultySettings):
   LevelConfig`. One `export * from './sim/difficulty';` line in `shared/src/index.ts` (F02's
   file, one-line Touch). Called in `game-server/src/config/levels.ts` `validated()` immediately
   after `validateLevelConfig` and **before** `scaleLevel`; the result is re-validated.
   `shared/src/sim/scale.ts` and `FactoryRoom.startDay` are unchanged.
5. **§5, config response gains a key.** `GET /internal/factories/{id}/config?players=N` →
   `200 { factory, level, layout, members, difficulty }` with
   `difficulty: { dexterity: 0|1|2|3|4, pressure: 0|1|2|3|4 }`. Writer F01
   (`FactoryConfigController`), from the factory's two columns; `{ dexterity: 2, pressure: 2 }`
   when unset. Node coerces with `difficultyOf`; never accepted from a client or from join
   options. `FactoryConfigResponse` (§10.1) gains the same field, and `loadLocalFactoryConfig`
   supplies the default.
6. **§3 `FactoryState`, two new fields.** `dexterity n` and `pressure n` — concretely
   `@type('number') dexterity = 2` and `@type('number') pressure = 2`, **not** the `uint8` ADR
   0014's bullet writes: every field in `shared/src/schema/FactoryState.ts` is `@type('number')`
   (FactoryState.ts:17-40) and there is no `uint8` in the repo. The `2` is an exception to §3's
   "numbers default 0", listed beside `day 1` and `groove 50` (`00-contracts.md:161-162`). Writer
   F03, once in `FactoryRoom.onCreate` from the config response; nothing in the sim branches on
   them, and no client message carries them a second time. Added to §3's writers-by-field table
   under F03.
7. **§9 `RunPayload`, new key.** `difficulty: { dexterity: number; pressure: number }` on the
   `RunPayload` half only (not `ReportPayload`), written by F03 at `finishDay` from
   `FactoryState`. Stored inside `runs.metrics` by F01's `StoreRun`; no column, no migration on
   `runs`.
8. **§8 `StationConfig.minigame` (assembly), new required key.** `crimp.leadSeconds: number` —
   `CrimpConfig` becomes `{ clicks, leadSeconds, clickSeconds, perfectMs, okMs }`, and
   `schema.json` adds `leadSeconds` to `AssemblyMinigame.crimp.required` with
   `{ type: 'number', exclusiveMinimum: 0 }`. No default: it is required, and all five shipped
   level files change in the same commit. Owner F02 (type + schema), F12 (files).
9. **§10.3 `shared/src/sim/jig.ts`, one signature change.**
   `crimpClicks(lastKnotAt: number, clicks: number, leadSeconds: number, clickSeconds: number):
   number[]`, indexing from 0 so the first click lands at `lastKnotAt + leadSeconds`.
   `enterCrimp` passes `cfg.crimp.leadSeconds`. Owner F08.
10. **§8 validation, one more semantic rule, in two clauses (T5, T5b).** When
    `endsOn !== 'never'`: **T5** `orders.firstAt + (day.orderBook − 1) × orders.everySeconds ≤
    day.shiftSeconds − orders.truckWaitSeconds` over the top-level block, beside
    `checkDayAndPlayers` (validate.ts:187-218); **T5b** the same inequality for every
    `scaling.breakpoints[i]`, substituting `breakpoints[i].orderBook` for `day.orderBook` and
    `breakpoints[i].truckEverySeconds` for `orders.everySeconds` and keeping the level's own
    `firstAt`, `truckWaitSeconds` and `shiftSeconds`, inside `checkScaling` (validate.ts:164-185)
    with the index in the error path. Today T5 is only an assertion in F12's level test and T5b
    exists nowhere; Pressure moves every term of both, and because `scaleLevel` overwrites
    `day.orderBook` / `orders.everySeconds` from the breakpoint (scale.ts:36-40), T5b is the
    clause that binds what a room plays. T5b is also what keeps ADR 0013's small-crew guarantee
    (`validate.ts:198-210`) true at Pressure 3 and 4; **ADR 0013 wants an amendment line recording
    that F14 refines it, which is outside this doc's ownership.** Owner F02.
11. **§8 validation, one more semantic rule (T4).** `perfectMs ≤ okMs` for every pair `windowsOf`
    collects (validate.ts:70-112): carry's catch, each assembly phase, the dock, and boom_powder's
    `heat.deadCenterMs` against `min(okMsAtMinCharge, okMsAtMaxCharge)` — the OK window
    interpolates between those two (`shared/src/sim/slammer.ts:72-76`) and `judgeRelease` tests
    dead centre first (slammer.ts:104-105), so a dead-centre band wider than the narrow end makes
    `prime` unreachable at that charge. Today `semanticErrors` compares each window only to its
    floor (validate.ts:225-229) and nothing compares the pair. Owner F02.
12. **§8 copy.** `config/game/copy.json` gains a top-level `difficulty` section and `Copy` gains
    `difficulty: { dexterity: Record<DexterityName, string>; pressure: Record<PressureName, string> }`
    (F12's append rule). Ten labels; no rung is ever printed as an integer.
13. **§12 ownership, new row for F14.** Owns `shared/src/sim/difficulty.ts`,
    `shared/tests/difficulty.test.ts`, `app/Enums/{Dexterity,Pressure}.php`, the
    `add_difficulty_to_factories_table` migration, `app/Livewire/Admin/Factories/Index.php` and
    its Blade view, `tests/Feature/Difficulty/**`. Touches: F02 (`types.ts`, `schema.json`,
    `defaults.ts`, `validate.ts`, `index.ts`, `schema/FactoryState.ts`, `report.ts`), F03
    (`laravel/api.ts`, `config/levels.ts`, `FactoryRoom.onCreate` / `finishDay`), F08 (`jig.ts`),
    F12 (five level files, `copy.json`, `Copy`), F04 (`resources/js/game/ui/Hud.ts` — two label
    lines in `Hud.board`), F11 (`resources/js/game/scenes/Report.ts` — one subtitle line in
    `ReportScene.header`), F01 (`Factory` casts, `FactoryPolicy`, `Factories\Show`,
    `FactoryConfigController`, `routes/web.php`, plus the new `factories.dexterity` /
    `factories.pressure` columns in its area).
14. **§12, two existing rows gain an inbound Touch.** The table's fourth column records
    cross-owner edits in both directions — F04's cell names who may edit F04's files
    (`00-contracts.md:945`) while F11's names what F11 may not edit (`:952`) — so a permission
    granted only in F14's own row is invisible to the owner whose file changes. Add to F04's
    cell: `ui/Hud.ts` `board`: F14 two label lines. Add to F11's cell, which today reads only
    the prohibitions `— (no Laravel files, no grade.ts/report.ts, no runPost.ts, no FactoryRoom
    edits)`: `scenes/Report.ts` `header`: F14 one subtitle line. Nobody touches F14's own files,
    so F14's row takes `—`.
15. **§8 validation, one more semantic rule (T6), and the transform rule that pairs with it.**
    `heat.minChargeSeconds < heat.maxChargeSeconds` in `semanticErrors`, owner F02. Nothing
    compares the two today — `windowsOf` collects only millisecond windows — and a level that
    inverts them does not throw: `climbFraction` returns 0 on a non-positive span
    (`shared/src/sim/slammer.ts:60-66`), so the gauge is silently always-hot for the whole shift.
    Paired with it, in `applyDifficulty` (bullet 4): the Dexterity `tempo` factor scales the charge
    **range as an interval** — `minChargeSeconds' = max(min × s, tempoFloorsMs.leadInMs / 1000)`,
    then `maxChargeSeconds' = minChargeSeconds' + (max − min) × s` — rather than multiplying the
    two endpoints independently, which inverts the range whenever the minimum clamps. The two are
    one item because neither alone is sufficient: the clamp cannot fix a file that was already
    inverted, and the rule cannot fix a transform that inverts a valid file. Owner F02 (rule),
    F14 (transform).
