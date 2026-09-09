import { describe, expect, it } from 'vitest';

import { copy } from '../src/shared';
import type { FxMsg, PlayerState, Tile } from '../src/shared';
import { createItem, destroyItem, floorItemAt, giveToPlayer, placeOnFloor } from '../src/sim/items';
import { startThrow, tickFlights, tryCatch } from '../src/sim/itemThrow';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The half-second arc (contracts §10.4): who it leaves, where it comes down and
 * who gets the chance to take it out of the air. Times are `clock` seconds, so
 * a test moves the clock rather than the wall.
 */

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function stand(world: World, sessionId: string, t: Tile, facing: number): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = t[0] + 0.5;
    player.y = t[1] + 0.5;
    player.facing = facing;
    world.reindexPlayers();

    return player;
}

function fxOf(world: World): FxMsg[] {
    return world.outbox.flatMap((out) => (out.name === 'fx' ? [out.payload] : []));
}

/** The clock is the only thing a flight watches, so a test just moves it. */
function advanceTo(world: World, clock: number): void {
    world.state.clock = clock;
    tickFlights(world);
}

/** A thrower on (5,7) facing east and the keg already in their hands. */
function armed(world: World): PlayerState {
    const thrower = stand(world, 'session-0', [5, 7], 0);

    giveToPlayer(world, createItem(world, 'keg'), 'session-0');

    return thrower;
}

describe('starting a throw', () => {
    it('sends the item two tiles down the facing over the flight time', () => {
        const world = makeWorld({ players: 1 });
        const thrower = armed(world);

        expect(startThrow(world, thrower, 'session-0')).toBe(true);

        const keg = world.state.items.get('k-1');

        expect(thrower.carrying).toBe('');
        expect(keg?.inFlight).toBe(true);
        expect([keg?.toX, keg?.toY]).toEqual([7.5, 7.5]);
        expect([keg?.fromX, keg?.fromY]).toEqual([5.5, 7.5]);
        expect(world.itemsAt(5, 7)).toEqual([]);
    });

    it('lands one tile short when the far tile is a wall', () => {
        const world = makeWorld({ players: 1 });
        const thrower = stand(world, 'session-0', [25, 7], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        startThrow(world, thrower, 'session-0');

        expect([world.state.items.get('k-1')?.toX]).toEqual([26.5]);
    });

    it('refuses the throw and keeps the item in hand when the whole line is blocked', () => {
        const world = makeWorld({ players: 1 });
        const thrower = stand(world, 'session-0', [26, 7], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(startThrow(world, thrower, 'session-0')).toBe(true);
        expect(thrower.carrying).toBe('k-1');
        expect(world.state.items.get('k-1')?.inFlight).toBe(false);
        expect(fxOf(world).map((fx) => fx.kind)).toEqual(['bonk']);
    });

    it('walks the item along the arc as the clock runs', () => {
        const world = makeWorld({ players: 1 });

        startThrow(world, armed(world), 'session-0');
        advanceTo(world, 0.25);

        const keg = world.state.items.get('k-1');

        expect(keg?.flightT).toBeCloseTo(0.5);
        expect(keg?.x).toBeCloseTo(6.5);
        expect(keg?.y).toBeCloseTo(7.5);
    });
});

describe('landing uncaught', () => {
    it('runs the drop table at the landing tile and charges the thrower a drop', () => {
        const world = makeWorld({ players: 1 });

        startThrow(world, armed(world), 'session-0');
        advanceTo(world, 0.5);

        expect(world.state.items.get('k-1')?.inFlight).toBe(true);

        advanceTo(world, 0.65);

        const keg = world.state.items.get('k-1');

        expect(keg?.inFlight).toBe(false);
        expect(floorItemAt(world, [8, 7])?.id).toBe('k-1');
        expect(world.tally.players.get('u0')?.drops).toBe(1);
    });

    it('staggers and bubbles a player it hits with full hands', () => {
        const world = makeWorld({ players: 2 });

        startThrow(world, armed(world), 'session-0');

        const victim = stand(world, 'session-1', [7, 7], 4);

        giveToPlayer(world, createItem(world, 'casing'), 'session-1');
        advanceTo(world, 0.7);

        expect(victim.bubble).toBe(copy.bubbles.whoThrewThat);
        expect(victim.bubbleUntil).toBeCloseTo(2.7);
        expect(victim.stunnedUntil).toBeCloseTo(1.2);
        expect(fxOf(world).map((fx) => fx.kind)).toContain('bonk');
        expect(world.state.spillTiles).toContain(world.packTile(7, 7));
    });

    it('says nothing to a player with free hands who simply missed it', () => {
        const world = makeWorld({ players: 2 });

        startThrow(world, armed(world), 'session-0');

        const victim = stand(world, 'session-1', [7, 7], 4);

        advanceTo(world, 0.7);

        expect(victim.bubble).toBe('');
        expect(victim.stunnedUntil).toBe(0);
        expect(world.state.spillTiles).toContain(world.packTile(7, 7));
    });

    it('drops a flight whose item was taken out of the world mid-arc', () => {
        const world = makeWorld({ players: 1 });

        startThrow(world, armed(world), 'session-0');
        destroyItem(world, 'k-1');

        expect(() => advanceTo(world, 0.7)).not.toThrow();
        expect(world.tally.players.get('u0')?.drops).toBeUndefined();
    });
});

describe('catching', () => {
    it('hands the item over on an OK press and clinks', () => {
        const world = makeWorld({ players: 2 });

        startThrow(world, armed(world), 'session-0');

        const catcher = stand(world, 'session-1', [7, 7], 4);

        expect(tryCatch(world, catcher, 'session-1', 600)).toBe(true);
        expect(catcher.carrying).toBe('k-1');
        expect(world.state.items.get('k-1')?.inFlight).toBe(false);
        expect(fxOf(world).map((fx) => fx.kind)).toEqual(['clink']);
    });

    it('calls the tight window a snap', () => {
        const world = makeWorld({ players: 2 });

        startThrow(world, armed(world), 'session-0');

        const catcher = stand(world, 'session-1', [7, 7], 4);

        tryCatch(world, catcher, 'session-1', 540);

        expect(fxOf(world)[0]).toMatchObject({ kind: 'snap', text: 'PERFECT', x: 7.5, y: 7.5 });
    });

    it('refuses a late press, a press off the landing tile, and the thrower reaching for it', () => {
        const world = makeWorld({ players: 2 });
        const thrower = armed(world);

        startThrow(world, thrower, 'session-0');

        const catcher = stand(world, 'session-1', [7, 7], 4);

        expect(tryCatch(world, catcher, 'session-1', 700)).toBe(false);

        stand(world, 'session-1', [8, 7], 4);

        expect(tryCatch(world, catcher, 'session-1', 500)).toBe(false);

        stand(world, 'session-0', [7, 7], 4);

        expect(tryCatch(world, thrower, 'session-0', 500)).toBe(false);
    });

    it('refuses a catcher who is not looking at the thrower', () => {
        const world = makeWorld({ players: 2 });

        startThrow(world, armed(world), 'session-0');

        const catcher = stand(world, 'session-1', [7, 7], 0);

        expect(tryCatch(world, catcher, 'session-1', 500)).toBe(false);
        expect(catcher.carrying).toBe('');
    });

    it('turns a catch with full hands into the hit it deserves', () => {
        const world = makeWorld({ players: 2 });

        startThrow(world, armed(world), 'session-0');

        const catcher = stand(world, 'session-1', [7, 7], 4);

        giveToPlayer(world, createItem(world, 'casing'), 'session-1');

        expect(tryCatch(world, catcher, 'session-1', 500)).toBe(true);
        expect(catcher.carrying).toBe('c-1');
        expect(catcher.bubble).toBe(copy.bubbles.whoThrewThat);
        expect(world.state.items.get('k-1')?.inFlight).toBe(false);
    });

    it('knocks a keg over on a tile that already holds something and rolls it aside', () => {
        const world = makeWorld({ players: 1 });

        placeOnFloor(world, createItem(world, 'casing'), [7, 7]);
        startThrow(world, armed(world), 'session-0');
        advanceTo(world, 0.7);

        const keg = world.state.items.get('k-1');

        expect([keg?.x, keg?.y]).toEqual([8, 7]);
        expect(floorItemAt(world, [7, 7])?.id).toBe('c-1');
        expect(world.state.spillTiles).toContain(world.packTile(7, 7));
    });
});
