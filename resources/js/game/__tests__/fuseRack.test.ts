import { describe, expect, it } from 'vitest';

import { TILE_PX } from '@shared';

import { fuseLabel } from '../minigames/Jig';
import { NOTHING_ON_THE_BOARD } from '../nouns';
import { YOUR_PICK, rackBins, rackCaption, rackTileBox } from '../render/fuseRack';

/**
 * The fuse rack (F15 §3). The complaint that started F15 was "the fuse
 * generation is a bit non-intuitive" — and the rack is one orange tile outline
 * on the floor and two loose chips on a panel. These are the two bins and the
 * one sentence that say what the order wants and that the pick has already been
 * made, in one place both surfaces read from.
 */

const BOX = { x0: 100, y0: 40, x1: 240, y1: 80 };

describe('rackBins', () => {
    it('splits the rack into two bins with SHORT on the left and LONG on the right', () => {
        const [short, long] = rackBins(BOX, 'long', 'long');

        expect(short?.fuse).toBe('short');
        expect(long?.fuse).toBe('long');
        expect(short?.box.x1).toBeLessThanOrEqual(long?.box.x0 ?? 0);
        expect(short?.box.x0).toBe(BOX.x0);
        expect(long?.box.x1).toBe(BOX.x1);
    });

    it('keeps that order on the floor, at every tile the rack can sit on', () => {
        for (const tile of [
            [13, 7],
            [0, 0],
            [27, 17],
        ] as [number, number][]) {
            const [short, long] = rackBins(rackTileBox(tile), 'short', 'short');

            expect(short?.box.x0).toBeGreaterThanOrEqual(tile[0] * TILE_PX);
            expect(long?.box.x1).toBeLessThanOrEqual((tile[0] + 1) * TILE_PX);
            expect(short?.box.x1).toBeLessThanOrEqual(long?.box.x0 ?? 0);
        }
    });

    it('names the bins the way every other panel names a fuse', () => {
        const bins = rackBins(BOX, 'long', 'long');

        expect(bins.map((bin) => bin.label)).toEqual([fuseLabel('short'), fuseLabel('long')]);
    });

    it('lights the bin the pick is on', () => {
        expect(rackBins(BOX, 'short', 'long').map((bin) => bin.picked)).toEqual([true, false]);
    });

    /**
     * The bin the order wants is marked whether or not the pick agrees, which is
     * the fact that was never on screen: `bPick` arrived looking like a default,
     * so the highlighted bin read as "LONG is selected" rather than "the order
     * wants LONG and it is already selected".
     */
    it('marks the bin the order wants, even when the pick is on the other one', () => {
        expect(rackBins(BOX, 'short', 'long').map((bin) => bin.wanted)).toEqual([false, true]);
    });

    it('marks neither bin when there is nothing on the board to want one', () => {
        const bins = rackBins(BOX, 'long', '');

        expect(bins.map((bin) => bin.wanted)).toEqual([false, false]);
        expect(bins.some((bin) => bin.warn)).toBe(false);
    });

    it('warns on the wanted bin only while the pick disagrees with it', () => {
        expect(rackBins(BOX, 'short', 'long').map((bin) => bin.warn)).toEqual([false, true]);
        expect(rackBins(BOX, 'long', 'long').some((bin) => bin.warn)).toBe(false);
    });

    /**
     * The whole-floor case, and the one nothing exercised: from the whistle until
     * somebody takes the rack tile there is no pick at all. Marking the order's
     * bin is right — that is what the board asked for — but warning on it accuses
     * a crew of being on the wrong bin when nobody is on any bin.
     */
    it('marks what the order wants without warning when nobody has picked', () => {
        const bins = rackBins(BOX, '', 'short');

        expect(bins.map((bin) => bin.wanted)).toEqual([true, false]);
        expect(bins.map((bin) => bin.picked)).toEqual([false, false]);
        expect(bins.some((bin) => bin.warn)).toBe(false);
    });
});

describe('rackCaption', () => {
    it('says the order picked it, so a first-timer learns the choice is already made', () => {
        const caption = rackCaption('long', 'long', true);

        expect(caption.text).toContain(fuseLabel('long'));
        expect(caption.text.toLowerCase()).toContain('already');
        expect(caption.tone).toBe('set');
    });

    /**
     * `bPickFromOrder` is the difference between "the game reached in and did
     * this for you" and "you did this". They agree on the bin and mean opposite
     * things about who is responsible for it at the next rollover: one follows
     * the order, the other does not.
     */
    it('credits B for a pick B made, even when it lands on the same bin', () => {
        const caption = rackCaption('long', 'long', false);

        expect(caption.text).toContain(fuseLabel('long'));
        expect(caption.text.toLowerCase()).not.toContain('already');
        expect(caption.text).toBe(YOUR_PICK.replace('{length}', 'LONG'));
        expect(caption.tone).toBe('set');
    });

    it('names both lengths when the pick disagrees, and says which is wanted first', () => {
        const caption = rackCaption('long', 'short', false);

        expect(caption.text.indexOf('SHORT')).toBeLessThan(caption.text.indexOf('LONG'));
        expect(caption.tone).toBe('warn');
    });

    it('states the want plainly when nobody is at the rack to have picked', () => {
        const caption = rackCaption('', 'short', false);

        expect(caption.text).toContain(fuseLabel('short'));
        expect(caption.text.toLowerCase()).not.toContain('already');
        expect(caption.text).not.toContain('\u2014 YOU ARE ON');
        expect(caption.tone).toBe('idle');
    });

    it('falls back to the empty book, in the words the board already uses', () => {
        const caption = rackCaption('long', '', true);

        expect(caption.text).toBe(NOTHING_ON_THE_BOARD);
        expect(caption.tone).toBe('idle');
    });

    // 'o-1' is the database's name for an order; the panel says '1st'.
    it('never puts a raw order id in the sentence', () => {
        expect(rackCaption('long', 'short', false).text).not.toMatch(/o-\d/);
    });
});
