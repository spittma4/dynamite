# 14 — Roadmap

Five milestones. **M1 is the gate.** Nothing past M1 is built until M1 is fun with real
humans. Every milestone has a definition of done and one question it answers.

## M0 — Walking Simulator

*Question: does the stack work end to end?*

- `laravel new` (13.x), Postgres, auth scaffolding (Livewire starter kit), `is_admin`.
- `game-server/` with a `FactoryRoom` that accepts a ticket and syncs `PlayerState`.
- `resources/js/game/` Phaser 4 scene with a tilemap and 8 coloured squares with faces.
- Ticket handoff: Laravel signs, Node verifies.
- Debug overlay showing RTT and tick rate.

**Done when:** two browsers on two machines see each other walk around the MVP map at
20 Hz with no visible rubber-banding on a normal connection.

## M1 — The Trap

*Question: is "stop making powder" fun?*

- Stations, v2 spec ([04](04-minigames.md)): **The Slammer** with Heat, DEAD CENTER, the
  in-world combo show, and the 4th-plonk overflow; **The Jig** with dents-on-the-shelf, POUR,
  Fuse Knots, ratchet CRIMP, PRIME STICK, and B's Toss; **The Dock** with shove-on-the-beep
  and the Tailgate Slam (sticks straight onto the truck, no crates, no Lane = Slot yet).
- Items as entities. Shelves. The overflow ladder (shelf → floor → jam). Carrying. Hauling.
- **Oops** ([17](17-oops-carry-and-throw.md)): throw + catch, bump drops, keg knock-over,
  stick fizzle, hot potato + the Powder Blast Bin, the truck ride, butterfingers.
- Staffing curve + physical congestion: work tiles, aisle blocking, "what can I do?" bubbles.
- Clipboard context switch.
- **Hazards:** floor kegs and spills are fuel; Slammer-redline and jam sparks; 6 s fuse;
  stomp; chain reaction; Whoops; **factory explosion** as hard loss with the setback flag
  for Level 1 and Sandbox ([16](16-hazards-and-explosions.md)). The trap's teeth.
- Orders: one line type, one truck a minute, a countdown.
- Shift clock + order book. End-of-day report with **kegs made vs. used** in bold, utilization
  vs. verdict, bottleneck line, and the **report card grade + P&L** (coin shown, not spent —
  [18](18-days-grades-and-payday.md)).
- `players.min = 3`; `shared/sim/scale.ts` with the one-line breakpoint; `line` on stations
  and players ([19](19-scaling-3-to-10.md)). Playtest at 3–6.
- Levels 1–4 as four config files (they differ only in numbers and player count).
- Sandbox mode with the debug overlay.

**Done when:** in three playtests with 4+ people who haven't read these docs, someone says
*"stop making powder"* or *"no, not everyone"* unprompted, and people want to play again.

**If it isn't fun:** we tune numbers for one week. If it still isn't fun, we change the
core loop before adding anything from M2. That's the whole point of the gate.

## M2 — The Gradient

*Question: does the full fun gradient hold up — is Tier D hated and Tier S loved?*

- **Stamp & Crimp** (accent figure, PERFECT windows, tempo-up, DIE beat, DUET), **The Look**
  (tolerances, continuous condition, park-and-stamp, WAS FINE, chalk tally), **Drop Well**
  (gravity, sizes, Lid Bounce, Cram, the miss ships, shared shelf). Product attributes.
  Defect sources. Lane = Slot and Clean Load at the Dock.
- **Rework Bench**, **Sweeping**, **Unjam**, **Returns** pile.
- **Groove / Churn** meter with music layers, klaxon, Clean Sweep.
- **Hotfix** returns (and the Hotfix spark).
- **Sand Bucket**, Incidents + station damage + Repair, scorch tiles, DANGER beacon,
  sooted sprites. Crate drops, the dock Blast Bin, powder footprints.
- `two-line` tilemap, shared-downstream resizing, line hats. Playtest at 7–10.
- Levels 5–6.

**Done when:** playtesters can articulate which station they *like* and which they *avoid*,
and the avoided ones are all Tier D.

## M3 — Chaos

*Question: are the interruptions funny the tenth time?*

- Event system + the catalogue. Ambiguous orders + the Phone. Order Board on the wall.
- A full-house playtest at 10 with events on.
- Levels 7–8. (Kanban board with manual ticket-moving is a *maybe* here — prototype it in
  Sandbox first; see [15](15-open-questions.md).)

**Done when:** no event makes a playtester groan twice.

## M4 — The Company

*Question: does persistence give people a reason to come back?*

- Factory screen: coin, the corkboard of report cards, level select, run history.
- **Payday**: the vote, one purchase per day, BANK IT, Management's ribbon. Advance on C.
- Reverb-powered lobby presence, invites, and live vote tallies.
- Admin: level JSON editor with validation, run list, force-end.
- Levels 9–10.
- One VPS deploy.

**Done when:** a group can play three rounds on three evenings and their factory remembers.

## Build order inside M0/M1 (the vertical slice)

1. Laravel + auth + Postgres + `is_admin`
2. `shared/` with schema types, `sim/curve.ts`, and `sim/cycle.ts` (with tests — curve
   interpolation and the `max(execution, machine)` cycle rule are the bits that bite silently)
3. Colyseus room, ticket auth, `PlayerState` sync
4. Phaser scene, tilemap, avatars, prediction/interpolation
5. Station abstraction: footprint, work tiles, join/leave, clipboard
6. Staffing curve wired to `StationState.efficiency`; debug overlay shows it
7. The Slammer — Heat first (server judges the release against the mash-derived climb), then DEAD CENTER, then the in-world show
8. Items as entities; output shelf; floor spill; carrying; hauling; throw + catch + drop table
9. The Jig — A's four beats solo first, then B's Toss
10. Input shelf pull; starved state; jam + unjam
10b. Fuel map; sparks; fuse; stomp; chain; explosion + round end; hot potato + Blast Bin; truck ride
11. Dock + truck + orders
12. Shift clock + order book; metrics sampling; report screen with grade + P&L
13. Levels 1–4 configs; Sandbox
14. **Playtest.** Tune. Playtest. Tune.
