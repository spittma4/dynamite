import { Schema, type } from '@colyseus/schema';

export class OrderState extends Schema {
    @type('string') id = '';
    @type('string') product = 'red_stick';
    @type('number') qty = 0;
    @type('number') shipped = 0;
    @type('string') status = 'open';
    @type('number') truckId = 0;
    @type('string') fuseLength = 'long';
}
