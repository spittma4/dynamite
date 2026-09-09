import { describe, expect, it } from 'vitest';

import type { ItemType, LevelConfig, StationConfig } from '@shared';

import {
    SELF_STOCKED,
    blockedTargets,
    dropTargets,
    haulableInputs,
    pluralOf,
    producedBy,
    productLabel,
    shelfLabel,
} from '../render/dropTargets';

function station(over: Partial<StationConfig> & Pick<StationConfig, 'id' | 'type'>): StationConfig {
    return {
        workTiles: [],
        rackTiles: [],
        inputShelf: null,
        outputShelf: null,
        ...over,
    } as unknown as StationConfig;
}

const POWDER = station({
    id: 'powder-a',
    type: 'boom_powder',
    outputShelf: { tile: [7, 3], capacity: 6 },
});

const ASSEMBLY = station({
    id: 'assembly-a',
    type: 'assembly',
    workTiles: [
        [13, 8],
        [14, 8],
    ],
    rackTiles: [[16, 8]],
    inputShelf: { tile: [12, 9], capacity: 8, accepts: ['keg', 'casing'] },
    outputShelf: { tile: [12, 11], capacity: 4 },
});

const DOCK = station({
    id: 'dock-a',
    type: 'dock',
    workTiles: [
        [22, 4],
        [23, 4],
    ],
});

const LEVEL = {
    stations: [POWDER, ASSEMBLY, DOCK],
    recipes: {
        keg: { station: 'boom_powder', inputs: {}, output: { type: 'keg', pours: 2 } },
        red_stick: {
            station: 'assembly',
            inputs: { casing: 1 },
            output: { type: 'stick', product: 'red_stick' },
        },
    },
} as unknown as LevelConfig;

/** Nothing on any shelf, which is every case but the full-shelf ones. */
const EMPTY: ReadonlyMap<string, number> = new Map();

describe('dropTargets', () => {
    it('sends a keg to the shelf that says it accepts kegs', () => {
        const tiles = dropTargets('keg', LEVEL, EMPTY).flatMap((t) => t.tiles);

        expect(tiles).toContainEqual([12, 9]);
    });

    it('does not send a keg to the output shelf it came from', () => {
        const tiles = dropTargets('keg', LEVEL, EMPTY).flatMap((t) => t.tiles);

        expect(tiles).not.toContainEqual([7, 3]);
    });

    it('sends a finished stick to the dock lanes, which have no shelf at all', () => {
        const target = dropTargets('stick', LEVEL, EMPTY).find((t) => t.stationId === 'dock-a');

        expect(target?.tiles).toEqual([
            [22, 4],
            [23, 4],
        ]);
    });

    /**
     * The sign and the lighting disagreed: `shelfLabel` filters `accepts`
     * through `haulableInputs` and paints KEGS IN, while the hint read the raw
     * `['keg','casing']` and lit the same zone up for a carried casing. Teaching
     * by lighting that casings are hauled is the hunt that got a playtester
     * stuck, in a second dialect.
     */
    it('lights the intake for exactly the inputs a player is sent to fetch', () => {
        const accepts = ASSEMBLY.inputShelf?.accepts as ItemType[];

        for (const type of accepts) {
            const lit = dropTargets(type, LEVEL, EMPTY).some((t) => t.stationId === 'assembly-a');

            expect({ type, lit }).toEqual({ type, lit: haulableInputs(accepts).includes(type) });
        }
    });

    /**
     * The half that must not break with it. A casing lifted off the shelf still
     * has to go somewhere: `shelfPush` reads `shelf.accepts`, which this filter
     * never touches, and the bare floor takes anything. What changed is only
     * what the floor advertises — a casing is a mistake to undo, not an errand.
     */
    it('never advertises the shelf as a casing destination, though it still takes one back', () => {
        expect(dropTargets('casing', LEVEL, EMPTY)).toEqual([]);
        expect(ASSEMBLY.inputShelf?.accepts).toContain('casing');
    });

    it('offers nothing for an item no station wants', () => {
        expect(dropTargets('crate', LEVEL, EMPTY)).toEqual([]);
    });

    it('names the station so the hint can say where to go', () => {
        expect(dropTargets('keg', LEVEL, EMPTY)[0]?.stationId).toBe('assembly-a');
    });

    /**
     * A fuse set is never shelved: `partsOnJig` in the server's jig arms the
     * cradle from the hands of whoever is standing on a work tile. Before this
     * the floor stayed dark while the player held the one thing the station was
     * stopped for, and the help promised it would light up.
     */
    it('lights the jig work tiles for a fuse set, which no shelf accepts', () => {
        const target = dropTargets('parts', LEVEL, EMPTY).find((t) => t.stationId === 'assembly-a');

        expect(target?.tiles).toEqual([
            [13, 8],
            [14, 8],
        ]);
    });

    it('does not send a fuse set to a machine that has no cradle', () => {
        const ids = dropTargets('parts', LEVEL, EMPTY).map((t) => t.stationId);

        expect(ids).toEqual(['assembly-a']);
    });

    /**
     * `shelfPush` refuses at the cap and the server answers with a `bonk` and no
     * words, so a hint pointing at a full shelf is a lie the player pays for.
     */
    it('drops a shelf that has no room left', () => {
        const full = new Map([['assembly-a', 8]]);

        expect(dropTargets('keg', LEVEL, full)).toEqual([]);
    });

    it('keeps a shelf with one slot still free', () => {
        const nearly = new Map([['assembly-a', 7]]);

        expect(dropTargets('keg', LEVEL, nearly)[0]?.stationId).toBe('assembly-a');
    });

    it('never closes the dock lanes, which hold no stock to fill', () => {
        const full = new Map([['dock-a', 99]]);

        expect(dropTargets('stick', LEVEL, full)[0]?.stationId).toBe('dock-a');
    });
});

describe('haulableInputs', () => {
    it('drops the casing Assembly stocks itself, leaving the keg a player must fetch', () => {
        expect(haulableInputs(['keg', 'casing'] as ItemType[])).toEqual(['keg']);
    });

    it('leaves nothing to fetch for a shelf the machine fills on its own', () => {
        expect(haulableInputs(['casing'] as ItemType[])).toEqual([]);
    });

    it('has nothing to fetch for a shelf that lists nothing', () => {
        expect(haulableInputs(undefined)).toEqual([]);
    });

    it('counts the casing as self-stocked', () => {
        expect(SELF_STOCKED).toContain('casing');
    });
});

describe('pluralOf', () => {
    it('names an item the way a sign would', () => {
        expect(pluralOf('keg' as ItemType)).toBe('KEGS');
    });
});

describe('producedBy', () => {
    it('reads what a machine makes off the level recipes', () => {
        expect(producedBy(POWDER, LEVEL.recipes)).toBe('keg');
        expect(producedBy(ASSEMBLY, LEVEL.recipes)).toBe('stick');
    });

    it('has nothing to say about a station no recipe names', () => {
        expect(producedBy(DOCK, LEVEL.recipes)).toBeNull();
    });
});

describe('shelfLabel', () => {
    // Was 'KEGS · CASINGS'. That label sent playtesters hunting for casings no
    // player ever carries — shared/src/sim/jig.ts feed() stocks them itself.
    it('names only what a player must carry there, as an instruction', () => {
        expect(shelfLabel('in', ['keg', 'casing'] as ItemType[], null)).toBe('KEGS IN');
    });

    it('joins several haulable types under one instruction', () => {
        expect(shelfLabel('in', ['keg', 'stick'] as ItemType[], null)).toBe('KEGS · STICKS IN');
    });

    it('says IN for a shelf with nothing on it a player brings', () => {
        expect(shelfLabel('in', ['casing'] as ItemType[], null)).toBe('IN');
        expect(shelfLabel('in', undefined, null)).toBe('IN');
    });

    /**
     * Assembly shouts NEED KEGS and Boom Powder — where the kegs are — never used
     * the word at all: four white rounded rectangles on a tray marked 'OUT'.
     */
    it('names what is on an out tray, so the source of a keg has the word on it', () => {
        expect(shelfLabel('out', undefined, 'keg' as ItemType)).toBe('KEGS OUT');
    });

    it('falls back to a bare OUT when the level says nothing about the output', () => {
        expect(shelfLabel('out', undefined, null)).toBe('OUT');
    });
});

describe('blockedTargets', () => {
    /**
     * The dead end. `acceptsAt` drops a shelf at its cap, so a player holding a
     * keg in front of a full Assembly saw no pulsing tile, no lit apron and got
     * a wordless `bonk` from `E` — the screen went silent at the moment it was
     * needed loudest. The destination still exists; it is refusing, which is a
     * different thing from not being there.
     */
    it('still names the shelf that would take the keg if it had room', () => {
        const full = new Map([['assembly-a', 8]]);

        expect(dropTargets('keg', LEVEL, full)).toEqual([]);
        expect(blockedTargets('keg', LEVEL, full)).toEqual([
            { stationId: 'assembly-a', tiles: [[12, 9]] },
        ]);
    });

    it('says nothing about a shelf that still has room, which is a live target', () => {
        expect(blockedTargets('keg', LEVEL, new Map([['assembly-a', 7]]))).toEqual([]);
    });

    /**
     * A blocked destination and a destination that never existed are not the
     * same message. The floor may not offer the shelf for a casing at all, so it
     * may not paint the shelf refusing one either.
     */
    it('never names a shelf the floor does not advertise for this item', () => {
        expect(blockedTargets('casing', LEVEL, new Map([['assembly-a', 8]]))).toEqual([]);
        expect(blockedTargets('crate', LEVEL, new Map([['assembly-a', 8]]))).toEqual([]);
    });

    it('has nothing to say about dock lanes, which never fill up', () => {
        expect(blockedTargets('stick', LEVEL, new Map([['dock-a', 99]]))).toEqual([]);
    });
});

describe('productLabel', () => {
    /**
     * `OrderState.product` is a recipe key. Printed raw, the `Tab` board read
     * 'o-1  red_stick  0/7  open' — a fourth name for the thing the factory
     * ships, in snake_case, on a panel. The recipe already knows what the key
     * makes, and the floor calls that a stick.
     */
    it('reads the order board noun off the recipe the key names', () => {
        expect(productLabel('red_stick', LEVEL.recipes)).toBe('STICK');
    });

    it('never lets a snake_case key reach a panel, even one no recipe knows', () => {
        expect(productLabel('gold_stick', LEVEL.recipes)).toBe('GOLD STICK');
    });
});
