import layoutJson from './layout-one-line.json';
import levelJson from './level-m1.json';
import type {
    AssemblyMinigame,
    BoomPowderMinigame,
    DockMinigame,
    LayoutConfig,
    LevelConfig,
} from '../../src/config/types';

/**
 * The reference M1 level and the layout it sits on. Every caller gets its own
 * deep copy so one test's edits cannot leak into the next.
 */

function copy<T>(value: unknown): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export function levelFixture(): LevelConfig {
    return copy<LevelConfig>(levelJson);
}

export function layoutFixture(): LayoutConfig {
    return copy<LayoutConfig>(layoutJson);
}

/** The same level as unvalidated input, for the structural pass. */
export function rawLevelFixture(): Record<string, unknown> {
    return copy<Record<string, unknown>>(levelJson);
}

export function rawLayoutFixture(): Record<string, unknown> {
    return copy<Record<string, unknown>>(layoutJson);
}

/**
 * The reference level with every contracts §13 optional key stripped back out —
 * what a designer is allowed to ship, and the only input that proves the
 * defaults are really applied.
 */
export function bareLevelFixture(): LevelConfig {
    const level = levelFixture();

    delete level.movement;
    delete level.interrupts;
    delete level.clipboardMemorySeconds;
    delete level.scoring;
    delete level.carry.putDownSeconds;
    delete level.carry.hitStaggerSeconds;
    delete level.hazards.unjamSeconds;
    delete level.hazards.sweepSecondsPerTile;
    delete level.hazards.repairSeconds;
    delete level.hazards.bannerSeconds;
    delete level.groove.weights.truckComplete;
    delete level.grading.advanceOn;

    const powder = level.stations[0]?.minigame as BoomPowderMinigame;
    delete powder.heat.overholdMs;
    delete powder.comboBannerSeconds;
    delete (level.stations[1]?.minigame as AssemblyMinigame).casings;
    const dock = level.stations[2]?.minigame as DockMinigame;
    delete dock.tailgateHoldSeconds;
    delete dock.leaveSeconds;

    return level;
}
