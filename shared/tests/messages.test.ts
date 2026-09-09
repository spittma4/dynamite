import { describe, expect, it } from 'vitest';

import {
    ClientMsg,
    ServerMsg,
    isActionMsg,
    isEmoteMsg,
    isInputMsg,
    isInteractMsg,
    isMgMsg,
} from '../src/messages';
import type { EmoteKind, FxKind, MgOp } from '../src/messages';

// Exhaustive by construction: a missing key fails to compile, an extra key is a
// type error, so the counts below are a real check on the unions.
const MG_OPS: Record<MgOp, true> = {
    mash: true,
    charge: true,
    release: true,
    seat: true,
    pour: true,
    knot: true,
    crimp: true,
    pick: true,
    fetch: true,
    swing: true,
    toss: true,
    shove: true,
    tailgate: true,
};
const FX_KINDS: Record<FxKind, true> = {
    thunk: true,
    spark: true,
    fuse: true,
    blast: true,
    fizzle: true,
    snap: true,
    whump: true,
    horn: true,
    slam: true,
    chime: true,
    clink: true,
    pfft: true,
    bonk: true,
    slop: true,
};
const EMOTE_KINDS: Record<EmoteKind, true> = { stop: true, help: true, go: true, what: true };

describe('the message registries', () => {
    it('lists exactly the eight client message names', () => {
        expect(Object.keys(ClientMsg)).toEqual([
            'input',
            'interact',
            'action',
            'mg',
            'leave',
            'emote',
            'start',
            'config',
        ]);
        expect(Object.values(ClientMsg)).toEqual(Object.keys(ClientMsg));
    });

    it('lists exactly the four server message names', () => {
        expect(Object.keys(ServerMsg)).toEqual(['config', 'fx', 'toast', 'report']);
        expect(Object.values(ServerMsg)).toEqual(Object.keys(ServerMsg));
    });

    it('names fourteen effects, including the powder hopper slop', () => {
        expect(Object.keys(FX_KINDS)).toHaveLength(14);
        expect(FX_KINDS.slop).toBe(true);
    });
});

describe('isInputMsg', () => {
    it('accepts a movement intent on both axes with a sequence number', () => {
        expect(isInputMsg({ dx: -1, dy: 1, seq: 4 })).toBe(true);
        expect(isInputMsg({ dx: 0, dy: 0, seq: 0 })).toBe(true);
    });

    it('rejects an axis outside -1, 0 and 1', () => {
        expect(isInputMsg({ dx: 2, dy: 0, seq: 4 })).toBe(false);
        expect(isInputMsg({ dx: 0, dy: -2, seq: 4 })).toBe(false);
        expect(isInputMsg({ dx: 0.5, dy: 0, seq: 4 })).toBe(false);
    });

    it('rejects a missing or non-numeric field, and a non-object', () => {
        expect(isInputMsg({ dx: 0, dy: 0 })).toBe(false);
        expect(isInputMsg({ dx: '0', dy: 0, seq: 1 })).toBe(false);
        expect(isInputMsg({ dx: 0, dy: 0, seq: '1' })).toBe(false);
        expect(isInputMsg(null)).toBe(false);
        expect(isInputMsg('input')).toBe(false);
    });
});

describe('isInteractMsg', () => {
    it('accepts a press with or without a client timestamp', () => {
        expect(isInteractMsg({})).toBe(true);
        expect(isInteractMsg({ t: 12 })).toBe(true);
    });

    it('rejects a non-numeric timestamp', () => {
        expect(isInteractMsg({ t: 'now' })).toBe(false);
        expect(isInteractMsg({ t: Number.NaN })).toBe(false);
        expect(isInteractMsg(null)).toBe(false);
    });
});

describe('isActionMsg', () => {
    it('requires the client timestamp the server judges against', () => {
        expect(isActionMsg({ t: 1200.5 })).toBe(true);
        expect(isActionMsg({})).toBe(false);
        expect(isActionMsg({ t: 'now' })).toBe(false);
    });
});

describe('isMgMsg', () => {
    it('accepts every mini-game op in the contract', () => {
        for (const op of Object.keys(MG_OPS)) {
            expect(isMgMsg({ stationId: 'powder-a', op, t: 10 })).toBe(true);
        }
        expect(Object.keys(MG_OPS)).toHaveLength(13);
        expect(isMgMsg({ stationId: 'assembly-a', op: 'swing', t: 10 })).toBe(true);
    });

    it('rejects an op nobody implements', () => {
        expect(isMgMsg({ stationId: 'powder-a', op: 'steer', t: 10 })).toBe(false);
        expect(isMgMsg({ stationId: 'powder-a', op: 42, t: 10 })).toBe(false);
    });

    it('accepts a numeric or string value and nothing else', () => {
        expect(isMgMsg({ stationId: 'assembly-a', op: 'seat', t: 10, v: 2 })).toBe(true);
        expect(isMgMsg({ stationId: 'assembly-a', op: 'pick', t: 10, v: 'short' })).toBe(true);
        expect(isMgMsg({ stationId: 'assembly-a', op: 'seat', t: 10, v: undefined })).toBe(true);
        expect(isMgMsg({ stationId: 'assembly-a', op: 'seat', t: 10, v: null })).toBe(false);
        expect(isMgMsg({ stationId: 'assembly-a', op: 'seat', t: 10, v: { i: 1 } })).toBe(false);
    });

    it('rejects a missing station or timestamp', () => {
        expect(isMgMsg({ op: 'mash', t: 10 })).toBe(false);
        expect(isMgMsg({ stationId: 'powder-a', op: 'mash' })).toBe(false);
    });
});

describe('isEmoteMsg', () => {
    it('accepts the four emotes', () => {
        for (const kind of Object.keys(EMOTE_KINDS)) {
            expect(isEmoteMsg({ kind })).toBe(true);
        }
    });

    it('rejects anything else', () => {
        expect(isEmoteMsg({ kind: 'shrug' })).toBe(false);
        expect(isEmoteMsg({})).toBe(false);
    });
});
