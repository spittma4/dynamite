import { describe, expect, it } from 'vitest';

import {
    applyGroove,
    churnDepth,
    cleanSweepStep,
    grooveBand,
    grooveDelta,
} from '../src/sim/groove';
import type { CleanSweepState, GrooveEvents, GrooveSample } from '../src/sim/groove';
import type { CleanSweepConfig, GrooveThresholds, GrooveWeights } from '../src/config/types';

const WEIGHTS: GrooveWeights = {
    onTimeShip: 8,
    shelfFullness: -4,
    floorItem: -0.5,
    rework: -1,
    starved: -2,
    jammed: -1,
    litFuse: -3,
    fizzle: -2,
    niceSave: 3,
    blastKeg: -10,
    primeStick: 1,
    truckComplete: 10,
};
const THRESHOLDS: GrooveThresholds = { onFire: 85, groove: 70, churn: 30, meltdown: 10 };
const CLEAN_SWEEP: CleanSweepConfig = { holdSeconds: 3, snapTo: 60, cooldownSeconds: 90 };

const QUIET_SAMPLE: GrooveSample = {
    onTimeShipRate: 0,
    avgShelfFullness: 0,
    floorItemCount: 0,
    reworkShelfCount: 0,
    starvedStationCount: 0,
    jammedStationCount: 0,
    litFuseCount: 0,
};
const NO_EVENTS: GrooveEvents = {
    fizzles: 0,
    niceSaves: 0,
    blastKegs: 0,
    primeSticks: 0,
    trucksComplete: 0,
};

function sample(over: Partial<GrooveSample> = {}): GrooveSample {
    return { ...QUIET_SAMPLE, ...over };
}

function events(over: Partial<GrooveEvents> = {}): GrooveEvents {
    return { ...NO_EVENTS, ...over };
}

describe('grooveDelta', () => {
    it('integrates the rate terms over the elapsed time', () => {
        expect(grooveDelta(WEIGHTS, sample({ onTimeShipRate: 1 }), NO_EVENTS, 1)).toBeCloseTo(8, 10);
        expect(grooveDelta(WEIGHTS, sample({ onTimeShipRate: 1 }), NO_EVENTS, 0.5)).toBeCloseTo(4, 10);
        expect(grooveDelta(WEIGHTS, sample({ avgShelfFullness: 1 }), NO_EVENTS, 1)).toBeCloseTo(-4, 10);
        expect(grooveDelta(WEIGHTS, sample({ floorItemCount: 6 }), NO_EVENTS, 1)).toBeCloseTo(-3, 10);
        expect(grooveDelta(WEIGHTS, sample({ reworkShelfCount: 2 }), NO_EVENTS, 1)).toBeCloseTo(-2, 10);
        expect(grooveDelta(WEIGHTS, sample({ starvedStationCount: 2 }), NO_EVENTS, 1)).toBeCloseTo(-4, 10);
        expect(grooveDelta(WEIGHTS, sample({ jammedStationCount: 1 }), NO_EVENTS, 1)).toBeCloseTo(-1, 10);
        expect(grooveDelta(WEIGHTS, sample({ litFuseCount: 2 }), NO_EVENTS, 1)).toBeCloseTo(-6, 10);
    });

    it('counts each event once however long the tick was', () => {
        expect(grooveDelta(WEIGHTS, QUIET_SAMPLE, events({ fizzles: 1 }), 0.05)).toBeCloseTo(-2, 10);
        expect(grooveDelta(WEIGHTS, QUIET_SAMPLE, events({ fizzles: 1 }), 1)).toBeCloseTo(-2, 10);
        expect(grooveDelta(WEIGHTS, QUIET_SAMPLE, events({ niceSaves: 1 }), 1)).toBeCloseTo(3, 10);
        expect(grooveDelta(WEIGHTS, QUIET_SAMPLE, events({ blastKegs: 1 }), 1)).toBeCloseTo(-10, 10);
        expect(grooveDelta(WEIGHTS, QUIET_SAMPLE, events({ primeSticks: 4 }), 1)).toBeCloseTo(4, 10);
        expect(grooveDelta(WEIGHTS, QUIET_SAMPLE, events({ trucksComplete: 1 }), 1)).toBeCloseTo(10, 10);
    });

    it('sums the rate and event terms of one tick', () => {
        const delta = grooveDelta(
            WEIGHTS,
            sample({ onTimeShipRate: 1, floorItemCount: 4 }),
            events({ trucksComplete: 1, blastKegs: 1 }),
            2,
        );

        expect(delta).toBeCloseTo(2 * (8 - 2) + 10 - 10, 10);
    });
});

describe('applyGroove', () => {
    it('moves the groove by the delta', () => {
        expect(applyGroove(50, 8)).toBeCloseTo(58, 10);
    });

    it('clamps to the 0–100 band', () => {
        expect(applyGroove(95, 20)).toBe(100);
        expect(applyGroove(5, -20)).toBe(0);
    });
});

describe('grooveBand', () => {
    it('bands the thresholds inclusively from the bottom up', () => {
        expect(grooveBand(85, THRESHOLDS)).toBe('onFire');
        expect(grooveBand(100, THRESHOLDS)).toBe('onFire');
        expect(grooveBand(70, THRESHOLDS)).toBe('groove');
        expect(grooveBand(50, THRESHOLDS)).toBe('baseline');
        expect(grooveBand(30, THRESHOLDS)).toBe('churn');
        expect(grooveBand(10, THRESHOLDS)).toBe('meltdown');
        expect(grooveBand(0, THRESHOLDS)).toBe('meltdown');
    });
});

describe('churnDepth', () => {
    it('deepens from nothing at the churn line to everything at zero', () => {
        expect(churnDepth(30, THRESHOLDS)).toBeCloseTo(0, 10);
        expect(churnDepth(15, THRESHOLDS)).toBeCloseTo(0.5, 10);
        expect(churnDepth(0, THRESHOLDS)).toBeCloseTo(1, 10);
        expect(churnDepth(60, THRESHOLDS)).toBe(0);
    });
});

describe('cleanSweepStep', () => {
    const clean = sample({ avgShelfFullness: 0.4 });
    const idle: CleanSweepState = { heldSince: null, lastFiredAt: null };

    it('starts the hold the moment the floor is clear', () => {
        const step = cleanSweepStep(idle, clean, 10, CLEAN_SWEEP);

        expect(step.state.heldSince).toBe(10);
        expect(step.fire).toBe(false);
    });

    it('does not fire before the hold is up', () => {
        const held: CleanSweepState = { heldSince: 10, lastFiredAt: null };

        expect(cleanSweepStep(held, clean, 12.9, CLEAN_SWEEP).fire).toBe(false);
    });

    it('fires once the floor has been clean for three seconds', () => {
        const held: CleanSweepState = { heldSince: 10, lastFiredAt: null };
        const step = cleanSweepStep(held, clean, 13, CLEAN_SWEEP);

        expect(step.fire).toBe(true);
        expect(step.state.lastFiredAt).toBe(13);
        expect(step.state.heldSince).toBe(13);
    });

    it('resets the hold when someone puts an item back on the floor', () => {
        const held: CleanSweepState = { heldSince: 10, lastFiredAt: null };
        const dirty = cleanSweepStep(held, sample({ floorItemCount: 1 }), 12, CLEAN_SWEEP);

        expect(dirty.state.heldSince).toBeNull();
        expect(dirty.fire).toBe(false);
    });

    it('treats half-full shelves and a rework pile as not clean', () => {
        expect(cleanSweepStep(idle, sample({ avgShelfFullness: 0.5 }), 10, CLEAN_SWEEP).state.heldSince).toBeNull();
        expect(cleanSweepStep(idle, sample({ reworkShelfCount: 1 }), 10, CLEAN_SWEEP).state.heldSince).toBeNull();
    });

    it('will not fire twice inside the cooldown', () => {
        const recent: CleanSweepState = { heldSince: 10, lastFiredAt: 13 };

        expect(cleanSweepStep(recent, clean, 100, CLEAN_SWEEP).fire).toBe(false);
    });

    it('fires again once the cooldown is up', () => {
        const recent: CleanSweepState = { heldSince: 10, lastFiredAt: 13 };
        const step = cleanSweepStep(recent, clean, 103, CLEAN_SWEEP);

        expect(step.fire).toBe(true);
        expect(step.state.lastFiredAt).toBe(103);
    });

    it('leaves the state it was handed untouched', () => {
        const held: CleanSweepState = { heldSince: 10, lastFiredAt: null };
        cleanSweepStep(held, clean, 13, CLEAN_SWEEP);

        expect(held).toEqual({ heldSince: 10, lastFiredAt: null });
    });
});
