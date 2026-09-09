# DYNAMITE — Design & Implementation Docs

Working title: **DYNAMITE**. Tagline: *Busy is not the same as done.*

A cooperative, web-based, top-down 2D factory game for 3–10 players about running a cartoon
explosives factory badly — and then, if you talk to each other, slightly less badly.

These docs are the durable record. The Lavish presentation (`.lavish/dynamite-plan.html`) is a
review surface generated *from* them; when the two disagree, fix the markdown first.

## Reading order

| # | Doc | What it settles |
|---|-----|-----------------|
| 00 | [Vision](00-vision.md) | Pitch, tone, theme, the core joke, what this is *not* |
| 01 | [Design doctrine](01-design-doctrine.md) | The Fun Gradient, Groove/Churn, Chore Floor, mechanics-over-messages |
| 02 | [Factory floor](02-factory-floor.md) | Tiles, movement, station anatomy, physical WIP, congestion, context switching |
| 03 | [Stations](03-stations.md) | Every station: role, tier, staffing, buffers, config |
| 04 | [Mini-games](04-minigames.md) | Every interaction, second by second, plus the chores |
| 05 | [Flow mechanics](05-flow-mechanics.md) | Tick, station state machine, formulas, Groove, bottleneck estimate |
| 06 | [Orders, quality, rework](06-orders-quality-rework.md) | Products, attributes, defects, QA, Hotfix returns, ambiguity |
| 07 | [Chaos events](07-chaos-events.md) | The interruption catalogue |
| 08 | [Upgrades](08-upgrades.md) | The upgrade catalogue and what each one *changes* (not just speeds up) |
| 09 | [Progression](09-progression.md) | Level ladder and what each level is designed to make players say |
| 10 | [Metrics](10-metrics.md) | End-of-round report and the utilization joke |
| 11 | [Architecture](11-architecture.md) | Stack, the Laravel/Node seam, auth handoff, persistence, deploy |
| 12 | [Data model](12-data-model.md) | Postgres tables + authoritative game-state schema |
| 13 | [Config schema](13-config-schema.md) | The JSON that defines levels, stations, curves, recipes, events |
| 14 | [Roadmap](14-roadmap.md) | Milestones M0–M4 with definition-of-done and playtest gates |
| 15 | [Open questions](15-open-questions.md) | What we have deliberately not decided yet |
| 16 | [Hazards and explosions](16-hazards-and-explosions.md) | Fuel, sparks, fuses, chain reactions — the only way to lose |
| 17 | [Oops: carry, throw, drop](17-oops-carry-and-throw.md) | Throwing, catching, dropping dynamite, hot potato, the truck ride |
| 18 | [Days, grades, and Payday](18-days-grades-and-payday.md) | The day loop, the A–F report card, the P&L, coin, and voting on upgrades |
| 19 | [Scaling 3–10](19-scaling-3-to-10.md) | Lines, not bigger curves: how the factory grows with the crowd |
| — | [decisions/](decisions/) | ADRs 0001–0012. One decision per file, with the alternative we rejected |

## Conventions

- **Config examples are normative.** If a doc shows a JSON block, the implementation reads that
  shape. Change the doc when you change the shape.
- **Numbers are starting values, not truth.** Every cycle time, buffer size and curve in here is
  the M1 tuning baseline. Playtesting owns the final numbers.
- **Mechanics over messages.** Any proposed feature that "tells" the player a lesson instead of
  making them *feel* it gets sent back. See doctrine §5.
- **Decisions go in `decisions/`.** If you change your mind, write a new ADR that supersedes the
  old one; don't edit history.
