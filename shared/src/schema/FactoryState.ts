import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

import { FuseState } from './FuseState';
import { ItemState } from './ItemState';
import { OrderState } from './OrderState';
import { PlayerState } from './PlayerState';
import { StationState } from './StationState';
import { TruckState } from './TruckState';

/**
 * The authoritative world. The server writes it; the client only reads it.
 * `clock` is the one time base — it advances in every phase and resets to 0
 * when the day starts, so a client compares every deadline against its own
 * estimate of `clock` rather than a wall clock.
 */
export class FactoryState extends Schema {
    @type('string') levelKey = '';
    @type('string') layoutKey = '';
    @type('number') day = 1;
    @type('string') phase = 'lobby';
    @type('number') clock = 0;
    @type('number') shiftSeconds = 0;
    @type('string') host = '';
    @type('number') groove = 50;
    @type('number') score = 0;
    @type('number') coin = 0;
    @type('number') bookTotal = 0;
    @type('number') bookRemaining = 0;
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
    @type({ map: StationState }) stations = new MapSchema<StationState>();
    @type({ map: ItemState }) items = new MapSchema<ItemState>();
    @type({ map: OrderState }) orders = new MapSchema<OrderState>();
    @type({ map: FuseState }) fuses = new MapSchema<FuseState>();
    @type(['number']) spillTiles = new ArraySchema<number>();
    @type(['number']) scorchTiles = new ArraySchema<number>();
    @type(TruckState) truck = new TruckState();
    @type('string') banner = '';
    @type('number') bannerUntil = 0;
    @type('number') width = 0;
    @type('number') height = 0;
}
