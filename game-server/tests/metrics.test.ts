import { describe, expect, it } from 'vitest';

import { gradeDay, scaleLevel } from '../src/shared';
import type { PlayerState, ScaledLevel, StationState } from '../src/shared';
import { reportSystem } from '../src/sim/day';
import { grooveSystem } from '../src/sim/groove';
import { createItem } from '../src/sim/items';
import {
    ROLLING_WINDOW_TICKS,
    createMetrics,
    gradeInputsFor,
    metricsTick,
    snapshotMetrics,
} from '../src/sim/metrics';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The instrument panel (contracts §10.7). Everything here is sampled from a
 * finished tick, so the tests script the schema the other systems would have
 * written and then ask what the panel made of it.
 */

const TICK = 0.05;
const SECOND = 20;

function started(players = 1): World {
    const world = makeWorld({ players });

    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);
    createMetrics(world);

    return world;
}

/** `World.tick` accumulates the same 0.05; the rounding only keeps whole seconds whole. */
function run(world: World, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        world.state.clock = Number((world.state.clock + TICK).toFixed(4));
        metricsTick(world, TICK);
    }
}

function stationOf(world: World, id: string): StationState {
    const station = world.state.stations.get(id);

    if (station === undefined) throw new Error(`no station ${id}`);

    return station;
}

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function metricsOf(world: World, id: string): { workingTicks: number; totalTicks: number } {
    const station = snapshotMetrics(world).stations.get(id);

    if (station === undefined) throw new Error(`no station metrics ${id}`);

    return station;
}

/** Puts the player on a work tile of the station, the way F05's join would. */
function atWork(world: World, sessionId: string, stationId: string): PlayerState {
    const player = playerOf(world, sessionId);

    player.stationId = stationId;
    player.workTile = '5,4';

    return player;
}

describe('metricsTick — stations', () => {
    it('counts working ticks into whole-shift station utilization', () => {
        const world = started();
        const station = stationOf(world, 'powder-a');

        station.state = 'working';
        run(world, 10);
        station.state = 'idle';
        run(world, 10);

        expect(metricsOf(world, 'powder-a')).toMatchObject({ workingTicks: 10, totalTicks: 20 });
    });

    it('writes rolling utilization to StationState.utilization every 20 ticks', () => {
        const world = started();
        const station = stationOf(world, 'powder-a');

        station.state = 'working';
        run(world, 10);

        expect(station.utilization).toBe(0);

        station.state = 'idle';
        run(world, 10);

        expect(station.utilization).toBe(0.5);
    });

    it('uses the tick count as the denominator before the window is full', () => {
        const world = started();
        const station = stationOf(world, 'powder-a');

        station.state = 'working';
        run(world, 10);
        station.state = 'idle';
        run(world, 30);

        expect(metricsOf(world, 'powder-a').totalTicks).toBeLessThan(ROLLING_WINDOW_TICKS);
        expect(station.utilization).toBe(0.25);
    });

    it('accumulates starved seconds and blocked seconds separately', () => {
        const world = started();
        const station = stationOf(world, 'assembly-a');

        station.state = 'starved';
        run(world, 20);
        station.state = 'jammed';
        run(world, 40);

        const metrics = snapshotMetrics(world).stations.get('assembly-a');

        expect(metrics?.starvedSeconds).toBeCloseTo(1, 8);
        expect(metrics?.blockedSeconds).toBeCloseTo(2, 8);
    });

    it('ignores damaged ticks for both', () => {
        const world = started();
        const station = stationOf(world, 'assembly-a');

        station.state = 'damaged';
        run(world, 40);

        const metrics = snapshotMetrics(world).stations.get('assembly-a');

        expect(metrics?.starvedSeconds).toBe(0);
        expect(metrics?.blockedSeconds).toBe(0);
        expect(metrics?.workingTicks).toBe(0);
    });
});

describe('metricsTick — the once-a-second sample', () => {
    it('samples WIP once per second and records the peak', () => {
        const world = started();

        createItem(world, 'keg');
        createItem(world, 'keg');
        createItem(world, 'keg');
        run(world, SECOND);

        expect(snapshotMetrics(world).wipTimeline).toEqual([0, 3]);

        world.state.items.delete('k-1');
        run(world, SECOND);

        expect(snapshotMetrics(world).wipTimeline).toEqual([0, 3, 2]);
        expect(gradeInputsFor(world, null).peakWip).toBe(3);
    });

    it('records order start on the first item bound to the order', () => {
        const world = started();

        run(world, SECOND);

        expect(snapshotMetrics(world).orders.get('o-1')).toEqual({
            startedAt: null,
            completedAt: null,
        });

        createItem(world, 'keg', { orderId: 'o-1' });
        run(world, SECOND);

        expect(snapshotMetrics(world).orders.get('o-1')?.startedAt).toBe(2);
    });

    it('records order completion when the status becomes complete', () => {
        const world = started();
        const order = world.state.orders.get('o-1');

        if (order === undefined) throw new Error('no order o-1');

        createItem(world, 'keg', { orderId: 'o-1' });
        run(world, SECOND);
        order.status = 'complete';
        run(world, SECOND);

        expect(snapshotMetrics(world).orders.get('o-1')).toEqual({ startedAt: 1, completedAt: 2 });
    });

    it('averages cycle time over completed orders only', () => {
        const world = started();
        const first = world.state.orders.get('o-1');
        const second = world.state.orders.get('o-2');

        if (first === undefined || second === undefined) throw new Error('no orders');

        expect(gradeInputsFor(world, null).avgCycleSeconds).toBe(0);

        createItem(world, 'keg', { orderId: 'o-1' });
        createItem(world, 'keg', { orderId: 'o-2' });
        run(world, SECOND * 2);
        first.status = 'complete';
        run(world, SECOND);

        expect(snapshotMetrics(world).orders.get('o-2')?.completedAt).toBeNull();
        expect(gradeInputsFor(world, null).avgCycleSeconds).toBe(2);
    });
});

describe('metricsTick — players', () => {
    it('attributes player seconds per station only while on a work tile', () => {
        const world = started();
        const player = atWork(world, 'session-0', 'powder-a');

        run(world, SECOND);
        player.stationId = '';
        player.workTile = '';
        run(world, SECOND);

        const metrics = snapshotMetrics(world).players.get('u0');

        expect(metrics?.secondsAtStation).toEqual({ 'powder-a': expect.closeTo(1, 8) });
        expect(metrics?.presentSeconds).toBeCloseTo(2, 8);
    });

    it('computes player utilization as working over present seconds', () => {
        const world = started();
        const station = stationOf(world, 'powder-a');

        atWork(world, 'session-0', 'powder-a');
        station.state = 'working';
        run(world, SECOND);
        station.state = 'starved';
        run(world, SECOND);

        const metrics = snapshotMetrics(world).players.get('u0');

        expect(metrics?.workingSeconds).toBeCloseTo(1, 8);
        expect(playerOf(world, 'session-0').utilization).toBeCloseTo(0.5, 8);
    });

    it('keeps a player who left mid-shift', () => {
        const world = started(2);

        run(world, SECOND);
        world.removePlayer('session-1');
        run(world, SECOND);

        const left = snapshotMetrics(world).players.get('u1');

        expect(left?.name).toBe('Player 1');
        expect(left?.presentSeconds).toBeCloseTo(1, 8);
        expect(snapshotMetrics(world).players.get('u0')?.presentSeconds).toBeCloseTo(2, 8);
    });

    it('writes PlayerState.utilization once per second', () => {
        const world = started();
        const station = stationOf(world, 'powder-a');

        atWork(world, 'session-0', 'powder-a');
        station.state = 'working';
        run(world, 10);

        expect(playerOf(world, 'session-0').utilization).toBe(0);

        run(world, 10);

        expect(playerOf(world, 'session-0').utilization).toBe(1);
    });
});

describe('gradeInputsFor', () => {
    it('rewrites state.score once per second from gradeDay', () => {
        const world = started();
        const order = world.state.orders.get('o-1');

        if (order === undefined) throw new Error('no order o-1');

        order.status = 'complete';
        order.shipped = 8;
        run(world, 10);

        expect(world.state.score).toBe(0);

        run(world, 10);

        const { grading, day } = world.level;

        expect(world.state.score).toBe(gradeDay(gradeInputsFor(world, null), grading, day).score);
        expect(world.state.score).toBeGreaterThan(0);
    });

    it('passes book done and remaining seconds only for a book finish', () => {
        const world = started();

        run(world, SECOND * 2);

        expect(gradeInputsFor(world, 'book')).toMatchObject({
            bookDone: true,
            remainingSeconds: world.state.shiftSeconds - world.state.clock,
            exploded: false,
        });
        expect(gradeInputsFor(world, 'clock')).toMatchObject({
            bookDone: false,
            remainingSeconds: 0,
        });
        expect(gradeInputsFor(world, 'exploded').exploded).toBe(true);
    });

    it('counts the shift tallies and the groove system’s clean sweeps', () => {
        const world = started();

        world.tally.bump('incidents');
        world.tally.bumpPlayer('u0', 'niceSaves');
        world.tally.bumpPlayer('u1', 'niceSaves');
        grooveSystem.tick?.(world, TICK);
        world.state.clock = 3;
        grooveSystem.tick?.(world, TICK);
        run(world, SECOND);

        expect(gradeInputsFor(world, null)).toMatchObject({
            incidents: 1,
            niceSaves: 2,
            cleanSweeps: 1,
            complaints: 0,
        });
    });

    it('reads the book from the schema and the shipped count from the orders', () => {
        const world = started();
        const first = world.state.orders.get('o-1');
        const second = world.state.orders.get('o-2');

        if (first === undefined || second === undefined) throw new Error('no orders');

        first.status = 'complete';
        first.shipped = 8;
        second.shipped = 3;
        run(world, SECOND);

        expect(gradeInputsFor(world, null)).toMatchObject({
            ordersCompleted: 1,
            ordersTotal: world.state.bookTotal,
            shipped: 11,
        });
    });
});

describe('reportSystem — the sampler it drives', () => {
    it('resets the tally and the accumulators at the whistle', () => {
        const world = started();

        world.tally.bump('kegsMade');
        run(world, SECOND);

        expect(snapshotMetrics(world).ticks).toBe(SECOND);

        reportSystem.onStart?.(world);

        expect(world.tally.counts.kegsMade).toBe(0);
        expect(snapshotMetrics(world).ticks).toBe(0);
        expect(snapshotMetrics(world).wipTimeline).toEqual([0]);
    });

    it('refuses to sample a world that never saw the whistle', () => {
        const world = makeWorld({ players: 1 });

        expect(() => snapshotMetrics(world)).toThrow(/never created/);
        expect(() => metricsTick(world, TICK)).toThrow(/never created/);
    });

    it('ticks the sampler', () => {
        const world = started();

        stationOf(world, 'powder-a').state = 'working';
        reportSystem.tick?.(world, TICK);

        expect(metricsOf(world, 'powder-a')).toMatchObject({ workingTicks: 1, totalTicks: 1 });
    });
});
