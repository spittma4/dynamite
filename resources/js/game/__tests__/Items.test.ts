import { TILE_PX } from '@shared';
import { describe, expect, it, vi } from 'vitest';

/**
 * Phaser touches `window` at import time, so the runtime is stubbed for the node
 * suite; the layer reads it only for the two scene event names.
 */
vi.mock('phaser', () => ({
    default: { Scenes: { Events: { POST_UPDATE: 'postupdate', SHUTDOWN: 'shutdown' } } },
}));

import {
    ARC_LIFT_PX,
    ITEM_COLOURS,
    KEG_COLOURS,
    StartTimes,
    choreFill,
    choreLabel,
    flightPose,
    flightProgress,
    handCue,
    handStateOf,
    itemSkin,
    placementOf,
} from '../render/Items';
import { KEG_WORD, kegLook } from '../render/stationGlyphs';

/**
 * The item layer's decisions (F06 §Client). Everything here is a function of the
 * schema fields alone — the client never judges an outcome — so the drawing is
 * left to Phaser and the rules are tested on their own.
 */

const CHORES = {
    unjam: 'WAITING FOR VENDOR SUPPORT',
    sweep: 'SWEEPING',
    stomp: 'STOMPING',
    repair: 'CALLING MAINTENANCE',
};

/**
 * The words the panels print. The Jig's keg gauge wrote `quality.toFixed(1)`
 * under a label reading 'KEG', so the panel said 'KEG / 0.7' — a float straight
 * off the schema. The glyph tint already knew what 0.7 meant.
 */
describe('KEG_WORD', () => {
    it('gives every look the panel a word instead of the number', () => {
        expect(KEG_WORD[kegLook(0.4, false)]).toBe('DUD');
        expect(KEG_WORD[kegLook(0.7, false)]).toBe('DAMP');
        expect(KEG_WORD[kegLook(1, false)]).toBe('FULL');
        expect(KEG_WORD[kegLook(1, true)]).toBe('PRIME');
    });
});

describe('kegLook', () => {
    it('reads the three quality steps the server writes', () => {
        expect(kegLook(0.4, false)).toBe('dud');
        expect(kegLook(0.7, false)).toBe('damp');
        expect(kegLook(1, false)).toBe('normal');
    });

    it('glows for a prime keg and never for anything below full quality', () => {
        expect(kegLook(1, true)).toBe('prime');
        expect(kegLook(0.7, true)).toBe('damp');
    });

    it('treats a knocked-over keg below the dud floor as a dud', () => {
        expect(kegLook(0.1, false)).toBe('dud');
    });
});

describe('itemSkin', () => {
    it('paints a dud grey and squat, a damp keg steaming and a prime keg glowing', () => {
        expect(itemSkin({ type: 'keg', quality: 0.4, prime: false, dents: 0 })).toMatchObject({
            colour: KEG_COLOURS.dud,
            squat: true,
            steam: false,
            glow: false,
        });
        expect(itemSkin({ type: 'keg', quality: 0.7, prime: false, dents: 0 })).toMatchObject({
            colour: KEG_COLOURS.damp,
            steam: true,
            glow: false,
        });
        expect(itemSkin({ type: 'keg', quality: 1, prime: true, dents: 0 })).toMatchObject({
            colour: KEG_COLOURS.prime,
            glow: true,
        });
    });

    it('gives every other type its own plain colour', () => {
        expect(itemSkin({ type: 'casing', quality: 1, prime: false, dents: 0 }).colour).toBe(
            ITEM_COLOURS.casing,
        );
        expect(itemSkin({ type: 'stick', quality: 1, prime: false, dents: 0 }).colour).toBe(
            ITEM_COLOURS.stick,
        );
        expect(itemSkin({ type: 'crate', quality: 1, prime: false, dents: 0 }).colour).toBe(
            ITEM_COLOURS.crate,
        );
        expect(itemSkin({ type: 'parts', quality: 1, prime: false, dents: 0 }).colour).toBe(
            ITEM_COLOURS.parts,
        );
    });

    it('shows dents as up to three marks', () => {
        expect(itemSkin({ type: 'casing', quality: 1, prime: false, dents: 0 }).dents).toBe(0);
        expect(itemSkin({ type: 'casing', quality: 1, prime: false, dents: 2 }).dents).toBe(2);
        expect(itemSkin({ type: 'casing', quality: 1, prime: false, dents: 9 }).dents).toBe(3);
    });
});

describe('placementOf', () => {
    const players = (id: string): boolean => id === 'sess-1';

    it('draws a floor item at its tile centre', () => {
        const where = { x: 3, y: 4, holder: '', inFlight: false };

        expect(placementOf(where, players)).toEqual({
            kind: 'tile',
            x: 3.5 * TILE_PX,
            y: 4.5 * TILE_PX,
        });
    });

    it('draws a stick staged on a dock lane at the lane tile', () => {
        const where = { x: 6, y: 2, holder: 'dock-a', inFlight: false };

        expect(placementOf(where, players)).toEqual({
            kind: 'tile',
            x: 6.5 * TILE_PX,
            y: 2.5 * TILE_PX,
        });
    });

    it('follows the flight rather than the tile while an item is in the air', () => {
        const where = { x: 3.5, y: 4, holder: '', inFlight: true };

        expect(placementOf(where, players)).toEqual({ kind: 'flight' });
    });

    it('hands a held item to its carrier', () => {
        const where = { x: -1, y: -1, holder: 'sess-1', inFlight: false };

        expect(placementOf(where, players)).toEqual({ kind: 'held', sessionId: 'sess-1' });
    });

    it('hides a shelved item — the station renderer draws shelf contents', () => {
        const where = { x: -1, y: -1, holder: 'powder-a', inFlight: false };

        expect(placementOf(where, players)).toEqual({ kind: 'hidden' });
    });
});

describe('handStateOf', () => {
    it('is mine only when the item is in my own hands', () => {
        expect(handStateOf({ kind: 'held', sessionId: 'sess-1' }, 'sess-1')).toBe('mine');
        expect(handStateOf({ kind: 'held', sessionId: 'sess-2' }, 'sess-1')).toBe('away');
    });

    it('keeps the air apart from the floor, because a catch is not a pick-up', () => {
        expect(handStateOf({ kind: 'flight' }, 'sess-1')).toBe('flight');
        expect(handStateOf({ kind: 'tile', x: 0, y: 0 }, 'sess-1')).toBe('away');
        expect(handStateOf({ kind: 'hidden' }, 'sess-1')).toBe('away');
    });
});

describe('handCue', () => {
    it('grabs what comes off a shelf, a tray or the floor', () => {
        expect(handCue('away', 'mine')).toBe('grab');
    });

    it('catches what arrives out of the air', () => {
        expect(handCue('flight', 'mine')).toBe('catch');
    });

    it('clinks what leaves your hands and comes to rest', () => {
        expect(handCue('mine', 'away')).toBe('clink');
    });

    it('says nothing about a throw, which the arc already shows', () => {
        expect(handCue('mine', 'flight')).toBeNull();
    });

    it('says nothing while nothing has changed', () => {
        expect(handCue('mine', 'mine')).toBeNull();
        expect(handCue('away', 'away')).toBeNull();
        expect(handCue('flight', 'flight')).toBeNull();
    });

    it('says nothing about an item that never touched your hands', () => {
        expect(handCue('away', 'flight')).toBeNull();
        expect(handCue('flight', 'away')).toBeNull();
    });
});

describe('flightProgress', () => {
    it('starts at the server value and runs on the local clock between patches', () => {
        expect(flightProgress(0.2, 0, 0.5)).toBeCloseTo(0.2);
        expect(flightProgress(0.2, 250, 0.5)).toBeCloseTo(0.5);
    });

    it('never runs backwards behind a late patch', () => {
        expect(flightProgress(0.6, 100, 0.5)).toBeCloseTo(0.6);
    });

    it('clamps to the whole flight', () => {
        expect(flightProgress(0, 9000, 0.5)).toBe(1);
        expect(flightProgress(-1, -100, 0.5)).toBe(0);
        expect(flightProgress(0, 0, 0)).toBe(1);
    });
});

describe('flightPose', () => {
    /**
     * What the server actually writes (`itemThrow.ts`): `fromX`/`fromY` are the
     * thrower's own position and `toX`/`toY` the landing tile's centre, so both
     * ends already carry the half-tile offset that `placementOf` adds to a
     * floor item's integer tile.
     */
    const path = { fromX: 5.5, fromY: 7.5, toX: 7.5, toY: 7.5 };

    it('starts under the thrower, where the avatar layer draws them', () => {
        const pose = flightPose(path, 0);

        expect(pose.x).toBeCloseTo(5.5 * TILE_PX);
        expect(pose.y).toBeCloseTo(7.5 * TILE_PX);
        expect(pose.lift).toBeCloseTo(0);
    });

    it('peaks halfway along the arc', () => {
        const pose = flightPose(path, 0.5);

        expect(pose.x).toBeCloseTo(6.5 * TILE_PX);
        expect(pose.lift).toBeCloseTo(ARC_LIFT_PX);
    });

    it('ends exactly where the landed floor sprite draws, so nothing pops', () => {
        const pose = flightPose(path, 1);
        const landed = placementOf({ x: 7, y: 7, holder: '', inFlight: false }, () => false);

        expect(landed).toEqual({ kind: 'tile', x: 7.5 * TILE_PX, y: 7.5 * TILE_PX });
        expect(pose.x).toBeCloseTo((landed as { x: number }).x);
        expect(pose.y).toBeCloseTo((landed as { y: number }).y);
        expect(pose.lift).toBeCloseTo(0);
    });
});

describe('choreFill', () => {
    it('fills from the moment the chore was first seen to choreUntil', () => {
        expect(choreFill(10, 14, 10)).toBe(0);
        expect(choreFill(10, 14, 12)).toBeCloseTo(0.5);
        expect(choreFill(10, 14, 14)).toBe(1);
    });

    it('clamps rather than overflowing while the server catches up', () => {
        expect(choreFill(10, 14, 20)).toBe(1);
        expect(choreFill(10, 14, 9)).toBe(0);
    });

    it('reads a chore that ends in the past as done', () => {
        expect(choreFill(10, 10, 10)).toBe(1);
    });
});

describe('choreLabel', () => {
    it('labels the bar from the copy the server sent', () => {
        expect(choreLabel(CHORES, 'unjam')).toBe(CHORES.unjam);
        expect(choreLabel(CHORES, 'sweep')).toBe(CHORES.sweep);
        expect(choreLabel(CHORES, 'stomp')).toBe(CHORES.stomp);
        expect(choreLabel(CHORES, 'repair')).toBe(CHORES.repair);
    });

    it('says nothing for a player who is not on a chore', () => {
        expect(choreLabel(CHORES, '')).toBe('');
    });
});

describe('StartTimes', () => {
    it('records the moment a flag went up and keeps it across frames', () => {
        const starts = new StartTimes();

        expect(starts.mark('k-1', 'flight', 1000)).toBe(1000);
        expect(starts.mark('k-1', 'flight', 1016)).toBe(1000);
    });

    it('restarts when the token changes without an idle frame between', () => {
        const starts = new StartTimes();

        starts.mark('sess-1', 'unjam', 10);

        expect(starts.mark('sess-1', 'sweep', 14)).toBe(14);
    });

    it('times the next flight afresh once the last one has been forgotten', () => {
        const starts = new StartTimes();

        starts.mark('k-1', 'flight', 1000);
        starts.forget('k-1');

        expect(starts.mark('k-1', 'flight', 1400)).toBe(1400);
    });
});
