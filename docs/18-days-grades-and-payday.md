# 18 — Days, grades, and Payday

Sam: *"each day has X number of orders or is so long. Then end of the day they can vote for
upgrades or something and spend the profits generated? Could probably build some element of
A–F grading that earns relative coin."*

The unit of play is a **day**. A day ends with a **report card** (A–F) and a **P&L**. The
grade turns profit into **coin**. Coin is spent at **Payday** — by **vote**. Then the next
day. The factory remembers all of it.

```
   ┌──────────── DAY ────────────┐    ┌──── REPORT CARD ────┐    ┌──── PAYDAY ────┐
   │ order book of N · clock T   │ ─▶ │ grade A–F · P&L     │ ─▶ │ vote · buy one │ ─▶ next day
   │ ends on book done or 0:00   │    │ coin = profit × mult│    │ bank the rest  │    (C or better)
   └─────────────────────────────┘    └─────────────────────┘    └────────────────┘
```

## The day

| | |
|-|-|
| **Order book** | `day.orderBook` orders (11 on Level 2; scales by level). Visible on the Order Board as a stack of cards that shrinks. |
| **Shift clock** | `day.shiftSeconds` (600). Big wall clock. |
| **Ends on** | `either` (default): the book is done **or** the clock hits 0:00. The book is the *goal*, the clock is the *limit*. |
| **Early finish** | Book done with time left → the shift ends now and the report gets **+5 score per remaining minute** (cap 10). Throughput is the point; this pays it. |
| **Explosion** | Ends the day immediately. Grade **F**. Coin 0. |

"Round" is retired everywhere in favour of **day** (calendar) and **shift** (the clock).

## The report card (A–F)

The grade is **factory-level only**. Individual utilization stays on the report as the joke
it always was — the Powder player is still EXCELLENT ★ on a day the factory got a D.

```ts
score = 50 × onTime                                     // orders shipped complete & on time / book
      + 20 × clamp(1 − peakWIP / wipTarget, 0, 1)        // less WIP is better; target per level
      + 15 × (1 − complaints / max(1, shipped))          // Hotfixes + spec returns
      + 15 × clamp(1 − (avgCycle / cycleTarget − 1), 0, 1)
      − 5 × incidents                                    // 4–9 keg chains
      + min(10, 2 × cleanSweeps + 2 × niceSaves)
      + earlyFinishBonus
EXPLODED → F regardless.
A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F
```

Weights, thresholds, and the per-level `wipTarget` / `cycleTarget` are config. The grade is
computed in `shared/sim/grade.ts` so the game server and Laravel agree on it.

**Styling:** a school report card — pinned to the factory screen's corkboard afterwards, so
a factory's history reads *A A C F B*. The F has a fire marshal's stamp.

## The P&L

Profit is real, and the pile is literally money on the floor.

```ts
revenue = Σ shipped sticks × price      // red 10 · blue 12 · mega 30 · gold 40 · +20 per rush order
waste   = Σ (items on the floor or shelves at close + destroyed + returned) × cost
                                         // keg 4 · casing 2 · stick 6 · crate 8
profit  = revenue − waste                // negative → a LOSS stamp and 0 coin
coin    = max(0, profit) × gradeMultiplier   // A ×1.5 · B ×1.25 · C ×1.0 · D ×0.75 · F ×0.5
```

The report shows the line that matters in bold: **Materials purchased: 31 kegs. Materials
shipped: 8.** This resolves open question #10 — the floor is the cost *and* it's on the
invoice.

A great day with a bad grade (say, huge revenue but peak WIP through the roof and three
Hotfixes) pays *less* than a modest, clean one. That's "relative coin."

## Payday — the vote

After the report, every player lands on the **Payday screen** (Livewire + Reverb — the
between-days screens are where Reverb earns its keep).

| Rule | |
|------|-|
| **Catalogue** | Every upgrade the factory doesn't own, with price. Unaffordable ones are greyed but visible. |
| **One vote each** | `payday.votesPerPlayer: 1`. Tallies update live. |
| **BANK IT** | A votable option: buy nothing, keep the coin for something bigger. |
| **Timer** | `payday.voteSeconds: 45`. |
| **Resolution** | The highest-voted *affordable* upgrade is bought — **one purchase per Payday**. Leftover coin banks. Upgrades stay scarce so votes mean something. An upgrade applies to **every line**. |
| **Ties** | The earliest vote wins. *"The meeting was decided before you got there."* Never random. |
| **Owner** | Has no override. It's a democracy. |

**RECOMMENDED BY MANAGEMENT.** From Level 4 on, one upgrade wears a gold ribbon. It is
always drawn from the trap list — Bigger Shelf, Longer Truck Wait, Conveyor — the cheap ones
that *hide* a problem instead of moving it. Democracy will buy them. That is the joke, and it
plays itself: nobody has to explain why the shelf upgrade made the next day worse; the pile
does.

## Advancing

- **C or better** → the next level unlocks; the next day is the next level.
- **D or F** → repeat the day. Banner: *"MANAGEMENT WOULD LIKE TO SEE IMPROVEMENT."* Coin is
  still earned (at the multiplier), so a repeat is not a dead loss.
- **Sandbox** is exempt: any level, no grade, all upgrades free.

## Persistence

`factories.coin` (replaces `budget`), `factories.day`, `factories.unlocked_level` as before.
`runs` gains `day`, `grade`, `profit`, `coin_earned`. Votes are transient (Reverb presence
state) — only the purchase is stored, in `factory_upgrades` with the day it was bought.

## Config

```jsonc
"day":     { "shiftSeconds": 600, "orderBook": 11, "endsOn": "either", "earlyFinishBonusPerMinute": 5, "earlyFinishCap": 10 },
"grading": { "weights": { "onTime": 50, "wip": 20, "quality": 15, "cycle": 15, "incident": -5, "heroCap": 10 },
             "thresholds": { "A": 90, "B": 75, "C": 60, "D": 40 },
             "targets": { "wip": 16, "cycleSeconds": 240 },
             "multiplier": { "A": 1.5, "B": 1.25, "C": 1.0, "D": 0.75, "F": 0.5 },
             "advanceOn": "C" },
"economy": { "price": { "red_stick": 10, "blue_stick": 12, "mega_boom": 30, "gold_exec": 40, "rushBonus": 20 },
             "wasteCost": { "keg": 4, "casing": 2, "stick": 6, "crate": 8 } },
"payday":  { "voteSeconds": 45, "votesPerPlayer": 1, "onePurchase": true,
             "managementRecommendationFromLevel": 4, "trapList": ["bigger_shelf", "longer_truck_wait", "conveyor"] }
```

## Roadmap

- **M1:** the report card grade and the P&L on the end-of-day report (coin shown, not
  spent). Cheap — the report exists anyway — and it makes the M1 playtest's "was that good?"
  answerable with a letter.
- **M4:** Payday voting, persistence, the corkboard of report cards, Management's ribbon.
