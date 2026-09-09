import { describe, expect, it } from 'vitest';

import { breakpointFor, scaleLevel } from '../src/sim/scale';
import { validateLevelConfig } from '../src/config/validate';
import { levelFixture, rawLevelFixture } from './fixtures';
import type { LevelConfig } from '../src/config/types';

/**
 * What F03 actually hands `scaleLevel`: the file after the validator has applied
 * the §13 defaults. The fixture file itself omits `movement`, so scaling a raw
 * level would prove something no consumer ever holds.
 */
function resolvedLevel(): LevelConfig {
    const result = validateLevelConfig(rawLevelFixture());

    if (!result.ok) throw new Error(result.errors.join('\n'));

    return result.value;
}

describe('breakpointFor', () => {
    it('takes the first breakpoint that covers the crew', () => {
        const level = levelFixture();

        expect(breakpointFor(level, 3).maxPlayers).toBe(6);
        expect(breakpointFor(level, 6).maxPlayers).toBe(6);
        expect(breakpointFor(level, 7).maxPlayers).toBe(10);
        expect(breakpointFor(level, 10).maxPlayers).toBe(10);
    });

    it('refuses a crew the level does not seat', () => {
        const level = levelFixture();

        expect(() => breakpointFor(level, 2)).toThrow(RangeError);
        expect(() => breakpointFor(level, 11)).toThrow(RangeError);
    });

    it('refuses a level whose breakpoints stop short of the crew', () => {
        const level = levelFixture();
        level.players = { min: 3, max: 10 };
        level.scaling.breakpoints = [
            { maxPlayers: 4, lines: 1, truckEverySeconds: 60, orderBook: 11 },
        ];

        expect(() => breakpointFor(level, 6)).toThrow(RangeError);
    });
});

describe('scaleLevel', () => {
    it('is still a whole level config', () => {
        const scaled = scaleLevel(resolvedLevel(), 4);

        expect(scaled.hazards.fuseSeconds).toBe(6);
        expect(scaled.grading.thresholds.A).toBe(90);
        expect(scaled.recipes.red_stick?.station).toBe('assembly');
        expect(scaled.carry.throwTiles).toBe(2);
        expect(scaled.windowFloorsMs.ok).toBe(100);
        expect(scaled.movement?.tilesPerSecond).toBe(4);
        expect(scaled.players).toEqual({ min: 3, max: 10 });
        expect(scaled.day.orderBook).toBe(11);
        expect(scaled.orders.everySeconds).toBe(60);
        expect(scaled.layout).toBe('one-line');
    });

    it('keeps the one-line stations as they are', () => {
        const scaled = scaleLevel(levelFixture(), 4);

        expect(scaled.stations.map((s) => s.id)).toEqual(['powder-a', 'assembly-a', 'dock-a']);
    });

    it('takes the order book and the truck interval from the breakpoint', () => {
        const level = levelFixture();
        level.scaling.breakpoints[0] = {
            maxPlayers: 6,
            lines: 1,
            truckEverySeconds: 75,
            orderBook: 9,
        };

        const scaled = scaleLevel(level, 4);

        expect(scaled.day.orderBook).toBe(9);
        expect(scaled.orders.everySeconds).toBe(75);
        expect(scaled.day.shiftSeconds).toBe(600);
        expect(scaled.orders.firstAt).toBe(20);
    });

    it('keeps the level layout when the breakpoint names none', () => {
        expect(scaleLevel(levelFixture(), 4).layout).toBe('one-line');
    });

    it('takes the layout the breakpoint names when it has one', () => {
        const level = levelFixture();
        level.scaling.breakpoints[0] = {
            maxPlayers: 6,
            lines: 1,
            truckEverySeconds: 60,
            orderBook: 11,
            layout: 'one-line-wide',
        };

        expect(scaleLevel(level, 4).layout).toBe('one-line-wide');
    });

    it('says which breakpoint and how many lines it used', () => {
        const scaled = scaleLevel(levelFixture(), 4);

        expect(scaled.breakpoint.maxPlayers).toBe(6);
        expect(scaled.lines).toEqual(['a']);
    });

    it('refuses a crew the level does not seat', () => {
        expect(() => scaleLevel(levelFixture(), 2)).toThrow(RangeError);
        expect(() => scaleLevel(levelFixture(), 11)).toThrow(RangeError);
    });

    it('refuses the second line until M2 builds it', () => {
        expect(() => scaleLevel(levelFixture(), 7)).toThrow(RangeError);
    });

    it('leaves the level it was handed untouched', () => {
        const level = levelFixture();
        const before = JSON.stringify(level);

        scaleLevel(level, 4);

        expect(JSON.stringify(level)).toBe(before);
    });
});
