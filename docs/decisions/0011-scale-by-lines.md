# ADR 0011 — 3–10 players: scale by adding a line, never by stretching curves

**Status:** accepted · 2026-09-04 · range dialed back from 3–20 to **3–10** by Sam the same day

## Decision
Player range is 3–10. Above 6 the factory adds a second production line (Powder + Casing +
Assembly) that shares QA, Packing, the Dock, and Rework; the shared stations grow by work
tiles. Order book and truck cadence scale sub-linearly. Staffing curves, mini-games,
windows, and buffers never change with player count. `shared/sim/scale.ts` applies a
breakpoint table from config at lobby lock.

## Why
Sam asked for 3–20 (then 3–10) with size-adjusted mechanics that stay doable. Ten bodies
on one six-station floor is permanent congestion — the "too many helpers" joke would be the
baseline instead of a punchline. Keeping the curves local preserves the joke at any size,
and sharing the downstream makes the core lesson cross-team at scale ("Line B, stop — QA is
drowning"), which is a better allegory, not a worse one. Sub-linear order books are the
"doable" lever because coordination cost grows faster than headcount.

## Rejected
- **Flatten the staffing curves for big lobbies.** Kills the congestion mechanic.
- **One giant line with more work tiles everywhere.** No inter-team dynamic; the pile is
  everyone's and nobody's.
- **Split into separate rooms.** It's one factory; the point is one Groove and one truck.
- **Minimum 2.** The Jig's pair split needs a second person somewhere; 3 is the floor.

## Consequences
`players` 3–10; `line` fields on stations and players; two tilemaps; `maxClients: 10`;
upgrades apply to both lines. M1 stays one line (3–6); two lines in M2; a full house of 10
in M3.
