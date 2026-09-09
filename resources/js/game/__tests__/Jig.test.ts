import { MAX_INPUT_BACKDATE_S, type JigMg, type PourConfig, type TossConfig } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    JIG_COLOURS,
    bKeyOp,
    bandsAround,
    beatMarks,
    casingDings,
    fractionIn,
    fuseLabel,
    isFrozen,
    jigOverlay,
    knotMarkers,
    laneFor,
    moveCursor,
    parseJigMg,
    phaseSpan,
    pickerBlock,
    popFor,
    pourBands,
    primeFlash,
    readShelf,
    roleOf,
    spaceOp,
    tossBands,
} from '../minigames/Jig';

/**
 * The Jig overlay's decisions (F08 §Client). Everything the panel draws is a
 * function of `StationState.mg` and the server clock — the client judges
 * nothing — so the maths and the key map are tested here and the Phaser
 * drawing is left alone.
 */

const POUR: PourConfig = {
    beatsByQuality: { '1.0': 5, '0.7': 7, '0.4': 8 },
    perfectMs: 60,
    okMs: 140,
    primeKegWindowMultiplier: 1.5,
};

const TOSS: TossConfig = { arcSeconds: 0.5, perfectMs: 120, okMs: 250 };

function mg(overrides: Partial<JigMg> = {}): JigMg {
    return {
        tiles: { jig: [[13, 9]], rack: [[16, 9]], aisle: [15, 9] },
        a: 'A1',
        b: 'B1',
        phase: 'seat',
        bpm: 150,
        beatStartAt: 0,
        rearmFrom: 0,
        rearmAt: 0,
        seated: null,
        fill: 0,
        pour: null,
        keg: null,
        lanes: [],
        knotAt: [],
        knotIndex: 0,
        knotGrades: [],
        crimpClickAt: [],
        cradle: 'empty',
        cradleFuse: '',
        surfaceReadyAt: 0,
        bPhase: 'idle',
        bPick: 'long',
        bFetchDoneAt: 0,
        swingStartAt: 0,
        aisleBlocked: false,
        orderChip: [],
        last: null,
        primeAt: 0,
        ...overrides,
    };
}

describe('parseJigMg', () => {
    it('reads the panel the server wrote', () => {
        const parsed = parseJigMg(JSON.stringify(mg({ phase: 'knots', knotIndex: 2 })));

        expect(parsed?.phase).toBe('knots');
        expect(parsed?.knotIndex).toBe(2);
    });

    it('returns null for an empty, malformed or non-object blob', () => {
        expect(parseJigMg('')).toBeNull();
        expect(parseJigMg('{oops')).toBeNull();
        expect(parseJigMg('42')).toBeNull();
        expect(parseJigMg('null')).toBeNull();
    });
});

describe('roleOf', () => {
    it('gives the A panel to the operator and the B panel to the rack hand', () => {
        expect(roleOf(mg(), 'A1')).toBe('a');
        expect(roleOf(mg(), 'B1')).toBe('b');
    });

    it('gives a helper, a stranger and an empty seat the spectator panel', () => {
        expect(roleOf(mg(), 'C1')).toBe('spectator');
        expect(roleOf(mg({ a: '', b: '' }), '')).toBe('spectator');
    });
});

describe('readShelf', () => {
    const lookup = (id: string): { type: string; dents: number } | undefined =>
        ({
            'k-1': { type: 'keg', dents: 0 },
            'c-1': { type: 'casing', dents: 2 },
            'c-2': { type: 'casing', dents: 0 },
        })[id];

    it('keeps the casings in shelf order with the index the seat op needs', () => {
        expect(readShelf(['k-1', 'c-1', 'c-2'], lookup).casings).toEqual([
            { shelfIndex: 1, itemId: 'c-1', dents: 2 },
            { shelfIndex: 2, itemId: 'c-2', dents: 0 },
        ]);
    });

    it('counts the kegs the pour can draw on and skips an item it cannot see', () => {
        expect(readShelf(['k-1', 'gone', 'c-1'], lookup).kegs).toBe(1);
        expect(readShelf([], lookup)).toEqual({ casings: [], kegs: 0 });
    });
});

describe('casingDings', () => {
    it('draws one ding per dent up to the three the chip has room for', () => {
        expect(casingDings(0)).toBe(0);
        expect(casingDings(2)).toBe(2);
        expect(casingDings(9)).toBe(3);
    });
});

describe('moveCursor', () => {
    it('clamps at both ends rather than wrapping past the shelf', () => {
        expect(moveCursor(0, -1, 3)).toBe(0);
        expect(moveCursor(0, 1, 3)).toBe(1);
        expect(moveCursor(2, 1, 3)).toBe(2);
    });

    it('parks on the first chip when the cursor outlived the shelf it pointed at', () => {
        expect(moveCursor(7, 0, 3)).toBe(2);
        expect(moveCursor(2, 0, 0)).toBe(0);
    });
});

describe('pickerBlock', () => {
    const clear = {
        now: 10,
        rearmAt: 9,
        casings: 2,
        kegs: 1,
        keg: null,
        carrying: '',
    };

    it('says nothing when the seat is playable', () => {
        expect(pickerBlock(clear)).toBe('');
    });

    it('names the machine timer first, then the hands, then the supply', () => {
        expect(pickerBlock({ ...clear, rearmAt: 12, carrying: 's-1', casings: 0 })).toBe(
            'RE-ARMING',
        );
        expect(pickerBlock({ ...clear, carrying: 's-1', casings: 0 })).toBe('HANDS FULL');
        expect(pickerBlock({ ...clear, casings: 0 })).toBe('NO CASINGS');
    });

    it('reads powder from the keg on the jig before the shelf', () => {
        expect(pickerBlock({ ...clear, kegs: 0 })).toBe('NO POWDER');
        expect(pickerBlock({ ...clear, kegs: 0, keg: { poursLeft: 1 } })).toBe('');
        expect(pickerBlock({ ...clear, kegs: 0, keg: { poursLeft: 0 } })).toBe('NO POWDER');
    });
});

describe('phaseSpan', () => {
    it('spans the re-arm bar while the machine resets and nothing once it is armed', () => {
        expect(phaseSpan(mg({ phase: 'seat', rearmFrom: 4, rearmAt: 7 }))).toEqual({
            from: 4,
            to: 7,
        });
        expect(phaseSpan(mg({ phase: 'seat', rearmFrom: 4, rearmAt: 4 }))).toBeNull();
    });

    it('spans the pour from the first beat to the overfill point', () => {
        const span = phaseSpan(
            mg({
                phase: 'pour',
                pour: { startAt: 100, targetAt: 102, beats: 5, primeKeg: false },
            }),
        );

        expect(span).toEqual({ from: 100, to: 102.4 });
    });

    it('spans the knots to the last marker and the crimp to the third click', () => {
        expect(
            phaseSpan(mg({ phase: 'knots', beatStartAt: 102.4, knotAt: [102.8, 103.2, 103.6] })),
        ).toEqual({ from: 102.4, to: 103.6 });
        expect(
            phaseSpan(
                mg({ phase: 'crimp', beatStartAt: 103.6, crimpClickAt: [103.8, 104, 104.2] }),
            ),
        ).toEqual({ from: 103.6, to: 104.2 });
    });

    it('spans the surface tax while a set squares up and nothing while the cradle is empty', () => {
        expect(phaseSpan(mg({ phase: 'parts', cradle: 'surface', surfaceReadyAt: 12 }))).toEqual({
            from: 11.5,
            to: 12,
        });
        expect(phaseSpan(mg({ phase: 'parts' }))).toBeNull();
    });

    it('spans nothing for a pour that has no keg to pour', () => {
        expect(phaseSpan(mg({ phase: 'pour' }))).toBeNull();
    });
});

describe('fractionIn', () => {
    it('clamps to the span it is given', () => {
        expect(fractionIn(10, 20, 15)).toBe(0.5);
        expect(fractionIn(10, 20, 5)).toBe(0);
        expect(fractionIn(10, 20, 99)).toBe(1);
    });

    it('reads a span of no length as finished', () => {
        expect(fractionIn(10, 10, 10)).toBe(1);
    });
});

describe('beatMarks', () => {
    it('ticks once per beat from the first beat to the mark', () => {
        const marks = beatMarks({ startAt: 100, targetAt: 102, beats: 5, primeKeg: false }, 150);

        expect(marks).toHaveLength(6);
        expect(marks[0]).toBeCloseTo(100, 6);
        expect(marks[5]).toBeCloseTo(102, 6);
    });

    it('ticks seven times for a damp keg', () => {
        expect(
            beatMarks({ startAt: 0, targetAt: 2.8, beats: 7, primeKeg: false }, 150),
        ).toHaveLength(8);
    });
});

describe('bandsAround', () => {
    it('turns a millisecond window into clock seconds either side of the mark', () => {
        expect(bandsAround(102, { perfectMs: 60, okMs: 140 })).toEqual({
            mark: 102,
            perfect: { from: 101.94, to: 102.06 },
            ok: { from: 101.86, to: 102.14 },
        });
    });
});

describe('pourBands', () => {
    it('widens the band by the prime-keg multiplier the server judges with', () => {
        const plain = pourBands({ startAt: 0, targetAt: 2, beats: 5, primeKeg: false }, POUR);
        const prime = pourBands({ startAt: 0, targetAt: 2, beats: 5, primeKeg: true }, POUR);

        expect(plain.perfect.to - plain.mark).toBeCloseTo(0.06, 6);
        expect(prime.perfect.to - prime.mark).toBeCloseTo(0.09, 6);
        expect(prime.ok.to - prime.mark).toBeCloseTo(0.21, 6);
    });
});

describe('tossBands', () => {
    it('marks the release at the top of the arc and closes it after the OK window', () => {
        const bands = tossBands(10, TOSS);

        expect(bands.mark).toBeCloseTo(10.5, 6);
        expect(bands.close).toBeCloseTo(10.5 + 0.25 + MAX_INPUT_BACKDATE_S, 6);
        expect(bands.ok.from).toBeCloseTo(10.25, 6);
    });
});

describe('knotMarkers', () => {
    it('pairs each marker with its lane and the grade it earned', () => {
        expect(
            knotMarkers(
                mg({
                    lanes: ['l', 'r', 'l'],
                    knotAt: [1, 1.4, 1.8],
                    knotIndex: 2,
                    knotGrades: ['perfect', 'miss'],
                }),
            ),
        ).toEqual([
            { at: 1, lane: 'l', grade: 'perfect' },
            { at: 1.4, lane: 'r', grade: 'miss' },
            { at: 1.8, lane: 'l', grade: null },
        ]);
    });
});

describe('popFor', () => {
    it('says nothing before the first judgement', () => {
        expect(popFor(null)).toBeNull();
    });

    it('reads the grade and spells the note out', () => {
        expect(popFor({ who: 'a', step: 'pour', grade: 'perfect', note: '', at: 1 })).toEqual({
            text: 'PERFECT',
            colour: JIG_COLOURS.perfect,
        });
        expect(popFor({ who: 'a', step: 'pour', grade: 'ok', note: 'late', at: 1 })).toEqual({
            text: 'OK — LATE',
            colour: JIG_COLOURS.ok,
        });
        expect(popFor({ who: 'a', step: 'knot', grade: 'miss', note: 'lane', at: 1 })).toEqual({
            text: 'MISS — WRONG LANE',
            colour: JIG_COLOURS.miss,
        });
        expect(popFor({ who: 'b', step: 'toss', grade: 'miss', note: 'body', at: 1 })?.text).toBe(
            'MISS — BODY IN THE AISLE',
        );
        expect(popFor({ who: 'b', step: 'toss', grade: 'miss', note: 'full', at: 1 })?.text).toBe(
            'MISS — FULL',
        );
    });
});

describe('the key map', () => {
    it('sends A the op the phase is waiting for', () => {
        expect(spaceOp('seat')).toBe('seat');
        expect(spaceOp('pour')).toBe('pour');
        expect(spaceOp('crimp')).toBe('crimp');
        expect(spaceOp('parts')).toBeNull();
        expect(spaceOp('knots')).toBeNull();
    });

    it('reads the knot lanes off the arrows', () => {
        expect(laneFor('left')).toBe('l');
        expect(laneFor('right')).toBe('r');
        expect(laneFor('space')).toBeNull();
    });

    it('walks B from fetch to swing on the way down and tosses on the way up', () => {
        expect(bKeyOp('idle', true)).toBe('fetch');
        expect(bKeyOp('holding', true)).toBe('swing');
        expect(bKeyOp('swinging', false)).toBe('toss');
        expect(bKeyOp('swinging', true)).toBeNull();
        expect(bKeyOp('idle', false)).toBeNull();
        expect(bKeyOp('fetching', true)).toBeNull();
    });
});

describe('primeFlash', () => {
    it('flares at the moment the stick is judged and fades over 0.6 s', () => {
        expect(primeFlash(100, 100)).toBe(1);
        expect(primeFlash(100, 100.3)).toBeCloseTo(0.5, 6);
        expect(primeFlash(100, 100.6)).toBe(0);
    });

    it('never flashes for a station that has not made one', () => {
        expect(primeFlash(0, 100)).toBe(0);
        expect(primeFlash(100, 99)).toBe(0);
    });
});

describe('isFrozen', () => {
    it('holds the needle through an interrupt and a blocked span', () => {
        expect(isFrozen({ state: 'working', pausedUntil: 12 }, 11)).toBe(true);
        expect(isFrozen({ state: 'jammed', pausedUntil: 0 }, 11)).toBe(true);
        expect(isFrozen({ state: 'damaged', pausedUntil: 0 }, 11)).toBe(true);
        expect(isFrozen({ state: 'working', pausedUntil: 12 }, 12)).toBe(false);
    });
});

describe('fuseLabel', () => {
    it('names the spool B picked and says nothing for an empty cradle', () => {
        expect(fuseLabel('short')).toBe('SHORT');
        expect(fuseLabel('long')).toBe('LONG');
        expect(fuseLabel('')).toBe('—');
    });
});

describe('jigOverlay', () => {
    it('captures the arrows and consumes nothing before it is mounted', () => {
        const overlay = jigOverlay();

        expect(overlay.capturesMovement).toBe(true);
        expect(overlay.onKey('left', true, false)).toBe(false);
        expect(overlay.onKey('space', true, false)).toBe(false);
        expect(overlay.onKey('esc', true, false)).toBe(false);
    });

    it('builds a fresh overlay per call so two jigs never share a cursor', () => {
        expect(jigOverlay()).not.toBe(jigOverlay());
    });
});
