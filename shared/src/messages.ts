import type { Copy } from './copy';
import type { LayoutConfig, LevelConfig } from './config/types';

/**
 * Every name and payload that crosses the wire (contracts §4). The guards exist
 * because a client payload is untrusted and four server features would
 * otherwise each hand-roll the same shape checks; per-op meaning of `v` stays
 * the station module's to judge.
 */

export const ClientMsg = {
    input: 'input',
    interact: 'interact',
    action: 'action',
    mg: 'mg',
    leave: 'leave',
    emote: 'emote',
    start: 'start',
    config: 'config',
} as const;

export const ServerMsg = {
    config: 'config',
    fx: 'fx',
    toast: 'toast',
    report: 'report',
} as const;

export type Axis = -1 | 0 | 1;
export type EmoteKind = 'stop' | 'help' | 'go' | 'what';
export type ToastKind = 'info' | 'warn' | 'good' | 'bad';
export type MgOp =
    | 'mash'
    | 'charge'
    | 'release'
    | 'seat'
    | 'pour'
    | 'knot'
    | 'crimp'
    | 'pick'
    | 'fetch'
    | 'swing'
    | 'toss'
    | 'stock'
    | 'shove'
    | 'tailgate';
export type FxKind =
    | 'thunk'
    | 'spark'
    | 'fuse'
    | 'blast'
    | 'fizzle'
    | 'snap'
    | 'whump'
    | 'horn'
    | 'slam'
    | 'chime'
    | 'clink'
    | 'pfft'
    | 'bonk'
    | 'slop';

export type InputMsg = { dx: Axis; dy: Axis; seq: number };
export type InteractMsg = { t?: number };
export type ActionMsg = { t: number };
export type MgMsg = { stationId: string; op: MgOp; t: number; v?: number | string };
export type LeaveMsg = Record<string, never>;
export type EmoteMsg = { kind: EmoteKind };
export type StartMsg = Record<string, never>;
export type ConfigRequestMsg = Record<string, never>;
/** `x`/`y` are tile units — tile centres for anything anchored to a tile. */
export type FxMsg = { kind: FxKind; x: number; y: number; size?: number; text?: string };
export type ToastMsg = { text: string; kind: ToastKind };
export type ConfigMsg = { level: LevelConfig; layout: LayoutConfig; copy: Copy };

const MG_OPS: readonly string[] = [
    'mash',
    'charge',
    'release',
    'seat',
    'pour',
    'knot',
    'crimp',
    'pick',
    'fetch',
    'swing',
    'toss',
    'stock',
    'shove',
    'tailgate',
];
const EMOTE_KINDS: readonly string[] = ['stop', 'help', 'go', 'what'];

function isRecord(p: unknown): p is Record<string, unknown> {
    return typeof p === 'object' && p !== null && !Array.isArray(p);
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isAxis(v: unknown): v is Axis {
    return v === -1 || v === 0 || v === 1;
}

export function isInputMsg(p: unknown): p is InputMsg {
    return isRecord(p) && isAxis(p.dx) && isAxis(p.dy) && isFiniteNumber(p.seq);
}

export function isInteractMsg(p: unknown): p is InteractMsg {
    return isRecord(p) && (p.t === undefined || isFiniteNumber(p.t));
}

export function isActionMsg(p: unknown): p is ActionMsg {
    return isRecord(p) && isFiniteNumber(p.t);
}

export function isMgMsg(p: unknown): p is MgMsg {
    if (!isRecord(p)) return false;
    if (typeof p.stationId !== 'string' || !isFiniteNumber(p.t)) return false;
    if (typeof p.op !== 'string' || !MG_OPS.includes(p.op)) return false;

    return p.v === undefined || typeof p.v === 'string' || isFiniteNumber(p.v);
}

export function isEmoteMsg(p: unknown): p is EmoteMsg {
    return isRecord(p) && typeof p.kind === 'string' && EMOTE_KINDS.includes(p.kind);
}
