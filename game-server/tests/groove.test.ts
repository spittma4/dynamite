import { describe, expect, it } from 'vitest';

import { FuseState, grooveDelta, scaleLevel } from '../src/shared';
import type { GrooveEvents, GrooveSample, ItemState, ScaledLevel, Tile } from '../src/shared';
import { cleanSweepCount, grooveSystem } from '../src/sim/groove';
import { createItem, placeOnFloor, shelfPush } from '../src/sim/items';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The Groove bar (contracts §10.7, docs/05). The system is the only writer of
 * `state.groove`, so every assertion here is about what the floor looked like
 * on the tick rather than about who shouted loudest.
 */

const TICK = 0.05;
const QUIET: GrooveEvents = {
    fizzles: 0,
    niceSaves: 0,
    blastKegs: 0,
    primeSticks: 0,
    trucksComplete: 0,
};

function started(): World {
    const world = makeWorld({ players: 1 });

    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

    return world;
}

/** The delta tests are about the sample, not the sweep, so the hold never elapses. */
function noSweep(world: World): World {
    world.level.groove.cleanSweep.holdSeconds = Number.MAX_SAFE_INTEGER;

    return world;
}

function tickAt(world: World, clock: number): void {
    world.state.clock = clock;
    world.reindexItems();
    grooveSystem.tick?.(world, TICK);
}

function freeTiles(world: World, count: number): Tile[] {
    const tiles: Tile[] = [];

    for (let ty = 1; ty < world.state.height && tiles.length < count; ty++) {
        for (let tx = 1; tx < world.state.width && tiles.length < count; tx++) {
            if (!world.isWall(tx, ty) && world.itemsAt(tx, ty).length === 0) tiles.push([tx, ty]);
        }
    }

    return tiles;
}

function onFloor(world: World, count: number): void {
    for (const tile of freeTiles(world, count)) {
        placeOnFloor(world, createItem(world, 'keg'), tile);
    }
}

function onShelf(world: World, stationId: string, side: 'in' | 'out', count: number): void {
    const station = world.state.stations.get(stationId);

    if (station === undefined) throw new Error(`no station ${stationId}`);

    const type = stationId === 'assembly-a' && side === 'out' ? 'stick' : 'keg';

    for (let i = 0; i < count; i++) {
        const item: ItemState = createItem(world, type);

        if (!shelfPush(world, station, side, item)) throw new Error(`${stationId} ${side} refused`);
    }
}

function light(world: World, count: number): void {
    for (let i = 0; i < count; i++) {
        const fuse = new FuseState();

        fuse.itemId = `k-fuse-${i}`;
        world.state.fuses.set(fuse.itemId, fuse);
    }
}

function stationState(world: World, id: string, value: string): void {
    const station = world.state.stations.get(id);

    if (station === undefined) throw new Error(`no station ${id}`);

    station.state = value;
}

function expected(sample: GrooveSample, world: World, events: GrooveEvents = QUIET): number {
    return grooveDelta(world.level.groove.weights, sample, events, TICK);
}

describe('grooveSystem', () => {
    it('builds the sample from floor items, shelves, starved and jammed stations and lit fuses', () => {
        const world = noSweep(started());

        onFloor(world, 3);
        onShelf(world, 'powder-a', 'out', 3);
        onShelf(world, 'assembly-a', 'in', 4);
        onShelf(world, 'assembly-a', 'out', 1);
        stationState(world, 'powder-a', 'starved');
        stationState(world, 'assembly-a', 'jammed');
        light(world, 2);
        world.state.groove = 50;

        tickAt(world, 1);

        const sample: GrooveSample = {
            onTimeShipRate: 0,
            avgShelfFullness: (0.5 + 0.5 + 0.25) / 3,
            floorItemCount: 3,
            reworkShelfCount: 0,
            starvedStationCount: 1,
            jammedStationCount: 1,
            litFuseCount: 2,
        };

        expect(world.state.groove).toBeCloseTo(50 + expected(sample, world), 8);
    });

    it('reports an on-time ship rate of zero when no truck departed in the window', () => {
        const world = noSweep(started());
        const order = world.state.orders.get('o-1');

        if (order === undefined) throw new Error('no order o-1');

        order.status = 'complete';
        world.state.groove = 50;

        tickAt(world, 1);

        expect(world.state.groove).toBe(50);
    });

    it('divides completions by departures inside the sixty-second window', () => {
        const world = noSweep(started());
        const order = world.state.orders.get('o-1');

        if (order === undefined) throw new Error('no order o-1');

        world.state.truck.phase = 'docked';
        tickAt(world, 10);
        world.state.truck.phase = 'leaving';
        tickAt(world, 11);
        world.state.truck.phase = 'docked';
        tickAt(world, 12);
        world.state.truck.phase = 'away';
        tickAt(world, 13);

        order.status = 'complete';
        world.state.groove = 50;
        tickAt(world, 14);

        const half: GrooveSample = {
            onTimeShipRate: 0.5,
            avgShelfFullness: 0,
            floorItemCount: 0,
            reworkShelfCount: 0,
            starvedStationCount: 0,
            jammedStationCount: 0,
            litFuseCount: 0,
        };

        expect(world.state.groove).toBeCloseTo(50 + expected(half, world), 8);

        // Both departures and the completion fall out of the sixty-second window.
        world.state.groove = 50;
        tickAt(world, 80);

        expect(world.state.groove).toBe(50);
    });

    it('applies the delta to state.groove and clamps at the ends', () => {
        const world = noSweep(started());

        world.state.groove = 5;
        world.grooveEvents.blastKegs = 20;
        tickAt(world, 1);

        expect(world.state.groove).toBe(0);

        world.state.groove = 95;
        world.grooveEvents.niceSaves = 20;
        tickAt(world, 2);

        expect(world.state.groove).toBe(100);
    });

    it('zeroes grooveEvents after every tick', () => {
        const world = noSweep(started());

        world.state.groove = 50;
        Object.assign(world.grooveEvents, {
            fizzles: 1,
            niceSaves: 1,
            blastKegs: 0,
            primeSticks: 2,
            trucksComplete: 1,
        });

        tickAt(world, 1);

        expect(world.grooveEvents).toEqual(QUIET);
        // −2 fizzle + 3 nice save + 2 prime sticks + 10 truck complete.
        expect(world.state.groove).toBeCloseTo(63, 8);

        tickAt(world, 2);

        expect(world.state.groove).toBeCloseTo(63, 8);
    });

    it('fires a clean sweep after the hold and snaps groove up to snapTo', () => {
        const world = started();

        world.state.groove = 20;
        tickAt(world, 0);

        expect(world.state.groove).toBe(20);

        tickAt(world, 3);

        expect(world.state.groove).toBe(60);
        expect(cleanSweepCount(world)).toBe(1);
    });

    it('raises the CLEAN SWEEP banner for hazards.bannerSeconds', () => {
        const world = started();

        tickAt(world, 0);
        tickAt(world, 3);

        expect(world.state.banner).toBe('CLEAN SWEEP');
        expect(world.state.bannerUntil).toBe(6);
    });

    it('does not fire again inside the cooldown', () => {
        const world = started();

        tickAt(world, 0);
        tickAt(world, 3);

        world.state.groove = 10;
        tickAt(world, 10);

        expect(world.state.groove).toBe(10);
        expect(cleanSweepCount(world)).toBe(1);

        tickAt(world, 93);

        expect(world.state.groove).toBe(60);
        expect(cleanSweepCount(world)).toBe(2);
    });

    it('leaves a live banner from another system alone', () => {
        const world = started();

        world.state.banner = 'WHOOPS';
        world.state.bannerUntil = 100;
        tickAt(world, 0);
        tickAt(world, 3);

        expect(world.state.banner).toBe('WHOOPS');
        expect(world.state.bannerUntil).toBe(100);
        expect(world.state.groove).toBe(60);
    });

    it('holds the sweep off while the floor is still dirty', () => {
        const world = started();

        onFloor(world, 1);
        world.state.groove = 20;
        tickAt(world, 0);
        tickAt(world, 3);

        expect(cleanSweepCount(world)).toBe(0);
        expect(world.state.banner).toBe('');
    });
});
