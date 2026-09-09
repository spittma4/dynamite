import { TILE_PX, type JigMg } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    arcPoint,
    cradleShow,
    jigView,
    landingTile,
    seatTile,
    swingFraction,
    tileCentre,
} from '../minigames/JigWorldFx';

/**
 * The Jig as the rest of the floor sees it (F08 §Client). The view owns no
 * judgement and no timing of its own: every mark on it is `StationState.mg` and
 * the server clock, so the geometry is tested here and Phaser is left alone.
 */

const TILES: JigMg['tiles'] = {
    jig: [
        [13, 9],
        [14, 9],
    ],
    rack: [[16, 9]],
    aisle: [15, 9],
};

describe('tileCentre', () => {
    it('puts a tile at its own middle, in the same pixels the stations layer uses', () => {
        expect(tileCentre([13, 9])).toEqual({ x: 13.5 * TILE_PX, y: 9.5 * TILE_PX });
    });
});

describe('landingTile', () => {
    it('lands the set on the jig tile nearest the rack, as the server does', () => {
        expect(landingTile(TILES)).toEqual([14, 9]);
    });

    it('falls back to the aisle for a station with no jig tiles to land on', () => {
        expect(landingTile({ ...TILES, jig: [] })).toEqual([15, 9]);
    });
});

describe('seatTile', () => {
    it('seats the casing at A’s end, away from the tile the toss lands on', () => {
        expect(seatTile(TILES)).toEqual([13, 9]);
        expect(seatTile(TILES)).not.toEqual(landingTile(TILES));
    });

    it('falls back to the aisle for a station with no jig tiles to seat on', () => {
        expect(seatTile({ ...TILES, jig: [] })).toEqual([15, 9]);
    });
});

describe('swingFraction', () => {
    it('runs the swing from the rack to the mark the release is judged against', () => {
        expect(swingFraction(10, 0.5, 10)).toBe(0);
        expect(swingFraction(10, 0.5, 10.25)).toBeCloseTo(0.5, 10);
        expect(swingFraction(10, 0.5, 10.5)).toBe(1);
    });

    it('holds at the mark rather than running past it when B holds on', () => {
        expect(swingFraction(10, 0.5, 12)).toBe(1);
    });
});

describe('arcPoint', () => {
    it('leaves the rack and is over the landing tile when the release is due', () => {
        expect(arcPoint([16, 9], [14, 9], 0)).toEqual(tileCentre([16, 9]));
        expect(arcPoint([16, 9], [14, 9], 1)).toEqual(tileCentre([14, 9]));
    });

    it('lifts the set over the aisle rather than sliding it along the floor', () => {
        const mid = arcPoint([16, 9], [14, 9], 0.5);

        expect(mid.x).toBeCloseTo(tileCentre([15, 9]).x, 10);
        expect(mid.y).toBeLessThan(tileCentre([15, 9]).y);
    });

    it('clamps a fraction outside the swing to the ends of the arc', () => {
        expect(arcPoint([16, 9], [14, 9], -2)).toEqual(tileCentre([16, 9]));
        expect(arcPoint([16, 9], [14, 9], 9)).toEqual(tileCentre([14, 9]));
    });
});

describe('cradleShow', () => {
    it('draws nothing on an empty jig', () => {
        expect(cradleShow('empty', '').show).toBe(false);
    });

    it('sits an armed set square and leaves an OK toss cocked until A squares it', () => {
        expect(cradleShow('armed', 'long').angle).toBe(0);
        expect(cradleShow('surface', 'long').angle).toBeGreaterThan(0);
    });

    it('reads the spool B picked off the length of the fuse', () => {
        expect(cradleShow('armed', 'long').fusePx).toBeGreaterThan(
            cradleShow('armed', 'short').fusePx,
        );
        expect(cradleShow('armed', '').fusePx).toBe(0);
    });
});

describe('jigView', () => {
    it('is a StationView the scene can mount for every assembly station', () => {
        const view = jigView();

        expect(typeof view.create).toBe('function');
        expect(typeof view.update).toBe('function');
        expect(typeof view.destroy).toBe('function');
    });

    it('builds a fresh view per station rather than sharing one', () => {
        expect(jigView()).not.toBe(jigView());
    });
});
