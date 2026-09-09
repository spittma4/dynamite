# 13 — Config schema

One JSON document per level. Laravel validates it against `shared/config.schema.json` on
admin save; Node receives the merged (level + upgrades) blob on room create. Everything
tunable lives here. If you find yourself hard-coding a number in the sim, it belongs here.

## Level

```jsonc
{
  "key": "level-02-too-much-powder",
  "name": "Too Much Powder",
  "day": { "shiftSeconds": 600, "orderBook": 11, "endsOn": "either" },   // see 18 — grading, economy, payday blocks too
  "players": { "min": 3, "max": 10 },
  "scaling": { /* see 19 — breakpoints by player count; stations below are the one-line template */ },
  "layout": "mvp-small",                       // tilemap key in resources/js/game/maps/
  "groove": {
    "start": 50,
    "weights": { "onTimeShip": 8, "shelfFullness": -4, "floorItem": -0.5,
                 "rework": -1, "starved": -2, "jammed": -1 },
    "thresholds": { "onFire": 85, "groove": 70, "churn": 30, "meltdown": 10 },
    "cleanSweep": { "holdSeconds": 3, "snapTo": 60, "cooldownSeconds": 90 }
  },
  "clipboardSeconds": 3,
  "bpm": 150,                                  // the factory beat; Jig phrase, Casing bar, music layers
  "windowFloorsMs": { "ok": 100, "perfect": 45 },   // validator rejects any tighter window
  "carry": { "slowdown": 0.2, "throwTiles": 2, "throwFlightSeconds": 0.5, "catchOkMs": 150, "catchPerfectMs": 75,
             "drop": { "kegKnockOverOnHit": true, "stickFizzleChance": 0.3, "crateRattlyOnDrop": true },
             "truckRideSeconds": 20, "footprints": false },   // see 17 — oops
  "stations": [ /* see below */ ],
  "recipes": { /* see below */ },
  "orders": {
    "firstAt": 20, "everySeconds": 60, "truckWaitSeconds": 20,
    "mix": [ { "type": "red_stick", "weight": 10 } ],
    "tolerance": { "strict": 1, "normal": 6, "loose": 3 },   // per-line weights; gold_exec is always strict
    "hotfixDelaySeconds": 120,
    "qtyPerTruck": { "base": 8, "rampPerMinute": 0.5 },
    "ambiguousChance": 0
  },
  "events": { "globalCooldownSeconds": 45, "catalog": [] },
  "hazards": { /* see 16 — hazards and explosions */ },
  "upgradesAvailable": [],
  "scoring": { "perOrder": 100, "snugBonus": 10, "grooveMultiplier": { "groove": 1.25, "onFire": 1.5 } }
}
```

## Station

```jsonc
{
  "id": "assembly-1",
  "type": "assembly",                          // picks the mini-game component
  "anchor": [12, 8],                           // tile of the footprint's top-left
  "nominalSeconds": 6.0,                        // balancing expectation
  "floorSeconds": 5.0,                          // hard re-arm minimum at efficiency 1.0
  "staffing": { "1": 0.6, "2": 1.0, "3": 1.15, "4": 1.1, "5": 0.95, "6": 0.8, "8": 0.5 },
  "workTiles": [[13, 9], [14, 9]],
  "rackTiles": [[16, 9]],
  "inputShelf":  { "tile": [12, 9], "capacity": 8, "accepts": ["keg", "casing"] },
  "outputShelf": { "tile": [12, 11], "capacity": 4 },
  "floorRing":   { "tiles": [[11,7],[12,7],[13,7],[14,7],[15,7],[16,7],[11,12],[12,12],[13,12]] },
  "recipe": "red_stick",
  "churnSensitive": false,
  "minigame": {                                // per-type tuning the component reads
    "pour": { "beatsByQuality": { "1.0": 5, "0.7": 7, "0.4": 8 }, "perfectMs": 60, "okMs": 140, "primeKegWindowMultiplier": 1.5 },
    "knots": { "long": 3, "short": 2, "secondsPerKnot": 0.4, "perfectMs": 60, "okMs": 140 },
    "crimp": { "clicks": 3, "clickSeconds": 0.2, "perfectMs": 80, "okMs": 200 },
    "toss": { "arcSeconds": 0.5, "perfectMs": 120, "okMs": 250 }
  }
  // Slammer: { "heat": { "minChargeSeconds": 0.7, "maxChargeSeconds": 1.5, "okMsAtMaxCharge": 225, "okMsAtMinCharge": 105, "deadCenterMs": 50, "churnBandDrift": 0.08 }, "comboTiers": [10, 25, 50], "overflowSpills": true }
  // Casing:  { "bar": { "die": 0.4, "stamps": [0.8, 1.2], "crimp": 2.0, "pop": 2.2 }, "windowsMs": { "stamp": [130, 60], "crimp": [100, 45], "die": [130, 0] }, "tempoUp": { "5": 0.88, "10": 0.75 }, "duet": true }
  // QA:      { "zoom": 2, "conditionJitter": 0.04 }
  // Packing: { "wells": { "S": [2,2], "M": [3,4], "L": [3,6] }, "lidBounceApexes": [0.45, 0.30, 0.20], "lidPerfectMs": 100, "cram": true, "crateShapes": ["std"] }   // validated by shared/sim tileable()
  // Dock:    { "beepHz": 1, "perfectMs": 70, "okMs": 180, "rattlyOkMs": 120, "laneIsSlot": false, "tailgateWindowSeconds": 3 }
}
```

## Recipes

```jsonc
"recipes": {
  "keg":       { "station": "boom_powder", "inputs": {}, "output": { "type": "keg", "pours": 2 } },
  "casing":    { "station": "casing_prep", "inputs": {}, "output": { "type": "casing" } },
  "red_stick": { "station": "assembly",
                 "inputs": { "casing": 1, "pour": 1, "fuse": 1, "cap": 1 },
                 "output": { "type": "stick", "product": "red_stick" } },
  "mega_boom": { "station": "assembly", "cycleMultiplier": 1.6,
                 "inputs": { "casing": 1, "pour": 2, "fuse": 1, "cap": 1 },
                 "output": { "type": "stick", "product": "mega_boom", "crate": [2, 2] } }
}
```

## Events (M3)

```jsonc
"events": {
  "globalCooldownSeconds": 45,
  "catalog": [
    { "key": "rush_order", "weight": 3, "minLevel": 8, "cooldownSeconds": 180,
      "params": { "product": "gold_exec", "truckInSeconds": 90, "changeOfMindChance": 0.5, "changeOfMindAt": 45 } },
    { "key": "standup",    "weight": 2, "requires": { "grooveBelow": 30 }, "cooldownSeconds": 120,
      "params": { "seconds": 5 } }
  ]
}
```

## Upgrades (M4) — catalogue lives in `config/game/upgrades.json`

```jsonc
{ "key": "second_jig", "cost": 300, "name": "Second Jig",
  "patch": [ { "station": "assembly-1", "set": { "workTiles": [[13,9],[14,9],[13,10],[14,10]],
                                                 "staffing": { "1": 0.5, "2": 1.0, "3": 1.4, "4": 2.0, "5": 2.1, "6": 1.9, "8": 1.4 } } } ] }
```

An upgrade is a **JSON patch against the level config**. Laravel applies owned patches in
purchase order and hands Node the result. This is the whole upgrade system.

## Clipboard lines, joke text, event copy

`config/game/copy.json`. Not gameplay, but it's the personality, and it should be editable
without a deploy.
