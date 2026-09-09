import { createHmac } from 'node:crypto';

/**
 * Contracts §5: `METHOD + pathname + rawBody`, concatenated with no separators
 * and no query string, so neither side has to agree on parameter order. The
 * PHP half is `App\Game\InternalSignature::sign`.
 */
export function signRequest(
    method: 'GET' | 'POST',
    path: string,
    body: string,
    secret: string,
): string {
    const pathname = path.split('?')[0] ?? path;

    return createHmac('sha256', secret)
        .update(method.toUpperCase() + pathname + body)
        .digest('hex');
}
