import 'dotenv/config';

import { defineServer } from 'colyseus';

import { loadEnv } from './env';
import { rooms } from './rooms/index';

/**
 * Boot (contracts §2, §5). The room definitions live in `rooms/index.ts` so
 * they can be asserted without a socket; `/healthz` is the only HTTP route the
 * game server owns — everything else it needs from Laravel it fetches.
 */

/** Express ships no types of its own, so the route takes the shape it uses. */
interface HealthApp {
    get(path: string, handler: (req: unknown, res: { json(body: { ok: true }): unknown }) => void): void;
}

const env = loadEnv();

const server = defineServer({
    rooms,
    gracefullyShutdown: true,
    express: (app: HealthApp) => {
        app.get('/healthz', (_req, res) => res.json({ ok: true }));
    },
});

await server.listen(env.PORT);

console.log(`dynamite game-server :${env.PORT}`);
