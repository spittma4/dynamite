import {
    MAX_INPUT_BACKDATE_S,
    type AssemblyMinigame,
    type JigGrade,
    type JigMg,
    type PlayerState,
    type PourConfig,
    type StationState,
    type TossConfig,
    crimpClicks,
} from '@shared';
import { describe, expect, it } from 'vitest';

import { FUSE_SET, HANDS_FULL } from '../nouns';
import { rackCaption } from '../render/fuseRack';

import {
    AISLE_BODY,
    AISLE_ITEM,
    CASINGS_COMING,
    CLICK_FLASH_SECONDS,
    CRADLE_FULL,
    CRADLE_LABEL,
    JIG_COLOURS,
    type JigSpan,
    KEG_STRIP,
    NEED_KEG,
    ORDER_STRIP_LABEL,
    RACK_STAKE,
    RE_ARMING,
    SHELF_FULL,
    SHELF_FULL_HANDS,
    bKeyOp,
    bandsAround,
    blockColour,
    beatMarks,
    casingDings,
    clickFlash,
    closeAt,
    fractionIn,
    fuseLabel,
    gradeCue,
    isFrozen,
    jigOverlay,
    jigPulses,
    knotMarkers,
    laneFor,
    moveCursor,
    parseJigMg,
    phaseSpan,
    phraseKey,
    pickerBlock,
    pickerCarrying,
    popFor,
    pourBands,
    primeFlash,
    readShelf,
    kegRoute,
    kegSource,
    roleOf,
    spaceOp,
    tossBands,
} from '../minigames/Jig';
import type { OverlayContext } from '../minigames/types';
import { pluralOf } from '../render/dropTargets';
import { shortageOf } from '../render/intake';

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

const CFG: AssemblyMinigame = {
    pour: POUR,
    knots: { long: 3, short: 2, secondsPerKnot: 0.4, perfectMs: 60, okMs: 140 },
    crimp: { clicks: 3, leadSeconds: 0.4, clickSeconds: 0.4, perfectMs: 80, okMs: 180 },
    toss: TOSS,
};

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
        bPickFromOrder: false,
        bFetchDoneAt: 0,
        swingStartAt: 0,
        aisleBlocked: false,
        orderChip: [],
        last: null,
        primeAt: 0,
        ...overrides,
    };
}

/** `phaseSpan` is nullable; every phase these tests span is a running one. */
function span(state: JigMg): JigSpan {
    const found = phaseSpan(state, CFG);

    if (found === null) throw new Error('the phase has no span');

    return found;
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

/** The panel writes CSS colours; the tests compare against the palette. */
function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

describe('pickerBlock', () => {
    const clear = {
        now: 10,
        rearmAt: 9,
        casings: 2,
        kegs: 1,
        room: 4,
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
        expect(pickerBlock({ ...clear, casings: 0 })).toBe(CASINGS_COMING);
    });

    it('calls an empty casing rail a wait, in the words the floor uses', () => {
        expect(CASINGS_COMING).toBe(`${pluralOf('casing')} COMING`);
        expect(CASINGS_COMING).toBe('CASINGS COMING');
    });

    it('reads powder from the keg on the jig before the shelf', () => {
        expect(pickerBlock({ ...clear, kegs: 0 })).toBe(NEED_KEG);
        expect(pickerBlock({ ...clear, kegs: 0, keg: { poursLeft: 1 } })).toBe('');
        expect(pickerBlock({ ...clear, kegs: 0, keg: { poursLeft: 0 } })).toBe(NEED_KEG);
    });

    it('sends the hauler out before it asks anybody to stand and wait', () => {
        expect(pickerBlock({ ...clear, casings: 0, kegs: 0 })).toBe(NEED_KEG);
    });

    it('never promises a casing the shelf has no room to take', () => {
        expect(pickerBlock({ ...clear, casings: 0, kegs: 8, room: 0 })).toBe(SHELF_FULL);
    });

    it('names the keg, and leaves the machine to the route line', () => {
        expect(NEED_KEG).toBe('NEED A KEG');
        expect(NEED_KEG).toContain('KEG');
    });
});

/**
 * Red is this floor's word for a fault: it is the miss grade, the overfill, the
 * red beacon and the blast. Two of the five things that grey the picker out are
 * not faults and are nobody's errand — the jig is re-arming itself, or printing
 * its own casings — and painting those red told a player who had done nothing
 * wrong that they had, at the one moment the game most needed them to stand
 * still. Waits get their own colour; a shortage somebody has to move for keeps
 * the red.
 */
describe('blockColour', () => {
    it('paints the two stops nobody can hurry as waits', () => {
        expect(blockColour(RE_ARMING)).toBe(JIG_COLOURS.wait);
        expect(blockColour(CASINGS_COMING)).toBe(JIG_COLOURS.wait);
    });

    it('keeps the alarm for the three that need somebody to move', () => {
        expect(blockColour(NEED_KEG)).toBe(JIG_COLOURS.miss);
        expect(blockColour(SHELF_FULL)).toBe(JIG_COLOURS.miss);
        expect(blockColour(HANDS_FULL)).toBe(JIG_COLOURS.miss);
    });

    it('is a colour of its own, not the alarm and not the panel grey', () => {
        expect(JIG_COLOURS.wait).not.toBe(JIG_COLOURS.miss);
        expect(JIG_COLOURS.wait).not.toBe(JIG_COLOURS.dim);
        expect(JIG_COLOURS.wait).not.toBe(JIG_COLOURS.label);
        expect(JIG_COLOURS.wait).not.toBe(JIG_COLOURS.ok);
    });

    /**
     * The hole the first wait colour fell through. Teal 0x2bb5a0 against the OK
     * green 0x4cb944 is 1.01:1 — the same brightness — and the two are drawn
     * touching: `drawPicker` writes RE-ARMING in `wait` and fills the re-arm
     * progress bar in `ok` directly beneath it. To a deuteranope both went
     * neutral olive, so the colour chosen to read as 'neither the alarm nor the
     * OK green' read as the OK green. Separation has to be in luminance, which
     * survives every kind of colour blindness; the identity check above cannot
     * see it, which is why this exists as well.
     */
    it('separates by brightness from the green under it and the red it replaces', () => {
        expect(contrastOf(JIG_COLOURS.wait, JIG_COLOURS.ok)).toBeGreaterThanOrEqual(1.4);
        expect(contrastOf(JIG_COLOURS.wait, JIG_COLOURS.miss)).toBeGreaterThanOrEqual(1.4);
    });
});

/** sRGB relative luminance (WCAG 2.1) of a packed 0xrrggbb. */
function luminanceOf(colour: number): number {
    const linear = [16, 8, 0]
        .map((shift) => ((colour >> shift) & 0xff) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

    return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrastOf(a: number, b: number): number {
    const [high, low] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);

    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

/** The colour on the glass, not just the branch that picks it. */
describe('the colour a stopped picker is painted in', () => {
    const keg = { id: 'k-1', type: 'keg' };
    const casing = { id: 'c-1', type: 'casing' };

    function blockLabel(state: JigMg, shelf: readonly { id: string; type: string }[]) {
        return panelLabels(state, shelf).find((label) =>
            [RE_ARMING, CASINGS_COMING, NEED_KEG, SHELF_FULL, HANDS_FULL].includes(label.text),
        );
    }

    it('draws a re-arming jig in the wait colour', () => {
        const label = blockLabel(mg({ rearmFrom: 8, rearmAt: 12 }), [keg, casing]);

        expect(label?.text).toBe(RE_ARMING);
        expect(label?.colour).toBe(hex(JIG_COLOURS.wait));
    });

    it('draws a jig short of powder in the alarm colour', () => {
        const label = blockLabel(mg(), [casing]);

        expect(label?.text).toBe(NEED_KEG);
        expect(label?.colour).toBe(hex(JIG_COLOURS.miss));
    });
});

/**
 * The panel and the paint under the player's feet are two renderings of one
 * shelf. A playtester who reads “CASINGS COMING” inside while the floor says
 * the shelf is jammed has been told the machine is fine by the surface that
 * knows least, so the two sentences are pinned to each other here.
 */
describe('the panel and the floor sign agree about the shelf', () => {
    const station = {
        id: 'assembly',
        type: 'assembly',
        anchor: [12, 6],
        workTiles: [[13, 8]],
        rackTiles: [[16, 8]],
        inputShelf: { tile: [11, 7], capacity: 8, accepts: ['keg', 'casing'] },
    } as unknown as Parameters<typeof shortageOf>[0];

    it('uses one sentence for a shelf with no room left', () => {
        const packed = Array.from({ length: 8 }, () => 'keg' as const);

        expect(shortageOf(station, packed, null)?.sentence).toBe(SHELF_FULL);
    });

    it('uses one sentence for a restock that can actually happen', () => {
        expect(shortageOf(station, ['keg'], null)?.sentence).toBe(CASINGS_COMING);
    });

    it('names the same object when the keg is the thing missing', () => {
        expect(shortageOf(station, ['casing'], null)?.sentence).toContain('KEG');
        expect(NEED_KEG).toContain('KEG');
    });
});

describe('kegSource and kegRoute', () => {
    const level = {
        stations: [
            { id: 'powder-a', type: 'boom_powder' },
            { id: 'assembly-a', type: 'assembly' },
        ],
        recipes: { keg: { station: 'boom_powder', output: { type: 'keg' } } },
    } as unknown as Parameters<typeof kegSource>[0];

    it('reads the machine that makes kegs off the level, not off a constant', () => {
        expect(kegSource(level)).toBe('BOOM POWDER');
    });

    it('follows a level that makes its kegs somewhere else', () => {
        const moved = {
            stations: [{ id: 'assembly-a', type: 'assembly' }],
            recipes: { keg: { station: 'assembly', output: { type: 'keg' } } },
        } as unknown as Parameters<typeof kegSource>[0];

        expect(kegSource(moved)).toBe('ASSEMBLY');
    });

    it('spells the errand out in the words painted on the floor at each end', () => {
        const route = kegRoute('BOOM POWDER', 'KEGS IN');

        expect(route).toContain('ESC');
        expect(route).toContain('BOOM POWDER');
        expect(route).toContain('KEGS OUT');
        expect(route).toContain('striped');
    });
});

describe('pickerCarrying', () => {
    it('greys the picker out for the hands the seat is actually blocked by', () => {
        expect(pickerCarrying('a', 'k-1')).toBe('k-1');
        expect(pickerCarrying('a', '')).toBe('');
    });

    it('never reads a watcher’s own hands onto the panel it is watching', () => {
        expect(pickerCarrying('spectator', 'k-1')).toBe('');
        expect(pickerCarrying('b', 'k-1')).toBe('');
    });
});

describe('phaseSpan', () => {
    it('spans the re-arm bar while the machine resets and nothing once it is armed', () => {
        expect(phaseSpan(mg({ phase: 'seat', rearmFrom: 4, rearmAt: 7 }), CFG)).toEqual({
            from: 4,
            to: 7,
        });
        expect(phaseSpan(mg({ phase: 'seat', rearmFrom: 4, rearmAt: 4 }), CFG)).toBeNull();
    });

    it('spans the pour from the first beat to the overfill point', () => {
        const span = phaseSpan(
            mg({
                phase: 'pour',
                pour: { startAt: 100, targetAt: 102, beats: 5, primeKeg: false },
            }),
            CFG,
        );

        expect(span).toEqual({ from: 100, to: 102.4 });
    });

    // The tails are literals matching CFG's okMs — 140 ms and 180 ms — rather
    // than `CFG.knots.okMs / 1000`, which only restates the input: a change to
    // which config field `phaseSpan` reads would be absorbed instead of caught.
    it('runs the knots and the crimp on to the beat the server auto-misses at', () => {
        const knots = phaseSpan(
            mg({ phase: 'knots', beatStartAt: 102.4, knotAt: [102.8, 103.2, 103.6] }),
            CFG,
        );
        const crimp = phaseSpan(
            mg({ phase: 'crimp', beatStartAt: 103.6, crimpClickAt: [103.8, 104, 104.2] }),
            CFG,
        );

        expect(knots?.from).toBe(102.4);
        expect(knots?.to).toBeCloseTo(103.6 + 0.14 + MAX_INPUT_BACKDATE_S, 6);
        expect(crimp?.from).toBe(103.6);
        expect(crimp?.to).toBeCloseTo(104.2 + 0.18 + MAX_INPUT_BACKDATE_S, 6);
    });

    it('spans the surface tax while a set squares up and nothing while the cradle is empty', () => {
        expect(
            phaseSpan(mg({ phase: 'parts', cradle: 'surface', surfaceReadyAt: 12 }), CFG),
        ).toEqual({ from: 11.5, to: 12 });
        expect(phaseSpan(mg({ phase: 'parts' }), CFG)).toBeNull();
    });

    it('spans nothing for a pour that has no keg to pour', () => {
        expect(phaseSpan(mg({ phase: 'pour' }), CFG)).toBeNull();
    });
});

describe('closeAt', () => {
    it('closes a beat one OK window plus the backdate clamp after it', () => {
        expect(closeAt(10, 140)).toBeCloseTo(10.14 + MAX_INPUT_BACKDATE_S, 6);
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
        // Was 'MISS — FULL', while the badge beside it read 'CRADLE FULL'.
        expect(popFor({ who: 'b', step: 'toss', grade: 'miss', note: 'full', at: 1 })?.text).toBe(
            `MISS — ${CRADLE_FULL}`,
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
    it('holds the needle through a blocked span, which the server never shifts', () => {
        expect(isFrozen({ state: 'jammed' })).toBe(true);
        expect(isFrozen({ state: 'damaged' })).toBe(true);
        expect(isFrozen({ state: 'working' })).toBe(false);
    });

    /**
     * A paused tick still shifts every pending beat by its own `dt`, so the
     * marks walk forward in real time and the live clock is what holds the
     * needle still. Freezing the clock as well slides it backwards down a bar
     * the player is still looking at.
     */
    it('leaves the needle where it stands across a pause the server has shifted', () => {
        const paused = { state: 'working', pausedUntil: 12.5 };
        const before = span(mg({ phase: 'knots', beatStartAt: 10, knotAt: [11, 12] }));
        const shifted = span(mg({ phase: 'knots', beatStartAt: 11, knotAt: [12, 13] }));
        const at = (s: JigSpan, t: number): number => fractionIn(s.from, s.to, t);
        const held = 11;
        const now = isFrozen(paused) ? held : 12;

        expect(at(shifted, now)).toBeCloseTo(at(before, held), 10);
        expect(at(shifted, held)).toBe(0);
    });
});

describe('fuseLabel', () => {
    it('names the spool B picked and says nothing for an empty cradle', () => {
        expect(fuseLabel('short')).toBe('SHORT');
        expect(fuseLabel('long')).toBe('LONG');
        expect(fuseLabel('')).toBe('—');
    });
});

/**
 * The phrase as a rhythm (F18). The crimp is the reason this exists: three
 * static click lines at 2.5 Hz ask a player to count with their eyes, and the
 * fix is not a louder line — it is that the knots, the lead and the clicks are
 * already one unbroken 150 bpm grid, so the third click is the sixth pulse of a
 * bar you have been hearing for two seconds.
 */
describe('jigPulses', () => {
    it('ticks every beat of the pour and accents the mark itself', () => {
        const pour = { startAt: 10, targetAt: 12, beats: 5, primeKeg: false };
        const pulses = jigPulses(mg({ phase: 'pour', pour, beatStartAt: 10 }));

        expect(pulses.map((pulse) => pulse.cue)).toEqual([
            'tick',
            'tick',
            'tick',
            'tick',
            'tick',
            'tickAccent',
        ]);
        expect(pulses[5]?.at).toBeCloseTo(pour.targetAt, 9);
    });

    it('ticks the knots without accenting any of them — they are the grid', () => {
        const pulses = jigPulses(mg({ phase: 'knots', knotAt: [10.4, 10.8, 11.2] }));

        expect(pulses).toEqual([
            { at: 10.4, cue: 'tick' },
            { at: 10.8, cue: 'tick' },
            { at: 11.2, cue: 'tick' },
        ]);
    });

    it('accents the click the crimp is judged against and no other', () => {
        const pulses = jigPulses(mg({ phase: 'crimp', crimpClickAt: [11.6, 12, 12.4] }));

        expect(pulses).toEqual([
            { at: 11.6, cue: 'tick' },
            { at: 12, cue: 'tick' },
            { at: 12.4, cue: 'tickAccent' },
        ]);
    });

    it('joins the knots and the clicks into one unbroken grid', () => {
        const knots = [10.4, 10.8, 11.2];
        const clicks = crimpClicks(11.2, CFG.crimp.clicks, CFG.crimp.leadSeconds, CFG.crimp.clickSeconds);
        const phrase = [
            ...jigPulses(mg({ phase: 'knots', knotAt: knots })),
            ...jigPulses(mg({ phase: 'crimp', crimpClickAt: clicks })),
        ];
        const gaps = phrase.slice(1).map((pulse, i) => pulse.at - (phrase[i]?.at ?? 0));

        expect(phrase).toHaveLength(6);

        for (const gap of gaps) expect(gap).toBeCloseTo(60 / 150, 9);

        expect(phrase[5]?.cue).toBe('tickAccent');
    });

    it('has nothing to say in the phases with no beat in them', () => {
        expect(jigPulses(mg({ phase: 'seat' }))).toHaveLength(0);
        expect(jigPulses(mg({ phase: 'parts' }))).toHaveLength(0);
        expect(jigPulses(mg({ phase: 'pour', pour: null }))).toHaveLength(0);
        expect(jigPulses(mg({ phase: 'crimp', crimpClickAt: [] }))).toHaveLength(0);
    });
});

describe('phraseKey', () => {
    it('is the same through a phrase, so the beats are booked once', () => {
        const first = mg({ phase: 'knots', beatStartAt: 10, knotIndex: 0 });
        const later = mg({ phase: 'knots', beatStartAt: 10, knotIndex: 2 });

        expect(phraseKey(later)).toBe(phraseKey(first));
    });

    it('changes when the jig moves to a new phase or a new cycle', () => {
        const knots = mg({ phase: 'knots', beatStartAt: 10 });

        expect(phraseKey(mg({ phase: 'crimp', beatStartAt: 11.2 }))).not.toBe(phraseKey(knots));
        expect(phraseKey(mg({ phase: 'knots', beatStartAt: 20 }))).not.toBe(phraseKey(knots));
    });
});

describe('gradeCue', () => {
    it('gives each grade its own confirmation, so the difference is learnable', () => {
        expect(gradeCue('perfect')).toBe('perfect');
        expect(gradeCue('ok')).toBe('ok');
        expect(gradeCue('miss')).toBe('miss');
        expect(new Set(['perfect', 'ok', 'miss'].map((g) => gradeCue(g as JigGrade))).size).toBe(3);
    });
});

describe('clickFlash', () => {
    it('lights a click as the needle reaches it and lets go again', () => {
        expect(clickFlash(10, 9.9)).toBe(false);
        expect(clickFlash(10, 10)).toBe(true);
        expect(clickFlash(10, 10 + CLICK_FLASH_SECONDS / 2)).toBe(true);
        expect(clickFlash(10, 10 + CLICK_FLASH_SECONDS * 2)).toBe(false);
    });

    it('flashes for less than a beat, so two clicks are never lit at once', () => {
        expect(CLICK_FLASH_SECONDS).toBeLessThan(CFG.crimp.clickSeconds);
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

/** What one `Text` in the pool was last told to say, where, and whether it shows. */
interface WrittenLabel {
    text: string;
    visible: boolean;
    x: number;
    y: number;
    colour: string;
}

/** A Phaser object that answers every call it is not asked about with itself. */
function stub(target: Record<string, unknown>): Record<string, unknown> {
    const proxy: Record<string, unknown> = new Proxy(target, {
        get: (obj, prop) => (prop in obj ? obj[prop as string] : () => proxy),
    });

    return proxy;
}

function textStub(written: WrittenLabel[]): Record<string, unknown> {
    const label: WrittenLabel = { text: '', visible: false, x: 0, y: 0, colour: '' };

    written.push(label);

    return stub({
        setText: (value: string) => {
            label.text = value;
        },
        setVisible: (value: boolean) => {
            label.visible = value;
        },
        setPosition: (x: number, y: number) => {
            label.x = x;
            label.y = y;
        },
        setColor: (value: string) => {
            label.colour = value;
        },
    });
}

const PANEL_W = 896;
const PANEL_H = 192;

/**
 * The level the panel reads out of: the windows it draws with, the shelf it
 * counts room on, and the recipe that says which machine an errand ends at.
 */
const LEVEL = {
    stations: [
        {
            id: 'assembly',
            type: 'assembly',
            minigame: CFG,
            inputShelf: { tile: [11, 7], capacity: 8, accepts: ['keg', 'casing'] },
        },
        { id: 'powder-a', type: 'boom_powder', outputShelf: { tile: [6, 3], capacity: 6 } },
    ],
    recipes: { keg: { station: 'boom_powder', inputs: {}, output: { type: 'keg', pours: 2 } } },
};

/**
 * The panel one frame at a time. `pickerBlock` returning a sentence proves
 * nothing on its own — the picker and the pour each choose whether to write it
 * — so the overlay is mounted on a recording `Text` pool and the frame is read
 * back as the words a player would actually be looking at.
 */
function panelLabels(
    state: JigMg,
    shelf: readonly { id: string; type: string }[],
    over: { carrying?: string; now?: number; sessionId?: string } = {},
): WrittenLabel[] {
    const written: WrittenLabel[] = [];
    const now = over.now ?? 10;
    const station = {
        mg: JSON.stringify(state),
        state: 'running',
        inputShelf: shelf.map((item) => item.id),
        inputCap: 8,
    };
    const ctx = stub({
        scene: stub({
            add: stub({
                text: () => textStub(written),
                graphics: () => stub({}),
            }),
            conn: { config: { level: LEVEL } },
        }),
        container: stub({}),
        width: PANEL_W,
        height: PANEL_H,
        stationId: 'assembly',
        sessionId: over.sessionId ?? 'A1',
        state: {
            stations: new Map([['assembly', station]]),
            items: new Map(shelf.map((item) => [item.id, { type: item.type, dents: 0 }])),
        },
        serverClock: () => now,
    }) as unknown as OverlayContext;

    const overlay = jigOverlay();

    overlay.mount(ctx);
    overlay.update(
        station as unknown as StationState,
        { carrying: over.carrying ?? '' } as unknown as PlayerState,
        now,
    );

    return written.filter((label) => label.visible);
}

function panelText(
    state: JigMg,
    shelf: readonly { id: string; type: string }[],
    over: { carrying?: string; now?: number; sessionId?: string } = {},
): string[] {
    return panelLabels(state, shelf, over).map((label) => label.text);
}

describe('the words a stopped jig puts on the panel', () => {
    const casing = { id: 'c-1', type: 'casing' };
    const keg = { id: 'k-1', type: 'keg' };

    it('tells a seat with no casing to wait, because the jig prints its own', () => {
        const lines = panelText(mg(), [keg]);

        expect(lines).toContain(CASINGS_COMING);
        expect(lines.join(' ')).not.toContain('NO CASINGS');
    });

    it('sends a seat with no keg to the machine that makes one', () => {
        const lines = panelText(mg(), [casing]);

        expect(lines).toContain(NEED_KEG);
    });

    it('says the same thing when the pour has nothing to pour', () => {
        const lines = panelText(mg({ phase: 'pour', pour: null }), [casing]);

        expect(lines).toContain(NEED_KEG);
        expect(lines.join(' ')).not.toContain('NO POWDER');
    });

    it('never gives the empty casing rail a second name of its own', () => {
        const waiting = panelText(mg({ rearmFrom: 8, rearmAt: 12 }), [keg]);

        expect(waiting).toContain('RE-ARMING');
        expect(waiting).toContain(CASINGS_COMING);
        expect(waiting.join(' ')).not.toContain('SHELF EMPTY');
        expect(panelText(mg(), [keg]).filter((line) => line === CASINGS_COMING)).toHaveLength(1);
    });
});

describe('the route out of a stopped jig', () => {
    const casing = { id: 'c-1', type: 'casing' };
    const keg = { id: 'k-1', type: 'keg' };

    it('spells out the walk instead of naming a station and stopping', () => {
        const lines = panelText(mg(), [casing]);

        expect(lines).toContain(NEED_KEG);
        expect(lines).toContain(kegRoute('BOOM POWDER', 'KEGS IN'));
    });

    it('gives the seat every verb the errand takes', () => {
        const route = panelText(mg(), [casing]).find((line) => line.includes('ESC'));

        expect(route).toBeDefined();
        expect(route).toContain('walk to BOOM POWDER');
        expect(route).toContain('KEGS OUT');
        expect(route).toContain('striped');
    });

    /**
     * The route used to live inside `drawPicker` alone, so an operator who
     * joined during `pour` with no keg read a bare NEED A KEG and was given no
     * way out of it — the same player, the same problem, half the answer. The
     * shortage and the route are one sentence now, wherever it is printed.
     */
    it('gives the pour that has nothing to pour the same walk', () => {
        const lines = panelText(mg({ phase: 'pour', pour: null }), [casing]);

        expect(lines).toContain(NEED_KEG);
        expect(lines).toContain(kegRoute('BOOM POWDER', 'KEGS IN'));
    });

    it('keeps the route off a machine that is not short of a keg', () => {
        const lines = panelText(mg({ phase: 'knots' }), [casing, keg]);

        expect(lines.some((line) => line.includes('walk to'))).toBe(false);
    });

    /**
     * `putDownItem` (game-server/src/sim/items.ts) shelves onto the tile the
     * player is FACING, and the apron is two tiles — the shelf and the aisle you
     * stand in. 'E in the striped zone' is true only from one of them, looking at
     * the other, and nothing on screen said so.
     */
    it('says which way to be looking, not just where to stand', () => {
        const route = kegRoute('BOOM POWDER', 'KEGS IN');

        expect(route).toContain('face KEGS IN');
        expect(route).toContain('striped');
    });
});

describe('the promise a packed shelf cannot keep', () => {
    const packed = Array.from({ length: 8 }, (_, i) => ({ id: `k-${i}`, type: 'keg' }));

    it('tells a jammed restock to lift a keg back off, the way the floor does', () => {
        const lines = panelText(mg(), packed);

        expect(lines).toContain(SHELF_FULL);
        expect(lines).not.toContain(CASINGS_COMING);
    });

    it('still promises the restock while there is room to make it', () => {
        const lines = panelText(mg(), [{ id: 'k-1', type: 'keg' }]);

        expect(lines).toContain(CASINGS_COMING);
        expect(lines).not.toContain(SHELF_FULL);
    });
});

describe('the pour that has everything it needs', () => {
    const casing = { id: 'c-1', type: 'casing' };

    it('never sends the operator away from a machine that is about to pour', () => {
        const lines = panelText(
            mg({ phase: 'pour', pour: null, keg: { quality: 1, prime: false, poursLeft: 2 } }),
            [casing],
        );

        expect(lines).not.toContain(NEED_KEG);
        expect(lines).toContain('STARTING THE POUR');
    });

    it('reads a keg waiting on the shelf as a pour about to start too', () => {
        const lines = panelText(mg({ phase: 'pour', pour: null }), [
            casing,
            { id: 'k-1', type: 'keg' },
        ]);

        expect(lines).not.toContain(NEED_KEG);
        expect(lines).toContain('STARTING THE POUR');
    });
});

describe('one name for the thing B fetches', () => {
    const keg = { id: 'k-1', type: 'keg' };
    const casing = { id: 'c-1', type: 'casing' };

    const frames = (): string[] =>
        [
            panelText(mg({ phase: 'parts' }), [keg, casing]),
            panelText(mg({ bPhase: 'idle' }), [keg, casing], { sessionId: 'B1' }),
            panelText(mg({ bPhase: 'fetching', bFetchDoneAt: 11 }), [keg, casing], {
                sessionId: 'B1',
            }),
        ].flat();

    it('calls it a fuse set wherever it is named', () => {
        for (const line of frames()) {
            expect(line).not.toContain('SPOOL');

            if (line.includes('SET')) expect(line).toContain(FUSE_SET);
        }
    });

    it('names the phase after the fuse rather than after “parts”', () => {
        const lines = panelText(mg({ phase: 'parts' }), [keg, casing]);

        expect(lines).toContain(FUSE_SET);
        expect(lines.join(' ')).not.toContain('PARTS');
    });

    it('puts the fuse on the rack’s own title', () => {
        const lines = panelText(mg(), [keg, casing], { sessionId: 'B1' });

        expect(lines).toContain('ASSEMBLY — THE FUSE RACK');
    });
});

describe('what the rack hand and the watcher are told about the keg', () => {
    const casing = { id: 'c-1', type: 'casing' };
    const keg = { id: 'k-1', type: 'keg' };

    it('tells the rack hand the station is standing still for a keg', () => {
        const lines = panelText(mg(), [casing], { sessionId: 'B1' });

        expect(lines).toContain(KEG_STRIP);
    });

    it('says nothing about kegs to a rack hand whose shelf has one', () => {
        const lines = panelText(mg(), [casing, keg], { sessionId: 'B1' });

        expect(lines).not.toContain(KEG_STRIP);
    });

    it('tells a watcher mid-cycle the same thing', () => {
        const lines = panelText(
            mg({ phase: 'pour', pour: { startAt: 8, targetAt: 12, beats: 5, primeKeg: false } }),
            [casing],
            { sessionId: 'C1' },
        );

        expect(lines).toContain(KEG_STRIP);
    });

    it('gives a watcher the same four presses the operator gets', () => {
        const lines = panelText(mg(), [casing], { sessionId: 'C1' });

        expect(lines.join(' ')).not.toContain('staffing curve');
        expect(lines).toContain(KEG_STRIP);
        expect(lines).toContain(kegRoute('BOOM POWDER', 'KEGS IN'));
    });
});

describe('where the legend sits', () => {
    const keg = { id: 'k-1', type: 'keg' };
    const casing = { id: 'c-1', type: 'casing' };

    const legendY = (sessionId: string): number => {
        const label = panelLabels(mg(), [keg, casing], { sessionId }).find((written) =>
            written.text.includes('ESC bail'),
        );

        if (!label) throw new Error('the panel drew no legend');

        return label.y;
    };

    it('leaves the bottom band of the panel to the HUD’s help hint', () => {
        expect(PANEL_H - legendY('A1')).toBeGreaterThanOrEqual(24);
        expect(PANEL_H - legendY('B1')).toBeGreaterThanOrEqual(24);
    });
});

describe('the fuse rack as a first-timer reads it', () => {
    const keg = { id: 'k-1', type: 'keg' };
    const casing = { id: 'c-1', type: 'casing' };

    const rack = (over: Partial<JigMg> = {}): string[] =>
        panelText(mg(over), [keg, casing], { sessionId: 'B1' });

    /**
     * The panel said what B's keys did and nothing about why. Nothing on it
     * named the receiver, the stake, or what the order chips had to do with the
     * SHORT/LONG press — the word 'cradle' appeared only behind the H key.
     */
    it('names who the toss is for and what is waiting on it', () => {
        expect(rack()).toContain(RACK_STAKE);
        expect(RACK_STAKE.toLowerCase()).toContain('cradle');
    });

    it('labels the order strip so the chips read as the reason for the press', () => {
        const lines = rack({
            orderChip: [
                { orderId: 'o-1', fuseLength: 'short' },
                { orderId: 'o-2', fuseLength: 'long' },
            ],
        });

        expect(lines).toContain(ORDER_STRIP_LABEL);
        expect(lines.join(' ')).toContain('SHORT');
        expect(lines.join(' ')).toContain('LONG');
    });

    /**
     * The defect F15 went after. `reconcileRoles` sets `state.bPick` from
     * `view.orders[0]` the moment a body takes the rack tile
     * (`shared/src/sim/jig.ts:575`), so the pick is already correct — but
     * nothing on the panel connected the lit bin to the order chip two rows
     * above it, and it read as "LONG is selected" rather than "the order wants
     * LONG and it is already selected". A first-time B never learned that the
     * choice existed, was meaningful, or was currently right.
     */
    it('says the order has already picked the fuse, in the bins row', () => {
        const lines = rack({
            bPick: 'long',
            bPickFromOrder: true,
            orderChip: [{ orderId: 'o-1', fuseLength: 'long' }],
        });

        expect(lines).toContain(rackCaption('long', 'long', true).text);
    });

    /**
     * The same bin, the opposite claim: an order-derived pick follows the next
     * rollover on its own and B's does not, so the panel says which one is on
     * screen rather than taking credit for a press B made.
     */
    it('credits B once B has overridden the pre-pick', () => {
        const lines = rack({
            bPick: 'long',
            bPickFromOrder: false,
            orderChip: [{ orderId: 'o-1', fuseLength: 'long' }],
        });

        expect(lines).toContain(rackCaption('long', 'long', false).text);
        expect(lines).not.toContain(rackCaption('long', 'long', true).text);
    });

    it('names the length the order wants when the pick is on the other bin', () => {
        const lines = rack({
            bPick: 'long',
            orderChip: [{ orderId: 'o-1', fuseLength: 'short' }],
        });

        expect(lines).toContain(rackCaption('long', 'short', false).text);
    });

    it('says nothing about a want while the board is empty', () => {
        const lines = rack({ bPick: 'long', orderChip: [] });

        expect(lines).not.toContain(rackCaption('long', 'long', true).text);
    });

    // 'o-1' is the database's name for an order, not the player's.
    it('never puts a raw order id on the panel', () => {
        const lines = rack({
            orderChip: [
                { orderId: 'o-1', fuseLength: 'short' },
                { orderId: 'o-2', fuseLength: 'long' },
            ],
        }).join(' ');

        expect(lines).not.toContain('o-1');
        expect(lines).not.toContain('o-2');
        expect(lines).toContain('1st');
        expect(lines).toContain('2nd');
    });
});

describe('the words the jig uses for its own state', () => {
    const keg = { id: 'k-1', type: 'keg' };
    const casing = { id: 'c-1', type: 'casing' };

    /**
     * `CRADLE ${mg.cradle.toUpperCase()}` leaked the sim's own enum onto the
     * panel: 'SURFACE' is `shared/src/sim/jig.ts`'s name for an OK toss that
     * landed askew, and no player can decode it.
     */
    it('gives every cradle state a word rather than the enum behind it', () => {
        for (const cradle of ['empty', 'armed', 'surface'] as const) {
            const lines = panelText(mg({ phase: 'parts', cradle }), [keg, casing]);

            expect(lines).toContain(CRADLE_LABEL[cradle]);
            expect(lines.join(' ')).not.toContain('SURFACE');
            expect(lines.join(' ')).not.toContain('ARMED');
        }
    });

    it('reads the fill as a percentage rather than a raw fraction', () => {
        const lines = panelText(
            mg({
                phase: 'pour',
                pour: { startAt: 8, targetAt: 12, beats: 5, primeKeg: false },
            }),
            [keg, casing],
            { now: 10 },
        ).join(' ');

        expect(lines).toMatch(/FILL \d+%/);
        expect(lines).not.toMatch(/FILL 0\./);
    });

    /**
     * The pop and the badge can be on screen together, so two spellings of one
     * refusal were readable at once.
     */
    it('spells a refusal the same way in the pop and on the badge', () => {
        const badges = panelText(mg({ cradle: 'armed', aisleBlocked: true }), [keg, casing], {
            sessionId: 'B1',
        });

        expect(badges).toContain(CRADLE_FULL);
        expect(popFor({ who: 'b', step: 'toss', grade: 'miss', note: 'full', at: 0 })?.text).toContain(
            CRADLE_FULL,
        );
        expect(popFor({ who: 'b', step: 'toss', grade: 'miss', note: 'body', at: 0 })?.text).toContain(
            AISLE_BODY,
        );
    });

    /**
     * `aisleBlocked` is `view.aisleFloorItem` and nothing else — `bodyOnAisle` is
     * a separate field the reducer never folds into it. So the standing badge was
     * telling a player at the rack there was a BODY IN THE AISLE with nobody
     * within four tiles, and never naming the thing that was actually there or
     * what to do about it.
     */
    it('names the thing on the aisle rather than a body nobody can see', () => {
        const badges = panelText(mg({ aisleBlocked: true }), [keg, casing], { sessionId: 'B1' });

        expect(badges).toContain(AISLE_ITEM);
        expect(badges).not.toContain(AISLE_BODY);
    });

    it('says how to clear it, because the swing is refused until somebody does', () => {
        expect(AISLE_ITEM).toContain('E');
    });
});

/**
 * The crimp's visual half of F18's constraint: no cue is the only channel it
 * arrives on. A tick on the third click is no use to a muted player if the
 * panel still only draws three identical lines, so the clicks are counted on
 * screen and the one the tap is judged against is named.
 */
describe('the crimp panel counts the clicks', () => {
    const crimp = (now: number): string[] =>
        panelText(
            mg({ phase: 'crimp', beatStartAt: 11.2, crimpClickAt: [11.6, 12, 12.4] }),
            [{ id: 'k-1', type: 'keg' }],
            { now },
        );

    it('numbers every click, so the third is a count and not a guess', () => {
        const lines = crimp(11.3);

        expect(lines).toContain('1');
        expect(lines).toContain('2');
        expect(lines).toContain('3');
    });

    it('still says which click the tap is judged against', () => {
        expect(crimp(11.3)).toContain('CRIMP ON THE THIRD CLICK');
    });
});

describe('the two sentences a packed shelf needs', () => {
    it('tells empty hands to lift one off', () => {
        expect(SHELF_FULL).toContain('LIFT ONE OFF');
    });

    /**
     * 'TAKE ONE BACK' is an instruction a player holding a keg physically
     * cannot follow, and nothing told them to put theirs down first.
     */
    it('tells full hands to put theirs down before trying', () => {
        expect(SHELF_FULL_HANDS).toContain('PUT YOURS DOWN');
        expect(SHELF_FULL_HANDS).toContain('LIFT ONE OFF');
    });
});
