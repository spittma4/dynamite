import { CloseCode } from 'colyseus';
import type { AuthContext, Client } from 'colyseus';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { layoutFixture, levelFixture } from '../../shared/tests/fixtures/index';
import { signTicket } from '../src/auth/ticket';
import type { TicketClaims } from '../src/auth/ticket';
import type { FactoryConfigResponse } from '../src/laravel/api';
import { FactoryRoom } from '../src/rooms/FactoryRoom';
import type { JoinOptions } from '../src/rooms/FactoryRoom';
import { MESSAGE_HANDLERS, dispatchMessage } from '../src/rooms/handlers';
import type { RoomControls } from '../src/rooms/handlers';
import { RECONNECT_SECONDS, copy } from '../src/shared';
import type { LevelConfig, PlayerState, ReportPayload, ScaledLevel } from '../src/shared';
import { createItem, giveToPlayer } from '../src/sim/items';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The room and its dispatch table (contracts §5, §10.7, §11). Everything below
 * `rooms/` is tested on a plain `World`; the room itself is driven through the
 * lifecycle methods Colyseus would call, with the transport stubbed out.
 */

interface Controls extends RoomControls {
    started: number;
    configsTo: string[];
}

function testControls(onStart?: () => void): Controls {
    const controls: Controls = {
        started: 0,
        configsTo: [],
        startDay(): void {
            controls.started++;
            onStart?.();
        },
        sendConfig(sessionId: string): void {
            controls.configsTo.push(sessionId);
        },
    };

    return controls;
}

/** `World.log` is readonly to its own systems; a test is allowed to listen in. */
function captureLog(world: World): string[] {
    const lines: string[] = [];

    (world as unknown as { log: (msg: string) => void }).log = (msg): void => {
        lines.push(msg);
    };

    return lines;
}

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

describe('message dispatch', () => {
    it('applies an input intent and echoes its seq on the next tick', () => {
        const world = makeWorld({ players: 1 });

        dispatchMessage(world, testControls(), 'session-0', 'input', { dx: 1, dy: 0, seq: 4 });

        expect(world.runtime('session-0').intent).toEqual({ dx: 1, dy: 0, seq: 4 });
        expect(world.runtime('session-0').lastInputAt).toBe(world.now);

        world.tick(0.05);

        expect(playerOf(world, 'session-0').seq).toBe(4);
    });

    it('ignores an input whose seq is lower than the last applied', () => {
        const world = makeWorld({ players: 1 });

        dispatchMessage(world, testControls(), 'session-0', 'input', { dx: 1, dy: 0, seq: 4 });
        dispatchMessage(world, testControls(), 'session-0', 'input', { dx: -1, dy: 0, seq: 3 });

        expect(world.runtime('session-0').intent).toEqual({ dx: 1, dy: 0, seq: 4 });
    });

    it('drops an input whose dx is outside -1..1 or whose seq is not a number', () => {
        const world = makeWorld({ players: 1 });
        const logs = captureLog(world);

        dispatchMessage(world, testControls(), 'session-0', 'input', { dx: 2, dy: 0, seq: 1 });
        dispatchMessage(world, testControls(), 'session-0', 'input', { dx: 0, dy: 0, seq: 'x' });

        expect(world.runtime('session-0').intent).toEqual({ dx: 0, dy: 0, seq: 0 });
        expect(logs).toEqual(['input dropped: bad payload', 'input dropped: bad payload']);
    });

    it('drops interact and action while the clock is below stunnedUntil', () => {
        const world = makeWorld({ players: 1 });
        const logs = captureLog(world);

        playerOf(world, 'session-0').stunnedUntil = 5;

        dispatchMessage(world, testControls(), 'session-0', 'interact', { t: 100 });
        dispatchMessage(world, testControls(), 'session-0', 'action', { t: 100 });

        expect(logs).toEqual(['interact dropped: stunned', 'action dropped: stunned']);
        expect(world.runtime('session-0').clockOffsetMs).toBe(0);
    });

    it('updates clockOffsetMs from a timed message and keeps the minimum over the window', () => {
        const world = makeWorld({ players: 1 });

        world.state.clock = 10;

        dispatchMessage(world, testControls(), 'session-0', 'action', { t: 9_000 });

        expect(world.runtime('session-0').clockOffsetMs).toBe(1_000);

        dispatchMessage(world, testControls(), 'session-0', 'action', { t: 9_400 });

        expect(world.runtime('session-0').clockOffsetMs).toBe(600);
        expect(world.inputClock('session-0', 9_600)).toBeCloseTo(10, 6);
    });

    it('answers config through the room and never through the outbox', () => {
        const world = makeWorld({ players: 1 });
        const controls = testControls();

        dispatchMessage(world, controls, 'session-0', 'config', {});

        expect(controls.configsTo).toEqual(['session-0']);
        expect(world.outbox).toEqual([]);
    });

    it('sets the emote bubble and rate-limits a second emote', () => {
        const world = makeWorld({ players: 1 });

        world.state.clock = 3;

        dispatchMessage(world, testControls(), 'session-0', 'emote', { kind: 'stop' });

        expect(playerOf(world, 'session-0').bubble).toBe(copy.emotes.stop);
        expect(playerOf(world, 'session-0').bubbleUntil).toBe(5);

        world.state.clock = 3.2;
        playerOf(world, 'session-0').bubble = '';

        dispatchMessage(world, testControls(), 'session-0', 'emote', { kind: 'help' });

        expect(playerOf(world, 'session-0').bubble).toBe('');
    });

    // `leave` and `mg` used to be F05's placeholders and logged as unimplemented;
    // F05 has landed, so what is left to pin is that neither says anything when
    // there is no station to say it about.
    it('ignores a message from an unknown session and a station message from the floor', () => {
        const world = makeWorld({ players: 1 });
        const logs = captureLog(world);

        dispatchMessage(world, testControls(), 'leave', 'leave', {});
        dispatchMessage(world, testControls(), 'session-0', 'leave', {});
        dispatchMessage(world, testControls(), 'session-0', 'mg', {
            stationId: 'powder-a',
            op: 'charge',
            t: 1,
        });

        expect(logs).toEqual([]);
        expect(playerOf(world, 'session-0').stationId).toBe('');
    });

    it('contains a handler exception instead of letting it kill the room', () => {
        const world = makeWorld({ players: 3 });
        const logs = captureLog(world);
        const controls = testControls(() => {
            throw new Error('boom');
        });

        world.state.host = 'session-0';

        expect(() => dispatchMessage(world, controls, 'session-0', 'start', {})).not.toThrow();
        expect(logs).toEqual(['start handler failed: boom']);
    });

    it('has one handler per client message name', () => {
        expect(Object.keys(MESSAGE_HANDLERS).sort()).toEqual([
            'action',
            'config',
            'emote',
            'input',
            'interact',
            'leave',
            'mg',
            'start',
        ]);
    });
});

/** `chooseHost` and `canStart` themselves are `tests/lobby.test.ts`; this is their dispatch. */
describe('the start message', () => {
    it('toasts the sender the reason it will not start and leaves the phase alone', () => {
        const world = makeWorld({ players: 3 });
        const controls = testControls();

        world.state.host = 'session-0';

        dispatchMessage(world, controls, 'session-1', 'start', {});

        expect(world.outbox).toEqual([
            { to: 'session-1', name: 'toast', payload: { text: 'Only the host can start', kind: 'warn' } },
        ]);

        world.outbox.length = 0;
        world.setConnected('session-2', false);

        dispatchMessage(world, controls, 'session-0', 'start', {});

        expect(world.outbox).toEqual([
            { to: 'session-0', name: 'toast', payload: { text: 'Need 3 players to start', kind: 'warn' } },
        ]);
        expect(controls.started).toBe(0);
        expect(world.state.phase).toBe('lobby');
    });

    it('starts the day for the host once players.min are connected', () => {
        const world = makeWorld({ players: 3 });
        const controls = testControls();

        world.state.host = 'session-0';

        dispatchMessage(world, controls, 'session-0', 'start', {});

        expect(controls.started).toBe(1);
        expect(world.outbox).toEqual([]);
    });
});

const SECRET = 'test-secret';

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function reportFixture(): ReportPayload {
    return {
        day: 4,
        levelKey: 'level-m1-reference',
        grade: 'B',
        score: 71,
        verdict: 'FINE',
        ordersCompleted: 3,
        ordersTotal: 4,
        throughput: 3,
        avgCycleSeconds: 42,
        peakWip: 5,
        wipTimeline: [0, 1, 2],
        kegsMade: 9,
        kegsUsed: 8,
        defects: 1,
        rework: 0,
        kegsExploded: 0,
        fusesStomped: 2,
        fizzles: 1,
        niceSaves: 1,
        truckRides: 0,
        bottleneck: { stationId: 'assembly-a', starvedSeconds: 12, blockedSeconds: 4 },
        stations: [{ id: 'powder-a', utilization: 0.6 }],
        players: [],
        pnl: { revenue: 100, waste: 20, profit: 80, multiplier: 1, coin: 8 },
        materials: { purchased: 9, shipped: 24 },
    };
}

/** Contracts §8: Sandbox is `endsOn: 'never'` with no clock and no book. */
function sandboxLevel(): LevelConfig {
    const level = levelFixture();

    level.day = { ...level.day, shiftSeconds: 0, orderBook: 0, endsOn: 'never' };
    level.players = { min: 1, max: 6 };

    return level;
}

interface FakeClient {
    sessionId: string;
    auth?: unknown;
    sent: Array<[string, unknown]>;
    leftWith: number | null;
    send(name: string, payload: unknown): void;
    leave(code?: number): void;
}

function fakeClient(sessionId: string): FakeClient {
    const client: FakeClient = {
        sessionId,
        sent: [],
        leftWith: null,
        send(name, payload): void {
            client.sent.push([name, payload]);
        },
        leave(code): void {
            client.leftWith = code ?? null;
        },
    };

    return client;
}

interface FakeDeferred {
    resolve(value: unknown): void;
    reject(reason?: unknown): void;
    then: Promise<unknown>['then'];
    catch: Promise<unknown>['catch'];
}

function fakeDeferred(): FakeDeferred {
    let resolve!: (value: unknown) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return {
        resolve,
        reject,
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
    };
}

interface Harness {
    room: FactoryRoom;
    calls: Array<{ url: string; signature: string }>;
    posts: Array<Record<string, unknown>>;
    /** Every `POST /internal/runs`, including the ones that answered 500. */
    runAttempts(): number;
    broadcasts: Array<[string, unknown]>;
    locked: boolean;
    reconnection: FakeDeferred | null;
    /** The grace Colyseus was asked to hold the seat for (contracts §5). */
    reconnectSeconds: number | null;
    step(deltaMs: number): void;
    auth(sessionId: string, options: JoinOptions): unknown;
    join(sessionId: string, options: JoinOptions): FakeClient;
    clientOf(sessionId: string): FakeClient;
    send(client: FakeClient, name: string, payload: unknown): void;
    settled(): Promise<void>;
}

/**
 * A room without a socket: Colyseus' four transport-facing methods are replaced
 * so a test can drive the lifecycle by hand, and Laravel is a stubbed `fetch`.
 * Everything else — the world, the systems, the dispatch table — is the real
 * thing.
 */
async function makeRoom(
    opts: {
        level?: LevelConfig;
        members?: Array<{ userId: string; name: string }>;
        dev?: boolean;
        /** How many `POST /internal/runs` calls answer 500 before the first success. */
        runFailures?: number;
    } = {},
): Promise<Harness> {
    process.env.GAME_SERVER_SECRET = SECRET;
    process.env.LARAVEL_URL = 'http://laravel.test';
    process.env.DEV_ALLOW_NO_TICKET = opts.dev === false ? '0' : '1';

    const config: FactoryConfigResponse = {
        factory: { id: '7', name: 'Kaboom & Sons', day: 4, coin: 120, ownerUserId: '' },
        level: opts.level ?? levelFixture(),
        layout: layoutFixture(),
        members: opts.members ?? [],
    };

    const calls: Array<{ url: string; signature: string }> = [];
    const posts: Array<Record<string, unknown>> = [];
    let runAttempts = 0;

    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const headers = (init?.headers ?? {}) as Record<string, string>;

        calls.push({ url, signature: headers['X-Dynamite-Signature'] ?? '' });

        if (url.includes('/internal/runs')) {
            runAttempts++;

            if (runAttempts <= (opts.runFailures ?? 0)) {
                return new Response('nope', { status: 500 });
            }

            posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

            return new Response(JSON.stringify({ ok: true, runId: 12 }), { status: 201 });
        }

        return new Response(JSON.stringify(config), { status: 200 });
    });

    const room = new FactoryRoom();
    const clients = new Map<string, FakeClient>();
    const broadcasts: Array<[string, unknown]> = [];
    let step: ((deltaMs: number) => void) | null = null;

    const harness: Harness = {
        room,
        calls,
        posts,
        runAttempts: (): number => runAttempts,
        broadcasts,
        locked: false,
        reconnection: null,
        reconnectSeconds: null,
        step(deltaMs): void {
            if (step === null) throw new Error('the room never set a timestep');

            step(deltaMs);
        },
        auth(sessionId, options): unknown {
            return room.onAuth(
                fakeClient(sessionId) as unknown as Client,
                options,
                {} as AuthContext,
            );
        },
        join(sessionId, options): FakeClient {
            const client = fakeClient(sessionId);
            const auth = room.onAuth(client as unknown as Client, options, {} as AuthContext);

            client.auth = auth;
            clients.set(sessionId, client);
            room.clients.push(client as unknown as Client);
            room.onJoin(client as unknown as Client, options, auth);

            return client;
        },
        clientOf(sessionId): FakeClient {
            const client = clients.get(sessionId);

            if (client === undefined) throw new Error(`no client ${sessionId}`);

            return client;
        },
        send(client, name, payload): void {
            const registry = room as unknown as {
                onMessageEvents: { emit(name: string, ...args: unknown[]): void };
            };

            registry.onMessageEvents.emit(name, client, payload);
        },
        async settled(): Promise<void> {
            await new Promise((resolve) => setTimeout(resolve, 0));
        },
    };

    Object.assign(room as unknown as Record<string, unknown>, {
        setTimestep: (callback: (deltaMs: number) => void): void => {
            step = callback;
        },
        lock: async (): Promise<void> => {
            harness.locked = true;
        },
        broadcast: (name: string, payload: unknown): void => {
            broadcasts.push([name, payload]);
        },
        allowReconnection: (_client: unknown, seconds: number): FakeDeferred => {
            harness.reconnectSeconds = seconds;
            harness.reconnection = fakeDeferred();

            return harness.reconnection;
        },
    });

    await room.onCreate({ factoryId: '7' });

    return harness;
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('FactoryRoom lifecycle', () => {
    it('creates a lobby from the Laravel config', async () => {
        const harness = await makeRoom();

        expect(harness.room.maxClients).toBe(10);
        expect(harness.room.state.levelKey).toBe('level-m1-reference');
        expect(harness.room.state.layoutKey).toBe('one-line');
        expect(harness.room.state.phase).toBe('lobby');
        expect(harness.room.state.shiftSeconds).toBe(600);
        expect(harness.room.state.host).toBe('');
        expect(harness.calls[0]?.url).toBe(
            'http://laravel.test/internal/factories/7/config?players=1',
        );
        expect(harness.calls[0]?.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('accepts a ticket for the joined factory and rejects every other one', async () => {
        const harness = await makeRoom({ dev: false });
        const claims = { userId: 5, factoryId: 7, name: 'Sam', exp: nowSeconds() + 60 };
        const ticket = signTicket(claims as unknown as TicketClaims, SECRET);

        expect(harness.auth('s1', { ticket, factoryId: '7' })).toEqual({
            userId: '5',
            name: 'Sam',
            factoryId: '7',
        });
        expect(() => harness.auth('s1', { ticket, factoryId: '8' })).toThrow(
            'ticket factory mismatch',
        );
        expect(() => harness.auth('s1', { ticket: `${ticket}x`, factoryId: '7' })).toThrow(
            'ticket bad-signature',
        );
        expect(() =>
            harness.auth('s1', {
                ticket: signTicket({ ...claims, exp: nowSeconds() - 1 } as unknown as TicketClaims, SECRET),
                factoryId: '7',
            }),
        ).toThrow('ticket expired');
        expect(() => harness.auth('s1', { name: 'Sam', factoryId: '7' })).toThrow('ticket required');
    });

    it('refuses a user who is not a member of the factory', async () => {
        const harness = await makeRoom({ dev: false, members: [{ userId: '9', name: 'Priya' }] });
        const ticket = signTicket(
            { userId: '5', factoryId: '7', name: 'Sam', exp: nowSeconds() + 60 },
            SECRET,
        );

        expect(() => harness.auth('s1', { ticket, factoryId: '7' })).toThrow('not a member');
    });

    it('seats a joining player, names a host and sends the config unsolicited', async () => {
        const harness = await makeRoom();
        const client = harness.join('s1', { name: 'Sam', factoryId: '7' });

        expect(harness.room.state.players.size).toBe(1);
        expect(harness.room.state.host).toBe('s1');
        expect(client.sent).toHaveLength(1);
        expect(client.sent[0]?.[0]).toBe('config');
        expect(client.sent[0]?.[1]).toEqual({
            level: harness.room.world.level,
            layout: harness.room.world.layout,
            copy,
        });
    });

    it('lets the newest tab win when the same user joins twice', async () => {
        const harness = await makeRoom();
        const first = harness.join('s1', { name: 'Sam', factoryId: '7' });

        harness.join('s2', { name: 'Sam', factoryId: '7' });

        expect(first.leftWith).toBe(CloseCode.CONSENTED);
        expect([...harness.room.state.players.keys()]).toEqual(['s2']);
        expect(harness.room.state.host).toBe('s2');
    });

    it('steps the simulation at 20 Hz and caps catch-up at five steps', async () => {
        const harness = await makeRoom();

        harness.step(100);

        expect(harness.room.state.clock).toBeCloseTo(0.1, 6);

        harness.step(1_000);

        expect(harness.room.state.clock).toBeCloseTo(0.35, 6);

        harness.step(50);

        expect(harness.room.state.clock).toBeCloseTo(0.4, 6);
    });

    it('drains fx to everyone and a toast to one client after the step', async () => {
        const harness = await makeRoom();
        const client = harness.join('s1', { name: 'Sam', factoryId: '7' });

        harness.room.world.fx('thunk', 3, 4);
        harness.room.world.toast('s1', 'Only the host can start', 'warn');
        harness.step(50);

        expect(harness.broadcasts).toEqual([['fx', { kind: 'thunk', x: 3, y: 4 }]]);
        expect(client.sent[1]).toEqual([
            'toast',
            { text: 'Only the host can start', kind: 'warn' },
        ]);
        expect(harness.room.world.outbox).toEqual([]);
    });

    it('starts and locks the day when the host sends start with enough players', async () => {
        const harness = await makeRoom();

        harness.join('s1', { name: 'Ann', factoryId: '7' });
        harness.join('s2', { name: 'Bo', factoryId: '7' });
        const third = harness.join('s3', { name: 'Cy', factoryId: '7' });

        harness.step(50);
        harness.send(third, 'start', {});

        expect(harness.room.state.phase).toBe('lobby');

        harness.send(harness.clientOf('s1'), 'start', {});

        expect(harness.room.state.phase).toBe('running');
        expect(harness.room.state.clock).toBe(0);
        expect(harness.locked).toBe(true);
        expect((harness.room.world.level as ScaledLevel).breakpoint.maxPlayers).toBe(6);
    });

    it('ends the day on the clock, broadcasts the report and posts the run', async () => {
        const harness = await makeRoom();

        harness.join('s1', { name: 'Ann', factoryId: '7' });
        harness.join('s2', { name: 'Bo', factoryId: '7' });
        harness.join('s3', { name: 'Cy', factoryId: '7' });
        harness.room.startDay();
        harness.room.world.on('dayEnded', () => harness.room.world.setReport(reportFixture()));

        harness.room.state.clock = 599.95;
        harness.step(50);
        await harness.settled();

        expect(harness.room.state.phase).toBe('ended');
        expect(harness.broadcasts.map(([name]) => name)).toContain('report');
        expect(harness.posts).toHaveLength(1);
        expect(harness.posts[0]).toMatchObject({
            factoryId: '7',
            status: 'ended',
            grade: 'B',
            seed: harness.room.world.seed,
        });
        expect(typeof harness.posts[0]?.startedAt).toBe('string');
    });

    it('posts an abandoned run when the room disposes mid-shift and broadcasts nothing', async () => {
        const harness = await makeRoom();

        harness.join('s1', { name: 'Ann', factoryId: '7' });
        harness.join('s2', { name: 'Bo', factoryId: '7' });
        harness.join('s3', { name: 'Cy', factoryId: '7' });
        harness.room.startDay();
        harness.room.world.setReport(reportFixture());

        await harness.room.onDispose();

        expect(harness.room.state.phase).toBe('ended');
        expect(harness.broadcasts.map(([name]) => name)).not.toContain('report');
        expect(harness.posts[0]).toMatchObject({ status: 'abandoned' });
    });

    it('broadcasts no report and posts no run on a sandbox level', async () => {
        const harness = await makeRoom({ level: sandboxLevel() });

        harness.join('s1', { name: 'Ann', factoryId: '7' });
        harness.room.startDay();
        harness.room.world.setReport(reportFixture());

        harness.step(200);

        expect(harness.room.state.phase).toBe('running');
        expect(harness.room.state.clock).toBeCloseTo(0.2, 6);

        await harness.room.onDispose();

        expect(harness.posts).toEqual([]);
        expect(harness.broadcasts.map(([name]) => name)).not.toContain('report');
    });

    it('retries the run post once after a failure and stores the run on the second try', async () => {
        const harness = await makeRoom({ runFailures: 1 });

        harness.join('s1', { name: 'Ann', factoryId: '7' });
        harness.join('s2', { name: 'Bo', factoryId: '7' });
        harness.join('s3', { name: 'Cy', factoryId: '7' });
        harness.room.startDay();
        harness.room.world.setReport(reportFixture());

        vi.useFakeTimers();

        const finished = harness.room.finishDay('ended');

        // The retry waits 2 s; without the wait the second attempt never happens.
        await vi.advanceTimersByTimeAsync(2_000);
        await finished;

        expect(harness.runAttempts()).toBe(2);
        expect(harness.posts).toHaveLength(1);
        expect(harness.posts[0]).toMatchObject({ factoryId: '7', status: 'ended' });
    });

    it('logs the payload when the run post fails twice', async () => {
        const harness = await makeRoom({ runFailures: 2 });
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

        harness.join('s1', { name: 'Ann', factoryId: '7' });
        harness.join('s2', { name: 'Bo', factoryId: '7' });
        harness.join('s3', { name: 'Cy', factoryId: '7' });
        harness.room.startDay();
        harness.room.world.setReport(reportFixture());

        vi.useFakeTimers();

        const finished = harness.room.finishDay('ended');

        await vi.advanceTimersByTimeAsync(2_000);
        await finished;

        expect(harness.runAttempts()).toBe(2);
        expect(harness.posts).toEqual([]);
        expect(errors).toHaveBeenCalledTimes(1);
        expect(String(errors.mock.calls[0]?.[1])).toContain('"factoryId":"7"');
    });

    it('holds the seat for a dropped client and hands it back on reconnection', async () => {
        const harness = await makeRoom();
        const client = harness.join('s1', { name: 'Ann', factoryId: '7' });
        const leaving = harness.room.onLeave(client as unknown as Client, CloseCode.ABNORMAL_CLOSURE);

        expect(harness.room.world.players.get('s1')?.connected).toBe(false);
        expect(harness.room.state.host).toBe('');
        expect(harness.reconnectSeconds).toBe(RECONNECT_SECONDS);

        harness.reconnection?.resolve(client);
        await leaving;

        expect(harness.room.world.players.get('s1')?.connected).toBe(true);
        expect(harness.room.state.host).toBe('s1');
        expect(client.sent[1]?.[0]).toBe('config');
    });

    it('releases the seat when the reconnection grace expires and on a consented leave', async () => {
        const harness = await makeRoom();
        const dropped = harness.join('s1', { name: 'Ann', factoryId: '7' });
        const quitter = harness.join('s2', { name: 'Bo', factoryId: '7' });
        const leaving = harness.room.onLeave(dropped as unknown as Client, CloseCode.ABNORMAL_CLOSURE);

        harness.reconnection?.reject(new Error('expired'));
        await leaving;

        expect(harness.room.state.players.has('s1')).toBe(false);
        expect(harness.room.state.host).toBe('s2');

        await harness.room.onLeave(quitter as unknown as Client, CloseCode.CONSENTED);

        expect(harness.room.state.players.size).toBe(0);
        expect(harness.room.state.host).toBe('');
    });

    /** Contracts §11: `releaseCarried` is the first link of the disconnect chain. */
    it('leaves a carried item on the floor when it releases the seat', async () => {
        const harness = await makeRoom();
        const quitter = harness.join('s1', { name: 'Ann', factoryId: '7' });
        const world = harness.room.world;
        const player = playerOf(world, 's1');
        const tile = world.tileOf(player.x, player.y);
        const keg = createItem(world, 'keg');

        expect(giveToPlayer(world, keg, 's1')).toBe(true);

        harness.step(50);

        await harness.room.onLeave(quitter as unknown as Client, CloseCode.CONSENTED);

        expect(harness.room.state.players.has('s1')).toBe(false);
        expect(keg.holder).toBe('');
        expect([keg.x, keg.y]).toEqual(tile);
    });
});
