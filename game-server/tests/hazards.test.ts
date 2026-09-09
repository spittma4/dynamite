import { describe, expect, it } from 'vitest';

import { copy, scaleLevel } from '../src/shared';
import type { ItemState, PlayerState, ScaledLevel, Tile, ToastMsg } from '../src/shared';
import {
    addSpill,
    createItem,
    giveToPlayer,
    onAction,
    placeOnFloor,
    shelfPush,
} from '../src/sim/items';
import {
    hazardsSystem,
    onItemLanded,
    resetHazards,
    spark,
    sparkRing,
    tickHazards,
    tryBeginRepair,
    tryBeginStomp,
} from '../src/sim/hazards';
import { buildReport } from '../src/sim/day';
import { damageStation } from '../src/sim/hazardsApply';
import { MESSAGE_HANDLERS } from '../src/rooms/handlers';
import { onInteract as stationJoin } from '../src/sim/stations';
import { SYSTEMS } from '../src/sim/systems';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * Fuel, sparks, fuses and the stomp (contracts §10.5, docs/16). The rule the
 * tests exist to hold: nothing here rolls a die of its own except the jam, so a
 * fuse is always something a player built and something a player can still put
 * out.
 */

const TICK = 0.05;

function started(opts: { players?: number } = {}): World {
    const world = makeWorld({ players: opts.players ?? 3 });

    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);
    world.outbox.length = 0;

    return world;
}

/** `tickHazards` alone, so a test reads hazard writes and not the whole factory. */
function step(world: World, seconds = TICK): void {
    world.state.clock += seconds;
    world.reindexPlayers();
    world.reindexItems();
    tickHazards(world, seconds);
}

function kegOn(world: World, t: Tile): ItemState {
    const keg = createItem(world, 'keg');

    expect(placeOnFloor(world, keg, t)).toBe(true);

    return keg;
}

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

function fxKinds(world: World): string[] {
    return world.outbox.flatMap((out) => (out.name === 'fx' ? [out.payload.kind] : []));
}

function toasts(world: World): ToastMsg[] {
    return world.outbox.flatMap((out) => (out.name === 'toast' ? [out.payload] : []));
}

/**
 * `day.ts` bills waste as what survived the shift plus `tally.destroyedByType`
 * plus `tally.wastedByType`, so anything destroyed without a tally of either
 * kind is silently refunded to the players.
 */
function wasteLedger(world: World): number {
    let count = world.state.items.size;

    for (const destroyed of Object.values(world.tally.destroyedByType)) count += destroyed;
    for (const scrapped of Object.values(world.tally.wastedByType)) count += scrapped;

    return count;
}

function fuseKeys(world: World): string[] {
    const keys: string[] = [];

    world.state.fuses.forEach((_fuse, key) => keys.push(key));

    return keys.sort();
}

describe('spark', () => {
    it('lights a six second fuse on a floor keg and says which act did it', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);

        expect(spark(world, 6, 5, 'slammerRedline')).toBe('lit');

        const fuse = world.state.fuses.get(keg.id);

        expect(fuse?.itemId).toBe(keg.id);
        expect(fuse?.x).toBe(6);
        expect(fuse?.y).toBe(5);
        expect(fuse?.secondsLeft).toBeCloseTo(6);
        expect(fuse?.chain).toBe(false);
        expect(keg.lit).toBe(true);
        expect(fxKinds(world)).toContain('fuse');
        expect(toasts(world)).toEqual([
            { text: copy.hazards.sparks.slammerRedline, kind: 'warn' },
        ]);
    });

    it('lights a tile fuse on a spill with no keg on it', () => {
        const world = started();

        addSpill(world, [3, 5]);

        expect(spark(world, 3, 5, 'fizzle')).toBe('lit');

        const key = `t-${world.packTile(3, 5)}`;
        const fuse = world.state.fuses.get(key);

        expect(fuseKeys(world)).toEqual([key]);
        expect(fuse?.itemId).toBe('');
        expect(fuse?.secondsLeft).toBeCloseTo(6);
    });

    it('lights nothing on a tile with no fuel but still shows the spark', () => {
        const world = started();

        expect(spark(world, 6, 5, 'jammed')).toBe('noFuel');
        expect(fuseKeys(world)).toEqual([]);
        expect(fxKinds(world)).toEqual(['spark']);
        expect(toasts(world)).toEqual([]);
    });

    it('never lights a keg sitting on a shelf', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');
        const keg = createItem(world, 'keg');

        if (station === undefined) throw new Error('no powder-a');

        expect(shelfPush(world, station, 'out', keg)).toBe(true);
        expect(spark(world, 7, 3, 'slammerRedline')).toBe('noFuel');
        expect(keg.lit).toBe(false);
    });

    it('does not relight a fuse that is already burning', () => {
        const world = started();

        kegOn(world, [6, 5]);

        expect(spark(world, 6, 5, 'slammerRedline')).toBe('lit');
        expect(spark(world, 6, 5, 'slammerRedline')).toBe('already');
        expect(fuseKeys(world)).toHaveLength(1);
    });

    it('lights nothing before the whistle', () => {
        const world = makeWorld({ players: 3 });

        kegOn(world, [6, 5]);

        expect(spark(world, 6, 5, 'slammerRedline')).toBe('inactive');
        expect(fuseKeys(world)).toEqual([]);
    });
});

describe('sparkRing', () => {
    it('picks the fullest tile in the station ring', () => {
        const world = started();

        kegOn(world, [7, 5]);

        const fuelled = kegOn(world, [3, 5]);

        addSpill(world, [3, 5]);

        expect(sparkRing(world, 'powder-a', 'slammerRedline')).toBe('lit');
        expect(fuseKeys(world)).toEqual([fuelled.id]);
    });

    it('breaks a tie by distance to the anchor', () => {
        const world = started();

        kegOn(world, [7, 5]);

        const nearer = kegOn(world, [4, 4]);

        expect(sparkRing(world, 'powder-a', 'slammerRedline')).toBe('lit');
        expect(fuseKeys(world)).toEqual([nearer.id]);
    });

    it('shows the spark on the ring tile nearest the anchor when nothing catches', () => {
        const world = started();

        expect(sparkRing(world, 'powder-a', 'slammerRedline')).toBe('noFuel');
        expect(fuseKeys(world)).toEqual([]);
        expect(world.outbox).toEqual([
            { to: 'all', name: 'fx', payload: { kind: 'spark', x: 4.5, y: 4.5 } },
        ]);
    });

    it('has no ring to spark on an unknown station', () => {
        const world = started();

        expect(sparkRing(world, 'powder-b', 'jammed')).toBe('noFuel');
    });

});

describe('tickHazards', () => {
    it('mirrors the burning fuses into state and counts them down', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        step(world, 1);

        expect(world.state.fuses.get(keg.id)?.secondsLeft).toBeCloseTo(5);
    });

    it('drops a fuse whose keg is gone and one whose spill was swept', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);

        addSpill(world, [3, 5]);
        spark(world, 6, 5, 'slammerRedline');
        spark(world, 3, 5, 'fizzle');
        expect(fuseKeys(world)).toHaveLength(2);

        world.state.items.delete(keg.id);
        world.state.spillTiles.splice(0, world.state.spillTiles.length);
        step(world);

        expect(fuseKeys(world)).toEqual([]);
    });

    it('keeps a carried keg fuse on the tile the carrier is standing on', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);

        player.carrying = keg.id;
        stand(world, 'session-0', [9, 8]);
        step(world);

        const fuse = world.state.fuses.get(keg.id);

        expect([fuse?.x, fuse?.y]).toEqual([9, 8]);
    });

    it('rolls a jam spark once per ten seconds of unbroken jam', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        world.level.hazards.sparks.jammedPer10s = 1;

        const first = kegOn(world, [6, 5]);
        const second = kegOn(world, [7, 5]);

        station.state = 'jammed';

        for (let i = 0; i < 199; i++) step(world);
        expect(fuseKeys(world)).toEqual([]);

        step(world);
        expect(fuseKeys(world)).toEqual([first.id]);

        // The picker only knows about fuel, so the second roll needs the first
        // keg out of the ring before it has anywhere new to land.
        world.state.items.delete(first.id);

        for (let i = 0; i < 200; i++) step(world);
        expect(fuseKeys(world)).toEqual([second.id]);
    });

    it('resets the jam accumulator when the machine is freed', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        world.level.hazards.sparks.jammedPer10s = 1;
        kegOn(world, [6, 5]);
        station.state = 'jammed';

        for (let i = 0; i < 199; i++) step(world);

        station.state = 'idle';
        step(world);
        station.state = 'jammed';

        for (let i = 0; i < 100; i++) step(world);
        expect(fuseKeys(world)).toEqual([]);
    });

    it('runs after items and before the dock', () => {
        const names = SYSTEMS.map((system) => system.name);

        expect(names.indexOf('hazards')).toBe(names.indexOf('items') + 1);
        expect(names.indexOf('dock')).toBe(names.indexOf('hazards') + 1);
        expect(hazardsSystem.tick).toBe(tickHazards);
        expect(hazardsSystem.onStart).toBe(resetHazards);
    });
});

describe('stomp', () => {
    it('puts a fuse out after a second of standing on it', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        world.outbox.length = 0;

        expect(tryBeginStomp(world, 'session-0')).toBe(true);
        expect(player.chore).toBe('stomp');
        expect(player.choreUntil).toBeCloseTo(1);

        for (let i = 0; i < 19; i++) step(world);
        expect(fuseKeys(world)).toEqual([keg.id]);

        step(world);

        expect(fuseKeys(world)).toEqual([]);
        expect(keg.lit).toBe(false);
        expect(player.chore).toBe('');
        expect(player.choreUntil).toBe(0);
        expect(fxKinds(world)).toContain('pfft');
        expect(world.tally.players.get(player.userId)?.fusesStomped).toBe(1);
    });

    it('is lost when the stomper is knocked off the tile', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        expect(tryBeginStomp(world, 'session-0')).toBe(true);

        stand(world, 'session-0', [9, 8]);
        step(world);

        expect(player.chore).toBe('');
        expect(fuseKeys(world)).toEqual([keg.id]);
    });

    it('is lost when the keg underfoot is picked up', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        expect(tryBeginStomp(world, 'session-0')).toBe(true);
        expect(giveToPlayer(world, keg, 'session-1')).toBe(true);
        stand(world, 'session-1', [9, 8]);
        step(world);

        expect(player.chore).toBe('');
        expect(world.state.fuses.get(keg.id)?.y).toBe(8);
    });

    it('takes empty hands, a fuse underfoot and no other chore', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [7, 5]);

        expect(tryBeginStomp(world, 'session-0')).toBe(false);

        stand(world, 'session-0', [6, 5]);
        spark(world, 6, 5, 'slammerRedline');
        player.carrying = 'broom';

        expect(tryBeginStomp(world, 'session-0')).toBe(false);

        player.carrying = '';
        player.chore = 'sweep';

        expect(tryBeginStomp(world, 'session-0')).toBe(false);

        player.chore = '';

        expect(tryBeginStomp(world, 'session-0')).toBe(true);
        expect(keg.lit).toBe(true);
    });
});

describe('resetHazards', () => {
    it('leaves no fuses, no lit kegs and no half-finished stomp', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        expect(tryBeginStomp(world, 'session-0')).toBe(true);

        resetHazards(world);

        expect(fuseKeys(world)).toEqual([]);
        expect(keg.lit).toBe(false);
        expect(player.chore).toBe('');
        expect(player.choreUntil).toBe(0);
    });
});

describe('blast', () => {
    it('destroys the keg it was burning and bills the Groove for it', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);

        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 6, 5, 'slammerRedline');
        world.outbox.length = 0;
        step(world, 0.1);

        expect(world.state.items.has(keg.id)).toBe(false);
        expect(fuseKeys(world)).toEqual([]);
        expect(fxKinds(world)).toContain('blast');
        expect(world.grooveEvents.blastKegs).toBe(1);
        expect(world.tally.destroyedByType.keg).toBe(1);
        expect(world.state.groove).toBe(world.level.groove.start);
        expect(world.state.banner).toBe('WHOOPS');
        expect(world.state.bannerUntil).toBeCloseTo(world.now + 3);
    });

    it('lights a short chain fuse on the kegs beside it', () => {
        const world = started();
        const first = kegOn(world, [6, 5]);
        const second = kegOn(world, [7, 5]);

        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 6, 5, 'slammerRedline');
        step(world, 0.1);

        expect(fuseKeys(world)).toEqual([second.id]);
        expect(world.state.fuses.get(second.id)?.secondsLeft).toBeCloseTo(1.5);
        expect(world.state.fuses.get(second.id)?.chain).toBe(true);
        expect(second.lit).toBe(true);
        expect(world.state.items.has(first.id)).toBe(false);
    });

    it('burns the spill it went off on down to a scorch mark', () => {
        const world = started();

        addSpill(world, [6, 5]);
        kegOn(world, [6, 5]);
        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 6, 5, 'slammerRedline');
        step(world, 0.1);

        expect([...world.state.spillTiles]).toEqual([]);
        expect([...world.state.scorchTiles]).toEqual([world.packTile(6, 5)]);
    });

    it('throws a bystander clear, stuns them and leaves them black-faced', () => {
        const world = started();
        const carried = createItem(world, 'casing');
        const player = stand(world, 'session-0', [5, 5]);

        expect(giveToPlayer(world, carried, 'session-0')).toBe(true);
        kegOn(world, [4, 5]);
        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 4, 5, 'slammerRedline');
        step(world, 0.1);

        expect(world.tileOf(player.x, player.y)).toEqual([7, 5]);
        expect(player.stunnedUntil).toBeCloseTo(world.now + 2);
        expect(player.sooted).toBe(true);
        expect(player.carrying).toBe(carried.id);
        expect(world.tally.players.get(player.userId)?.sooted).toBe(1);
    });

    it('blows the holder of a keg backwards and empties their hands', () => {
        const world = started();
        const keg = kegOn(world, [5, 5]);
        const player = stand(world, 'session-0', [5, 5]);

        player.facing = 0;
        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 5, 5, 'slammerRedline');
        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);
        step(world, 0.1);

        expect(world.tileOf(player.x, player.y)).toEqual([3, 5]);
        expect(player.carrying).toBe('');
        expect(world.state.items.has(keg.id)).toBe(false);
    });

    it('costs the knocked-back player the stomp they were half way through', () => {
        const world = started();

        addSpill(world, [5, 5]);
        kegOn(world, [4, 5]);

        const player = stand(world, 'session-0', [5, 5]);

        world.level.hazards.stompSeconds = 30;
        spark(world, 4, 5, 'slammerRedline');
        spark(world, 5, 5, 'fizzle');
        expect(tryBeginStomp(world, 'session-0')).toBe(true);

        for (let i = 0; i < 120; i++) step(world);

        expect(world.tileOf(player.x, player.y)).toEqual([7, 5]);
        expect(player.chore).toBe('');
        expect(player.sooted).toBe(true);
    });

    it('turfs a worker off the machine it threw them away from', () => {
        const world = started();
        const player = stand(world, 'session-0', [5, 4]);

        expect(stationJoin(world, player)).toBe(true);
        expect(player.stationId).toBe('powder-a');

        kegOn(world, [4, 4]);
        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 4, 4, 'slammerRedline');
        step(world, 0.1);

        expect(player.stationId).toBe('');
        expect(player.workTile).toBe('');
    });
});

describe('escalation', () => {
    /** A square of kegs: one spark takes the lot, 1.5 s apart. */
    function pile(world: World, tiles: Tile[]): void {
        for (const tile of tiles) kegOn(world, tile);

        world.level.hazards.fuseSeconds = 0.1;
    }

    it('files an incident on the nearest station and turfs its crew off it', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        const shelved = createItem(world, 'keg');

        expect(shelfPush(world, station, 'out', shelved)).toBe(true);

        const worker = stand(world, 'session-0', [5, 4]);

        expect(stationJoin(world, worker)).toBe(true);

        pile(world, [
            [2, 4],
            [3, 4],
            [2, 5],
            [3, 5],
        ]);
        spark(world, 2, 4, 'slammerRedline');

        for (let i = 0; i < 40; i++) step(world);

        expect(world.state.banner).toBe('INCIDENT');
        expect(station.state).toBe('damaged');
        expect(station.progress).toBe(0);
        expect(worker.stationId).toBe('');
        expect(world.tally.counts.incidents).toBe(1);

        // The kegs on the shelf are fuel, not paperwork: they stay where the
        // chain can still reach them (docs/16's nine plus six).
        expect([...station.outputShelf]).toEqual([shelved.id]);
        expect(world.state.items.has(shelved.id)).toBe(true);
    });

    it('counts every keg the chain took, not one for the whole chain', () => {
        const world = started();

        pile(world, [
            [2, 4],
            [3, 4],
            [2, 5],
            [3, 5],
        ]);
        spark(world, 2, 4, 'slammerRedline');

        for (let i = 0; i < 200; i++) step(world);

        expect(world.state.items.size).toBe(0);
        expect(buildReport(world, 'clock').kegsExploded).toBe(4);

        // A blast bills its own keg through the hazard line, so scrapping it a
        // second time would charge the crew twice for one keg.
        expect(world.tally.wastedByType.keg).toBe(0);
    });

    it('scraps the rest of a damaged shelf and bills it to the day as waste', () => {
        const world = started();
        const station = world.state.stations.get('assembly-a');

        if (station === undefined) throw new Error('no assembly-a');

        const casing = createItem(world, 'casing');
        const keg = createItem(world, 'keg');
        const stick = createItem(world, 'stick');

        expect(shelfPush(world, station, 'in', casing)).toBe(true);
        expect(shelfPush(world, station, 'in', keg)).toBe(true);
        expect(shelfPush(world, station, 'out', stick)).toBe(true);

        const before = wasteLedger(world);

        damageStation(world, 'assembly-a');

        expect(world.state.items.has(casing.id)).toBe(false);
        expect(world.state.items.has(stick.id)).toBe(false);
        expect(world.tally.wastedByType).toMatchObject({ casing: 1, stick: 1 });
        expect([...station.inputShelf]).toEqual([keg.id]);
        expect(wasteLedger(world)).toBe(before);

        // Nothing on that shelf exploded and nothing fizzled: the hazard lines
        // read `destroyedByType`, and paperwork is not an explosion.
        expect(world.tally.destroyedByType).toEqual({
            keg: 0,
            casing: 0,
            stick: 0,
            crate: 0,
            parts: 0,
        });
    });

    it('ends the day once when ten kegs go up', () => {
        const world = started();
        const ends: Array<[string, string]> = [];
        const requestEnd = world.requestEnd.bind(world);

        world.requestEnd = (status, reason): void => {
            ends.push([status, reason]);
            requestEnd(status, reason);
        };

        pile(world, [
            [3, 4],
            [4, 4],
            [5, 4],
            [6, 4],
            [7, 4],
            [3, 5],
            [4, 5],
            [5, 5],
            [6, 5],
            [7, 5],
        ]);
        spark(world, 3, 4, 'slammerRedline');

        for (let i = 0; i < 140; i++) step(world);

        expect(world.state.banner).toBe('EXPLODED');
        expect(ends).toEqual([['exploded', 'exploded']]);
        expect(world.tally.destroyedByType.keg).toBe(10);

        world.state.players.forEach((player) => {
            expect(player.sooted).toBe(true);
        });
    });

    /** docs/16: Powder's ring is 9 and its shelf is 6 — one spark, fifteen kegs. */
    const FULL_RING: Tile[] = [
        [3, 4],
        [4, 4],
        [6, 4],
        [7, 4],
        [3, 5],
        [4, 5],
        [5, 5],
        [6, 5],
        [7, 5],
    ];

    function stockedShelf(world: World, kegs: number): void {
        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        for (const tile of FULL_RING) kegOn(world, tile);

        for (let i = 0; i < kegs; i++) {
            expect(shelfPush(world, station, 'out', createItem(world, 'keg'))).toBe(true);
        }
    }

    /** The banner each escalation raised, in the order the chain raised them. */
    function burn(world: World, ticks: number): string[] {
        const seen: string[] = [];

        for (let i = 0; i < ticks; i++) {
            step(world);

            const banner = world.state.banner;

            if (banner !== '' && banner !== seen[seen.length - 1]) seen.push(banner);
        }

        return seen;
    }

    it('lets the pile reach the shelf beside it and blows the factory up', () => {
        const world = started();
        const ends: Array<[string, string]> = [];

        world.requestEnd = (status, reason): void => {
            ends.push([status, reason]);
        };

        stockedShelf(world, 6);

        expect(sparkRing(world, 'powder-a', 'slammerRedline')).toBe('lit');

        expect(burn(world, 400)).toEqual(['WHOOPS', 'INCIDENT', 'EXPLODED']);
        expect(ends).toEqual([['exploded', 'exploded']]);
        expect(world.tally.destroyedByType.keg).toBeGreaterThanOrEqual(10);
    });

    /** The ending explosion stops the chain, so the full fifteen need a setback. */
    it('destroys all fifteen when the level plays the explosion as a setback', () => {
        const world = started();

        world.level.hazards.explosionEndsRound = false;
        stockedShelf(world, 6);

        expect(sparkRing(world, 'powder-a', 'slammerRedline')).toBe('lit');
        expect(burn(world, 400)).toEqual(['WHOOPS', 'INCIDENT', 'EXPLODED']);
        expect(world.tally.destroyedByType.keg).toBe(15);
        expect(world.grooveEvents.blastKegs).toBe(15);
    });

    it('takes the factory apart instead when the level says the day goes on', () => {
        const world = started();
        const ends: string[] = [];

        world.requestEnd = (status): void => {
            ends.push(status);
        };
        world.level.hazards.explosionEndsRound = false;

        pile(world, [
            [3, 4],
            [4, 4],
            [5, 4],
            [6, 4],
            [7, 4],
            [3, 5],
            [4, 5],
            [5, 5],
            [6, 5],
            [7, 5],
        ]);
        spark(world, 3, 4, 'slammerRedline');

        for (let i = 0; i < 140; i++) step(world);

        expect(ends).toEqual([]);
        expect(world.state.banner).toBe('EXPLODED');
        world.state.stations.forEach((station) => {
            expect(station.state).toBe('damaged');
        });
    });

    it('counts a setback as one incident, not one per machine it damaged', () => {
        const world = started();

        world.requestEnd = (): void => {};
        world.level.hazards.explosionEndsRound = false;
        stockedShelf(world, 6);

        expect(sparkRing(world, 'powder-a', 'slammerRedline')).toBe('lit');
        burn(world, 400);

        world.state.stations.forEach((station) => {
            expect(station.state).toBe('damaged');
        });

        // One INCIDENT on the way past four, one for the setback itself. The
        // grade weighs each one at −5, so a per-machine count would bill a
        // Level 1 explosion for damage it never did.
        expect(world.tally.counts.incidents).toBe(2);
    });

    it('takes its own banner down again and leaves other people\'s alone', () => {
        const world = started();

        kegOn(world, [6, 5]);
        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 6, 5, 'slammerRedline');
        step(world, 0.1);
        expect(world.state.banner).toBe('WHOOPS');

        step(world, 3);
        expect(world.state.banner).toBe('');

        world.state.banner = 'HOT STREAK';
        world.state.bannerUntil = world.now - 1;
        step(world);

        expect(world.state.banner).toBe('HOT STREAK');
    });
});

describe('repair', () => {
    function damaged(world: World): PlayerState {
        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        station.state = 'damaged';

        return stand(world, 'session-0', [5, 4]);
    }

    it('files the incident report over ten seconds and reopens the machine', () => {
        const world = started();
        const player = damaged(world);
        const station = world.state.stations.get('powder-a');

        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(true);
        expect(player.chore).toBe('repair');
        expect(player.choreUntil).toBeCloseTo(10);

        for (let i = 0; i < 100; i++) step(world);

        expect(station?.progress).toBeCloseTo(0.5);

        for (let i = 0; i < 100; i++) step(world);

        expect(station?.state).toBe('idle');
        expect(station?.progress).toBe(0);
        expect(player.chore).toBe('');
        expect(fxKinds(world)).toContain('chime');
    });

    it('toggles off when the same key is pressed again', () => {
        const world = started();
        const player = damaged(world);

        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(true);
        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(false);
        expect(player.chore).toBe('');
    });

    it('is what an E on a damaged machine falls through to', () => {
        const world = started();
        const player = damaged(world);
        const ctx = {
            world,
            sessionId: 'session-0',
            player,
            room: { startDay: (): void => {}, sendConfig: (): void => {} },
        };

        MESSAGE_HANDLERS.interact(ctx, {});

        expect(player.chore).toBe('repair');
        expect(player.stationId).toBe('');
    });

    it('needs a damaged machine, a work tile and empty hands', () => {
        const world = started();
        const player = stand(world, 'session-0', [5, 4]);

        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(false);

        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        station.state = 'damaged';
        stand(world, 'session-0', [9, 8]);
        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(false);

        stand(world, 'session-0', [5, 4]);
        player.carrying = 'broom';
        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(false);
    });
});

describe('beacon', () => {
    it('goes red when the ring is half way to blowing the factory up', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');

        for (const tile of [[3, 4], [4, 4], [6, 4], [7, 4]] as Tile[]) kegOn(world, tile);

        step(world);
        expect(station?.beacon).toBe('off');

        kegOn(world, [3, 5]);
        step(world);
        expect(station?.beacon).toBe('red');

        const ids: string[] = [];

        world.state.items.forEach((item) => ids.push(item.id));
        for (const id of ids) world.state.items.delete(id);
        world.reindexItems();
        step(world);

        expect(station?.beacon).toBe('off');
    });

    it('leaves the Slammer its gold below the line and overrides it above', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');

        if (station === undefined) throw new Error('no powder-a');

        station.beacon = 'gold';
        step(world);
        expect(station.beacon).toBe('gold');

        for (const tile of [[3, 4], [4, 4], [6, 4], [7, 4], [3, 5]] as Tile[]) kegOn(world, tile);

        step(world);
        expect(station.beacon).toBe('red');
    });
});

describe('the blast bin', () => {
    /** Facing 6 is north (contracts §3), so the bin at [3, 3] is the faced tile. */
    const NORTH = 6;
    const EAST = 0;

    function interact(world: World, sessionId: string, player: PlayerState): void {
        MESSAGE_HANDLERS.interact(
            {
                world,
                sessionId,
                player,
                room: { startDay: (): void => {}, sendConfig: (): void => {} },
            },
            {},
        );
    }

    it('swallows a lit keg put down in it and credits the carrier', () => {
        const world = started();
        const keg = kegOn(world, [3, 4]);
        const player = stand(world, 'session-0', [3, 4]);

        spark(world, 3, 4, 'slammerRedline');
        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);
        step(world);
        world.outbox.length = 0;

        player.facing = NORTH;
        interact(world, 'session-0', player);

        expect(world.state.items.has(keg.id)).toBe(false);
        expect(player.carrying).toBe('');
        expect(fuseKeys(world)).toEqual([]);
        expect(fxKinds(world)).toContain('whump');
        expect(world.grooveEvents.niceSaves).toBe(1);
        expect(world.state.banner).toBe('NICE SAVE');
        expect(world.tally.players.get(player.userId)?.niceSaves).toBe(1);

        // The sand ate a keg that was bought and never sold, so the day still
        // pays for it: what the save earns is the incident that never happened.
        expect(world.tally.wastedByType.keg).toBe(1);
        expect(world.tally.destroyedByType.keg).toBe(0);
    });

    /** A thrown keg rolls one tile on, so the bin catches one thrown at its wall. */
    it('swallows a lit keg thrown into it', () => {
        const world = started();
        const keg = kegOn(world, [1, 3]);
        const player = stand(world, 'session-0', [1, 3]);

        spark(world, 1, 3, 'fizzle');
        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);
        world.tick(TICK);

        player.facing = EAST;
        expect(onAction(world, player, world.now * 1000)).toBe(true);

        world.outbox.length = 0;

        for (let i = 0; i < 40 && world.state.items.has(keg.id); i++) world.tick(TICK);

        expect(world.state.items.has(keg.id)).toBe(false);
        expect(fuseKeys(world)).toEqual([]);
        expect(world.tally.players.get(player.userId)?.niceSaves).toBe(1);
        expect(world.state.banner).toBe('NICE SAVE');
        expect(fxKinds(world)).toContain('whump');
        expect(fxKinds(world)).not.toContain('pfft');
    });

    it('lets a lit keg land anywhere else with its fuse still burning', () => {
        const world = started();
        const keg = kegOn(world, [6, 5]);
        const player = stand(world, 'session-0', [6, 5]);

        spark(world, 6, 5, 'slammerRedline');
        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);
        player.facing = NORTH;
        interact(world, 'session-0', player);

        expect(world.itemsAt(6, 4)).toEqual([keg.id]);
        expect(fuseKeys(world)).toEqual([keg.id]);
        expect(world.state.items.has(keg.id)).toBe(true);
    });

    it('is furniture to an unlit keg rather than a place to dump it', () => {
        const world = started();
        const keg = createItem(world, 'keg');
        const player = stand(world, 'session-0', [3, 4]);

        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);
        player.facing = NORTH;
        interact(world, 'session-0', player);

        expect(player.carrying).toBe(keg.id);
        expect(world.grooveEvents.niceSaves).toBe(0);
        expect(onItemLanded(world, keg.id, 3, 3)).toBe('landed');
    });
});

describe('resetHazards after a bad day', () => {
    it('sweeps the scorch, the damage and the soot off the floor', () => {
        const world = started();
        const station = world.state.stations.get('powder-a');
        const player = stand(world, 'session-0', [5, 4]);

        if (station === undefined) throw new Error('no powder-a');

        addSpill(world, [6, 5]);
        kegOn(world, [6, 5]);
        world.level.hazards.fuseSeconds = 0.1;
        spark(world, 6, 5, 'slammerRedline');
        step(world, 0.1);

        station.state = 'damaged';
        station.beacon = 'red';
        player.sooted = true;
        expect(tryBeginRepair(world, 'session-0', 'powder-a')).toBe(true);

        resetHazards(world);

        expect([...world.state.scorchTiles]).toEqual([]);
        expect(world.state.banner).toBe('');
        expect(station.state).toBe('idle');
        expect(station.beacon).toBe('off');
        expect(player.sooted).toBe(false);
        expect(player.chore).toBe('');
    });
});
