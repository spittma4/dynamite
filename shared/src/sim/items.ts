import type { ItemType } from '../schema/types';
import type { Tile } from '../config/types';
import { facingFrom } from './tiles';

/**
 * The item rules that hold on both sides of the wire: which way a facing points,
 * whether a shelf will take a thing, where a finished product goes, and what a
 * tile does to your feet. No world, no Colyseus — the server module in
 * `game-server/src/sim/items.ts` is what writes any of it down.
 */

/** Index is `PlayerState.facing`: 0 is east and the index climbs clockwise (y grows down). */
export const FACING_DIRS: readonly Tile[] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
];

export interface TileSpeedConfig {
    floorItemSpeed: number;
    spillSpeed: number;
}

/**
 * ADR 0012: a finished product auto-shelves while the shelf has room and
 * otherwise lands in the operator's hands, which is what stops the line — a
 * station cannot take input from full hands, so `null` means "do not arm".
 */
export function resolveDelivery(
    shelfLen: number,
    cap: number,
    operatorCarrying: string,
): 'shelf' | 'hands' | null {
    if (shelfLen < cap) return 'shelf';

    return operatorCarrying === '' ? 'hands' : null;
}

export function canShelve(
    shelfLen: number,
    cap: number,
    accepts: readonly ItemType[],
    itemType: ItemType,
): boolean {
    return shelfLen < cap && accepts.includes(itemType);
}

/** The lower factor wins: a keg lying in a puddle is not a shortcut. */
export function tileSpeedFactor(
    hasFloorItem: boolean,
    isSpill: boolean,
    cfg: TileSpeedConfig,
): number {
    let factor = 1;

    if (hasFloorItem) factor = Math.min(factor, cfg.floorItemSpeed);
    if (isSpill) factor = Math.min(factor, cfg.spillSpeed);

    return factor;
}

/** How long a player thrown at with full hands keeps complaining about it. */
export const BUBBLE_SECONDS = 2;

/**
 * A catch is a cooperative act, so the catcher has to be looking roughly the
 * right way: the thrower's direction has to be the faced octant or one of its
 * neighbours. Standing on the target tile faces nothing at all.
 */
export function facesTile(facing: number, from: Tile, target: Tile): boolean {
    const dx = target[0] - from[0];
    const dy = target[1] - from[1];

    if (dx === 0 && dy === 0) return false;

    const towards = facingFrom(dx, dy, 0);
    const apart = (((towards - facing) % 8) + 8) % 8;

    return apart <= 1 || apart >= 7;
}

/**
 * The far tile if it is free, else the near one: a throw into a wall drops the
 * item at the thrower's feet instead, and `null` means there is nowhere in the
 * line to put it.
 */
export function landingTile(
    from: Tile,
    facing: number,
    throwTiles: number,
    blocked: (t: Tile) => boolean,
): Tile | null {
    const dir = FACING_DIRS[facing % FACING_DIRS.length] ?? FACING_DIRS[0];

    if (dir === undefined) return null;

    for (let distance = throwTiles; distance >= 1; distance--) {
        const tile: Tile = [from[0] + dir[0] * distance, from[1] + dir[1] * distance];

        if (!blocked(tile)) return tile;
    }

    return null;
}

/** Both windows are symmetric: catching early is as good as catching late. */
export function judgeCatch(
    pressMs: number,
    arrivalMs: number,
    okMs: number,
    perfectMs: number,
): 'perfect' | 'ok' | 'miss' {
    const delta = Math.abs(pressMs - arrivalMs);

    if (delta <= perfectMs) return 'perfect';
    if (delta <= okMs) return 'ok';

    return 'miss';
}

export interface DropContext {
    /** Wall, off-map, shelf tile or a blast bin the item is not lit enough for. */
    blocked(t: Tile): boolean;
    /** A player stands there or another floor item lies there. */
    occupied(t: Tile): boolean;
    /** The station this tile is a work tile of, when jamming it is possible. */
    workTileOwner(t: Tile): string | null;
}

export type DropOutcome =
    | { kind: 'keg'; restTile: Tile; knockedOver: boolean; jamStationId: string | null }
    | { kind: 'stick'; restTile: Tile; fizzle: boolean; jamStationId: string | null }
    | { kind: 'inert'; restTile: Tile; jamStationId: string | null };

export interface DropRules {
    stickFizzleChance: number;
    kegKnockOverOnHit: boolean;
}

/**
 * docs/17: what a thing does when nobody catches it. A keg has weight and rolls
 * on; a stick is the one that can take the room with it. Nothing here touches
 * the world — the caller places, spills and soots from the outcome, which is
 * also what makes a seeded drop replayable.
 */
export function rollDrop(
    itemType: ItemType,
    origin: Tile,
    dir: Tile,
    ctx: DropContext,
    rng: () => number,
    cfg: DropRules,
): DropOutcome {
    if (itemType === 'keg') {
        const next: Tile = [origin[0] + dir[0], origin[1] + dir[1]];
        const hit = ctx.blocked(next) || ctx.occupied(next) || ctx.occupied(origin);
        const restTile = hit ? origin : next;

        return {
            kind: 'keg',
            restTile,
            knockedOver: hit && cfg.kegKnockOverOnHit,
            jamStationId: ctx.workTileOwner(restTile),
        };
    }

    if (itemType === 'stick') {
        const fizzle = rng() < cfg.stickFizzleChance;

        return {
            kind: 'stick',
            restTile: origin,
            fizzle,
            jamStationId: fizzle ? null : ctx.workTileOwner(origin),
        };
    }

    return { kind: 'inert', restTile: origin, jamStationId: ctx.workTileOwner(origin) };
}
