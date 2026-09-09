# 10 — Metrics and the end-of-round report

The report is the only place the game *interprets* what happened. It does so as a joke, in
two columns that disagree with each other.

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  DAY 3 · LEVEL 2 · TOO MUCH POWDER              REPORT CARD:  D   │
├──────────────────────────────┬───────────────────────────────────┤
│  INDIVIDUAL PERFORMANCE      │  FACTORY PERFORMANCE               │
│                              │                                    │
│  Sam       98%  EXCELLENT ★  │  Orders completed        4 / 11    │
│  Priya     91%  EXCELLENT ★  │  Throughput          4 / 10 min    │
│  Marco     77%  GOOD         │  Avg cycle time           6:12     │
│  Jo        44%  NEEDS FOCUS  │  Peak WIP                   37     │
│                              │  Floor items at end         22     │
│  Top performer: Sam (Powder) │  Rework                      0     │
│                              │                                    │
│                              │  Verdict:            DISASTER      │
│                              │  Revenue 480 − Waste 212 = 268     │
│                              │  × D (0.75) = 201 coin             │
├──────────────────────────────┴───────────────────────────────────┤
│  STATION UTILIZATION            BOTTLENECK: ASSEMBLY               │
│  Boom Powder   ████████████  98%   ← 31 kegs made, 8 used         │
│  Assembly      ██████████    100%  ← starved 0 s, blocked 84 s     │
│  Dock          ███           27%                                   │
├──────────────────────────────────────────────────────────────────┤
│  WIP OVER TIME   ▁▂▃▅▆▇█████████████                                │
│  "WHAT CAN I DO?" bubbles emitted:  Marco 14 · Jo 9                │
│  Kegs exploded: 3 (Whoops)   Fuses stomped: Jo 2   Sooted: Sam      │
│  PRIME STICKs: 4   GLEAM casings: 11   Clean Loads: 1   WAS FINE: 3  │
│  Fizzles: 3   Nice Saves: Jo 1   Truck rides: Marco 1   Most dropped: Marco (7) │
├──────────────────────────────────────────────────────────────────┤
│  CUSTOMER FEEDBACK                                                 │
│  ★☆☆☆☆ "went pfft"   ★★★★☆ "arrived, eventually"                   │
└──────────────────────────────────────────────────────────────────┘
```

## Rules

- **Utilization is never green.** It's neutral grey. The "EXCELLENT" label is styled like a
  corporate certificate — gold star, serif font — and is the joke.
- **Verdict** is one of `EXPLODED` · `DISASTER` · `ROUGH` · `FINE` · `SMOOTH` · `FLOW` from
  throughput vs. the level's target, tinted by peak WIP. `EXPLODED` overrides everything and
  the report is delivered by a fire marshal. The individual column is unchanged.
- The **bottleneck** line explains itself in one clause: *starved X s, blocked Y s*.
- **Powder kegs made vs. used** is the single most important number in M1. It goes in bold —
  and on the P&L as *Materials purchased / Materials shipped*.
- Above 6 players the utilization block gains **per-line rows** (Line A · Line B) above the
  per-station ones; the individual column becomes a ten-row performance review.
- **Report card** grade is factory-level only ([18](18-days-grades-and-payday.md)). The
  individual column never feeds it.
- The report is saved with the run ([12](12-data-model.md)); the factory screen pins the
  grades to a corkboard (*A A C F B*) — history for the *factory*, never the player.

## Debug overlay (dev only, `~` to toggle)

Per station: workers, efficiency, cycle time, state, input/output shelf `n / cap`, floor ring
count, progress. Global: Groove, WIP, orders open/started/complete, bottleneck estimate,
tick rate, RTT per player. Rendered by the client from state; no extra server work.
