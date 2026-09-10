import type { FuseLength, LevelConfig, OrderState, OrdersConfig, TruckPhase } from '@shared';
import { truckSchedule } from '@shared';

import { fuseLabel, orderPlace } from '../minigames/Jig';
import { NOTHING_ON_THE_BOARD, TRUCK_LEAVING, truckIn, truckLeaves } from '../nouns';
import { productPlural } from '../render/dropTargets';

/**
 * The `Tab` board (F04 §8). It used to print the record — `o-1  red_stick  0/7
 * open` — which is four columns of which three are database and none is the
 * thing the player pressed Tab to find out. This is the same book written as a
 * job list: what the line is building now, which fuse it has to carry, how far
 * in it is, and how long the truck will wait.
 *
 * Every word here is somebody else's already: the place is the Jig rack's
 * `orderPlace`, the fuse is its `fuseLabel`, the noun is the floor signs'
 * `pluralOf`, and the truck clock is `nouns.ts`'s, word for word the one the
 * dock panel and the bay wall say.
 */

/** How loud a row is. Waiting is not the same message as a truck on the clock. */
export type OrderTone = 'now' | 'urgent' | 'waiting' | 'done';

export interface BoardRow {
    text: string;
    tone: OrderTone;
}

/** The order fields a row is built from (contracts §3). */
export type BoardOrder = Pick<
    OrderState,
    'id' | 'product' | 'qty' | 'shipped' | 'status' | 'fuseLength' | 'truckId'
>;

export interface BoardView {
    /** The `ServerClock` estimate of `FactoryState.clock`, in seconds. */
    now: number;
    /** The timetable every truck runs on, off the scaled level. */
    orders: OrdersConfig;
    recipes: LevelConfig['recipes'];
    truck: { id: number; phase: TruckPhase };
}

/**
 * Why the fuse is on the board at all. `bPick` in `shared/src/sim/jig.ts` sets
 * the rack to the first open order's fuse and tells nobody, and the dock
 * answers a mismatch with a wordless WRONG FUSE — so the one number that
 * decides whether an hour of work ships was on no surface a player can read.
 */
export const BOARD_HINT =
    'The whole line builds the top row. The dock turns away a stick with the wrong fuse.';

const PLACE_WIDTH = 5;
const FUSE_WIDTH = 12;
const COUNT_WIDTH = 13;

/** What became of an order once its truck pulled out, in the truck's own terms. */
const OUTCOME: Record<string, string> = {
    complete: 'SHIPPED',
    partial: 'PART SHIPPED',
    failed: 'MISSED',
};

/**
 * Order ids are `o-<n>` (contracts §3), so plain string order lists a book of
 * ten as `o-1, o-10, o-2`.
 */
export function compareOrderIds(a: string, b: string): number {
    const left = Number(a.slice(2));
    const right = Number(b.slice(2));

    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;

    return a.localeCompare(b);
}

/**
 * When this order's truck is on the dock and how long it will sit there. The
 * timetable is arithmetic on the shift clock and a tailgate slam never moves
 * the next truck, so the row for a truck eleven minutes out is as exact as the
 * row for the one being loaded; the live `TruckState` is only needed to know
 * that the current one has already pulled off.
 */
function truckCell(order: BoardOrder, view: BoardView): { text: string; urgent: boolean } {
    const slot = truckSchedule(view.orders, order.truckId - 1);

    if (view.truck.id === order.truckId && view.truck.phase === 'leaving') {
        return { text: TRUCK_LEAVING, urgent: true };
    }

    if (view.now < slot.arrivesAt) {
        return { text: truckIn(slot.arrivesAt - view.now), urgent: false };
    }

    return { text: truckLeaves(slot.leavesAt - view.now), urgent: true };
}

function rowFor(order: BoardOrder, place: string, view: BoardView): BoardRow {
    const closed = order.status !== 'open';
    const cell = closed
        ? { text: OUTCOME[order.status] ?? '', urgent: false }
        : truckCell(order, view);
    const count = `${order.shipped}/${order.qty} ${productPlural(order.product, view.recipes)}`;
    const text =
        place.padEnd(PLACE_WIDTH) +
        `${fuseLabel(order.fuseLength as FuseLength)} FUSE`.padEnd(FUSE_WIDTH) +
        count.padEnd(COUNT_WIDTH) +
        cell.text;

    if (closed) return { text, tone: 'done' };
    if (cell.urgent) return { text, tone: 'urgent' };

    return { text, tone: place === orderPlace(0) ? 'now' : 'waiting' };
}

/**
 * The one line the board prop on the wall carries, under the word ORDERS: what
 * the order being worked wants. The wall at [18,3] is the surface every hauler
 * walks past between Assembly and the Dock, and it drew nothing but its own name
 * — so the only place the required length appeared in world space was the rack,
 * which a hauler never stands at. The wording is the Tab board's own fuse column,
 * so the two cannot drift into two spellings.
 */
export function wallBoardLine(orders: Iterable<BoardOrder>): string {
    const open: BoardOrder[] = [];

    for (const order of orders) if (order.status === 'open') open.push(order);

    open.sort((a, b) => compareOrderIds(a.id, b.id));

    const first = open[0];

    if (first === undefined) return NOTHING_ON_THE_BOARD;

    return `${fuseLabel(first.fuseLength as FuseLength)} FUSE`;
}

/**
 * The book as rows. Open orders lead, in book order, because the answer to
 * "what do I make" is always the top row — a day's book runs to thirteen
 * trucks, and by the last one every dead row would have been above it. Their
 * places are counted over the open orders alone, so the board's 1st and the
 * Jig rack strip's 1st are the same order.
 */
export function orderBoardRows(orders: Iterable<BoardOrder>, view: BoardView): BoardRow[] {
    const open: BoardOrder[] = [];
    const closed: BoardOrder[] = [];

    for (const order of orders) (order.status === 'open' ? open : closed).push(order);

    open.sort((a, b) => compareOrderIds(a.id, b.id));
    closed.sort((a, b) => compareOrderIds(a.id, b.id));

    return [
        ...open.map((order, index) => rowFor(order, orderPlace(index), view)),
        ...closed.map((order) => rowFor(order, '', view)),
    ];
}
