import { describe, expect, it } from 'vitest';

import { scaleLevel } from '../src/shared';
import type { EndReason, LevelConfig, ScaledLevel } from '../src/shared';
import { dispatchMessage } from '../src/rooms/handlers';
import type { RoomControls } from '../src/rooms/handlers';
import type { DayEndStatus, System, World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The day loop (contracts §10.7, §11): which of the two end conditions fires,
 * which one wins when both land on the same tick, and what a shift inherits
 * from the lobby it grew out of.
 */

type Ends = 'either' | 'clock' | 'book' | 'never';

const NO_CONTROLS: RoomControls = {
    startDay: (): void => {},
    sendConfig: (): void => {},
};

/** Contracts §8: `never` is Sandbox, which validation ties to a zero clock and book. */
function levelEndingOn(endsOn: Ends): LevelConfig {
    const level = makeWorld().level;
    const zeroed = endsOn === 'never' ? { shiftSeconds: 0, orderBook: 0 } : {};

    return { ...level, day: { ...level.day, ...zeroed, endsOn } };
}

function running(endsOn: Ends): World {
    const world = makeWorld({ level: levelEndingOn(endsOn), players: 3 });

    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

    return world;
}

/** A day only ends the tick *after* the condition is true, so the book has one. */
function book(world: World, total: number, remaining: number): void {
    world.state.bookTotal = total;
    world.state.bookRemaining = remaining;
}

describe('day end conditions', () => {
    it.each<Ends>(['either', 'clock'])(
        'ends on the clock with reason clock when endsOn is %s',
        (endsOn) => {
            const world = running(endsOn);

            world.state.clock = world.state.shiftSeconds - 0.05;
            world.tick(0.049);

            expect(world.state.phase).toBe('running');
            expect(world.endRequested).toBeNull();

            world.tick(0.05);

            expect(world.state.phase).toBe('ended');
            expect(world.endRequested).toEqual({ status: 'ended', reason: 'clock' });
        },
    );

    it.each<Ends>(['either', 'book'])(
        'ends on the book with reason book when bookTotal is above zero and bookRemaining reaches 0',
        (endsOn) => {
            const world = running(endsOn);

            book(world, 11, 1);
            world.tick(0.05);

            expect(world.endRequested).toBeNull();

            book(world, 11, 0);
            world.tick(0.05);

            expect(world.state.phase).toBe('ended');
            expect(world.endRequested).toEqual({ status: 'ended', reason: 'book' });
        },
    );

    it('never ends on the clock when endsOn is book', () => {
        const world = running('book');

        book(world, 11, 4);
        world.state.clock = world.state.shiftSeconds + 60;
        world.tick(0.05);

        expect(world.state.phase).toBe('running');
        expect(world.endRequested).toBeNull();
    });

    it('never ends on the book when endsOn is clock', () => {
        const world = running('clock');

        book(world, 11, 0);
        world.tick(0.05);

        expect(world.state.phase).toBe('running');
        expect(world.endRequested).toBeNull();
    });

    it('prefers book over clock when both are true in the same tick', () => {
        const world = running('either');

        book(world, 11, 0);
        world.state.clock = world.state.shiftSeconds;
        world.tick(0.05);

        expect(world.endRequested).toEqual({ status: 'ended', reason: 'book' });
    });

    it('never ends by book or clock when endsOn is never', () => {
        const world = running('never');

        book(world, 11, 0);
        world.state.clock = 100_000;
        world.tick(0.05);

        expect(world.state.phase).toBe('running');
        expect(world.endRequested).toBeNull();
    });

    it('keeps the first end request when the clock would also end the same tick', () => {
        const world = running('either');

        world.state.clock = world.state.shiftSeconds;
        world.requestEnd('exploded', 'exploded');
        world.tick(0.05);

        expect(world.endRequested).toEqual({ status: 'exploded', reason: 'exploded' });
    });

    // F10 explodes a factory mid-tick; the clock must not talk over it.
    it('keeps the first of two end requests in the same tick', () => {
        const world = running('either');

        world.requestEnd('exploded', 'exploded');
        world.requestEnd('ended', 'clock');

        expect(world.endRequested).toEqual({ status: 'exploded', reason: 'exploded' });
    });
});

describe('day end consumption', () => {
    it('consumes endRequested once, freezes players and passes status and reason to onDayEnd', () => {
        const world = running('either');
        const seen: Array<[DayEndStatus, EndReason]> = [];

        world.registerSystem({
            name: 'spy',
            onDayEnd: (_w, status, reason): void => {
                seen.push([status, reason]);
            },
        });

        const player = world.state.players.get('session-0');

        if (player === undefined) throw new Error('no player');

        player.moving = true;
        player.speed = 4;

        world.requestEnd('exploded', 'exploded');
        world.tick(0.05);

        expect(world.state.phase).toBe('ended');
        expect(player.moving).toBe(false);
        expect(player.speed).toBe(0);
        expect(seen).toEqual([['exploded', 'exploded']]);

        world.tick(0.05);

        expect(seen).toHaveLength(1);
    });

    it('stores a report set by an onDayEnd hook on world.report', () => {
        const world = running('either');
        const report = { grade: 'B' } as unknown as Parameters<World['setReport']>[0];
        const reporter: System = {
            name: 'report',
            onDayEnd: (w): void => w.setReport(report),
        };

        world.registerSystem(reporter);

        expect(world.report).toBeNull();

        world.requestEnd('ended', 'book');
        world.tick(0.05);

        expect(world.report).toBe(report);
    });
});

describe('the whistle', () => {
    it('drops a lobby intent so a client that has gone silent does not walk into the shift', () => {
        const world = makeWorld({ players: 3 });

        world.state.clock = 30;
        dispatchMessage(world, NO_CONTROLS, 'session-1', 'input', { dx: 1, dy: 0, seq: 9 });
        world.tick(0.05);

        const player = world.state.players.get('session-1');

        if (player === undefined) throw new Error('no player');

        world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

        const startX = player.x;

        for (let step = 0; step < 100; step++) world.tick(0.05);

        expect(world.state.clock).toBeCloseTo(5, 6);
        expect(player.x).toBeCloseTo(startX, 6);
        expect(player.moving).toBe(false);
        // The client's echo must not regress, or F04 replays inputs it already saw.
        expect(world.runtime('session-1').intent.seq).toBe(9);
    });

    it('still walks a player who keeps sending input after the whistle', () => {
        const world = makeWorld({ players: 3 });

        world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

        const player = world.state.players.get('session-1');

        if (player === undefined) throw new Error('no player');

        // Out of the doorway and onto open floor: this is about the whistle not
        // freezing input, not about how much elbow room a spawn tile has.
        player.x = 10.5;
        player.y = 10.5;
        world.reindexPlayers();

        const startX = player.x;

        for (let step = 0; step < 10; step++) {
            dispatchMessage(world, NO_CONTROLS, 'session-1', 'input', {
                dx: 1,
                dy: 0,
                seq: 10 + step,
            });
            world.tick(0.05);
        }

        expect(player.x).toBeGreaterThan(startX + 1);
    });
});
