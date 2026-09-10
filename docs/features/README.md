# Feature tracker — DYNAMITE MVP (M0 + M1)

The MVP is **one line, 3–6 players: Boom Powder → Assembly → Dock**, with the pile,
hands-full, throw/catch, the explosion, a shift clock and order book, and the report card.
Plan: `docs/superpowers/plans/2026-09-04-mvp.md`. Binding contracts: `00-contracts.md`.
Electrolyte project `dynamite` mirrors this table (one epic + one ticket per feature).

## How work happens

- **Test-driven, always.** Each task starts with a failing test (vitest for `shared/` and
  `game-server/`, Pest for Laravel), then the smallest implementation that turns it green,
  then a refactor with the tests still green. In-app behaviour is verified in a running
  browser before a box is ticked.
- **One feature doc per feature.** The doc is the spec, the checklist, and the record. Tick
  `Status` boxes in the doc header as you go; tick acceptance criteria only after the
  in-app check. When done, update the row below.
- **Contracts first.** If a feature needs a new field, message, or config key, it edits
  `00-contracts.md` and says so in its doc's *Contract change requested* section.
- **Ownership.** A feature edits only the paths it owns (listed in its doc) plus its own
  `shared/src/sim/<module>.ts` + test. No reformatting of files you don't own.
- **Agents never commit.** The lead session commits at green wave boundaries, authorised by
  the repo owner for the run up to MVP.
- Project rules from the Laravel installer (`CLAUDE.md` at the root, Boost) apply: Pest via
  `php artisan make:test --pest`, Pint before finishing, `make:` commands for new classes.
  The new base folders (`shared/`, `game-server/`, `config/game/`) and the JS dependencies
  (Phaser, `@colyseus/sdk`, TypeScript, vitest) were approved with the architecture plan.

## Status

Epic: **EL-173**.

| # | Ticket | Feature | Wave | Doc | Status |
|---|--------|---------|------|-----|--------|
| — | EL-173 | Scaffold: Laravel installer (Livewire kit, Postgres, Pest, Boost), Herd site, DB, npm workspaces, `shared/` + `game-server/` skeletons | 0 | this file | ✅ 2026-09-04 — `https://dynamite.test` 200, migrations ok, 33 starter tests green, `npm run build` ok |
| F01 | EL-174 | Laravel foundation: accounts, factories, levels, game page, internal API | 1 | `F01-laravel-foundation.md` | ✅ 2026-09-05 — migrations/models/actions, Livewire factories + admin level editor, `game:levels:sync` (validates against F02's `schema.json`), HMAC internal API, run store; 150 Pest tests green, Pint + PHPStan clean. Verified in the browser on `https://dynamite.test` against Postgres. |
| F02 | EL-175 | Shared package: schema, messages, config types + validation, pure sim rules | 1 | `F02-shared-sim.md` | ✅ 2026-09-05 — schema/messages/config types + `schema.json` + defaults + validators + `report.ts` + 8 pure sim modules + fixtures; 195 vitest cases green, `tsc --noEmit` clean. Last box (in-app) waits on F03/F04. |
| F03 | EL-176 | Game server core: room, ticket auth, world, movement, phases | 2 | `F03-game-server-core.md` | ✅ 2026-09-09 — 126 tests, tsc clean, boots on :2567 |
| F04 | EL-177 | Client core: Phaser boot, connection, floor, avatars, prediction, HUD, debug | 2 | `F04-client-core.md` | ✅ 2026-09-09 — 114 tests, tsc clean, play page renders |
| F05 | EL-178 | Stations & staffing: work tiles, clipboard, curve, interrupts, output-to-hands | 3 | `F05-stations-staffing.md` | ✅ 2026-09-09 |
| F06 | EL-179 | Items, carry, throw, drop table, hauling, jam/unjam, spills | 3 | `F06-items-carry-throw.md` | ✅ 2026-09-09 |
| F07 | EL-180 | The Slammer | 4 | `F07-slammer.md` | ✅ 2026-09-09 — `981a09f` |
| F08 | EL-181 | The Jig | 4 | `F08-jig.md` | ✅ 2026-09-09 — `981a09f` |
| F09 | EL-182 | The Dock, orders, truck | 4 | `F09-dock.md` | ✅ 2026-09-09 — `981a09f` |
| F10 | EL-183 | Hazards: fuel, sparks, fuses, chains, explosion, beacon, hot potato | 5 | `F10-hazards.md` | ✅ 2026-09-09 — `a38f6d3`. Doc still describes the pre-v2.2 single destroy counter (EL-188) |
| F11 | EL-184 | Day loop, metrics, report card + P&L, run storage, Report scene | 5 | `F11-day-report-grade.md` | ✅ 2026-09-09 — `a38f6d3`. Review caught a non-integer `pnl.profit` that Laravel rejected (losing the crew's whole day) and the last truck's order dropped from the cycle time that feeds the grade. Report scene not yet seen in a browser |
| F12 | EL-185 | Levels 1–4 + Sandbox, layout, copy, validation, level select, PLAYTEST.md | **1** (copy) / 5 (levels) | `F12-levels-sandbox.md` | ✅ 2026-09-09 — `a38f6d3`. Review caught that levels 2–4 shipped an order book nobody could finish in the shift (100 sticks against a ten-minute clock); every level validated, none was winnable. Retuned |
| — | EL-186 | **Crimp retune + tempo floors** — the crimp was unplayable and `clickSeconds` was validated nowhere | 6 | `F14-difficulty-tuning.md` | ✅ 2026-09-09 — `leadSeconds` 0.4 / spacing 0.4 / okMs 180; a tap on click 2 is now 400 ms out against a ±180 ms window, so it misses. T1/T2/T3 added to `validateLevelConfig`, every judged timing in the game audited |
| F18 | EL-194 | **Audio** — WebAudio cues for three rhythm mini-games, no assets | 6 | `F18-audio.md` | ✅ 2026-09-10 — the crimp turned out to be a 6-pulse phrase on the factory's own 150 bpm grid (knots, lead, clicks are all 400 ms), so sonifying the knots too makes it an ordinary rhythm game instead of a counting exercise. Every cue declares the visual that carries the same fact, and a test fails if one is added without it. Review caught that `unlock()` had no caller and the whole layer was inert |
| — | EL-188 | Housekeeping: one noun per object, `mvp-small` → `one-line`, order board, clipped Blast Bin label | 6 | — | ◐ client half ✅ 2026-09-09 — order board rebuilt as a job list leading with the fuse length, `nouns.ts` + a vocabulary test that fails on a second name for one object, waits no longer painted red, prop labels clamp inside the world. Server half (`copy.json`, `shared/src/copy.ts`, the `mvp-small` rename in contracts/F01/F08/F12) remains |
| — | EL-173 | Integration playtest, tuning, MVP checklist | 6 | plan | ☐ |

## M2 — designed, not built

Epic: **EL-187**. Five feature docs and two ADRs written 2026-09-09; no code yet.
Build order: contracts v2.2 → F15 (the floor moves, and F16's distances are measured
against it) → F14 → F17 → F16 → F13.

| # | Ticket | Feature | Doc |
|---|--------|---------|-----|
| F13 | EL-189 | Menu, settings, crew management | `F13-menu-settings-crew.md` |
| F14 | EL-190 | Two difficulty dials, tempo floors, admin surface | `F14-difficulty-tuning.md` · ADR 0014 |
| F15 | EL-191 | Hoppers, the fuse rack, the re-laid floor | `F15-legible-flow.md` · ADR 0015 |
| F16 | EL-192 | Sprint and the fumble meter | `F16-sprint-and-fumble.md` |
| F17 | EL-193 | Hats: published intent and the empty-peg staffing board | `F17-hats-and-roles.md` |

Legend: ☐ not started · ⏳ in progress · ✅ done (all four header boxes ticked in the doc).

**Docs:** all twelve written 2026-09-04 by parallel writers, then critiqued (43 issues, ~80
contract-change requests) and reconciled: `00-contracts.md` **v2.1** absorbs every decision plus
the re-check's 6 blockers and 10 majors; each doc was conformed to it. **The contracts win over
any feature doc.** Notable ordering consequence: F12's `copy.json` + `copy.ts` ship in **wave 1**
because F02's `ConfigMsg` type-imports `Copy`.

## Known ordering artifacts

- ~~`/factories/{factory}/play` returns 500 until F04 creates `main.ts`~~ — **resolved
  2026-09-09**: F04 shipped `main.ts`, the Vite manifest carries the game entry, and the page
  renders a Phaser canvas in a real browser.
- ~~The lobby needs **3 players** to start a day~~ — **resolved**: ADR 0013 makes Level 1 and
  Sandbox `players.min: 1` with a small-crew scaling breakpoint, so one browser can start a
  shift. Three or more is still the real game, and the lobby says so.
- The floor still violates **ADR 0015** (forward is rightward): the layout named `one-line`
  zigzags. F15/EL-191 re-lays it.

## Progress

Wave 5 complete 2026-09-09 (`a38f6d3`): **2067 tests green** — game-server 611, shared 418,
client 853, Laravel 185 — all four typechecks clean, server boots on :2567, and the play page
was exercised in a real browser: the shift starts, the clock runs, the order book draws down
and a truck arrives.

Earlier: wave 3 complete 2026-09-09, 855 tests (game-server 269, shared 249, client 166,
Laravel 171).

## Gates

- **M0** (after wave 2): ✅ **PASSED 2026-09-09** — two isolated browser sessions (sam,
  priya) on factory 1 both render the floor and both avatars; driving Sam up moved only Sam
  and Priya's client saw it. Server on :2567, 621 tests green across four packages.
  Evidence: `m0-p2-up.png`.
- **MVP** (after wave 6): the checklist in the plan, every line ticked, `docs/PLAYTEST.md`
  written.

## Running it locally

- Laravel: served by Herd at `https://dynamite.test` (site linked to this directory).
  `composer run dev` for Vite + queue. Postgres is Herd's (`postgres`, no password, db
  `dynamite`).
- Game server: `cd game-server && npm run dev` (port 2567).
- Tests: `composer test` · `cd shared && npm test` · `cd game-server && npm test`.
- Build: `npm run build` at the root.
