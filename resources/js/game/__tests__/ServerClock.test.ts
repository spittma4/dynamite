import { describe, expect, it } from 'vitest';

import { ServerClock } from '../net/ServerClock';

describe('ServerClock', () => {
    it('extrapolates from the last patch', () => {
        const clock = new ServerClock();

        clock.onPatch(12.5, 1_000);

        expect(clock.now(1_100)).toBeCloseTo(12.6, 6);
    });

    it('never extrapolates more than 250 ms', () => {
        const clock = new ServerClock();

        clock.onPatch(12.5, 1_000);

        expect(clock.now(1_250)).toBeCloseTo(12.75, 6);
        expect(clock.now(5_000)).toBeCloseTo(12.75, 6);
    });

    it('never runs backwards between patches', () => {
        const clock = new ServerClock();

        clock.onPatch(12.5, 1_000);

        expect(clock.now(900)).toBeCloseTo(12.5, 6);
    });

    it('adopts the newest patch even when the clock reset to zero', () => {
        const clock = new ServerClock();

        clock.onPatch(600, 1_000);
        clock.onPatch(0, 1_050);

        expect(clock.now(1_050)).toBe(0);
    });

    it('reads zero before the first patch', () => {
        expect(new ServerClock().now(1_000)).toBe(0);
    });
});
