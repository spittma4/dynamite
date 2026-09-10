import { type StaffingCurve, efficiencyFor } from '@shared';

/**
 * What a helper is told (N4). The report was "you can 'sit'/press E and get stuck
 * on the squares around a station", and the stuck was literal — the server pinned
 * a helper's legs and the client mounted nothing, so a press on an aisle tile cost
 * you your body and told you neither that you had joined nor how to get out.
 *
 * The panel a helper gets instead is not a mini-game: a helper has no gesture, and
 * showing them an operator's console would be a second lie. It is three lines —
 * where you are, what your being there does to the machine, and the way out.
 *
 * The middle line is the allegory said out loud, and it is read off the same
 * `staffing` curve the server bills throughput against, never written by hand.
 * docs/05: Boom Powder peaks at two bodies, so the one helper it has room for
 * genuinely speeds it up. Assembly has **two** work tiles and **four** posts, so
 * its first helper is the third body and every shipped curve pays for that one
 * (1.15 against 1.00); it is the *second* helper, the fourth body, that
 * `level-04-too-many-helpers` punishes — 0.8 against 1.15, a third of the machine's
 * output. A panel that said "an extra pair of hands still speeds this station up"
 * was wrong at the fourth body and right at the third, which is exactly the "not
 * entirely accurate" signage the same playtest complained about: the curve is the
 * only thing that knows which body you are, so the curve is what `helperNotice`
 * reads.
 */

export interface HelperNotice {
    title: string;
    /** The curve's verdict on this body, in the numbers it was billed at. */
    effect: string;
    exit: string;
    /** Whether this body is worth its floor space; the panel's colour reads it. */
    helping: boolean;
}

/** One body's worth of difference to the machine, as a signed percentage. */
export function helperMargin(curve: StaffingCurve, workers: number): number {
    if (workers <= 0) return 0;

    return efficiencyFor(curve, workers) - efficiencyFor(curve, workers - 1);
}

function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function hands(count: number): string {
    return count === 1 ? '1 PAIR OF HANDS' : `${count} PAIRS OF HANDS`;
}

export function helperNotice(
    stationLabel: string,
    curve: StaffingCurve,
    workers: number,
): HelperNotice {
    const margin = helperMargin(curve, workers);
    const withYou = efficiencyFor(curve, Math.max(workers, 1));
    const withoutYou = efficiencyFor(curve, Math.max(workers - 1, 0));
    const helping = margin > 0;

    return {
        title: helping ? `HELPING AT ${stationLabel}` : `IN THE WAY AT ${stationLabel}`,
        effect:
            margin === 0
                ? `${stationLabel} runs at ${percent(withYou)} with you or without you`
                : `${percent(withYou)} with ${hands(workers)} · ${percent(withoutYou)} without you`,
        // Three ways out, and the first one is the one a player finds by accident,
        // so it leads: since N4 a helper keeps their legs and stepping off the
        // post is a leave. The two keys are named because `E` is the press that
        // got you here and a player who has not found `ESC` should not have to.
        exit: 'STEP OFF THE POST TO LEAVE · OR PRESS E / ESC',
        helping,
    };
}
