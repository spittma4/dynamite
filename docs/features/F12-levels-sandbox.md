# F12 — Levels 1–4 + Sandbox: config JSON, layout tilemap, copy, validation, level select
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns** (contracts §12, "Levels, layout, copy"): `config/game/**` (`levels/*.json`, `layouts/mvp-small.json`, `copy.json`) · `shared/src/copy.ts` · `shared/tests/levels.test.ts` · `shared/tests/copy.test.ts` · `docs/PLAYTEST.md`
**Touches** (the only edits to another owner's files, each named in the Files table): F01 — `Level::isSandbox`, `Level::isUnlockedFor`, `PlayController` `$debug`, `LevelFactory::sandbox`, `tests/Feature/Levels/*`; F02 — one line `export * from './copy';` in `shared/src/index.ts`
**Reads:** `docs/features/00-contracts.md` (v2 — binding; §2 tick/tile/movement, §3 schema, §5 Laravel, §6 mount, §7 join modes, §8 level/layout/copy, §12 ownership, §13 defaults) · `docs/features/F01-laravel-foundation.md` (level table, `Level` model, sync, level select, play page) · `docs/features/F02-shared-sim.md` (the schema and validators every file below must pass) · `docs/09-progression.md` · `docs/13-config-schema.md` · `docs/02-factory-floor.md` · `docs/03-stations.md` · `docs/04-minigames.md` · `docs/05-flow-mechanics.md` · `docs/16-hazards-and-explosions.md` · `docs/17-oops-carry-and-throw.md` · `docs/18-days-grades-and-payday.md` · `docs/19-scaling-3-to-10.md` · `docs/14-roadmap.md` · `.ai/rules/config.md`

## Goal

When this is done a factory owner opens the factory page and sees five choices — **Basic Flow**, **Too Much Powder**, **The Bottleneck**, **Too Many Helpers**, and **Sandbox** — with the levels above `unlocked_level` greyed and Sandbox always available. Picking one and clicking Enter factory loads a 28 × 18 floor with the Slammer top-left, the Jig in the middle, the dock top-right, a break room at the bottom and a door at the bottom edge where everyone spawns; the numbers the sim runs on (curves, shelves, windows, hazards, book, clock) come from that level's JSON, and the four levels differ only in those numbers. Sandbox has no shift clock, never ends, never grades, cannot be lost, starts with the debug overlay on, and can be started alone (`players.min 1`). Every joke line the game shows — clipboard, bubbles, chore labels, spark toasts, banners, report headings — comes from one `copy.json`. A vitest run refuses any level file that would fail at room create, and `php artisan game:levels:sync` seeds the five files. `docs/PLAYTEST.md` tells a person how to run all of it locally and what to listen for.

## Scope

**In (M1):**
- `config/game/layouts/mvp-small.json` — the 28 × 18 tilemap below in the `LayoutConfig` shape of contracts §8 (`walls` as the complete impassable set, `truckBay`, `props`).
- `config/game/levels/level-01-basic-flow.json`, `level-02-too-much-powder.json`, `level-03-the-bottleneck.json`, `level-04-too-many-helpers.json`, `sandbox.json` — every key contracts §8 requires plus the §13-optional keys listed under Data & config, with the docs' numbers; the four levels differ only where the ladder needs them to.
- `config/game/copy.json` + `shared/src/copy.ts` — the `Copy` shape of contracts §8, typed, read by the server from `@shared` and by the client from the `config` reply.
- `shared/tests/levels.test.ts` — validates every shipped level and layout with F02's validators and checks the tilemap's structural invariants; `shared/tests/copy.test.ts`.
- Laravel (touches into F01): Sandbox is always unlocked; Sandbox turns `data-debug` on; the shipped files sync (Pest tests in `tests/Feature/Levels/`).
- `docs/PLAYTEST.md`.

**Out (other owners / later milestones):**
- `shared/src/config/{schema.json,types.ts,validate.ts,defaults.ts}` — **F02**. Contracts §8 and §13 pin the schema, the semantic rules and the defaults these files rely on; F12 ships data against them and never edits them.
- The runtime behaviour of `endsOn: 'never'` — F03 (clock and end gating, no report, no POST), F09 (orders created on demand), F04 (elapsed-time HUD), F11 (`isSandbox(world)`). F12 ships the data and the Laravel gating only.
- Levels 5–6 (Casing Prep, QA, Rework, Packing, Returns, crates) and the `two-line` layout — **M2**.
- Levels 7–8, the `events` block, the Phone tile, ambiguous orders — **M3** (`copy.json` already carries the docs/07 event lines because they are copy, not config; nothing reads them until M3).
- Levels 9–10, upgrades, Payday, "all upgrades free" in Sandbox, the repeat-the-day banner — **M4**.
- Per-level clipboard overrides (`LevelConfig.copy.clipboard`) — the rule is defined below and tested, but no M1 level uses it; Level 9 (M4) is the first.

## Design

### Files

| Path | Create/modify | Responsibility |
|---|---|---|
| `config/game/layouts/mvp-small.json` | create | The 28 × 18 tilemap: `walls` (118 packed indices — the complete impassable set), `spawn`, `breakRoom`, `blastBins`, `dockDoor`, `truckBay`, `ramp`, `beaconPoles`, `orderBoard`, `props` |
| `config/game/levels/level-02-too-much-powder.json` | create | The baseline level — every docs number; the other four are diffs of it |
| `config/game/levels/level-01-basic-flow.json` | create | Baseline + setback mode + book 8 |
| `config/game/levels/level-03-the-bottleneck.json` | create | Baseline + 4–6 players + 45 s trucks + book 13 + easier `qtyPerTruck` |
| `config/game/levels/level-04-too-many-helpers.json` | create | Baseline + 4–6 players + the punishing Assembly curve |
| `config/game/levels/sandbox.json` | create | Baseline + `endsOn: never` + `players.min 1` + setback mode |
| `config/game/copy.json` | create | Every joke line: clipboard, chores, bubbles, station bubbles, emotes, banners, spark toasts, report lines, event lines |
| `shared/src/copy.ts` | create | Imports `copy.json`, exports the `Copy` type, `copy`, `clipboardLines()`, `fill()` |
| `shared/src/index.ts` | touch (F02, one line) | `export * from './copy';` — contracts §1, one export line per module owner |
| `shared/tests/levels.test.ts` | create | Every level/layout file passes F02's three validators; tilemap invariants; ladder invariants; the book fits the shift |
| `shared/tests/copy.test.ts` | create | `copy.json` completeness against `Copy`; `clipboardLines`; `fill` |
| `app/Models/Level.php` | touch (F01) | Add `isSandbox(): bool`; `isUnlockedFor()` becomes `isSandbox() \|\| sort <= unlocked_level` (contracts §5) |
| `app/Http/Controllers/PlayController.php` | touch (F01) | `$debug` also true when `effectiveLevel()->isSandbox()` (contracts §6) |
| `database/factories/LevelFactory.php` | touch (F01) | Add state `sandbox()` |
| `tests/Feature/Levels/SandboxLevelTest.php` | create (F01 area, F12 touch) | Sandbox unlock, select, `data-debug` |
| `tests/Feature/Levels/ShippedLevelsSyncTest.php` | create (F01 area, F12 touch) | The real `config/game/levels/*.json` sync through F01's `SyncLevelsFromDisk` against the real `shared/src/config/schema.json` |
| `docs/PLAYTEST.md` | create | How to run everything locally, the three sentences, what to watch, how to report a bug |

### Interfaces

**Consumes**

- F02 (`shared/src/config/validate.ts`, Node-only, imported by the tests as `../src/config/validate`): `validateLevelConfig(input: unknown): ValidationResult<LevelConfig>` — **returns the config with the §13 defaults applied**, so a test that asserts a shipped file's own bytes reads the file with `node:fs` rather than the validator's output; `validateLayoutConfig(input: unknown): ValidationResult<LayoutConfig>`; `validateLevelOnLayout(level: LevelConfig, layout: LayoutConfig): string[]` (`[]` = ok). `ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }`.
- F02 (barrel `shared/src/index.ts`): `LevelConfig`, `StationConfig`, `LayoutConfig`, `ScaledLevel`, `ScalingBreakpoint`, `Tile`, `StaffingCurve`, `Banner`, `BANNERS`, `efficiencyFor(curve, workers)`, `scaleLevel(level, players): ScaledLevel`, `breakpointFor(level, players)`, `packTile(x, y, width)`, `unpackTile(index, width)`, `tileOf(x, y)` — the tile helpers live in `shared/src/sim/tiles.ts` and no file redefines them.
- F02's schema shapes, which every shipped file matches exactly (contracts §8): root `additionalProperties: false` over `key name notes? day players layout groove clipboardSeconds clipboardMemorySeconds? interrupts? movement? bpm windowFloorsMs carry stations recipes orders hazards grading scoring? economy scaling copy?`; `StationConfig` `additionalProperties: false` over `id type line joinMode anchor workTiles rackTiles inputShelf? outputShelf? floorRing nominalSeconds floorSeconds staffing churnSensitive minigame`; `joinMode: 'press' | 'stand'` required; `inputShelf?: { tile, capacity, accepts: ItemType[] }`, `outputShelf?: { tile, capacity }` absent for Powder input and both dock shelves; `groove.weights` with the eleven required keys plus optional `truckComplete`; `grading.verdict` plus optional `advanceOn`; `scaling.breakpoints[] = { maxPlayers, lines, truckEverySeconds, orderBook, layout? }`; `players.min ≥ 3`, except `≥ 1` when `day.endsOn === 'never'`; `players.max ≤ 10`; `copy?` with `additionalProperties: true`.
- F01: `App\Models\Level` (`config`/`layout` as `stdClass` via `JsonObject`, `scopeActive()`, `isUnlockedFor(Factory)`, `sort` = 1-based lexical file position), `App\Models\Factory::effectiveLevel()`, `App\Actions\SyncLevelsFromDisk::handle(): array{created: list<string>, updated: list<string>}`, the level-file rules (`key` = file stem; `layout` names `config/game/layouts/<layout>.json` whose `key` = stem), `Livewire\Factories\Show` (`flux:select` of `Level::active()->orderBy('sort')`, "— locked" suffix, `updatedLevelId` re-check through `isUnlockedFor`), `PlayController` (`$debug = config('app.debug') || $request->boolean('debug')`), `database/factories/LevelFactory.php`, the seeder (`unlocked_level = 4` on Kaboom & Sons), `config('game.levels_path' | 'layouts_path' | 'schema_path')`, `StoreRun` (contracts §5 — its unlock step reads `grading.advanceOn`).
- F03 env (contracts §2): `LEVELS_DIR=../config/game/levels` is the only path env; **layouts are resolved as `path.join(LEVELS_DIR, '../layouts')`** — there is no `LAYOUTS_DIR`.
- Contracts §3: the server writes `FactoryState.levelKey` from `level.key`, `layoutKey` from `layout.key`, `shiftSeconds` from `day.shiftSeconds`, `width`/`height` from the layout; `PlayerState.bubble` carries strings from `copy.bubbles.*`; `FactoryState.banner` carries a `Banner` key the client looks up in `copy.banners`.
- Contracts §4/§8: the client receives `{ level, layout, copy }` in the `config` reply (F03 sends it on join, on request and after a reconnection); `level` is `world.level` — the **scaled** level with defaults applied.

**Produces**

Files (shapes in Data & config): five `LevelConfig` documents, one `LayoutConfig` document, one `Copy` document.

`shared/src/copy.ts` (contracts §8, verbatim):

```ts
import type { Banner } from './schema/types';
import type { SparkCause } from './sim/hazards';
import type { LevelConfig } from './config/types';

export type BannerKey = Exclude<Banner, ''>;
export interface Copy {
  clipboard: string[];
  chores: { unjam: string; sweep: string; stomp: string; repair: string };
  bubbles: { whatCanIDo: string; whoThrewThat: string; sawTheHighway: string };
  stations: { needHands: string; needParts: string };
  emotes: { stop: string; help: string; go: string; what: string };
  banners: Record<BannerKey, string>;
  hazards: { sparks: Record<SparkCause, string> };
  report: { individualHeading: string; factoryHeading: string; topPerformer: string; materials: string;
    certificate: string; repeatDay: string; fireMarshal: string; loss: string; sandbox: string };
  events: Record<string, string>;
  standupBubbles: string[];
}
export const copy: Copy;                                                    // the parsed config/game/copy.json
export function clipboardLines(level: Pick<LevelConfig, 'copy'>): string[]; // level.copy?.clipboard ?? copy.clipboard
export function fill(template: string, vars: Record<string, string | number>): string; // '{name}' → vars.name; unknown placeholders stay as written
```

Consumers by section (contracts §8, §10). The **server** reads `copy` from `@shared` through `game-server/src/shared.ts`: F03 `copy.emotes[kind]`; F05 `clipboardLines(world.level)` for the clipboard line and `copy.stations.needHands/needParts`; F06 `copy.bubbles.whoThrewThat`, `copy.chores.unjam/sweep`; F09 `copy.bubbles.sawTheHighway`; F10 `copy.hazards.sparks[cause]`, `copy.chores.repair`. The **client** reads `conn.config.copy` (the `config` reply) and imports only `fill` from `@shared`: F04 `copy.banners[state.banner]` and `copy.emotes`; F06's items layer `copy.chores[player.chore]` on the chore bar; F11 `copy.report.*` (`topPerformer` and `materials` through `fill`). No other path. Any feature may **append** a top-level section to `copy.json` and to `Copy` in its own wave; nobody edits another feature's section.

Laravel (touches into F01's PHP surface, contracts §5/§6):

```php
App\Models\Level::isSandbox(): bool                       // ($this->config->day->endsOn ?? 'either') === 'never'
App\Models\Level::isUnlockedFor(Factory $factory): bool   // $this->isSandbox() || $this->sort <= $factory->unlocked_level
Database\Factories\LevelFactory::sandbox(): static        // key 'sandbox', name 'Sandbox', sort 5; config with day.endsOn 'never', shiftSeconds 0, orderBook 0, players.min 1, hazards.explosionEndsRound false
```

`resources/views/play.blade.php` (rendered by F01's `PlayController`): `data-debug="1"` whenever `config('app.debug')` is true, `?debug=1` is passed, **or the factory's effective level is a Sandbox**.

Level identity the rest of the game sees: `FactoryState.levelKey` ∈ `level-01-basic-flow | level-02-too-much-powder | level-03-the-bottleneck | level-04-too-many-helpers | sandbox`; `layoutKey` = `mvp-small`; station ids `powder-a`, `assembly-a`, `dock-a`.

### Data & config

#### The tilemap — `config/game/layouts/mvp-small.json`

28 × 18 tiles, origin top-left, `x` 0–27, `y` 0–17. Packed index = `y × 28 + x` (contracts §3, F02 `packTile`).

```
        x: 0123456789012345678901234567
             0         1         2
   y  0    ######################DDDDD#
      1    #.,,,,,,!.......OOO.,,TTTTT#
      2    #.,PPPo,............,,TTTTT#
      3    #.,PPPo,............,,TTTTT#
      4    #.,PPPo,............,,wwww,#
      5    #.,,w,,,..,,,,,,,,..,,,,,,S#
      6    #.,,,,,,..,iAAAAc,..,,,,,,,#
      7    #.........,iAAAA,,..,,,,,,,#
      8    #b........,,,ww,r,...R.....#
      9    #.........,,,,,,,,.........#
     10    #.........,,oo,,,,.........#
     11    #.........,,,,,,,,.........#
     12    #..........................#
     13    #..........................#
     14    #..BBBBBB..................#
     15    #..BBBBBB.h................#
     16    #..BBBBBB..................#
     17    ##############@#############
```

| Glyph | Meaning | Solid (in `walls`)? |
|---|---|---|
| `#` | wall (border) | yes |
| `D` | dock door, in the top wall, x 22–26 | yes (players never leave; the truck is drawn through it) |
| `P` | Boom Powder footprint, anchor (3,2), 3 × 3 = x 3–5, y 2–4 | yes |
| `o` | output shelf tiles — Powder (6,2)–(6,4), Assembly (12,10)–(13,10) | yes |
| `i` | Assembly input shelf tiles (11,6)–(11,7) | yes |
| `A` | Assembly jig footprint, anchor (12,6), 4 × 2 = x 12–15, y 6–7 | yes |
| `c` | tool cart (16,6) — `props.toolCart` | yes |
| `!` | Powder beacon pole (8,1) — `beaconPoles['powder-a']` | yes |
| `O` | order board, 3 tiles (16,1)–(18,1); `orderBoard: [16,1]` is its left tile (contracts §8 keeps `Tile`; the sprite is 3 tiles wide) | yes |
| `S` | truck countdown sign (26,5) — `props.countdownSign` | yes |
| `h` | broom hook (10,15) — `props.broomHook` | yes |
| `w` | work tiles — Powder (4,5); Assembly (13,8), (14,8); Dock ramp lanes (22,4)–(25,4) | no |
| `r` | Assembly rack tile (16,8) — where B stands | no |
| `T` | truck bay, x 22–26, y 1–3 — `truckBay: [22,1,5,3]`; floor; the docked truck is drawn here; standing here when it leaves is F09's truck ride | no |
| `b` | blast bin (1,8) — `blastBins: [[1,8]]`; floor for movement, swallows a lit keg that lands on it (F10 `onItemLanded`) | no |
| `R` | returns pile (21,8) — `props.returnsPile`; floor; F09 puts partial-truck leftovers here with `items.placeNear` | no |
| `B` | break room, `breakRoom: [3,14,6,3]` = x 3–8, y 14–16; floor drawn as a rug | no |
| `@` | factory door and spawn (14,17) — the one gap in the bottom wall; `spawn: [14,17]` | no |
| `,` | floor-ring tile of the nearest station (23 Powder · 40 Assembly · 29 Dock) | no |
| `.` | plain floor | no |

Ring boxes, as given: Powder x 2–7 × y 1–6 minus its footprint, shelf and work tile; Assembly x 10–17 × y 5–11 minus jig, both shelves, work tiles, rack, cart; Dock x 20–26 × y 1–7 minus the bay, the lanes and the sign. `(15,8)` — the ring tile between the rack and the nearest work tile — is the **aisle tile** B's missed toss lands on (docs/04); the fourth helper standing there blocks the arc. `(9,15)` — the tile east of the break room's middle row, `(breakRoom[0] + breakRoom[2], breakRoom[1] + 1)` — is the **break-room door** where F09 puts a driven-off player back on the floor; it is plain floor and needs no key.

Distances the drawing has to deliver: Powder work tile (4,5) → Assembly input shelf tile (11,7): 7 tiles (docs/02 "Powder is 6 tiles from Assembly"). Assembly output shelf tile (13,10) → the nearest ramp lane (22,4): 9 tiles east and 6 north (docs/02 "far enough that the truck horn causes a run"). Blast bin (1,8) is 2 tiles from (3,8): a thrower on (3,8) facing west lands a keg in the bin (`carry.throwTiles 2`).

The file:

```json
{
  "key": "mvp-small",
  "width": 28,
  "height": 18,
  "walls": [
    0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,
    28,36,44,45,46,55,
    56,59,60,61,62,83,
    84,87,88,89,90,111,
    112,115,116,117,118,139,
    140,166,167,
    168,179,180,181,182,183,184,195,
    196,207,208,209,210,211,223,
    224,251,
    252,279,
    280,292,293,307,
    308,335,
    336,363,
    364,391,
    392,419,
    420,430,447,
    448,475,
    476,477,478,479,480,481,482,483,484,485,486,487,488,489,491,492,493,494,495,496,497,498,499,500,501,502,503
  ],
  "spawn": [14, 17],
  "breakRoom": [3, 14, 6, 3],
  "blastBins": [[1, 8]],
  "dockDoor": [22, 0, 5],
  "truckBay": [22, 1, 5, 3],
  "ramp": [[22, 4], [23, 4], [24, 4], [25, 4]],
  "beaconPoles": { "powder-a": [8, 1] },
  "orderBoard": [16, 1],
  "props": { "toolCart": [16, 6], "countdownSign": [26, 5], "returnsPile": [21, 8], "broomHook": [10, 15] }
}
```

`walls` is 118 entries: the border (87: row 0 = 28, row 17 = 27 with the door at index 490 left out, columns 0 and 27 for rows 1–16 = 32), the Powder footprint (9), Powder shelf (3), beacon pole (1), order board (3), jig (8), Assembly input shelf (2), Assembly output shelf (2), tool cart (1), countdown sign (1), broom hook (1). Row 6 is `168,179,180–183,184,195` (border, input shelf, jig, cart, border); row 7 is `196,207,208–211,223` (no cart).

Ring tile lists (the `floorRing.tiles` arrays):

- **powder-a** (23): `[2,1],[3,1],[4,1],[5,1],[6,1],[7,1], [2,2],[7,2], [2,3],[7,3], [2,4],[7,4], [2,5],[3,5],[5,5],[6,5],[7,5], [2,6],[3,6],[4,6],[5,6],[6,6],[7,6]`
- **assembly-a** (40): `[10,5],[11,5],[12,5],[13,5],[14,5],[15,5],[16,5],[17,5], [10,6],[17,6], [10,7],[16,7],[17,7], [10,8],[11,8],[12,8],[15,8],[17,8], [10,9],[11,9],[12,9],[13,9],[14,9],[15,9],[16,9],[17,9], [10,10],[11,10],[14,10],[15,10],[16,10],[17,10], [10,11],[11,11],[12,11],[13,11],[14,11],[15,11],[16,11],[17,11]`
- **dock-a** (29): `[20,1],[21,1], [20,2],[21,2], [20,3],[21,3], [20,4],[21,4],[26,4], [20,5],[21,5],[22,5],[23,5],[24,5],[25,5], [20,6],[21,6],[22,6],[23,6],[24,6],[25,6],[26,6], [20,7],[21,7],[22,7],[23,7],[24,7],[25,7],[26,7]`

Shelf **interaction tiles** (F02's shelf shape is one `tile`; contracts §8 makes it furniture — normally a wall — that must have at least one orthogonal walkable neighbour): Powder output `[6,3]` (the middle of the three drawn tiles; reached from ring tile (7,3)); Assembly input `[11,7]` (reached from (10,7) and (11,8)); Assembly output `[13,10]` (reached from (13,9), (14,10), (13,11) — the hauler to the dock arrives from the east). The other drawn shelf tiles are furniture in `walls`. Fuel accounting: the Powder ring holds 23 floor kegs and the shelf 6 — 29 fuel next to each other; the DANGER beacon (`dangerWarningAt 0.5 × factoryExplosionThreshold 10`) lights at **5** fuel in the ring, the factory goes at a **10**-keg chain. That is reachable well before the ring is full, which is the point; docs/16's "9-tile ring, 15 kegs" arithmetic was for the docs/13 example map, and open question 13 (threshold 10) is a playtest lever.

#### The baseline level — `config/game/levels/level-02-too-much-powder.json`

Every number is from the docs (source in the table after the JSON). The other four files are this document with the diffs in the ladder table; nothing else differs.

Optional keys (contracts §13) the shipped files **carry**, because they are what a level's identity or a station's feel is made of: `notes`, `grading.advanceOn`, `groove.weights.truckComplete`, `hazards.repairSeconds`, `hazards.bannerSeconds`, `boom_powder.minigame.heat.overholdMs`, `boom_powder.minigame.comboBannerSeconds`, `assembly.minigame.casings`, `dock.minigame.tailgateHoldSeconds`, `dock.minigame.leaveSeconds`. Optional keys the shipped files **omit**, taking the §13 defaults that `validateLevelConfig()` applies: `movement.*`, `clipboardMemorySeconds`, `interrupts.*`, `carry.putDownSeconds`, `carry.hitStaggerSeconds`, `hazards.unjamSeconds`, `hazards.sweepSecondsPerTile`, `scoring.perOrder` — engine feel that is the same on every level, tuned once in `defaults.ts` until a level needs to differ.

```json
{
  "key": "level-02-too-much-powder",
  "name": "Too Much Powder",
  "notes": "Baseline: docs/03 cycles and curves, docs/04 windows, docs/13 groove and orders, docs/16 hazards, docs/17 carry, docs/18 day/grading/economy, docs/19 one-line breakpoint. Powder lazy rate (2.8 s per 2-pour keg) is 4x Assembly (6.0 s per stick) by construction. Book is 10, not docs/18's 11: with firstAt 20 and everySeconds 60 an 11th truck arrives at 620 s, after the 600 s whistle — docs/18's 11 assumed a 12-minute day. Explosion is a hard loss from this level on.",
  "day": { "shiftSeconds": 600, "orderBook": 10, "endsOn": "either", "earlyFinishBonusPerMinute": 5, "earlyFinishCap": 10 },
  "players": { "min": 3, "max": 6 },
  "layout": "mvp-small",
  "groove": {
    "start": 50,
    "weights": { "onTimeShip": 8, "shelfFullness": -4, "floorItem": -0.5, "rework": -1, "starved": -2, "jammed": -1, "litFuse": -3, "fizzle": -2, "niceSave": 3, "blastKeg": -10, "primeStick": 1, "truckComplete": 10 },
    "thresholds": { "onFire": 85, "groove": 70, "churn": 30, "meltdown": 10 },
    "cleanSweep": { "holdSeconds": 3, "snapTo": 60, "cooldownSeconds": 90 }
  },
  "clipboardSeconds": 3,
  "bpm": 150,
  "windowFloorsMs": { "ok": 100, "perfect": 45 },
  "carry": {
    "slowdown": 0.2, "throwTiles": 2, "throwFlightSeconds": 0.5, "catchOkMs": 150, "catchPerfectMs": 75,
    "drop": { "kegKnockOverOnHit": true, "stickFizzleChance": 0.3, "crateRattlyOnDrop": true },
    "truckRideSeconds": 20, "footprints": false
  },
  "stations": [
    {
      "id": "powder-a", "type": "boom_powder", "line": "a", "joinMode": "press", "anchor": [3, 2],
      "workTiles": [[4, 5]], "rackTiles": [],
      "outputShelf": { "tile": [6, 3], "capacity": 6 },
      "floorRing": { "tiles": [[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[2,2],[7,2],[2,3],[7,3],[2,4],[7,4],[2,5],[3,5],[5,5],[6,5],[7,5],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6]] },
      "nominalSeconds": 2.8, "floorSeconds": 1.4,
      "staffing": { "1": 1.0, "2": 1.05, "3": 0.9, "4": 0.75 },
      "churnSensitive": true,
      "minigame": {
        "heat": { "minChargeSeconds": 0.7, "maxChargeSeconds": 1.5, "okMsAtMaxCharge": 225, "okMsAtMinCharge": 105, "deadCenterMs": 50, "churnBandDrift": 0.08, "overholdMs": 500 },
        "comboTiers": [10, 25, 50],
        "overflowSpills": true,
        "comboBannerSeconds": 2
      }
    },
    {
      "id": "assembly-a", "type": "assembly", "line": "a", "joinMode": "press", "anchor": [12, 6],
      "workTiles": [[13, 8], [14, 8]], "rackTiles": [[16, 8]],
      "inputShelf": { "tile": [11, 7], "capacity": 8, "accepts": ["keg", "casing"] },
      "outputShelf": { "tile": [13, 10], "capacity": 4 },
      "floorRing": { "tiles": [[10,5],[11,5],[12,5],[13,5],[14,5],[15,5],[16,5],[17,5],[10,6],[17,6],[10,7],[16,7],[17,7],[10,8],[11,8],[12,8],[15,8],[17,8],[10,9],[11,9],[12,9],[13,9],[14,9],[15,9],[16,9],[17,9],[10,10],[11,10],[14,10],[15,10],[16,10],[17,10],[10,11],[11,11],[12,11],[13,11],[14,11],[15,11],[16,11],[17,11]] },
      "nominalSeconds": 6.0, "floorSeconds": 5.0,
      "staffing": { "1": 0.6, "2": 1.0, "3": 1.15, "4": 1.1, "5": 0.95, "6": 0.8, "8": 0.5 },
      "churnSensitive": false,
      "minigame": {
        "pour": { "beatsByQuality": { "1.0": 5, "0.7": 7, "0.4": 8 }, "perfectMs": 60, "okMs": 140, "primeKegWindowMultiplier": 1.5 },
        "knots": { "long": 3, "short": 2, "secondsPerKnot": 0.4, "perfectMs": 60, "okMs": 140 },
        "crimp": { "clicks": 3, "clickSeconds": 0.2, "perfectMs": 80, "okMs": 200 },
        "toss": { "arcSeconds": 0.5, "perfectMs": 120, "okMs": 250 },
        "casings": { "stock": 3, "dentChance": 0.3 }
      }
    },
    {
      "id": "dock-a", "type": "dock", "line": "a", "joinMode": "stand", "anchor": [22, 1],
      "workTiles": [[22, 4], [23, 4], [24, 4], [25, 4]], "rackTiles": [],
      "floorRing": { "tiles": [[20,1],[21,1],[20,2],[21,2],[20,3],[21,3],[20,4],[21,4],[26,4],[20,5],[21,5],[22,5],[23,5],[24,5],[25,5],[20,6],[21,6],[22,6],[23,6],[24,6],[25,6],[26,6],[20,7],[21,7],[22,7],[23,7],[24,7],[25,7],[26,7]] },
      "nominalSeconds": 1.0, "floorSeconds": 1.0,
      "staffing": { "1": 1.0, "2": 1.6, "3": 1.9, "4": 1.8, "5": 1.5, "6": 1.2, "8": 1.0 },
      "churnSensitive": false,
      "minigame": { "beepHz": 1, "perfectMs": 70, "okMs": 180, "tailgateWindowSeconds": 3, "tailgateHoldSeconds": 0.5, "leaveSeconds": 1.5 }
    }
  ],
  "recipes": {
    "keg": { "station": "boom_powder", "inputs": {}, "output": { "type": "keg", "pours": 2 } },
    "red_stick": { "station": "assembly", "inputs": { "casing": 1, "pour": 1, "fuse": 1, "cap": 1 }, "output": { "type": "stick", "product": "red_stick" } }
  },
  "orders": {
    "firstAt": 20, "everySeconds": 60, "truckWaitSeconds": 20,
    "mix": [{ "type": "red_stick", "weight": 10 }],
    "qtyPerTruck": { "base": 8, "rampPerMinute": 0.5 }
  },
  "hazards": {
    "fuseSeconds": 6, "chainFuseSeconds": 1.5, "blastRadius": 1, "chainWindowSeconds": 3,
    "sparks": { "slammerRedline": 1.0, "jammedPer10s": 0.5, "crimpOnDented": 0.3 },
    "fuel": { "floorKeg": 1, "spillTile": 1, "shelfKeg": 1 },
    "incidentThreshold": 4, "factoryExplosionThreshold": 10,
    "explosionEndsRound": true, "dangerWarningAt": 0.5,
    "stompSeconds": 1.0, "stunSeconds": 2, "knockbackTiles": 2, "litKegCarry": true,
    "repairSeconds": 10, "bannerSeconds": 3
  },
  "grading": {
    "weights": { "onTime": 50, "wip": 20, "quality": 15, "cycle": 15, "incident": -5, "heroCap": 10 },
    "thresholds": { "A": 90, "B": 75, "C": 60, "D": 40 },
    "targets": { "wip": 16, "cycleSeconds": 240 },
    "multiplier": { "A": 1.5, "B": 1.25, "C": 1.0, "D": 0.75, "F": 0.5 },
    "verdict": { "flow": 1.0, "smooth": 0.75, "fine": 0.5, "rough": 0.25 },
    "advanceOn": "C"
  },
  "economy": { "price": { "red_stick": 10 }, "wasteCost": { "keg": 4, "casing": 2, "stick": 6, "crate": 8 } },
  "scaling": { "breakpoints": [{ "maxPlayers": 6, "lines": 1, "truckEverySeconds": 60, "orderBook": 10 }] }
}
```

| Key | Source |
|---|---|
| `day` | docs/18 config block; `orderBook 10` so the last truck arrives at 560 s and leaves at 580 s, inside the 600 s shift (docs/18's 11 assumed a longer day) |
| `players.max 6` | contracts §8, docs/19 M1 (one line only; the schema's `max ≤ 10` still holds) |
| `groove.*` | docs/13 block; `litFuse` docs/16; `fizzle`, `niceSave` docs/17; `blastKeg` docs/16 "Groove −10 per keg"; `primeStick` docs/04 "+1 Groove"; `truckComplete 10` (contracts §13 default, written out because every Groove impulse lives in `groove.weights`) |
| `clipboardSeconds`, `bpm`, `windowFloorsMs` | docs/13 |
| `carry` | docs/17 block |
| `powder-a` | docs/03 (2.8 / 1.4, shelf 6, curve), docs/13 Slammer comment (heat, tiers), `overholdMs`/`comboBannerSeconds` contracts §13 (F07), tiles from the tilemap, `joinMode press` (contracts §7) |
| `assembly-a` | docs/03 (6.0 / 5.0, in 8 / out 4, curve), docs/13 Assembly block (pour, knots, crimp, toss), `casings` = the M1 casing supply F08's input-shelf feeder reads (contracts §8), `joinMode press` |
| `dock-a` | docs/03 (4 work tiles), docs/05 curve row, docs/13 Dock comment (beep 1 Hz, ±70 / ±180, tailgate 3 s); `tailgateHoldSeconds`/`leaveSeconds` contracts §13 (F09); `nominalSeconds`/`floorSeconds 1.0` = one shove per beep; `joinMode stand` (contracts §7 — standing on a ramp lane *is* being at the dock, no clipboard, no freeze); no shelves, so the server sets both caps to 0 |
| `recipes` | docs/13 (no `casing` recipe — Casing Prep is M2; the Jig's feeder stocks the input shelf from `minigame.casings`) |
| `orders` | docs/13 (`qtyPerTruck 8` = 80 % of Assembly's 10 sticks/min per 60 s truck, docs/06) |
| `hazards` | docs/16 block, contracts §8 key list; `repairSeconds 10` (docs/16 Repair) and `bannerSeconds 3` for F10; `blastBins` is `layout.blastBins`; every Groove impulse is in `groove.weights` |
| `grading` | docs/18 block + contracts §8 `verdict` bounds; `advanceOn` docs/18 (F01's `StoreRun` reads it) |
| `economy` | docs/18 |
| `scaling` | docs/19 first breakpoint; `orderBook` and `truckEverySeconds` equal `day.orderBook` and `orders.everySeconds` by construction — after `scaleLevel` the server reads the breakpoint's values as `level.day.orderBook` and `level.orders.everySeconds` |

#### The ladder — what each file changes from the baseline

| Key | Level 1 `level-01-basic-flow` **Basic Flow** | Level 2 (baseline) | Level 3 `level-03-the-bottleneck` **The Bottleneck** | Level 4 `level-04-too-many-helpers` **Too Many Helpers** | `sandbox` **Sandbox** |
|---|---|---|---|---|---|
| `players` | `{3, 6}` | `{3, 6}` | `{4, 6}` | `{4, 6}` | **`{1, 6}`** |
| `day.shiftSeconds` | 600 | 600 | 600 | 600 | **0** |
| `day.orderBook` = `scaling.breakpoints[0].orderBook` | **8** | 10 | **13** | 10 | **0** |
| `day.endsOn` | either | either | either | either | **never** |
| `orders.everySeconds` = `scaling.breakpoints[0].truckEverySeconds` | 60 | 60 | **45** | 60 | 60 |
| `orders.qtyPerTruck` | `{8, 0.5}` | `{8, 0.5}` | **`{6, 0.25}`** | `{8, 0.5}` | `{8, 0.5}` |
| `assembly-a.staffing` | baseline | baseline | baseline | **`{1: 0.6, 2: 1.0, 3: 1.1, 4: 0.8, 5: 0.6, 6: 0.45, 8: 0.3}`** | baseline |
| `hazards.explosionEndsRound` | **false** | true | true | true | **false** |
| Designed to make players say (docs/09) | "Oh, I bring the keg over here." | "Stop making powder." | "Come help Assembly." | "No, not everyone." | — |

Every book fits its shift. Truck `n` arrives at `firstAt + (n − 1) × everySeconds` and leaves `truckWaitSeconds` later, so the last truck arrives at 440 s on Level 1, 560 s on Levels 2 and 4 (leaves 580 s) and 560 s on Level 3 (leaves 580 s) — all before the 600 s whistle, which is what makes `endsOn: 'either'`'s book path and the early-finish bonus reachable at all.

Numbers in bold that the docs do not give (each is written into that file's `notes`): Level 1's book of 8 (docs/09 calls it the tutorial; 8 trucks of 10 leave two spare, so a group that learns the route finishes early and sees the +10 bonus); Level 2 and 4's book of 10 (the arithmetic above; docs/18 says 11); Level 3's `players.min 4`, 45 s trucks, book 13, and `qtyPerTruck {6, 0.25}` (13 trucks × ~7.5 sticks ≈ 95 sticks in 600 s — a solo jig at ~8.5 s makes 70, a pair at 6 s makes 100, so the book is only reachable when somebody leaves Powder and becomes B; docs/09 says the level expects six people, but requiring six would lock a four-person group out of Level 4, so `min` is 4 and the tagline in PLAYTEST.md says "bring six"); Level 4's `players.min 4` (four are needed to over-help) and its curve — under `machineSeconds = floorSeconds / efficiency`, the baseline jig re-arms in 4.5 s with 4 workers (never the limit against a 6 s phrase), 5.3 s with 5, 6.25 s with 6, while Level 4's curve makes it **6.25 s with 4, 8.3 s with 5, 11.1 s with 6** — the fourth body visibly slows the pair before the interrupt bubbles even start, which is the sentence the level exists for; Sandbox's `0 / 0 / never` with `players.min 1` (contracts §8 allows `min ≥ 1` only when `endsOn === 'never'`, which is what makes a solo tuning session possible).

#### `config/game/copy.json`

```json
{
  "clipboard": [
    "Onboarding… locating the good stapler…",
    "Reading the wiki page. The wiki page is wrong.",
    "Asking Dave. Dave is at lunch.",
    "Waiting for VPN."
  ],
  "chores": { "unjam": "WAITING FOR VENDOR SUPPORT", "sweep": "SWEEPING", "stomp": "STOMPING", "repair": "FILING INCIDENT REPORT" },
  "bubbles": { "whatCanIDo": "what can I do?", "whoThrewThat": "WHO THREW THAT", "sawTheHighway": "I SAW THE HIGHWAY" },
  "stations": { "needHands": "NEED HANDS", "needParts": "NEED PARTS" },
  "emotes": { "stop": "STOP", "help": "HELP", "go": "GO", "what": "?" },
  "banners": {
    "WHOOPS": "WHOOPS", "INCIDENT": "INCIDENT", "EXPLODED": "THE FACTORY EXPLODED", "NICE SAVE": "NICE SAVE",
    "CLEAN SWEEP": "CLEAN SWEEP", "HOT STREAK": "HOT STREAK", "TAILGATE": "TAILGATE"
  },
  "hazards": {
    "sparks": {
      "slammerRedline": "REDLINED THE SLAMMER",
      "jammed": "LEFT IT JAMMED",
      "fizzle": "DROPPED A STICK ON THE PILE",
      "crimpOnDented": "CRIMPED A DENTED CASING"
    }
  },
  "report": {
    "individualHeading": "INDIVIDUAL PERFORMANCE",
    "factoryHeading": "FACTORY PERFORMANCE",
    "topPerformer": "Top performer: {name} ({station})",
    "materials": "Materials purchased: {purchased} kegs. Materials shipped: {shipped}.",
    "certificate": "CERTIFICATE OF EXCELLENCE",
    "repeatDay": "MANAGEMENT WOULD LIKE TO SEE IMPROVEMENT",
    "fireMarshal": "DELIVERED BY THE FIRE MARSHAL",
    "loss": "LOSS",
    "sandbox": "SANDBOX — NOT GRADED"
  },
  "events": {
    "rushOrder": "CEO NEEDS GOLD DYNAMITE FOR A DEMO",
    "changeOfMind": "CUSTOMER CHANGED THEIR MIND. THANKS ANYWAY.",
    "standup": "QUICK SYNC",
    "executiveTour": "JUST PRETEND I'M NOT HERE",
    "newProcess": "EFFECTIVE IMMEDIATELY",
    "printerOffline": "HAVE YOU TRIED TURNING IT OFF AND ON",
    "vendorUpdate": "WE'VE IMPROVED YOUR EXPERIENCE",
    "hotfix": "CUSTOMER SAYS IT WENT 'PFFT'",
    "allHands": "EXCITING NEWS ABOUT OUR VALUES"
  },
  "standupBubbles": ["no blockers", "same as yesterday", "I'll take that offline"]
}
```

Sources: clipboard docs/02; chores docs/03–04 and docs/16 — one label per non-empty `PlayerState.chore` value (`unjam`, `sweep`, `stomp`, `repair`), drawn on F06's chore bar; bubbles contracts §3 / docs/02 / docs/17; station bubbles docs/02 ("NEED HANDS") and docs/05 ("NEED PARTS"); emotes docs/19; banners contracts §3 (the `EXPLODED` display text is docs/16's headline); spark toasts one per `SparkCause` (contracts §10.5) so F10 never inlines a string; report lines docs/10 plus the four the report card adds (certificate, repeat day, loss, sandbox); events docs/07. Placeholders are `{name}` tokens for `fill()`.

Schema fields written by this feature: none in the game state (the server writes `levelKey`, `layoutKey`, `shiftSeconds`, `width`, `height` from these files). Postgres rows written: five `levels` rows by F01's sync (`sort` 1–4 for the levels, 5 for `sandbox`, because `sandbox.json` sorts after `level-*.json`).

### Behaviour

**B1 — The layout is the collision layer.** `walls` is the complete impassable set (contracts §8): border, the two station footprints, all five drawn shelf tiles, the pole, the board, the cart, the sign, the hook. Everything a player stands on — work tiles, the rack tile, ring tiles, the ramp, the truck bay, the break room, the blast bin, the returns pile, the door — is floor and is never listed. Server walkability (`World.isWall`) and client prediction (`makeWallLookup`) are therefore one lookup over `walls` plus bounds; station config never has to know a footprint's size, and F05 derives a station's machine block as the wall tiles inside its bbox. Items are placed and thrown onto floor tiles; the bin and the returns pile are floor tiles with a meaning (`blastBins`, `props.returnsPile`) that F10 and F09 consult when an item lands. A player on the door tile (14,17) is inside the map (row 17 is in bounds); movement south of it is clamped by the map edge.

**B2 — One file per level, diffs only.** Level 2 is the reference document. Levels 1, 3, 4 and Sandbox are byte-for-byte the same JSON except for the cells in the ladder table and their own `key`, `name`, `notes`. The vitest suite enforces this by deep-comparing the **files as read from disk** — not the validator's output, which has the §13 defaults applied — with the diff keys deleted from both sides, so a stray tuning edit in one file cannot drift silently.

**B3 — Sandbox semantics** (`day.endsOn: 'never'`, contracts §8). The host still presses Start (contracts §4 `start`) and the gate is `players.min` = 1, so one person can tune alone; the day begins, `clock` resets to 0 and counts up (contracts §3 — `clock` advances in every phase), `FactoryState.shiftSeconds` is 0, and `bookTotal`/`bookRemaining` stay 0. Orders and trucks still arrive on the `orders` cadence — F09 creates the next `OrderState` on demand instead of reading a pre-built book — and shipping still moves Groove, so every station is playable. Nothing ends the day: not the book, not the clock, and not an explosion (`explosionEndsRound: false` → setback: every station DAMAGED, shelves emptied, repairs, play continues). No `report` message and no `POST /internal/runs` are ever produced for a Sandbox day (contracts §10.7); the room disposes when the last client leaves, and rejoining creates a fresh room. The HUD shows elapsed `mm:ss` and hides the BOOK glyphs (F04, contracts §10.9).

**B4 — Setback vs hard loss.** Level 1 and Sandbox carry `explosionEndsRound: false`; Levels 2–4 `true`. That flag is the only thing that separates "the trap has teeth" from "the trap is a lesson", exactly as docs/16 files it. Setback mode is also why every level ships `hazards.repairSeconds`: F10's repair hold is a per-level number, not a constant.

**B5 — Laravel: Sandbox is always unlocked.** `Level::isSandbox()` is derived from the stored config (`day.endsOn === 'never'`), not from the key, so a second never-ending level would behave the same without code. `Level::isUnlockedFor($factory)` returns `true` for a Sandbox regardless of `sort`; otherwise F01's `sort <= unlocked_level`. F01's level select routes both its `updatedLevelId` guard and the option-disabled attribute through `isUnlockedFor`, so there is one rule and no second copy of it. A fresh factory (`unlocked_level 1`) therefore lists Basic Flow and Sandbox enabled and Levels 2–4 "— locked"; the seeded Kaboom & Sons (`unlocked_level 4`) lists all five enabled. An inactive Sandbox (admin toggled `is_active` off) is not listed and is never chosen by `effectiveLevel()` — F01's fallback to the lowest-sort active level covers it. `StoreRun`'s unlock step never fires for Sandbox because a Sandbox day is never posted (B3).

**B6 — Laravel: Sandbox turns the overlay on.** `PlayController` keeps F01's `$debug = config('app.debug') || $request->boolean('debug')` and adds `|| $level->isSandbox()` where `$level = $factory->effectiveLevel()` (already non-null past F01's guard), which is the mount rule contracts §6 states. The client's `~` toggle (docs/10, F04) works on every level; Sandbox merely starts with it on.

**B7 — Sync of the shipped files.** No new command: F01's `game:levels:sync` reads `config/game/levels/*.json` in lexical order, so the five files sort `level-01…`, `level-02…`, `level-03…`, `level-04…`, `sandbox` → `sort` 1, 2, 3, 4, 5. Each file's `key` equals its stem and `layout` is `mvp-small`, whose file's `key` is `mvp-small`. `ShippedLevelsSyncTest` runs the real action over the real directory against the real `shared/src/config/schema.json` so a schema/file mismatch fails in Pest as well as in vitest.

**B8 — Copy reaches both sides, one way each.** `shared/src/copy.ts` imports the JSON (`resolveJsonModule` is already on in `shared/tsconfig.json`; Vite, vitest and tsx all bundle JSON imports) and is reachable from the barrel through the one `export * from './copy';` line. The **server** imports `copy`, `clipboardLines` and `fill` from `@shared` via `game-server/src/shared.ts`. The **client** never imports `copy`: it reads `conn.config.copy` from the `config` reply (contracts §4/§8) and imports only `fill` from `@shared`, so a client and a server can never disagree about a line. A missing key in the JSON is a TypeScript error at `npm run typecheck`, not a blank bubble at runtime. `clipboardLines(level)` returns `level.copy.clipboard` when present and non-empty, else `copy.clipboard`; F05 draws one line per clipboard, cycling in order per station (`station.clipboardIndex++ % length`). `fill('Top performer: {name} ({station})', { name: 'Sam', station: 'Powder' })` → `Top performer: Sam (Powder)`; a placeholder with no value is left as written so a typo is visible on screen rather than silently blank.

**B9 — Validation is layered.** `shared/tests/levels.test.ts` (vitest) runs F02's three validators on every file plus this feature's structural checks; F01's sync validates the JSON Schema in PHP; F03 validates again at room create and throws `new Error(errors.join('\n'))` on `ok: false`. A file that fails any layer never reaches a player. The PHP layer cannot run F02's semantic rules, which is why the vitest suite is the gate in CI: `npm test` at the root runs `shared`'s tests.

**Server vs client:** the server reads the level and layout (via Laravel, or via `LEVELS_DIR` with layouts resolved as `path.join(LEVELS_DIR, '../layouts')` when Laravel is unreachable), then validates, scales and applies defaults before `world.level` exists; the client receives those same objects plus `copy` in the `config` reply. This feature ships data and Laravel gating only; it adds no sim code.

**Edge cases decided:**
- A factory whose `level_id` points at a level later made inactive: F01's `effectiveLevel()` falls back to Basic Flow (lowest active sort); Sandbox is never the fallback.
- `unlocked_level` above 4 (the seeder sets 4; a future level 5): Sandbox stays last in the select because `level-*.json` sorts before `sandbox.json` for any two-digit level number.
- Two players spawn at once on (14,17): both are placed on the door tile; the server-side soft push in the shared integrator (contracts §2) separates them on the first tick — no spawn queue.
- A keg thrown from (3,8) facing west lands on the bin tile (1,8) and is swallowed only if lit (F10's `onItemLanded`); an unlit keg on the bin tile is an ordinary floor keg with 1 fuel.
- Items on the truck bay when the truck is away are ordinary floor items; when it docks they are on the bed and leave with it (F09 decides credit and owns the truck ride; the layout only says where the bed is).
- The order board's middle and right tiles (17,1), (18,1) are walls with no key of their own; F04 draws one 3-tile board anchored at `orderBoard`.
- `copy.json` with an unknown top-level section added by another feature: allowed (B8 "append"); the `Copy` type gains the section in the same change.
- A shipped file that omits a §13 optional key is correct, not incomplete: `validateLevelConfig` fills it in, and every test asserts the applied value rather than `undefined`.

## Acceptance criteria

- [ ] `cd shared && npm test` passes `levels.test.ts` and `copy.test.ts`: every file in `config/game/levels/` returns `ok: true` from `validateLevelConfig`, `mvp-small.json` returns `ok: true` from `validateLayoutConfig`, and `validateLevelOnLayout` returns `[]` for all five levels.
- [ ] `mvp-small.json` is 28 × 18 with exactly 118 `walls`; every tile drawn `#DPoiAc!OSh` above is a wall and every tile drawn `wrTbRB@,.` is not; `spawn` is `[14,17]`; `ramp` equals `dock-a.workTiles`; `truckBay` is `[22,1,5,3]` and contains no wall; `beaconPoles` has the single key `powder-a`; `blastBins` is `[[1,8]]`; `props` has `toolCart [16,6]`, `countdownSign [26,5]`, `returnsPile [21,8]`, `broomHook [10,15]`.
- [ ] Every station in every shipped level carries `joinMode` — `press` on `powder-a` and `assembly-a`, `stand` on `dock-a` — and `dock-a` declares neither `inputShelf` nor `outputShelf`.
- [ ] Every shipped level carries `notes`, `grading.advanceOn`, `groove.weights.truckComplete`, `hazards.repairSeconds`, `hazards.bannerSeconds`, `powder-a.minigame.heat.overholdMs`, `powder-a.minigame.comboBannerSeconds`, `assembly-a.minigame.casings`, `dock-a.minigame.tailgateHoldSeconds` and `dock-a.minigame.leaveSeconds`; and carries none of `movement`, `clipboardMemorySeconds`, `interrupts`, `scoring`, `carry.putDownSeconds`, `carry.hitStaggerSeconds`, `hazards.unjamSeconds`, `hazards.sweepSecondsPerTile`, each of which `validateLevelConfig` supplies from `defaults.ts`.
- [ ] Level 1, 3, 4 and Sandbox differ from Level 2 only in `key`, `name`, `notes` and the cells of the ladder table (deep-equal after deleting those keys from the files as read from disk).
- [ ] On every level with `endsOn !== 'never'` the last truck of the book arrives at `firstAt + (orderBook − 1) × everySeconds ≤ shiftSeconds − truckWaitSeconds`: 440 s (L1), 560 s (L2, L3, L4).
- [ ] `efficiencyFor(level04.assembly.staffing, n) < efficiencyFor(level02.assembly.staffing, n)` for n = 4, 5, 6, and equal for n = 1, 2.
- [ ] Sandbox: `day.endsOn === 'never'`, `shiftSeconds === 0`, `orderBook === 0`, `players.min === 1`, `hazards.explosionEndsRound === false`; Level 1: `explosionEndsRound === false`; Levels 2–4: `true`.
- [x] `copy.json` contains every section and key named in `Copy`; `copy.banners` has one entry per `BANNERS` value except `''`; `copy.chores` has one entry per non-empty `PlayerState.chore` value; `copy.hazards.sparks` has one entry per `SparkCause`; no string is empty.
- [ ] `php artisan game:levels:sync` on a fresh database prints `created` for the five keys in the order `level-01-basic-flow, level-02-too-much-powder, level-03-the-bottleneck, level-04-too-many-helpers, sandbox` with `sort` 1–5, and each row's `layout.key` is `mvp-small`.
- [ ] On a factory with `unlocked_level 1` the level select shows Basic Flow and Sandbox enabled and the other three disabled with "— locked"; on the seeded factory (`unlocked_level 4`) all five are enabled; a member can select Sandbox at `unlocked_level 1` and `factories.level_id` persists.
- [ ] With `APP_DEBUG=false` and no `?debug`, `/factories/{id}/play` renders `data-debug="1"` when the effective level is Sandbox and `data-debug="0"` when it is Basic Flow.
- [ ] In the running game on Sandbox one player can press Start; the HUD shows elapsed time and no order book, trucks still arrive, the debug overlay is visible at load, and an explosion damages every station instead of ending the day; on Level 1 the clock reads 10:00 at start and the book reads 8; on Level 2 the book reads 10 and an explosion ends the day with verdict EXPLODED.
- [ ] Walking the floor: a player cannot enter any `#DPoiAc!OSh` tile, can stand on every `wrTbRB@` tile, spawns on the door, and can throw a keg from (3,8) into the bin.
- [ ] `docs/PLAYTEST.md` exists with the sections listed in Task 8 and a person who has not read the design docs can follow it to a running three-player day.
- [ ] `vendor/bin/pint --test`, `php artisan test`, `cd shared && npm run typecheck` all pass.

## Test plan

Unit — vitest, `shared/tests/levels.test.ts` (loads every file under `config/game/levels/` and `config/game/layouts/` with `node:fs`; imports the validators from `../src/config/validate` and `efficiencyFor`, `scaleLevel`, `breakpointFor`, `packTile`, `unpackTile` from `../src/index`):

- it validates every shipped level against schema.json
- it validates the mvp-small layout
- it places every shipped level on its layout without error
- it names every level file after its key
- it names the layout file after its key
- it ships exactly five levels with unique keys
- it draws the mvp-small map at 28 by 18 with 118 solid tiles
- it walls the whole border except the door at (14,17)
- it walls the Powder footprint, the jig, every drawn shelf tile, the pole, the board, the cart, the sign and the hook
- it leaves every work, rack, ring, ramp, bay, spawn, bin, returns and break-room tile walkable
- it gives every shelf interaction tile an orthogonal walkable neighbour
- it keeps the three floor rings disjoint from each other and from all furniture
- it makes the ramp equal the dock's work tiles
- it puts the truck bay directly under the dock door and directly above the ramp
- it names the powder station on the beacon pole
- it joins powder and assembly by press and the dock by stand
- it gives the dock no shelves
- it carries every optional key the shipped files own (notes, advanceOn, truckComplete, repairSeconds, bannerSeconds, overholdMs, comboBannerSeconds, casings, tailgateHoldSeconds, leaveSeconds)
- it omits every optional key the defaults own and still reads a value after validation (movement, interrupts, clipboardMemorySeconds, carry hold times, unjamSeconds, sweepSecondsPerTile, scoring)
- it agrees the one breakpoint with day and orders on every level (`orderBook`, `truckEverySeconds`, `maxPlayers === players.max`)
- it lands the last truck of the book before the whistle on every timed level
- it scales every level onto its single breakpoint at min and max players (one line `a`, `day.orderBook` and `orders.everySeconds` from the breakpoint, `breakpoint` attached)
- it keeps levels 1, 3, 4 and sandbox identical to level 2 outside the ladder keys
- it turns the explosion into a setback on level 1 and sandbox only
- it gives sandbox no clock, no book, no end and a floor of one player
- it punishes four or more helpers harder on level 4 than on level 2
- it keeps every window at or above the floors (belt and braces with F02)

`shared/tests/copy.test.ts`:

- it exposes every section the Copy type names
- it has a display line for every banner except the empty one
- it has a label for every chore value
- it has a toast for every spark cause
- it has every report line the report card draws
- it has no empty strings anywhere in copy.json
- it returns a level's own clipboard lines when it has them
- it falls back to the global clipboard lines when the level has none
- it fills every placeholder it is given
- it leaves a placeholder with no value untouched

Feature — Pest, `tests/Feature/Levels/SandboxLevelTest.php` (`RefreshDatabase`; levels via `Level::factory()` and the new `sandbox()` state; factories via `Factory::factory()`):

- it lists sandbox as unlocked on a factory that has only unlocked level one
- it still lists a normal level above unlocked_level as locked
- it lets a member select sandbox at unlocked_level one
- it does not list an inactive sandbox
- it reports isSandbox from the config not the key
- it sets data-debug on the play page for sandbox with app.debug off
- it leaves data-debug off on the play page for a normal level with app.debug off

`tests/Feature/Levels/ShippedLevelsSyncTest.php` (overrides `game.levels_path`, `game.layouts_path`, `game.schema_path` to the real paths under `base_path()`):

- it syncs the five shipped level files in order with sorts one to five
- it stores the mvp-small layout beside every level
- it marks only sandbox as a sandbox
- it unlocks exactly basic flow and sandbox for a fresh factory

In-app verification (Herd, `composer run dev`, `cd game-server && npm run dev`, `GAME_SERVER_SECRET=devsecret` in both `.env` files; screenshots to the scratchpad):

1. `php artisan migrate:fresh --seed && php artisan game:levels:sync` — paste the five `created` lines. `php artisan tinker --execute 'App\Models\Level::orderBy("sort")->get(["key","sort","is_active"])->toArray();'` — paste.
2. As Sam (`sam@example.com` / `password`) create a new factory **Fresh Co** → its page: select shows Basic Flow, Sandbox enabled; Levels 2–4 "— locked". Screenshot. Open Kaboom & Sons → all five enabled. Screenshot.
3. In Fresh Co pick Sandbox, set `APP_DEBUG=false` in `.env`, `php artisan config:clear`, open `/factories/{id}/play`, view source: `data-debug="1"`. Switch to Basic Flow, reload: `data-debug="0"`. Restore `APP_DEBUG=true`. Screenshot both sources.
4. Sandbox **alone**: one session, press Start (the gate is one player); the HUD shows elapsed time and no book, the debug overlay is visible at load showing `powder-a`, `assembly-a`, `dock-a`, and a truck arrives at 0:20. Walk into the Powder footprint, the shelf, the cart, the sign, the hook — blocked; stand on the work tile, the rack, a ramp lane, the truck bay, the break room, the bin, the returns pile — allowed. Screenshot the overlay and one blocked position.
5. Still in Sandbox: make kegs until the shelf is full and drop six on the ring, redline a release, let the fuse run — every station reads DAMAGED, the day continues, and the repair hold is 10 s. Screenshot.
6. Level 1 with three sessions (Sam, Priya, and a third registered user in a private window; or `scripts/m0-browsers.sh` for two headless sessions plus your own): clock 10:00, book 8, truck at 0:20; screenshot the HUD. Level 2: book 10; build a pile and let it go — the day ends EXPLODED. Screenshot the report.
7. Level 3 and Level 4 each load and start with four sessions (the third and fourth joining with `DEV_ALLOW_NO_TICKET=1` and `{ name, factoryId }`); the debug overlay on Level 4 shows Assembly efficiency `0.8` with four people on its tiles versus `1.1` on Level 2. Screenshot both overlays.
8. `cd shared && npm test && npm run typecheck`; `php artisan test --compact`; `vendor/bin/pint --test`. Paste the summaries.

## Tasks

- [ ] 1. `config/game/layouts/mvp-small.json` from the drawing above. Test first: `shared/tests/levels.test.ts` with the layout-only cases (dimensions, 118 walls, border and door, furniture solid, work/rack/ring/ramp/bay/spawn/bin/returns/break-room walkable, ramp equals the dock's work tiles, bay under the door, `validateLayoutConfig` ok). Run `cd shared && npx vitest run tests/levels.test.ts`.
- [ ] 2. `config/game/levels/level-02-too-much-powder.json` (the baseline JSON above). Test: `it validates every shipped level`, `it places every shipped level on its layout`, the join-mode, dock-shelf, carried-key and omitted-key cases, breakpoint agreement, last-truck-before-the-whistle, scale onto the breakpoint, ring and shelf invariants. Green.
- [ ] 3. `level-01-basic-flow.json`, `level-03-the-bottleneck.json`, `level-04-too-many-helpers.json`, `sandbox.json` as diffs, each with its `notes`. Test: the ladder cases (identical outside the ladder keys, setback flags, sandbox no clock/book/end with `players.min 1`, level-4 curve). Green.
- [x] 4. `config/game/copy.json` + `shared/src/copy.ts` + the one-line export in `shared/src/index.ts`. Test: `shared/tests/copy.test.ts` (sections, banners, chores, spark causes, report lines, no empty strings, `clipboardLines`, `fill`). `cd shared && npm test && npm run typecheck`.
- [ ] 5. `Database\Factories\LevelFactory::sandbox()` state; `Level::isSandbox()`; `Level::isUnlockedFor()` new rule. Test: `tests/Feature/Levels/SandboxLevelTest.php` cases 1–5 (`php artisan make:test --pest Levels/SandboxLevelTest`). `php artisan test --compact tests/Feature/Levels`.
- [ ] 6. `PlayController` `$debug` gains the Sandbox clause. Test: `SandboxLevelTest` cases 6–7 (`$this->withoutVite()`, `config(['app.debug' => false])`). Green.
- [ ] 7. `tests/Feature/Levels/ShippedLevelsSyncTest.php` against the real files, schema and layouts directory. Green; then `php artisan game:levels:sync` on the dev database and paste the output into the doc.
- [ ] 8. `docs/PLAYTEST.md` with these sections: **What you need** (Herd with PHP 8.4 and its Postgres service, Node 22, the repo); **One-time setup** (`composer install`, `npm install` at the root — workspaces install `shared` and `game-server` —, `.env` from `.env.example` with `GAME_SERVER_SECRET=devsecret`, `game-server/.env` from its example with the same secret, `php artisan key:generate`, `php artisan migrate:fresh --seed`, `php artisan game:levels:sync` and the five lines to expect); **Run it** (terminal A `composer run dev`, terminal B `cd game-server && npm run dev`, open `https://dynamite.test`; expected log lines from both); **Getting people in** (seeded Sam admin / Priya, password `password`, factory Kaboom & Sons code `BANG42` with all levels unlocked; others register at `/register` and Join with the code; one browser profile or private window per player; the host presses Start and Levels 1–2 need three, Levels 3–4 need four, **Sandbox needs one — tune alone**; extra sessions = `scripts/m0-browsers.sh` for two headless browsers, or tabs joining with `DEV_ALLOW_NO_TICKET=1` and `{ name, factoryId }`; same-room LAN play = guests add `<host-ip> dynamite.test` to `/etc/hosts`, accept Herd's self-signed certificate, and the host sets `GAME_SERVER_WS_URL=ws://<host-ip>:2567` — verify from a guest with `curl -k https://<host-ip>/login -H 'Host: dynamite.test'` returning the login page before anyone sits down; remote friends wait for the M4 VPS); **Playing a day** (level select on the factory page — Sandbox always, locked levels greyed; Enter factory; lobby; controls WASD/arrows move, `E` interact, `Space` act, `Esc` leave a station, `~` debug overlay; what each level is for, one line each, with the "bring six" note on Level 3); **The three sentences we hope to hear** — *"Stop making powder."* (Level 2), *"Come help Assembly."* (Level 3), *"No, not everyone."* (Level 4) — plus the Level 1 tutorial line *"Oh, I bring the keg over here."*, with the instruction to write down the minute mark and who said it, unprompted only; **What to watch** (minute of the first floor keg, first hands-full moment, first "what can I do?", who hauls and when, whether anyone stops Powder before the beacon, the truck run, the first stomp, whether a NICE SAVE was attempted, the reaction to EXCELLENT on the report, "do they want to go again?"); **How to report a bug** (an Electrolyte ticket in project `dynamite` titled `<level key>: <what happened>`, with player count, minute mark, expected vs actual, the run id from the report or the `seed` from the game-server log, browser and the `~` overlay's RTT/tick line, a screenshot, the game-server terminal lines around the moment; urgency `urgent` for a loss without a pile, beacon and fuse, `high` for a desync or a stuck day, `low` for visuals; tuning opinions go in the level file's `notes` via a ticket, not as bugs). Verify by handing it to someone who has not read the design docs and watching them reach a running day without asking a question.
- [ ] 9. Full gate: `vendor/bin/pint --format agent`; `php artisan test --compact`; `cd shared && npm test && npm run typecheck`; `npm run build` at the root. All green.
- [ ] 10. In-app verification steps 1–8; attach screenshots; tick the Status boxes and the row in `docs/features/README.md`.

## Risks & open questions

- **`copy.ts` type-imports `SparkCause` from F10's `shared/src/sim/hazards.ts`** (contracts §8 types `Copy.hazards.sparks` as `Record<SparkCause, string>`). If F12 lands before F10, `npm run typecheck` in `shared/` fails on a missing module. The fix is wave order — land F12 after F10 — or a one-line local union in `copy.ts` swapped for the import when F10 arrives. The JSON is identical either way.
  **Resolved (wave 1, 2026-09-05):** contracts §1 pins copy to wave 1, so all three type imports named in the block above are unavailable and `copy.ts` declares them locally, each behind a `TODO(F02)`/`TODO(F10)` naming its swap: `BannerKey` as the literal union of contracts §3's `FactoryState.banner` minus `''`; `SparkCause` as §1's four causes; and `LevelClipboardOverride` (`{ copy?: { clipboard: string[] } }`) in place of `Pick<LevelConfig, 'copy'>` — a `LevelConfig` satisfies it structurally, so wave-2 callers need no change. `shared/tests/copy.test.ts` asserts the JSON against the same key lists, so a swap that changes a union turns the test red rather than silently widening `Copy`. `SparkCause` and `LevelClipboardOverride` are module-private (only `BannerKey`, which contracts §8 declares in `copy.ts`, is exported), so F10's exported `SparkCause` cannot collide with this one through the barrel's `export *`.
- **The rings are bigger than docs/16's arithmetic assumed** (23 / 40 / 29 tiles versus the docs/13 example's 9). The DANGER beacon still lights at 5 fuel and the factory still goes at a 10-chain; what changes is that the ring can hold far more than the threshold, so the pile is never "full" as a warning — the beacon and the fuse are. Open question 13 (threshold vs player count) is the tuning lever if playtests find 10 too easy to reach on this map.
- **Numbers this doc introduces** — Level 1 book 8; Level 2/4 book 10 (docs/18 says 11, which does not fit a 600 s shift); Level 3 `players.min 4`, 45 s trucks, book 13 and `qtyPerTruck {6, 0.25}`; Level 4 `players.min 4` and its curve; Sandbox `0 / 0 / never` with `players.min 1` — are written into each file's `notes` (required by `.ai/rules/config.md`) with the reasoning above. Playtesting owns them (docs/README "numbers are starting values").
- **Level 4 punishes over-helping through the curve alone, and it need not stay that way.** `interrupts.everySeconds` and `interrupts.pauseSeconds` are optional level keys with defaults (contracts §13), so if a playtest wants the "what can I do?" bubbles faster on Level 4 the file gains `"interrupts": { "everySeconds": 4, "pauseSeconds": 0.5 }` and the ladder table gains a row — no contract change, no code change. Shipping starts with the curve alone so the two levers are not tuned at once.
- **`orderBoard` is one tile in the contract and three in the drawing.** Kept as `[16,1]` (left tile) with (17,1), (18,1) in `walls`; F04 draws a 3-wide board. If a later layout needs a different width, `orderBoard` grows to `[x, y, w]` like `dockDoor`.
- **`beaconPoles` names only `powder-a`.** Contracts §8 type it as a partial map while §3 gives every station a `beacon`, so F10's red beacon on `assembly-a` or `dock-a` has no pole tile on this map and has to fall back to the station anchor. Adding two poles would change `walls` and two ring lists; it waits until F10 says which it needs.
- **Same-room LAN play in PLAYTEST.md assumes Herd's nginx answers on the LAN interface.** The doc gives the guest-side `curl` check to confirm before a session; if it fails, the M1 playtests are single-machine plus the headless harness until the M4 VPS.
- **F11's report copy.** `copy.report` ships the nine keys contracts §8 names. If F11 draws fewer, the unused lines cost nothing; if it needs more, it appends them under the same section in its own wave (B8).

**Contract change requested**

None outstanding for the level, layout and copy data. Contracts v2 §8 carries `notes`, `day.endsOn: 'never'` (with `shiftSeconds`/`orderBook` 0 and `players.min ≥ 1`), `grading.advanceOn`, `StationConfig.joinMode`, `LayoutConfig.truckBay`/`props`, the "walls are the complete impassable set" rule, the `validateLevelOnLayout` rules, the `Copy` shape and the one copy path; §5/§6 carry `Level::isSandbox`, `isUnlockedFor` and the `data-debug` rule; §12 carries the ownership and the `shared/src/index.ts` export line; §13 carries every optional key and default these files rely on.

One thing contracts v2 does not settle:

1. **Who fixes the level-select disabled rule.** Contracts §5 makes `Level::isUnlockedFor()` the single unlock rule, and §12 lists F12's touches into F01 as `isSandbox`, `isUnlockedFor`, `PlayController $debug`, `LevelFactory::sandbox` and `tests/Feature/Levels/*` — `app/Livewire/Factories/Show.php` and its view are not among them. If F01 computes the option-disabled attribute inline as `sort > unlocked_level` instead of calling `isUnlockedFor`, a Sandbox row renders "— locked" while the `updatedLevelId` guard accepts it. Either §12 adds that file to F12's touch list, or F01 routes the attribute through `isUnlockedFor` in its own wave. `SandboxLevelTest` asserts the rendered select either way, so the mismatch fails a test rather than reaching a player.
