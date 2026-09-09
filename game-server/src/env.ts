/**
 * Contracts §2. Read once at boot and passed around explicitly, so nothing
 * deeper than `index.ts` ever touches `process.env` — a test can hand any
 * module a different environment without mutating the process.
 */
export interface Env {
    PORT: number;
    LARAVEL_URL: string;
    GAME_SERVER_SECRET: string;
    LEVELS_DIR: string;
    DEV_ALLOW_NO_TICKET: boolean;
}

const DEFAULT_PORT = 2567;
const DEFAULT_LARAVEL_URL = 'http://localhost';
const DEFAULT_LEVELS_DIR = '../config/game/levels';

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
    const devAllowNoTicket = source.DEV_ALLOW_NO_TICKET === '1';
    const rawPort = source.PORT ?? '';
    const port = rawPort === '' ? DEFAULT_PORT : Number(rawPort);

    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`PORT must be a positive integer, got ${JSON.stringify(rawPort)}`);
    }

    const secret = source.GAME_SERVER_SECRET ?? '';

    // Without the secret the server can neither verify a ticket nor sign a call
    // to Laravel, so refusing to boot is kinder than a room that 401s later.
    if (secret === '' && !devAllowNoTicket) {
        throw new Error('GAME_SERVER_SECRET is not set (set DEV_ALLOW_NO_TICKET=1 for a local dev server)');
    }

    return {
        PORT: port,
        LARAVEL_URL: source.LARAVEL_URL ?? DEFAULT_LARAVEL_URL,
        GAME_SERVER_SECRET: secret,
        LEVELS_DIR: source.LEVELS_DIR ?? DEFAULT_LEVELS_DIR,
        DEV_ALLOW_NO_TICKET: devAllowNoTicket,
    };
}
