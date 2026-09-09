# 19 — Scaling: 3 to 10 players

Sam: *"let's make it so you could play with 3–20 players. Some mechanics can be adjusted
based on player size but should keep it doable."* — later dialed back to **3–10**.

**Principle: the factory grows with the crowd; the stations don't.** Staffing curves are
per-station and stay exactly as tuned — four people on one jig is funny at 3 players and at
10. What scales is the *number of lines*, the shared downstream, the order book, and the
truck cadence. At 10 the core lesson becomes cross-team: *"Line B, stop — QA is drowning."*

## Breakpoints

`shared/sim/scale.ts` takes the player count at lobby lock (`P`) and applies the level's
`scaling` block. Everything below is config; these are the starting values.

| P | Lines | Powder · Casing · Assembly | QA lamps | Packing benches | Dock lanes | Truck every | Order book |
|---|---|---|---|---|---|---|---|
| **3–6** | 1 | 1 each | 1 | 2 | 4 | 60 s | 11 |
| **7–10** | 2 | 2 each (A, B) | 2 | 3 | 6 | 45 s | 20 |

The order book scales **sub-linearly** (≈ 0.9× per extra line) because coordination cost is
super-linear. That is the "keep it doable" lever — bigger crowds get slightly more slack.

## Lines

- A **line** is one Powder + one Casing + one Assembly with their own shelves and floor
  rings, colour-coded (A red, B blue hats and station trim).
- **QA, Packing, the Dock, and the Rework Bench are shared.** They scale by work tiles, not
  by count — one QA area with 1 or 2 lamps — so the shared downstream is the *inter-line*
  bottleneck by design.
- Players are **assigned a line at lobby lock** (balanced) and can walk to any station on
  any line at any time. The assignment is a hat and a HUD label, never a lock. It exists so
  that "your line" is a thing people can say.
- The **Groove** stays one factory-wide meter. Per-line utilization appears on the report.

## What scales, what doesn't

| Scales with `P` | Fixed |
|-----------------|-------|
| Lines (and their tilemap: `one-line`, `two-line`) | Every staffing curve |
| Shared work tiles (lamps, benches, lanes) | Every mini-game and window |
| Order book, truck cadence, `qtyPerTruck` | Buffer sizes per station |
| Break-room tile cluster (All Hands needs room for 10) | One vote per player, one purchase per Payday |
| Chaos event weights (Standup at 10 is funnier; keep it 5 s) | Clipboard, Groove weights |
| | Explosion chain threshold (10 — per pile; two piles means two chances) |

## At 3

Congestion never happens at 3 — the trap is **understaffing**: one on Powder, one on
Assembly, one on the Dock, and Powder's pile still grows because Assembly needs two. The
lesson at 3 is "someone has to stop making powder and come help," which is the same lesson.
Minimum is 3, not 2, because the Jig's pair split needs a second person somewhere.

## At 10

- Ten "what can I do?" bubbles across two lines is the joke at its loudest. The interrupt
  cap per station stays; two stations can be interrupted at once.
- **Emotes matter** (STOP · HELP · GO · ?) — ten people on a call is noisy; the emotes are
  the floor's speech for people who aren't on the call.
- The report's individual column is a ten-row corporate performance review. Per-line rows
  sit above it.
- Payday: ten votes, ties still to the earliest. One purchase, always.

## Netcode

- Colyseus `maxClients: 10`. Sim and patch rate both stay at 20 Hz — no switching needed at
  this size.
- Per-client downstream at 10 players and 200 live items is well under 50 KB/s worst case
  and ~10 KB/s typical, because schema deltas only carry changed fields and most items sit
  still. Fine on home wifi.
- One room per factory. No cross-room anything.

## Config

```jsonc
"players": { "min": 3, "max": 10 },
"scaling": {
  "breakpoints": [
    { "maxPlayers": 6,  "lines": 1, "qaLamps": 1, "packingBenches": 2, "dockLanes": 4, "truckEverySeconds": 60, "orderBook": 11, "layout": "one-line" },
    { "maxPlayers": 10, "lines": 2, "qaLamps": 2, "packingBenches": 3, "dockLanes": 6, "truckEverySeconds": 45, "orderBook": 20, "layout": "two-line" }
  ]
}
```

A level's `stations` array is the **one-line template**; `scale.ts` clones the line stations
per breakpoint with `-a/-b` suffixes and anchors from the layout, and resizes the shared
ones. Upgrades patch **all lines** (a Second Jig is a second jig on every line) — one
purchase, factory-wide, so Payday stays simple.

## Roadmap

- **M1:** `players.min = 3`, `scale.ts` with the one-line breakpoint only, line field on
  stations/players. Playtest at 3–6.
- **M2:** `two-line` tilemap, shared-downstream resizing, hats. Playtest at 7–10.
- **M3:** a full-house playtest at 10 with chaos events on — that's the crowd test.
