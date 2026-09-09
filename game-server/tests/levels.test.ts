import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env';
import { LaravelUnreachableError, fetchFactoryConfig, postRun } from '../src/laravel/api';
import { loadLocalFactoryConfig, resolveFactoryConfig } from '../src/config/levels';
import { devFactoryConfig } from '../src/config/devLevel';
import { validateLevelConfig, validateLevelOnLayout } from '../src/shared';
import type { RunPayload } from '../src/shared';

const env: Env = {
    PORT: 2567,
    LARAVEL_URL: 'https://dynamite.test',
    GAME_SERVER_SECRET: 'test-secret',
    LEVELS_DIR: fixtures('levels'),
    DEV_ALLOW_NO_TICKET: false,
};

function fixtures(...parts: string[]): string {
    return fileURLToPath(new URL(['fixtures', ...parts].join('/'), import.meta.url));
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function laravelConfig(): unknown {
    const local = loadLocalFactoryConfig(fixtures('levels'), '7');

    return {
        factory: { id: 7, name: 'Kaboom & Sons', day: 4, coin: 120, ownerUserId: 3 },
        level: local.level,
        layout: local.layout,
        members: [{ userId: 3, name: 'Sam' }],
    };
}

describe('loadLocalFactoryConfig', () => {
    it('loads the alphabetically first level file and its layout from LEVELS_DIR', () => {
        const config = loadLocalFactoryConfig(fixtures('levels'), '7');

        expect(config.level.key).toBe('level-01-test');
        expect(config.layout.key).toBe('one-line');
        expect(config.factory).toEqual({
            id: '7',
            name: 'Local factory',
            day: 1,
            coin: 0,
            ownerUserId: '',
        });
        expect(config.members).toEqual([]);
    });

    it('applies the contracts §13 defaults to a level file that omits the optional keys', () => {
        const config = loadLocalFactoryConfig(fixtures('bare', 'levels'), '7');

        expect(config.level.movement).toEqual({
            tilesPerSecond: 4,
            playerRadius: 0.35,
            bumpStaggerSeconds: 0.3,
            floorItemSpeed: 0.4,
            spillSpeed: 0.6,
        });
        expect(config.level.clipboardMemorySeconds).toBe(60);
        expect(config.level.grading.advanceOn).toBe('C');
    });

    it('throws the joined validation errors when the level-on-layout check fails', () => {
        expect(() => loadLocalFactoryConfig(fixtures('broken', 'levels'), '7')).toThrow(
            /powder-a\.workTiles: 0,0 is a wall/,
        );
    });

    it('falls back to the built-in dev level when the levels directory has none', () => {
        const config = loadLocalFactoryConfig(fixtures('empty'), '7');

        expect(config.level.key).toBe(devFactoryConfig('7').level.key);
    });
});

describe('the built-in dev level', () => {
    it('validates as a level, a layout and a level on that layout', () => {
        const { level, layout } = devFactoryConfig('7');
        const result = validateLevelConfig(level);

        expect(result.ok ? [] : result.errors).toEqual([]);
        expect(validateLevelOnLayout(level, layout)).toEqual([]);
        expect([layout.width, layout.height]).toEqual([28, 18]);
    });
});

describe('fetchFactoryConfig', () => {
    it('returns the Laravel config with ids coerced to strings', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(laravelConfig()));
        const config = await fetchFactoryConfig(env, '7', 3, fetchImpl as unknown as typeof fetch);

        expect(config.factory.id).toBe('7');
        expect(config.factory.ownerUserId).toBe('3');
        expect(config.members).toEqual([{ userId: '3', name: 'Sam' }]);
    });

    it('sends the X-Dynamite-Signature header computed over the path without the query', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(laravelConfig()));

        await fetchFactoryConfig(env, '7', 3, fetchImpl as unknown as typeof fetch);

        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];

        expect(url).toBe('https://dynamite.test/internal/factories/7/config?players=3');
        expect((init.headers as Record<string, string>)['X-Dynamite-Signature']).toBe(
            '08168fc3b84dbeb3ab8d5e8e1606b05c8a842e143447f2567126a0ae847ef777',
        );
    });

    it('raises LaravelUnreachableError on a non-2xx answer', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: 'not_found' }, 404));

        await expect(
            fetchFactoryConfig(env, '7', 3, fetchImpl as unknown as typeof fetch),
        ).rejects.toBeInstanceOf(LaravelUnreachableError);
    });

    it('raises LaravelUnreachableError when fetch itself throws', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        });

        await expect(
            fetchFactoryConfig(env, '7', 3, fetchImpl as unknown as typeof fetch),
        ).rejects.toBeInstanceOf(LaravelUnreachableError);
    });
});

describe('postRun', () => {
    const run = { factoryId: '7', seed: 1, status: 'ended' } as unknown as RunPayload;

    it('treats 201 on the insert and 200 on an idempotent retry as success', async () => {
        const created = vi.fn(async () => jsonResponse({ ok: true, runId: 9 }, 201));
        const replayed = vi.fn(async () => jsonResponse({ ok: true, runId: 9 }, 200));

        expect(await postRun(env, run, created as unknown as typeof fetch)).toEqual({
            ok: true,
            runId: 9,
        });
        expect(await postRun(env, run, replayed as unknown as typeof fetch)).toEqual({
            ok: true,
            runId: 9,
        });
    });

    it('signs the body it sends', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, runId: 9 }, 201));

        await postRun(env, run, fetchImpl as unknown as typeof fetch);

        const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        const body = init.body as string;

        expect(JSON.parse(body)).toEqual(run);
        expect((init.headers as Record<string, string>)['X-Dynamite-Signature']).toHaveLength(64);
    });

    it('raises LaravelUnreachableError on a 422', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ message: 'invalid' }, 422));

        await expect(
            postRun(env, run, fetchImpl as unknown as typeof fetch),
        ).rejects.toBeInstanceOf(LaravelUnreachableError);
    });
});

describe('resolveFactoryConfig', () => {
    it('prefers Laravel when it answers', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(laravelConfig()));
        const { config, source } = await resolveFactoryConfig(
            env,
            '7',
            3,
            fetchImpl as unknown as typeof fetch,
        );

        expect(source).toBe('laravel');
        expect(config.factory.name).toBe('Kaboom & Sons');
    });

    it('falls back to the local level when Laravel is unreachable', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ error: 'not_found' }, 404));
        const { config, source } = await resolveFactoryConfig(
            env,
            '7',
            3,
            fetchImpl as unknown as typeof fetch,
        );

        expect(source).toBe('local');
        expect(config.level.key).toBe('level-01-test');
    });

    it('validates what Laravel returned and throws the joined errors', async () => {
        const broken = laravelConfig() as { level: { stations: { workTiles: number[][] }[] } };
        broken.level.stations[0]!.workTiles = [[0, 0]];
        const fetchImpl = vi.fn(async () => jsonResponse(broken));

        await expect(
            resolveFactoryConfig(env, '7', 3, fetchImpl as unknown as typeof fetch),
        ).rejects.toThrow(/is a wall/);
    });
});
