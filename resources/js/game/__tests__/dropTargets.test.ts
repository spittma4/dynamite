import { describe, expect, it } from 'vitest';

import type { ItemType, LevelConfig, StationConfig } from '@shared';

import { dropTargets, shelfLabel } from '../render/dropTargets';

function station(over: Partial<StationConfig> & Pick<StationConfig, 'id' | 'type'>): StationConfig {
    return {
        workTiles: [],
        rackTiles: [],
        inputShelf: null,
        outputShelf: null,
        ...over,
    } as unknown as StationConfig;
}

const LEVEL = {
    stations: [
        station({
            id: 'powder-a',
            type: 'boom_powder',
            outputShelf: { tile: [7, 3], capacity: 6 },
        }),
        station({
            id: 'assembly-a',
            type: 'assembly',
            inputShelf: { tile: [12, 9], capacity: 8, accepts: ['keg', 'casing'] },
            outputShelf: { tile: [12, 11], capacity: 4 },
        }),
        station({ id: 'dock-a', type: 'dock', workTiles: [[22, 4], [23, 4]] }),
    ],
} as unknown as LevelConfig;

describe('dropTargets', () => {
    it('sends a keg to the shelf that says it accepts kegs', () => {
        const tiles = dropTargets('keg', LEVEL).flatMap((t) => t.tiles);

        expect(tiles).toContainEqual([12, 9]);
    });

    it('does not send a keg to the output shelf it came from', () => {
        const tiles = dropTargets('keg', LEVEL).flatMap((t) => t.tiles);

        expect(tiles).not.toContainEqual([7, 3]);
    });

    it('sends a finished stick to the dock lanes, which have no shelf at all', () => {
        const target = dropTargets('stick', LEVEL).find((t) => t.stationId === 'dock-a');

        expect(target?.tiles).toEqual([
            [22, 4],
            [23, 4],
        ]);
    });

    it('offers nothing for an item no station wants', () => {
        expect(dropTargets('crate', LEVEL)).toEqual([]);
    });

    it('names the station so the hint can say where to go', () => {
        expect(dropTargets('keg', LEVEL)[0]?.stationId).toBe('assembly-a');
    });
});

describe('shelfLabel', () => {
    it('labels an input shelf with what it takes', () => {
        expect(shelfLabel('in', ['keg', 'casing'] as ItemType[])).toBe('KEGS · CASINGS');
    });

    it('labels an output shelf as an out tray', () => {
        expect(shelfLabel('out', undefined)).toBe('OUT');
    });

    it('falls back to IN when a shelf lists nothing', () => {
        expect(shelfLabel('in', undefined)).toBe('IN');
    });
});
