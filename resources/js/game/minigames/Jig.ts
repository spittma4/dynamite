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

/** What the needle runs across in this phase, or `null` when nothing is moving. */
export function phaseSpan(mg: JigMg): JigSpan | null {
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

    const marks = mg.phase === 'knots' ? mg.knotAt : mg.crimpClickAt;
    const last = marks[marks.length - 1];

    return last === undefined ? null : { from: mg.beatStartAt, to: last };
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

    return { ...bands, close: bands.ok.to + MAX_INPUT_BACKDATE_S };
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
    if (primeAt <= 0 || now < primeAt) return 0;

    const left = primeAt + PRIME_FLASH_SECONDS - now;

    return Math.max(0, Math.min(1, left / PRIME_FLASH_SECONDS));
}

/**
 * The server shifts every pending beat through an interrupt and shifts the
 * whole gap when a jam clears, so the needle waits where it stands rather than
 * running off the end of a bar nobody is playing.
 */
export function isFrozen(
    station: Pick<StationState, 'state' | 'pausedUntil'>,
    serverNow: number,
): boolean {
    return (
        serverNow < station.pausedUntil ||
        station.state === 'jammed' ||
        station.state === 'damaged'
    );
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
const POP_MS = 900;

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

class JigOverlay implements MinigameOverlay {
    readonly capturesMovement = true;

    private ctx: OverlayContext | null = null;
    private graphics: Phaser.GameObjects.Graphics | null = null;
    private labels: Labels | null = null;

    private mg: JigMg | null = null;
    private lastMg = '';
    private cursor = 0;
    /** The key B is holding, so the release that follows knows it was a swing. */
    private held: OverlayKey | null = null;
    private swungForHold = false;
    private frozenNow = 0;
    private popAt = 0;
    private popMs = 0;

    mount(ctx: OverlayContext): void {
        this.ctx = ctx;
        this.graphics = ctx.scene.add.graphics();
        ctx.container.add(this.graphics);
        this.labels = new Labels(ctx.scene, ctx.container);
        this.lastMg = '';
        this.mg = null;
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

        g.clear();

        if (!mg) {
            labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE JIG', { size: 18, bold: true });
            labels.write('idle', PAD, STRIP_Y, 'WAITING FOR THE STATION', {
                size: 12,
                colour: JIG_COLOURS.label,
            });
            labels.sweep();

            return;
        }

        if (!isFrozen(station, serverNow)) this.frozenNow = serverNow;

        const now = this.frozenNow;
        const role = roleOf(mg, ctx.sessionId);

        this.sendSwingOnHold(mg);

        if (role === 'b') this.drawRack(ctx, g, labels, mg, now);
        else this.drawJig(ctx, g, labels, mg, me, now, role);

        this.drawPop(ctx, labels, mg, now);
        this.drawPrimeFlash(ctx, g, mg, now);
        labels.sweep();
    }

    onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean {
        const ctx = this.ctx;
        const mg = this.mg;

        if (!ctx || !mg) return false;

        const role = roleOf(mg, ctx.sessionId);

        if (key === 'esc' || key === 'interact') return false;
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
            else this.cursor = moveCursor(this.cursor, lane === 'l' ? -1 : 1, this.chipCount(ctx));

            return true;
        }

        if (key !== 'space') return false;
        if (!down || repeat) return true;

        const op = spaceOp(mg.phase);

        if (op === 'seat') {
            const chip = this.chips(ctx)[moveCursor(this.cursor, 0, this.chipCount(ctx))];

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
            this.swungForHold = false;

            const op = bKeyOp(mg.bPhase, true);

            if (op !== null) {
                ctx.send(op);
                this.swungForHold = op === 'swing';
            }

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

    private chips(ctx: OverlayContext): JigChip[] {
        const station = ctx.state.stations.get(ctx.stationId);

        if (!station) return [];

        const ids: string[] = [];

        station.inputShelf.forEach((id) => ids.push(id));

        return readShelf(ids, (id) => ctx.state.items.get(id)).casings;
    }

    private chipCount(ctx: OverlayContext): number {
        return this.chips(ctx).length;
    }

    private drawJig(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        me: PlayerState,
        now: number,
        role: JigRole,
    ): void {
        const tag = role === 'a' ? 'A · THE JIG' : 'WATCHING · NO INPUTS';

        labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE JIG', { size: 18, bold: true });
        labels.write('tag', ctx.width - PAD, TITLE_Y + 2, tag, {
            size: 12,
            colour: role === 'a' ? JIG_COLOURS.text : JIG_COLOURS.label,
            originX: 1,
        });
        this.drawPhaseStrip(labels, mg);

        if (mg.phase === 'seat') this.drawPicker(ctx, g, labels, mg, me, now);
        else if (mg.phase === 'pour') this.drawPour(ctx, g, labels, mg, now);
        else if (mg.phase === 'parts') this.drawParts(ctx, g, labels, mg, now);
        else if (mg.phase === 'knots') this.drawKnots(ctx, g, labels, mg, now);
        else this.drawCrimp(ctx, g, labels, mg, now);

        labels.write(
            'legend',
            PAD,
            ctx.height - 20,
            role === 'a'
                ? '← → pick / knot · SPACE seat · pour · crimp · ESC bail'
                : 'A helper counts for the staffing curve; the phrase is A’s',
            { size: 11, colour: JIG_COLOURS.label },
        );
    }

    private drawPhaseStrip(labels: Labels, mg: JigMg): void {
        PHASES.forEach((phase, i) => {
            const current = phase === mg.phase;

            labels.write(`phase-${phase}`, PAD + i * 74, STRIP_Y, phase.toUpperCase(), {
                size: 12,
                bold: current,
                colour: current ? JIG_COLOURS.perfect : JIG_COLOURS.dim,
            });
        });
    }

    private drawPicker(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        me: PlayerState,
        now: number,
    ): void {
        const chips = this.chips(ctx);

        this.cursor = moveCursor(this.cursor, 0, chips.length);

        const block = pickerBlock({
            now,
            rearmAt: mg.rearmAt,
            casings: chips.length,
            kegs: readShelfKegs(ctx),
            keg: mg.keg,
            carrying: me.carrying,
        });
        const dim = block !== '';

        chips.forEach((chip, i) => {
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

        if (chips.length === 0) {
            labels.write('picker-empty', PAD, TRACK_Y + 8, 'SHELF EMPTY', {
                size: 12,
                colour: JIG_COLOURS.dim,
            });
        }

        this.drawKegGauge(ctx, g, labels, mg);

        if (block === '') return;

        labels.write('block', PAD, TRACK_Y + CHIP_H + 10, block, {
            size: 14,
            bold: true,
            colour: JIG_COLOURS.miss,
        });

        if (block !== 'RE-ARMING') return;

        const width = ctx.width - PAD * 2;

        g.fillStyle(JIG_COLOURS.track, 1);
        g.fillRect(PAD, TRACK_Y + CHIP_H + 30, width, 8);
        g.fillStyle(JIG_COLOURS.ok, 1);
        g.fillRect(
            PAD,
            TRACK_Y + CHIP_H + 30,
            width * fractionIn(mg.rearmFrom, mg.rearmAt, now),
            8,
        );
    }

    private drawKegGauge(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
    ): void {
        const x = ctx.width - PAD - 90;

        labels.write('keg-label', x, TRACK_Y - 16, 'KEG', {
            size: 11,
            colour: JIG_COLOURS.label,
        });

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

    private drawPour(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        now: number,
    ): void {
        const pour = mg.pour;

        if (pour === null) {
            labels.write('pour-wait', PAD, TRACK_Y, 'NO POWDER — WAITING FOR A KEG', {
                size: 14,
                colour: JIG_COLOURS.miss,
            });

            return;
        }

        const span = phaseSpan(mg) ?? { from: pour.startAt, to: pour.targetAt };
        const width = ctx.width - PAD * 2;
        const at = (t: number): number => PAD + width * fractionIn(span.from, span.to, t);
        const bands = pourBands(pour, this.pourConfig(ctx));

        this.drawTrack(g, ctx, TRACK_Y, TRACK_H);

        g.fillStyle(JIG_COLOURS.ok, 0.3);
        g.fillRect(at(bands.ok.from), TRACK_Y, at(bands.ok.to) - at(bands.ok.from), TRACK_H);
        g.fillStyle(JIG_COLOURS.perfect, 0.4);
        g.fillRect(
            at(bands.perfect.from),
            TRACK_Y,
            at(bands.perfect.to) - at(bands.perfect.from),
            TRACK_H,
        );

        const fill = Math.max(0, Math.min(1.2, pourFillAt(pour, now)));

        g.fillStyle(fill > 1 ? JIG_COLOURS.overfill : JIG_COLOURS.fill, 0.85);
        g.fillRect(PAD, TRACK_Y, at(now) - PAD, TRACK_H);

        g.lineStyle(1, JIG_COLOURS.trackEdge, 1);

        for (const mark of beatMarks(pour, mg.bpm)) {
            g.lineBetween(at(mark), TRACK_Y + TRACK_H - 8, at(mark), TRACK_Y + TRACK_H);
        }

        g.lineStyle(2, JIG_COLOURS.text, 1);
        g.lineBetween(at(bands.mark), TRACK_Y - 6, at(bands.mark), TRACK_Y + TRACK_H + 6);
        this.drawNeedle(g, at(now), TRACK_Y, TRACK_H);

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

    private drawParts(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        now: number,
    ): void {
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

        const span = phaseSpan(mg);

        if (!span) return;

        const width = ctx.width - PAD * 2;

        g.fillStyle(JIG_COLOURS.track, 1);
        g.fillRect(PAD, TRACK_Y + 48, width, 8);
        g.fillStyle(JIG_COLOURS.ok, 1);
        g.fillRect(PAD, TRACK_Y + 48, width * fractionIn(span.from, span.to, now), 8);
    }

    private drawKnots(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        now: number,
    ): void {
        const span = phaseSpan(mg);

        if (!span) return;

        const width = ctx.width - PAD * 2;
        const at = (t: number): number => PAD + width * fractionIn(span.from, span.to, t);
        const lanes: JigLane[] = ['l', 'r'];
        const window = { perfectMs: this.jigConfig(ctx).knots.perfectMs, okMs: 0 };

        lanes.forEach((lane, row) => {
            const y = TRACK_Y + row * (LANE_H + LANE_GAP);

            g.fillStyle(JIG_COLOURS.track, 1);
            g.fillRect(PAD, y, width, LANE_H);
            labels.write(`lane-${lane}`, PAD - 4, y + LANE_H / 2, lane === 'l' ? '←' : '→', {
                size: 14,
                colour: JIG_COLOURS.lane,
                originX: 1,
                originY: 0.5,
            });
        });

        for (const knot of knotMarkers(mg)) {
            const y = TRACK_Y + (knot.lane === 'l' ? 0 : LANE_H + LANE_GAP);

            g.fillStyle(knot.grade === null ? JIG_COLOURS.lane : GRADE_COLOURS[knot.grade], 1);
            g.fillRect(at(knot.at) - MARKER_W / 2, y, MARKER_W, LANE_H);
        }

        g.lineStyle(1, JIG_COLOURS.text, 0.5);

        for (const knot of knotMarkers(mg)) {
            g.lineBetween(
                at(knot.at - window.perfectMs / 1000),
                TRACK_Y - 4,
                at(knot.at + window.perfectMs / 1000),
                TRACK_Y - 4,
            );
        }

        this.drawNeedle(g, at(now), TRACK_Y - 6, LANE_H * 2 + LANE_GAP + 12);

        labels.write(
            'knot-count',
            ctx.width - PAD,
            TRACK_Y + LANE_H * 2 + LANE_GAP + 10,
            `KNOT ${Math.min(mg.knotIndex + 1, mg.knotAt.length)}/${mg.knotAt.length} · ${fuseLabel(mg.cradleFuse)}`,
            { size: 12, colour: JIG_COLOURS.label, originX: 1 },
        );
    }

    private drawCrimp(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        now: number,
    ): void {
        const span = phaseSpan(mg);

        if (!span) return;

        const width = ctx.width - PAD * 2;
        const at = (t: number): number => PAD + width * fractionIn(span.from, span.to, t);
        const judged = mg.crimpClickAt[mg.crimpClickAt.length - 1] ?? span.to;

        this.drawTrack(g, ctx, TRACK_Y, TRACK_H);

        const bands = bandsAround(judged, this.jigConfig(ctx).crimp);

        g.fillStyle(JIG_COLOURS.ok, 0.3);
        g.fillRect(at(bands.ok.from), TRACK_Y, at(bands.ok.to) - at(bands.ok.from), TRACK_H);
        g.fillStyle(JIG_COLOURS.perfect, 0.4);
        g.fillRect(
            at(bands.perfect.from),
            TRACK_Y,
            at(bands.perfect.to) - at(bands.perfect.from),
            TRACK_H,
        );

        mg.crimpClickAt.forEach((click, i) => {
            const last = i === mg.crimpClickAt.length - 1;

            g.lineStyle(last ? 3 : 1, last ? JIG_COLOURS.text : JIG_COLOURS.trackEdge, 1);
            g.lineBetween(at(click), TRACK_Y - 4, at(click), TRACK_Y + TRACK_H + 4);
        });

        this.drawNeedle(g, at(now), TRACK_Y, TRACK_H);

        labels.write('crimp-label', PAD, TRACK_Y + TRACK_H + 8, 'CRIMP ON THE THIRD CLICK', {
            size: 12,
            colour: JIG_COLOURS.label,
        });
    }

    private drawRack(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        now: number,
    ): void {
        labels.write('title', PAD, TITLE_Y, 'ASSEMBLY — THE PARTS RACK', { size: 18, bold: true });
        labels.write('tag', ctx.width - PAD, TITLE_Y + 2, 'B · THE RACK', {
            size: 12,
            originX: 1,
        });

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

        this.drawRackTrack(ctx, g, labels, mg, now);

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

    private drawRackTrack(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        labels: Labels,
        mg: JigMg,
        now: number,
    ): void {
        const width = ctx.width - PAD * 2;

        this.drawTrack(g, ctx, TRACK_Y, TRACK_H);

        if (mg.bPhase === 'fetching') {
            const from = mg.bFetchDoneAt - FETCH_SECONDS;

            g.fillStyle(JIG_COLOURS.parts, 0.85);
            g.fillRect(PAD, TRACK_Y, width * fractionIn(from, mg.bFetchDoneAt, now), TRACK_H);
            labels.write('b-state', PAD, TRACK_Y + TRACK_H + 8, 'FETCHING SPOOL AND CAP', {
                size: 12,
                colour: JIG_COLOURS.label,
            });

            return;
        }

        if (mg.bPhase === 'swinging') {
            const bands = tossBands(mg.swingStartAt, this.jigConfig(ctx).toss);
            const at = (t: number): number =>
                PAD + width * fractionIn(mg.swingStartAt, bands.close, t);

            g.fillStyle(JIG_COLOURS.ok, 0.3);
            g.fillRect(at(bands.ok.from), TRACK_Y, at(bands.ok.to) - at(bands.ok.from), TRACK_H);
            g.fillStyle(JIG_COLOURS.perfect, 0.4);
            g.fillRect(
                at(bands.perfect.from),
                TRACK_Y,
                at(bands.perfect.to) - at(bands.perfect.from),
                TRACK_H,
            );
            g.lineStyle(2, JIG_COLOURS.text, 1);
            g.lineBetween(at(bands.mark), TRACK_Y - 6, at(bands.mark), TRACK_Y + TRACK_H + 6);
            this.drawNeedle(g, at(now), TRACK_Y, TRACK_H);
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

    private drawPop(ctx: OverlayContext, labels: Labels, mg: JigMg, now: number): void {
        const pop = popFor(mg.last);

        if (!pop || mg.last === null) return;

        if (mg.last.at !== this.popAt) {
            this.popAt = mg.last.at;
            this.popMs = ctx.scene.time.now;
        }

        const age = ctx.scene.time.now - this.popMs;

        if (age > POP_MS) return;

        labels.write('pop', ctx.width / 2, TRACK_Y - 34 - age / 40, pop.text, {
            size: 20,
            bold: true,
            colour: pop.colour,
            originX: 0.5,
        });
        void now;
    }

    /** Everyone at the station sees the flash, wherever the stick was judged. */
    private drawPrimeFlash(
        ctx: OverlayContext,
        g: Phaser.GameObjects.Graphics,
        mg: JigMg,
        now: number,
    ): void {
        const alpha = primeFlash(mg.primeAt, now);

        if (alpha <= 0) return;

        g.fillStyle(JIG_COLOURS.brass, alpha * 0.5);
        g.fillRect(0, 0, ctx.width, ctx.height);
    }

    private drawTrack(
        g: Phaser.GameObjects.Graphics,
        ctx: OverlayContext,
        y: number,
        height: number,
    ): void {
        g.fillStyle(JIG_COLOURS.track, 1);
        g.fillRect(PAD, y, ctx.width - PAD * 2, height);
        g.lineStyle(1, JIG_COLOURS.trackEdge, 1);
        g.strokeRect(PAD, y, ctx.width - PAD * 2, height);
    }

    private drawNeedle(
        g: Phaser.GameObjects.Graphics,
        x: number,
        y: number,
        height: number,
    ): void {
        g.fillStyle(JIG_COLOURS.needle, 1);
        g.fillRect(x - NEEDLE_W / 2, y, NEEDLE_W, height);
    }

    private jigConfig(ctx: OverlayContext): AssemblyMinigame {
        const cfg = ctx.scene.conn.config.level.stations.find(
            (station) => station.id === ctx.stationId,
        );

        return (cfg?.minigame ?? FALLBACK_MINIGAME) as AssemblyMinigame;
    }

    private pourConfig(ctx: OverlayContext): PourConfig {
        return this.jigConfig(ctx).pour;
    }
}

/**
 * The panel is mounted from `StationState`, which can arrive before the config
 * reply does; the fallback keeps the bands drawable for that one frame and is
 * replaced by the level's own numbers as soon as they land.
 */
const FALLBACK_MINIGAME: AssemblyMinigame = {
    pour: {
        beatsByQuality: { '1.0': 5, '0.7': 7, '0.4': 8 },
        perfectMs: 60,
        okMs: 140,
        primeKegWindowMultiplier: 1.5,
    },
    knots: { long: 3, short: 2, secondsPerKnot: 0.4, perfectMs: 60, okMs: 140 },
    crimp: { clicks: 3, clickSeconds: 0.2, perfectMs: 80, okMs: 200 },
    toss: { arcSeconds: 0.5, perfectMs: 120, okMs: 250 },
};

function readShelfKegs(ctx: OverlayContext): number {
    const station = ctx.state.stations.get(ctx.stationId);

    if (!station) return 0;

    const ids: string[] = [];

    station.inputShelf.forEach((id) => ids.push(id));

    return readShelf(ids, (id) => ctx.state.items.get(id)).kegs;
}

export const jigOverlay: OverlayFactory = () => new JigOverlay();
