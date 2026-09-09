import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/env';

const FULL = {
    PORT: '2567',
    LARAVEL_URL: 'https://dynamite.test',
    GAME_SERVER_SECRET: 'shhh',
    LEVELS_DIR: '../config/game/levels',
    DEV_ALLOW_NO_TICKET: '0',
};

describe('loadEnv', () => {
    it('reads the contract keys and coerces PORT and the dev flag', () => {
        expect(loadEnv({ ...FULL, DEV_ALLOW_NO_TICKET: '1' })).toEqual({
            PORT: 2567,
            LARAVEL_URL: 'https://dynamite.test',
            GAME_SERVER_SECRET: 'shhh',
            LEVELS_DIR: '../config/game/levels',
            DEV_ALLOW_NO_TICKET: true,
        });
    });

    it('falls back to the documented defaults', () => {
        const env = loadEnv({ GAME_SERVER_SECRET: 'shhh' });

        expect(env.PORT).toBe(2567);
        expect(env.LARAVEL_URL).toBe('http://localhost');
        expect(env.LEVELS_DIR).toBe('../config/game/levels');
        expect(env.DEV_ALLOW_NO_TICKET).toBe(false);
    });

    it('throws a message naming GAME_SERVER_SECRET when it is missing and tickets are required', () => {
        expect(() => loadEnv({ ...FULL, GAME_SERVER_SECRET: '' })).toThrow(/GAME_SERVER_SECRET/);
    });

    it('allows a missing secret only when DEV_ALLOW_NO_TICKET is 1', () => {
        const env = loadEnv({ ...FULL, GAME_SERVER_SECRET: '', DEV_ALLOW_NO_TICKET: '1' });

        expect(env.GAME_SERVER_SECRET).toBe('');
        expect(env.DEV_ALLOW_NO_TICKET).toBe(true);
    });

    it('rejects a PORT that is not a number', () => {
        expect(() => loadEnv({ ...FULL, PORT: 'http' })).toThrow(/PORT/);
    });
});
