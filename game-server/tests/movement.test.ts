import { describe, expect, it } from 'vitest';

import { ItemState } from '../src/shared';
import type { Axis, PlayerState } from '../src/shared';
import type { BumpEvent, World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The open aisle of the `one-line` fixture: row 15 is clear from x = 1 to 26,
 * with the west wall at x = 0 for the push-out-of-a-wall case.
 */
const AISLE_Y = 10.5;

function bumpAt(bumps: BumpEvent[], index: number): BumpEvent {
    const bump = bumps[index];

    if (bump === undefined) throw new Error(`no bump ${index}`);

    return bump;
}

function seated(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function place(world: World, sessionId: string, x: number, y: number): PlayerState {
    const player = seated(world, sessionId);

    player.x = x;
    player.y = y;

    return player;
}

function intend(world: World, sessionId: string, dx: Axis, dy: Axis, seq: number): void {
    const runtime = world.runtime(sessionId);

    runtime.intent = { dx, dy, seq };
    runtime.lastInputAt = world.now;
}

/** One player walking east from a clear tile, after `mutate` has had its say. */
function walker(mutate: (world: World, player: PlayerState) => void): PlayerState {
    const world = makeWorld({ players: 1 });
    const player = place(world, 'session-0', 10.5, AISLE_Y);

    intend(world, 'session-0', 1, 0, 1);
    mutate(world, player);
    world.tick(0.05);

    return player;
}

describe('movementSystem intent', () => {
    it('applies the latest intent each tick and echoes its seq', () => {
        const world = makeWorld({ players: 1 });
        const player = place(world, 'session-0', 10.5, AISLE_Y);

        intend(world, 'session-0', 1, 0, 7);
        world.tick(0.05);

        expect(player.x).toBeCloseTo(10.7, 9);
        expect(player.y).toBeCloseTo(AISLE_Y, 9);
        expect(player.facing).toBe(0);
        expect(player.moving).toBe(true);
        expect(player.speed).toBeCloseTo(4, 9);
        expect(player.seq).toBe(7);

        intend(world, 'session-0', 0, -1, 8);
        world.tick(0.05);

        expect(player.x).toBeCloseTo(10.7, 9);
        expect(player.y).toBeCloseTo(AISLE_Y - 0.2, 9);
        expect(player.facing).toBe(6);
        expect(player.seq).toBe(8);
    });

    it('stops a player after a second without input', () => {
        const world = makeWorld({ players: 1 });
        const player = place(world, 'session-0', 6.5, AISLE_Y);

        intend(world, 'session-0', 1, 0, 1);

        for (let tick = 0; tick < 19; tick++) world.tick(0.05);

        expect(player.x).toBeCloseTo(10.3, 6);
        expect(player.moving).toBe(true);

        for (let tick = 0; tick < 4; tick++) world.tick(0.05);

        expect(player.x).toBeCloseTo(10.3, 6);
        expect(player.moving).toBe(false);
        expect(player.speed).toBeCloseTo(4, 9);
    });
});

describe('movementSystem speed', () => {
    it('moves a carrying player at 3.2 tiles per second and publishes the effective speed', () => {
        const player = walker((_world, walking) => {
            walking.carrying = 'k-1';
        });

        expect(player.speed).toBeCloseTo(3.2, 9);
        expect(player.x).toBeCloseTo(10.5 + 0.16, 9);
    });

    it('moves at 1.6 tiles per second on a floor item and 2.4 on a spill', () => {
        const onItem = walker((world) => {
            const item = new ItemState();

            item.id = 'k-1';
            item.x = 10.5;
            item.y = AISLE_Y;
            world.state.items.set(item.id, item);
        });

        expect(onItem.speed).toBeCloseTo(1.6, 9);
        expect(onItem.x).toBeCloseTo(10.5 + 0.08, 9);

        const onSpill = walker((world) => {
            world.state.spillTiles.push(world.packTile(10, 10));
        });

        expect(onSpill.speed).toBeCloseTo(2.4, 9);
        expect(onSpill.x).toBeCloseTo(10.5 + 0.12, 9);
    });
});

describe('movementSystem freezing', () => {
    const frozen: Array<[string, (world: World, player: PlayerState) => void]> = [
        ['stunned', (_world, player): void => void (player.stunnedUntil = 1)],
        ['in a chore', (_world, player): void => void (player.chore = 'sweep')],
        [
            'on a press station post',
            (_world, player): void => {
                player.stationId = 'powder-a';
                player.workTile = '4,5';
            },
        ],
        ['driven off', (_world, player): void => void (player.drivenOffUntil = 1)],
        ['disconnected', (world): void => world.setConnected('session-0', false)],
    ];

    for (const [label, mutate] of frozen) {
        it(`freezes a player who is ${label}`, () => {
            const player = walker(mutate);

            expect(player.x).toBe(10.5);
            expect(player.moving).toBe(false);
            expect(player.speed).toBe(0);
            expect(player.seq).toBe(1);
        });
    }

    it('leaves a driven-off player where the truck put them', () => {
        const world = makeWorld({ players: 1 });
        const player = place(world, 'session-0', 3.5, 4.5);

        player.drivenOffUntil = 5;
        intend(world, 'session-0', 1, 0, 3);
        world.tick(0.05);

        expect(player.x).toBe(3.5);
        expect(player.y).toBe(4.5);
        expect(player.seq).toBe(3);
    });

    it('does not freeze a player standing at a stand station', () => {
        const player = walker((_world, standing) => {
            standing.stationId = 'dock-a';
        });

        expect(player.speed).toBeCloseTo(4, 9);
        expect(player.x).toBeCloseTo(10.7, 9);
    });

    /**
     * N4: a helper has no post and no gesture, so freezing them froze a body the
     * client went on predicting — WASD rubber-banded, which is the reported
     * "stuck". Walking off the post is how a helper leaves (`syncHelpers`), and
     * that needs legs. A helper is the one press member with `workTile === ''`.
     */
    it('does not freeze a helper standing in a press station aisle', () => {
        const player = walker((_world, helper) => {
            helper.stationId = 'powder-a';
            helper.workTile = '';
        });

        expect(player.speed).toBeCloseTo(4, 9);
        expect(player.x).toBeCloseTo(10.7, 9);
    });
});

describe('movementSystem push', () => {
    it('pushes two overlapping players apart equally', () => {
        const world = makeWorld({ players: 2 });
        const a = place(world, 'session-0', 10.4, AISLE_Y);
        const b = place(world, 'session-1', 10.6, AISLE_Y);

        world.tick(0.05);

        expect(a.x).toBeCloseTo(10.15, 9);
        expect(b.x).toBeCloseTo(10.85, 9);
        expect(a.y).toBeCloseTo(AISLE_Y, 9);
    });

    it('never pushes a player into a wall', () => {
        const world = makeWorld({ players: 2 });
        const a = place(world, 'session-0', 1.4, AISLE_Y);
        const b = place(world, 'session-1', 1.6, AISLE_Y);

        world.tick(0.05);

        expect(a.x).toBeCloseTo(1.35, 9);
        expect(b.x).toBeCloseTo(1.85, 9);
        expect(world.isWall(...world.tileOf(a.x - 0.35, a.y))).toBe(false);
    });

    it('gives the whole separation to the mover when the other is anchored at a press station', () => {
        const world = makeWorld({ players: 2 });
        const anchored = place(world, 'session-0', 10.4, AISLE_Y);
        const mover = place(world, 'session-1', 11.2, AISLE_Y);

        anchored.stationId = 'powder-a';
        anchored.workTile = '4,5';
        intend(world, 'session-1', -1, 0, 1);
        world.tick(0.05);

        expect(anchored.x).toBe(10.4);
        expect(mover.x).toBeCloseTo(11.1, 9);
    });
});

describe('movementSystem bumps', () => {
    function collide(): { world: World; bumps: BumpEvent[]; a: PlayerState; b: PlayerState } {
        const world = makeWorld({ players: 2 });
        const bumps: BumpEvent[] = [];

        world.on('bump', (e) => bumps.push(e));

        const a = place(world, 'session-0', 10.0, AISLE_Y);
        const b = place(world, 'session-1', 10.8, AISLE_Y);

        intend(world, 'session-0', 1, 0, 1);

        return { world, bumps, a, b };
    }

    it('emits one bump with the mover, the direction and the contact point, and staggers both', () => {
        const { world, bumps, a, b } = collide();

        world.tick(0.05);

        expect(bumps).toHaveLength(1);
        expect(bumpAt(bumps, 0)).toMatchObject({
            a: 'session-0',
            b: 'session-1',
            mover: 'session-0',
            dx: 1,
            dy: 0,
        });
        expect(bumpAt(bumps, 0).x).toBeCloseTo(10.5, 9);
        expect(bumpAt(bumps, 0).y).toBeCloseTo(AISLE_Y, 9);
        expect(a.stunnedUntil).toBeCloseTo(0.35, 9);
        expect(b.stunnedUntil).toBeCloseTo(0.35, 9);
    });

    it('does not bump again while the pair stays in contact, and does once they separate', () => {
        const { world, bumps, a, b } = collide();

        for (let tick = 0; tick < 12; tick++) world.tick(0.05);

        expect(bumps).toHaveLength(1);

        intend(world, 'session-0', 0, 0, 2);
        b.x = a.x + 0.9;
        world.tick(0.05);

        expect(bumps).toHaveLength(1);

        b.x = a.x + 0.6;
        intend(world, 'session-0', 1, 0, 3);
        a.stunnedUntil = 0;
        world.tick(0.05);

        expect(bumps).toHaveLength(2);
        expect(bumpAt(bumps, 1).mover).toBe('session-0');
    });
});
