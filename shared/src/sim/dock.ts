import type { Tile } from '../config/types';
import type { TruckPhase } from '../schema/types';
import { tileOf } from './tiles';
import type { ShoveWindows } from './orders';

/**
 * The Dock's arithmetic (docs/04 "The Dock"). The reversing alarm is the whole
 * mini-game: a beep is a moment in `clock` seconds, a shove is judged in
 * milliseconds against the nearest one, and nothing here reads a clock or draws
 * anything — the server judges and the overlay redraws the same numbers.
 */

export type { ShoveWindows };

export type ShoveResult = 'perfect' | 'ok' | 'miss';

export interface DockLane {
    tile: Tile;
    itemId: string;
    stalled: boolean;
}

export interface DockMg {
    truck: {
        phase: TruckPhase;
        arrivesAt: number;
        leavesAt: number;
        slots: number;
        loaded: number;
        /** One `'P'` or `'O'` per boarded stick, in loading order — the slot lamps. */
        hits: string;
    };
    lanes: DockLane[];
    beepAt: number;
    beepPeriodMs: number;
    windows: ShoveWindows;
    tailgateUntil: number;
    returnsTile: Tile;
}

/**
 * The beep a press was aimed at. The index is clamped to the beeps the truck
 * actually sounds, so a press after the last one is judged late against it
 * rather than dead-on against a beep that never happened.
 */
export function nearestBeep(
    beepAtMs: number,
    periodMs: number,
    beepCount: number,
    tMs: number,
): { index: number; deltaMs: number } {
    if (periodMs <= 0) return { index: 0, deltaMs: tMs - beepAtMs };

    const last = Math.max(0, beepCount - 1);
    const index = Math.min(last, Math.max(0, Math.round((tMs - beepAtMs) / periodMs)));

    return { index, deltaMs: tMs - (beepAtMs + index * periodMs) };
}

export function judgeShove(deltaMs: number, w: ShoveWindows): ShoveResult {
    const off = Math.abs(deltaMs);

    if (off <= w.perfectMs) return 'perfect';

    return off <= w.okMs ? 'ok' : 'miss';
}

/** 0 on the beep and while the truck is still on its way in. */
export function beepPhase(beepAtSec: number, periodMs: number, nowSec: number): number {
    if (periodMs <= 0 || nowSec <= beepAtSec) return 0;

    return (((nowSec - beepAtSec) * 1000) % periodMs) / periodMs;
}

/** The slam window never outlives the truck it would be slamming. */
export function tailgateWindowEnd(
    nowSec: number,
    leavesAt: number,
    windowSeconds: number,
): number {
    return Math.min(nowSec + windowSeconds, leavesAt);
}

export function laneIndexAt(lanes: readonly Tile[], x: number, y: number): number {
    const [tx, ty] = tileOf(x, y);

    return lanes.findIndex((tile) => tile[0] === tx && tile[1] === ty);
}

function isTile(value: unknown): value is Tile {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === 'number' &&
        typeof value[1] === 'number'
    );
}

function isLane(value: unknown): value is DockLane {
    if (typeof value !== 'object' || value === null) return false;

    const lane = value as Record<string, unknown>;

    return isTile(lane.tile) && typeof lane.itemId === 'string' && typeof lane.stalled === 'boolean';
}

function isTruck(value: unknown): value is DockMg['truck'] {
    if (typeof value !== 'object' || value === null) return false;

    const truck = value as Record<string, unknown>;

    return (
        typeof truck.phase === 'string' &&
        typeof truck.arrivesAt === 'number' &&
        typeof truck.leavesAt === 'number' &&
        typeof truck.slots === 'number' &&
        typeof truck.loaded === 'number' &&
        typeof truck.hits === 'string'
    );
}

/** The overlay reads a string the server wrote; a half-written one draws nothing. */
export function parseDockMg(json: string): DockMg | null {
    if (json === '') return null;

    let parsed: unknown;

    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

    const mg = parsed as Record<string, unknown>;
    const windows = mg.windows as Record<string, unknown> | undefined;

    if (!isTruck(mg.truck)) return null;
    if (!Array.isArray(mg.lanes) || !mg.lanes.every(isLane)) return null;
    if (typeof mg.beepAt !== 'number' || typeof mg.beepPeriodMs !== 'number') return null;
    if (typeof mg.tailgateUntil !== 'number' || !isTile(mg.returnsTile)) return null;
    if (windows === undefined || typeof windows.perfectMs !== 'number') return null;
    if (typeof windows.okMs !== 'number') return null;

    return parsed as DockMg;
}
