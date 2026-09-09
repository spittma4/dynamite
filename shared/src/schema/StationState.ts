import { ArraySchema, Schema, type } from '@colyseus/schema';

/**
 * A machine and its shelves. `mg` is the mini-game module's own public blob,
 * JSON-encoded and rewritten only when it changes; a client that cannot parse
 * it treats it as absent.
 */
export class StationState extends Schema {
    @type('string') id = '';
    @type('string') type = '';
    @type('string') line = '';
    @type('number') anchorX = 0;
    @type('number') anchorY = 0;
    @type('string') state = 'idle';
    @type('number') progress = 0;
    @type('number') workers = 0;
    @type('number') efficiency = 0;
    @type('number') interruptsPerSecond = 0;
    @type(['string']) inputShelf = new ArraySchema<string>();
    @type(['string']) outputShelf = new ArraySchema<string>();
    @type('number') inputCap = 0;
    @type('number') outputCap = 0;
    @type('number') floorCount = 0;
    @type('number') utilization = 0;
    @type('number') jamUntil = 0;
    @type('number') pausedUntil = 0;
    @type('string') beacon = 'off';
    @type('string') mg = '';
}
