import { describe, expect, it } from 'vitest';

import { levelFixture } from '../../shared/tests/fixtures/index';
import { scaleLevel } from '../src/shared';
import type {
    LevelConfig,
    PlayerState,
    ReportPayload,
    RunPayload,
    StationState,
} from '../src/shared';
import { buildReport, isSandbox, reportSystem } from '../src/sim/day';
import { damageStation } from '../src/sim/hazardsApply';
import { createItem, shelfPush } from '../src/sim/items';
import { ROLLING_WINDOW_TICKS, metricsTick, snapshotMetrics } from '../src/sim/metrics';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The report card (contracts §9, §10.7). Every figure is read back out of a
 * scripted shift, because the payload is the only thing that survives the day:
 * Laravel stores it verbatim and never recomputes a number.
 */

const TICK = 0.05;
const SECOND = 20;

/** Contracts §12: F11 fills the payload, so its key set is part of the contract. */
const REPORT_KEYS = [
    'avgCycleSeconds',
    'bottleneck',
    'day',
    'defects',
    'fizzles',
    'fusesStomped',
    'grade',
    'kegsExploded',
    'kegsMade',
    'kegsUsed',
    'levelKey',
    'materials',
    'niceSaves',
    'ordersCompleted',
    'ordersTotal',
    'peakWip',
    'players',
    'pnl',
    'rework',
    'score',
    'stations',
    'throughput',
    'truckRides',
    'verdict',
    'wipTimeline',
];

function started(players = 1): World {
    const world = makeWorld({ players });

    world.startDay(scaleLevel(world.level, 3));

    return world;
}

function sandboxLevel(): LevelConfig {
    const level = levelFixture();

    level.day = { ...level.day, shiftSeconds: 0, orderBook: 0, endsOn: 'never' };
    level.players = { min: 1, max: 6 };

    return level;
}

/** The sampler only ever sees a finished tick, so the tests move the clock themselves. */
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

/** Puts the player on a work tile of the station, the way F05's join would. */
function atWork(world: World, sessionId: string, stationId: string): PlayerState {
    const player = playerOf(world, sessionId);

    player.stationId = stationId;
    player.workTile = '5,4';

    return player;
}

function ship(world: World, orderId: string, shipped: number, complete: boolean): void {
    const order = world.state.orders.get(orderId);

    if (order === undefined) throw new Error(`no order ${orderId}`);

    order.shipped = shipped;
    order.status = complete ? 'complete' : 'partial';
}

describe('buildReport — shape', () => {
    it('builds a report with every ReportPayload key and type', () => {
        const world = started(1);

        stationOf(world, 'powder-a').state = 'working';
        atWork(world, 'session-0', 'powder-a');
        world.tally.bump('kegsMade');
        run(world, 2 * SECOND);

        const report = buildReport(world, 'clock');

        expect(Object.keys(report).sort()).toEqual(REPORT_KEYS);
        expect(report).toMatchObject({
            day: world.state.day,
            levelKey: world.state.levelKey,
            grade: expect.stringMatching(/^[ABCDF]$/) as unknown as string,
            rework: 0,
        });
        expect(typeof report.score).toBe('number');
        expect(report.wipTimeline).toEqual([0, 0, 0]);
        expect(report.stations).toHaveLength(world.level.stations.length);
        expect(report.players).toHaveLength(1);
        expect(report.bottleneck).toMatchObject({
            stationId: expect.any(String) as unknown as string,
            starvedSeconds: expect.any(Number) as unknown as number,
            blockedSeconds: expect.any(Number) as unknown as number,
        });
    });

    it('reports whole-shift station utilization in level order', () => {
        const world = started();

        stationOf(world, 'powder-a').state = 'working';
        run(world, SECOND);
        stationOf(world, 'powder-a').state = 'idle';
        run(world, SECOND);

        expect(buildReport(world, 'clock').stations).toEqual([
            { id: 'powder-a', utilization: 0.5 },
            { id: 'assembly-a', utilization: 0 },
            { id: 'dock-a', utilization: 0 },
        ]);
    });

    it('divides whole-shift utilization by the whole shift, not the rolling window', () => {
        const world = started();

        stationOf(world, 'powder-a').state = 'working';
        run(world, ROLLING_WINDOW_TICKS);
        stationOf(world, 'powder-a').state = 'idle';
        run(world, ROLLING_WINDOW_TICKS);

        // The rolling window has rolled past every busy tick, so the two figures
        // only agree on a shift shorter than the window.
        expect(stationOf(world, 'powder-a').utilization).toBe(0);
        expect(buildReport(world, 'clock').stations[0]?.utilization).toBe(0.5);
    });
});

describe('buildReport — bottleneck', () => {
    it('picks the bottleneck and reports its starved and blocked seconds', () => {
        const world = started();
        const assembly = stationOf(world, 'assembly-a');

        assembly.inputShelf.push('k-1', 'k-2', 'k-3', 'k-4');
        assembly.state = 'working';
        stationOf(world, 'powder-a').state = 'starved';
        run(world, SECOND);

        assembly.state = 'jammed';
        run(world, SECOND);

        expect(buildReport(world, 'clock').bottleneck).toEqual({
            stationId: 'assembly-a',
            starvedSeconds: 0,
            blockedSeconds: 1,
        });
    });

    it('never blames the busiest station when it has no input shelf to fill', () => {
        const world = started();
        const assembly = stationOf(world, 'assembly-a');

        assembly.inputShelf.push('k-1', 'k-2');
        assembly.state = 'working';
        stationOf(world, 'powder-a').state = 'working';
        run(world, SECOND);

        assembly.state = 'idle';
        run(world, SECOND);

        const report = buildReport(world, 'clock');

        expect(report.stations[0]).toEqual({ id: 'powder-a', utilization: 1 });
        expect(report.bottleneck.stationId).toBe('assembly-a');
    });
});

describe('buildReport — players', () => {
    it('sorts players by utilization then first seen', () => {
        const world = started(2);

        stationOf(world, 'powder-a').state = 'working';
        atWork(world, 'session-0', 'powder-a');
        run(world, SECOND);

        world.addPlayer('session-2', { userId: 'u2', name: 'Player 2', factoryId: '7' });
        run(world, SECOND);

        const { players } = buildReport(world, 'clock');

        expect(players.map((p) => p.userId)).toEqual(['u0', 'u1', 'u2']);
        expect(players[0]).toMatchObject({
            name: 'Player 0',
            utilization: 1,
            label: 'EXCELLENT',
            topStation: 'powder-a',
        });
        expect(players[1]).toMatchObject({ utilization: 0, label: 'NEEDS FOCUS', topStation: '' });
    });

    it('sums per-player stomps, saves and rides into the totals', () => {
        const world = started(2);

        run(world, SECOND);
        world.tally.bumpPlayer('u0', 'fusesStomped');
        world.tally.bumpPlayer('u1', 'fusesStomped');
        world.tally.bumpPlayer('u1', 'niceSaves');
        world.tally.bumpPlayer('u0', 'truckRides');
        world.tally.bumpPlayer('u0', 'bubbles');
        world.tally.bumpPlayer('u1', 'drops');
        world.tally.bumpPlayer('u1', 'sooted');

        const report = buildReport(world, 'clock');

        expect(report).toMatchObject({ fusesStomped: 2, niceSaves: 1, truckRides: 1 });
        expect(report.players[0]).toMatchObject({
            userId: 'u0',
            bubbles: 1,
            drops: 0,
            sooted: 0,
            fusesStomped: 1,
            niceSaves: 0,
            truckRides: 1,
        });
        expect(report.players[1]).toMatchObject({
            userId: 'u1',
            bubbles: 0,
            drops: 1,
            sooted: 1,
            fusesStomped: 1,
            niceSaves: 1,
            truckRides: 0,
        });
    });

    it('keeps a player who left mid-shift on the report', () => {
        const world = started(2);

        run(world, SECOND);
        world.removePlayer('session-1');
        run(world, SECOND);

        expect(buildReport(world, 'clock').players.map((p) => p.userId)).toContain('u1');
    });
});

describe('buildReport — tallies', () => {
    it('derives kegsExploded and fizzles from the destroyed counts', () => {
        const world = started();

        world.tally.destroyed('keg', 'blast');
        world.tally.destroyed('keg', 'blast');
        world.tally.destroyed('stick', 'fizzle');
        world.tally.bump('kegsMade');
        world.tally.bump('kegsUsed');
        world.tally.bump('defects');

        expect(buildReport(world, 'clock')).toMatchObject({
            kegsExploded: 2,
            fizzles: 1,
            kegsMade: 1,
            kegsUsed: 1,
            defects: 1,
        });
    });

    it('reports materials purchased as kegs made and shipped as sticks that left', () => {
        const world = started();

        world.tally.bump('kegsMade');
        world.tally.bump('kegsMade');
        world.tally.bump('kegsMade');
        world.tally.bump('kegsMade');
        ship(world, 'o-1', 5, true);
        ship(world, 'o-2', 2, false);

        expect(buildReport(world, 'clock').materials).toEqual({ purchased: 4, shipped: 7 });
    });
});

describe('buildReport — profit and loss', () => {
    it('charges waste for at-close and destroyed items and omits parts', () => {
        const world = started();

        createItem(world, 'keg');
        createItem(world, 'keg');
        createItem(world, 'casing');
        createItem(world, 'parts');
        world.tally.destroyed('stick', 'fizzle');

        // 2 kegs × 4 + 1 casing × 2 + 1 fizzled stick × 6; the parts cost nothing.
        expect(buildReport(world, 'clock').pnl.waste).toBe(16);
    });

    it('bills a type the level prices, parts included', () => {
        const level = levelFixture();
        level.economy = {
            ...level.economy,
            wasteCost: { ...level.economy.wasteCost, parts: 3 },
        };

        const world = makeWorld({ level, players: 1 });
        world.startDay(scaleLevel(world.level, 3));

        createItem(world, 'parts');
        createItem(world, 'parts');

        expect(buildReport(world, 'clock').pnl.waste).toBe(6);
    });

    it('charges waste for scrapped material without touching the hazard lines', () => {
        const world = started();

        world.tally.scrap('keg');
        world.tally.scrap('casing');
        world.tally.scrap('parts');

        const report = buildReport(world, 'clock');

        // 1 keg × 4 + 1 casing × 2; the parts cost nothing. Scrap is material
        // lost, not an explosion and not a fizzle, so neither line moves.
        expect(report.pnl.waste).toBe(6);
        expect(report).toMatchObject({ kegsExploded: 0, fizzles: 0 });
    });

    it('still charges for the stock an incident scrapped off a shelf', () => {
        const world = started();
        const station = world.state.stations.get('assembly-a');

        if (station === undefined) throw new Error('no assembly-a');

        for (let i = 0; i < 4; i++) {
            expect(shelfPush(world, station, 'out', createItem(world, 'stick'))).toBe(true);
        }

        expect(buildReport(world, 'clock').pnl.waste).toBe(24);

        damageStation(world, 'assembly-a');

        const report = buildReport(world, 'clock');

        // The incident vaporised the shelf; it must not also refund it, or the
        // crew is better off blowing stock up than keeping it to the whistle.
        expect(report.pnl.waste).toBe(24);
        expect(report).toMatchObject({ fizzles: 0, kegsExploded: 0 });
    });

    it('never price-checks a product nobody shipped', () => {
        const world = started();
        const order = world.state.orders.get('o-1');

        if (order === undefined) throw new Error('no order o-1');

        // M3's products reach the book before every level file prices them; an
        // order that shipped nothing must not take the whole report down.
        order.product = 'mega_boom';

        expect(buildReport(world, 'clock').pnl).toMatchObject({ revenue: 0, waste: 0 });
    });

    it('prices sticks on a docked truck as shipped but not complete', () => {
        const world = started();

        ship(world, 'o-1', 3, false);
        world.state.truck.phase = 'docked';

        expect(buildReport(world, 'clock')).toMatchObject({
            ordersCompleted: 0,
            pnl: expect.objectContaining({ revenue: 30 }) as unknown as object,
        });
    });

    it('zeroes the multiplier and the coin for an exploded day', () => {
        const world = started();

        ship(world, 'o-1', 8, true);

        const report = buildReport(world, 'exploded');

        expect(report).toMatchObject({ grade: 'F', verdict: 'EXPLODED' });
        expect(report.pnl).toMatchObject({ revenue: 80, multiplier: 0, coin: 0 });
    });

    it('zeroes the multiplier and the coin for an abandoned day', () => {
        const world = started();

        ship(world, 'o-1', 8, true);

        const report = buildReport(world, 'abandoned');

        expect(report.verdict).not.toBe('EXPLODED');
        expect(report.pnl).toMatchObject({ revenue: 80, multiplier: 0, coin: 0 });
    });

    it('pays the coin at the grade multiplier on a clean day', () => {
        const world = started();

        world.state.orders.forEach((order) => {
            order.shipped = order.qty;
            order.status = 'complete';
        });

        const report = buildReport(world, 'book');
        const { multiplier } = world.level.grading;

        expect(report.pnl.multiplier).toBe(multiplier[report.grade]);
        expect(report.pnl.coin).toBe(Math.round(report.pnl.profit * report.pnl.multiplier));
    });
});

describe('buildReport — throughput', () => {
    it('computes throughput per ten minutes of shift played', () => {
        const world = started();

        for (let i = 1; i <= 5; i++) ship(world, `o-${i}`, 8, true);

        world.state.clock = 300;

        expect(buildReport(world, 'clock').throughput).toBe(10);
    });

    it('pays the early-finish bonus when the book closes before the clock', () => {
        const world = started();

        world.state.orders.forEach((order) => {
            order.status = 'complete';
        });
        world.state.clock = 100;

        const { earlyFinishBonusPerMinute, earlyFinishCap } = world.level.day;
        const bonus = Math.min(earlyFinishCap, earlyFinishBonusPerMinute * 8);

        expect(buildReport(world, 'book').score - buildReport(world, 'clock').score).toBe(bonus);
    });

    it('averages cycle time over completed orders only', () => {
        const world = started();

        // The timings are sampled once a second, so the cycle runs from the
        // second the first item was bound to the second the order settled.
        createItem(world, 'casing', { orderId: 'o-1' });
        createItem(world, 'casing', { orderId: 'o-2' });
        run(world, SECOND);
        run(world, 2 * SECOND);
        ship(world, 'o-1', 8, true);
        run(world, SECOND);

        expect(snapshotMetrics(world).orders.get('o-1')).toEqual({ startedAt: 1, completedAt: 4 });
        expect(buildReport(world, 'clock').avgCycleSeconds).toBe(3);
    });

    it('counts the order the whistle settled in the mean it belongs to', () => {
        const world = started();
        const order = world.state.orders.get('o-1');

        if (order === undefined) throw new Error('no order o-1');

        createItem(world, 'casing', { orderId: order.id });
        run(world, 4 * SECOND);

        // The truck is still at the door: `closeShift` sends it out and settles
        // the order after the last per-second sample of the shift has run.
        const { truck } = world.state;
        truck.phase = 'docked';
        truck.loaded = order.qty;

        world.requestEnd('ended', 'clock');
        world.tick(0);

        const report = world.report;

        if (report === null) throw new Error('no report');

        expect(order.status).toBe('complete');
        expect(report.ordersCompleted).toBe(1);
        expect(report.avgCycleSeconds).toBe(3);
    });
});

describe('buildReport — the Laravel run payload', () => {
    it('satisfies the columns StoreRunRequest validates', () => {
        const world = started(1);

        run(world, SECOND);
        ship(world, 'o-1', 8, true);

        const run_: RunPayload = {
            ...buildReport(world, 'clock'),
            factoryId: String(world.factory.id),
            seed: world.seed,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            status: 'ended',
        };

        expect(Number.isInteger(Number(run_.factoryId))).toBe(true);
        expect(run_.levelKey).toBe(world.level.key);
        expect(Number.isInteger(run_.day) && run_.day >= 1).toBe(true);
        expect(Number.isInteger(run_.seed)).toBe(true);
        expect(Number.isFinite(run_.score)).toBe(true);
        expect(Number.isInteger(run_.pnl.profit)).toBe(true);
        expect(Number.isInteger(run_.pnl.coin) && run_.pnl.coin >= 0).toBe(true);
        expect(Array.isArray(run_.players)).toBe(true);

        for (const player of run_.players) {
            expect(typeof player.userId).toBe('string');
            expect(typeof player.name).toBe('string');
            expect(Number.isFinite(player.utilization)).toBe(true);
            expect(typeof player.label).toBe('string');
        }
    });
});

describe('reportSystem', () => {
    it('resets the tally and metrics on onStart', () => {
        const world = started();

        world.tally.bump('kegsMade');
        world.tally.bumpPlayer('u0', 'drops');
        run(world, SECOND);

        reportSystem.onStart?.(world);

        expect(world.tally.counts.kegsMade).toBe(0);
        expect(world.tally.players.size).toBe(0);
        expect(snapshotMetrics(world)).toMatchObject({ ticks: 0, wipTimeline: [0] });
    });

    it('sets the report from the reason the day ended with', () => {
        const world = started();

        run(world, SECOND);
        reportSystem.onDayEnd?.(world, 'ended', 'book');

        const report = world.report as ReportPayload;

        expect(report).not.toBeNull();
        expect(report).toEqual(buildReport(world, 'book'));
    });

    it('sets no report on a sandbox level', () => {
        const world = makeWorld({ level: sandboxLevel(), players: 1 });

        world.startDay(scaleLevel(world.level, 1));
        run(world, SECOND);

        expect(isSandbox(world)).toBe(true);

        reportSystem.onDayEnd?.(world, 'abandoned', 'abandoned');

        expect(world.report).toBeNull();
    });

    it('is not a sandbox when the day ends on the clock or the book', () => {
        expect(isSandbox(started())).toBe(false);
    });
});
