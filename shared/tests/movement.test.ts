import { describe, expect, it } from 'vitest';

import { makeWallLookup, pushOutOfSolid, stepPosition } from '../src/sim/movement';
import type { MoveInput, MoveResult, SolidFn } from '../src/sim/movement';
import type { Facing } from '../src/sim/tiles';
import { layoutFixture } from './fixtures';

/**
 * The one integrator both sides run: the server writes `PlayerState.x/y` with
 * it and F04 predicts the local avatar with it, so a disagreement here is a
 * rubber-banding avatar.
 */

const OPEN: SolidFn = () => false;
const RADIUS = 0.35;
const STEP = 0.05;

/** A 8 x 6 room whose border is wall, plus whatever tiles the test names. */
function room(...solids: string[]): SolidFn {
    const extra = new Set(solids);

    return (tx, ty) =>
        tx < 0 || ty < 0 || tx >= 8 || ty >= 6 || extra.has(`${tx},${ty}`);
}

function at(x: number, y: number, facing: Facing = 2): { x: number; y: number; facing: Facing } {
    return { x, y, facing };
}

/** Nobody integrates more than one tick at a time, and neither does a test. */
function walk(
    start: { x: number; y: number; facing: Facing },
    intent: MoveInput,
    isSolid: SolidFn,
    ticks: number,
): MoveResult {
    let pos: MoveResult = { ...start, moved: false };

    for (let i = 0; i < ticks; i++) pos = stepPosition(pos, intent, STEP, isSolid, 4, RADIUS);

    return pos;
}

describe('stepPosition', () => {
    it('moves 4 tiles in twenty 0.05 s steps at 4 tiles/s', () => {
        let pos = at(1.5, 3.5);

        for (let i = 0; i < 20; i++) {
            pos = stepPosition(pos, { dx: 1, dy: 0 }, STEP, OPEN, 4, RADIUS);
        }

        expect(pos.x).toBeCloseTo(5.5, 10);
        expect(pos.y).toBeCloseTo(3.5, 10);
    });

    it('normalises diagonal input to unit length', () => {
        const pos = stepPosition(at(4, 4), { dx: 1, dy: 1 }, 1, OPEN, 4, RADIUS);
        const dx = pos.x - 4;
        const dy = pos.y - 4;

        expect(Math.hypot(dx, dy)).toBeCloseTo(4, 10);
        expect(dx).toBeCloseTo(dy, 10);
    });

    it('stops at a wall edge minus the radius', () => {
        const pos = walk(at(3.5, 3.5), { dx: 1, dy: 0 }, room('5,3'), 40);

        expect(pos.x).toBeCloseTo(5 - RADIUS, 5);
        expect(pos.y).toBeCloseTo(3.5, 10);
    });

    it('stops at a wall edge minus the radius walking left', () => {
        const pos = walk(at(3.5, 3.5), { dx: -1, dy: 0 }, room('2,3'), 40);

        expect(pos.x).toBeCloseTo(3 + RADIUS, 5);
    });

    it('slides along a wall when moving diagonally into it', () => {
        const pos = walk(at(3.5, 3.5), { dx: 1, dy: 1 }, room('4,3', '4,4'), 10);

        expect(pos.x).toBeCloseTo(4 - RADIUS, 5);
        expect(pos.y).toBeGreaterThan(3.5);
    });

    it('treats out-of-bounds tiles as solid', () => {
        const pos = walk(at(0.5, 3.5), { dx: -1, dy: 0 }, room(), 40);

        expect(pos.x).toBeCloseTo(RADIUS, 5);
    });

    it('keeps the current facing when input is zero and takes facingFrom otherwise', () => {
        expect(stepPosition(at(4, 4, 6), { dx: 0, dy: 0 }, STEP, OPEN, 4, RADIUS).facing).toBe(6);
        expect(stepPosition(at(4, 4, 6), { dx: -1, dy: 0 }, STEP, OPEN, 4, RADIUS).facing).toBe(4);
        expect(stepPosition(at(4, 4, 6), { dx: 1, dy: 1 }, STEP, OPEN, 4, RADIUS).facing).toBe(1);
    });

    it('returns moved false and the same position when speed is zero', () => {
        const pos = stepPosition(at(4, 4), { dx: 1, dy: 0 }, STEP, OPEN, 0, RADIUS);

        expect(pos).toEqual({ x: 4, y: 4, facing: 0, moved: false });
    });

    it('returns moved false when the input is zero', () => {
        expect(stepPosition(at(4, 4), { dx: 0, dy: 0 }, STEP, OPEN, 4, RADIUS).moved).toBe(false);
    });

    it('does not move a player already flush against a wall', () => {
        const flush = 5 - RADIUS;
        const pos = stepPosition(at(flush, 3.5), { dx: 1, dy: 0 }, STEP, room('5,3'), 4, RADIUS);

        expect(pos.x).toBeCloseTo(flush, 5);
    });
});

describe('makeWallLookup', () => {
    it('decodes packed wall indices and treats out-of-bounds as solid', () => {
        const layout = layoutFixture();
        const isSolid = makeWallLookup(layout);

        expect(isSolid(0, 0)).toBe(true);
        expect(isSolid(14, 15)).toBe(false);
        expect(isSolid(-1, 4)).toBe(true);
        expect(isSolid(layout.width, 4)).toBe(true);
        expect(isSolid(4, layout.height)).toBe(true);
    });

    it('reads a wall packed as y * width + x', () => {
        const layout = layoutFixture();

        layout.walls = [3 * layout.width + 9];

        expect(makeWallLookup(layout)(9, 3)).toBe(true);
        expect(makeWallLookup(layout)(3, 9)).toBe(false);
    });
});

describe('pushOutOfSolid', () => {
    it('pushes a circle out of a solid tile along the shortest axis', () => {
        const pushed = pushOutOfSolid(4.1, 3.5, RADIUS, room('4,3'));

        expect(pushed.x).toBeLessThan(4 - RADIUS + 1e-3);
        expect(pushed.y).toBeCloseTo(3.5, 10);
    });

    it('clears an overlap with a neighbouring wall without moving the centre tile', () => {
        const pushed = pushOutOfSolid(3.8, 3.5, RADIUS, room('4,3'));

        expect(pushed.x).toBeCloseTo(4 - RADIUS, 5);
    });

    it('leaves a circle that touches nothing alone', () => {
        expect(pushOutOfSolid(3.5, 3.5, RADIUS, room('4,3'))).toEqual({ x: 3.5, y: 3.5 });
    });
});
