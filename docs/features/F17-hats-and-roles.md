# F17 — Hats: who owns which job, and the hat still on the peg that says nobody does
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `shared/src/sim/hats.ts` · `shared/tests/hats.test.ts` · `game-server/src/sim/hats.ts` · `game-server/tests/hats.test.ts` · `resources/js/game/render/Hats.ts` · `resources/js/game/__tests__/hats.test.ts`
**Touches** (contracts §1, §12 — genuinely one line each, in another owner's file):
- **F02** — `shared/src/index.ts` (`export * from './sim/hats';`)
- **F03** — `game-server/src/rooms/handlers.ts` (one inserted line in the `interact` chain) · `game-server/src/sim/systems.ts` (one `SYSTEMS` line)
- **F04** — `resources/js/game/scenes/Factory.ts` (one `Factory.create()` mount line) · `resources/js/game/ui/helpContent.ts` (one row)
- **F12** — `config/game/copy.json` (one top-level `hats` section)

**Edits granted by the contracts pass** (larger than a Touch — every one is listed line-by-line under *Contract changes required*, with the tests that break beside the source that breaks them):
- **F02** — `shared/src/schema/PlayerState.ts` (one field) · `shared/src/report.ts` (**three interfaces**) · `shared/src/config/{types.ts,schema.json,validate.ts}` (`props.hatRack` and its adjacency rule) · `shared/tests/fixtures/layout-one-line.json`
- **F04** — `resources/js/game/render/Avatars.ts` (**four edits**, named in §5 — the only file in this doc whose owner has to say yes for the feature to exist at all)
- **F11** — `game-server/src/sim/day.ts` (**three edits, one of them a signature change**) · `game-server/tests/report.test.ts` (three added tests) · `resources/js/game/report/format.ts` (one new exported function) · `resources/js/game/scenes/Report.ts` (**one line inside the certificate-row loop and a four-line block below it**)
- **F12** — `shared/src/copy.ts` (the matching `Copy` field) · `shared/tests/copy.test.ts` (its `Object.keys(copy)` assertion at `:46` is exhaustive and will fail)
- **F15 / F03 / F01** — the seven layout sources that carry `props`: `config/game/layouts/one-line.json`, `game-server/src/config/devLevel.ts`'s `DEV_LAYOUT`, `shared/tests/fixtures/layout-one-line.json`, `game-server/tests/fixtures/{layouts,bare/layouts,broken/layouts}/one-line.json`, and `tests/Fixtures/game/layouts/one-line.json` (F01's, loaded by `tests/Pest.php:24-26`). **`hatRack` ships optional** (§3, contract change 6), so only the first two must change for the feature to exist and a lagging fixture can never break the suite.

**Reads:** `docs/features/00-contracts.md` (v2.2 — binding: §3, §4, §8, §9, §10.1, §10.2, §10.7, §11, §12, §13, §14) · `docs/decisions/0009-depth-not-difficulty.md`, `0011-scale-by-lines.md`, `0012-output-to-hands.md`, `0013-solo-is-the-taster.md`, `0014-two-difficulty-dials.md`, `0015-forward-is-rightward.md`, `0008-explosion-is-the-only-loss.md` · `docs/features/F11-day-report-grade.md` (the per-player rows this composes with) · `docs/features/F13-menu-settings-crew.md` (the crew roster, and the `role` field this must not collide with) · `docs/features/F15-legible-flow.md` (the re-laid floor the rack stands on) · `docs/features/F16-sprint-and-fumble.md` (the trip, and the hat it already throws in the air) · `docs/19-scaling-3-to-10.md` (line hats)

## Goal

Four people converge on the one job that is currently visible while the line starves two stations
upstream. Nobody chose that; it is what a crew does when the only information available is *where
the work is right now*. F17 gives the floor one more sentence it cannot say today: **who said they
would do what.** A hat rack hangs where everyone can see it, each hat names a job, taking one costs
a single keypress and no seconds, and **a hat still hanging on its peg means nobody owns that job.**
A hat enforces nothing, grants nothing and locks nothing — it is a claim, made out loud in public,
that the day report reads back at the whistle: *four people, all EXCELLENT, none of them at their
post.*

## Scope

**In (M1):**
- One schema field, `PlayerState.hat` — `''`, a station id, or the sentinel `'floor'`.
- The hat rack: one optional layout prop, drawn by F17, taken and returned with `E`, its pegs
  **derived** from `state.players` rather than stored.
- `hatsSystem`: per-player worn seconds, on-post seconds, the off-post seconds during which the
  post they named sat unstaffed with its input shelf backing up, and per-hat "somebody owned this"
  seconds — accumulated at 20 Hz while the shift runs, read from live schema, retaining nothing (§6).
- Rendering: the role hat on the avatar's existing hat rect (crown recoloured, brim keeps the line
  colour), one silhouette per hat, sooted with the body; the rack and its glyphs in world space.
- Seven new report figures, one hat chip on each existing certificate row, and a capped block of
  report lines built on them — including the one the report has never been able to say when things
  go wrong, the one it has never been able to say when they go right, and the qualifier that tells a
  crew which left its posts and cost the line nothing apart from a crew which left a shelf filling
  up behind it (§1, §6).
- The small-crew rules (ADR 0013): what the rack and the report do at one and two players.
- One `copy.hats` section.

**Out:**
- **Any mechanical effect.** No speed bonus at your own station, no penalty for leaving it, no gate
  on joining, no Groove impulse, no score term, no effect on the staffing curve. See §1 and §2 —
  this is the load-bearing exclusion, not a scope trim. (Feedback is not a mechanic: §4 gives the
  press a sound, a silhouette and a bubble, and none of them changes an outcome.)
- **Hats as items.** A hat is never an `ItemState`, never on the floor, never carried, thrown,
  stolen or knocked off. §7 argues it against ADR 0008.
- **Auto-assignment.** Joining a station never puts a hat on you. §4 argues it; it is the difference
  between a hat and a second copy of `stationId`.
- Per-line hats above six players — ADR 0011 adds a second line in M2, and `hatOrder` already
  derives from `level.stations`, so a two-line floor grows hats without a code change. The
  *rendering* of a seven-peg rack does not fit one tile and the peg letters stop being one letter;
  §2 and §3 say what M2 has to do about both, rather than claiming it is free.
- Persisting the hat in `run_players` **columns** — the whole payload is already stored as JSON; see
  *Risks*.
- Rebinding the rack off `E`; a hat cosmetic shop; per-player hat colours (ADR 0009's art budget).

## Design

### Files

| Path | Responsibility |
|---|---|
| `shared/src/sim/hats.ts` | Pure. `FLOOR_HAT`, `HAT_CHANGE_SECONDS`, `SMALL_CREW`, `HAT_LINE_CAP`, `HAT_LINE_CHARS`, `HAT_OFF_POST_MIN_SECONDS`, `HAT_BACKLOG_FULLNESS`, `hatCoverageFloor`, `hatOrder`, `nextHat`, `isOnPost`, `isBehind`, `hatLabel`, `hatPegLetter`. No clock, no RNG, no I/O (contracts §14). |
| `shared/tests/hats.test.ts` | Vitest for all of the above. |
| `game-server/src/sim/hats.ts` | `takeHat` (the `interact` link) and `hatsSystem` (the accumulator), plus `hatReportFor(world)`. Private state in a module-level `WeakMap<World, HatMetrics>` behind a lazy `hatStore(world)` accessor. |
| `game-server/tests/hats.test.ts` | Vitest over `makeWorld`, including the accounting and authority adversarial tests. |
| `resources/js/game/render/Hats.ts` | `createHatsLayer(scene)` — the world rack and its glyphs — plus `hatShape` and `HAT_COLOURS`, exported for `Avatars.ts`. |
| `resources/js/game/__tests__/hats.test.ts` | Vitest: shapes, the geometry assertion, the colour-disjointness assertion, peg derivation, `hatLines`. |
| **Modify** `shared/src/schema/PlayerState.ts` (F02) | One field after `combo`. |
| **Modify** `shared/src/report.ts` (F02) | Three interfaces. |
| **Modify** `shared/src/config/{types.ts,schema.json,validate.ts}` (F02) | `LayoutProps.hatRack?` and its 8-way adjacency rule. |
| **Modify** `game-server/src/rooms/handlers.ts` (F03) | One line in `interact`, after `stationInteract`. |
| **Modify** `game-server/src/sim/systems.ts` (F03) | One `SYSTEMS` line: `hatsSystem` before `reportSystem`. |
| **Modify** `game-server/src/sim/day.ts` (F11) | Three edits: `playerRow`'s signature, the `stations` map, the payload literal. |
| **Modify** `resources/js/game/render/Avatars.ts` (F04) | Four edits, §5. |
| **Modify** `resources/js/game/report/format.ts` + `scenes/Report.ts` (F11) | `hatLines`, one chip line in the certificate loop, one four-line block. |
| **Modify** the seven layout sources (F15/F03/F02/F01) | `props.hatRack` and one packed wall index. |
| **Modify** `config/game/copy.json` + `shared/src/copy.ts` + `shared/tests/copy.test.ts` (F12) | One `hats` section. |

### 1. The argument: the swarm is the failure, and it is currently invisible

Everyone converging on whatever work is visible while the line starves upstream is not a bug in the
crew. It is **the exact behaviour the factory allegory exists to expose**, and every level in the
book is a rehearsal of it: *Too Much Powder* is one person unable to stop, *The Bottleneck* is a
crew that cannot see where to stand, *Too Many Helpers* is four people helping at the same tile
(F12's level list, contracts §8:401). ADR 0009 built the whole mini-game doctrine around keeping the
bottleneck the prized seat so that an expert is *pulled off* Powder — which only works if somebody
notices they should be.

The game already renders a great deal about the present tense. It shows where every body is, what
each is holding, which machine is starved, how full each shelf is, where the pile is and which
beacon is red. What it has never had a way to render is the **future tense in someone's head**:
*I have got the Dock.* That sentence is what stops a swarm, and today it exists only in voice chat,
which means it does not exist at 3 a.m. with two people who have never met.

A hat makes the claim public and durable. Three consequences follow, and they are the feature:

1. **The swarm becomes legible while it is happening.** Three squares in the Assembly aisle wearing
   three different hats is a picture that reads at a glance, from across a floor that is entirely on
   screen at once (there is no camera follow or zoom — `Factory.ts:227-233` sizes the canvas to the
   whole map: 28 × `TILE_PX` = 896 px wide, 18 × 32 + 48 = 624 px tall).
2. **The hat still hanging on its peg answers "what should I do?" faster than any HUD line can.**
   Taking a hat *empties* a peg, so a bare peg means the job is owned and a hat left hanging means
   nobody has claimed it. **The unclaimed hat is the thing that draws the eye**, and every emphasis
   in §3 attaches to it. See §3, and see the readability test in §Test plan, step 47 — the claim in
   this bullet is the one thing in the doc that cannot be settled by argument.
3. **The report can finally attribute — and finally congratulate.** F11 already produces per-player
   rows with a utilization percentage and a gold star (`day.ts:71-87`, `F11:378-382`). It has never
   been able to say what those people were *supposed* to be doing, so the joke lands only at the
   factory level. With hats it can say `EVERYONE WAS BUSY. NOBODY WAS WHERE THEY SAID THEY WOULD BE.`
   and, on the day the crew nails it, `EVERY JOB HAD A NAME ON IT.` §6.

#### Off the post is not automatically off the rails

There is a way to read everything above that would make the game worse, and an earlier draft of §6
shipped it: *off-post time is drift, full stop.* It is not. A hat publishes an intention; the line
publishes a need; and when the two disagree **the line is right.** A Dock hat who walks away from an
idle dock to unstick a starving Assembly has just done the best work available to anybody on the
floor, and a report that files those minutes under the same heading as four people crowded on one
jig is not merely unkind — it is **teaching the wrong lesson**, and the lesson is *hold your post
regardless of what the line needs.* That is the rigid crew, and it is the other way this factory
fails. ADR 0009's whole argument for keeping the bottleneck the prized seat is that an expert should
be **pulled off** Powder when Powder is not the constraint; a report that punishes leaving is a
report arguing against 0009.

So the sentence F17 adds is not *you left*. It is:

> **The hat says where you meant to be. The queue behind it says what leaving cost.**

**And the obvious way to compute the second half does not work.** An earlier draft of this section
promised the *bottleneck* would judge it: F11 scores a station's pressure as
`utilization × inputShelfFullness` (`shared/src/sim/bottleneck.ts:18`), so — the reasoning went —
sample that live and you can tell whether the station somebody walked to was the one holding the
line up. **That product cannot answer the question, because both of its halves are written by where
the crew is already standing.** `StationState.utilization` has exactly one writer, `metrics.ts:189`,
and it is the share of the last rolling window the station spent in `state === 'working'`
(`metrics.ts:130`, `:140-143`). `writeState` reaches `'working'` only while a cycle is executing or
rearming — which requires operators — and reaches `'starved'` only when `ctx.operators.length > 0`
(`game-server/src/sim/stations.ts:719-739`, `:734`); a station nobody stands at falls through to
`'idle'` (`:737`). So an abandoned post decays to `utilization === 0` inside one rolling window and
its pressure is **structurally zero from then on, however full its shelf gets**. A signal that needs
a worker before it will admit a station is under pressure can only ever credit *joining a crowd*; it
is blind to a vacancy by construction. Point it at four people converging on the Jig and it reports
that they went where the pressure was — the swarm manufacturing its own justification, and the exact
sentence this feature exists to prevent. §6 works the whole case through and rejects it in full.

What survives that is smaller, and it is true. **An input shelf fills whether or not anybody is
standing there.** `inputShelf.length` and `inputCap` are exact live schema on every tick
(`shared/src/schema/StationState.ts:19`, `:21`), moved by item flow rather than by staffing, and
`StationState.workers` (`:16`) says whether anybody is on the post at all — written once a tick from
the station's own membership at `game-server/src/sim/stations.ts:671`. Neither number asks where a
player *went*. Together they answer the one question the floor can answer honestly:

> **While you were away from the job you named, did the work pile up on it with nobody there?**

That is not *was leaving right*, and §6 stops pretending the floor can see intent. It is *what did
you leave behind*, and it still tells the two identical-looking numbers apart where it matters:

- *Four minutes off the Dock, and nothing stacked up behind you.* The line did not need you there.
  The report says that and nothing more — no praise for a destination it cannot see.
- *Four minutes off the Jig while its shelf sat full and nobody was on it.* The children's soccer
  game, named out of a queue nobody was watching.

This reading is narrower than the one an earlier §1 promised, and narrow in a chosen direction: it
never credits the swarm, its silence is always the charitable reading, and on the one floor M1 ships
it can speak about exactly one station (§6, *the floors it can and cannot speak about*). **A report
that confidently praises or blames the wrong person is worse than one that stays vague**, and that
is the standard this section is held to rather than a slogan.

**This adds no mechanic.** Nothing here changes what a player may do, what it costs, or what happens
when they do it. §2's *a hat enforces nothing* is untouched: leaving your post is still free, still
allowed, still unremarked while the shift runs. All that changes is what the card may say at the
whistle about what already happened — and the honest limits of that reading are §6's problem, where
they are stated rather than assumed.

That is the case. Everything below is a consequence of it, and the three hardest sections — H2's
"enforces nothing" (§2), and "what stops it being a chore" and "why anyone presses `E` at all"
(§4) — exist because a hat that compels, or costs, or does nothing observable at all, stops being
information.

### 2. The hats, and what a hat is not

**One hat per station in the level, plus one for the floor.** In M1 that is four:

| Hat id | Peg | Name on the report | What claiming it means |
|---|---|---|---|
| `powder-a` | `P` | `STATION_LABEL.boom_powder` — BOOM POWDER | You are making powder, and you are the one who decides when to stop. |
| `assembly-a` | `A` | ASSEMBLY | The Jig is yours: pour, knots, crimp, toss. |
| `dock-a` | `D` | DOCK | Trucks are yours. If a truck leaves short, it left short on your watch. |
| `floor` | `F` | THE FLOOR | Hauling, sweeping, stomping, unjamming, tidying — every job with no machine attached. |

The ids are deliberately the **station ids**, not station types, so ADR 0011's second line in M2
produces `powder-b` / `assembly-b` hats with no change to the model. `'floor'` can never collide
with a station id, because contracts §3 fixes station ids as `<STATION_SHORT[type]>-<line>`; there
is no short code `floor`.

**The peg letter is derived, not tabulated.** Hats are ids and letters are per *type*, so the lookup
needs the level: `hatPegLetter(hat, level)` (§Interfaces) reads `level.stations` and returns
`P` / `A` / `D` / `F`. **On a two-line floor that would produce two `P` pegs**, which makes the board
ambiguous exactly where ADR 0011 says it grows for free — so `hatPegLetter` appends the line suffix
when the level has more than one line: `P1` `A1` `D1` `P2` `A2` `D2` `F`. Two-character glyphs on a
seven-peg board do not fit one 24 px tile; that is M2's rendering problem (§3, *Risks*), and the
function is written for it now so the answer is not "no change needed" when it plainly is.

**The FLOOR hat is the important one.** It is the job the game has never let anyone own, it is where
the pile forms, and it is the only hat whose wearer can be visibly idle. It is also the funniest, and
§7 says what it is made of.

#### A hat enforces nothing and grants nothing

**Anybody may do any job at any time, hatted or not.** The rules F17 does *not* add, each with the
reason it was rejected:

| Rejected | Why |
|---|---|
| A speed or efficiency bonus at the station your hat names | This is the one that looks harmless and is not. Any bonus makes wearing the right hat *optimal*, which makes it mandatory, which turns a social signal into a chore with a checklist. Worse, it would make the correct play "wear the hat for wherever you are standing" — the hat would then track `stationId`, carry no independent information, and the report line in §6 would become a tautology. |
| A penalty, slowdown or bubble for working away from your post | A good crew reallocates constantly — that is ADR 0009's whole point about pulling the expert off Powder, and F05's staffing curve already prices a crowd. Punishing the reallocation would punish the exact behaviour the game is trying to teach. |
| Blocking a station join without its hat | Kills the flexibility the game needs, and would make the rack a gate on the critical path. See §4. |
| Blocking the *taking* of a hat someone else could use better | Ownership disputes are not a mechanic anybody asked for. First to the peg. |
| A Groove impulse or score term for hat discipline | `groove` and `score` have exactly one writer each (contracts §3, §12: F11). F17 writes neither, and the moment a hat moves the bar it is no longer information. |
| **Naming a player on the report for choosing not to take one** | §2 permits going bareheaded, so the report may not punish it. A name and a number on the shared screen *is* a penalty; it just arrives through `Report.ts` instead of through the sim. §6 reports bareheadedness as a count about the crew and never as a name. |

**What "enforces nothing" does not rule out.** It rules out anything that changes an *outcome*. It
does not rule out **feedback**: a bubble, a sound and a silhouette are how a claim becomes public,
and a claim nobody can see is not a claim at all. §4 spends that budget deliberately and states its
size, because the alternative — a press that produces nothing anybody notices — is the version of
this feature that ships as scenery.

**The accountability is social and retrospective.** During the shift the hat is a picture. At the
whistle it is a line on the report card, in the game's voice, next to a gold star. That is the
entire enforcement mechanism, and ADR 0008's rule holds — the consequence is player-caused and
arrives with a name attached.

This is also the precedent the design already set. docs/19:33-34, on the line hat that is on every
avatar today: *"The assignment is a hat and a HUD label, never a lock. It exists so that 'your line'
is a thing people can say."* F17 is that sentence applied to jobs instead of lines.

### 3. The rack — a staffing board whose hung hats are the point

The rack is one wall tile with N pegs on it. **A peg holds its hat when no player in `state.players`
is wearing it, and is bare when somebody is.** The physical model is the obvious one — you take the
hat off the peg and put it on your head — and it points the right way round:

> **"The DOCK hat is still hanging there" is a single glance at a single tile.**

It is the fastest answer to *what should I do?* the game can produce, and the game currently has no
way to express it at all. `StationState` can say a station is `starved` — but starved means the
*upstream* failed, which is the opposite diagnosis. Nothing today distinguishes "the Dock is idle
because no truck is here" from "the Dock is idle because nobody has thought about it for four
minutes".

**Every emphasis in this feature therefore attaches to the hung hat, never to the bare peg.** A bare
peg is inert: somebody has that job; there is nothing to say. If a sentence anywhere in this doc or
in the code treats a bare peg as the alarm, it is a bug — that inversion was in an earlier draft and
would have shipped a board that pulsed amber on every job the crew had covered and stayed silent on
every job it had not.

#### The rack is derived, not stored

`hatsSystem` keeps no rack state and the schema gains no rack. The client builds the peg row every
frame:

```ts
const taken = new Set<string>();
state.players.forEach((p) => { if (p.hat !== '') taken.add(p.hat); });
// peg h still holds its hat  ⇔  !taken.has(h)   ← this is the one that gets the emphasis
```

Three things fall out for free and are the reason this is the right shape:

- **A hat is never lost.** A player who disconnects, is evicted by F13, or quits mid-shift takes
  their `PlayerState` with them (`FactoryRoom.onLeave` → `releaseCarried` → `onPlayerLeft` →
  `World.removePlayer`, contracts §11), so the hat is back on its peg on the next patch with no
  cleanup code.
- **No reconciliation bug is possible**, because there is nothing to reconcile.
- **The 30 s reconnect grace does the right thing without a rule.** A dropped player keeps their
  seat and therefore their hat for the grace window (contracts §13 `RECONNECT_SECONDS 30`). Their
  job is still theirs while they are reloading, and the hat returns to its peg only when the seat
  goes.

#### Where it stands

**F17 does not own layout geometry, and F15's re-lay has not landed.** So this section gives the
constraints as binding, and then gives a coordinate checked against **both** the layout on disk
today and F15's proposed one — so landing order does not change the answer and a builder is never
left with "re-pick it against something".

The tile must satisfy all five:

1. **`y <= 11` on the 18-row map.** The mini-game overlay is mounted at `(0, floorHeight × 2/3)`
   with height `floorHeight / 3` (`Host.ts:58`, `:77`) — on an 18-row floor that covers rows 12–17
   entirely. A rack down there is invisible to every station operator, which is precisely the person
   who needs to see that nobody has the Dock. This rules out the two places the fiction wants it
   most (beside the door at `(14,17)`, and in the break room at `[3,14,6,3]`).
2. **No tile in the rack's full 8-neighbourhood is a station's `workTiles`, `rackTiles`, shelf tile
   (`inputShelf.tile` / `outputShelf.tile`) or `floorRing.tiles`.** *Eight*, not four, because the
   interact geometry is 8-way: `FACING_DIRS` has all eight entries
   (`shared/src/sim/items.ts:13-21`) and `items.onInteract` computes
   `faced = here + FACING_DIRS[player.facing]` over all of them (`items.ts:546-551`), so a player
   standing **diagonally** off the rack can face it. If that diagonal tile is in a station's
   `floorRing`, `joinZoneOf` matches (`shared/src/sim/stations.ts:72-80`), `roleForTile` returns
   `'helper'` (`stations.ts:83-90`), and `stations.onInteract` calls `join()` and returns `true`
   (`game-server/src/sim/stations.ts:491-502`) — the press joins the station and never reaches
   `takeHat`, and the rack silently never responds from that tile. With the 8-way form the two `E`
   paths can never contend and §Behaviour's chain ordering needs no priority rule. The
   four-neighbour version in an earlier draft did not establish the property it claimed.
3. **A wall tile** (furniture), so nobody stands in the rack. The precedent is `props.broomHook`,
   which is in `walls` and is faced from the tile in front of it (`items.ts:512-516`).
4. **All eight neighbours are walkable floor**, so a crowd cannot block anyone out of the rack —
   and, with constraint 2, so that every tile from which the rack can be faced is a tile from which
   `takeHat` will actually run.
5. **In the open, on the first clear row below the line**, where the whole line is in the same
   glance.

**`props.hatRack: [8, 8]`, packed index `8 × 28 + 8 = 232`, appended to `walls`.** This was
brute-forced against both maps:

- **On `config/game/layouts/one-line.json` as it stands today.** Row 8's only walls are the borders
  `224` and `251`; rows 7 and 9 are clear at x 7–9 (row 7's walls are `196, 207-211, 223`; row 9's
  are `252, 279`). No station touches it: `powder-a`'s ring stops at y 6, `assembly-a`'s starts at
  x 10, `dock-a`'s starts at x 20, and the three shelf tiles are `[6,3]`, `[11,7]` and `[13,10]`.
  All eight neighbours are plain floor.
- **On F15's proposed map** (`F15:111-156`). Row 8 is `#..........................#` — entirely open —
  and row 7 is `#X.........ooRoooo.X.......#`, whose ring tiles begin at x 11. Rows 7, 8 and 9 are
  clear at x 7–9. All eight neighbours are plain floor there too.

Row 8 is the first fully open row on both maps, and `[8,8]` sits under the Powder block at the foot
of the north–south walk-through gap, so it is on the hauler's route and rows 3–7 are all above you
from it. **The earlier draft proposed `[9,8]` with `[20,8]` as a fallback, and both fail constraint 2
on the layout that exists today**: `(10,8)` is in `assembly-a`'s `floorRing` and `(20,7)` is in
`dock-a`'s. That is exactly the failure the 8-way rule and the `validateLevelOnLayout` check in
contract change 6 exist to catch at boot instead of in a playtest.

#### What it looks like

`render/Hats.ts` draws a 24 × 24 board on the tile (`PROP_PX`, matching every other prop —
`Floor.ts:19`, `:259-274`) with the pegs in a 2 × 2 grid of 11 × 11 cells in M1.

**The letter is the glyph.** An earlier draft drew each hat's silhouette on the board at 9 × 4 px;
that does not survive the arithmetic. The silhouettes in §5 live on a 20 × 8 envelope and their only
distinguishing features are a 4 × 2 bill and a 3 × 3 bobble — squeezed to 9 × 4 those become roughly
1.8 × 1 px and 1.4 × 1.5 px, sub-pixel, and three of the four glyphs collapse into the same smudge
separable only by hue. F13 ships a `colourSafe` setting; hue alone is not a channel we have. So each
cell holds only its peg letter, at **10 px** monospace — the size of the `DOCK` door label
(`Floor.ts:219`) and larger than the 8 px prop legends (`Floor.ts:272`), because this one has to be
read from across the floor:

- **Hat still hanging** — the letter **filled solid** in the hat's colour, on a 9 × 9 plate in
  `UI.outline`.
- **Hat taken** — the same letter **outline only**, 1 px stroke, in `GREY`.

Fill versus no fill survives at 2 px and survives `colourSafe`; colour is the second channel, not
the only one. The silhouettes stay on the avatars, where 20 × 6 px is enough to carry them — the
split is the right one and it is why the board can afford to be this plain.

Under the board, an 8 px `HATS` label, matching `TOOLS` / `BROOM` / `RETURNS` (`Floor.ts:260-264`).
These are legends, not speech: they stay literals in `Hats.ts`, on the precedent contracts §14 sets
and F16 §6 restates for `RED LINE`.

**Emphasis, and when it is withheld.** The hung hat is the signal, so it is the one that gets
motion: while `state.players.size > SMALL_CREW` and `phase === 'running'`, **a hanging hat's plate
pulses amber** at 1 Hz. A bare peg never pulses. Below the small-crew threshold the pulse is off
entirely — see §8. The pulse is the only animated thing on the board.

**What the rack does not show: names.** At 24 px there is no room, and it is not needed. **The rack
answers "what is unowned"; the heads answer "who owns what."** Splitting the two reads that way is
what keeps both legible.

**M2, stated rather than waved at.** Seven pegs of two-character letters do not fit a 24 px tile. A
two-line floor needs a two-tile-wide board (a 4 × 2 grid of 11 × 11 cells across 48 px), which is a
second `walls` entry and a second coordinate. That is a named M2 edit, listed in *Risks*, not a free
extension.

#### Lobby versus mid-shift

The rack is the same object in both phases and takes presses in both — `handlers.ts` gates
`interact` on the stun clock, not on `phase` (contracts §11), and `stations.onInteract` refuses
outright while `phase !== 'running'` (`stations.ts:458`), so a lobby press falls straight through to
F17. What differs is meaning and accounting:

- **Lobby.** Every hat on its peg, no pulse (nothing is starving yet), and this is the pre-shift
  huddle: you pick your hat before the whistle, in front of everyone, while people are still
  milling. No seconds accrue — `hatsSystem` is not in `LOBBY_SYSTEMS` (contracts §11) — but the
  store must already exist for the press to write `lastChangeAt`, which is why it is created by a
  lazy accessor rather than at `onStart` (§Behaviour).
- **The whistle.** `World.startDay` re-spawns every player and re-zeroes their transient fields
  (`World.ts:349-373`: position, facing, `moving`, `stunnedUntil`, `bubble`, `bubbleUntil`).
  **`hat` is deliberately not in that list and must not be added.** The hat you took in the lobby is
  the hat you start the shift wearing; resetting it would delete the huddle. This is the one
  contract line most at risk of being "tidied" — it is called out in *Contract changes* bullet 1.
  And the huddle gets a payoff: if every hat in `hatOrder` is worn when the whistle blows and the
  crew is above `SMALL_CREW`, `hatsSystem.onStart` toasts `copy.hats.whistle` —
  **"ALL HANDS. ALL HATS."** — to the room. One line, one key, and the huddle becomes a scene
  instead of a paragraph.
- **Mid-shift.** Identical rules, with the pulse live and the seconds counting.

### 4. Taking, returning, swapping, losing — and why anyone presses `E` at all

This is the section the feature lives or dies on, and it has two halves. The cost of taking a hat
must be near zero, **and** the payoff must be immediate — because the benefit of a claim accrues to
everybody else while the report line accrues to you, and a design that is all cost-avoidance and no
reward is a public-goods problem pointed the wrong way. Day one is the only day that matters:
ADR 0013 is explicit that the first thirty seconds decide whether anyone comes back with friends.

#### The cost, exactly

**One press of `E`, facing the rack tile. Zero seconds.**

- No chore, so no `chore`/`choreUntil` write and no movement freeze (`movement.ts:72-77` freezes on
  `chore !== ''`).
- No `putDownSeconds` beat — F06 charges 0.3 s of `stunnedUntil` for committing an item to the pile
  (`items.ts:478-479`), and F17 charges nothing at all.
- No hands requirement. You can take a hat while carrying a keg; §10 explains why the chain makes
  that free.
- No animation lock, no confirm, no menu, no arrow-key selector. A selector would be a second
  gesture, and ADR 0009's "one gesture" rule is the right instinct even though the rack is not a
  station.

**Which hat?** `E` **cycles**: from your current hat to the next free one in `hatOrder(level)`, and
past the last one to bareheaded. The order is the level's station order then `floor` — which on
ADR 0015's floor is left-to-right, so the cycle walks the line in process order. Taking a specific
hat costs at most `hatOrder.length + 1` presses: **five, in M1.** A server-side cooldown of
`HAT_CHANGE_SECONDS = 0.15` rate-limits the cycle (precedent: F13's one-crew-change-per-second),
so the worst case is 0.6 s of tapping.

**Defending 0.15 s and five presses.** The number to beat is the cost of the cheapest thing the
game already asks of you. Putting down a single keg costs **0.3 s of stun** — you cannot move, and
in a game where F16 measures danger in tenths of a second that is a real price. Taking *every hat in
the building*, in sequence, costs 0.6 s of keyboard and **zero seconds of stun**: you keep walking
the whole time. So the honest sentence is:

> **Cycling the entire rack costs less than setting down one keg, and unlike setting down a keg it
> never stops you moving.**

The cooldown is not a cost, it is a repeat guard: `Keys` fires `keydown-E` with the browser's
auto-repeat flag (`Keys.ts:83-86`) and the server cannot see key-up at all (F10's chore section
states this constraint), so without it a leaned-on `E` spins the rack at 20 Hz. 0.15 s is faster
than a deliberate double-tap and slower than auto-repeat. It is a code constant in
`shared/src/sim/hats.ts`, not a level key — contracts §14's "config over code" is about numbers a
*designer* would tune, and this is in the same class as `MAX_INPUT_BACKDATE_S` (§13).

#### The payoff, exactly — and it is a bit, not a bonus

Near-zero cost is necessary and not sufficient. Work the first thirty seconds honestly: if pressing
`E` produced only a silent field change, nothing I or anybody else notices happens, and the only
asymmetry in the design points at *not* pressing it. So press `E` at the rack and three things
happen at once, none of which changes an outcome:

1. **`world.fx('clink', rackX + 0.5, rackY + 0.5)`** — an existing `FxKind`
   (`shared/src/messages.ts:57`), so no new kind and no client `fx` work. It fires on **every**
   press, including the transient ones inside a cycle.
2. **Your silhouette changes on your own head**, visible to everyone (§5).
3. **When the hat settles, `setBubble(world, player, fill(copy.hats.claimed, { hat }),
   EMOTE_BUBBLE_SECONDS)`** — *"DOCK IS MINE"*, for two seconds
   (`game-server/src/sim/bubbles.ts:12`, `:15`). This is the announcement, and it is what makes the
   claim actually public rather than theoretically public. Without it the Goal's "a claim, made in
   public" is a sentence the feature never delivers on: the fifth person at a full rack got a bubble
   and the person who did the right thing got nothing.

"When it settles" is load-bearing, and it is what makes the transient hats of a cycle harmless. A
press that lands on a hat you immediately cycle past should not announce anything or spend a
once-per-shift toast. So `takeHat` writes the hat and records `lastChangeAt`, and the **bubble and
the paper-hat toast are fired from `hatsSystem.tick`** once a player's hat has been unchanged for
longer than `HAT_CHANGE_SECONDS`. Consequences that follow and are tested:

- Cycling *through* `floor` on the way to `dock-a` never toasts `copy.hats.paperHat` for a hat you
  did not keep.
- Cycling through three hats produces one bubble, for the one you stopped on.
- **Bubble spam at six players is bounded by the cooldown, not by luck:** one bubble per settled
  hat, and a hat only settles when you stop pressing. A crew all changing hats at once produces at
  most one bubble each.
- The clinks are **not** suppressed, and that is deliberate — **cycling the rack is the bit.** One
  person, in front of everybody, flickering through four silhouettes and four clinks in half a
  second before landing on the paper hat, is the funniest picture this feature has, and it costs
  nothing because each transient hat holds for a full `HAT_CHANGE_SECONDS` — long enough to see.
  Do not "fix" the rapid cycle into a silent rate-limit edge case; it is hat-juggling.

**Why this does not violate §2.** A bubble, a sound and a shape change no speed, no window, no
staffing weight, no groove, no score and no eligibility. They are the difference between a claim and
a private thought, which is the entire subject of the feature.

#### Returning is forgettable, and that is the design

There is no return step to remember. Three things end a hat, and none of them is a task:

1. **Cycling past the last peg** puts you bareheaded. One press.
2. **Taking another hat** returns the first in the same press. You can only wear one; see below.
3. **Leaving.** Disconnect, eviction, quitting — the hat is back on its peg because the seat is gone
   (§3).

**A hat never returned costs nothing, ever.** No timeout, no nag, no toast, no penalty. The only
consequence of wearing the DOCK hat all shift while never going near the Dock is what the report
does *not* say about you (§6). This is deliberate and it is the same reasoning as §2: the moment
forgetting to return a hat has a cost, returning it becomes a chore, and a chore at the end of every
shift is exactly the thing that makes people stop using a system.

#### One hat at a time

Taking a second hat returns the first. Rejected: wearing a stack.

A stack of four hats is funny for one screenshot and then the rack is lying — every peg bare, one
person "owning" everything, and the report's on-post arithmetic ambiguous (at your post for which
hat?). Worse, it hands one player the ability to strip the board, which turns a shared signal into
something one person can vandalise. The joke survives anyway, in the place it belongs: **solo**,
where one player genuinely does wear every hat in the building and the report says so (§8).

#### When every hat is taken — and the degenerate toggle above four players

Two things happen once the crew is as large as the rack, and both are worth writing down because an
earlier draft predicted the opposite of one of them.

**A bareheaded presser at a full rack.** `nextHat` returns `''` when nothing is free, so the press
is a no-op — and a silent no-op is a bug report. The server sets the presser's bubble to
`copy.hats.allTaken` (**"EVERY HAT IS SPOKEN FOR"**) through F03's `setBubble`. That sentence is the
whole of *Too Many Helpers* said out loud by the game, at the moment the fifth person walks up to
the rack looking for something to own.

It fires **at most once per player per shift** (`allTakenTold: Set<string>` in the store, cleared in
`onStart`). A single fixed string fired thirty times in eight minutes is a buzzer, not a joke; once
per person is a punchline, and the second press is a silent consumed no-op.

It is also gated on the rack having been **continuously full for at least `HAT_CHANGE_SECONDS`**
(`rackFullSince` in the store, maintained in `tick`). Without that gate, a player pressing inside the
0.15 s window while somebody else is mid-cycle would be told the rack is full when it is about to
free a hat.

**A *hatted* player at a full rack is a two-state toggle, not a cycle.** With crew ≥ hats every other
hat is in `taken`, so `nextHat` from your own hat can only reach `''` and back. Pressing `E` at six
players therefore flips you between your hat and bareheaded, and `copy.hats.allTaken` never fires
for you at all, because step 6 requires `player.hat === ''`. This is correct behaviour and it is
milder than the earlier draft's prediction that `allTaken` would "fire a lot": it fires at most once
each, for the players who never got a hat. Described here and tested (test 16) so nobody reads the
toggle as a bug.

#### No auto-assignment, and why that is the crux

The obvious "free" version of this feature is: joining a station puts its hat on your head, and
leaving takes it off. It is rejected, and the reason is the point of the whole doc.

**An auto-assigned hat is a rendering of `stationId`.** It would be true by construction that your
hat matches where you are standing, `onPostSeconds` would always equal `hatSeconds`, and the report
line in §6 would read "100%" for everyone forever. Every gram of value here comes from the hat being
a claim that *can* diverge from the truth — from the fact that you said Dock and then spent eleven
minutes at the Jig because the Jig was where the noise was. Contracts §3 already gives the client
`PlayerState.stationId` and F13's roster already renders it (`F13:232`); a second field that agrees
with it always would be a bandwidth cost and an information gain of zero (H7). The bandwidth cost of
the field we *are* adding is stated with a number in §Data & config, and it is close enough to zero
to end the argument in the other direction too.

So: **the hat is only ever set by a player pressing `E` at the rack.** Nothing else writes it.

### 5. Rendering — building on the hat that is already there

#### The avatar already wears a hat, and in M1 it says nothing

`AvatarView` draws a 20 × 5 px rect above the body in the player's *line* colour
(`Avatars.ts:17-18` `HAT_WIDTH`/`HAT_HEIGHT`, `:82` `this.hat = lineColour(line)`, `:128-129` the
fill at `y = −half − 2`, i.e. spanning −14…−9). `lineColour` returns red for line `a` and blue for
line `b` (`palette.ts:15`), and **ADR 0011 keeps M1 at one line** — so today every avatar in the
game wears the same red hat and it carries exactly zero bits. In M2 it carries one.

F17 does not add a second hat. It **fills the empty channel in the one that exists** and leaves the
line channel intact for M2:

| | Rect | Colour |
|---|---|---|
| **Brim** | 20 × 2 at y −11…−9 (the bottom of the existing rect) | `lineColour(player.line)` — unchanged, and this is what stays meaningful on a two-line floor |
| **Crown** | 20 × 3 at y −14…−11 (the top of the existing rect) | the hat's colour, or `lineColour` when `hat === ''` |
| **Silhouette** | up to 20 × 6 above, y −17…−11 | the hat's shape (below); nothing at all when `hat === ''` |

A bareheaded avatar therefore paints **byte-identically to today**: brim and crown are both
`lineColour` and the silhouette is empty. That is the compatibility guarantee, and it is asserted.

#### The silhouettes

Colour alone is not enough — three of four hats would be a 3 px band of hue, and F13 ships a
`colourSafe` setting for a reason. Each hat gets a shape, on a fixed orientation (never mirrored by
`facing`, on F16's reasoning for its gauge: the crew scans for a shape, not an orientation).

| Hat | Shape on the 20 × 8 envelope | Colour | Reads as |
|---|---|---|---|
| `powder-a` | **hard hat** — a 12 × 3 dome centred on the crown, y −17…−14 | `0xff6b35` | the person operating the dangerous machine |
| `assembly-a` | **flat cap** — a 14 × 3 crown offset 3 px right, with a 4 × 2 bill at x +7…+11, y −13…−11 | `0x7b5ea7` | the craftsperson |
| `dock-a` | **bobble hat** — a 16 × 3 crown with a 3 × 3 bobble centred above it at y −17…−14 | `0x00a5cf` | outdoors, cold, loading trucks |
| `floor` | **paper hat** — a trapezoid 20 wide at the base tapering to 6 wide over 5 px, y −16…−11 | `0xf3ead7` (paper, the report card's own colour — `Report.ts:26`) | folded, temporary, made of something else |

**The hexes are chosen to be disjoint from every palette that already means something**, and that is
a rule rather than a preference. An earlier draft used `0x2b6fd6` for `dock-a`, which *is*
`LINE_COLOURS.b` (`palette.ts:15`) — so on M2's two-line floor a dock crown would have been line-b
blue sitting on a line-b brim, defeating the whole argument above about keeping the line channel
readable. It used `0x4cb944` for `assembly-a`, which is `PLAYER_PALETTE[3]` *and*
`GROOVE_COLOURS.groove` (`palette.ts:12`, `:19`), so the green player would have worn a green crown
on a green body. And it used `0xf5c542`, which is `GROOVE_COLOURS.onFire` and `UI.beaconGold`
(`palette.ts:18`, `:57`).

The rule, asserted in `resources/js/game/__tests__/hats.test.ts`: **no `HAT_COLOURS` value equals any
entry of `LINE_COLOURS`, `PLAYER_PALETTE` or `GROOVE_COLOURS`, and every pair of hat colours differs
by at least 48 in at least one channel.** F04 may repick the hexes; the test is what has to keep
passing. They are declared module-locally in `render/Hats.ts` and are **not** added to `palette.ts`'s
`UI` object: that is F04's file and adding entries is not a permitted Touch (contracts §12) — F16 §6
hit the same wall and made the same call.

**Geometry checks, asserted rather than eyeballed.** The envelope is x −10…+10, y −17…−9. It does
not intersect:
- F16's fumble gauge at x +14…+20, y −14…+10 (`F16:730-760`),
- F06's chore bar at x −15…+15, y −31…−25 (`render/Items.ts:25` `CHORE_BAR_Y`, `:422`),
- the name label, whose top edge is y ≈ 12.5 (`Avatars.ts:73`, an 11 px font at y 18 with origin
  0.5).

It **does** overlap the speech bubble, whose box bottom is at y −15 and whose tail reaches −11
(`Avatars.ts:168-178`). That overlap already exists today between the bubble and the hat, the bubble
is added to the container after the body (`Avatars.ts:145-155`) so it draws on top, and a bubble
lasts `BUBBLE_SECONDS`. Accepted, and stated so nobody "fixes" it — note that §4's `claimed` bubble
lands on exactly this spot, which is the right place for it: it covers the hat it is announcing for
two seconds and then reveals it.

#### Soot

`sooted` already swaps body and outline (`Avatars.ts:113-131`). The hat joins it: while
`player.sooted`, the crown and silhouette paint `SOOT_BODY` with a 1 px outline in the hat's colour,
so **you can still tell whose job it was** — which is the funnier and more useful outcome than a
uniformly black square. The brim keeps today's behaviour.

#### The four edits in `Avatars.ts` (F04's file — named for explicit grant)

`AvatarView` repaints only when its cache key changes (`Avatars.ts:90-94`), which is why the hat
cannot simply be drawn from another layer without either repainting every frame or drifting.

1. `:90` — the key becomes `` `${Math.round(pose.facing)}|${player.sooted ? 1 : 0}|${player.hat}` ``.
2. `:94` — `this.paint(pose.facing, player.sooted, player.hat)`.
3. `:113` — the signature gains `hat: string`.
4. `:128-129` — the single `fillRect` becomes the brim/crown pair plus
   `for (const r of hatShape(hat)) this.body.fillRect(...)`, where `hatShape` and `HAT_COLOURS` are
   imported from F17's **`render/Hats.ts`** — capital H, matching the Owns line, the Files table and
   §Produces; case-sensitive CI fails on anything else. `Avatars.ts` gains one import and stays
   dumb: it does not know what a hat means, only which rectangles to fill.

**Why this is an `Avatars.ts` edit and F16's tumbling hat was not.** F16 draws its hat in its own
layer because it is a 0.35 s detached object with its own arc (`F16:790-806`). F17's hat rides a
head that bobs (`Avatars.ts:99`), wobbles under stun (`:100-103`), sorts by y against every other
avatar (`Avatars.ts:236`) and vanishes on a truck ride (`:88`). Re-implementing all four from an
overlay to avoid a four-line edit would be the wrong trade and would drift the first time any of
them changed.

#### Client-local, and never predicted

`render/Hats.ts` owns the rack container (mounted from `Factory.create()`, the one line contracts
§12 already grants F05/F06/F10 and now F17) and exports `hatShape` / `HAT_COLOURS` for `Avatars.ts`.
It reads `state.players` and `conn.config.level.stations` and writes nothing.

### 6. The report card — where the accountability actually lands

F11's report already runs the two-column joke: INDIVIDUAL PERFORMANCE hands out gold stars while
FACTORY PERFORMANCE says DISASTER (`F11:13-16`, `:375-393`). Hats sharpen it, because the left
column can now be specific about what each gold star was *for*.

#### What the report will not do

**It will not print a per-player fidelity percentage.** An earlier draft printed
*"DAVE wore the DOCK hat and spent 4% of the shift at it"* for every player, in a block ordered by
utilization descending. That is a different kind of number from F11's. F11's is a *productivity*
number and everybody gets a gold star anyway — the joke is that the factory failed regardless. A
fidelity number measures **whether you kept your word**, and a name plus a bare number inside a
ranking is not neutral: the ranking supplies the adjective. Printing one per player turns the report
into a leaderboard of broken promises and invites four people to turn and ask one person what he was
doing. §7.7 states the principle the good lines follow — they *"accuse everybody at once by naming
nobody"* — and a ranked column of named percentages violates it. Note also that sorting by
utilization while printing fidelity hands the *busiest* player the most damning line, at the top.

So the rule is: **the only per-player number is a compliment, and there is exactly one of it.**
Everything else is either about the crew, or about a job.

**That rule is about what is printed, not about what is computed**, and the distinction matters now
that one of the seven figures is a per-player judgement of what somebody left behind.
`offPostBackedUpSeconds` is **summed across the crew before anything is said out loud** — every line
built on it below is a sentence about the crew or about a job, and none of them carries a name. A
per-player "DAVE was away from the Jig for 84 % of the time its shelf was full" is the same
leaderboard of broken promises the paragraph above rejects, with better arithmetic behind it, and
better arithmetic is not what made it wrong.

#### The seven new figures

Four on `PlayerReport`, one on `StationReport`, two on `ReportPayload`:

```ts
// shared/src/report.ts (F02's file)
export interface PlayerReport {
  …
  hat: string;                     // the hat worn longest; '' when never hatted
  hatSeconds: number;              // seconds wearing that hat
  onPostSeconds: number;           // of those, seconds actually at the post it names
  offPostBackedUpSeconds: number;  // of the rest, seconds that post sat unstaffed with its shelf backing up
}
export interface StationReport { id: string; utilization: number; hattedSeconds: number }
export interface ReportPayload { …; floorHatSeconds: number; elapsedSeconds: number }
```

**The accusing number is computed and the charitable one is the remainder — which is the safe way
round.** With `offPost = hatSeconds − onPostSeconds`:

```
offPostQuietSeconds = offPost − offPostBackedUpSeconds
```

Nothing computes that directly. A bug that loses seconds therefore loses them *out of* the accusation
and into the shrug, which is the one direction a bug in this feature may run; test 20c pins it. (An
earlier draft ran the partition the other way round, with two charitable buckets computed and blame
left as the remainder. That was the right instinct applied to the wrong instrument: with a single
bucket there is only one subtraction to get wrong, and it is this one.)

**`elapsedSeconds` is the shift as actually played**, `Math.round(state.clock)` at day end, and it is
in the payload because three lines below need a denominator and the payload carries none today. It
must not be `level.day.shiftSeconds`: that is the *scheduled* length, and a crew that finishes the
book at 7:00 of a 10:00 shift — which is what `remainingSeconds` rewards (`metrics.ts:277`) — would
top out at 70 % of it and could never print the one line F17 has for a good day. *Rejected:
`wipTimeline.length - 1`*, which is the only elapsed figure the payload carries today (one sample per
second seeded at zero — `metrics.ts:53-61`, `:180`). It is correct arithmetic resting on an
incidental property of another feature's array, and it would break silently and invisibly the day
F11 changed the sampler's seeding. One number in the literal F17 already edits costs less than that.

**`hattedSeconds` is seconds during which *at least one* player wore that station's hat — not a sum
over players.** Two people cannot both wear it at once, but one person can take it, drop it and take
it back, and one person can hand it to another mid-shift; a naive sum over players double-bills the
handover second and a naive per-player accumulation loses the middle. This is what the adversarial
test in §Test plan exists to pin, and the test now actually exercises a handover.

**"At your post", defined exactly.** A tick counts as on-post when:

- for a station hat `h`: `player.stationId === h && player.workTile !== ''` — the same condition F11
  uses to attribute station seconds (`metrics.ts:156-158`);
- for `floor`: `player.stationId === '' && (player.carrying !== '' || player.chore !== '')`.

The floor rule requires **hands or a chore**, not merely being off a machine. Counting "standing on
the floor" would give the FLOOR hat a free 100% and delete the only hat you can visibly slack in. It
does mean an empty-handed walk to a pickup does not count — that bias is deliberate and worth
saying out loud: **the FLOOR hat measures your hands, not your legs.**

**"Worn longest"** breaks ties by: most seconds → the hat worn at the whistle → `hatOrder` position.
Deterministic, and it stops a hat you passed through for one tick from ever winning.

#### What leaving cost — and what the floor genuinely cannot see

§1 promised the second half of the sentence. This section says how much of it is deliverable and
where the promise had to be cut back, because this is the only part of F17 where a confidently wrong
sentence about a named crew is available, and that failure costs more than silence.

**The instrument that was rejected, in full.** The zero-cost option is to compare each player's
off-post station against `payload.bottleneck.stationId`. That fails twice over, and the second
failure is the one that killed the whole approach.

*First, it is a whole-shift argmax.* `buildReport` hands `bottleneckStation` one row per station
whose utilization is the whole-shift fraction (`day.ts:142-148`, `utilizationOf` at `:47-50`) and
whose fullness is the mean of every one-second sample (`fullnessOf` at `:52-54`). Off-post time does
not happen over a shift; it happens at 3:40, for four minutes. *Assembly was the bottleneck* over ten
minutes establishes nothing about whether Assembly was the constraint at 3:40. Worse, the argmax is
contaminated by the crew's own reallocation: a Dock hat who leaves an idle dock, clears Assembly's
backlog and thereby moves the constraint **to the Dock** hands the whole-shift argmax to the Dock,
and their four minutes at Assembly are filed as time away from the constraint. The report would blame
the player for the evidence that they fixed it.

*Second — and this is fatal — sampling the same quantity faster does not help.* An earlier draft's
answer was to compute `utilization × inputShelfFullness` live, once a second, inside `hatsSystem`.
That fixes the temporal contamination and **inherits the staffing contamination whole**, for the
reason §1 sets out with citations: `utilization` is written only from `state === 'working'`
(`metrics.ts:130`, `:189`), `'working'` requires operators (`stations.ts:719-739`), and an
unstaffed station therefore reads zero pressure forever. Work the review's own scenario. Four people
leave Boom Powder and pile onto Assembly. For the first half-minute Assembly still has shelf and now
has four operators, so it reads high pressure and **all four collect credit for precisely the seconds
during which the swarm forms**. Powder, the station they just emptied, reads zero *because they
emptied it*. The instrument would have printed *"THEY WENT WHERE THE LINE WAS STUCK."* over the
children's soccer game. An instrument that systematically misreads the one behaviour §1 exists to
recognise is not an approximation of a better instrument; it is the wrong one, and no threshold
tuning rescues it.

*Third, and independently disqualifying on the floor M1 actually ships.* `inputCap` comes from
`cfg.inputShelf?.capacity ?? 0` (`game-server/src/sim/stations.ts:593`), and in
`config/game/levels/level-01-basic-flow.json` **only `assembly-a` declares an `inputShelf`** (`:93`);
`powder-a` has an output shelf only (`:55`) and `dock-a` has neither (`:124-129`). Their fullness is
0 on every tick of every shift, so their pressure is identically zero and a live argmax on Level 1
can only ever return `assembly-a` or nothing. The only movement the instrument could have credited on
M1's only level is *converging on Assembly* — which is the swarm, and F12's own *Too Many Helpers*.
Running upstream to a dead Powder, which is Level 1's entire lesson, could never have earned a word.

**What `metrics.ts` actually retains, checked rather than assumed.** `StationMetrics`
(`metrics.ts:12-23`) keeps running totals and one 600-flag ring: `workingTicks`, `totalTicks`,
`starvedSeconds`, `blockedSeconds`, `inputFullnessSum`, `fullnessSamples` and
`rolling` / `rollingIndex` / `rollingSum`. **Nothing per-second is retained per station.**
`sampleSecond` (`:175-208`) folds each sample straight into a sum and drops it; the only per-second
history in the file is `wipTimeline` (`:180`), which is factory-wide. So a per-interval anything
**cannot** be reconstructed at day end, and retaining it would mean a new per-second array per
station in F11's file, which F17 does not own. That constraint stands whatever the signal is, and it
is why the decision below judges each second while it is true and then throws it away.

**The decision: measure what was left, not where anybody went.** One condition, evaluated on the
player's *own* hatted station, from schema that owes nothing to staffing:

```ts
// shared/src/sim/hats.ts
export function isBehind(st: BehindInput): boolean;
// st.inputCap > 0 && st.workers === 0 && st.inputShelfLength / st.inputCap >= HAT_BACKLOG_FULLNESS
```

An off-post tick is billed to `backedUp` when the station the player's hat names satisfies it, and to
nothing at all otherwise. `inputShelf.length` and `inputCap` are exact live schema every tick;
`StationState.workers` is written once a tick at `stations.ts:671` from the station's own membership.
None of the three needs anybody to be standing anywhere for the shelf to be seen filling.

**What this buys, in the two cases §1 is about.**

| | Dock hat leaves an idle dock to clear a starving Assembly | Four people pile onto Assembly while Powder starves |
|---|---|---|
| `dock-a` shelf | no input shelf at all → `isBehind` false, forever | — |
| the abandoned post | nothing accumulates on a dock; the report says nothing | Powder has no input shelf either — see the limits below |
| the Jig's own hat | on post, or in the ring (so `workers > 0`) | on post |
| **What prints** | `allBusy`, then *"AND NOTHING PILED UP BEHIND THEM."* | `allBusy`, and on any floor with a second shelf, the named-shelf line |

The first row is the win: the crew that reallocated well is no longer told it drifted, and it is told
so out of a fact rather than a guess. The second row is the honest cost, and it is stated rather than
buried: on Level 1 the accusation has exactly one station it can be about.

**The degenerate case handles itself, with no rule.** An earlier draft needed a table row to stop a
player standing in their own station's ring from being scored as though they had gone somewhere. It
is unnecessary now: a helper in the ring is a `station.members` entry, so `st.workers` counts them
(`stations.ts:671`) and `isBehind` is false for the station they are standing in. The rule that
removed a special case is the right rule.

**Cost, stated in full.**

| | |
|---|---|
| Per tick | for each hatted player who is off post: one `state.stations.get(hat)` and three numeric compares. The pass over `state.players` already exists. |
| Per second | **nothing.** No sample, no array of pressures, no `bottleneckStation` call — the rejected design spent one array of N objects and one argmax call ~600 times a shift, and this spends neither. |
| Memory | three numbers per `HatSpan`, i.e. per (player, hat) pair actually worn — 90 numbers at six players and five hats. |
| Retention | **none.** No per-second history is kept, here or in `metrics.ts`. |
| Payload | one number per player row plus one per station and two on the payload, into `runs.metrics` / `run_players.stats`, which already store the rows whole (`StoreRun.php:64`, `:91`). |

**What this still gets wrong, in the order of how much it matters.**

1. **On a floor where only one station has an input shelf, only one job can ever be accused.** On
   Level 1 that is `assembly-a` (`level-01-basic-flow.json:93`). A Powder hat who wanders all shift
   while Powder sits dead is invisible to this figure, because a station with no input shelf has no
   queue to grow. The mitigation is the honest one — the line names the station it is about, so a
   card that never mentions Powder is not silently pretending to have judged it — and the real fix is
   M2's floor, where Casing Prep, QA and Packing each carry a shelf. **The bias runs one way and that
   is the defence: this figure under-accuses and never over-accuses.**
2. **It says nothing about where the helper went, and never will.** A hauler crossing the floor with
   a keg has `stationId === ''` and always did; a player who runs to the right station and one who
   walks in circles are indistinguishable to F17 and are treated identically — as *not accused*.
   Crediting a destination would mean matching the carried item against a recipe (F05/F06 coupling)
   or reading a pressure signal that §1 has just shown is unreadable. The report withholds praise it
   cannot justify, and withheld praise is invisible.
3. **A backlog you did not cause is still billed to your hat.** If the Jig's shelf fills because
   Powder over-produced, the Jig's hat is off-post and unstaffed, the seconds land in `backedUp`
   whoever is at fault. F17 declines to model causation: the line says the shelf filled with nobody
   on it, which is true, and stops there. Reading it as an apportionment of blame is the reader's
   inference, and it is the same inference the gold stars already invite.
4. **`workers` excludes a member holding a clipboard** (`countWorkers`, called at `stations.ts:671`),
   so a station staffed entirely by people mid-clipboard reads `workers === 0`. That is a handful of
   seconds and it counts against the hat of somebody who *is* standing there — the wrong direction,
   but bounded by the clipboard's own duration and far below the floor below.

**The floors, and the unit error one of them used to have.** Two numbers gate what may be said:

- **`HAT_OFF_POST_MIN_SECONDS = 30`.** No line may assert anything about what off-post time cost
  unless **at least one player's** `hatSeconds − onPostSeconds` reaches it. **This is a span, not a
  crew sum, and that is the correction.** An earlier draft gated on `Σ hatSeconds − Σ onPostSeconds`
  across the crew and justified the number as "one rolling window" — but that quantity is
  player-seconds, not seconds, so six players each stepping away for five seconds cleared a
  thirty-second floor while no single absence lasted five. The unit of the threshold and the unit of
  the quantity were different, and the derivation was invalid at every crew size above one. Taking
  the max over players fixes the unit with one pass over the payload and no new state. It is still a
  per-player *total* rather than a contiguous run: somebody who leaves five times for six seconds
  clears it. Counting only contiguous runs would need per-player escrow bookkeeping in `tick`, and
  the report is a statement about a shift rather than about an episode, so F17 does not buy it —
  stated here and listed in *Risks* rather than quietly assumed away.
- **`hatCoverageFloor(elapsedSeconds) = max(30, 0.05 × elapsedSeconds)`.** A hat counts as *worn* for
  the shift only above this. **Both of the lines that used to test for exactly zero are now tested
  against it**, because §7.1 makes cycling the rack a bit and §4 guarantees every transient hat holds
  a full `HAT_CHANGE_SECONDS`: one player doing two full cycles at any moment in a ten-minute shift
  puts half a second on every hat, `Math.round` turns that into 1, and *"NOBODY WORE THE DOCK HAT
  TODAY"* — the funniest line in the game, §7.7 — would be silently off for the rest of the shift,
  decided by 0.6 seconds of joke. The mirror ran the other way: a player whose `hat` is non-`''`
  after a single 0.15 s touch was excluded from the bareheaded count while having worked hatless all
  day. Both are whole-shift statements and both now need whole-shift coverage. `30` and `5 %` are
  round numbers chosen to sit an order of magnitude above a full rack cycle; they are in *Risks* with
  the other untuned ones.

**The floors it can and cannot speak about.** Two level shapes make the accusation meaningless, and
both are stated because neither is unreachable:

- **Fewer than one station with `inputCap > 0`** — the accusation can never fire, and `hatLines`
  prints the headline without a qualifier. That is not a special case in the code (`isBehind` is
  false everywhere, so `backedUp` is zero and the *quiet* qualifier prints), but it does mean the
  card says *"nothing piled up behind them"* on a floor where nothing could have. Acceptable: the
  sentence is true.
- **A single-station level.** The station hat is on post or in its own ring, so `backedUp` is
  structurally zero and off-post time is almost entirely floor-hat time. F17 has nothing to add
  there and prints nothing beyond `everyJobOwned`; the small-crew gate usually catches these levels
  first anyway (§8).

**And the incentive this creates, said out loud rather than discovered.** The card teaches *do not
leave a queue filling behind the job you claimed.* That is a better lesson than the rejected
instrument's (*stand inside the busy station's ring, and do not be the one carrying things*), but it
is not neutral: it nudges a hat-holder toward their own post and slightly against reallocation, which
is the pull §1 spends its whole argument resisting. Two things hold it in check and both are
deliberate — the accusation fires only when the post is **unstaffed**, so handing your job to
somebody before you go costs nothing, and it fires only when the shelf is **actually filling**, so
leaving a quiet post is free. Watch it anyway in step 51a: a crew that stops helping each other
because of a report line is the failure mode this feature was written to avoid, and it would be
visible as crews standing still.

#### The hat chip: per-player attribution at zero vertical cost

`individualColumn` (`Report.ts:167-224`) already prints one certificate row per player — `name`, a
right-aligned utilization percentage at `x + 130`, and the label with its gold star at `x + 146`.
F17 adds **one more text object inside that existing loop**, at `x + 260`: the player's peg letter
and hat label in the hat's colour, or nothing when `hat === ''`.

```
MEG          88%   EXCELLENT ★     D DOCK
SAM          91%   EXCELLENT ★     F THE FLOOR
DAVE         84%   EXCELLENT ★
```

That is the whole per-player story and it costs no rows. It puts the claim directly beside the gold
star, which is the juxtaposition the joke is built on, and it names nobody as having failed — the
reader does the arithmetic themselves, which is always funnier than being told.

**The chip is the hat worn longest and may be barely half the shift**, and that is stated here rather
than left to be discovered. `PlayerReport.hat` is an argmax like every other whole-shift figure in
this doc: a player who split 51/49 between DOCK and FLOOR prints `D DOCK` with nothing qualifying it,
and the reader will take it as *the* job DAVE claimed. This is the smallest instance of the
aggregate-presented-as-a-moment pattern the rest of §6 spends its length on, and unlike the others it
is cheap to leave in — the chip carries no number, so a half-true chip supports no verdict. It also
sets a constraint the lines below have to respect: **anything that names a job on a card that also
prints who wore that job's hat has effectively named a person**, which is why the accusing line at
the headline names no station (§6, the headline slot).

#### The lines

`format.ts` (F11's file) gains one exported pure function beside `hazardLines`:

```ts
export function hatLines(p: ReportPayload, copy: Copy, level: LevelConfig): string[];
```

`Report.ts` renders the result in the **left** column, under `topPerformer`, at 11 px in the report
serif with 14 px rows — accountability belongs beside the gold star, not in the factory column where
it would read as an operations metric.

`hatLines` appends in this fixed order and **stops at `HAT_LINE_CAP = 5` lines**. The order is a
priority order and nothing is ever truncated mid-item: an item that does not fit whole is skipped
whole.

Seven quantities over the payload, computed once:

```
elapsed   = p.elapsedSeconds
hatTotal  = Σ hatSeconds
onPost    = Σ onPostSeconds
offPost   = hatTotal − onPost
backedUp  = Σ offPostBackedUpSeconds
longest   = max over players of (hatSeconds − onPostSeconds)      ← a span, not a sum (§6)
floor     = hatCoverageFloor(elapsed)
```

1. **The headline slot**, at most **one of two**, both gated on `players.length > SMALL_CREW`:

   - `copy.hats.everyJobOwned` — **"EVERY JOB HAD A NAME ON IT."** — when every station's
     `hattedSeconds` and `floorHatSeconds` are each ≥ `0.9 × elapsed` and
     **`(hatTotal − backedUp) / hatTotal ≥ 0.6`**. The denominator is **elapsed** shift seconds and
     not `level.day.shiftSeconds`, for the reason §6 gives with the field: a crew that finishes the
     book at 7:00 of a 10:00 shift and wore every hat end to end would otherwise max out at 70 % and
     could never print the only line in F17 that fires when the crew wins. The second clause asks
     whether the claims cost anything, and subtracts only the seconds a claimed post spent unstaffed
     while its shelf filled — so a crew that owned every job **and** reallocated well, which is the
     best day this game has, is no longer denied the line for having moved about.

     **This is deliberately *not* behind the `HAT_OFF_POST_MIN_SECONDS` floor**, unlike the branch
     below, and the asymmetry is intentional rather than an omission. That floor exists so nothing
     asserts a verdict about off-post time on a figure too small to mean anything; `everyJobOwned`
     derives its credit from *coverage*, and `backedUp` enters only by subtraction — on a shift with
     eight seconds of off-post time the ratio is ≈ 1 and asserts nothing false. Gating it would deny
     the success line to the one crew that most obviously earned it: the one that never left.

     **It is also the only line here not gated on "nobody was NEEDS FOCUS", and that is a decision.**
     `everyJobOwned` can print above a certificate row reading `44% NEEDS FOCUS`. That is F11's
     two-column joke working exactly as designed — the card congratulates the crew while the factory
     burns — and the line is about whether the *jobs* were owned, which one struggling player does
     not make untrue. Stated so nobody later "fixes" it into consistency.
   - `copy.hats.allBusy` — **["EVERYONE WAS BUSY.", "NOBODY WAS WHERE THEY SAID THEY WOULD BE."]** —
     on four clauses: `hatTotal > 0`; every player's `label !== 'NEEDS FOCUS'` (F02's
     `utilizationLabel`, i.e. everyone was busy); `onPost / hatTotal < 0.5`; and
     `longest ≥ HAT_OFF_POST_MIN_SECONDS`.

   **`allBusy` fires on the whole of that trigger and is never diverted to a sibling.** An earlier
   draft split this slot four ways, with `allBusy` carrying every clause of the trigger *plus* two
   further ratio tests while its new siblings each needed only one to go the other way. The
   arithmetic of that was: the crew that helps by hauling lands in the unreadable bucket and gets a
   shrug, the crew that swarms lands in the credited bucket and gets a compliment, and the thesis of
   the entire game fires on neither. **The joke was not blunted by wording, it was blunted by
   probability** — and `allBusy` is the sentence the report has never been able to write and the
   thesis of the whole game in eight words. It now prints on every shift the trigger describes, which
   is where it started, and the verdict moved to a separate line beneath it where it can be wrong
   about less.

   A crew with one `NEEDS FOCUS` player, or where nobody was off their post for half a minute, gets
   no headline at all. The report is under no obligation to have an opinion, and §6's standard is
   that a confident wrong line costs more than a missing one.
2. **The qualifier — one line, only under `allBusy`, and only outside a dead band.** This is where
   §1's second half is actually spent, and it is one line because that is all the evidence supports.

   - `copy.hats.nothingBehind` — **"AND NOTHING PILED UP BEHIND THEM."** — when
     `backedUp <= 0.2 × offPost`. The crew left its posts and no claimed post sat unstaffed with its
     shelf filling. Flat, not applause: the crew did the right thing and the card noticing is the
     whole reward.
   - `copy.hats.pileUpBehind` — **"AND THE WORK PILED UP BEHIND THEM."** — when
     `backedUp >= 0.5 × offPost` **and** `backedUp >= HAT_OFF_POST_MIN_SECONDS`.
   - Between 0.2 and 0.5, or below the absolute floor: **nothing**. `allBusy` prints alone.

   **The dead band is the point of the shape.** An earlier draft flipped between praise and the
   game's thesis accusation at exactly `0.5`, with no gap, on an instrument the same section conceded
   lags by up to thirty seconds — a crew at 0.49 and a crew at 0.51 are not distinguishable by any
   instrument here, and they were getting opposite sentences over one second of difference. Now the
   two verdicts sit 30 percentage points apart, the honest shrug is what fills the middle, and a
   one-second swing can only ever move a crew *into* silence, never from praise to blame.

   **The accusing line names no station, and that is deliberate.** *"ASSEMBLY'S SHELF FILLED UP WITH
   NOBODY ON IT"* is the more useful sentence and it was rejected: the certificate rows two blocks
   above now carry a hat chip, so naming a job that somebody's chip claims is naming a person, which
   is what §2 forbids the report from doing and what §6 opens by rejecting. The nameless line asserts
   less and is still true. F11's `BOTTLENECK: ASSEMBLY ← starved 214 s` in the right column supplies
   the *where* two blocks away, at the factory level, where it belongs.
3. **Per unowned job, up to two:** every `stations[]` entry whose `hattedSeconds < floor` in level
   order, then the floor hat when `floorHatSeconds < floor` →
   `fill(copy.hats.unworn[0], { hat: hatLabel })` → *"NOBODY WORE THE DOCK HAT TODAY"*. Capped at
   two because it is the loudest thing on the card and three of them is a list. Suppressed entirely
   at `players.length <= SMALL_CREW` (§8). This is the line that pairs with F11's bottleneck line
   two blocks away: a report saying `BOTTLENECK: ASSEMBLY ← starved 214 s` in the right column and
   `NOBODY WORE THE BOOM POWDER HAT TODAY` in the left has explained the day in eleven words.

   **`< floor`, not `=== 0`** — §6's coverage floor, and it is what keeps the best line in the game
   from being switched off for the rest of the shift by 0.6 seconds of somebody juggling the rack.
4. **One compliment, carrying the only number:** among players whose `hatSeconds >= floor` **and**
   `hatSeconds >= 0.5 × elapsed`, the highest `onPostSeconds / hatSeconds` →
   `fill(copy.hats.bestPost[0], { name, hat: hatLabel, percent })` →
   *"MEG said DOCK and meant it — 94%"*. Ties break by most `onPostSeconds`, then `hatOrder`
   position — never by the payload's player order, which `day.ts:146-153` sorts by utilization, an
   unrelated axis.

   **The eligibility floor is the fix, not decoration.** With no minimum sample a latecomer wins on a
   ten-second denominator: a player who joins at 8:00 of a 10:00 shift, takes DOCK and stands on a
   dock work tile prints *"said DOCK and meant it — 100%"* over somebody who held 94 % across the
   whole shift. *"Meant it"* is a statement about the shift and must be computed from most of one.

   Suppressed at `players.length <= SMALL_CREW` (§8), **on any shift where the `nothingBehind`
   qualifier printed**, and **when a second player's `hat` equals the winner's**. The first: crowning
   the player who left their post least, two lines under *"nothing piled up behind them"*, pins the
   gold sticker on the one person who did not go — the rigid crew praised by the same card that has
   just cleared the flexible one, which is the lesson §1 says the game is not trying to teach. The
   second: a mid-shift handover leaves two players whose longest-worn hat is `dock-a`, the chip
   column prints two DOCK chips, and the card would then rank two named people against each other on
   the same job — the one construction §6 opens by rejecting outright.
5. **Bareheadedness as a count, never as a name:** the number of players whose `hatSeconds < floor`
   → `fill(copy.hats.bareheaded[0], { count })` → *"2 OF YOU WORKED WITHOUT A HAT"*. §2 explicitly
   permits going bareheaded, so naming the person would be the penalty §2 rules out, arriving
   through the report instead of the sim.

   **It fires only when `count >= 2` and `players.length <= hatOrder(level).length`**, and both
   clauses are corrections. Level 1 has three stations plus the floor, so there are four hats, and M1
   caps at six players: at five players the count is *always* exactly 1 and at six it is *always* 2,
   every shift, forever, by arithmetic rather than by anything anybody did. Worse, the certificate
   rows now carry a chip column in which exactly that many rows are blank — *"1 OF YOU WORKED
   WITHOUT A HAT"* read aloud over a card with one visibly empty chip is a finger, not a shrug, and
   this line exists precisely to avoid being a finger. The two clauses say: only when there were
   enough hats to go round, and only when more than one person declined one. On Level 1 at five or
   six players it never fires, which is correct.
6. **Solo,** which replaces all of the above at one player — §8.

#### The space and width budget, stated because the geometry is not unit-testable

`Report.ts`'s `line()` (`:448-463`) does no word wrap and no clamping, and `individualColumn` is
never passed `columnWidth` (computed at `:87`, used only to position the factory column). So the
budget is a rule the copy obeys rather than a layout that adapts:

- **Width.** The canvas is 896 px (`Factory.ts:227-233`, 28 × `TILE_PX`), `left = 38`, `right = 858`,
  so `columnWidth = (858 − 38 − 28) / 2 = 396 px`. At 11 px in the report serif an all-caps line runs
  about 6.6 px per character. **`HAT_LINE_CHARS = 52`** — 52 × 6.6 ≈ 343 px, with headroom. Every
  string in `copy.hats`'s report keys is under it, `hatLines` asserts it (test 45), and that is why
  `allBusy`, `solo` and `soloOne` are arrays of lines rather than one long sentence.
- **Height.** `HAT_LINE_CAP = 5` lines × 14 px = **70 px** added to the left column. The sheet is
  584 px tall (`Report.ts:111-118` on a 624 px canvas) and at six players the existing content
  already runs to roughly 525 px, so the slack is about 80 px. F17 fits inside it — barely — and the
  cap is what keeps it inside it. **This is F11's ceiling, not F17's**, and it is named in *Risks*
  because the next feature to add a left-column line will not fit. If in-app step 51 shows an
  overflow, drop `HAT_LINE_CAP` to 4; the `bareheaded` line goes first — it is also the line §6's
count-and-crew-size gate already silences on every M1 crew size, so the height budget and the
fairness argument point the same way and the feature loses nothing it valued.

#### `hatLabel` and `hatPegLetter`

`STATION_LABEL[type]` for a station hat, read through `@shared` exactly as F11's `stationName` does
(`F11:178` — the symbol lives in `shared/src/sim/stations.ts:24`, F05's file), and `THE FLOOR` for
`floor`. `hatPegLetter(hat, level)` does the id→type lookup for the one-letter board glyphs in one
place and appends the line suffix on a multi-line level (§2). Both are legends, not speech, and live
in `shared/src/sim/hats.ts`.

### 7. The comedy, specified

Hats are funny for free; a doc that banks on that and specifies nothing has failed. Here are the
bits, each as behaviour a builder can implement and a test can assert. Three of the durable ones
ride other features' effects — F10's soot, F16's tumble, F09's truck — so §4 gives F17's own verb,
the thing every player does most, a bit of its own rather than leaving it as pure cost defence.

**1. Cycling the rack is hat-juggling.** §4. Every press clinks and every transient hat holds for a
full `HAT_CHANGE_SECONDS`, so a full cycle is four visible costume changes and four clinks in 0.6 s,
in front of everybody, ending on the paper hat. It is the one bit available on demand, at any crew
size, from second ten, and it never repeats identically because it depends on which hats are free.

**2. The FLOOR hat is made of yesterday's report.** It is a folded paper hat, drawn in the report
card's own paper colour `0xf3ead7` (`Report.ts:26`). The first time anybody **settles** on it in a
shift, the whole room gets one `toast info`: `copy.hats.paperHat` —
**"MADE FROM YESTERDAY'S REPORT"**. Once per shift, tracked in the `hatsSystem` store, reset in
`onStart`, and fired on the settled hat rather than the transition so a cycle passing through it
does not spend the joke on a hat nobody kept. Honest lifespan: it is one fixed string on a trigger
the crew will learn to fire deliberately, so it is funny the first few times and then it is
furniture. It earns its keep because it costs one key and one boolean.

**3. The huddle, and the whistle.** §3. The lobby is where people pick, in front of each other, and
if every hat is worn when the whistle blows the room gets `copy.hats.whistle` —
**"ALL HANDS. ALL HATS."** It is the only line in the feature that fires *before* anything has gone
wrong, and it is what turns the huddle from a paragraph in this doc into a scene in the game.

**4. In a blast, the hat gets sooted and stays on.** F10's knockback sets `sooted = true`
(`F10:221`) and an explosion soots everybody (`F10:228`). §5 blackens the crown and silhouette while
keeping a 1 px outline in the hat's colour. The picture — four blackened squares, still wearing four
distinguishable hats, sitting two tiles from where they were standing — is better than any bespoke
effect, costs one branch in `paint()`, and composes differently every single time.

**5. In a trip, the hat comes off and comes back.** F16 already throws a hat in the air on a trip —
a 20 × 5 rect in `lineColour` that tumbles 540° and fades (`F16:790-806`). F17 makes it the *role*
hat: `Fumble.ts` calls `hatShape(player.hat)` and `HAT_COLOURS` instead of `lineColour`, so the
Powder operator's hard hat is what goes spinning. **The hat is not lost.** It is back on your head
when you stand up.

   Losing it would be the single worst decision available here: it would create a Tier D fetch quest
   out of an accident, put a hat on the floor (bullet 6), and make wearing a hat a liability —
   which converts the whole feature into the chore §4 exists to prevent. *Flourish, F16's call and
   worth keeping:* after the tumble, redraw the hat rotated 12° for 3 s. A crooked hat is the
   cartoon shorthand for "that was embarrassing", it is the best flourish in the doc, and it is
   entirely inside `Fumble.ts` with no schema and no F17 file.

**6. A hat can never be knocked off, picked up by the wrong person, or thrown.** Asked directly and
answered against ADR 0008. This is a rejected alternative rather than a moment, and it is listed
here because the question is the first one anybody asks. If a hat could land on the floor it would
have to be one of three things, and all three are bad:
   - **Fuel** — absurd, and it would dilute the fuel map that ADR 0008 spent a whole decision making
     legible. The pile is kegs and spill, and adding a fourth thing that might be flammable makes
     the DANGER beacon a guess.
   - **An obstacle** — a trip hazard nobody asked for, and F16 has enough of those.
   - **Scenery** — dead state on the floor, an `ItemState` that does nothing, counted by
     `floorCount` and swept by the broom for no reason.

   And the design objection outranks all three: **a stealable hat makes ownership contestable.** The
   entire value of the signal is that it is a claim you made about yourself. The moment someone else
   can take yours off your head, the rack stops being a staffing board and becomes a griefing
   surface. So a hat is not an item, is never in `state.items`, and has no `x`/`y`. It exists only
   as `PlayerState.hat`.

**7. Nobody wore the DOCK hat.** The report line in §6.2, printed in the same voice and the same
column as the gold stars. It is the funniest line in the game because it is the only one that
accuses everybody at once by naming nobody. Four possible values on a one-line floor, seven on two,
so it stays fresh for about a week — the honest lifespan, stated rather than promised.

**8. "EVERY HAT IS SPOKEN FOR."** §4. The fifth person, at the rack, being told by the building that
there is no job left — while four people crowd one machine three tiles away. Once per person per
shift, which is what keeps it a punchline rather than a buzzer.

**9. The truck.** A player driven off on a truck (`drivenOffUntil`, F09) keeps their hat, and their
peg stays bare while they are gone. Somebody owns the Dock; they are currently on the motorway.
Zero code — it falls out of §3's derived rack — and it is a situation rather than a line, so it
never wears out.

### 8. Solo and small crews (ADR 0013)

ADR 0013 makes Level 1 and Sandbox playable by one, and is explicit that solo is the taster that
decides whether anybody comes back with friends. A lone player must not open the report card and
find four accusations.

The rule keys on **`SMALL_CREW = 2`, a live-crew-size constant**. It is *not* the same number as
ADR 0013's `maxPlayers <= 2` scaling breakpoint, which is a property of a *level* tuned for a small
crew (0013:8, :61); a six-player room on a small-crew level and a two-player room on Level 3 land on
opposite sides of the two thresholds. It is a second number chosen to match 0013's, and an earlier
draft's claim that there is "one threshold in the design and not two" was wrong. **Every gate in F17
is written `players.length > SMALL_CREW` or `state.players.size > SMALL_CREW`** — never a bare
`>= 3` literal in `Report.ts`, `format.ts` or `Hats.ts`.

**At 1–2 players:**

| Surface | Behaviour |
|---|---|
| The rack | Draws normally; **the hung-hat pulse is off.** With two people and four jobs, two of the four hats are always still hanging, and a pulsing board would be the game nagging about arithmetic. |
| The hat chip on the certificate row | **Unchanged — it still prints.** It costs no space, and it is the note-to-self payoff below. |
| `copy.hats.unworn` | **Suppressed entirely.** "Nobody wore the DOCK hat" is a true and useless thing to say to one person. |
| `copy.hats.bestPost` | **Suppressed.** A small crew's on-post percentage is low because they do every leg themselves, not because they wandered off, so a "best" is not a compliment — it is arithmetic. |
| `copy.hats.bareheaded` | **Suppressed.** Two people, one count, no joke. |
| `copy.hats.allBusy` / `everyJobOwned` and the qualifier under them | Cannot fire — the headline slot and its qualifier are gated on `players.length > SMALL_CREW`. |
| `copy.hats.solo` / `soloOne` | Printed instead, **at exactly one player**, and gated on touching the rack at all rather than on wearing several hats. |

**The qualifier is noise below three, and the existing gate is already the right one.**
§6's whole distinction needs a crowd to be about anything. A solo player is off-post by construction
— one pair of hands does every leg, so leaving the post *is* the job — and *did anything pile up
behind them* is close to tautological: with nobody to hand the job to, whatever they are not doing is
backing up somewhere by definition, and saying so is describing the shift rather than judging it. Two
players are the same case with a handover. **There is no children's soccer game with one child**, and
the charitable half is no better: telling a lone player that nothing piled up behind them is telling
them the factory was quiet. So the headline slot and its qualifier stay behind the
`players.length > SMALL_CREW` gate they already share, and F17 adds **no** new small-crew rule, no
new suppression and no new branch in `hatLines` — the existing gate covers the new line for free,
which is the test that the gate was in the right place.

`offPostBackedUpSeconds` and `elapsedSeconds` are still **computed and sent** at one and two players,
alongside the other five, so the payload shape never depends on crew size and an M2 history screen
reading `run_players.stats` finds the same keys on every row. The rack, the pulse, the chip and the
solo lines are untouched: nothing in §6's addition reaches the floor while the shift is running.

**The solo lines, and why the gate is one hat and not two.** An earlier draft printed the solo line
only when the player wore ≥ 2 distinct hats — but a solo player has *less* reason than anybody to
touch the rack (there is nobody to signal), so the most likely outcome was zero hats, zero lines and
a solo report where F17 does not exist. That threw away the best line in the feature: the one that
is funny and a little sad and makes a solo player text a friend, which is exactly ADR 0013's job for
the taster. So:

- Two or more hats worn → `copy.hats.solo`:
  **["{name} wore every hat in the building.", "There was nobody to hand one to."]**
- Exactly one hat worn → `copy.hats.soloOne`:
  **["{name} wore the {hat} hat all day.", "There was nobody to hand it to."]**
- No hat at all → nothing.

**Both are computable from the payload as it stands, which the earlier draft's version was not.**
`hatLines` is pure over `ReportPayload`, and the payload carries only the winning hat per player —
"wore ≥ 2 distinct hats" is nowhere in it. At exactly one player, though, every second in
`stations[].hattedSeconds` and `floorHatSeconds` is that player's, so the distinct-hat count is
`stations.filter(s => s.hattedSeconds > 0).length + (floorHatSeconds > 0 ? 1 : 0)`. Restricting the
line to one player is what makes it derivable, and it is also the only crew size where the joke
works. **No new `PlayerReport` field is needed.** `{hat}` for `soloOne` comes from `players[0].hat`,
which the payload already carries.

`hat`, `hatSeconds`, `onPostSeconds`, `offPostBackedUpSeconds`, `hattedSeconds`, `floorHatSeconds`
and `elapsedSeconds` are still **computed and sent** at every crew size. Only the rendering changes. Laravel stores what Node sends and never
recomputes (contracts §9), so a solo day and a six-person day produce the same payload shape.

At 1–2 players the hat also keeps a use the report cannot show: **it is a note to yourself.** A solo
player who takes the DOCK hat before a truck is due has put a reminder on their own head, in a game
whose whole subject is losing track of the thing you meant to do next. §4's `claimed` bubble is what
makes that real rather than asserted: the press does something visible even with nobody there to see
it, which is the difference between a note and a no-op.

### 9. Authority

**The server owns who wears what, without exception.** `PlayerState.hat` is written in exactly one
function, `takeHat` in `game-server/src/sim/hats.ts`, reached only from the `interact` chain.

**What a client may claim: nothing.** There is no new message and no payload field. The client sends
`interact` — the same message it already sends to pick up a keg — and the server decides, from the
player's own tile and facing, whether that press was at the rack, which hat is free and whether the
cooldown has elapsed. A client cannot name a hat, cannot claim one it is not standing next to,
cannot take one another player is wearing, and cannot change anybody else's.

That argument is correct and it is now also **asserted**, in four tests (24–27) rather than left as
prose: a press away from the rack writes nobody's `hat`; a press at a full rack moves nobody's `hat`;
a burst from one session never writes another session's `hat`; and `mg`, `action` and `emote` never
write `hat` at all. The pure-function test that `nextHat` skips a worn hat (test 3) is not a test of
the server path and was never a substitute for these.

**What the client may not do:** predict the hat, render a hat it has not seen in `state`, or write
`hat` locally for responsiveness. `.ai/rules/client.md` is explicit ("the client renders from state
and sends input… own-avatar prediction only"), and unlike movement there is nothing here worth
predicting — a hat change is one patch away and nothing depends on it within that patch.

**The only client-local state F17 has** is F16's crooked-hat timer (§7.5), which is a 3 s cosmetic
derived from a transition the client already observes, exactly as F16's tumble is.

**Why no message.** A `hat` message would need a guard, a dispatch row, a cooldown, a validity check
against the level's station list, and its own rejection toast — all to do what facing a tile and
pressing `E` already does, in a game where facing a tile and pressing `E` is how you pick up a
broom (`items.ts:512-516`). Contracts §4 stays untouched.

### 10. Interactions

- **F05 stations.** No change in either direction. Joining a station never sets `hat` (§4), and `hat`
  never gates a join, a work tile, the staffing curve or `countWorkers`. The two `E` paths can never
  contend, because §3 constraint 2 keeps all **eight** of the rack's neighbours out of every
  station's join zone — and separately, a `press` station member is frozen
  (`movement.ts:72-77`) and a `stand` member's press is claimed unconditionally by
  `stations.onInteract:473-485` regardless of facing. Both are **tested** (tests 22–23) rather than
  argued, because the earlier draft's four-neighbour constraint did not establish the property it
  claimed and the freeze/claim reasoning was asserted rather than exercised.
- **F06 items.** A hat is not an item and never enters `state.items`, `floorCount`, the drop table,
  the fuel map, `pnl.waste` or `RunTally`. `items.onInteract` runs first in the chain and returns
  `false` for a press facing the rack: it is a wall tile, so `putDownItem` refuses it
  (`items.ts:468-470`) and `pickUp` finds no floor item, no shelf, not the broom hook and no station
  tile (`items.ts:485-522`). Both hands-full and hands-empty presses therefore fall through with no
  edit to F06.
- **F07/F08/F09 mini-games.** Untouched. No op, no window, no combo interaction.
- **F09 the truck.** §7.9 — the rider keeps the hat and the peg stays bare.
- **F10 hazards.** §7.4 — sooted, never lost. A knockback that calls `stations.leave` clears
  `stationId` and therefore stops on-post seconds accruing, which is correct: you were blown off
  your post.
- **F11 metrics and the report.** F17 accumulates its **own** seconds in its own `WeakMap` and never
  touches `metrics.ts`. It reads no F11-owned field at all: §6 rejected
  `StationState.utilization` outright, because `metrics.ts:189` derives it from
  `state === 'working'` and an unstaffed station therefore reads zero however full its shelf is. What
  F17 reads instead is written by F05 — `inputShelf`, `inputCap` and `workers`
  (`game-server/src/sim/stations.ts:671`, `:593`) — all read-only, all exact every tick, none of them
  lagging. F11's `secondsAtStation` (`metrics.ts:147-162`) answers a different question
  — *where were you* — and F17 needs *where were you while claiming to be somewhere*. Reusing it
  would mean either gating F11's accumulator on a field it does not own or reconstructing hat spans
  at day end, and nothing at day end knows when a hat was taken. F17 contributes to `RunTally` not at
  all: nothing here is an event, it is all duration. F17 does, however, spend most of F11's remaining
  left-column height — §6's budget, and *Risks*.
- **F13 crew and the menu.** **Naming collision, called out so nobody trips over it:** F13 adds
  `PlayerState.role` for the *crew* role — `owner` / `co_owner` / `member` (`F13:407-408`). That is
  a permissions fact from Laravel. F17's field is `hat` and is a job claim. They are unrelated, they
  are never derived from each other, and neither may be named after the other. F13's roster row may
  render the hat glyph beside the colour swatch and the role badge — one line in `CrewPanel.ts`,
  **F13's file and F13's call**, listed as an optional bullet in *Contract changes*.
- **F14 difficulty.** F17 contributes no field to ADR 0014's transforms. Neither dial touches a
  social signal, and `HAT_CHANGE_SECONDS` is an input-repeat guard, not a window. One line for
  F14's exclusion list.
- **F15 the floor.** §3 — the coordinate `[8,8]` holds on both today's map and F15's, so landing
  order does not block F17's geometry. **But F15 replaces `config/game/layouts/one-line.json` whole**
  (`F15:6`), along with `DEV_LAYOUT`, `shared/tests/fixtures/{level-m1,layout-one-line}.json` and
  three `game-server/tests/fixtures` layouts — the exact files F17 edits. See *Risks* for the
  overwrite and why `hatRack` ships optional.
- **F16 sprint and the trip.** §7.5. Also, explicitly: **sprinting in a hat is identical to
  sprinting without one.** No weight, no fumble modifier, no speed change. A hat is information.
- **The lobby.** §3. Presses land; seconds do not.
- **Day end.** `phase === 'ended'` runs no systems (contracts §11), so the counters freeze where they
  were and the last hat anybody took is the hat they are wearing on the report card.

### Interfaces

**Consumes**

- **Contracts §3 schema (read-only except `PlayerState.hat`)** — `FactoryState.{phase, clock,
  players, stations}`, `PlayerState.{userId, name, line, x, y, facing, stationId, workTile,
  carrying, chore, sooted, drivenOffUntil}`.
- **Contracts §8** — `LevelConfig.stations[].{id, type, line}`, `LayoutConfig.props.hatRack`,
  `LayoutConfig.walls`.
- **F02 `shared/src/sim/tiles.ts`** — `tileKey`, `packTile`.
- **F06 `shared/src/sim/items.ts`** — `FACING_DIRS` (`items.ts:13-21`). Contracts §10 line 716 and
  §12 put this file with F06; an earlier draft named `tiles.ts` and F02, and `tiles.ts` exports
  `facingVector`, not `FACING_DIRS`. Read through `@shared`.
- **Contracts §3 `StationState` (read-only)** — `inputShelf`, `inputCap` and `workers`
  (`shared/src/schema/StationState.ts:19`, `:21`, `:16`), all written by F05
  (`game-server/src/sim/stations.ts:593`, `:671`): the three inputs to `isBehind`, §6.
  **`utilization` is deliberately not consumed** — §6 sets out why a field derived from
  `state === 'working'` cannot see an abandoned station.
- **F05 `shared/src/sim/stations.ts`** — `STATION_LABEL` (`stations.ts:24`, contracts §10.2; §12
  gives this file to **F05**, not F02), read through `@shared` so the report names a job the same way
  the floor does.
- **F03 `World`** (contracts §10.1) — `level`, `layout`, `state`, `now`, `tileOf`, `sessionIdOf`,
  `fx(kind, x, y)` (`World.ts:418`, with `x`/`y` in tile units — `shared/src/messages.ts:70`),
  `toast(to, text, kind)` (`World.ts:422`), the `System` interface (`World.ts:43-51`, whose `init?`,
  `onStart?`, `tick?` and `onDayEnd?` are all optional); `setBubble` and `EMOTE_BUBBLE_SECONDS` from
  `game-server/src/sim/bubbles.ts:15`, `:12`.
- **F04 client core** — `game.registry`'s `conn.config.{level, copy}`; `Factory`'s layer containers;
  `LINE_COLOURS` / `PLAYER_PALETTE` / `GROOVE_COLOURS` from `render/palette.ts`, **read only by the
  colour-disjointness test**, never at runtime.
- **F12 copy** — `copy.hats.*` on the client; the server reads `copy.hats.{claimed, allTaken,
  paperHat, whistle}` from `@shared` for its bubbles and toasts, plus `fill`
  (`shared/src/copy.ts:71`).

**Produces**

`shared/src/sim/hats.ts`

```ts
export const FLOOR_HAT = 'floor';
export const HAT_CHANGE_SECONDS = 0.15;
export const SMALL_CREW = 2;          // live crew size, not ADR 0013's level breakpoint — §8
export const HAT_LINE_CAP = 5;        // report lines — §6's height budget
export const HAT_LINE_CHARS = 52;     // report line width — §6's width budget
export const HAT_OFF_POST_MIN_SECONDS = 30;   // §6; no verdict below it, and it gates a span not a sum
export const HAT_BACKLOG_FULLNESS = 0.5;      // §6; the share of an input shelf that counts as backing up
export function hatOrder(level: Pick<LevelConfig, 'stations'>): string[];   // station ids in level order, then FLOOR_HAT
export function nextHat(current: string, taken: ReadonlySet<string>, order: readonly string[]): string;
export function isOnPost(hat: string, p: OnPostInput): boolean;
export function isBehind(st: BehindInput): boolean;
export function hatCoverageFloor(elapsedSeconds: number): number;   // max(30, 0.05 × elapsed) — §6
export function hatLabel(hat: string, level: Pick<LevelConfig, 'stations'>): string;
export function hatPegLetter(hat: string, level: Pick<LevelConfig, 'stations'>): string;
export interface OnPostInput { stationId: string; workTile: string; carrying: string; chore: string }
export interface BehindInput { inputCap: number; workers: number; inputShelfLength: number }
```

`isBehind` is
`st.inputCap > 0 && st.workers === 0 && st.inputShelfLength / st.inputCap >= HAT_BACKLOG_FULLNESS`.
All three inputs are exact live schema written by F05, and none of them requires anybody to be
standing anywhere for the shelf to be seen filling — which is the whole reason §6 uses it instead of
the pressure product F11's bottleneck is built on. A station with no input shelf has `inputCap === 0`
and is therefore never behind, which is correct and is also why the accusation can only speak about
`assembly-a` on Level 1 (§6).

`nextHat` walks `[...order, '']` from the position after `current`, wrapping once, and returns the
first entry that is `''` or not in `taken`. `taken` is the set of hats worn by **other** players, so
`current` is never in it. Returns `''` when nothing is free — the bareheaded slot is always
reachable, so the cycle can never strand a player.

`game-server/src/sim/hats.ts`

```ts
export interface HatSpan {
  seconds: number;
  onPost: number;
  backedUp: number;        // off-post seconds while the post this hat names was unstaffed and backing up — §6
}
export interface HatMetrics {
  perPlayer: Map<string, Map<string, HatSpan>>;   // userId → hat → span
  perHat: Map<string, number>;                    // hat → seconds with at least one wearer
  lastChangeAt: Map<string, number>;              // sessionId → clock, armed by takeHat
  announced: Set<string>;                         // sessionId → the settled hat has been bubbled
  allTakenTold: Set<string>;                      // sessionId → told once this shift
  rackFullSince: number | null;
  paperToasted: boolean;
}
export interface HatReportRow {
  hat: string;
  hatSeconds: number;
  onPostSeconds: number;
  offPostBackedUpSeconds: number;
}
export function hatStore(world: World): HatMetrics;                     // lazy — created on first read
export function takeHat(world: World, player: PlayerState): boolean;    // the `interact` link
export function hatReportFor(world: World): { players: Map<string, HatReportRow>; perHat: Map<string, number> };
export const hatsSystem: System;   // { name: 'hats', onStart, tick }
```

`takeHat` returns `false` unless the player's faced tile is `layout.props.hatRack`, so the
`interact` chain is unchanged for every other press. It returns `false` immediately when
`layout.props.hatRack` is absent (§3 — the key is optional).

`resources/js/game/render/Hats.ts`

```ts
export interface HatRect { x: number; y: number; w: number; h: number }
export const HAT_COLOURS: Record<string, number>;
export function hatShape(hat: string): HatRect[];    // [] for '' — a bareheaded avatar paints as today
export function createHatsLayer(scene: Factory): HatsLayer;
```

`resources/js/game/report/format.ts` (F11's file) gains

```ts
export function hatLines(p: ReportPayload, copy: Copy, level: LevelConfig): string[];
```

Schema fields written by F17 and by nobody else (contracts §12): `PlayerState.hat`.

### Data & config

F17 defines **no level key and no default**. Every number it uses is either derived from
`level.stations` or a code constant with its justification above.

| Name | Value | Where | Why not config |
|---|---|---|---|
| `HAT_CHANGE_SECONDS` | `0.15` | `shared/src/sim/hats.ts` | An auto-repeat guard, not a window. Same class as `MAX_INPUT_BACKDATE_S` (contracts §13). |
| `SMALL_CREW` | `2` | same | A live crew size. Matches ADR 0013's number without being it (§8). |
| `HAT_LINE_CAP`, `HAT_LINE_CHARS` | `5`, `52` | same | Derived from `Report.ts`'s fixed geometry (§6), not from taste. |
| `HAT_OFF_POST_MIN_SECONDS` | `30` | same | The shortest single-player absence F17 will say anything about. A round number, not a derived one — the shelf reading it gates has no lag to defend against, so §6 states it as taste and *Risks* lists it. |
| `HAT_BACKLOG_FULLNESS` | `0.5` | same | Half an input shelf. Round, and in *Risks* with the rest. |
| `hatCoverageFloor(elapsed)` | `max(30, 0.05 × elapsed)` | same | The coverage a hat needs before the card will call it worn or unworn (§6). Sits an order of magnitude above one full rack cycle, which is what it exists to survive. |
| `HAT_COLOURS`, the four silhouettes | — | `render/Hats.ts` | Art. `palette.ts` is F04's (contracts §12). |

**Schema cost of `PlayerState.hat`, since §4 rejected auto-assignment partly on bandwidth grounds.**
Under `@colyseus/schema ^5.0.27` (`shared/package.json:18`, `game-server/package.json:14`) a
`@type('string')` field is delta-encoded, so **an unchanged hat costs 0 bytes per player per tick**
at 20 Hz. A change costs a field index, a length byte and the id — `assembly-a` is 10 characters, so
about **12 bytes** — plus 12 bytes per player in the full-state snapshot a joiner receives once.
`HAT_CHANGE_SECONDS = 0.15` caps one player at 6.7 changes per second ≈ 80 B/s, and a six-player
crew all mashing the rack at once is about 480 B/s. Negligible against the existing patch stream,
and it closes §4's argument with a number rather than an assertion.

The one config addition is layout geometry: **`LayoutConfig.props.hatRack?: Tile`, optional**, plus
its packed index in `walls`. Values in §3; the reason it is optional rather than required is in
*Risks*.

`config/game/copy.json` gains one top-level section, and `Copy` the matching field. **Every report
key is `string[]`, one element per rendered line** — that is what lets §6's 52-character width
budget hold without word wrap, and it lets F12 re-break any line without touching code. The four
bubble and toast keys are plain strings.

```json
"hats": {
    "claimed":       "{hat} IS MINE",
    "allTaken":      "EVERY HAT IS SPOKEN FOR",
    "paperHat":      "MADE FROM YESTERDAY'S REPORT",
    "whistle":       "ALL HANDS. ALL HATS.",
    "everyJobOwned": ["EVERY JOB HAD A NAME ON IT."],
    "allBusy":       ["EVERYONE WAS BUSY.", "NOBODY WAS WHERE THEY SAID THEY WOULD BE."],
    "nothingBehind": ["AND NOTHING PILED UP BEHIND THEM."],
    "pileUpBehind":  ["AND THE WORK PILED UP BEHIND THEM."],
    "unworn":        ["NOBODY WORE THE {hat} HAT TODAY"],
    "bestPost":      ["{name} said {hat} and meant it — {percent}%"],
    "bareheaded":    ["{count} OF YOU WORKED WITHOUT A HAT"],
    "solo":          ["{name} wore every hat in the building.", "There was nobody to hand one to."],
    "soloOne":       ["{name} wore the {hat} hat all day.", "There was nobody to hand it to."]
}
```

All thirteen are the game's own voice about the crew, rendered through `fill()`
(`shared/src/copy.ts:71`) where they interpolate — the class contracts §14 puts in `copy.json`, with
`copy.report.topPerformer` as the precedent for interpolating a name and `copy.clipboard` /
`copy.standupBubbles` as the precedent for a `string[]`. F12 owns the wording and may overrule any
of it; F17 owns the keys and the 52-character ceiling.

### Behaviour

#### `takeHat` (the `interact` link)

Appended to the chain at `handlers.ts:138`, between `stationInteract` and `tryBeginRepair`:

```ts
if (takeHat(ctx.world, ctx.player)) return;
```

Order is immaterial against `tryBeginRepair` (which fires only on a damaged station's work tile, and
§3 constraint 2 keeps the rack eight tiles clear of those), but inserting rather than editing leaves
every existing line in F03's file untouched.

`takeHat`, in order:

1. `rack = world.layout.props.hatRack`. If absent → return `false`.
2. `dir = FACING_DIRS[player.facing]`; `faced = tileOf(player) + dir`. If `faced` is not `rack` →
   return `false`. **These two are the only exits that let the chain continue.**
3. `store = hatStore(world)`. If
   `clock - (store.lastChangeAt.get(sessionId) ?? -Infinity) < HAT_CHANGE_SECONDS` → return `true`
   (consumed, nothing happens; the guard, §4).
4. `taken` = the hats of every **other** player in `state.players`.
5. `next = nextHat(player.hat, taken, hatOrder(world.level))`.
6. `next === '' && player.hat === ''` — nothing was free and they had nothing. If
   `store.rackFullSince !== null && clock - store.rackFullSince >= HAT_CHANGE_SECONDS` and the
   session is not in `allTakenTold`:
   `setBubble(world, player, copy.hats.allTaken, EMOTE_BUBBLE_SECONDS)` and add to `allTakenTold`.
   Either way set `lastChangeAt` and return `true`.
7. `player.hat = next`; `store.lastChangeAt.set(sessionId, clock)`;
   `store.announced.delete(sessionId)`;
   `world.fx('clink', rack[0] + 0.5, rack[1] + 0.5)` — an existing `FxKind` (contracts §4), and
   `x`/`y` are tile units for anything anchored to a tile (`shared/src/messages.ts:70`), so no
   module-local `tileCentre` helper is borrowed from F06.
8. Return `true`.

No stun, no chore, no shelf, no item, no `putDownSeconds`. Steps 1–8 write one schema field. **The
`claimed` bubble and the `paperHat` toast are not fired here** — they are fired from `tick` once the
hat has settled (§4), which is what keeps a fast cycle from spending them on hats nobody kept.

#### `hatsSystem`

```ts
export const hatsSystem: System = {
  name: 'hats',
  onStart(world) { /* re-zero the store; see below */ },
  tick(world, dt) { /* below */ },
};
```

**The store is created lazily by `hatStore(world)`, not at `onStart` and not at `init`.** §3 requires
lobby presses to work, and `takeHat` reads and writes `lastChangeAt` before the whistle, so a store
that did not exist until `onStart` would make the first lobby press throw or silently no-op — and
`hatReportFor` would have the same hole on a room that never started. The lazy accessor is also the
majority pattern in this codebase: `itemStore` (`items.ts:44`), `runtimeOf` (`groove.ts:27`),
`store` (`stations.ts:94`) and `hazards.ts:70` all create on first read. (`metrics.ts:51`, `:64-74`
is the exception, with `createMetrics` and a throwing `snapshotMetrics`; F17 does not follow it,
because F17 genuinely has a pre-`onStart` writer and metrics does not.)

**`onStart` re-zeroes the spans, `perHat`, `paperToasted`, `announced`, `allTakenTold` and
`rackFullSince` — and clears `lastChangeAt`. That last one is load-bearing and not tidy-up.**
`World.startDay` sets `state.clock = 0` (`World.ts:346`) *before* calling `onStart` (`:374`), so a
lobby `lastChangeAt` of 200 would leave `clock - lastChangeAt` negative and block the rack until the
clock passed 200.15 — the shift would begin with a dead rack. Clearing it in `onStart` is what
prevents that, and it is stated here because it is invisible otherwise. `bubbles.ts:24-26` carries an
explicit comment about this exact hazard for `lastEmoteAt`; the codebase has been bitten once
already. Test 21 covers it.

Appended to `SYSTEMS` **immediately before `reportSystem`** (contracts §11 fixes `reportSystem`
last so its `onDayEnd` sees the final state). It must run after `stationsSystem`, `itemsSystem` and
`hazardsSystem`, and the reason is now doubled: on-post is read off `stationId` / `workTile` /
`carrying` / `chore`, and `isBehind` is read off `inputShelf` / `inputCap` / `workers` — every one of
those is written by one of those three systems within the tick (`stations.ts:671` writes `workers`
from the station's own membership), so a hat sampled before them would judge a post the player left,
or a shelf, one tick out of date. It is **not** in `LOBBY_SYSTEMS` (`World.ts:102`) — the shift has
not started, so nothing is owed. Nothing here is sampled per second and nothing is retained, so there
is no cross-day carry-over to clear beyond the counters `onStart` already zeroes.

Each tick, in one pass over `state.players`:

```
worn = new Set<string>()
for each player with hat !== '':
    span = perPlayer[userId][hat]        // created lazily, zeroed
    span.seconds += dt
    if isOnPost(hat, player):
        span.onPost += dt
    else if hat !== FLOOR_HAT:
        st = state.stations.get(hat)     // the post this hat named, not wherever the player is
        if st && isBehind({ inputCap: st.inputCap,
                            workers: st.workers,
                            inputShelfLength: st.inputShelf.length }):
            span.backedUp += dt          // §6: the queue grew with nobody on it
    // no other bucket: everything else is off-post and unremarked, by design
    worn.add(hat)

    settled = clock - lastChangeAt[sessionId] >= HAT_CHANGE_SECONDS
    if settled and sessionId not in announced:
        announced.add(sessionId)
        setBubble(player, fill(copy.hats.claimed, { hat: hatLabel(hat, level) }), EMOTE_BUBBLE_SECONDS)
        if hat === FLOOR_HAT and not paperToasted:
            toast('all', copy.hats.paperHat, 'info'); paperToasted = true

for each h in worn: perHat[h] += dt      // once per hat, never once per wearer

rackFullSince = worn.size === hatOrder(level).length
    ? (rackFullSince ?? clock)
    : null
```

**Three things the loop deliberately does not do.** It never looks at `player.stationId` for
attribution, so there is nothing to bucket and no table of precedence to get wrong — where somebody
went is not a question F17 answers (§6). It never reads `StationState.utilization`, for the reason §1
and §6 both give with citations. And the **FLOOR hat is exempt by construction**: there is no station
whose queue is *the floor's*, so a floor hat's off-post seconds are always unremarked. That is the
right asymmetry — the floor is the job with no machine attached (§2), so there is nothing behind it
to pile up.

Spans are keyed by `userId`, matching `RunTally.players` (`tally.ts:42-43`) and F11's
`PlayerMetrics` (`metrics.ts:97-114`), so a player who leaves and rejoins lands in the row they left.
`lastChangeAt`, `announced` and `allTakenTold` are keyed by `sessionId`, because they are about a
connection's key presses rather than an account's shift.

`onStart` also fires the whistle line: if `state.players.size > SMALL_CREW` and every hat in
`hatOrder(level)` is worn, `world.toast('all', copy.hats.whistle, 'info')` (§3, §7.3).

#### `hatReportFor`

Per player, the winning hat is `max` by `seconds`, ties broken by (a) the hat currently worn, (b)
`hatOrder` position. Returns `{ hat, hatSeconds, onPostSeconds, offPostBackedUpSeconds }` per userId,
plus `perHat` as-is. **All four numbers come from the winning span and from no other**, so they stay
arithmetically consistent with each other: `onPost + backedUp <= seconds` for that one hat, and the
quiet remainder is the subtraction. Reporting the winning hat's seconds beside another hat's
`backedUp` would let §6's ratios exceed 1, which is how a verdict fires on a sum that never happened.
A player with no spans returns
`{ hat: '', hatSeconds: 0, onPostSeconds: 0, offPostBackedUpSeconds: 0 }`. It calls
`hatStore(world)`, so it is safe on a room that never started.

#### The three edits in `day.ts` (F11's file)

1. `playerRow` (`day.ts:71-87`) — it already takes **two** parameters,
   `(p: PlayerMetrics, tally: TallyRow)`, so `HatReportRow` is a **third**, not "a second argument"
   as an earlier draft said. It defaults to the zero row the way `NO_TALLY` at `:24-32` already does,
   and spreads all **four** of `hat`, `hatSeconds`, `onPostSeconds` and `offPostBackedUpSeconds`
   into the returned literal.
2. The `stations` map (`day.ts:142-145`) gains
   `hattedSeconds: Math.round(hats.perHat.get(cfg.id) ?? 0)`.
3. The payload literal (`day.ts:175-209`) gains
   `floorHatSeconds: Math.round(hats.perHat.get(FLOOR_HAT) ?? 0)` and
   `elapsedSeconds: Math.round(state.clock)` — the shift as played, which §6 needs as a denominator
   and the payload does not carry today.

`buildReport` calls `hatReportFor(world)` once at the top, beside `snapshotMetrics`. F17 adds no
`RunTally` key and no `metrics.ts` edit.

## Acceptance criteria

- [ ] `PlayerState.hat` is `''` on join, is written only by `takeHat`, and is **not** reset by
      `World.startDay` — a hat taken in the lobby is worn through the whistle, and the rack still
      responds on the first press after it.
- [ ] `E` facing the rack tile with no hat puts the first free hat on the presser, instantly: no
      stun, no chore, no movement freeze, and the press consumes nothing else in the chain.
- [ ] `E` facing anything else falls through `takeHat` untouched; every existing `interact`
      behaviour (pick up, put down, shelf, broom hook, unjam lever, station join, repair) is
      unchanged.
- [ ] `E` at the rack with hands full still takes a hat, because a wall tile refuses a put-down.
- [ ] `E` cycles station-by-station in level order, then `floor`, then bareheaded, and wraps.
- [ ] A hat another player is wearing is skipped by the cycle and can never be taken from them.
- [ ] A second press inside `HAT_CHANGE_SECONDS` changes nothing and is still consumed.
- [ ] A settled hat bubbles `copy.hats.claimed` once; a hat cycled through does not bubble at all
      and does not fire the paper-hat toast.
- [ ] Every press clinks, including the transient ones inside a cycle.
- [ ] With every hat taken and the rack full for at least `HAT_CHANGE_SECONDS`, a bareheaded presser
      gets `copy.hats.allTaken` once per shift and no hat; a hatted presser toggles between their
      hat and bareheaded.
- [ ] A hat is on its peg exactly when no player in `state.players` wears it; a disconnect after the
      grace, an eviction and a quit all return it with no F17 code.
- [ ] A player driven off on a truck keeps their hat and their peg stays bare.
- [ ] The board draws a filled glyph for a **hanging** hat and a hollow one for a taken hat, and
      pulses only the hanging ones, only above `SMALL_CREW`, only while running.
- [ ] `hatsSystem` accrues seconds only while `phase === 'running'`, and `perHat` counts a second
      once no matter how many times the hat changed hands that second.
- [ ] On-post seconds accrue for a station hat only while `stationId` names it and `workTile !== ''`,
      and for `floor` only while off a station **and** carrying something or on a chore.
- [ ] `offPostBackedUpSeconds` accrues only for an off-post tick where the station the player's hat
      names has `inputCap > 0`, `workers === 0` and its input shelf at least `HAT_BACKLOG_FULLNESS`
      full — read live from schema F05 writes, never from `StationState.utilization` and never from
      `payload.bottleneck`.
- [ ] The FLOOR hat never accrues `offPostBackedUpSeconds`, and neither does a hat whose station has
      no input shelf.
- [ ] A player standing in their **own** station's floor ring is counted in that station's `workers`,
      so their hat can never be billed as having left a queue behind — no special case required.
- [ ] `onPost + backedUp ≤ seconds` for every span, so a lost second can only fall out of the
      accusation and into the quiet remainder.
- [ ] `allBusy` fires on the whole of its trigger and is never diverted to a sibling branch; the
      qualifier under it prints `nothingBehind` at or below 0.2, `pileUpBehind` at or above 0.5 with
      at least `HAT_OFF_POST_MIN_SECONDS` of backed-up time, and **nothing in between**.
- [ ] No headline or qualifier fires unless at least **one player's** `hatSeconds − onPostSeconds`
      reaches `HAT_OFF_POST_MIN_SECONDS` — a crew sum of short absences never clears it.
- [ ] `unworn` and the bareheaded count both test against `hatCoverageFloor(elapsedSeconds)`, so a
      full rack cycle can neither silence `unworn` nor exempt a player from the count.
- [ ] `bareheaded` fires only at `count >= 2` and only when `players.length <= hatOrder(level).length`.
- [ ] `bestPost` is eligible only for a player with at least `hatCoverageFloor(elapsed)` and half the
      elapsed shift on their winning hat, breaks ties by on-post seconds then `hatOrder`, and is
      suppressed both when `nothingBehind` printed and when a second player shares the winner's hat.
- [ ] A bareheaded avatar paints byte-identically to today: 20 × 5 in `lineColour`, no silhouette.
- [ ] A hatted avatar keeps the 20 × 2 brim in `lineColour` and recolours only the crown, so the
      line channel survives for M2.
- [ ] The hat envelope does not intersect F16's gauge, F06's chore bar or the name label, and no hat
      colour collides with a line, player or groove colour.
- [ ] A sooted hat is dark with a 1 px outline in its own colour — still identifiable.
- [ ] `buildReport` fills `hat`, `hatSeconds`, `onPostSeconds` and `offPostBackedUpSeconds` per
      player, `hattedSeconds` per station, and `floorHatSeconds` and `elapsedSeconds` on the payload,
      at every crew size.
- [ ] Each certificate row carries its player's peg letter and hat label, and nothing when
      `hat === ''`.
- [ ] `hatLines` never returns more than `HAT_LINE_CAP` strings, never a string longer than
      `HAT_LINE_CHARS`, and never a per-player percentage for anybody but the single best.
- [ ] The headline slot prints exactly one of `everyJobOwned` and `allBusy`, or nothing — never two
      — and the qualifier prints only under `allBusy`.
- [ ] `bareheaded` prints a count and no name.
- [ ] At two players or fewer, `unworn`, `bestPost`, `bareheaded` and both headlines are suppressed
      and the pulse is off; at exactly one player, `solo` or `soloOne` prints whenever the player
      touched the rack at all.
- [ ] No hat writes `groove`, `score`, `speed`, `efficiency`, `workers`, `combo`, a Groove event or
      a `RunTally` key, and no hat gates a station join.
- [ ] A client cannot set, move or clear any `hat` — its own or anybody else's — by any message.

## Test plan

**`shared/tests/hats.test.ts`** (vitest, pure)
1. it lists the level's stations in order, then the floor hat
2. it takes the first free hat from bareheaded
3. it skips a hat another player is wearing
4. it returns bareheaded past the last peg
5. it returns bareheaded when every other hat is taken
6. it wraps from bareheaded back to the first hat
7. it counts on-post at the station the hat names and not at another
8. it counts the floor hat on-post only with a carried item or a chore
9. it labels a station hat with `STATION_LABEL` and the floor hat `THE FLOOR`
10. it letters pegs `P` `A` `D` `F` on a one-line level and `P1` `A1` `D1` `P2` `A2` `D2` `F` on a
    two-line one
10a. **`isBehind` is true only for a station with an input shelf, nobody on it, and the shelf at
    least half full** — and is false for `inputCap === 0` however full anything else is, false with
    `workers > 0`, and false below `HAT_BACKLOG_FULLNESS`
10b. `hatCoverageFloor` returns 30 below a 600 s shift and `0.05 × elapsed` above it

*(The tests added by this pass carry letter suffixes where they belong beside an existing test —
`20a`, `43a` and so on — rather than renumbering fifty-two entries other sections cite by number.)*

**`game-server/tests/hats.test.ts`** (vitest, `makeWorld({ players: 3 })` unless noted)
11. it takes a hat on `E` facing the rack tile and writes nothing else
12. it ignores `E` facing any other tile and lets the chain continue
13. it takes a hat with hands full
14. it ignores a second press inside the cooldown
15. it bubbles `allTaken` once per shift when nothing is free and leaves the presser bareheaded
16. **it toggles a hatted player between their hat and bareheaded when every other hat is taken**,
    and never bubbles `allTaken` for them (crew 5)
17. it bubbles `claimed` for a settled hat and not for one cycled through
18. **it does not toast the paper hat for a cycle that passes through the floor hat**, and toasts it
    once for a cycle that stops on it
19. it accrues no seconds in the lobby and accrues them while running — and a lobby press still
    writes `hat` and arms the cooldown, with the store created on first read
20. it accrues on-post seconds only at the post the hat names
20a. **it bills `backedUp` against the post the hat names and never against where the player is
    standing** — an Assembly hat working the Dock's tiles while Assembly's shelf sits full and empty
    accrues `backedUp`; the same player accrues none once somebody else joins Assembly
20b. **it never bills `backedUp` for a station with no input shelf, nor for the FLOOR hat** — a Dock
    hat away from an idle dock all shift accrues nothing, which is the flagship case in §1
20c. **it never lets the buckets exceed the span** — `onPost + backedUp ≤ seconds` over a 600 s
    three-player shift with shelves filling and draining, so a lost second can only fall out of the
    accusation
20d. **a player in their own station's floor ring is counted in `st.workers`** (`stations.ts:671`),
    so `isBehind` is false and no special case is needed — the degenerate row an earlier draft
    carried is asserted absent rather than removed silently
20e. **the swarm does not manufacture its own credit** — four players pile onto `assembly-a` while
    `powder-a` sits empty; no player's `backedUp` moves on account of Assembly being busy, and the
    figure says nothing whatever about Powder, which has no input shelf (§6, limitation 1)
21. **it takes a hat in the lobby, runs `startDay`, and the very next press lands** — `onStart`
    clearing `lastChangeAt` is what keeps the clock rewind from blocking the rack
22. **it does not take a hat from a diagonally adjacent station floor-ring tile** — the press joins
    the station instead (the case §3 constraint 2's 8-way form exists for)
23. it does not take a hat for a `press`-station member (frozen) or for a `stand`-station member
    pressing away from the rack
24. **authority — a press from a tile not adjacent to the rack leaves the presser's `hat` at `''`
    and every other player's `hat` untouched**
25. **authority — at a full rack, the presser ends bareheaded and no other `PlayerState.hat` moves**
26. **authority — a burst of `interact` from one session never writes another session's `hat`**
27. **authority — `mg`, `action` and `emote` never write `hat`**
28. it returns the hat to its peg when the player is removed
29. it keeps the hat through a blast knockback and through `explosionEndsRound`
30. **adversarial accounting — a hat that changes hands is billed once, and a hat re-taken keeps its
    span.** Three players, 600 s of shift. A wears `dock-a` for 150 s on a dock work tile; A cycles
    off it and **B takes `dock-a` within the same tick**, wearing it on a dock work tile for the next
    150 s; C holds `assembly-a` throughout. Then A takes `powder-a`, cycles the whole rack three full
    loops (presses spaced by `HAT_CHANGE_SECONDS` so each lands), ends back on `powder-a` and stands
    on the powder work tile for 300 s. Assert:
    - `perHat.get('dock-a') ≈ 300` — the **union** of wall clock, not `150 + 150` double-billed and
      not `300 +` the overlap; and the handover tick is billed exactly once;
    - `players.get(A).hat === 'powder-a'` with `hatSeconds ≈ 300` and `onPostSeconds ≈ 300` — one
      merged span across four separate takes, not three sub-second fragments;
    - A's `dock-a` span in `perPlayer` is still ≈ 150 s and does not win the longest-worn tie;
    - each hat A passed through carries under a second;
    - a burst of twenty presses inside one second lands at most `1 / HAT_CHANGE_SECONDS` changes.

    These are the two real bugs available here: summing per-player spans into a station total, and
    losing accumulation across a re-take. **The handover is what makes the first one reachable** —
    an earlier draft asserted `perHat.get('dock-a')` was "not 600" in a scenario where only one
    player ever wore `dock-a`, so 600 was unreachable and the assertion was vacuous.

**`game-server/tests/report.test.ts`** (F11's file, three added tests)
31. it carries hat, hatSeconds, onPostSeconds and offPostBackedUpSeconds into every player row
32. it reports hattedSeconds 0 for a station nobody's hat named
33. it reports floorHatSeconds from the floor hat's span and `elapsedSeconds` as the rounded clock,
    including on a shift that ended early on the book rather than on the whistle

**`resources/js/game/__tests__/hats.test.ts`** (vitest)
34. it returns no rectangles for a bareheaded player and a distinct silhouette per hat
35. it keeps the hat envelope clear of the fumble gauge, the chore bar and the name label
36. it uses no colour from `LINE_COLOURS`, `PLAYER_PALETTE` or `GROOVE_COLOURS`, and every pair of
    hat colours differs by ≥ 48 in one channel
37. it derives one peg per station plus the floor peg from the level
38. **it draws a filled glyph for a hat nobody is wearing and a hollow one for a hat somebody is**
39. **it pulses the plate of a hat nobody is wearing and never the plate of a hat somebody is**, and
    not at all at or below `SMALL_CREW`
40. it prints `unworn` once per unclaimed job, at most twice, and never for a claimed one —
    **including the juggling case the design invites**: a payload where every station carries 1 s of
    `hattedSeconds` from one player cycling the rack twice still prints `unworn` for all of them
41. it prints `bestPost` for exactly one player and never a percentage for anybody else; it skips a
    player whose `hatSeconds` is under the eligibility floor even when their ratio is 1.0; it breaks
    a tie by on-post seconds and then `hatOrder`, not by payload order; and it prints nothing when
    two players share the winner's hat
42. it prints `bareheaded` with a count and no name — and **does not print at all** when the count is
    1, nor when `players.length` exceeds the number of hats (the M1 five- and six-player cases), nor
    for a player whose only hat time is a 0.15 s touch, who is counted as bareheaded
43. it fires `allBusy` only on its full condition, `everyJobOwned` only on its two, and never both
43a. **it prints the qualifier only inside its bands** — on one payload with only
    `offPostBackedUpSeconds` varied: at 0.1 × offPost → `nothingBehind`; at 0.35 → nothing; at 0.7
    with 40 s of backed-up time → `pileUpBehind`; at 0.7 with 10 s of it → nothing
43b. **the floor is a span and not a crew sum** — six players each 6 s off post (36 crew-seconds,
    every absence under 30) prints no headline; one player 31 s off post prints one. The regression
    this pass exists to prevent, written as its own test
43c. it suppresses `bestPost` on a payload where `nothingBehind` printed and prints it on an
    otherwise identical payload where `pileUpBehind` did
43d. `everyJobOwned` prints on a payload whose `elapsedSeconds` is 420 with every hat covered for
    400 s — the early-finish case that `level.day.shiftSeconds` as a denominator would have made
    unreachable — and prints above a `NEEDS FOCUS` row, deliberately (§6)
44. it suppresses `unworn`, `bestPost`, `bareheaded` and both headlines at or below `SMALL_CREW`,
    and prints `soloOne` at one player with one hat and `solo` at one player with two
45. **it returns at most `HAT_LINE_CAP` strings, each at most `HAT_LINE_CHARS` characters**, on a
    six-player payload with every line eligible

**In the running app** (three players unless noted, one shift)
46. Three players take three different hats in the lobby; every client shows three different
    silhouettes and three bare pegs, and the whistle toasts `ALL HANDS. ALL HATS.` Screenshot.
47. **The readability test the rack has to pass.** Photograph the board at play distance,
    mid-shift, with a fire on the floor, and confirm somebody who has not read this doc can name the
    unowned job in under two seconds. If they cannot, the rack is a HUD line rather than a tile and
    §1 consequence 2 needs re-arguing rather than asserting. Screenshot.
48. One player disconnects; their hat returns to its peg within a patch of the grace expiring.
49. A blast soots the crew; all three hats stay on and stay distinguishable. Screenshot.
50. One player trips carrying a keg; their own hat tumbles and is back on their head. Screenshot.
51. The day report at **six** players with every line eligible: the hat block fits inside the sheet
    and does not push the rule, the station block or the buttons off the card. Screenshot.
51a. **The two shifts that must not read the same, counted rather than eyeballed.** Play one shift
    where the crew deliberately leaves its posts but keeps every claimed post covered or quiet, and
    one where the crew deliberately piles onto the Jig and leaves its shelf filling with nobody on
    it. The first card must print `allBusy` + `nothingBehind`, the second `allBusy` + `pileUpBehind`.
    Screenshots of both.

    **And log which branch fired across every playtest session, so the shape is falsifiable rather
    than asserted.** The expectation stated now: `allBusy` fires on most six-player shifts (it
    carries the whole trigger and is never diverted), and the qualifier is absent — the dead band —
    on a large minority. **If `allBusy` fires on fewer than about one shift in four, the trigger is
    wrong and no amount of re-wording fixes it.** If the qualifier is absent on nearly every shift,
    `offPostBackedUpSeconds` is not earning its payload field and the honest response is to drop the
    field and the two qualifier keys and ship `allBusy` + `everyJobOwned` alone — which is where this
    doc started, and would be no loss to the line the feature exists for.
52. **The uptake gate.** In a six-player playtest with no instruction beyond the help row, did
    anybody take a hat unprompted inside the first minute? If the answer is no across three
    sessions, F17 is scenery and the claim bubble was not enough. See *Risks*.

## Tasks

- [ ] 1. `shared/src/sim/hats.ts` + `shared/tests/hats.test.ts` green (tests 1–10, 10a and 10b,
      including `isBehind` and `hatCoverageFloor`); one `export *` line in `shared/src/index.ts`.
- [ ] 2. `PlayerState.hat`; `LayoutProps.hatRack?` in `config/types.ts`, `schema.json` and
      `validate.ts` (the 8-way rule); `props.hatRack: [8,8]` + packed `232` in
      `config/game/layouts/one-line.json` and `DEV_LAYOUT`; existing layout tests green.
- [ ] 3. `game-server/src/sim/hats.ts` `hatStore` + `takeHat` + the `handlers.ts` line — tests
      11–18, 22–28 green.
- [ ] 4. `hatsSystem` and the `systems.ts` line — tests 19–21, 20a–20e, 29–30 green, including the
      adversarial one and the `isBehind` accounting (§6).
- [ ] 5. `shared/src/report.ts`'s three interfaces — **four** new `PlayerReport` fields, one on
      `StationReport`, two on `ReportPayload` — and `day.ts`'s three edits — tests 31–33 green.
- [ ] 6. `render/Hats.ts`: `hatShape`, `HAT_COLOURS`, the geometry and colour assertions — tests
      34–36 green.
- [ ] 7. `Avatars.ts`'s four edits and the `Factory.create()` mount line; the rack, its glyphs and
      its pulse — tests 37–39 green. In-app steps 46–47.
- [ ] 8. `config/game/copy.json` + `shared/src/copy.ts` + `shared/tests/copy.test.ts`'s `hats`
      section green.
- [ ] 9. `format.ts`'s `hatLines` — the two-branch headline slot, the qualifier with its dead band,
      the coverage floor and the `bestPost` eligibility and suppressions — plus `Report.ts`'s chip
      line and four-line block — tests 40–45 and 43a–43d green. In-app steps 51 and 51a.
- [ ] 10. `helpContent.ts`: one row — `['At the hat rack', 'E takes the next free hat. Press again to
      swap or to go bareheaded. A hat is a promise, not a job.']`. The five remaining fixture
      layouts. In-app steps 48–50, 52; tick the Status boxes.

## Risks & open questions

- **F17's uptake depends on players choosing to inform each other, and the incentives do not help.**
  The benefit of a claim accrues to everybody else; the risk of not honouring it accrues to you.
  §4 spends everything §2 allows on making the press feel like something — a clink, a costume
  change, a bubble — but none of it changes an outcome, by design. **In-app step 52 is the gate**:
  if three six-player sessions pass with nobody touching the rack unprompted in the first minute,
  the rest of this doc is scenery, and the honest response is to re-open §2, not to add more copy.
  Watch it before Level 2 tuning, not after.
- **F15 replaces the layout files F17 edits, whole.** `F15:6` says
  `config/game/layouts/one-line.json` is a whole-file replacement, and F15 also replaces
  `DEV_LAYOUT`, `shared/tests/fixtures/{level-m1,layout-one-line}.json` and three
  `game-server/tests/fixtures` layouts. If F17 landed first with `hatRack` **required**, F15's
  replacement would silently drop it and every layout would then fail validation at boot under
  `additionalProperties: false`. **Mitigation, and the reason for the shape in contract change 6:
  `hatRack` is optional.** The rack is simply not drawn and `takeHat` returns `false` when the key
  is absent, so a re-lay can never break the build — it can only turn the feature off until somebody
  puts the key back. **Add a line to F15's own doc so its author carries `hatRack` through the
  replacement.** Preferred order is still F17 after F15.
- **F11's left column has about 80 px of slack at six players and F17 spends 70 of it.** §6 does the
  arithmetic. F17 fits; the next feature to add a left-column line will not, and `Report.ts`'s
  `line()` neither wraps nor clamps, so the failure mode is content running off the card rather than
  an error. This is F11's ceiling and F11 should know about it.
- **The `Avatars.ts` edit is the one place F17 cannot route around.** F04's owner has to grant four
  lines. If declined, the hat can only be drawn from a separate layer, and §5 explains why that
  drifts against the bob, the wobble, the y-sort (`Avatars.ts:236`) and the truck-ride hide. There is
  no third option that keeps the hat on the head.
- **Four hats and up to ten players, and the M2 board.** ADR 0011 allows ten; M1 caps at six on one
  line. At six, two players are always bareheaded, and §4's toggle analysis means `allTaken` fires at
  most twice all shift rather than "a lot". The correct answer to a crowd is more jobs, not more
  hats: M2's Casing Prep, QA and Packing each bring a peg. **But seven pegs of two-character letters
  do not fit a 24 px tile** — M2 needs a two-tile board and a second `walls` entry (§3), and the peg
  letters gain a line suffix (§2). A named M2 edit, not a free extension.
- **The Dock has four work tiles and one hat.** Four people can legitimately load a truck; only one
  can own the Dock. That is intended — the hat names the owner of the job, not the headcount — but
  a Dock owner who was there the whole time while three others also loaded will win `bestPost` at
  100% and the line says nothing about the three. Accepted: the report already has
  `StationReport.utilization` for headcount effects.
- **The cliff at three players.** Every gate flips at `players.length > SMALL_CREW`, so a third
  player joining switches `unworn`, `bestPost`, `bareheaded` and the pulse on all at once. A
  three-player crew has much of the same "I do every leg myself" problem §8 uses to justify
  suppressing them at two. Watch it in playtest. The mitigation is already in place — the only
  per-player number is a compliment (§6) — which is what makes the cliff mild rather than a
  personality change.
- **`hattedSeconds` and `floorHatSeconds` are stored, not dropped.** `StoreRunRequest::rules()`
  (`app/Http/Requests/StoreRunRequest.php:20-40`) is an open required-key list rather than a closed
  schema, so the new fields validate; and `StoreRun` writes the **whole** payload into `runs.metrics`
  (`app/Actions/StoreRun.php:64`) and the whole player row into `run_players.stats`
  (`StoreRun.php:91`, `database/migrations/2026_09_05_123709_create_run_players_table.php:16`, both
  `jsonb`) — the request's own docblock says so at `:15-16`. **F17 asks for no migration because the
  JSON columns already hold them**, not because they are discarded. An M2 history screen can read
  them straight out of `stats` without a schema change; only a query that needs to *filter* on them
  would want columns. (An earlier draft said they were discarded, which would have sent an M2
  builder adding columns for data already stored.)
- **Every threshold in the report block is taste, and none of them is derived.** The complete list,
  because an earlier draft listed three of seven and called one of the others "not taste": `0.9` for
  `everyJobOwned`'s coverage; `0.6` for its cost ratio; `0.5` for the on-post trigger; `0.2` and
  `0.5` for the qualifier's dead band; `HAT_BACKLOG_FULLNESS = 0.5`; `HAT_OFF_POST_MIN_SECONDS = 30`;
  and `hatCoverageFloor`'s `30` and `5 %`. All of them live in `format.ts` or
  `shared/src/sim/hats.ts` beside each other, all move without a schema change, and step 51a's branch
  log matters more than any of them. **The one to watch is the on-post trigger**, which is the last
  knife edge left in the block: at `0.5` exactly, one second decides between a headline and no
  headline. That is a line-versus-silence edge rather than praise-versus-blame — the dead band moved
  the sharp one — but it is still an edge and it is written down here rather than defended.
- **`HAT_OFF_POST_MIN_SECONDS` gates a per-player total, not a contiguous absence.** Taking the max
  over players fixed the unit error (§6), but somebody who leaves five times for six seconds still
  clears a thirty-second floor. Counting only contiguous runs would need per-player escrow in `tick`
  — hold the seconds, commit them when the run qualifies, discard them when it does not — and F17
  declines to buy that, because the report is a statement about a shift rather than about an episode.
  If playtest shows the headline firing on crews nobody would describe as having left their posts,
  that escrow is the fix and it is about fifteen lines.
- **On M1's floor the accusation can only ever be about one job.** Only `assembly-a` declares an
  `inputShelf` on Level 1 (`level-01-basic-flow.json:93`), so `isBehind` is false for `powder-a` and
  `dock-a` forever and `pileUpBehind` is, in practice, a sentence about the Jig. §6 states it as
  limitation 1 and the bias runs the safe way — under-accusation, never over-accusation — but it does
  mean the figure earns its payload field mostly in M2, where Casing Prep, QA and Packing each bring
  a shelf. **If step 51a's log shows the qualifier absent on nearly every M1 shift, drop the field
  and both keys** rather than loosening `isBehind`; §6's whole argument is that a vaguer true line
  beats a confident wrong one, and that applies to F17's own additions first.
- **The card now teaches "do not leave a queue filling behind the job you claimed."** That is a
  better lesson than the rejected instrument's (*stand in the busy ring, and do not be the one
  carrying things*) and it is still a nudge — mildly toward your own post and mildly against
  reallocation, which is the pull §1 spends its whole argument resisting. The two carve-outs that
  hold it in check are deliberate: the accusation needs the post **unstaffed**, so handing your job
  over before you go costs nothing, and it needs the shelf **actually filling**, so leaving a quiet
  post is free. Watch it in the same playtest as step 52; a crew that stops helping each other
  because of a report line is visible as people standing still.
- **On-post for the floor hat measures hands, not legs** (§6). A hauler who spends the shift walking
  to pickups scores lower than one who stands holding a keg. Stated rather than hidden; if playtest
  says it is unfair the honest fix is to count `moving && stationId === ''` as a third clause, which
  is one line in `isOnPost` and one test.
- **Two names that must not merge.** `PlayerState.role` (F13, crew permissions) and
  `PlayerState.hat` (F17, job claim). Also `StationConfig.rackTiles` (F05/F08: the Jig's *fuse*
  rack, `F15:470-593`) versus `props.hatRack`. Neither pair is related; the docs and the code use
  the full name in both cases and never bare "rack" for the hat board.
- **Open question for F12.** `copy.hats.allBusy` is the most quotable line in the game and it is
  also the most likely to be reworded. F17 has no opinion beyond the shape: two lines, the first
  conceding the crew's effort, the second taking it away, each inside 52 characters. Its two new
  new qualifier lines sit *under* it and must not compete with it: `nothingBehind` must read as a
  flat statement of fact and never as applause — the crew did the right thing and the card noticing
  is the whole reward — and `pileUpBehind` must stay nameless, because the certificate rows two
  blocks above carry a hat chip and a named job is a named person (§6). **Neither may assert where
  anybody went**, in either direction: the floor cannot see that, and copy that implies it would
  claim more than the instrument knows.

## Contract changes required

Apply in the next contracts pass. `§` numbers are `docs/features/00-contracts.md` sections.

1. **§3 `PlayerState`** — add one field after `combo n;`:
   `hat s ('' | a station id | 'floor');`. Schema default `''`.
   File: `shared/src/schema/PlayerState.ts` (F02) after line 26 — `@type('string') hat = '';`.
   **Writer: F17** (`game-server/src/sim/hats.ts`, `takeHat` and `hatsSystem.tick` only). Add to
   §3's *Writers by field group* a new line: `F17 — PlayerState.hat, and PlayerState.{bubble
   bubbleUntil} on a settled hat and at a full-rack press`. It is **not** listed in §3's *Schema
   defaults* exceptions (plain `''`).
   **Explicitly: `hat` is NOT added to the fields `World.startDay` re-zeroes (§10.1,
   `World.ts:349-373`).** A hat taken in the lobby is worn through the whistle; that is the design,
   not an oversight, and §10.1's list should say so in a parenthesis.
   Not to be confused with F13's `PlayerState.role` (crew permissions, F13 contract change 2).
   *Bandwidth, for the record in §3:* delta-encoded under `@colyseus/schema ^5.0.27`, so 0 bytes per
   tick when unchanged and ~12 bytes on a change; ~480 B/s worst case for a six-player crew mashing
   the rack.

2. **§9 report — three interfaces, seven fields.** Every one is required, so each is a compile error
   in a file F17 does not otherwise open; the files are named:
   - `shared/src/report.ts:23-36` (F02) — `PlayerReport` gains
     `hat: string; hatSeconds: number; onPostSeconds: number; offPostBackedUpSeconds: number;`
     after `truckRides`. **Four fields, not five** — an earlier draft asked for two off-post buckets
     split against a live bottleneck sample, and §6 withdraws that request in full: the pressure it
     would have been sampled from is written only for staffed stations (`metrics.ts:130`, `:189`;
     `stations.ts:719-739`), so it could credit joining a crowd and never filling a vacancy. The one
     field that remains is measured from a shelf and a headcount, neither of which needs anybody to
     be standing anywhere.
   - `shared/src/report.ts:18-21` (F02) — `StationReport` gains `hattedSeconds: number`.
   - `shared/src/report.ts:53-81` (F02) — `ReportPayload` gains
     `floorHatSeconds: number; elapsedSeconds: number`. **`elapsedSeconds` is asked for by F17 and is
     useful beyond it:** the payload carries no clock today, so every share-of-the-shift figure in
     §6 had no denominator, and the only candidate already in the payload —
     `wipTimeline.length - 1` (`metrics.ts:53-61`, `:180`) — is correct arithmetic resting on an
     incidental property of F11's sampler that would break silently if it were ever reseeded.

   **No fourth field.** An earlier draft's solo line needed a per-player `hatsWorn` count that the
   payload could not supply; §8 now restricts the line to exactly one player and derives the count
   from `stations[].hattedSeconds` and `floorHatSeconds`, where the attribution is unambiguous.

   Add to §9's *Semantics* paragraph: "`PlayerReport.hat` is the hat worn for the largest share of
   the shift (`''` when the player never took one), ties broken by the hat worn at the whistle then
   by `hatOrder` position; `hatSeconds` is that hat's total and `onPostSeconds` the part of it spent
   at the post it names. `offPostBackedUpSeconds` is the part of the remainder during which the
   station that hat names had an input shelf, nobody on it (`StationState.workers === 0`) and that
   shelf at least half full — a statement about **what was left behind**, never about where the
   player went, which nothing in the payload knows. It is never derived from
   `StationState.utilization` or from `ReportPayload.bottleneck`. The quiet remainder,
   `hatSeconds − onPostSeconds − offPostBackedUpSeconds`, is recoverable only by subtraction, so a
   lost second falls out of the accusation rather than into it. All four numbers describe the one
   winning hat, so they are consistent with each other and with nothing else.
   `StationReport.hattedSeconds` and `ReportPayload.floorHatSeconds` are seconds during which
   **at least one** player wore that hat — not a sum over players, so a hat handed from one player to
   another inside one second bills that second once. `ReportPayload.elapsedSeconds` is the shift as
   actually played, `Math.round(state.clock)` at day end, which is not
   `LevelConfig.day.shiftSeconds` on any shift that ended on the book."

3. **§10.7 — the report build.** Three named edits in F11's `game-server/src/sim/day.ts`:
   - `:71-87` — `playerRow` already takes two parameters (`p: PlayerMetrics, tally: TallyRow`) and
     gains a **third**, `HatReportRow`, with a zero-row default on the `NO_TALLY` pattern at
     `:24-32`; it spreads the **four** fields into its literal.
   - `:142-145` — the `stations` map gains `hattedSeconds: Math.round(hats.perHat.get(cfg.id) ?? 0)`.
   - `:175-209` — the payload literal gains
     `floorHatSeconds: Math.round(hats.perHat.get(FLOOR_HAT) ?? 0)`.

   `buildReport` calls `hatReportFor(world)` once beside `snapshotMetrics`. Add to §10.7's module
   list: `// game-server/src/sim/hats.ts (F17)` with `hatStore`, `takeHat`, `hatsSystem`,
   `hatReportFor`. **F17 adds no `RunTally` key and no `metrics.ts` edit** — hats are duration, not
   events, and F11's `secondsAtStation` answers a different question (§10). It reads no F11-owned
   field at all: it reads `StationState.{inputShelf, inputCap, workers}`, all written by F05
   (`game-server/src/sim/stations.ts:593`, `:671`). **Record in §10.7 the finding that made that
   choice**, because the next feature to reach for a "where is the line stuck" signal will reach for
   the same wrong one: `StationState.utilization` (`metrics.ts:189`, sole writer) is derived from
   `state === 'working'`, and `writeState` reaches `'working'` only with operators and `'starved'`
   only with operators (`stations.ts:719-739`, `:734`), so **an unstaffed station reads zero pressure
   however full its shelf is** and `bottleneckStation` can never name it. That makes
   `utilization × inputShelfFullness` a measure of where the crew is, not of where the line is stuck:
   the right figure for F11's own whole-shift summary and the wrong one for judging a reallocation.

   Also in F11's files, granted by this pass rather than as Touches (F11 is already
   `[x] Implemented`, so these are edits to shipped code): three tests in
   `game-server/tests/report.test.ts`; one exported `hatLines` in
   `resources/js/game/report/format.ts`; and in `resources/js/game/scenes/Report.ts` one text object
   inside `individualColumn`'s existing certificate loop (`:181-201`) plus a four-line `hatLines`
   block after `topPerformer` (`:205-222`).

4. **§11 dispatch — one inserted line.** `game-server/src/rooms/handlers.ts:138`, between
   `stationInteract` and `tryBeginRepair`: `if (takeHat(ctx.world, ctx.player)) return;`. No
   existing line is edited. Update §11's `interact` row to:
   `items.onInteract → stations.onInteract → hats.takeHat → hazards.tryBeginRepair`, entry owner
   unchanged (F06), with F17 appending its call the way F05 and F10 already do.

5. **§11 `SYSTEMS` order** becomes
   `… → dockSystem (F09) → grooveSystem (F11) → hatsSystem (F17) → reportSystem (F11, tick = metricsTick)`,
   with the reason recorded: on-post is read off `stationId`/`workTile`/`carrying`/`chore`, which
   `stationsSystem`, `itemsSystem` and `hazardsSystem` all write within the tick, and `reportSystem`
   must stay last. One line in `game-server/src/sim/systems.ts` (F03). `hatsSystem` is **not** added
   to `LOBBY_SYSTEMS` (`World.ts:102`), and its store is created by a **lazy accessor** rather than
   in `init` or `onStart`, because `takeHat` runs in the lobby before either would have fired —
   the `itemStore` / `runtimeOf` / `store` pattern, not `metrics.ts`'s `createMetrics`.

6. **§8 `LayoutConfig`** — `props` gains a fifth key, **`hatRack?: Tile`, optional**. Files:
   `shared/src/config/types.ts:381-386` (`LayoutProps`) and
   `shared/src/config/schema.json:1516-1539` (the `props` block: `"hatRack"` added to `properties`
   as `{ "$ref": "#/definitions/Tile" }` and **not** added to `required`). Amend §8's `LayoutConfig`
   prose to say four `props` are required and `hatRack` is an optional fifth, and amend its wall
   sentence, which already lists "hooks", to name the hat rack among the furniture that **is** a wall.

   *Optional, not required, for one reason:* F15 replaces every layout file whole, and a required
   key would turn that replacement into a boot failure across all seven sources. Optional degrades
   to "no rack drawn" instead. See *Risks*.

   **A semantic rule for `validateLevelOnLayout`** (`shared/src/config/validate.ts`, F02), beside
   the existing shelf-neighbour check, applied only when `props.hatRack` is present: the tile must
   be in `walls`, in bounds, and **none of its eight neighbours** may be a station's `workTiles`,
   `rackTiles`, `inputShelf.tile`, `outputShelf.tile` or `floorRing.tiles`, and all eight must be
   walkable. *Eight, not four:* `FACING_DIRS` (`shared/src/sim/items.ts:13-21`) is 8-way and
   `items.onInteract:546-551` faces over all eight, so a diagonal ring tile would let
   `stations.onInteract` claim the press first (`stations.ts:491-502`) and the rack would silently
   never respond from that tile. JSON Schema cannot express the adjacency and nothing else would
   catch it.

7. **§8 layout files** — `props.hatRack: [8, 8]` and packed index `232` appended to `walls`. The
   complete set is **seven** sources:
   1. `config/game/layouts/one-line.json` (F12/F15)
   2. `game-server/src/config/devLevel.ts`'s `DEV_LAYOUT` (F03, `:388-393`)
   3. `shared/tests/fixtures/layout-one-line.json` (F02)
   4. `game-server/tests/fixtures/layouts/one-line.json` (F03)
   5. `game-server/tests/fixtures/bare/layouts/one-line.json` (F03)
   6. `game-server/tests/fixtures/broken/layouts/one-line.json` (F03)
   7. `tests/Fixtures/game/layouts/one-line.json` (F01, contracts §12 `tests/**`, loaded by
      `tests/Pest.php:24-26` and `tests/Feature/Console/SyncLevelsTest.php:17-18`) — missing from
      an earlier draft's list.

   Because the key is optional, only 1 and 2 are required for the feature to work and no lagging
   fixture can break the suite. `[8, 8]` was checked against both the layout on disk today and F15's
   proposed map and satisfies §3's five constraints on both, so this bullet does **not** depend on
   F15's landing order — but F15's whole-file replacement must carry the key through.

8. **§8 copy** — `config/game/copy.json` gains a top-level `hats` section and `Copy`
   (`shared/src/copy.ts:32-55`) the matching field:
   ```ts
   hats: {
       claimed: string; allTaken: string; paperHat: string; whistle: string;
       everyJobOwned: string[]; allBusy: string[];
       nothingBehind: string[]; pileUpBehind: string[]; unworn: string[];
       bestPost: string[]; bareheaded: string[]; solo: string[]; soloOne: string[];
   };
   ```
   Every report key is a `string[]`, one element per rendered line, so §6's 52-character width
   budget holds without word wrap and F12 can re-break any line without touching code
   (`copy.clipboard` and `copy.standupBubbles` are the precedent). Text as in §Data & config;
   **F12 owns the wording, F17 owns the keys and the ceiling.** Files: `config/game/copy.json`,
   `shared/src/copy.ts`, and **`shared/tests/copy.test.ts:46`**, whose
   `expect(Object.keys(copy).sort()).toEqual(…)` is exhaustive and will fail until `hats` is added —
   F16 contract change 8 hit the same assertion.

9. **§12 ownership** — a new row:

   | Area | Files | Owner | Touches |
   |---|---|---|---|
   | Hats and roles | `shared/src/sim/hats.ts`, `shared/tests/hats.test.ts`, `game-server/src/sim/hats.ts`, `game-server/tests/hats.test.ts`, `resources/js/game/render/Hats.ts`, `resources/js/game/__tests__/hats.test.ts` | F17 | **Touches (one line each):** `shared/src/index.ts` (F02) · `game-server/src/rooms/handlers.ts`, `game-server/src/sim/systems.ts` (F03) · `resources/js/game/scenes/Factory.ts`, `resources/js/game/ui/helpContent.ts` (F04) · `config/game/copy.json` (F12). **Granted edits (larger than a Touch):** `shared/src/schema/PlayerState.ts`, `shared/src/report.ts`, `shared/src/config/{types.ts,schema.json,validate.ts}`, `shared/tests/fixtures/layout-one-line.json` (F02) · `resources/js/game/render/Avatars.ts` (**four edits**) (F04) · `game-server/src/sim/day.ts` (**three edits, one a signature change**), `game-server/tests/report.test.ts`, `resources/js/game/report/format.ts`, `resources/js/game/scenes/Report.ts` (F11) · `shared/src/copy.ts`, `shared/tests/copy.test.ts` (F12) · `config/game/layouts/one-line.json` (F12/F15), `game-server/src/config/devLevel.ts` + `game-server/tests/fixtures/**` (F03), `tests/Fixtures/game/layouts/one-line.json` (F01) |

   Add to the *Field ownership resolved* paragraph: "`PlayerState.hat` — F17 (`takeHat` and
   `hatsSystem` only); `PlayerState.role` — F13. The two are unrelated and neither is derived from
   the other."

10. **F16 — one line, F16's call** *(cosmetic, droppable)*. `resources/js/game/render/Fumble.ts`'s
    trip tumble (`F16:790-806`) currently throws a 20 × 5 rect in `lineColour`; it should throw the
    *role* hat, via `hatShape(player.hat)` and `HAT_COLOURS` from `render/Hats.ts`, falling back to
    today's rect when `hat === ''`. And redraw the hat rotated 12° for 3 s after the tumble — it is
    the best flourish in the feature and it is entirely inside F16's own file with no schema. If
    declined, F17 ships identically and the tumbling hat is simply generic.

11. **F13 — one line, F13's call** *(cosmetic, droppable)*. `ui/CrewPanel.ts`'s roster row may draw
    the hat glyph beside the colour swatch and the role badge (`F13:232`), which makes the roster
    read "who is here, what they can do, and what they said they would do" in one row. If declined,
    the roster is unchanged and the rack plus the heads carry the whole signal.

12. **F15 — one line, F15's call** *(needed if F15 lands after F17)*. F15's whole-file replacement
    of `config/game/layouts/one-line.json` and `DEV_LAYOUT` must carry `props.hatRack` and its
    packed `walls` index through. `[8, 8]` / `232` satisfies F17 §3's five constraints on F15's own
    proposed map, so no re-pick is required — only that the key survives the replacement.

13. **F14 / ADR 0014 — one line for the exclusion list, F14's call** *(blocks nothing)*. F17
    contributes no field to `applyDifficulty`. `HAT_CHANGE_SECONDS` is an input-repeat guard, not a
    window, and belongs beside `MAX_INPUT_BACKDATE_S` in the "never scaled" set. Neither dial may
    touch a social signal.
