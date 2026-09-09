import { describe, expect, it } from 'vitest';

import {
    CycleTracker,
    STATION_HEADER,
    bottleneckOf,
    shelf,
    stationRow,
    type StationRowInput,
} from '../ui/debugRows';

function station(over: Partial<StationRowInput> = {}): StationRowInput {
    return {
        id: 'powder-a',
        state: 'working',
        workers: 1,
        efficiency: 1,
        progress: 0.42,
        inputShelf: { length: 0 },
        inputCap: 0,
        outputShelf: { length: 5 },
        outputCap: 6,
        floorCount: 3,
        utilization: 0.98,
        interruptsPerSecond: 0,
        ...over,
    };
}

describe('bottleneckOf', () => {
    it('picks the bottleneck by utilization × input fullness', () => {
        const stations = [
            station({ id: 'powder-a', utilization: 0.9, inputShelf: { length: 8 }, inputCap: 8 }),
            station({ id: 'assembly-a', utilization: 1, inputShelf: { length: 2 }, inputCap: 8 }),
        ];

        expect(bottleneckOf(stations)).toBe('powder-a');
    });

    it('treats inputCap 0 as fullness 1', () => {
        const stations = [
            station({ id: 'powder-a', utilization: 0.5, inputShelf: { length: 0 }, inputCap: 0 }),
            station({ id: 'assembly-a', utilization: 0.9, inputShelf: { length: 2 }, inputCap: 8 }),
        ];

        expect(bottleneckOf(stations)).toBe('powder-a');
    });

    it('has no bottleneck without stations', () => {
        expect(bottleneckOf([])).toBe('');
    });
});

describe('shelf', () => {
    it('renders n/cap and "-" for a capless shelf', () => {
        expect(shelf(5, 6)).toBe('5/6');
        expect(shelf(0, 0)).toBe('-');
    });
});

describe('stationRow', () => {
    it('renders a station row with n/cap shelves and "-" for capless shelves', () => {
        expect(stationRow(station(), null)).toBe(
            'powder-a      working  1  1.00  0.42  -     5/6   3    0.98  0.0   -',
        );
    });

    it('lines its columns up with the header', () => {
        const row = stationRow(station({ id: 'assembly-a', state: 'starved' }), 6.42);

        expect(STATION_HEADER.indexOf('util')).toBe(row.indexOf('0.98'));
        expect(row.endsWith('6.4s')).toBe(true);
    });
});

describe('CycleTracker', () => {
    it('reports the last cycle as the gap between the last two entries into working', () => {
        const tracker = new CycleTracker();

        tracker.note('powder-a', 'idle', 0);
        tracker.note('powder-a', 'working', 1);
        expect(tracker.last('powder-a')).toBeNull();

        tracker.note('powder-a', 'working', 1.5);
        expect(tracker.last('powder-a')).toBeNull();

        tracker.note('powder-a', 'idle', 2);
        tracker.note('powder-a', 'working', 3.1);
        expect(tracker.last('powder-a')).toBeCloseTo(2.1, 6);
    });

    it('keeps one history per station', () => {
        const tracker = new CycleTracker();

        tracker.note('powder-a', 'working', 1);
        tracker.note('assembly-a', 'working', 2);
        tracker.note('powder-a', 'idle', 3);
        tracker.note('powder-a', 'working', 4);

        expect(tracker.last('powder-a')).toBeCloseTo(3, 6);
        expect(tracker.last('assembly-a')).toBeNull();
    });
});
