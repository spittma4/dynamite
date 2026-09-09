# 07 — Chaos events (M3)

Random, config-weighted, level-gated. None in M1. Every event follows three rules:

1. **Short.** The longest lockout is 8 seconds.
2. **Physical.** It changes something on the floor, not just a number.
3. **Funny once, tolerable a hundred times.** If a playtester groans at an event, its weight
   drops or it dies.

| Event | Trigger | What happens on the floor | Duration | Joke line |
|-------|---------|---------------------------|----------|-----------|
| **Rush Order** | Random, weight 3 | A gold order card slams onto the board at top priority with its own truck in 90 s. Casing Prep needs GOLD. | Until truck | *"CEO NEEDS GOLD DYNAMITE FOR A DEMO"* |
| **Change of Mind** | 50% chance, 45 s into a Rush Order | The gold order vanishes. Every gold product on the floor becomes worthless WIP (Returns). | Instant | *"CUSTOMER CHANGED THEIR MIND. THANKS ANYWAY."* |
| **Standup** | Groove ≤ 30, weight 2 | Everyone freezes. Speech bubbles: "no blockers", "same as yesterday", "I'll take that offline". | 5 s | *"QUICK SYNC"* |
| **Executive Tour** | Weight 2 | A suit walks a path through the factory. For 20 s, floor clutter counts ×3 against Groove. Clutter on the suit's path gets a photo flash and −score. | 20 s | *"JUST PRETEND I'M NOT HERE"* |
| **New Process** | Weight 1, ≥ Level 6 | All crates now need a blue sticker. Packing gains a step (`Q` to sticker). Crates already closed without one → Returns. | Rest of round | *"EFFECTIVE IMMEDIATELY"* |
| **Printer Offline** | Weight 2 | Order cards lose their spec text for 30 s. QA has to guess. | 30 s | *"HAVE YOU TRIED TURNING IT OFF AND ON"* |
| **Vendor Update** | Weight 1 | One random station's `Q`/`E` (at QA: `Space`/`E`) are swapped for 60 s. The overlay shows a "What's New" toast you can't dismiss for 3 s. | 60 s | *"WE'VE IMPROVED YOUR EXPERIENCE"* |
| **Hotfix** | Deterministic, 120 s after a defect ships | Product returns via the dock hatch, *POOF*, spill, Rework item on Returns. | Instant | *"CUSTOMER SAYS IT WENT 'PFFT'"* |
| **All Hands** | Groove ≤ 10, weight 1 | Everyone walks to the break room tile. Mini-games in progress are forfeited. | 8 s | *"EXCITING NEWS ABOUT OUR VALUES"* |

Event weights, cooldowns, and level gates are config. A **global cooldown** (default 45 s)
stops events stacking. Standup and All Hands share a 120 s cooldown so nobody gets two
meetings in a row — that would be *too* realistic.
