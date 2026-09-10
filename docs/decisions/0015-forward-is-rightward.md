# ADR 0015 — Forward is rightward: input on the left face, output on the right

**Status:** accepted · 2026-09-09

## Decision

The factory floor reads **left to right in process order**. Boom Powder is leftmost, then
Assembly, then the Dock. Within a station, the **input shelf is on the left face and the
output shelf is on the right face**, and a station's out-face sits at the same height as the
next station's in-face, so a hauler leaving one machine is already standing at the row the
next machine wants.

Learned once, in the first ten seconds, never re-learned: pull from the left, push to the
right, walk right. `validateLevelOnLayout` enforces it; a level that genuinely needs a
tangled line opts out with `flowRightward: false` and has to say why in `notes`.

### The invariant, precisely

Let a station's **named tiles** be `anchor`, `workTiles`, `rackTiles`, `inputShelf.tile` and
`outputShelf.tile` — the same set `footprintOf` spans (`shared/src/sim/stations.ts:49`).
Write `minX/maxX/minY/maxY` for the extent of that set, and `workMinX/workMaxX` for the work
tiles alone. Per line, order the stations by process order (`boom_powder → assembly → dock`).

1. **Output on the right face.** `outputShelf.tile[0] > workMaxX`. Vacuous when the station
   has no output shelf (the dock).
2. **Chain runs rightward.** For consecutive stations `P → N` on a line,
   `N.minX > P.maxX`. No station overlaps or precedes its upstream in x.
3. **Input on the left face.** `inputShelf.tile[0] < workMinX`. Vacuous when the station has
   no input shelf (Boom Powder makes its input out of thin air).
4. **The handoff does not climb.** For consecutive `P → N`, `P`'s out-face row lies inside
   `N`'s y-extent: `N.minY <= outY <= N.maxY`, where `outY` is `P.outputShelf.tile[1]` or,
   for a station with no output shelf, the y-span of `P.workTiles`.

`rackTiles` are exempt from 1–3. A rack is the station's own supply, not part of the flow:
the Jig's B-role fetches fuses from it with nobody hauling anything, and `deriveAisleTile`
(`shared/src/sim/jig.ts:299`) puts B in the aisle between rack and jig on whichever side the
rack sits. Casings never move either — `feed()` (`shared/src/sim/jig.ts:565`) stocks
Assembly's own input shelf one casing a tick. Only tiles a player carries something *to* or
*from* are on the flow axis.

The checks go in `validateLevelOnLayout` (`shared/src/config/validate.ts:364`) as
`checkFlowDirection(level, errors)`, after the per-station wall/claim loop and before the ramp
check at `:428` — beside the invariants they resemble, inside the function the room already
throws on (`game-server/src/config/levels.ts:60`). Not in `validateLevelConfig`: that runs
without a layout in Laravel's schema pass, and a geometry rule that fires in one caller and
not the other is worse than no rule.

That signature is two arguments, and the second is the error accumulator, not the layout.
Rules 1–4 are arithmetic over the level's own named tiles; nothing in them consults `walls`,
`width`/`height`, `ramp` or `truckBay`, so a `layout` parameter would be passed and never
read. Two-argument is also the shape the file already uses — `checkStations(level, errors)`
(`shared/src/config/validate.ts:116`), `checkLayoutTiles(layout, errors)` (`:269`) — one
config to check, plus the array to push onto. The map belongs to the caller,
`validateLevelOnLayout(level, layout): string[]`, whose wall, reach and ramp checks genuinely
need it.

The opt-out is a new root key `flowRightward?: boolean`, default `true`. `false` skips 1–4
and is accepted **only when `notes` is non-empty** — an escape hatch you must argue for in
the file is one nobody reaches by accident.

## Why

Playtesters kept asking "where do I put this?" — and kept asking after floor labels went in.
That is the tell. Signage answers a question the geometry should never have raised; when a
player has to read the floor to find the in-tray, the machine is drawn wrong and the label
only makes the wrong drawing legible. The apron work
(`resources/js/game/render/intake.ts:49`) makes the drop zone unmissable, which is worth
doing, but an unmissable drop zone in an arbitrary place still has to be found once per
station. Consistency retires the question instead of answering it.

The shipped floor makes the point. `one-line.json` and all five level files carry identical
station geometry, and it zigzags:

| | Boom Powder | Assembly | Dock |
|---|---|---|---|
| work | `(4,5)` | `(13,8) (14,8)` | `(22,4)…(25,4)` |
| in-shelf | — | `(11,7)` | — |
| out-shelf | `(6,3)` | `(13,10)` | — |

Powder's out-tray to Assembly's in-shelf is `+5 x, +4 y` — right and *down*. Assembly's
out-shelf to the ramp is `+9 x, −6 y` — right and *up six rows*. Rule 2 passes today: the
line does run rightward in the large, which is exactly why more signage looked like it should
have been enough. Rules 1 and 4 are what break the read — `assembly-a`'s output shelf sits at
x 13, *left* of its own work tile at x 14, and no station's out-face is near the next
station's rows.

That has already produced a rendering bug nobody filed. `outwardSide`
(`resources/js/game/render/intake.ts:36`) picks the aisle a shelf's label and apron paint into
by comparing the shelf's x to the station's x-midpoint. For `assembly-a` that midpoint is
13.5, so the input shelf at x 11 resolves to −1 and the output shelf at x 13 **also** resolves
to −1: both faces label into the same left-hand aisle. The renderer is not confused, the
layout is. Under this ADR `outwardSide` stops guessing — input is always −1, output always +1.
The `devLevel` the server boots is worse in the same way: `assembly-a`'s output shelf at
`(12,11)` against work tiles at x 13–14 puts the out-tray on the *input* side of the machine
(`game-server/src/config/devLevel.ts:129-139`).

The second reason is why this is an ADR and not a style note. The game argues that local
productivity is not system throughput, and that argument is legible only if the system is.
"Boom Powder is drowning Assembly" is something a player says while pointing, at a glance,
once the pile is visibly *upstream* of the jam. On a floor that folds back on itself,
upstream and downstream are things you work out, and the punchline lands late or not at all.

## Rejected

- **More signage.** Already tried; it turns the question into a reading task at every
  station, forever. Labels also compete for attention with the beacons and banners that carry
  live state.
- **Arrows painted on the floor.** The same failure one layer cheaper. Arrows describe a route
  the geometry could have *been*, and they are wrong the moment a level moves a machine — a
  decoration with a correctness requirement.
- **A minimap.** "Where is Assembly" on a 28×18 floor that is entirely on screen. Buys a HUD
  element, a second thing to read during a crisis, and no new information.
- **Rule 2 alone** (chain rightward, faces free). That is what ships today, and the faces are
  where the question is actually asked.
- **Fix it in the renderer** — always paint the input apron leftward regardless of tile. Makes
  the label lie about where the shelf is. The tile is the truth; move the tile.
- **Handing `checkFlowDirection` the layout as well**, for symmetry with the function that
  calls it. The four rules never read the map, so the parameter is dead on arrival — and a
  dead parameter is a standing invitation to quietly make a flow rule depend on wall positions
  later, which would put geometry the level file cannot see into a level file's error message.
  `validateLevelOnLayout` holds the layout; the check holds the level.

## Consequences

**This constrains every future layout, permanently.** A designer no longer places machines
freely; the line is a line. That is the cost and it is the point. Rule 4 in particular limits
vertical stacking, which will bite in M2 when a second line arrives (`scaleLevel` throws on
`lines: 2` today, `shared/src/sim/scale.ts:27`) — the rules group by `station.line`, so line B
must read rightward on its own rows and the generated geometry has to satisfy them too.

**A level whose lesson needs a bad layout opts out on purpose.** "The Spaghetti Factory" is a
good level, but only if the tangle is deliberate and readable *as* the joke — which requires
every other level to be clean. `flowRightward: false` plus a `notes` line is the whole
ceremony; the value is that no level gets a tangled floor by drift.

**Everything shipped has to be re-laid.** Concretely:

- `config/game/layouts/one-line.json` — shelf and anchor tiles are furniture and therefore
  walls (`(6,3)` packs to index 90, `(11,7)` to 207, `(13,10)` to 293; all three are in the
  `walls` array at lines 9, 13 and 16). Moving a shelf moves a wall index. The layout named
  "one-line" is not currently one line.
- All five level files — `level-01-basic-flow`, `level-02-too-much-powder`,
  `level-03-the-bottleneck`, `level-04-too-many-helpers`, `sandbox` — carry byte-identical
  station blocks, so this is one re-lay copied five times, plus each station's `floorRing`,
  which is drawn around the old positions.
- `game-server/src/config/devLevel.ts:83-232` — the `stations` array of the dev level the
  server falls back to when `config/game/levels` is empty.
- `shared/tests/levels.test.ts` reads the shipped files from disk and is the gate the PHP and
  runtime passes sit behind, so all five levels go red the moment `checkFlowDirection` lands
  and stay red until the re-lay is done. Land the check and the re-lay together.

**The renderer gets simpler.** `outwardSide` keeps its signature but stops being a heuristic;
`apron()` (`resources/js/game/render/intake.ts:49`) returns the shelf tile and the tile to its
left, at every station, always. Hoppers sit above the tile the apron marks, so funnel and
floor stripe are the same left face seen twice.

**Nothing in the sim changes.** No schema field, no message, no tick order — config geometry
and one validation function. The sim reads tiles and does not care which way the factory
faces.

## Contract changes required

- **§8, `LevelConfig` top-level keys** — add `flowRightward?` to the key list (root is
  `additionalProperties: false`, so it must be declared). Type `boolean`. Writer: the level
  JSON, i.e. the designer. Default `true` (§13).
- **§8, `LevelConfig` prose** — add: "`flowRightward` (default `true`): the floor reads left
  to right in process order (ADR 0015). `false` disables the flow-direction checks in
  `validateLevelOnLayout` and is accepted only when `notes` is a non-empty string."
- **§8, `StationConfig` prose** — after the `inputShelf?` / `outputShelf?` sentence, add: "An
  input shelf sits on the station's left face and an output shelf on its right
  (`inputShelf.tile[0] < min(workTiles.x)`, `outputShelf.tile[0] > max(workTiles.x)`);
  `rackTiles` are the station's own supply and are exempt."
- **§8, Validation** — extend the `validateLevelOnLayout(level, layout): string[]` check list
  with, when `level.flowRightward !== false`: (a) `outputShelf.tile[0] > max(workTiles.x)`;
  (b) per line, in process order `boom_powder → assembly → dock`, the next station's minimum
  named-tile x exceeds the previous station's maximum; (c) `inputShelf.tile[0] <
  min(workTiles.x)`; (d) the previous station's out-face row (`outputShelf.tile[1]`, or the
  `workTiles` y-span when it has no output shelf) lies within the next station's named-tile
  y-extent. "Named tiles" = `anchor`, `workTiles`, `rackTiles` and both shelf tiles — the set
  `footprintOf` spans.
- **§8, Validation** — add to `validateLevelConfig`'s semantic rules: `flowRightward === false`
  requires a non-empty `notes`.
- **§13, Defaults table** — new row: `flowRightward` | `true` | `validateLevelOnLayout`
  (F02; F12 level files).
- **§13, constants list** — add `STATION_FLOW` to the `shared/src/sim/constants.ts` line:
  `readonly StationType[] = ['boom_powder', 'assembly', 'dock']`, the process order rule (b)
  sorts by. It is a contract fact, not a tunable, and does not belong in level JSON.
- **`shared/src/config/schema.json`** — declare `flowRightward: { "type": "boolean" }` on the
  `LevelConfig` root so Laravel's schema pass accepts the key (F01 validates by path against
  this same file).

## Amendment (2026-09-10) — the exemption is its own field, not `notes`

As accepted, this ADR said a level opting out of the rule argues for it in `notes`. The
implementation deviated and the deviation is **ratified**: the opt-out is the pair
`flowRightward: false` plus `flowExemption: "<why>"`, and validation rejects either half alone.

The reason is that `notes` already exists and every shipped level carries a kilobyte of it, so
"the level must argue for its exemption" would have been satisfied by prose written about
something else entirely — the ceremony would pass while meaning nothing. A dedicated required
field cannot be satisfied by accident: you cannot turn the rule off without writing down why,
and a stray `flowExemption` with the flag unset is itself an error, so the two cannot drift
apart.

No shipped level uses the opt-out. It exists for a future level whose lesson genuinely needs a
tangled floor, and that level will have to say so out loud in a diff.

## Amendment (2026-09-10) — spawn moved to [14, 16]

The re-lay moved `spawn` from `[14, 17]` to `[14, 16]`, which is one tile off F15's map. It
fixes a defect that predates this ADR: on the shipped layout, six players could not spawn on six
distinct tiles. It is the smallest change that fixes it and it leaves the door gap where F15
wants it.

## Amendment (2026-09-10) — the geometry check defends its own opt-out

The two halves of the opt-out were enforced by two functions with nothing holding them
together: `checkFlowDirection` inside `validateLevelOnLayout` skipped on `flowRightward === false`
alone, while the rule that the flag needs a `flowExemption` lived in `validateLevelConfig`. The
shipped path calls both, so nothing was broken today — but `validateLevelOnLayout` is exported
and callable on its own, and a caller that reached for the geometry check alone honoured a bare
`flowRightward: false` the level validator would have thrown out.

`checkFlowDirection` now skips only for `flowRightward === false` **and** a non-empty
`flowExemption`. It re-checks a rule the other validator already owns, which is duplication with
its reason: the rule can only be turned off by a level that has actually argued for it, whichever
validator the caller reached for. Contracts §8 records which function holds which half.

## Amendment (2026-09-10) — two rules the re-lay turned out to need

Both are in `validateLevelOnLayout`, beside the tile invariants, and both are drawing
preconditions promoted to rules because the drawing had no way to defend itself:

- **The tile above a shelf tile is a wall.** The hopper F15 §2 specifies is 56 px of furniture
  that rises out of the shelf tile into the machine above it. On the re-laid floor every shelf
  has machine above it, and nothing said it had to — ADR 0015's rules constrain a shelf's x and
  say nothing about its y, so the first level to put walkable floor above a shelf would silently
  paint a funnel over a tile players walk on.
- **A station with a floor ring needs a beacon pole.** `tickBeacons` reddens every station that
  has a ring, and the client hangs the whole danger channel off the pole: no pole, no lamp, no
  hazard stripes round the pile, no alarm. `one-line.json` named a pole for `powder-a` only, so
  a pile inside Assembly's own ring — the tile a hauler drops a keg on — turned the station red
  on the server and drew nothing at all. `assembly-a` now has a pole at `[12, 3]` and `dock-a`
  one at `[21, 3]`; both are machine wall inside their own footprints, and both stand clear of
  the tile above a shelf, which is where the hopper is.

## Amendment (2026-09-10) — the pre-pick follows the order, and says whose it is

F15 task 6 landed as specified. `JigMg` gains `bPickFromOrder`, and `reconcileRoles` re-derives
`bPick` from the active order on every tick while it is true, B is at the rack and `bPhase` is
`idle`, rather than only when the rack occupant changes.

The gap it closes is the second of F15's three diagnosed defects: derived once, the pick expired
on its own. A B who took the rack tile and stayed there kept the fuse length of whatever order
was live when they arrived, through every rollover, for the rest of the shift, and the bill
arrived three stations downstream in somebody else's hands.

The flag is not bookkeeping. It is the difference between two sentences that mark the same bin
and mean opposite things about who is holding it: `THIS ORDER WANTS LONG — ALREADY PICKED` is a
promise the sim keeps at the next rollover, and `YOUR PICK — LONG` is one it does not. B's
override stays honest — pressing `←`/`→` stops the re-derive, pressing back onto the order's own
length starts it again — so the sim never quietly undoes a choice a player made.
