import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';

import { FactoryState, INPUT_HEARTBEAT_MS, TICK_SECONDS } from '../src/shared';
import type { Axis } from '../src/shared';

/**
 * Bots for a server with no client yet (F03 verification step 2). They join the
 * dev way — `{ name, factoryId }`, so the server needs `DEV_ALLOW_NO_TICKET=1` —
 * walk a square, and one of them starts the shift, which is enough to read the
 * three numbers that matter off the printout: 4 tiles/s of travel, the `seq`
 * echo coming back, and the phase turning over at the whistle.
 *
 *   npm run smoke -- --factory 7 --players 3 --seconds 30
 */

const BOT_NAMES = ['Ann', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo'];
/** One leg of the square, in seconds. Four legs walk it back to where it began. */
const LEG_SECONDS = 2;
const SQUARE: ReadonlyArray<{ dx: Axis; dy: Axis }> = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 },
];

interface Options {
    factory: string;
    players: number;
    seconds: number;
    url: string;
}

interface Bot {
    name: string;
    room: Room<unknown, FactoryState>;
    seq: number;
}

function option(argv: string[], name: string, fallback: string): string {
    const at = argv.indexOf(`--${name}`);

    return at >= 0 ? (argv[at + 1] ?? fallback) : fallback;
}

function parseOptions(argv: string[]): Options {
    return {
        factory: option(argv, 'factory', '7'),
        players: Number(option(argv, 'players', '3')),
        seconds: Number(option(argv, 'seconds', '30')),
        url: option(argv, 'url', process.env.SMOKE_URL ?? 'ws://localhost:2567'),
    };
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function line(bot: Bot): string {
    const me = bot.room.state.players.get(bot.room.sessionId);

    if (me === undefined) return `${bot.name}: no seat`;

    const at = `x=${me.x.toFixed(2)} y=${me.y.toFixed(2)}`;

    return `${bot.name}: ${at} seq=${me.seq}/${bot.seq} speed=${me.speed.toFixed(2)}`;
}

async function main(): Promise<void> {
    const opts = parseOptions(process.argv.slice(2));
    const client = new Client(opts.url);
    const bots: Bot[] = [];

    for (let i = 0; i < opts.players; i++) {
        const name = BOT_NAMES[i] ?? `Bot${i}`;
        const room = (await client.joinOrCreate(
            'factory',
            { name, factoryId: opts.factory },
            FactoryState,
        )) as unknown as Room<unknown, FactoryState>;

        bots.push({ name, room, seq: 0 });
        console.log(`${name} joined ${room.roomId} as ${room.sessionId}`);
    }

    const first = bots[0];

    if (first === undefined) throw new Error('--players must be at least 1');

    let phase = '';

    // The host is whoever the server named; only that seat's `start` is obeyed.
    first.room.onStateChange(() => {
        if (first.room.state.phase === phase) return;

        phase = first.room.state.phase;
        console.log(`phase → ${phase} (clock ${first.room.state.clock.toFixed(2)})`);
    });

    const heartbeat = setInterval(() => {
        const leg = SQUARE[Math.floor(Date.now() / (LEG_SECONDS * 1000)) % SQUARE.length];

        if (leg === undefined) return;

        for (const bot of bots) bot.room.send('input', { ...leg, seq: ++bot.seq });
    }, INPUT_HEARTBEAT_MS);

    const report = setInterval(() => {
        for (const bot of bots) console.log(line(bot));
    }, 1_000);

    // A round trip plus a tick, so the seats and the host are settled first.
    await wait(500 + TICK_SECONDS * 1000);

    const host = first.room.state.host;
    const starter = bots.find((bot) => bot.room.sessionId === host) ?? first;

    console.log(`${starter.name} sends start`);
    starter.room.send('start', {});

    await wait(opts.seconds * 1000);

    clearInterval(heartbeat);
    clearInterval(report);

    for (const bot of bots) await bot.room.leave(true);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
