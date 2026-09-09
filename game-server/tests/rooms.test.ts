import { describe, expect, it } from 'vitest';

import { FactoryRoom } from '../src/rooms/FactoryRoom';
import { rooms } from '../src/rooms/index';

/**
 * One room per factory (contracts §5). The registration is a value rather than
 * a line inside the boot so this can be asserted without opening a socket — a
 * lost `filterBy` puts every factory in the world into one room, and nothing
 * else in the suite would notice.
 */
describe('room registry', () => {
    it('registers the factory room filtered by factoryId', () => {
        expect(Object.keys(rooms)).toEqual(['factory']);
        expect(rooms.factory.klass).toBe(FactoryRoom);
        expect(rooms.factory.filterOptions).toEqual(['factoryId']);
    });
});
