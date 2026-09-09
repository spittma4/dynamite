import { describe, expect, it } from 'vitest';

import { RunTally } from '../src/sim/tally';
import { makeWorld } from './helpers/world';

/**
 * The shift's event counters (contracts §10.7). Every other system bumps them
 * at the moment the event happens, so the report only ever reads — which is
 * why the slots have to exist before anyone asks for them.
 */

describe('RunTally', () => {
    it('starts with every counter at zero', () => {
        const tally = new RunTally();

        expect(tally.counts).toEqual({ kegsMade: 0, kegsUsed: 0, defects: 0, incidents: 0 });
        expect(tally.destroyedByType).toEqual({ keg: 0, casing: 0, stick: 0, crate: 0, parts: 0 });
        expect(tally.wastedByType).toEqual({ keg: 0, casing: 0, stick: 0, crate: 0, parts: 0 });
        expect(tally.players.size).toBe(0);
    });

    it('bumps a factory counter', () => {
        const tally = new RunTally();

        tally.bump('kegsMade');
        tally.bump('kegsMade');
        tally.bump('defects');

        expect(tally.counts.kegsMade).toBe(2);
        expect(tally.counts.defects).toBe(1);
        expect(tally.counts.kegsUsed).toBe(0);
    });

    it('creates a player record on the first bump and increments it thereafter', () => {
        const tally = new RunTally();

        tally.bumpPlayer('u1', 'drops');

        expect(tally.players.get('u1')).toEqual({
            produced: 0,
            bubbles: 0,
            drops: 1,
            sooted: 0,
            fusesStomped: 0,
            niceSaves: 0,
            truckRides: 0,
        });

        tally.bumpPlayer('u1', 'drops');
        tally.bumpPlayer('u1', 'niceSaves');

        expect(tally.players.get('u1')?.drops).toBe(2);
        expect(tally.players.get('u1')?.niceSaves).toBe(1);
        expect(tally.players.size).toBe(1);
    });

    it('counts a destroyed item under its type', () => {
        const tally = new RunTally();

        tally.destroyed('keg', 'blast');
        tally.destroyed('keg', 'blast');
        tally.destroyed('stick', 'fizzle');

        expect(tally.destroyedByType.keg).toBe(2);
        expect(tally.destroyedByType.stick).toBe(1);
        expect(tally.destroyedByType.casing).toBe(0);
    });

    it('counts scrapped material apart from the hazard lines', () => {
        const tally = new RunTally();

        tally.scrap('keg');
        tally.scrap('stick');
        tally.scrap('stick');

        expect(tally.wastedByType.keg).toBe(1);
        expect(tally.wastedByType.stick).toBe(2);

        // A shelf wipe is not an explosion and not a fizzle: the P&L reads
        // `wastedByType`, so nothing here may reach the report's hazard lines.
        expect(tally.destroyedByType).toEqual({ keg: 0, casing: 0, stick: 0, crate: 0, parts: 0 });
    });

    it('clears counters, destroyed counts, scrap and players on reset', () => {
        const tally = new RunTally();

        tally.bump('incidents');
        tally.destroyed('crate', 'blast');
        tally.scrap('casing');
        tally.bumpPlayer('u1', 'truckRides');
        tally.reset();

        expect(tally.counts).toEqual({ kegsMade: 0, kegsUsed: 0, defects: 0, incidents: 0 });
        expect(tally.destroyedByType).toEqual({ keg: 0, casing: 0, stick: 0, crate: 0, parts: 0 });
        expect(tally.wastedByType).toEqual({ keg: 0, casing: 0, stick: 0, crate: 0, parts: 0 });
        expect(tally.players.size).toBe(0);
    });

    it('hangs one tally off the world for every system to bump', () => {
        const world = makeWorld();

        world.tally.bump('kegsMade');
        world.tally.bumpPlayer('u0', 'produced');

        expect(world.tally.counts.kegsMade).toBe(1);
        expect(world.tally.players.get('u0')?.produced).toBe(1);
    });
});
