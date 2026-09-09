import { describe, expect, it } from 'vitest';

import {
    createJigState,
    crimpClicks,
    deriveAisleTile,
    isFrayed,
    isPrimeStick,
    judge,
    knotTimes,
    laneSequence,
    nextBeat,
    pourBeats,
    pourFillAt,
    pourWindow,
    reduceJig,
    scaleLevel,
    stationStatus,
    toMg,
} from '../../src/shared';
import type {
    ItemType,
    JigConfig,
    JigEffect,
    JigShelfEntry,
    JigState,
    JigTickView,
    JigTiles,
    MgOp,
    OrderState,
    PlayerState,
    ScaledLevel,
    StationState,
} from '../../src/shared';
import { createItem, giveToPlayer, shelfPush } from '../../src/sim/items';
import { activeOrderId, settleOrder } from '../../src/sim/orders';
import { leave, onInteract, onMg, tick as stationsTick } from '../../src/sim/stations';
import type { World } from '../../src/sim/World';
import { makeWorld } from '../helpers/world';

/**
 * The Jig (F08). The pure state machine is driven with hand-built tick views so
 * every window can be hit to the millisecond; the adapter is driven through
 * F05's real station runtime on F03's `makeWorld`, because the half of this
 * feature that goes wrong is the wiring, not the arithmetic.
 */

const CFG: JigConfig = {
    bpm: 150,
    pour: {
        beatsByQuality: { '1.0': 5, '0.7': 7, '0.4': 8 },
        perfectMs: 60,
        okMs: 140,
        primeKegWindowMultiplier: 1.5,
    },
    knots: { long: 3, short: 2, secondsPerKnot: 0.4, perfectMs: 60, okMs: 140 },
    crimp: { clicks: 3, clickSeconds: 0.2, perfectMs: 80, okMs: 200 },
    toss: { arcSeconds: 0.5, perfectMs: 120, okMs: 250 },
    casings: { stock: 3, dentChance: 0.3 },
    kegPours: 2,
};

const TILES: JigTiles = {
    jig: [
        [13, 9],
        [14, 9],
    ],
    rack: [[16, 9]],
    aisle: [15, 9],
};

const BEAT = 0.4;

function casing(index: number, dents = 0): JigShelfEntry {
    return { index, itemId: `c-${index + 1}`, type: 'casing', dents, quality: 1, prime: false };
}

function keg(index: number, quality = 1, prime = true): JigShelfEntry {
    return { index, itemId: `k-${index + 1}`, type: 'keg', dents: 0, quality, prime };
}

function makeView(over: Partial<JigTickView> = {}): JigTickView {
    return {
        now: 100,
        dt: 0.05,
        paused: false,
        cycleIdle: true,
        rearmAt: 0,
        operators: ['a1'],
        rackHands: [],
        shelf: [],
        casingCount: CFG.casings.stock,
        shelfRoom: 5,
        activeOrderId: 'o-1',
        orders: [],
        aisleFloorItem: false,
        bodyOnAisle: '',
        partsOnJigTile: null,
        aTile: [13, 9],
        aCarrying: '',
        bCarrying: '',
        bParts: null,
        ...over,
    };
}

function tickJig(
    state: JigState,
    over: Partial<JigTickView> = {},
    rng: () => number = () => 0,
): JigEffect[] {
    return reduceJig(state, { t: 'tick', view: makeView(over) }, rng);
}

interface SendOpts {
    v?: number | string;
    at?: number;
    view?: Partial<JigTickView>;
}

function send(
    state: JigState,
    sessionId: string,
    op: MgOp,
    opts: SendOpts = {},
    rng: () => number = () => 0,
): JigEffect[] {
    const at = opts.at ?? 100;
    const view = makeView({ now: at, ...opts.view });

    return reduceJig(state, { t: 'input', sessionId, op, v: opts.v, at, view }, rng);
}

function kinds(effects: JigEffect[]): string[] {
    return effects.map((effect) => effect.e);
}

/**
 * The 20 Hz cadence F05 really ticks at. Jumping the clock in one step is a
 * blocked span to the jig, which is a different rule, so anything that waits on
 * a beat has to wait for it one step at a time.
 */
function advance(
    state: JigState,
    to: number,
    over: Partial<JigTickView> = {},
    rng: () => number = () => 0,
): JigEffect[] {
    const effects: JigEffect[] = [];

    while (state.lastTickAt + 0.05 <= to + 1e-9) {
        const now = Math.round((state.lastTickAt + 0.05) * 1000) / 1000;

        effects.push(...tickJig(state, { ...over, now }, rng));
    }

    return effects;
}

/** A jig with A on the tile and one casing plus one keg on the shelf. */
function withCrew(over: Partial<JigTickView> = {}): { state: JigState; shelf: JigShelfEntry[] } {
    const state = createJigState(CFG, TILES);
    const shelf = [casing(0), keg(1)];

    tickJig(state, { shelf, ...over });

    return { state, shelf };
}

/** Seated at 100, pouring from the 100.4 beat: the mark lands at 100.4 + beats × 0.4. */
function seated(quality = 1, prime = true, dents = 0): { state: JigState; targetAt: number } {
    const shelf = [casing(0, dents), keg(1, quality, prime)];
    const state = createJigState(CFG, TILES);

    tickJig(state, { shelf });
    send(state, 'a1', 'seat', { v: 0, at: 100, view: { shelf } });
    advance(state, 100.05, { shelf: [keg(1, quality, prime)] });

    return { state, targetAt: state.pour?.targetAt ?? 0 };
}

/** Through the pour with the cradle armed, standing on the first knot beat. */
function atKnots(fuse: 'short' | 'long' = 'long'): JigState {
    const { state, targetAt } = seated();

    state.cradle = 'armed';
    state.cradleFuse = fuse;
    advance(state, targetAt - 0.05);
    send(state, 'a1', 'pour', { at: targetAt });
    advance(state, targetAt + 0.05);

    return state;
}

/** Every knot played Perfect, so only the crimp is left to decide. */
function atCrimp(fuse: 'short' | 'long' = 'long'): JigState {
    const state = atKnots(fuse);

    for (const at of [...state.knotAt]) {
        advance(state, at - 0.05);
        send(state, 'a1', 'knot', { v: state.lanes[state.knotIndex], at });
    }

    return state;
}

describe('judge', () => {
    const window = { perfectMs: 60, okMs: 140 };

    it('grades an offset inside the perfect window as Perfect, inclusive at the bound', () => {
        expect(judge(0, window)).toBe('perfect');
        expect(judge(60, window)).toBe('perfect');
        expect(judge(-60, window)).toBe('perfect');
    });

    it('grades an offset between the windows as OK, inclusive at the bound', () => {
        expect(judge(61, window)).toBe('ok');
        expect(judge(-140, window)).toBe('ok');
    });

    it('grades an offset outside the ok window as a miss', () => {
        expect(judge(141, window)).toBe('miss');
        expect(judge(-141, window)).toBe('miss');
    });
});

describe('pourWindow', () => {
    it('keeps the configured window with an ordinary keg', () => {
        expect(pourWindow(CFG.pour, false)).toEqual({ perfectMs: 60, okMs: 140 });
    });

    it('widens both windows by the prime-keg multiplier', () => {
        expect(pourWindow(CFG.pour, true)).toEqual({ perfectMs: 90, okMs: 210 });
    });
});

describe('pourBeats', () => {
    it('pours 5 beats from a prime keg, 7 from damp and 8 from a dud', () => {
        expect(pourBeats(1, CFG.pour.beatsByQuality)).toBe(5);
        expect(pourBeats(0.7, CFG.pour.beatsByQuality)).toBe(7);
        expect(pourBeats(0.4, CFG.pour.beatsByQuality)).toBe(8);
    });

    it('uses the smallest key for a quality below every key', () => {
        expect(pourBeats(0.2, CFG.pour.beatsByQuality)).toBe(8);
    });

    it('holds the largest key above it', () => {
        expect(pourBeats(0.9, CFG.pour.beatsByQuality)).toBe(7);
    });
});

describe('nextBeat', () => {
    it('snaps a clock to the next beat', () => {
        expect(nextBeat(100.13, BEAT)).toBeCloseTo(100.4, 6);
    });

    it('leaves an exact beat alone', () => {
        expect(nextBeat(100.4, BEAT)).toBeCloseTo(100.4, 6);
    });
});

describe('timing helpers', () => {
    it('draws each lane from the rng in order', () => {
        const draws = [0.1, 0.9, 0.4];
        let i = 0;

        expect(laneSequence(() => draws[i++] ?? 0, 3)).toEqual(['l', 'r', 'l']);
    });

    it('schedules the knots one per beat from the start beat', () => {
        const times = knotTimes(102.4, 3, 0.4);

        expect(times[0] ?? 0).toBeCloseTo(102.8, 6);
        expect(times[1] ?? 0).toBeCloseTo(103.2, 6);
        expect(times[2] ?? 0).toBeCloseTo(103.6, 6);
        expect(knotTimes(102.4, 2, 0.4)).toHaveLength(2);
    });

    it('schedules the ratchet clicks after the last knot', () => {
        const clicks = crimpClicks(103.6, 3, 0.2);

        expect(clicks[0] ?? 0).toBeCloseTo(103.8, 6);
        expect(clicks[1] ?? 0).toBeCloseTo(104, 6);
        expect(clicks[2] ?? 0).toBeCloseTo(104.2, 6);
    });

    it('frays on two missed knots and not on one', () => {
        expect(isFrayed(['miss', 'ok', 'miss'])).toBe(true);
        expect(isFrayed(['miss', 'perfect', 'perfect'])).toBe(false);
    });

    it('rises linearly to 1 at the mark and 1.2 past it', () => {
        const pour = { startAt: 100.4, targetAt: 102.4 };

        expect(pourFillAt(pour, 100.4)).toBeCloseTo(0, 6);
        expect(pourFillAt(pour, 101.4)).toBeCloseTo(0.5, 6);
        expect(pourFillAt(pour, 102.4)).toBeCloseTo(1, 6);
        expect(pourFillAt(pour, 102.8)).toBeCloseTo(1.2, 6);
    });

    it('puts the aisle between the rack and the nearest jig tile', () => {
        expect(deriveAisleTile([16, 9], [14, 9])).toEqual([15, 9]);
    });
});

describe('isPrimeStick', () => {
    const clean = {
        dents: 0,
        pourGrade: 'perfect' as const,
        kegQuality: 1,
        knotGrades: ['perfect', 'perfect', 'perfect'] as const,
        crimpGrade: 'perfect' as const,
    };

    it('is prime with a clean seat, a Perfect pour and Perfect knots and crimp', () => {
        expect(isPrimeStick({ ...clean, knotGrades: [...clean.knotGrades] })).toBe(true);
    });

    it('is not prime with a dented casing', () => {
        expect(isPrimeStick({ ...clean, knotGrades: [...clean.knotGrades], dents: 1 })).toBe(false);
    });

    it('is not prime with an OK knot', () => {
        expect(isPrimeStick({ ...clean, knotGrades: ['perfect', 'ok', 'perfect'] })).toBe(false);
    });

    it('is not prime with an OK crimp', () => {
        expect(
            isPrimeStick({ ...clean, knotGrades: [...clean.knotGrades], crimpGrade: 'ok' }),
        ).toBe(false);
    });

    it('is not prime with a Perfect pour from a damp keg', () => {
        expect(
            isPrimeStick({ ...clean, knotGrades: [...clean.knotGrades], kegQuality: 0.7 }),
        ).toBe(false);
    });
});

describe('the casing feeder', () => {
    it('stocks one casing per tick until the shelf holds the configured stock', () => {
        const state = createJigState(CFG, TILES);

        expect(kinds(tickJig(state, { casingCount: 0 }))).toContain('stockCasing');
        expect(kinds(tickJig(state, { casingCount: 2 }))).toContain('stockCasing');
        expect(kinds(tickJig(state, { casingCount: 3 }))).not.toContain('stockCasing');
    });

    it('dents a casing when the roll lands under dentChance and not otherwise', () => {
        const state = createJigState(CFG, TILES);
        const dented = tickJig(state, { casingCount: 0 }, () => 0.1);
        const clean = tickJig(state, { casingCount: 0 }, () => 0.9);

        expect(dented[0]).toEqual({ e: 'stockCasing', dents: 1 });
        expect(clean[0]).toEqual({ e: 'stockCasing', dents: 0 });
    });

    it('stops when the shelf has no room', () => {
        const state = createJigState(CFG, TILES);

        expect(kinds(tickJig(state, { casingCount: 0, shelfRoom: 0 }))).not.toContain(
            'stockCasing',
        );
    });
});

describe('roles', () => {
    it('makes the earliest-joined work member A and the earliest rack member B', () => {
        const state = createJigState(CFG, TILES);

        tickJig(state, { operators: ['a1', 'a2'], rackHands: ['b1', 'b2'] });

        expect(state.a).toBe('a1');
        expect(state.b).toBe('b1');
    });

    it('promotes the next work member when A leaves', () => {
        const state = createJigState(CFG, TILES);

        tickJig(state, { operators: ['a1', 'a2'] });
        reduceJig(state, { t: 'leave', sessionId: 'a1' }, () => 0);
        tickJig(state, { operators: ['a2'] });

        expect(state.a).toBe('a2');
    });

    it('ignores an op from a helper or a stranger', () => {
        const { state, shelf } = withCrew({ operators: ['a1', 'a2'] });

        expect(send(state, 'a2', 'seat', { v: 0, view: { shelf } })).toEqual([]);
        expect(send(state, 'nobody', 'seat', { v: 0, view: { shelf } })).toEqual([]);
        expect(state.phase).toBe('seat');
    });

    it('defaults a new B pick from the order chip', () => {
        const state = createJigState(CFG, TILES);

        tickJig(state, { rackHands: ['b1'], orders: [{ orderId: 'o-1', fuseLength: 'short' }] });

        expect(state.bPick).toBe('short');
    });
});

describe('seat', () => {
    it('opens a cycle, takes the casing off the shelf and binds the active order', () => {
        const { state, shelf } = withCrew();
        const effects = send(state, 'a1', 'seat', { v: 0, view: { shelf } });

        expect(effects).toEqual([
            { e: 'beginCycle' },
            { e: 'consume', itemId: 'c-1' },
            { e: 'destroyItem', itemId: 'c-1' },
        ]);
        expect(state.seated).toEqual({ dents: 0, colour: 'red', orderId: 'o-1' });
        expect(state.phase).toBe('pour');
    });

    it('binds an empty order id when no order is open', () => {
        const { state, shelf } = withCrew();

        send(state, 'a1', 'seat', { v: 0, view: { shelf, activeOrderId: '' } });

        expect(state.seated?.orderId).toBe('');
    });

    it('refuses an index that is not a casing', () => {
        const { state, shelf } = withCrew();

        expect(send(state, 'a1', 'seat', { v: 1, view: { shelf } })).toEqual([]);
        expect(state.phase).toBe('seat');
    });

    it('refuses while A carries something, before the re-arm and while the cycle runs', () => {
        const { state, shelf } = withCrew();

        expect(send(state, 'a1', 'seat', { v: 0, view: { shelf, aCarrying: 's-1' } })).toEqual([]);
        expect(send(state, 'a1', 'seat', { v: 0, view: { shelf, rearmAt: 200 } })).toEqual([]);
        expect(send(state, 'a1', 'seat', { v: 0, view: { shelf, cycleIdle: false } })).toEqual([]);
        expect(state.phase).toBe('seat');
    });

    it('refuses without a pour available', () => {
        const { state } = withCrew();

        expect(send(state, 'a1', 'seat', { v: 0, view: { shelf: [casing(0)] } })).toEqual([]);
        expect(state.phase).toBe('seat');
    });

    it('returns to the picker when the cycle is refused', () => {
        const { state, shelf } = withCrew();

        send(state, 'a1', 'seat', { v: 0, view: { shelf } });
        reduceJig(state, { t: 'refused' }, () => 0);

        expect(state.phase).toBe('seat');
        expect(state.seated).toBeNull();
    });
});

describe('pour', () => {
    it('starts on the next beat after the seat and takes the first keg by shelf index', () => {
        const { state, shelf } = withCrew();
        const effects = send(state, 'a1', 'seat', { v: 0, view: { shelf } });
        const started = tickJig(state, { now: 100.05, shelf: [keg(1)] });

        expect(kinds(effects)).not.toContain('tally');
        expect(started).toContainEqual({ e: 'consume', itemId: 'k-2' });
        expect(started).toContainEqual({ e: 'tally', key: 'kegsUsed' });
        expect(state.pour?.startAt).toBeCloseTo(100.4, 6);
        expect(state.pour?.targetAt).toBeCloseTo(102.4, 6);
        expect(state.keg?.poursLeft).toBe(1);
    });

    it('pours 7 beats from a damp keg and 8 from a dud', () => {
        expect(seated(0.7, false).targetAt).toBeCloseTo(100.4 + 7 * BEAT, 6);
        expect(seated(0.4, false).targetAt).toBeCloseTo(100.4 + 8 * BEAT, 6);
    });

    it('destroys the keg on its second pour', () => {
        const { state, targetAt } = seated();

        send(state, 'a1', 'pour', { at: targetAt });
        state.phase = 'seat';
        state.seated = null;
        send(state, 'a1', 'seat', { v: 0, at: targetAt, view: { shelf: [casing(0)] } });

        const second = tickJig(state, { now: targetAt + 0.05, shelf: [] });

        expect(second).toContainEqual({ e: 'destroyItem', itemId: 'k-2' });
        expect(state.keg?.poursLeft).toBe(0);
    });

    it('fills to 1.0 on a Perfect or OK tap', () => {
        const perfect = seated();

        send(perfect.state, 'a1', 'pour', { at: perfect.targetAt + 0.05 });

        expect(perfect.state.fill).toBe(1);
        expect(perfect.state.last?.grade).toBe('perfect');

        const ok = seated(0.7, false);

        send(ok.state, 'a1', 'pour', { at: ok.targetAt + 0.1 });

        expect(ok.state.fill).toBe(1);
        expect(ok.state.last?.grade).toBe('ok');
    });

    it('leaves a weak fill on an early miss', () => {
        const { state, targetAt } = seated(0.7, false);
        const effects = send(state, 'a1', 'pour', { at: targetAt - 0.2 });

        expect(state.fill).toBe(0.6);
        expect(state.last).toMatchObject({ grade: 'miss', note: 'early' });
        expect(kinds(effects)).not.toContain('spill');
    });

    it('overfills and spills on a late miss', () => {
        const { state, targetAt } = seated(0.7, false);
        const effects = send(state, 'a1', 'pour', { at: targetAt + 0.2 });

        expect(state.fill).toBe(1.2);
        expect(state.last).toMatchObject({ grade: 'miss', note: 'late' });
        expect(effects).toContainEqual({ e: 'spill', tile: [13, 9] });
    });

    it('widens the window with a prime keg', () => {
        const wide = seated(1, true);

        send(wide.state, 'a1', 'pour', { at: wide.targetAt + 0.08 });

        expect(wide.state.last?.grade).toBe('perfect');

        const plain = seated(1, false);

        send(plain.state, 'a1', 'pour', { at: plain.targetAt + 0.08 });

        expect(plain.state.last?.grade).toBe('ok');
    });

    it('resolves an untapped pour as an overfill when the fill reaches 1.2', () => {
        const { state, targetAt } = seated();
        const overfillAt = targetAt + 0.2 * 5 * BEAT;

        advance(state, overfillAt - 0.1);

        expect(state.phase).toBe('pour');

        const effects = advance(state, overfillAt + 0.05);

        expect(state.fill).toBe(1.2);
        expect(state.phase).toBe('parts');
        expect(effects).toContainEqual({ e: 'spill', tile: [13, 9] });
    });

    it('holds the pour open for the backdate grace every other beat gets', () => {
        const { state, targetAt } = seated();

        // A prime keg's OK window is 210 ms, so a tap sent on its edge can
        // still arrive 200 ms later. The overfill is at +400 ms but the beat
        // is not over until +410, the way a knot and a crimp close on theirs.
        advance(state, targetAt + 0.4);

        expect(state.phase).toBe('pour');

        send(state, 'a1', 'pour', { at: targetAt + 0.21, view: { now: targetAt + 0.41 } });

        expect(state.last).toMatchObject({ step: 'pour', grade: 'ok', note: '' });
        expect(state.fill).toBe(1);
    });

    it('waits in pour with no keg and reads starved', () => {
        const { state, shelf } = withCrew();

        send(state, 'a1', 'seat', { v: 0, view: { shelf } });

        const view = makeView({ now: 100.05, shelf: [] });

        reduceJig(state, { t: 'tick', view }, () => 0);

        expect(state.pour).toBeNull();
        expect(stationStatus(state, view).state).toBe('starved');
    });
});

describe('knots', () => {
    it('waits in parts until the cradle is armed', () => {
        const { state, targetAt } = seated();

        advance(state, targetAt - 0.05);
        send(state, 'a1', 'pour', { at: targetAt });
        advance(state, targetAt + 0.05);

        expect(state.phase).toBe('parts');

        state.cradle = 'armed';
        state.cradleFuse = 'long';
        advance(state, targetAt + 0.1);

        expect(state.phase).toBe('knots');
        expect(state.cradle).toBe('empty');
    });

    it('promotes a surface set to the cradle after the tax', () => {
        const { state, targetAt } = seated();

        advance(state, targetAt - 0.05);
        send(state, 'a1', 'pour', { at: targetAt });
        state.cradle = 'surface';
        state.cradleFuse = 'long';
        state.surfaceReadyAt = targetAt + 0.5;
        advance(state, targetAt + 0.4);

        expect(state.phase).toBe('parts');

        advance(state, targetAt + 0.5);

        expect(state.phase).toBe('knots');
    });

    it('draws three lanes for a long fuse and two for a short one, reproduced by the seed', () => {
        expect(atKnots('long').lanes).toHaveLength(3);
        expect(atKnots('short').lanes).toHaveLength(2);

        const draws = [0.9, 0.1, 0.9];
        let i = 0;
        const { state, targetAt } = seated();

        state.cradle = 'armed';
        state.cradleFuse = 'long';
        advance(state, targetAt - 0.05);
        send(state, 'a1', 'pour', { at: targetAt });
        advance(state, targetAt + 0.05, {}, () => draws[i++] ?? 0);

        expect(state.lanes).toEqual(['r', 'l', 'r']);
    });

    it('schedules the knots one beat apart from the next beat', () => {
        const state = atKnots();
        const [first, second, third] = state.knotAt;

        expect(second ?? 0).toBeCloseTo((first ?? 0) + 0.4, 6);
        expect(third ?? 0).toBeCloseTo((first ?? 0) + 0.8, 6);
    });

    it('judges a right-lane tap against its beat', () => {
        const state = atKnots();
        const at = state.knotAt[0] ?? 0;

        send(state, 'a1', 'knot', { v: state.lanes[0], at });

        expect(state.knotGrades).toEqual(['perfect']);
        expect(state.knotIndex).toBe(1);
    });

    it('misses a wrong-lane tap and consumes the knot', () => {
        const state = atKnots();
        const wrong = state.lanes[0] === 'l' ? 'r' : 'l';

        send(state, 'a1', 'knot', { v: wrong, at: state.knotAt[0] ?? 0 });

        expect(state.knotGrades).toEqual(['miss']);
        expect(state.last?.note).toBe('lane');
        expect(state.knotIndex).toBe(1);
    });

    it('consumes the knot on an early tap', () => {
        const state = atKnots();

        send(state, 'a1', 'knot', { v: state.lanes[0], at: (state.knotAt[0] ?? 0) - 0.3 });

        expect(state.knotGrades).toEqual(['miss']);
        expect(state.last?.note).toBe('early');
    });

    it('auto-misses a knot 0.34 s after its beat', () => {
        const state = atKnots();
        const at = state.knotAt[0] ?? 0;

        advance(state, at + 0.3);

        expect(state.knotIndex).toBe(0);

        advance(state, at + 0.35);

        expect(state.knotGrades).toEqual(['miss']);
    });

    it('moves to the crimp once every knot is judged', () => {
        const state = atCrimp();

        expect(state.phase).toBe('crimp');
        expect(state.crimpClickAt).toHaveLength(3);
    });
});

describe('crimp and the finished stick', () => {
    function crimpAt(state: JigState): number {
        return state.crimpClickAt[state.crimpClickAt.length - 1] ?? 0;
    }

    it('ignores a crimp while knots are pending', () => {
        const state = atKnots();

        expect(send(state, 'a1', 'crimp', { at: state.knotAt[0] ?? 0 })).toEqual([]);
        expect(state.phase).toBe('knots');
    });

    it('judges the tap against the third click', () => {
        const state = atCrimp();
        const second = state.crimpClickAt[1] ?? 0;

        send(state, 'a1', 'crimp', { at: second });

        expect(state.last?.grade).toBe('ok');
    });

    it('completes the stick with the attributes the cycle earned', () => {
        const state = atCrimp();
        const third = crimpAt(state);
        const effects = send(state, 'a1', 'crimp', { at: third });
        const complete = effects.find((effect) => effect.e === 'complete');

        expect(complete).toEqual({
            e: 'complete',
            item: {
                quality: 1,
                prime: true,
                dents: 0,
                fuseLength: 'long',
                fill: 1,
                capLoose: false,
                frayed: false,
                orderId: 'o-1',
            },
            perfect: true,
            handsOf: 'a1',
        });
        expect(state.phase).toBe('seat');
        expect(state.seated).toBeNull();
        expect(state.rearmFrom).toBeCloseTo(third, 6);
    });

    it('sets a loose cap on a missed crimp and sparks only on a dented casing', () => {
        const clean = atCrimp();
        const cleanEffects = send(clean, 'a1', 'crimp', { at: crimpAt(clean) + 0.3 });
        const cleanStick = cleanEffects.find((effect) => effect.e === 'complete');

        expect(cleanStick?.e === 'complete' && cleanStick.item.capLoose).toBe(true);
        expect(kinds(cleanEffects)).not.toContain('spark');
        expect(cleanEffects).toContainEqual({ e: 'tally', key: 'defects' });
    });

    it('sparks on a missed crimp over a dented casing', () => {
        const { state, targetAt } = seated(1, true, 2);

        state.cradle = 'armed';
        state.cradleFuse = 'long';
        advance(state, targetAt - 0.05);
        send(state, 'a1', 'pour', { at: targetAt });
        advance(state, targetAt + 0.05);

        for (const at of [...state.knotAt]) {
            advance(state, at - 0.05);
            send(state, 'a1', 'knot', { v: state.lanes[state.knotIndex], at });
        }

        const effects = send(state, 'a1', 'crimp', { at: crimpAt(state) + 0.3 });

        expect(kinds(effects)).toContain('spark');
    });

    it('auto-misses the crimp when the last click closes', () => {
        const state = atCrimp();
        const effects = advance(state, crimpAt(state) + 0.45);
        const complete = effects.find((effect) => effect.e === 'complete');

        expect(complete?.e === 'complete' && complete.item.capLoose).toBe(true);
    });

    it('frays the stick after two missed knots', () => {
        const state = atKnots();
        const times = [...state.knotAt];

        send(state, 'a1', 'knot', { v: state.lanes[0], at: times[0] ?? 0 });
        send(state, 'a1', 'knot', { v: state.lanes[1] === 'l' ? 'r' : 'l', at: times[1] ?? 0 });
        send(state, 'a1', 'knot', { v: state.lanes[2] === 'l' ? 'r' : 'l', at: times[2] ?? 0 });

        const effects = send(state, 'a1', 'crimp', { at: crimpAt(state) });
        const complete = effects.find((effect) => effect.e === 'complete');

        expect(complete?.e === 'complete' && complete.item.frayed).toBe(true);
        expect(effects).toContainEqual({ e: 'tally', key: 'defects' });
    });

    it('counts no defect for a clean stick', () => {
        const state = atCrimp();
        const effects = send(state, 'a1', 'crimp', { at: crimpAt(state) });

        expect(kinds(effects)).not.toContain('tally');
    });

    it('celebrates a PRIME STICK once and only for a flawless cycle', () => {
        const state = atCrimp();
        const third = crimpAt(state);
        const effects = send(state, 'a1', 'crimp', { at: third });

        expect(kinds(effects)).toContain('primeStick');
        expect(state.primeAt).toBeCloseTo(third, 6);

        const damp = atCrimpFromDampKeg();
        const dampEffects = send(damp, 'a1', 'crimp', { at: crimpAt(damp) });

        expect(kinds(dampEffects)).not.toContain('primeStick');
    });

    function atCrimpFromDampKeg(): JigState {
        const { state, targetAt } = seated(0.7, false);

        state.cradle = 'armed';
        state.cradleFuse = 'long';
        advance(state, targetAt - 0.05);
        send(state, 'a1', 'pour', { at: targetAt });
        advance(state, targetAt + 0.05);

        for (const at of [...state.knotAt]) {
            advance(state, at - 0.05);
            send(state, 'a1', 'knot', { v: state.lanes[state.knotIndex], at });
        }

        return state;
    }
});

describe('B at the rack', () => {
    function withB(): JigState {
        const state = createJigState(CFG, TILES);

        tickJig(state, { rackHands: ['b1'] });

        return state;
    }

    it('sets the pick and keeps it across tosses', () => {
        const state = withB();

        send(state, 'b1', 'pick', { v: 'short' });

        expect(state.bPick).toBe('short');
    });

    it('fetches for 0.6 s and lands a parts item in B hands', () => {
        const state = withB();

        send(state, 'b1', 'fetch', { at: 100 });

        expect(state.bPhase).toBe('fetching');
        expect(state.bFetchDoneAt).toBeCloseTo(100.6, 6);

        expect(kinds(advance(state, 100.5, { rackHands: ['b1'] }))).not.toContain('createParts');

        const effects = advance(state, 100.6, { rackHands: ['b1'] });

        expect(effects).toContainEqual({ e: 'createParts', fuseLength: 'long', sessionId: 'b1' });
        expect(state.bPhase).toBe('holding');
    });

    it('refuses a fetch while B carries something', () => {
        const state = withB();

        const view = { rackHands: ['b1'], bCarrying: 'k-1' };

        expect(send(state, 'b1', 'fetch', { view })).toEqual([]);
        expect(state.bPhase).toBe('idle');
    });

    it('refuses a swing while the aisle is blocked', () => {
        const state = holding();

        const view = { rackHands: ['b1'], aisleFloorItem: true, bParts };

        expect(send(state, 'b1', 'swing', { view })).toEqual([]);
        expect(state.bPhase).toBe('holding');
    });

    const bParts = { itemId: 'p-1', fuseLength: 'long' as const };

    function holding(): JigState {
        const state = withB();

        send(state, 'b1', 'fetch', { at: 100 });
        advance(state, 100.6, { rackHands: ['b1'] });

        return state;
    }

    function swinging(at = 101): JigState {
        const state = holding();

        send(state, 'b1', 'swing', { at, view: { rackHands: ['b1'], bParts } });

        return state;
    }

    it('arms the cradle instantly on a Perfect toss', () => {
        const state = swinging();
        const effects = send(state, 'b1', 'toss', {
            at: 101.5,
            view: { rackHands: ['b1'], bParts },
        });

        expect(state.cradle).toBe('armed');
        expect(state.cradleFuse).toBe('long');
        expect(effects).toContainEqual({ e: 'destroyItem', itemId: 'p-1' });
        expect(state.bPhase).toBe('idle');
    });

    it('lands an OK toss on the surface and arms it 0.5 s later', () => {
        const state = swinging();

        send(state, 'b1', 'toss', { at: 101.7, view: { rackHands: ['b1'], bParts } });

        expect(state.cradle).toBe('surface');
        expect(state.surfaceReadyAt).toBeCloseTo(102.2, 6);
        expect(state.last?.grade).toBe('ok');
    });

    it('litters the aisle on a missed toss', () => {
        const state = swinging();
        const effects = send(state, 'b1', 'toss', {
            at: 101.9,
            view: { rackHands: ['b1'], bParts },
        });

        expect(effects).toContainEqual({ e: 'partsToFloor', itemId: 'p-1', tile: [15, 9] });
        expect(state.cradle).toBe('empty');
        expect(state.last).toMatchObject({ who: 'b', grade: 'miss', note: 'late' });
    });

    it('bounces a toss at a full cradle whatever the timing', () => {
        const state = swinging();

        state.cradle = 'armed';

        const effects = send(state, 'b1', 'toss', {
            at: 101.5,
            view: { rackHands: ['b1'], bParts },
        });

        expect(kinds(effects)).toContain('fx');
        expect(effects).toContainEqual({ e: 'partsToFloor', itemId: 'p-1', tile: [15, 9] });
        expect(state.last?.note).toBe('full');
    });

    it('drops the set on a body in the aisle and bubbles at them', () => {
        const state = swinging();
        const effects = send(state, 'b1', 'toss', {
            at: 101.5,
            view: { rackHands: ['b1'], bParts, bodyOnAisle: 'x1' },
        });

        expect(effects).toContainEqual({ e: 'bubble', sessionId: 'x1' });
        expect(effects).toContainEqual({ e: 'partsToFloor', itemId: 'p-1', tile: [15, 9] });
        expect(state.last?.note).toBe('body');
    });

    it('resolves an unreleased swing as a miss when the window closes', () => {
        const state = swinging(101);

        advance(state, 101.9, { rackHands: ['b1'], bParts });

        expect(state.bPhase).toBe('swinging');

        const effects = advance(state, 101.95, { rackHands: ['b1'], bParts });

        expect(kinds(effects)).toContain('partsToFloor');
        expect(state.bPhase).toBe('idle');
    });

    it('leaves the set in the hands of a B who walks off mid-swing', () => {
        const state = swinging();

        advance(state, 101.2, { rackHands: [] });

        expect(state.b).toBe('');
        expect(state.bPhase).toBe('idle');
        expect(state.cradle).toBe('empty');
    });

    it('picks a new B up in holding when they already carry a set', () => {
        const state = withB();

        tickJig(state, { now: 101, rackHands: ['b2'], bCarrying: 'p-9', bParts });

        expect(state.b).toBe('b2');
        expect(state.bPhase).toBe('holding');
    });

    it('marks the aisle blocked while a floor item sits on it', () => {
        const state = withB();

        tickJig(state, { rackHands: ['b1'], aisleFloorItem: true });

        expect(state.aisleBlocked).toBe(true);
    });
});

describe('the cradle from hands', () => {
    it('arms an empty cradle from a hauler standing on a jig tile', () => {
        const state = createJigState(CFG, TILES);
        const effects = tickJig(state, {
            partsOnJigTile: { sessionId: 'h1', itemId: 'p-4', fuseLength: 'short' },
        });

        expect(state.cradle).toBe('armed');
        expect(state.cradleFuse).toBe('short');
        expect(effects).toContainEqual({ e: 'destroyItem', itemId: 'p-4' });
    });

    it('leaves the set in their hands while the cradle is full', () => {
        const state = createJigState(CFG, TILES);

        state.cradle = 'armed';

        const effects = tickJig(state, {
            partsOnJigTile: { sessionId: 'h1', itemId: 'p-4', fuseLength: 'short' },
        });

        expect(kinds(effects)).not.toContain('destroyItem');
    });
});

describe('bail', () => {
    function bail(state: JigState): JigEffect[] {
        return reduceJig(state, { t: 'leave', sessionId: 'a1' }, () => 0);
    }

    it('loses nothing at the seat or in parts', () => {
        const { state } = withCrew();

        expect(bail(state)).toEqual([]);

        const { state: waiting, targetAt } = seated();

        send(waiting, 'a1', 'pour', { at: targetAt });
        tickJig(waiting, { now: targetAt + 0.05 });

        expect(waiting.phase).toBe('parts');
        expect(bail(waiting)).toEqual([]);
        expect(waiting.phase).toBe('parts');
    });

    it('spills, destroys the keg and keeps the casing seated mid-pour', () => {
        const { state } = seated();
        const effects = bail(state);

        expect(effects).toContainEqual({ e: 'spill', tile: [13, 9] });
        expect(effects).toContainEqual({ e: 'destroyItem', itemId: 'k-2' });
        expect(state.phase).toBe('pour');
        expect(state.pour).toBeNull();
        expect(state.keg).toBeNull();
        expect(state.seated).not.toBeNull();
    });

    it('discards the part set mid-knots and waits for another', () => {
        const state = atKnots();

        expect(bail(state)).toEqual([]);
        expect(state.phase).toBe('parts');
        expect(state.knotAt).toEqual([]);
        expect(state.lanes).toEqual([]);
    });

    it('drops a loose-capped stick and aborts the cycle mid-crimp', () => {
        const state = atCrimp();
        const effects = bail(state);
        const dropped = effects.find((effect) => effect.e === 'dropStick');

        expect(dropped?.e === 'dropStick' && dropped.item.capLoose).toBe(true);
        expect(dropped?.e === 'dropStick' && dropped.item.prime).toBe(false);
        expect(kinds(effects)).toContain('abort');
        expect(state.phase).toBe('seat');
        expect(state.seated).toBeNull();
    });
});

describe('pause and blocked spans', () => {
    it('shifts every pending beat by the pause and judges nothing', () => {
        const state = atKnots();
        const before = [...state.knotAt];

        tickJig(state, { now: state.lastTickAt + 0.05, paused: true, dt: 0.05 });

        expect(state.knotAt[0]).toBeCloseTo((before[0] ?? 0) + 0.05, 6);
        expect(state.knotIndex).toBe(0);
    });

    it('shifts them by the whole gap when ticking resumes after a jam', () => {
        const state = atKnots();
        const before = [...state.knotAt];

        tickJig(state, { now: state.lastTickAt + 2, dt: 0.05 });

        expect(state.knotAt[0]).toBeCloseTo((before[0] ?? 0) + 1.95, 6);
    });

    it('never shifts the re-arm bar', () => {
        const state = atKnots();

        state.rearmFrom = 10;
        state.rearmAt = 12;
        tickJig(state, { now: state.lastTickAt + 2, dt: 0.05, rearmAt: 12 });

        expect(state.rearmFrom).toBe(10);
        expect(state.rearmAt).toBe(12);
    });
});

describe('stationStatus', () => {
    it('reads starved with A on the tile and nothing to seat', () => {
        const { state } = withCrew();
        const view = makeView({ shelf: [], casingCount: 0 });

        expect(stationStatus(state, view).state).toBe('starved');
    });

    it('reads starved while parts are missing', () => {
        const { state, targetAt } = seated();

        send(state, 'a1', 'pour', { at: targetAt });
        tickJig(state, { now: targetAt + 0.05 });

        expect(stationStatus(state, makeView({ now: targetAt + 0.05 })).state).toBe('starved');
    });

    it('reads working through the phrase with progress rising', () => {
        const state = atKnots();
        const view = makeView({ now: state.knotAt[0] ?? 0 });
        const before = stationStatus(state, view);

        send(state, 'a1', 'knot', { v: state.lanes[0], at: state.knotAt[0] ?? 0 });

        const after = stationStatus(state, view);

        expect(before.state).toBe('working');
        expect(after.progress).toBeGreaterThan(before.progress);
    });

    it('reads idle at an unmanned picker and tracks the re-arm bar', () => {
        const state = createJigState(CFG, TILES);

        expect(stationStatus(state, makeView({ operators: [] })).state).toBe('idle');

        state.rearmFrom = 100;
        state.rearmAt = 104;

        const bar = stationStatus(state, makeView({ now: 102, rearmAt: 104 }));

        expect(bar.state).toBe('working');
        expect(bar.progress).toBeCloseTo(0.5, 6);
    });
});

describe('toMg', () => {
    it('projects the public fields and keeps the private ones on the server', () => {
        const state = atKnots();
        const mg = toMg(state) as unknown as Record<string, unknown>;

        expect(Object.keys(mg)).not.toContain('cfg');
        expect(Object.keys(mg)).not.toContain('lastTickAt');
        expect(Object.keys(mg)).not.toContain('kegItemId');
        expect(Object.keys(mg)).not.toContain('pourGrade');
        expect(mg.phase).toBe('knots');
        expect(JSON.parse(JSON.stringify(mg))).toEqual(mg);
    });
});

/* ------------------------------------------------------------------ adapter */

const STEP = 0.05;

function running(players = 2): World {
    const world = makeWorld({ players });

    world.startDay(scaleLevel(world.level, Math.max(3, players)) as ScaledLevel);

    return world;
}

function orderOf(world: World, id: string): OrderState {
    const order = world.state.orders.get(id);

    if (order === undefined) throw new Error(`no order ${id}`);

    return order;
}

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function stateOf(world: World, id: string): StationState {
    const st = world.state.stations.get(id);

    if (st === undefined) throw new Error(`no station state ${id}`);

    return st;
}

function standOn(world: World, sessionId: string, tile: [number, number]): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = tile[0] + 0.5;
    player.y = tile[1] + 0.5;
    world.reindexPlayers();

    return player;
}

/** Steps the station runtime at 20 Hz so the jig sees no gap to shift. */
function run(world: World, seconds: number): void {
    const steps = Math.round(seconds / STEP);

    for (let i = 0; i < steps; i++) {
        world.state.clock = Math.round((world.state.clock + STEP) * 1000) / 1000;
        stationsTick(world, STEP);
    }
}

/** A jig crewed past the clipboard: A on the first work tile, B on the rack. */
function crewedJig(): { world: World; a: PlayerState; b: PlayerState } {
    const world = running(2);
    const a = standOn(world, 'session-0', [13, 9]);
    const b = standOn(world, 'session-1', [16, 9]);

    onInteract(world, a);
    onInteract(world, b);

    world.state.clock = 4;
    stationsTick(world, STEP);

    return { world, a, b };
}

function mg(world: World, id = 'assembly-a'): Record<string, unknown> {
    return JSON.parse(stateOf(world, id).mg) as Record<string, unknown>;
}

function sendMg(world: World, player: PlayerState, op: MgOp, v?: number | string): void {
    onMg(world, player, { stationId: 'assembly-a', op, t: world.state.clock * 1000, v });
}

function shelveKeg(world: World, quality = 1): void {
    shelfPush(world, stateOf(world, 'assembly-a'), 'in', createItem(world, 'keg', { quality }));
}

function shelved(world: World, type: ItemType): number {
    const st = stateOf(world, 'assembly-a');
    let found = 0;

    st.inputShelf.forEach((id) => {
        if (world.state.items.get(id)?.type === type) found++;
    });

    return found;
}

describe('the jig adapter', () => {
    it('stocks the input shelf with casings and stops at the configured stock', () => {
        const world = running(1);

        run(world, 1);

        expect(shelved(world, 'casing')).toBe(3);
        expect(stateOf(world, 'assembly-a').inputShelf.length).toBe(3);
    });

    it('names the earliest work member A and the rack member B in mg', () => {
        const { world } = crewedJig();

        expect(mg(world).a).toBe('session-0');
        expect(mg(world).b).toBe('session-1');
    });

    it('seats a casing through the mg message and consumes it from the shelf', () => {
        const { world, a } = crewedJig();

        shelveKeg(world);

        const before = shelved(world, 'casing');

        sendMg(world, a, 'seat', 0);

        expect(shelved(world, 'casing')).toBe(before - 1);
        expect(mg(world).phase).toBe('pour');
    });

    it('binds the day book active order to the seated casing', () => {
        const { world, a } = crewedJig();

        shelveKeg(world);
        sendMg(world, a, 'seat', 0);

        const jig = mg(world);
        const seated = jig.seated as { orderId: string };

        expect(seated.orderId).toBe(activeOrderId(world));
        expect(seated.orderId).not.toBe('');
        expect(jig.orderChip).toHaveLength(2);
    });

    it('drops a settled partial order from the chip and from B first pick', () => {
        const { world, b } = crewedJig();

        orderOf(world, 'o-1').fuseLength = 'long';
        orderOf(world, 'o-2').fuseLength = 'short';

        // A truck that left one stick short stamps its order 'partial' for the
        // rest of the day. The chip is what A builds to and what B fetches for,
        // so it has to be the jobs F09 will still settle.
        settleOrder(world, 'o-1', 1);
        leave(world, b);
        run(world, 0.05);
        onInteract(world, standOn(world, 'session-1', [16, 9]));
        world.state.clock += 4;
        run(world, 0.1);

        const chip = mg(world).orderChip as { orderId: string }[];

        expect(chip.map((entry) => entry.orderId)).not.toContain('o-1');
        expect(chip[0]?.orderId).toBe(activeOrderId(world));
        expect(mg(world).bPick).toBe('short');
    });

    /** A damp keg pours over 7 beats, so the mark is 2.8 s out with room past it. */
    function pouring(): { world: World; a: PlayerState; targetAt: number } {
        const { world, a } = crewedJig();

        shelveKeg(world, 0.7);
        sendMg(world, a, 'seat', 0);
        run(world, 0.1);

        const { targetAt } = mg(world).pour as { targetAt: number };

        return { world, a, targetAt };
    }

    it('judges a tap on the client clock offset, never on the raw timestamp', () => {
        const { world, a, targetAt } = pouring();

        run(world, targetAt - world.state.clock + 0.15);

        // A tab opened five seconds after the whistle: `performance.now()` runs
        // 5 s behind the clock, and `world.inputClock` is the only thing that
        // knows it. Judged raw this is 5 s early; judged twice, 150 ms late.
        world.runtime('session-0').clockOffsetMs = 5_000;
        onMg(world, a, { stationId: 'assembly-a', op: 'pour', t: targetAt * 1000 - 5_000 });

        expect(mg(world).last).toMatchObject({ step: 'pour', grade: 'perfect', note: '' });
    });

    it('clamps a stale tap to the backdate floor rather than the beat it claims', () => {
        const { world, a, targetAt } = pouring();

        run(world, targetAt - world.state.clock + 0.35);
        onMg(world, a, { stationId: 'assembly-a', op: 'pour', t: targetAt * 1000 });

        // The tap claims the mark exactly but arrives 350 ms after it, so it is
        // judged at the MAX_INPUT_BACKDATE_S floor: 150 ms late, past the 140.
        expect(mg(world).last).toMatchObject({ step: 'pour', grade: 'miss', note: 'late' });
    });

    it('takes a keg off the shelf and bumps kegsUsed', () => {
        const { world, a } = crewedJig();

        shelveKeg(world);
        sendMg(world, a, 'seat', 0);
        run(world, 0.1);

        expect(world.tally.counts.kegsUsed).toBe(1);
        expect(shelved(world, 'keg')).toBe(0);
    });

    it('writes mg only when the JSON changes', () => {
        const { world } = crewedJig();

        run(world, 0.05);

        const before = stateOf(world, 'assembly-a').mg;

        run(world, 0.05);

        expect(stateOf(world, 'assembly-a').mg).toBe(before);
    });

    it('reports its own state and progress to F05', () => {
        const { world, a } = crewedJig();

        expect(stateOf(world, 'assembly-a').state).toBe('starved');

        shelveKeg(world);
        run(world, 0.05);

        expect(stateOf(world, 'assembly-a').state).toBe('idle');

        sendMg(world, a, 'seat', 0);
        run(world, 0.1);

        const st = stateOf(world, 'assembly-a');

        expect(st.state).toBe('working');
        expect(st.progress).toBeGreaterThan(0.24);
    });

    it('puts a fetched parts set in B hands and litters the aisle on a bad toss', () => {
        const { world, b } = crewedJig();

        sendMg(world, b, 'fetch');
        run(world, 0.7);

        const carried = world.state.items.get(b.carrying);

        expect(carried?.type).toBe('parts');
        expect(carried?.fuseLength).toBe('long');

        sendMg(world, b, 'swing');
        run(world, 1);

        expect(b.carrying).toBe('');
        expect(world.itemsAt(15, 9).length).toBe(1);
        expect(mg(world).aisleBlocked).toBe(true);
    });

    it('delivers the finished stick through complete and counts the defect', () => {
        const { world, a } = crewedJig();
        const st = stateOf(world, 'assembly-a');

        shelveKeg(world, 0.7);
        sendMg(world, a, 'seat', 0);
        run(world, 0.1);

        const jig = mg(world);
        const pour = jig.pour as { targetAt: number };

        run(world, Math.max(0, pour.targetAt - world.state.clock) + 0.6);

        expect(mg(world).phase).toBe('parts');

        // The hauler path: a set carried onto the jig arms the cradle.
        const parts = createItem(world, 'parts', { fuseLength: 'short' });

        leave(world, playerOf(world, 'session-1'));
        giveToPlayer(world, parts, 'session-1');
        standOn(world, 'session-1', [14, 9]);
        run(world, 0.1);

        expect(mg(world).phase).toBe('knots');

        run(world, 3);

        expect(st.outputShelf.length).toBe(1);

        const stick = world.state.items.get(st.outputShelf[0] ?? '');

        expect(stick?.type).toBe('stick');
        expect(stick?.fuseLength).toBe('short');
        expect(stick?.frayed).toBe(true);
        expect(world.tally.counts.defects).toBe(1);
    });

    it('re-opens the cycle for the A who picks an abandoned phrase back up', () => {
        const { world, a } = crewedJig();
        const st = stateOf(world, 'assembly-a');
        const station = world.stations.get('assembly-a');

        shelveKeg(world);
        sendMg(world, a, 'seat', 0);
        run(world, 0.1);
        leave(world, a);

        expect(station?.cycle).toBeNull();
        expect(mg(world).seated).not.toBeNull();

        shelveKeg(world);
        onInteract(world, standOn(world, 'session-0', [13, 9]));
        world.state.clock += 4;
        run(world, 0.1);

        expect(station?.cycle).not.toBeNull();
        expect(mg(world).phase).toBe('pour');
    });

    it('spills on A tile and destroys the keg when A bails mid-pour', () => {
        const { world, a } = crewedJig();

        shelveKeg(world);
        sendMg(world, a, 'seat', 0);
        run(world, 0.1);
        leave(world, a);

        expect(world.isSpill(13, 9)).toBe(true);
        expect(shelved(world, 'keg')).toBe(0);
        expect([...world.state.items.values()].some((item) => item.type === 'keg')).toBe(false);
    });
});
