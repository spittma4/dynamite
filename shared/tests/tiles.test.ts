import { describe, expect, it } from 'vitest';

import {
    facingFrom,
    facingVector,
    inBounds,
    neighbours8,
    packTile,
    parseTileKey,
    tileKey,
    tileOf,
    unpackTile,
} from '../src/sim/tiles';
import type { Facing } from '../src/sim/tiles';

const WIDTH = 28;
const HEIGHT = 18;

describe('packing', () => {
    it('packs a tile as y × width + x', () => {
        expect(packTile(13, 9, WIDTH)).toBe(265);
        expect(packTile(0, 0, WIDTH)).toBe(0);
        expect(packTile(27, 17, WIDTH)).toBe(503);
    });

    it('unpacks back to the same tile', () => {
        expect(unpackTile(265, WIDTH)).toEqual([13, 9]);
        expect(unpackTile(0, WIDTH)).toEqual([0, 0]);
        expect(unpackTile(packTile(5, 11, WIDTH), WIDTH)).toEqual([5, 11]);
    });
});

describe('tileOf', () => {
    it('floors a float position onto its tile', () => {
        expect(tileOf(13.6, 9.2)).toEqual([13, 9]);
        expect(tileOf(13, 9)).toEqual([13, 9]);
        expect(tileOf(13.999, 9.999)).toEqual([13, 9]);
    });
});

describe('tile keys', () => {
    it('formats and parses an x,y key', () => {
        expect(tileKey(13, 9)).toBe('13,9');
        expect(parseTileKey('13,9')).toEqual([13, 9]);
    });

    it('returns null for anything that is not two integers', () => {
        expect(parseTileKey('')).toBeNull();
        expect(parseTileKey('13')).toBeNull();
        expect(parseTileKey('13,')).toBeNull();
        expect(parseTileKey('13,9,4')).toBeNull();
        expect(parseTileKey('a,b')).toBeNull();
        expect(parseTileKey('13.5,9')).toBeNull();
    });
});

describe('inBounds', () => {
    it('accepts a tile inside the map and rejects one outside', () => {
        expect(inBounds(0, 0, WIDTH, HEIGHT)).toBe(true);
        expect(inBounds(27, 17, WIDTH, HEIGHT)).toBe(true);
        expect(inBounds(-1, 0, WIDTH, HEIGHT)).toBe(false);
        expect(inBounds(28, 0, WIDTH, HEIGHT)).toBe(false);
        expect(inBounds(0, 18, WIDTH, HEIGHT)).toBe(false);
    });
});

describe('neighbours8', () => {
    it('drops the neighbours off the map at a corner', () => {
        const corner = neighbours8(0, 0, WIDTH, HEIGHT);

        expect(corner).toHaveLength(3);
        expect(corner).toEqual(expect.arrayContaining([[1, 0], [0, 1], [1, 1]]));
    });

    it('returns all eight in the interior', () => {
        expect(neighbours8(13, 9, WIDTH, HEIGHT)).toHaveLength(8);
    });
});

describe('facingFrom', () => {
    it('maps the eight directions clockwise from east', () => {
        const previous: Facing = 0;

        expect(facingFrom(1, 0, previous)).toBe(0);
        expect(facingFrom(1, 1, previous)).toBe(1);
        expect(facingFrom(0, 1, previous)).toBe(2);
        expect(facingFrom(-1, 1, previous)).toBe(3);
        expect(facingFrom(-1, 0, previous)).toBe(4);
        expect(facingFrom(-1, -1, previous)).toBe(5);
        expect(facingFrom(0, -1, previous)).toBe(6);
        expect(facingFrom(1, -1, previous)).toBe(7);
    });

    it('keeps the previous facing when standing still', () => {
        expect(facingFrom(0, 0, 3)).toBe(3);
        expect(facingFrom(0, 0, 6)).toBe(6);
    });
});

describe('facingVector', () => {
    it('returns unit vectors for the four cardinals', () => {
        expect(facingVector(0)).toEqual({ dx: 1, dy: 0 });
        expect(facingVector(2)).toEqual({ dx: 0, dy: 1 });
        expect(facingVector(4)).toEqual({ dx: -1, dy: 0 });
        expect(facingVector(6)).toEqual({ dx: 0, dy: -1 });
    });

    it('normalises the diagonals', () => {
        const ne = facingVector(7);

        expect(ne.dx).toBeCloseTo(0.70710678, 8);
        expect(ne.dy).toBeCloseTo(-0.70710678, 8);
        expect(Math.hypot(ne.dx, ne.dy)).toBeCloseTo(1, 8);
    });
});
