import { describe, expect, it } from 'vitest';

import {
    beepPhase,
    copy,
    judgeShove,
    laneIndexAt,
    nearestBeep,
    parseDockMg,
    scaleLevel,
    tailgateWindowEnd,
} from '../../src/shared';
import type {
    DockMg,
    FuseLength,
    ItemState,
    LevelConfig,
    PlayerState,
    ScaledLevel,
    ShoveWindows,
    StationState,
    Tile,
} from '../../src/shared';
import { createItem, giveToPlayer } from '../../src/sim/items';
import { closeShift, dockSystem, dockTick } from '../../src/sim/minigames/dock';
import {
    onInteract as stationsInteract,
    onMg as stationsMg,
    tick as stationsTick,
} from '../../src/sim/stations';
import type { World } from '../../src/sim/World';
import { makeWorld } from '../helpers/world';
import type { MakeWorldOptions } from '../helpers/world';

/**
 * The Dock (contracts §10.6, docs/04 "The Dock"). The beep is the metronome and
 * the server owns it: every judgement below is milliseconds against a beep time
 * the truck set when it backed up, never a fraction of anything the client drew.
 */

const WINDOWS: ShoveWindows = { perfectMs: 70, okMs: 180 };
const LANES: Tile[] = [
    [23, 4],
    [23, 5],
    [23, 6],
    [23, 7],
];

describe('nearestBeep', () => {
    it('finds the beep a press belongs to and how late it was', () => {
        expect(nearestBeep(20000, 1000, 20, 21040)).toEqual({ index: 1, deltaMs: 40 });
        expect(nearestBeep(20000, 1000, 20, 20960)).toEqual({ index: 1, deltaMs: -40 });
        expect(nearestBeep(20000, 1000, 20, 20000)).toEqual({ index: 0, deltaMs: 0 });
    });

    it('clamps to the first and last beep the truck will sound', () => {
        expect(nearestBeep(20000, 1000, 20, 19500)).toEqual({ index: 0, deltaMs: -500 });
        expect(nearestBeep(20000, 1000, 20, 39800)).toEqual({ index: 19, deltaMs: 800 });
    });
});

describe('judgeShove', () => {
    it('thuds inside the perfect window, scrapes inside the ok window and stalls beyond it', () => {
        expect(judgeShove(0, WINDOWS)).toBe('perfect');
        expect(judgeShove(-70, WINDOWS)).toBe('perfect');
        expect(judgeShove(71, WINDOWS)).toBe('ok');
        expect(judgeShove(-180, WINDOWS)).toBe('ok');
        expect(judgeShove(181, WINDOWS)).toBe('miss');
    });
});

describe('beepPhase', () => {
    it('runs 0 to 1 once per beep and stays 0 before the first one', () => {
        expect(beepPhase(20, 1000, 19.5)).toBe(0);
        expect(beepPhase(20, 1000, 20)).toBe(0);
        expect(beepPhase(20, 1000, 20.25)).toBeCloseTo(0.25);
        expect(beepPhase(20, 1000, 21.75)).toBeCloseTo(0.75);
    });
});

describe('tailgateWindowEnd', () => {
    it('opens for the window but never past the truck leaving', () => {
        expect(tailgateWindowEnd(30, 40, 3)).toBe(33);
        expect(tailgateWindowEnd(38.5, 40, 3)).toBe(40);
    });
});

describe('laneIndexAt', () => {
    it('maps a position to the lane under it', () => {
        expect(laneIndexAt(LANES, 23.5, 5.5)).toBe(1);
        expect(laneIndexAt(LANES, 23.1, 7.9)).toBe(3);
        expect(laneIndexAt(LANES, 22.5, 5.5)).toBe(-1);
    });
});

describe('parseDockMg', () => {
    it('round-trips a DockMg and refuses anything else', () => {
        const mg: DockMg = {
            truck: {
                phase: 'docked',
                arrivesAt: 20,
                leavesAt: 40,
                slots: 8,
                loaded: 2,
                hits: 'PO',
            },
            lanes: [{ tile: [23, 4], itemId: 's-1', stalled: false }],
            beepAt: 20,
            beepPeriodMs: 1000,
            windows: WINDOWS,
            tailgateUntil: 0,
            returnsTile: [19, 12],
        };

        expect(parseDockMg(JSON.stringify(mg))).toEqual(mg);
        expect(parseDockMg('')).toBeNull();
        expect(parseDockMg('{"truck":1}')).toBeNull();
        expect(parseDockMg('[]')).toBeNull();
    });
});

const TICK = 0.05;
const DOCK = 'dock-a';
const LANE_A: Tile = [23, 4];
const LANE_B: Tile = [23, 5];
const RETURNS: Tile = [19, 12];

function sandboxLevel(level: LevelConfig): LevelConfig {
    level.day = { ...level.day, shiftSeconds: 0, orderBook: 0, endsOn: 'never' };
    level.scaling.breakpoints = level.scaling.breakpoints.map((b) => ({ ...b, orderBook: 0 }));

    return level;
}

function started(opts: MakeWorldOptions = {}): World {
    const world = makeWorld({ players: 2, ...opts });

    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

    return world;
}

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function dockState(world: World): StationState {
    const st = world.state.stations.get(DOCK);

    if (st === undefined) throw new Error('no dock station');

    return st;
}

function mgOf(world: World): DockMg {
    const mg = parseDockMg(dockState(world).mg);

    if (mg === null) throw new Error(`dock mg is not a DockMg: ${dockState(world).mg}`);

    return mg;
}

/** The scripted clock: set the second, then run the two systems that read it. */
function jumpTo(world: World, clock: number): void {
    world.state.clock = clock;
    world.reindexPlayers();
    world.reindexItems();
    stationsTick(world, TICK);
    dockTick(world, TICK);
}

function stand(world: World, sessionId: string, tile: Tile): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = tile[0] + 0.5;
    player.y = tile[1] + 0.5;
    world.reindexPlayers();
    stationsTick(world, TICK);

    return player;
}

function carry(world: World, sessionId: string, fuseLength: FuseLength): ItemState {
    const stick = createItem(world, 'stick', { fuseLength });

    giveToPlayer(world, stick, sessionId);

    return stick;
}

function orderFuse(world: World, id: string): FuseLength {
    return (world.state.orders.get(id)?.fuseLength ?? 'long') as FuseLength;
}

function shove(world: World, player: PlayerState, atSeconds: number): void {
    world.state.clock = atSeconds;
    stationsMg(world, player, { stationId: DOCK, op: 'shove', t: atSeconds * 1000 });
}

function tailgate(world: World, player: PlayerState, atSeconds: number, v: 'down' | 'up'): void {
    world.state.clock = atSeconds;
    stationsMg(world, player, { stationId: DOCK, op: 'tailgate', t: atSeconds * 1000, v });
}

function effects(world: World): { kind: string; text: string }[] {
    return world.outbox.flatMap((out) =>
        out.name === 'fx' ? [{ kind: out.payload.kind as string, text: out.payload.text ?? '' }] : [],
    );
}

function toasts(world: World): { text: string; kind: string }[] {
    return world.outbox.flatMap((out) =>
        out.name === 'toast' ? [{ text: out.payload.text, kind: out.payload.kind as string }] : [],
    );
}

/** Stage a matching stick on the lane the player is standing on and shove it in. */
function load(world: World, player: PlayerState, sessionId: string, atSeconds: number): void {
    world.state.clock = atSeconds - 0.5;
    carry(world, sessionId, orderFuse(world, 'o-1'));
    stationsInteract(world, player);
    shove(world, player, atSeconds);
}

describe('the truck timetable', () => {
    it('runs away → docked → leaving → away on the config schedule', () => {
        const world = started();
        const { truck } = world.state;

        expect(truck.phase).toBe('away');
        expect(truck.arrivesAt).toBe(20);
        expect(truck.leavesAt).toBe(40);

        jumpTo(world, 20);
        expect(truck.phase).toBe('docked');

        jumpTo(world, 40);
        expect(truck.phase).toBe('leaving');

        jumpTo(world, 41.5);
        expect(truck.phase).toBe('away');
        expect(truck.id).toBe(2);
        expect(truck.arrivesAt).toBe(80);
        expect(truck.slots).toBe(8);
    });

    it('ramps the slots of a later truck', () => {
        const world = started();
        const { truck } = world.state;

        jumpTo(world, 20);
        jumpTo(world, 40);
        jumpTo(world, 41.5);
        jumpTo(world, 80);
        jumpTo(world, 100);
        jumpTo(world, 101.5);

        expect(truck.id).toBe(3);
        expect(truck.arrivesAt).toBe(140);
        expect(truck.slots).toBe(9);
    });

    it('beeps once a second while docked and not at all otherwise', () => {
        const world = started();
        const { truck } = world.state;

        jumpTo(world, 20);
        expect(truck.beepPhase).toBe(0);

        jumpTo(world, 20.25);
        expect(truck.beepPhase).toBeCloseTo(0.25);

        jumpTo(world, 21.5);
        expect(truck.beepPhase).toBeCloseTo(0.5);

        jumpTo(world, 40);
        expect(truck.beepPhase).toBe(0);
    });

    it('keeps the last truck parked once the book is done', () => {
        const world = started();

        world.state.bookTotal = 1;
        world.state.bookRemaining = 1;

        jumpTo(world, 20);
        jumpTo(world, 40);
        jumpTo(world, 41.5);

        expect(world.state.truck.phase).toBe('leaving');
        expect(world.state.bookRemaining).toBe(0);
        expect(world.endRequested).toBeNull();
    });
});

describe('station state', () => {
    it('works at loaded/slots while docked and is idle otherwise', () => {
        const world = started();
        const st = dockState(world);

        // Stations tick before the dock, so the station reads the truck one step late.
        jumpTo(world, 20);
        expect(st.state).toBe('idle');

        jumpTo(world, 20.05);
        expect(st.state).toBe('working');
        expect(st.progress).toBe(0);

        world.state.truck.loaded = 4;
        jumpTo(world, 25);
        expect(st.state).toBe('working');
        expect(st.progress).toBe(0.5);

        jumpTo(world, 40);
        jumpTo(world, 40.05);
        expect(st.state).toBe('idle');
        expect(st.progress).toBe(0);
    });

    it('rewrites mg on a change and never on an idle tick', () => {
        const world = started();

        jumpTo(world, 20);

        const st = dockState(world);
        let value = st.mg;
        let writes = 0;

        Object.defineProperty(st, 'mg', {
            configurable: true,
            get: () => value,
            set: (next: string) => {
                value = next;
                writes++;
            },
        });

        for (let i = 1; i <= 20; i++) jumpTo(world, 20 + i * TICK);

        expect(writes).toBe(0);

        jumpTo(world, 40);

        expect(writes).toBe(1);
    });
});

describe('setting a stick on a lane', () => {
    it('moves a matching stick from the hands to the lane', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        jumpTo(world, 20);

        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('');
        expect(stick.holder).toBe(DOCK);
        expect(stick.shelf).toBe('');
        expect(world.tileOf(stick.x, stick.y)).toEqual(LANE_A);
        expect(mgOf(world).lanes[0]?.itemId).toBe(stick.id);
    });

    it('stages before the truck has even arrived', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        expect(stationsInteract(world, player)).toBe(true);
        expect(stick.holder).toBe(DOCK);
    });

    it('leaves a keg to F06: the dock never tracks one', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const keg = createItem(world, 'keg');

        giveToPlayer(world, keg, 'session-0');
        jumpTo(world, 20);

        expect(stationsInteract(world, player)).toBe(false);
        expect(player.carrying).toBe(keg.id);
    });

    it('refuses the wrong fuse length', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const wrong: FuseLength = orderFuse(world, 'o-1') === 'short' ? 'long' : 'short';
        const stick = carry(world, 'session-0', wrong);

        jumpTo(world, 20);
        world.outbox.length = 0;

        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe(stick.id);
        expect(effects(world)).toEqual([{ kind: 'bonk', text: 'WRONG FUSE' }]);
    });

    it('refuses a stick when the truck is already full', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        jumpTo(world, 20);
        world.state.truck.loaded = world.state.truck.slots;
        world.outbox.length = 0;

        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe(stick.id);
        expect(effects(world)).toEqual([{ kind: 'bonk', text: 'FULL' }]);
    });

    it('refuses a second stick on a lane that already holds one', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const fuse = orderFuse(world, 'o-1');

        jumpTo(world, 20);
        carry(world, 'session-0', fuse);
        stationsInteract(world, player);

        const second = carry(world, 'session-0', fuse);

        world.outbox.length = 0;

        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe(second.id);
        expect(effects(world)).toEqual([{ kind: 'bonk', text: 'BUSY' }]);
    });

    it('picks an unshoved stick back up and leaves a stalled one where it is', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        jumpTo(world, 20);
        stationsInteract(world, player);

        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe(stick.id);
        expect(stick.holder).toBe('session-0');
        expect(mgOf(world).lanes[0]?.itemId).toBe('');

        stationsInteract(world, player);
        shove(world, player, 21.4);

        expect(mgOf(world).lanes[0]?.stalled).toBe(true);
        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('');
        expect(stick.holder).toBe(DOCK);
    });
});

describe('shoving on the beep', () => {
    it('thuds inside the perfect window', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        jumpTo(world, 20);
        stationsInteract(world, player);
        world.outbox.length = 0;
        shove(world, player, 21.04);

        expect(world.state.truck.loaded).toBe(1);
        expect(world.state.orders.get('o-1')?.shipped).toBe(1);
        expect(world.state.items.get(stick.id)).toBeUndefined();
        expect(effects(world)).toEqual([{ kind: 'thunk', text: 'THUD' }]);
        expect(mgOf(world).truck.hits).toBe('P');
        expect(mgOf(world).lanes[0]?.itemId).toBe('');
    });

    it('scrapes inside the ok window', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        jumpTo(world, 20);
        carry(world, 'session-0', orderFuse(world, 'o-1'));
        stationsInteract(world, player);
        world.outbox.length = 0;
        shove(world, player, 21.12);

        expect(world.state.truck.loaded).toBe(1);
        expect(effects(world)).toEqual([{ kind: 'clink', text: 'scrape' }]);
        expect(mgOf(world).truck.hits).toBe('O');
    });

    it('stalls the lane beyond the ok window and clears it on the next beep', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        jumpTo(world, 20);
        stationsInteract(world, player);
        world.outbox.length = 0;
        shove(world, player, 21.4);

        expect(world.state.truck.loaded).toBe(0);
        expect(mgOf(world).lanes[0]?.stalled).toBe(true);
        expect(effects(world)).toEqual([{ kind: 'bonk', text: 'STALL' }]);
        expect(world.state.items.get(stick.id)?.holder).toBe(DOCK);

        shove(world, player, 22.12);

        expect(world.state.truck.loaded).toBe(1);
        expect(mgOf(world).lanes[0]?.stalled).toBe(false);
        expect(mgOf(world).lanes[0]?.itemId).toBe('');
    });

    it('judges one shove per lane per beep', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const fuse = orderFuse(world, 'o-1');

        jumpTo(world, 20);
        carry(world, 'session-0', fuse);
        stationsInteract(world, player);
        shove(world, player, 21.04);

        carry(world, 'session-0', fuse);
        stationsInteract(world, player);
        shove(world, player, 21.06);

        expect(world.state.truck.loaded).toBe(1);
        expect(mgOf(world).truck.hits).toBe('P');
        expect(mgOf(world).lanes[0]?.itemId).not.toBe('');
    });

    it('ignores a shove while away, on an empty lane, or on a full truck', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        carry(world, 'session-0', orderFuse(world, 'o-1'));
        stationsInteract(world, player);
        shove(world, player, 10);
        expect(world.state.truck.loaded).toBe(0);

        jumpTo(world, 20);
        world.state.truck.loaded = world.state.truck.slots;
        shove(world, player, 21.04);
        expect(mgOf(world).lanes[0]?.itemId).not.toBe('');

        world.state.truck.loaded = 0;
        stationsInteract(world, player);
        world.outbox.length = 0;
        shove(world, player, 22.04);
        expect(world.state.truck.loaded).toBe(0);
        expect(effects(world)).toEqual([]);
    });
});

describe('departure', () => {
    it('settles a partial truck, toasts the credit and sends the leftovers to Returns', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        jumpTo(world, 20);

        for (let i = 1; i <= 5; i++) load(world, player, 'session-0', 20 + i);

        carry(world, 'session-0', orderFuse(world, 'o-1'));
        stationsInteract(world, player);

        const stranded = playerOf(world, 'session-0').carrying;
        const laned = mgOf(world).lanes[0]?.itemId ?? '';

        expect(stranded).toBe('');
        world.outbox.length = 0;
        jumpTo(world, 40);

        const order = world.state.orders.get('o-1');
        const item = world.state.items.get(laned);

        expect(order?.status).toBe('partial');
        expect(order?.shipped).toBe(5);
        expect(world.state.bookRemaining).toBe(10);
        expect(item?.holder).toBe('');
        expect(world.tileOf(item?.x ?? -1, item?.y ?? -1)).toEqual(RETURNS);
        expect(mgOf(world).lanes.every((lane) => lane.itemId === '')).toBe(true);
        expect(toasts(world)).toEqual([{ text: 'TRUCK LEFT WITH 5/8 — 50', kind: 'warn' }]);
        expect(effects(world).some((e) => e.kind === 'horn')).toBe(true);
    });

    it('fails an empty truck', () => {
        const world = started();

        jumpTo(world, 20);
        world.outbox.length = 0;
        jumpTo(world, 40);

        expect(world.state.orders.get('o-1')?.status).toBe('failed');
        expect(toasts(world)).toEqual([{ text: 'TRUCK LEFT EMPTY — 0', kind: 'bad' }]);
    });

    it('completes a full truck, honks, and leaves score and groove alone', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);
        const score = world.state.score;
        const groove = world.state.groove;

        jumpTo(world, 20);

        for (let i = 1; i <= 8; i++) load(world, player, 'session-0', 20 + i);

        world.outbox.length = 0;
        jumpTo(world, 40);

        expect(world.state.orders.get('o-1')?.status).toBe('complete');
        expect(world.grooveEvents.trucksComplete).toBe(1);
        expect(effects(world)).toEqual([{ kind: 'horn', text: 'HONK' }]);
        expect(toasts(world)).toEqual([{ text: 'TRUCK OUT 8/8 — 180', kind: 'good' }]);
        expect(world.state.score).toBe(score);
        expect(world.state.groove).toBe(groove);
    });

    it('drives off everyone standing in the truck bay', () => {
        const world = started();
        const rider = playerOf(world, 'session-1');
        const cargo = createItem(world, 'stick');

        rider.x = 25.5;
        rider.y = 5.5;
        giveToPlayer(world, cargo, 'session-1');
        world.reindexPlayers();

        jumpTo(world, 20);
        jumpTo(world, 40);

        expect(rider.drivenOffUntil).toBe(60);
        expect(rider.carrying).toBe('');
        expect(world.state.items.get(cargo.id)).toBeUndefined();
        expect(rider.stationId).toBe('');
        expect(rider.workTile).toBe('');
        expect(rider.x).toBe(17.5);
        expect(rider.y).toBe(15.5);
        expect(rider.bubble).toBe(copy.bubbles.sawTheHighway);
        expect(rider.bubbleUntil).toBe(62);
        expect(world.tally.players.get('u1')?.truckRides).toBe(1);
    });
});

describe('the tailgate', () => {
    function filled(world: World, player: PlayerState, lastAt: number): void {
        jumpTo(world, 20);

        for (let i = 1; i <= 8; i++) {
            load(world, player, 'session-0', i === 8 ? lastAt : 20 + i);
        }
    }

    it('opens on the filling shove and never past the truck leaving', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        filled(world, player, 28);
        expect(mgOf(world).tailgateUntil).toBe(31);

        const late = started();
        const other = stand(late, 'session-0', LANE_A);

        filled(late, other, 38);
        expect(mgOf(late).tailgateUntil).toBe(40);
    });

    it('slams the truck out after a half-second hold', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        filled(world, player, 28);
        world.outbox.length = 0;
        tailgate(world, player, 28.5, 'down');
        jumpTo(world, 29);

        expect(world.state.truck.phase).toBe('leaving');
        expect(world.state.orders.get('o-1')?.status).toBe('complete');
        expect(world.state.banner).toBe('TAILGATE');
        expect(world.state.bannerUntil).toBe(31);
        expect(effects(world)).toEqual([
            { kind: 'slam', text: 'SLAM' },
            { kind: 'horn', text: 'HONK HONK' },
        ]);
        expect(toasts(world)).toEqual([{ text: 'TRUCK OUT 8/8 — 180', kind: 'good' }]);
    });

    it('keeps the next truck on the timetable after a slam', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        filled(world, player, 28);
        tailgate(world, player, 28.5, 'down');
        jumpTo(world, 29);
        jumpTo(world, 30.5);

        expect(world.state.truck.phase).toBe('away');
        expect(world.state.truck.id).toBe(2);
        expect(world.state.truck.arrivesAt).toBe(80);
    });

    it('ignores a hold begun before the window opened', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        jumpTo(world, 20);
        tailgate(world, player, 21, 'down');
        filled(world, player, 28);
        jumpTo(world, 29);

        expect(world.state.truck.phase).toBe('docked');
    });

    it('ignores a hold released early or walked away from', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        filled(world, player, 28);
        tailgate(world, player, 28.5, 'down');
        tailgate(world, player, 28.8, 'up');
        jumpTo(world, 29.1);
        expect(world.state.truck.phase).toBe('docked');

        tailgate(world, player, 29.2, 'down');
        stand(world, 'session-0', [22, 4]);
        jumpTo(world, 29.8);
        expect(world.state.truck.phase).toBe('docked');

        jumpTo(world, 40);
        expect(world.state.truck.phase).toBe('leaving');
    });

    it('swallows E while the window is open', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        filled(world, player, 28);

        const stick = carry(world, 'session-0', orderFuse(world, 'o-1'));

        world.outbox.length = 0;

        expect(stationsInteract(world, player)).toBe(true);
        expect(player.carrying).toBe(stick.id);
        expect(effects(world)).toEqual([]);
    });
});

describe('the whistle', () => {
    it('ships a docked truck for partial credit with no horn', () => {
        const world = started();
        const player = stand(world, 'session-0', LANE_A);

        jumpTo(world, 20);
        load(world, player, 'session-0', 23);
        world.outbox.length = 0;

        dockSystem.onDayEnd?.(world, 'ended', 'clock');

        expect(world.state.orders.get('o-1')?.status).toBe('partial');
        expect(world.state.truck.phase).toBe('leaving');
        expect(effects(world)).toEqual([]);
        expect(toasts(world)).toEqual([{ text: 'TRUCK LEFT WITH 1/8 — 10', kind: 'warn' }]);
    });

    it('leaves an away truck alone', () => {
        const world = started();

        closeShift(world);

        expect(world.state.truck.phase).toBe('away');
        expect(world.state.orders.get('o-1')?.status).toBe('open');
    });
});

describe('sandbox', () => {
    it('keeps the trucks coming and mints each order as its truck is armed', () => {
        const world = started({ level: sandboxLevel(makeWorld().level) });

        expect(world.state.orders.size).toBe(1);

        jumpTo(world, 20);
        jumpTo(world, 40);
        jumpTo(world, 41.5);

        expect(world.state.truck.phase).toBe('away');
        expect(world.state.truck.id).toBe(2);
        expect(world.state.orders.size).toBe(2);
        expect(world.state.orders.get('o-2')?.status).toBe('open');
        expect(world.state.bookRemaining).toBe(0);
        expect(world.endRequested).toBeNull();
    });
});
