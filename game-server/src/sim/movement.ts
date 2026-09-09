import { LEVEL_DEFAULTS, pushOutOfSolid, stepPosition } from '../shared';
import type { Axis, Facing, MovementConfig, PlayerState, SolidFn } from '../shared';
import type { PlayerRuntime, System, World } from './World';

/**
 * The server half of movement (contracts §2, §11). The arithmetic itself is
 * `shared/src/sim/movement.ts`, which the client runs too — anything the client
 * cannot see (the soft push between bodies, the bump and its stagger) lives
 * here, so a prediction that disagrees is always the server's word to correct.
 */

/** Four missed `INPUT_HEARTBEAT_MS` beats: the client has stopped talking, so the legs stop. */
const INPUT_STALE_SECONDS = 1;
/** Hysteresis, so a pair jostling on the boundary does not bump on every other tick. */
const CONTACT_RELEASE_MARGIN = 0.1;
/** Two bodies exactly on top of each other have no direction to part along; east will do. */
const COINCIDENT = 1e-6;

interface Body {
    sessionId: string;
    player: PlayerState;
    runtime: PlayerRuntime;
    /** A press station's operator is furniture: it separates others but never moves itself. */
    pushable: boolean;
}

function movementOf(world: World): MovementConfig {
    return world.level.movement ?? LEVEL_DEFAULTS.movement;
}

function pressed(world: World, player: PlayerState): boolean {
    if (player.stationId === '') return false;

    return world.stationConfig(player.stationId).joinMode === 'press';
}

/** The unit vector rounded onto the eight compass signs; `-0` is not an `Axis`. */
function axis(component: number): Axis {
    return (Math.round(component) || 0) as Axis;
}

function shove(player: PlayerState, dx: number, dy: number, radius: number, isSolid: SolidFn): void {
    const clear = pushOutOfSolid(player.x + dx, player.y + dy, radius, isSolid);

    player.x = clear.x;
    player.y = clear.y;
}

/**
 * Steps every body and returns the ones that take part in the push pass:
 * connected, and not away on the truck (F09 owns a rider's position).
 */
function integrate(world: World, dt: number, movement: MovementConfig, isSolid: SolidFn): Body[] {
    const clock = world.now;
    const order: Array<{ sessionId: string; player: PlayerState }> = [];

    world.state.players.forEach((player, sessionId) => order.push({ sessionId, player }));
    order.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

    const bodies: Body[] = [];

    for (const { sessionId, player } of order) {
        const runtime = world.runtime(sessionId);
        const intent = runtime.intent;

        if (clock - runtime.lastInputAt > INPUT_STALE_SECONDS) {
            intent.dx = 0;
            intent.dy = 0;
        }

        const drivenOff = player.drivenOffUntil > clock;
        const frozen =
            drivenOff ||
            !runtime.connected ||
            player.chore !== '' ||
            player.stunnedUntil > clock ||
            pressed(world, player);

        const [tx, ty] = world.tileOf(player.x, player.y);
        const carrying = player.carrying !== '' ? 1 - world.level.carry.slowdown : 1;

        // Every multiplier is applied here because F04 predicts with this number.
        player.speed = frozen ? 0 : movement.tilesPerSecond * carrying * world.tileSpeed(tx, ty);
        player.seq = intent.seq;

        if (drivenOff) {
            player.moving = false;

            continue;
        }

        const step = stepPosition(
            { x: player.x, y: player.y, facing: player.facing as Facing },
            intent,
            dt,
            isSolid,
            player.speed,
            movement.playerRadius,
        );

        player.x = step.x;
        player.y = step.y;
        player.facing = step.facing;
        player.moving = step.moved;

        if (runtime.connected) {
            bodies.push({ sessionId, player, runtime, pushable: !pressed(world, player) });
        }
    }

    return bodies;
}

/**
 * Soft collision (docs/02): bodies part rather than block, and the first touch
 * of a pair costs both of them `bumpStaggerSeconds` and tells F06 to shake
 * whatever the mover was carrying loose.
 */
function separate(world: World, movement: MovementConfig, bodies: Body[], isSolid: SolidFn): void {
    const radius = movement.playerRadius;
    const diameter = radius * 2;
    const clock = world.now;

    for (const [i, a] of bodies.entries()) {
        for (const [j, b] of bodies.entries()) {
            if (j <= i) continue;
            if (!a.pushable && !b.pushable) continue;

            const dx = b.player.x - a.player.x;
            const dy = b.player.y - a.player.y;
            const distance = Math.hypot(dx, dy);

            if (distance > diameter + CONTACT_RELEASE_MARGIN) {
                a.runtime.contacts.delete(b.sessionId);
                b.runtime.contacts.delete(a.sessionId);

                continue;
            }

            if (distance >= diameter) continue;

            const ux = distance < COINCIDENT ? 1 : dx / distance;
            const uy = distance < COINCIDENT ? 0 : dy / distance;
            const contactX = (a.player.x + b.player.x) / 2;
            const contactY = (a.player.y + b.player.y) / 2;
            const overlap = diameter - distance;
            const share = a.pushable && b.pushable ? overlap / 2 : overlap;

            if (a.pushable) shove(a.player, -ux * share, -uy * share, radius, isSolid);
            if (b.pushable) shove(b.player, ux * share, uy * share, radius, isSolid);

            const touching = a.runtime.contacts.has(b.sessionId);

            if (touching || !(a.player.moving || b.player.moving)) continue;

            world.emit('bump', {
                a: a.sessionId,
                b: b.sessionId,
                mover: a.player.moving ? a.sessionId : b.sessionId,
                x: contactX,
                y: contactY,
                dx: axis(ux),
                dy: axis(uy),
            });

            const until = clock + movement.bumpStaggerSeconds;

            a.player.stunnedUntil = Math.max(a.player.stunnedUntil, until);
            b.player.stunnedUntil = Math.max(b.player.stunnedUntil, until);
            a.runtime.contacts.add(b.sessionId);
            b.runtime.contacts.add(a.sessionId);
        }
    }
}

export const movementSystem: System = {
    name: 'movement',

    tick(world: World, dt: number): void {
        const movement = movementOf(world);
        const isSolid: SolidFn = (tx, ty) => world.isWall(tx, ty);

        const bodies = integrate(world, dt, movement, isSolid);

        separate(world, movement, bodies, isSolid);

        // Everything after movement in the tick order reads tiles, not positions.
        world.reindexPlayers();
    },
};
