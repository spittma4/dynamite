import { describe, expect, it } from 'vitest';

import { clipboardProgress, tailX } from '../minigames/Host';

describe('clipboardProgress', () => {
    it('is empty when the clipboard has just been handed over', () => {
        expect(clipboardProgress(13, 3, 10)).toBe(0);
    });

    it('is exactly full at clipboardUntil', () => {
        expect(clipboardProgress(13, 3, 13)).toBe(1);
    });

    it('fills evenly across clipboardSeconds', () => {
        expect(clipboardProgress(13, 3, 11.5)).toBeCloseTo(0.5, 5);
    });

    it('stays inside 0 and 1 when the estimate runs past either end', () => {
        expect(clipboardProgress(13, 3, 9)).toBe(0);
        expect(clipboardProgress(13, 3, 99)).toBe(1);
    });

    it('reads full rather than dividing by zero when the level has no clipboard', () => {
        expect(clipboardProgress(13, 0, 10)).toBe(1);
    });
});

describe('tailX', () => {
    it('points at the station anchor', () => {
        expect(tailX(300, 896)).toBe(300);
    });

    it('stays inside the panel when the station is against an edge', () => {
        expect(tailX(2, 896)).toBe(12);
        expect(tailX(1000, 896)).toBe(884);
    });
});
