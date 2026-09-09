import { Callbacks, Client, CloseCode, type Room } from '@colyseus/sdk';
import {
    type ActionMsg,
    type ConfigMsg,
    type ConfigRequestMsg,
    type Copy,
    type EmoteMsg,
    FactoryState,
    type FxMsg,
    type InputMsg,
    type InteractMsg,
    type LayoutConfig,
    type LeaveMsg,
    type LevelConfig,
    type MgMsg,
    type PlayerState,
    type ReportPayload,
    type StartMsg,
    type ToastMsg,
} from '@shared';

import { PING_INTERVAL_MS } from '../constants';
import type { MountData } from '../mount';
import { ServerClock } from './ServerClock';

/**
 * The room seat (F04 §1). Everything that crosses the wire goes through here so
 * the scene never touches the SDK: one place decides when a ticket is needed,
 * when the stored token is worth trying, and when it has to be thrown away.
 */

export type ConnectionStatus = 'connecting' | 'joined' | 'reconnecting' | 'closed';

export interface ClientConfig {
    level: LevelConfig;
    layout: LayoutConfig;
    copy: Copy;
}

export interface TicketResponse {
    ticket: string;
    ws_url: string;
    room: 'factory';
}

export interface ConnectionEvents {
    status: (status: ConnectionStatus, detail: string) => void;
    config: (config: ClientConfig) => void;
    fx: (m: FxMsg) => void;
    toast: (m: ToastMsg) => void;
    report: (r: ReportPayload) => void;
}

/** One key per factory: the next day is a different room in the same tab. */
export function reconnectKey(factoryId: string): string {
    return `dynamite.reconnect.${factoryId}`;
}

/**
 * The next input seq to send, given the local counter and `PlayerState.seq` —
 * the last seq the seat actually applied. A reload resumes a seat the server
 * kept, and the server drops any input whose seq went backwards, so a page that
 * counted from zero would be ignored for as long as it took to catch up.
 */
export function nextInputSeq(local: number, applied: number | undefined): number {
    return Math.max(local, applied ?? 0) + 1;
}

/** What the player is told the socket did. Anything unnamed keeps its number. */
export function closeDetail(code: number): string {
    if (code === CloseCode.FAILED_TO_RECONNECT) return 'FAILED_TO_RECONNECT';
    if (code === CloseCode.SERVER_SHUTDOWN) return 'SERVER_SHUTDOWN';

    return `code ${code}`;
}

export async function fetchTicket(mount: MountData): Promise<TicketResponse> {
    const response = await fetch(mount.ticketUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': mount.csrf,
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ factory_id: mount.factoryId }),
    });

    if (!response.ok) throw new Error(`ticket: HTTP ${response.status}`);

    return (await response.json()) as TicketResponse;
}

export class Connection {
    readonly room: Room<FactoryState>;
    readonly callbacks: ReturnType<typeof Callbacks.get<FactoryState>>;
    readonly sessionId: string;
    readonly clock = new ServerClock();

    private readonly listeners = new Map<string, Set<unknown>>();
    private readonly storageKey: string;
    private readonly patchTimes: number[] = [];
    private readonly tickTimes: number[] = [];

    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private currentConfig: ClientConfig | null = null;
    private currentStatus: ConnectionStatus = 'connecting';
    private rtt = 0;
    private lastClockSeen = -1;

    private constructor(room: Room<FactoryState>, mount: MountData) {
        this.room = room;
        this.callbacks = Callbacks.get<FactoryState>(room);
        this.sessionId = room.sessionId;
        this.storageKey = reconnectKey(mount.factoryId);

        this.storeToken();
        this.wire();
    }

    /**
     * Resolves once the seat is real: the first state sync has landed and the
     * server has answered with the config bundle. Phaser starts after this, so
     * `Factory.create()` never has to cope with a half-built world.
     */
    static async join(mount: MountData): Promise<Connection> {
        const stored = readStoredToken(reconnectKey(mount.factoryId));
        let room: Room<FactoryState> | null = null;

        if (stored) {
            try {
                room = (await new Client(mount.wsUrl).reconnect(
                    stored,
                    FactoryState,
                )) as unknown as Room<FactoryState>;
            } catch {
                removeStoredToken(reconnectKey(mount.factoryId));
            }
        }

        if (!room) {
            const ticket = await fetchTicket(mount);

            // Laravel's `ws_url` is the intent; the mount value only has to serve
            // the reconnect above, which runs before any ticket exists.
            room = (await new Client(ticket.ws_url || mount.wsUrl).joinOrCreate(
                'factory',
                { ticket: ticket.ticket, factoryId: mount.factoryId },
                FactoryState,
            )) as unknown as Room<FactoryState>;
        }

        const connection = new Connection(room, mount);

        await connection.ready();

        return connection;
    }

    get status(): ConnectionStatus {
        return this.currentStatus;
    }

    get rttMs(): number {
        return this.rtt;
    }

    get config(): ClientConfig {
        if (!this.currentConfig) throw new Error('connection: no config reply yet');

        return this.currentConfig;
    }

    get state(): FactoryState {
        return this.room.state;
    }

    get me(): PlayerState | undefined {
        return this.room.state.players.get(this.sessionId);
    }

    /** `onStateChange` calls in the last second — the patch cadence, not the tick. */
    get patchesPerSecond(): number {
        return countRecent(this.patchTimes);
    }

    /** Distinct `state.clock` values in the last second: the server's real tick. */
    get ticksPerSecond(): number {
        return countRecent(this.tickTimes);
    }

    send(name: 'input', payload: InputMsg): void;
    send(name: 'interact', payload: InteractMsg): void;
    send(name: 'action', payload: ActionMsg): void;
    send(name: 'mg', payload: MgMsg): void;
    send(name: 'leave', payload: LeaveMsg): void;
    send(name: 'emote', payload: EmoteMsg): void;
    send(name: 'start', payload: StartMsg): void;
    send(name: 'config', payload: ConfigRequestMsg): void;
    send(name: string, payload: object): void {
        this.room.send(name, payload);
    }

    on<E extends keyof ConnectionEvents>(event: E, fn: ConnectionEvents[E]): () => void {
        const set = this.listeners.get(event) ?? new Set<unknown>();

        set.add(fn);
        this.listeners.set(event, set);

        return () => {
            set.delete(fn);
        };
    }

    private wire(): void {
        this.room.onMessage<ConfigMsg>('config', (m) => {
            this.currentConfig = { level: m.level, layout: m.layout, copy: m.copy };
            this.emit('config', this.currentConfig);
        });
        this.room.onMessage<FxMsg>('fx', (m) => this.emit('fx', m));
        this.room.onMessage<ToastMsg>('toast', (m) => this.emit('toast', m));
        this.room.onMessage<ReportPayload>('report', (m) => this.emit('report', m));

        this.room.onStateChange((state) => {
            const now = performance.now();

            this.clock.onPatch(state.clock, now);
            this.patchTimes.push(now);

            if (state.clock !== this.lastClockSeen) {
                this.lastClockSeen = state.clock;
                this.tickTimes.push(now);
            }

            // The next day is a fresh room, so a reload after the shift must take
            // the ticket path rather than hammering a seat that no longer exists.
            if (state.phase === 'ended') removeStoredToken(this.storageKey);
        });

        this.room.onDrop(() => this.setStatus('reconnecting', 'lost the socket'));
        this.room.onReconnect(() => {
            this.storeToken();
            this.setStatus('joined', 'back on the floor');
        });
        this.room.onLeave((code) => {
            if (code === CloseCode.FAILED_TO_RECONNECT) removeStoredToken(this.storageKey);

            // The socket is gone for good; pinging it only logs SDK errors at a
            // player who has already been told to reload.
            if (this.pingTimer !== null) clearInterval(this.pingTimer);

            this.pingTimer = null;
            this.setStatus('closed', closeDetail(code));
        });
        this.room.onError((code, message) => {
            console.error(`room error ${code}: ${message ?? ''}`);
            this.setStatus(this.currentStatus, `error ${code}`);
        });

        this.pingTimer = setInterval(() => {
            this.room.ping((ms) => {
                this.rtt = this.rtt === 0 ? ms : 0.5 * this.rtt + 0.5 * ms;
            });
        }, PING_INTERVAL_MS);
    }

    private async ready(): Promise<void> {
        const config = new Promise<void>((resolve) => {
            const off = this.on('config', () => {
                off();
                resolve();
            });
        });
        const synced = new Promise<void>((resolve) =>
            this.room.onStateChange.once(() => resolve()),
        );

        this.send('config', {});

        await Promise.all([config, synced]);

        this.setStatus('joined', 'clocked in');
    }

    private setStatus(status: ConnectionStatus, detail: string): void {
        this.currentStatus = status;
        this.emit('status', status, detail);
    }

    private emit<E extends keyof ConnectionEvents>(
        event: E,
        ...args: Parameters<ConnectionEvents[E]>
    ): void {
        for (const fn of this.listeners.get(event) ?? []) {
            (fn as (...a: Parameters<ConnectionEvents[E]>) => void)(...args);
        }
    }

    private storeToken(): void {
        try {
            sessionStorage.setItem(this.storageKey, this.room.reconnectionToken);
        } catch {
            // A tab with storage disabled still plays; it just cannot resume a reload.
        }
    }
}

function readStoredToken(key: string): string | null {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function removeStoredToken(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Nothing was stored, so nothing has to be cleared.
    }
}

function countRecent(times: number[]): number {
    const cutoff = performance.now() - 1000;

    while (times.length > 0 && (times[0] ?? 0) < cutoff) times.shift();

    return times.length;
}
