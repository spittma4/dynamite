import { describe, expect, it } from 'vitest';

import {
    BUBBLE_SECONDS,
    facesTile,
    judgeCatch,
    landingTile,
    rollDrop,
} from '../src/sim/items';
import type { DropContext, DropRules } from '../src/sim/items';
import type { Tile } from '../src/config/types';

/**
 * The carry rules that hold on both sides of the wire (contracts §10.4): who is
 * facing what, where a thrown thing comes down, whether a press was a catch,
 * and what an item does when it hits the floor. Every roll here takes its
 * randomness as an argument, so a drop is reproducible from its seed.
 */

const OPEN: DropContext = {
    blocked: () => false,
    occupied: () => false,
    workTileOwner: () => null,
};

const RULES: DropRules = { stickFizzleChance: 0.3, kegKnockOverOnHit: true };

function ctx(over: Partial<DropContext>): DropContext {
    return { ...OPEN, ...over };
}

/** A generator that hands out the listed rolls in order, then zeroes forever. */
function rolls(...values: number[]): () => number {
    let at = 0;

    return () => values[at++] ?? 0;
}

describe('facesTile', () => {
    it('accepts the faced direction and its two neighbours', () => {
        const from: Tile = [5, 5];

        expect(facesTile(0, from, [7, 5])).toBe(true);
        expect(facesTile(0, from, [6, 6])).toBe(true);
        expect(facesTile(0, from, [6, 4])).toBe(true);
    });

    it('rejects anything more than one step off the facing', () => {
        const from: Tile = [5, 5];

        expect(facesTile(0, from, [5, 7])).toBe(false);
        expect(facesTile(0, from, [3, 5])).toBe(false);
    });

    it('wraps around the compass rather than clamping at 0 and 7', () => {
        expect(facesTile(0, [5, 5], [6, 4])).toBe(true);
        expect(facesTile(7, [5, 5], [6, 5])).toBe(true);
    });

    it('faces nothing when the target is the tile it stands on', () => {
        expect(facesTile(0, [5, 5], [5, 5])).toBe(false);
    });
});

describe('landingTile', () => {
    it('throws the full distance down an open aisle', () => {
        expect(landingTile([5, 5], 0, 2, () => false)).toEqual([7, 5]);
    });

    it('lands one tile short when the far tile is blocked', () => {
        const blocked = (t: Tile): boolean => t[0] === 7;

        expect(landingTile([5, 5], 0, 2, blocked)).toEqual([6, 5]);
    });

    it('refuses the throw when every tile in the line is blocked', () => {
        expect(landingTile([5, 5], 0, 2, () => true)).toBeNull();
    });

    it('sends a diagonal facing two tiles on both axes', () => {
        expect(landingTile([5, 5], 1, 2, () => false)).toEqual([7, 7]);
    });
});

describe('judgeCatch', () => {
    it('grades by distance from the arrival, early or late alike', () => {
        expect(judgeCatch(1000, 1000, 150, 75)).toBe('perfect');
        expect(judgeCatch(1075, 1000, 150, 75)).toBe('perfect');
        expect(judgeCatch(925, 1000, 150, 75)).toBe('perfect');
        expect(judgeCatch(1100, 1000, 150, 75)).toBe('ok');
        expect(judgeCatch(850, 1000, 150, 75)).toBe('ok');
        expect(judgeCatch(1151, 1000, 150, 75)).toBe('miss');
    });
});

describe('rollDrop', () => {
    it('rolls a keg one tile on and leaves it standing', () => {
        const outcome = rollDrop('keg', [5, 5], [1, 0], OPEN, rolls(), RULES);

        expect(outcome).toEqual({
            kind: 'keg',
            restTile: [6, 5],
            knockedOver: false,
            jamStationId: null,
        });
    });

    it('knocks a keg over where it landed when the next tile is blocked', () => {
        const outcome = rollDrop('keg', [5, 5], [1, 0], ctx({ blocked: () => true }), rolls(), RULES);

        expect(outcome).toMatchObject({ restTile: [5, 5], knockedOver: true });
    });

    it('knocks a keg over when the next tile is taken or someone stands where it fell', () => {
        const onNext = ctx({ occupied: (t) => t[0] === 6 });
        const onOrigin = ctx({ occupied: (t) => t[0] === 5 });

        const nextTaken = rollDrop('keg', [5, 5], [1, 0], onNext, rolls(), RULES);
        const standingOnIt = rollDrop('keg', [5, 5], [1, 0], onOrigin, rolls(), RULES);

        expect(nextTaken).toMatchObject({ restTile: [5, 5], knockedOver: true });
        expect(standingOnIt).toMatchObject({ restTile: [5, 5], knockedOver: true });
    });

    it('stops a keg without spilling it when the level turns knock-over off', () => {
        const rules: DropRules = { ...RULES, kegKnockOverOnHit: false };
        const outcome = rollDrop('keg', [5, 5], [1, 0], ctx({ blocked: () => true }), rolls(), rules);

        expect(outcome).toMatchObject({ restTile: [5, 5], knockedOver: false });
    });

    it('spends no randomness on anything but a stick', () => {
        let calls = 0;
        const rng = (): number => {
            calls++;

            return 0;
        };

        rollDrop('keg', [5, 5], [1, 0], OPEN, rng, RULES);
        rollDrop('casing', [5, 5], [1, 0], OPEN, rng, RULES);

        expect(calls).toBe(0);
    });

    it('fizzles a stick under the configured chance and never elsewhere', () => {
        const fizzled = rollDrop('stick', [5, 5], [1, 0], OPEN, rolls(0.29), RULES);
        const survived = rollDrop('stick', [5, 5], [1, 0], OPEN, rolls(0.3), RULES);

        expect(fizzled).toMatchObject({ kind: 'stick', fizzle: true, restTile: [5, 5] });
        expect(survived).toMatchObject({ kind: 'stick', fizzle: false, restTile: [5, 5] });
    });

    it('never blames a station for a stick that went up in smoke', () => {
        const jam = ctx({ workTileOwner: () => 'assembly-a' });

        const fizzled = rollDrop('stick', [5, 5], [1, 0], jam, rolls(0.1), RULES);
        const survived = rollDrop('stick', [5, 5], [1, 0], jam, rolls(0.9), RULES);

        expect(fizzled.jamStationId).toBeNull();
        expect(survived.jamStationId).toBe('assembly-a');
    });

    it('names the station whose work tile the item came to rest on', () => {
        const jam = ctx({ workTileOwner: (t) => (t[0] === 6 ? 'powder-a' : null) });
        const outcome = rollDrop('keg', [5, 5], [1, 0], jam, rolls(), RULES);

        expect(outcome.jamStationId).toBe('powder-a');
    });

    it('treats casings, parts and crates as inert', () => {
        for (const type of ['casing', 'parts', 'crate'] as const) {
            expect(rollDrop(type, [5, 5], [1, 0], OPEN, rolls(), RULES)).toEqual({
                kind: 'inert',
                restTile: [5, 5],
                jamStationId: null,
            });
        }
    });
});

describe('BUBBLE_SECONDS', () => {
    it('is the two seconds a thrown-at player has to complain', () => {
        expect(BUBBLE_SECONDS).toBe(2);
    });
});
