import { describe, expect, it } from 'vitest';

import { gradeDay, letterFor, profitAndLoss, utilizationLabel, verdictFor } from '../src/sim/grade';
import type { GradeInputs, PnlInputs } from '../src/sim/grade';
import type { DayConfig, EconomyConfig, GradingConfig } from '../src/config/types';

const GRADING: GradingConfig = {
    weights: { onTime: 50, wip: 20, quality: 15, cycle: 15, incident: -5, heroCap: 10 },
    thresholds: { A: 90, B: 75, C: 60, D: 40 },
    targets: { wip: 16, cycleSeconds: 240 },
    multiplier: { A: 1.5, B: 1.25, C: 1.0, D: 0.75, F: 0.5 },
    verdict: { flow: 1.0, smooth: 0.75, fine: 0.5, rough: 0.25 },
    advanceOn: 'C',
};
const DAY: DayConfig = {
    shiftSeconds: 600,
    orderBook: 11,
    endsOn: 'either',
    earlyFinishBonusPerMinute: 5,
    earlyFinishCap: 10,
};
const ECONOMY: EconomyConfig = {
    price: { red_stick: 10 },
    wasteCost: { keg: 4, casing: 2, stick: 6, crate: 8 },
};

// docs/10's worked report: 4 of 11 orders, peak WIP 37, avg cycle 6:12, one nice save.
const DISASTER_DAY: GradeInputs = {
    ordersCompleted: 4,
    ordersTotal: 11,
    peakWip: 37,
    complaints: 0,
    shipped: 48,
    avgCycleSeconds: 372,
    incidents: 0,
    cleanSweeps: 0,
    niceSaves: 1,
    bookDone: false,
    remainingSeconds: 0,
    exploded: false,
};
const FLAWLESS_DAY: GradeInputs = {
    ordersCompleted: 11,
    ordersTotal: 11,
    peakWip: 0,
    complaints: 0,
    shipped: 88,
    avgCycleSeconds: 200,
    incidents: 0,
    cleanSweeps: 0,
    niceSaves: 0,
    bookDone: true,
    remainingSeconds: 0,
    exploded: false,
};

describe('gradeDay', () => {
    it('grades the day from docs/10 a D and calls it a disaster', () => {
        expect(gradeDay(DISASTER_DAY, GRADING, DAY)).toEqual({
            score: 42,
            grade: 'D',
            verdict: 'DISASTER',
            multiplier: 0.75,
        });
    });

    it('grades a flawless day a hundred and calls it flow', () => {
        expect(gradeDay(FLAWLESS_DAY, GRADING, DAY)).toEqual({
            score: 100,
            grade: 'A',
            verdict: 'FLOW',
            multiplier: 1.5,
        });
    });

    it('fails an exploded day whatever the numbers say', () => {
        const day = gradeDay({ ...FLAWLESS_DAY, exploded: true }, GRADING, DAY);

        expect(day.grade).toBe('F');
        expect(day.verdict).toBe('EXPLODED');
        expect(day.multiplier).toBe(0);
        expect(day.score).toBe(100);
    });

    it('caps the hero bonus however many saves there were', () => {
        const heroic = gradeDay({ ...DISASTER_DAY, niceSaves: 40, cleanSweeps: 3 }, GRADING, DAY);

        expect(heroic.score).toBe(42 - 2 + 10);
    });

    it('docks five points per incident', () => {
        expect(gradeDay({ ...DISASTER_DAY, incidents: 3 }, GRADING, DAY).score).toBe(42 - 15);
    });

    it('earns nothing for cycle time when no order was completed', () => {
        const empty = gradeDay(
            { ...DISASTER_DAY, ordersCompleted: 0, niceSaves: 0, avgCycleSeconds: 0 },
            GRADING,
            DAY,
        );

        expect(empty.score).toBe(15);
    });

    it('pays the early finish only when the book is done', () => {
        const early = { ...FLAWLESS_DAY, remainingSeconds: 70 };

        expect(gradeDay(early, GRADING, DAY).score).toBe(105);
        expect(gradeDay({ ...early, remainingSeconds: 130 }, GRADING, DAY).score).toBe(110);
        expect(gradeDay({ ...early, remainingSeconds: 600 }, GRADING, DAY).score).toBe(110);
        expect(gradeDay({ ...early, bookDone: false }, GRADING, DAY).score).toBe(100);
    });

    it('never scores below zero', () => {
        expect(gradeDay({ ...DISASTER_DAY, incidents: 100 }, GRADING, DAY).score).toBe(0);
    });

    it('rounds the score before it picks the letter', () => {
        const raw = gradeDay({ ...DISASTER_DAY, peakWip: 0, avgCycleSeconds: 240 }, GRADING, DAY);

        expect(raw.score).toBe(70);
        expect(letterFor(89.6, GRADING.thresholds)).toBe('B');
        expect(letterFor(Math.round(89.6), GRADING.thresholds)).toBe('A');
    });
});

describe('letterFor', () => {
    it('maps each threshold to its letter', () => {
        expect(letterFor(90, GRADING.thresholds)).toBe('A');
        expect(letterFor(89, GRADING.thresholds)).toBe('B');
        expect(letterFor(75, GRADING.thresholds)).toBe('B');
        expect(letterFor(60, GRADING.thresholds)).toBe('C');
        expect(letterFor(40, GRADING.thresholds)).toBe('D');
        expect(letterFor(39, GRADING.thresholds)).toBe('F');
    });
});

describe('verdictFor', () => {
    it('bands the verdict by on-time completion', () => {
        expect(verdictFor(1, 0, GRADING, false)).toBe('FLOW');
        expect(verdictFor(0.8, 0, GRADING, false)).toBe('SMOOTH');
        expect(verdictFor(0.6, 0, GRADING, false)).toBe('FINE');
        expect(verdictFor(0.3, 0, GRADING, false)).toBe('ROUGH');
        expect(verdictFor(0.2, 0, GRADING, false)).toBe('DISASTER');
    });

    it('demotes one step when the floor was buried in work in progress', () => {
        expect(verdictFor(1, 37, GRADING, false)).toBe('SMOOTH');
        expect(verdictFor(0.8, 37, GRADING, false)).toBe('FINE');
        expect(verdictFor(0.6, 37, GRADING, false)).toBe('ROUGH');
        expect(verdictFor(0.36, 37, GRADING, false)).toBe('DISASTER');
    });

    it('has nowhere to demote a disaster to', () => {
        expect(verdictFor(0, 99, GRADING, false)).toBe('DISASTER');
    });

    it('does not demote a peak that only matched the target', () => {
        expect(verdictFor(1, 16, GRADING, false)).toBe('FLOW');
    });

    it('lets an explosion override everything', () => {
        expect(verdictFor(1, 0, GRADING, true)).toBe('EXPLODED');
    });
});

describe('profitAndLoss', () => {
    it('computes the docs/10 payday', () => {
        const inputs: PnlInputs = { shipped: { red_stick: 48 }, waste: { keg: 41, stick: 8 } };

        expect(profitAndLoss(inputs, ECONOMY, 0.75)).toEqual({
            revenue: 480,
            waste: 212,
            profit: 268,
            multiplier: 0.75,
            coin: 201,
        });
    });

    it('rounds the coin to a whole number', () => {
        const inputs: PnlInputs = { shipped: { red_stick: 1 }, waste: {} };

        expect(profitAndLoss(inputs, ECONOMY, 1.25).coin).toBe(13);
    });

    it('pays nothing on a loss but still reports it', () => {
        const inputs: PnlInputs = { shipped: { red_stick: 1 }, waste: { keg: 10 } };
        const pnl = profitAndLoss(inputs, ECONOMY, 1.5);

        expect(pnl.profit).toBe(-30);
        expect(pnl.coin).toBe(0);
    });

    it('pays nothing when the day exploded', () => {
        const inputs: PnlInputs = { shipped: { red_stick: 48 }, waste: {} };

        expect(profitAndLoss(inputs, ECONOMY, 0).coin).toBe(0);
    });

    it('charges nothing for a waste type with no price on it', () => {
        const inputs: PnlInputs = { shipped: { red_stick: 1 }, waste: { parts: 3 } };

        expect(profitAndLoss(inputs, ECONOMY, 1).waste).toBe(0);
    });

    it('refuses to ship a product the economy has no price for', () => {
        const inputs = { shipped: { gold_exec: 4 }, waste: {} } as unknown as PnlInputs;

        expect(() => profitAndLoss(inputs, ECONOMY, 1)).toThrow(RangeError);
    });
});

describe('utilizationLabel', () => {
    it('hands out the gold star at ninety per cent', () => {
        expect(utilizationLabel(0.98)).toBe('EXCELLENT');
        expect(utilizationLabel(0.9)).toBe('EXCELLENT');
    });

    it('calls the middle of the pack good', () => {
        expect(utilizationLabel(0.77)).toBe('GOOD');
        expect(utilizationLabel(0.6)).toBe('GOOD');
    });

    it('asks the rest to focus', () => {
        expect(utilizationLabel(0.44)).toBe('NEEDS FOCUS');
        expect(utilizationLabel(0)).toBe('NEEDS FOCUS');
    });
});
