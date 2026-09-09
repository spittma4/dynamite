# ADR 0004 — Top-down orthogonal, not isometric (for now)

**Status:** accepted · 2026-09-04

## Decision
Orthogonal 32 px tiles. The sim stores tile coordinates; projection is the renderer's job.

## Why
The game's core information is *who is standing where and what is piled where*. Orthogonal
reads that unambiguously. Isometric doubles sprite work (facing directions), complicates
depth sorting and click targets, and buys atmosphere we can't afford before M1 proves the loop.

## Rejected
- **Isometric now.** Revisit after M2 if the floor reads badly. It's a renderer swap.
