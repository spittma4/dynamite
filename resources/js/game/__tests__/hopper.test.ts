import { describe, expect, it } from 'vitest';

import { TILE_PX, type ItemType, type StationConfig } from '@shared';

import { pluralOf } from '../render/dropTargets';
import { ANY, AUTO, fillRows, fuseBinOf, hopperOf, outlineOf } from '../render/hopper';

/**
 * The furniture on a shelf tile (F15 §2). Everything here is pixels and words,
 * so the funnel can be argued about without a canvas: `render/Stations.ts`
 * draws exactly what these functions return.
 */

function station(over: Partial<StationConfig> & Pick<StationConfig, 'id' | 'type'>): StationConfig {
    return {
        anchor: [0, 0],
        workTiles: [],
        rackTiles: [],
        inputShelf: null,
        outputShelf: null,
        ...over,
    } as unknown as StationConfig;
}

/** The shipped Assembly, re-laid: in on the left face, out on the right. */
const ASSEMBLY = station({
    id: 'assembly-a',
    type: 'assembly',
    anchor: [13, 3],
    workTiles: [
        [13, 5],
        [14, 5],
    ],
    rackTiles: [[13, 7]],
    inputShelf: { tile: [11, 4], capacity: 8, accepts: ['keg', 'casing'] },
    outputShelf: { tile: [16, 4], capacity: 4 },
});

/** The shipped Boom Powder: an out tray and no input anybody carries to it. */
const POWDER = station({
    id: 'powder-a',
    type: 'boom_powder',
    anchor: [4, 3],
    workTiles: [[4, 5]],
    outputShelf: { tile: [7, 4], capacity: 6 },
});

const DOCK = station({
    id: 'dock-a',
    type: 'dock',
    anchor: [22, 1],
    workTiles: [
        [22, 4],
        [23, 4],
    ],
});

const kegs = (n: number): ItemType[] => Array.from({ length: n }, () => 'keg' as ItemType);

describe('hopperOf', () => {
    it('is nothing on a face with no shelf', () => {
        expect(hopperOf(POWDER, 'in', [])).toBeNull();
        expect(hopperOf(DOCK, 'out', [])).toBeNull();
        expect(hopperOf(DOCK, 'in', [])).toBeNull();
    });

    it('pours in through a funnel and hands out through a chute', () => {
        expect(hopperOf(ASSEMBLY, 'in', [])?.kind).toBe('funnel');
        expect(hopperOf(ASSEMBLY, 'out', [])?.kind).toBe('chute');
        expect(hopperOf(POWDER, 'out', [])?.kind).toBe('chute');
    });
});

/**
 * The fill column is the whole change: six kegs on Boom Powder's out tray is
 * the thesis of the game in one silhouette, and at 8 px glyphs it looked the
 * same from the Dock end whether it held one or six.
 */
describe('how full it looks', () => {
    it('is empty at nothing and brim-full at the cap', () => {
        expect(hopperOf(POWDER, 'out', [])?.fill).toBe(0);
        expect(hopperOf(POWDER, 'out', kegs(6))?.fill).toBe(1);
    });

    it('is the fraction of the cap in between', () => {
        expect(hopperOf(POWDER, 'out', kegs(3))?.fill).toBe(0.5);
    });

    // `shelfPush` refuses at the cap, but a level may be re-tuned under a
    // running shelf, and a column drawn past the mouth is worse than a full one.
    it('clamps rather than overflowing the mouth', () => {
        expect(hopperOf(POWDER, 'out', kegs(9))?.fill).toBe(1);
    });

    it('is full only once the cap is reached', () => {
        expect(hopperOf(POWDER, 'out', kegs(5))?.full).toBe(false);
        expect(hopperOf(POWDER, 'out', kegs(6))?.full).toBe(true);
        expect(hopperOf(POWDER, 'out', kegs(7))?.full).toBe(true);
    });

    it("counts what is on the shelf against the shelf's own cap", () => {
        const hopper = hopperOf(POWDER, 'out', kegs(2));

        expect(hopper?.count).toBe(2);
        expect(hopper?.capacity).toBe(6);
    });
});

/**
 * The bins are furniture, not contents: the funnel has to be there before the
 * first keg arrives, because an empty in-tray is exactly the state a hauler is
 * looking for it in.
 */
describe('the bins on an input face', () => {
    it("draws one bin per accepted type, in the shelf's own order", () => {
        const bins = hopperOf(ASSEMBLY, 'in', [])?.bins ?? [];

        expect(bins.map((bin) => bin.type)).toEqual(['keg', 'casing']);
    });

    it('counts a type rather than an item, so three casings are one bin', () => {
        const bins = hopperOf(ASSEMBLY, 'in', ['keg', 'casing', 'casing', 'casing'])?.bins ?? [];

        expect(bins.map((bin) => bin.count)).toEqual([1, 3]);
    });

    it("gives the machine's own stock a closed silo and the hauled type a funnel", () => {
        const bins = hopperOf(ASSEMBLY, 'in', [])?.bins ?? [];

        expect(bins[0]?.selfStocked).toBe(false);
        expect(bins[0]?.kind).toBe('funnel');
        expect(bins[1]?.selfStocked).toBe(true);
        expect(bins[1]?.kind).toBe('silo');
    });

    it('names each bin the way the floor signs name a pile of them', () => {
        const bins = hopperOf(ASSEMBLY, 'in', [])?.bins ?? [];

        expect(bins.map((bin) => bin.label)).toEqual([pluralOf('keg'), pluralOf('casing')]);
    });

    it('gives the funnel more of the face than the silo nobody fills', () => {
        const bins = hopperOf(ASSEMBLY, 'in', [])?.bins ?? [];
        const width = (i: number): number => (bins[i]?.box.x1 ?? 0) - (bins[i]?.box.x0 ?? 0);

        expect(width(0)).toBeGreaterThan(width(1) * 2);
    });

    it('leaves no gap between the bins: the face is one piece of furniture', () => {
        const bins = hopperOf(ASSEMBLY, 'in', [])?.bins ?? [];

        expect(bins[0]?.box.x1).toBe(bins[1]?.box.x0);
    });

    /**
     * Each column is its own type against the shelf's shared cap, so two quarter
     * -full columns are a half-full shelf. They are drawn side by side and not
     * stacked, which is why the `n/cap` counter is anchored to the shelf's own
     * face rather than to a bin's throat: nothing about the picture adds them.
     */
    it("fills each bin with its own type against the shelf's shared cap", () => {
        const bins = hopperOf(ASSEMBLY, 'in', ['keg', 'keg', 'casing', 'casing'])?.bins ?? [];

        expect(bins.map((bin) => bin.count)).toEqual([2, 2]);
        expect(bins.map((bin) => bin.fill)).toEqual([0.25, 0.25]);
    });

    it('gives an out face one chute across the whole tile', () => {
        const hopper = hopperOf(POWDER, 'out', kegs(2));
        const bin = hopper?.bins[0];

        expect(hopper?.bins).toHaveLength(1);
        expect(bin?.kind).toBe('chute');
        expect(bin?.count).toBe(2);
    });
});

/**
 * The hopper grows up into the machine, never into the floor: the tile above
 * every shelf in the re-laid floor is machine wall, and the bottom of the shelf
 * tile stays clear so the apron's stripes are still visible under it.
 */
describe('where it stands', () => {
    const box = hopperOf(POWDER, 'out', [])?.bins[0]?.box;

    it('rises into the tile above the shelf', () => {
        expect(box?.top).toBe(3 * TILE_PX);
    });

    it('stops short of the bottom of the shelf tile, where the stripes are', () => {
        expect(box?.bottom).toBeGreaterThan(4 * TILE_PX);
        expect(box?.bottom).toBeLessThan(5 * TILE_PX);
    });

    it("sits inside the tile's own width", () => {
        expect(box?.x0).toBeGreaterThanOrEqual(7 * TILE_PX);
        expect(box?.x1).toBeLessThanOrEqual(8 * TILE_PX);
    });
});

/**
 * The `n/cap` counter used to sit a gap *below* the tile — a number you walked
 * over to read. It goes on the furniture instead, at the throat's height;
 * `render/Stations.ts` centres it on the shelf rather than on a bin, because
 * `shelfCounter` counts the whole shelf and a bin's column counts one type.
 */
describe('the throat the counter sits on', () => {
    it('is above the bottom of the shelf tile rather than under it', () => {
        const throat = hopperOf(POWDER, 'out', [])?.throat;

        expect(throat?.y).toBeLessThan(5 * TILE_PX);
    });

    it('is on the funnel, not on the silo the machine stocks for itself', () => {
        const hopper = hopperOf(ASSEMBLY, 'in', []);
        const funnel = hopper?.bins[0]?.box;

        expect(hopper?.throat.x).toBeGreaterThanOrEqual(funnel?.x0 ?? 0);
        expect(hopper?.throat.x).toBeLessThanOrEqual(funnel?.x1 ?? 0);
    });
});

describe('outlineOf', () => {
    it('narrows from the mouth to the throat on a funnel', () => {
        const bin = hopperOf(ASSEMBLY, 'in', [])?.bins[0];
        const points = outlineOf(bin!);
        const width = (y: number): number => {
            const at = points.filter((p) => p.y === y).map((p) => p.x);

            return Math.max(...at) - Math.min(...at);
        };

        expect(width(bin!.box.top)).toBeGreaterThan(width(bin!.box.bottom));
    });

    it('leans the chute toward the tile you pick up from, on the right', () => {
        const bin = hopperOf(POWDER, 'out', [])?.bins[0];
        const points = outlineOf(bin!);
        const bottom = points.filter((p) => p.y === bin!.box.bottom).map((p) => p.x);

        expect(Math.max(...bottom)).toBe(bin!.box.x1);
        expect(Math.min(...bottom)).toBeGreaterThan(bin!.box.x0);
    });

    it('keeps a silo square-shouldered: you cannot pour into it', () => {
        const bin = hopperOf(ASSEMBLY, 'in', [])?.bins[1];
        const points = outlineOf(bin!);
        const xs = new Set(points.map((p) => p.x));

        expect([...xs].sort((a, b) => a - b)).toEqual([bin!.box.x0, bin!.box.x1]);
    });
});

describe('fillRows', () => {
    it('draws nothing for an empty bin', () => {
        const bin = hopperOf(POWDER, 'out', [])?.bins[0];

        expect(fillRows(bin!)).toEqual([]);
    });

    it('rises with the count and never above the mouth', () => {
        const half = hopperOf(POWDER, 'out', kegs(3))?.bins[0];
        const brim = hopperOf(POWDER, 'out', kegs(6))?.bins[0];
        const top = (rows: { y: number }[]): number => Math.min(...rows.map((r) => r.y));

        expect(top(fillRows(half!))).toBeGreaterThan(top(fillRows(brim!)));
        expect(top(fillRows(brim!))).toBe(brim!.box.top);
    });

    it('follows the silhouette, so the column is narrow at the throat', () => {
        const rows = fillRows(hopperOf(POWDER, 'out', kegs(6))!.bins[0]!);
        const lowest = rows.reduce((a, b) => (a.y > b.y ? a : b));
        const highest = rows.reduce((a, b) => (a.y < b.y ? a : b));

        expect(lowest.w).toBeLessThan(highest.w);
    });

    it('starts at the bottom of the bin, where the product settles', () => {
        const rows = fillRows(hopperOf(POWDER, 'out', kegs(2))!.bins[0]!);
        const bottom = Math.max(...rows.map((r) => r.y + r.h));

        expect(bottom).toBe(hopperOf(POWDER, 'out', [])!.bins[0]!.box.bottom);
    });
});

describe('the word on a silo', () => {
    it('says the machine feeds itself, in one short word read down the bin', () => {
        expect(AUTO).toBe('AUTO');
    });
});

/**
 * The receptacle (N2). "There should be a receptacle for fuses like there is for
 * boom — having to just drop them in at the assembly line's feet or carry it
 * over as the operator is kludgey and doesn't make sense. You input the materials
 * into the station the same." So `assembly-a.inputShelf.accepts` gains `parts`
 * and the fuse set gets the bin every other material already had.
 */
const WITH_FUSES = station({
    id: 'assembly-a',
    type: 'assembly',
    anchor: [13, 3],
    workTiles: [
        [13, 5],
        [14, 5],
    ],
    rackTiles: [[13, 7]],
    inputShelf: { tile: [11, 4], capacity: 8, accepts: ['keg', 'casing', 'parts'] },
    outputShelf: { tile: [16, 4], capacity: 4 },
});

describe('the fuse bin on the intake face', () => {
    it('is a bin like the others, in the order the shelf accepts them', () => {
        const bins = hopperOf(WITH_FUSES, 'in', [])?.bins ?? [];

        expect(bins.map((bin) => bin.type)).toEqual(['keg', 'casing', 'parts']);
    });

    it('is a funnel you pour into, not a silo the machine stocks for itself', () => {
        const bin = hopperOf(WITH_FUSES, 'in', [])?.bins[2];

        expect(bin?.kind).toBe('funnel');
        expect(bin?.selfStocked).toBe(false);
    });

    it('carries the name the floor signs give a pile of them', () => {
        const bin = hopperOf(WITH_FUSES, 'in', [])?.bins[2];

        expect(bin?.label).toBe(pluralOf('parts'));
    });

    it('fills with the sets banked in it against the shelf cap', () => {
        const bins = hopperOf(WITH_FUSES, 'in', ['keg', 'parts', 'parts'])?.bins ?? [];

        expect(bins.map((bin) => bin.count)).toEqual([1, 0, 2]);
        expect(bins[2]?.fill).toBe(0.25);
    });
});

/**
 * Three bins will not fit in 28 px: at the old share-of-one-tile split the keg
 * funnel came out 12 px wide and the AUTO silo 3.6 px, which is narrower than
 * the word read down it. The intake *side* of a machine is as wide as the bins
 * standing on it, and it grows inward — the tile a hauler faces stays the aiming
 * point, and the frontage it borrows is machine wall nobody walks on.
 */
describe('how wide the intake face is', () => {
    const span = (s: StationConfig, side: 'in' | 'out'): number => {
        const bins = hopperOf(s, side, [])?.bins ?? [];

        return Math.max(...bins.map((b) => b.box.x1)) - Math.min(...bins.map((b) => b.box.x0));
    };

    it('is one shelf tile for a face with a single bin', () => {
        expect(span(POWDER, 'out')).toBeLessThanOrEqual(TILE_PX);
    });

    it('grows with every bin after the first', () => {
        expect(span(WITH_FUSES, 'in')).toBeGreaterThan(span(ASSEMBLY, 'in'));
        expect(span(ASSEMBLY, 'in')).toBeGreaterThan(span(POWDER, 'out'));
    });

    it('grows into the machine, never out into the aisle the hauler walks', () => {
        const bins = hopperOf(WITH_FUSES, 'in', [])?.bins ?? [];
        const aisleEdge = 11 * TILE_PX;

        // The shelf is on the left face, so the machine is to the right of it and
        // the face may only reach that way.
        expect(Math.min(...bins.map((b) => b.box.x0))).toBeGreaterThanOrEqual(aisleEdge);
        expect(Math.max(...bins.map((b) => b.box.x1))).toBeGreaterThan(12 * TILE_PX);
    });

    it('puts the first type it accepts nearest the aisle', () => {
        const bins = hopperOf(WITH_FUSES, 'in', [])?.bins ?? [];

        expect(bins[0]?.box.x0).toBeLessThan(bins[2]?.box.x0 ?? 0);
    });

    it('leaves no gap between any two of them', () => {
        const bins = hopperOf(WITH_FUSES, 'in', [])?.bins ?? [];

        expect(bins[0]?.box.x1).toBe(bins[1]?.box.x0);
        expect(bins[1]?.box.x1).toBe(bins[2]?.box.x0);
    });

    /**
     * The silo is the bin that had to stay legible. Its width was a share of the
     * face, so it shrank with every type added to `accepts` — at three bins it
     * came out 3.6 px, narrower than the 7 px AUTO read down it, which put the
     * one genuinely new fact the hoppers carry across the funnel beside it. A
     * silo is not somewhere anybody aims, so its width is fixed and the bins a
     * player does aim at share what is left.
     */
    it('keeps the silo the same width however many bins join it', () => {
        const width = (s: StationConfig): number => {
            const box = hopperOf(s, 'in', [])?.bins[1]?.box;

            return (box?.x1 ?? 0) - (box?.x0 ?? 0);
        };

        expect(width(WITH_FUSES)).toBe(width(ASSEMBLY));
        expect(width(WITH_FUSES)).toBeGreaterThanOrEqual(7);
    });
});

/**
 * What the fuse bin says beyond how full it is. A fuse set is the one material
 * on the shelf that can be the *wrong* one: `usableSetOnShelf`
 * (`shared/src/sim/jig.ts`) only arms the cradle from a set the seated order can
 * use, and a bin full of LONG sets under a SHORT order stops the machine exactly
 * as dead as an empty one. So the bin names the length the machine will reach
 * for, in the rack's own three voices.
 */
describe('fuseBinOf', () => {
    it('names the length the machine is waiting for', () => {
        expect(fuseBinOf('short', []).tag).toBe('SHORT');
        expect(fuseBinOf('long', []).tag).toBe('LONG');
    });

    it('says ANY on a day with no order to disagree with', () => {
        expect(fuseBinOf('', []).tag).toBe(ANY);
        expect(ANY).toBe('ANY');
    });

    it('is idle while nothing is banked, whatever the order wants', () => {
        expect(fuseBinOf('short', []).tone).toBe('idle');
        expect(fuseBinOf('', []).tone).toBe('idle');
    });

    it('is set once the bin holds a length the machine can use', () => {
        const bin = fuseBinOf('short', ['long', 'short']);

        expect(bin.tone).toBe('set');
        expect(bin.banked).toBe(2);
        expect(bin.usable).toBe(1);
    });

    /**
     * The only amber state on the bin, and the reason it exists: every set in
     * there is the wrong length, so the machine will not touch one and the
     * 3/8 on the shelf is a lie about being stocked.
     */
    it('warns when everything banked is the wrong length', () => {
        const bin = fuseBinOf('short', ['long', 'long']);

        expect(bin.tone).toBe('warn');
        expect(bin.usable).toBe(0);
    });

    it('counts every set as usable when the machine has no preference', () => {
        const bin = fuseBinOf('', ['long', 'short']);

        expect(bin.tone).toBe('set');
        expect(bin.usable).toBe(2);
    });
});
