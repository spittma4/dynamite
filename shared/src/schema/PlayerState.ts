import { Schema, type } from '@colyseus/schema';

/**
 * One seat on the floor. `carrying` is an item id, the sentinel `'broom'`, or
 * empty — the broom is the only thing you can hold that is not an `ItemState`.
 * Every `*Until` is in `FactoryState.clock` seconds.
 */
export class PlayerState extends Schema {
    @type('string') userId = '';
    @type('string') name = '';
    @type('number') colour = 0;
    @type('string') line = 'a';
    @type('number') x = 0;
    @type('number') y = 0;
    @type('number') facing = 0;
    @type('boolean') moving = false;
    @type('number') speed = 0;
    @type('string') stationId = '';
    @type('string') workTile = '';
    @type('number') clipboardUntil = 0;
    @type('string') carrying = '';
    @type('string') chore = '';
    @type('number') choreUntil = 0;
    @type('number') stunnedUntil = 0;
    @type('boolean') sooted = false;
    @type('number') combo = 0;
    @type('string') bubble = '';
    @type('number') bubbleUntil = 0;
    @type('number') drivenOffUntil = 0;
    @type('number') seq = 0;
    @type('number') utilization = 0;
}
