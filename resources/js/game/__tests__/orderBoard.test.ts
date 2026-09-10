import type { LevelConfig, OrdersConfig } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    BOARD_HINT,
    type BoardOrder,
    type BoardView,
    compareOrderIds,
    orderBoardRows,
    wallBoardLine,
} from '../ui/orderBoard';
import { NOTHING_ON_THE_BOARD, TRUCK_LEAVING, truckIn, truckLeaves } from '../nouns';
import { truckHeadline } from '../minigames/Dock';
import { bayLabel } from '../minigames/dock/BayWall';

/**
 * The board is what a player reads mid-shift with a keg in their hands, so
 * every case here is one of those reads: what am I building, how far in is it,
 * and how long has it got. It printed `o-1  red_stick  0/7  open` before —
 * three of the four columns were database, and the fuse the whole line has to
 * match was on no surface at all.
 */

const RECIPES = {
    keg: { station: 'boom_powder', inputs: {}, output: { type: 'keg', pours: 2 } },
    red_stick: {
        station: 'assembly',
        inputs: { casing: 1 },
        output: { type: 'stick', product: 'red_stick' },
    },
} as unknown as LevelConfig['recipes'];

// The shipped levels' timetable: truck 1 backs in at 0:20 and pulls out at 0:40,
// truck 2 at 1:20, truck 3 at 2:20 (`truckSchedule`, shared/src/sim/orders.ts).
const TIMETABLE: OrdersConfig = {
    firstAt: 20,
    everySeconds: 60,
    truckWaitSeconds: 20,
    mix: [{ type: 'red_stick', weight: 10 }],
    qtyPerTruck: { base: 7, rampPerMinute: 0.25 },
};

function order(over: Partial<BoardOrder> = {}): BoardOrder {
    return {
        id: 'o-1',
        product: 'red_stick',
        qty: 8,
        shipped: 0,
        status: 'open',
        fuseLength: 'long',
        truckId: 1,
        ...over,
    };
}

function view(over: Partial<BoardView> = {}): BoardView {
    return {
        now: 0,
        orders: TIMETABLE,
        recipes: RECIPES,
        truck: { id: 1, phase: 'away' },
        ...over,
    };
}

describe('orderBoardRows', () => {
    it('names the fuse, the count and the truck instead of the record', () => {
        const rows = orderBoardRows([order({ fuseLength: 'short', shipped: 3 })], view());

        expect(rows).toHaveLength(1);
        expect(rows[0]?.text).toContain('SHORT FUSE');
        expect(rows[0]?.text).toContain('3/8 STICKS');
        expect(rows[0]?.text).toContain(truckIn(20));
    });

    it('never lets an id or a recipe key reach the panel', () => {
        const rows = orderBoardRows(
            [
                order({ id: 'o-1', status: 'complete', shipped: 8 }),
                order({ id: 'o-2', truckId: 2 }),
            ],
            view({ now: 45 }),
        );

        for (const row of rows) {
            expect(row.text).not.toMatch(/o-\d/);
            expect(row.text).not.toContain('red_stick');
            expect(row.text).not.toMatch(/_/);
        }
    });

    /** The place a row is in is the same place the Jig's rack strip calls it. */
    it('puts the order the line is building first and calls it 1st', () => {
        const rows = orderBoardRows(
            [
                order({ id: 'o-3', truckId: 3 }),
                order({ id: 'o-1', truckId: 1, status: 'complete', shipped: 8 }),
                order({ id: 'o-2', truckId: 2 }),
            ],
            view({ now: 45 }),
        );

        expect(rows[0]?.text.startsWith('1st')).toBe(true);
        expect(rows[1]?.text.startsWith('2nd')).toBe(true);
        expect(rows[2]?.text.startsWith(' ')).toBe(true);
    });

    it('marks the order the line is building', () => {
        const rows = orderBoardRows([order({ truckId: 2 })], view({ now: 0 }));

        expect(rows[0]?.tone).toBe('now');
    });

    it('counts a part-shipped order against what the truck wanted', () => {
        const rows = orderBoardRows([order({ shipped: 5, qty: 8 })], view());

        expect(rows[0]?.text).toContain('5/8 STICKS');
    });

    it('reads a shipped order as shipped, not as a status column', () => {
        const rows = orderBoardRows(
            [order({ status: 'complete', shipped: 8 })],
            view({ now: 45 }),
        );

        expect(rows[0]?.text).toContain('SHIPPED');
        expect(rows[0]?.text).not.toContain('complete');
        expect(rows[0]?.tone).toBe('done');
    });

    it('says what happened to a truck that left short or left empty', () => {
        const [short] = orderBoardRows([order({ status: 'partial', shipped: 3 })], view());
        const [empty] = orderBoardRows([order({ status: 'failed' })], view());

        expect(short?.text).toContain('PART SHIPPED');
        expect(empty?.text).toContain('MISSED');
    });

    it('counts down the truck that is at the dock now', () => {
        const rows = orderBoardRows(
            [order({ truckId: 1 })],
            view({ now: 28, truck: { id: 1, phase: 'docked' } }),
        );

        expect(rows[0]?.text).toContain(truckLeaves(12));
        expect(rows[0]?.tone).toBe('urgent');
    });

    it('shouts the order whose truck is seconds from pulling out', () => {
        const rows = orderBoardRows(
            [order({ truckId: 1, shipped: 6 })],
            view({ now: 37, truck: { id: 1, phase: 'docked' } }),
        );

        expect(rows[0]?.text).toContain(truckLeaves(3));
        expect(rows[0]?.tone).toBe('urgent');
    });

    it('says a truck is going once it has pulled off the dock', () => {
        const rows = orderBoardRows(
            [order({ truckId: 1 })],
            view({ now: 41, truck: { id: 1, phase: 'leaving' } }),
        );

        expect(rows[0]?.text).toContain(TRUCK_LEAVING);
    });

    it('counts the next truck in while it is still on the road', () => {
        const rows = orderBoardRows(
            [order({ id: 'o-2', truckId: 2 })],
            view({ now: 45, truck: { id: 2, phase: 'away' } }),
        );

        expect(rows[0]?.text).toContain(truckIn(35));
        expect(rows[0]?.tone).toBe('now');
    });

    it('has nothing to say about an empty book', () => {
        expect(orderBoardRows([], view())).toEqual([]);
    });

    it('lines the columns up so the board reads down as well as across', () => {
        const rows = orderBoardRows(
            [order({ id: 'o-1', fuseLength: 'short' }), order({ id: 'o-2', truckId: 2, qty: 10 })],
            view(),
        );
        const columns = rows.map((row) => row.text.indexOf('TRUCK IN'));

        expect(columns[0]).toBe(columns[1]);
    });
});

/**
 * The wall board at [18,3] drew the word ORDERS and nothing else, and it is the
 * one surface between Assembly and the Dock that every hauler walks past. The
 * fuse a stick has to carry was on the Tab board and in the Jig's own overlay
 * and nowhere in world space — so the hauler who eats the WRONG FUSE bonk at the
 * ramp had no way to see the requirement from where they were standing.
 */
describe('wallBoardLine', () => {
    it('names the fuse the order at the top of the book wants', () => {
        expect(wallBoardLine([order({ id: 'o-2', fuseLength: 'short' })])).toBe('SHORT FUSE');
    });

    it('reads the book in order, not in arrival order', () => {
        const orders = [
            order({ id: 'o-10', fuseLength: 'short' }),
            order({ id: 'o-2', fuseLength: 'long' }),
        ];

        expect(wallBoardLine(orders)).toBe('LONG FUSE');
    });

    it('skips an order that is already settled', () => {
        const orders = [
            order({ id: 'o-1', fuseLength: 'short', status: 'shipped' }),
            order({ id: 'o-2', fuseLength: 'long' }),
        ];

        expect(wallBoardLine(orders)).toBe('LONG FUSE');
    });

    it('says the empty book in the words every other surface uses', () => {
        expect(wallBoardLine([])).toBe(NOTHING_ON_THE_BOARD);
    });

    /**
     * The same wording the Tab board's own fuse column uses, so the wall and the
     * clipboard are one sentence rather than two spellings.
     */
    it('quotes the column the Tab board already prints', () => {
        const orders = [order({ id: 'o-1', fuseLength: 'long' })];
        const row = orderBoardRows(orders, view())[0];

        expect(row?.text).toContain(wallBoardLine(orders));
    });
});

describe('BOARD_HINT', () => {
    it('says why the fuse column is there at all', () => {
        expect(BOARD_HINT).toMatch(/fuse/i);
        expect(BOARD_HINT).toMatch(/dock/i);
    });
});

describe('NOTHING_ON_THE_BOARD', () => {
    it('is the one phrase for a book with nothing on it', () => {
        expect(NOTHING_ON_THE_BOARD).toBe('NOTHING ON THE BOARD');
    });
});

describe('compareOrderIds', () => {
    it('reads the book in number order, not string order', () => {
        const ids = ['o-10', 'o-2', 'o-1', 'o-11', 'o-3'];

        expect([...ids].sort(compareOrderIds)).toEqual(['o-1', 'o-2', 'o-3', 'o-10', 'o-11']);
    });

    it('falls back to string order for an id that carries no number', () => {
        expect(compareOrderIds('order-a', 'order-b')).toBeLessThan(0);
        expect(compareOrderIds('o-4', 'o-4')).toBe(0);
    });
});

/**
 * The three surfaces a player compares in the last thirty seconds of a truck.
 * They used to say the arrival three ways — 'TRUCK IN', 'NEXT TRUCK', 'NEXT' —
 * and the departure two, on panels read seconds apart: the board in one hand,
 * the dock panel under their nose, the bay wall over the doorway. One clock,
 * one sentence, built in `nouns.ts` so no surface can word it for itself.
 */
describe('one clock, one sentence', () => {
    const DOCKED = {
        lanes: [],
        beepAt: 0,
        beepPeriodMs: 1000,
        okMs: 180,
        perfectMs: 70,
        tailgateUntil: 0,
        returnsTile: [0, 0],
        truck: { id: 1, phase: 'docked', loaded: 3, slots: 8, arrivesAt: 20, leavesAt: 40 },
    } as unknown as Parameters<typeof truckHeadline>[0];
    const AWAY = {
        ...DOCKED,
        truck: { ...(DOCKED as { truck: object }).truck, phase: 'away', arrivesAt: 80 },
    } as typeof DOCKED;

    it('counts a truck in the same way on the board, the panel and the wall', () => {
        const board = orderBoardRows(
            [order({ truckId: 2 })],
            view({ now: 45, truck: { id: 2, phase: 'away' } }),
        );

        expect(board[0]?.text).toContain(truckIn(35));
        expect(truckHeadline(AWAY, 45)).toContain(truckIn(35));
        expect(bayLabel(AWAY, 45).text).toBe(truckIn(35));
    });

    it('counts a truck out the same way on all three', () => {
        const board = orderBoardRows(
            [order({ truckId: 1 })],
            view({ now: 28, truck: { id: 1, phase: 'docked' } }),
        );

        expect(board[0]?.text).toContain(truckLeaves(12));
        expect(truckHeadline(DOCKED, 28)).toContain(truckLeaves(12));
        expect(bayLabel(DOCKED, 28).text).toBe(truckLeaves(12));
    });

    it('spells the two clock phrases out in nouns.ts and nowhere else', () => {
        expect(truckIn(35)).toBe('TRUCK IN 00:35');
        expect(truckLeaves(12)).toBe('TRUCK LEAVES 00:12');
        expect(TRUCK_LEAVING).toBe('TRUCK LEAVING');
    });
});
