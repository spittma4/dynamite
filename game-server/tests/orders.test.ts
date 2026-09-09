import { describe, expect, it } from 'vitest';

import {
    orderSpecAt,
    orderStatusFor,
    qtyForTruck,
    scaleLevel,
    truckCredit,
    truckSchedule,
} from '../src/shared';
import type { LevelConfig, OrdersConfig, ScaledLevel } from '../src/shared';
import { activeOrderId, ensureOrder, settleOrder } from '../src/sim/orders';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The day's book (contracts §10.6, docs/06 and docs/18). One order per truck,
 * sized by the ramp and stamped with a fuse length the Dock checks — a short
 * fuse is two knots instead of three, so an unchecked one would be strictly
 * faster to make and the book would grade the wrong factory.
 */

const CFG: OrdersConfig = {
    firstAt: 20,
    everySeconds: 60,
    truckWaitSeconds: 20,
    mix: [{ type: 'red_stick', weight: 10 }],
    qtyPerTruck: { base: 8, rampPerMinute: 0.5 },
};

function sandboxLevel(level: LevelConfig): LevelConfig {
    level.day = { ...level.day, shiftSeconds: 0, orderBook: 0, endsOn: 'never' };
    level.scaling.breakpoints = level.scaling.breakpoints.map((b) => ({ ...b, orderBook: 0 }));

    return level;
}

function started(world: World): World {
    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

    return world;
}

function orderIds(world: World): string[] {
    const ids: string[] = [];

    world.state.orders.forEach((order) => ids.push(order.id));

    return ids;
}

describe('truckSchedule', () => {
    it('schedules truck k at firstAt + k · everySeconds and leaves truckWaitSeconds later', () => {
        expect(truckSchedule(CFG, 0)).toEqual({ index: 0, arrivesAt: 20, leavesAt: 40 });
        expect(truckSchedule(CFG, 1)).toEqual({ index: 1, arrivesAt: 80, leavesAt: 100 });
        expect(truckSchedule(CFG, 2)).toEqual({ index: 2, arrivesAt: 140, leavesAt: 160 });
    });
});

describe('qtyForTruck', () => {
    it('ramps 8 to 13 across the shift', () => {
        expect(qtyForTruck(CFG, 20)).toBe(8);
        expect(qtyForTruck(CFG, 80)).toBe(8);
        expect(qtyForTruck(CFG, 140)).toBe(9);
        expect(qtyForTruck(CFG, 620)).toBe(13);
    });
});

describe('orderSpecAt', () => {
    it('numbers the order and its truck from the index and takes the product from the mix', () => {
        const spec = orderSpecAt(CFG, 2, () => 0.6);

        expect(spec.id).toBe('o-3');
        expect(spec.truckId).toBe(3);
        expect(spec.product).toBe('red_stick');
        expect(spec.qty).toBe(9);
        expect(spec.arrivesAt).toBe(140);
        expect(spec.leavesAt).toBe(160);
    });

    it('takes the fuse length from the injected rng', () => {
        expect(orderSpecAt(CFG, 0, () => 0.4).fuseLength).toBe('short');
        expect(orderSpecAt(CFG, 0, () => 0.6).fuseLength).toBe('long');
    });
});

describe('orderStatusFor', () => {
    it('resolves complete, partial and failed against the quantity', () => {
        expect(orderStatusFor(8, 8)).toBe('complete');
        expect(orderStatusFor(8, 5)).toBe('partial');
        expect(orderStatusFor(8, 0)).toBe('failed');
    });
});

describe('truckCredit', () => {
    it('pays per stick and adds the order bonus only on a full truck', () => {
        expect(truckCredit(8, 8, 10, 100)).toEqual({ credit: 180, complete: true });
        expect(truckCredit(5, 8, 10, 100)).toEqual({ credit: 50, complete: false });
        expect(truckCredit(0, 8, 10, 100)).toEqual({ credit: 0, complete: false });
    });
});

describe('initOrders', () => {
    it('fills the book and arms truck 1', () => {
        const world = started(makeWorld());

        expect(world.state.bookTotal).toBe(11);
        expect(world.state.bookRemaining).toBe(11);
        expect(orderIds(world)).toEqual([
            'o-1',
            'o-2',
            'o-3',
            'o-4',
            'o-5',
            'o-6',
            'o-7',
            'o-8',
            'o-9',
            'o-10',
            'o-11',
        ]);

        const first = world.state.orders.get('o-1');

        expect(first?.qty).toBe(8);
        expect(first?.shipped).toBe(0);
        expect(first?.status).toBe('open');
        expect(first?.truckId).toBe(1);
        expect(['short', 'long']).toContain(first?.fuseLength);
        expect(world.state.orders.get('o-3')?.qty).toBe(9);

        expect(world.state.truck.id).toBe(1);
        expect(world.state.truck.phase).toBe('away');
        expect(world.state.truck.arrivesAt).toBe(20);
        expect(world.state.truck.leavesAt).toBe(40);
        expect(world.state.truck.slots).toBe(8);
        expect(world.state.truck.loaded).toBe(0);
    });

    it('creates only the armed truck order in Sandbox and keeps the book at zero', () => {
        const world = started(makeWorld({ level: sandboxLevel(makeWorld().level) }));

        expect(world.state.bookTotal).toBe(0);
        expect(world.state.bookRemaining).toBe(0);
        expect(orderIds(world)).toEqual(['o-1']);
        expect(world.state.truck.arrivesAt).toBe(20);
    });
});

describe('ensureOrder', () => {
    it('is a no-op on a book level and stops at the end of the book', () => {
        const world = started(makeWorld());

        expect(ensureOrder(world, 0)?.id).toBe('o-1');
        expect(world.state.orders.size).toBe(11);
        expect(ensureOrder(world, 11)).toBeNull();
    });

    it('is the only order source in Sandbox', () => {
        const world = started(makeWorld({ level: sandboxLevel(makeWorld().level) }));

        expect(ensureOrder(world, 1)?.id).toBe('o-2');
        expect(world.state.orders.get('o-2')?.qty).toBe(8);
        expect(orderIds(world)).toEqual(['o-1', 'o-2']);
    });
});

describe('activeOrderId', () => {
    it('is the lowest-numbered open order, counting numerically', () => {
        const world = started(makeWorld());

        expect(activeOrderId(world)).toBe('o-1');

        for (let n = 1; n <= 9; n++) settleOrder(world, `o-${n}`, 8);

        expect(activeOrderId(world)).toBe('o-10');
    });

    it('is empty when nothing is open', () => {
        const world = started(makeWorld());

        for (let n = 1; n <= 11; n++) settleOrder(world, `o-${n}`, 0);

        expect(activeOrderId(world)).toBe('');
    });
});

describe('settleOrder', () => {
    it('writes the shipped count and the resolved status', () => {
        const world = started(makeWorld());

        expect(settleOrder(world, 'o-1', 5)).toBe('partial');
        expect(world.state.orders.get('o-1')?.shipped).toBe(5);
        expect(world.state.orders.get('o-1')?.status).toBe('partial');
        expect(settleOrder(world, 'o-2', 8)).toBe('complete');
        expect(settleOrder(world, 'o-3', 0)).toBe('failed');
    });
});
