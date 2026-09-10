---
paths:
  - 'resources/js/game/minigames/**'
---

# Minigames

## An item's colour comes from GLYPH_COLOURS, never a literal in a panel
A mini-game panel draws the same materials the floor and the hoppers draw, so its item colours are imported from `render/stationGlyphs.GLYPH_COLOURS` — not re-typed. `JIG_COLOURS.casing` was 0xd62828, which is `LINE_COLOURS.a` and 1.17:1 against `JIG_COLOURS.miss` (1.14:1 to a deuteranope), so the material a player was about to pick was painted the colour of failure and nobody could tell the chips apart from the judged mark (playtest N1).

Check a new panel colour against the failure colours (`miss`, `overfill`, `UI.beaconRed`) by luminance, not by name — `Jig.test.ts` has `contrastOf` and a guard for exactly this. Hue alone is not a channel this game has.
