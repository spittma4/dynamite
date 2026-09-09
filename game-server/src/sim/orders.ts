import { OrderState, orderSpecAt, orderStatusFor, qtyForTruck, truckSchedule } from '../shared';
import type { OrderStatus } from '../shared';
import type { World } from './World';

/**
 * The book as world state (contracts §10.6). A book level knows every order at
 * the whistle so the order board can show the day ahead; Sandbox has no book at
 * all and mints each order as its truck is armed, which is why both paths meet
 * in `ensureOrder` rather than in two copies of the same constructor.
 */

function idFor(index: number): string {
    return `o-${index + 1}`;
}

/** `o-10` sorts before `o-9` as text, and the active order is the day's next job. */
function indexOf(id: string): number {
    const parsed = Number.parseInt(id.slice(2), 10);

    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function createOrder(world: World, index: number): OrderState {
    const spec = orderSpecAt(world.level.orders, index, () => world.rng.next());
    const order = new OrderState();

    order.id = spec.id;
    order.product = spec.product;
    order.qty = spec.qty;
    order.shipped = 0;
    order.status = 'open';
    order.truckId = spec.truckId;
    order.fuseLength = spec.fuseLength;

    world.state.orders.set(order.id, order);

    return order;
}

/**
 * The dock system's `onStart`. The book is fixed here and only ever shrinks, so
 * `bookRemaining` reaching 0 is F03's signal to end the day and never ours.
 */
export function initOrders(world: World): void {
    const { state } = world;
    const cfg = world.level.orders;
    const book = Math.max(0, world.level.day.orderBook);

    state.orders.clear();
    state.bookTotal = book;
    state.bookRemaining = book;

    for (let index = 0; index < book; index++) createOrder(world, index);

    ensureOrder(world, 0);

    const slot = truckSchedule(cfg, 0);
    const { truck } = state;

    truck.id = 1;
    truck.phase = 'away';
    truck.arrivesAt = slot.arrivesAt;
    truck.leavesAt = slot.leavesAt;
    truck.slots = qtyForTruck(cfg, slot.arrivesAt);
    truck.loaded = 0;
    truck.beepPhase = 0;
}

/**
 * The order the truck being armed will carry: already there on a book level, and
 * created on demand in Sandbox, where the trucks never stop coming.
 */
export function ensureOrder(world: World, index: number): OrderState | null {
    const existing = world.state.orders.get(idFor(index));

    if (existing !== undefined) return existing;
    if (index < world.state.bookTotal || world.level.day.endsOn === 'never') {
        return createOrder(world, index);
    }

    return null;
}

/** What the Jig is building for and what the Dock checks a fuse against. */
export function activeOrderId(world: World): string {
    let found = '';
    let lowest = Number.MAX_SAFE_INTEGER;

    world.state.orders.forEach((order) => {
        if (order.status !== 'open') return;

        const index = indexOf(order.id);

        if (index >= lowest) return;

        lowest = index;
        found = order.id;
    });

    return found;
}

export function settleOrder(world: World, orderId: string, shipped: number): OrderStatus {
    const order = world.state.orders.get(orderId);

    if (order === undefined) return 'failed';

    const status = orderStatusFor(order.qty, shipped);

    order.shipped = shipped;
    order.status = status;

    return status;
}
