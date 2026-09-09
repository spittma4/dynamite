# 08 — Upgrades (M4)

Bought at **Payday** with **coin** (profit × grade multiplier — see [18](18-days-grades-and-payday.md)),
**one per day, by vote**. Persist on the factory. Every upgrade *changes the system* — none
is a flat speed boost. From Level 4 one upgrade wears a **RECOMMENDED BY MANAGEMENT** ribbon;
it is always from the trap list below (Bigger Shelf, Longer Truck Wait, Conveyor).

| Upgrade | Cost | What it changes | Hidden cost / joke |
|---------|------|-----------------|--------------------|
| **Second Jig** | 300 | Assembly gets a second 2-tile jig. Curve swaps to the 2-jig table; optimal 2 → 4. | QA is now the bottleneck. It was always going to be. |
| **Parts Rack** | 120 | Rack tile becomes 2; FETCH step 2.5 s → 1.2 s. | None. This one's just good. It should exist so players learn some upgrades are just good. |
| **Second Press** | 150 | Casing Prep gets a third press (work tiles 3). | More casings you didn't need. |
| **Cross Training** | 200 | Clipboard 3 s → 1.5 s. | People switch stations *more*, which is sometimes worse. |
| **Auto-Check** | 250 | QA pre-flags colour/fuse/cap. Cycle 4 s → 2.5 s. | Packing is now the bottleneck. |
| **Bigger Shelf** | 80 | Powder output shelf 6 → 12. | **The trap upgrade.** Hides the overproduction for 18 more seconds. Then the floor. |
| **Conveyor** | 350 | Powder output → Assembly input automatically, 1 keg / 4 s. | Assembly's input shelf fills *without anyone walking*, so overproduction is now invisible until the shelf is full and the conveyor backs up with kegs on it. |
| **Hand Truck** | 100 | Carry 3 items. | Hauling is 3× as effective. Hauling is still a chore. |
| **Staging Area** | 180 | A 6-crate shelf beside the dock. | None. Rewards the team that stages before the horn. |
| **Longer Truck Wait** | 150 | Truck waits 20 s → 40 s. | Feels like relief. Actually hides how slow Packing is. |
| **Second Lamp** | 200 | QA work tiles 1 → 2. | Fine, if you have the people. |
| **Third Bench** | 200 | Packing work tiles 2 → 3. | Fine, if you have the people. |
| **Blast Shield** | 250 | Walls around Powder; blasts don't leave its ring. | Nobody can see the pile any more. |
| **Second Bucket** | 100 | A sand bucket by the dock for Hotfixes. | None. |

The catalogue lives in config. The point of listing "hidden cost" here is so the *level
designer* remembers each upgrade should move the bottleneck, not remove it.
