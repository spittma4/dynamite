import { describe, expect, it } from 'vitest';

import { cycleSeconds, machineSeconds } from '../src/sim/cycle';
import type { CycleInputs } from '../src/sim/cycle';

// Assembly: floorSeconds 5.0, nominal 6.0, not churn sensitive (docs/05, docs/13).
function assembly(over: Partial<CycleInputs> = {}): CycleInputs {
    return {
        floorSeconds: 5.0,
        efficiency: 1.15,
        churnSensitive: false,
        churnDepth: 0,
        lastCycleWasPerfect: false,
        executionSeconds: 6.0,
        bubblesThisCycle: 0,
        ...over,
    };
}

describe('machineSeconds', () => {
    it('divides the floor by the staffing efficiency', () => {
        expect(machineSeconds(assembly())).toBeCloseTo(4.348, 3);
        expect(machineSeconds(assembly({ efficiency: 0.6 }))).toBeCloseTo(8.333, 3);
    });

    it('re-arms a quarter faster after a perfect cycle', () => {
        expect(machineSeconds(assembly({ lastCycleWasPerfect: true }))).toBeCloseTo(3.261, 3);
    });

    it('slows a churn-sensitive machine and leaves the others alone', () => {
        const churned = { churnSensitive: true, churnDepth: 1, efficiency: 1, floorSeconds: 1.4 };

        expect(machineSeconds(assembly(churned))).toBeCloseTo(1.4 * 1.15, 10);
        expect(machineSeconds(assembly({ ...churned, churnDepth: 0.5 }))).toBeCloseTo(1.4 * 1.075, 10);
        expect(machineSeconds(assembly({ ...churned, churnSensitive: false }))).toBeCloseTo(1.4, 10);
    });

    it('clamps the churn depth to the 0–1 band', () => {
        const churned = { churnSensitive: true, efficiency: 1, floorSeconds: 1 };

        expect(machineSeconds(assembly({ ...churned, churnDepth: 4 }))).toBeCloseTo(1.15, 10);
        expect(machineSeconds(assembly({ ...churned, churnDepth: -2 }))).toBeCloseTo(1, 10);
    });

    it('never completes a cycle nobody is working', () => {
        expect(machineSeconds(assembly({ efficiency: 0 }))).toBe(Number.POSITIVE_INFINITY);
        expect(machineSeconds(assembly({ efficiency: -0.5 }))).toBe(Number.POSITIVE_INFINITY);
    });
});

describe('cycleSeconds', () => {
    it('lets the players set the pace at optimal staffing', () => {
        expect(cycleSeconds(assembly())).toBeCloseTo(6.0, 10);
    });

    it('lets the machine set the pace when the players are faster than it', () => {
        expect(cycleSeconds(assembly({ efficiency: 0.6, executionSeconds: 4 }))).toBeCloseTo(8.333, 3);
    });

    it('adds half a second for every "what can I do?" interruption', () => {
        expect(cycleSeconds(assembly({ bubblesThisCycle: 3 }))).toBeCloseTo(7.5, 10);
        expect(cycleSeconds(assembly({ bubblesThisCycle: 1 }))).toBeCloseTo(6.5, 10);
    });

    it('lets a hot slammer run at its floor', () => {
        const slammer = assembly({
            floorSeconds: 1.4,
            efficiency: 1.05,
            churnSensitive: true,
            executionSeconds: 1.0,
        });

        expect(cycleSeconds(slammer)).toBeCloseTo(1.4 / 1.05, 10);
        expect(cycleSeconds({ ...slammer, efficiency: 1 })).toBeCloseTo(1.4, 10);
    });

    it('never completes a cycle nobody is working', () => {
        expect(cycleSeconds(assembly({ efficiency: 0 }))).toBe(Number.POSITIVE_INFINITY);
    });
});
