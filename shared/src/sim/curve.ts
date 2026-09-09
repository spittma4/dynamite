import type { StaffingCurve } from '../config/types';

/**
 * The staffing curve is the authoritative throughput calculation (docs/05); the
 * bodies in the aisle are the explanation the player sees for it.
 */

interface CurvePoint {
    workers: number;
    value: number;
}

function pointsOf(curve: StaffingCurve): CurvePoint[] {
    const points = Object.entries(curve)
        .map(([key, value]) => ({ workers: Number(key), value }))
        .sort((a, b) => a.workers - b.workers);

    if (points.length === 0) throw new RangeError('staffing curve is empty');

    return points;
}

/**
 * Missing keys interpolate; above the largest key the curve holds, so piling on
 * bodies past the end of the table stops helping rather than falling off it.
 */
export function efficiencyFor(curve: StaffingCurve, workers: number): number {
    if (!Number.isInteger(workers) || workers < 0) {
        throw new RangeError(`workers must be a non-negative integer, got ${workers}`);
    }

    const points = pointsOf(curve);

    if (workers === 0) return 0;

    const last = points[points.length - 1] as CurvePoint;

    if (workers >= last.workers) return last.value;

    const aboveIndex = points.findIndex((point) => point.workers >= workers);
    const above = points[aboveIndex] as CurvePoint;

    if (above.workers === workers) return above.value;

    // The implicit (0, 0) below the smallest key keeps a solo worker on a curve
    // that starts at 2 from reading as fully efficient.
    const below = points[aboveIndex - 1] ?? { workers: 0, value: 0 };
    const span = above.workers - below.workers;

    return below.value + ((above.value - below.value) * (workers - below.workers)) / span;
}

/** The smallest worker count that reaches the curve's maximum. */
export function peakWorkers(curve: StaffingCurve): number {
    const points = pointsOf(curve);
    let peak = points[0] as CurvePoint;

    for (const point of points) {
        if (point.value > peak.value) peak = point;
    }

    return peak.workers;
}
