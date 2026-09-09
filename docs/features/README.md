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
- **No commits by agents.** The repo owner commits between waves.
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
| F07 | EL-180 | The Slammer | 4 | `F07-slammer.md` | ⏳ |
| F08 | EL-181 | The Jig | 4 | `F08-jig.md` | ⏳ |
| F09 | EL-182 | The Dock, orders, truck | 4 | `F09-dock.md` | ⏳ |
| F10 | EL-183 | Hazards: fuel, sparks, fuses, chains, explosion, beacon, hot potato | 5 | `F10-hazards.md` | ☐ |
| F11 | EL-184 | Day loop, metrics, report card + P&L, run storage, Report scene | 5 | `F11-day-report-grade.md` | ⏳ tally, metrics, Groove, `buildReport`/`reportSystem` and the Report scene all landed — 58 server + 18 client vitest cases green, both typechecks clean; only the in-app pass (report card in a browser, NEXT DAY into day 2) is outstanding |
| F12 | EL-185 | Levels 1–4 + Sandbox, layout, copy, validation, level select, PLAYTEST.md | **1** (copy) / 5 (levels) | `F12-levels-sandbox.md` | ⏳ copy slice ✅ 2026-09-05 — `copy.json` + `copy.ts` + barrel line, 17 vitest cases green, `shared` typecheck clean; levels + layout + Laravel + PLAYTEST.md remain in wave 5 |
| — | EL-173 | Integration playtest, tuning, MVP checklist | 6 | plan | ☐ |

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
- The lobby needs **3 players** to start a day (`level.players.min`), so a two-browser test
  can reach the floor but not start the shift. Playtests need a third client (or a Sandbox
  level with `players.min: 1`, which F12 ships in wave 5).

## Progress

Wave 3 complete 2026-09-09: **855 tests green** (game-server 269, shared 249, client 166, Laravel 171), all four typechecks clean.

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
