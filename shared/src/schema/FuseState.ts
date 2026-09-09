import { Schema, type } from '@colyseus/schema';

/**
 * A burning fuse. `itemId` is empty for a spill-tile fuse; `x`/`y` track the
 * burning tile and follow a carried keg so the sparkle stays under it.
 */
export class FuseState extends Schema {
    @type('string') itemId = '';
    @type('number') x = -1;
    @type('number') y = -1;
    @type('number') secondsLeft = 0;
    @type('boolean') chain = false;
}
