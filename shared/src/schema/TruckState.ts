import { Schema, type } from '@colyseus/schema';

export class TruckState extends Schema {
    @type('number') id = 0;
    @type('string') phase = 'away';
    @type('number') arrivesAt = 0;
    @type('number') leavesAt = 0;
    @type('number') slots = 0;
    @type('number') loaded = 0;
    @type('number') beepPhase = 0;
}
