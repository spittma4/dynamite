# F16 — Sprint, the fumble meter, and the trip
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/sprint.ts` · `shared/tests/sprint.test.ts` · `game-server/src/sim/sprint.ts` · `game-server/tests/sprint.test.ts` · `resources/js/game/render/Fumble.ts` · `resources/js/game/render/fumbleAudio.ts` · `resources/js/game/__tests__/Fumble.test.ts`
**Touches** (one line each, in another owner's file — contracts §1, §12): `shared/src/index.ts` (`export * from './sim/sprint';`) · `game-server/src/sim/systems.ts` (the `sprintSystem` line, first) · `resources/js/game/scenes/Factory.ts` (`createFumbleLayer(this)` in `Factory.create()`'s mount list)
**Edits granted by the contracts pass** (larger than a Touch — every one is listed line-by-line under *Contract changes required*, with the tests that break beside the source that breaks them): `shared/src/messages.ts` + `shared/tests/messages.test.ts` (F02) · `shared/src/schema/PlayerState.ts` (F02) · `shared/src/config/{types,defaults,schema}.*` + `shared/tests/defaults.test.ts` (F02) · `shared/src/report.ts` (F02) · `shared/tests/copy.test.ts` (F12) · `game-server/src/sim/World.ts` + `rooms/handlers.ts` + `sim/movement.ts` + `tests/{FactoryRoom,movement}.test.ts` (F03) · `game-server/src/sim/{tally,day}.ts` (F11) · `resources/js/game/{main.ts, scenes/Factory.ts, input/Keys.ts, input/intent.ts, ui/helpContent.ts}` and the two input test files (F04)
**Reads:** `docs/features/00-contracts.md` (v2.1 — binding) · `docs/01-design-doctrine.md` (the tier table, Clean Sweep) · `docs/decisions/0008-explosion-is-the-only-loss.md` · `docs/decisions/0009-depth-not-difficulty.md` (**the greed ceiling**) · `docs/decisions/0012-output-to-hands.md` · `docs/decisions/0013-solo-is-the-taster.md` · `docs/decisions/0014-two-difficulty-dials.md` · `docs/decisions/0015-forward-is-rightward.md` · `docs/17-oops-carry-and-throw.md` · `docs/features/{F04,F06,F09,F10,F11,F13,F14}` · `.ai/rules/{dynamite,shared,game-server,client,config}.md`

## Goal

**Sprinting is the game's thesis wearing a keycap.** Moving *material* faster is not moving *the line*
faster, and a factory game that says so in a tooltip has failed. So we make the player discover it with
their thumb: `Shift` while empty-handed is free speed and always correct — go stand where the line needs
you, it costs nothing. `Shift` while carrying is a loan. A heat needle beside your head fills while you
run with a load; if you keep running it hits the top, you trip, and whatever was in your hands goes
through the ordinary throw arc — into the aisle, into a teammate, onto the pile.

**The meter only starts charging once the line has already stopped flowing, and that is the entire
design.** Here is the arithmetic, with the station dwell that an earlier draft of this document left
out and got the wrong answer for. On `one-line` a haul leg is about 8 tiles (Powder's output shelf
`[6, 3]` to the Assembly jig tiles `[13, 8]`; the Assembly rack `[16, 8]` to the ramp `[22, 4]`).
Loaded sprint is `4 × 0.8 × 1.5` = **4.8 tiles/s**, empty sprint **6.0**, loaded walk **3.2**. A keg
builds at `0.34 × 1.5` = 0.51/s, so an 8-tile sprinted leg arrives at **0.85** — amber, not a trip.
Then your hands are empty for the 0.3 s put-down (`carry.putDownSeconds`), the 1.33 s empty sprint back
and the ~0.2 s pick-up: **1.83 s**, of which the first 0.4 s is the hold and the remaining 1.43 s drains
at 0.6/s. That is **−0.86**, more than the 0.85 the leg put on. Leg two starts at **zero**.

So a crew whose stations are keeping up can sprint *both* legs of every haul, forever, and it saves
them **1.50 s per round trip** over never sprinting. That is not a trap. That is the reward for a line
that flows, and it is exactly the "fun if everything is going well" the mechanic owes.

Now take the dwell away, which is what a backed-up factory does to you. The input shelf is full, so
there is no put-down — under ADR 0012 the keg is still in your hands and you are running it somewhere
else. Chain the legs with under **0.24 s** between them and the meter never gets back to zero: at no
dwell at all, leg two starts at 0.29 and tops out **84% of the way down the aisle**. You trip because
the shelf was full, which is the sentence this whole feature exists to make a player say out loud.

**Where the gamble lives, three times a shift.** The mechanic would be a tax if the only correct play
were "never sprint loaded". It is not, because the game already owns three recurring reasons to take the
risk, and the tuning is built around them:

- **The truck.** F09 docks a truck 20 s in and every 60 s after, holds it for **20 s**, and it *leaves
  regardless*; sticks still on the ramp go to the Returns pile as a Tier D haul for somebody later, and
  a Tailgate Slam ends the dwell early. The last stick with four seconds on the bay-wall countdown is a
  legible, several-times-a-shift, non-random reason to run. A stick's leash is **14.1 tiles** and the
  rack-to-ramp leg is 7 — so the truck dash is a sprint you *win*, unless you have been chain-hauling
  and arrive at the ramp already amber. That is the point: the long leash on the stick makes the truck
  run a **reward for having managed your meter**, not a coin flip.
- **The relay that has backed up.** Doctrine §5: "a full shelf leaves you standing there holding a keg".
  Under ADR 0012 that keg is in your hands whether you like it or not. Running it to the other line, to
  the floor, or back to Powder is the moment the meter was written for.
- **The lit keg.** Rare, gated behind F10, and the loudest thing in the game when it happens. §4.

**Design target:** a crew that is keeping up should see **two to four trips across a 600 s shift** and
several near-misses; a crew that has lost the line should see visibly more. Zero trips in a good shift
means the mechanic is inert; more than about eight means it is a tax. Both are playtest failures, and
both have a named dial (*Risks*).

**And the loaded sprint has an earned high, not only a punishment.** Let go of `Shift` while the needle
is in the red and you get away with it: **NOTHING HAPPENED** over your square, a `closeCalls` tick on
the report card, and the crew watching you do it. That converts "never sprint loaded" into "sprint
loaded and bail on red", which is a decision you make every single leg, is deterministic, is
choice-driven per rep exactly as ADR 0009 demands of a greed ceiling, and — the part that matters —
**makes the trap sharper for the better player instead of merely absent for the disciplined one**. An
expert visibly does something a novice cannot: they run deeper into the red and stop.

ADR 0015 makes the floor read left to right in process order, so this lands geometrically too: the
loaded run is always rightward and the free run is always back to the left. And the crewmate who shouts
**STOP** at the person sprinting a lit keg past the pile is the co-op moment this feature exists to
manufacture — which is why §6 spends a paragraph making sure that crewmate can actually *perceive* it
from inside a mini-game overlay.

**The mechanic in one paragraph, for a designer to hand to anyone.** Hold `Shift` to run at 1.5× your
current speed. With empty hands (or the broom) that is free and does nothing else. With something in
your hands a heat gauge appears beside your head and fills — fast for a keg, faster for a lit one,
slowly for a parts bundle. Let go and it holds for a beat, then drains half again as fast as it filled;
one put-down and one pick-up is enough to clear a full leg. Let go while it is in the red and you get a
**NOTHING HAPPENED**. Fill it all the way and you trip: a stumble, a *WHOA*, your hat comes off, 0.8 s
on your face, and the thing you were carrying is thrown two tiles the way you were pointing — a normal
throw in every respect, so a teammate can catch it with `E`, a keg can land on the pile as fuel, a lit
keg can go off in flight, and the Blast Bin still contains it. Nothing here is a dice roll: the gauge
is on the screen the whole time it is filling, the tile it would land on is ghosted while you are in
the red, and it is on *everyone's* screen and in everyone's ears.

## Scope

**In (M1):**
- `Shift` (held) = sprint. `movement.sprintMultiplier` folded into the one server speed formula, so the
  client's existing `PlayerState.speed` prediction keeps working with one edge correction.
- The shout migration: the four emotes move off `Shift` + arrows onto `1` `2` `3` `4`, and every place
  that teaches the old binding is updated (nine files listed in §1, plus F04's spec text).
- A deterministic fumble meter: `PlayerState.fumble` (0–1), server-owned, filled only while sprinting
  *and* moving *and* carrying an item, drained after a hold when you are not.
- Per-item-type load weighting (`carry.fumbleWeights`); a lit item is pinned to the top band from the
  moment it is picked up.
- The trip: meter bled out across the stagger, `stunnedUntil`, a bubble, `fx bonk`, and the carried item
  put through F06's **existing** `startThrow` (with `dropItem` as the nowhere-to-throw fallback). No
  forked throw.
- **The near-miss:** releasing the load out of the red without tripping. One bubble, one flourish, one
  counter. No new config key — it reuses the `fumbleCriticalAt` threshold the gauge already draws.
- Client: the heat gauge and the **RED LINE** word beside every avatar, the ghosted landing lane while
  red, a sprint dust puff, a hat-and-tumble one-shot on a trip, a proximity WebAudio tick, and the
  reconciliation correction that keeps a sprint from feeling one round-trip late.
- Two new schema fields (`sprinting`, `fumble`), one new field on `InputMsg` (`sprint`), one new system
  (`sprintSystem`, first in `SYSTEMS`, running in `lobby` as well as `running`).
- `trips` and `closeCalls` counters per player for F11's report card.
- A sprinting bumper eats the longer stagger (§7) — one line in F03's bump, no new key.

**Out (later milestones):**
- A stamina cost for empty-handed sprinting. Deliberately never: S1's whole point is that repositioning
  is free (`fumbleWeights` has no "empty" entry because there is no such case).
- **Sticky sprint (a hold-vs-toggle setting).** It is the right accessibility answer and F16 cannot
  ship it, because it would be the first `PlayerSettings` field with a path into `Connection.send`,
  which F13 forbids structurally and asserts in its test 20 (F13:159, :274). Named in *Risks* as F13's
  call, not deferred quietly.
- Sprint inside a mini-game overlay. A `press` station freezes movement (contracts §2), so the question
  does not arise; the dock is a `stand` station and sprinting across the ramp works by default.
- A separate sprint animation rig, footstep audio, or a sprint FOV/camera effect — the M1 art budget is
  squares with faces (`.ai/rules/client.md`), and the camera never scrolls (F04 §3).
- Sprinting through spills or floor items costing *extra* fumble. Tempting (sprinting through the powder
  you spilled is the joke) but it is a second multiplier stacked on a tile penalty that already scales
  your speed by `movement.spillSpeed` (**×0.6**, `defaults.ts:20`); one number per idea. Revisit after
  the playtest.
- Carrying two things (Hand Truck, M4) — `fumbleWeights` would need a sum; not M1.
- `crate` (M2) has a weight reserved so the table is complete, but no crate is ever created in M1
  (F06 Scope).
- A Groove impulse for a trip or a near-miss. Every Groove weight lives in `groove.weights`, which is
  F11's (contracts §8). Raised as an open question there rather than taken here.

**Owned by others, not F16:** the throw arc, the catch, the drop table, the jam, the spill, and the
`whoThrewThat` attribution that all three already carry (F06 — F16 calls `startThrow` and `dropItem`
and respecifies none of it); sparks, fuses, blasts and the Blast Bin (F10); the level JSON values and
`copy.json` text (F12); `schema.json`, `config/types.ts` and the §13 defaults table (F02); the avatar
body, bubble and stun wobble (F04); the report card's layout and every Groove weight (F11).

## Landing plan — four slices

The work spans roughly twenty-five files across six owners, four of them mid-flight. It is not one
pull request and pretending otherwise is how a feature stalls behind a contracts pass. Four slices,
each independently green and independently useful:

| Slice | What lands | Files | Depends on |
|---|---|---|---|
| **F16a — the shout migration** | `Shift` stops stealing the arrows; `1 2 3 4` shout. Ships alone, changes no schema and no server, and **fixes a live bug**: `helpContent.ts:22` has taught the wrong three arrows since it was written. | `input/{intent,Keys}.ts`, `main.ts`, `ui/helpContent.ts`, `__tests__/{intent,Keys}.test.ts`, `docs/RUNNING.md`, `.ai/rules/client.md`, F04's spec text | nothing |
| **F16b — server sprint, no meter** | `InputMsg.sprint`, `PlayerState.sprinting`, `movement.sprintMultiplier`, the eligibility gate, the speed factor, the client edge correction. Sprint works; nothing fumbles yet. | `messages.ts`, `PlayerState.ts`, `config/{types,defaults,schema}`, `World.ts`, `handlers.ts`, `movement.ts`, `sim/sprint.ts` ×2, `main.ts`, `Factory.ts`, plus the **five existing test files this breaks** | F16a, contracts v2.2 |
| **F16c — the meter, the trip, the near-miss** | `PlayerState.fumble`, the eight `carry.*` keys, `shared/src/sim/sprint.ts`'s pure functions, `trip`, the near-miss, `trips`/`closeCalls` through `tally.ts` → `day.ts` → `report.ts`, `copy.bubbles.{tripped,walkedItOff}` | the above plus `tally.ts`, `day.ts`, `report.ts`, `copy.json`, `copy.test.ts` | F16b |
| **F16d — the client tells** | `render/Fumble.ts`: the gauge, the bands, the RED LINE word, the ghosted landing lane, the dust, the hat-and-tumble, the near-miss flourish; `render/fumbleAudio.ts` | `render/Fumble.ts`, `render/fumbleAudio.ts`, `__tests__/Fumble.test.ts` | F16c |

F16d's audio file is the one droppable piece: if F13's owner declines a second `volume` consumer
(*Risks*), F16d ships silent and every other tell still works.

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/sprint.ts` (create) | Pure, RNG-free, clock-free: the tuning resolver, the load weight lookup, one integration step of the meter, the band, the speed factor, and the client's predicted speed. No World, no Colyseus. Imports `ItemType` from `../schema/types` (F02) and `CarryConfig`/`MovementConfig` from `../config/types` (F02); declares neither. |
| `shared/tests/sprint.test.ts` (create) | Vitest for all six, with the numbers from the table below. |
| `game-server/src/sim/sprint.ts` (create) | `sprintSystem`: eligibility gate → `player.sprinting`, meter integration, the near-miss, the trip. Calls F06's `startThrow`/`dropItem` and F03's `setBubble`. |
| `game-server/tests/sprint.test.ts` (create) | Server vitest on F03's `makeWorld({ players: 2 })`: gating, fill/drain, the near-miss, the trip and its reuse of the throw, the tally interaction, the adversarial lying-client case. |
| `resources/js/game/render/Fumble.ts` (create) | `createFumbleLayer(scene: Factory): { update(nowMs): void; destroy(): void }` — the gauge, the RED LINE word, the ghosted landing lane, the sprint dust, the hat-and-tumble, the near-miss flourish. Reads state only; changes no outcome. |
| `resources/js/game/render/fumbleAudio.ts` (create) | One `AudioContext`, one oscillator, gain from F13's `volume` and from the listener's distance to each sprinter. The only channel that survives a mini-game overlay. |
| `resources/js/game/__tests__/Fumble.test.ts` (create) | Band selection, visibility, the tumble and near-miss triggers, and a geometry assertion against the bubble box, the name label **and F06's chore bar**. |

`render/` is F04's directory but per-file ownership inside it is the established pattern
(`render/Stations.ts` is F05's, `render/Items.ts` is F06's — contracts §12), so `render/Fumble.ts` and
`render/fumbleAudio.ts` need no new rule.

### Interfaces

**Consumes**

From the contracts (§3 state): `FactoryState.{clock, phase, players, items}`;
`PlayerState.{userId, x, y, facing, moving, speed, carrying, chore, stationId, stunnedUntil, drivenOffUntil,
bubble, bubbleUntil, seq}` plus the two fields F16 adds; `ItemState.{id, type, lit}`.

From the contracts (§4 messages): `input { dx, dy, seq, sprint }` (F16 adds the field), `fx` kind `'bonk'`.
F16 registers no new message name and adds no `FxKind` — the gauge is a continuous tell and an `fx` is a
one-shot pop, so the trip reuses `bonk`, which is already "the oops kind" everywhere in F06.

From `LevelConfig` (§8, §13): `movement.{tilesPerSecond, sprintMultiplier}`, `carry.{slowdown,
fumbleBuildPerSecond, fumbleCoolPerSecond, fumbleCoolDelaySeconds, fumbleWarnAt, fumbleCriticalAt,
fumbleWeights, fumbleLitMultiplier, tripStaggerSeconds, throwTiles, throwFlightSeconds}`.
The new `carry.*` keys are **optional on the type**, matching `putDownSeconds` and `hitStaggerSeconds`
(`config/types.ts:99-100`), and are read through one resolver rather than a `??` at each site — the
same shape as `hitStaggerSeconds(world)` at `itemThrow.ts:37-39`. `movement.sprintMultiplier` is
**required**, because `MovementConfig` has no optional members and `applyDefaults` fills the whole block
by spread (`defaults.ts:71`).
From `Copy` (`@shared`): `copy.bubbles.tripped` and `copy.bubbles.walkedItOff` (F12 adds both keys).

From F03 (`game-server/src/sim/World.ts`, §10.1) — the whole surface F16 uses:

```ts
world.level: LevelConfig; world.state: FactoryState; world.layout: LayoutConfig;
world.now: number;                                   // getter, === state.clock (seconds)
world.runtime(sessionId): PlayerRuntime;             // .intent.sprint, .connected
world.stationConfig(id): StationConfig;              // joinMode, to gate a press station's operator
world.tileOf(x, y): Tile;
world.tally: RunTally;                               // bumpPlayer(userId, 'trips' | 'closeCalls')
world.fx(kind, x, y, extra?): void;
```
plus `setBubble(world, player, text, seconds)` from `game-server/src/sim/bubbles.ts` — F06's `itemDrop.ts:11`
already imports it across the same boundary, so this is an established import, not a new coupling.

From F06 (`game-server/src/sim/itemThrow.ts` and `itemDrop.ts`, §10.4):
`startThrow(world, player, sessionId): boolean` (`itemThrow.ts:76`) and
`dropItem(world, item, origin, dir, culpritId): DropOutcome` (`itemDrop.ts:102`). F16 calls both and
changes neither. `FACING_DIRS` and `landingTile` come from `shared/src/sim/items.ts:13` and `:92`.

Behaviour F16 relies on and does not re-specify:
- **F03** integrates position itself every tick from `runtime.intent` (`movement.ts:92`–`104`), writes
  `player.speed` with every multiplier applied (`movement.ts:83`), freezes a player whose
  `stunnedUntil > clock` (`movement.ts:72`–`77`), and drops `interact`/`action` while stunned (§11).
  Nothing about the trip's stagger needs new plumbing.
- **F06** takes the item out of the hands, finds the landing tile, registers the flight, offers the catch
  and runs the drop table on arrival (`itemThrow.ts:76`–`118`, `:45`–`69`, `itemDrop.ts:102`–`157`).
  A tripped keg therefore rolls, spills and jams exactly like a thrown one, and a tripped stick rolls the
  same seeded fizzle. Broom carriers never drop (F06 Behaviour § Bumps) — F16 keeps that rule.
- **F06 also already carries the blame**, which is most of the argument for reusing the throw: a
  hands-full player on the landing tile gets `copy.bubbles.whoThrewThat` and a stagger
  (`itemThrow.ts:62`–`66`), and every operator of a station the item jams gets the same bubble
  (`itemDrop.ts:50`–`63`, F06:346). F16 adds nothing to that channel and inherits all of it — see §3.
- **F10** gets landings through `hazards.onItemLanded` (`hazards.ts:491`). **That hook is not wired
  yet**: `game-server/src/sim/items.ts:217`–`219` is F06's outstanding `TODO(F10)` comment marking where
  the call goes, and `grep -rn onItemLanded --include='*.ts'` returns the definition and F06's own
  `it.todo` at `game-server/tests/items.test.ts:838` and nothing else. Everything F16 says about a
  tripped keg reaching the Blast Bin or the fuel map is true **once F06 closes that TODO**, and is
  listed as a hard prerequisite in *Risks*. F16 writes no part of it.
- **F04** renders the avatar, the bubble and the `stunnedUntil` wobble (`Avatars.ts:99`–`105`), predicts the
  own avatar from `me.speed` (F04 §6 step 1) and exposes `Factory.avatarPosition(sessionId)` in px, which
  is what F16's gauge anchors to.
- **F11** reads `world.tally` for the report; F16 bumps two new per-player counters and writes no Groove.

**Produces**

`shared/src/sim/sprint.ts` (pure; no RNG, no clock, no world):

```ts
export type FumbleBand = 'calm' | 'wobble' | 'critical';

/** The eight optional carry keys resolved against §13 once, so nothing below sees `undefined`. */
export interface FumbleTuning {
  buildPerSecond: number; coolPerSecond: number; coolDelaySeconds: number;
  warnAt: number; criticalAt: number; litMultiplier: number;
  weights: Record<ItemType, number>; tripStaggerSeconds: number;
}
export function fumbleTuning(carry: CarryConfig): FumbleTuning;

/** Per-item-type build multiplier; `lit` multiplies by `fumbleLitMultiplier`. */
export function fumbleWeightFor(type: ItemType, lit: boolean, t: FumbleTuning): number;

/** One integration step. `loaded` = sprinting AND moving AND holding a real item. Returns 0–1, clamped. */
export function fumbleStep(
  current: number, dt: number, loaded: boolean, weight: number,
  secondsSinceLoaded: number, t: FumbleTuning,
): number;

/** A lit item is pinned to `critical` from pickup — see §4. */
export function fumbleBand(value: number, lit: boolean, t: FumbleTuning): FumbleBand;

/** 1 or movement.sprintMultiplier — the one place the factor is named. */
export function sprintSpeedFactor(sprinting: boolean, movement: MovementConfig): number;

/**
 * What the client integrates this frame. `serverSpeed` is one round trip old, so the
 * edges are corrected against the server's own belief. Extracted from the scene so it
 * can be unit-tested, which is the whole reason it is here and not in `Factory.ts`.
 */
export function predictedSpeed(
  serverSpeed: number, serverSprinting: boolean, sprintHeld: boolean, movement: MovementConfig,
): number;
```

`game-server/src/sim/sprint.ts`:

```ts
export function applySprint(world: World, dt: number): void;   // the gate, the meter, the near-miss, the trip
export function trip(world: World, sessionId: string): void;   // exported for tests and for a future forced trip
export const sprintSystem: System;                             // { name: 'sprint', tick: applySprint }
```

`resources/js/game/render/Fumble.ts`:

```ts
export function createFumbleLayer(scene: Factory): { update(nowMs: number): void; destroy(): void };
```

`fx` emitted: `bonk` at the tripping player's tile centre. No new `FxKind`, no toast, no banner.

### Data & config

Every number is a named level key with a §13 default. Nothing is a magic constant, and
`shared/src/sim/constants.ts` gains nothing (contracts §13 is explicit that tunables are config).

| Key | Default | Block | Read by |
|---|---|---|---|
| `movement.sprintMultiplier` | `1.5` | `MovementConfig` (required) | F03's speed formula via `sprintSpeedFactor`; F04's prediction via `predictedSpeed` |
| `carry.fumbleBuildPerSecond` | `0.34` | `CarryConfig` (optional) | `fumbleStep` |
| `carry.fumbleCoolPerSecond` | `0.6` | `CarryConfig` (optional) | `fumbleStep` |
| `carry.fumbleCoolDelaySeconds` | `0.4` | `CarryConfig` (optional) | `fumbleStep` |
| `carry.fumbleWarnAt` | `0.4` | `CarryConfig` (optional) | `fumbleBand`, the gauge, the trip's residual |
| `carry.fumbleCriticalAt` | `0.75` | `CarryConfig` (optional) | `fumbleBand`, the gauge, the near-miss |
| `carry.fumbleLitMultiplier` | `2` | `CarryConfig` (optional) | `fumbleWeightFor` |
| `carry.fumbleWeights` | `{ keg: 1.5, casing: 0.85, stick: 1.0, crate: 1.3, parts: 0.7 }` | `CarryConfig` (optional, partial) | `fumbleWeightFor` |
| `carry.tripStaggerSeconds` | `0.8` | `CarryConfig` (optional) | `trip`, and a sprinting bumper (§7) |

`fumbleWeights` is authored partially and read totally: `Partial<Record<ItemType, number>>` on
`CarryConfig`, merged to a total `Record<ItemType, number>` by `applyDefaults` and by `fumbleTuning`.
Iterating the `ItemType` union in the test is what makes adding an item type a visible failure here
rather than a silent `undefined`; `crate` is populated and unreachable in M1.

**Where the reasoning lands.** Time to a trip is `1 / (fumbleBuildPerSecond × weight)`; distance is that
times sprint-carry speed, `tilesPerSecond × (1 − carry.slowdown) × sprintMultiplier` = `4 × 0.8 × 1.5` =
**4.8 tiles/s** on clean floor (walking with a load is 3.2, empty sprint is 6.0). The band columns are
`warnAt` and `criticalAt` converted to seconds at that fill rate, and they are listed for the lit rows
too, because omitting them is how an unreadable 0.24 s window got past an earlier draft:

| Load | weight | to trip | tiles | calm | wobble | critical |
|---|---|---|---|---|---|---|
| `parts` | 0.70 | 4.20 s | 20.2 | 1.68 s | 1.47 s | 1.05 s |
| `casing` | 0.85 | 3.46 s | 16.6 | 1.38 s | 1.21 s | 0.87 s |
| `stick` | 1.00 | 2.94 s | 14.1 | 1.18 s | 1.03 s | 0.74 s |
| `crate` (M2) | 1.30 | 2.26 s | 10.9 | 0.90 s | 0.79 s | 0.57 s |
| `keg` | 1.50 | 1.96 s | 9.4 | 0.78 s | 0.69 s | 0.49 s |
| `stick`, **lit** | 2.00 | 1.47 s | 7.1 | — | — | **all 1.47 s** |
| `keg`, **lit** | 3.00 | 0.98 s | 4.7 | — | — | **all 0.98 s** |

The two lit rows are why §4 pins a lit item to `critical` from pickup. Run the bands honestly for a lit
keg and they are 0.39 s / 0.34 s / **0.24 s** — thinner than any judged window in the game, when ADR
0009 floors OK at ±100 ms and Perfect at ±45 ms for gestures you are *staring at*, and far too thin for
a teammate to see amber, decide, press `2` and have STOP land. A band transition nobody can perceive is
not a warning; it is the appearance of one. So the lit case gets **one** state instead of three
compressed ones, held for the entire carry.

**Only two of those five loads ever cross the floor in M1**, and that is the live tuning surface. Casings
are stocked onto Assembly's own input shelf by the Jig's feeder, one per tick (`shared/src/sim/jig.ts:565`–`581`),
and a `parts` bundle is made out of nothing at the rack after 0.6 s (`shared/src/sim/jig.ts:953`–`959`) — so
both are carried a tile or two at most, and their weights exist to keep station-local shuffling unpunished
and to make `fumbleWeights` total over `ItemType` rather than partial. The keg (1.5) and the stick (1.0)
are the two numbers a designer will actually turn.

**Why `fumbleCoolPerSecond` is 0.6 and not 0.5.** It is derived, not picked. An 8-tile sprinted keg leg
arrives at 0.85. The unloaded stretch that follows is `d + 1.33` seconds (the dwell at both ends plus
the empty sprint back), of which the first 0.4 is the hold. Leg two must start at or below 0.15 to
survive, so the recovery has to clear 0.70 in `d + 0.93` seconds. At 0.5/s that needs `d ≥ 0.47 s` —
knife-edge, and a put-down alone is `carry.putDownSeconds` = 0.3. At **0.6/s** it needs `d ≥ 0.24 s`,
so **one put-down clears one leg**, which is a rule a player can feel without being told and a margin a
playtest can actually sit inside. The anti-pulsing property survives: a 1 s-on / 1 s-off mash of `Shift`
with a keg nets `+0.51 − 0.6 × 0.6` = **+0.15 per 2 s cycle**, so rhythmic pulsing still ends in a trip,
just later. A full reset from 1.0 costs 0.4 s of hold plus 1.67 s of draining. You still have to stop.

A meter that fills in under a second is a punishment and one that takes fifteen is never seen: the
shortest here is 0.98 s and only for a burning keg you should not be running with, the longest is 4.2 s,
and the one that matters — a keg — is 1.96 s, which is long enough to watch the needle go amber and choose.

Schema fields F16 writes (contracts §3 writers): `PlayerState.{sprinting, fumble}` and, at a trip or a
near-miss only, `PlayerState.{stunnedUntil, bubble, bubbleUntil}`. F16 writes no `ItemState`, no
`StationState`, no `groove`, no `score` and no `banner`.

**Where these sit against the two dials (ADR 0014, F14).** Difficulty is a transform over a validated
config, not a config block, so F16 declares ordinary level keys and the dials decide separately whether
to touch them. F14's real exclusion list is at F14:153–156 — `knots.long` / `knots.short`,
`crimp.clicks`, `movement.*`, `carry.slowdown` / `throwTiles` — and F16 asks for **two** additions:

- `movement.sprintMultiplier` — excluded, and it is the one exclusion that is written down: F14:156
  names `movement.*` outright, "walk speed is level design". Sprint speed is a throughput lever before
  it is a skill lever, so if any dial owned it, it would be Pressure — and Pressure does not own
  movement either. It stays level design.
- `carry.fumbleBuildPerSecond` — **requested**, into Dexterity's `÷ s` (rate) set alongside `bpm` and
  `dock.minigame.beepHz` (F14:135–138). It is a tempo in F14's own sense — the interval you get before
  a judged consequence — and it touches no window, so F14's load-bearing `w ≤ s` invariant is untouched.
  A `mittens` crew (`s = 1.40`) would build at 0.243/s and get **2.74 s / 13.1 tiles** with a keg
  instead of 1.96 s / 9.4; `hairTrigger` (`s = 0.80`) gets 1.57 s / 7.5.
- `carry.tripStaggerSeconds` — **also requested**, into the same table with the **`1 / s`** transform,
  and F14 already has the precedent for exactly this shape: `dock.minigame.tailgateHoldSeconds` sits in
  Dexterity with an inverted `1 / s` because "a *longer* hold is harder, not easier" (F14:139). A
  longer stagger is likewise harder, so `1 / s` shortens it for a mittens crew and lengthens it for a
  hair-trigger one. This is the recovery accommodation, and it is the field that matters most to a
  player who trips a lot.
- `fumbleWarnAt` / `fumbleCriticalAt` / `fumbleWeights` / `fumbleLitMultiplier` — **not requested**, on
  F14's own squaring argument (F14:144–152). `fumbleBuildPerSecond` is already divided by `s`; the
  weights and the lit multiplier are ratios applied on top of that rate, so scaling them too would move
  the leash by `s²` — precisely the objection F14 makes to `pour.primeKegWindowMultiplier`. And
  `warnAt`/`criticalAt` are not durations at all, they are *positions on the gauge*: moving them changes
  what green and red mean, so two crews on different settings would be reading different instruments.
  That is F14's "different mini-game" objection in its real form.
- `carry.fumbleCoolPerSecond` / `fumbleCoolDelaySeconds` — deliberately not requested even though they
  are a rate and an interval. F14's mechanical rule (multiply seconds, divide rates) points the cool
  rate the wrong way — dividing it would make an easier setting recover *slower* — so they would need
  hand-written directions, which is the per-field special-casing the dial tables exist to avoid.

Per-world private state (a module-level `WeakMap<World, SprintStore>` per contracts §14):
`SprintStore = { lastLoadedAt: Map<string, number> }` — the `clock` second each player was last building
heat, which is what `fumbleCoolDelaySeconds` measures from. Nothing outlives the room.

### Behaviour

#### 1. Inputs, and the shout migration

`Shift` cannot be both a held run modifier and an emote modifier, and `Shift` is the universal convention
for the former. Sprint takes it. The four shouts move to **`1` HELP · `2` STOP · `3` GO · `4` ?** — four
discrete keys, no modifier.

Why single keys rather than a different modifier plus arrows: today `intent.ts:40` removes the arrows from
movement intent while the modifier is held, so shouting costs you a step and a facing. The shout you most
need is **STOP**, aimed at someone sprinting past you, and you are almost certainly moving when you need
it. A modifier scheme would freeze you at exactly the wrong moment. Discrete keys never touch intent.

`1` `2` `3` `4` are provably free: the complete set of client bindings is `W A S D`, the four arrows,
`SHIFT`, `E`, `SPACE`, `ESC`, `TAB`, `ENTER`, `H`, `BACKTICK` (`Keys.ts:68`–`124`), and `OverlayKey`
(contracts §10.9) is `'left'|'right'|'up'|'down'|'space'|'interact'|'esc'` — no digit anywhere. ADR 0009
v2.2 mentions binding the Slammer's chutes to `1 2 3` "as well as" `← ↑ →`; that alias was never carried
into the contracts and does not exist in the code. If it is ever wanted, the mechanism already exists:
`OverlayKey` gains the digits and `Host` consumes them before the floor sees them, exactly as it does for
`E`, `Space` and `Esc` today (F04 §5). Ordering `1` = HELP puts the most-asked-for shout on the most
obvious key.

**Client changes** (F04's files, edits granted below):

| File · line | Today | After |
|---|---|---|
| `input/intent.ts:40` | `const arrows = !keys.shift;` | deleted — arrows always feed intent |
| `input/intent.ts:43-44` | `keys.a \|\| (arrows && keys.left)` etc. | `keys.a \|\| keys.left` etc. |
| `input/intent.ts:28-33`, `:48-50` | `EMOTES: Record<ArrowKey, EmoteKind>`, `emoteForArrow` | `EMOTES: Record<ShoutDigit, EmoteKind>` = `{ '1': 'help', '2': 'stop', '3': 'go', '4': 'what' }`, `emoteForDigit(d: ShoutDigit): EmoteKind` |
| `input/intent.ts:4-7` | doc comment about Shift stealing arrows | rewritten: Shift is sprint and takes nothing away |
| `input/intent.ts:25` | `shift: boolean` in `PressedKeys` | kept, meaning changed — it is the sprint flag now |
| `input/Keys.ts:187-204` | `arrow()` branches on `pressed.shift` | the Shift branch (`:191`–`196`) deleted; arrows go to intent or `overlayKey` as before |
| `input/Keys.ts:80-81`, `:182-185` | `shift()` sets the flag and refreshes intent | unchanged mechanically; `refreshIntent` now also emits when the sprint flag flips |
| `input/Keys.ts:206-217` | `refreshIntent` compares `dx`/`dy` only | it also tracks `pressed.shift`, so a bare `Shift` press emits `intent` and therefore sends a packet |
| `input/Keys.ts` (new) | — | four `keydown-ONE`…`FOUR` handlers emitting `emote` when `!e.repeat`; `keydown-` names for digits must be confirmed against Phaser 4 (`Phaser.Input.Keyboard.KeyCodes.ONE` is the code) before wiring |
| `input/Keys.ts` (new) | — | `get sprintHeld(): boolean` returning `this.pressed.shift` |

**Where the flag reaches the wire, and how it reaches the scene.** `sendInput` is **not** in `Factory`.
It lives in `main.ts`'s `wire()` at `resources/js/game/main.ts:108`–`117`:
`conn.send('input', { dx: keys.intent.dx, dy: keys.intent.dy, seq })` at `:112`, called from
`keys.on('intent', sendInput)` at `:116` and the 250 ms heartbeat at `:117`. `Factory` holds no `Keys`
reference at all — `grep -n 'keys\|Keys' scenes/Factory.ts` returns nothing; `main.ts:101` shares only
the mutable `keys.intent` object (`factory.intent = keys.intent`). So two lines change, both in
`main.ts`'s `sendInput`:

```ts
factory.sprintHeld = keys.sprintHeld;                                  // the mirror, beside factory.intent
conn.send('input', { dx: keys.intent.dx, dy: keys.intent.dy, seq, sprint: keys.sprintHeld });
```

`Factory` gains `sprintHeld = false` beside `intent` (`Factory.ts:124`). The mirror cannot go stale:
`sprintHeld` only changes inside `Keys.shift()`, which calls `refreshIntent`, which now emits `intent`
on a sprint flip, which calls `sendInput`. No new event, no new cadence, and the seq-rewind guard at
`handlers.ts:128` protects the sprint bit for free.

**Every place the old binding is taught — all nine are migration work:**

1. `resources/js/game/ui/helpContent.ts:22` — `['Shift + arrows', 'Shout: ↑ HELP · ↓ STOP · ← GO BACK · → ?']`.
   Replaced by `['1 2 3 4', 'Shout: 1 HELP · 2 STOP · 3 GO · 4 ?']`.
   **This row is already wrong:** `intent.ts:28-33` maps `left → stop`, `up → help`, `right → go`,
   `down → what`, so three of its four arrows have never matched the code. The migration fixes a live bug,
   which is why F16a ships first and alone.
2. `resources/js/game/ui/helpContent.ts:21` — the `['WASD / arrows', …]` row gains a sibling:
   `['Shift', 'Run. Free with empty hands. Carrying something, the gauge fills — let go on red or you trip and throw it.']`.
3. `resources/js/game/input/intent.ts:4-7` — the doc comment.
4. `resources/js/game/input/Keys.ts:191-196` — the Shift-emote branch, and the `emoteForArrow` import at `:5`.
5. `resources/js/game/__tests__/intent.test.ts:34` — *"it excludes arrows from intent while Shift is held"*
   is now false; it becomes *"it keeps arrows in intent while Shift is held"*.
6. `resources/js/game/__tests__/intent.test.ts:41` — *"it maps Shift+arrows to stop/help/go/what"* →
   *"it maps the shout digits to help/stop/go/what"*.
7. `resources/js/game/__tests__/Keys.test.ts:105`, `:118` — the two Shift-emote tests become digit tests.
8. `docs/RUNNING.md:58` — the `| `Shift` + arrows | Emotes … |` row becomes two rows (`Shift` = run, `1`–`4` = shouts).
9. `.ai/rules/client.md:13-14` — "`Shift`+arrows emotes" in the Keys bullet.

**Plus a tenth file, and F16a owns it** rather than leaving it unassigned: `docs/features/F04-client-core.md`
`:21`, `:364`, `:365`, `:374`, `:576`, `:616`, `:617`, `:652`, `:667` all describe the old scheme, and
three of the migrated tests above are written against that spec text. An earlier draft handed those lines
to "the contracts pass **or** F04's owner", which is not an owner. F16a updates them in the same commit as
the code, and F04's owner reviews rather than authors. `docs/PLAYTEST.md:60` lists controls but not the
emote binding and points people at `H`, so fixing `helpContent.ts` is what actually fixes the playtest; it
needs no edit itself.

#### 2. The fumble meter

`sprintSystem` runs **first** in `SYSTEMS`, before `movementSystem`, and in `lobby` as well as `running`
(the lobby is where people learn the key). It does four things per player, in order.

**Gate.** `player.sprinting = intent.sprint && (intent.dx !== 0 || intent.dy !== 0) && runtime.connected
&& player.chore === '' && player.stunnedUntil <= clock && player.drivenOffUntil <= clock && !atPressStation`,
where `atPressStation` is `player.stationId !== '' && world.stationConfig(player.stationId).joinMode === 'press'`
— the same condition F03's `pressed()` uses (`movement.ts:31`–`35`). Requiring a non-zero intent means the
gauge and the dust puff vanish the instant you stop, which is the tell that you have stopped paying.

**Integrate.** `loaded = player.sprinting && player.moving && carrying !== '' && carrying !== 'broom'`.
`player.moving` is the previous tick's value — sprint runs before movement, so the meter is 50 ms behind
the legs, which is invisible and keeps the whole feature in one place. The broom is excluded for the same
reason F06 excludes it from bump drops: it is not an `ItemState` and dropping it means nothing.

- `loaded` → `fumble += fumbleBuildPerSecond × fumbleWeightFor(item.type, item.lit, t) × dt`,
  and `lastLoadedAt = clock`.
- otherwise → after `clock − lastLoadedAt >= fumbleCoolDelaySeconds`,
  `fumble = max(0, fumble − fumbleCoolPerSecond × dt)`; inside the delay the needle **holds**, visibly.

The hold is what stops "mash `Shift` rhythmically" from being free — see the +0.15-per-cycle derivation
in *Data & config*. `fumble` is clamped to `[0, 1]` inside `fumbleStep`; nothing else may write it.

**The near-miss.** On the tick `loaded` goes from true to false while `player.fumble >= fumbleCriticalAt`
— you let go of `Shift`, or stopped, or the load left your hands — the server sets
`setBubble(world, player, copy.bubbles.walkedItOff, BUBBLE_SECONDS)` and bumps
`world.tally.bumpPlayer(userId, 'closeCalls')`. Once per crossing: the store keeps a per-player
`creditedCloseCall` flag cleared the moment `fumble` falls back below `fumbleCriticalAt`, so holding still
in the red does not farm it.

This is the greed ceiling ADR 0009 requires and the gauge, as originally specified, did not have. It costs
one counter and one copy key, it uses the threshold the gauge is already drawing, and it turns a meter with
two outcomes ("nothing happened" and "you tripped") into a meter with a decision on every leg. The
expression of skill is visible from across the floor and legible in one number afterwards: *how deep into
the red did you go before you let go?* Every 0.1 of meter a player is willing to hold is 0.2 s of aisle,
so the greed is real and priced. It also gives the crew something to cheer, which the loaded sprint
otherwise has nothing of — the catch has its Perfect snap, the Slammer has DEAD CENTER, the Dock has SLAM,
the hot potato has NICE SAVE, and this is the fumble meter's.

**Bands** (`fumbleBand`): `calm` below `fumbleWarnAt` (0.4), `wobble` from there to `fumbleCriticalAt`
(0.75), `critical` above — **except that a lit item is `critical` from the moment it is in your hands**,
whatever the value is (§4). The near-miss reads the *value* against `fumbleCriticalAt`, not the band, so
a lit item does not hand out a free NOTHING HAPPENED for a two-tile jog.

**Why deterministic, and how that keeps the owner's intent.** The brief said "the longer you sprint the
more likely to accidentally throw". A rising probability and a filling meter feel identical while nothing
has happened; they diverge completely at the moment it fires. A 12%-per-tick roll takes the keg out of your
hands with no warning frame, and ADR 0008 is unambiguous about why that is unacceptable: *"Random explosion
event. Players blame the game."* — and docs/17:86 says it a second time, listing "**Random fumbles.** Never. A
drop you didn't cause is the game's fault", while naming *"running while carrying"* as a legitimate fumble
source. A deterministic meter keeps every word of the owner's intent — a long sprint **is** a growing risk,
the risk **does** end in a thrown load — and adds the one thing a probability ramp cannot: the player saw
it coming and chose to keep going, so the blame lands where the doctrine wants it. It is also fairer in the
literal sense: two players who run the same distance with the same load get the same outcome, so the
mechanic is learnable, and it is the same shape as the fuse (six seconds of visible warning) that ADR 0008
already made mandatory.

**F16 introduces no stochastic element at all.** But determinism at the trigger is not enough on its own,
because the thing a player remembers is the *landing*, and the landing runs through F06's drop table where
`carry.drop.stickFizzleChance` is 0.3 and a fizzle on a fuel tile is a spark at p 1.0 (docs/17:43). A
deliberate throw is aimed by you, at a tile you looked at, at a moment you picked. A trip fires at the
moment the meter picked and throws wherever your legs were pointing — so left alone, "I sprinted three
tiles and the round exploded" reads as luck no matter how legible the gauge was. §6 closes that with the
**ghosted landing lane**: while the value is at or above `fumbleCriticalAt`, the two tiles the throw could
reach are outlined on the floor. It is ADR 0008's fuse logic applied one level down — you could see where
it was going and you kept running — and it costs no server state, no config key and no randomness.

#### 3. Tripping

At `fumble >= 1`, in this order:

1. `player.fumble = fumbleWarnAt`; `player.sprinting = false`; `lastLoadedAt` cleared so the cool delay
   does **not** apply. See "the brake", below.
2. `player.stunnedUntil = max(player.stunnedUntil, clock + tripStaggerSeconds)`.
3. `setBubble(world, player, copy.bubbles.tripped, BUBBLE_SECONDS)` and `world.fx('bonk', ...tileCentre)`.
4. `startThrow(world, player, sessionId)` — F06's, unchanged (`itemThrow.ts:76`).
5. If `player.carrying !== ''` afterwards (the throw found nowhere to land and bonked, `itemThrow.ts:88`–`92`),
   `dropItem(world, item, world.tileOf(player.x, player.y), FACING_DIRS[player.facing], sessionId)`.
6. `world.tally.bumpPlayer(player.userId, 'trips')`.

**The brake, stated as a design property rather than left to luck.** Falling behind produces Tier D work,
which puts you further behind, which is why people sprint — so the loop has to be prevented from
compounding, and doctrine is explicit that Tier D "is never fun … only the relief of it ending"
(`docs/01-design-doctrine.md:27`). Three things stop the spiral, and the first two are deliberate:

- **The trip disarms itself.** Your hands end up empty, so the meter cannot fill again until you pick
  something up, which you cannot do until the stagger ends.
- **The stagger is also the recovery.** Step 1 sets the meter to `fumbleWarnAt` (0.4) rather than to 0
  and skips the cool delay, so it drains at `fumbleCoolPerSecond` (0.6/s) and reaches empty in 0.67 s —
  inside the 0.8 s stagger. You watch the needle bleed out while you are on your face, and you stand up
  clean. Two consecutive trips are therefore no faster than the first: nothing carries over. (The
  numbers happen to line up at the current defaults; if a level retunes them the gauge is simply not
  quite empty at get-up, which is harmless. Nothing depends on the coincidence.)
- **The near-miss is the emotional brake.** A mechanic that only ever subtracts leaves a player with no
  way to feel better after a mistake. §2's NOTHING HAPPENED is the one that pays.

What F16 does **not** brake is the Tier D work the tripped item creates — the 4 s Unjam, the sweep, the
combo the operator loses. That is F06's consequence for a thrown item and it is priced there. But it is
also why the sentence an earlier draft used — *"a trip is a personal oops"* — was wrong and is deleted.
A trip is not personal. The tripper pays 0.8 s; the operator whose machine jams pays four seconds of the
least fun work in the game plus a combo reset, and a stick that fizzles on a fuel tile can cost the whole
crew the round. **The attribution that ADR 0008 demands is already there and F16 gets it by reuse, which
is one of the strongest arguments for not forking the throw:** `itemThrow.ts:62`–`66` gives a hands-full
player on the landing tile `copy.bubbles.whoThrewThat`, and `itemDrop.ts:50`–`63` gives it to every
operator of the station the item jams. So the loop closes on its own — the victim's square says WHO THREW
THAT, and two tiles away the tripper's square says WHOA, and nobody had to be told who to look at.

**No parallel stun.** `stunnedUntil` is already the universal freeze: `movement.ts:72`–`77` zeroes speed
while it is ahead of the clock, `handlers.ts` drops `interact`/`action` while it is (contracts §11), F06
cancels a chore on it, and `Avatars.ts:100`–`103` already wobbles the avatar. F16 writes the same field with
a bigger number and inherits all of it. `carry.tripStaggerSeconds` (0.8) sits deliberately above
`carry.hitStaggerSeconds` (0.5, `itemThrow.ts:37`–`39`, applied at `itemThrow.ts:64`): being hit by someone
else's throw is an interruption, tripping over your own ambition is an event. The two never compound
wrongly because both take a `max`.

**Why the throw is `startThrow` and not a variant.** Everything already true of a thrown item stays true:
the 0.5 s arc, `carry.throwTiles` (2), a teammate catching it with `E` at ±150/±75 ms, the drop table on
arrival, a keg landing on the pile as fuel, a stick's fizzle roll, the jam and its bubble, the
`whoThrewThat` on a struck player, and — once F06 closes its `TODO(F10)` — `hazards.onItemLanded` giving
F10 the Blast Bin and the lit-keg case. A second throw path would have to re-earn all of that and would drift.

Three things differ, and all three fall out of the caller rather than the callee:
- **Direction is not chosen.** `startThrow` uses `player.facing`, and movement writes `facing` from intent
  every tick (`movement.ts:103`) — so the load goes wherever your legs were pointing, straight down the
  aisle you were sprinting. That is the correct fiction, and the ghosted lane in §6 is what stops it from
  also being a surprise.
- **Distance is not chosen** — but it is the same 2 tiles. A trip is exactly as dangerous as a throw you
  meant, which is one fewer number and a cleaner lesson.
- **You are stunned at the same instant**, so unlike a deliberate throw you cannot chase it.

Step 5 exists to close a loophole. `startThrow` returns `true` and *keeps the item* when both candidate
tiles are blocked, which would make sprinting along a wall a free ride. `dropItem` is F06's stated single
path for "a bumped, uncaught or fumbled item" (`itemDrop.ts:24`–`28`), so the fallback is reuse, not a fork.
Note what `dropItem` actually promises: it places the item near you, and when `placeNear` finds nothing free
within two tiles it **destroys it** with `fx pfft` (`itemDrop.ts:143`–`149`). "You never keep it" is the
invariant; "it lands at your feet" is not.

**`trips` is a strict subset of `drops`, and that is deliberate.** Every path out of step 4 or step 5
already bumps `drops` — `itemThrow.ts:55`–`57` on the landing, and `dropItem`'s own table. F16 does not
suppress that: a trip *is* an involuntary drop, and F11 should be able to render "4 drops, 1 of them a
trip" without reconstructing anything. Suppressing it would mean editing F06's `itemThrow.ts`, which is
the wrong trade for a report line. The server test asserts both counters move together.

**No latch on the sprint key.** A player who holds `Shift` through a trip resumes sprinting the moment the
stagger ends — with an empty meter *and empty hands*, so it no longer fills. A latch would be state
nothing reads.

#### 4. Load weighting, and the lit keg

Ordering across `ItemType` (`shared/src/schema/types.ts:11`), heaviest first:
**keg (1.5) > crate (1.3) > stick (1.0) > casing (0.85) > parts (0.7)**, times `fumbleLitMultiplier` for
anything `lit`.

The ordering is not physics, it is consequence. A keg is the heaviest thing in the game *and* the single
most dangerous thing to put on the floor — ADR 0008 makes a floor keg one unit of fuel, so a dropped keg is
literally a step toward the lose condition. It gets the shortest leash. A crate (M2) is bulky but inert. A
stick is the finished product: dropping one is a 30% fizzle roll and, on a fuel tile, a certain spark, so
it sits at the reference weight of 1.0. A casing is light and cheap; the worst case is a dent, which the Jig
can still seat. A parts bundle is the lightest and the most harmless — it is an errand, and hurrying an
errand should not be punished, which is why it is effectively unlimited at 20 tiles.

**The lit rule is a band rule, not just a multiplier.** `fumbleLitMultiplier = 2` sets the leash
(a lit keg at weight 3.0 trips in **0.98 s / 4.7 tiles**), and `fumbleBand` returns `critical` for a lit
item from the instant it is picked up regardless of the value. The gauge is red for the entire carry and
the only variable is distance. That is the right shape for three reasons: the honest band durations are
0.39 / 0.34 / **0.24 s** and nobody can read a 240 ms hue change on a 4 px bar while a fuse is sparkling
in their hands; ADR 0008 requires the loss to *feel deserved*, which a warning nobody can perceive does
not achieve; and saying "this is always a bad idea and you are doing it anyway" is the actual fiction.
It also removes a state transition instead of compressing one, which is the cheaper fix.

**And the geometry says the play is real.** On `one-line` the Blast Bin is at `[1, 8]` and the Powder work
tile is `[4, 5]` — a clean open diagonal of **4.24 tiles** (the three intervening tiles `[3,6]`, `[2,7]`,
`[1,8]` are all outside the `walls` set). The leash is 4.71. **You make it with half a tile to spare, and
only if you go straight there.** That number is not tuned to be cute; it falls out of F12's layout and the
weights above, and it is exactly the shape the mechanic wants: the place kegs are made and lit is the only
place on the floor from which the bin is reachable, which is what ADR 0015's left-to-right order buys.
From the Assembly aisle the bin is fourteen tiles away and running for it is suicide.

The scene the tuning is paying for: the fuse sparkle is on the keg, the gauge beside your head is red and
saying **RED LINE** from the first step, a ghost outline is sitting on the two tiles ahead of you, the tick
in everyone's headphones is going at 4 Hz, somebody hits `2` and **STOP** appears over their square — and
you either make the bin, or you trip at four and a half tiles and a burning keg goes two more on its own.
Nothing about that needed a random number.

#### 5. Authority

**The server owns the meter, the near-miss and the trip, without exception.** `player.fumble` and
`player.sprinting` are written only in `sprintSystem`. The client never predicts the meter, never predicts
a trip, and never decides an outcome (`.ai/rules/client.md`).

**The client predicts movement only**, as it already does — F04 §6 integrates `stepPosition` at `me.speed`
every frame and reconciles against its own history. Sprint reaches `me.speed` because F03's formula
(`movement.ts:83`) gains one factor:

```ts
const sprint = sprintSpeedFactor(player.sprinting, movement);
player.speed = frozen ? 0 : movement.tilesPerSecond * carrying * sprint * world.tileSpeed(tx, ty);
```

That keeps the contracts' promise verbatim — *"`PlayerState.speed` is the effective tiles/s the server used
on its last tick with every multiplier applied"* (§2) — and F04 needs no change to its integrator.

**The disagreement, and the fix.** `me.speed` is one round trip old, so a bare read would make `Shift` feel
~100 ms late on press and ~100 ms sticky on release. F16 corrects the **edges only**, against the server's
own belief, in a pure function so it can be tested:

```ts
// shared/src/sim/sprint.ts
export function predictedSpeed(serverSpeed, serverSprinting, sprintHeld, movement) {
  const localSprint = sprintHeld && serverSpeed > 0;   // a frozen player never slides
  if (localSprint === serverSprinting) return serverSpeed;
  return localSprint ? serverSpeed * movement.sprintMultiplier
                     : serverSpeed / movement.sprintMultiplier;
}
```

Two call sites, both in `scenes/Factory.ts`'s `update()`:
`predictor.step(this.intent, delta / 1000, predictedSpeed(me.speed, me.sprinting, this.sprintHeld, movement), nowMs)`
at `Factory.ts:268`, **and the same value into the `speed` field of the `ServerSample`** at `Factory.ts:265`.
The second one matters: `OwnPrediction.snap()` replays every in-flight intent at `server.speed`
(`predict/reconcile.ts:237`–`241`, `:244`–`271`), so an uncorrected sample would replay the ~100 ms after
every snap at walking speed with `Shift` held — a visible hitch on exactly the frames a snap already makes
rough. Correcting it at the call site keeps `predict/reconcile.ts` (F04's, granted nowhere in F16)
untouched.

`serverSpeed > 0` is doing real work: when the server has frozen the player (stunned by the trip, in a
chore, at a `press` station, on the truck) the multiplier lands on zero and the client predicts a
standstill, so a held `Shift` can never make a tripped avatar slide.

**How long the correction lasts, precisely.** With input flowing it is one round trip: the server's
`sprinting` catches up on the next patch and the branch cancels itself. There is one case where it does
not, and it is worth naming rather than papering over. `movement.ts:66`–`69` zeroes `intent.dx/dy` after
`INPUT_STALE_SECONDS` but touches nothing else, so a client whose packets have stalled would keep
`sprintHeld === true` while the server holds a stale `intent.sprint` — the disagreement would persist and
the existing stale-input drift would be 50% worse. Contract change 6 adds `intent.sprint = false`
alongside the zeroed axes at that site, which makes the stale case *identical to today's*: the avatar
stops on the server, the client's prediction runs on and is nudged back. `intent.sprint` is likewise
reset on re-spawn (`World.ts:356`) so it cannot survive a disconnect and reconnect.

Everything else is the existing reconciliation. A mid-sprint disagreement — the server refuses the sprint,
or trips you, or F10 knocks you back — arrives as an ordinary position error: under `DEADBAND_TILES` it is
ignored, over it is nudged at `NUDGE`, over `SNAP_TILES` (1 tile) it snaps and clears history (F04 §6 step 4).
The worst case is a sprint the server rejected: 6 tiles/s vs 0 for one `lag` (~100 ms) is 0.6 tiles of
error — inside the snap threshold, so it resolves as a firm nudge over ~150 ms rather than a teleport.

**A lying client gains nothing, and that is the point.** The client cannot assert a speed or a position; it
sends an *intent* and the server integrates it (`movement.ts:92`–`104`). A client that sends `sprint: false`
while predicting at sprint speed locally builds no heat — and also *moves no faster*, because the server is
walking it. Its own avatar runs ahead of authority and is pulled back by the nudge every patch. The exploit
is a self-inflicted rubber band. The adversarial test asserts precisely this.

#### 6. Rendering, and making the shout possible

`createFumbleLayer(scene)` draws in a container above `layers.avatars`, updated every frame from state.

**The heat gauge.** A **vertical thermometer beside the head, not above it.** Above is taken: the speech
bubble's box bottom sits at `y = −15` with its tail reaching `−11` (`Avatars.ts:163`, `:171`–`178`:
the text is placed at `y = −20` and the box runs from `−20 − height − 5` to `−20 + 5`), and the hat
occupies `−14…−9` (`Avatars.ts:129`). A horizontal bar over the head would sit inside the bubble. So the
gauge is a **4 × 24 px vertical bar at `x = +16`, spanning `y = −14…+10`**: clear of the body (half-width
12), clear of the bubble box, clear of the name label (top edge `y ≈ 12.5` — `add.text(0, 18)` with
`setOrigin(0.5, 0.5)` and an 11 px font, `Avatars.ts:73`–`78`). It fills bottom-to-top with a 1 px dark
outline so it reads on both the floor colour and a wall. The side is fixed (never mirrored by facing) so
the crew scans for *a bar on the right of a square* rather than parsing orientation.

**Where F06's chore bar actually sits.** An earlier draft claimed the two "can never be on screen together
**by construction**", and that is false by F16's own visibility rule: the gauge is drawn while
`fumble > 0`, it *lingers while draining after you stop*, and §7 says the meter drains through a whole
chore. Sprint with a keg, stop, put it down, start a sweep, and both are on screen for up to 0.4 s of hold
plus 1.7 s of drain. So the real argument is geometric and it is checked, not asserted: the chore bar is
`x −15…+15, y −31…−25` (`render/Items.ts:23`–`25`, `:422`–`424`: `CHORE_BAR_Y = −30`, height 4, 1 px
surround) and the gauge is `x +14…+20, y −14…+10`. They do not intersect. `Fumble.test.ts`'s geometry
assertion includes that rectangle alongside the bubble box and the name label, so a future re-layout of
either breaks a test rather than a screenshot.

| Band | Fill colour | Extra |
|---|---|---|
| `calm` | `0x4cb944` | steady |
| `wobble` | `0xf2d33b` | the bar and the carried-item sprite offset shake ±1 px at 6 Hz |
| `critical` | `0xd9463d` | the whole gauge flashes at 4 Hz, gains a 1 px white outline, and the word **RED LINE** appears |

Those hexes match F04's palette (`render/palette.ts` `GROOVE_COLOURS`, `BANNER_COLOURS`) but are declared
module-locally in `Fumble.ts`: `palette.ts` is F04's file and adding entries to its `UI` object is not one
of the permitted Touches (contracts §12). Noted in *Risks*.

**RED LINE — the band gets a word.** Every dangerous or excellent moment in this game has a name you can
shout: DEAD CENTER, RATTLY, SNUG, WITHIN SPEC, NICE SAVE, WHO THREW THAT, TAILGATE. The critical band had
none, which left the crewmate who is supposed to yell STOP yelling at a colour. So `critical` renders
**RED LINE** in 9 px monospace at `x = +20, y = −14` (left-origin, top-aligned — clear of the bubble at
`y ≤ −15` and the name at `y ≥ 12.5`). It gives the shouter a target, F11 a report line, and a colourblind
player a channel that is not hue: between the fill height, the 4 Hz flash, the ±1 px shake and the word,
the three bands are separated four ways and F16 reads F13's `colourSafe` setting not at all.

These strings live in `Fumble.ts`, not in `copy.json`. They are gauge legends, in the same class as the
`BLAST BIN`, `DOCK`, `ORDERS`, `RETURNS` and `BROOM` labels F04 draws as literals in `Floor.draw`
(F04:329) — not speech. The two things a player *says* (`tripped`, `walkedItOff`) are copy keys and F12's.

**The ghosted landing lane.** While `fumble >= fumbleCriticalAt` and the player is carrying, the layer
outlines the tiles the throw could reach: `landingTile` walks from `carry.throwTiles` down to 1
(`shared/src/sim/items.ts:92`–`109`), so the reachable set is at most two tiles along `player.facing`.
Both are outlined at alpha 0.25 in the band colour, the far one solid and the near one dashed. Drawing
the whole reachable set rather than guessing which one wins is what keeps it honest — the client cannot
replicate `blockedForItems` (it does not know an item's `lit` state against a fuel tile) and a ghost that
is sometimes wrong is worse than no ghost. This is the piece that converts "it went somewhere" into "I
could see where it was going and I kept running", and it makes the aisle geometry something players read,
which is what ADR 0015's floor was built for.

**Sprint dust.** While `sprinting`, two small `'dot'` particles (F04's Boot texture) puff behind the feet at
8 Hz, tinted with the player's palette colour. This is the only tell an empty-handed sprinter gives, and it
is what makes "who is running" readable at a glance.

**Trip tumble — and the hat.** The trigger is frame-local and value-based, not patch-edged: the layer keeps
the last `fumble` it *observed* per session and fires when that was `>= fumbleCriticalAt` and the current
value is `<= fumbleWarnAt`. That is a fall of at least 0.35 in one observed step, and the drain can only
move `0.6 × dt` — 0.03 per 50 ms patch, less per frame — so it cannot false-fire while the meter merely
drains through the same range, and no patch-boundary signal is needed (`Factory.update()` keeps the only
one, `this.lastClock` at `Factory.ts:260`–`264`, and it is private). A client that joins mid-fill and one
that joins after the trip both see no tumble, which is correct: you do not get a pratfall for something
you did not witness.

The one-shot itself is 0.35 s at `scene.avatarPosition(sessionId)`, and it is a **pratfall, not a spark**.
Four `'dot'` particles scattering is what an earlier draft specified and it is the wrong picture — nothing
falls over. So: **the hat comes off.** A 20 × 5 px rect in the player's line colour (the same
`HAT_WIDTH`/`HAT_HEIGHT`/`lineColour` the avatar draws at `Avatars.ts:129`) detaches from `y = −11`,
tumbles through 540° along a short arc, lands on the floor and fades. A hat leaving a head is the universal
cartoon shorthand for a pratfall, it reads at any zoom, and F16 owns every pixel of it — no `Avatars.ts`
edit required. F04's existing `stunnedUntil` wobble (`Avatars.ts:100`–`103`) carries the rest of the
stagger and the thrown item is F06's arc.

*Optional upgrade, F04's call:* one line in `Avatars.ts` giving the container a 0.35 s spin-and-flop when
`stunnedUntil` jumps by more than `hitStaggerSeconds` would be better still. F16 does not depend on it and
does not ask for the file.

**Near-miss flourish.** On the observed transition out of the `critical` *display* band while `fumble` is
falling and the player is not stunned, the gauge does a 0.25 s squash-and-settle and RED LINE swaps to a
brief tick mark. The server has already decided (the bubble and the `closeCalls` bump are §2's); the layer
is decorating a judgement, not making one.

**Audio, and the reason it is not optional.** This feature's stated purpose is a crewmate shouting STOP,
and an earlier draft assumed that crewmate is watching the floor. In a 3-person crew two of them are
usually operating `press` stations, and F04 §5 mounts the mini-game panel at `(0, floorHeight · 2/3)`,
size `floorWidth × floorHeight / 3`, in `layers.overlay` — which is **above** `layers.avatars` and
`layers.fx` in `FactoryLayers` (`Factory.ts:39`–`46`). A sprinter in the lower third of the 28 × 18 floor
is literally occluded for them, and everywhere else they are hitting ADR 0009's ±45 ms Perfect windows and
are not scanning a 4 px bar. The one moment that most needs an ear — 0.49 s of red for a keg, 0.98 s of
red for a lit one — was specified silent.

So `render/fumbleAudio.ts`: one `AudioContext`, one oscillator, no samples. A single 660 Hz blip when any
player crosses into `wobble`, and a 4 Hz 880 Hz tick while any player is in `critical`, gain scaled by the
listener's own avatar's distance to that player and cut to zero beyond eight tiles. It reads
`PlayerState.fumble` for every player, which F16 already has, so it needs no `fx` kind and no new message.
`.ai/rules/client.md:17` permits exactly this ("WebAudio beeps behind a mute toggle") and F13's `volume`
is the toggle. It fixes the overlay operator, the colourblind player and the across-the-floor read in one
file, and it is the thing that makes the STOP shout possible at all.

It is also a **second consumer of `volume`**, and F13 currently says there is exactly one (F13:26 puts
"music and SFX beyond F07's Slammer audio" in its Out list; F13:154 names `slammerAudio.ts` as "the only
audio in M1"). That is a contract change and F13's owner's call, listed below. F13's structural test 20 —
`settingsStore` imported only by render and audio modules — passes unchanged, because `render/fumbleAudio.ts`
is a render module.

**What teammates see and hear, in order:** a dust puff (someone is running) → a green bar (carrying) → an
amber shaking bar and a blip (they are past the point where this was a good idea) → a red flashing bar,
the word RED LINE, a ghost outline on the tiles ahead of them and a 4 Hz tick (shout at them) → either
NOTHING HAPPENED, or a hat in the air and a keg flying.

#### 7. Interactions

- **`press` stations (Powder, Assembly).** Joining requires `E` with empty hands and freezes movement
  (contracts §2, §7), so you can sprint *to* the join zone and the sprint ends the tick `stationId` is set —
  the gate's `atPressStation` clause and the `frozen` speed of 0 agree. Sprinting onto a work tile is
  therefore possible and harmless: it is walking onto a tile, faster.
- **The Dock (`stand`).** Standing on a work tile *is* being at the station and arrows keep walking
  (contracts §7), so you **can** sprint across the ramp carrying a stick, and the meter builds. Tripping
  there throws the stick onto the ramp; F06's rule that a `dock` work tile does not jam still holds
  (`itemDrop.ts:32`), so the worst case is the ordinary fizzle roll. This is the truck dash from the Goal
  and it is meant to be survivable: 7 tiles of a 14.1-tile leash, unless you arrived already amber.
- **Chores** (`unjam`, `sweep`, `stomp`, `repair`). `chore !== ''` freezes movement (`movement.ts:74`) and
  the gate refuses sprint; the meter drains through the whole chore, which is more than a full reset. A
  chore is separately cancelled by `p.moving`, so there is no state where both are live.
- **The break room and the truck bay.** `drivenOffUntil > clock` gates sprint off and freezes movement
  (`movement.ts:71`). Tripping inside `layout.truckBay` is an ordinary trip; F09's departure sweep is
  unaffected, and a load thrown into the bay is destroyed by F09 exactly as a carried one would be.
- **Hazards (F10).** F16 respecifies nothing. Once F06 closes its `TODO(F10)` at
  `game-server/src/sim/items.ts:217`–`219`, a tripped keg lands through `hazards.onItemLanded` and the
  Blast Bin, the fuel map and a lit keg going off in flight all behave as they already do. A blast
  knockback sets `stunnedUntil` and F16's gate turns sprint off for its duration; the resulting position
  error exceeds `SNAP_TILES` and F04 snaps, which is already the specified behaviour for a knockback.
- **Sooted players** are cosmetic (`Avatars.ts:113`–`117`); no interaction. The gauge draws over a sooted
  body unchanged.
- **Being hit by someone else's thrown item.** `carry.hitStaggerSeconds` writes `stunnedUntil`
  (`itemThrow.ts:64`), so sprint is gated off and the meter drains; the victim **keeps** what they were
  carrying (F06 drops the *thrown* item, not the held one), so a hit interrupts a sprint without costing a
  load. If they were in the red, it also credits them a near-miss — being knocked out of a bad idea counts.
- **Bumping into someone while sprinting**, and who pays for it. `movement.ts:166`–`171` staggers both
  parties by `movement.bumpStaggerSeconds` (0.3) and F06's bump rule drops the *mover's* carried item
  through the drop table — so sprinting into a crowd loses your load without a trip. An earlier draft
  called that "a feature" and audited only the sprinter's side, which is not an analysis. Run it properly:
  an **empty-handed** sprinter has no meter, no load and nothing to lose, and can bounce off the whole
  crew at 6 tiles/s all shift; the person standing still eats 0.3 s and, if they were mid-chore, a
  cancelled chore, for doing nothing. That is punishment landing on the wrong person. So F16 prices it:
  **a bumping party who is `sprinting` takes `carry.tripStaggerSeconds` (0.8) instead of
  `movement.bumpStaggerSeconds` (0.3)**; the other party takes 0.3 as today, and if both are sprinting
  both take 0.8. One line in F03's bump (contract change 6), no new key, and it makes the aisle full of
  teammates exactly as expensive to a sprinter as the fiction says it is.
- **Solo (ADR 0013).** Level 1 and Sandbox set `players.min: 1`, and solo is the mode that decides
  whether anyone comes back with friends — so it is worth saying plainly what this mechanic is for one
  player, because every co-op justification above evaporates: nobody shouts STOP, nobody catches the
  tripped keg, nobody is to blame. What survives is the part that works alone. A solo hauler does every
  leg themselves and has *more* station dwell than a crewed one, not less — they operate the station,
  which is a 2–3 s Powder loop or the Jig's whole grid, and the meter drains through all of it — so the
  flowing-line case is the same or better. What they lose is the near-miss audience, which is exactly why
  the near-miss pays in a counter on the report card and not only in a cheer. Solo is the mode the
  `closeCalls` line was written for.
- **The `Esc` menu (F13).** F13 suppresses movement intent while its overlay is open (`main.ts`, the
  intent-suppression flag). Sprint rides `InputMsg`, so a suppressed intent of `(0, 0)` already fails F16's
  non-zero-intent gate and the meter drains while the menu is up — no extra rule, but F13 must send
  `sprint: false` alongside the zeroed intent rather than omitting the field.
- **The lobby.** `sprintSystem` runs there (`LOBBY_SYSTEMS` gains `'sprint'`), so people find `Shift` while
  milling about. Nobody is carrying anything, so no meter, no trip.
- **Day end.** `phase === 'ended'` runs no systems (contracts §11), so the meter freezes wherever it was.
  `sprintSystem` needs no `onDayEnd`; `onStart` is unnecessary because `World.startDay` re-spawns players
  and the two new fields are re-zeroed there (see the contract bullet).

## Acceptance criteria

**Sprint and the meter**
- [ ] Holding `Shift` with empty hands raises `PlayerState.speed` from `movement.tilesPerSecond` to `× movement.sprintMultiplier`, and `PlayerState.fumble` never leaves 0.
- [ ] Holding `Shift` while carrying a keg raises speed to `tilesPerSecond × (1 − carry.slowdown) × sprintMultiplier` and `fumble` rises at `fumbleBuildPerSecond × 1.5` per second.
- [ ] Releasing `Shift` holds `fumble` unchanged for `carry.fumbleCoolDelaySeconds`, then drains it at `carry.fumbleCoolPerSecond` to a floor of 0.
- [ ] A player sprinting with a keg on a clean floor trips after 1.96 s (± one tick) and 9.4 tiles; with a `parts` bundle, after 4.20 s; with a **lit** keg, after 0.98 s.
- [ ] `fumbleBand` returns `critical` for a lit item at any value, including 0.
- [ ] Sprinting with the broom, or standing still with `Shift` held, builds no heat.
- [ ] `sprinting` is false while `stunnedUntil > clock`, while `chore !== ''`, while `drivenOffUntil > clock`, at a `press` station, and whenever the movement intent is `(0, 0)`.
- [ ] Sprint works in the lobby (`LOBBY_SYSTEMS` contains `'sprint'`) and is frozen in `'ended'`.

**The decision surface**
- [ ] **The flowing cycle never trips:** an 8-tile loaded sprint, a 0.3 s put-down, an 8-tile empty sprint back and a 0.2 s pick-up, repeated ten times, never reaches `fumble === 1`.
- [ ] **The backed-up cycle does:** the same legs with zero dwell between them trip on the second leg, about 84% of the way along it.
- [ ] Releasing the load while `fumble >= carry.fumbleCriticalAt` bubbles `copy.bubbles.walkedItOff` and bumps `closeCalls` exactly once per crossing, and holding in the red does not bump it again.

**The trip**
- [ ] At a trip: `sprinting` is false, `stunnedUntil` is `carry.tripStaggerSeconds` ahead, `bubble` is `copy.bubbles.tripped`, `fx bonk` fires at the player's tile, `tally.bumpPlayer(userId, 'trips')` is bumped once — **and `drops` is bumped too**, because a trip is a drop and `trips` is a strict subset.
- [ ] `fumble` is `carry.fumbleWarnAt` immediately after the trip, drains with no cool delay, and is 0 before `stunnedUntil` is reached.
- [ ] A tripped load leaves the hands through `startThrow`: it lands two tiles along the player's facing, a teammate on the landing tile facing the tripper can catch it with `E` (`snap` at ±75 ms), and an uncaught keg follows the drop table including the knock-over and the spill.
- [ ] A player who trips facing a wall with both candidate tiles blocked **never keeps the item**: it goes through F06's drop table, which places it near them or, when nothing is free within two tiles, destroys it with `fx pfft`.
- [ ] A hands-full player struck by a tripped item gets `copy.bubbles.whoThrewThat`, and every operator of a station a tripped item jams gets it too — both through F06, with no F16 code.
- [ ] *(Behind F06's `TODO(F10)` at `items.ts:217-219`; verified once that hook is wired.)* A tripped **lit** keg landing on a `layout.blastBins` tile is consumed by F10's `onItemLanded` as a NICE SAVE, with no F16 code involved.
- [ ] A sprinting player who bumps another takes `carry.tripStaggerSeconds`; the party who was not sprinting takes `movement.bumpStaggerSeconds`.

**Input**
- [ ] `Shift` no longer removes the arrows from movement intent; walking with `Shift` held on the arrow keys works.
- [ ] A bare `Shift` press with no arrow held emits `intent` and therefore sends an `input` packet.
- [ ] `1` `2` `3` `4` send `emote` with `help` / `stop` / `go` / `what`, once per press, not on auto-repeat.
- [ ] The help panel's floor section teaches `Shift` and `1 2 3 4` and no longer mentions `Shift + arrows`; `docs/RUNNING.md`, `.ai/rules/client.md` and F04's spec text match.

**Client**
- [ ] A gauge appears beside an avatar while `fumble > 0`, green below `fumbleWarnAt`, amber to `fumbleCriticalAt`, red and flashing above it; it never overlaps the speech-bubble box, the name label **or F06's chore bar**.
- [ ] The word **RED LINE** renders in the critical band, so the three bands are distinguishable with hue removed.
- [ ] While `fumble >= fumbleCriticalAt` and carrying, the two tiles the throw could reach are outlined ahead of the player.
- [ ] A sprinting player shows a dust puff whether or not they carry anything.
- [ ] Pressing `Shift` accelerates the own avatar on the same frame, and releasing it decelerates on the same frame, with no visible snap when authority catches up — including on the frames after a `snap()`.
- [ ] A client sending `sprint: false` while predicting at sprint speed moves at **walking** speed on the server, builds no heat, and is nudged back to the server's position.

**The joke, which is a requirement and not a garnish**
- [ ] A trip produces a *visible fall*: the hat leaves the head, tumbles and lands. A reader can tell from one frame that someone went over.
- [ ] A trip produces a named bubble over the tripper (`tripped`) and, when it hits or jams someone, a named bubble over the victim (`whoThrewThat`) — both on screen at once, two tiles apart.
- [ ] A near-miss produces `walkedItOff` and the gauge flourish.
- [ ] In the two-browser pass, a player inside a mini-game overlay in the bottom third of the floor can tell that a crewmate is in the red **without seeing them**, and shouts `2` in time. This is the criterion the feature exists for; if it fails, the audio or the thresholds are wrong.

## Test plan

**Unit — `shared/tests/sprint.test.ts`** (vitest; a `CarryConfig`/`MovementConfig` fixture with the §13 defaults):

- `fumbleTuning`: "it resolves every optional carry key against LEVEL_DEFAULTS" · "it merges a partial fumbleWeights to a total record".
- `fumbleWeightFor`: "it weights a keg at 1.5 and a parts bundle at 0.7" · "it orders keg > crate > stick > casing > parts" · "it multiplies a lit item by fumbleLitMultiplier" · "it has an entry for every ItemType" (iterate the union).
- `fumbleStep`: "it adds buildPerSecond × weight × dt while loaded" · "it holds the value for coolDelaySeconds after the load stops" · "it drains at coolPerSecond once the delay has passed" · "it never goes below 0" · "it never goes above 1" · "a 1 s on / 1 s off pulse nets a rise" (the anti-pulsing assertion, ≈ +0.15 per cycle for a keg).
- `fumbleBand`: "it is calm below warnAt" · "it is wobble between warnAt and criticalAt" · "it is critical at and above criticalAt" · "it is critical at exactly 1" · **"a lit item is critical at 0"**.
- `sprintSpeedFactor`: "it is 1 when not sprinting" · "it is movement.sprintMultiplier when sprinting".
- `predictedSpeed` — the four cases, because nothing else in the suite covers the most desync-prone code
  in the feature: "it returns the server speed when the two agree" · "it multiplies on the press edge" ·
  "it divides on the release edge" · "it returns 0 when the server has frozen the player, even with Shift held".
- Timing table: "a keg trips after 1.96 s of sustained sprinting" · "a lit keg trips after 0.98 s" · "a parts bundle trips after 4.20 s" (integrate at `TICK_SECONDS`, assert within one tick).
- **The cycle assertions from the Goal**, which are the design and not an illustration: "a loaded leg, a put-down, an empty return and a pick-up leaves the meter at 0" · "the same legs chained with no dwell trip on the second".

**Unit — `game-server/tests/sprint.test.ts`** (F03's `makeWorld({ players: 2 })`; `vi.mock` on
`../src/sim/itemThrow` and `../src/sim/itemDrop` for the reuse assertions, real modules for the integration ones):

- "an empty-handed sprinter reaches tilesPerSecond × sprintMultiplier and never builds heat".
- "a carrying sprinter builds heat at the item's weight and moves at the carrying sprint speed".
- "heat holds for coolDelaySeconds after the key is released, then drains".
- "sprint is refused while stunned" · "while in a chore" · "while driven off" · "at a press station" · "with a zero intent" · "while disconnected".
- "carrying the broom builds no heat and never trips".
- "releasing in the red bubbles walkedItOff and bumps closeCalls once" · "holding in the red bumps closeCalls once, not once per tick" · "dropping below criticalAt re-arms the credit".
- "a full meter calls startThrow once with the tripping player's sessionId" (mocked).
- "a full meter with both landing tiles blocked falls back to dropItem and empties the hands" (mocked).
- "a trip sets stunnedUntil to tripStaggerSeconds ahead and never shortens an existing longer stun".
- "a trip leaves fumble at warnAt with no cool delay, and it reaches 0 before the stagger ends".
- "a trip bubbles copy.bubbles.tripped and emits fx bonk at the player's tile".
- "a trip bumps trips once **and drops once**" (the subset assertion).
- "a tripped keg thrown down an open aisle is catchable and follows the drop table" (real F06 modules).
- "a player holding sprint through a trip does not immediately rebuild heat, because their hands are empty".
- "a sprinting bumper takes tripStaggerSeconds and the stationary party takes bumpStaggerSeconds".
- "the meter freezes when the phase becomes ended" · "sprintSystem ticks in the lobby".
- "a stale input clears intent.sprint as well as the axes" (`movement.ts:66-69`).
- **Adversarial — "a client claiming it is not sprinting while moving at sprint speed gains nothing":**
  feed `input { dx: 1, dy: 0, seq, sprint: false }` for 20 ticks with a keg in hand; assert
  `player.speed === tilesPerSecond × (1 − slowdown)` on every tick, `player.fumble === 0` throughout, and
  the integrated `player.x` equal to the walking-speed integration to within `1e-9`.
- Adversarial companion — "a client sending sprint: true with a zero intent neither sprints nor builds heat".

**Unit — `resources/js/game/__tests__/Fumble.test.ts`** (vitest, F04's stub-scene helpers):

- "it hides the gauge when fumble is 0 and shows it above 0".
- "it picks green, amber and red from the configured thresholds" · "it renders RED LINE only in the critical band".
- "the gauge rectangle does not intersect the speech-bubble box, the name label or the chore bar"
  (geometry assertion against the constants in `Avatars.ts` and `Items.ts`, so a future re-layout of
  either breaks this test loudly).
- "it plays the tumble when the observed fumble falls from at-or-above criticalAt to at-or-below warnAt in one step, and not while it drains through the same range" · "a client that first observes a player after the trip plays no tumble".
- "it outlines two tiles ahead while critical and carrying, and none while calm".
- "it draws dust for a sprinting player with empty hands".

**Unit — F04's two migrated test files** (`intent.test.ts`, `Keys.test.ts`):

- "it keeps arrows in intent while Shift is held" (replacing the exclusion test at `intent.test.ts:34`).
- "it maps the shout digits to help/stop/go/what" (replacing `intent.test.ts:41`).
- "a digit press emits one emote and does not repeat while held" (replacing `Keys.test.ts:105` and `:118`).
- "Shift alone emits an intent event so the sprint flag reaches the wire".

**Repairs to five existing test files that this feature breaks** (listed as work, not discovered later):
`shared/tests/defaults.test.ts:14-21` and `:24-34` (`toEqual` on the whole `movement` object);
`shared/tests/messages.test.ts:77-78` (`isInputMsg` without `sprint` must now be `false` — the two rows
gain the field and a new row asserts a missing `sprint` is rejected); `shared/tests/copy.test.ts:76`
(`BUBBLE_KEYS` gains two); `game-server/tests/FactoryRoom.test.ts:71`, `:85`, `:95` (three `toEqual`
assertions and three dispatched payloads); `game-server/tests/movement.test.ts:42` (`intend()`'s
`runtime.intent` literal — a compile error, not a failure). F11's `day`/`report` tests may also assert
the `PlayerReport` shape; check them when contract change 5 lands.

Two files that look like they should break and do **not**, checked so nobody re-checks them:
`resources/js/game/__tests__/helpContent.test.ts` matches rows with loose regexes (`/WASD/i`, `/walk/i`)
rather than by content or count, so F16a's two changed rows pass it unchanged; and
`shared/tests/levels.test.ts` validates the shipped level JSON, none of which supplies a `movement`
block or any of the eight new `carry` keys, so every default is applied and nothing there moves.

**In-app verification** (two browsers, Level 1, `DEV_ALLOW_NO_TICKET=1`, debug overlay on):

1. Empty-handed, hold `Shift` across the floor: screenshot the debug overlay's speed reading at 6.0 and the
   dust puff, with no gauge. Then read the **client** predictor's speed on the press and release frames —
   that is the number `predictedSpeed` changes and `PlayerState.speed` does not.
2. Take a keg off the Powder shelf and sprint down the aisle: screenshot the gauge green, then amber
   (~4 tiles), then red with **RED LINE** and the ghosted lane (~8 tiles), then the trip — the hat in the
   air, the wobble, and the keg in flight.
3. **The flowing cycle:** haul kegs at real cadence — sprint out, press `E` to set down, sprint back,
   press `E` to pick up — for four full cycles. Screenshot the gauge at the start of each leg: it must
   read 0 every time and never trip. This is the "fun when it flows" claim and it is the one to disbelieve.
4. **The backed-up cycle:** fill the Assembly input shelf, then run kegs to the floor with no put-down
   between legs. Screenshot the trip on leg two. This is the thesis.
5. **The truck dash:** with a truck docked and four seconds on the bay-wall countdown, sprint the last
   stick from the rack to the ramp. Screenshot the shove landing inside the dwell. Repeat after three
   chained hauls so the meter starts amber, and screenshot whichever of the two outcomes happens.
6. **The near-miss:** sprint a keg until RED LINE, release `Shift`, screenshot `NOTHING HAPPENED` and the
   flourish, then the `closeCalls` line on the report card.
7. From browser B, stand two tiles down the aisle facing A and press `E` as A's tripped keg arrives:
   screenshot the `PERFECT` snap. The trip throw is catchable, which is the reuse working. Repeat with B
   carrying: screenshot `WHO THREW THAT` over B and `WHOA WHOA WHOA` over A in the same frame.
8. Sprint a keg into a corner so both landing tiles are walls: confirm the keg leaves the hands.
9. **The co-op moment, which is the acceptance criterion that matters.** Put browser B on a Powder work
   tile with the mini-game overlay open, and sprint A across the *bottom third* of the floor with a keg.
   B cannot see A. Confirm B hears the wobble blip and the critical tick, presses `2`, and STOP lands
   over their square before A trips. Screenshot both viewports.
10. With F10 running, light a keg at the Powder work tile and sprint the 4.24-tile diagonal to the Blast
   Bin at `[1, 8]`: screenshot the permanently-red gauge and the fuse sparkle together, then either the
   NICE SAVE or the trip. Both outcomes are acceptable evidence. *(Blocked until F06 wires
   `hazards.onItemLanded`; see Risks.)*
11. Press `H`: screenshot the updated help rows. Press `2` while walking: screenshot STOP over your own
   square without stopping.

## Tasks

**F16a — the shout migration** (no schema, no server; ships alone)
- [ ] `resources/js/game/input/intent.ts`: delete the `arrows` gate, `EMOTES` becomes digit-keyed, `emoteForArrow` → `emoteForDigit`, rewrite the doc comment (F04's file — contract change 7).
- [ ] `resources/js/game/input/Keys.ts`: delete the Shift-emote branch at `:191-196` and the `emoteForArrow` import at `:5`; add four digit handlers; add `get sprintHeld()`; `refreshIntent` tracks `pressed.shift` (F04's file — contract change 7).
- [ ] `resources/js/game/__tests__/{intent,Keys}.test.ts`: the four migrated tests (F04's files).
- [ ] `resources/js/game/ui/helpContent.ts:21-22`: the two floor rows (F04's file — coordinate with F13, which touches `HELP_HINT` and the `Esc` row in the same file).
- [ ] `docs/RUNNING.md:58`, `.ai/rules/client.md:13-14`, and `docs/features/F04-client-core.md` `:21 :364 :365 :374 :576 :616 :617 :652 :667`: the binding tables and spec text.

**F16b — server sprint, no meter**
- [ ] `shared/src/config/{types,defaults,schema}.*`: `movement.sprintMultiplier` (required, beside its four siblings) (F02 — contract change 3).
- [ ] `shared/tests/defaults.test.ts:14-21`, `:24-34`: the two `movement` `toEqual` objects gain `sprintMultiplier: 1.5` (F02's file — contract change 3).
- [ ] `shared/src/messages.ts:62`, `:104-105`: `InputMsg.sprint` and the `isInputMsg` clause (F02 — contract change 2).
- [ ] `shared/tests/messages.test.ts:77-78`: the two accepting rows gain `sprint`, plus a row asserting a missing `sprint` is rejected (F02's file — contract change 2).
- [ ] `shared/src/schema/PlayerState.ts`: `@type('boolean') sprinting = false;` (F02 — contract change 1).
- [ ] `shared/src/sim/sprint.ts`: `sprintSpeedFactor`, `predictedSpeed` + their tests; append `export * from './sim/sprint';` to `shared/src/index.ts`.
- [ ] `game-server/src/sim/World.ts`: `PlayerRuntime.intent.sprint` (type `:73`, initialiser `:274`, re-spawn reset `:356`), `LOBBY_SYSTEMS` gains `'sprint'` at `:102` (F03 — contract change 6).
- [ ] `game-server/src/rooms/handlers.ts:130`: carry `sprint` into `runtime.intent` (F03 — contract change 6).
- [ ] `game-server/src/sim/movement.ts:66-69`: `intent.sprint = false` on stale input; `:80-83`: the `sprintSpeedFactor` term; `:166-171`: the sprinting bumper's longer stagger (F03 — contract change 6).
- [ ] `game-server/tests/FactoryRoom.test.ts:71,85,95` and `game-server/tests/movement.test.ts:42`: the intent literals (F03's files — contract change 6).
- [ ] `game-server/src/sim/sprint.ts`: the store and the gate + gating tests.
- [ ] `game-server/src/sim/systems.ts`: `sprintSystem` first in `SYSTEMS`, the order comment updated + the adversarial test.
- [ ] `resources/js/game/main.ts:101,112`: the `factory.sprintHeld` mirror and `sprint` on the `input` send (F04's file — contract change 7).
- [ ] `resources/js/game/scenes/Factory.ts:124,265,268`: the `sprintHeld` field and `predictedSpeed` at both predictor call sites (F04's file — contract change 7).

**F16c — the meter, the trip, the near-miss**
- [ ] `shared/src/config/{types,defaults,schema}.*`: the eight `carry.*` keys, optional, with the schema fragment from contract change 3 (F02).
- [ ] `shared/src/schema/PlayerState.ts`: `@type('number') fumble = 0;` (F02 — contract change 1).
- [ ] `shared/src/sim/sprint.ts`: `fumbleTuning`, `fumbleWeightFor`, `fumbleStep`, `fumbleBand` + the pure tests, including the two cycle assertions.
- [ ] `game-server/src/sim/sprint.ts`: the meter, the near-miss and `trip` + their tests.
- [ ] `game-server/src/sim/tally.ts:9-16`, `:21-29`: `PlayerTallyKey` and `PLAYER_TALLY_KEYS` gain `'trips'` and `'closeCalls'` (F11's file — contract change 5).
- [ ] `game-server/src/sim/day.ts:71-87`: `playerRow` returns the two new fields (F11's file — contract change 5). They follow `drops`: per-player only, no day-level aggregation at `:149-157`.
- [ ] `shared/src/report.ts:23-36`: `PlayerReport` gains `trips` and `closeCalls` (F02's file — contract change 5).
- [ ] `config/game/copy.json` + `shared/src/copy.ts`: `bubbles.tripped` and `bubbles.walkedItOff` (F12 — contract change 8), and `shared/tests/copy.test.ts:76`'s `BUBBLE_KEYS`.

**F16d — the client tells**
- [ ] `resources/js/game/render/Fumble.ts`: the gauge, the bands, RED LINE, the ghosted lane, the dust, the hat-and-tumble, the near-miss flourish, and the `createFumbleLayer(this)` line in `Factory.create()` + `Fumble.test.ts`.
- [ ] `resources/js/game/render/fumbleAudio.ts`: the proximity tick behind F13's `volume` (contract change 9 — droppable if F13 declines).
- [ ] Run the eleven in-app verification steps, attach screenshots, tick the status boxes.

## Risks & open questions

- **The whole design sits on one number nobody has measured: station dwell.** The Goal's claim — a
  flowing line sprints both legs for free, a stalled one trips — turns on needing **0.24 s** of dwell per
  cycle at `fumbleCoolPerSecond` 0.6. A put-down alone is 0.3 s, so the margin is real but thin. If real
  playtest dwell is longer than modelled, **the trip never fires and the mechanic is inert** — a more
  likely failure than the opposite, and the one to watch for first. If it fires constantly, the honest
  read is that the crew has genuinely lost the line and the mechanic is working. Steps 3 and 4 of the
  in-app pass exist to separate those two, and they should be run before anything is tuned. The dial in
  the inert case is `carry.fumbleBuildPerSecond` up; in the punishing case it is
  `carry.fumbleCoolDelaySeconds` down before the build rate, because the hold punishes recovery rather
  than the attempt.
- **Does the trip fire at the worst possible moment for the crew that is already losing?** Almost by
  construction, yes: it fires when dwell has gone to zero, which is when the shelves are full. And its
  aftermath is Tier D — Unjam 4 s, or a sweep — which doctrine defines as having "no combo, no confetti,
  no sound reward … only the relief of it ending" (`docs/01-design-doctrine.md:27`), and which puts you
  further behind, which is why you were sprinting. §3 names three brakes; the playtest question is
  whether they are enough, or whether a trip in the Churn compounds into a death spiral that Clean Sweep
  (a *coordinated* cleanup) cannot rescue, because a tripping hauler is precisely the player who cannot
  afford to stop and sweep. Watch for a crew that trips twice in thirty seconds and never recovers. If it
  happens, the first thing to try is `tripStaggerSeconds` down, not the build rate — the recovery, not
  the trigger.
- **F06's `TODO(F10)` at `game-server/src/sim/items.ts:217-219` is a hard prerequisite** for one
  acceptance criterion and in-app step 10. `hazards.onItemLanded` exists (`hazards.ts:491`) and *nothing
  calls it*; F06 has its own `it.todo` for the wiring at `game-server/tests/items.test.ts:838`. Until it
  lands, a tripped lit keg on a Blast Bin tile is an ordinary landing. F16 writes none of that hook and
  must not be blocked on it: everything else in F16c and F16d is independent.
- **F16 cannot be green until the contracts pass grants another owner's *tests*, not just their
  sources.** Five existing test files fail or fail to compile the moment `InputMsg.sprint`,
  `movement.sprintMultiplier` and the two copy keys exist. They are listed in the Test plan and in
  contract changes 2, 3, 5 and 6, each beside the source that breaks it. A grant that covers only the
  `src/` file leaves the suite red and the slice unlandable.
- **`carry.fumbleWeights` is the only object-valued key F16 adds**, and it is authored partial and read
  total. The type is `Partial<Record<ItemType, number>>` on `CarryConfig`; the JSON schema fragment
  (contract change 3) declares all five properties, marks none `required`, and sets
  `additionalProperties: false`, matching every sibling in the `carry` block. `applyDefaults` merges by
  spread. Nothing anywhere enforces `fumbleWarnAt < fumbleCriticalAt`; that belongs in `semanticErrors`
  (`shared/src/config/validate.ts:56`) alongside the window floors, and it is requested there rather than
  left to a level author's care.
- **Sticky sprint is the right accessibility answer and F13's invariant currently forbids it.** A
  hold-vs-toggle row in F13's settings panel would remove the taped-Shift problem entirely, cost one
  boolean, and touch no number — but it would be the first `PlayerSettings` field with a path into
  `Connection.send`, which F13:159 rules out structurally and F13's test 20 asserts against the import
  graph. The invariant's *reason* is that a setting must never make the drawing disagree with the
  judgement, which sticky sprint does not do. **Open question for F13's owner:** narrow the invariant to
  "no setting may change a judged window, tempo or threshold" and let `Keys` read `stickySprint`, or keep
  it as written and defer to M2. F16 ships either way. What F16 will not do is quietly hold `Shift` for
  the player from inside its own layer to route around F13's rule.
- **`render/fumbleAudio.ts` is a second consumer of F13's `volume`**, and F13:26 lists "music and SFX
  beyond F07's Slammer audio" as Out while F13:154 calls `slammerAudio.ts` "the only audio in M1". That
  is F13's owner's call (contract change 9). If it is declined, F16d ships silent and the gauge, RED LINE
  and the ghosted lane still work — but the in-app step 9 criterion (a crewmate inside an overlay reacting
  in time) probably fails, and the honest response would be to move the mini-game panel or accept that
  the co-op moment only happens between players who are on the floor.
- **F13 and F16 both edit `resources/js/game/ui/helpContent.ts`.** F13 touches `HELP_HINT` and the `Esc`
  row; F16a touches the `WASD / arrows` and `Shift + arrows` rows. Different lines, no textual conflict,
  but they must not land in the same uncoordinated hour. Upside worth stating: F13 makes that file the
  single source for the menu's Controls panel too, so F16a's two rows teach the new bindings in both `H`
  and the `Esc` menu for free.
- **`InputMsg.sprint` is required, and a stale browser tab is a frozen avatar.** `isInputMsg` is
  shape-strict, so an old client's `input` packets would all be rejected and the player would stand still
  with no error. Accepted rather than mitigated: `shared` and `game-server` are one workspace built from
  one tree (contracts §1), and a stale tab already breaks on schema drift; the fix is a reload. Worth a
  line in `docs/RUNNING.md` if it bites anyone during the playtest.
- **Two palette hexes are duplicated.** `render/palette.ts` is F04's and adding to its `UI` object is not
  a permitted Touch, so `Fumble.ts` declares the three band colours locally. If F04 would rather own them,
  three entries in `UI` and an import is strictly better — F16 will take that trade.
- **Digit key names in Phaser 4 are unverified.** `Phaser.Input.Keyboard.KeyCodes.ONE` exists and the
  event name should be `keydown-ONE`, but `.ai/rules/dynamite.md` says to verify library APIs rather than
  remember them, and the Phaser 4 doc index is thin. Confirm against the current docs before wiring; if
  the event names differ, `addKey(KeyCodes.ONE)` with a `down` listener is the fallback and changes
  nothing else.
- **`player.moving` is one tick stale** inside `sprintSystem` because sprint runs before movement. 50 ms
  at 4.8 tiles/s is 0.24 tiles of accounting error on the meter — invisible, and the alternative
  (splitting the feature across two systems) buys nothing and costs a second entry in `SYSTEMS`.
- **Is 9.4 tiles too generous for a keg?** It clears one full leg of `one-line`, so the *first* sprinted
  haul always succeeds. That is deliberate — the trap has to be inviting before it is a trap — but it
  means the lesson lands on the second haul. It is also what makes the flowing cycle free, so raising the
  build rate to make trips more common would break the good case to fix the bad one. Tune the cool rate
  first.
- **Should a near-miss or a trip move Groove?** F16 says no on ownership grounds: every Groove impulse
  lives in `groove.weights`, which is F11's (contracts §8), and the tripped item already charges Groove
  through whatever it does on landing (a spill, a fizzle, a floor item), so a second charge would
  double-count the same act. **Open question for F11's owner:** the near-miss is the opposite case — it
  charges nothing at all, and a `closeCall` weight of +1 would be the cheapest possible way to make the
  greed ceiling pay in the shared currency rather than only in a report line. F16 recommends it and does
  not write it.
- **The layout is `one-line`, not `mvp-small`.** Every distance in this document is measured against
  `config/game/layouts/one-line.json` (28 × 18, `blastBins [[1, 8]]`, `truckBay [22, 1, 5, 3]`,
  `ramp [[22,4]…[25,4]]`). Contracts §401, F01:106, F08:301, F12:3 and `devLevel.ts:34` still say
  `mvp-small`; F15:748-750 already has that rename in hand, and F16 defers to it rather than renaming
  anything itself.

## Contract changes required

Applied later in one contracts v2.2 pass. `§` numbers are `docs/features/00-contracts.md` sections.
Slice labels say which of F16a–d each change unblocks.

1. **§3 `PlayerState`** *(F16b, F16c)* — add two fields after `combo n;`:
   `sprinting b;` (schema default `false`) and `fumble n` (0–1; schema default `0`).
   File: `shared/src/schema/PlayerState.ts` (F02) after line 26 —
   `@type('boolean') sprinting = false;` and `@type('number') fumble = 0;`.
   **Writer: F16** (`game-server/src/sim/sprint.ts`, `sprintSystem` only). Add to §3's "Writers by field
   group" a new line: `F16 — PlayerState.{sprinting fumble}, and PlayerState.{stunnedUntil bubble
   bubbleUntil} at a trip or a near-miss only`. Both fields are re-zeroed by `World.startDay`'s re-spawn
   (§10.1) — add them to the fields that reset there. Neither is listed in §3's "Schema defaults"
   exceptions (both take the plain `false` / `0`).

2. **§4 messages** *(F16b)* — `input` payload becomes
   `{ dx: -1|0|1, dy: -1|0|1, seq: number, sprint: boolean }`; the row's meaning gains "…and whether the
   run modifier is held". `export type InputMsg = { dx: Axis; dy: Axis; seq: number; sprint: boolean };`
   and `isInputMsg` gains `typeof p.sprint === 'boolean'`.
   Files: `shared/src/messages.ts:62`, `:104-105` (F02) **and `shared/tests/messages.test.ts:77-78`**
   (F02), where the two currently-accepting payloads gain `sprint` and a new row asserts that a payload
   without it is rejected. No new message name.

3. **§8 `LevelConfig`** *(F16b for the first, F16c for the rest)* — nine new keys. Files:
   `shared/src/config/types.ts` (`MovementConfig` at `:71-77`, `CarryConfig` at `:90-101`),
   `shared/src/config/schema.json`, `shared/src/config/defaults.ts` (F02), **and
   `shared/tests/defaults.test.ts:14-21`, `:24-34`** (F02), whose two `toEqual` assertions on the whole
   `movement` object break the moment a fifth key exists.

   - `movement.sprintMultiplier: number` — **required**, because `MovementConfig` has no optional members
     and `applyDefaults` fills the block by spread at `defaults.ts:71`. Add to `schema.json`'s
     `movement.properties` with `{ "type": "number", "exclusiveMinimum": 0 }`; leave its `required` array
     as it is, since no shipped level supplies a `movement` block.
   - The eight `carry.*` keys are **optional**, matching `putDownSeconds` and `hitStaggerSeconds`
     (`types.ts:99-100`), filled by `??=` in `applyDefaults` and resolved once by `fumbleTuning`:
     `fumbleBuildPerSecond?: number` · `fumbleCoolPerSecond?: number` · `fumbleCoolDelaySeconds?: number` ·
     `fumbleWarnAt?: number` · `fumbleCriticalAt?: number` · `fumbleLitMultiplier?: number` ·
     `tripStaggerSeconds?: number` · `fumbleWeights?: Partial<Record<ItemType, number>>`.

   The `schema.json` fragment, written out because every sibling in the `carry` block is
   (`additionalProperties: false` with per-key constraints), and because a builder must not have to
   invent whether the item keys are required:

   ```json
   "fumbleBuildPerSecond":   { "type": "number", "exclusiveMinimum": 0 },
   "fumbleCoolPerSecond":    { "type": "number", "exclusiveMinimum": 0 },
   "fumbleCoolDelaySeconds": { "type": "number", "minimum": 0 },
   "fumbleWarnAt":           { "type": "number", "minimum": 0, "maximum": 1 },
   "fumbleCriticalAt":       { "type": "number", "minimum": 0, "maximum": 1 },
   "fumbleLitMultiplier":    { "type": "number", "minimum": 1 },
   "tripStaggerSeconds":     { "type": "number", "minimum": 0 },
   "fumbleWeights": {
     "type": "object",
     "additionalProperties": false,
     "properties": {
       "keg":    { "type": "number", "exclusiveMinimum": 0 },
       "casing": { "type": "number", "exclusiveMinimum": 0 },
       "stick":  { "type": "number", "exclusiveMinimum": 0 },
       "crate":  { "type": "number", "exclusiveMinimum": 0 },
       "parts":  { "type": "number", "exclusiveMinimum": 0 }
     }
   }
   ```

   None of the nine joins `carry.required`. **One semantic rule**, in `semanticErrors`
   (`shared/src/config/validate.ts:56`, beside the window floors): `carry.fumbleWarnAt <
   carry.fumbleCriticalAt`, because JSON Schema cannot express an ordering between two siblings and
   nothing else in the codebase would catch a level that inverted them.

   Also amend §2's Movement paragraph: the speed formula gains `× movement.sprintMultiplier while
   PlayerState.sprinting`, and `sprinting` joins the list of things `PlayerState.speed` accounts for.

4. **§13 defaults table** *(F16b, F16c)* — nine rows:

   | Key | Default | Read by |
   |---|---|---|
   | `movement.sprintMultiplier` | `1.5` | F16, F03 movement, F04 prediction |
   | `carry.fumbleBuildPerSecond` | `0.34` | F16 |
   | `carry.fumbleCoolPerSecond` | `0.6` | F16 |
   | `carry.fumbleCoolDelaySeconds` | `0.4` | F16 |
   | `carry.fumbleWarnAt` | `0.4` | F16 |
   | `carry.fumbleCriticalAt` | `0.75` | F16 |
   | `carry.fumbleLitMultiplier` | `2` | F16 |
   | `carry.fumbleWeights` | `{ keg: 1.5, casing: 0.85, stick: 1.0, crate: 1.3, parts: 0.7 }` | F16 |
   | `carry.tripStaggerSeconds` | `0.8` | F16, F03 bump |

   `LEVEL_DEFAULTS.movement` gains `sprintMultiplier: 1.5` (filled by the existing spread at
   `defaults.ts:71`, so no new line). `applyDefaults` (`defaults.ts:66-87`) gains one `??=` line per
   `carry` scalar beside `filled.carry.putDownSeconds ??= …` at `:75`, plus
   `filled.carry.fumbleWeights = { ...LEVEL_DEFAULTS.carry.fumbleWeights, ...filled.carry.fumbleWeights };`
   — a merge rather than a `??=`, because the key is authored partially by design.

5. **§10.7 tally / §9 report — `trips` and `closeCalls`** *(F16c)*. Three files, all named, because a new
   required field on `PlayerReport` is a compile error in a place F16 does not otherwise touch:
   - `game-server/src/sim/tally.ts:9-16` — `PlayerTallyKey` gains `'trips' | 'closeCalls'`; `:21-29` —
     `PLAYER_TALLY_KEYS` gains both (F11's file).
   - `game-server/src/sim/day.ts:71-87` — `playerRow`'s returned object literal gains
     `trips: tally.trips` and `closeCalls: tally.closeCalls` (F11's file). They follow `drops` and
     `bubbles`: per-player only, **no** day-level aggregation at `:149-157`, which sums only
     `fusesStomped`, `niceSaves` and `truckRides`.
   - `shared/src/report.ts:23-36` — `PlayerReport` gains `trips: number` and `closeCalls: number` (F02's
     file).

   Tally sites: **F16** (`bumpPlayer(userId, 'trips')` once per trip, `bumpPlayer(userId, 'closeCalls')`
   once per crossing into and back out of `fumbleCriticalAt`). Add both to §10.7's "Tally sites" list.
   **Record the interaction with `drops`:** a trip always also bumps `drops`, through
   `itemThrow.ts:55-57` on the landing or through `dropItem`'s own table, so `trips` is a strict subset
   of `drops` and F11 should render it as such ("4 drops, 1 of them a trip"). F16 does not suppress the
   `drops` bump; doing so would mean editing F06's `itemThrow.ts`.

6. **§10.8 / §11 / §12 — the server edits F16 needs in F03's files** *(F16b)*. None fits the current
   definition of a Touch, so each is named for explicit grant, **including the two test files**:
   - `game-server/src/sim/World.ts:73` — `PlayerRuntime.intent` becomes
     `{ dx: Axis; dy: Axis; seq: number; sprint: boolean }`; §10.1's declaration updates to match.
   - `game-server/src/sim/World.ts:274` — the initialiser becomes `{ dx: 0, dy: 0, seq: 0, sprint: false }`.
   - `game-server/src/sim/World.ts:356` — the `startDay` reset becomes
     `{ dx: 0, dy: 0, seq: runtime.intent.seq, sprint: false }`.
   - `game-server/src/sim/World.ts:102` — `LOBBY_SYSTEMS` becomes `new Set(['sprint', 'movement', 'bubbles'])`,
     and §11's sentence "only `movementSystem` and `bubblesSystem` run while `phase === 'lobby'`" becomes
     "only `sprintSystem`, `movementSystem` and `bubblesSystem`".
   - `game-server/src/rooms/handlers.ts:130` — `runtime.intent = { dx, dy, seq, sprint: payload.sprint }`.
   - `game-server/src/sim/movement.ts:66-69` — the stale-input branch clears `intent.sprint = false`
     alongside the zeroed axes. Without this a client whose packets have stalled disagrees with the
     server indefinitely and the existing stale-input drift gets 50% worse (§5).
   - `game-server/src/sim/movement.ts:80-83` — the speed line gains
     `const sprint = sprintSpeedFactor(player.sprinting, movement);` and `* sprint`.
   - `game-server/src/sim/movement.ts:166-171` — the bump's single
     `const until = clock + movement.bumpStaggerSeconds;` becomes per-party: a party whose
     `player.sprinting` is true takes `carry.tripStaggerSeconds` instead (§7). Both still take a `max`.
   - `game-server/tests/FactoryRoom.test.ts:71`, `:85`, `:95` — three `runtime.intent` `toEqual`
     assertions and three dispatched `input` payloads gain `sprint`.
   - `game-server/tests/movement.test.ts:42` — `intend()`'s `runtime.intent` literal gains `sprint`
     (a compile error, not a test failure, once the type requires it).
   - **§11 `SYSTEMS` order** becomes
     `sprintSystem (F16) → movementSystem (F03) → bubblesSystem (F03) → stationsSystem (F05) → itemsSystem (F06) → hazardsSystem (F10) → dockSystem (F09) → grooveSystem (F11) → reportSystem (F11)`,
     with the reason recorded: the meter must be integrated and the trip fired before movement reads
     `player.sprinting`, and the trip's `startThrow` must land before `itemsSystem` advances flights.
     `game-server/src/sim/systems.ts:16` and `:23-32` update to match.

7. **§12 ownership** *(all slices)* — a new row:

   | Area | Files | Owner | Touches |
   |---|---|---|---|
   | Sprint and fumble | `shared/src/sim/sprint.ts`, `shared/tests/sprint.test.ts`, `game-server/src/sim/sprint.ts`, `game-server/tests/sprint.test.ts`, `resources/js/game/render/Fumble.ts`, `resources/js/game/render/fumbleAudio.ts`, `resources/js/game/__tests__/Fumble.test.ts` | F16 | `shared/src/index.ts` (`export * from './sim/sprint';`) · `game-server/src/sim/systems.ts` (the `sprintSystem` line) · `resources/js/game/scenes/Factory.ts` (`createFumbleLayer(this)`) |

   plus, in the F04 row's Touches column, the granted client edits — note `main.ts`, which an earlier
   draft of this document wrongly attributed to `Factory.ts`:
   `F16: input/{Keys,intent}.ts and their two test files (the Shift→sprint rebinding), ui/helpContent.ts
   (two floor rows), main.ts (the sprint flag on the input send and the factory.sprintHeld mirror),
   scenes/Factory.ts (the sprintHeld field and predictedSpeed at both predictor call sites), and
   docs/features/F04-client-core.md's nine spec lines.`

8. **§4 / §8 copy** *(F16c)* — `Copy.bubbles` gains `tripped: string` and `walkedItOff: string`; F12 owns
   the text and F16 owns the keys, so here are the lines F16 would write and F12 may overrule:
   `"tripped": "WHOA WHOA WHOA"` and `"walkedItOff": "NOTHING HAPPENED"`. The second is the joke: a
   near-miss in a game about software delivery should be reported by the person who caused it, in those
   words. Add to §8's `Copy` interface:
   `bubbles: { whatCanIDo: string; whoThrewThat: string; sawTheHighway: string; tripped: string; walkedItOff: string };`.
   Files: `config/game/copy.json`, `shared/src/copy.ts`, **and `shared/tests/copy.test.ts:76`** (F12),
   whose `BUBBLE_KEYS` list is asserted exhaustively.

9. **F13 — one line in the Out list, F13's call** *(F16d only, droppable)*. `render/fumbleAudio.ts` is a
   second consumer of `PlayerSettings.volume`, which F13:26 currently forbids and F13:154 describes as
   singular. Amend both to name F16's proximity tick, and add it to F13's settings-panel copy if the
   `volume` row mentions its consumer. F13's structural test 20 is unaffected: `fumbleAudio.ts` is a
   render module. If declined, F16d ships without the file — see *Risks*.

10. **F14 / ADR 0014 — two rows, F14's call, not the contracts pass's** *(neither blocks any slice)*.
   - Add `carry.fumbleBuildPerSecond` to F14's *"Fields divided by `s`"* table (F14:135-138), beside
     `bpm` and `dock.minigame.beepHz`.
   - Add `carry.tripStaggerSeconds` to the same table with the **`1 / s`** transform, beside
     `dock.minigame.tailgateHoldSeconds` (F14:139), which is already there on exactly this reasoning:
     a longer hold is harder, not easier. A longer stagger is likewise harder.

   Both are one line each in `applyDifficulty` (`shared/src/sim/difficulty.ts`) and F14's property test
   covers them for free. The other seven F16 keys join ADR 0014's exclusion list under the existing
   `movement.*` rule and F14:144-152's squaring rule — no new exclusion category. F16 ships identically
   whether or not this is taken; it changes only whether a `mittens` crew gets 13.1 tiles with a keg
   instead of 9.4, and a shorter time on their face afterwards.

11. **§7 join modes — one clarifying sentence** (no behaviour change): a `press` station's operator is
   never `sprinting`, because `stationId !== ''` with `joinMode === 'press'` already freezes movement;
   F16's gate mirrors the `pressed()` condition at `game-server/src/sim/movement.ts:31-35` rather than
   re-deriving it.
