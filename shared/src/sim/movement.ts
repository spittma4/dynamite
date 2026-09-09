import type { LayoutConfig } from '../config/types';
import type { Axis } from '../messages';
import { facingFrom, packTile } from './tiles';
import type { Facing } from './tiles';

/**
 * The one movement integrator (contracts §10.8). The server runs it inside its
 * 20 Hz tick and the client runs it to predict its own avatar, so both have to
 * be this exact arithmetic — anything the server does that the client cannot
 * see (push, bump, stagger) stays out of here.
 */

export interface MoveInput {
    dx: Axis;
    dy: Axis;
}

export interface MoveResult {
    x: number;
    y: number;
    facing: Facing;
    moved: boolean;
}

export type SolidFn = (tx: number, ty: number) => boolean;

/** Keeps a circle off a tile boundary it is exactly on, so a corner never traps it. */
const EPSILON = 1e-6;
const MOVED_EPSILON = 1e-9;

export function makeWallLookup(layout: LayoutConfig): SolidFn {
    const walls = new Set(layout.walls);

    return (tx, ty) => {
        if (tx < 0 || ty < 0 || tx >= layout.width || ty >= layout.height) return true;

        return walls.has(packTile(tx, ty, layout.width));
    };
}

/** The rows (or columns) a circle of `radius` at `centre` overlaps. */
function span(centre: number, radius: number): { from: number; to: number } {
    return { from: Math.floor(centre - radius + EPSILON), to: Math.floor(centre + radius - EPSILON) };
}

function blocked(tile: number, from: number, to: number, isSolid: SolidFn, horizontal: boolean): boolean {
    for (let other = from; other <= to; other++) {
        if (horizontal ? isSolid(tile, other) : isSolid(other, tile)) return true;
    }

    return false;
}

/** One axis of the step; separating them is what makes a wall slide free. */
function slide(
    position: number,
    velocity: number,
    dt: number,
    radius: number,
    other: { from: number; to: number },
    isSolid: SolidFn,
    horizontal: boolean,
): number {
    if (velocity === 0) return position;

    const moved = position + velocity * dt;

    if (velocity > 0) {
        const tile = Math.floor(moved + radius);

        if (blocked(tile, other.from, other.to, isSolid, horizontal)) return tile - radius - EPSILON;

        return moved;
    }

    const tile = Math.floor(moved - radius);

    if (blocked(tile, other.from, other.to, isSolid, horizontal)) return tile + 1 + radius + EPSILON;

    return moved;
}

export function stepPosition(
    pos: { x: number; y: number; facing: Facing },
    intent: MoveInput,
    dt: number,
    isSolid: SolidFn,
    speed: number,
    radius: number,
): MoveResult {
    const facing = facingFrom(intent.dx, intent.dy, pos.facing);

    if (speed <= 0 || (intent.dx === 0 && intent.dy === 0)) {
        return { x: pos.x, y: pos.y, facing, moved: false };
    }

    const length = intent.dx !== 0 && intent.dy !== 0 ? Math.SQRT2 : 1;
    const vx = (intent.dx / length) * speed;
    const vy = (intent.dy / length) * speed;

    const x = slide(pos.x, vx, dt, radius, span(pos.y, radius), isSolid, true);
    const y = slide(pos.y, vy, dt, radius, span(x, radius), isSolid, false);

    return {
        x,
        y,
        facing,
        moved: Math.abs(x - pos.x) + Math.abs(y - pos.y) > MOVED_EPSILON,
    };
}

/**
 * A step never enters a wall, but a push from another player can, so this is
 * the repair: the shortest axis-aligned move that clears the overlap.
 */
export function pushOutOfSolid(
    x: number,
    y: number,
    radius: number,
    isSolid: SolidFn,
): { x: number; y: number } {
    const tx = Math.floor(x);
    const ty = Math.floor(y);

    if (isSolid(tx, ty)) {
        const exits = [x - tx, tx + 1 - x, y - ty, ty + 1 - y];
        const shortest = Math.min(...exits);

        if (shortest === exits[0]) return { x: tx - radius - EPSILON, y };
        if (shortest === exits[1]) return { x: tx + 1 + radius + EPSILON, y };
        if (shortest === exits[2]) return { x, y: ty - radius - EPSILON };

        return { x, y: ty + 1 + radius + EPSILON };
    }

    let nx = x;
    let ny = y;

    if (isSolid(tx + 1, ty) && nx + radius > tx + 1) nx = tx + 1 - radius;
    if (isSolid(tx - 1, ty) && nx - radius < tx) nx = tx + radius;
    if (isSolid(tx, ty + 1) && ny + radius > ty + 1) ny = ty + 1 - radius;
    if (isSolid(tx, ty - 1) && ny - radius < ty) ny = ty + radius;

    return { x: nx, y: ny };
}
