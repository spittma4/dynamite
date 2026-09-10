import {
    type PlayerState,
    STATION_LABEL,
    type SlammerHeatConfig,
    type SlammerMg,
    type StationState,
    encodeMg,
    gaugeTopMs,
    kegFor,
} from '@shared';
import { describe, expect, it } from 'vitest';

import { CUES } from '../audio/cues';
import { PRIME_KEG } from '../nouns';
import { KEGS_OUT } from '../render/dropTargets';
import {
    LEGEND,
    SLAMMER_COLOURS,
    outcomeColour,
    chuteFor,
    chuteLights,
    comboText,
    gaugeGeometry,
    heatAlpha,
    heatTint,
    isRearming,
    keyPlan,
    localAfterPhase,
    localMashStale,
    BAND_BOOK_AHEAD_MS,
    REJECT_FLASH_MS,
    SIGHT_SPAN_PX,
    VERDICT_DELAY_MS,
    chuteColour,
    mashCue,
    needleLive,
    needleStartMs,
    needleX,
    outcomeLabel,
    predictCharge,
    readoutText,
    releaseCue,
    handsLines,
    handsLinesAny,
    handsLinesKeg,
    slamSound,
    slammerOverlay,
    slammerPulses,
    tierShow,
    trayFooter,
} from '../minigames/Slammer';
import type { OverlayContext } from '../minigames/types';

/**
 * The overlay's decisions (F07 §Operator overlay). The client never judges an
 * outcome, so everything testable here is a function of `mg` and a key press:
 * which op a key becomes, where the band the *server* judged with lands on a
 * fixed scale, and how a verdict reads. The drawing is left to Phaser.
 */

/** Every shipped level's `carry.throwTiles` (`config/game/levels/*.json`). */
const THROW_TILES = 2;

const CFG: SlammerHeatConfig = {
    minChargeSeconds: 0.7,
    maxChargeSeconds: 1.5,
    okMsAtMaxCharge: 225,
    okMsAtMinCharge: 105,
    deadCenterMs: 50,
    churnBandDrift: 0.08,
    overholdMs: 500,
};

/** A gauge exactly as wide as its own top makes every px a ms. */
const WIDE = gaugeTopMs(CFG);

describe('chuteFor', () => {
    it('maps the three arrows the docs draw on the chutes', () => {
        expect(chuteFor('left')).toBe('l');
        expect(chuteFor('up')).toBe('u');
        expect(chuteFor('right')).toBe('r');
    });

    it('has no chute for the keys that are not chutes', () => {
        expect(chuteFor('down')).toBeNull();
        expect(chuteFor('space')).toBeNull();
        expect(chuteFor('interact')).toBeNull();
        expect(chuteFor('esc')).toBeNull();
    });
});

describe('keyPlan', () => {
    it('sends one mash per chute key press', () => {
        expect(keyPlan('idle', 'left', true, false)).toEqual({ kind: 'send', op: 'mash', v: 'l' });
        expect(keyPlan('mash', 'up', true, false)).toEqual({ kind: 'send', op: 'mash', v: 'u' });
        expect(keyPlan('mash', 'right', true, false)).toEqual({ kind: 'send', op: 'mash', v: 'r' });
    });

    it('swallows a held chute key so it never becomes a fourth press', () => {
        expect(keyPlan('mash', 'left', true, true)).toEqual({ kind: 'consume' });
    });

    it('sends nothing on a chute key release', () => {
        expect(keyPlan('mash', 'left', false, false)).toEqual({ kind: 'consume' });
    });

    it('charges on space down and releases on space up', () => {
        expect(keyPlan('mash', 'space', true, false)).toEqual({ kind: 'send', op: 'charge' });
        expect(keyPlan('charge', 'space', false, false)).toEqual({ kind: 'send', op: 'release' });
    });

    it('swallows a repeated space so a held plunger is not re-charged', () => {
        expect(keyPlan('mash', 'space', true, true)).toEqual({ kind: 'consume' });
    });

    it('consumes down, which is captured but is not a chute', () => {
        expect(keyPlan('mash', 'down', true, false)).toEqual({ kind: 'consume' });
    });

    it('never consumes interact or esc, so the floor behaviour still fires', () => {
        for (const phase of ['idle', 'mash', 'charge', 'hands'] as const) {
            expect(keyPlan(phase, 'interact', true, false)).toEqual({ kind: 'ignore' });
            expect(keyPlan(phase, 'esc', true, false)).toEqual({ kind: 'ignore' });
        }
    });

    it('consumes nothing at all with full hands, so E puts down and space throws', () => {
        for (const key of ['left', 'up', 'right', 'down', 'space'] as const) {
            expect(keyPlan('hands', key, true, false)).toEqual({ kind: 'ignore' });
        }
    });

    it('still sends a mash in charge and lets the server refuse it', () => {
        const plan = keyPlan('charge', 'left', true, false);

        expect(plan).toEqual({ kind: 'send', op: 'mash', v: 'l' });
    });
});

/**
 * The noun has to sit on the keg that earns it. `judgeRelease` returns
 * 'dead_center' inside the gold and 'prime' inside the orange band, and
 * `kegFor` sets `prime: true` for 'dead_center' alone — so the badge that said
 * PRIME KEG was printed over the release that makes an ordinary keg, while the
 * one keg the Jig chips '· PRIME KEG' on was announced as DEAD CENTER. Two
 * players, at two stations, read opposite things about the same keg.
 */
describe('outcomeLabel', () => {
    it('says nothing before the first release', () => {
        expect(outcomeLabel('', 0)).toBe('');
    });

    it('gives the name to the release that actually makes a prime keg', () => {
        expect(kegFor('dead_center').prime).toBe(true);
        expect(outcomeLabel('dead_center', 12)).toBe(PRIME_KEG);
    });

    it('calls the ordinary good release what it is: inside the band', () => {
        expect(kegFor('prime').prime).toBe(false);
        expect(outcomeLabel('prime', -80)).toBe('IN THE BAND');
    });

    it('paints the prime keg in the gold the gauge marks the target with', () => {
        expect(outcomeColour('dead_center')).toBe(SLAMMER_COLOURS.dead);
        expect(outcomeColour('prime')).toBe(SLAMMER_COLOURS.good);
    });

    it('signs the miss with the error and the keg it just made', () => {
        expect(kegFor('late').quality).toBeLessThan(kegFor('prime').quality);
        expect(outcomeLabel('late', 214)).toBe('LATE +214 — DAMP KEG');
        expect(outcomeLabel('early', -137)).toBe('EARLY −137 — DUD KEG');
    });
});

describe('gaugeGeometry', () => {
    it('draws nothing before a charge has a climb time', () => {
        expect(gaugeGeometry(0, 0, 0, CFG, 600)).toBeNull();
    });

    it('puts the band the server judged with around the target on a fixed scale', () => {
        const g = gaugeGeometry(1, 150, 0, CFG, WIDE);

        expect(g).not.toBeNull();
        expect(g?.pxPerMs).toBe(1);
        expect(g?.targetX).toBe(1000);
        expect(g?.bandX).toBe(850);
        expect(g?.bandW).toBe(300);
    });

    it('keeps the dead centre a constant 50 ms strip at every heat', () => {
        const hot = gaugeGeometry(0.7, 105, 0, CFG, WIDE);
        const lazy = gaugeGeometry(1.5, 225, 0, CFG, WIDE);

        expect(hot?.deadW).toBe(100);
        expect(lazy?.deadW).toBe(100);
        expect(hot?.deadX).toBe(650);
        expect(lazy?.deadX).toBe(1450);
    });

    it('draws a hot mash as a smaller band nearer the left than a lazy one', () => {
        const hot = gaugeGeometry(0.7, 105, 0, CFG, WIDE);
        const lazy = gaugeGeometry(1.5, 225, 0, CFG, WIDE);

        expect(hot?.bandW).toBeLessThan(lazy?.bandW ?? 0);
        expect(hot?.targetX).toBeLessThan(lazy?.targetX ?? 0);
    });

    it('shifts the whole band by the churn drift', () => {
        const drifted = gaugeGeometry(1.5, 225, 0.08, CFG, WIDE);

        expect(drifted?.targetX).toBeCloseTo(1620, 6);
        expect(drifted?.bandX).toBeCloseTo(1395, 6);
    });

    it('runs the red late region exactly to the end of the gauge at the worst case', () => {
        const worst = gaugeGeometry(1.5, 225, 0.08, CFG, WIDE);

        expect(worst?.lateX).toBeCloseTo(1845, 6);
        expect((worst?.lateX ?? 0) + (worst?.lateW ?? 0)).toBeCloseTo(WIDE, 6);
    });

    it('scales every px with the panel rather than with the band', () => {
        const half = gaugeGeometry(1, 150, 0, CFG, WIDE / 2);

        expect(half?.pxPerMs).toBeCloseTo(0.5, 6);
        expect(half?.targetX).toBeCloseTo(500, 6);
    });

    it('never draws outside the gauge, whatever the server sent', () => {
        const over = gaugeGeometry(3, 400, 0.08, CFG, WIDE);
        const under = gaugeGeometry(0.05, 105, 0, CFG, WIDE);

        for (const g of [over, under]) {
            expect(g?.bandX).toBeGreaterThanOrEqual(0);
            expect(g?.bandW).toBeGreaterThanOrEqual(0);
            expect((g?.bandX ?? 0) + (g?.bandW ?? 0)).toBeLessThanOrEqual(WIDE);
            expect((g?.lateX ?? 0) + (g?.lateW ?? 0)).toBeLessThanOrEqual(WIDE);
            expect(g?.targetX).toBeLessThanOrEqual(WIDE);
        }
    });

    /**
     * The one judgement whose visual is genuinely not equivalent. On the real
     * panel the scale is 0.229 px/ms, so the judged ±50 ms gold is 23 px wide
     * and a 3 px needle crosses it in under six frames at 60 fps — against the
     * crimp's 87 px and the dock's 121 px, both of which are honestly playable
     * by eye. The sights give the eye something to aim *between* without
     * overstating the window: widening the strip itself would be a claim about
     * the judgement that the server does not honour.
     */
    describe('the gold sights', () => {
        /** `gaugeW` on the shipped 896 px panel: min(round(896 × 0.6), …). */
        const PANEL_PX = 538;

        it('spans further than the judged strip when the strip is a few frames wide', () => {
            const g = gaugeGeometry(1, 150, 0, CFG, PANEL_PX);

            expect(g?.deadW).toBeLessThan(SIGHT_SPAN_PX);
            expect(g?.sightW).toBe(SIGHT_SPAN_PX);
        });

        it('stays centred on the true target, which is what is judged', () => {
            const g = gaugeGeometry(1, 150, 0, CFG, PANEL_PX);

            expect((g?.sightX ?? 0) + (g?.sightW ?? 0) / 2).toBeCloseTo(g?.targetX ?? 0, 6);
        });

        it('never narrows a gold strip that is already wider than the span', () => {
            const g = gaugeGeometry(1, 150, 0, CFG, WIDE);

            expect(g?.deadW).toBeGreaterThan(SIGHT_SPAN_PX);
            expect(g?.sightW).toBe(g?.deadW);
        });

        it('stays inside the gauge at both ends', () => {
            for (const g of [
                gaugeGeometry(0.05, 105, 0, CFG, PANEL_PX),
                gaugeGeometry(3, 400, 0.08, CFG, PANEL_PX),
            ]) {
                expect(g?.sightX).toBeGreaterThanOrEqual(0);
                expect((g?.sightX ?? 0) + (g?.sightW ?? 0)).toBeLessThanOrEqual(PANEL_PX);
            }
        });
    });
});

/**
 * The Slammer by ear (F18). Releasing on a gold hairline is an eye-tracking
 * task the moment the sound is missing, and the three moments that matter are
 * all known the instant the server confirms the charge — so they are booked as
 * tick, TOCK, tick rather than watched for.
 */
describe('mashCue', () => {
    it('ticks the first two chutes and accents the one that arms the plunger', () => {
        expect(mashCue(1)).toBe('tick');
        expect(mashCue(2)).toBe('tick');
        expect(mashCue(3)).toBe('tickAccent');
    });
});

describe('slammerPulses', () => {
    const AT = 5000;

    it('marks the band’s leading edge and the gold, and stops there', () => {
        const pulses = slammerPulses(AT, 1, 150, 0);

        expect(pulses.map((pulse) => pulse.cue)).toEqual(['bandEdge', 'gold']);
        expect(pulses.map((pulse) => pulse.at)).toEqual([5.85, 6]);
    });

    /**
     * The trailing edge was booked up to `BAND_BOOK_AHEAD_MS` early, and the
     * shipped `okMsAtMinCharge` is 105 — so on a hot charge the closing tick
     * went onto the AudioContext timeline 15 ms *before* the gold moment, and a
     * scheduled voice cannot be taken back. Every dead-centre release therefore
     * grew a stray tick 105 ms later, about a needle that had already frozen.
     * The closing edge only ever tells you something you can no longer act on.
     */
    it('books nothing after the gold, so a clean release grows no stray tick', () => {
        const target = (AT + 1000) / 1000;

        for (const okMs of [CFG.okMsAtMinCharge, CFG.okMsAtMaxCharge]) {
            for (const pulse of slammerPulses(AT, 1, okMs, 0)) {
                expect(pulse.at, `${okMs}`).toBeLessThanOrEqual(target);
            }
        }
    });

    it('books the leading edge far enough ahead to be a tick at all', () => {
        // The horizon has to reach the *leading* edge on the tightest window
        // the levels ship, or the tick the player acts on is never booked.
        expect(BAND_BOOK_AHEAD_MS).toBeGreaterThanOrEqual(CFG.okMsAtMinCharge);
    });

    it('books against the local clock the needle runs on, in seconds', () => {
        const [first] = slammerPulses(AT, 1, 150, 0);

        // `needleStart` is a `performance.now()` stamp; the pulse has to be on
        // the same base or the TOCK lands where the needle is not.
        expect((first?.at ?? 0) * 1000).toBeCloseTo(AT + 1000 - 150, 6);
    });

    it('puts the gold on the band the server published, drift and all', () => {
        const [, gold] = slammerPulses(AT, 1.5, 225, 0.08);

        expect((gold?.at ?? 0) * 1000).toBeCloseTo(AT + 1620, 6);
    });

    it('has nothing to mark before a charge has a climb time', () => {
        expect(slammerPulses(AT, 0, 0, 0)).toHaveLength(0);
    });
});

describe('releaseCue', () => {
    it('gives the gold its own confirmation, apart from a plain band hit', () => {
        expect(releaseCue('dead_center')).toBe('perfect');
        expect(releaseCue('prime')).toBe('ok');
        expect(releaseCue('dead_center')).not.toBe(releaseCue('prime'));
    });

    it('calls both ways of missing the band a miss', () => {
        expect(releaseCue('late')).toBe('miss');
        expect(releaseCue('early')).toBe('miss');
    });

    it('says nothing about a machine that has not judged anything yet', () => {
        expect(releaseCue('')).toBeNull();
    });
});

describe('slamSound', () => {
    /**
     * Prime and ordinary used to differ by gain alone — 1.0 against 0.65 — which
     * is the first distinction a room with two other people shouting destroys.
     * They differ by pitch now: `thunkBig` is 70 → 32 Hz under `thunk`'s 90 → 45.
     */
    it('lands the plunger deeper for the gold than for the band', () => {
        expect(slamSound('dead_center')).toBe('thunkBig');
        expect(slamSound('prime')).toBe('thunk');
        expect(CUES.thunkBig.voices[0]?.freq).toBeLessThan(CUES.thunk.voices[0]?.freq ?? 0);
    });

    /**
     * `clink` meant two unrelated things: "you put something down" and "you
     * released early and made a dud". Different lessons need different sounds.
     */
    it('tells an early release from an item set down on a shelf', () => {
        expect(slamSound('late')).toBe('pfft');
        expect(slamSound('early')).toBe('dud');
        expect(slamSound('early')).not.toBe('clink');
    });

    it('is silent until there is a release to be silent about', () => {
        expect(slamSound('')).toBeNull();
    });

    /**
     * The operator's verdict and the floor's hopper fire on the same patch. For
     * a late release that is two sawtooths five semitones apart started
     * together, which is heard as one muddy buzz rather than as two facts.
     */
    it('leaves room for the hopper before the operator verdict lands', () => {
        const hopper = CUES.pfft.voices[0];

        expect(VERDICT_DELAY_MS).toBeGreaterThanOrEqual(
            (hopper?.attackMs ?? 0) + (hopper?.holdMs ?? 0),
        );
    });
});

/**
 * The refused chute. `mashed` does not change on a repeat or a fourth press, so
 * no light moved and `drawChutes` early-returned on an unchanged key — leaving
 * the spill, which arrives a round trip later at the hopper, as the only thing
 * that taught "three is enough". That made it the one input in the three
 * mini-games with no visual answer at the moment of the press.
 */
describe('chuteColour', () => {
    it('flashes a refused chute red whether or not it was already lit', () => {
        expect(chuteColour(true, true)).toBe(SLAMMER_COLOURS.late);
        expect(chuteColour(false, true)).toBe(SLAMMER_COLOURS.late);
    });

    it('leaves an accepted chute on the lit and unlit colours', () => {
        expect(chuteColour(true, false)).toBe(SLAMMER_COLOURS.chuteLit);
        expect(chuteColour(false, false)).toBe(SLAMMER_COLOURS.chuteOff);
    });

    it('holds the flash long enough to be seen and short enough to be a flash', () => {
        expect(REJECT_FLASH_MS).toBeGreaterThanOrEqual(100);
        expect(REJECT_FLASH_MS).toBeLessThanOrEqual(300);
    });
});

describe('needleX', () => {
    it('walks the needle at the gauge scale', () => {
        expect(needleX(400, 0.5, 600)).toBe(200);
    });

    it('parks the needle at the ends rather than off them', () => {
        expect(needleX(-50, 1, 600)).toBe(0);
        expect(needleX(9000, 1, 600)).toBe(600);
    });
});

describe('needleLive', () => {
    it('runs while the server says charge, however long the hold', () => {
        expect(needleLive('charge', 60_000, 400)).toBe(true);
    });

    it('runs on the local prediction until the grace runs out', () => {
        expect(needleLive('mash', 200, 400)).toBe(true);
        expect(needleLive('mash', 401, 400)).toBe(false);
    });

    it('is off once the cycle is over or the hands are full', () => {
        expect(needleLive('idle', 0, 400)).toBe(false);
        expect(needleLive('hands', 0, 400)).toBe(false);
    });
});

describe('needleStartMs', () => {
    it('backdates the needle to the server charge when the overlay mounts mid-hold', () => {
        expect(needleStartMs(12.35, 13.1, 5_000)).toBeCloseTo(4_250, 6);
    });

    it('starts now when the charge began now', () => {
        expect(needleStartMs(20, 20, 800)).toBe(800);
    });
});

describe('predictCharge', () => {
    it('predicts the hot, lazy and middling climbs the server will judge with', () => {
        expect(predictCharge(300, CFG)).toEqual({ tCharge: 0.7, okMs: 105 });
        expect(predictCharge(800, CFG)).toEqual({ tCharge: 1.5, okMs: 225 });
        expect(predictCharge(500, CFG)).toEqual({ tCharge: 1, okMs: 150 });
    });

    it('rounds the window to the integer the server publishes', () => {
        expect(Number.isInteger(predictCharge(437, CFG).okMs)).toBe(true);
    });
});

describe('chuteLights', () => {
    it('lights a chute the moment it is pressed, before the server has agreed', () => {
        expect(chuteLights([], ['u'])).toEqual({ l: false, u: true, r: false });
    });

    it('lights everything the server has recorded', () => {
        expect(chuteLights(['l', 'r'], [])).toEqual({ l: true, u: false, r: true });
    });

    it('keeps a chute lit that both agree on', () => {
        expect(chuteLights(['l'], ['l', 'u'])).toEqual({ l: true, u: true, r: false });
    });
});

describe('localMashStale', () => {
    it('unlights a chute the re-arming machine refused, once a round trip has passed', () => {
        expect(localMashStale('idle', 0, 401, 400)).toBe(true);
    });

    it('leaves a fresh press alone while the patch that takes it is still in flight', () => {
        expect(localMashStale('idle', 0, 200, 400)).toBe(false);
    });

    it('keeps the light once the server has the mash, however long it takes', () => {
        expect(localMashStale('mash', 1, 5_000, 400)).toBe(false);
        expect(localMashStale('idle', 1, 5_000, 400)).toBe(false);
    });

    it('never fights a charge or a full pair of hands', () => {
        expect(localMashStale('charge', 0, 5_000, 400)).toBe(false);
        expect(localMashStale('hands', 0, 5_000, 400)).toBe(false);
    });
});

describe('isRearming', () => {
    /**
     * F05 writes `working` for both halves of a cycle, so the state on its own
     * cannot tell a mash from the re-arm that follows it — and dimming the keys
     * on `working` alone dims them exactly while they are live.
     */
    it('leaves the chutes bright while the operator is mid-rep', () => {
        expect(isRearming('mash', 'working')).toBe(false);
        expect(isRearming('charge', 'working')).toBe(false);
    });

    it('dims them once the rep is over and the machine is still working', () => {
        expect(isRearming('idle', 'working')).toBe(true);
        expect(isRearming('hands', 'working')).toBe(true);
    });

    it('leaves them bright on a machine that is not working at all', () => {
        expect(isRearming('idle', 'idle')).toBe(false);
        expect(isRearming('idle', 'starved')).toBe(false);
        expect(isRearming('mash', 'jammed')).toBe(false);
    });
});

describe('localAfterPhase', () => {
    /**
     * The three presses of one mash can land in different server ticks, and the
     * patch that confirms the first is a phase change. Wiping the local record
     * there drops the other two — the fast mash the heat curve rewards is
     * exactly the case that splits.
     */
    it('keeps the presses the confirming patch has not caught up with', () => {
        expect(localAfterPhase('mash', ['l', 'u', 'r'])).toEqual(['l', 'u', 'r']);
        expect(chuteLights(['l'], localAfterPhase('mash', ['l', 'u', 'r']))).toEqual({
            l: true,
            u: true,
            r: true,
        });
    });

    it('forgets them once the cycle is over or the hands are full', () => {
        expect(localAfterPhase('idle', ['l', 'u', 'r'])).toEqual([]);
        expect(localAfterPhase('hands', ['l', 'u', 'r'])).toEqual([]);
    });
});

describe('heatTint and heatAlpha', () => {
    it('hides the glow at heat 0 and shows it fully at heat 1', () => {
        expect(heatAlpha(0)).toBe(0);
        expect(heatAlpha(1)).toBe(1);
    });

    it('clamps a heat outside the range rather than over-glowing', () => {
        expect(heatAlpha(-1)).toBe(0);
        expect(heatAlpha(4)).toBe(1);
    });

    it('runs the tint from the amber of a lazy hopper to the white of a hot one', () => {
        expect(heatTint(0.3)).toBe(0xffb340);
        expect(heatTint(1)).toBe(0xfff2c0);
        expect(heatTint(0)).toBe(0xffb340);
    });

    it('lands a middling heat between the two', () => {
        const mid = heatTint(0.65);

        expect((mid >> 8) & 0xff).toBeGreaterThan(0xb3);
        expect((mid >> 8) & 0xff).toBeLessThan(0xf2);
        expect(mid & 0xff).toBeGreaterThan(0x40);
        expect(mid & 0xff).toBeLessThan(0xc0);
    });
});

describe('tierShow', () => {
    it('escalates the flag at 10, the steam at 25 and the floor ripple at 50', () => {
        expect(tierShow(0)).toEqual({ flag: false, steam: false, ripple: false });
        expect(tierShow(1)).toEqual({ flag: true, steam: false, ripple: false });
        expect(tierShow(2)).toEqual({ flag: true, steam: true, ripple: false });
        expect(tierShow(3)).toEqual({ flag: true, steam: true, ripple: true });
    });
});

describe('the readouts', () => {
    it('reads the window the server judged with', () => {
        expect(readoutText(105)).toBe('±105 ms');
    });

    it('has no window to read outside a charge', () => {
        expect(readoutText(0)).toBe('±— ms');
    });

    it('counts the combo the way the floor counts it', () => {
        expect(comboText(0)).toBe('0×');
        expect(comboText(26)).toBe('26×');
    });

    it('gives the operator one key per row and one action per row', () => {
        expect(handsLinesKeg(THROW_TILES)).toHaveLength(4);
        expect(handsLinesKeg(THROW_TILES).join(' ')).toContain('Space');
        expect(handsLinesKeg(THROW_TILES).join(' ')).toContain('Esc');

        for (const line of handsLinesKeg(THROW_TILES)) expect(line.length).toBeLessThanOrEqual(60);
    });

    it('leads with walking the keg to Assembly, in the name on its nameplate', () => {
        expect(handsLinesKeg(THROW_TILES)[0]).toContain(STATION_LABEL.assembly);
        expect(handsLinesKeg(THROW_TILES)[0]).toContain('striped');
    });

    it('matches the walk to the paint the player will be standing on', () => {
        expect(handsLinesKeg(THROW_TILES).join(' ')).toContain('KEGS IN');
    });

    it('never offers the floor, which is the one drop that feeds a fire', () => {
        expect(handsLinesKeg(THROW_TILES).join(' ')).not.toContain('floor');
        expect(handsLinesKeg(THROW_TILES).join(' ')).not.toContain('fuel');
    });

    it('keeps the always-on legend free of the floor drop too', () => {
        expect(LEGEND).not.toContain('floor');
        expect(LEGEND).toContain('ESC');
    });
});

/**
 * The server flips the phase to `hands` on *any* carried item, so a joined
 * operator holding a stick was being told to walk it to Assembly and warned
 * that floored kegs are fuel. The noun and the destination come off the item.
 */
describe('handsLines', () => {
    it('names the keg walk when the thing in your hands is a keg', () => {
        expect(handsLines('keg', THROW_TILES)).toEqual(handsLinesKeg(THROW_TILES));
    });

    it('falls back to item-agnostic advice for anything else', () => {
        expect(handsLines('stick', THROW_TILES)).toEqual(handsLinesAny(THROW_TILES));
        expect(handsLines('', THROW_TILES)).toEqual(handsLinesAny(THROW_TILES));
    });

    it('never sends a stick to Assembly or calls it fuel', () => {
        const lines = handsLinesAny(THROW_TILES).join(' ');

        expect(lines).not.toContain('Assembly');
        expect(lines).not.toContain('KEGS IN');
        expect(lines).not.toContain('fuel');
    });

    it('keeps the ways out of a full pair of hands on both versions', () => {
        expect(handsLinesAny(THROW_TILES)).toHaveLength(handsLinesKeg(THROW_TILES).length);
        expect(handsLinesAny(THROW_TILES).join(' ')).toContain('Space');
        expect(handsLinesAny(THROW_TILES).join(' ')).toContain('Esc');
    });
});

/**
 * The haul instruction used to be gated on the out tray hitting its cap of six.
 * A playtester made four kegs and was never once told they had somewhere to go.
 */
describe('trayFooter', () => {
    it('says nothing while the tray is empty', () => {
        expect(trayFooter(0)).toBe('');
    });

    it('counts what is waiting and names where it goes', () => {
        // Was '4 on the tray': 'the tray' is painted on nothing. The shelf the
        // player walks to says KEGS OUT, so the sentence says KEGS OUT.
        expect(trayFooter(4)).toBe(`4 on ${KEGS_OUT} · carry one to ${STATION_LABEL.assembly} (E)`);
        expect(trayFooter(1)).toContain(`1 on ${KEGS_OUT}`);
        expect(trayFooter(4)).not.toMatch(/tray/i);
    });
});

/** A Phaser object that answers every call it is not asked about with itself. */
function stub(target: Record<string, unknown>): Record<string, unknown> {
    const proxy: Record<string, unknown> = new Proxy(target, {
        get: (obj, prop) => (prop in obj ? obj[prop as string] : () => proxy),
    });

    return proxy;
}

/** One `Text` the panel made, what it last said, and whether it is showing. */
interface PaintedText {
    text: string;
    visible: boolean;
    obj: unknown;
}

/** One `Container` the panel made, what went in it, and whether it is showing. */
interface PaintedPanel {
    children: unknown[];
    visible: boolean;
}

interface Painted {
    texts: PaintedText[];
    panels: PaintedPanel[];
}

/**
 * The overlay mounted on a recording scene. Collecting every string the scene
 * was ever asked to draw proves only that the advice was *built* — a panel that
 * held none of it would still pass — so the container's children are recorded
 * too and the assertions run against the one container that was made visible.
 */
function mountPanel(over: {
    phase: SlammerMg['phase'];
    tray?: number;
    carrying?: string;
    itemType?: string;
}): Painted {
    const painted: Painted = { texts: [], panels: [] };
    const mg: SlammerMg = {
        phase: over.phase,
        mashed: [],
        chargeStartAt: 0,
        tCharge: 0,
        okMs: 0,
        heat: 0,
        bandOffset: 0,
        combo: 0,
        tier: 0,
        lastOutcome: '',
        lastErrorMs: 0,
        cfg: CFG,
    };
    const carrying = over.carrying ?? 'k-1';
    const station = {
        mg: encodeMg(mg),
        state: 'running',
        outputShelf: { length: over.tray ?? 0 },
    } as unknown as StationState;
    const ctx = stub({
        scene: stub({
            levelConfig: { carry: { throwTiles: THROW_TILES } },
            add: stub({
                text: (_x: number, _y: number, value: unknown) => {
                    const entry: PaintedText = {
                        text: typeof value === 'string' ? value : '',
                        visible: true,
                        obj: null,
                    };
                    const obj = stub({
                        setText: (next: string) => {
                            entry.text = next;
                        },
                        setVisible: (next: boolean) => {
                            entry.visible = next;
                        },
                    });

                    entry.obj = obj;
                    painted.texts.push(entry);

                    return obj;
                },
                graphics: () => stub({}),
                container: (_x: number, _y: number, children: unknown) => {
                    const entry: PaintedPanel = {
                        children: Array.isArray(children) ? children : [],
                        visible: true,
                    };

                    painted.panels.push(entry);

                    return stub({
                        setVisible: (next: boolean) => {
                            entry.visible = next;
                        },
                    });
                },
            }),
        }),
        container: stub({}),
        width: 896,
        height: 192,
        stationId: 'boom_powder',
        sessionId: 'A1',
        state: {
            items: new Map([[carrying, { type: over.itemType ?? 'keg' }]]),
        },
    }) as unknown as OverlayContext;

    const overlay = slammerOverlay();

    overlay.mount(ctx);
    overlay.update(station, { carrying } as unknown as PlayerState, 10);

    return painted;
}

/** The lines a player would actually be reading inside the visible panel. */
function handsPanel(over: Parameters<typeof mountPanel>[0]): {
    lines: string[];
    shown: boolean;
} {
    const painted = mountPanel(over);
    const panel = painted.panels.find((entry) => entry.visible);

    if (!panel) return { lines: [], shown: false };

    return {
        shown: true,
        lines: painted.texts
            .filter((entry) => panel.children.includes(entry.obj))
            .map((entry) => entry.text),
    };
}

describe('the panel a full pair of hands gets', () => {
    it('shows the walk-it-out lines the moment the keg lands in your hands', () => {
        const panel = handsPanel({ phase: 'hands' });

        expect(panel.shown).toBe(true);

        for (const line of handsLinesKeg(THROW_TILES)) expect(panel.lines).toContain(line);
    });

    it('keeps them off the panel while the plunger is still taking input', () => {
        expect(handsPanel({ phase: 'mash' }).shown).toBe(false);
    });

    it('drops the keg wording for a stick, which does not go to Assembly', () => {
        const panel = handsPanel({ phase: 'hands', itemType: 'stick' });

        expect(panel.shown).toBe(true);
        expect(panel.lines.join(' ')).not.toContain('Assembly');

        for (const line of handsLinesAny(THROW_TILES)) expect(panel.lines).toContain(line);
    });
});

/**
 * The haul instruction is the sentence that unblocks the whole factory, so it
 * cannot wait for the out tray to hit its cap: a session that made four kegs
 * never saw it at all.
 */
describe('the footer under the gauge', () => {
    const footerOf = (tray: number): PaintedText | undefined =>
        mountPanel({ phase: 'mash', tray }).texts.find((entry) =>
            entry.text.includes(`on ${KEGS_OUT}`),
        );

    it('names the haul as soon as one keg is waiting, cap or no cap', () => {
        const footer = footerOf(1);

        expect(footer?.visible).toBe(true);
        expect(footer?.text).toBe(trayFooter(1));
    });

    it('counts the four kegs the playtester never knew they had made', () => {
        expect(footerOf(4)?.text).toContain(`4 on ${KEGS_OUT}`);
    });

    it('stays out of the way while the tray is empty', () => {
        expect(footerOf(0)?.visible ?? false).toBe(false);
    });
});
