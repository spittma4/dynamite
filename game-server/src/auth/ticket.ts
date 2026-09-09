import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Contracts §5. Laravel issues `base64url(json).hex(hmac(secret, base64url))`
 * with a 60-second life; the signature is checked before the claims are even
 * parsed, so a tampered payload always reads as `bad-signature` rather than
 * leaking which field a forger got wrong.
 */
export interface TicketClaims {
    userId: string;
    factoryId: string;
    name: string;
    /** Unix seconds. */
    exp: number;
}

export type TicketFailure = 'malformed' | 'bad-signature' | 'bad-claims' | 'expired';
export type TicketResult = { ok: true; claims: TicketClaims } | { ok: false; reason: TicketFailure };

/** Contracts §5: the name a ticket may carry. */
export const NAME_MAX_CHARS = 32;

function hmacHex(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
}

function signatureMatches(expected: string, presented: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(presented, 'utf8');

    // `timingSafeEqual` throws on a length mismatch, and a wrong length is
    // already a wrong signature.
    return a.length === b.length && timingSafeEqual(a, b);
}

/** A ticket id is a JSON integer on the wire and a string everywhere in Node. */
function idClaim(value: unknown): string | null {
    if (typeof value === 'string') return value.length > 0 ? value : null;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);

    return null;
}

function claimsOf(payload: string): TicketClaims | 'malformed' | 'bad-claims' {
    let parsed: unknown;

    try {
        parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return 'malformed';
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'malformed';

    const raw = parsed as Record<string, unknown>;
    const userId = idClaim(raw.userId);
    const factoryId = idClaim(raw.factoryId);
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';

    if (userId === null || factoryId === null) return 'bad-claims';
    if (name.length < 1 || name.length > NAME_MAX_CHARS) return 'bad-claims';
    if (typeof raw.exp !== 'number' || !Number.isFinite(raw.exp)) return 'bad-claims';

    return { userId, factoryId, name, exp: raw.exp };
}

export function verifyTicket(
    ticket: string,
    secret: string,
    nowSeconds: number = Math.floor(Date.now() / 1000),
): TicketResult {
    const parts = ticket.split('.');

    if (parts.length !== 2) return { ok: false, reason: 'malformed' };

    const [payload, signature] = parts as [string, string];

    if (payload === '' || signature === '') return { ok: false, reason: 'malformed' };
    if (!signatureMatches(hmacHex(payload, secret), signature)) {
        return { ok: false, reason: 'bad-signature' };
    }

    const claims = claimsOf(payload);

    if (claims === 'malformed' || claims === 'bad-claims') return { ok: false, reason: claims };
    if (claims.exp <= nowSeconds) return { ok: false, reason: 'expired' };

    return { ok: true, claims };
}

/** Mirrors Laravel's issuer for the tests and the smoke script. */
export function signTicket(claims: TicketClaims, secret: string): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    return `${payload}.${hmacHex(payload, secret)}`;
}
