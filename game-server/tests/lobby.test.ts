import { describe, expect, it } from 'vitest';

import { layoutFixture } from '../../shared/tests/fixtures/index';
import { canStart, chooseHost, pickColour, spawnTiles } from '../src/rooms/lobby';
import { PLAYER_COLOURS, makeWallLookup } from '../src/shared';
import type { LayoutConfig, SolidFn } from '../src/shared';
import { makeWorld } from './helpers/world';

/**
 * The lobby's pure rules (contracts §10.1): who holds the start button, when it
 * works, and where a seat and its colour come from. None of them needs a room,
 * which is why they live apart from `FactoryRoom`.
 */

function solidFor(layout: LayoutConfig): SolidFn {
    return makeWallLookup(layout);
}

function keyOf([tx, ty]: readonly [number, number]): string {
    return `${tx},${ty}`;
}

describe('chooseHost', () => {
    it('makes the connected factory owner host, else the earliest-joined connected player', () => {
        const world = makeWorld({ players: 3 });
        const { players, state } = world;

        // `makeWorld` seats `u0`, `u1`, `u2` and the fixture factory is owned by `u1`.
        expect(chooseHost(players, state.players, world.factory.ownerUserId)).toBe('session-1');

        world.setConnected('session-1', false);

        expect(chooseHost(players, state.players, world.factory.ownerUserId)).toBe('session-0');

        world.setConnected('session-0', false);

        expect(chooseHost(players, state.players, world.factory.ownerUserId)).toBe('session-2');

        world.setConnected('session-2', false);

        expect(chooseHost(players, state.players, world.factory.ownerUserId)).toBe('');
    });
});

describe('canStart', () => {
    it('refuses start when not host, not in the lobby, or below players.min', () => {
        const world = makeWorld({ players: 3 });

        world.state.host = 'session-0';

        expect(canStart(world, 'session-1')).toEqual({ ok: false, reason: 'not-host', min: 3 });
        expect(canStart(world, 'session-0')).toEqual({ ok: true });

        world.setConnected('session-2', false);

        expect(canStart(world, 'session-0')).toEqual({ ok: false, reason: 'too-few', min: 3 });

        world.setConnected('session-2', true);
        world.state.phase = 'running';

        expect(canStart(world, 'session-0')).toEqual({ ok: false, reason: 'not-lobby', min: 3 });
    });
});

describe('pickColour', () => {
    it('assigns the lowest free colour and reuses one a leaver freed', () => {
        expect(pickColour([])).toBe(0);
        expect(pickColour([0, 1, 2])).toBe(3);
        expect(pickColour([0, 2, 3])).toBe(1);
        expect(pickColour([3, 1, 0])).toBe(2);
    });

    it('wraps at PLAYER_COLOURS once every colour is taken', () => {
        const full = Array.from({ length: PLAYER_COLOURS }, (_, colour) => colour);

        expect(PLAYER_COLOURS).toBe(8);
        expect(pickColour(full)).toBe(0);
        expect(pickColour([...full, 0])).toBe(1);
    });

    it('gives the ninth seated player a repeat of the first colour', () => {
        const world = makeWorld({ players: 9 });
        const colours: number[] = [];

        world.state.players.forEach((player) => colours.push(player.colour));

        expect(colours).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    });
});

describe('spawnTiles', () => {
    it('spawns players on distinct non-wall tiles around spawn', () => {
        const layout = layoutFixture();
        const isSolid = solidFor(layout);
        const tiles = spawnTiles(layout, isSolid, 6);

        expect(tiles).toHaveLength(6);
        expect(tiles[0]).toEqual(layout.spawn);
        expect(new Set(tiles.map(keyOf)).size).toBe(6);

        for (const [tx, ty] of tiles) {
            expect(isSolid(tx, ty)).toBe(false);
            expect(Math.abs(tx - layout.spawn[0])).toBeLessThanOrEqual(2);
            expect(Math.abs(ty - layout.spawn[1])).toBeLessThanOrEqual(2);
        }
    });

    it('skips a ring tile that is a wall', () => {
        const layout = layoutFixture();
        const [sx, sy] = layout.spawn;

        layout.walls.push((sy + 0) * layout.width + (sx + 1));

        const tiles = spawnTiles(layout, solidFor(layout), 3);

        expect(tiles.map(keyOf)).not.toContain(keyOf([sx + 1, sy]));
        expect(new Set(tiles.map(keyOf)).size).toBe(3);
    });

    it('falls back to the spawn tile once the ring runs out', () => {
        const layout = layoutFixture();
        const tiles = spawnTiles(layout, solidFor(layout), 20);

        expect(tiles).toHaveLength(20);
        expect(tiles[19]).toEqual(layout.spawn);
    });
});
