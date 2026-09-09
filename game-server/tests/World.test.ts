import { describe, expect, it } from 'vitest';

import { layoutFixture } from '../../shared/tests/fixtures/index';
import { ItemState, scaleLevel } from '../src/shared';
import type { ScaledLevel } from '../src/shared';
import type { System, World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

describe('World tiles', () => {
    it('marks layout walls and out-of-bounds tiles as solid', () => {
        const world = makeWorld();

        expect(world.isWall(0, 0)).toBe(true);
        expect(world.isWall(14, 15)).toBe(false);
        expect(world.isWall(-1, 5)).toBe(true);
        expect(world.isWall(28, 5)).toBe(true);
        expect(world.isWall(5, 18)).toBe(true);
    });

    it('packs a tile with the state width and floors a position onto its tile', () => {
        const world = makeWorld();

        expect(world.packTile(3, 2)).toBe(2 * 28 + 3);
        expect(world.tileOf(3.9, 2.1)).toEqual([3, 2]);
    });

    it('indexes floor players and floor items by packed tile and ignores held or shelved items', () => {
        const world = makeWorld({ players: 1 });
        const player = world.state.players.get('session-0');

        if (player === undefined) throw new Error('no player');

        player.x = 10.5;
        player.y = 12.5;

        const floor = new ItemState();

        floor.id = 'k-1';
        floor.x = 10.5;
        floor.y = 12.5;
        world.state.items.set(floor.id, floor);

        const held = new ItemState();

        held.id = 'k-2';
        held.holder = 'session-0';
        held.x = -1;
        held.y = -1;
        world.state.items.set(held.id, held);

        world.reindexPlayers();
        world.reindexItems();

        expect(world.playersAt(10, 12)).toEqual(['session-0']);
        expect(world.playersAt(1, 1)).toEqual([]);
        expect(world.itemsAt(10, 12)).toEqual(['k-1']);
    });

    it('computes tileSpeed as the minimum of the floor-item and spill multipliers', () => {
        const world = makeWorld();

        expect(world.tileSpeed(10, 12)).toBe(1);

        const floor = new ItemState();

        floor.id = 'k-1';
        floor.x = 10.5;
        floor.y = 12.5;
        world.state.items.set(floor.id, floor);
        world.reindexItems();

        expect(world.tileSpeed(10, 12)).toBe(0.4);

        world.state.spillTiles.push(world.packTile(10, 12));

        expect(world.isSpill(10, 12)).toBe(true);
        expect(world.tileSpeed(10, 12)).toBe(0.4);
        expect(world.tileSpeed(11, 12)).toBe(1);

        world.state.spillTiles.push(world.packTile(11, 12));

        expect(world.tileSpeed(11, 12)).toBe(0.6);
    });

    it('returns the station config by id and throws for an unknown id', () => {
        const world = makeWorld();

        expect(world.stationConfig('dock-a').joinMode).toBe('stand');
        expect(() => world.stationConfig('nope-a')).toThrow(/nope-a/);
    });
});

describe('World seats', () => {
    it('seats each player with a distinct colour on a distinct non-wall spawn tile', () => {
        const world = makeWorld({ players: 3 });

        expect(world.state.players.size).toBe(3);

        const tiles = new Set<string>();
        const colours = new Set<number>();

        world.state.players.forEach((player) => {
            expect(player.line).toBe('a');
            expect(player.facing).toBe(2);
            expect(world.isWall(...world.tileOf(player.x, player.y))).toBe(false);
            tiles.add(world.tileOf(player.x, player.y).join(','));
            colours.add(player.colour);
        });

        expect(tiles.size).toBe(3);
        expect(colours.size).toBe(3);
        expect(world.runtime('session-0').connected).toBe(true);
        expect(world.runtime('session-0').joinIndex).toBe(0);
        expect(() => world.runtime('nobody')).toThrow(/nobody/);
    });

    it('logs when the spawn ring runs out and a seat wraps back onto the spawn tile', () => {
        const layout = layoutFixture();
        const [sx, sy] = layout.spawn;

        // Wall off every ring tile but the spawn tile itself, so seat 1 has nowhere of its own.
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                if (dx === 0 && dy === 0) continue;

                layout.walls.push((sy + dy) * layout.width + (sx + dx));
            }
        }

        const world = makeWorld({ layout });
        const lines: string[] = [];

        (world as unknown as { log: (msg: string) => void }).log = (msg): void => {
            lines.push(msg);
        };

        world.addPlayer('session-0', { userId: 'u0', name: 'Ann', factoryId: '7' });
        world.addPlayer('session-1', { userId: 'u1', name: 'Bo', factoryId: '7' });

        expect(world.tileOf(...positionOf(world, 'session-1'))).toEqual(layout.spawn);
        expect(lines).toEqual(['seat 1 wrapped onto the spawn tile: players.max outruns the spawn ring']);
    });

    it('emits playerLeft once on removePlayer', () => {
        const world = makeWorld({ players: 1 });
        const left: string[] = [];

        world.on('playerLeft', (e) => left.push(e.sessionId));

        world.removePlayer('session-0');
        world.removePlayer('session-0');

        expect(left).toEqual(['session-0']);
        expect(world.state.players.has('session-0')).toBe(false);
        expect(world.players.has('session-0')).toBe(false);
    });

    it('stops listening once the unsubscribe is called', () => {
        const world = makeWorld({ players: 2 });
        const seen: string[] = [];
        const off = world.on('playerLeft', (e) => seen.push(e.sessionId));

        world.removePlayer('session-0');
        off();
        world.removePlayer('session-1');

        expect(seen).toEqual(['session-0']);
    });
});

describe('World clock', () => {
    it('advances state.clock in lobby, running and ended and resets it to 0 on startDay', () => {
        const world = makeWorld({ players: 3 });

        world.tick(0.05);
        world.tick(0.05);

        expect(world.state.phase).toBe('lobby');
        expect(world.now).toBeCloseTo(0.1, 6);

        world.startDay(scaled(world));

        expect(world.state.phase).toBe('running');
        expect(world.state.clock).toBe(0);

        world.tick(0.05);
        expect(world.now).toBeCloseTo(0.05, 6);

        world.requestEnd('ended', 'clock');
        world.tick(0.05);
        expect(world.state.phase).toBe('ended');

        world.tick(0.05);
        expect(world.now).toBeCloseTo(0.15, 6);
    });

    it('maps a client timestamp through inputClock and clamps it to [clock - 0.2, clock]', () => {
        const world = makeWorld({ players: 1 });

        world.state.clock = 10;

        expect(world.inputClock('session-0', 999_999)).toBe(10);
        expect(world.inputClock('session-0', 0)).toBeCloseTo(9.8, 6);

        world.runtime('session-0').clockOffsetMs = 4_000;

        expect(world.inputClock('session-0', 5_950)).toBeCloseTo(9.95, 6);
    });
});

describe('World systems', () => {
    it('runs system init, onStart, tick and onDayEnd in registration order', () => {
        const world = makeWorld({ players: 3 });
        const calls: string[] = [];

        world.registerSystem(trace('one', calls));
        world.registerSystem(trace('two', calls));

        world.init();
        world.startDay(scaled(world));
        world.tick(0.05);
        world.requestEnd('ended', 'book');
        world.tick(0.05);

        expect(calls).toEqual([
            'one:init',
            'two:init',
            'one:onStart',
            'two:onStart',
            'one:tick',
            'two:tick',
            'one:tick',
            'two:tick',
            'one:onDayEnd:ended:book',
            'two:onDayEnd:ended:book',
        ]);
    });

    it('ticks only movement and bubbles in the lobby, every system while running, none while ended', () => {
        const world = makeWorld({ players: 3 });
        const calls: string[] = [];

        world.registerSystem(trace('movement', calls));
        world.registerSystem(trace('stations', calls));

        world.tick(0.05);
        expect(calls.filter((c) => c.endsWith(':tick'))).toEqual(['movement:tick']);

        calls.length = 0;
        world.startDay(scaled(world));
        world.tick(0.05);
        expect(calls.filter((c) => c.endsWith(':tick'))).toEqual(['movement:tick', 'stations:tick']);

        calls.length = 0;
        world.requestEnd('ended', 'clock');
        world.tick(0.05);
        calls.length = 0;
        world.tick(0.05);
        expect(calls).toEqual([]);
    });

    it('routes fx and toast into the outbox', () => {
        const world = makeWorld({ players: 1 });

        world.fx('spark', 3.5, 4.5, { text: 'BOOM' });
        world.toast('session-0', 'Only the host can start', 'warn');

        expect(world.outbox).toEqual([
            { to: 'all', name: 'fx', payload: { kind: 'spark', x: 3.5, y: 4.5, text: 'BOOM' } },
            {
                to: 'session-0',
                name: 'toast',
                payload: { text: 'Only the host can start', kind: 'warn' },
            },
        ]);
    });

    it('counts run and per-player tallies on world.tally', () => {
        const world = makeWorld();

        world.tally.bump('kegsMade');
        world.tally.bump('kegsMade');
        world.tally.bumpPlayer('u1', 'drops');
        world.tally.destroyed('keg', 'blast');

        expect(world.tally.counts.kegsMade).toBe(2);
        expect(world.tally.players.get('u1')?.drops).toBe(1);
        expect(world.tally.destroyedByType.keg).toBe(1);

        world.tally.reset();

        expect(world.tally.counts.kegsMade).toBe(0);
        expect(world.tally.destroyedByType.keg).toBe(0);
        expect(world.tally.players.size).toBe(0);
    });

    it('starts the groove events zeroed for the groove system to drain', () => {
        expect(makeWorld().grooveEvents).toEqual({
            fizzles: 0,
            niceSaves: 0,
            blastKegs: 0,
            primeSticks: 0,
            trucksComplete: 0,
        });
    });
});

/** A system that records every hook it is given, so order is observable. */
function trace(name: string, calls: string[]): System {
    return {
        name,
        init: () => calls.push(`${name}:init`),
        onStart: () => calls.push(`${name}:onStart`),
        tick: () => calls.push(`${name}:tick`),
        onDayEnd: (_w, status, reason) => calls.push(`${name}:onDayEnd:${status}:${reason}`),
    };
}

function positionOf(world: World, sessionId: string): [number, number] {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return [player.x, player.y];
}

function scaled(world: World): ScaledLevel {
    return scaleLevel(world.level, 3);
}
