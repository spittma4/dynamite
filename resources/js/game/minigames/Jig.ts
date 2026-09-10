import {
    type AssemblyMinigame,
    type FuseLength,
    type JigBPhase,
    type JigCradle,
    type JigGrade,
    type JigLane,
    type JigMg,
    type JigNote,
    type JigPhase,
    type JigWindow,
    type ItemType,
    type LevelConfig,
    MAX_INPUT_BACKDATE_S,
    type MgOp,
    type PlayerState,
    type PourConfig,
    STATION_LABEL,
    type StationState,
    type StationType,
    type TossConfig,
    pourFillAt,
    pourWindow,
} from '@shared';
import type Phaser from 'phaser';

import { gameAudio } from '../audio/Audio';
import type { CueName } from '../audio/cues';
import { type Pulse, PulseTrack } from '../audio/tracks';
import {
    FUSE_SET,
    HANDS_FULL,
    INTAKE_ZONE,
    NOTHING_ON_THE_BOARD,
    PRIME_KEG,
} from '../nouns';
import { KEGS_OUT, pluralOf, producedBy, shelfLabel } from '../render/dropTargets';
import { RACK_COLOURS, rackBins, rackCaption } from '../render/fuseRack';
import { KEG_WORD, kegLook } from '../render/stationGlyphs';
import type { Factory } from '../scenes/Factory';
import type { MinigameOverlay, OverlayContext, OverlayFactory, OverlayKey } from './types';

/**
 * The Jig's panel (F08 §Client). Two players share one station, so the overlay
 * draws the role the local player holds: A gets the seat picker and the phrase
 * — fill line, knot lanes, ratchet clicks — and B gets the spool, the arc and
 * the order chip. Every mark on it comes from `StationState.mg` and the server
 * clock; the client sends presses and judges nothing.
 */

export type JigRole = 'a' | 'b' | 'spectator';

export interface JigSpan {
    from: number;
    to: number;
}

export interface JigBands {
    mark: number;
    perfect: JigSpan;
    ok: JigSpan;
}

export interface JigChip {
    shelfIndex: number;
    itemId: string;
    dents: number;
}

export interface JigPop {
    text: string;
    colour: number;
}

export const JIG_COLOURS = {
    perfect: 0xf5c542,
    ok: 0x4cb944,
    miss: 0xd9463d,
    track: 0x2a2a33,
    trackEdge: 0x6a6a78,
    // Not white. The needle is drawn last, 2 px, over the judged mark and over
    // the third crimp click — both of them `text` — so at the one instant it
    // carries the ±180 ms judgement it disappeared into what it was
    // crossing. Cyan appears nowhere else on the track.
    needle: 0x7fd3ff,
    fill: 0xb8862b,
    overfill: 0xd9463d,
    casing: 0xd62828,
    dent: 0x101014,
    keg: 0x8a6a3a,
    prime: 0xf5c542,
    parts: 0xc8a951,
    brass: 0xf5d67a,
    label: 0xbbbbbb,
    dim: 0x6a6a78,
    wait: 0x7fd3ff,
    text: 0xffffff,
    lane: 0x3b7de0,
} as const;

/** docs/04's two numbers that are not config keys; the server holds the same pair. */
const FETCH_SECONDS = 0.6;
const SURFACE_TAX_SECONDS = 0.5;
/** The brass flash after a PRIME STICK. Client-only (F08 §Data). */
const PRIME_FLASH_SECONDS = 0.6;
/** A chip is 32 px of casing, which is room for three dings and no more. */
const MAX_DINGS = 3;

const GRADE_COLOURS: Record<JigGrade, number> = {
    perfect: JIG_COLOURS.perfect,
    ok: JIG_COLOURS.ok,
    miss: JIG_COLOURS.miss,
};

/**
 * One spelling per refusal. The pop and the right-hand badge can be on screen
 * at the same instant, and they used to disagree — 'FULL' against 'CRADLE
 * FULL', 'BODY IN THE AISLE' against 'AISLE BLOCKED' — so a player read both
 * spellings of one refusal at once.
 */
export const CRADLE_FULL = 'CRADLE FULL';
export const AISLE_BODY = 'BODY IN THE AISLE';

/**
 * Two different things block the aisle and they needed two sentences. A body is
 * a toss *note* — somebody walked through the arc, wore the set, and moved on.
 * An item lying there is a standing refusal: `mg.aisleBlocked` is
 * `view.aisleFloorItem` and nothing else, and while it is true every swing is
 * silently dropped (`shared/src/sim/jig.ts:985`). Drawn as BODY IN THE AISLE it
 * named the wrong cause, pointed at nobody, and never said what to press.
 */
export const AISLE_ITEM = 'SOMETHING ON THE AISLE — E TO LIFT IT';

const NOTE_LABELS: Record<Exclude<JigNote, ''>, string> = {
    early: 'EARLY',
    late: 'LATE',
    lane: 'WRONG LANE',
    full: CRADLE_FULL,
    body: AISLE_BODY,
};

const SPACE_OPS: Record<JigPhase, MgOp | null> = {
    seat: 'seat',
    pour: 'pour',
    parts: null,
    knots: null,
    crimp: 'crimp',
};

const PHASES: JigPhase[] = ['seat', 'pour', 'parts', 'knots', 'crimp'];

/**
 * The strip's word for each stop. `parts` is the sim's name for the phase and
 * the wrong one to show: every other surface calls the object a fuse set, and
 * the cell used to shorten that to 'FUSE' — a fourth name for one object.
 */
const PHASE_LABEL: Record<JigPhase, string> = {
    seat: 'SEAT',
    pour: 'POUR',
    parts: FUSE_SET,
    knots: 'KNOTS',
    crimp: 'CRIMP',
};

/** An `mg` blob the client cannot read leaves the panel empty rather than throwing. */
export function parseJigMg(mg: string): JigMg | null {
    if (mg === '') return null;

    try {
        const parsed: unknown = JSON.parse(mg);

        return typeof parsed === 'object' && parsed !== null ? (parsed as JigMg) : null;
    } catch {
        return null;
    }
}

export function roleOf(mg: JigMg, sessionId: string): JigRole {
    if (sessionId !== '' && sessionId === mg.a) return 'a';
    if (sessionId !== '' && sessionId === mg.b) return 'b';

    return 'spectator';
}

/**
 * The picker draws casings and the pour draws kegs, and both come off the same
 * shelf — so one pass over it answers the seat question and the powder question.
 */
export function readShelf(
    shelf: readonly string[],
    lookup: (itemId: string) => { type: string; dents: number } | undefined,
): { casings: JigChip[]; kegs: number } {
    const casings: JigChip[] = [];
    let kegs = 0;

    shelf.forEach((itemId, shelfIndex) => {
        const item = lookup(itemId);

        if (!item) return;

        if (item.type === 'keg') kegs += 1;
        if (item.type === 'casing') casings.push({ shelfIndex, itemId, dents: item.dents });
    });

    return { casings, kegs };
}

export function casingDings(dents: number): number {
    return Math.max(0, Math.min(MAX_DINGS, Math.floor(dents)));
}

/** The cursor is sticky between cycles, so it is clamped to whatever is left. */
export function moveCursor(cursor: number, delta: number, count: number): number {
    if (count <= 0) return 0;

    return Math.max(0, Math.min(count - 1, cursor + delta));
}

/**
 * The three things a stopped jig is ever short of, in the words the floor
 * already uses for them (`shortageOf`, `render/intake.ts`). A playtester read
 * the old `NO CASINGS` as an errand and went hunting for a station that does
 * not exist in M1 — `feed()` in `shared/src/sim/jig.ts` stocks Assembly's
 * casings itself, so the honest sentence is a wait. But `feed()` bails on
 * `shelfRoom <= 0`, so a shelf packed with kegs is a wait that never ends, and
 * promising a casing there is worse than saying nothing. The last shortage is
 * never "powder": it is a keg, off Boom Powder's out tray, in somebody's hands.
 */
export const CASINGS_COMING = `${pluralOf('casing')} COMING`;
export const NEED_KEG = 'NEED A KEG';

/** The jig winding itself back to the top of the phrase; it clears on its own. */
export const RE_ARMING = 'RE-ARMING';

/**
 * A packed shelf, said to the hands that are reading it. 'TAKE ONE BACK' is an
 * instruction a player already holding a keg physically cannot follow, and
 * nothing told them to put theirs down first or where — so the one sentence
 * written for the dead end was useless to the only person who ever hits it.
 */
export const SHELF_FULL = 'SHELF FULL — LIFT ONE OFF (E)';
export const SHELF_FULL_HANDS = 'SHELF FULL — PUT YOURS DOWN, THEN LIFT ONE OFF';

/**
 * What the cradle is doing, in words. `mg.cradle` is the sim's own enum and
 * `CRADLE SURFACE` — an OK toss that landed askew on the bench — is a state
 * name no player can decode.
 */
export const CRADLE_LABEL: Record<JigCradle, string> = {
    empty: 'CRADLE EMPTY',
    armed: `${FUSE_SET} IN THE CRADLE`,
    surface: `${FUSE_SET} ON THE BENCH`,
};

/**
 * Why B is at the rack at all. The panel drew B's keys and the order chips and
 * named neither the receiver nor the stake, so a first-timer could not learn
 * from it that the jig is stopped until the toss lands.
 */
export const RACK_STAKE = `The jig is stopped until a ${FUSE_SET.toLowerCase()} lands in the cradle.`;

/** The header that turns two loose chips into the reason for the SHORT/LONG press. */
export const ORDER_STRIP_LABEL = 'NEXT ORDERS WANT';

const ORDINALS = ['1st', '2nd', '3rd'];

/** An order's place in the queue. 'o-1' is the database's name for it, not the player's. */
export function orderPlace(index: number): string {
    return ORDINALS[index] ?? `${index + 1}th`;
}

/** The strip every role at a starved station gets, whatever panel they are on. */
export const KEG_STRIP = `${NEED_KEG} — nobody is fetching one`;

/**
 * The machine at the far end of the errand, read off the level's recipes the
 * way the floor sign is (`producedBy`, `render/dropTargets.ts`). Spelled into
 * the panel as a constant it would point at Boom Powder on a level whose kegs
 * came from somewhere else.
 */
export function kegSource(level: Pick<LevelConfig, 'stations' | 'recipes'>): string {
    const maker = level.stations.find((station) => producedBy(station, level.recipes) === 'keg');

    return maker ? STATION_LABEL[maker.type as StationType] : STATION_LABEL.boom_powder;
}

/**
 * The errand as four presses rather than a place name. Every noun in it is the
 * paint the player will be standing in front of — `shelfLabel` builds both the
 * out tray's caption and the IN sign, so the sentence and the floor cannot
 * drift apart.
 */
export function kegRoute(source: string, inSign: string): string {
    // `putDownItem` (game-server/src/sim/items.ts) shelves onto the tile the
    // player is FACING, and the apron is two tiles — the shelf and the aisle you
    // stand in. 'E in the striped zone' was true from only one of them.
    return `ESC · walk to ${source} · E at ${KEGS_OUT} · back in ${INTAKE_ZONE}, face ${inSign}, E`;
}

/** Whether the machine has powder for the next stick, wherever it is sitting. */
export function kegShortage(kegs: number, keg: { poursLeft: number } | null): boolean {
    return kegs === 0 && (keg === null || keg.poursLeft <= 0);
}

/**
 * Why the picker is greyed out. The reasons come from state rather than a flag,
 * and they are ordered the way `shortageOf` orders the floor sign: the machine
 * timer clears itself, their own hands do not, and an errand somebody can run
 * beats a wait nobody can hurry.
 */
export function pickerBlock(input: {
    now: number;
    rearmAt: number;
    casings: number;
    kegs: number;
    room: number;
    keg: { poursLeft: number } | null;
    carrying: string;
}): string {
    if (input.now < input.rearmAt) return RE_ARMING;
    if (input.carrying !== '') return HANDS_FULL;
    if (kegShortage(input.kegs, input.keg)) return NEED_KEG;
    if (input.casings === 0) return input.room > 0 ? CASINGS_COMING : SHELF_FULL;

    return '';
}

/**
 * The two stops nobody can hurry: the jig is re-arming itself, and the jig is
 * printing its own casings. Both clear on their own, and neither is anybody's
 * errand — the same split `shortageOf` draws on the floor with `Shortage.act`.
 */
const PICKER_WAITS: readonly string[] = [RE_ARMING, CASINGS_COMING];

/**
 * What colour a stopped picker says it in. Red is this floor's word for a fault
 * — the miss grade, the overfill, the red beacon — so a wait painted in it told
 * a player who had done nothing wrong that they had, at the one moment the
 * answer was to stand still. A wait gets its own colour; a shortage somebody
 * has to move for keeps the alarm.
 *
 * `wait` is a pale blue rather than a teal because it is drawn touching `ok`:
 * `drawPicker` writes RE-ARMING in it and fills the re-arm bar in `ok` directly
 * beneath. The first teal was 1.01:1 against that green — the same brightness —
 * so to a deuteranope the colour picked to be 'not the OK green' *was* the OK
 * green. Luminance is the one separation colour blindness cannot take away.
 */
export function blockColour(block: string): number {
    return PICKER_WAITS.includes(block) ? JIG_COLOURS.wait : JIG_COLOURS.miss;
}

/**
 * Whose hands the picker is greyed out for. A watcher is shown A's panel, so
 * only A's hands can block the seat on it — `mg` does not carry them, and a
 * watcher's own keg is nothing to do with the seat A is looking at.
 */
export function pickerCarrying(role: JigRole, carrying: string): string {
    return role === 'a' ? carrying : '';
}

/**
 * When the server gives up on a beat: one OK window past it, plus the backdate
 * clamp a late message is allowed to claim (contracts §7).
 */
export function closeAt(mark: number, okMs: number): number {
    return mark + okMs / 1000 + MAX_INPUT_BACKDATE_S;
}

/**
 * What the needle runs across in this phase, or `null` when nothing is moving.
 * A knot and a crimp run to the moment they auto-miss rather than to the beat
 * itself, so the window the server judges with fits on the bar.
 */
export function phaseSpan(mg: JigMg, cfg: AssemblyMinigame): JigSpan | null {
    if (mg.phase === 'seat') {
        return mg.rearmAt > mg.rearmFrom ? { from: mg.rearmFrom, to: mg.rearmAt } : null;
    }

    if (mg.phase === 'pour') {
        if (mg.pour === null) return null;

        return { from: mg.pour.startAt, to: overfillAt(mg.pour) };
    }

    if (mg.phase === 'parts') {
        return mg.cradle === 'surface'
            ? { from: mg.surfaceReadyAt - SURFACE_TAX_SECONDS, to: mg.surfaceReadyAt }
            : null;
    }

    const knots = mg.phase === 'knots';
    const marks = knots ? mg.knotAt : mg.crimpClickAt;
    const last = marks[marks.length - 1];

    if (last === undefined) return null;

    return { from: mg.beatStartAt, to: closeAt(last, (knots ? cfg.knots : cfg.crimp).okMs) };
}

export function fractionIn(from: number, to: number, t: number): number {
    if (to <= from) return 1;

    return Math.max(0, Math.min(1, (t - from) / (to - from)));
}

/** One tick per beat from the first beat of the pour to the mark itself. */
export function beatMarks(pour: NonNullable<JigMg['pour']>, bpm: number): number[] {
    const beat = 60 / bpm;
    const marks: number[] = [];

    for (let i = 0; i <= pour.beats; i++) marks.push(pour.startAt + i * beat);

    return marks;
}

/** A judged moment plus the two windows the server grades it with, in seconds. */
export function bandsAround(mark: number, w: JigWindow): JigBands {
    return {
        mark,
        perfect: { from: mark - w.perfectMs / 1000, to: mark + w.perfectMs / 1000 },
        ok: { from: mark - w.okMs / 1000, to: mark + w.okMs / 1000 },
    };
}

/** `pourWindow` has already applied the prime-keg multiplier; never scale it twice. */
export function pourBands(pour: NonNullable<JigMg['pour']>, cfg: PourConfig): JigBands {
    return bandsAround(pour.targetAt, pourWindow(cfg, pour.primeKeg));
}

/**
 * The swing bar: the release is judged at the top of the arc and the swing
 * closes itself once the OK window plus the backdate clamp has gone by.
 */
export function tossBands(swingStartAt: number, cfg: TossConfig): JigBands & { close: number } {
    const bands = bandsAround(swingStartAt + cfg.arcSeconds, cfg);

    return { ...bands, close: closeAt(bands.mark, cfg.okMs) };
}

/**
 * The phrase as a rhythm (F18). `secondsPerKnot`, the crimp's `leadSeconds` and
 * its `clickSeconds` are all `60 / bpm` in every shipped level, so a long-fuse
 * phrase is six pulses on one unbroken 150 bpm grid — three knots, the lead
 * beat, then clicks two and three — and the tap lands on the sixth. Sounding
 * them turns the crimp from counting three visual events at 2.5 Hz into the
 * thing every rhythm game is: feel five pulses, hit the next one.
 *
 * `tickAccent` is the beat you *act* on and `tick` is everything leading up to
 * it, which is why the knots are all plain: they are judged individually, but
 * what the ratchet needs is a bar the accent can be heard against.
 */
export function jigPulses(mg: JigMg): Pulse[] {
    if (mg.phase === 'pour') {
        return mg.pour === null ? [] : accented(beatMarks(mg.pour, mg.bpm));
    }

    if (mg.phase === 'knots') return mg.knotAt.map((at): Pulse => ({ at, cue: 'tick' }));

    return mg.phase === 'crimp' ? accented(mg.crimpClickAt) : [];
}

/** Every beat plain but the last, which is the one the press is judged against. */
function accented(marks: readonly number[]): Pulse[] {
    return marks.map(
        (at, i): Pulse => ({ at, cue: i === marks.length - 1 ? 'tickAccent' : 'tick' }),
    );
}

/**
 * What makes one phrase a different phrase. The blob changes on every judged
 * press — `knotIndex`, `last` — and re-reading it must not re-book beats the
 * player has already heard, so the beats are rebuilt only when the phase or the
 * bar it started on moves.
 */
export function phraseKey(mg: JigMg): string {
    return `${mg.phase}:${mg.beatStartAt}`;
}

/** One confirmation per grade, so the three are told apart by ear. */
export function gradeCue(grade: JigGrade): CueName {
    return grade;
}

/** Long enough to see, shorter than a beat, so two clicks never light together. */
export const CLICK_FLASH_SECONDS = 0.12;

/** A ratchet click as an event on screen rather than a line that was always there. */
export function clickFlash(clickAt: number, now: number): boolean {
    return now >= clickAt && now - clickAt < CLICK_FLASH_SECONDS;
}

export function knotMarkers(mg: JigMg): { at: number; lane: JigLane; grade: JigGrade | null }[] {
    return mg.knotAt.map((at, i) => ({
        at,
        lane: mg.lanes[i] ?? 'l',
        grade: i < mg.knotIndex ? (mg.knotGrades[i] ?? null) : null,
    }));
}

export function popFor(last: JigMg['last']): JigPop | null {
    if (last === null) return null;

    const note = last.note === '' ? '' : ` — ${NOTE_LABELS[last.note]}`;

    return { text: `${last.grade.toUpperCase()}${note}`, colour: GRADE_COLOURS[last.grade] };
}

export function spaceOp(phase: JigPhase): MgOp | null {
    return SPACE_OPS[phase];
}

export function laneFor(key: OverlayKey): JigLane | null {
    if (key === 'left') return 'l';
    if (key === 'right') return 'r';

    return null;
}

/** B's one key: down fetches, then swings; up releases the set it swung. */
export function bKeyOp(bPhase: JigBPhase, down: boolean): MgOp | null {
    if (down) {
        if (bPhase === 'idle') return 'fetch';
        if (bPhase === 'holding') return 'swing';

        return null;
    }

    return bPhase === 'swinging' ? 'toss' : null;
}

export function primeFlash(primeAt: number, now: number): number {
    if (primeAt <= 0 || now < primeAt || now >= primeAt + PRIME_FLASH_SECONDS) return 0;

    return 1 - (now - primeAt) / PRIME_FLASH_SECONDS;
}

/**
 * A jam or damage stops F05 ticking the module at all: the marks stand still,
 * so the clock has to stand still with them or the needle runs off the end of a
 * bar nobody is playing. An interrupt is the opposite — the paused tick shifts
 * every pending beat by its own `dt` — so there the live clock is what holds the
 * needle where the player left it, and freezing it too would walk it backwards.
 */
export function isFrozen(station: Pick<StationState, 'state'>): boolean {
    return station.state === 'jammed' || station.state === 'damaged';
}

export function fuseLabel(fuse: FuseLength): string {
    return fuse === '' ? '—' : fuse.toUpperCase();
}

function overfillAt(pour: { startAt: number; targetAt: number }): number {
    return pour.startAt + 1.2 * (pour.targetAt - pour.startAt);
}

function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

const PAD = 16;
const TITLE_Y = 10;
const STRIP_Y = 34;
const TRACK_Y = 74;
const TRACK_H = 26;
const CHIP_W = 34;
const CHIP_H = 30;
const CHIP_GAP = 8;
const DING_R = 2.5;
const LANE_H = 20;
const LANE_GAP = 6;
const MARKER_W = 6;
const NEEDLE_W = 2;
const POP_SECONDS = 0.9;
const POP_RISE_PX = 22;
/**
 * The bottom 20 px of the panel belongs to the HUD: `Hud.ts` draws the help
 * hint at `floorHeight - 16` on a higher depth, and the legend used to smear
 * across it at exactly the moment a stuck player needs to find it.
 */
const LEGEND_UP = 34;
/** The keg strip rides just above the legend, clear of the right-hand badges. */
const STRIP_UP = 54;

const OPERATOR_LEGEND = '← → pick / knot · SPACE seat, pour, crimp · ESC bail';

interface LabelStyle {
    size: number;
    colour?: number;
    bold?: boolean;
    originX?: number;
    originY?: number;
}

/**
 * Text objects are expensive to build and cheap to keep, so the panel writes
 * into a pool keyed by slot and hides whatever this frame did not use.
 */
class Labels {
    private readonly pool = new Map<string, Phaser.GameObjects.Text>();
    private readonly used = new Set<string>();

    constructor(
        private readonly scene: Factory,
        private readonly container: Phaser.GameObjects.Container,
    ) {}

    write(key: string, x: number, y: number, value: string, style: LabelStyle): void {
        let label = this.pool.get(key);

        if (!label) {
            label = this.scene.add.text(0, 0, '', { fontFamily: 'monospace' });
            label.setStroke('#000000', 3);
            this.container.add(label);
            this.pool.set(key, label);
        }

        label.setFontSize(style.size);
        label.setFontStyle(style.bold === true ? 'bold' : '');
        label.setColor(hex(style.colour ?? JIG_COLOURS.text));
        label.setOrigin(style.originX ?? 0, style.originY ?? 0);
        label.setPosition(x, y);
        label.setText(value);
        label.setVisible(true);
        this.used.add(key);
    }

    sweep(): void {
        for (const [key, label] of this.pool) {
            if (!this.used.has(key)) label.setVisible(false);
        }

        this.used.clear();
    }

    destroy(): void {
        for (const label of this.pool.values()) label.destroy();

        this.pool.clear();
        this.used.clear();
    }
}

/** One frame's worth of facts, so no draw method has to fetch anything itself. */
interface Frame {
    ctx: OverlayContext;
    g: Phaser.GameObjects.Graphics;
    labels: Labels;
    mg: JigMg;
    cfg: AssemblyMinigame;
    now: number;
    /** A's own panel prints the route inline; everyone else gets it as their legend. */
    operator: boolean;
}

function trackWidth(ctx: OverlayContext): number {
    return ctx.width - PAD * 2;
}

function trackX(ctx: OverlayContext, span: JigSpan, t: number): number {
    return PAD + trackWidth(ctx) * fractionIn(span.from, span.to, t);
}

class JigOverlay implements MinigameOverlay {
    readonly capturesMovement = true;

    private ctx: OverlayContext | null = null;
    private graphics: Phaser.GameObjects.Graphics | null = null;
    private labels: Labels | null = null;

    private mg: JigMg | null = null;
    private lastMg = '';
    private configFrom: LevelConfig | null = null;
    private cfg: AssemblyMinigame | null = null;
    private cursor = 0;
    /** The key B is holding, so the release that follows knows it was a swing. */
    private held: OverlayKey | null = null;
    private swungForHold = false;
    private frozenNow = 0;

    /** The phrase's beats, booked ahead of the needle rather than played at it. */
    private readonly beats = new PulseTrack();
    private phrase = '';
    /** The stamp of the judgement already confirmed, so one press makes one sound. */
    private judgedAt = Number.NEGATIVE_INFINITY;

    mount(ctx: OverlayContext): void {
        this.ctx = ctx;
        this.graphics = ctx.scene.add.graphics();
        ctx.container.add(this.graphics);
        this.labels = new Labels(ctx.scene, ctx.container);
        this.frozenNow = ctx.serverClock();
        this.lastMg = '';
        this.mg = null;
        this.configFrom = null;
        this.cfg = null;
        this.held = null;
        this.swungForHold = false;
        this.beats.clear();
        this.phrase = '';
        this.judgedAt = Number.NEGATIVE_INFINITY;
    }

    update(station: StationState, me: PlayerState, serverNow: number): void {
        const ctx = this.ctx;
        const g = this.graphics;
        const labels = this.labels;

        if (!ctx || !g || !labels) return;

        if (station.mg !== this.lastMg) {
            this.lastMg = station.mg;
            this.mg = parseJigMg(station.mg);
        }

        const mg = this.mg;
        const cfg = this.jigConfig(ctx);

        g.clear();

        if (!mg || !cfg) {
            labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE JIG', { size: 18, bold: true });
            labels.write('idle', PAD, STRIP_Y, 'WAITING FOR THE STATION', {
                size: 12,
                colour: JIG_COLOURS.label,
            });
            labels.sweep();

            return;
        }

        if (!isFrozen(station)) this.frozenNow = serverNow;

        const role = roleOf(mg, ctx.sessionId);
        const frame: Frame = {
            ctx,
            g,
            labels,
            mg,
            cfg,
            now: this.frozenNow,
            operator: role === 'a',
        };

        this.sound(mg, role, isFrozen(station), serverNow);
        this.sendSwingOnHold(mg);

        if (role === 'b') this.drawRack(frame);
        else this.drawJig(frame, me, role);

        this.drawPop(frame);
        this.drawPrimeFlash(frame);
        labels.sweep();
    }

    onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean {
        const ctx = this.ctx;
        const mg = this.mg;

        if (!ctx || !mg) return false;
        if (key === 'esc' || key === 'interact') return false;

        const role = roleOf(mg, ctx.sessionId);

        // A spectator sends nothing, but its `Space` is still eaten: there is
        // nothing in a frozen watcher's hands to throw at the floor.
        if (role === 'spectator') return key === 'space';
        if (role === 'b') return this.rackKey(ctx, mg, key, down, repeat);

        return this.jigKey(ctx, mg, key, down, repeat);
    }

    unmount(): void {
        this.labels?.destroy();
        this.ctx?.container.removeAll(true);
        this.labels = null;
        this.graphics = null;
        this.ctx = null;
        this.mg = null;
    }

    /**
     * The phrase's beats and the judgement that closes each one (F18). Both are
     * booked from the same `mg` the panel draws and against the server clock the
     * marks are written in, because a beat measured on any other clock drifts
     * away from the bar the player is watching inside a single phrase.
     */
    private sound(mg: JigMg, role: JigRole, frozen: boolean, serverNow: number): void {
        const phrase = `${role}|${phraseKey(mg)}`;
        const mounting = this.phrase === '';

        if (phrase !== this.phrase) {
            this.phrase = phrase;
            // B is at the rack, whose panel draws none of these marks.
            this.beats.aim(role === 'b' ? [] : jigPulses(mg));
        }

        // A jammed or damaged jig stops its own marks (`isFrozen`), so the beats
        // have to stop with them rather than run on under a still needle.
        if (!frozen) this.beats.book(serverNow, gameAudio);

        const last = mg.last;

        if (last === null || last.at <= this.judgedAt) return;

        this.judgedAt = last.at;

        // Arriving mid-phrase, the judgement already in `mg` belongs to a press
        // that was made before this panel existed.
        if (!mounting) gameAudio.play(gradeCue(last.grade));
    }

    private jigKey(
        ctx: OverlayContext,
        mg: JigMg,
        key: OverlayKey,
        down: boolean,
        repeat: boolean,
    ): boolean {
        const lane = laneFor(key);

        if (lane !== null) {
            if (!down || repeat) return true;

            if (mg.phase === 'knots') ctx.send('knot', lane);
            else this.moveTo(ctx, lane === 'l' ? -1 : 1);

            return true;
        }

        if (key !== 'space') return false;
        if (!down || repeat) return true;

        const op = spaceOp(mg.phase);

        if (op === 'seat') {
            const casings = this.shelfOf(ctx).casings;
            const chip = casings[moveCursor(this.cursor, 0, casings.length)];

            if (chip) ctx.send('seat', chip.shelfIndex);
        } else if (op !== null) {
            ctx.send(op);
        }

        return true;
    }

    private rackKey(
        ctx: OverlayContext,
        mg: JigMg,
        key: OverlayKey,
        down: boolean,
        repeat: boolean,
    ): boolean {
        if (key === 'left' || key === 'right') {
            if (down && !repeat) ctx.send('pick', key === 'left' ? 'short' : 'long');

            return true;
        }

        if (key !== 'space' && key !== 'up') return false;
        if (repeat) return true;

        if (down) {
            this.held = key;

            const op = bKeyOp(mg.bPhase, true);

            this.swungForHold = op === 'swing';

            if (op !== null) ctx.send(op);

            return true;
        }

        if (this.held === key) {
            const op = bKeyOp(mg.bPhase, false);

            if (op !== null) ctx.send(op);

            this.held = null;
            this.swungForHold = false;
        }

        return true;
    }

    /** Holding the key through the fetch swings the moment the set lands in B's hands. */
    private sendSwingOnHold(mg: JigMg): void {
        if (!this.ctx || this.held === null || this.swungForHold) return;
        if (roleOf(mg, this.ctx.sessionId) !== 'b' || mg.bPhase !== 'holding') return;

        this.swungForHold = true;
        this.ctx.send('swing');
    }

    private moveTo(ctx: OverlayContext, delta: number): void {
        this.cursor = moveCursor(this.cursor, delta, this.shelfOf(ctx).casings.length);
    }

    /**
     * The picker draws casings, the pour needs kegs and the restock needs a
     * free slot to land in; one read answers all three.
     */
    private shelfOf(ctx: OverlayContext): { casings: JigChip[]; kegs: number; room: number } {
        const station = ctx.state.stations.get(ctx.stationId);

        if (!station) return { casings: [], kegs: 0, room: 0 };

        const ids: string[] = [];

        station.inputShelf.forEach((id) => ids.push(id));

        return {
            ...readShelf(ids, (id) => ctx.state.items.get(id)),
            room: Math.max(0, station.inputCap - ids.length),
        };
    }

    /** The keg question, asked the same way for every role at the station. */
    private kegShort(ctx: OverlayContext, mg: JigMg): boolean {
        return kegShortage(this.shelfOf(ctx).kegs, mg.keg);
    }

    /** The machine the errand ends at, from the level this round is running. */
    private kegSourceOf(ctx: OverlayContext): string {
        return kegSource(ctx.scene.conn.config.level);
    }

    /**
     * The errand in the words painted at both ends of it. The IN sign comes off
     * this station's own shelf through `shelfLabel`, the same call that paints
     * it on the floor, so the sentence cannot name a sign that is not there.
     */
    private routeOf(ctx: OverlayContext): string {
        const station = ctx.scene.conn.config.level.stations.find((s) => s.id === ctx.stationId);
        const accepts = station?.inputShelf?.accepts as ItemType[] | undefined;

        return kegRoute(this.kegSourceOf(ctx), shelfLabel('in', accepts, null));
    }

    /**
     * The windows the server judges with come from the level itself — the
     * client invents no numbers. The whistle replaces `conn.config.level` with
     * the scaled one (contracts §8), so the lookup is cached against it.
     */
    private jigConfig(ctx: OverlayContext): AssemblyMinigame | null {
        const level = ctx.scene.conn.config.level;

        if (level !== this.configFrom) {
            this.configFrom = level;

            const station = level.stations.find((s) => s.id === ctx.stationId);

            this.cfg = station ? (station.minigame as AssemblyMinigame) : null;
        }

        return this.cfg;
    }

    private drawJig(f: Frame, me: PlayerState, role: JigRole): void {
        const { ctx, labels, mg } = f;
        const operator = role === 'a';

        labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE JIG', { size: 18, bold: true });
        labels.write(
            'tag',
            ctx.width - PAD,
            TITLE_Y + 2,
            operator ? 'A · THE JIG' : 'WATCHING · NO INPUTS',
            {
                size: 12,
                colour: operator ? JIG_COLOURS.text : JIG_COLOURS.label,
                originX: 1,
            },
        );
        this.drawPhaseStrip(f);

        if (mg.phase === 'seat') this.drawPicker(f, pickerCarrying(role, me.carrying));
        else if (mg.phase === 'pour') this.drawPour(f);
        else if (mg.phase === 'parts') this.drawParts(f);
        else if (mg.phase === 'knots') this.drawKnots(f);
        else this.drawCrimp(f);

        // The watcher is by definition the most lost person at the station, and
        // A's panel answers none of their questions. The keg block is the one
        // fact that is theirs to act on, so it is repeated where they will see
        // it even when the phrase A is playing has moved past the seat.
        if (!operator && this.kegShort(ctx, mg)) this.drawKegStrip(f);

        labels.write(
            'legend',
            PAD,
            ctx.height - LEGEND_UP,
            operator ? OPERATOR_LEGEND : this.watcherLegend(ctx, mg),
            { size: 11, colour: JIG_COLOURS.label },
        );
    }

    /** The one line a player who is not driving the jig can do something about. */
    private drawKegStrip(f: Frame): void {
        f.labels.write('keg-strip', PAD, f.ctx.height - STRIP_UP, KEG_STRIP, {
            size: 13,
            bold: true,
            colour: JIG_COLOURS.miss,
        });
    }

    /**
     * A watcher is by definition the most lost person at the station, so when
     * the errand is on they get the whole walk rather than a hint at it. It sits
     * in the legend slot, directly under the strip that named the shortage.
     */
    private watcherLegend(ctx: OverlayContext, mg: JigMg): string {
        return this.kegShort(ctx, mg)
            ? this.routeOf(ctx)
            : 'Watching. An extra pair of hands still speeds this station up · ESC bail';
    }

    private drawPhaseStrip(f: Frame): void {
        PHASES.forEach((phase, i) => {
            const current = phase === f.mg.phase;

            f.labels.write(`phase-${phase}`, PAD + i * 74, STRIP_Y, PHASE_LABEL[phase], {
                size: 12,
                bold: current,
                colour: current ? JIG_COLOURS.perfect : JIG_COLOURS.dim,
            });
        });
    }

    private drawPicker(f: Frame, carrying: string): void {
        const { ctx, g, labels, mg, now } = f;
        const { casings, kegs, room } = this.shelfOf(ctx);

        this.cursor = moveCursor(this.cursor, 0, casings.length);

        const block = pickerBlock({
            now,
            rearmAt: mg.rearmAt,
            casings: casings.length,
            kegs,
            room,
            keg: mg.keg,
            carrying,
        });
        const dim = block !== '';

        casings.forEach((chip, i) => {
            const x = PAD + i * (CHIP_W + CHIP_GAP);
            const selected = i === this.cursor && !dim;

            g.fillStyle(JIG_COLOURS.casing, dim ? 0.35 : 1);
            g.fillRoundedRect(x, TRACK_Y, CHIP_W, CHIP_H, 4);
            g.lineStyle(selected ? 2 : 1, selected ? JIG_COLOURS.text : JIG_COLOURS.trackEdge, 1);
            g.strokeRoundedRect(x, TRACK_Y, CHIP_W, CHIP_H, 4);
            g.fillStyle(JIG_COLOURS.dent, dim ? 0.35 : 1);

            for (let d = 0; d < casingDings(chip.dents); d++) {
                g.fillCircle(x + 9 + d * 8, TRACK_Y + CHIP_H - 9, DING_R);
            }
        });

        // An empty rail and the block below it are the same fact, so the rail
        // speaks only when the block is busy naming something else — a machine
        // timer or a full pair of hands the casings are waiting behind.
        const rail = room > 0 ? CASINGS_COMING : SHELF_FULL;

        if (casings.length === 0 && block !== rail) {
            labels.write('picker-empty', PAD, TRACK_Y + 8, rail, {
                size: 12,
                colour: JIG_COLOURS.dim,
            });
        }

        this.drawKegGauge(f);

        if (block === '') return;

        labels.write('block', PAD, TRACK_Y + CHIP_H + 10, block, {
            size: 14,
            bold: true,
            colour: blockColour(block),
        });

        // A station name is not an instruction. Three of the four presses this
        // errand takes appear nowhere else on the panel, so the seat spells the
        // whole walk out — and quotes the paint at both ends of it.
        if (block === NEED_KEG) {
            if (f.operator) {
                labels.write('block-route', PAD, TRACK_Y + CHIP_H + 30, this.routeOf(ctx), {
                    size: 11,
                    colour: JIG_COLOURS.dim,
                });
            }

            return;
        }

        if (block !== RE_ARMING) return;

        const bar = TRACK_Y + CHIP_H + 30;

        g.fillStyle(JIG_COLOURS.track, 1);
        g.fillRect(PAD, bar, trackWidth(ctx), 8);
        g.fillStyle(JIG_COLOURS.ok, 1);
        g.fillRect(PAD, bar, trackWidth(ctx) * fractionIn(mg.rearmFrom, mg.rearmAt, now), 8);
    }

    private drawKegGauge(f: Frame): void {
        const { ctx, g, labels, mg } = f;
        const x = ctx.width - PAD - 90;

        labels.write('keg-label', x, TRACK_Y - 16, 'KEG', { size: 11, colour: JIG_COLOURS.label });

        if (mg.keg === null) {
            labels.write('keg-value', x, TRACK_Y, 'NONE', { size: 14, colour: JIG_COLOURS.dim });

            return;
        }

        g.fillStyle(mg.keg.prime ? JIG_COLOURS.prime : JIG_COLOURS.keg, mg.keg.quality);
        g.fillRoundedRect(x, TRACK_Y, 28, CHIP_H, 4);
        g.lineStyle(1, JIG_COLOURS.trackEdge, 1);
        g.strokeRoundedRect(x, TRACK_Y, 28, CHIP_H, 4);
        g.fillStyle(JIG_COLOURS.text, 1);

        for (let p = 0; p < mg.keg.poursLeft; p++) g.fillCircle(x + 40 + p * 10, TRACK_Y + 8, 3);

        // Was `quality.toFixed(1)`: 'KEG / 0.7' is a schema float, and the same
        // field already has words on the floor — `kegLook` is what tints the glyph.
        const word = KEG_WORD[kegLook(mg.keg.quality, mg.keg.prime)];

        labels.write('keg-value', x + 36, TRACK_Y + 16, word, {
            size: 12,
            colour: JIG_COLOURS.label,
        });
    }

    private drawPour(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;
        const pour = mg.pour;
        const span = phaseSpan(mg, cfg);

        if (pour === null || span === null) {
            // `seat()` sets `phase = 'pour'` and `pour = null` a tick before
            // `startPour` builds the pour, with the keg already in hand. Reading
            // that gap as a shortage walks the operator away from a machine that
            // has everything it needs.
            const ready = !kegShortage(this.shelfOf(ctx).kegs, mg.keg);

            labels.write('pour-wait', PAD, TRACK_Y, ready ? 'STARTING THE POUR' : NEED_KEG, {
                size: 14,
                colour: ready ? JIG_COLOURS.label : JIG_COLOURS.miss,
            });

            // The shortage and the way out of it are one sentence. Printed apart,
            // an operator who joined mid-phrase read NEED A KEG with no route at
            // all — the same player and the same problem as the seat, half answered.
            if (!ready && f.operator) {
                labels.write('pour-route', PAD, TRACK_Y + 22, this.routeOf(ctx), {
                    size: 11,
                    colour: JIG_COLOURS.dim,
                });
            }

            return;
        }

        this.drawTrack(f, TRACK_Y, TRACK_H);
        this.drawBands(f, span, pourBands(pour, cfg.pour), TRACK_Y, TRACK_H);

        const fill = Math.max(0, Math.min(1.2, pourFillAt(pour, now)));
        const head = trackX(ctx, span, now);

        g.fillStyle(fill > 1 ? JIG_COLOURS.overfill : JIG_COLOURS.fill, 0.85);
        g.fillRect(PAD, TRACK_Y, head - PAD, TRACK_H);
        g.lineStyle(1, JIG_COLOURS.trackEdge, 1);

        for (const mark of beatMarks(pour, mg.bpm)) {
            const x = trackX(ctx, span, mark);

            g.lineBetween(x, TRACK_Y + TRACK_H - 8, x, TRACK_Y + TRACK_H);
        }

        this.drawNeedle(f, head, TRACK_Y, TRACK_H);

        labels.write('pour-fill', PAD, TRACK_Y + TRACK_H + 8, `FILL ${Math.round(fill * 100)}%`, {
            size: 12,
            colour: fill > 1 ? JIG_COLOURS.overfill : JIG_COLOURS.label,
        });
        labels.write(
            'pour-beats',
            ctx.width - PAD,
            TRACK_Y + TRACK_H + 8,
            `${pour.beats} BEATS${pour.primeKeg ? ` · ${PRIME_KEG}` : ''}`,
            { size: 12, colour: JIG_COLOURS.label, originX: 1 },
        );
    }

    private drawParts(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;

        labels.write('parts-wait', PAD, TRACK_Y, `WAITING FOR A ${FUSE_SET}`, {
            size: 16,
            bold: true,
            colour: mg.cradle === 'empty' ? JIG_COLOURS.miss : JIG_COLOURS.ok,
        });
        labels.write('parts-cradle', PAD, TRACK_Y + 24, CRADLE_LABEL[mg.cradle], {
            size: 12,
            colour: JIG_COLOURS.label,
        });

        if (mg.cradle !== 'empty') {
            g.fillStyle(JIG_COLOURS.parts, 1);
            g.fillRoundedRect(ctx.width - PAD - 40, TRACK_Y, 40, 22, 4);
            labels.write('parts-fuse', ctx.width - PAD, TRACK_Y + 26, fuseLabel(mg.cradleFuse), {
                size: 12,
                colour: JIG_COLOURS.label,
                originX: 1,
            });
        }

        const span = phaseSpan(mg, cfg);

        if (span === null) return;

        const bar = TRACK_Y + 48;

        g.fillStyle(JIG_COLOURS.track, 1);
        g.fillRect(PAD, bar, trackWidth(ctx), 8);
        g.fillStyle(JIG_COLOURS.ok, 1);
        g.fillRect(PAD, bar, trackWidth(ctx) * fractionIn(span.from, span.to, now), 8);
    }

    private drawKnots(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;
        const span = phaseSpan(mg, cfg);

        if (span === null) return;

        const lanes: JigLane[] = ['l', 'r'];
        const laneY = (lane: JigLane): number => TRACK_Y + (lane === 'l' ? 0 : LANE_H + LANE_GAP);

        lanes.forEach((lane) => {
            g.fillStyle(JIG_COLOURS.track, 1);
            g.fillRect(PAD, laneY(lane), trackWidth(ctx), LANE_H);
            labels.write(
                `lane-${lane}`,
                PAD - 4,
                laneY(lane) + LANE_H / 2,
                lane === 'l' ? '←' : '→',
                { size: 14, colour: JIG_COLOURS.lane, originX: 1, originY: 0.5 },
            );
        });

        for (const knot of knotMarkers(mg)) {
            const bands = bandsAround(knot.at, cfg.knots);
            const y = laneY(knot.lane);

            if (knot.grade === null) this.drawBands(f, span, bands, y, LANE_H);

            g.fillStyle(knot.grade === null ? JIG_COLOURS.lane : GRADE_COLOURS[knot.grade], 1);
            g.fillRect(trackX(ctx, span, knot.at) - MARKER_W / 2, y, MARKER_W, LANE_H);
        }

        const height = LANE_H * 2 + LANE_GAP;

        this.drawNeedle(f, trackX(ctx, span, now), TRACK_Y - 6, height + 12);
        labels.write(
            'knot-count',
            ctx.width - PAD,
            TRACK_Y + height + 10,
            `KNOT ${Math.min(mg.knotIndex + 1, mg.knotAt.length)}/${mg.knotAt.length} · ${fuseLabel(mg.cradleFuse)}`,
            { size: 12, colour: JIG_COLOURS.label, originX: 1 },
        );
    }

    private drawCrimp(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;
        const span = phaseSpan(mg, cfg);
        const judged = mg.crimpClickAt[mg.crimpClickAt.length - 1];

        if (span === null || judged === undefined) return;

        this.drawTrack(f, TRACK_Y, TRACK_H);
        this.drawBands(f, span, bandsAround(judged, cfg.crimp), TRACK_Y, TRACK_H);

        // Three identical lines standing still is a count nobody can keep with
        // their eyes, so each click is numbered and lights as the needle
        // reaches it: the muted player sees the same three events the tick,
        // tick, TOCK gives everybody else.
        mg.crimpClickAt.forEach((click, i) => {
            const last = i === mg.crimpClickAt.length - 1;
            const lit = clickFlash(click, now);
            const x = trackX(ctx, span, click);
            const colour = lit
                ? JIG_COLOURS.perfect
                : last
                  ? JIG_COLOURS.text
                  : JIG_COLOURS.trackEdge;

            g.lineStyle(lit || last ? 3 : 1, colour, 1);
            g.lineBetween(x, TRACK_Y - 4, x, TRACK_Y + TRACK_H + 4);
            // Above the lines and below the phase strip: the pop rises through
            // this band, and it is the only thing here that is ever transient.
            labels.write(`crimp-count-${i}`, x, TRACK_Y - 8, `${i + 1}`, {
                size: last ? 14 : 11,
                bold: last || lit,
                colour,
                originX: 0.5,
                originY: 1,
            });
        });

        this.drawNeedle(f, trackX(ctx, span, now), TRACK_Y, TRACK_H);
        labels.write('crimp-label', PAD, TRACK_Y + TRACK_H + 8, 'CRIMP ON THE THIRD CLICK', {
            size: 12,
            colour: JIG_COLOURS.label,
        });
    }

    private drawRack(f: Frame): void {
        const { ctx, g, labels, mg } = f;

        labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE FUSE RACK', { size: 18, bold: true });
        labels.write('tag', ctx.width - PAD, TITLE_Y + 2, 'B · THE RACK', { size: 12, originX: 1 });

        labels.write('order-label', ctx.width - PAD, STRIP_Y - 6, ORDER_STRIP_LABEL, {
            size: 10,
            colour: JIG_COLOURS.dim,
            originX: 1,
        });

        mg.orderChip.forEach((chip, i) => {
            labels.write(
                `order-${i}`,
                ctx.width - PAD,
                STRIP_Y + 8 + i * 15,
                `${orderPlace(i)}  ${fuseLabel(chip.fuseLength)}`,
                {
                    size: 12,
                    colour: i === 0 ? JIG_COLOURS.text : JIG_COLOURS.label,
                    originX: 1,
                },
            );
        });

        if (mg.orderChip.length === 0) {
            labels.write('order-none', ctx.width - PAD, STRIP_Y + 8, NOTHING_ON_THE_BOARD, {
                size: 12,
                colour: JIG_COLOURS.dim,
                originX: 1,
            });
        }

        // The bins, and the reason the lit one is lit. `reconcileRoles` derives
        // `bPick` from the active order the moment a body takes the rack tile
        // (`shared/src/sim/jig.ts:575`), so the pick is already right — and drawn
        // as a lone highlight it read as a default the player was being tested
        // on. The bin the *order* wants is marked separately, and the caption
        // beside them says the game has already reached in and chosen.
        const wanted = mg.orderChip[0]?.fuseLength ?? '';
        const bins = rackBins(
            { x0: ctx.width / 2 - 60, y0: STRIP_Y - 4, x1: ctx.width / 2 + 72, y1: STRIP_Y + 20 },
            mg.bPick,
            wanted,
        );

        for (const bin of bins) {
            const { x0, y0, x1, y1 } = bin.box;

            g.fillStyle(bin.picked ? JIG_COLOURS.parts : JIG_COLOURS.track, 1);
            g.fillRoundedRect(x0, y0, x1 - x0, y1 - y0, 4);

            if (bin.wanted) {
                g.lineStyle(2, RACK_COLOURS[bin.warn ? 'warn' : 'set'], 1);
                g.strokeRoundedRect(x0, y0, x1 - x0, y1 - y0, 4);
            }

            labels.write(`pick-${bin.fuse}`, (x0 + x1) / 2, (y0 + y1) / 2, bin.label, {
                size: 12,
                bold: bin.picked,
                colour: bin.picked ? JIG_COLOURS.dent : JIG_COLOURS.label,
                originX: 0.5,
                originY: 0.5,
            });
        }

        // Left of the bins, on their own row: the caption is the thing the bins
        // are an answer to, so it is read first, going right. With nothing on the
        // board the order strip already says so and a second copy is noise.
        if (wanted !== '') {
            const caption = rackCaption(mg.bPick, wanted, mg.bPickFromOrder);

            labels.write('pick-why', PAD, STRIP_Y + 8, caption.text, {
                size: 12,
                bold: true,
                colour: RACK_COLOURS[caption.tone],
                originY: 0.5,
            });
        }

        // What the keys are for, under the choice they explain. Without it the
        // panel is a key list beside two loose chips, and B cannot learn from the
        // screen that A is stopped until the toss lands.
        labels.write('stake', PAD, STRIP_Y + 24, RACK_STAKE, {
            size: 11,
            colour: JIG_COLOURS.label,
        });

        this.drawRackTrack(f);

        if (mg.cradle !== 'empty') {
            labels.write('badge-full', ctx.width - PAD, TRACK_Y + TRACK_H + 26, CRADLE_FULL, {
                size: 12,
                bold: true,
                colour: JIG_COLOURS.miss,
                originX: 1,
            });
        }

        if (mg.aisleBlocked) {
            labels.write('badge-aisle', ctx.width - PAD, TRACK_Y + TRACK_H + 44, AISLE_ITEM, {
                size: 12,
                bold: true,
                colour: JIG_COLOURS.miss,
                originX: 1,
            });
        }

        // B has the same view of the shelf A does and, until now, was told
        // nothing about it: in a three-player session that left two of the
        // three people at Assembly waiting on a keg nobody had gone for.
        if (this.kegShort(ctx, mg)) this.drawKegStrip(f);

        labels.write(
            'legend',
            PAD,
            ctx.height - LEGEND_UP,
            '← short · → long · hold SPACE fetch, swing · release to toss · ESC bail',
            { size: 11, colour: JIG_COLOURS.label },
        );
    }

    private drawRackTrack(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;

        this.drawTrack(f, TRACK_Y, TRACK_H);

        if (mg.bPhase === 'fetching') {
            const span = { from: mg.bFetchDoneAt - FETCH_SECONDS, to: mg.bFetchDoneAt };

            g.fillStyle(JIG_COLOURS.parts, 0.85);
            g.fillRect(PAD, TRACK_Y, trackX(ctx, span, now) - PAD, TRACK_H);
            labels.write('b-state', PAD, TRACK_Y + TRACK_H + 8, `FETCHING A ${FUSE_SET}`, {
                size: 12,
                colour: JIG_COLOURS.label,
            });

            return;
        }

        if (mg.bPhase === 'swinging') {
            const bands = tossBands(mg.swingStartAt, cfg.toss);
            const span = { from: mg.swingStartAt, to: bands.close };

            this.drawBands(f, span, bands, TRACK_Y, TRACK_H);
            this.drawNeedle(f, trackX(ctx, span, now), TRACK_Y, TRACK_H);
            labels.write('b-state', PAD, TRACK_Y + TRACK_H + 8, 'RELEASE ON THE MARK', {
                size: 12,
                colour: JIG_COLOURS.text,
            });

            return;
        }

        labels.write(
            'b-state',
            PAD,
            TRACK_Y + TRACK_H + 8,
            mg.bPhase === 'holding' ? 'HOLD SPACE TO SWING' : `SPACE TO FETCH A ${FUSE_SET}`,
            { size: 12, colour: JIG_COLOURS.label },
        );

        if (mg.bPhase !== 'holding') return;

        g.fillStyle(JIG_COLOURS.parts, 0.85);
        g.fillRoundedRect(PAD + 4, TRACK_Y + 4, 40, TRACK_H - 8, 4);
        labels.write('b-fuse', PAD + 52, TRACK_Y + 6, fuseLabel(mg.bPick), {
            size: 12,
            colour: JIG_COLOURS.label,
        });
    }

    /** The last judgement, rising and fading from the moment the server made it. */
    private drawPop(f: Frame): void {
        const last = f.mg.last;
        const pop = popFor(last);

        if (pop === null || last === null) return;

        const age = f.now - last.at;

        if (age < 0 || age > POP_SECONDS) return;

        f.labels.write('pop', f.ctx.width / 2, TRACK_Y - 34 - age * POP_RISE_PX, pop.text, {
            size: 20,
            bold: true,
            colour: pop.colour,
            originX: 0.5,
        });
    }

    /** Everyone at the station sees the flash, whichever role they are playing. */
    private drawPrimeFlash(f: Frame): void {
        const alpha = primeFlash(f.mg.primeAt, f.now);

        if (alpha <= 0) return;

        f.g.fillStyle(JIG_COLOURS.brass, alpha * 0.5);
        f.g.fillRect(0, 0, f.ctx.width, f.ctx.height);
    }

    private drawTrack(f: Frame, y: number, height: number): void {
        f.g.fillStyle(JIG_COLOURS.track, 1);
        f.g.fillRect(PAD, y, trackWidth(f.ctx), height);
        f.g.lineStyle(1, JIG_COLOURS.trackEdge, 1);
        f.g.strokeRect(PAD, y, trackWidth(f.ctx), height);
    }

    /** The two windows the server grades with, drawn where it will grade them. */
    private drawBands(
        f: Frame,
        span: JigSpan,
        bands: JigBands,
        y: number,
        height: number,
    ): void {
        const { ctx, g } = f;
        const at = (t: number): number => trackX(ctx, span, t);

        g.fillStyle(JIG_COLOURS.ok, 0.3);
        g.fillRect(at(bands.ok.from), y, at(bands.ok.to) - at(bands.ok.from), height);
        g.fillStyle(JIG_COLOURS.perfect, 0.4);
        g.fillRect(
            at(bands.perfect.from),
            y,
            at(bands.perfect.to) - at(bands.perfect.from),
            height,
        );
        g.lineStyle(2, JIG_COLOURS.text, 1);
        g.lineBetween(at(bands.mark), y - 6, at(bands.mark), y + height + 6);
    }

    private drawNeedle(f: Frame, x: number, y: number, height: number): void {
        f.g.fillStyle(JIG_COLOURS.needle, 1);
        f.g.fillRect(x - NEEDLE_W / 2, y, NEEDLE_W, height);
    }
}

export const jigOverlay: OverlayFactory = () => new JigOverlay();
