# ADR 0012 — A full shelf puts the product in your hands (supersedes 0005)

**Status:** accepted · 2026-09-04 · chosen by Sam via plan review (option C of three)

## Decision
Every station outputs to the **operator's hands**. If the output shelf has room the product
**auto-shelves on the same tick** — no input, no delay; the happy path is unchanged. If the
shelf is full, **you are holding it** and the station will not take input until your hands
are free. Continuing means putting it on the floor yourself (`E` on a floor tile, 0.3 s),
throwing it (`Space`), or walking it downstream. Combos persist while you hold; they reset
only on miss, `Esc`, or stepping off the work tile.

The overflow ladder is now **Shelf → Hands → Floor (placed by you) → Boom**. A machine no
longer jams from a full floor ring; **Jam** becomes an oops consequence — an item thrown or
knocked into a work tile jams that machine (Unjam, 4 s, *WAITING FOR VENDOR SUPPORT*).

## Why
Sam flagged ADR 0005 (auto-spill) for a rethink. Three options were put to him: spill,
block, or output-to-hands. Spill has the *machine* do the spilling, which reads as the game
being mean and accumulates fuel without an explicit act. Block has the *game* tell you to
stop, and the trap mostly disappears. Output-to-hands makes the pile a series of deliberate
drops — player-caused like every other consequence (ADR 0008's rule) — and the moment of
standing there holding a keg with the combo ticking is the natural "should I stop?" beat.
It also plugs straight into throw/catch (docs/17): a bucket brigade from the hands.

## Rejected
- **A · Spill** (ADR 0005). Retained as the fallback if hands-full proves fiddly in M1.
- **B · Block** (the handoff's default). Teaches nothing; kills "stop making powder".

## Consequences
One extra 0.3 s press per rep, only when the shelf is full — which is the point. A `hands`
state on every station's output; QA is the exception in feel (the stick is under the lamp,
not in hands) but not in rule. Jam trigger moves from "ring full" to "item on a work tile".
