import { describe, expect, it } from 'vitest';

import type { ItemType, StationConfig } from '@shared';

import { NEED_KEG, SHELF_FULL, SHELF_FULL_HANDS } from '../minigames/Jig';
import { FUSE_SET } from '../nouns';
import { type JigStall, apron, outwardSide, shortageOf } from '../render/intake';

/** The ways the Jig stops, as `StationState.mg` reports them. */
function stall(over: Partial<JigStall> = {}): JigStall {
    return { phase: 'seat', cradle: 'empty', keg: null, pour: null, ...over };
}

const SEAT = stall();
const POUR = stall({ phase: 'pour' });
const PARTS = stall({ phase: 'parts' });

function station(over: Partial<StationConfig> & Pick<StationConfig, 'id' | 'type'>): StationConfig {
    return {
        anchor: [0, 0],
        workTiles: [],
        rackTiles: [],
        inputShelf: null,
        outputShelf: null,
        ...over,
    } as unknown as StationConfig;
}

/** Shelf at x=9, machine to its right: the bbox spans x 9–12, so the aisle is left. */
const SHELF_ON_THE_LEFT = station({
    id: 'assembly-a',
    type: 'assembly',
    anchor: [10, 5],
    workTiles: [
        [11, 5],
        [12, 5],
    ],
    inputShelf: { tile: [9, 5], capacity: 8, accepts: ['keg', 'casing'] },
    outputShelf: { tile: [12, 6], capacity: 4 },
});

/** The mirror image: bbox spans x 3–6 and the shelf sits on the right edge. */
const SHELF_ON_THE_RIGHT = station({
    id: 'assembly-b',
    type: 'assembly',
    anchor: [4, 2],
    workTiles: [[3, 2]],
    inputShelf: { tile: [6, 2], capacity: 8, accepts: ['keg'] },
    outputShelf: { tile: [3, 3], capacity: 4 },
});

const DOCK = station({
    id: 'dock-a',
    type: 'dock',
    anchor: [22, 3],
    workTiles: [
        [22, 4],
        [23, 4],
    ],
});

const POWDER = station({
    id: 'powder-a',
    type: 'boom_powder',
    anchor: [6, 3],
    workTiles: [[6, 4]],
    outputShelf: { tile: [7, 3], capacity: 6 },
});

describe('outwardSide', () => {
    it('faces left for a shelf on the left half of the station', () => {
        expect(outwardSide(SHELF_ON_THE_LEFT, [9, 5])).toBe(-1);
    });

    it('faces right for a shelf on the right half of the station', () => {
        expect(outwardSide(SHELF_ON_THE_RIGHT, [6, 2])).toBe(1);
    });
});

describe('apron', () => {
    it('is the shelf tile plus the floor tile in front of it', () => {
        expect(apron(SHELF_ON_THE_LEFT)).toEqual([
            [9, 5],
            [8, 5],
        ]);
    });

    it('steps the other way when the shelf faces right', () => {
        expect(apron(SHELF_ON_THE_RIGHT)).toEqual([
            [6, 2],
            [7, 2],
        ]);
    });

    it('is the ramp lanes at the dock, which has no shelf at all', () => {
        expect(apron(DOCK)).toEqual([
            [22, 4],
            [23, 4],
        ]);
    });

    it('is nothing for a station you never bring anything to', () => {
        expect(apron(POWDER)).toBeNull();
    });

    it('is nothing for a dock with no lanes', () => {
        expect(apron(station({ id: 'dock-b', type: 'dock' }))).toBeNull();
    });
});

describe('shortageOf', () => {
    /**
     * One shortage, one sentence. The floor said 'NEED KEGS' while the panel of
     * the person standing at that same machine said 'NEED A KEG' — and the
     * plural was the wrong number as well as the wrong grammar: the shelf wants
     * one keg to unstick, not a pile, and a standing order to keep hauling is
     * how a shelf reaches the 8/8 dead end.
     */
    it('asks for one keg, in the words the panel uses, not for a pile', () => {
        const shelf = ['casing', 'casing', 'casing'] as ItemType[];

        expect(shortageOf(SHELF_ON_THE_LEFT, shelf, SEAT)).toEqual({
            sentence: NEED_KEG,
            haul: true,
            act: true,
        });
        expect(NEED_KEG).toBe('NEED A KEG');
    });

    it('asks for a keg when the shelf is bare', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, [], SEAT)?.sentence).toBe(NEED_KEG);
    });

    it('asks for a keg while the pour is waiting on one, which is the same errand', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, [], POUR)?.sentence).toBe(NEED_KEG);
    });

    it('says nothing when a keg is already there, so the caller can fall back', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, ['keg', 'casing'] as ItemType[], SEAT)).toBeNull();
    });

    it('never asks for the casings the machine prints for itself', () => {
        const selfFed = station({
            id: 'assembly-c',
            type: 'assembly',
            anchor: [4, 2],
            workTiles: [[3, 2]],
            inputShelf: { tile: [6, 2], capacity: 8, accepts: ['casing'] },
        });
        const shortage = shortageOf(selfFed, [], SEAT);

        // It may say the machine is stocking one; it may never send anybody for it.
        expect(shortage?.sentence ?? '').not.toMatch(/NEED/);
        expect(shortage?.haul ?? false).toBe(false);
        expect(shortage?.act ?? false).toBe(false);
    });

    it('says nothing for a station with no input shelf', () => {
        expect(shortageOf(DOCK, [], null)).toBeNull();
    });

    it('says nothing for a station with no mini-game blob to read', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, [], null)?.sentence).toBe(NEED_KEG);
    });

    /**
     * The one that shipped broken. `startPour` consumes the keg off the shelf at
     * the first pour and holds it in `state.keg`, so by the time the Jig stops in
     * `parts` waiting on B the shelf holds nothing but casings — byte-identical to
     * a real keg starve. Sending a hauler for kegs there fills the eight slots and
     * stops `feed()` restocking casings at all.
     */
    it('asks for a fuse set, not a keg, while the Jig waits on an empty cradle', () => {
        const shortage = shortageOf(SHELF_ON_THE_LEFT, ['casing'] as ItemType[], PARTS);

        expect(shortage?.sentence).toBe(`NEED A ${FUSE_SET} — RACK`);
        expect(shortage?.sentence).not.toMatch(/KEG/);
    });

    it('does not light the intake zone for a fuse: it is fetched from the rack', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, [], PARTS)?.haul).toBe(false);
    });

    /**
     * `feed()` bails on `view.shelfRoom <= 0`, so eight kegs on an eight-slot shelf
     * starve the Jig of casings for good. The remedy is to lift one back off, which
     * is the opposite of every other thing the floor asks for.
     */
    it('says the shelf is full when nothing haulable is missing and there is no room', () => {
        const full = Array<ItemType>(8).fill('keg' as ItemType);
        const shortage = shortageOf(SHELF_ON_THE_LEFT, full, SEAT);

        expect(shortage?.sentence).toBe(SHELF_FULL);
        expect(shortage?.haul).toBe(false);
        expect(shortage?.act).toBe(true);
    });

    /**
     * The dead end, said to the only person who ever reaches it. 'TAKE ONE BACK'
     * is an instruction a player already holding a keg cannot follow, and
     * nothing told them to put theirs down first.
     */
    it('tells a player who is already holding one to put it down first', () => {
        const full = Array<ItemType>(8).fill('keg' as ItemType);

        expect(shortageOf(SHELF_ON_THE_LEFT, full, SEAT, true)?.sentence).toBe(SHELF_FULL_HANDS);
        expect(shortageOf(SHELF_ON_THE_LEFT, full, SEAT, false)?.sentence).toBe(SHELF_FULL);
    });

    /**
     * The last way `copy.needParts` could still reach the screen: a Jig stopped in
     * `seat` with a keg on the shelf and no casing on it. `feed()` puts one there
     * inside a tick, so the answer is to wait, not to fetch — and PARTS is the name
     * of a different Jig step anyway.
     */
    it('says the casing is coming rather than naming a phantom errand', () => {
        const shortage = shortageOf(SHELF_ON_THE_LEFT, ['keg'] as ItemType[], SEAT);

        expect(shortage?.sentence).toMatch(/CASING/);
        expect(shortage?.haul).toBe(false);
    });

    it('says nothing once the casing has landed and the shelf is stocked', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, ['keg', 'casing'] as ItemType[], SEAT)).toBeNull();
    });

    it('cries full before it cries restock: there is no room for the casing either', () => {
        const full = Array<ItemType>(8).fill('keg' as ItemType);

        expect(shortageOf(SHELF_ON_THE_LEFT, full, SEAT)?.sentence).toMatch(/FULL/);
    });

    it('does not cry full while there is still a slot free', () => {
        const nearly = [...Array<ItemType>(6).fill('keg' as ItemType), 'casing' as ItemType];

        expect(shortageOf(SHELF_ON_THE_LEFT, nearly, SEAT)).toBeNull();
    });
});

/**
 * `JigStall` used to be `phase` and `cradle` alone, so the shelf was the
 * client's only evidence about powder — and `startPour` consumes the keg off
 * the shelf into `state.keg` on the first pour. Every shipped level pours two
 * sticks from one keg, so after each stick the machine holds a keg and the
 * shelf is bare of them: the sim reads that as stocked (`pourAvailable`,
 * shared/src/sim/jig.ts) and the floor read it as a shortage, on roughly every
 * other cycle. A sign that cries shortage during healthy operation is a sign
 * nobody reads.
 */
describe('the keg the machine is already holding', () => {
    it('counts a loaded keg with pours left as stock, the way pourAvailable does', () => {
        const shelf = ['casing'] as ItemType[];
        const loaded = stall({ keg: { quality: 1, prime: false, poursLeft: 1 } });

        expect(shortageOf(SHELF_ON_THE_LEFT, shelf, loaded)).toBeNull();
    });

    it('asks again once the last pour has been spent', () => {
        const shelf = ['casing'] as ItemType[];
        const spent = stall({ keg: { quality: 1, prime: false, poursLeft: 0 } });

        expect(shortageOf(SHELF_ON_THE_LEFT, shelf, spent)?.sentence).toBe(NEED_KEG);
    });

    it('keeps the shortage while the machine holds nothing at all', () => {
        expect(shortageOf(SHELF_ON_THE_LEFT, ['casing'] as ItemType[], SEAT)?.sentence).toBe(
            NEED_KEG,
        );
    });
});

/**
 * `stationStatus` starves the Jig on `phase === 'pour' && pour === null`, a
 * state `shortageOf` had no branch for — so the floor fell through to
 * `copy.stations.needParts` and shouted NEED PARTS at Assembly, naming an
 * object no player can fetch. `startPour` only leaves that state behind when
 * there is no keg on the shelf and none in the machine.
 */
describe('the pour with nothing to pour', () => {
    it('names the keg rather than falling through to the copy line', () => {
        const stalled = stall({ phase: 'pour', pour: null });
        const shortage = shortageOf(SHELF_ON_THE_LEFT, ['casing'] as ItemType[], stalled);

        expect(shortage).toEqual({ sentence: NEED_KEG, haul: true, act: true });
    });

    it('says nothing while the pour is actually running', () => {
        const running = stall({
            phase: 'pour',
            keg: { quality: 1, prime: false, poursLeft: 1 },
            pour: { startAt: 8, targetAt: 12, beats: 5, primeKeg: false },
        });

        expect(shortageOf(SHELF_ON_THE_LEFT, ['casing'] as ItemType[], running)).toBeNull();
    });
});
