import { describe, expect, it } from 'vitest';

import { LEVEL_DEFAULTS, applyDefaults } from '../src/config/defaults';
import { bareLevelFixture as bare, levelFixture as level } from './fixtures';
import type {
    AssemblyMinigame,
    BoomPowderMinigame,
    DockMinigame,
    LevelConfig,
} from '../src/config/types';

describe('applyDefaults', () => {
    it('fills a missing movement block from the contract', () => {
        expect(applyDefaults(bare()).movement).toEqual({
            tilesPerSecond: 4,
            playerRadius: 0.35,
            bumpStaggerSeconds: 0.3,
            floorItemSpeed: 0.4,
            spillSpeed: 0.6,
        });
    });

    it('fills the siblings of a movement key the level did supply', () => {
        const l = bare();
        l.movement = { tilesPerSecond: 5 } as LevelConfig['movement'];

        expect(applyDefaults(l).movement).toEqual({
            tilesPerSecond: 5,
            playerRadius: 0.35,
            bumpStaggerSeconds: 0.3,
            floorItemSpeed: 0.4,
            spillSpeed: 0.6,
        });
    });

    it('fills every other optional level key', () => {
        const filled = applyDefaults(bare());

        expect(filled.clipboardMemorySeconds).toBe(60);
        expect(filled.interrupts).toEqual({ everySeconds: 6, pauseSeconds: 0.5 });
        expect(filled.carry.putDownSeconds).toBe(0.3);
        expect(filled.carry.hitStaggerSeconds).toBe(0.5);
        expect(filled.hazards.unjamSeconds).toBe(4);
        expect(filled.hazards.sweepSecondsPerTile).toBe(1.5);
        expect(filled.hazards.repairSeconds).toBe(10);
        expect(filled.hazards.bannerSeconds).toBe(3);
        expect(filled.groove.weights.truckComplete).toBe(10);
        expect(filled.scoring).toEqual({ perOrder: 100 });
        expect(filled.grading.advanceOn).toBe('C');
    });

    it('fills the mini-game defaults by station type', () => {
        const stations = applyDefaults(bare()).stations;
        const powder = stations[0]?.minigame as BoomPowderMinigame;
        const assembly = stations[1]?.minigame as AssemblyMinigame;
        const dock = stations[2]?.minigame as DockMinigame;

        expect(powder.heat.overholdMs).toBe(500);
        expect(powder.comboBannerSeconds).toBe(2);
        expect(assembly.casings).toEqual({ stock: 3, dentChance: 0.3 });
        expect(dock.tailgateHoldSeconds).toBe(0.5);
        expect(dock.leaveSeconds).toBe(1.5);
    });

    it('never overwrites a value the level file supplied', () => {
        const filled = applyDefaults(level());
        const powder = filled.stations[0]?.minigame as BoomPowderMinigame;

        expect(filled.hazards.repairSeconds).toBe(10);
        expect(filled.groove.weights.truckComplete).toBe(10);
        expect(filled.grading.advanceOn).toBe('C');
        expect(powder.heat.overholdMs).toBe(500);
    });

    it('keeps a supplied zero rather than treating it as missing', () => {
        const l = bare();
        l.clipboardMemorySeconds = 0;
        l.carry.putDownSeconds = 0;

        const filled = applyDefaults(l);

        expect(filled.clipboardMemorySeconds).toBe(0);
        expect(filled.carry.putDownSeconds).toBe(0);
    });

    it('leaves the level it was handed untouched', () => {
        const l = bare();
        const before = JSON.stringify(l);

        const filled = applyDefaults(l);

        expect(JSON.stringify(l)).toBe(before);
        expect(filled).not.toBe(l);
        expect(filled.stations[0]).not.toBe(l.stations[0]);
    });

    it('publishes the defaults table the contract lists', () => {
        expect(LEVEL_DEFAULTS.movement.tilesPerSecond).toBe(4);
        expect(LEVEL_DEFAULTS.minigame.dock.leaveSeconds).toBe(1.5);
        expect(LEVEL_DEFAULTS.grading.advanceOn).toBe('C');
    });
});
