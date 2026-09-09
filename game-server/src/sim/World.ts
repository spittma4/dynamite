import type { FactoryConfigResponse } from '../laravel/api';
import { pickColour, spawnTiles } from '../rooms/lobby';
import {
    LEVEL_DEFAULTS,
    MAX_INPUT_BACKDATE_S,
    PlayerState,
    inBounds,
    packTile,
    tileOf,
} from '../shared';
import type {
    Axis,
    EndReason,
    FactoryState,
    FxKind,
    FxMsg,
    GrooveEvents,
    LayoutConfig,
    LevelConfig,
    MovementConfig,
    ReportPayload,
    ScaledLevel,
    SolidFn,
    StationConfig,
    Tile,
    ToastKind,
    ToastMsg,
} from '../shared';
import { Rng } from './rng';
import type { Station } from './stations';
import { RunTally } from './tally';

/**
 * The whole simulation in one object (contracts §10.1): config, authoritative
 * state, the seeded RNG, the tile lookups every system needs, and the day loop.
 * Systems are plain modules that take a `World` — nothing below `rooms/` knows
 * Colyseus exists, which is what lets every feature test its rules without a
 * socket.
 */

export type DayEndStatus = 'ended' | 'exploded' | 'abandoned';

export interface System {
    name: string;
    /** Once, at room creation (lobby). */
    init?(world: World): void;
    /** At `start`, after `phase = 'running'`, in `SYSTEMS` order. */
    onStart?(world: World): void;
    tick?(world: World, dt: number): void;
    onDayEnd?(world: World, status: DayEndStatus, reason: EndReason): void;
}

/** `mover` is the moving party (`a` when both moved); `dx`/`dy` are `sign(b − a)`. */
export interface BumpEvent {
    a: string;
    b: string;
    mover: string;
    x: number;
    y: number;
    dx: Axis;
    dy: Axis;
}

export interface WorldEvents {
    bump: BumpEvent;
    playerJoined: { sessionId: string };
    /** The seat is gone for good — a disconnect that may still reconnect does not fire it. */
    playerLeft: { sessionId: string };
    dayEnded: { status: DayEndStatus; reason: EndReason };
}

export interface PlayerRuntime {
    intent: { dx: Axis; dy: Axis; seq: number };
    lastInputAt: number;
    lastEmoteAt: number;
    connected: boolean;
    joinIndex: number;
    contacts: Set<string>;
    clockOffsetMs: number;
}

export interface AuthPayload {
    userId: string;
    name: string;
    factoryId: string;
}

export interface WorldInit {
    config: FactoryConfigResponse;
    state: FactoryState;
    seed: number;
    log?: (msg: string) => void;
}

export type Outbound =
    | { to: 'all' | string; name: 'fx'; payload: FxMsg }
    | { to: 'all' | string; name: 'toast'; payload: ToastMsg };

type Listener<K extends keyof WorldEvents> = (e: WorldEvents[K]) => void;

/** Only walking and talking happen before the whistle (contracts §11). */
const LOBBY_SYSTEMS = new Set(['movement', 'bubbles']);

function index(tiles: Map<number, string[]>, tile: number, id: string): void {
    const found = tiles.get(tile);

    if (found === undefined) {
        tiles.set(tile, [id]);

        return;
    }

    found.push(id);
}

export class World {
    readonly factory: { id: string; name: string; day: number; coin: number; ownerUserId: string };
    readonly members: Array<{ userId: string; name: string }>;
    /** Defaults applied; a `ScaledLevel` from `startDay` on. */
    level: LevelConfig;
    readonly layout: LayoutConfig;
    readonly state: FactoryState;
    readonly rng: Rng;
    readonly seed: number;
    readonly log: (msg: string) => void;
    readonly players = new Map<string, PlayerRuntime>();
    /** Filled by `stations.build` (F05). */
    readonly stations = new Map<string, Station>();
    readonly tally = new RunTally();
    /** Drained and zeroed by `grooveSystem` after each tick (F11). */
    readonly grooveEvents: GrooveEvents = {
        fizzles: 0,
        niceSaves: 0,
        blastKegs: 0,
        primeSticks: 0,
        trucksComplete: 0,
    };
    readonly outbox: Outbound[] = [];
    endRequested: { status: DayEndStatus; reason: EndReason } | null = null;
    report: ReportPayload | null = null;

    private readonly walls: Set<number>;
    private readonly stationIndex = new Map<string, StationConfig>();
    private readonly systems: System[] = [];
    private readonly listeners: { [K in keyof WorldEvents]: Set<Listener<K>> } = {
        bump: new Set(),
        playerJoined: new Set(),
        playerLeft: new Set(),
        dayEnded: new Set(),
    };
    private readonly playerTiles = new Map<number, string[]>();
    private readonly itemTiles = new Map<number, string[]>();
    private readonly sessionIds = new Map<PlayerState, string>();
    private nextJoinIndex = 0;

    constructor(init: WorldInit) {
        const { factory, level, layout, members } = init.config;

        this.factory = factory;
        this.members = members;
        this.level = level;
        this.layout = layout;
        this.state = init.state;
        this.seed = init.seed;
        this.rng = new Rng(init.seed);
        this.log = init.log ?? ((): void => {});
        this.walls = new Set(layout.walls);
        this.indexStations();

        this.state.levelKey = level.key;
        this.state.layoutKey = layout.key;
        this.state.day = factory.day;
        this.state.coin = factory.coin;
        this.state.phase = 'lobby';
        this.state.clock = 0;
        this.state.shiftSeconds = level.day.shiftSeconds;
        this.state.groove = level.groove.start;
        this.state.width = layout.width;
        this.state.height = layout.height;
    }

    get now(): number {
        return this.state.clock;
    }

    stationConfig(id: string): StationConfig {
        const cfg = this.stationIndex.get(id);

        if (cfg === undefined) throw new Error(`unknown station: ${id}`);

        return cfg;
    }

    tileOf(x: number, y: number): Tile {
        return tileOf(x, y);
    }

    packTile(tx: number, ty: number): number {
        return packTile(tx, ty, this.state.width);
    }

    isWall(tx: number, ty: number): boolean {
        if (!inBounds(tx, ty, this.state.width, this.state.height)) return true;

        return this.walls.has(this.packTile(tx, ty));
    }

    isSpill(tx: number, ty: number): boolean {
        return this.state.spillTiles.includes(this.packTile(tx, ty));
    }

    /** Floor players only: at a `press` station a body is furniture, not traffic. */
    playersAt(tx: number, ty: number): string[] {
        return this.playerTiles.get(this.packTile(tx, ty)) ?? [];
    }

    itemsAt(tx: number, ty: number): string[] {
        return this.itemTiles.get(this.packTile(tx, ty)) ?? [];
    }

    tileSpeed(tx: number, ty: number): number {
        const movement = this.movement;
        let speed = 1;

        if (this.itemsAt(tx, ty).length > 0) speed = Math.min(speed, movement.floorItemSpeed);
        if (this.isSpill(tx, ty)) speed = Math.min(speed, movement.spillSpeed);

        return speed;
    }

    reindexPlayers(): void {
        this.playerTiles.clear();
        this.sessionIds.clear();

        this.state.players.forEach((player, sessionId) => {
            this.sessionIds.set(player, sessionId);

            if (!this.onFloor(player)) return;

            const [tx, ty] = this.tileOf(player.x, player.y);

            index(this.playerTiles, this.packTile(tx, ty), sessionId);
        });
    }

    reindexItems(): void {
        this.itemTiles.clear();

        this.state.items.forEach((item, id) => {
            if (item.holder !== '' || item.inFlight || item.x < 0) return;

            const [tx, ty] = this.tileOf(item.x, item.y);

            index(this.itemTiles, this.packTile(tx, ty), id);
        });
    }

    addPlayer(sessionId: string, auth: AuthPayload): PlayerState {
        const joinIndex = this.nextJoinIndex++;
        const [tx, ty] = this.spawnTile(joinIndex);
        const player = new PlayerState();

        player.userId = auth.userId;
        player.name = auth.name;
        player.colour = this.freeColour();
        player.line = 'a';
        player.x = tx + 0.5;
        player.y = ty + 0.5;
        player.facing = 2;

        this.state.players.set(sessionId, player);
        this.sessionIds.set(player, sessionId);
        this.players.set(sessionId, {
            intent: { dx: 0, dy: 0, seq: 0 },
            lastInputAt: this.now,
            lastEmoteAt: 0,
            connected: true,
            joinIndex,
            contacts: new Set(),
            clockOffsetMs: 0,
        });

        this.emit('playerJoined', { sessionId });

        return player;
    }

    removePlayer(sessionId: string): void {
        const player = this.state.players.get(sessionId);

        if (!this.players.has(sessionId) && player === undefined) return;

        if (player !== undefined) this.sessionIds.delete(player);

        this.players.delete(sessionId);
        this.state.players.delete(sessionId);
        this.emit('playerLeft', { sessionId });
    }

    setConnected(sessionId: string, connected: boolean): void {
        this.runtime(sessionId).connected = connected;
    }

    runtime(sessionId: string): PlayerRuntime {
        const runtime = this.players.get(sessionId);

        if (runtime === undefined) throw new Error(`unknown session: ${sessionId}`);

        return runtime;
    }

    /** The reverse index `reindexPlayers` keeps, for the modules handed a `PlayerState`. */
    sessionIdOf(player: PlayerState): string {
        const sessionId = this.sessionIds.get(player);

        if (sessionId === undefined) throw new Error('player is not in state.players');

        return sessionId;
    }

    /**
     * A client's `performance.now()` in server seconds. The offset only ever
     * lowers and the result is clamped to the last `MAX_INPUT_BACKDATE_S`, so a
     * client that lies about `t` cannot buy itself latency.
     */
    inputClock(sessionId: string, tMs: number): number {
        const clock = this.state.clock;
        const seconds = (tMs + this.runtime(sessionId).clockOffsetMs) / 1000;

        return Math.min(clock, Math.max(clock - MAX_INPUT_BACKDATE_S, seconds));
    }

    registerSystem(system: System): void {
        this.systems.push(system);
    }

    init(): void {
        for (const system of this.systems) system.init?.(this);
    }

    startDay(scaled: ScaledLevel): void {
        this.level = scaled;
        this.indexStations();

        this.state.phase = 'running';
        this.state.clock = 0;
        this.state.shiftSeconds = scaled.day.shiftSeconds;

        const seats = [...this.players.entries()].sort((a, b) => a[1].joinIndex - b[1].joinIndex);

        seats.forEach(([sessionId, runtime], seat) => {
            // The clock rewinds behind `lastInputAt`, which would leave the
            // staleness guard unable to fire for the length of the lobby: a
            // client that goes quiet at the whistle would walk on by itself.
            // The seq survives so the client's echo never regresses.
            runtime.intent = { dx: 0, dy: 0, seq: runtime.intent.seq };
            runtime.lastInputAt = 0;

            const player = this.state.players.get(sessionId);

            if (player === undefined) return;

            const [tx, ty] = this.spawnTile(seat);

            player.x = tx + 0.5;
            player.y = ty + 0.5;
            player.facing = 2;
            player.moving = false;
            player.stunnedUntil = 0;
            player.bubble = '';
            player.bubbleUntil = 0;
        });

        for (const system of this.systems) system.onStart?.(this);
    }

    tick(dt: number): void {
        this.state.clock += dt;
        this.reindexPlayers();
        this.reindexItems();

        const running = this.state.phase === 'running';

        if (running || this.state.phase === 'lobby') {
            for (const system of this.systems) {
                if (running || LOBBY_SYSTEMS.has(system.name)) system.tick?.(this, dt);
            }
        }

        if (running) this.checkDayEnd();

        this.consumeEnd();
    }

    /** First request wins: an explosion mid-tick is not overwritten by the clock. */
    requestEnd(status: DayEndStatus, reason: EndReason): void {
        if (this.endRequested === null) this.endRequested = { status, reason };
    }

    setReport(report: ReportPayload): void {
        this.report = report;
    }

    on<K extends keyof WorldEvents>(event: K, fn: Listener<K>): () => void {
        const listeners = this.listeners[event] as Set<Listener<K>>;

        listeners.add(fn);

        return (): void => {
            listeners.delete(fn);
        };
    }

    emit<K extends keyof WorldEvents>(event: K, e: WorldEvents[K]): void {
        for (const fn of this.listeners[event] as Set<Listener<K>>) fn(e);
    }

    fx(kind: FxKind, x: number, y: number, extra?: { size?: number; text?: string }): void {
        this.outbox.push({ to: 'all', name: 'fx', payload: { kind, x, y, ...extra } });
    }

    toast(to: 'all' | string, text: string, kind: ToastKind): void {
        this.outbox.push({ to, name: 'toast', payload: { text, kind } });
    }

    /** `validateLevelConfig` has already filled these in; the fallback is for a hand-built level. */
    private get movement(): MovementConfig {
        return this.level.movement ?? LEVEL_DEFAULTS.movement;
    }

    private indexStations(): void {
        this.stationIndex.clear();

        for (const station of this.level.stations) this.stationIndex.set(station.id, station);
    }

    /** A `stand` station (the dock) leaves its workers on the floor; a `press` station does not. */
    private onFloor(player: PlayerState): boolean {
        if (player.stationId === '') return true;

        return this.stationIndex.get(player.stationId)?.joinMode === 'stand';
    }

    /**
     * The ring is finite, so a `level.players.max` past its last open tile seats
     * two bodies on the spawn tile. That is survivable — they push apart on the
     * first tick — but it is a level that outgrew its layout, so it is logged.
     */
    private spawnTile(seat: number): Tile {
        const isSolid: SolidFn = (tx, ty) => this.isWall(tx, ty);
        const [sx, sy] = this.layout.spawn;
        const tile = spawnTiles(this.layout, isSolid, seat + 1)[seat] ?? this.layout.spawn;

        if (seat > 0 && tile[0] === sx && tile[1] === sy) {
            this.log(`seat ${seat} wrapped onto the spawn tile: players.max outruns the spawn ring`);
        }

        return tile;
    }

    private freeColour(): number {
        const taken: number[] = [];

        this.state.players.forEach((player) => taken.push(player.colour));

        return pickColour(taken);
    }

    /** Contracts §10.7: the book wins when book and clock land on the same tick. */
    private checkDayEnd(): void {
        if (this.endRequested !== null) return;

        const endsOn = this.level.day.endsOn;

        if (endsOn === 'never') return;

        if (endsOn !== 'clock' && this.state.bookTotal > 0 && this.state.bookRemaining === 0) {
            this.requestEnd('ended', 'book');

            return;
        }

        if (endsOn !== 'book' && this.state.clock >= this.state.shiftSeconds) {
            this.requestEnd('ended', 'clock');
        }
    }

    /**
     * The request is consumed once and then left set: the room reads it after the
     * step to decide whether to post the run.
     */
    private consumeEnd(): void {
        const end = this.endRequested;

        if (end === null || this.state.phase === 'ended') return;

        this.state.phase = 'ended';
        this.state.players.forEach((player) => {
            player.moving = false;
            player.speed = 0;
        });

        for (const system of this.systems) system.onDayEnd?.(this, end.status, end.reason);

        this.emit('dayEnded', end);
    }
}
