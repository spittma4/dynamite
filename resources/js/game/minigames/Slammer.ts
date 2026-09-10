import {
    type Chute,
    type MgOp,
    type PlayerState,
    type SlammerHeatConfig,
    type SlammerMg,
    type SlammerOutcome,
    type SlammerPhase,
    STATION_LABEL,
    type StationState,
    TILE_PX,
    chargeSeconds,
    decodeMg,
    gaugeTopMs,
    okWindowMs,
    targetMs,
} from '@shared';
import type Phaser from 'phaser';

import { gameAudio } from '../audio/Audio';
import type { CueName } from '../audio/cues';
import { type Pulse, PulseTrack } from '../audio/tracks';
import { GROOVE, HANDS_FULL, INTAKE_ZONE, PRIME_KEG } from '../nouns';
import { KEGS_IN, KEGS_OUT } from '../render/dropTargets';
import { UI } from '../render/palette';
import { throwDistance } from '../ui/format';
import type { Factory } from '../scenes/Factory';
import type {
    MinigameOverlay,
    OverlayContext,
    OverlayFactory,
    OverlayKey,
    StationView,
} from './types';

/**
 * The Slammer (F07 §Operator overlay, §In-world view). The operator's panel and
 * the hopper every other player can see are one file because they read the same
 * `StationState.mg` and would otherwise duplicate its decode and its escalation
 * rules.
 *
 * The client judges nothing. The needle runs on the local clock from Space-down
 * because a 20 Hz patch is too coarse to aim at a ±50 ms hairline, but the band
 * it is aimed at is always the one the *server* published — `mg.okMs` is the
 * integer the judgement used — so what the player sees is the rule they are
 * actually being scored against. The prediction only fills the gap between the
 * press and the patch that confirms it, and is replaced the moment it arrives.
 */

/** The panel's furniture. Pixels, tuned in the playtest, not from the design docs. */
const PANEL = {
    titleX: 16,
    titleY: 8,
    verdictY: 34,
    chuteY: 62,
    chutePx: 48,
    chuteGap: 6,
    plungerH: 5,
    plungerGap: 8,
    gaugeGap: 28,
    gaugeH: 26,
    gaugeFraction: 0.6,
    readoutGap: 14,
    readoutPx: 96,
    minGaugePx: 140,
    needleW: 3,
    legendGap: 16,
    footerGap: 8,
} as const;

/** The gauge sits centred against the chute keys rather than on their top edge. */
const GAUGE_Y = PANEL.chuteY + (PANEL.chutePx - PANEL.gaugeH) / 2;

/** The in-world show. One block so a playtest can tune it without a hunt. */
export const SLAMMER_SHOW = {
    glowRadiusPx: TILE_PX * 0.75,
    glowTweenMs: 300,
    comboLiftPx: TILE_PX,
    comboPopMs: 150,
    flagLiftPx: TILE_PX * 1.5,
    flagRaiseMs: 300,
    flagDroopMs: 500,
    flagDroopAngle: 60,
    squashMs: 120,
    shakeMs: [60, 120] as const,
    shakeIntensity: [0.004, 0.008] as const,
    confetti: [24, 48] as const,
    steamMs: 600,
    rippleMs: 300,
} as const;

export const SLAMMER_COLOURS = {
    band: 0xf2a03c,
    dead: 0xf5c542,
    late: 0xd9463d,
    track: 0x22222a,
    trackEdge: 0x6a6a78,
    needle: 0xffffff,
    chuteOff: 0x3a3a44,
    chuteLit: 0xf5c542,
    chuteEdge: 0x7a7a88,
    plunger: 0x4cb944,
    good: 0x4cb944,
    early: 0xbbbbbb,
    glowLazy: 0xffb340,
    glowHot: 0xfff2c0,
    confetti: [0xf5c542, 0xf2921d, 0xffffff, 0x4cb944] as const,
    steam: 0xdddddd,
    ripple: 0xf5c542,
} as const;

/** How long the needle and the verdict hold still after a release. */
const FREEZE_MS = 800;

/**
 * How far ahead the band cues are booked (F18). A scheduled voice cannot be
 * taken back, so this is the window in which a pulse is already committed: on
 * the tightest shipped window (`okMsAtMinCharge`, 105 ms) the leading edge goes
 * onto the AudioContext timeline the moment the charge is confirmed, and a
 * release before it still hears the tick it was booked for. That is why
 * `slammerPulses` stops at the gold — a *trailing* pulse booked this early was
 * committed 15 ms before the gold moment and leaked after every clean release.
 */
export const BAND_BOOK_AHEAD_MS = 120;

/**
 * How long the operator's verdict waits behind the hopper (F18). Fired
 * together, `miss` (sawtooth 160) and `pfft` (sawtooth 220) are one muddy buzz
 * rather than two facts; landed in sequence they read the way `perfect`'s own
 * two voices do — the event, then the judgement of it.
 */
export const VERDICT_DELAY_MS = 120;

/** How long a refused chute press flashes red under the key that made it. */
export const REJECT_FLASH_MS = 150;

/** The sight posts: thin, and tall enough to read against the track edge. */
const SIGHT_PX = 2;
const SIGHT_LEN = 6;

/** How long a locally started needle runs before a silent server cancels it. */
const GRACE_MS = 400;

const HEAT_GLOW_FLOOR = 0.3;

const TITLE = 'BOOM POWDER — THE SLAMMER';

/**
 * The always-on keybind row. The floor drop is off it deliberately: it was the
 * only destination the legend named, and it is the one action the game charges
 * you for — a keg on the floor is what a blast chains through (ADR 0008).
 */
export const LEGEND = '← ↑ → mash each once · hold SPACE · release on the gold · ESC bail';

/** An OK release: inside the orange, outside the gold. A keg, not a prime keg. */
export const IN_THE_BAND = 'IN THE BAND';

/**
 * Functional labels rather than joke copy, so they stay here instead of in
 * `copy.json` (contracts §14).
 *
 * One key per row, one action per row: the Esc binding used to be buried inside
 * the E row, where nobody scanning a key column would find it. The walk leads,
 * because it is the answer `ui/helpContent.ts` gives, and it names the paint
 * the player will be standing on rather than only the stripes.
 */
export function handsLinesKeg(throwTiles: number): readonly string[] {
    return [
        `WASD   walk it to ${STATION_LABEL.assembly} — ${INTAKE_ZONE}`,
        `E      face the ${KEGS_IN} shelf there — E puts it down`,
        `Space  throw it ${throwDistance(throwTiles)} — E catches`,
        `Esc    drop the ${GROOVE.toLowerCase()}, combo and all`,
    ];
}

/**
 * The same four rows for a pair of hands holding something that is not a keg.
 * `hands` is not a keg phase: the server flips it on any carried item
 * (`game-server/src/sim/minigames/slammer.ts`), and `pickUp` and `tryCatch`
 * will hand a joined operator a stick. Telling them to walk that to Assembly
 * sends them to the wrong end of the factory.
 */
export function handsLinesAny(throwTiles: number): readonly string[] {
    return [
        'WASD   walk it to the station that takes it',
        'E      put it down where the floor lights up',
        `Space  throw it ${throwDistance(throwTiles)} — E catches`,
        `Esc    drop the ${GROOVE.toLowerCase()}, combo and all`,
    ];
}

/** Which set of rows a full pair of hands gets, from what is actually in them. */
export function handsLines(itemType: string, throwTiles: number): readonly string[] {
    return itemType === 'keg' ? handsLinesKeg(throwTiles) : handsLinesAny(throwTiles);
}

/**
 * The line that unblocks the factory. It used to live only on the hands panel,
 * which the operator sees when the out tray hits its cap of six — so a session
 * that made four kegs was never told, anywhere, that kegs have somewhere to go.
 */
export function trayFooter(onTray: number): string {
    if (onTray <= 0) return '';

    // 'the tray' was painted on nothing: `shelfLabel('out', …)` writes KEGS OUT
    // on that shelf, which is the sign the player walks to. The destination
    // comes off `STATION_LABEL`, the same table the floor nameplate reads, so
    // this line and the machine it points at cannot be spelled two ways.
    return `${onTray} on ${KEGS_OUT} · carry one to ${STATION_LABEL.assembly} (E)`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

export function chuteFor(key: OverlayKey): Chute | null {
    if (key === 'left') return 'l';
    if (key === 'up') return 'u';
    if (key === 'right') return 'r';

    return null;
}

export type KeyPlan =
    | { kind: 'ignore' }
    | { kind: 'consume' }
    | { kind: 'send'; op: MgOp; v?: Chute };

/**
 * `ignore` lets F04's floor behaviour fire, which is the only way `E`, `Space`
 * and `Esc` still work with a keg in your hands — the plunger takes no input at
 * all in that phase, so putting the keg down is never blocked by the station
 * that handed it to you.
 */
export function keyPlan(
    phase: SlammerPhase,
    key: OverlayKey,
    down: boolean,
    repeat: boolean,
): KeyPlan {
    if (key === 'interact' || key === 'esc') return { kind: 'ignore' };

    if (phase === 'hands') return { kind: 'ignore' };

    // A held chute key would otherwise arrive as a fourth press and spill.
    if (repeat) return { kind: 'consume' };

    const chute = chuteFor(key);

    if (chute !== null) {
        return down ? { kind: 'send', op: 'mash', v: chute } : { kind: 'consume' };
    }

    if (key === 'space') return { kind: 'send', op: down ? 'charge' : 'release' };

    return { kind: 'consume' };
}

/**
 * The verdict, in the words the rest of the factory uses for the same keg.
 *
 * The enum reads backwards from the player's view: `judgeRelease` returns
 * 'dead_center' for the gold and 'prime' for the orange band, and `kegFor`
 * gives `prime: true` to 'dead_center' alone. So the badge reading PRIME KEG
 * was over the release that makes an ordinary one, while the keg the Jig chips
 * '· PRIME KEG' on came out of the Slammer announced as DEAD CENTER. The enum
 * member keeps its name — it is the server's — and the noun moves to the keg
 * that earns it.
 *
 * A miss says what it made, not only how far off it was: `kegFor` turns late
 * into damp and early into dud, and a bare '+214' taught nobody that.
 */
export function outcomeLabel(outcome: SlammerOutcome, errorMs: number): string {
    if (outcome === '') return '';

    if (outcome === 'dead_center') return PRIME_KEG;

    if (outcome === 'prime') return IN_THE_BAND;

    const off = Math.abs(Math.round(errorMs));

    return outcome === 'late' ? `LATE +${off} — DAMP KEG` : `EARLY −${off} — DUD KEG`;
}

export function outcomeColour(outcome: SlammerOutcome): number {
    if (outcome === 'dead_center') return SLAMMER_COLOURS.dead;

    if (outcome === 'prime') return SLAMMER_COLOURS.good;

    if (outcome === 'late') return SLAMMER_COLOURS.late;

    if (outcome === 'early') return SLAMMER_COLOURS.early;

    return UI.text;
}

export interface GaugeGeometry {
    pxPerMs: number;
    targetX: number;
    bandX: number;
    bandW: number;
    deadX: number;
    deadW: number;
    /** The gold sights: at least `SIGHT_SPAN_PX` apart, centred on `targetX`. */
    sightX: number;
    sightW: number;
    lateX: number;
    lateW: number;
}

/**
 * How far apart the gold sights sit. On the shipped 538 px panel the scale is
 * 0.229 px/ms, so the judged ±50 ms gold strip is 23 px wide and a 3 px
 * needle moving 3.8 px a frame is inside it for under six frames — against
 * the crimp's 87 px and the dock's 121 px, which a player can genuinely hit by
 * eye. The sights are drawn *outside* the track, as two marks to aim between;
 * the strip and the hairline keep their true widths, because widening those
 * would be a claim about the judgement the server does not honour.
 */
export const SIGHT_SPAN_PX = 40;

/**
 * The scale is fixed at `gaugeTopMs`, never the band, so a hot mash draws a
 * smaller band nearer the left and the greed the player chose is legible before
 * the release rather than explained after it. The dead centre is the one width
 * that never moves with heat.
 */
export function gaugeGeometry(
    tCharge: number,
    okMs: number,
    bandOffset: number,
    cfg: SlammerHeatConfig,
    width: number,
): GaugeGeometry | null {
    const top = gaugeTopMs(cfg);

    if (tCharge <= 0 || width <= 0 || top <= 0) return null;

    const pxPerMs = width / top;
    const target = targetMs(tCharge, bandOffset);
    const span = (fromMs: number, toMs: number): { x: number; w: number } => {
        const x = clamp(fromMs * pxPerMs, 0, width);

        return { x, w: Math.max(0, clamp(toMs * pxPerMs, 0, width) - x) };
    };

    const band = span(target - okMs, target + okMs);
    const dead = span(target - cfg.deadCenterMs, target + cfg.deadCenterMs);
    const late = span(target + okMs, target + okMs + cfg.overholdMs);
    const targetX = clamp(target * pxPerMs, 0, width);
    const sightW = Math.min(width, Math.max(dead.w, SIGHT_SPAN_PX));

    return {
        pxPerMs,
        targetX,
        bandX: band.x,
        bandW: band.w,
        deadX: dead.x,
        deadW: dead.w,
        sightX: clamp(targetX - sightW / 2, 0, width - sightW),
        sightW,
        lateX: late.x,
        lateW: late.w,
    };
}

/**
 * The mash as a count-in (F18). Two ticks and an accent: the accent is the
 * third chute, which is the moment the plunger is loaded and `Space` becomes
 * live, so the hand learns "tick tick TOCK — now hold" without reading a bar.
 */
export function mashCue(pressed: number): CueName {
    return pressed >= 3 ? 'tickAccent' : 'tick';
}

/**
 * The two moments of a charge, in seconds on the **local** clock (F18,
 * contracts §7). The Slammer judges press-to-press intervals on the client's
 * own clock and the needle runs off `performance.now()`, so booking these off
 * the server clock would put the TOCK somewhere other than where the player can
 * see the needle is — which is the precise failure the whole feature exists to
 * prevent. `okMs` and `bandOffset` are the server's own published numbers, so
 * the sound marks the band the release is actually scored against.
 *
 * Two, not three. "Band opens, TOCK" is the whole rhythm the player acts on;
 * the band's closing edge only ever reports on a release that can no longer be
 * made, and — booked `BAND_BOOK_AHEAD_MS` early against a 105 ms window — it
 * was committed before the gold and leaked over every clean release.
 */
export function slammerPulses(
    needleStartMs: number,
    tCharge: number,
    okMs: number,
    bandOffset: number,
): Pulse[] {
    if (tCharge <= 0) return [];

    const target = targetMs(tCharge, bandOffset);
    const at = (ms: number): number => (needleStartMs + ms) / 1000;

    return [
        { at: at(target - okMs), cue: 'bandEdge' },
        { at: at(target), cue: 'gold' },
    ];
}

/** The verdict the operator hears. The gold gets its own, which is the point. */
export function releaseCue(outcome: SlammerOutcome): CueName | null {
    if (outcome === '') return null;

    if (outcome === 'dead_center') return 'perfect';

    return outcome === 'prime' ? 'ok' : 'miss';
}

/**
 * The hopper as the whole floor hears it. These are F07's four sounds and they
 * mirror the `fx` the server spends at the same instant, so the noise and the
 * puff of particles are one event rather than two accounts of it. Prime and
 * ordinary differ by *pitch* — a gain difference is the first distinction a
 * noisy room destroys — and an early release has its own cue rather than
 * borrowing `clink`, which also means "you set that down".
 */
export function slamSound(outcome: SlammerOutcome): CueName | null {
    if (outcome === '') return null;

    if (outcome === 'dead_center') return 'thunkBig';
    if (outcome === 'prime') return 'thunk';

    return outcome === 'late' ? 'pfft' : 'dud';
}

/**
 * A chute square's fill. A refused press — a repeat, or a fourth — changes
 * neither `mashed` nor the local record, so without this the key that just went
 * down produced nothing on screen at all and the spill at the hopper, a round
 * trip later and ten tiles away, was left to teach "three is enough".
 */
export function chuteColour(lit: boolean, rejected: boolean): number {
    if (rejected) return SLAMMER_COLOURS.late;

    return lit ? SLAMMER_COLOURS.chuteLit : SLAMMER_COLOURS.chuteOff;
}

export function needleX(elapsedMs: number, pxPerMs: number, width: number): number {
    return clamp(elapsedMs * pxPerMs, 0, width);
}

/**
 * The needle starts on the local Space-down so it does not wait a round trip,
 * but a server that never confirms the charge — three chutes were not in, or
 * the machine was still re-arming — has to be able to take it back.
 */
export function needleLive(phase: SlammerPhase, sinceStartMs: number, graceMs: number): boolean {
    if (phase === 'charge') return true;

    if (phase === 'mash') return sinceStartMs <= graceMs;

    return false;
}

/**
 * The machine takes no mash while it is re-arming, and refusing one changes
 * nothing the client can see — no phase, no `mashed`. So a key lit on the local
 * press has to go dark again by itself once a round trip has passed with the
 * server still holding nothing, or the next real mash is measured from a press
 * that never counted.
 */
export function localMashStale(
    phase: SlammerPhase,
    serverMashed: number,
    sinceFirstMs: number,
    graceMs: number,
): boolean {
    return phase === 'idle' && serverMashed === 0 && sinceFirstMs > graceMs;
}

/** Mounting mid-hold (a reconnect) resumes the needle from the server's stamp. */
export function needleStartMs(chargeStartAt: number, serverNow: number, nowMs: number): number {
    return nowMs - (serverNow - chargeStartAt) * 1000;
}

export function predictCharge(
    mashSpanMs: number,
    cfg: SlammerHeatConfig,
): { tCharge: number; okMs: number } {
    const tCharge = chargeSeconds(mashSpanMs / 1000, cfg);

    return { tCharge, okMs: Math.round(okWindowMs(tCharge, cfg)) };
}

export type ChuteLights = Record<Chute, boolean>;

/** The local press lights the key; `mg.mashed` reconciles it on the next patch. */
export function chuteLights(mashed: readonly Chute[], local: readonly Chute[]): ChuteLights {
    return {
        l: mashed.includes('l') || local.includes('l'),
        u: mashed.includes('u') || local.includes('u'),
        r: mashed.includes('r') || local.includes('r'),
    };
}

/**
 * F05 writes `working` for the whole cycle — the mash, the charge, and the
 * re-arm that follows them — so the state alone cannot say which half the
 * machine is in. The phase can: the operator only holds a rep in `mash` and
 * `charge`, so a working machine outside those two is the plunger resetting.
 */
export function isRearming(phase: SlammerPhase, stationState: string): boolean {
    if (phase === 'mash' || phase === 'charge') return false;

    return stationState === 'working';
}

/**
 * What the local chute record survives. The three presses of one mash can land
 * in different server ticks, so the patch that confirms the first must not wipe
 * the two still in flight; only a cycle that has ended clears them.
 */
export function localAfterPhase(next: SlammerPhase, local: readonly Chute[]): Chute[] {
    return next === 'idle' || next === 'hands' ? [] : [...local];
}

export function heatAlpha(heat: number): number {
    return clamp(heat, 0, 1);
}

/** Amber at a lazy hopper, near-white at a hot one; off entirely at heat 0. */
export function heatTint(heat: number): number {
    const u = clamp((heat - HEAT_GLOW_FLOOR) / (1 - HEAT_GLOW_FLOOR), 0, 1);
    const mix = (shift: number): number => {
        const from = (SLAMMER_COLOURS.glowLazy >> shift) & 0xff;
        const to = (SLAMMER_COLOURS.glowHot >> shift) & 0xff;

        return Math.round(from + (to - from) * u);
    };

    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export interface TierShow {
    flag: boolean;
    steam: boolean;
    ripple: boolean;
}

/** The 10 / 25 / 50 escalation, already counted into `mg.tier` by the server. */
export function tierShow(tier: number): TierShow {
    return { flag: tier >= 1, steam: tier >= 2, ripple: tier >= 3 };
}

export function readoutText(okMs: number): string {
    return okMs > 0 ? `±${okMs} ms` : '±— ms';
}

export function comboText(combo: number): string {
    return `${combo}×`;
}

/** The band currently drawn: predicted at Space-down, the server's once it lands. */
interface Aim {
    tCharge: number;
    okMs: number;
}

class SlammerOverlay implements MinigameOverlay {
    readonly capturesMovement = true;

    private ctx: OverlayContext | null = null;
    private mg: SlammerMg | null = null;
    private lastMg = '';
    private lastPhase: SlammerPhase = 'idle';

    private local: Chute[] = [];
    private localFirstMs = 0;
    private localThirdMs = 0;
    private needleStart = -1;
    private aim: Aim | null = null;
    private frozenX = -1;
    private frozenUntil = 0;
    /** The chute whose press was refused, and how long its square stays red. */
    private rejected: Chute | null = null;
    private rejectedUntil = 0;

    /** tick / TOCK / tick across the band, on the same clock as the needle (F18). */
    private readonly band = new PulseTrack(BAND_BOOK_AHEAD_MS);

    private gaugeX = 0;
    private gaugeW = 0;
    private paintedGauge = '';
    private paintedChutes = '';
    private paintedVerdict = '';
    private paintedFooter = '';
    private carriedType = '';
    /** `level.carry.throwTiles`, so the hands rows quote the level, not a guess. */
    private throwTiles = 0;

    private gauge: Phaser.GameObjects.Graphics | null = null;
    private needle: Phaser.GameObjects.Graphics | null = null;
    private chutes: Phaser.GameObjects.Graphics | null = null;
    private chuteLabels: Phaser.GameObjects.Text[] = [];
    private verdict: Phaser.GameObjects.Text | null = null;
    private okWindow: Phaser.GameObjects.Text | null = null;
    private combo: Phaser.GameObjects.Text | null = null;
    private legend: Phaser.GameObjects.Text | null = null;
    private footer: Phaser.GameObjects.Text | null = null;
    private hands: Phaser.GameObjects.Container | null = null;
    private handsRows: Phaser.GameObjects.Text[] = [];

    mount(ctx: OverlayContext): void {
        this.ctx = ctx;
        this.reset();

        this.throwTiles = ctx.scene.levelConfig.carry.throwTiles;

        const scene = ctx.scene;
        const add = (o: Phaser.GameObjects.GameObject): void => {
            ctx.container.add(o);
        };

        this.gaugeX = Math.round(
            PANEL.titleX + 3 * PANEL.chutePx + 2 * PANEL.chuteGap + PANEL.gaugeGap,
        );
        // A narrow map would otherwise push the readout off the end of the panel.
        this.gaugeW = Math.max(
            PANEL.minGaugePx,
            Math.min(
                Math.round(ctx.width * PANEL.gaugeFraction),
                ctx.width - this.gaugeX - PANEL.readoutPx,
            ),
        );

        add(
            scene.add.text(PANEL.titleX, PANEL.titleY, TITLE, {
                fontFamily: 'monospace',
                fontSize: '16px',
                color: hex(UI.text),
                fontStyle: 'bold',
            }),
        );

        this.chutes = scene.add.graphics();
        add(this.chutes);

        this.chuteLabels = (['←', '↑', '→'] as const).map((glyph, i) => {
            const label = scene.add.text(
                PANEL.titleX + i * (PANEL.chutePx + PANEL.chuteGap) + PANEL.chutePx / 2,
                PANEL.chuteY + PANEL.chutePx / 2,
                glyph,
                { fontFamily: 'monospace', fontSize: '22px', color: hex(UI.text) },
            );

            label.setOrigin(0.5, 0.5);
            add(label);

            return label;
        });

        this.gauge = scene.add.graphics();
        add(this.gauge);

        this.needle = scene.add.graphics();
        this.needle.fillStyle(SLAMMER_COLOURS.needle, 1);
        this.needle.fillRect(-PANEL.needleW / 2, GAUGE_Y, PANEL.needleW, PANEL.gaugeH);
        this.needle.setVisible(false);
        add(this.needle);

        this.verdict = scene.add.text(this.gaugeX, PANEL.verdictY, '', {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: hex(UI.text),
            fontStyle: 'bold',
        });
        add(this.verdict);

        this.okWindow = scene.add.text(
            this.gaugeX + this.gaugeW + PANEL.readoutGap,
            GAUGE_Y - 2,
            readoutText(0),
            { fontFamily: 'monospace', fontSize: '13px', color: hex(UI.text) },
        );
        add(this.okWindow);

        this.combo = scene.add.text(
            this.gaugeX + this.gaugeW + PANEL.readoutGap,
            GAUGE_Y + PANEL.gaugeH - 13,
            comboText(0),
            { fontFamily: 'monospace', fontSize: '15px', color: hex(SLAMMER_COLOURS.dead) },
        );
        add(this.combo);

        this.legend = scene.add.text(
            PANEL.titleX,
            PANEL.chuteY + PANEL.chutePx + PANEL.plungerGap + PANEL.legendGap,
            LEGEND,
            {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#9a9aa4',
                wordWrap: { width: ctx.width - PANEL.titleX * 2 },
            },
        );
        add(this.legend);

        this.footer = scene.add.text(this.gaugeX, GAUGE_Y + PANEL.gaugeH + PANEL.footerGap, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: hex(SLAMMER_COLOURS.dead),
        });
        this.footer.setVisible(false);
        add(this.footer);

        this.hands = this.buildHandsPanel(ctx);
        add(this.hands);
    }

    update(station: StationState, me: PlayerState, serverNow: number): void {
        if (!this.ctx) return;

        this.carriedType = this.typeOf(this.ctx, me.carrying);

        if (station.mg !== this.lastMg) {
            this.lastMg = station.mg;

            const next = decodeMg(station.mg);

            // A stale or malformed blob is dropped, never thrown, mid-render.
            if (next) this.applyMg(next, serverNow);
        }

        if (!this.mg) return;

        this.draw(this.mg, station, performance.now());
    }

    onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean {
        const ctx = this.ctx;

        if (!ctx) return false;

        const plan = keyPlan(this.mg?.phase ?? 'idle', key, down, repeat);

        if (plan.kind === 'ignore') return false;

        if (plan.kind === 'consume') return true;

        if (plan.op === 'mash' && plan.v !== undefined) this.noteMash(plan.v);

        if (plan.op === 'charge') this.startNeedle();

        if (plan.op === 'release') this.freezeNeedle(performance.now());

        ctx.send(plan.op, plan.v);

        return true;
    }

    unmount(): void {
        this.ctx?.container.removeAll(true);
        this.gauge = null;
        this.needle = null;
        this.chutes = null;
        this.chuteLabels = [];
        this.verdict = null;
        this.okWindow = null;
        this.combo = null;
        this.legend = null;
        this.footer = null;
        this.hands = null;
        this.handsRows = [];
        this.ctx = null;
        this.mg = null;
        this.lastMg = '';
        this.reset();
    }

    private reset(): void {
        this.lastPhase = 'idle';
        this.local = [];
        this.needleStart = -1;
        this.band.clear();
        this.aim = null;
        this.frozenX = -1;
        this.frozenUntil = 0;
        this.rejected = null;
        this.rejectedUntil = 0;
        this.paintedGauge = '';
        this.paintedChutes = '';
        this.paintedVerdict = '';
        this.paintedFooter = '';
        this.carriedType = '';
    }

    /** What is actually in the operator's hands, which the phase does not say. */
    private typeOf(ctx: OverlayContext, itemId: string): string {
        if (itemId === '') return '';

        return ctx.state.items.get(itemId)?.type ?? '';
    }

    private applyMg(next: SlammerMg, serverNow: number): void {
        const from = this.lastPhase;

        this.mg = next;

        if (next.phase === from) return;

        this.lastPhase = next.phase;

        if (next.phase === 'charge') {
            // The server's window is the judged one, so it replaces the guess.
            this.aim = { tCharge: next.tCharge, okMs: next.okMs };

            if (this.needleStart < 0) {
                this.needleStart = needleStartMs(next.chargeStartAt, serverNow, performance.now());
            }

            // Booked only now, on the server's numbers. Booking on the local
            // prediction would need a cancel when a clamped mash moves the band,
            // and a scheduled voice cannot be taken back (F18 §Risks).
            this.band.aim(
                slammerPulses(this.needleStart, next.tCharge, next.okMs, next.bandOffset),
            );

            return;
        }

        // The band is over the moment the charge is; the pulses it has not
        // booked yet are about a needle nobody is watching any more.
        this.band.clear();

        if (from === 'charge') {
            // An overhold fires server-side, so the freeze has to work with no
            // local release to hang it on.
            const now = performance.now();
            const verdict = releaseCue(next.lastOutcome);

            // Behind the hopper rather than on top of it: `slamSound` fires on
            // this same patch, and two sawtooths started together are one buzz.
            if (verdict !== null) gameAudio.afterMs(verdict, VERDICT_DELAY_MS);

            if (this.frozenUntil <= now) this.freezeNeedle(now);
        }

        // The presses and the needle belong to the rep, so they only go when it
        // does: the patch that confirms the first chute of a split mash is a
        // phase change too, and the two behind it are still in flight.
        this.local = localAfterPhase(next.phase, this.local);

        if (this.local.length === 0) this.needleStart = -1;
    }

    private noteMash(chute: Chute): void {
        if (this.local.length === 0) {
            this.localFirstMs = performance.now();
            this.aim = null;
            this.frozenUntil = 0;
        }

        // A repeat or a fourth press is an overflow the server answers with a
        // spill — which arrives a round trip later, at the hopper. The square
        // under the key that was refused flashes red now, so the press has an
        // answer on the screen the player is looking at as well as in the ear.
        if (this.local.includes(chute) || this.local.length >= 3) {
            this.rejected = chute;
            this.rejectedUntil = performance.now() + REJECT_FLASH_MS;
            gameAudio.play('slop');

            return;
        }

        this.local.push(chute);

        if (this.local.length === 3) this.localThirdMs = performance.now();

        gameAudio.play(mashCue(this.local.length));
    }

    private startNeedle(): void {
        const cfg = this.mg?.cfg;

        if (!cfg || this.local.length < 3) return;

        this.needleStart = performance.now();
        this.frozenUntil = 0;
        this.aim = predictCharge(this.localThirdMs - this.localFirstMs, cfg);
    }

    private freezeNeedle(nowMs: number): void {
        const geo = this.geometry();

        this.frozenX =
            geo && this.needleStart >= 0
                ? needleX(nowMs - this.needleStart, geo.pxPerMs, this.gaugeW)
                : this.frozenX;
        this.frozenUntil = nowMs + FREEZE_MS;
    }

    private geometry(): GaugeGeometry | null {
        const mg = this.mg;

        if (!mg || !this.aim) return null;

        return gaugeGeometry(this.aim.tCharge, this.aim.okMs, mg.bandOffset, mg.cfg, this.gaugeW);
    }

    private draw(mg: SlammerMg, station: StationState, nowMs: number): void {
        if (
            this.local.length > 0 &&
            localMashStale(mg.phase, mg.mashed.length, nowMs - this.localFirstMs, GRACE_MS)
        ) {
            this.local = [];
            this.aim = null;
        }

        const full = mg.phase === 'hands';

        this.hands?.setVisible(full);
        // The legend describes a plunger that takes no input in this phase, and
        // the four rows below need the band it sits in.
        this.legend?.setVisible(!full);
        this.gauge?.setVisible(!full);
        this.needle?.setVisible(!full);
        this.drawHandsRows(full);
        this.drawFooter(station, full);

        this.drawChutes(mg, station, nowMs);
        this.drawVerdict(mg, nowMs);
        this.okWindow?.setText(readoutText(this.aim?.okMs ?? 0));
        this.combo?.setText(comboText(mg.combo));

        if (full) return;

        this.drawGauge(mg);
        this.moveNeedle(mg, nowMs);
        // The band's pulses come inside the booking horizon a few frames apart,
        // so the cursor is stepped where the needle already is.
        this.band.book(nowMs / 1000, gameAudio);
    }

    private drawChutes(mg: SlammerMg, station: StationState, nowMs: number): void {
        const lights = chuteLights(mg.mashed, this.local);
        const rearming = isRearming(mg.phase, station.state);
        const rejected = this.rejectedUntil > nowMs ? this.rejected : null;
        // The flash is in the key, so the frame it expires on repaints — a
        // refusal changes nothing else about the panel.
        const key = `${lights.l}${lights.u}${lights.r}|${rearming}|${rejected ?? ''}`;

        if (key === this.paintedChutes || !this.chutes) return;

        this.paintedChutes = key;

        const g = this.chutes;
        const order: Chute[] = ['l', 'u', 'r'];

        g.clear();

        order.forEach((chute, i) => {
            const x = PANEL.titleX + i * (PANEL.chutePx + PANEL.chuteGap);
            const lit = lights[chute];

            g.fillStyle(chuteColour(lit, chute === rejected), rearming ? 0.4 : 1);
            g.fillRoundedRect(x, PANEL.chuteY, PANEL.chutePx, PANEL.chutePx, 5);
            g.lineStyle(2, SLAMMER_COLOURS.chuteEdge, rearming ? 0.4 : 1);
            g.strokeRoundedRect(x, PANEL.chuteY, PANEL.chutePx, PANEL.chutePx, 5);
        });

        this.chuteLabels.forEach((label, i) => {
            label.setAlpha(rearming ? 0.4 : 1);
            label.setColor(hex(lights[order[i] ?? 'l'] ? UI.outline : UI.text));
        });

        // A state light, not a timer: F05 pins `progress` to 1 for the whole
        // re-arm, so there is no rise to draw. Full means the plunger is loaded
        // and the chutes above it will take a mash.
        const width = 3 * PANEL.chutePx + 2 * PANEL.chuteGap;
        const y = PANEL.chuteY + PANEL.chutePx + PANEL.plungerGap;

        g.fillStyle(SLAMMER_COLOURS.track, 1);
        g.fillRect(PANEL.titleX, y, width, PANEL.plungerH);

        if (rearming) return;

        g.fillStyle(SLAMMER_COLOURS.plunger, 1);
        g.fillRect(PANEL.titleX, y, width, PANEL.plungerH);
    }

    private drawGauge(mg: SlammerMg): void {
        const geo = this.geometry();
        const key = geo ? `${this.aim?.tCharge}|${this.aim?.okMs}|${mg.bandOffset}` : 'empty';

        if (key === this.paintedGauge || !this.gauge) return;

        this.paintedGauge = key;

        const g = this.gauge;

        g.clear();
        g.setPosition(this.gaugeX, 0);
        g.fillStyle(SLAMMER_COLOURS.track, 1);
        g.fillRect(0, GAUGE_Y, this.gaugeW, PANEL.gaugeH);
        g.lineStyle(1, SLAMMER_COLOURS.trackEdge, 1);
        g.strokeRect(0, GAUGE_Y, this.gaugeW, PANEL.gaugeH);

        if (!geo) return;

        g.fillStyle(SLAMMER_COLOURS.late, 0.28);
        g.fillRect(geo.lateX, GAUGE_Y, geo.lateW, PANEL.gaugeH);
        g.fillStyle(SLAMMER_COLOURS.band, 0.55);
        g.fillRect(geo.bandX, GAUGE_Y, geo.bandW, PANEL.gaugeH);
        g.fillStyle(SLAMMER_COLOURS.dead, 0.35);
        g.fillRect(geo.deadX, GAUGE_Y, geo.deadW, PANEL.gaugeH);
        g.fillStyle(SLAMMER_COLOURS.dead, 1);
        g.fillRect(geo.targetX - 1, GAUGE_Y, 2, PANEL.gaugeH);

        // The sights, outside the track: two posts the eye can aim between when
        // the judged strip between them is only a few frames wide.
        for (const x of [geo.sightX, geo.sightX + geo.sightW - SIGHT_PX]) {
            g.fillRect(x, GAUGE_Y - SIGHT_LEN, SIGHT_PX, SIGHT_LEN);
            g.fillRect(x, GAUGE_Y + PANEL.gaugeH, SIGHT_PX, SIGHT_LEN);
        }
    }

    private moveNeedle(mg: SlammerMg, nowMs: number): void {
        const needle = this.needle;
        const geo = this.geometry();

        if (!needle) return;

        if (this.frozenUntil > nowMs) {
            needle.setVisible(this.frozenX >= 0);
            needle.setX(this.gaugeX + this.frozenX);

            return;
        }

        const live =
            this.needleStart >= 0 &&
            geo !== null &&
            needleLive(mg.phase, nowMs - this.needleStart, GRACE_MS);

        needle.setVisible(live);

        if (!live || !geo) return;

        needle.setX(this.gaugeX + needleX(nowMs - this.needleStart, geo.pxPerMs, this.gaugeW));
    }

    private drawVerdict(mg: SlammerMg, nowMs: number): void {
        const text = outcomeLabel(mg.lastOutcome, mg.lastErrorMs);

        if (text !== this.paintedVerdict) {
            this.paintedVerdict = text;
            this.verdict?.setText(text);
            this.verdict?.setColor(hex(outcomeColour(mg.lastOutcome)));
        }

        this.verdict?.setAlpha(this.frozenUntil > nowMs ? 1 : 0.45);
    }

    /** The rows say what the thing in your hands is, not what the phase implies. */
    private drawHandsRows(full: boolean): void {
        if (!full) return;

        const rows = handsLines(this.carriedType, this.throwTiles);

        this.handsRows.forEach((row, i) => row.setText(rows[i] ?? ''));
    }

    private drawFooter(station: StationState, full: boolean): void {
        const text = full ? '' : trayFooter(station.outputShelf.length);

        if (text !== this.paintedFooter) {
            this.paintedFooter = text;
            this.footer?.setText(text);
        }

        this.footer?.setVisible(text !== '');
    }

    private buildHandsPanel(ctx: OverlayContext): Phaser.GameObjects.Container {
        const scene = ctx.scene;
        const title = scene.add.text(0, 0, HANDS_FULL, {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: hex(SLAMMER_COLOURS.dead),
            fontStyle: 'bold',
        });

        this.handsRows = handsLinesKeg(this.throwTiles).map((line, i) =>
            scene.add.text(0, 30 + i * 18, line, {
                fontFamily: 'monospace',
                fontSize: '13px',
                color: hex(UI.text),
            }),
        );

        const panel = scene.add.container(this.gaugeX, PANEL.chuteY - 4, [
            title,
            ...this.handsRows,
        ]);

        panel.setVisible(false);

        return panel;
    }
}

/**
 * The hopper as everyone else sees it (F07 §In-world view). The escalation is
 * read straight off `mg` — heat, combo and tier are the server's — so a player
 * across the floor and the operator agree without a second source of truth.
 *
 * It deliberately installs no `scene.fx.override`: `thunk`, `clink`, `pfft` and
 * `slop` are shared kinds (F05 emits a `clink` at every shelving), an override
 * is global to the kind, and `Fx` has no way to fall through to the default —
 * so overriding them here would silence other features' effects. The show is
 * driven off the phase leaving `charge` instead, which is the same event.
 */
class SlammerWorldView implements StationView {
    private scene: Factory | null = null;
    private root: Phaser.GameObjects.Container | null = null;
    private glow: Phaser.GameObjects.Graphics | null = null;
    private flag: Phaser.GameObjects.Container | null = null;
    private counter: Phaser.GameObjects.Text | null = null;
    private sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

    private mg: SlammerMg | null = null;
    private lastMg = '';
    private lastPhase: SlammerPhase = 'idle';
    private lastCombo = 0;
    private lastTier = 0;
    private paintedTint = -1;
    private glowAlpha = -1;

    create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void {
        this.scene = scene;

        const x = (station.anchorX + 0.5) * TILE_PX;
        const y = (station.anchorY + 0.5) * TILE_PX;

        this.glow = scene.add.graphics();
        this.glow.setAlpha(0);

        this.counter = scene.add.text(0, -SLAMMER_SHOW.comboLiftPx, '', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: hex(SLAMMER_COLOURS.dead),
            fontStyle: 'bold',
        });
        this.counter.setOrigin(0.5, 0.5);
        this.counter.setStroke('#000000', 3);
        this.counter.setVisible(false);

        this.flag = this.buildFlag(scene);
        this.sparks = scene.add.particles(0, 0, 'dot', { emitting: false });

        this.root = scene.add.container(x, y, [this.glow, this.sparks, this.flag, this.counter]);
        layer.add(this.root);
    }

    update(station: StationState, _serverNow: number): void {
        if (!this.root) return;

        if (station.mg !== this.lastMg) {
            this.lastMg = station.mg;

            const next = decodeMg(station.mg);

            if (next) {
                this.mg = next;
                this.react(next);
            }
        }

        const mg = this.mg;

        if (!mg) return;

        this.drawGlow(mg.heat);
    }

    destroy(): void {
        this.root?.destroy(true);
        this.root = null;
        this.glow = null;
        this.flag = null;
        this.counter = null;
        this.sparks = null;
        this.scene = null;
        this.mg = null;
    }

    /** Everything that animates once, keyed off a change the server published. */
    private react(mg: SlammerMg): void {
        const scene = this.scene;

        if (!scene) return;

        if (mg.combo !== this.lastCombo) {
            this.lastCombo = mg.combo;
            this.showCombo(scene, mg.combo);
        }

        if (mg.tier !== this.lastTier) {
            const rising = mg.tier >= 1 && this.lastTier === 0;
            const falling = mg.tier === 0 && this.lastTier >= 1;

            this.lastTier = mg.tier;

            if (rising) this.raiseFlag(scene);

            if (falling) this.droopFlag(scene);
        }

        const wasCharging = this.lastPhase === 'charge';

        this.lastPhase = mg.phase;

        // Every release — a hit, a miss, or the plunger blowing by itself —
        // leaves `charge`, so the show never needs a second trigger.
        if (wasCharging && mg.phase !== 'charge') this.slam(scene, mg);
    }

    private slam(scene: Factory, mg: SlammerMg): void {
        const hit = mg.lastOutcome === 'dead_center' || mg.lastOutcome === 'prime';
        const show = tierShow(mg.tier);
        const big = mg.lastOutcome === 'dead_center' ? 1 : 0;
        const sound = slamSound(mg.lastOutcome);

        // The hopper, for everyone on the floor rather than only the operator —
        // this view is mounted on every client, which is what makes a keg you
        // are walking towards something you can hear being made.
        if (sound !== null) gameAudio.play(sound);

        this.squash(scene);

        if (!hit) return;

        scene.cameras.main.shake(SLAMMER_SHOW.shakeMs[big], SLAMMER_SHOW.shakeIntensity[big]);
        this.burst(SLAMMER_SHOW.confetti[big], [...SLAMMER_COLOURS.confetti], [60, 160], 500, 0);

        if (show.steam) this.burst(6, SLAMMER_COLOURS.steam, [20, 45], SLAMMER_SHOW.steamMs, -90);

        if (show.ripple) this.ripple(scene);
    }

    private squash(scene: Factory): void {
        const glow = this.glow;

        if (!glow) return;

        glow.setScale(1, 1);
        scene.tweens.add({
            targets: glow,
            scaleY: 0.85,
            duration: SLAMMER_SHOW.squashMs / 2,
            yoyo: true,
        });
    }

    private burst(
        count: number,
        tint: number | number[],
        speed: [number, number],
        lifespan: number,
        angle: number,
    ): void {
        const sparks = this.sparks;

        if (!sparks) return;

        sparks.setConfig({
            speed: { min: speed[0], max: speed[1] },
            lifespan,
            tint,
            gravityY: angle === 0 ? 220 : 0,
            angle: angle === 0 ? { min: 0, max: 360 } : { min: angle - 20, max: angle + 20 },
            quantity: 1,
            emitting: false,
        });
        sparks.explode(count, 0, 0);
    }

    private ripple(scene: Factory): void {
        const root = this.root;

        if (!root) return;

        const ring = scene.add.graphics();

        ring.lineStyle(2, SLAMMER_COLOURS.ripple, 0.8);
        ring.strokeCircle(0, 0, TILE_PX / 2);
        root.add(ring);
        scene.tweens.add({
            targets: ring,
            scale: 2,
            alpha: 0,
            duration: SLAMMER_SHOW.rippleMs,
            onComplete: () => ring.destroy(),
        });
    }

    private showCombo(scene: Factory, combo: number): void {
        const counter = this.counter;

        if (!counter) return;

        counter.setVisible(combo >= 1);

        if (combo < 1) return;

        counter.setText(comboText(combo));
        counter.setScale(1.3);
        scene.tweens.add({ targets: counter, scale: 1, duration: SLAMMER_SHOW.comboPopMs });
    }

    private drawGlow(heat: number): void {
        const glow = this.glow;
        const scene = this.scene;

        if (!glow || !scene) return;

        const tint = heatTint(heat);
        const alpha = heatAlpha(heat);

        if (tint !== this.paintedTint) {
            this.paintedTint = tint;
            glow.clear();
            glow.fillStyle(tint, 0.5);
            glow.fillCircle(0, 0, SLAMMER_SHOW.glowRadiusPx);
            glow.fillStyle(tint, 0.35);
            glow.fillCircle(0, 0, SLAMMER_SHOW.glowRadiusPx * 1.4);
        }

        // The target, not the live value: mid-tween the two never agree, and
        // comparing against the live one restacks a tween every frame.
        if (alpha === this.glowAlpha) return;

        this.glowAlpha = alpha;
        scene.tweens.add({ targets: glow, alpha, duration: SLAMMER_SHOW.glowTweenMs });
    }

    private buildFlag(scene: Factory): Phaser.GameObjects.Container {
        const pole = scene.add.graphics();

        pole.lineStyle(2, 0x9a9aa4, 1);
        pole.lineBetween(0, 0, 0, -SLAMMER_SHOW.flagLiftPx);
        pole.fillStyle(SLAMMER_COLOURS.dead, 1);
        pole.fillTriangle(
            0,
            -SLAMMER_SHOW.flagLiftPx,
            TILE_PX * 0.7,
            -SLAMMER_SHOW.flagLiftPx + 7,
            0,
            -SLAMMER_SHOW.flagLiftPx + 14,
        );

        const flag = scene.add.container(0, 0, [pole]);

        flag.setVisible(false);

        return flag;
    }

    private raiseFlag(scene: Factory): void {
        const flag = this.flag;

        if (!flag) return;

        flag.setVisible(true);
        flag.setAngle(-90);
        scene.tweens.add({ targets: flag, angle: 0, duration: SLAMMER_SHOW.flagRaiseMs });
    }

    private droopFlag(scene: Factory): void {
        const flag = this.flag;

        if (!flag) return;

        scene.tweens.add({
            targets: flag,
            angle: SLAMMER_SHOW.flagDroopAngle,
            duration: SLAMMER_SHOW.flagDroopMs,
            onComplete: () => flag.setVisible(false),
        });
    }
}

export const slammerOverlay: OverlayFactory = () => new SlammerOverlay();

export const slammerStationView = (): StationView => new SlammerWorldView();
