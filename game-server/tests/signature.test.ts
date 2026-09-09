import { describe, expect, it } from 'vitest';

import { signRequest } from '../src/laravel/signature';

/**
 * The vectors come from PHP's `hash_hmac('sha256', METHOD.path.body, secret)`,
 * which is what `App\Game\InternalSignature` computes — the seam only holds if
 * both sides build the same canonical string.
 */
const SECRET = 'test-secret';

describe('signRequest', () => {
    it('signs uppercase method + path + body with hmac-sha256 lowercase hex', () => {
        expect(signRequest('POST', '/internal/runs', '{"ok":true}', SECRET)).toBe(
            'bd885d593f3639eeb483c33adca375068dbb63c1bd203e7ed50b3596920c38fd',
        );
    });

    it('signs a GET with an empty body', () => {
        expect(signRequest('GET', '/internal/factories/7/config', '', SECRET)).toBe(
            '08168fc3b84dbeb3ab8d5e8e1606b05c8a842e143447f2567126a0ae847ef777',
        );
    });

    it('excludes the query string from the signed path', () => {
        const withQuery = signRequest('GET', '/internal/factories/7/config?players=3', '', SECRET);

        expect(withQuery).toBe('08168fc3b84dbeb3ab8d5e8e1606b05c8a842e143447f2567126a0ae847ef777');
    });
});
