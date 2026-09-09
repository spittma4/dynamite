import type { MoveInput, SolidFn } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    DEADBAND_TILES,
    LAG_ALPHA,
    LAG_INITIAL_MS,
    LAG_MAX_MS,
    LAG_MIN_MS,
    NUDGE,
    SNAP_TILES,
} from '../constants';
import { OwnPrediction } from '../predict/reconcile';

/** An empty floor: prediction is about the netcode, not the walls. */
const OPEN: SolidFn = () => false;

/** A wall down the column at `tx = 3`, to prove the radius reaches `stepPosition`. */
const WALL_AT_3: SolidFn = (tx) => tx === 3;

const EAST: MoveInput = { dx: 1, dy: 0 };
const STILL: MoveInput = { dx: 0, dy: 0 };

function prediction(isSolid: SolidFn = OPEN, radius = 0.35): OwnPrediction {
    const predict = new OwnPrediction({ isSolid, radius });

    predict.reset(1, 1, 0, 0);

    return predict;
}

/** Walks east for `ms` in 100 ms frames, so the history has something to look back through. */
function walkEast(predict: OwnPrediction, fromMs: number, ms: number, speed = 4): number {
    let now = fromMs;

    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
        now += 100;
        predict.step(EAST, 0.1, speed, now);
    }

    return now;
}

describe('OwnPrediction.step', () => {
    it('advances the position with the server speed through stepPosition', () => {
        const predict = prediction();

        predict.step(EAST, 0.5, 4, 500);

        expect(predict.x).toBeCloseTo(3, 10);
        expect(predict.y).toBeCloseTo(1, 10);
        expect(predict.moving).toBe(true);
        expect(predict.facing).toBe(0);
    });

    it('stops at the player radius from a wall rather than inside it', () => {
        const predict = prediction(WALL_AT_3, 0.35);

        // A tile per step: `stepPosition` only tests the tile the step lands
        // in, so a stride wider than a tile is the caller's bug, not a wall's.
        for (let step = 1; step <= 4; step++) predict.step(EAST, 0.25, 4, step * 250);

        expect(predict.x).toBeLessThan(3 - 0.35 + 1e-6);
        expect(predict.x).toBeGreaterThan(3 - 0.35 - 1e-3);
    });

    it('keeps the previous facing while the intent is zero', () => {
        const predict = prediction();

        predict.step(EAST, 0.1, 4, 100);
        predict.step(STILL, 0.1, 4, 200);

        expect(predict.facing).toBe(0);
        expect(predict.moving).toBe(false);
    });
});

describe('OwnPrediction.historyAt', () => {
    it('interpolates a position between two samples', () => {
        const predict = prediction();

        predict.step(EAST, 0.25, 4, 1000);
        predict.step(EAST, 0.25, 4, 2000);

        expect(predict.historyAt(1500)?.x).toBeCloseTo(2.5, 10);
    });

    it('returns the newest sample when the lookup is newer than the history', () => {
        const predict = prediction();

        predict.step(EAST, 0.25, 4, 1000);

        expect(predict.historyAt(9000)?.x).toBeCloseTo(2, 10);
    });

    it('returns the oldest sample when the lookup is older than the history', () => {
        const predict = prediction();

        predict.step(EAST, 0.25, 4, 1000);

        expect(predict.historyAt(-9000)?.x).toBeCloseTo(1, 10);
    });
});

describe('OwnPrediction lag estimate', () => {
    it('updates the lag from the seq echo with the EMA', () => {
        const predict = prediction();

        predict.noteSent(1, EAST, 1000);
        walkEast(predict, 1000, 300);
        predict.reconcile({ x: predict.x, y: predict.y, seq: 1, speed: 4 }, 1300);

        const expected = LAG_INITIAL_MS + LAG_ALPHA * (300 - LAG_INITIAL_MS);

        expect(predict.lagMs).toBeCloseTo(expected, 10);
    });

    it('clamps the lag to the 30–500 ms window', () => {
        const predict = prediction();
        let seq = 0;
        let now = 0;

        for (let i = 0; i < 200; i++) {
            seq += 1;
            predict.noteSent(seq, STILL, now);
            now += 5000;
            predict.step(STILL, 0.1, 4, now);
            predict.reconcile({ x: predict.x, y: predict.y, seq, speed: 4 }, now);
        }

        expect(predict.lagMs).toBe(LAG_MAX_MS);
        expect(predict.lagMs).toBeLessThanOrEqual(LAG_MAX_MS);
        expect(predict.lagMs).toBeGreaterThanOrEqual(LAG_MIN_MS);
    });

    it('ignores a seq it never sent', () => {
        const predict = prediction();

        predict.step(STILL, 0.1, 4, 1000);
        predict.reconcile({ x: predict.x, y: predict.y, seq: 77, speed: 4 }, 5000);

        expect(predict.lagMs).toBe(LAG_INITIAL_MS);
    });
});

describe('OwnPrediction.reconcile', () => {
    it('does nothing when the error is under the deadband', () => {
        const predict = prediction();
        const now = walkEast(predict, 0, 400);
        const drift = DEADBAND_TILES / 2;
        const looked = predict.historyAt(now - predict.lagMs);
        const before = predict.x;

        expect(looked).not.toBeNull();

        const result = predict.reconcile(
            { x: (looked?.x ?? 0) + drift, y: looked?.y ?? 0, seq: 0, speed: 4 },
            now,
        );

        expect(result).toBe('none');
        expect(predict.x).toBeCloseTo(before, 10);
    });

    it('nudges a fraction of the error when it is under a tile', () => {
        const predict = prediction();
        const now = walkEast(predict, 0, 400);
        const looked = predict.historyAt(now - predict.lagMs);
        const before = predict.x;
        const error = 0.5;

        const result = predict.reconcile(
            { x: (looked?.x ?? 0) + error, y: looked?.y ?? 0, seq: 0, speed: 4 },
            now,
        );

        expect(result).toBe('nudge');
        expect(predict.x).toBeCloseTo(before + error * NUDGE, 10);
    });

    it('snaps to the server position when the error exceeds a tile', () => {
        const predict = prediction();
        const now = walkEast(predict, 0, 400);
        const looked = predict.historyAt(now - predict.lagMs);

        const result = predict.reconcile(
            { x: (looked?.x ?? 0) + SNAP_TILES + 1, y: looked?.y ?? 0, seq: 0, speed: 0 },
            now,
        );

        expect(result).toBe('snap');
        expect(predict.x).toBeCloseTo((looked?.x ?? 0) + SNAP_TILES + 1, 10);
    });

    it('drops the history it collected before a snap', () => {
        const predict = prediction();
        const now = walkEast(predict, 0, 400);

        predict.reconcile({ x: 20, y: 1, seq: 0, speed: 0 }, now);

        expect(predict.historyAt(0)?.x).toBeCloseTo(20, 10);
    });

    it('replays the inputs the server has not acknowledged yet after a snap', () => {
        const predict = prediction();

        predict.noteSent(1, EAST, 0);
        const now = walkEast(predict, 0, 400);

        // The server's sample is 100 ms old, so 100 ms of walking east is still
        // in flight and has to survive the snap.
        predict.reconcile({ x: 10, y: 1, seq: 1, speed: 4 }, now);

        expect(predict.x).toBeCloseTo(10 + 4 * (predict.lagMs / 1000), 6);
        expect(predict.y).toBeCloseTo(1, 10);
    });

    it('replays nothing when the unacknowledged input is standing still', () => {
        const predict = prediction();

        predict.noteSent(1, STILL, 0);
        const now = walkEast(predict, 0, 400);

        predict.reconcile({ x: 10, y: 1, seq: 1, speed: 4 }, now);

        expect(predict.x).toBeCloseTo(10, 10);
    });

    it('snaps on the patch after a reconnect however small the error', () => {
        const predict = prediction();
        const now = walkEast(predict, 0, 400);

        predict.onReconnect();

        const result = predict.reconcile({ x: 7, y: 3, seq: 0, speed: 0 }, now);

        expect(result).toBe('snap');
        expect(predict.x).toBeCloseTo(7, 10);
        expect(predict.y).toBeCloseTo(3, 10);
    });

    it('snaps only once per reconnect', () => {
        const predict = prediction();
        const now = walkEast(predict, 0, 400);

        predict.onReconnect();
        predict.reconcile({ x: 7, y: 3, seq: 0, speed: 0 }, now);

        const result = predict.reconcile({ x: 7, y: 3, seq: 0, speed: 0 }, now + 50);

        expect(result).toBe('none');
    });

    it('reports nothing to correct before the first predicted frame', () => {
        const predict = new OwnPrediction({ isSolid: OPEN, radius: 0.35 });

        expect(predict.historyAt(0)).toBeNull();
        expect(predict.reconcile({ x: 5, y: 5, seq: 0, speed: 4 }, 100)).toBe('none');
    });
});
