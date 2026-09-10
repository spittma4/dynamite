import { beforeEach, describe, expect, it } from 'vitest';

import { dispatchMessage } from '../src/rooms/handlers';
import type { RoomControls } from '../src/rooms/handlers';
import { createItem, placeOnFloor, shelfPush } from '../src/sim/items';
import { dropItem } from '../src/sim/itemDrop';
import { MINIGAMES } from '../src/sim/minigames/index';
import type { MinigameInstance, OutputSpec, StationCtx } from '../src/sim/minigames/types';
import {
    build,
    jam,
    leave,
    onInteract,
    onMg,
    onPlayerLeft,
    pauseStation,
    stationsSystem,
    tick,
    unjam,
} from '../src/sim/stations';
import type { Member, Station } from '../src/sim/stations';
import { copy, scaleLevel } from '../src/shared';
import type { ItemType, PlayerState, ScaledLevel, StationState } from '../src/shared';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The station runtime (contracts §10.2): who is on the machine, what the
 * staffing curve makes of them, and when the machine will take the next rep.
 * The mini-game is swapped for a spy wherever the test is about F05's side of
 * the interface rather than the stub's gesture.
 */

const ROOM: RoomControls = { startDay: () => {}, sendConfig: () => {} };

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function stationOf(world: World, id: string): Station {
    const station = world.stations.get(id);

    if (station === undefined) throw new Error(`no station ${id}`);

    return station;
}

function stateOf(world: World, id: string): StationState {
    const st = world.state.stations.get(id);

    if (st === undefined) throw new Error(`no station state ${id}`);

    return st;
}

/** A world past the whistle: `build` runs at `init`, the modules only after `start`. */
function runningWorld(players = 1): World {
    const world = makeWorld({ players });

    world.startDay(scaleLevel(world.level, Math.max(3, players)) as ScaledLevel);

    return world;
}

function standOn(world: World, sessionId: string, [tx, ty]: [number, number]): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = tx + 0.5;
    player.y = ty + 0.5;
    world.reindexPlayers();

    return player;
}

interface SpyInstance extends MinigameInstance {
    calls: { op: string; v: number | string | undefined; t: number }[];
    joins: { sessionId: string; role: string }[];
    leaves: string[];
    ticks: number;
    isStarved: boolean;
    statusValue: { state: 'idle' | 'starved' | 'working'; progress: number } | null;
    lastCtx: StationCtx | null;
    onTick: ((ctx: StationCtx) => void) | null;
}

function spyOn(world: World, id: string): SpyInstance {
    const station = stationOf(world, id);
    const spy: SpyInstance = {
        calls: [],
        joins: [],
        leaves: [],
        ticks: 0,
        isStarved: false,
        statusValue: null,
        lastCtx: null,
        onTick: null,

        onJoin(ctx, player, role): void {
            spy.joins.push({ sessionId: ctx.sessionIdOf(player), role });
        },
        onLeave(_ctx, _player, reason): void {
            spy.leaves.push(reason);
        },
        onInteract(): boolean {
            return false;
        },
        onMessage(_ctx, _player, op, v, t): void {
            spy.calls.push({ op, v, t });
        },
        tick(ctx): void {
            spy.ticks++;
            spy.lastCtx = ctx;
            spy.onTick?.(ctx);
        },
        starved(): boolean {
            return spy.isStarved;
        },
        status(): { state: 'idle' | 'starved' | 'working'; progress: number } | null {
            return spy.statusValue;
        },
    };

    station.mg = spy;

    return spy;
}

function memberOf(world: World, id: string, sessionId: string): Member {
    const member = stationOf(world, id).members.get(sessionId);

    if (member === undefined) throw new Error(`${sessionId} is not on ${id}`);

    return member;
}

/**
 * Three bodies on a machine the curve peaks at two, seated a second apart: one
 * operator on the work tile and two on the floor ring, the last one in being
 * the spare the aisle belongs to.
 */
function crowdPowder(world: World): void {
    const tiles: [number, number][] = [
        [4, 5],
        [3, 5],
        [5, 5],
    ];

    tiles.forEach((tile, i) => {
        world.state.clock = i;
        onInteract(world, standOn(world, `session-${i}`, tile));
    });
}

function shelve(world: World, id: string, type: ItemType): void {
    const item = createItem(world, type);

    shelfPush(world, stateOf(world, id), 'in', item);
}

/** The plainest thing a module can deliver: what the Slammer hands `complete`. */
function kegSpec(handsOf: string): OutputSpec {
    return {
        type: 'keg',
        quality: 1,
        prime: false,
        dents: 0,
        fuseLength: '',
        fill: 0,
        capLoose: false,
        frayed: false,
        orderId: '',
        handsOf,
    };
}

function kegsIn(world: World): number {
    let found = 0;

    world.state.items.forEach((item) => {
        if (item.type === 'keg') found++;
    });

    return found;
}

describe('build', () => {
    it('creates one StationState per config station with the caps from config', () => {
        const world = makeWorld();

        expect([...world.stations.keys()]).toEqual(['powder-a', 'assembly-a', 'dock-a']);

        const powder = stateOf(world, 'powder-a');

        expect(powder.type).toBe('boom_powder');
        expect(powder.line).toBe('a');
        expect(powder.anchorX).toBe(4);
        expect(powder.anchorY).toBe(3);
        expect(powder.state).toBe('idle');
        expect(powder.inputCap).toBe(0);
        expect(powder.outputCap).toBe(6);
        expect(powder.mg).toBe('');

        const assembly = stateOf(world, 'assembly-a');

        expect(assembly.inputCap).toBe(8);
        expect(assembly.outputCap).toBe(4);

        const dock = stateOf(world, 'dock-a');

        expect(dock.inputCap).toBe(0);
        expect(dock.outputCap).toBe(0);
    });

    it('gives every station its module and its ring', () => {
        const world = makeWorld();
        const station = stationOf(world, 'powder-a');

        expect(station.ring).toHaveLength(16);
        expect(station.mg).toBeDefined();
        expect(station.machine.length).toBeGreaterThan(0);
        expect(stationsSystem.name).toBe('stations');
    });

    it('refuses two stations that share a join tile', () => {
        const world = makeWorld();
        const level = structuredClone(world.level);
        const [first, second] = level.stations;

        if (first === undefined || second === undefined) throw new Error('fixture changed');

        second.floorRing.tiles.push([...first.workTiles[0]!]);
        world.level = level;

        expect(() => build(world)).toThrow(/powder-a/);
    });
});

describe('joining a press station', () => {
    let world: World;

    beforeEach(() => {
        world = runningWorld(2);
    });

    it('joins on E, snaps the avatar and starts the clipboard', () => {
        const player = standOn(world, 'session-0', [4, 5]);

        // Still inside the work tile, but off its centre and walking: E snaps.
        player.x = 4.9;
        player.moving = true;
        world.state.clock = 10;

        expect(onInteract(world, player)).toBe(true);
        expect(player.stationId).toBe('powder-a');
        expect(player.workTile).toBe('4,5');
        expect(player.x).toBe(4.5);
        expect(player.y).toBe(5.5);
        expect(player.moving).toBe(false);
        expect(player.clipboardUntil).toBe(13);
        expect(copy.clipboard).toContain(player.bubble);
        expect(player.bubbleUntil).toBe(13);
    });

    it('refuses a join with full hands and leaves the press to F06', () => {
        const player = standOn(world, 'session-0', [4, 5]);

        player.carrying = 'k-1';

        expect(onInteract(world, player)).toBe(false);
        expect(player.stationId).toBe('');
    });

    it('refuses a work tile another member already holds', () => {
        const first = standOn(world, 'session-0', [4, 5]);

        onInteract(world, first);

        const second = standOn(world, 'session-1', [4, 5]);

        expect(onInteract(world, second)).toBe(false);
        expect(second.stationId).toBe('');
    });

    it('joins a floor-ring tile as a helper with no work tile', () => {
        const player = standOn(world, 'session-0', [3, 5]);

        expect(onInteract(world, player)).toBe(true);
        expect(player.stationId).toBe('powder-a');
        expect(player.workTile).toBe('');
    });

    it('waives the clipboard on a return inside the memory window and charges it after', () => {
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 5;
        leave(world, player);

        world.state.clock = 60;
        standOn(world, 'session-0', [4, 5]);
        onInteract(world, player);

        // No clipboard at all: it expires on the tick it was handed out, and
        // no fresh line goes up (the stale one is `bubblesSystem`'s to sweep).
        expect(player.clipboardUntil).toBe(world.now);
        expect(player.bubbleUntil).toBeLessThanOrEqual(world.now);

        leave(world, player);
        world.state.clock = 121;
        standOn(world, 'session-0', [4, 5]);
        onInteract(world, player);

        expect(player.clipboardUntil).toBe(124);
    });

    it('leaves on a second E when the module does not want the press', () => {
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        spyOn(world, 'powder-a');

        expect(onInteract(world, player)).toBe(true);
        expect(player.stationId).toBe('');
        expect(player.workTile).toBe('');
        expect(player.clipboardUntil).toBe(0);
    });
});

describe('a stand station', () => {
    it('gains and loses members from the tick as a player walks the lanes', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'dock-a');
        const player = standOn(world, 'session-0', [22, 4]);

        player.x = 22.9;
        world.reindexPlayers();
        tick(world, 0.05);

        expect(player.stationId).toBe('dock-a');
        expect(player.workTile).toBe('22,4');
        // No clipboard at all: it expires on the tick it was handed out, and
        // no fresh line goes up (the stale one is `bubblesSystem`'s to sweep).
        expect(player.clipboardUntil).toBe(world.now);
        expect(player.bubbleUntil).toBeLessThanOrEqual(world.now);
        expect(player.x).toBe(22.9);
        expect(spy.joins).toEqual([{ sessionId: 'session-0', role: 'work' }]);

        standOn(world, 'session-0', [23, 4]);
        tick(world, 0.05);

        expect(player.workTile).toBe('23,4');
        expect(spy.leaves).toEqual([]);

        // Clear of the dock's ring, which now reaches back to x 20 on rows 5-6.
        standOn(world, 'session-0', [19, 5]);
        tick(world, 0.05);

        expect(player.stationId).toBe('');
        expect(player.workTile).toBe('');
        expect(spy.leaves).toEqual(['stepOff']);
    });

    it('sends E to the module even with full hands and ignores a leave message', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'dock-a');
        const player = standOn(world, 'session-0', [22, 4]);

        tick(world, 0.05);
        player.carrying = 's-1';
        spy.onInteract = (): boolean => true;

        expect(onInteract(world, player)).toBe(true);

        dispatchMessage(world, ROOM, 'session-0', 'leave', {});

        expect(player.stationId).toBe('dock-a');
        expect(spy.leaves).toEqual([]);
    });

    it('ejects a member on a programmatic leave, which is how F10 empties a machine', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'dock-a');
        const player = standOn(world, 'session-0', [22, 4]);

        tick(world, 0.05);

        expect(player.stationId).toBe('dock-a');

        leave(world, player);

        expect(player.stationId).toBe('');
        expect(player.workTile).toBe('');
        expect(spy.leaves).toEqual(['esc']);
    });
});

describe('staffing', () => {
    it('counts the members past the clipboard onto the curve', () => {
        const world = runningWorld(3);
        const st = stateOf(world, 'assembly-a');

        onInteract(world, standOn(world, 'session-0', [13, 5]));
        tick(world, 0.05);

        expect(st.workers).toBe(0);
        expect(st.efficiency).toBe(0);

        world.state.clock = 4;
        tick(world, 0.05);

        expect(st.workers).toBe(1);
        expect(st.efficiency).toBeCloseTo(0.6, 6);

        onInteract(world, standOn(world, 'session-1', [14, 5]));
        world.state.clock = 8;
        tick(world, 0.05);

        expect(st.workers).toBe(2);
        expect(st.efficiency).toBeCloseTo(1.0, 6);
    });

    it('bubbles from the extras, pauses the station and bumps the tally', () => {
        const world = runningWorld(3);
        const st = stateOf(world, 'powder-a');
        const tiles: [number, number][] = [
            [4, 5],
            [3, 5],
            [5, 5],
        ];

        // Distinct join times: the newest body is the one with nothing to do.
        tiles.forEach((tile, i) => {
            world.state.clock = i;
            onInteract(world, standOn(world, `session-${i}`, tile));
        });

        world.state.clock = 6;
        tick(world, 0.05);

        expect(st.workers).toBe(3);
        expect(st.interruptsPerSecond).toBeCloseTo(1 / 6, 4);

        const extra = playerOf(world, 'session-2');
        const member = stationOf(world, 'powder-a').members.get('session-2');
        const due = member?.nextBubbleAt ?? 0;

        expect(due).toBeGreaterThanOrEqual(9);
        expect(due).toBeLessThanOrEqual(12);
        expect(stationOf(world, 'powder-a').members.get('session-0')?.nextBubbleAt).toBeNull();

        world.state.clock = due;
        tick(world, 0.05);

        expect(extra.bubble).toBe(copy.bubbles.whatCanIDo);
        expect(st.pausedUntil).toBeCloseTo(due + 0.5, 6);
        expect(world.tally.players.get(extra.userId)?.bubbles).toBe(1);
    });
});

describe('interrupts', () => {
    it('spends the aisle before the machine, whoever arrived last', () => {
        const world = runningWorld(3);
        const tiles: [number, number][] = [
            [3, 5],
            [5, 5],
            [4, 5],
        ];

        // Two bodies mill on the ring and the third takes the work tile last,
        // so `joinedAt` alone would make the operator its own interrupt.
        tiles.forEach((tile, i) => {
            world.state.clock = i;
            onInteract(world, standOn(world, `session-${i}`, tile));
        });

        world.state.clock = 6;
        tick(world, 0.05);

        expect(stateOf(world, 'powder-a').workers).toBe(3);
        expect(memberOf(world, 'powder-a', 'session-2').role).toBe('work');
        expect(memberOf(world, 'powder-a', 'session-2').nextBubbleAt).toBeNull();
        expect(memberOf(world, 'powder-a', 'session-1').nextBubbleAt).not.toBeNull();
    });

    it('owes every cadence the aisle was left standing in and pauses once for the lot', () => {
        const world = runningWorld(3);
        const st = stateOf(world, 'powder-a');

        crowdPowder(world);
        world.state.clock = 6;
        tick(world, 0.05);

        const extra = memberOf(world, 'powder-a', 'session-2');
        const due = extra.nextBubbleAt ?? 0;

        // A whole cadence went by unanswered on top of the one that was due.
        world.state.clock = due + 6.5;
        tick(world, 0.05);

        const player = playerOf(world, 'session-2');

        expect(player.bubble).toBe(copy.bubbles.whatCanIDo);
        expect(world.tally.players.get(player.userId)?.bubbles).toBe(2);
        expect(extra.nextBubbleAt).toBeCloseTo(due + 12, 6);
        expect(st.pausedUntil).toBeCloseTo(due + 7, 6);
    });

    it('stops the bubbles the moment the curve has room again', () => {
        const world = runningWorld(3);
        const st = stateOf(world, 'powder-a');

        crowdPowder(world);
        world.state.clock = 6;
        tick(world, 0.05);

        const extra = memberOf(world, 'powder-a', 'session-2');
        const due = extra.nextBubbleAt ?? 0;
        const spare = playerOf(world, 'session-2');

        leave(world, playerOf(world, 'session-1'));
        world.state.clock = due + 1;
        tick(world, 0.05);

        expect(st.workers).toBe(2);
        expect(st.interruptsPerSecond).toBe(0);
        expect(extra.nextBubbleAt).toBeNull();
        expect(spare.bubble).not.toBe(copy.bubbles.whatCanIDo);
        expect(world.tally.players.get(spare.userId)?.bubbles ?? 0).toBe(0);

        // Back through the door: the schedule starts over rather than firing on arrival.
        world.state.clock = due + 2;
        onInteract(world, standOn(world, 'session-1', [3, 5]));
        world.state.clock = due + 3;
        tick(world, 0.05);

        const rejoined = memberOf(world, 'powder-a', 'session-1');

        expect(st.workers).toBe(3);
        expect(rejoined.nextBubbleAt).toBeGreaterThanOrEqual(due + 6);
        expect(playerOf(world, 'session-1').bubble).not.toBe(copy.bubbles.whatCanIDo);
    });

    it('crowds a stand station too, where nobody ever read a clipboard', () => {
        const world = runningWorld(4);
        const st = stateOf(world, 'dock-a');
        const lanes: [number, number][] = [
            [22, 4],
            [23, 4],
            [24, 4],
        ];

        lanes.forEach((tile, i) => {
            standOn(world, `session-${i}`, tile);
        });
        world.state.clock = 1;
        tick(world, 0.05);

        expect(st.workers).toBe(3);
        expect(st.interruptsPerSecond).toBe(0);

        // The fourth lane is one body past the dock's peak of three.
        standOn(world, 'session-3', [25, 4]);
        world.state.clock = 2;
        tick(world, 0.05);

        const extra = memberOf(world, 'dock-a', 'session-3');
        const due = extra.nextBubbleAt ?? 0;

        expect(st.workers).toBe(4);
        expect(st.interruptsPerSecond).toBeCloseTo(1 / 6, 4);
        expect(due).toBeGreaterThanOrEqual(5);

        world.state.clock = due;
        tick(world, 0.05);

        expect(playerOf(world, 'session-3').bubble).toBe(copy.bubbles.whatCanIDo);
        expect(st.pausedUntil).toBeCloseTo(due + 0.5, 6);
    });

    it('bills the rep at the wall clock: 1.5 s of work around two bubbles re-arms at +2.5 s', () => {
        const world = runningWorld(3);
        const st = stateOf(world, 'powder-a');
        const station = stationOf(world, 'powder-a');
        const spy = spyOn(world, 'powder-a');

        // A tighter cadence than the 6 s default fits two interrupts inside one
        // rep, and pinning the first beat keeps the arithmetic readable; both
        // numbers are the level's, never a constant's.
        world.level.interrupts = { everySeconds: 1.2, pauseSeconds: 0.5 };
        crowdPowder(world);

        world.state.clock = 4;
        tick(world, 0.05);
        memberOf(world, 'powder-a', 'session-2').nextBubbleAt = 5;

        const at = (i: number): number => Number((4.6 + i * 0.05).toFixed(2));
        let pausedTicks = 0;

        spy.onTick = (ctx): void => {
            if (ctx.paused) pausedTicks++;
            if (world.state.clock === at(0)) ctx.beginCycle();
            if (world.state.clock === at(50)) ctx.complete({ perfect: false });
        };

        for (let i = 0; i <= 50; i++) {
            world.state.clock = at(i);
            tick(world, 0.05);
        }

        // The module is told to hold its own timers for both half-second beats.
        expect(pausedTicks).toBe(20);
        expect(st.efficiency).toBeCloseTo(0.9, 6);
        expect(station.cycle?.bubbles).toBe(2);
        expect(station.cycle?.pausedSeconds).toBeCloseTo(1, 6);
        expect(world.tally.players.get(playerOf(world, 'session-2').userId)?.bubbles).toBe(2);

        // max(1.5 s of execution + 2 × 0.5 s of interrupt, the 1.4 / 0.9 machine floor).
        expect(station.armedAt).toBeCloseTo(7.1, 6);
    });
});

describe('the cycle', () => {
    it('gates beginCycle on the re-arm floor and on empty hands', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;

        let began: boolean[] = [];

        spy.onTick = (ctx): void => {
            began.push(ctx.beginCycle());
        };

        tick(world, 0.05);

        expect(began).toEqual([true]);

        began = [];
        spy.onTick = (ctx): void => {
            if (ctx.phase === 'executing') ctx.complete({ perfect: false });
        };
        tick(world, 0.05);

        const station = stationOf(world, 'powder-a');

        expect(station.armedAt).toBeCloseTo(4 + 1.4 / 1.0, 4);

        spy.onTick = (ctx): void => {
            began.push(ctx.beginCycle());
        };
        world.state.clock = 5;
        tick(world, 0.05);

        expect(began).toEqual([false]);

        world.state.clock = 6;
        began = [];
        tick(world, 0.05);

        expect(began).toEqual([true]);
    });

    it('shelves the output, hands it over when the shelf is full, and bumps the tally', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;

        // One judged keg per tick, which is all F05 sees of any module.
        spy.onTick = (ctx): void => {
            if (!ctx.beginCycle()) return;

            ctx.complete({ item: kegSpec(ctx.sessionIdOf(player)), perfect: false });
        };

        const st = stateOf(world, 'powder-a');

        for (let i = 0; i < 6; i++) {
            world.state.clock += 2;
            tick(world, 0.05);
        }

        expect(st.outputShelf.length).toBe(6);
        expect(world.tally.counts.kegsMade).toBe(6);
        expect(world.tally.players.get(player.userId)?.produced).toBe(6);

        world.state.clock += 2;
        tick(world, 0.05);

        expect(player.carrying).toBe('k-7');
        expect(st.outputShelf.length).toBe(6);

        // Shelf full and hands full: ADR 0012 leaves nowhere to put an eighth.
        world.state.clock += 2;
        tick(world, 0.05);

        expect(kegsIn(world)).toBe(7);
    });

    it('forfeits an executing cycle when the operator leaves', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;
        spy.onTick = (ctx): void => {
            if (ctx.phase === 'idle') ctx.beginCycle();
        };
        tick(world, 0.05);

        const station = stationOf(world, 'powder-a');
        const st = stateOf(world, 'powder-a');

        expect(st.state).toBe('working');

        world.state.clock = 5;
        leave(world, player);
        tick(world, 0.05);

        expect(station.cycle).toBeNull();
        expect(station.armedAt).toBe(0);
        expect(st.state).toBe('idle');
        expect(st.progress).toBe(0);
        expect(spy.leaves).toEqual(['esc']);
    });

    it('writes the module status verbatim and honours setProgress', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;
        spy.statusValue = { state: 'starved', progress: 0.25 };
        tick(world, 0.05);

        const st = stateOf(world, 'powder-a');

        expect(st.state).toBe('starved');
        expect(st.progress).toBe(0.25);

        spy.onTick = (ctx): void => ctx.setProgress(0.5);
        tick(world, 0.05);

        expect(st.progress).toBe(0.5);
    });

    it('aborts a rep without moving the re-arm floor, and publishes mg only on a change', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;
        spy.onTick = (ctx): void => {
            ctx.beginCycle();
            ctx.setMg({ phase: 'idle' });
        };
        tick(world, 0.05);

        const station = stationOf(world, 'powder-a');
        const st = stateOf(world, 'powder-a');

        expect(st.mg).toBe('{"phase":"idle"}');

        station.armedAt = 9;
        spy.onTick = (ctx): void => ctx.abort();
        tick(world, 0.05);

        expect(station.cycle).toBeNull();
        expect(station.armedAt).toBe(9);
        expect(st.progress).toBe(0);
    });

    it('never feeds a station off its own floor ring', () => {
        const world = runningWorld(1);
        const player = standOn(world, 'session-0', [13, 5]);

        onInteract(world, player);
        world.state.clock = 4;

        const casing = createItem(world, 'casing');
        const keg = createItem(world, 'keg');

        placeOnFloor(world, casing, [11, 7]);
        placeOnFloor(world, keg, [12, 7]);
        world.reindexItems();
        tick(world, 0.05);

        expect(stateOf(world, 'assembly-a').state).toBe('starved');
    });

    it('reads starved from the module and only from the input shelf', () => {
        const world = runningWorld(1);
        const player = standOn(world, 'session-0', [13, 5]);

        onInteract(world, player);
        world.state.clock = 4;
        tick(world, 0.05);

        const st = stateOf(world, 'assembly-a');

        expect(st.state).toBe('starved');

        shelve(world, 'assembly-a', 'casing');
        tick(world, 0.05);

        expect(st.state).toBe('starved');

        shelve(world, 'assembly-a', 'keg');
        tick(world, 0.05);

        expect(st.state).toBe('idle');
    });
});

describe('mini-game input', () => {
    it('drops ops during the clipboard and forwards the raw timestamp after it', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        onMg(world, player, { stationId: 'powder-a', op: 'mash', t: 1234, v: 'l' });

        expect(spy.calls).toEqual([]);

        world.state.clock = 4;
        onMg(world, player, { stationId: 'powder-a', op: 'mash', t: 1234, v: 'l' });

        expect(spy.calls).toEqual([{ op: 'mash', v: 'l', t: 1234 }]);

        onMg(world, player, { stationId: 'assembly-a', op: 'mash', t: 1, v: 'l' });

        expect(spy.calls).toHaveLength(1);
    });

    it('routes the mg and leave messages and the action fallback through the handlers', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;

        dispatchMessage(world, ROOM, 'session-0', 'mg', {
            stationId: 'powder-a',
            op: 'release',
            t: 20,
        });

        expect(spy.calls.at(-1)).toEqual({ op: 'release', v: undefined, t: 20 });

        dispatchMessage(world, ROOM, 'session-0', 'action', { t: 30 });

        expect(spy.calls.at(-1)).toEqual({ op: 'charge', v: undefined, t: 30 });

        dispatchMessage(world, ROOM, 'session-0', 'leave', {});

        expect(player.stationId).toBe('');
    });
});

describe('jam, pause and damage', () => {
    it('freezes on jam and resumes without counting the jammed seconds', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;
        spy.onTick = (ctx): void => {
            if (ctx.phase === 'idle') ctx.beginCycle();
        };
        tick(world, 0.05);

        const station = stationOf(world, 'powder-a');
        const st = stateOf(world, 'powder-a');
        const ticksBefore = spy.ticks;

        world.state.clock = 5;
        jam(world, 'powder-a');
        tick(world, 0.05);

        expect(st.state).toBe('jammed');
        expect(spy.ticks).toBe(ticksBefore);

        world.state.clock = 9;
        unjam(world, 'powder-a');

        expect(station.cycle?.startedAt).toBeCloseTo(8, 6);

        onMg(world, player, { stationId: 'powder-a', op: 'mash', t: 1 });
        world.state.clock = 9;
        jam(world, 'powder-a');
        onMg(world, player, { stationId: 'powder-a', op: 'mash', t: 2 });

        expect(spy.calls.map((c) => c.t)).toEqual([1]);
    });

    it('holds ops off while paused', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        world.state.clock = 4;
        pauseStation(world, 'powder-a', 0.5);
        onMg(world, player, { stationId: 'powder-a', op: 'mash', t: 1 });

        expect(spy.calls).toEqual([]);

        world.state.clock = 4.6;
        onMg(world, player, { stationId: 'powder-a', op: 'mash', t: 2 });

        expect(spy.calls).toHaveLength(1);
    });

    it('goes offline while damaged: no join, no op, no state write', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const st = stateOf(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        st.state = 'damaged';
        st.progress = 0.4;

        expect(onInteract(world, player)).toBe(false);
        expect(player.stationId).toBe('');

        tick(world, 0.05);

        expect(st.state).toBe('damaged');
        expect(st.progress).toBe(0.4);
        expect(spy.ticks).toBe(0);
    });

    it('never overwrites damaged: F05 writes jammed and F10 owns the rest', () => {
        const world = runningWorld(1);
        const st = stateOf(world, 'powder-a');

        st.state = 'damaged';
        st.progress = 0.6;

        jam(world, 'powder-a');

        expect(st.state).toBe('damaged');
        expect(st.progress).toBeCloseTo(0.6, 6);

        // The path that gets there: F06 jams whatever machine a thrown item
        // comes to rest on, and a repairer stands on the damaged work tile.
        dropItem(world, createItem(world, 'casing'), [5, 4], [1, 0], '');

        expect(st.state).toBe('damaged');
    });

    it('goes offline while damaged at a stand station too: no re-seat, no press', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'dock-a');
        const st = stateOf(world, 'dock-a');
        const player = standOn(world, 'session-0', [22, 4]);

        tick(world, 0.05);

        const ticksBefore = spy.ticks;

        // F10 damages the machine and ejects the crew; the next tick must not
        // walk them straight back onto it.
        st.state = 'damaged';
        st.progress = 0.5;
        leave(world, player);
        tick(world, 0.05);

        expect(player.stationId).toBe('');
        expect(st.state).toBe('damaged');
        expect(st.progress).toBe(0.5);
        expect(spy.ticks).toBe(ticksBefore);

        let pressed = false;

        spy.onInteract = (): boolean => {
            pressed = true;

            return true;
        };

        expect(onInteract(world, player)).toBe(false);
        expect(pressed).toBe(false);
    });
});

describe('a seat going away', () => {
    it('takes the player off the station on disconnect', () => {
        const world = runningWorld(1);
        const spy = spyOn(world, 'powder-a');
        const player = standOn(world, 'session-0', [4, 5]);

        onInteract(world, player);
        onPlayerLeft(world, 'session-0');

        expect(player.stationId).toBe('');
        expect(stationOf(world, 'powder-a').members.size).toBe(0);
        expect(spy.leaves).toEqual(['disconnect']);
    });
});

describe('the modules', () => {
    it('holds one module per station type', () => {
        expect(Object.keys(MINIGAMES).sort()).toEqual(['assembly', 'boom_powder', 'dock']);
    });

    it('creates one instance per station, so no module state crosses machines', () => {
        const world = makeWorld();
        const other = makeWorld();

        expect(stationOf(world, 'powder-a').mg).not.toBe(stationOf(world, 'assembly-a').mg);
        expect(stationOf(world, 'powder-a').mg).not.toBe(stationOf(other, 'powder-a').mg);
    });

    /**
     * The whole round trip a real module takes: the handlers forward the raw
     * `t`, the module judges it, and the keg lands on F05's shelf. The gesture
     * belongs to F07 and is asserted to the millisecond in its own suite; what
     * this owes is that nothing between the socket and the shelf is a stub.
     */
    it('takes a keg off the real Slammer verbs, from the handler to the shelf', () => {
        const world = runningWorld(1);
        const player = standOn(world, 'session-0', [4, 5]);

        function mg(op: string, t: number, v?: string): void {
            dispatchMessage(world, ROOM, 'session-0', 'mg', { stationId: 'powder-a', op, t, v });
        }

        world.state.clock = 104;
        dispatchMessage(world, ROOM, 'session-0', 'interact', { t: 0 });

        expect(player.stationId).toBe('powder-a');

        // Past the clipboard, with one tick to put the curve on the row.
        world.state.clock = 108;
        tick(world, 0.05);

        // 0.5 s of mash doubles into a 1.0 s climb, and the hold is that long.
        mg('mash', 1000, 'l');
        mg('mash', 1250, 'u');
        world.state.clock = 108.5;
        mg('mash', 1500, 'r');
        mg('charge', 1500);
        world.state.clock = 109.5;
        mg('release', 2500);

        const st = stateOf(world, 'powder-a');

        expect(st.outputShelf.length).toBe(1);
        expect(world.state.items.get(st.outputShelf[0] ?? '')?.type).toBe('keg');
        expect(world.tally.counts.kegsMade).toBe(1);
    });

    it('reads E at a module that declines the press as a leave, re-arm floor or not', () => {
        const world = runningWorld(1);
        const player = standOn(world, 'session-0', [4, 5]);

        world.state.clock = 104;
        dispatchMessage(world, ROOM, 'session-0', 'interact', { t: 0 });
        world.state.clock = 108;
        tick(world, 0.05);

        // Contracts §10.3: `onInteract` false is F05's cue, and every real
        // module returns it, so `E` on the machine only ever means "off".
        dispatchMessage(world, ROOM, 'session-0', 'interact', { t: 0 });

        expect(player.stationId).toBe('');
        expect(stationOf(world, 'powder-a').members.size).toBe(0);
    });
});

describe('the tick contract', () => {
    it('is registered in SYSTEMS and does nothing in the lobby', () => {
        const world = makeWorld({ players: 1 });
        const player = standOn(world, 'session-0', [4, 5]);

        world.tick(0.05);

        expect(onInteract(world, player)).toBe(false);
        expect(player.stationId).toBe('');
    });

    it('keeps StationState.pausedUntil in step with the runtime', () => {
        const world = runningWorld(1);

        world.state.clock = 4;
        pauseStation(world, 'assembly-a', 2);
        tick(world, 0.05);

        expect(stateOf(world, 'assembly-a').pausedUntil).toBeCloseTo(6, 6);
    });
});
