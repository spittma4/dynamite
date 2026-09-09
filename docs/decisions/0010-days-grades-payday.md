# ADR 0010 — Days, an A–F report card, a P&L, and upgrades bought by vote

**Status:** accepted · 2026-09-04

## Decision
The unit of play is a **day**: an order book and a shift clock; it ends on either. The
report card grades the **factory** A–F on on-time rate, peak WIP, quality, cycle time, and
incidents. A **P&L** (revenue − waste) times the grade's multiplier is the day's **coin**.
At **Payday** every player votes; the top-voted affordable upgrade is bought, one per day;
ties go to the earliest vote; the owner has no override. From Level 4 one trap upgrade is
*Recommended by Management*. C or better advances; D/F repeats the day.

## Why
Sam asked for days with an order count or length, end-of-day voting on upgrades funded by
profit, and A–F grading that earns relative coin. Voting is the natural multiplayer form of
"spend the budget" and creates a new coop conversation (*"not the shelf, the jig"*). Grading
the factory — never the individual — keeps the utilization joke intact and makes "relative
coin" a system-throughput reward. A real P&L makes the pile literally money on the floor,
which sharpens the corporate joke; it resolves open question #10 (previously "the floor is
the cost") in favour of *also* charging waste at close.

## Rejected
- **Individual grades or coin.** Rewards utilization; kills the joke and the coop.
- **Owner buys upgrades.** Faster, but wastes the one place the game can stage a bad group
  decision on purpose.
- **Multiple purchases per Payday.** Upgrades stop being scarce; votes stop mattering.
- **Random tiebreak.** Never random.

## Consequences
"Round" is retired for day/shift. `factories.budget` → `coin`, plus `day`; `runs` gains
`day`, `grade`, `profit`, `coin_earned`. Grade lives in `shared/sim/grade.ts`. M1 shows the
grade and P&L on the report; M4 builds Payday on Livewire + Reverb.
