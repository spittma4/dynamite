import { LEVEL_DEFAULTS } from '../shared';
import type { PlayerState, Tile } from '../shared';
import { isSpill, itemStore, removeSpill, tileCentre } from './items';
import { unjam } from './stations';
import type { World } from './World';

/**
 * The two jobs that take someone off the line (contracts §10.4, docs/04).
 * Both are press-to-start and cancel the moment the player moves, is knocked
 * about, or loses the reason they started — the hold is the cost, so it must be
 * possible to lose it.
 */

export type ChoreTarget =
    | { kind: 'unjam'; stationId: string; tile: Tile; startTile: Tile }
    | { kind: 'sweep'; tile: Tile; startTile: Tile };

function sameTile(a: Tile, b: Tile): boolean {
    return a[0] === b[0] && a[1] === b[1];
}

function unjamSeconds(world: World): number {
    return world.level.hazards.unjamSeconds ?? LEVEL_DEFAULTS.hazards.unjamSeconds;
}

function sweepSeconds(world: World): number {
    return world.level.hazards.sweepSecondsPerTile ?? LEVEL_DEFAULTS.hazards.sweepSecondsPerTile;
}

function unjammerOn(world: World, stationId: string): string | null {
    for (const [sessionId, target] of itemStore(world).chores) {
        if (target.kind === 'unjam' && target.stationId === stationId) return sessionId;
    }

    return null;
}

function begin(
    world: World,
    player: PlayerState,
    sessionId: string,
    seconds: number,
    target: ChoreTarget,
): void {
    player.chore = target.kind;
    player.choreUntil = world.now + seconds;
    itemStore(world).chores.set(sessionId, target);
}

function clear(world: World, player: PlayerState, sessionId: string): void {
    player.chore = '';
    player.choreUntil = 0;
    itemStore(world).chores.delete(sessionId);
}

/**
 * `E` on a jammed machine. Nobody can help: a second pair of hands on the same
 * lever is bonked away, and the press is spent either way.
 */
export function beginUnjam(
    world: World,
    player: PlayerState,
    sessionId: string,
    stationId: string,
    tile: Tile,
): boolean {
    const station = world.state.stations.get(stationId);

    if (station === undefined || station.state !== 'jammed') return false;

    if (unjammerOn(world, stationId) !== null) {
        world.fx('bonk', ...tileCentre(tile));

        return true;
    }

    begin(world, player, sessionId, unjamSeconds(world), {
        kind: 'unjam',
        stationId,
        tile,
        startTile: world.tileOf(player.x, player.y),
    });

    return true;
}

/** `Space` with the broom, standing in the puddle. One press per tile. */
export function beginSweep(world: World, player: PlayerState, sessionId: string): boolean {
    const tile = world.tileOf(player.x, player.y);

    if (!isSpill(world, tile)) return false;

    begin(world, player, sessionId, sweepSeconds(world), { kind: 'sweep', tile, startTile: tile });

    return true;
}

function cancelled(world: World, player: PlayerState, target: ChoreTarget): boolean {
    if (player.moving || player.stunnedUntil > world.now) return true;
    if (!sameTile(world.tileOf(player.x, player.y), target.startTile)) return true;
    if (target.kind !== 'unjam') return false;

    return world.state.stations.get(target.stationId)?.state !== 'jammed';
}

function complete(world: World, target: ChoreTarget): void {
    if (target.kind === 'unjam') unjam(world, target.stationId);
    else removeSpill(world, target.tile);

    world.fx('clink', ...tileCentre(target.tile));
}

export function tickChores(world: World): void {
    const store = itemStore(world);

    for (const [sessionId, target] of [...store.chores]) {
        const player = world.state.players.get(sessionId);

        // A body F10 took over for a stomp or a repair is no longer ours to run.
        if (player === undefined || player.chore !== target.kind) {
            store.chores.delete(sessionId);

            continue;
        }

        if (cancelled(world, player, target)) {
            clear(world, player, sessionId);

            continue;
        }

        if (world.now < player.choreUntil) continue;

        complete(world, target);
        clear(world, player, sessionId);
    }
}
