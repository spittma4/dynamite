import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { signTicket, verifyTicket } from '../src/auth/ticket';

/**
 * The vectors are Laravel's: `IssueGameTicket` base64url-encodes the claims and
 * appends a lowercase hex HMAC of that encoded string, so a ticket built by PHP
 * has to verify here byte for byte.
 */
const SECRET = 'test-secret';
const PAYLOAD = 'eyJ1c2VySWQiOjcsImZhY3RvcnlJZCI6MywibmFtZSI6IlNhbSIsImV4cCI6MTg5MzQ1NjAwMH0';
const SIGNATURE = '48ae02a1a0d1fd78e2a8eee11d9ef4f51be2ae5246d8f5653c40a3a1ac78b13e';
const TICKET = `${PAYLOAD}.${SIGNATURE}`;
const BEFORE_EXPIRY = 1893455999;

describe('verifyTicket', () => {
    it('accepts a ticket signed with the shared secret and returns its claims as strings', () => {
        const result = verifyTicket(TICKET, SECRET, BEFORE_EXPIRY);

        expect(result).toEqual({
            ok: true,
            claims: { userId: '7', factoryId: '3', name: 'Sam', exp: 1893456000 },
        });
    });

    it('rejects a ticket signed with a different secret as bad-signature', () => {
        expect(verifyTicket(TICKET, 'other-secret', BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'bad-signature',
        });
    });

    it('rejects a ticket whose payload was altered after signing as bad-signature', () => {
        const tampered = `${PAYLOAD.slice(0, -1)}X.${SIGNATURE}`;

        expect(verifyTicket(tampered, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'bad-signature',
        });
    });

    it('rejects a ticket whose exp is in the past as expired', () => {
        expect(verifyTicket(TICKET, SECRET, 1893456001)).toEqual({ ok: false, reason: 'expired' });
    });

    it('treats a ticket whose exp equals now as expired', () => {
        expect(verifyTicket(TICKET, SECRET, 1893456000)).toEqual({ ok: false, reason: 'expired' });
    });

    it('rejects a ticket that is not two dot-separated parts as malformed', () => {
        expect(verifyTicket(PAYLOAD, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'malformed',
        });
        expect(verifyTicket(`${TICKET}.extra`, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'malformed',
        });
        expect(verifyTicket(`.${SIGNATURE}`, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'malformed',
        });
    });

    it('rejects a payload that is not JSON as malformed', () => {
        const junk = Buffer.from('not json').toString('base64url');

        expect(verifyTicket(signTicketRaw(junk, SECRET), SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'malformed',
        });
    });

    it('rejects a ticket with a missing name or a name longer than 32 chars as bad-claims', () => {
        const noName = claimsTicket({ userId: 1, factoryId: 1, exp: 1893456000 });
        const longName = claimsTicket({
            userId: 1,
            factoryId: 1,
            name: 'x'.repeat(33),
            exp: 1893456000,
        });

        expect(verifyTicket(noName, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'bad-claims',
        });
        expect(verifyTicket(longName, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'bad-claims',
        });
    });

    it('rejects an empty userId or factoryId as bad-claims', () => {
        const ticket = claimsTicket({ userId: '', factoryId: '3', name: 'Sam', exp: 1893456000 });

        expect(verifyTicket(ticket, SECRET, BEFORE_EXPIRY)).toEqual({
            ok: false,
            reason: 'bad-claims',
        });
    });

    it('coerces numeric userId and factoryId to strings', () => {
        const result = verifyTicket(TICKET, SECRET, BEFORE_EXPIRY);

        expect(result.ok && typeof result.claims.userId).toBe('string');
        expect(result.ok && typeof result.claims.factoryId).toBe('string');
    });

    it('round-trips signTicket to verifyTicket', () => {
        const claims = { userId: '12', factoryId: '7', name: 'Priya', exp: 1893456000 };
        const result = verifyTicket(signTicket(claims, SECRET), SECRET, BEFORE_EXPIRY);

        expect(result).toEqual({ ok: true, claims });
    });
});

function claimsTicket(claims: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    return signTicketRaw(payload, SECRET);
}

/**
 * The production signer only accepts well-formed claims, and these cases need a
 * correctly signed but invalid payload.
 */
function signTicketRaw(payload: string, secret: string): string {
    return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
