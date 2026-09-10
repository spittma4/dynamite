---
paths:
  - 'config/game/levels/**'
---

# Levels

## A shelf tile must have machine wall directly above it
The hopper drawn on a shelf tile (resources/js/game/render/hopper.ts) is 56 px tall: it
occupies the shelf tile's top 24 px plus the whole tile above it. That is only safe because
the tile above every shelf is machine wall.

`validateLevelOnLayout` enforces it — a shelf with walkable floor above it is an error, beside
the existing "a shelf needs an orthogonal non-wall neighbour to work from" check. ADR 0015's
four flow rules constrain a shelf's x and say nothing about its y, so this is the rule that
keeps the drawing's one precondition true.
