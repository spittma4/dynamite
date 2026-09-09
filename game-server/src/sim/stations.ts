import {
    BUBBLE_SECONDS,
    LEVEL_DEFAULTS,
    StationState,
    armedAt as armedAtOf,
    bubblesDue,
    clipboardLines,
    clipboardSecondsFor,
    copy,
    countWorkers,
    efficiencyFor,
    extrasFor,
    firstBubbleAt,
    footprintOf,
    interruptsPerSecond,
    joinZoneOf,
    pickExtras,
    roleForTile,
    tileKey,
} from '../shared';
import type {
    InterruptsConfig,
    ItemState,
    MgMsg,
    PlayerState,
    Role,
    StationConfig,
    Tile,
} from '../shared';
import { setBubble } from './bubbles';
import { canDeliver, createItem, deliverOutput, shelfPull } from './items';
import { MINIGAMES } from './minigames/index';
import type {
    CycleResult,
    LeaveReason,
    MinigameInstance,
    StationCtx,
    StationPhase,
} from './minigames/types';
import type { System, World } from './World';

/**
 * The station runtime (contracts §10.2, docs/03 and docs/05). F05 owns who is
 * on a machine and what the staffing curve makes of them; the mini-game module
 * owns the gesture. The split is the whole point — the cycle floor, the
 * clipboard and the bodies in the aisle behave the same whichever game is
 * plugged in, so a new station is a module and a config block, never a rewrite.
 */

export type { Role };

export interface Member {
    sessionId: string;
    role: Role;
    tile: string;
    joinedAt: number;
    nextBubbleAt: number | null;
}

export interface Cycle {
    startedAt: number;
    pausedSeconds: number;
    bubbles: number;
    completedAt: number | null;
}

export interface Station {
    cfg: StationConfig;
    st: StationState;
    machine: Tile[];
    joinZone: Set<string>;
    /** Packed floor-ring tiles; published by contracts §10.2. F06 counts the
     *  items standing on them (`StationState.floorCount` is its field, §3). */
    ring: number[];
    members: Map<string, Member>;
    cycle: Cycle | null;
    armedAt: number;
    lastCycleWasPerfect: boolean;
    pausedUntil: number;
    lastLeftAt: Map<string, number>;
    clipboardIndex: number;
    mg: MinigameInstance;
}

interface StationsStore {
    /** When each jammed station froze, so the stoppage is not billed as execution. */
    jammedAt: Map<string, number>;
    /** A module's `setProgress`, consumed by the next state write. */
    progressOverride: Map<string, number>;
}

const stores = new WeakMap<World, StationsStore>();

function store(world: World): StationsStore {
    let found = stores.get(world);

    if (found === undefined) {
        found = { jammedAt: new Map(), progressOverride: new Map() };
        stores.set(world, found);
    }

    return found;
}

function interrupts(world: World): InterruptsConfig {
    return world.level.interrupts ?? LEVEL_DEFAULTS.interrupts;
}

function memorySeconds(world: World): number {
    return world.level.clipboardMemorySeconds ?? LEVEL_DEFAULTS.clipboardMemorySeconds;
}

function tileOfPlayer(world: World, player: PlayerState): Tile {
    return world.tileOf(player.x, player.y);
}

function playerOf(world: World, sessionId: string): PlayerState | undefined {
    return world.state.players.get(sessionId);
}

/** Members past the clipboard, in join order, paired with the body they belong to. */
function crew(world: World, station: Station): { member: Member; player: PlayerState }[] {
    const now = world.now;
    const crewed: { member: Member; player: PlayerState }[] = [];

    for (const member of station.members.values()) {
        const player = playerOf(world, member.sessionId);

        if (player === undefined || player.clipboardUntil > now) continue;

        crewed.push({ member, player });
    }

    return crewed;
}

function byRole(
    world: World,
    station: Station,
    role: Role,
): PlayerState[] {
    return crew(world, station)
        .filter((entry) => entry.member.role === role)
        .map((entry) => entry.player);
}

function phaseOf(world: World, station: Station): StationPhase {
    const now = world.now;

    if (station.st.state === 'jammed') return 'jammed';

    const operators = byRole(world, station, 'work');

    if (operators.length === 0) return 'idle';
    if (station.cycle !== null && station.cycle.completedAt === null) return 'executing';

    // A forfeit leaves `armedAt` where it was: giving up on a rep does not buy
    // the line a head start on the next one.
    if (now < station.armedAt) return 'rearming';
    if (operators.some((player) => player.carrying !== '')) return 'blocked';

    return 'idle';
}

function shelfItems(world: World, station: Station): ItemState[] {
    const shelf = station.st.inputShelf;
    const items: ItemState[] = [];

    for (let i = 0; i < shelf.length; i++) {
        const id = shelf[i];
        const item = id === undefined ? undefined : world.state.items.get(id);

        if (item !== undefined) items.push(item);
    }

    return items;
}

function shelfIndexOf(station: Station, itemId: string): number {
    const shelf = station.st.inputShelf;

    for (let i = 0; i < shelf.length; i++) {
        if (shelf[i] === itemId) return i;
    }

    return -1;
}

function centreOf(tile: Tile): [number, number] {
    return [tile[0] + 0.5, tile[1] + 0.5];
}

function makeCtx(world: World, station: Station, phase: StationPhase): StationCtx {
    const now = world.now;

    return {
        world,
        station,
        cfg: station.cfg,
        now,
        phase,
        paused: now < station.pausedUntil,
        rearmAt: station.armedAt,
        operators: byRole(world, station, 'work'),
        rackHands: byRole(world, station, 'rack'),
        helpers: byRole(world, station, 'helper'),

        sessionIdOf: (player) => world.sessionIdOf(player),

        inputShelf: () => shelfItems(world, station),

        consume(itemId: string): ItemState {
            const index = shelfIndexOf(station, itemId);
            const item = index < 0 ? null : shelfPull(world, station.st, 'in', index);

            if (item === null) throw new Error(`${station.cfg.id}: ${itemId} is not on the shelf`);

            return item;
        },

        beginCycle(): boolean {
            if (phaseOf(world, station) !== 'idle') return false;
            if (byRole(world, station, 'work').length === 0) return false;

            station.cycle = {
                startedAt: world.now,
                pausedSeconds: 0,
                bubbles: 0,
                completedAt: null,
            };

            return true;
        },

        complete: (result) => completeCycle(world, station, result),

        abort(): void {
            station.cycle = null;
            station.st.progress = 0;
        },

        setMg(value: object): void {
            const encoded = JSON.stringify(value);

            if (station.st.mg !== encoded) station.st.mg = encoded;
        },

        setProgress(p: number): void {
            store(world).progressOverride.set(station.cfg.id, p);
        },

        fx: (kind, x, y, extra) => world.fx(kind, x, y, extra),

        bubble(sessionId: string, text: string, seconds: number): void {
            const player = playerOf(world, sessionId);

            if (player !== undefined) setBubble(world, player, text, seconds);
        },
    };
}

/**
 * docs/05's cycle rule. The wall clock the player actually spent is charged
 * against the machine floor, so beating the machine wins nothing and losing to
 * it costs exactly what it cost.
 */
function completeCycle(
    world: World,
    station: Station,
    result: CycleResult,
): 'shelved' | 'hands' | 'none' {
    const cycle = station.cycle;

    if (cycle === null || cycle.completedAt !== null) return 'none';

    const { cfg, st } = station;
    const executionSeconds = world.now - cycle.startedAt - cycle.pausedSeconds;

    station.armedAt = armedAtOf(cycle.startedAt, {
        floorSeconds: cfg.floorSeconds,
        efficiency: st.efficiency,
        churnSensitive: cfg.churnSensitive,
        churnDepth: 0,
        lastCycleWasPerfect: station.lastCycleWasPerfect,
        executionSeconds,
        bubblesThisCycle: cycle.bubbles,
    });
    station.lastCycleWasPerfect = result.perfect;
    cycle.completedAt = world.now;

    for (const { member, player } of crew(world, station)) {
        if (member.role === 'helper') continue;

        world.tally.bumpPlayer(player.userId, 'produced');
    }

    const spec = result.item;

    if (spec === undefined) return 'none';

    // ADR 0012 leaves exactly two homes for a product. A cycle that ends with
    // neither is a module that armed one it could not deliver, so the output is
    // dropped rather than thrown out of a tick nobody can catch.
    if (!canDeliver(world, st, spec.handsOf)) {
        world.log(`${cfg.id}: nowhere to put a ${spec.type}`);

        return 'none';
    }

    const item = createItem(world, spec.type, {
        quality: spec.quality,
        prime: spec.prime,
        dents: spec.dents,
        fuseLength: spec.fuseLength,
        fill: spec.fill,
        capLoose: spec.capLoose,
        frayed: spec.frayed,
        orderId: spec.orderId,
    });

    if (spec.type === 'keg') world.tally.bump('kegsMade');

    if (deliverOutput(world, st, item, spec.handsOf) === 'hands') return 'hands';

    if (cfg.outputShelf != null) world.fx('clink', ...centreOf(cfg.outputShelf.tile));

    return 'shelved';
}

function pressStationAtZone(world: World, key: string): Station | null {
    for (const station of world.stations.values()) {
        if (station.cfg.joinMode !== 'press') continue;
        if (station.joinZone.has(key)) return station;
    }

    return null;
}

function standStationAtWorkTile(world: World, tile: Tile): Station | null {
    const key = tileKey(tile[0], tile[1]);

    for (const station of world.stations.values()) {
        if (station.cfg.joinMode !== 'stand') continue;
        if (roleForTile(station.cfg, tile) === 'work' && station.joinZone.has(key)) return station;
    }

    return null;
}

function tileTaken(station: Station, key: string, exclude: string): boolean {
    for (const member of station.members.values()) {
        if (member.sessionId !== exclude && member.tile === key) return true;
    }

    return false;
}

function join(world: World, station: Station, player: PlayerState, tile: Tile, role: Role): void {
    const sessionId = world.sessionIdOf(player);
    const key = tileKey(tile[0], tile[1]);
    const now = world.now;
    const press = station.cfg.joinMode === 'press';
    const clip = press
        ? clipboardSecondsFor(
              station.lastLeftAt.get(sessionId),
              now,
              world.level.clipboardSeconds,
              memorySeconds(world),
          )
        : 0;

    station.members.set(sessionId, {
        sessionId,
        role,
        tile: key,
        joinedAt: now,
        nextBubbleAt: null,
    });

    player.stationId = station.cfg.id;
    player.workTile = role === 'helper' ? '' : key;
    player.clipboardUntil = now + clip;

    if (press) {
        player.x = tile[0] + 0.5;
        player.y = tile[1] + 0.5;
        player.moving = false;
    }

    if (clip > 0) {
        const lines = clipboardLines(world.level);
        const line = lines[station.clipboardIndex++ % lines.length] ?? '';

        setBubble(world, player, line, clip);
    }

    world.reindexPlayers();
    station.mg.onJoin(makeCtx(world, station, phaseOf(world, station)), player, role);
}

/**
 * `E`, `Esc`, a disconnect, or F10 ejecting a body from a machine that just
 * caught fire. The module hears about it first so it can put its own gesture
 * down before the member is gone. The `Esc` *message* is refused at a `stand`
 * station by the handler, not here: an ejection has to work everywhere.
 */
export function leave(world: World, player: PlayerState, reason: LeaveReason = 'esc'): void {
    const station = world.stations.get(player.stationId);

    if (station === undefined) return;

    const sessionId = world.sessionIdOf(player);
    const member = station.members.get(sessionId);

    if (member === undefined) return;

    station.mg.onLeave(makeCtx(world, station, phaseOf(world, station)), player, reason);
    station.members.delete(sessionId);
    station.lastLeftAt.set(sessionId, world.now);

    // The clipboard bubble dies with the visit; an emote or a WHO THREW THAT
    // is the player's own and stays up for its own two seconds.
    if (player.clipboardUntil > world.now && player.bubbleUntil === player.clipboardUntil) {
        player.bubble = '';
        player.bubbleUntil = 0;
    }

    player.stationId = '';
    player.workTile = '';
    player.clipboardUntil = 0;

    const cycle = station.cycle;

    if (member.role === 'work' && cycle !== null && cycle.completedAt === null) {
        station.cycle = null;
        station.st.progress = 0;
    }

    world.reindexPlayers();
}

export function onPlayerLeft(world: World, sessionId: string): void {
    const player = playerOf(world, sessionId);

    if (player !== undefined) leave(world, player, 'disconnect');

    for (const station of world.stations.values()) {
        station.members.delete(sessionId);
        station.lastLeftAt.delete(sessionId);
    }
}

/**
 * `E` after F06 has declined it (contracts §11). Returning `false` passes the
 * press on to F10's repair, so every branch that declines has to say so.
 */
export function onInteract(world: World, player: PlayerState): boolean {
    if (world.state.phase !== 'running') return false;

    const tile = tileOfPlayer(world, player);
    const key = tileKey(tile[0], tile[1]);
    const standing = standStationAtWorkTile(world, tile);

    // Standing on the dock is being at the dock: the module owns the press
    // whatever the player is holding, and membership is the tick's business.
    // A damaged machine is the exception — the press belongs to F10's repair.
    if (standing !== null) {
        if (standing.st.state === 'damaged') return false;

        return standing.mg.onInteract(makeCtx(world, standing, phaseOf(world, standing)), player);
    }

    const current = world.stations.get(player.stationId);

    if (current !== undefined) {
        if (current.st.state === 'damaged') return false;

        if (current.mg.onInteract(makeCtx(world, current, phaseOf(world, current)), player)) {
            return true;
        }

        leave(world, player, 'esc');

        return true;
    }

    // You cannot join with your hands full, and an operator holding output
    // keeps `E` for F06's put-down.
    if (player.carrying !== '') return false;

    const target = pressStationAtZone(world, key);

    if (target === null || target.st.state === 'damaged') return false;

    const role = roleForTile(target.cfg, tile);

    if (role === null) return false;
    if (role !== 'helper' && tileTaken(target, key, world.sessionIdOf(player))) return false;

    join(world, target, player, tile, role);

    return true;
}

export function onMg(world: World, player: PlayerState, msg: MgMsg): void {
    if (world.state.phase !== 'running') return;
    if (player.stationId !== msg.stationId) return;

    const station = world.stations.get(msg.stationId);

    if (station === undefined) return;
    if (player.clipboardUntil > world.now) return;
    if (station.st.state === 'jammed' || station.st.state === 'damaged') return;
    if (world.now < station.pausedUntil) return;

    station.mg.onMessage(
        makeCtx(world, station, phaseOf(world, station)),
        player,
        msg.op,
        msg.v,
        msg.t,
    );
}

/** F06: something was thrown or knocked onto a work tile. */
export function jam(world: World, stationId: string): void {
    const station = world.stations.get(stationId);

    // F10 owns `damaged` (contracts §3): a keg landing on a burning machine
    // must not relabel the incident as a jam an `unjam` would then clear.
    if (station === undefined || station.st.state === 'jammed') return;
    if (station.st.state === 'damaged') return;

    station.st.state = 'jammed';
    store(world).jammedAt.set(stationId, world.now);
}

/** F06: the unjam hold finished. The frozen seconds are not billed as execution. */
export function unjam(world: World, stationId: string): void {
    const station = world.stations.get(stationId);

    if (station === undefined || station.st.state !== 'jammed') return;

    const jammedAt = store(world).jammedAt.get(stationId);

    if (station.cycle !== null && jammedAt !== undefined) {
        station.cycle.startedAt += world.now - jammedAt;
    }

    store(world).jammedAt.delete(stationId);
    station.st.state = 'idle';
}

export function pauseStation(world: World, stationId: string, seconds: number): void {
    const station = world.stations.get(stationId);

    if (station === undefined) return;

    station.pausedUntil = Math.max(station.pausedUntil, world.now + seconds);
    station.st.pausedUntil = station.pausedUntil;
}

export function build(world: World): void {
    world.stations.clear();
    world.state.stations.clear();

    const claimed = new Map<string, string>();

    for (const cfg of world.level.stations) {
        const { machine } = footprintOf(cfg, world.layout);
        const joinZone = joinZoneOf(cfg);

        // `validateLevelOnLayout` rejects this already; a level built by hand in
        // a test would otherwise seat two crews on one tile and read as a bug in
        // the staffing curve.
        for (const key of joinZone) {
            const owner = claimed.get(key);

            if (owner !== undefined) {
                throw new Error(`stations ${owner} and ${cfg.id} share the join tile ${key}`);
            }

            claimed.set(key, cfg.id);
        }

        const st = new StationState();

        st.id = cfg.id;
        st.type = cfg.type;
        st.line = cfg.line;
        st.anchorX = cfg.anchor[0];
        st.anchorY = cfg.anchor[1];
        st.inputCap = cfg.inputShelf?.capacity ?? 0;
        st.outputCap = cfg.outputShelf?.capacity ?? 0;

        world.state.stations.set(cfg.id, st);

        // `create` is handed the station it belongs to, so the object has to
        // exist one line before its module does.
        const station = {
            cfg,
            st,
            machine,
            joinZone,
            ring: cfg.floorRing.tiles.map(([x, y]) => world.packTile(x, y)),
            members: new Map<string, Member>(),
            cycle: null,
            armedAt: 0,
            lastCycleWasPerfect: false,
            pausedUntil: 0,
            lastLeftAt: new Map<string, number>(),
            clipboardIndex: 0,
        } as Station;

        station.mg = MINIGAMES[cfg.type].create(station);
        world.stations.set(cfg.id, station);
    }
}

/** Step 1: at a `stand` station, where you are standing is the whole membership. */
function syncStandMembers(world: World, station: Station): void {
    for (const member of [...station.members.values()]) {
        const player = playerOf(world, member.sessionId);

        if (player === undefined) {
            station.members.delete(member.sessionId);

            continue;
        }

        const tile = tileOfPlayer(world, player);
        const role = roleForTile(station.cfg, tile);

        if (role !== 'work') {
            leave(world, player, 'stepOff');

            continue;
        }

        const key = tileKey(tile[0], tile[1]);

        member.tile = key;
        player.workTile = key;
    }

    for (const tile of station.cfg.workTiles) {
        for (const sessionId of world.playersAt(tile[0], tile[1])) {
            const player = playerOf(world, sessionId);

            if (player === undefined || player.stationId !== '') continue;

            join(world, station, player, tile, 'work');
        }
    }
}

/** Steps 2–3: the curve, and the bodies it has no room for. */
function staff(world: World, station: Station): void {
    const { cfg, st } = station;
    const cadence = interrupts(world);
    const now = world.now;
    const working = crew(world, station);
    const clipboards: { clipboardUntil: number }[] = [];

    for (const member of station.members.values()) {
        const player = playerOf(world, member.sessionId);

        clipboards.push({ clipboardUntil: player?.clipboardUntil ?? Number.POSITIVE_INFINITY });
    }

    st.workers = countWorkers(clipboards, now);
    st.efficiency = efficiencyFor(cfg.staffing, st.workers);

    const extras = extrasFor(cfg.staffing, st.workers);

    st.interruptsPerSecond = interruptsPerSecond(extras, cadence.everySeconds);

    const spare = new Set(
        pickExtras(
            working.map((entry) => entry.member),
            extras,
        ),
    );

    for (const { member, player } of working) {
        if (!spare.has(member)) {
            member.nextBubbleAt = null;

            continue;
        }

        if (member.nextBubbleAt === null) {
            member.nextBubbleAt = firstBubbleAt(now, cadence.everySeconds, world.rng.next());

            continue;
        }

        const due = bubblesDue(member.nextBubbleAt, now, cadence.everySeconds);

        member.nextBubbleAt = due.nextBubbleAt;

        if (due.count === 0) continue;

        setBubble(world, player, copy.bubbles.whatCanIDo, BUBBLE_SECONDS);

        for (let i = 0; i < due.count; i++) {
            world.tally.bumpPlayer(player.userId, 'bubbles');

            if (station.cycle !== null && station.cycle.completedAt === null) {
                station.cycle.bubbles++;
            }
        }

        station.pausedUntil = Math.max(station.pausedUntil, now + cadence.pauseSeconds);
    }
}

/** Step 7: the module's reading wins; the cycle rule is the fallback. */
function writeState(world: World, station: Station, ctx: StationCtx, phase: StationPhase): void {
    const { cfg, st } = station;
    const status = station.mg.status?.(ctx) ?? null;

    if (status !== null) {
        st.state = status.state;
        st.progress = status.progress;
    } else if (phase === 'executing' && station.cycle !== null) {
        const floor = Math.max(cfg.nominalSeconds, cfg.floorSeconds / Math.max(st.efficiency, 0.01));

        st.state = 'working';
        st.progress = Math.min(1, Math.max(0, (world.now - station.cycle.startedAt) / floor));
    } else if (phase === 'rearming' && station.cycle !== null) {
        st.state = 'working';
        st.progress = 1;
    } else if (ctx.operators.length > 0 && station.mg.starved(ctx)) {
        st.state = 'starved';
        st.progress = 0;
    } else {
        st.state = 'idle';
        st.progress = 0;
    }

    const override = store(world).progressOverride.get(cfg.id);

    if (override !== undefined) {
        st.progress = override;
        store(world).progressOverride.delete(cfg.id);
    }
}

function tickStation(world: World, station: Station, dt: number): void {
    const { st } = station;
    const offline = st.state === 'jammed' || st.state === 'damaged';

    // Step 4's offline rule reaches back over step 1: a machine F10 has just
    // emptied would otherwise seat the repairer as its operator on the very
    // next tick, because standing on the lane is the whole membership.
    if (station.cfg.joinMode === 'stand' && !offline) syncStandMembers(world, station);

    staff(world, station);

    if (offline) {
        st.pausedUntil = station.pausedUntil;

        return;
    }

    const now = world.now;
    const cycle = station.cycle;

    // The re-arm is over: the machine has forgotten the last rep entirely.
    if (cycle !== null && cycle.completedAt !== null && now >= station.armedAt) {
        station.cycle = null;
    }

    const phase = phaseOf(world, station);

    if (phase === 'executing' && station.cycle !== null && now < station.pausedUntil) {
        station.cycle.pausedSeconds += dt;
    }

    station.mg.tick(makeCtx(world, station, phase), dt);

    // The module may have begun or ended a rep in that call, and what the
    // client draws has to be the station as it stands at the end of the tick.
    const settled = phaseOf(world, station);

    writeState(world, station, makeCtx(world, station, settled), settled);

    st.pausedUntil = station.pausedUntil;
}

export function tick(world: World, dt: number): void {
    for (const station of world.stations.values()) tickStation(world, station, dt);
}

export const stationsSystem: System = { name: 'stations', init: build, tick };
