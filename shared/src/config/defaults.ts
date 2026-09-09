import type {
    AssemblyMinigame,
    BoomPowderMinigame,
    DockMinigame,
    LevelConfig,
    StationConfig,
} from './types';

/**
 * Contracts §13: the default for every optional level key. `validateLevelConfig`
 * applies these before anyone reads the config, so no consumer ever branches on
 * an `undefined` tuning value.
 */
export const LEVEL_DEFAULTS = {
    movement: {
        tilesPerSecond: 4,
        playerRadius: 0.35,
        bumpStaggerSeconds: 0.3,
        floorItemSpeed: 0.4,
        spillSpeed: 0.6,
    },
    clipboardMemorySeconds: 60,
    /**
     * 250 ms is the tightest two marks may sit. It is twice `windowFloorsMs.ok`
     * with margin, so an OK window clamped up to 100 ms still cannot reach its
     * neighbour; and it clears the ~200 ms inter-onset boundary under which a
     * series stops reading as separate marks and starts reading as one texture,
     * which matters because counting marks is harder than syncing to them.
     * 400 ms is the least warning a mark may give: median simple visual reaction
     * time is ~250 ms with a tail past 300, so a player who reacts rather than
     * predicts must still get a tap in. It is also one beat at the campaign's
     * bpm 150 — the warning the knots already get (`jig.ts` `knotTimes`).
     */
    tempoFloorsMs: { markSpacing: 250, leadInMs: 400 },
    interrupts: { everySeconds: 6, pauseSeconds: 0.5 },
    carry: { putDownSeconds: 0.3, hitStaggerSeconds: 0.5 },
    hazards: { unjamSeconds: 4, sweepSecondsPerTile: 1.5, repairSeconds: 10, bannerSeconds: 3 },
    groove: { weights: { truckComplete: 10 } },
    scoring: { perOrder: 100 },
    grading: { advanceOn: 'C' },
    minigame: {
        boom_powder: { heat: { overholdMs: 500 }, comboBannerSeconds: 2 },
        assembly: { casings: { stock: 3, dentChance: 0.3 } },
        dock: { tailgateHoldSeconds: 0.5, leaveSeconds: 1.5 },
    },
} as const;

function fillMinigame(station: StationConfig): void {
    if (station.type === 'boom_powder') {
        const mg = station.minigame as BoomPowderMinigame;
        const d = LEVEL_DEFAULTS.minigame.boom_powder;

        mg.heat.overholdMs ??= d.heat.overholdMs;
        mg.comboBannerSeconds ??= d.comboBannerSeconds;

        return;
    }

    if (station.type === 'assembly') {
        const mg = station.minigame as AssemblyMinigame;

        mg.casings ??= { ...LEVEL_DEFAULTS.minigame.assembly.casings };

        return;
    }

    const mg = station.minigame as DockMinigame;
    const d = LEVEL_DEFAULTS.minigame.dock;

    mg.tailgateHoldSeconds ??= d.tailgateHoldSeconds;
    mg.leaveSeconds ??= d.leaveSeconds;
}

/**
 * A deep copy with every missing leaf filled in — per leaf, not per object, so a
 * level that tunes one movement number still gets the other four.
 */
export function applyDefaults(level: LevelConfig): LevelConfig {
    // A level is plain JSON, so a round trip through the parser is both an exact
    // copy and free of any environment-specific clone helper.
    const filled = JSON.parse(JSON.stringify(level)) as LevelConfig;

    filled.movement = { ...LEVEL_DEFAULTS.movement, ...filled.movement };
    filled.interrupts = { ...LEVEL_DEFAULTS.interrupts, ...filled.interrupts };
    filled.clipboardMemorySeconds ??= LEVEL_DEFAULTS.clipboardMemorySeconds;
    filled.tempoFloorsMs = { ...LEVEL_DEFAULTS.tempoFloorsMs, ...filled.tempoFloorsMs };
    filled.scoring = { ...LEVEL_DEFAULTS.scoring, ...filled.scoring };
    filled.carry.putDownSeconds ??= LEVEL_DEFAULTS.carry.putDownSeconds;
    filled.carry.hitStaggerSeconds ??= LEVEL_DEFAULTS.carry.hitStaggerSeconds;
    filled.hazards.unjamSeconds ??= LEVEL_DEFAULTS.hazards.unjamSeconds;
    filled.hazards.sweepSecondsPerTile ??= LEVEL_DEFAULTS.hazards.sweepSecondsPerTile;
    filled.hazards.repairSeconds ??= LEVEL_DEFAULTS.hazards.repairSeconds;
    filled.hazards.bannerSeconds ??= LEVEL_DEFAULTS.hazards.bannerSeconds;
    filled.groove.weights.truckComplete ??= LEVEL_DEFAULTS.groove.weights.truckComplete;
    filled.grading.advanceOn ??= LEVEL_DEFAULTS.grading.advanceOn;

    for (const station of filled.stations) fillMinigame(station);

    return filled;
}
