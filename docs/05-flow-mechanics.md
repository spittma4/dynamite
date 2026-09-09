# 05 — Flow mechanics

The simulation is deliberately small. Everything below fits in a few hundred lines of pure
TypeScript in `shared/sim/` so the client can predict and the server can be authoritative
with the same code.

## Tick

- Server simulates at **20 Hz** (`setSimulationInterval(50)` in Colyseus).
- State is broadcast as schema deltas; Colyseus batches these at its patch rate (default
  20 Hz, tunable down to 10 Hz for bandwidth).
- Player input is sent as messages (`move`, `interact`, `minigame`) and applied on the next
  tick. Mini-game timing is judged **server-side against the server clock** — the client
  shows the gauge, the server decides whether you were in the band. Clients send the
  timestamp of their input; the server tolerates ± one RTT/2.

## Station state machine

```
        ┌──────────┐  workers > 0 && inputs ready
        │   IDLE   │ ──────────────────────────────▶ WORKING(progress 0→1)
        └──────────┘                                       │
             ▲   ▲  workers == 0                            │ progress == 1
             │   └──────────────────────────────────────────┤
             │                                              ▼
   STARVED ◀─┘  workers > 0 && inputs missing        emit product ──▶ shelf | floor | JAM
   (bubble: "NEED PARTS")                                            │
                                                                     ▼
                                              JAMMED ── unjam held 4 s ──▶ IDLE
```

## Cycle

Every station is **player-paced** — the mini-game completes the cycle (a rhythm game with a
dead gap between bars is dead). The staffing curve scales the *machine's re-arm floor*, and
above its peak also injects interrupts into the player's execution:

```ts
efficiency        = curve[clamp(workers, 0, maxKey)]           // 0 workers → 0
churnFactor       = station.churnSensitive ? lerp(1.0, 1.15, churnDepth) : 1.0
machineSeconds    = station.floorSeconds / efficiency * churnFactor
                    * (lastCycleWasPerfect ? 0.75 : 1.0)          // a Perfect re-arms faster
interruptSeconds  = 0.5 * bubblesThisCycle                        // "what can I do?" pauses
cycleSeconds      = max(executionSeconds + interruptSeconds, machineSeconds)
```

`executionSeconds` is what the player(s) actually took. Below the curve's peak the machine
term dominates (parts contention, one crimper); above it the interrupt term rises too, so
over-staffing slows the *people* visibly, not just a number. `nominalSeconds` in config is
the balancing expectation for the bottleneck estimator and the report; `floorSeconds` is
the hard minimum. Mini-game input sets **quality** and, via Heat / combo tempo-up, how far
under nominal a good player runs.

## Staffing curve

Keyed by worker count, values are efficiency multipliers. Missing keys interpolate; above the
max key, hold the max key's value.

| Station | 1 | 2 | 3 | 4 | 5 | 6 | 8 |
|---------|---|---|---|---|---|---|---|
| Boom Powder | 1.00 | 1.05 | 0.90 | 0.75 | 0.75 | 0.75 | 0.75 |
| Casing Prep | 1.00 | 1.00 | 1.05 | 0.90 | 0.90 | 0.90 | 0.90 |
| Assembly (1 jig) | 0.60 | 1.00 | 1.15 | 1.10 | 0.95 | 0.80 | 0.50 |
| Assembly (2 jigs) | 0.50 | 1.00 | 1.40 | 2.00 | 2.10 | 1.90 | 1.40 |
| QA | 1.00 | 1.10 | 0.90 | 0.90 | 0.90 | 0.90 | 0.90 |
| Packing | 0.60 | 1.00 | 1.10 | 0.90 | 0.90 | 0.90 | 0.90 |
| Dock | 1.00 | 1.60 | 1.90 | 1.80 | 1.50 | 1.20 | 1.00 |

Casing's presses are independent bars, so the second press *is* the gain and solo runs at
1.0 (a 0.7 solo would put a dead gap between tubes). Physical congestion (aisle blocking,
interrupt bubbles) is **derived from** the gap between
`workers` and the curve's peak — see [02](02-factory-floor.md#congestion-made-visible). The
curve is the truth; the bodies are the explanation.

## Buffers and the overflow ladder

```ts
onEmit(product):
  if (outputShelf.length < outputShelf.capacity) → shelf
  else if (floorRing.freeTiles > 0)               → floor tile (nearest free), product.onFloor = true
  else                                            → station.state = JAMMED
```

Input pulls come from the input shelf only. A station whose input shelf is empty while its
floor ring is full of the right parts is **STARVED**, visibly, while surrounded by parts.
That is a designed frustration — someone has to haul.

## Groove

Global scalar, 0–100, starts at 50. Integrated per tick:

```ts
dGroove/dt =
    +8.0 * onTimeShipRate        // orders shipped complete in the last 60 s / orders due
  − 4.0 * avgShelfFullness       // mean(shelf.length / shelf.capacity) over all shelves
  − 0.5 * floorItemCount
  − 1.0 * reworkShelfCount
  − 2.0 * starvedStationCount
  − 1.0 * jammedStationCount
  − 3.0 * litFuseCount           // see 16 — hazards
  − 2.0 * fizzles + 3.0 * niceSaves   // per event, see 17 — oops
```

Clamped 0–100. All six coefficients are level config. Effects:

| Groove | Label | Effects |
|--------|-------|---------|
| ≥ 85 | **ON FIRE** | Score ×1.5. Music layer 4. Conveyors sparkle. Every PERFECT chains a flourish to the next station. |
| ≥ 70 | **IN THE GROOVE** | Score ×1.25. Music layer 3. Workers whistle. |
| 30–70 | — | Baseline. |
| ≤ 30 | **THE CHURN** | Klaxon. Red wash. `churnDepth = (30 − groove) / 30`. Casing metronome jitter. Powder spill chance ×2. Standup event enabled. |
| ≤ 10 | **MELTDOWN** | Above, plus All Hands can fire. Music drops to a single sad tuba. |

**Clean Sweep:** if `floorItemCount == 0 && avgShelfFullness < 0.5 && reworkShelfCount == 0`
for 3 consecutive seconds, `groove = max(groove, 60)`. Fires a *DING* and a banner. Once per
90 s.

## Bottleneck estimate

For the end screen and the debug overlay:

```ts
pressure(station) = utilization(station) * inputShelfFullness(station)
bottleneck        = argmax(pressure)
```

Where `utilization` = fraction of ticks in WORKING over the window. Simple, explainable, wrong
in interesting ways (a starved station reads as 0 pressure, which is correct: it isn't the
constraint, its supplier is).

## Accounting

- **Order started** — the tick its first product is created.
- **Order completed** — the tick the truck leaves with it complete. The **order book** is
  the day's goal; the shift clock is its limit ([18](18-days-grades-and-payday.md)).
- **Cycle time** — completed − started.
- **WIP** — count of products not yet shipped and not destroyed. Sampled every second for the
  peak-WIP timeline.
- **Utilization** — per station, per player-second on a work tile in WORKING.
- **Per-player** — seconds at each station, items produced, items hauled, chores done,
  "what can I do?" bubbles emitted (this last one is for the end-screen joke).
