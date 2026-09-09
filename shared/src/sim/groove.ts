import type { CleanSweepConfig, GrooveThresholds, GrooveWeights } from '../config/types';

/**
 * The Groove is one scalar the whole factory shares (docs/05). Rate terms
 * describe the state of the floor and integrate over the tick; event terms are
 * things that happened and count once, however long the tick was.
 */

export interface GrooveSample {
    onTimeShipRate: number;
    avgShelfFullness: number;
    floorItemCount: number;
    reworkShelfCount: number;
    starvedStationCount: number;
    jammedStationCount: number;
    litFuseCount: number;
}

export interface GrooveEvents {
    fizzles: number;
    niceSaves: number;
    blastKegs: number;
    primeSticks: number;
    trucksComplete: number;
}

export type GrooveBand = 'onFire' | 'groove' | 'baseline' | 'churn' | 'meltdown';

export interface CleanSweepState {
    heldSince: number | null;
    lastFiredAt: number | null;
}

export function grooveDelta(
    w: GrooveWeights,
    s: GrooveSample,
    e: GrooveEvents,
    dtSeconds: number,
): number {
    const rate =
        w.onTimeShip * s.onTimeShipRate +
        w.shelfFullness * s.avgShelfFullness +
        w.floorItem * s.floorItemCount +
        w.rework * s.reworkShelfCount +
        w.starved * s.starvedStationCount +
        w.jammed * s.jammedStationCount +
        w.litFuse * s.litFuseCount;

    // `truckComplete` is the one optional weight; `validateLevelConfig` fills it,
    // so only a hand-built weight set ever reaches here without one.
    const events =
        w.fizzle * e.fizzles +
        w.niceSave * e.niceSaves +
        w.blastKeg * e.blastKegs +
        w.primeStick * e.primeSticks +
        (w.truckComplete ?? 0) * e.trucksComplete;

    return dtSeconds * rate + events;
}

export function applyGroove(groove: number, delta: number): number {
    return Math.min(100, Math.max(0, groove + delta));
}

/** Checked from the bottom up, so exactly 10 is a meltdown and exactly 30 is the churn. */
export function grooveBand(groove: number, t: GrooveThresholds): GrooveBand {
    if (groove <= t.meltdown) return 'meltdown';
    if (groove <= t.churn) return 'churn';
    if (groove >= t.onFire) return 'onFire';
    if (groove >= t.groove) return 'groove';

    return 'baseline';
}

export function churnDepth(groove: number, t: GrooveThresholds): number {
    return Math.min(1, Math.max(0, (t.churn - groove) / t.churn));
}

/**
 * A tidy floor pays out, but only after it has stayed tidy — the hold is what
 * makes the DING mean someone cleared the pile rather than blinked past zero.
 */
export function cleanSweepStep(
    state: CleanSweepState,
    s: GrooveSample,
    clock: number,
    c: CleanSweepConfig,
): { state: CleanSweepState; fire: boolean } {
    const clean = s.floorItemCount === 0 && s.avgShelfFullness < 0.5 && s.reworkShelfCount === 0;

    if (!clean) return { state: { heldSince: null, lastFiredAt: state.lastFiredAt }, fire: false };

    const heldSince = state.heldSince ?? clock;
    const held = clock - heldSince >= c.holdSeconds;
    const cooled = state.lastFiredAt === null || clock - state.lastFiredAt >= c.cooldownSeconds;

    if (!held || !cooled) return { state: { ...state, heldSince }, fire: false };

    return { state: { heldSince: clock, lastFiredAt: clock }, fire: true };
}
