# 02 — Factory floor

## Space

- **Top-down orthogonal tile grid**, 32 px tiles. (Isometric is a renderer-only swap later —
  the sim stores tile coordinates, not screen coordinates. See [ADR 0004](decisions/0004-top-down-not-isometric.md).)
- MVP map: 28 × 18 tiles. Full one-line factory: ~40 × 24. The two-line layout
  ([19](19-scaling-3-to-10.md)) stacks the lines vertically and widens the shared downstream.
- Walls, floor, station footprints, shelves, and a break-room tile are all tilemap layers.

## Movement

- WASD / arrows, 8-direction, ~4 tiles/sec. Server-authoritative; the client predicts its
  own avatar and interpolates everyone else.
- Players are **soft-collide circles**: they push each other rather than hard-block. The
  "excuse me!" bump costs 0.3 s of stagger. Configurable; hard collision is a one-line change
  if playtests want more chaos.
- **Carrying** one item slows you by 20%. Hand Truck upgrade: carry 3. **`Space` while
  carrying throws** it 2 tiles; a facing teammate can catch with `E`. Uncaught, bumped, or
  fumbled items follow the drop table in [17](17-oops-carry-and-throw.md) — kegs knock
  over, sticks can fizzle, crates go RATTLY.
- `E` interacts: pick up / put down / join station / use lever. `Esc` leaves a station.

## Station anatomy

Every station is a footprint with named tiles:

```
   . . . . . . . .
   . I . W W . R .      I = input shelf (pull from here)
   . . [MACHINE] . .    W = work tiles (stand here to operate; count = max useful workers)
   . O . W W . T .      O = output shelf (products land here)
   . . . . . . . .      R = parts rack   T = tool cart
   f f f f f f f f      f = floor ring (overflow lands here)
```

- **Work tiles** are the physical cap on useful staffing. If all are occupied, you *cannot*
  join. You stand in the aisle.
- **Shelves** are finite. Sizes are per-station config.
- **Floor ring** is where overflow goes. Floor items slow movement on that tile to 40% and are
  visually ugly. That is the point.

## Physical WIP and the overflow ladder

Products are entities with a tile position, an owner shelf (or none), and attributes.
Overflow escalates in three steps, each uglier than the last:

1. **Shelf** — tidy, capped. Output auto-shelves on the same tick; no input.
2. **Hands** — shelf full? The product lands **in your hands** and the station won't take
   input until they're free ([ADR 0012](decisions/0012-output-to-hands.md)). Your combo is
   still ticking. You can `E` it onto a floor tile (0.3 s), `Space` to throw it, or walk it
   downstream. Nothing tells you which.
3. **Floor** — where *you* put it. Floor items slow that tile to 40%. Kegs on the floor can be
   knocked over by a running player → **spill tile** (60% slow for everyone until swept).
4. **Boom** — floor kegs and spills are fuel. A spark (a redlined Slammer, a machine left
   jammed, a Hotfix) lights a fuse. Six seconds later it goes off and chains through the
   pile. Ten kegs in one chain and **the factory explodes**. See [16](16-hazards-and-explosions.md).

**Jam** is no longer a rung — it's an oops: an item thrown or knocked onto a machine's work
tile jams it until someone holds the lever 4 s ([Unjam](04-minigames.md#unjam)).

Downstream stations pull **only from their input shelf**. Floor items must be hauled by hand
(or thrown to a catcher at the shelf). Overproduction therefore creates hauling — a Tier D
chore — for someone, and the pile is made of things someone chose to put down.

## Congestion, made visible

The staffing efficiency curve ([05](05-flow-mechanics.md#staffing-curve)) is the
*authoritative* throughput calculation — it's simple and tunable, which matters more in M1
than realism. The physical layer exists to make the curve **look like a cause, not a debuff**:

| Workers vs. optimal | What you see |
|---------------------|--------------|
| Below optimal | Work tiles empty. Station shows "NEED HANDS" bubble when starved of labour. |
| At optimal | Everyone on a work tile, tool cart never contended, smooth animation. |
| 1–2 over | Extra people on the rack/cart tiles. Tool-cart contention: "waiting for crimper…" spinner. Small gain or none. |
| 3+ over | Extras stand in the aisle. Carriers can't reach the input shelf → station starves of *parts* while surrounded by *people*. Every ~6 s an extra emits **"what can I do?"** and the active mini-game pauses for 0.5 s. |

The interrupt bubble is Brooks's Law as a literal mechanic. Ten people helping means the two
people working get asked "what can I do?" every 0.6 seconds.

## Context switching: the Clipboard

Joining a station you haven't worked in the last 60 s costs **3 seconds** reading a clipboard.
The clipboard text is a joke delivery vehicle, rotated from config:

- "Onboarding… locating the good stapler…"
- "Reading the wiki page. The wiki page is wrong."
- "Asking Dave. Dave is at lunch."
- "Waiting for VPN."

Cross Training upgrade halves it. Never longer than 3 s — helping must stay worthwhile.

## Layouts

### MVP (M1)

```
┌──────────────────────────────────────────────┐
│  [BOOM POWDER]                    [DOCK]     │
│   shelf: 6                    truck ⟵ ramp   │
│      │                            ▲          │
│      ▼                            │          │
│   ┌──────────[ASSEMBLY]───────────┘          │
│   │  in-shelf: 8   jig ×1   out-shelf: 4     │
│   └──────────────────────────────────────    │
│                     [break room]             │
└──────────────────────────────────────────────┘
```

Deliberately small. Powder is 6 tiles from Assembly. The dock is far enough that the truck
horn causes a *run*.

### Full factory (M2+)

```
┌─────────────────────────────────────────────────────────┐
│ [BOOM POWDER]        [CASING PREP]           [PHONE]    │
│       │                    │                            │
│       └─────────┬──────────┘                            │
│                 ▼                                       │
│          [ASSEMBLY ×1→2]  ⟵ [REWORK BENCH]              │
│                 │                 ▲                     │
│                 ▼                 │ (reject)            │
│               [QA] ───────────────┘                     │
│                 │                                       │
│                 ▼                                       │
│            [PACKING] ──▶ [DOCK] ──▶ truck               │
│                            ▲                            │
│      [break room]      [RETURNS pile] (Hotfixes land)   │
└─────────────────────────────────────────────────────────┘
```

Layouts are per-level config. Stations reference a layout key; the tilemap is data. The
scaling block picks `one-line` / `two-line` from the player count.
