import { TILE_PX, type Tile } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    COWL_PX,
    PLINTH_PX,
    controlLip,
    facePlate,
    machineBody,
    nameplate,
    onMachine,
} from '../render/machine';

/**
 * The machine's own silhouette (N3). The playtest line was "the gameboard is
 * better but just feels off… making the stations more of a 'machine' on the
 * board might fix it a lot", and the reason it feels off is in the old drawing:
 * every machine tile was filled separately and given its own 2 px top highlight,
 * so a six-tile Assembly was six boxes in a row with a word floating over the
 * middle of them. A label on a rectangle is signage; a body with a top, a front
 * and a mounting plate is a machine.
 *
 * All of it is pixels, so it can be argued about without a canvas:
 * `render/Stations.ts` paints exactly what these functions return.
 */

/** Assembly on the shipped floor: x 11–16 of rows 3 and 4 are wall. */
const ASSEMBLY: Tile[] = [11, 12, 13, 14, 15, 16].flatMap(
    (x): Tile[] => [
        [x, 3],
        [x, 4],
    ],
);

/** Boom Powder: x 3–7 of the same two rows. */
const POWDER: Tile[] = [3, 4, 5, 6, 7].flatMap((x): Tile[] => [
    [x, 3],
    [x, 4],
]);

/** The Dock's whole block is the one wall tile inside its bbox. */
const ONE_TILE: Tile[] = [[26, 4]];

/** An L, which is the shape that tells a silhouette apart from a bounding box. */
const L_SHAPE: Tile[] = [
    [1, 1],
    [2, 1],
    [1, 2],
];

describe('machineBody', () => {
    it('has nothing to draw for a station with no machine tiles', () => {
        expect(machineBody([])).toBeNull();
    });

    it('spans the block it was given, in pixels', () => {
        const body = machineBody(ASSEMBLY);

        expect(body?.bounds).toEqual({
            x: 11 * TILE_PX,
            y: 3 * TILE_PX,
            w: 6 * TILE_PX,
            h: 2 * TILE_PX,
        });
    });

    /**
     * One slab per run of tiles on a row, rather than one fill per tile. Twelve
     * fills with a highlight each is what made Assembly read as six boxes.
     */
    it('fills each row as one slab rather than one box per tile', () => {
        const slabs = machineBody(ASSEMBLY)?.slabs ?? [];

        expect(slabs).toHaveLength(2);
        expect(slabs[0]).toEqual({ x: 11 * TILE_PX, y: 3 * TILE_PX, w: 6 * TILE_PX, h: TILE_PX });
    });

    it('breaks a row into two slabs when the block has a gap in it', () => {
        const split = machineBody([
            [1, 1],
            [2, 1],
            [5, 1],
        ]);

        expect(split?.slabs.map((slab) => slab.w)).toEqual([2 * TILE_PX, TILE_PX]);
    });

    /**
     * The silhouette is the whole point: four strokes around a rectangular block,
     * not one stroke per tile edge. A tile border drawn inside the body is the
     * thing that made it look tiled.
     */
    it('outlines a rectangular block with four strokes and no inner seams', () => {
        const outline = machineBody(ASSEMBLY)?.outline ?? [];

        expect(outline).toHaveLength(4);
    });

    it('follows the shape rather than the bounding box', () => {
        const outline = machineBody(L_SHAPE)?.outline ?? [];

        // Six edges for an L: no run of the outline may cross the missing corner.
        expect(outline).toHaveLength(6);
        expect(outline.every((seg) => seg.x1 === seg.x2 || seg.y1 === seg.y2)).toBe(true);
    });

    it('keeps every stroke on the block, never over the floor beside it', () => {
        const body = machineBody(POWDER);
        const { x, y, w, h } = body?.bounds ?? { x: 0, y: 0, w: 0, h: 0 };

        for (const seg of body?.outline ?? []) {
            expect(Math.min(seg.x1, seg.x2)).toBeGreaterThanOrEqual(x);
            expect(Math.max(seg.x1, seg.x2)).toBeLessThanOrEqual(x + w);
            expect(Math.min(seg.y1, seg.y2)).toBeGreaterThanOrEqual(y);
            expect(Math.max(seg.y1, seg.y2)).toBeLessThanOrEqual(y + h);
        }
    });

    /**
     * A top and a front. The cowl catches the light where nothing is above the
     * block and the plinth is the shadow along the face the crew stands at, so
     * the body has a direction instead of being a flat grey field.
     */
    it('lights the top of the block and shades the front, once each', () => {
        const body = machineBody(ASSEMBLY);

        expect(body?.cowl).toEqual([
            { x: 11 * TILE_PX, y: 3 * TILE_PX, w: 6 * TILE_PX, h: COWL_PX },
        ]);
        expect(body?.plinth).toEqual([
            { x: 11 * TILE_PX, y: 5 * TILE_PX - PLINTH_PX, w: 6 * TILE_PX, h: PLINTH_PX },
        ]);
    });

    it('shades only the edges with floor on the other side', () => {
        const body = machineBody(L_SHAPE);

        // The L's top run covers both columns; its front is in two pieces, under
        // the tile that has nothing below it and under the foot of the column.
        expect(body?.cowl).toHaveLength(1);
        expect(body?.plinth).toHaveLength(2);
    });

    it('draws a one-tile block as a body all the same', () => {
        const body = machineBody(ONE_TILE);

        expect(body?.slabs).toHaveLength(1);
        expect(body?.outline).toHaveLength(4);
        expect(body?.cowl).toHaveLength(1);
    });
});

/**
 * The nameplate. `STATION_LABEL` used to be drawn straight onto the grey, which
 * is why the owner read the signage as "just there": a word hanging in the
 * middle of a rectangle belongs to nothing. A plate with bolts through it is
 * attached to the machine, and the word is then the machine's own name.
 */
describe('nameplate', () => {
    const centre = { x: 14 * TILE_PX, y: 4 * TILE_PX };

    it('is a plate centred on the word it carries', () => {
        const { plate } = nameplate(centre, 'ASSEMBLY'.length, 10);

        expect(plate.x + plate.w / 2).toBe(centre.x);
        expect(plate.y + plate.h / 2).toBe(centre.y);
    });

    it('grows with the name, so a long one is not painted over its own edge', () => {
        const short = nameplate(centre, 'DOCK'.length, 10).plate.w;
        const long = nameplate(centre, 'BOOM POWDER'.length, 10).plate.w;

        expect(long).toBeGreaterThan(short);
    });

    it('bolts it on at both ends, inside the plate', () => {
        const { plate, bolts } = nameplate(centre, 'ASSEMBLY'.length, 10);

        expect(bolts).toHaveLength(2);

        for (const bolt of bolts) {
            expect(bolt.x).toBeGreaterThan(plate.x);
            expect(bolt.x).toBeLessThan(plate.x + plate.w);
            expect(bolt.y).toBe(centre.y);
        }
    });
});

/**
 * The plate a hopper is bolted to. The bins used to stand on the shelf tile
 * looking like furniture parked in front of the machine; framed into the body
 * they read as mouths cut into its intake side, which is the half of N2 the
 * drawing owes the fuse bin.
 */
describe('facePlate', () => {
    const bins = [
        { x0: 100, x1: 124, top: 96, bottom: 152 },
        { x0: 124, x1: 132, top: 96, bottom: 152 },
    ];

    it('frames every bin on the face as one opening', () => {
        const plate = facePlate(bins);

        expect(plate?.x).toBeLessThan(100);
        expect(plate?.x ?? 0).toBeGreaterThan(100 - TILE_PX);
        expect((plate?.x ?? 0) + (plate?.w ?? 0)).toBeGreaterThan(132);
    });

    it('stops at the bottom of the bins, so the apron stripes stay visible', () => {
        const plate = facePlate(bins);

        expect((plate?.y ?? 0) + (plate?.h ?? 0)).toBe(152);
    });

    it('has nothing to frame on a face with no bins', () => {
        expect(facePlate([])).toBeNull();
    });
});

/**
 * The working side. The crew stands on the work tiles below the body, and
 * nothing on the body said so — the yellow tile outlines were on the floor, and
 * the machine above them was blank. The lip is the console they are standing at,
 * so it goes on the body's own front edge and only where that edge is actually
 * above a work tile.
 *
 * Measured against the front edges rather than the bounding box, because a
 * station's bbox swallows whatever happens to be inside it. `dock-a`'s footprint
 * takes in six wall tiles either side of the truck bay, and its four ramp lanes
 * are open floor in the middle of them: against the bbox the console came out as
 * a band painted straight across the lanes the crew walks on.
 */
describe('controlLip', () => {
    const body = machineBody(ASSEMBLY);
    const crew: Tile[] = [
        [13, 5],
        [14, 5],
    ];

    it('runs along the front of the body, over the tiles the crew stands on', () => {
        const lip = controlLip(body!, crew);

        expect(lip?.band.x).toBe(13 * TILE_PX);
        expect(lip?.band.w).toBe(2 * TILE_PX);
        expect((lip?.band.y ?? 0) + (lip?.band.h ?? 0)).toBe(5 * TILE_PX);
    });

    it('clamps to the body rather than running off the end of it', () => {
        const lip = controlLip(body!, [
            [9, 5],
            [18, 5],
        ]);

        expect(lip?.band.x).toBe(body?.bounds.x);
        expect((lip?.band.x ?? 0) + (lip?.band.w ?? 0)).toBe(
            (body?.bounds.x ?? 0) + (body?.bounds.w ?? 0),
        );
    });

    it('gives the console dials to read, inside the band', () => {
        const lip = controlLip(body!, crew);

        expect(lip?.dials.length).toBeGreaterThan(1);

        for (const dial of lip?.dials ?? []) {
            expect(dial.x).toBeGreaterThan(lip?.band.x ?? 0);
            expect(dial.x).toBeLessThan((lip?.band.x ?? 0) + (lip?.band.w ?? 0));
        }
    });

    it('has no console on a station whose crew stands nowhere near the body', () => {
        expect(controlLip(body!, [[30, 5]])).toBeNull();
    });

    it('has no console on a station with no work tiles at all', () => {
        expect(controlLip(body!, [])).toBeNull();
    });

    /**
     * The Dock, as the shipped floor actually lays it out: the wall stub left of
     * the bay and one tile to the right of the ramp, with the four lanes the crew
     * stands on as open floor between them. No front edge of that block is above
     * a lane, so the Dock has no console — rather than one drawn over the floor.
     */
    it('has no console where the body has no front edge above the crew', () => {
        const stub = machineBody([
            [20, 1],
            [21, 1],
            [20, 2],
            [21, 2],
            [21, 3],
            [26, 4],
        ]);

        expect(
            controlLip(stub!, [
                [22, 4],
                [23, 4],
                [24, 4],
                [25, 4],
            ]),
        ).toBeNull();
    });
});

/**
 * A plate is bolted to something. `machineCentre` is the mean of a station's
 * machine tiles, which for the Dock lands in the middle of the empty truck bay —
 * so the plate came out painted on bare floor with the ramp lanes under it.
 */
describe('where a plate may be bolted', () => {
    it('is on the machine for a station whose name sits on its own body', () => {
        const body = machineBody(ASSEMBLY);

        expect(onMachine(body!, { x: 14 * TILE_PX, y: 4 * TILE_PX })).toBe(true);
    });

    it('is nowhere for a point inside the block but not on a tile of it', () => {
        const stub = machineBody([
            [20, 1],
            [21, 1],
            [26, 4],
        ]);

        // The mean of those three tiles is 22.3, 2 — inside the bbox, on the floor.
        expect(onMachine(stub!, { x: 22.3 * TILE_PX, y: 2 * TILE_PX })).toBe(false);
    });
});
