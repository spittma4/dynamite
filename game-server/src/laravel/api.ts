import type { Env } from '../env';
import type { LayoutConfig, LevelConfig, RunPayload } from '../shared';
import { signRequest } from './signature';

/**
 * Contracts §5. Laravel hands the level config over verbatim; validating it,
 * applying the §13 defaults and scaling it for the seat count all happen here
 * in Node (`config/levels.ts`), so this module only speaks HTTP.
 */
export interface FactoryConfigResponse {
    factory: { id: string; name: string; day: number; coin: number; ownerUserId: string };
    level: LevelConfig;
    layout: LayoutConfig;
    members: Array<{ userId: string; name: string }>;
}

/**
 * Anything that stops Laravel answering with a config: a refused socket, a
 * non-2xx, or a body that is not the JSON we asked for. One error type, because
 * the caller's response to all three is the same — use the local level.
 */
export class LaravelUnreachableError extends Error {
    constructor(
        message: string,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'LaravelUnreachableError';
    }
}

const SIGNATURE_HEADER = 'X-Dynamite-Signature';

/** Ids are JSON integers on the wire and strings everywhere inside Node. */
function asId(value: unknown): string {
    return String(value ?? '');
}

async function readJson(response: Response, path: string): Promise<unknown> {
    try {
        return await response.json();
    } catch (cause) {
        throw new LaravelUnreachableError(`${path} did not answer with JSON`, cause);
    }
}

async function call(
    env: Env,
    method: 'GET' | 'POST',
    path: string,
    query: string,
    body: string,
    fetchImpl: typeof fetch,
): Promise<Response> {
    const url = `${env.LARAVEL_URL}${path}${query}`;
    const headers: Record<string, string> = {
        Accept: 'application/json',
        [SIGNATURE_HEADER]: signRequest(method, path, body, env.GAME_SERVER_SECRET),
    };

    if (method === 'POST') headers['Content-Type'] = 'application/json';

    try {
        return await fetchImpl(url, { method, headers, ...(method === 'POST' ? { body } : {}) });
    } catch (cause) {
        throw new LaravelUnreachableError(`${method} ${path} failed`, cause);
    }
}

export async function fetchFactoryConfig(
    env: Env,
    factoryId: string,
    players: number,
    fetchImpl: typeof fetch = fetch,
): Promise<FactoryConfigResponse> {
    const path = `/internal/factories/${factoryId}/config`;
    const response = await call(env, 'GET', path, `?players=${players}`, '', fetchImpl);

    if (!response.ok) {
        throw new LaravelUnreachableError(`GET ${path} answered ${response.status}`);
    }

    const body = (await readJson(response, path)) as FactoryConfigResponse;

    if (body?.factory === undefined || body.level === undefined || body.layout === undefined) {
        throw new LaravelUnreachableError(`GET ${path} answered without a config`);
    }

    return {
        factory: {
            id: asId(body.factory.id),
            name: body.factory.name,
            day: body.factory.day,
            coin: body.factory.coin,
            ownerUserId: asId(body.factory.ownerUserId),
        },
        level: body.level,
        layout: body.layout,
        members: (body.members ?? []).map((m) => ({ userId: asId(m.userId), name: m.name })),
    };
}

/**
 * `201` is the insert and `200` the idempotent replay of a run Laravel already
 * stored, so a retry after a timeout is a success rather than a duplicate.
 */
export async function postRun(
    env: Env,
    run: RunPayload,
    fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; runId: number }> {
    const path = '/internal/runs';
    const body = JSON.stringify(run);
    const response = await call(env, 'POST', path, '', body, fetchImpl);

    if (response.status !== 200 && response.status !== 201) {
        throw new LaravelUnreachableError(`POST ${path} answered ${response.status}`);
    }

    const parsed = (await readJson(response, path)) as { runId?: number };

    return { ok: true, runId: Number(parsed.runId ?? 0) };
}
