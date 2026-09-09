import { type Facing, type MoveInput, type SolidFn, stepPosition } from '@shared';

import {
    DEADBAND_TILES,
    HISTORY_MS,
    LAG_ALPHA,
    LAG_INITIAL_MS,
    LAG_MAX_MS,
    LAG_MIN_MS,
    NUDGE,
    SNAP_TILES,
} from '../constants';

/**
 * Own-avatar prediction (F04 §6). Inputs are *intents* — sent on change plus a
 * 250 ms heartbeat — so the server holds one for as long as the key is down and
 * there is no per-tick command to replay. The client therefore runs the same
 * `stepPosition` continuously and compares the server's sample against where it
 * thought it was when that sample was taken, one `lagMs` ago.
 *
 * The unacknowledged intents are still kept: after a snap (knockback, truck
 * ride, respawn) they are replayed forward from the authoritative position, so
 * a correction does not also throw away the walking the player has already
 * done and watched happen.
 */

export interface PredictionOptions {
    isSolid: SolidFn;
    radius: number;
}

export interface Pose {
    x: number;
    y: number;
    facing: Facing;
    moving: boolean;
}

export interface Point {
    x: number;
    y: number;
}

/** The authoritative sample: `PlayerState.x/y/seq/speed`. */
export interface ServerSample {
    x: number;
    y: number;
    seq: number;
    speed: number;
}

export type Correction = 'none' | 'nudge' | 'snap';

interface HistoryEntry {
    t: number;
    x: number;
    y: number;
}

interface SentInput {
    seq: number;
    at: number;
    dx: MoveInput['dx'];
    dy: MoveInput['dy'];
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export class OwnPrediction {
    private readonly history: HistoryEntry[] = [];
    private sent: SentInput[] = [];

    private posX = 0;
    private posY = 0;
    private face: Facing = 0;
    private walking = false;

    private lag = LAG_INITIAL_MS;
    private ackedSeq = 0;
    private snapNext = false;

    constructor(private readonly options: PredictionOptions) {}

    get x(): number {
        return this.posX;
    }

    get y(): number {
        return this.posY;
    }

    get facing(): Facing {
        return this.face;
    }

    get moving(): boolean {
        return this.walking;
    }

    /** The input-to-visible-state delay the reconciliation looks back through. */
    get lagMs(): number {
        return this.lag;
    }

    get pose(): Pose {
        return { x: this.posX, y: this.posY, facing: this.face, moving: this.walking };
    }

    /** Adopts a position outright — the first patch, or a scene restart. */
    reset(x: number, y: number, facing: Facing, nowMs: number): void {
        this.posX = x;
        this.posY = y;
        this.face = facing;
        this.walking = false;
        this.history.length = 0;
        this.sent = [];
        this.record(nowMs);
    }

    /** Every `input` message, so the seq echo can be timed and the intent replayed. */
    noteSent(seq: number, intent: MoveInput, atMs: number): void {
        this.sent.push({ seq, at: atMs, dx: intent.dx, dy: intent.dy });
    }

    /**
     * One frame of the same integrator the server runs, at the server's own
     * effective speed — the client never works out a multiplier of its own.
     */
    step(intent: MoveInput, dtSeconds: number, speed: number, nowMs: number): Pose {
        const moved = stepPosition(
            { x: this.posX, y: this.posY, facing: this.face },
            intent,
            dtSeconds,
            this.options.isSolid,
            speed,
            this.options.radius,
        );

        this.posX = moved.x;
        this.posY = moved.y;
        this.face = moved.facing;
        this.walking = moved.moved;
        this.record(nowMs);

        return this.pose;
    }

    /** Where the client thought it was at `atMs`; `null` until it has predicted once. */
    historyAt(atMs: number): Point | null {
        const first = this.history[0];
        const last = this.history[this.history.length - 1];

        if (!first || !last) return null;
        if (atMs <= first.t) return { x: first.x, y: first.y };
        if (atMs >= last.t) return { x: last.x, y: last.y };

        for (let i = 1; i < this.history.length; i++) {
            const a = this.history[i - 1];
            const b = this.history[i];

            if (!a || !b || atMs > b.t) continue;

            const span = b.t - a.t;
            const alpha = span > 0 ? (atMs - a.t) / span : 1;

            return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
        }

        return { x: last.x, y: last.y };
    }

    /** The next patch is adopted whole: a resumed seat is not worth interpolating into. */
    onReconnect(): void {
        this.snapNext = true;
    }

    reconcile(server: ServerSample, nowMs: number): Correction {
        this.acknowledge(server.seq, nowMs);

        if (this.snapNext) {
            this.snapNext = false;
            this.snap(server, nowMs);

            return 'snap';
        }

        const looked = this.historyAt(nowMs - this.lag);

        if (!looked) return 'none';

        const errorX = server.x - looked.x;
        const errorY = server.y - looked.y;
        const error = Math.hypot(errorX, errorY);

        if (error > SNAP_TILES) {
            this.snap(server, nowMs);

            return 'snap';
        }

        if (error > DEADBAND_TILES) {
            this.posX += errorX * NUDGE;
            this.posY += errorY * NUDGE;

            return 'nudge';
        }

        return 'none';
    }

    /**
     * The echo of a seq we timed is the whole round trip — send, tick, patch —
     * which is exactly the lookback the error measurement needs.
     */
    private acknowledge(seq: number, nowMs: number): void {
        if (seq === this.ackedSeq) return;

        this.ackedSeq = seq;

        const sent = this.sent.find((input) => input.seq === seq);

        if (sent) {
            this.lag = clamp(
                this.lag + LAG_ALPHA * (nowMs - sent.at - this.lag),
                LAG_MIN_MS,
                LAG_MAX_MS,
            );
        }

        // The acknowledged intent is kept: the server is still holding it, so a
        // replay has to start from it rather than from the input after it.
        this.sent = this.sent.filter((input) => input.seq >= seq);
    }

    private snap(server: ServerSample, nowMs: number): void {
        this.posX = server.x;
        this.posY = server.y;
        this.history.length = 0;
        this.replay(nowMs - this.lag, nowMs, server.speed);
        this.record(nowMs);
    }

    /** Re-walks the in-flight intents from the authoritative position forward. */
    private replay(fromMs: number, toMs: number, speed: number): void {
        if (speed <= 0 || toMs <= fromMs) return;

        for (let i = 0; i < this.sent.length; i++) {
            const input = this.sent[i];
            const next = this.sent[i + 1];

            if (!input) continue;

            const from = Math.max(fromMs, input.at);
            const to = Math.min(toMs, next ? next.at : toMs);

            if (to <= from) continue;

            const moved = stepPosition(
                { x: this.posX, y: this.posY, facing: this.face },
                input,
                (to - from) / 1000,
                this.options.isSolid,
                speed,
                this.options.radius,
            );

            this.posX = moved.x;
            this.posY = moved.y;
            this.face = moved.facing;
        }
    }

    private record(nowMs: number): void {
        this.history.push({ t: nowMs, x: this.posX, y: this.posY });

        while (this.history.length > 1 && (this.history[0]?.t ?? nowMs) < nowMs - HISTORY_MS) {
            this.history.shift();
        }
    }
}
