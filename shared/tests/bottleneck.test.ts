import { describe, expect, it } from 'vitest';

import { bottleneckStation } from '../src/sim/bottleneck';
import type { StationPressure } from '../src/sim/bottleneck';

// docs/10's utilization block. Powder and the dock have no input shelf, so they
// are handed a fullness of 0 and can never be the constraint.
const DOCS_10: StationPressure[] = [
    { id: 'powder-a', utilization: 0.98, inputShelfFullness: 0 },
    { id: 'assembly-a', utilization: 1.0, inputShelfFullness: 0.75 },
    { id: 'dock-a', utilization: 0.27, inputShelfFullness: 0 },
];

describe('bottleneckStation', () => {
    it('names the station whose full shelf it is working through', () => {
        expect(bottleneckStation(DOCS_10)).toBe('assembly-a');
    });

    it('gives a station with nothing to pull from no pressure at all', () => {
        const starved: StationPressure[] = [
            { id: 'assembly-a', utilization: 1.0, inputShelfFullness: 0 },
            { id: 'dock-a', utilization: 0.1, inputShelfFullness: 0.2 },
        ];

        expect(bottleneckStation(starved)).toBe('dock-a');
    });

    it('breaks a tie by the order it was given', () => {
        const tied: StationPressure[] = [
            { id: 'powder-a', utilization: 0.5, inputShelfFullness: 0.5 },
            { id: 'assembly-a', utilization: 0.5, inputShelfFullness: 0.5 },
        ];

        expect(bottleneckStation(tied)).toBe('powder-a');
    });

    it('names nothing when there are no stations', () => {
        expect(bottleneckStation([])).toBe('');
    });
});
