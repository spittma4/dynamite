import { Schema, type } from '@colyseus/schema';

/**
 * Physical work in progress. `x`/`y` are −1 whenever the item is held or
 * shelved, so anything drawn on the floor is exactly `x >= 0 && !inFlight`.
 */
export class ItemState extends Schema {
    @type('string') id = '';
    @type('string') type = '';
    @type('number') x = -1;
    @type('number') y = -1;
    @type('string') holder = '';
    @type('string') shelf = '';
    @type('boolean') inFlight = false;
    @type('number') flightT = 0;
    @type('number') fromX = 0;
    @type('number') fromY = 0;
    @type('number') toX = 0;
    @type('number') toY = 0;
    @type('number') quality = 1;
    @type('boolean') prime = false;
    @type('number') dents = 0;
    @type('string') fuseLength = '';
    @type('number') fill = 0;
    @type('boolean') capLoose = false;
    @type('boolean') frayed = false;
    @type('string') orderId = '';
    @type('boolean') lit = false;
}
