import type { StaffingCurve } from '@shared';
import { describe, expect, it } from 'vitest';

import { helperMargin, helperNotice } from '../ui/helperPost';

/**
 * What a helper reads (N4). A press on a ring tile used to cost a player their
 * legs and tell them nothing at all; this is the panel that replaced the silence,
 * and the only claim in it that can be wrong is the middle line — so the middle
 * line is read off the shipped curves rather than written.
 */

/** `config/game/levels/level-01-basic-flow.json`, verbatim. */
const POWDER: StaffingCurve = { 1: 1.0, 2: 1.05, 3: 0.9, 4: 0.75 };
const ASSEMBLY: StaffingCurve = { 1: 0.6, 2: 1.0, 3: 1.15, 4: 1.1, 5: 0.95, 6: 0.8, 8: 0.5 };
/** `level-04-too-many-helpers`: the same peak, a much steeper cliff past it. */
const CROWDED: StaffingCurve = { 1: 0.6, 2: 1.0, 3: 1.15, 4: 0.8, 5: 0.6, 6: 0.45, 8: 0.3 };

describe('one body’s worth of difference', () => {
    it('is positive for the second pair of hands at Boom Powder', () => {
        expect(helperMargin(POWDER, 2)).toBeCloseTo(0.05, 9);
    });

    it('is negative for the fourth body at Assembly, and far worse on level 4', () => {
        expect(helperMargin(ASSEMBLY, 4)).toBeCloseTo(-0.05, 9);
        expect(helperMargin(CROWDED, 4)).toBeCloseTo(-0.35, 9);
    });

    it('is nothing at all once the curve has flattened past its last key', () => {
        expect(helperMargin(ASSEMBLY, 9)).toBe(0);
    });

    it('is nothing when there is nobody to be one of', () => {
        expect(helperMargin(POWDER, 0)).toBe(0);
    });
});

describe('the helper panel', () => {
    it('says a Boom Powder helper is helping, and what the machine gains', () => {
        const notice = helperNotice('BOOM POWDER', POWDER, 2);

        expect(notice.helping).toBe(true);
        expect(notice.title).toBe('HELPING AT BOOM POWDER');
        expect(notice.effect).toBe('105% with 2 PAIRS OF HANDS · 100% without you');
    });

    it('tells the fourth body at Assembly that it is in the way', () => {
        const notice = helperNotice('ASSEMBLY', ASSEMBLY, 4);

        expect(notice.helping).toBe(false);
        expect(notice.title).toBe('IN THE WAY AT ASSEMBLY');
        expect(notice.effect).toBe('110% with 4 PAIRS OF HANDS · 115% without you');
    });

    it('quotes level 4’s own numbers at the body that is costing it the most', () => {
        expect(helperNotice('ASSEMBLY', CROWDED, 4).effect).toBe(
            '80% with 4 PAIRS OF HANDS · 115% without you',
        );
    });

    it('claims neither credit nor blame where the curve has flattened out', () => {
        const notice = helperNotice('ASSEMBLY', ASSEMBLY, 9);

        expect(notice.helping).toBe(false);
        expect(notice.effect).toBe('ASSEMBLY runs at 50% with you or without you');
    });

    it('leads with the way out that a player finds by walking', () => {
        expect(helperNotice('ASSEMBLY', ASSEMBLY, 4).exit).toMatch(/^STEP OFF THE POST/);
        expect(helperNotice('ASSEMBLY', ASSEMBLY, 4).exit).toContain('ESC');
    });
});
