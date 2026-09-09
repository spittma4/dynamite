import type { Tile } from '../config/types';

/**
 * The only tile arithmetic in the repo. `packTile` is the packing used by
 * `LayoutConfig.walls`, `spillTiles` and `scorchTiles`, so a module that
 * invents its own would silently disagree with the map.
 */

export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DIAGONAL = Math.SQRT1_2;

interface Vector {
    dx: number;
    dy: number;
}

/** Facing 0 is east and the index climbs clockwise on screen (y grows down). */
const FACING_VECTORS: readonly [Vector, Vector, Vector, Vector, Vector, Vector, Vector, Vector] = [
    { dx: 1, dy: 0 },
    { dx: DIAGONAL, dy: DIAGONAL },
    { dx: 0, dy: 1 },
    { dx: -DIAGONAL, dy: DIAGONAL },
    { dx: -1, dy: 0 },
    { dx: -DIAGONAL, dy: -DIAGONAL },
    { dx: 0, dy: -1 },
    { dx: DIAGONAL, dy: -DIAGONAL },
];

const TILE_KEY = /^-?\d+,-?\d+$/;

export function tileOf(x: number, y: number): Tile {
    return [Math.floor(x), Math.floor(y)];
}

export function packTile(x: number, y: number, width: number): number {
    return y * width + x;
}

export function unpackTile(index: number, width: number): Tile {
    return [index % width, Math.floor(index / width)];
}

export function tileKey(x: number, y: number): string {
    return `${x},${y}`;
}

export function parseTileKey(key: string): Tile | null {
    if (!TILE_KEY.test(key)) return null;

    const comma = key.indexOf(',');

    return [Number(key.slice(0, comma)), Number(key.slice(comma + 1))];
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
    return x >= 0 && y >= 0 && x < width && y < height;
}

/** Off-map neighbours are dropped, so a blast at the wall edge stays legal. */
export function neighbours8(x: number, y: number, width: number, height: number): Tile[] {
    const found: Tile[] = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (inBounds(x + dx, y + dy, width, height)) found.push([x + dx, y + dy]);
        }
    }

    return found;
}

/** Indexed by `(sign(dy) + 1) * 3 + sign(dx) + 1`; the centre is standing still. */
const FACINGS_BY_SIGN: readonly (Facing | null)[] = [5, 6, 7, 4, null, 0, 3, 2, 1];

/** Standing still keeps the facing, so a player never snaps east on release. */
export function facingFrom(dx: number, dy: number, previous: Facing): Facing {
    const facing = FACINGS_BY_SIGN[(Math.sign(dy) + 1) * 3 + Math.sign(dx) + 1];

    return facing ?? previous;
}

export function facingVector(f: Facing): { dx: number; dy: number } {
    return FACING_VECTORS[f];
}
