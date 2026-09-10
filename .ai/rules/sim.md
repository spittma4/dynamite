---
paths:
  - shared/src/sim/stations.ts
---

# Sim

## floorRing is the fuel apron, not the join zone
`StationConfig.floorRing` does two jobs. F10 reads the whole list as the hazard apron — `ringFuel`, `pickRingSparkTile`, the DANGER beacon, `StationState.floorCount` — so it has to cover every tile a dropped keg could sit on (20 tiles round `assembly-a`, both aisles and the walk-through).

Only the tiles orthogonally touching a `workTiles` tile are join tiles: `helperPostsOf(cfg)`, which is what `joinZoneOf` and `roleForTile('helper')` read. Handing the whole ring to `E` turned a corridor into a seat (playtest N4). Never widen the join zone back to `floorRing.tiles`, and never shrink the ring to fix a join problem.
