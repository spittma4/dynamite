import { emote } from '../sim/bubbles';
import { damagedStationUnder, tryBeginRepair, tryBeginStomp } from '../sim/hazards';
import { onAction, onInteract } from '../sim/items';
import { leave, onInteract as stationInteract, onMg } from '../sim/stations';
import type { PlayerRuntime, World } from '../sim/World';
import {
    ACTION_OP,
    ClientMsg,
    isActionMsg,
    isEmoteMsg,
    isInputMsg,
    isInteractMsg,
    isMgMsg,
} from '../shared';
import type { PlayerState } from '../shared';
import { canStart } from './lobby';
import type { StartRefusal } from './lobby';

/**
 * The one door every client message comes through (contracts §4, §11). The
 * wrapper does the four things no feature should have to remember — validate
 * the payload, keep the client's clock offset, refuse a stunned player's hands,
 * and swallow a handler's exception — so each entry below is only its own rule.
 *
 * F03 owns `input`, `emote`, `start` and `config`; F05 replaces `mg`/`leave` and
 * F06 replaces `interact`/`action`, each as a one-line touch on its own entry.
 */

export type ClientMsgName = keyof typeof ClientMsg;

/** The only Colyseus-side actions a handler may trigger. */
export interface RoomControls {
    startDay(): void;
    /** Contracts §4: the `config` reply goes to one client, not through the outbox. */
    sendConfig(sessionId: string): void;
}

export interface HandlerContext {
    world: World;
    sessionId: string;
    player: PlayerState;
    room: RoomControls;
}

export type MessageHandler = (ctx: HandlerContext, payload: unknown) => void;

/** Contracts §10.1: the window `clockOffsetMs` takes its minimum over. */
const CLOCK_OFFSET_SAMPLES = 32;

/** Refusals a player can act on. They carry a number, so they are code, not `copy.json`. */
const REFUSAL_TEXT: Record<StartRefusal['reason'], (min: number) => string> = {
    'not-lobby': () => '',
    'not-host': () => 'Only the host can start',
    'too-few': (min) => `Need ${min} players to start`,
};

/**
 * Per-client offset samples. They hang off the runtime rather than living in
 * `PlayerRuntime` because only this wrapper ever reads them; the runtime keeps
 * the one number `inputClock` needs.
 */
const offsetSamples = new WeakMap<PlayerRuntime, number[]>();

/** `leave`, `start` and `config` carry no payload, so there is nothing to check. */
const ACCEPTS_ANY = (): boolean => true;

const GUARDS: Record<ClientMsgName, (payload: unknown) => boolean> = {
    input: isInputMsg,
    interact: isInteractMsg,
    action: isActionMsg,
    mg: isMgMsg,
    leave: ACCEPTS_ANY,
    emote: isEmoteMsg,
    start: ACCEPTS_ANY,
    config: ACCEPTS_ANY,
};

/** The messages the server judges against its own clock (contracts §7). */
const TIMED: ReadonlySet<ClientMsgName> = new Set<ClientMsgName>(['mg', 'action', 'interact']);
/** Hands are busy while you are seeing stars; walking is not. */
const BLOCKED_WHILE_STUNNED: ReadonlySet<ClientMsgName> = new Set<ClientMsgName>([
    'interact',
    'action',
]);

function noteClockOffset(world: World, sessionId: string, tMs: number): void {
    const runtime = world.runtime(sessionId);
    const samples = offsetSamples.get(runtime) ?? [];

    samples.push(world.state.clock * 1000 - tMs);

    if (samples.length > CLOCK_OFFSET_SAMPLES) samples.shift();

    offsetSamples.set(runtime, samples);
    runtime.clockOffsetMs = Math.min(...samples);
}

function timestampOf(payload: unknown): number | null {
    if (typeof payload !== 'object' || payload === null) return null;

    const t = (payload as { t?: unknown }).t;

    return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

/**
 * The last link in the §11 `action` chain. `ActionMsg` carries no op, so an
 * overlay that let `Space` fall through to the floor is read as the one gesture
 * its station type answers `Space` with.
 */
function stationAction(ctx: HandlerContext, t: number): void {
    const stationId = ctx.player.stationId;

    if (stationId === '') return;

    const op = ACTION_OP[ctx.world.stationConfig(stationId).type];

    onMg(ctx.world, ctx.player, { stationId, op, t });
}

export const MESSAGE_HANDLERS: Record<ClientMsgName, MessageHandler> = {
    input(ctx, payload): void {
        if (!isInputMsg(payload)) return;

        const runtime = ctx.world.runtime(ctx.sessionId);

        // A packet that overtook a newer one on the way would rewind the intent.
        if (payload.seq < runtime.intent.seq) return;

        runtime.intent = { dx: payload.dx, dy: payload.dy, seq: payload.seq };
        runtime.lastInputAt = ctx.world.now;
    },

    interact(ctx, payload): void {
        if (!isInteractMsg(payload)) return;
        if (onInteract(ctx.world, ctx.player, payload.t)) return;
        if (stationInteract(ctx.world, ctx.player)) return;

        tryBeginRepair(ctx.world, ctx.sessionId, damagedStationUnder(ctx.world, ctx.player));
    },

    action(ctx, payload): void {
        if (!isActionMsg(payload)) return;
        if (onAction(ctx.world, ctx.player, payload.t)) return;
        if (tryBeginStomp(ctx.world, ctx.sessionId)) return;

        stationAction(ctx, payload.t);
    },

    mg(ctx, payload): void {
        if (!isMgMsg(payload)) return;

        onMg(ctx.world, ctx.player, payload);
    },

    leave(ctx): void {
        const stationId = ctx.player.stationId;

        // Standing on a `stand` station is the whole membership, so `Esc` there
        // has nothing to release and the tick would seat the player again. The
        // refusal lives here rather than in `stations.leave`, which F10 calls
        // with the same two arguments to eject a crew from a damaged machine.
        if (stationId === '') return;
        if (ctx.world.stationConfig(stationId).joinMode === 'stand') return;

        leave(ctx.world, ctx.player);
    },

    emote(ctx, payload): void {
        if (!isEmoteMsg(payload)) return;

        emote(ctx.world, ctx.player, payload.kind);
    },

    start(ctx): void {
        const verdict = canStart(ctx.world, ctx.sessionId);

        if (verdict.ok) {
            ctx.room.startDay();

            return;
        }

        const text = REFUSAL_TEXT[verdict.reason](verdict.min);

        // `not-lobby` is a stale click on a shift that already began: nothing to say.
        if (text !== '') ctx.world.toast(ctx.sessionId, text, 'warn');
    },

    config(ctx): void {
        ctx.room.sendConfig(ctx.sessionId);
    },
};

export function dispatchMessage(
    world: World,
    room: RoomControls,
    sessionId: string,
    name: ClientMsgName,
    payload: unknown,
): void {
    const player = world.state.players.get(sessionId);

    if (player === undefined) return;

    if (!GUARDS[name](payload)) {
        world.log(`${name} dropped: bad payload`);

        return;
    }

    if (BLOCKED_WHILE_STUNNED.has(name) && world.state.clock < player.stunnedUntil) {
        world.log(`${name} dropped: stunned`);

        return;
    }

    if (TIMED.has(name)) {
        const t = timestampOf(payload);

        if (t !== null) noteClockOffset(world, sessionId, t);
    }

    try {
        MESSAGE_HANDLERS[name]({ world, sessionId, player, room }, payload);
    } catch (error) {
        world.log(`${name} handler failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
