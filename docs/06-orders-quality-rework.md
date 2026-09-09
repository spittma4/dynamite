# 06 — Orders, quality, rework

## Products

| Type | Casing | Pours | Crate shape | Notes |
|------|--------|-------|-------------|-------|
| **Red Stick** | red | 1 | 1 × 2 | The default. |
| **Blue Stick** | blue | 1 | 1 × 2 | Casing Prep must switch colour. |
| **Gold Executive** | gold | 1 | 1 × 2 | Only from Rush Order events. Score ×3. Abandoned when the customer "changes their mind". |
| **Mega Boom** | red | 2 | 2 × 2 | Two pours; Assembly cycle ×1.6. Packing puzzle gets hard. |

## Attributes

Every product carries the attributes the mini-games gave it:

```ts
type Product = {
  id: string; orderId?: string; type: ProductType;
  casingColour: 'red'|'blue'|'gold'; dents: 0|1|2|3;
  fuseLength: 'short'|'long'; fuseFrayed: boolean;
  fill: number;            // 0.6 weak · 1.0 · 1.2 overfill
  capLoose: boolean;
  powderQuality: number;   // 0.4 dud · 0.7 damp · 1.0 prime
  inspected: 'none'|'pass'|'fail'; defects: Defect[];
  onFloor: boolean; stationId?: string; tile?: [number, number];
  createdAt: number; shippedAt?: number;
}
```

## Defect sources

Defects are *made*, not rolled. Every defect traces back to a specific miss at a specific
station, so the end screen can say where the quality debt came from.

| Defect | Source | QA visible? | If shipped |
|--------|--------|-------------|------------|
| `dents ≥ 2` | Casing Prep missed beats | Yes (condition) | Hotfix |
| `dents == 1` | Casing Prep one miss | Only if QA is picky | Ships fine 80% / Hotfix 20% |
| `weak` / `overfill` | Assembly POUR | Yes (condition) | Hotfix |
| `frayed` | Assembly THREAD off-path ×3 | Yes (condition) | Hotfix |
| `capLoose` | Assembly CRIMP miss | Yes (cap) | Hotfix |
| `spec` (wrong colour / fuse) | Anyone picked wrong for the order | Yes (card) | Customer complaint: order counts 0, crate to Returns |
| `damp` / `dud` powder | Slammer late/early | **No** — invisible to QA, but the keg is grey or steaming on the shelf | Weak bang on the customer end: −score, Groove −5, no Hotfix |
| `crushed` | Packing crammed a 7th stick | n/a (post-QA) | Hotfix p 0.5 |
| crooked crate (`?` lid) | Packing shipped wrong contents | n/a | Counts 0; Returns in 120 s: *"CUSTOMER GOT BLUE. WANTED RED."* |

The powder row is important: **QA never sees powder quality, but everyone else does.** A
damp keg steams and a dud sits grey on the shelf, and both pour slow at the Jig (7 and 8
beats against a prime keg's 5), so the Powder player's misses land on the bottleneck within
seconds — and on the customer at the end.

## Orders

```ts
type Order = {
  id: string; lines: { type: ProductType; qty: number; fuseLength?: 'short'|'long';
                       tolerance: 'strict'|'normal'|'loose' }[];   // QA reads this per rep
  priority: 'normal'|'rush'; dueAt: number; truckIds: string[];
  status: 'open'|'started'|'partial'|'complete'|'failed';
  ambiguous?: boolean;      // M3
}
```

The **order generator** is level config: a rate, a mix, and an optional ramp. M1 uses one
line type (`Red Stick × N`) with N sized to ~80% of theoretical Assembly throughput per truck.

Orders live on the **Order Board** (a wall object near the dock; also a `Tab` overlay so you
don't have to walk). Each open order shows its lines and a fuse for time-to-truck.

## QA and rework flow

```
Assembly ──▶ QA input shelf ──▶ [The Look] ──┬──▶ PASS ──▶ Packing input shelf
                                             └──▶ FAIL ──▶ Rework shelf ──▶ [Rework Bench] ──▶ casing + ½ pour → Assembly input
```

Rework **destroys the stick** and returns raw parts. It costs Assembly's input shelf space,
Rework Bench time, and the original cycle. Bad upstream quality therefore reduces throughput
three times over. Nothing tells the player this; they see the rework shelf fill.

**If the bench finds no defect** — QA failed a good stick — it does not disassemble it. The
stick rolls back onto QA's shelf tagged *WAS FINE* and must be re-stamped. The reworker still
burned the time; the QA player sees their own mistake with no popup.

## Hotfix returns (M2)

A shipped product with a QA-visible defect returns **120 s later** (config; was 240 — long
enough to be someone else's problem, short enough that a stick passed at 7:30 still comes
back). Any Hotfix that would land after the round ends fires *during the report* instead —
the fire marshal column gains *"N returned after close"* and each zeroes its order's credit. A hatch by the
dock opens, the product rolls out, goes *POOF* into a soot cloud and a 2-tile spill, and a
Rework item appears on the Returns pile with a note: *"CUSTOMER SAYS IT WENT 'PFFT'."*

The consequence lands on whoever's near the dock, four minutes after QA blinked. That's the
delayed, misattributed pain we want.

## Ambiguous orders and the Phone (M3)

Some orders are just `MAKE BIG BOMB`. Options:

| Choice | Cost | Result |
|--------|------|--------|
| **Guess** | 0 | The order resolves to a hidden real spec. 50% you guessed right. Wrong → `spec` defect on every stick → Returns. |
| **Clarify** | Walk to the Phone tile, hold `E` 5 s | The card updates with the real spec. A speech bubble: *"oh, we meant the blue one."* |
| **Return to planning** | `Q` on the card | Order goes back to backlog; a new one arrives in 20 s. No penalty, no score. |

Guessing is faster. Clarifying is correct. Returning is honest. All three are valid; the
level design makes each one the right call sometimes.
