import { describe, expect, it } from 'vitest';

import { StationState } from '../src/shared';
import type { FxKind, PlayerState, Tile } from '../src/shared';
import { beginSweep, beginUnjam, tickChores } from '../src/sim/chores';
import { addSpill } from '../src/sim/items';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * Unjam and sweeping (contracts §10.4, docs/04). Both are press-to-start and
 * cancel the moment the player stops standing still, which is the whole cost of
 * them: someone has to leave the line.
 */

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function stand(world: World, sessionId: string, t: Tile): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = t[0] + 0.5;
    player.y = t[1] + 0.5;
    world.reindexPlayers();

    return player;
}

/** The row `stations.build` made at `init`, jammed the way F06's drop table does. */
function jammed(world: World, id: string): StationState {
    const st = world.state.stations.get(id);

    if (st === undefined) throw new Error(`no station ${id}`);

    st.state = 'jammed';

    return st;
}

function fxKinds(world: World): FxKind[] {
    return world.outbox.flatMap((out) => (out.name === 'fx' ? [out.payload.kind] : []));
}

describe('unjam', () => {
    it('starts the hold on a jammed station', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 5]);

        jammed(world, 'powder-a');

        expect(beginUnjam(world, player, 'session-0', 'powder-a', [5, 4])).toBe(true);
        expect(player.chore).toBe('unjam');
        expect(player.choreUntil).toBeCloseTo(4);
    });

    it('has nothing to do on a station that is running', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 5]);
        const st = jammed(world, 'powder-a');

        st.state = 'idle';

        expect(beginUnjam(world, player, 'session-0', 'powder-a', [5, 4])).toBe(false);
        expect(player.chore).toBe('');
    });

    it('lets nobody help: a second unjammer is bonked away', () => {
        const world = makeWorld({ players: 2 });
        const first = stand(world, 'session-0', [5, 5]);
        const second = stand(world, 'session-1', [4, 4]);

        jammed(world, 'powder-a');
        beginUnjam(world, first, 'session-0', 'powder-a', [5, 4]);

        expect(beginUnjam(world, second, 'session-1', 'powder-a', [5, 4])).toBe(true);
        expect(second.chore).toBe('');
        expect(fxKinds(world)).toEqual(['bonk']);
    });

    it('clears the machine and clinks when the hold runs out', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 5]);
        const st = jammed(world, 'powder-a');

        beginUnjam(world, player, 'session-0', 'powder-a', [5, 4]);
        world.state.clock = 4;
        tickChores(world);

        expect(st.state).toBe('idle');
        expect(player.chore).toBe('');
        expect(player.choreUntil).toBe(0);
        expect(fxKinds(world)).toEqual(['clink']);
    });

    it('gives up when the player walks off the tile they started on', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 5]);
        const st = jammed(world, 'powder-a');

        beginUnjam(world, player, 'session-0', 'powder-a', [5, 4]);
        stand(world, 'session-0', [6, 5]);
        world.state.clock = 1;
        tickChores(world);

        expect(player.chore).toBe('');
        expect(st.state).toBe('jammed');

        world.state.clock = 5;
        tickChores(world);

        expect(st.state).toBe('jammed');
    });

    it('gives up on a player who is walking or seeing stars', () => {
        for (const shake of ['moving', 'stunned'] as const) {
            const world = makeWorld({ players: 1 });
            const player = stand(world, 'session-0', [5, 5]);

            jammed(world, 'powder-a');
            beginUnjam(world, player, 'session-0', 'powder-a', [5, 4]);

            if (shake === 'moving') player.moving = true;
            else player.stunnedUntil = 2;

            world.state.clock = 1;
            tickChores(world);

            expect(player.chore).toBe('');
        }
    });

    it('gives up when somebody else clears the machine first', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 5]);
        const st = jammed(world, 'powder-a');

        beginUnjam(world, player, 'session-0', 'powder-a', [5, 4]);
        st.state = 'idle';
        world.state.clock = 1;
        tickChores(world);

        expect(player.chore).toBe('');
    });
});

describe('sweeping', () => {
    it('needs a spill underfoot', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7]);

        expect(beginSweep(world, player, 'session-0')).toBe(false);
        expect(player.chore).toBe('');
    });

    it('takes the tile out of the spill list after the hold', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7]);

        addSpill(world, [5, 7]);

        expect(beginSweep(world, player, 'session-0')).toBe(true);
        expect(player.chore).toBe('sweep');
        expect(player.choreUntil).toBeCloseTo(1.5);

        world.state.clock = 1.5;
        tickChores(world);

        expect(world.state.spillTiles).not.toContain(world.packTile(5, 7));
        expect(player.chore).toBe('');
        expect(fxKinds(world)).toEqual(['clink']);
    });

    it('sweeps one tile per press: the next spill needs its own', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7]);

        addSpill(world, [5, 7]);
        addSpill(world, [6, 7]);
        beginSweep(world, player, 'session-0');
        world.state.clock = 1.5;
        tickChores(world);

        expect([...world.state.spillTiles]).toEqual([world.packTile(6, 7)]);
    });
});

describe('chore bookkeeping', () => {
    it('forgets a chore whose player has left the room', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7]);

        addSpill(world, [5, 7]);
        beginSweep(world, player, 'session-0');
        world.removePlayer('session-0');
        world.state.clock = 1.5;

        expect(() => tickChores(world)).not.toThrow();
        expect(world.state.spillTiles).toContain(world.packTile(5, 7));
    });

    it('lets go when something else took the body over', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7]);

        addSpill(world, [5, 7]);
        beginSweep(world, player, 'session-0');
        player.chore = 'stomp';
        world.state.clock = 1.5;
        tickChores(world);

        expect(player.chore).toBe('stomp');
        expect(world.state.spillTiles).toContain(world.packTile(5, 7));
    });
});
