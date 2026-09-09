# 03 — Stations

Each station is config ([13](13-config-schema.md)) plus one mini-game component
([04](04-minigames.md)). Numbers below are the M1/M2 tuning baseline.

Every station is **player-paced**: the mini-game completes the cycle, and its output lands
in the operator's hands — auto-shelved if there's room, held if there isn't
([ADR 0012](decisions/0012-output-to-hands.md)). The staffing curve
scales the machine's re-arm floor and, above the peak, injects interrupts. See
[05](05-flow-mechanics.md#cycle). `nominal` is the design expectation used for balancing;
`floor` is the hard minimum re-arm at efficiency 1.0.

## Boom Powder — Tier S · "The Slammer"

| | |
|-|-|
| **Role** | The trap. The most fun station and the first one you must learn to stop using. |
| **Inputs** | None (ingredient chutes are infinite). |
| **Output** | Powder Keg (2 pours each). Quality readable on the shelf: grey/deflated · steaming · normal · **glowing** (prime). |
| **Cycle** | nominal 2.8 s (lazy) · floor **1.4 s** (hot hand — the Heat greed ceiling) |
| **Work tiles** | 1 |
| **Output shelf** | 6 kegs |
| **Staffing** | `{1: 1.0, 2: 1.05, 3: 0.9, 4: 0.75}` — a second person adds nothing useful; they get in the way of the plunger. |
| **Failure** | Late release → "damp" keg (quality 0.7) **and a spark on the floor ring** ([16](16-hazards-and-explosions.md)). Early → "dud" keg (0.4). A 4th mash press → spill tile at your feet. Neither stops production. |
| **Rate at baseline** | Lazy: 21 kegs/min = 42 pours/min (**4×** Assembly). Hot hand: 43 kegs/min (**8×**). The shelf fills in 9–18 s. Skill makes the trap sharper. |
| **Upgrades** | Bigger Shelf (the trap upgrade), Conveyor to Assembly |

## Casing Prep — Tier S · "Stamp & Crimp"

| | |
|-|-|
| **Role** | Second fast, fun upstream station. Introduces *colour* (order attribute) and *dents* (defect source). |
| **Inputs** | None (tube feeder is infinite). Player picks casing colour with Q/E. |
| **Output** | Casing {colour: red/blue/gold, dents: 0–3, gleam: bool} |
| **Cycle** | nominal 3.0 s per press · floor 2.25 s (10× combo tempo-up) |
| **Work tiles** | 2 (two presses) |
| **Output shelf** | 8 casings |
| **Staffing** | `{1: 1.0, 2: 1.0, 3: 1.05, 4: 0.9}` — presses are independent bars; the second press *is* the staffing gain, and a solo player never has a dead gap. |
| **Failure** | STAMP miss +1 dent, CRIMP miss +2, DIE miss +1. QA catches per order tolerance; 1 dent ships on a loose order. |
| **Rate at baseline** | Two presses × 3 s = 40/min (**4×** Assembly); at 10× ~53/min. Casings are 0 fuel — the *quiet* trap (clutter, hauling) beside Powder's loud one. |
| **Groove hook** | In the Churn the metronome jitters ±120 ms → more dents → more QA load → more Churn. The factory makes itself messier. |
| **Upgrades** | Second Press, Conveyor |

## Assembly — Tier A · "The Jig"

| | |
|-|-|
| **Role** | The bottleneck. The station everyone rushes to help, and the one that punishes it. |
| **Inputs** | 1 casing + 1 pour (½ keg; pours at the keg's quality — 5/7/8 beats for prime/damp/dud) + 1 fuse (long/short, from rack) + 1 cap (from rack) |
| **Output** | Stick {type, colour, fuseLength, fill, crimp} |
| **Cycle** | nominal 6.0 s (pair) · solo ≈ 8.5–9 s · floor 5.0 s |
| **Work tiles** | 2 + 1 rack tile |
| **Input shelf** | 8 (mixed kegs and casings) · **Output shelf** 4 |
| **Staffing** | `{1: 0.6, 2: 1.0, 3: 1.15, 4: 1.1, 5: 0.95, 6: 0.8, 8: 0.5}` |
| **Coop** | A on the jig (seat, pour, knots, crimp — all `Space` on a beat); B on the rack tile **tossing** part-sets into the cradle on a timing arc. B never walks. A full cradle bounces the toss — B's restraint rule. The pair is a metronome from the dock when it clicks. |
| **Failure** | Over-pour → spill tile + `overfill`. 2+ missed knots → `frayed`. Missed crimp → `capLoose`; on a *visibly* dented casing, a 0.3 spark. Wrong fuse → audible (2 zips on a long-fuse order) before it becomes a defect. A missed toss litters the aisle. |
| **Upgrades** | Second Jig (optimal → 4, curve replaced), Parts Rack (rack tile becomes 2), Cross Training |

## QA — Tier B · "The Look"

| | |
|-|-|
| **Role** | Judgment. Quieter on purpose. Becomes the bottleneck the moment Assembly is upgraded. |
| **Inputs** | Stick from Assembly output |
| **Output** | Stick {inspected: pass} → Packing shelf, or {inspected: fail, defects[]} → Rework shelf |
| **Cycle** | nominal 4.0 s (careful) · floor 2.0 s |
| **Work tiles** | 1 (one lamp) |
| **Input shelf** | 4 · **Output shelf** 4 pass + 4 rework |
| **Staffing** | `{1: 1.0, 2: 1.1, 3: 0.9}` |
| **Failure** | Passing a defect is silent; it returns as a Hotfix in **120 s** (late ones fire during the report and zero the order). Failing a good stick → the Rework Bench sends it back tagged *WAS FINE*. Every order line carries a tolerance (strict/normal/loose), so the card matters on every rep. |
| **Upgrades** | Auto-Check (objective attributes pre-flagged), Second Lamp |

## Packing — Tier C · "Crate Tetris"

| | |
|-|-|
| **Role** | Turn passed sticks into order-shaped crates. Space puzzle, satisfying lid slam. |
| **Inputs** | Passed sticks (1×2), Mega Boom (2×2); an open Order card. Well is **3 wide** (S 2×2 · M 3×4 · L 3×6). |
| **Output** | Crate {orderId, contents[], snug: bool} |
| **Cycle** | nominal 5.0 s (M crate) · floor 3.0 s |
| **Work tiles** | 2 (two benches) |
| **Input shelf** | 8 · **Output** 3 closed crates (floor after that) |
| **Staffing** | `{1: 0.6, 2: 1.0, 3: 1.1, 4: 0.9}` |
| **Failure** | Overhang → hole → not SNUG. Late lid → RATTLY (narrower shove window at the dock). Wrong contents *ships* crooked with a red `?` → spec defect → Returns. Cram a 7th stick → `crushed` → Hotfix p 0.5. |
| **Upgrades** | Third Bench, Staging Area (a 6-crate shelf by the dock) |

## Shipping — Tier C · "The Dock"

| | |
|-|-|
| **Role** | Convert crates to score. Bursty demand. The "plate it NOW" moment. |
| **Inputs** | Closed crates (M2+). In M1, bare sticks go straight on the truck. |
| **Output** | Completed orders → score, Groove bump, horn. |
| **Truck** | Arrives every 60 s, waits 20 s, leaves regardless. Countdown visible from across the floor. |
| **Work tiles** | 4 (the ramp is wide) |
| **Staffing** | `{1: 1.0, 2: 1.6, 3: 1.9, 4: 1.8, 6: 1.2}` — the one station where a crowd helps, briefly: loaders alternating beeps are a bucket brigade. |
| **Failure** | Partial load → partial credit; leftovers to the **Returns pile**. A missed shove stalls the crate halfway and blocks that lane for one beep — never Returns. |
| **Upgrades** | Staging Area, Longer Truck Wait (another trap: hides Packing's slowness) |

## Tier D — The Chore Floor

Not stations. Things that happen to you.

| Chore | Trigger | Interaction | Time | Reward |
|-------|---------|-------------|------|--------|
| **Rework Bench** | QA fail | The Jig in reverse: un-crimp, pull fuse, pour back, unseat | 6 s | Returns a casing and ½ pour to shelves. No score. |
| **Sweeping** | Spill tile | Grab broom from hook, walk over tiles | 1.5 s / tile | Tile is clean. |
| **Unjam** | Floor ring full | Hold `E` on lever. Progress bar reads *WAITING FOR VENDOR SUPPORT* | 4 s | Machine runs again. |
| **Hauling** | Floor items | Pick up, walk, put on shelf | travel | Item is on a shelf. |
| **Returns** | Partial truck, Hotfix | Haul crates back to Packing to reopen | travel + 2 s | Crate reusable. |
| **Stomp** | Lit fuse | Stand on it, hold `Space` | 1 s | Fuse out. |
| **Sand Bucket** (M2) | Lit fuses | Grab from wall, throw 2 tiles | throw + 5 s refill | Radius-1 fuses out, tiles inert 20 s. |
| **Repair** (M2) | Station DAMAGED by an Incident | Hold `E` — *FILING INCIDENT REPORT* | 10 s | Station back online, shelves empty. |

Chores never have combos, particles, or a satisfying sound. They end and that's it.
