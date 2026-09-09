# 16 — Hazards and explosions

The overflow ladder ([02](02-factory-floor.md#physical-wip-and-the-overflow-ladder)) has a fourth
rung. Shelf → Hands → Floor → **BOOM**.

**The factory exploding is the only way to lose.** Everything else is a bad report. And it is
never random: the pile is fuel *you* made, the spark is a careless act *you* did, and the
fuse gives you six seconds to do something about it.

## The three ingredients

### Fuel

| Thing | Fuel | Notes |
|-------|------|-------|
| Keg on the floor | 1 | The product of overproduction. |
| Spill tile | 1 | Spreads a blast along the floor. Sweeping is fire prevention. |
| Keg on a shelf | 1 | Ignites only from a **blast** on an adjacent tile, never from a spark directly. A tidy shelf is safe unless the floor around it goes. |
| Casings, sticks, crates | 0 | Sticks are sealed. (Cartoon logic; also keeps the fuel map readable — only powder is scary.) |

### Sparks

Discrete events with a config probability. All of them are carelessness.

| Spark source | p | Where |
|--------------|---|-------|
| Slammer released **in the red** (late) | 1.0 | Powder floor ring |
| A machine jammed (an item thrown/knocked onto its work tile) for every 10 s | 0.5 | Its floor ring |
| Hotfix return goes POOF | 1.0 | Dock, radius 1 |
| CRIMP miss on a dented casing | 0.3 | Assembly floor ring |
| Running into someone while carrying a keg | — | No spark, but the keg falls → spill tile (fuel) |
| A 4th press during the Slammer's mash | — | No spark; the hopper overflows → spill tile at your feet (fuel) |
| A dropped or thrown stick that **fizzles** on a fuel tile | 1.0 | Where it landed ([17](17-oops-carry-and-throw.md)) |

The Slammer row is the one that matters. Going fast *and sloppy* on the most fun station
produces fuel **and** the spark. Going fast and clean produces only fuel, waiting for a jam
or a Hotfix to find it.

### Fuse

A spark on a tile with fuel lights a **fuse**: 6 s (config), a hissing sparkler everyone can
see and hear. Any player can **stomp** it: stand on the tile, hold `Space` 1 s. Flat *ffft*.
No score. (Tier D.)

## The blast

When a fuse expires the keg goes off. **Blast radius 1** (the 8 surrounding tiles):

- Every fuel item in the radius lights a **chain fuse** (1.5 s). Chains propagate.
- Kegs in the radius are destroyed. Spill tiles become **scorch tiles** (cosmetic, 40% slow
  until swept).
- Players in the radius are knocked back 2 tiles, **stunned 2 s**, and **sooted** for the
  rest of the round — the sprite stays black-faced. A badge of shame visible to everyone.
- Groove −10 per keg.

Kegs that go off within a 3 s window count as one **chain**. The chain's size decides what
happened:

| Kegs in chain | Name | Consequence |
|---------------|------|-------------|
| 1–3 | **Whoops** | Soot, scorch, Groove hit. Everyone laughs. |
| 4–9 | **Incident** | Above, plus the nearest station is **DAMAGED**: offline, shelves emptied, until someone holds `E` on it for 10 s. Progress bar reads *FILING INCIDENT REPORT*. |
| ≥ 10 | **THE FACTORY EXPLODES** | Round ends immediately. Screen goes white. Everyone is flung into the parking lot, sooted, and the report is delivered by a fire marshal. Verdict: **EXPLODED**. Round budget: 0. Level must be replayed. |

The chain threshold is per pile; a two-line factory has two Powder piles and two chances. Do the arithmetic on the MVP map: Powder's floor ring is 9 tiles, its shelf is 6. A full
floor ring next to a full shelf is 15 kegs. **One redlined release = the factory is gone.**
The warning is the pile itself; nobody can say they didn't see it.

### Setback mode

`hazards.explosionEndsRound: false` (Level 1 and Sandbox): instead of ending the round, every
station is DAMAGED, all shelves are emptied, and the round continues after repairs. Same
spectacle, no loss. From Level 2 on it's a hard loss — by then players know what the pile means.

## Fairness: three warnings before the boom

1. **The pile.** It's on the floor. Everyone can see it.
2. **DANGER light.** When floor fuel within any station's ring reaches 50% of the explosion
   threshold, a hazard beacon over that station starts flashing, the HUD shows a fuse icon,
   and the music gains a tick-tock. Hazard stripes appear on the floor around the pile.
3. **The fuse.** Six seconds of hiss.

If all three are ignored, the explosion is deserved.

## Defenses

| Defense | How | Tier |
|---------|-----|------|
| **Don't have a pile** | Stop making powder. Haul kegs to shelves. | The real answer |
| **Stomp** | Stand on the fuse, hold `Space` 1 s | D — base |
| **Hot potato → Blast Bin** | Pick the lit keg up (`E`), throw it (`Space`) into the sand-filled bin by Powder. Contained *WHUMP*, no chain, +3 Groove, NICE SAVE. Miss the bin and it goes off where it lands. Goes off in your hands: sooted, stunned, radius 1 around you. See [17](17-oops-carry-and-throw.md). | The hero move |
| **Sweep** | Removes spill fuel and scorch | D — base |
| **Sand Bucket** (M2) | Hangs on the wall by Powder. Pick up, throw (`Space`, 2-tile range). Extinguishes every fuse in radius 1 and makes those tiles inert for 20 s. Refill at the tap, 5 s. The Overcooked extinguisher. | D — base from M2 |
| **Blast Shield** (upgrade) | Walls around Powder; blasts don't propagate out of its ring. *Hidden cost:* nobody can see the pile any more. | Upgrade |
| **Second Bucket** (upgrade) | One by the dock for Hotfixes. | Upgrade |

## Groove

Add to the integrator: `− 3.0 × litFuseCount`. A hissing fuse should feel like the meter
draining, because it is.

## Config

```jsonc
"hazards": {
  "fuseSeconds": 6, "chainFuseSeconds": 1.5, "blastRadius": 1, "chainWindowSeconds": 3,
  "sparks": { "slammerRedline": 1.0, "jammedPer10s": 0.5, "hotfix": 1.0, "crimpOnDented": 0.3 },
  "fuel":   { "floorKeg": 1, "spillTile": 1, "shelfKeg": 1 },
  "incidentThreshold": 4, "factoryExplosionThreshold": 10,
  "explosionEndsRound": true, "dangerWarningAt": 0.5,
  "stompSeconds": 1.0, "stunSeconds": 2, "knockbackTiles": 2,
  "repairSeconds": 10,
  "sandBucket": { "enabled": false, "radius": 1, "inertSeconds": 20, "refillSeconds": 5 },
  "blastBins": [[3, 3]], "litKegCarry": true, "niceSaveGroove": 3
}
```

## Metrics

Report gains: **Kegs exploded**, **Fuses stomped**, **Sooted**, and the `EXPLODED` verdict.
The individual column is unchanged. The Powder player is still EXCELLENT ★. The fire
marshal is holding the certificate.

## Roadmap placement

- **M1:** fuel, Slammer-redline and jam sparks, fuse, stomp, chain, Whoops, factory explosion
  (hard loss + setback flag). This is the trap's teeth; without it the pile is toothless.
- **M2:** Sand Bucket, Incident + station damage, Hotfix spark, scorch tiles, DANGER beacon
  polish, sooted sprites.
- **M4:** Blast Shield, Second Bucket upgrades.
