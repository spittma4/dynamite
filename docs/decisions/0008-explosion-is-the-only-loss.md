# ADR 0008 — The factory explosion is the only lose condition, and it is never random

**Status:** accepted · 2026-09-04

## Decision
Floor kegs and spill tiles are fuel. Careless acts (redlining the Slammer, leaving a machine
jammed, a Hotfix return) are sparks. A spark on fuel lights a 6 s fuse anyone can stomp. A
blast chains to adjacent fuel. A chain of ≥ 10 kegs ends the round as EXPLODED. A level flag
downgrades this to a setback (all stations damaged) for Level 1 and Sandbox.

## Why
Sam: *"the factory exploding should totally be something that can happen. that's how you lose."*
Without it the powder pile is ugly and slow but toothless. With it the pile is a bomb the
players built, and the spark is an act they did — so the blame lands on each other, not the
game. It also gives the spill-not-block ladder ([ADR 0005](0005-spill-not-block.md)) a final rung
and gives Tier D chores (stomp, sweep, haul) a reason beyond tidiness.

## Rejected
- **Random explosion event.** Players blame the game. Violates "mechanics over messages" —
  a random loss teaches nothing about the pile.
- **No hard loss at all** (the previous design). Rounds had no stakes; the report was the
  only consequence and reports don't make people run.
- **Explosion damages the factory permanently across rounds.** Too punishing for a private
  fun game; a lost round and zero budget is enough.

## Consequences
M1 grows by one system (fuel map, sparks, fuses, chain, round-end). Worth it: it is the trap's
teeth and the playtest gate is about whether the trap is fun. Three warnings (pile, DANGER
beacon, fuse) are mandatory so the loss always feels deserved.
