import {
    BUBBLE_SECONDS,
    FACING_DIRS,
    LEVEL_DEFAULTS,
    copy,
    facesTile,
    judgeCatch,
    landingTile,
} from '../shared';
import type { PlayerState, Tile } from '../shared';
import { setBubble } from './bubbles';
import { dropItem } from './itemDrop';
import { blockedForItems, giveToPlayer, itemStore, takeCarried, tileCentre } from './items';
import type { World } from './World';

/**
 * The throw and the catch (contracts §10.4). Nothing collides in mid-air: a
 * flight is a promise to be somewhere in half a second, and the only question
 * is whether a teammate is there to meet it. Every time below is in `clock`
 * seconds, so a client's `performance.now()` has to come through
 * `world.inputClock` before it is judged against one.
 */

export interface Flight {
    itemId: string;
    throwerId: string;
    /** The tile the throw came from — what a catcher has to be facing. */
    from: Tile;
    landing: Tile;
    dir: Tile;
    startedAt: number;
    arrivesAt: number;
    /** The catch window closes here and the floor gets it. */
    resolveAt: number;
}

function hitStaggerSeconds(world: World): number {
    return world.level.carry.hitStaggerSeconds ?? LEVEL_DEFAULTS.carry.hitStaggerSeconds;
}

/**
 * The catch window has closed. The player standing where it came down is the
 * obstacle whether or not they reached for it; only full hands earn the bubble.
 */
function land(world: World, flight: Flight, hitBy: string | null): void {
    itemStore(world).flights.delete(flight.itemId);

    const item = world.state.items.get(flight.itemId);

    if (item === undefined) return;

    item.inFlight = false;
    item.flightT = 1;

    const thrower = world.state.players.get(flight.throwerId);

    if (thrower !== undefined) world.tally.bumpPlayer(thrower.userId, 'drops');

    const obstacleId = hitBy ?? world.playersAt(flight.landing[0], flight.landing[1])[0] ?? null;
    const obstacle = obstacleId === null ? undefined : world.state.players.get(obstacleId);

    if (obstacle !== undefined && obstacle.carrying !== '') {
        setBubble(world, obstacle, copy.bubbles.whoThrewThat, BUBBLE_SECONDS);
        obstacle.stunnedUntil = Math.max(obstacle.stunnedUntil, world.now + hitStaggerSeconds(world));
        world.fx('bonk', ...tileCentre(flight.landing));
    }

    dropItem(world, item, flight.landing, flight.dir, flight.throwerId);
}

/**
 * `Space` while carrying. A line with nowhere to put the item is refused rather
 * than dropped: the press is spent on the bonk, so it never falls through to a
 * stomp the player did not ask for.
 */
export function startThrow(world: World, player: PlayerState, sessionId: string): boolean {
    const item = world.state.items.get(player.carrying);
    const dir = FACING_DIRS[player.facing];

    if (item === undefined || dir === undefined) return false;

    const carry = world.level.carry;
    const from = world.tileOf(player.x, player.y);
    const landing = landingTile(from, player.facing, carry.throwTiles, (t) =>
        blockedForItems(world, t[0], t[1], item.lit),
    );

    if (landing === null) {
        world.fx('bonk', ...tileCentre(from));

        return true;
    }

    if (takeCarried(world, sessionId) === null) return false;

    const now = world.now;

    item.inFlight = true;
    item.flightT = 0;
    item.fromX = player.x;
    item.fromY = player.y;
    [item.toX, item.toY] = tileCentre(landing);
    [item.x, item.y] = from;
    world.reindexItems();

    itemStore(world).flights.set(item.id, {
        itemId: item.id,
        throwerId: sessionId,
        from,
        landing,
        dir,
        startedAt: now,
        arrivesAt: now + carry.throwFlightSeconds,
        resolveAt: now + carry.throwFlightSeconds + carry.catchOkMs / 1000,
    });

    return true;
}

/**
 * `E` under an incoming item. `pressMs` is already in server milliseconds — the
 * caller runs a client timestamp through `world.inputClock` first, so a late
 * client cannot buy itself a wider window here.
 */
export function tryCatch(
    world: World,
    player: PlayerState,
    sessionId: string,
    pressMs: number,
): boolean {
    const store = itemStore(world);
    const carry = world.level.carry;
    const here = world.tileOf(player.x, player.y);

    for (const flight of store.flights.values()) {
        if (flight.throwerId === sessionId) continue;
        if (flight.landing[0] !== here[0] || flight.landing[1] !== here[1]) continue;
        if (!facesTile(player.facing, here, flight.from)) continue;

        const verdict = judgeCatch(
            pressMs,
            flight.arrivesAt * 1000,
            carry.catchOkMs,
            carry.catchPerfectMs,
        );

        if (verdict === 'miss') continue;

        const item = world.state.items.get(flight.itemId);

        if (item === undefined) {
            store.flights.delete(flight.itemId);

            continue;
        }

        // Reaching for it with your hands full is how you get hit by it.
        if (player.carrying !== '') {
            land(world, flight, sessionId);

            return true;
        }

        item.inFlight = false;
        item.flightT = 1;
        store.flights.delete(flight.itemId);
        giveToPlayer(world, item, sessionId);

        if (verdict === 'perfect') world.fx('snap', ...tileCentre(flight.landing), { text: 'PERFECT' });
        else world.fx('clink', ...tileCentre(flight.landing));

        return true;
    }

    return false;
}

/** Advances every arc and hands the ones whose window has closed to the floor. */
export function tickFlights(world: World): void {
    const store = itemStore(world);
    const now = world.now;
    const seconds = world.level.carry.throwFlightSeconds;

    for (const flight of [...store.flights.values()]) {
        const item = world.state.items.get(flight.itemId);

        // F10's blast and F09's truck can take an item out from under a flight.
        if (item === undefined) {
            store.flights.delete(flight.itemId);

            continue;
        }

        const progress = Math.min(1, (now - flight.startedAt) / seconds);

        item.flightT = progress;
        item.x = item.fromX + (item.toX - item.fromX) * progress;
        item.y = item.fromY + (item.toY - item.fromY) * progress;

        if (now >= flight.resolveAt) land(world, flight, null);
    }
}
