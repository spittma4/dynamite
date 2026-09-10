---
paths:
  - 'resources/js/game/render/**'
---

# Render

## Floor paint follows joinMode, not geometry
`helperPostsOf(cfg)` is pure geometry, so it yields ring tiles beside a `stand` station's work tiles too
— five at `dock-a`. Nothing can ever join one: `pressStationAtZone` skips a station whose `joinMode` is
not `press`, and `syncStandMembers` joins only role `work`. So `helperPosts`/`postsAreLive` gate on
`joinMode === 'press'`; a bracket is a promise that `E` will be answered there, and a permanent mark that
promises nothing is the "words and signs just there" the owner reported (N3/N4). Any new floor mark that
advertises a press needs the same gate.
