import type { LayoutConfig, StaffingCurve, StationConfig, Tile } from '../config/types';
import type { MgOp } from '../messages';
import type { StationType } from '../schema/types';
import { peakWorkers } from './curve';
import type { CycleInputs } from './cycle';
import { cycleSeconds } from './cycle';
import { packTile, tileKey } from './tiles';

/**
 * The staffing arithmetic behind a station (contracts §10.2). Everything the
 * runtime writes to `StationState` is decided here, out of reach of a clock or
 * a socket, because the numbers are the design: docs/05's cycle rule and the
 * bodies-in-the-aisle curve are what the player is really arguing with.
 */

export type Role = 'work' | 'rack' | 'helper';

export interface Footprint {
    bbox: { x0: number; y0: number; x1: number; y1: number };
    /** The layout's wall tiles inside the bbox — the machine body the client draws. */
    machine: Tile[];
}

export const STATION_LABEL: Record<StationType, string> = {
    boom_powder: 'BOOM POWDER',
    assembly: 'ASSEMBLY',
    dock: 'DOCK',
};

/**
 * `ActionMsg` carries no op, so the §11 fallback that hands a floor `Space`
 * to the station module needs one name per station type to send it under.
 */
export const ACTION_OP: Record<StationType, MgOp> = {
    boom_powder: 'charge',
    assembly: 'crimp',
    dock: 'shove',
};

function namedTiles(cfg: StationConfig): Tile[] {
    const tiles: Tile[] = [cfg.anchor, ...cfg.workTiles, ...cfg.rackTiles];

    if (cfg.inputShelf != null) tiles.push(cfg.inputShelf.tile);
    if (cfg.outputShelf != null) tiles.push(cfg.outputShelf.tile);

    return tiles;
}

export function footprintOf(cfg: StationConfig, layout: LayoutConfig): Footprint {
    const tiles = namedTiles(cfg);
    const xs = tiles.map(([x]) => x);
    const ys = tiles.map(([, y]) => y);
    const bbox = {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
    };
    const walls = new Set(layout.walls);
    const machine: Tile[] = [];

    for (let y = bbox.y0; y <= bbox.y1; y++) {
        for (let x = bbox.x0; x <= bbox.x1; x++) {
            if (walls.has(packTile(x, y, layout.width))) machine.push([x, y]);
        }
    }

    return { bbox, machine };
}

/** Every tile `E` can join from. Shelf and anchor tiles are furniture, not posts. */
export function joinZoneOf(cfg: StationConfig): Set<string> {
    const zone = new Set<string>();

    for (const [x, y] of [...cfg.workTiles, ...cfg.rackTiles, ...cfg.floorRing.tiles]) {
        zone.add(tileKey(x, y));
    }

    return zone;
}

export function roleForTile(cfg: StationConfig, tile: Tile): Role | null {
    const key = tileKey(tile[0], tile[1]);
    const holds = (tiles: Tile[]): boolean => tiles.some(([x, y]) => tileKey(x, y) === key);

    if (holds(cfg.workTiles)) return 'work';
    if (holds(cfg.rackTiles)) return 'rack';
    if (holds(cfg.floorRing.tiles)) return 'helper';

    return null;
}

/**
 * docs/02: the clipboard is the onboarding joke, and it is only funny once. A
 * player who worked this station within the memory window walks straight on.
 */
export function clipboardSecondsFor(
    lastLeftAt: number | undefined,
    now: number,
    clipboardSeconds: number,
    memorySeconds: number,
): number {
    if (lastLeftAt !== undefined && now - lastLeftAt <= memorySeconds) return 0;

    return clipboardSeconds;
}

export function countWorkers(
    members: ReadonlyArray<{ clipboardUntil: number }>,
    now: number,
): number {
    return members.filter((member) => member.clipboardUntil <= now).length;
}

export function extrasFor(curve: StaffingCurve, workers: number): number {
    return Math.max(0, workers - peakWorkers(curve));
}

export function interruptsPerSecond(extras: number, everySeconds: number): number {
    if (everySeconds <= 0) return 0;

    return extras / everySeconds;
}

/** The aisle is spent before the machine is: a body on a post has a post. */
const ROLE_IDLENESS: Record<Role, number> = { helper: 0, rack: 1, work: 2 };

/**
 * The bodies past the curve's peak are the ones with nothing to do, and how far
 * from the machine they are settles that before how late they were. An operator
 * who took the work tile after two helpers arrived is still the one person here
 * demonstrably doing something; making them ask *what can I do?* would freeze
 * their own mini-game every cadence.
 */
export function pickExtras<T extends { joinedAt: number; sessionId: string; role: Role }>(
    members: readonly T[],
    extras: number,
): T[] {
    if (extras <= 0) return [];

    return [...members]
        .sort(
            (a, b) =>
                ROLE_IDLENESS[a.role] - ROLE_IDLENESS[b.role] ||
                b.joinedAt - a.joinedAt ||
                a.sessionId.localeCompare(b.sessionId),
        )
        .slice(0, extras);
}

/** Spread over the second half of a cadence so three extras do not chant in unison. */
export function firstBubbleAt(now: number, everySeconds: number, u: number): number {
    return now + everySeconds * (0.5 + 0.5 * u);
}

/**
 * A missed cadence is owed, not forgiven — a station left in the aisle for
 * twenty seconds costs the operator every interrupt it earned.
 */
export function bubblesDue(
    nextBubbleAt: number,
    now: number,
    everySeconds: number,
): { count: number; nextBubbleAt: number } {
    if (now < nextBubbleAt || everySeconds <= 0) return { count: 0, nextBubbleAt };

    const count = Math.floor((now - nextBubbleAt) / everySeconds) + 1;

    return { count, nextBubbleAt: nextBubbleAt + count * everySeconds };
}

export function armedAt(startedAt: number, input: CycleInputs): number {
    return startedAt + cycleSeconds(input);
}
