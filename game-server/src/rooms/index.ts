import { defineRoom } from 'colyseus';

import { FactoryRoom } from './FactoryRoom';

/**
 * The room registry (contracts §5). It is a value in its own file rather than
 * a literal inside the boot because `src/index.ts` listens on a port the moment
 * it is imported: a test can only prove that two factories get two rooms if the
 * `filterBy` is something it can read.
 */
export const rooms = {
    factory: defineRoom(FactoryRoom).filterBy(['factoryId']),
};
