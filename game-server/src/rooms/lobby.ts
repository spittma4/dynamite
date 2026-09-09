import { PLAYER_COLOURS } from '../shared';
import type { LayoutConfig, PlayerState, SolidFn, Tile } from '../shared';
import type { PlayerRuntime, World } from '../sim/World';

/**
 * The lobby's rules before the whistle (contracts §10.1): who holds the start
 * button, whether pressing it is allowed, and where a seat and its colour come
 * from. They are plain functions over plain values so the room, the world and
 * the tests can each ask the same question without owning the answer.
 */

export type StartRefusal = { ok: false; reason: 'not-lobby' | 'not-host' | 'too-few'; min: number };
export type StartVerdict = { ok: true } | StartRefusal;

/**
 * The spawn tile first, then a ring around it, so seats fill outwards and no
 * two players start on the same tile. A `players.max` above the number of open
 * ring tiles wraps back onto the spawn tile — `World` logs when it does.
 */
const SPAWN_OFFSETS: readonly Tile[] = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [2, 0],
    [-2, 0],
];

function connectedCount(world: World): number {
    let connected = 0;

    for (const runtime of world.players.values()) {
        if (runtime.connected) connected++;
    }

    return connected;
}

/**
 * The owner's session wins outright; otherwise the earliest joiner still on the
 * socket. `''` when nobody is connected — the lobby then has no start button.
 */
export function chooseHost(
    players: Map<string, PlayerRuntime>,
    states: Map<string, PlayerState>,
    ownerUserId: string,
): string {
    let earliest: { sessionId: string; joinIndex: number } | null = null;

    for (const [sessionId, runtime] of players) {
        const state = states.get(sessionId);

        if (!runtime.connected || state === undefined) continue;
        if (ownerUserId !== '' && state.userId === ownerUserId) return sessionId;
        if (earliest === null || runtime.joinIndex < earliest.joinIndex) {
            earliest = { sessionId, joinIndex: runtime.joinIndex };
        }
    }

    return earliest?.sessionId ?? '';
}

/** Contracts §10.7. `min` rides along so the refusal can name the number. */
export function canStart(world: World, sessionId: string): StartVerdict {
    const min = world.level.players.min;

    if (world.state.phase !== 'lobby') return { ok: false, reason: 'not-lobby', min };
    if (world.state.host !== sessionId) return { ok: false, reason: 'not-host', min };
    if (connectedCount(world) < min) return { ok: false, reason: 'too-few', min };

    return { ok: true };
}

/** The lowest free palette index, so a seat freed by a leaver is reused. */
export function pickColour(taken: number[]): number {
    const used = new Set(taken);

    for (let colour = 0; colour < PLAYER_COLOURS; colour++) {
        if (!used.has(colour)) return colour;
    }

    return taken.length % PLAYER_COLOURS;
}

/** One tile per seat, in join order, walls skipped. */
export function spawnTiles(layout: LayoutConfig, isSolid: SolidFn, count: number): Tile[] {
    const [sx, sy] = layout.spawn;
    const open = SPAWN_OFFSETS.map(([dx, dy]): Tile => [sx + dx, sy + dy]).filter(
        ([tx, ty]) => !isSolid(tx, ty),
    );

    return Array.from({ length: count }, (_unused, seat): Tile => open[seat] ?? layout.spawn);
}
