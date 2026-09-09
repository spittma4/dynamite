# 01 — Design doctrine

Six rules. Every feature proposal gets checked against these. If a mechanic breaks one, it
needs a written reason.

## 1. Local productivity ≠ system throughput

Upstream stations are faster than downstream stations on purpose. The default factory
*wants* to fill with WIP. Balancing it is the player's job, and the game never does it for
them.

## 2. The Fun Gradient

**Juice is inversely proportional to how much the system needs you to show restraint.**

The most fun action in the game is the one you must learn to stop doing. The least fun
actions are the ones you'll be forced to do if you don't.

| Tier | Verb | Stations | Feel | Output | Juice |
|------|------|----------|------|--------|-------|
| **S** | Start | Boom Powder, Casing Prep | Slot machine. Loud. 2–3 second loop. Combo counter. | Huge | Max — confetti, screen shake, rising pitch |
| **A** | Make | Assembly | Rhythm + a real two-person handoff. Skillful. | Medium | High — but earned |
| **B** | Judge | QA | Spot-the-difference. Cerebral. | Low | Medium — one satisfying stamp |
| **C** | Move | Packing, Shipping | Crate Tetris and a truck with a countdown. | Bursty | Medium-high — the "SNUG" lid slam, the horn |
| **D** | Fix | Rework, Sweep, Unjam, Haul | Chores. | Zero | **None. Deliberately.** |

Tier D is the punishment layer. It is never fun. It has no combo, no confetti, no sound
reward — only the relief of it ending. A badly-run factory doesn't kill you; it slowly turns
the game into a janitorial simulator. A well-run factory never touches Tier D at all.

### Three axes — depth, not difficulty ([ADR 0009](decisions/0009-depth-not-difficulty.md))

"Harder" conflates three things. We keep them apart:

| Axis | Rule | Why |
|------|------|-----|
| **Execution difficulty** (timing windows, precision) | **Flat.** Two floors, always in ms: no OK/miss threshold under ±100 ms, no Perfect under ±45 ms. Downstream is never harder to execute than upstream; a greed ceiling narrows the OK window, never the Perfect. | Making the bottleneck hard to *execute* punishes whoever volunteered for it and turns Tier A into drudge. Eight people on trackpads. |
| **Decision depth** (things to think about) | **Rises downstream.** QA reads tolerances; Packing plans a drop; Assembly chooses whether to seat a dented casing. | The bottleneck should come from cycle time and staffing structure, and feel *interesting* to hold. |
| **Skill ceiling** (what an expert visibly does that a novice can't) | **Everywhere.** At Tier S it is a **greed ceiling** — the Slammer's Heat, Casing's tempo-up — and it is *choice-driven per rep*, never success-driven (a combo-scaled ceiling makes the spark a function of skill and is farmable). | A 3-second loop needs a ceiling to stay fun for 200 reps, and at Tier S the ceiling must make the trap *sharper*: the better you are, the faster the pile grows and the narrower your window. |

Every station also gets **one gesture** (the Rhythm Heaven rule, checked literally — one
*idea*, not one key: arrows are encouraged wherever direction is the natural verb, and every
mini-game uses the same WASD/arrows + `Space`/`E` hands you walk with), a
**named tell** readable from across the room, a real **Perfect**, and a **depth budget of
one in-loop decision** — the rest of the depth lives at the meta layer (who staffs what,
when to leave Powder, staging before the horn). Juice is budgeted per tier — combos, screen
shake, confetti and factory-wide stings are Tier S only. Full table in [04](04-minigames.md#rules-for-every-mini-game).

## 3. Consequences are physical, delayed, and eventually explosive

- Products are entities on the floor, not counters. They take up tiles.
- When a shelf is full, the machine **doesn't stop** and the game **doesn't say stop** — the
  product lands **in your hands** and stays there until you put it somewhere. The floor is
  where *you* put it. (See [ADR 0012](decisions/0012-output-to-hands.md).)
- A defect QA misses doesn't fail instantly. It ships, and comes back four minutes later as a
  **Hotfix** that explodes on the dock. The consequence lands on whoever is nearest, not
  whoever caused it. That is the joke, and the pressure.
- The pile is **fuel**. A careless act is a **spark**. A big enough chain reaction and **the
  factory explodes** — the only way to lose. Never random: you built the pile, you made the
  spark, you had six seconds of hissing fuse. See [16](16-hazards-and-explosions.md).

## 4. The Groove and the Churn

One global meter, 0–100, shared by everyone. It goes up when the factory flows and down when
WIP, clutter, rework, and starvation pile up.

| State | Groove | What changes |
|-------|--------|--------------|
| **In the Groove** | ≥ 70 | Music adds layers. Conveyors light up. Score multiplier climbs. Workers whistle. "PERFECT" flourishes chain across stations. |
| **Working** | 30–70 | Baseline. |
| **The Churn** | ≤ 30 | Klaxon. Red wash. The Casing Prep metronome jitters. Powder spills twice as often. Standup meetings can fire. |

**Asymmetry is the point.** Being in the Groove makes the game *more rewarding*, not easier —
timing windows do not widen. Being in the Churn makes the game *more frictional*, not
impossible — it adds jitter and mess, never lockouts. Neutral difficulty is flat.

**Comeback:** *Clean Sweep.* If floor clutter hits zero and every shelf is below half, Groove
snaps up to 60. The way out of a death spiral is a coordinated cleanup. That is a coop moment
we want to see happen.

## 5. Mechanics over messages

| Do this | Not this |
|---------|----------|
| A full shelf leaves you standing there holding a keg | A popup saying WIP is bad |
| A fifth helper physically blocks the parts rack | A −20% "overcrowded" debuff icon |
| A rush order leaves half-built gold sticks on the jig | A dialog explaining priority churn |
| The end screen praises the Powder player and condemns the factory | A tooltip about utilization |

The player experiences the organizational problem first. Interpretation, if any, comes on
the end screen — as a joke.

## 6. Config over code

Stations, curves, buffer sizes, recipes, orders, events, upgrades, and levels are JSON
(see [13 — Config schema](13-config-schema.md)). The simulation is small and generic. Adding a
station should be a config change plus one mini-game component, never a sim change.

## Anti-goals

- No drudge. If a Tier S/A/B/C interaction ever feels like a chore, that's a bug.
- No long lockouts. Standup is 5 seconds. All Hands is 8. Never longer.
- No random loss. The factory explosion is the one non-recoverable failure and it always has
  three visible warnings first: the pile, the DANGER beacon, the fuse.
- No individual scoreboards that reward utilization — except the fake management review.
- No precision platforming. Every mini-game is ≤ 3 inputs and readable from across the room.
- No checklists. One gesture per station; a five-verb loop is a bug, not depth.
- No polished art before M1 proves the loop is fun. Squares with faces are fine.
