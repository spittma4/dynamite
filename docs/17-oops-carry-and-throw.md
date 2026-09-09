# 17 — Oops: carry, throw, drop

Sam: *"there should be some way of dropping dynamite or something. Needs to be some funny
'oops' opportunities."*

**Rule:** every oops is **player-caused, physical, visible to everyone, and lands on
someone** — often someone else. There are no random fumbles, ever (same rule as the
explosion, [ADR 0008](decisions/0008-explosion-is-the-only-loss.md)). Fumbles come from
*going fast*: throwing instead of walking, running while carrying, bailing mid-pour, standing
on the truck when it leaves.

## Carry

- `E` picks up / puts down on a shelf or the floor. One item (Hand Truck upgrade: 3). Carrying
  slows you 20%. Station output lands in the operator's hands and auto-shelves if there's
  room ([ADR 0012](decisions/0012-output-to-hands.md)) — so a full shelf means you're carrying.
- **Bump while carrying** — run into another player and the item **drops** (see the drop
  table). "Excuse me!" becomes "oops."

## Throw — `Space` while carrying

Throws the item **2 tiles** in your facing direction in a ~0.5 s arc.

**Why you'd do it:** it's faster than walking and it feels great. A bucket brigade of kegs
Powder → Assembly is the fast, fun, *risky* haul; walking is safe and boring. Doctrine: the
fun way has consequences.

| Outcome | Rule |
|---------|------|
| **Catch** | Receiver faces the thrower and taps `E` as it arrives. ±150 ms OK; **±75 ms Perfect** → *snap* and a tiny flourish. A chain of Perfect catches is the closest thing hauling has to a groove. |
| Receiver's hands are full | It hits them. Drop table + **"WHO THREW THAT"** bubble + 0.5 s stagger. |
| Uncaught | Drop table. |
| Lands on someone's work tile | Their mini-game pauses 0.5 s. "WHO THREW THAT". If the tile is a machine's, it **jams** (Unjam, 4 s). |
| Aimed at a shelf | **Throws never land on shelves.** It lands on the floor tile in front. Someone still has to `E` it onto the shelf — the brigade needs a catcher at the shelf, so throwing is coop, not a solo shortcut. |

## The drop table

Applies to bumps, uncaught throws, full-handed catches, and butterfingers.

| Item | What happens | Consequence |
|------|--------------|-------------|
| **Keg** | Lands and rolls one tile in the throw direction. Hits a wall, station, or player → **knocked over**: spill tile, keg becomes damp (quality −0.3). | Fuel + a sweep. A damp keg pours slow at the Jig. |
| **Stick** | **30% fizzle** — *pop*, soot puff on the nearest player, stick destroyed, Groove −2. Otherwise it lands with +1 dent (clutter). **On a fuel tile the fizzle *is* a spark** (p 1.0). | This is "dropping dynamite." |
| **Crate** | Lands → RATTLY. Already RATTLY → **bursts**, sticks scatter with +1 dent each. | The dock's OK window narrows; or six hauls. |
| **Lit keg** | See *hot potato*. | |
| Broom, bucket | Clatters. Nothing. | Chores stay chores. |

## Hot potato — the hero move

A keg with a **lit fuse can be picked up** (`E`). The fuse keeps burning (6 s from
ignition; 1.5 s if chained).

- Throw it into a **Blast Bin** — a sand-filled bin tile, one by Powder and one by the dock
  (M1: Powder only) → contained *WHUMP*, no chain, Groove **+3**, a **NICE SAVE** banner over
  the thrower, and a one-off confetti burst. The only confetti outside Tier S: it's a hero
  moment, not a station.
- Throw it anywhere else → it goes off where it lands, radius 1, chains normally. Throwing
  it *toward* the pile is the worst possible move and someone will do it.
- It goes off **in your hands** → sooted, stunned 2 s, knocked back, keg destroyed, radius 1
  around *you*. So carrying it *away* from the pile before it blows is a valid, stupid,
  heroic play.
- Catching a thrown lit keg is allowed. *"I got it — oh no."*

## The truck ride

Standing on the truck bed when it pulls out → you're **driven off**. You reappear at the
break-room door **20 s** later, hair blown back, bubble: *"I SAW THE HIGHWAY."* Whatever you
were carrying went with the truck and counts for nothing. Only ever self-inflicted.

## Butterfingers

- `Esc` (or stepping off the tile) **mid-POUR** at the Jig: the keg tips off the jig → spill
  tile.
- **Mid-CRIMP**: the stick pops off the jig onto the floor → drop table.

Bailing has a mess. Small, but it makes "someone sprinted for the horn" visible on the jig.

## Powder footprints (M2, cosmetic)

Walk through a spill tile and you leave **3 tiles of powder footprints**. Cosmetic clutter —
the Executive Tour counts them, sweeping clears them — and they show everyone who walked
through the mess.

## Deliberately not doing

- **Random fumbles.** Never. A drop you didn't cause is the game's fault.
- **Broom whack** (swing the broom, knock the item out of someone's hands). Funny, griefable.
  Open question 17.

## Groove

`− 2` per fizzle · `+ 3` per NICE SAVE. Knocked-over kegs already cost via the spill tile.

## Config

```jsonc
"carry": {
  "slowdown": 0.2, "throwTiles": 2, "throwFlightSeconds": 0.5,
  "catchOkMs": 150, "catchPerfectMs": 75,
  "drop": { "kegKnockOverOnHit": true, "stickFizzleChance": 0.3, "crateRattlyOnDrop": true },
  "truckRideSeconds": 20, "footprints": false
},
"hazards": { /* … */ "blastBins": [[3, 3]], "litKegCarry": true, "niceSaveGroove": 3 }
```

## Metrics

Report gains **Fizzles**, **Nice Saves**, **Truck rides**, **"WHO THREW THAT" received**, and
a line: *Most dropped: Marco (7)*.

## Roadmap

- **M1:** carry, throw, catch, bump drop, keg + stick drop rules, hot potato, the Powder
  Blast Bin, truck ride, butterfingers. (Throw/catch is a few dozen lines on top of the item
  entity system M1 already needs; the Blast Bin makes the explosion system *fair* — a hero
  move exists.)
- **M2:** crate drops, the dock Blast Bin, footprints.
