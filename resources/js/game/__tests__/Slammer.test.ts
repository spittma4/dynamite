import {
    type PlayerState,
    type SlammerHeatConfig,
    type SlammerMg,
    type StationState,
    encodeMg,
    gaugeTopMs,
} from '@shared';
import { describe, expect, it } from 'vitest';

import {
    HANDS_LINES,
    HANDS_LINES_ANY,
    LEGEND,
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
    needleLive,
    needleStartMs,
    needleX,
    outcomeLabel,
    predictCharge,
    readoutText,
    handsLines,
    slammerOverlay,
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

describe('outcomeLabel', () => {
    it('says nothing before the first release', () => {
        expect(outcomeLabel('', 0)).toBe('');
    });

    it('names the two hits without a number', () => {
        expect(outcomeLabel('dead_center', 12)).toBe('DEAD CENTER');
        // Was 'PRIME BOOM': a third name for the best keg, beside the Jig's
        // 'PRIME KEG' and the help's 'a perfect keg'.
        expect(outcomeLabel('prime', -80)).toBe('PRIME KEG');
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
        expect(HANDS_LINES).toHaveLength(4);
        expect(HANDS_LINES.join(' ')).toContain('Space');
        expect(HANDS_LINES.join(' ')).toContain('Esc');

        for (const line of HANDS_LINES) expect(line.length).toBeLessThanOrEqual(60);
    });

    it('leads with walking the keg to Assembly, the way the help does', () => {
        expect(HANDS_LINES[0]).toContain('Assembly');
        expect(HANDS_LINES[0]).toContain('striped');
    });

    it('matches the walk to the paint the player will be standing on', () => {
        expect(HANDS_LINES.join(' ')).toContain('KEGS IN');
    });

    it('never offers the floor, which is the one drop that feeds a fire', () => {
        expect(HANDS_LINES.join(' ')).not.toContain('floor');
        expect(HANDS_LINES.join(' ')).not.toContain('fuel');
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
        expect(handsLines('keg')).toBe(HANDS_LINES);
    });

    it('falls back to item-agnostic advice for anything else', () => {
        expect(handsLines('stick')).toBe(HANDS_LINES_ANY);
        expect(handsLines('')).toBe(HANDS_LINES_ANY);
    });

    it('never sends a stick to Assembly or calls it fuel', () => {
        const lines = HANDS_LINES_ANY.join(' ');

        expect(lines).not.toContain('Assembly');
        expect(lines).not.toContain('KEGS IN');
        expect(lines).not.toContain('fuel');
    });

    it('keeps the ways out of a full pair of hands on both versions', () => {
        expect(HANDS_LINES_ANY).toHaveLength(HANDS_LINES.length);
        expect(HANDS_LINES_ANY.join(' ')).toContain('Space');
        expect(HANDS_LINES_ANY.join(' ')).toContain('Esc');
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
        expect(trayFooter(4)).toBe('4 on the tray · carry one to ASSEMBLY (E at KEGS OUT)');
        expect(trayFooter(1)).toContain('1 on the tray');
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

        for (const line of HANDS_LINES) expect(panel.lines).toContain(line);
    });

    it('keeps them off the panel while the plunger is still taking input', () => {
        expect(handsPanel({ phase: 'mash' }).shown).toBe(false);
    });

    it('drops the keg wording for a stick, which does not go to Assembly', () => {
        const panel = handsPanel({ phase: 'hands', itemType: 'stick' });

        expect(panel.shown).toBe(true);
        expect(panel.lines.join(' ')).not.toContain('Assembly');

        for (const line of HANDS_LINES_ANY) expect(panel.lines).toContain(line);
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
            entry.text.includes('on the tray'),
        );

    it('names the haul as soon as one keg is waiting, cap or no cap', () => {
        const footer = footerOf(1);

        expect(footer?.visible).toBe(true);
        expect(footer?.text).toBe(trayFooter(1));
    });

    it('counts the four kegs the playtester never knew they had made', () => {
        expect(footerOf(4)?.text).toContain('4 on the tray');
    });

    it('stays out of the way while the tray is empty', () => {
        expect(footerOf(0)?.visible ?? false).toBe(false);
    });
});
