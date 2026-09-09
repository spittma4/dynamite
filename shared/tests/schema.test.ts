import { Decoder, Encoder } from '@colyseus/schema';
import { describe, expect, it } from 'vitest';

import {
    FactoryState,
    FuseState,
    ItemState,
    OrderState,
    PlayerState,
    StationState,
    TruckState,
} from '../src/schema';
import type { Chore, ItemType } from '../src/schema';
import {
    BANNERS,
    ITEM_ID_PREFIX,
    STATION_SHORT,
    TICK_HZ,
    TICK_SECONDS,
} from '../src/sim/constants';

describe('FactoryState', () => {
    it('starts in the lobby on day one with the groove at fifty', () => {
        const state = new FactoryState();

        expect(state.day).toBe(1);
        expect(state.phase).toBe('lobby');
        expect(state.groove).toBe(50);
    });

    it('starts every other scalar empty so the server can fill it from config', () => {
        const state = new FactoryState();

        expect(state.levelKey).toBe('');
        expect(state.layoutKey).toBe('');
        expect(state.host).toBe('');
        expect(state.banner).toBe('');
        expect(state.clock).toBe(0);
        expect(state.shiftSeconds).toBe(0);
        expect(state.score).toBe(0);
        expect(state.coin).toBe(0);
        expect(state.bookTotal).toBe(0);
        expect(state.bookRemaining).toBe(0);
        expect(state.bannerUntil).toBe(0);
        expect(state.width).toBe(0);
        expect(state.height).toBe(0);
    });

    it('owns empty collections and a truck child schema', () => {
        const state = new FactoryState();

        expect(state.players.size).toBe(0);
        expect(state.stations.size).toBe(0);
        expect(state.items.size).toBe(0);
        expect(state.orders.size).toBe(0);
        expect(state.fuses.size).toBe(0);
        expect(state.spillTiles.length).toBe(0);
        expect(state.scorchTiles.length).toBe(0);
        expect(state.truck).toBeInstanceOf(TruckState);
    });
});

describe('the child state classes', () => {
    it('gives a player line a and everything else zero', () => {
        const player = new PlayerState();

        expect(player.line).toBe('a');
        expect(player.userId).toBe('');
        expect(player.name).toBe('');
        expect(player.colour).toBe(0);
        expect(player.facing).toBe(0);
        expect(player.moving).toBe(false);
        expect(player.speed).toBe(0);
        expect(player.stationId).toBe('');
        expect(player.workTile).toBe('');
        expect(player.carrying).toBe('');
        expect(player.chore).toBe('');
        expect(player.sooted).toBe(false);
        expect(player.combo).toBe(0);
        expect(player.bubble).toBe('');
        expect(player.drivenOffUntil).toBe(0);
        expect(player.seq).toBe(0);
        expect(player.utilization).toBe(0);
    });

    it('gives a station the idle state, a dark beacon and no mini-game blob', () => {
        const station = new StationState();

        expect(station.state).toBe('idle');
        expect(station.beacon).toBe('off');
        expect(station.mg).toBe('');
        expect(station.progress).toBe(0);
        expect(station.inputCap).toBe(0);
        expect(station.outputCap).toBe(0);
        expect(station.pausedUntil).toBe(0);
        expect(station.jamUntil).toBe(0);
        expect(station.inputShelf.length).toBe(0);
        expect(station.outputShelf.length).toBe(0);
    });

    it('parks a new item off the map at full quality', () => {
        const item = new ItemState();

        expect(item.x).toBe(-1);
        expect(item.y).toBe(-1);
        expect(item.quality).toBe(1);
        expect(item.holder).toBe('');
        expect(item.shelf).toBe('');
        expect(item.inFlight).toBe(false);
        expect(item.fuseLength).toBe('');
        expect(item.lit).toBe(false);
    });

    it('parks a new fuse off the map', () => {
        const fuse = new FuseState();

        expect(fuse.x).toBe(-1);
        expect(fuse.y).toBe(-1);
        expect(fuse.itemId).toBe('');
        expect(fuse.secondsLeft).toBe(0);
        expect(fuse.chain).toBe(false);
    });

    it('opens a new order for a long-fused red stick', () => {
        const order = new OrderState();

        expect(order.product).toBe('red_stick');
        expect(order.status).toBe('open');
        expect(order.fuseLength).toBe('long');
        expect(order.qty).toBe(0);
        expect(order.shipped).toBe(0);
    });

    it('starts the truck away', () => {
        const truck = new TruckState();

        expect(truck.phase).toBe('away');
        expect(truck.id).toBe(0);
        expect(truck.slots).toBe(0);
        expect(truck.loaded).toBe(0);
        expect(truck.beepPhase).toBe(0);
    });
});

describe('encoding', () => {
    it('round-trips a populated factory through the wire format', () => {
        const state = new FactoryState();
        state.levelKey = 'level-01-basic-flow';
        state.layoutKey = 'one-line';
        state.phase = 'running';
        state.clock = 12.5;
        state.host = 'aaa';
        state.width = 28;
        state.height = 18;

        const player = new PlayerState();
        player.userId = '7';
        player.name = 'Sam';
        player.x = 13.5;
        player.y = 9.5;
        player.carrying = 'k-1';
        player.chore = 'repair' satisfies Chore;
        state.players.set('aaa', player);

        for (const id of ['powder-a', 'assembly-a', 'dock-a']) {
            const station = new StationState();
            station.id = id;
            station.inputShelf.push('k-1');
            state.stations.set(id, station);
        }

        const item = new ItemState();
        item.id = 'p-1';
        item.type = 'parts' satisfies ItemType;
        item.holder = 'aaa';
        state.items.set('p-1', item);

        const fuse = new FuseState();
        fuse.itemId = 'k-1';
        fuse.x = 3;
        fuse.y = 4;
        fuse.secondsLeft = 6;
        state.fuses.set('k-1', fuse);

        const order = new OrderState();
        order.id = 'o-1';
        order.qty = 8;
        state.orders.set('o-1', order);

        state.spillTiles.push(265);
        state.scorchTiles.push(266);
        state.truck.id = 2;
        state.truck.phase = 'docked';

        const mirror = new FactoryState();
        new Decoder(mirror).decode(new Encoder(state).encodeAll());

        expect(mirror.levelKey).toBe('level-01-basic-flow');
        expect(mirror.phase).toBe('running');
        expect(mirror.clock).toBeCloseTo(12.5, 5);
        expect(mirror.width).toBe(28);
        expect(mirror.players.get('aaa')?.name).toBe('Sam');
        expect(mirror.players.get('aaa')?.chore).toBe('repair');
        expect(mirror.players.get('aaa')?.x).toBeCloseTo(13.5, 5);
        expect([...mirror.stations.keys()]).toEqual(['powder-a', 'assembly-a', 'dock-a']);
        expect(mirror.stations.get('assembly-a')?.inputShelf.at(0)).toBe('k-1');
        expect(mirror.items.get('p-1')?.type).toBe('parts');
        expect(mirror.items.get('p-1')?.quality).toBe(1);
        expect(mirror.fuses.get('k-1')?.secondsLeft).toBe(6);
        expect(mirror.orders.get('o-1')?.fuseLength).toBe('long');
        expect([...mirror.spillTiles]).toEqual([265]);
        expect([...mirror.scorchTiles]).toEqual([266]);
        expect(mirror.truck.phase).toBe('docked');
        expect(mirror.truck.id).toBe(2);
    });
});

describe('the §3 vocabulary in code', () => {
    it('prefixes an id for every item type, parts included', () => {
        expect(ITEM_ID_PREFIX).toEqual({ keg: 'k', casing: 'c', stick: 's', crate: 'x', parts: 'p' });
    });

    it('shortens every station type for its id', () => {
        expect(STATION_SHORT).toEqual({
            boom_powder: 'powder',
            assembly: 'assembly',
            dock: 'dock',
        });
    });

    it('lists the seven banners the server can raise', () => {
        expect(BANNERS).toEqual([
            'WHOOPS',
            'INCIDENT',
            'EXPLODED',
            'NICE SAVE',
            'CLEAN SWEEP',
            'HOT STREAK',
            'TAILGATE',
        ]);
    });

    it('ticks twenty times a second', () => {
        expect(TICK_HZ).toBe(20);
        expect(TICK_SECONDS).toBeCloseTo(0.05, 10);
        expect(TICK_HZ * TICK_SECONDS).toBeCloseTo(1, 10);
    });
});
