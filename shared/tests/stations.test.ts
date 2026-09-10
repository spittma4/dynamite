import { describe, expect, it } from 'vitest';

import { layoutFixture, levelFixture } from './fixtures/index';
import type { LayoutConfig, LevelConfig, StationConfig, Tile } from '../src/config/types';
import {
    ACTION_OP,
    STATION_LABEL,
    armedAt,
    bubblesDue,
    clipboardSecondsFor,
    countWorkers,
    extrasFor,
    firstBubbleAt,
    footprintOf,
    interruptsPerSecond,
    joinZoneOf,
    pickExtras,
    roleForTile,
} from '../src/sim/stations';

/**
 * The staffing and cycle arithmetic behind a station (contracts §10.2). Nothing
 * here reads a clock or a `World`: every number the runtime writes has to be
 * reproducible from its inputs alone, so a tuning argument can be settled here
 * rather than in a browser.
 */

const level: LevelConfig = levelFixture();
const layout: LayoutConfig = layoutFixture();

function stationOf(id: string): StationConfig {
    const cfg = level.stations.find((station) => station.id === id);

    if (cfg === undefined) throw new Error(`no station ${id} in the fixture`);

    return cfg;
}

const powder = stationOf('powder-a');
const assembly = stationOf('assembly-a');
const dock = stationOf('dock-a');

describe('the clipboard', () => {
    it('charges the full three seconds on a first visit', () => {
        expect(clipboardSecondsFor(undefined, 10, 3, 60)).toBe(3);
    });

    it('waives it when the last leave was inside the memory window', () => {
        expect(clipboardSecondsFor(10, 70, 3, 60)).toBe(0);
    });

    it('charges it again once the memory has expired', () => {
        expect(clipboardSecondsFor(10, 70.001, 3, 60)).toBe(3);
    });
});

describe('counting workers', () => {
    it('counts only the members whose clipboard has elapsed', () => {
        const members = [{ clipboardUntil: 0 }, { clipboardUntil: 12 }, { clipboardUntil: 9 }];

        expect(countWorkers(members, 10)).toBe(2);
    });
});

describe('extras and interrupts', () => {
    it('reports no extras at or below the curve peak', () => {
        expect(extrasFor(powder.staffing, 1)).toBe(0);
        expect(extrasFor(powder.staffing, 2)).toBe(0);
        expect(extrasFor(assembly.staffing, 3)).toBe(0);
        expect(extrasFor(dock.staffing, 3)).toBe(0);
    });

    it('counts every body past the peak as an extra', () => {
        expect(extrasFor(powder.staffing, 5)).toBe(3);
        expect(extrasFor(assembly.staffing, 10)).toBe(7);
    });

    it('derives interruptsPerSecond as extras over the cadence', () => {
        expect(interruptsPerSecond(1, 6)).toBeCloseTo(0.1667, 4);
        expect(interruptsPerSecond(7, 6)).toBeCloseTo(1.1667, 4);
        expect(interruptsPerSecond(0, 6)).toBe(0);
    });

    it('picks the most recently joined members, ties by sessionId', () => {
        const members = [
            { sessionId: 'a', joinedAt: 1, role: 'helper' as const },
            { sessionId: 'c', joinedAt: 9, role: 'helper' as const },
            { sessionId: 'b', joinedAt: 9, role: 'helper' as const },
            { sessionId: 'd', joinedAt: 4, role: 'helper' as const },
        ];

        expect(pickExtras(members, 2).map((m) => m.sessionId)).toEqual(['b', 'c']);
        expect(pickExtras(members, 0)).toEqual([]);
    });

    it('spends the aisle before the machine: helper, then rack, then work', () => {
        const members = [
            { sessionId: 'op', joinedAt: 9, role: 'work' as const },
            { sessionId: 'rack', joinedAt: 2, role: 'rack' as const },
            { sessionId: 'ring', joinedAt: 1, role: 'helper' as const },
        ];

        // The newest body is the operator, and an operator is the one member
        // who demonstrably has something to do.
        expect(pickExtras(members, 1).map((m) => m.sessionId)).toEqual(['ring']);
        expect(pickExtras(members, 3).map((m) => m.sessionId)).toEqual(['ring', 'rack', 'op']);
    });
});

describe('the interrupt cadence', () => {
    it('schedules the first bubble between half a cadence and a full one', () => {
        expect(firstBubbleAt(10, 6, 0)).toBe(13);
        expect(firstBubbleAt(10, 6, 1)).toBe(16);
        expect(firstBubbleAt(10, 6, 0.5)).toBe(14.5);
    });

    it('fires one bubble per cadence and carries the remainder forward', () => {
        const first = bubblesDue(6, 6, 6);

        expect(first).toEqual({ count: 1, nextBubbleAt: 12 });
        expect(bubblesDue(first.nextBubbleAt, 11.9, 6)).toEqual({ count: 0, nextBubbleAt: 12 });
        expect(bubblesDue(first.nextBubbleAt, 12.1, 6)).toEqual({ count: 1, nextBubbleAt: 18 });
    });

    it('catches up when a whole cadence was missed', () => {
        expect(bubblesDue(6, 18.5, 6)).toEqual({ count: 3, nextBubbleAt: 24 });
    });
});

describe('the re-arm floor', () => {
    const inputs = {
        floorSeconds: powder.floorSeconds,
        efficiency: 1.05,
        churnSensitive: powder.churnSensitive,
        churnDepth: 0,
        lastCycleWasPerfect: false,
        executionSeconds: 1,
        bubblesThisCycle: 0,
    };

    it('holds the machine floor when the player beat it', () => {
        expect(armedAt(100, inputs)).toBeCloseTo(101.3333, 4);
    });

    it('follows the player when the rep took longer than the floor', () => {
        expect(armedAt(100, { ...inputs, executionSeconds: 2 })).toBeCloseTo(102, 4);
    });

    it('adds half a second per interrupt bubble', () => {
        expect(
            armedAt(100, { ...inputs, executionSeconds: 1.5, bubblesThisCycle: 2 }),
        ).toBeCloseTo(102.5, 4);
    });

    it('cuts the floor by a quarter after a perfect cycle', () => {
        expect(armedAt(100, { ...inputs, lastCycleWasPerfect: true })).toBeCloseTo(101, 4);
    });
});

describe('tile geometry', () => {
    it('derives the bbox from the named tiles and the machine from the walls inside it', () => {
        const { bbox, machine } = footprintOf(powder, layout);

        expect(bbox).toEqual({ x0: 4, y0: 3, x1: 7, y1: 5 });

        const keys = machine.map(([x, y]: Tile) => `${x},${y}`).sort();

        expect(keys).toEqual(['4,3', '4,4', '5,3', '5,4', '6,3', '6,4', '7,3', '7,4']);
    });

    it('puts the work, rack and ring tiles in the join zone and nothing else', () => {
        const zone = joinZoneOf(assembly);

        expect(zone.has('13,5')).toBe(true);
        expect(zone.has('13,7')).toBe(true);
        expect(zone.has('11,7')).toBe(true);
        expect(zone.has('11,4')).toBe(false);
        expect(zone.size).toBe(2 + 1 + 20);
    });

    it('maps a tile to the role that stands on it', () => {
        expect(roleForTile(assembly, [13, 5])).toBe('work');
        expect(roleForTile(assembly, [13, 7])).toBe('rack');
        expect(roleForTile(assembly, [11, 7])).toBe('helper');
        expect(roleForTile(assembly, [1, 1])).toBeNull();
    });
});

describe('labels', () => {
    it('names every station type and the op its Space press stands in for', () => {
        expect(STATION_LABEL).toEqual({
            boom_powder: 'BOOM POWDER',
            assembly: 'ASSEMBLY',
            dock: 'DOCK',
        });
        expect(ACTION_OP).toEqual({ boom_powder: 'charge', assembly: 'crimp', dock: 'shove' });
    });
});
