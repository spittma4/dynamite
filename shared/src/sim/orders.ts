import type { OrdersConfig } from '../config/types';
import type { FuseLength, OrderStatus } from '../schema/types';

/**
 * The day's book (docs/06, docs/18). Every truck is one order: how big it is,
 * when it backs up, and which fuse it wants. All of it is arithmetic on the
 * shift clock, so the same functions answer for the truck that is here now and
 * for the one eleven minutes out that the order board is already showing.
 */

export interface ShoveWindows {
    perfectMs: number;
    okMs: number;
}

export interface TruckSlot {
    index: number;
    arrivesAt: number;
    leavesAt: number;
}

export interface OrderSpec {
    id: string;
    product: string;
    qty: number;
    truckId: number;
    arrivesAt: number;
    leavesAt: number;
    fuseLength: FuseLength;
}

/** Trucks run on a fixed timetable: a tailgate slam never moves the next one. */
export function truckSchedule(cfg: OrdersConfig, index: number): TruckSlot {
    const arrivesAt = cfg.firstAt + index * cfg.everySeconds;

    return { index, arrivesAt, leavesAt: arrivesAt + cfg.truckWaitSeconds };
}

/** 8 · 8 · 9 · 9 … 13 across a ten-minute shift — docs/04's "8–13 sticks". */
export function qtyForTruck(cfg: OrdersConfig, arrivesAt: number): number {
    const { base, rampPerMinute } = cfg.qtyPerTruck;

    return Math.floor(base + (rampPerMinute * arrivesAt) / 60);
}

export function orderSpecAt(cfg: OrdersConfig, index: number, rng: () => number): OrderSpec {
    const slot = truckSchedule(cfg, index);

    return {
        id: `o-${index + 1}`,
        product: cfg.mix[0]?.type ?? 'red_stick',
        qty: qtyForTruck(cfg, slot.arrivesAt),
        truckId: index + 1,
        arrivesAt: slot.arrivesAt,
        leavesAt: slot.leavesAt,
        fuseLength: rng() < 0.5 ? 'short' : 'long',
    };
}

/** An order the truck left empty failed; one stick short is still a delivery. */
export function orderStatusFor(
    qty: number,
    shipped: number,
): Extract<OrderStatus, 'complete' | 'partial' | 'failed'> {
    if (shipped >= qty) return 'complete';

    return shipped > 0 ? 'partial' : 'failed';
}

export function truckCredit(
    loaded: number,
    slots: number,
    pricePerStick: number,
    perOrder: number,
): { credit: number; complete: boolean } {
    const complete = slots > 0 && loaded >= slots;

    return { credit: loaded * pricePerStick + (complete ? perOrder : 0), complete };
}
