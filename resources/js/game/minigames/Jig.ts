import {
    type AssemblyMinigame,
    type FuseLength,
    type JigBPhase,
    type JigGrade,
    type JigLane,
    type JigMg,
    type JigNote,
    type JigPhase,
    type JigWindow,
    type LevelConfig,
    MAX_INPUT_BACKDATE_S,
    type MgOp,
    type PlayerState,
    type PourConfig,
    type StationState,
    type TossConfig,
    pourFillAt,
    pourWindow,
} from '@shared';
import type Phaser from 'phaser';

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
    needle: 0xffffff,
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

const NOTE_LABELS: Record<Exclude<JigNote, ''>, string> = {
    early: 'EARLY',
    late: 'LATE',
    lane: 'WRONG LANE',
    full: 'FULL',
    body: 'BODY IN THE AISLE',
};

const SPACE_OPS: Record<JigPhase, MgOp | null> = {
    seat: 'seat',
    pour: 'pour',
    parts: null,
    knots: null,
    crimp: 'crimp',
};

const PHASES: JigPhase[] = ['seat', 'pour', 'parts', 'knots', 'crimp'];

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
 * Why the picker is greyed out. The reasons come from state rather than a flag,
 * and they are ordered by what the player can do about them: the machine timer
 * clears itself, their own hands do not.
 */
export function pickerBlock(input: {
    now: number;
    rearmAt: number;
    casings: number;
    kegs: number;
    keg: { poursLeft: number } | null;
    carrying: string;
}): string {
    if (input.now < input.rearmAt) return 'RE-ARMING';
    if (input.carrying !== '') return 'HANDS FULL';
    if (input.casings === 0) return 'NO CASINGS';
    if (input.kegs === 0 && (input.keg === null || input.keg.poursLeft <= 0)) return 'NO POWDER';

    return '';
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

        const frame: Frame = { ctx, g, labels, mg, cfg, now: this.frozenNow };
        const role = roleOf(mg, ctx.sessionId);

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

    /** The picker draws casings and the pour needs kegs; one read answers both. */
    private shelfOf(ctx: OverlayContext): { casings: JigChip[]; kegs: number } {
        const station = ctx.state.stations.get(ctx.stationId);

        if (!station) return { casings: [], kegs: 0 };

        const ids: string[] = [];

        station.inputShelf.forEach((id) => ids.push(id));

        return readShelf(ids, (id) => ctx.state.items.get(id));
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

        labels.write(
            'legend',
            PAD,
            ctx.height - 20,
            operator
                ? '← → pick / knot · SPACE seat, pour, crimp · ESC bail'
                : 'A helper counts for the staffing curve; the phrase is A’s',
            { size: 11, colour: JIG_COLOURS.label },
        );
    }

    private drawPhaseStrip(f: Frame): void {
        PHASES.forEach((phase, i) => {
            const current = phase === f.mg.phase;

            f.labels.write(`phase-${phase}`, PAD + i * 74, STRIP_Y, phase.toUpperCase(), {
                size: 12,
                bold: current,
                colour: current ? JIG_COLOURS.perfect : JIG_COLOURS.dim,
            });
        });
    }

    private drawPicker(f: Frame, carrying: string): void {
        const { ctx, g, labels, mg, now } = f;
        const { casings, kegs } = this.shelfOf(ctx);

        this.cursor = moveCursor(this.cursor, 0, casings.length);

        const block = pickerBlock({
            now,
            rearmAt: mg.rearmAt,
            casings: casings.length,
            kegs,
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

        if (casings.length === 0) {
            labels.write('picker-empty', PAD, TRACK_Y + 8, 'SHELF EMPTY', {
                size: 12,
                colour: JIG_COLOURS.dim,
            });
        }

        this.drawKegGauge(f);

        if (block === '') return;

        labels.write('block', PAD, TRACK_Y + CHIP_H + 10, block, {
            size: 14,
            bold: true,
            colour: JIG_COLOURS.miss,
        });

        if (block !== 'RE-ARMING') return;

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

        labels.write('keg-value', x + 36, TRACK_Y + 16, mg.keg.quality.toFixed(1), {
            size: 12,
            colour: JIG_COLOURS.label,
        });
    }

    private drawPour(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;
        const pour = mg.pour;
        const span = phaseSpan(mg, cfg);

        if (pour === null || span === null) {
            labels.write('pour-wait', PAD, TRACK_Y, 'NO POWDER — WAITING FOR A KEG', {
                size: 14,
                colour: JIG_COLOURS.miss,
            });

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

        labels.write('pour-fill', PAD, TRACK_Y + TRACK_H + 8, `FILL ${fill.toFixed(2)}`, {
            size: 12,
            colour: fill > 1 ? JIG_COLOURS.overfill : JIG_COLOURS.label,
        });
        labels.write(
            'pour-beats',
            ctx.width - PAD,
            TRACK_Y + TRACK_H + 8,
            `${pour.beats} BEATS${pour.primeKeg ? ' · PRIME KEG' : ''}`,
            { size: 12, colour: JIG_COLOURS.label, originX: 1 },
        );
    }

    private drawParts(f: Frame): void {
        const { ctx, g, labels, mg, cfg, now } = f;

        labels.write('parts-wait', PAD, TRACK_Y, 'WAITING FOR PARTS', {
            size: 16,
            bold: true,
            colour: mg.cradle === 'empty' ? JIG_COLOURS.miss : JIG_COLOURS.ok,
        });
        labels.write('parts-cradle', PAD, TRACK_Y + 24, `CRADLE ${mg.cradle.toUpperCase()}`, {
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

        mg.crimpClickAt.forEach((click, i) => {
            const last = i === mg.crimpClickAt.length - 1;
            const x = trackX(ctx, span, click);

            g.lineStyle(last ? 3 : 1, last ? JIG_COLOURS.text : JIG_COLOURS.trackEdge, 1);
            g.lineBetween(x, TRACK_Y - 4, x, TRACK_Y + TRACK_H + 4);
        });

        this.drawNeedle(f, trackX(ctx, span, now), TRACK_Y, TRACK_H);
        labels.write('crimp-label', PAD, TRACK_Y + TRACK_H + 8, 'CRIMP ON THE THIRD CLICK', {
            size: 12,
            colour: JIG_COLOURS.label,
        });
    }

    private drawRack(f: Frame): void {
        const { ctx, g, labels, mg } = f;

        labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE PARTS RACK', { size: 18, bold: true });
        labels.write('tag', ctx.width - PAD, TITLE_Y + 2, 'B · THE RACK', { size: 12, originX: 1 });

        mg.orderChip.forEach((chip, i) => {
            labels.write(
                `order-${i}`,
                PAD,
                STRIP_Y + i * 16,
                `${chip.orderId}  ${fuseLabel(chip.fuseLength)}`,
                { size: 12, colour: i === 0 ? JIG_COLOURS.text : JIG_COLOURS.label },
            );
        });

        if (mg.orderChip.length === 0) {
            labels.write('order-none', PAD, STRIP_Y, 'NO ORDERS ON THE BOARD', {
                size: 12,
                colour: JIG_COLOURS.dim,
            });
        }

        const picks: FuseLength[] = ['short', 'long'];

        picks.forEach((fuse, i) => {
            const chosen = mg.bPick === fuse;
            const x = ctx.width / 2 - 60 + i * 70;

            g.fillStyle(chosen ? JIG_COLOURS.parts : JIG_COLOURS.track, 1);
            g.fillRoundedRect(x, STRIP_Y - 4, 62, 24, 4);
            labels.write(`pick-${fuse}`, x + 31, STRIP_Y + 8, fuseLabel(fuse), {
                size: 12,
                bold: chosen,
                colour: chosen ? JIG_COLOURS.dent : JIG_COLOURS.label,
                originX: 0.5,
                originY: 0.5,
            });
        });

        this.drawRackTrack(f);

        if (mg.cradle !== 'empty') {
            labels.write('badge-full', ctx.width - PAD, TRACK_Y + TRACK_H + 26, 'CRADLE FULL', {
                size: 12,
                bold: true,
                colour: JIG_COLOURS.miss,
                originX: 1,
            });
        }

        if (mg.aisleBlocked) {
            labels.write('badge-aisle', ctx.width - PAD, TRACK_Y + TRACK_H + 44, 'AISLE BLOCKED', {
                size: 12,
                bold: true,
                colour: JIG_COLOURS.miss,
                originX: 1,
            });
        }

        labels.write(
            'legend',
            PAD,
            ctx.height - 20,
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
            labels.write('b-state', PAD, TRACK_Y + TRACK_H + 8, 'FETCHING SPOOL AND CAP', {
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
            mg.bPhase === 'holding' ? 'HOLD SPACE TO SWING' : 'SPACE TO FETCH A SET',
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
