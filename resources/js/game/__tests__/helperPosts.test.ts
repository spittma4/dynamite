import { TILE_PX, type StationConfig, type Tile } from '@shared';
import { describe, expect, it } from 'vitest';

import { helperPostsOf } from '@shared';

import {
    POST_ARM,
    POST_INSET,
    helperPosts,
    postBrackets,
    postsAreLive,
} from '../render/helperPosts';

/**
 * The floor marking for a helper post (N4). Every ring tile used to be drawn with
 * the same faint dashed square, so nothing on the floor said which tiles `E`
 * answers on — and the tiles it answered on were the corridor a hauler crosses.
 * All pixels, so the argument is settled here: `render/Stations.ts` paints exactly
 * what these return.
 */

/** `assembly-a` on the shipped floor, geometry only. */
const ASSEMBLY = {
    id: 'assembly-a',
    joinMode: 'press',
    workTiles: [
        [13, 5],
        [14, 5],
    ] as Tile[],
    floorRing: {
        tiles: [
            [17, 3],
            [11, 5],
            [12, 5],
            [15, 5],
            [16, 5],
            [11, 6],
            [12, 6],
            [13, 6],
            [14, 6],
            [15, 6],
            [11, 7],
            [17, 7],
        ] as Tile[],
    },
} as unknown as StationConfig;

/** A station with nothing to stand beside: no work tiles, so no posts. */
const NO_WORK = {
    id: 'nowhere',
    joinMode: 'press',
    workTiles: [] as Tile[],
    floorRing: { tiles: [[3, 3]] as Tile[] },
} as unknown as StationConfig;

/**
 * `dock-a` on the shipped floor: four ramp lanes, a fifteen-tile ring, and
 * `joinMode: 'stand'`. Five of those ring tiles touch a lane, so the geometry alone
 * yields five posts — and `E` can never answer one of them, because
 * `pressStationAtZone` skips any station whose `joinMode` is not `press` and
 * `syncStandMembers` only ever joins role `work`.
 */
const DOCK = {
    id: 'dock-a',
    joinMode: 'stand',
    workTiles: [
        [22, 4],
        [23, 4],
        [24, 4],
        [25, 4],
    ] as Tile[],
    floorRing: {
        tiles: [
            [21, 4],
            [20, 5],
            [21, 5],
            [22, 5],
            [23, 5],
            [24, 5],
            [25, 5],
            [26, 5],
            [20, 6],
            [21, 6],
            [22, 6],
            [23, 6],
            [24, 6],
            [25, 6],
            [26, 6],
        ] as Tile[],
    },
} as unknown as StationConfig;

describe('one post', () => {
    it('brackets the four corners and leaves the middle of the tile open', () => {
        const segs = postBrackets([12, 5]);

        expect(segs).toHaveLength(8);

        const left = 12 * TILE_PX + POST_INSET;
        const top = 5 * TILE_PX + POST_INSET;

        expect(segs[0]).toEqual({ x1: left, y1: top, x2: left + POST_ARM, y2: top });
        expect(segs[1]).toEqual({ x1: left, y1: top, x2: left, y2: top + POST_ARM });

        // Two arms at 7 px never meet across a 32 px tile, which is what makes it
        // a bracket rather than the dashed square every ring tile already wears.
        expect(POST_ARM * 2 + POST_INSET * 2).toBeLessThan(TILE_PX);
    });
});

describe('a station’s posts', () => {
    it('marks only the ring tiles beside the operator', () => {
        expect(helperPosts(ASSEMBLY).tiles.map(([x, y]: Tile) => `${x},${y}`)).toEqual([
            '12,5',
            '15,5',
            '13,6',
            '14,6',
        ]);
        expect(helperPosts(ASSEMBLY).brackets).toHaveLength(4 * 8);
    });

    it('puts one caption over the run furthest from the machine, not one per tile', () => {
        const caption = helperPosts(ASSEMBLY).caption;

        // Row 6 holds 13 and 14, so the word sits on the seam between them.
        expect(caption).toEqual({ x: 14 * TILE_PX, y: 6.5 * TILE_PX });
    });

    it('marks nothing at a station with no work tiles to stand beside', () => {
        expect(helperPosts(NO_WORK)).toEqual({ tiles: [], brackets: [], caption: null });
    });

    /**
     * A bracket is a promise that `E` will be answered there, and at a `stand`
     * station nothing can answer it: five permanent marks in the dock aisle on the
     * board a playtester already called 'words and signs just there'.
     */
    it('marks nothing at a station you join by standing on it', () => {
        expect(helperPostsOf(DOCK)).toHaveLength(5);
        expect(helperPosts(DOCK)).toEqual({ tiles: [], brackets: [], caption: null });
    });
});

describe('a live post', () => {
    it('is lit only once every work tile is held', () => {
        expect(postsAreLive(ASSEMBLY, new Set(['13,5', '14,5']))).toBe(true);
        expect(postsAreLive(ASSEMBLY, new Set(['13,5']))).toBe(false);
        expect(postsAreLive(ASSEMBLY, new Set())).toBe(false);
    });

    it('is never lit where there is no machine to be the second pair of hands on', () => {
        expect(postsAreLive(NO_WORK, new Set(['3,3']))).toBe(false);
    });

    // Four manned lanes used to light all five dock brackets to full yellow,
    // promising a press the server refuses.
    it('is never lit at a station with no press to answer it', () => {
        expect(postsAreLive(DOCK, new Set(['22,4', '23,4', '24,4', '25,4']))).toBe(false);
    });
});
