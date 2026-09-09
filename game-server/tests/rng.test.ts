import { describe, expect, it } from 'vitest';

import { Rng } from '../src/sim/rng';

describe('Rng', () => {
    it('produces the same sequence for the same seed', () => {
        const a = new Rng(1234);
        const b = new Rng(1234);

        expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    });

    it('produces a different sequence for a different seed', () => {
        expect(new Rng(1).next()).not.toBe(new Rng(2).next());
    });

    it('produces values in [0, 1)', () => {
        const rng = new Rng(7);

        for (let i = 0; i < 500; i++) {
            const value = rng.next();

            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('returns ints within [min, max)', () => {
        const rng = new Rng(99);
        const seen = new Set<number>();

        for (let i = 0; i < 500; i++) seen.add(rng.int(2, 5));

        expect([...seen].sort()).toEqual([2, 3, 4]);
    });

    it('never fires an impossible chance and always fires a certain one', () => {
        const rng = new Rng(3);

        for (let i = 0; i < 50; i++) {
            expect(rng.chance(0)).toBe(false);
            expect(rng.chance(1)).toBe(true);
        }
    });

    it('picks only from the items it was given', () => {
        const rng = new Rng(11);
        const items = ['a', 'b', 'c'] as const;

        for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
    });
});
