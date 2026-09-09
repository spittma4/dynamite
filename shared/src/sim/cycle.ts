import { CYCLE } from './constants';

/**
 * Every station is player-paced (docs/05): the mini-game sets the cycle and the
 * machine only imposes a floor, so a rhythm game never waits on a dead gap.
 */

export interface CycleInputs {
    floorSeconds: number;
    efficiency: number;
    churnSensitive: boolean;
    churnDepth: number;
    lastCycleWasPerfect: boolean;
    executionSeconds: number;
    bubblesThisCycle: number;
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

/** The machine's re-arm floor: unreachable at zero efficiency, so it never completes. */
export function machineSeconds(i: CycleInputs): number {
    if (i.efficiency <= 0) return Number.POSITIVE_INFINITY;

    const churnFactor = i.churnSensitive
        ? 1 + (CYCLE.churnFactorMax - 1) * clamp01(i.churnDepth)
        : 1;
    const perfectFactor = i.lastCycleWasPerfect ? CYCLE.perfectRearmFactor : 1;

    return (i.floorSeconds / i.efficiency) * churnFactor * perfectFactor;
}

export function cycleSeconds(i: CycleInputs): number {
    const interruptSeconds = CYCLE.interruptSecondsPerBubble * i.bubblesThisCycle;

    return Math.max(i.executionSeconds + interruptSeconds, machineSeconds(i));
}
