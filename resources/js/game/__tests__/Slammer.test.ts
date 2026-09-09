import { type SlammerHeatConfig, gaugeTopMs } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    HANDS_LINES,
    chuteFor,
    chuteLights,
    comboText,
    gaugeGeometry,
    heatAlpha,
    heatTint,
    keyPlan,
    needleLive,
    needleStartMs,
    needleX,
    outcomeLabel,
    predictCharge,
    readoutText,
    tierShow,
} from '../minigames/Slammer';

/**
 * The overlay's decisions (F07 §Operator overlay). The client never judges an
 * outcome, so everything testable here is a function of `mg` and a key press:
 * which op a key becomes, where the band the *server* judged with lands on a
 * fixed scale, and how a verdict reads. The drawing is left to Phaser.
 */

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
        expect(keyPlan('charge', 'left', true, false)).toEqual({ kind: 'send', op: 'mash', v: 'l' });
    });
});

describe('outcomeLabel', () => {
    it('says nothing before the first release', () => {
        expect(outcomeLabel('', 0)).toBe('');
    });

    it('names the two hits without a number', () => {
        expect(outcomeLabel('dead_center', 12)).toBe('DEAD CENTER');
        expect(outcomeLabel('prime', -80)).toBe('PRIME BOOM');
    });

    it('signs the miss with the server-rounded error', () => {
        expect(outcomeLabel('late', 214)).toBe('LATE +214');
        expect(outcomeLabel('early', -137)).toBe('EARLY −137');
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

    it('tells the operator all three ways out of a full pair of hands', () => {
        expect(HANDS_LINES).toHaveLength(3);
        expect(HANDS_LINES.join(' ')).toContain('E');
        expect(HANDS_LINES.join(' ')).toContain('Space');
        expect(HANDS_LINES.join(' ')).toContain('Esc');
    });
});
