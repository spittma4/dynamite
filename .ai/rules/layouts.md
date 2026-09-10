---
paths:
  - 'config/game/layouts/**'
---

# Layouts

## Every station with a floor ring needs a beacon pole
`tickBeacons` (game-server/src/sim/hazards.ts) reddens every station that has a non-empty
`floorRing`, but the client hangs the whole danger channel off `layout.beaconPoles`:
`DangerBeaconView.update` and `render/Floor.setBeacons` both draw nothing when the layout names
no pole for that station — no lamp, no hazard stripes round the pile, no alarm.

`validateLevelOnLayout` now errors on a ring with no pole. When you add a station or a ring,
add a pole, and put it on a wall tile inside the station's own footprint that is not directly
above a shelf tile — that tile is where the hopper is drawn.
