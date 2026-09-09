import { randomInt } from 'node:crypto';

import { CloseCode, Room } from 'colyseus';
import type { AuthContext, Client, Deferred } from 'colyseus';

import { NAME_MAX_CHARS, verifyTicket } from '../auth/ticket';
import { resolveFactoryConfig } from '../config/levels';
import { loadEnv } from '../env';
import type { Env } from '../env';
import { postRun } from '../laravel/api';
import {
    ClientMsg,
    FactoryState,
    RECONNECT_SECONDS,
    ServerMsg,
    TICK_SECONDS,
    copy,
    scaleLevel,
} from '../shared';
import type { ConfigMsg, RunPayload } from '../shared';
import { releaseCarried } from '../sim/items';
import { onPlayerLeft } from '../sim/stations';
import { World } from '../sim/World';
import type { AuthPayload, DayEndStatus } from '../sim/World';
import { SYSTEMS } from '../sim/systems';
import { dispatchMessage } from './handlers';
import type { ClientMsgName, RoomControls } from './handlers';
import { chooseHost } from './lobby';

/**
 * The only Colyseus-aware file in the server (contracts §5, §10.7, §11). It
 * owns the socket lifecycle and the fixed step; every rule it needs lives in
 * `World`, `SYSTEMS` or `handlers.ts`, so the simulation can be tested without
 * a transport and this file stays a wiring loom.
 */

export type JoinOptions = { ticket: string; factoryId: string } | { name: string; factoryId: string };

/** Contracts §2: 20 Hz with catch-up capped, so a stalled process never fast-forwards a shift. */
const MAX_STEPS_PER_CALLBACK = 5;
const STEP_MS = TICK_SECONDS * 1000;
/** The lobby floor. The seat count that matters is `scaleLevel`'s, at `start`. */
const LOBBY_PLAYERS_HINT = 1;
const POST_RUN_RETRY_SECONDS = 2;

const MESSAGE_NAMES = Object.keys(ClientMsg) as ClientMsgName[];

function optionOf(options: unknown, key: string): unknown {
    if (typeof options !== 'object' || options === null) return undefined;

    return (options as Record<string, unknown>)[key];
}

/** A dev join has no user id of its own; the name is all we know them by. */
function devUserId(name: string): string {
    return `dev-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export class FactoryRoom extends Room<{ state: FactoryState }> {
    state = new FactoryState();
    world!: World;

    private env!: Env;
    private accumulatorMs = 0;
    private startedAt = '';
    private dayFinished = false;
    private readonly reconnections = new Map<string, Deferred<Client>>();

    private readonly controls: RoomControls = {
        startDay: (): void => this.startDay(),
        sendConfig: (sessionId: string): void => {
            this.clients.get(sessionId)?.send(ServerMsg.config, this.configPayload());
        },
    };

    async onCreate(options: { factoryId: string }): Promise<void> {
        this.env = loadEnv();

        const factoryId = String(options?.factoryId ?? '');
        const { config, source } = await resolveFactoryConfig(
            this.env,
            factoryId,
            LOBBY_PLAYERS_HINT,
        );

        if (source === 'local') {
            console.warn(`factory ${factoryId}: running on a local level, members unchecked`);
        }

        this.maxClients = config.level.players.max;
        this.world = new World({
            config,
            state: this.state,
            seed: randomInt(2 ** 31),
            log: (msg) => console.debug(`factory ${factoryId}: ${msg}`),
        });

        for (const system of SYSTEMS) this.world.registerSystem(system);

        this.world.init();

        for (const name of MESSAGE_NAMES) {
            this.onMessage(name, (client: Client, payload: unknown) => {
                dispatchMessage(this.world, this.controls, client.sessionId, name, payload);
            });
        }

        this.onMessage('*', (client: Client, type: string | number) => {
            this.world.log(`unknown message ${String(type)} from ${client.sessionId}`);
        });

        this.setTimestep((deltaMs: number) => this.pump(deltaMs), STEP_MS);
    }

    onAuth(_client: Client, options: JoinOptions, _context?: AuthContext): AuthPayload {
        const factoryId = String(optionOf(options, 'factoryId') ?? '');
        const ticket = optionOf(options, 'ticket');

        if (typeof ticket === 'string' && ticket !== '') {
            const result = verifyTicket(ticket, this.env.GAME_SERVER_SECRET);

            if (!result.ok) throw new Error(`ticket ${result.reason}`);
            if (result.claims.factoryId !== factoryId) throw new Error('ticket factory mismatch');

            this.requireMembership(result.claims.userId);

            return {
                userId: result.claims.userId,
                name: result.claims.name,
                factoryId: result.claims.factoryId,
            };
        }

        const named = optionOf(options, 'name');
        const name = typeof named === 'string' ? named.trim() : '';

        if (this.env.DEV_ALLOW_NO_TICKET && name.length >= 1 && name.length <= NAME_MAX_CHARS) {
            return { userId: devUserId(name), name, factoryId };
        }

        throw new Error('ticket required');
    }

    onJoin(client: Client, _options: JoinOptions, auth: AuthPayload): void {
        this.evictOtherTabs(client.sessionId, auth.userId);
        this.world.addPlayer(client.sessionId, auth);
        this.recomputeHost();
        client.send(ServerMsg.config, this.configPayload());
    }

    async onLeave(client: Client, code?: number): Promise<void> {
        const sessionId = client.sessionId;

        if (!this.world.players.has(sessionId)) return;

        if (code !== CloseCode.CONSENTED) {
            this.world.setConnected(sessionId, false);
            this.recomputeHost();

            try {
                const deferred = this.allowReconnection(client, RECONNECT_SECONDS);

                this.reconnections.set(sessionId, deferred);

                const reconnected = await deferred;

                this.reconnections.delete(sessionId);
                this.world.setConnected(sessionId, true);
                this.recomputeHost();
                reconnected.send(ServerMsg.config, this.configPayload());

                return;
            } catch {
                this.reconnections.delete(sessionId);
            }
        }

        // `onLeave` runs again with FAILED_TO_RECONNECT, so the release is idempotent.
        if (this.world.players.has(sessionId)) this.releaseSeat(sessionId);

        this.recomputeHost();
    }

    async onDispose(): Promise<void> {
        if (this.world === undefined || this.state.phase !== 'running') return;

        this.world.requestEnd('abandoned', 'abandoned');
        this.world.tick(0);
        this.drainOutbox();

        await this.finishDay('abandoned');
    }

    /** Contracts §10.7: the seat count at the whistle is the one the day is scaled for. */
    startDay(): void {
        this.startedAt = new Date().toISOString();
        this.world.startDay(scaleLevel(this.world.level, this.connectedCount()));

        // Reconnection uses the held seat rather than matchmaking, so the lock
        // costs a returning player nothing. The room never unlocks.
        this.lock().catch((error: unknown) => this.world.log(`lock failed: ${String(error)}`));
    }

    async finishDay(status: DayEndStatus): Promise<void> {
        if (this.dayFinished) return;

        this.dayFinished = true;

        if (this.world.level.day.endsOn === 'never') {
            this.world.log('sandbox day ended; no report, no run');

            return;
        }

        const report = this.world.report;

        if (report === null) {
            this.world.log('no report system registered; run not posted');

            return;
        }

        // Nobody is left to read a report for a room that is being disposed.
        if (status !== 'abandoned') this.broadcast(ServerMsg.report, report);

        await this.storeRun({
            ...report,
            factoryId: String(this.world.factory.id),
            seed: this.world.seed,
            startedAt: this.startedAt,
            endedAt: new Date().toISOString(),
            status,
        });
    }

    /** Wall-clock in, whole fixed steps out; the remainder past the cap is dropped. */
    private pump(deltaMs: number): void {
        this.accumulatorMs += deltaMs;

        for (let step = 0; step < MAX_STEPS_PER_CALLBACK && this.accumulatorMs >= STEP_MS; step++) {
            this.accumulatorMs -= STEP_MS;
            this.step();
        }

        if (this.accumulatorMs >= STEP_MS) this.accumulatorMs = 0;
    }

    private step(): void {
        this.world.tick(TICK_SECONDS);
        this.drainOutbox();

        const end = this.world.endRequested;

        if (end !== null && !this.dayFinished) {
            void this.finishDay(end.status);
        }
    }

    private drainOutbox(): void {
        for (const message of this.world.outbox) {
            if (message.to === 'all') this.broadcast(message.name, message.payload);
            else this.clients.get(message.to)?.send(message.name, message.payload);
        }

        this.world.outbox.length = 0;
    }

    private configPayload(): ConfigMsg {
        return { level: this.world.level, layout: this.world.layout, copy };
    }

    private connectedCount(): number {
        let connected = 0;

        for (const runtime of this.world.players.values()) {
            if (runtime.connected) connected++;
        }

        return connected;
    }

    private recomputeHost(): void {
        this.state.host = chooseHost(
            this.world.players,
            this.state.players,
            this.world.factory.ownerUserId,
        );
    }

    /** Membership is Laravel's list; a local level has none and lets anyone in. */
    private requireMembership(userId: string): void {
        if (this.env.DEV_ALLOW_NO_TICKET || this.world.members.length === 0) return;
        if (this.world.members.some((member) => member.userId === userId)) return;

        throw new Error('not a member');
    }

    /** One account, one seat: a second tab takes the first one's place. */
    private evictOtherTabs(sessionId: string, userId: string): void {
        for (const [held, player] of this.state.players.entries()) {
            if (held === sessionId || player.userId !== userId) continue;

            this.reconnections.get(held)?.reject();
            this.reconnections.delete(held);
            this.clients.get(held)?.leave(CloseCode.CONSENTED);
            this.releaseSeat(held);
        }
    }

    /** Contracts §11: the disconnect chain. F06 appends its call above `removePlayer`. */
    private releaseSeat(sessionId: string): void {
        releaseCarried(this.world, sessionId);
        onPlayerLeft(this.world, sessionId);
        this.world.removePlayer(sessionId);
    }

    private async storeRun(run: RunPayload): Promise<void> {
        try {
            await postRun(this.env, run);

            return;
        } catch (error) {
            this.world.log(`run post failed, retrying: ${String(error)}`);
        }

        await sleep(POST_RUN_RETRY_SECONDS);

        try {
            await postRun(this.env, run);
        } catch (error) {
            // The room owes nothing to the response, so the log is the last resort.
            console.error(`run post failed twice: ${String(error)}`, JSON.stringify(run));
        }
    }
}
