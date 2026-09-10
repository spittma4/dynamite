import { describe, expect, it } from 'vitest';

import { clipboardProgress, panelMode, tailX } from '../minigames/Host';

/**
 * Who gets a panel (N4). The gate used to be `me.workTile !== ''`, and a helper's
 * `workTile` is empty by design (contracts §10.2) — so the one role with no
 * gesture, no overlay and no console got no panel either. Pressing E on an aisle
 * tile took your legs and said nothing, which is the whole of "you can 'sit'/press
 * E and get stuck on the squares around a station".
 */
const MEMBER = { stationId: 'assembly-a', workTile: '13,5', clipboardUntil: 0 };
const HELPER = { stationId: 'assembly-a', workTile: '', clipboardUntil: 0 };

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

describe('panelMode', () => {
    it('gives nothing to a player who is not at a station', () => {
        expect(panelMode({ ...MEMBER, stationId: '' }, true, 10)).toBe('none');
    });

    it('gives nothing when the station is not in the state yet', () => {
        expect(panelMode(MEMBER, false, 10)).toBe('none');
    });

    it('gives the clipboard to anybody still reading theirs, helper included', () => {
        expect(panelMode({ ...MEMBER, clipboardUntil: 13 }, true, 10)).toBe('clipboard');
        expect(panelMode({ ...HELPER, clipboardUntil: 13 }, true, 10)).toBe('clipboard');
    });

    it('gives the overlay to a member on a post', () => {
        expect(panelMode(MEMBER, true, 10)).toBe('overlay');
    });

    it('gives a helper the helper panel rather than an operator console', () => {
        expect(panelMode(HELPER, true, 10)).toBe('helper');
    });
});
