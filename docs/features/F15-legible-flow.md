# F15 — Making the line legible: hoppers, the fuse rack, and the re-laid floor
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `resources/js/game/render/hopper.ts` · `resources/js/game/render/fuseRack.ts` · `resources/js/game/__tests__/{hopper,fuseRack}.test.ts` · `shared/tests/flowDirection.test.ts`
**Touches** (contracts §12 — one line each, except the geometry files, which are the largest touch in this doc; see "Landing order" under Risks):
- **F12** — `config/game/layouts/one-line.json` (whole file) · the six geometry keys — `anchor`, `workTiles`, `rackTiles`, `inputShelf`, `outputShelf`, `floorRing` — of the three station blocks in each of the five `config/game/levels/*.json` · `shared/tests/levels.test.ts` (one `describe` over the shipped files) · `config/game/copy.json` (one top-level `flow` section) · `shared/src/copy.ts` (the matching field on the `Copy` interface — a JSON key with no field is unreachable from TypeScript, `shared/src/copy.ts:32-55`)
- **F02** — `shared/src/config/validate.ts` (`checkFlowDirection` and the `flowRightward`/`notes` semantic rule) · `shared/src/config/{types.ts,schema.json,defaults.ts}` (the `flowRightward` key) · `shared/src/sim/constants.ts` (`STATION_FLOW`, and `SELF_STOCKED` moved in from the client — §4) · `shared/tests/fixtures/{level-m1,layout-one-line}.json` (the same re-lay)
- **F03** — `game-server/src/config/devLevel.ts` (`DEV_LEVEL.stations`, the whole of `DEV_LAYOUT`, and the two `mvp-small` strings at `:34` and `:364`) · `game-server/tests/fixtures/**` (four level files, three layout files)
- **F06** — `game-server/src/sim/items.ts` (the `E`-at-a-shelf caller skips self-stocked types)
- **F05** — `resources/js/game/render/Stations.ts` (the hopper and chute paint calls and the counter's new anchor) · `resources/js/game/render/dropTargets.ts` (one re-export line; §12 names no owner for this file — contract change 9 puts it in F05's row beside `Stations.ts` and `stationGlyphs.ts`)
- **F04** — `resources/js/game/ui/Hud.ts` (the fuse column on the `Tab` board) · `resources/js/game/render/Floor.ts` (the order board's live line) · `resources/js/game/ui/helpContent.ts` (one row)
- **F08** — `shared/src/sim/jig.ts` (`bPickFromOrder` and the re-derive) · `resources/js/game/minigames/{Jig,JigWorldFx}.ts` (the pre-pick ribbon and the two rack bins)
- **apron workstream** — `resources/js/game/render/intake.ts` (`outwardSide` stops guessing, per ADR 0015)

**A note on line numbers.** `Stations.ts`, `dropTargets.ts`, `helpContent.ts` and `intake.ts` are open in
the apron workstream's tree while this doc is being read. Every reference to them below names a **symbol**,
not a line. Files nobody else is holding still get `path:line`.
**Reads:** `docs/features/00-contracts.md` (v2.1 — binding) · `docs/decisions/0015-forward-is-rightward.md` (this doc is that ADR's implementation) · `docs/decisions/0012-output-to-hands.md` · `docs/decisions/0005-spill-not-block.md` · `docs/02-factory-floor.md` · `docs/03-stations.md` · `docs/04-minigames.md` (The Jig) · `docs/features/F05-stations-staffing.md` · `docs/features/F08-jig.md` · `docs/features/F12-levels-sandbox.md`

## Goal

A player who walks onto the floor for the first time reads the factory the way they read a
sentence. Boom Powder is on the left, the Dock is on the right, and every machine wears its
in-tray on its left cheek and its out-tray on its right, all on one row, so the haul is a
straight walk rightward and nobody ever asks which shelf is which. Each of those trays is a
**hopper** — a funnel or a chute standing on the tile, filling up and emptying where you can
see it from across the room, with a number on its throat — so "Boom Powder is drowning
Assembly" is something you say while pointing rather than something you work out from a
`6/6` label you had to walk over and read. And the fuse rack, which is where the Jig's second
player has been quietly guessing, says out loud what the order wants, which bin holds it, and
that the game has already reached in and picked it for them.

The playtester line this closes: *"It seems that the fuse generation is a bit non-intuitive.
We almost need like a hopper for fuses and a hopper for boom powder/kegs. Probably should
also have things sort of be in order location wise, like a factory would."*

## Scope

**In (M1):**
- The re-laid floor: one working band, `powder-a → assembly-a → dock-a` left to right, every
  in-shelf on a left face and every out-shelf on a right face. `one-line.json` plus the
  identical station geometry in all five level files, in `devLevel.ts`, and and in the nine
  level and layout fixture files under `shared/tests` and `game-server/tests` — sixteen files,
  one geometry.
- `checkFlowDirection(level, errors)` in `validateLevelOnLayout` and the `flowRightward`
  opt-out, exactly as ADR 0015 specifies them, and a test that every layout this repo ships
  satisfies them.
- Hoppers: an input shelf renders as a funnel standing on its tile, an output shelf as a
  right-facing chute. Fill level, one glyph per stocked type, and the `n/cap` counter on the
  throat. Self-stocked types get a grey silo with an auto-feed tick, never a funnel.
- The fuse rack: two labelled bins (SHORT left, LONG right) drawn on the rack tile in world
  space; the required length published on the `Tab` board, on the world order board and on
  the B panel; the pre-pick shown as a pre-pick and kept in step with the active order.
- Casings: `shelfPull` stops handing a player a casing, the copy stops naming casings as an
  input a hauler brings, and the casing bin is drawn as part of the machine.

**Out (later milestones):**
- A second line. `scaleLevel` throws on `lines: 2` today (`shared/src/sim/scale.ts:27`); when
  M2 lifts that, ADR 0015's rules group by `station.line` and the generated geometry has to
  satisfy them on its own rows. Nothing here assumes one line, but nothing here tests two.
- A "Spaghetti Factory" level that opts out with `flowRightward: false`. The key ships; no
  level uses it.
- Hopper *capacity* upgrades (docs/08) and any change to what a shelf holds. This is drawing,
  not sim: `inputShelf.capacity` and `outputShelf.capacity` are untouched.
- Tinting a `parts` set or a stick amber when its fuse disagrees with the order. Worth doing,
  but it lands in F06's item glyphs; see Risks.
- Moving the truck bay to the right wall. See "What did not move" below.

## Design

### Files

| Path | Responsibility |
|---|---|
| `config/game/layouts/one-line.json` (F12's) | The re-laid 28 × 18 map: walls, poles, props, bay, ramp. Whole file replaced. |
| `config/game/levels/*.json` (F12's) | Six geometry keys per station block — `anchor`, `workTiles`, `rackTiles`, `inputShelf`, `outputShelf`, `floorRing` — identical across all five. Nothing else in a block is opened. |
| `game-server/src/config/devLevel.ts` (F03's) | The fallback level the server boots without Laravel adopts the shipped geometry verbatim: `DEV_LAYOUT` becomes the map above under `key: "one-line"`, and `DEV_LEVEL.stations` gets the three blocks above. Its tuning is untouched. |
| `shared/tests/fixtures/*`, `game-server/tests/fixtures/**` (F02's, F03's) | The reference level and layout the validator suites run on carry the old zigzag and go red with everything else. Same re-lay, each fixture keeping its own deliberate deviation. |
| `shared/src/config/validate.ts` | `checkFlowDirection(level, errors)` inside `validateLevelOnLayout`; the `flowRightward === false` ⇒ non-empty `notes` rule inside `semanticErrors`. |
| `resources/js/game/render/hopper.ts` | Pure geometry and words for a hopper: which tile the funnel grows into, how full it is, which bins it shows and which of them the player is allowed to fill. No Phaser. |
| `resources/js/game/render/fuseRack.ts` | Pure geometry and words for the rack: the two bin rectangles, which one the order wants, and the sentence that says so. No Phaser. |
| `resources/js/game/render/Stations.ts` | Paints both, on the layers it already has. |
| `resources/js/game/minigames/{Jig,JigWorldFx}.ts` | The pre-pick ribbon in the B panel; the two bins on the world rack tile. |

`hopper.ts` and `fuseRack.ts` follow the shape `resources/js/game/render/intake.ts` already
established: geometry and copy in a pure module with a vitest file, Phaser calls in
`Stations.ts`. A sentence you can test without a canvas is a sentence that gets tested.

---

### 1. The re-laid floor

#### What is wrong today

`one-line.json` and all five level files carry byte-identical station geometry, verified by
reading them: `powder-a` works at `(4,5)` and outputs at `(6,3)`; `assembly-a` works at
`(13,8)`/`(14,8)`, takes in at `(11,7)` and outputs at `(13,10)`; `dock-a` works at
`(22,4)…(25,4)`. Drawn out, the line goes right and *down* four rows, then right and *up*
six. Running ADR 0015's four rules against the shipped `level-01-basic-flow` reports:

```
1 assembly-a: out x 13 !> workMaxX 14
4 powder-a:   out row 3 outside assembly-a y 6..10
4 assembly-a: out row 10 outside dock-a y 1..4
```

Rule 2 passes — the line does run rightward in the large — which is exactly why adding labels
looked like it should have been enough. The faces are where the question actually gets asked,
and `assembly-a`'s output shelf sits at x 13, one tile *left* of its own work tile at x 14.
The layout named "one-line" is not one line.

#### The new map

28 × 18, tile indices packed `y * 28 + x`. `#` wall · `.` floor · `A` anchor · `W` work tile ·
`R` rack tile · `I` input shelf · `O` output shelf · `o` floor ring · `T` truck bay ·
`p` beacon pole · `b` order board · `t` tool cart · `c` countdown sign · `h` broom hook ·
`n` returns pile · `X` blast bin · `,` break room · `S` spawn.

```
        0         1         2
        0123456789012345678901234567
   0    ############################
   1    ######################ATTTT#
   2    ######################TTTTT#
   3    ####A#p#o..##A###ob..#TTTTT#
   4    #to####Oo..I####Oo...oWWWWc#
   5    #.ooWoooo..ooWWooo..ooooooo#
   6    #.ooooooo..ooooooon.ooooooo#
   7    #X.........ooRoooo.X.......#
   8    #..........................#
   9    #..........................#
  10    #..........................#
  11    #..........................#
  12    #..........................#
  13    #..........................#
  14    #..,,,,,,..................#
  15    #..,,,,,,.h................#
  16    #..,,,,,,..................#
  17    ##############S#############
```

Read row 4 left to right and you have read the factory: **tool cart · BOOM POWDER · out-tray ·
walk three tiles · in-tray · ASSEMBLY · out-tray · walk five tiles · ramp · truck.** Both
hauls are dead straight along one row, three tiles and five tiles, with nothing to route
around. Row 5 is where the crew stands — one work tile under Boom Powder, two under the Jig —
and rows 5–7 are the stations' floor rings, so a pile forms *beside* the machine that made it
and is visibly upstream of whatever it is drowning. Row 8 down is open floor: the walk from
the door at `(14,17)`, the break room, the broom, and room for the blast to have somewhere to
go.

The rack sits at `(13,7)`, directly below the left-hand jig tile, with the aisle at `(13,6)`
between them — `deriveAisleTile` (`shared/src/sim/jig.ts:299`) rounds the midpoint, so this
geometry is what puts B in the aisle. The toss now travels *up the flow*, from the rack into
the machine, instead of sideways across an arbitrary gap; and because `(13,6)` is inside
Assembly's own ring rather than on the through-route at row 8, a passer-by no longer wears
the spool by accident.

#### `config/game/layouts/one-line.json`

Everything below is the complete file. The `walls` array is grouped one row per line, as the
current file groups it.

```json
{
    "key": "one-line",
    "width": 28,
    "height": 18,
    "walls": [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
        28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 55,
        56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 83,
        84, 85, 86, 87, 88, 89, 90, 91, 95, 96, 97, 98, 99, 100, 102, 105, 111,
        112, 113, 115, 116, 117, 118, 119, 123, 124, 125, 126, 127, 128, 138, 139,
        140, 167,
        168, 195,
        196, 223,
        224, 251,
        252, 279,
        280, 307,
        308, 335,
        336, 363,
        364, 391,
        392, 419,
        420, 430, 447,
        448, 475,
        476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503
    ],
    "spawn": [14, 17],
    "breakRoom": [3, 14, 6, 3],
    "blastBins": [[1, 7], [19, 7]],
    "dockDoor": [22, 0, 5],
    "truckBay": [22, 1, 5, 3],
    "ramp": [[22, 4], [23, 4], [24, 4], [25, 4]],
    "beaconPoles": { "powder-a": [6, 3] },
    "orderBoard": [18, 3],
    "props": {
        "toolCart": [1, 4],
        "countdownSign": [26, 4],
        "returnsPile": [18, 6],
        "broomHook": [10, 15]
    }
}
```

Row by row, that wall set is: rows 0 and 17 the border (`(14,17)` left open as the door);
rows 1–2 solid from x 1 to x 21, with the truck bay open at x 22–26; row 3 the machine tops —
Boom Powder x 3–7, Assembly and both of its shelf stacks x 11–16, the order board at x 18 and
the bay's left jamb at x 21; row 4 the shelf row — the tool cart at x 1, Boom Powder's body
x 3–6 with its out-shelf at x 7, Assembly's in-shelf at x 11, body x 12–15, out-shelf at x 16,
and the countdown sign at x 26; rows 5–16 the side walls only, plus the broom hook at
`(10,15)`.

Two blast bins now, one at each end of the band (`(1,7)` and `(19,7)`), because with the whole
line on rows 3–7 a lit stick at the Dock end was eleven tiles from the only bin and
`hazards.fuseSeconds` is 6.

#### The station geometry

The six geometry keys below are byte-identical in all five level files, and they are the only
keys F15 opens. `nominalSeconds`, `floorSeconds`, `staffing`, `churnSensitive`, `minigame`,
`joinMode`, `line`, `type` and the file's `notes` keep whatever is on disk when the re-lay
lands. Two of those are *not* identical across the five and must not be made so while this
edit is passing through: `level-04-too-many-helpers`'s `assembly-a.staffing` deliberately
falls off a cliff above four people (`{"4": 0.8, "5": 0.6, "6": 0.45, "8": 0.3}` against
`{"4": 1.1, "5": 0.95, "6": 0.8, "8": 0.5}` in the other four), which is that level's whole
lesson, and `minigame.crimp` is F14's to retune. F15 is a geometry edit that happens to open
five files it does not own; that is not a licence to tidy them.

```jsonc
// powder-a
"anchor": [4, 3],
"workTiles": [[4, 5]],
"rackTiles": [],
"outputShelf": { "tile": [7, 4], "capacity": 6 },
"floorRing": { "tiles": [
    [8, 3], [2, 4], [8, 4],
    [2, 5], [3, 5], [5, 5], [6, 5], [7, 5], [8, 5],
    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6]
] }

// assembly-a
"anchor": [13, 3],
"workTiles": [[13, 5], [14, 5]],
"rackTiles": [[13, 7]],
"inputShelf": { "tile": [11, 4], "capacity": 8, "accepts": ["keg", "casing"] },
"outputShelf": { "tile": [16, 4], "capacity": 4 },
"floorRing": { "tiles": [
    [17, 3], [17, 4],
    [11, 5], [12, 5], [15, 5], [16, 5], [17, 5],
    [11, 6], [12, 6], [13, 6], [14, 6], [15, 6], [16, 6], [17, 6],
    [11, 7], [12, 7], [14, 7], [15, 7], [16, 7], [17, 7]
] }

// dock-a
"anchor": [22, 1],
"workTiles": [[22, 4], [23, 4], [24, 4], [25, 4]],
"rackTiles": [],
"floorRing": { "tiles": [
    [21, 4],
    [20, 5], [21, 5], [22, 5], [23, 5], [24, 5], [25, 5], [26, 5],
    [20, 6], [21, 6], [22, 6], [23, 6], [24, 6], [25, 6], [26, 6]
] }
```

`(10,4)` is deliberately **not** in Assembly's ring. It is the standing tile the intake apron
paints (`apron()` in `resources/js/game/render/intake.ts` returns the shelf tile and the tile
outward of it), and a spilled keg sitting on the stripes would undo the one thing the stripes
say.
`(17,4)`, the pickup tile at the other face, has no apron and is in the ring.

#### Every invariant, checked

Run against the real validators — `validateLayoutConfig`, `validateLevelConfig` and
`validateLevelOnLayout` from `shared/src/config/validate.ts` — the layout and all five levels
return `ok` with no errors, as do the dev level and every fixture pair once they carry the
same blocks. The rules and how this geometry meets them:

| Rule | `validate.ts` | Met by |
|---|---|---|
| Work, rack and ring tiles in bounds and not walls | `:383-399` | Every `W`, `R` and `o` above is `.`-class floor; the whole of rows 5–7 inside the border is floor. |
| Anchor and shelf tiles in bounds | `:402-404`, `:413-418` | `(4,3)` `(13,3)` `(22,1)`; `(7,4)` `(11,4)` `(16,4)`. |
| No two stations share a work / rack / shelf / ring tile | `:368-378` | Powder claims x ≤ 8, Assembly x 11–17, Dock x 20–26. Disjoint by construction. |
| Every shelf tile has ≥ 1 orthogonal in-bounds non-wall neighbour | `:420-425` | `(7,4)`→`(8,4)`; `(11,4)`→`(10,4)`; `(16,4)`→`(17,4)`. |
| `ramp` equals the dock's `workTiles` | `:428-436` | Both are `[[22,4],[23,4],[24,4],[25,4]]`, unchanged from today. |
| `truckBay` contains no wall | `:438-442` | x 22–26 × y 1–3 is open floor; the jamb is at x 21. |
| `blastBins`, `props.returnsPile`, `spawn` and `breakRoom` are not walls | `:317-331` | `(1,7)` `(19,7)` `(18,6)` `(14,17)` and x 3–8 × y 14–16 are all floor. |
| `beaconPoles` keys are station ids | `:444-448` | One key, `powder-a`. |
| ADR 0015 rule 1 — output on the right face | new | `powder-a` 7 > 4; `assembly-a` 16 > 14. |
| ADR 0015 rule 2 — chain runs rightward | new | named-tile x spans 4–7, 11–16, 22–25. Named tiles are `anchor`, `workTiles`, `rackTiles` and both shelf tiles — `floorRing` is not one, so the dock's ring tile at `(21,4)` is outside the span. |
| ADR 0015 rule 3 — input on the left face | new | `assembly-a` 11 < 13. |
| ADR 0015 rule 4 — the handoff does not climb | new | Powder's out row 4 sits inside Assembly's y 3–7; Assembly's out row 4 sits inside the Dock's y 1–4. |

The beacon pole moved from `(8,1)` to `(6,3)` so that `(7,3)`, the tile directly above Boom
Powder's out-shelf, is plain machine wall. That is where the chute is drawn (§2), and a pole
occupying it would have to be drawn through.

#### The dev level and the test fixtures get the same geometry, verbatim

The shipped files are not the only floors in the repo. Five more level/layout groups carry the
same zigzag and every one of them goes red the moment `checkFlowDirection` lands, because every
one is asserted through `validateLevelOnLayout`:

| Pair | Asserted at | Deliberate deviation to preserve |
|---|---|---|
| `DEV_LEVEL` + `DEV_LAYOUT` in `game-server/src/config/devLevel.ts` | `game-server/tests/levels.test.ts:86-90` | none — it is meant to be a normal floor |
| `shared/tests/fixtures/level-m1.json` + `layout-one-line.json` | `shared/tests/validate.test.ts:448-452` (the happy-path case, `toEqual([])`) | none |
| `game-server/tests/fixtures/levels/{level-01-test,level-02-second}.json` + `layouts/one-line.json` | `game-server/tests/levels.test.ts:41-46` through `validated()` | the two files differ only in `key`, `name`, `day` |
| `…/fixtures/bare/levels/level-01-bare.json` + `bare/layouts/one-line.json` | `game-server/tests/levels.test.ts:57-68` | every contracts §13 optional key stripped |
| `…/fixtures/broken/levels/level-01-bad.json` + `broken/layouts/one-line.json` | `game-server/tests/levels.test.ts:70-74`, which matches the error text `powder-a.workTiles: 0,0 is a wall` — a regex against the joined list, so an extra error would not break it, but `[[0,0]]` trips no flow rule anyway | `powder-a.workTiles` stays `[[0,0]]` |

All five take the map and the three station blocks above, unchanged. Not because uniformity is
tidy, but because the alternative is worse in three specific ways. Inventing a second legal
geometry doubles the number of floors a future re-lay has to satisfy and gives a designer two
right answers. Opting the fixtures out with `flowRightward: false` would leave the *default*
path — `flowRightward` absent, rules on — untested against a realistic level, which is exactly
the case `validate.test.ts`'s happy-path assertion exists to cover. And leaving the dev level
tangled would make the one floor every developer boots on `DEV_ALLOW_NO_TICKET=1` the only
floor in the repo that does not demonstrate the ADR.

For `devLevel.ts` concretely: `DEV_LAYOUT` is replaced wholesale by the JSON above (as a
`LayoutConfig` literal, `key: 'one-line'`), `DEV_LEVEL.layout` at `:34` and `DEV_LAYOUT.key` at
`:364` both become `'one-line'` — which is contract change 8 — and the `anchor`, `workTiles`,
`rackTiles`, `inputShelf`, `outputShelf` and `floorRing` of its three station blocks become the
three blocks above. Everything else in `DEV_LEVEL` — `nominalSeconds`, `staffing`, every
`minigame`, `recipes`, `orders`, `hazards` — is untouched; the dev level keeps its own tuning
and only stops disagreeing about where the machines are. Its `beaconPoles` shrink from three
keys to one (`powder-a`), which `validateLevelOnLayout`'s station-id check accepts, and its
spawn and break room move with the map.

#### What did not move, and why

`dockDoor`, `truckBay` and `ramp` are byte-identical to today, and `dock-a`'s `anchor` and
`workTiles` are too. The truck bay stays at the top right and the truck still departs upward.
Turning the dock ninety degrees — a vertical ramp at the right wall, crates shoved rightward
into the truck — is the purer reading of "forward is rightward", and `DEV_LAYOUT` demonstrates
the shape today: `dockDoor [24,2,3]`, `truckBay [24,3,3,6]`, `ramp [[23,4],[23,5],[23,6],[23,7]]`
and dock work tiles as a vertical column at x 23 (`game-server/src/config/devLevel.ts:206`,
`:378-380`). The four numbers are written out here because the subsection above overwrites that
file, and the shape is worth keeping on the record for M2 even after the only copy of it is
gone. It is rejected here for two reasons. First,
`TruckSprite` hard-codes the departure as `setY(bay.y − slide × travelPx)`
(`resources/js/game/minigames/dock/TruckSprite.ts:127-129, 162`), so the truck can only ever
leave through a door above its bay; a right-wall door needs `dockDoor` to become a vertical
run, which §8 does not express. Second, F09 is in flight, and the shipped dock geometry does
not need to move to satisfy any of ADR 0015's four rules — the dock has no shelves, so rules 1
and 3 are vacuous, and rules 2 and 4 pass on the tiles it already has. Re-laying it anyway
would be scope bought with someone else's risk.

The band therefore ends with one turn: right along row 4 to the ramp, then up into the truck.
That is what a loading dock looks like, and it is one turn at the end of the line rather than
two in the middle of it.

---

### 2. Hoppers

D4's split: the **apron** is floor marking — `stripeSegments` hazard stripes on the shelf tile
and the standing tile beside it, with a `chevron` pointing at the shelf, painted by
`paintApron` dim into the statics layer and again at full alpha when the thing in your hands
belongs there (`resources/js/game/render/Stations.ts`). The **hopper** is the furniture that
stands on the same tile. The apron says *stand here and let go*; the hopper says *here is what
is in it, and how much room is left*. Neither is respecified by the other.

Today the furniture is `paintShelfBox`'s grey rectangle with `paintShelf` laying 8 px glyphs
into the two-column `slotOffsets` grid, and a `shelfCounter` `n/cap` string positioned a
`COUNTER_GAP` *below* the tile. At 32 px tiles the glyphs are unreadable from more than three
or four tiles away, and the counter is a number you have to walk over and read. A pile of
kegs on Boom Powder's out-tray is the single most important thing on the floor — it is the
whole thesis in one silhouette — and it currently looks the same from across the room whether
it holds one keg or six.

#### Shape

The hopper occupies the shelf tile's **top 24 px plus the whole tile above it** — 56 px of
vertical furniture, 28 px wide. The tile above every shelf in the re-laid floor is machine
wall (`(7,3)`, `(11,3)`, `(16,3)`), so the hopper grows into the machine it belongs to and
never into walkable floor. The shelf tile's bottom 8 px, and all of the standing tile, keep
the apron's stripes.

- **Input shelf → funnel.** Mouth 28 px wide at the top, tapering to a 12 px throat at 0.6
  of the height, then a straight neck to the tile. Open upward: you pour into it.
- **Output shelf → chute.** The same silhouette rotated to face right: a 28 px back at the
  machine, narrowing to a 12 px lip on the **right** edge of the tile, over the pickup tile.
  Product visibly leans toward where you take it from.

Funnel opens left-and-up, chute opens right. That is ADR 0015's rule drawn twice on every
machine, so the face a player is looking at tells them which end of the machine they are
standing at even with the labels off screen.

#### Fill

The body is filled from the bottom to `count / capacity` of its interior height, in the
station's line colour at full alpha. At capacity the fill reaches the mouth and the outline
switches to `STATION_COLOURS.alert` — the same red `shelfCounter` already returns at
`count >= cap` — because a full output shelf is what puts the next keg in the operator's hands
(ADR 0012), and that is a thing the whole room needs to see coming, not a thing the operator
discovers.

24 px of coloured column against a 32 px tile is legible the width of the floor. That is the
entire point of the change.

#### Contents

One glyph per **distinct type** currently on the shelf, drawn at 12 px sitting on the fill's
surface, plus the `n/cap` counter moved from under the tile onto the throat. The per-item slot
grid is dropped for **input** shelves and kept for **output** shelves. That asymmetry is not
arbitrary: no player ever chooses an item off an input shelf, because `startPour` takes the
first keg by shelf order (`shared/src/sim/jig.ts:689-698`) and the seat picker names its own
index; whereas an output shelf of kegs is where you can see which one gleams, which is what
`glyphTint` in `resources/js/game/render/stationGlyphs.ts` says the glyphs are for.

#### Self-stocked types get a silo, not a funnel

`haulableInputs` already filters `SELF_STOCKED` out of the shelf's floor label
(`resources/js/game/render/dropTargets.ts`, `haulableInputs` and `shelfLabel`), so Assembly's
tile reads `KEGS IN` and not `KEGS · CASINGS IN`. The hopper carries that distinction into the
silhouette. Assembly's input shelf draws **two** bins side by side across its 28 px face:

- a **funnel** for `keg` — hazard-edged, matching the apron, three-quarters of the width;
- a **silo** for `casing` — plain grey, square-shouldered, closed at the top, with a small
  arrow feeding it from inside the machine and the word `AUTO` on its throat.

You cannot pour into a closed silo, and it is fed by a pipe from the machine. The drawing
makes the claim; §4 makes the rest of the game stop contradicting it.

`AUTO` is a `const` in `hopper.ts`, not a `copy.json` key. It is the same class of three-letter
functional label as the `IN` and `OUT` that `shelfLabel` builds in code, and contracts §14 puts
functional strings in code; only the three sentences in §3 go through `copy.json`.

#### `hopper.ts`

```ts
export type HopperKind = 'funnel' | 'chute';

export interface HopperBin {
    type: ItemType;
    count: number;
    /** `feed()` stocks it; no player ever brings one (`SELF_STOCKED`, §4). */
    selfStocked: boolean;
    label: string;
}

export interface Hopper {
    kind: HopperKind;
    /** The shelf tile; the funnel body rises into the tile above it. */
    tile: Tile;
    /** 0..1 of `capacity`, for the fill column. */
    fill: number;
    full: boolean;
    count: number;
    capacity: number;
    bins: HopperBin[];
}

export function hopperOf(
    station: StationConfig,
    side: 'in' | 'out',
    contents: ItemType[],
): Hopper | null;
```

`null` when the station has no shelf on that side — Boom Powder's input and both of the
Dock's. `fill` is `count / capacity` clamped to 1; `bins` is one entry per distinct type in
`contents`, in the shelf's own order, with `selfStocked` from `SELF_STOCKED` (imported from
`@shared` after §4's move, not from `dropTargets.ts`) and `label` from `pluralOf`. Pure.
`Stations.ts` calls it once per shelf per repaint, alongside the `shelfContents` call its
`update` already makes.

---

### 3. The fuse rack

#### What actually goes wrong

The complaint is "fuse generation is non-intuitive". The leading hypothesis was that the game
silently pre-picks the right fuse from the order and never says so. Read against the code that
is **half right, and the wrong half is worse.**

Refuted: the pick is not invisible. `drawRack` puts the two lengths on screen as a pair of
buttons with the chosen one filled and bolded (`resources/js/game/minigames/Jig.ts:955-970`),
lists the next two orders with their fuse lengths above them (`:936-951`, fed by
`state.orderChip = view.orders.slice(0, 2)` at `shared/src/sim/jig.ts:520`), echoes the pick
beside the fetch bar (`Jig.ts:1045`) and prints `← short · → long` in the legend (`:992-997`).
A player standing at the rack with the overlay open can see all of it.

Confirmed, and this is the real defect — **three things, in order of how much they cost:**

1. **The pre-pick is never labelled as a pre-pick.** `reconcileRoles` sets
   `state.bPick = view.orders[0]?.fuseLength ?? 'long'` the moment a body takes the rack tile
   (`shared/src/sim/jig.ts:556`). `view.orders` is `openOrders(world)` sorted by order number
   (`game-server/src/sim/minigames/jig.ts:89-97, 177-180`), so `orders[0]` **is** the active
   order — the same one `activeOrderId` resolves (`game-server/src/sim/orders.ts:85-100`) and
   the same one `seat` binds to the stick (`shared/src/sim/jig.ts:902`). The pick is correct.
   It just arrives looking exactly like a default. Nothing on screen connects the highlighted
   bin to the order chip two rows above it, so the player reads it as "LONG is selected"
   rather than "the order wants LONG and it is already selected", and never learns that the
   choice exists, is meaningful, or is currently right.
2. **It goes stale, silently.** `bPick` is derived *only* when the rack occupant changes —
   the assignment is inside `if (state.b !== b)` (`jig.ts:552-557`). It is otherwise written
   in exactly one other place, `rackInput`'s `pick` op (`jig.ts:947-951`), and initialised to
   `'long'` at `jig.ts:326`. So a B who takes the rack tile and stays there keeps the fuse
   length of whatever order was active when they arrived, through every order rollover, for
   the rest of the shift. Nothing tells them. They are not guessing wrong; they are being
   held to a stale answer.
3. **The punishment is remote and worn by someone else.** The mismatch is not caught at the
   rack, or at the toss, or at the crimp. It is caught at the ramp, where the Dock bonks the
   stick with `WRONG FUSE` (`game-server/src/sim/minigames/dock.ts:505-511`) — after a fetch,
   a toss, a pour, two or three knots and a crimp, several tiles of hauling, and usually in
   the hands of a *third* player who did none of it. Nowhere else in the game does the
   required length appear: the `Tab` order board prints
   `${id}  ${order.product}  ${order.shipped}/${order.qty}  ${order.status}`
   (`resources/js/game/ui/Hud.ts:218`) with no fuse column, the world order board prop draws
   the word `ORDERS` and nothing else (`resources/js/game/render/Floor.ts:221-230`), and the
   help panel's `At the rack` row says only "← → pick short or long fuse" without saying which
   or why (`resources/js/game/ui/helpContent.ts`, the assembly section).

So: the choice is on screen, the reason for it is not, the answer expires without notice, and
the bill arrives three stations downstream. That is a good enough description of
"non-intuitive" to fix.

#### The fix

**Two bins, in the world.** `fuseRack.ts` gives `JigWorldFx` the geometry for two bins drawn
on the rack tile `(13,7)`: **SHORT** on the left half, **LONG** on the right, each with a
spool glyph sized to its name (a tight coil, a loose one) and a 9 px label under it. Drawn for
every client, whether or not anybody is joined, so the rack reads as *two* things from the
aisle. Today it is one `outline(this.cfg.rackTiles, STATION_COLOURS.rack)` call in
`Stations.ts` — an orange tile edge — and nothing else.

**The order says what it wants, everywhere it is written.**
- `Hud.ts:218` gains a fuse column: `o-3  red_stick  LONG  0/8  open`.
- `Floor.ts:221-230` gives the order board prop at `(18,3)` a live second line — the active
  order's id and its fuse length — so the sentence exists in world space, on the wall between
  Assembly and the Dock that every hauler walks past.
- The B panel's order chips already carry it (`Jig.ts:936-951`); they stay.

**The pre-pick looks like a pre-pick.** `JigMg` gains `bPickFromOrder: boolean` — true while
`bPick` still tracks the active order and B has not overridden it. The B panel then draws the
bins in one of three states:

| `bPickFromOrder` | agrees with order | Bin | Caption under the bins | `copy.flow` key |
|---|---|---|---|---|
| `true` | — | filled, with a drawer pulled open | `PICKED FOR YOU · ORDER o-3 WANTS LONG` | `pickedForYou` |
| `false` | yes | filled | `YOUR PICK · LONG` | `yourPick` |
| `false` | no | filled, amber outline | `ORDER o-3 WANTS SHORT` | `orderWants` |

The first line is the whole fix. It names the order, names the length, and says the game did
it — which teaches the mechanic and dismisses it in the same breath, so a first-time B knows
both that the choice exists and that they can ignore it today.

All three are **templates with named placeholders**, stored in `config/game/copy.json` under a
new top-level `flow` section and rendered through `fill()` (`shared/src/copy.ts:71-77`):

```json
"flow": {
    "pickedForYou": "PICKED FOR YOU · ORDER {id} WANTS {length}",
    "yourPick": "YOUR PICK · {length}",
    "orderWants": "ORDER {id} WANTS {length}"
}
```

Contracts §14 says "functional strings with numbers … are code", and an order id has a number
in it, so this needs an argument rather than an omission. `copy.report.topPerformer`
(`"Top performer: {name} ({station})"`) is the precedent already in the file: a line in the
game's voice, interpolating an identifier, in `copy.json` because a designer will want to
reword it. These three are that. F13's `'<name> was removed from the crew'` toast is the other
side of the same line and is correctly code — a system notification nobody rewrites for tone.
The distinction §14 is reaching for is *whose sentence it is*, not whether it interpolates;
`fuseRack.ts` takes the template and the values and never builds the string itself.

**Keep it in step.** `reconcileRoles` re-derives `bPick` from `view.orders[0]` on every tick
while `bPickFromOrder` is true and `bPhase === 'idle'`, not only when the rack occupant
changes. Pressing `←` or `→` sets `bPickFromOrder = false` and stops the re-derive; pressing
back to the order's length sets it true again. B leaving clears both. A set already fetched or
in flight is never retimed — the guard on `bPhase === 'idle'` is what keeps the change out of
`advanceB` and `resolveToss`.

That is one condition widened and one boolean added. It closes the silent-staleness hole
without giving the sim a new opinion about anything.

**Say it in the help panel.** One row, reworded — not split. The assembly section's `At the
rack` row currently reads "← → pick short or long fuse, E to fetch, hold Space and release
over the cradle."; the apron workstream consolidated it into that single row, and splitting it
again would be churn for no reader. It becomes:

```ts
['At the rack', 'The order picks the fuse for you — the lit bin is the right one. ← → to override. E to fetch, hold Space and release over the cradle.']
```

The verbs it already carried survive; what it gains is the one fact it never said, which is
that the lit bin is an answer and not a default.

---

### 4. Casings are never hauled

State it plainly, because two separate surfaces currently imply otherwise: **casings are not
carried anywhere by anyone.** Assembly stocks its own input shelf. `feed()` pushes one
`stockCasing` effect per tick until the shelf holds `minigame.casings.stock` of them
(`shared/src/sim/jig.ts:568-581`), because Casing Prep is an M2 station and this is the M1
supply. Fuses are not hauled either: B fetches a set from Assembly's own rack tile in 0.6 s
(`jig.ts:953-959`) and tosses it two tiles across the station's own aisle. The only thing any
player ever carries into Assembly is a keg.

What still implies otherwise, and what F15 does about it:

| Where | What it implies | Fix |
|---|---|---|
| `game-server/src/sim/items.ts:494-503` — `E` facing an input shelf calls `shelfPull(world, shelf.station, shelf.side)` with no index, and `shelfPull` defaults to `shelf.length - 1` (`:331-338`), the newest item. With `feed()` topping casings up every tick, the newest item is very often a casing. | Press `E` at Assembly's in-tray meaning to take a keg back, walk away holding a casing, and every drop target on the floor lights up pointing you back at the shelf you took it from. | `shelfPull` gains no new parameter — it already takes an optional `index`. The *caller* at `:494-503` scans the shelf array backwards for the newest entry whose type is **not** in `SELF_STOCKED` and passes that index; no such entry means no pull, and the press falls through to the station. A player can still retrieve a keg; they can no longer acquire a casing. |
| `inputShelf.accepts: ["keg", "casing"]` in all five level files | Read literally, "bring me casings". The key is load-bearing — the shelf has to accept the type `feed()` puts on it — so it stays. | The drawing carries the distinction instead: the casing bin is a closed grey silo with an `AUTO` throat (§2), not a funnel. |

Two surfaces already get this right and are worth not breaking. `shortageOf`
(`resources/js/game/render/intake.ts`) raises an errand only for a *haulable* input: the empty
cradle answers `NEED A FUSE — RACK` with `haul: false`, and a shelf waiting on its own restock
answers `CASINGS COMING`, also `haul: false` — so the station never sends anybody after
something no player can fetch. It returns a `Shortage`, never `null`, in both of those cases;
the `null` is reserved for a station whose shortage the client cannot name. The `NEED KEGS`
bubble stays as it is. The help panel is the other: the `Casings` row of its `The line` section
already says the whole sentence out loud — "Never fetch them. Assembly stocks its own, so a keg
is the only thing you carry to it." — and the seat row in the assembly section is about the
picker inside the overlay, where "off the shelf" is literally where the casing comes from:
`seat` finds it in `view.shelf` by index (`shared/src/sim/jig.ts:895-898`), the same shelf
`feed()` stocks. Neither help row is touched, and neither should be reworded to say "rack" —
the rack holds fuses.

#### `SELF_STOCKED` has to move first

The fix above is not compilable where the constant currently lives. `SELF_STOCKED` is declared
in `resources/js/game/render/dropTargets.ts` — a browser render module. `game-server` builds
from `src/**`, `tests/**`, `scripts/**` and `../shared/src/**`, and its only path alias is
`@shared/*` (`game-server/tsconfig.json`); `resources/js/game` is Vite's tree and is not in the
program at all. `items.ts` cannot import it, today or ever.

So the constant moves to `shared/src/sim/constants.ts`, one line beside `ITEM_ID_PREFIX` and
`STATION_SHORT` — the same class of fact, the same owner (F02), the same file F15 is already
opening for `STATION_FLOW`, and already re-exported by `shared/src/index.ts:7`, so
`game-server/src/sim/items.ts` picks it up by adding one word to the `from '../shared'` import
it already has. It is not a tunable and does not belong in level JSON: "casings are the type
Assembly prints for itself" is an M1 contract fact that stops being true when Casing Prep
lands in M2, and that is a code change, not a config change.

`dropTargets.ts` then keeps one re-export line — `export { SELF_STOCKED } from '@shared';` —
rather than every client call site being repointed. That is deliberate: `intake.ts` imports it
from `dropTargets` and so does `dropTargets.test.ts`, and both files are open in the apron
workstream's tree. One line here beats two conflicts there, and the client keeps a single
module that documents what a self-stocked type means for drawing.

---

### Interfaces

**Consumes.** `StationConfig.{anchor, workTiles, rackTiles, inputShelf, outputShelf,
floorRing}` and `LayoutConfig` in full (§8); `StationState.{inputShelf, outputShelf, inputCap,
outputCap}` and `ItemState.type` for the fill and the bins (§3); `OrderState.{id, fuseLength,
status}` for the board and the rack; `JigMg.{bPick, orderChip}` (§10.9) plus the new
`bPickFromOrder`; `footprintOf` and `STATION_SHORT` from `shared/src/sim/stations.ts`;
`SELF_STOCKED` from `@shared` (§4 moves it there); `haulableInputs`, `pluralOf` and
`shelfLabel` from `render/dropTargets.ts`; `apron` and `outwardSide` from `render/intake.ts`;
`fill` from `shared/src/copy.ts`.

**Provides.** `checkFlowDirection(level, errors)` inside `validateLevelOnLayout`, so every level
file — the five shipped, F01's admin-edited database copies, and anything a designer writes
later — is gated on the geometry at room create (`game-server/src/config/levels.ts:56-62`
throws on `ok: false`). `hopperOf` and the `fuseRack` geometry for `Stations.ts` and
`JigWorldFx.ts`. `SELF_STOCKED` as a `@shared` export, which is what makes the §4 fix
compilable on the server. One new `flow` section in `copy.json` — `pickedForYou`, `yourPick`,
`orderWants`, all `{placeholder}` templates — and the matching
`flow: { pickedForYou: string; yourPick: string; orderWants: string }` field on `Copy`
(`shared/src/copy.ts`), without which the JSON keys are unreachable: the interface is closed
and `export const copy: Copy = copyJson` is the only accessor.

**Writes nothing to state.** No schema field, no message, no tick order. `bPickFromOrder` is a
derived field of the Jig's own `mg` JSON, written by F08's reducer, and everything else in
this doc is config geometry, one validation function and drawing.

## Acceptance criteria

- [ ] `config/game/layouts/one-line.json` matches the map above; `validateLayoutConfig`
      returns `ok`.
- [ ] All five level files carry the geometry above; `validateLevelConfig` and
      `validateLevelOnLayout` return `ok` / `[]` for each against `one-line`.
- [ ] The diff on those five files touches only the six geometry keys: `git diff -U0
      config/game/levels/` shows no changed line inside `minigame`, `staffing`,
      `nominalSeconds`, `floorSeconds`, `churnSensitive`, `joinMode`, `line`, `type` or
      `notes`. This is the check that F15 did not eat F14's crimp retune.
- [ ] `checkFlowDirection` reports nothing for all five shipped levels, for `devFactoryConfig`'s
      level-on-layout pair, and for every fixture pair in `shared/tests/fixtures` and
      `game-server/tests/fixtures` — and reports rules 1 and 4 for the geometry that ships
      today (three errors, listed above).
- [ ] `npx vitest run` is green in `shared` **and** in `game-server`, not only on
      `levels.test.ts`: `validate.test.ts`'s happy-path `validateLevelOnLayout` case and
      `game-server/tests/levels.test.ts`'s dev-level and loader cases are the ones the re-lay
      is most likely to have missed.
- [ ] `game-server/tests/levels.test.ts`'s broken-fixture case still fails on
      `powder-a.workTiles: 0,0 is a wall` and not on a flow rule — the fixture's deliberate
      break survived the re-lay.
- [ ] A level with `flowRightward: false` and a non-empty `notes` skips rules 1–4; the same
      level with an empty or absent `notes` fails `validateLevelConfig`.
- [ ] Standing at the door at `(14,17)`, the three machines read left to right in process
      order, and both hauls are a straight walk along row 4.
- [ ] Boom Powder's output shelf draws a right-facing chute over `(7,4)`; its fill column
      rises with each keg and its outline goes red at 6/6, legibly from the Dock end of the
      floor.
- [ ] Assembly's input shelf draws a keg funnel and a closed grey `AUTO` silo side by side;
      the funnel fills as kegs are delivered and the silo's count moves without anybody
      touching it.
- [ ] The apron's stripes are still visible on the shelf tile and the standing tile beside it,
      unobscured by the hopper, in both the dim and the lit pass.
- [ ] The `n/cap` counter reads on the hopper throat, not under the tile, and is red at cap.
- [ ] The rack tile `(13,7)` draws two labelled bins, SHORT left and LONG right, to every
      client, with nobody joined.
- [ ] `Tab` shows a fuse column; the world order board at `(18,3)` shows the active order's id
      and fuse length.
- [ ] A player taking the rack tile sees `PICKED FOR YOU · ORDER o-N WANTS <LENGTH>` and a
      bin that matches the active order.
- [ ] With B standing still, completing an order whose successor wants the other length flips
      the lit bin and the caption within one tick; B's next fetch produces the new length.
- [ ] Pressing `←`/`→` flips the caption to `YOUR PICK`, stops the re-derive, and shows
      `ORDER o-N WANTS <OTHER>` in amber when the pick disagrees.
- [ ] `E` facing Assembly's input shelf never puts a casing in a player's hands, and still
      returns a keg when one is on the shelf.
- [ ] `SELF_STOCKED` resolves from `@shared` in `game-server/src/sim/items.ts` and
      `npm run typecheck` is clean in `game-server`; `dropTargets.ts` re-exports it and
      `intake.ts` and `dropTargets.test.ts` are unchanged.
- [ ] The three `flow` captions render from `copy.json` through `fill()` — changing the JSON
      changes what the B panel says without touching `fuseRack.ts`.
- [ ] `docs/features/README.md` and this doc's status boxes are ticked only after the in-app
      run.

## Test plan

**`shared/tests/flowDirection.test.ts`** (vitest, hand-built minimal levels and layouts):
- rule 1: it rejects an output shelf at or left of the station's rightmost work tile · it
  passes a station with no output shelf.
- rule 2: it rejects a station whose leftmost named tile is at or left of its upstream's
  rightmost · it counts `rackTiles` in the extent · it uses `STATION_FLOW` order, not file
  order.
- rule 3: it rejects an input shelf at or right of the leftmost work tile · it passes a
  station with no input shelf.
- rule 4: it rejects an out-face row outside the next station's y-extent · it uses the work
  tiles' y-span when the upstream has no output shelf.
- exemption: a `rackTiles` entry left of the input shelf or right of the output shelf does not
  trip rules 1–3.
- opt-out: `flowRightward: false` skips all four · `flowRightward: false` with an empty
  `notes` is a `validateLevelConfig` error · `flowRightward` absent behaves as `true`.

**`shared/tests/levels.test.ts`** (touch — one `describe`, over the files on disk):
- for each of the five shipped level keys, `validateLevelOnLayout(level, layout)` returns `[]`
  — which now includes the flow checks, so this is the ADR 0015 gate for everything this repo
  ships and everything it ships later.
- for each shipped **layout**, every station in every level that names it satisfies rules 1–4
  stated directly, not via the validator, so a bug in `checkFlowDirection` cannot make the
  gate pass vacuously.
- the re-laid geometry is identical across all five level files — a deep-equal over exactly
  `anchor`, `workTiles`, `rackTiles`, `inputShelf`, `outputShelf` and `floorRing` per station,
  **not** over the whole station block — so the next re-lay is one edit copied five times and
  not five drifts. Whole-block equality is the wrong assertion twice over: `level-04`'s
  `assembly-a.staffing` already differs from the other four and is meant to, and
  `minigame.crimp` belongs to F14, so a whole-block comparison would be red on arrival and
  red again the moment F14 lands.

**`resources/js/game/__tests__/hopper.test.ts`**:
- `hopperOf` returns `null` for a side with no shelf; `'funnel'` for `in`, `'chute'` for `out`.
- fill is `count / capacity`, 0 when empty, 1 at capacity, clamped above capacity.
- `full` is true only at or above capacity.
- bins are one per distinct type in shelf order, not one per item.
- a `casing` bin is `selfStocked`; a `keg` bin is not.
- labels come from `pluralOf`, so a new item type needs no change here.

**`resources/js/game/__tests__/fuseRack.test.ts`**:
- the two bin rectangles split the rack tile, SHORT left of LONG, at every tile position.
- the caption is `PICKED FOR YOU · ORDER <id> WANTS <LENGTH>` when `bPickFromOrder`; `YOUR
  PICK · <LENGTH>` when not and the pick agrees; `ORDER <id> WANTS <OTHER>` when not and it
  disagrees.
- with no open order the caption is the no-orders line and neither bin is amber.

**`shared/tests/jig.test.ts`** (touch, F08's file):
- `bPickFromOrder` is true when a body takes the rack tile and `bPick` comes from the order.
- a tick whose `view.orders[0]` changes re-derives `bPick` while `bPickFromOrder` and idle.
- a `pick` op clears `bPickFromOrder` and the next order rollover leaves `bPick` alone.
- a `pick` back to the order's own length restores `bPickFromOrder`.
- the re-derive does not fire while `bPhase` is `fetching`, `holding` or `swinging`.
- B leaving clears both fields.

**`game-server/tests/items.test.ts`** (touch, F06's file):
- `E` at an input shelf holding `[keg, casing]` hands over the keg.
- `E` at an input shelf holding `[keg, casing, casing]` still hands over the keg — the scan is
  backwards past *every* self-stocked entry, not just the last one.
- `E` at an input shelf holding only casings hands over nothing and falls through to the
  station press.

**Existing suites that must go green again, not new tests** (the re-lay's real blast radius):
- `shared/tests/validate.test.ts` — the `validateLevelOnLayout` happy path asserts `[]` on
  `shared/tests/fixtures/level-m1.json`, which carries the old zigzag.
- `game-server/tests/levels.test.ts` — the dev-level case, the two loader cases over
  `fixtures/levels` and `fixtures/bare`, and the broken-fixture case whose expected error text
  must not change.
Nothing in these files is rewritten; only the fixtures they read are.

**In-app verification** (`composer run dev`, `npm run dev` in `game-server`,
`DEV_ALLOW_NO_TICKET=1`, two browsers, `data-debug=1`):
1. Screenshot the whole floor from the door: the three machines in order, both hauls straight.
2. Run Boom Powder to 6/6 without hauling; screenshot the chute full and red **from the Dock
   end of the floor** — the point is that it is readable there.
3. Haul three kegs; screenshot Assembly's funnel filling and the casing silo's count moving on
   its own.
4. Screenshot the apron stripes at `(11,4)`/`(10,4)` with the hopper drawn, dim and lit.
5. Browser 2 takes the rack tile: screenshot `PICKED FOR YOU`, then the two world bins from
   browser 1's view.
6. Ship an order and let the next one want the other length while B stands still: screenshot
   the flipped bin and caption.
7. Press `←`: screenshot `YOUR PICK`, then the amber `ORDER WANTS` state.
8. Press `E` at Assembly's in-tray with casings on the shelf: confirm hands stay empty or take
   the keg, never a casing.

## Tasks

- [ ] 1. `STATION_FLOW` and `SELF_STOCKED` in `shared/src/sim/constants.ts`; the re-export line
      in `dropTargets.ts`; `flowRightward` in `config/types.ts`, `schema.json` and
      `defaults.ts`; the `notes` rule in `semanticErrors`. `npm run typecheck` clean in all
      three packages with no other file changed.
- [ ] 2. `checkFlowDirection(level, errors)` in `validate.ts`, called from
      `validateLevelOnLayout` after the per-station loop and before the ramp check;
      `shared/tests/flowDirection.test.ts` green. Every level and fixture in the repo goes red
      here and stays red until task 3 — land 2 and 3 together.
- [ ] 3. Re-lay, in one commit: `one-line.json`, the five level files, `DEV_LAYOUT` +
      `DEV_LEVEL.stations` + the two `mvp-small` strings in `devLevel.ts`, the two
      `shared/tests/fixtures` files, the seven `game-server/tests/fixtures` files, and the
      `shared/tests/levels.test.ts` describe. `npx vitest run` green in `shared` **and**
      `game-server`; `npm run typecheck` clean in `shared` and `game-server`. Five of these are
      F12's files and F14's crimp retune is queued behind this commit — read "Landing order"
      under Risks before opening them.
- [ ] 4. `render/hopper.ts` + its test; the funnel, chute, fill, throat counter and bins in
      `Stations.ts`; the counter's new anchor. Verified in the app (steps 1–4).
- [ ] 5. `outwardSide` stops guessing (input −1, output +1) per ADR 0015's Consequences;
      re-run the apron workstream's `intake.test.ts`.
- [ ] 6. `bPickFromOrder` and the re-derive in `shared/src/sim/jig.ts`; F08's tests extended.
- [ ] 7. `render/fuseRack.ts` + its test; the two world bins in `JigWorldFx.ts`; the ribbon and
      captions in `Jig.ts`. Verified in the app (steps 5–7).
- [ ] 8. The fuse column in `Hud.ts`, the live line on the order board in `Floor.ts`, the
      `flow` section in `copy.json` **and its field on `Copy` in `shared/src/copy.ts`** (one
      without the other does not compile), the reworded `At the rack` row in `helpContent.ts`.
- [ ] 9. The `shelfPull` caller skips self-stocked types; F06's test. Verified in the app
      (step 8).
- [ ] 10. In-app steps 1–8 with screenshots; tick the boxes here and the row in
      `docs/features/README.md`.

## Risks & open questions

- **Tasks 2 and 3 are one commit — and the blast radius is sixteen files, not five.**
  `shared/tests/levels.test.ts` reads the shipped files off disk and is the gate F01's PHP
  schema pass and F03's runtime pass sit behind, so all five levels fail the moment
  `checkFlowDirection` exists. So do the dev level and all four test-fixture pairs, because
  every one of them is asserted through `validateLevelOnLayout` and expected to return `[]`
  (the table under "The dev level and the test fixtures" lists each assertion). Splitting the
  check from the re-lay leaves `main` red across three packages for however long that takes.
  This is one commit, not one PR with intermediate pushes: the tree between the check and the
  re-lay is a state nobody should be able to fetch.
- **Landing order: F12 settles, then F15, then F14.** Three workstreams write
  `config/game/levels/*.json`, and F12 owns it (contracts §12). F12 is mid-flight as this is
  written — `one-line.json` and `level-01-basic-flow.json` are modified in the working tree and
  `level-02`, `level-03`, `level-04` and `sandbox.json` are untracked — so **nothing here opens
  a level file until F12's five have landed.** Re-laying a file that does not exist yet on
  `main` produces a merge, not a diff. Then F14 rewrites `minigame.crimp` in the same five
  files (`docs/features/F14-difficulty-tuning.md:4`, `:368`, `:649`), and F14 and F15 are the
  same shape: a gate that reddens every level, then the edit that greens it (F15 tasks 2 + 3
  here; F14 tasks 2 + 4 at `F14:646-650`). Interleaved, `main` is red for two unrelated reasons
  at once and neither workstream can read its own gate. So: **F15 tasks 2 + 3 land as one
  commit, and F14 tasks 2 + 4 land after it as one commit.** Both are single commits rather
  than PRs with intermediate pushes, for the reason in the bullet above. That order rather than the
  reverse because F15 rewrites whole station blocks while F14 replaces one nested key — a
  nested-key edit drops cleanly onto re-laid geometry, whereas a re-lay landing on top of a
  retune has to carry F14's new `crimp` numbers through five files by hand and can revert them
  without anyone noticing. If F14 ships first for its own reasons, F15 task 3 re-reads each
  file's `minigame` block off disk instead of copying anything quoted in this doc, and the
  `git diff -U0` acceptance criterion is what proves it did. F14 needs the reciprocal line; it
  is in this doc's contract-change list as bullet 9 so the v2.2 pass records the order in §12
  rather than in two feature docs that can drift.
- **Rule 4 does not force a station's own shelves onto its own work row.** It constrains the
  *handoff* — the upstream's out-face has to land inside the downstream's y-extent — which is
  what catches today's zigzag. It would still pass a layout where Boom Powder's out-tray sat
  four rows below its work tile, as long as Assembly were tall enough to contain it. The
  re-laid floor puts every shelf on its own machine's face because that is obviously right,
  not because a rule made it. Whether that deserves a fifth rule is a question for the next
  layout, not this one; ADR 0015 accepted four and inventing a fifth here would be a decision
  made in the wrong document.
- **A wrong fuse is still only caught at the ramp.** F15 makes the requirement visible at the
  rack, on the board and in the HUD, and stops the pick going stale — which should make the
  mismatch rare and deliberate rather than common and invisible. It does not tint the `parts`
  set or the finished stick, because item glyphs are F06's
  (`resources/js/game/render/Items.ts`) and a cross-feature tint is not worth buying before a
  playtest says the remaining rate is annoying. Watch it.
- **The band is one row deep and the floor below it is empty.** Rows 8–13 are now open floor
  with nothing on them. That is deliberate — it is where the crew queues, where the pile
  spreads, and where the blast has somewhere to go — but it is also six rows of nothing, and a
  28 × 18 map that uses ten rows may want to be a 28 × 12 map. Changing `height` moves every
  wall index, so it is a separate, cheap, later edit; do it after a playtest confirms the band
  is the right depth, not before.
- **The two hauls are three and five tiles.** Shorter than today's diagonal routes. If M1
  playtests come back saying hauling is now trivial and Assembly starves too rarely, the
  fix is `movement.tilesPerSecond` or the gap between machines, not the ordering — widening
  the gaps costs two numbers per station and keeps every invariant.
- **`accepts: ["keg", "casing"]` still reads like an instruction in the JSON.** The key is
  load-bearing (`feed()` puts casings on that shelf, so the shelf must accept them) and the
  drawing now carries the distinction, but a designer reading the level file will still
  reasonably think casings are delivered. A `selfStocked: ItemType[]` key on `inputShelf`
  would say it in the config. Not proposed here — one more schema key to carry the same fact
  `SELF_STOCKED` already carries, and after §4's move that fact is at least in `@shared` where
  both sides can read it rather than in a render module — but worth raising if a second
  self-stocked type ever appears, which is exactly what M2's Casing Prep will force.
- **Three `flow` strings in `copy.json` sit on a line contracts §14 has not drawn cleanly.**
  §3 argues them in (game's voice, designer will reword, `report.topPerformer` is the
  precedent) and F13 argues its removal toast out (system notification), and both are right,
  but §14's stated test — "functional strings with numbers" — separates them the wrong way
  round. The v2.2 pass should sharpen §14 rather than let two feature docs each cite it for
  opposite conclusions. Nothing in F15 blocks on the outcome: if the pass rules the other way,
  the three templates move into `fuseRack.ts` and the `Copy` touch disappears.

## Contract changes required

Apply in the v2.2 pass. Bullets 1–7 are ADR 0015's own list, restated here because F15 is what
lands them; 8–12 are F15's.

1. **§8, `LevelConfig` top-level keys** — add `flowRightward?` to the key list (the root is
   `additionalProperties: false`, so it must be declared). Type `boolean`. Writer: the level
   JSON, i.e. the designer. Default `true` (§13).
2. **§8, `LevelConfig` prose** — add: "`flowRightward` (default `true`): the floor reads left
   to right in process order (ADR 0015). `false` disables the flow-direction checks in
   `validateLevelOnLayout` and is accepted only when `notes` is a non-empty string."
3. **§8, `StationConfig` prose** — after the `inputShelf?` / `outputShelf?` sentence, add: "An
   input shelf sits on the station's left face and an output shelf on its right
   (`inputShelf.tile[0] < min(workTiles.x)`, `outputShelf.tile[0] > max(workTiles.x)`);
   `rackTiles` are the station's own supply and are exempt."
4. **§8, Validation** — extend the `validateLevelOnLayout(level, layout): string[]` check list
   with a `checkFlowDirection(level, errors)` call — **two arguments**, per ADR 0015's Rejected
   list: rules 1–4 are arithmetic over the level's own named tiles and never read `walls`,
   `width`/`height`, `ramp` or `truckBay`, so a `layout` parameter would be dead on arrival.
   The rules, when `level.flowRightward !== false`: (a) `outputShelf.tile[0] > max(workTiles.x)`;
   (b) per line, in `STATION_FLOW` order, the next station's minimum named-tile x exceeds the
   previous station's maximum; (c) `inputShelf.tile[0] < min(workTiles.x)`; (d) the previous
   station's out-face row (`outputShelf.tile[1]`, or the `workTiles` y-span when it has no
   output shelf) lies within the next station's named-tile y-extent. "Named tiles" =
   `anchor`, `workTiles`, `rackTiles` and both shelf tiles — the set `footprintOf` spans.
5. **§8, Validation** — add to `validateLevelConfig`'s semantic rules: `flowRightward === false`
   requires a non-empty `notes`.
6. **§13, Defaults table** — new row: `flowRightward` | `true` | `validateLevelOnLayout`
   (F02; F12 level files).
7. **§13, constants list** — add `STATION_FLOW` to the `shared/src/sim/constants.ts` line:
   `readonly StationType[] = ['boom_powder', 'assembly', 'dock']`. It is the process order
   rule (b) sorts by — a contract fact, not a tunable, and not level JSON. Also declare
   `flowRightward: { "type": "boolean" }` on the `LevelConfig` root of
   `shared/src/config/schema.json`, since F01 validates by path against that same file.
8. **§8, Level files** — the paragraph naming the shipped files says "layout `mvp-small`"
   (`00-contracts.md:401`), but every level on disk carries `"layout": "one-line"` and the only
   file in `config/game/layouts/` is `one-line.json`; `devLevel.ts:34` and `:364` still say
   `mvp-small`. Fix the contract to `one-line` and fix both `devLevel.ts` strings to match, so
   the name in §8, the name in the files and the name in the fallback level are one name.
   Writer: F12 (files), F03 (`devLevel.ts`). No default; the key is required. Also add a
   sentence: "The dev fallback level (`game-server/src/config/devLevel.ts`) and every level and
   layout fixture under `shared/tests/fixtures` and `game-server/tests/fixtures` carry the same
   station geometry as the shipped files. A re-lay is one edit copied everywhere, and every one
   of those pairs is asserted through `validateLevelOnLayout`."
9. **§12, Ownership table** — new row, after the "Levels, layout, copy" row:
   `Legible flow` | `resources/js/game/render/{hopper,fuseRack}.ts`, their tests,
   `shared/tests/flowDirection.test.ts` | **F15** | `layouts/one-line.json` (whole file) + the
   six geometry keys (`anchor`, `workTiles`, `rackTiles`, `inputShelf`, `outputShelf`,
   `floorRing`) of every station block in `levels/*.json` + `levels.test.ts` + `copy.json` +
   `copy.ts` (F12) · `validate.ts` + `config/types.ts` + `schema.json` + `defaults.ts` +
   `constants.ts` + `shared/tests/fixtures/*` (F02) · `devLevel.ts` +
   `game-server/tests/fixtures/**` (F03) · `Stations.ts` + `intake.ts` + `dropTargets.ts`
   (F05) · `items.ts` (F06) · `jig.ts` + `Jig.ts` + `JigWorldFx.ts` (F08) · `Hud.ts` +
   `Floor.ts` + `helpContent.ts` (F04). Also add `render/{intake,dropTargets}.ts` to F05's row
   — they exist in the tree and §12 names neither owner, which is why both read as F05's above
   rather than F04's. The `levels/*.json` touch is deliberately narrow, and §12 should say so
   in the row: F15 never opens `minigame` or `staffing`. **F15 owns no config file**; the
   "Levels, layout, copy" row stays F12's in full.
   And a second §12 edit, one sentence beside the "Field ownership resolved" paragraph:
   "`config/game/levels/*.json` has two concurrent touchers. **F15's geometry re-lay lands
   before F14's `minigame.crimp` retune**; each opens disjoint keys and neither reformats the
   file." That sentence is the landing order's home — F15 and F14 both point at §12 rather
   than at each other, so the order survives either doc being rewritten.
10. **§10.9, `JigMg`** — add `bPickFromOrder: boolean` after `bPick`. Writer: **F08**
    (`reconcileRoles` and `rackInput` in `shared/src/sim/jig.ts`). Default `false` at
    `createJigState`, set `true` whenever `bPick` is derived from `view.orders[0]` and `false`
    on any `pick` op that disagrees with the active order. Read by F15's B panel and the world
    rack. Projected by `toMg` like every other public field.
11. **§13, constants list** — add `SELF_STOCKED` to the `shared/src/sim/constants.ts` line:
    `readonly ItemType[] = ['casing']` — the types a station stocks onto its own input shelf,
    which no player ever hauls. It moves there from
    `resources/js/game/render/dropTargets.ts`, which the game server cannot import
    (`game-server/tsconfig.json` builds from `src`, `tests`, `scripts` and `../shared/src`,
    with `@shared/*` as its only alias), and `dropTargets.ts` keeps a one-line re-export so no
    client call site moves. Writer: **F02**. It is a contract fact, not a tunable, and not
    level JSON; M2's Casing Prep is what changes it. No default — a constant, not a config key.
12. **§8, copy** — `config/game/copy.json` gains a top-level `flow` section and `Copy`
    (`shared/src/copy.ts`) gains the matching field
    `flow: { pickedForYou: string; yourPick: string; orderWants: string }`. All three are
    `{placeholder}` templates rendered through `fill()`: `"PICKED FOR YOU · ORDER {id} WANTS
    {length}"`, `"YOUR PICK · {length}"`, `"ORDER {id} WANTS {length}"`. Writer: **F12** (both
    files), read by F15's `fuseRack.ts`. While §8 is open, §14 deserves a sharper test than
    "functional strings with numbers are code" — `copy.report.topPerformer` interpolates a name
    and a station and lives in `copy.json`, F13's removal toast interpolates a name and is
    correctly code, and the rule as written does not separate them. See the last bullet under
    Risks.
