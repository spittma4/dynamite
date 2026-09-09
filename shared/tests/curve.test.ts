import { describe, expect, it } from 'vitest';

import { efficiencyFor, peakWorkers } from '../src/sim/curve';
import type { StaffingCurve } from '../src/config/types';

// The docs/05 staffing table, as the level files write it.
const POWDER: StaffingCurve = { '1': 1.0, '2': 1.05, '3': 0.9, '4': 0.75 };
const ASSEMBLY: StaffingCurve = { '1': 0.6, '2': 1.0, '3': 1.15, '4': 1.1, '5': 0.95, '6': 0.8, '8': 0.5 };
const DOCK: StaffingCurve = { '1': 1.0, '2': 1.6, '3': 1.9, '4': 1.8, '5': 1.5, '6': 1.2, '8': 1.0 };

describe('efficiencyFor', () => {
    it('gives an unworked station nothing', () => {
        expect(efficiencyFor(ASSEMBLY, 0)).toBe(0);
        expect(efficiencyFor(POWDER, 0)).toBe(0);
    });

    it('reads an exact key straight off the curve', () => {
        expect(efficiencyFor(ASSEMBLY, 3)).toBe(1.15);
        expect(efficiencyFor(POWDER, 2)).toBe(1.05);
        expect(efficiencyFor(DOCK, 1)).toBe(1.0);
    });

    it('interpolates between the keys either side', () => {
        expect(efficiencyFor(ASSEMBLY, 7)).toBeCloseTo(0.65, 10);
    });

    it('interpolates up from zero below the smallest key', () => {
        expect(efficiencyFor({ '2': 1.0 }, 1)).toBeCloseTo(0.5, 10);
    });

    it('holds the last curve value above the max key', () => {
        expect(efficiencyFor(ASSEMBLY, 9)).toBe(0.5);
        expect(efficiencyFor(ASSEMBLY, 100)).toBe(0.5);
        expect(efficiencyFor(POWDER, 8)).toBe(0.75);
    });

    it('refuses a worker count that is not a whole number of people', () => {
        expect(() => efficiencyFor(ASSEMBLY, -1)).toThrow(RangeError);
        expect(() => efficiencyFor(ASSEMBLY, 2.5)).toThrow(RangeError);
        expect(() => efficiencyFor(ASSEMBLY, Number.NaN)).toThrow(RangeError);
    });

    it('refuses an empty curve', () => {
        expect(() => efficiencyFor({}, 1)).toThrow(RangeError);
    });
});

describe('peakWorkers', () => {
    it('finds the smallest worker count holding the curve maximum', () => {
        expect(peakWorkers(ASSEMBLY)).toBe(3);
        expect(peakWorkers(DOCK)).toBe(3);
        expect(peakWorkers(POWDER)).toBe(2);
    });

    it('takes the first of a tied maximum', () => {
        expect(peakWorkers({ '1': 1.0, '2': 1.0, '3': 0.5 })).toBe(1);
    });

    it('refuses an empty curve', () => {
        expect(() => peakWorkers({})).toThrow(RangeError);
    });
});
