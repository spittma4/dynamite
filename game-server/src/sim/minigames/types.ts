import type {
    FuseLength,
    FxKind,
    ItemState,
    ItemType,
    MgOp,
    PlayerState,
    Role,
    StationConfig,
} from '../../shared';
import type { Station } from '../stations';
import type { World } from '../World';

/**
 * The one interface a station's mini-game implements (contracts §10.3). F05
 * owns join, leave, staffing, cycle timing and the shelves; a module owns the
 * gesture, `StationState.mg`, and — through `status?()` — the three states that
 * describe its own work. Everything it needs from the world arrives as a
 * `StationCtx` built fresh for the call, so no module keeps a `World` of its own.
 */

export type LeaveReason = 'esc' | 'stepOff' | 'disconnect';

/** `handsOf` is the operator whose hands catch the output when the shelf is full. */
export interface OutputSpec {
    type: ItemType;
    quality: number;
    prime: boolean;
    dents: number;
    fuseLength: FuseLength;
    fill: number;
    capLoose: boolean;
    frayed: boolean;
    orderId: string;
    handsOf: string;
}

export interface CycleResult {
    item?: OutputSpec;
    perfect: boolean;
}

export type StationPhase = 'idle' | 'executing' | 'rearming' | 'blocked' | 'jammed';

export interface StationCtx {
    world: World;
    station: Station;
    cfg: StationConfig;
    now: number;
    phase: StationPhase;
    /** `now < station.pausedUntil` — a module must not advance its timers here. */
    paused: boolean;
    rearmAt: number;
    operators: PlayerState[];
    rackHands: PlayerState[];
    helpers: PlayerState[];
    sessionIdOf(player: PlayerState): string;
    /** The input shelf in shelf order; a station never pulls off its floor ring. */
    inputShelf(): ItemState[];
    consume(itemId: string): ItemState;
    beginCycle(): boolean;
    /** `'none'` when nothing was delivered; the cycle re-arms either way. */
    complete(result: CycleResult): 'shelved' | 'hands' | 'none';
    abort(): void;
    setMg(value: object): void;
    setProgress(p: number): void;
    fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void;
    bubble(sessionId: string, text: string, seconds: number): void;
}

export interface MinigameInstance {
    onJoin(ctx: StationCtx, player: PlayerState, role: Role): void;
    /** `'stepOff'` only reaches a `stand` station. */
    onLeave(ctx: StationCtx, player: PlayerState, reason: LeaveReason): void;
    /** `true` = consumed; `false` lets F05 read the press as a leave. */
    onInteract(ctx: StationCtx, player: PlayerState): boolean;
    /** `t` is the client's raw `performance.now()` ms, forwarded unchanged (contracts §10.3). */
    onMessage(
        ctx: StationCtx,
        player: PlayerState,
        op: MgOp,
        v: number | string | undefined,
        t: number,
    ): void;
    tick(ctx: StationCtx, dt: number): void;
    starved(ctx: StationCtx): boolean;
    status?(ctx: StationCtx): { state: 'idle' | 'starved' | 'working'; progress: number } | null;
}

/** The join mode is the station's, not the module's: it comes from `cfg.joinMode`. */
export interface MinigameModule {
    create(station: Station): MinigameInstance;
}
