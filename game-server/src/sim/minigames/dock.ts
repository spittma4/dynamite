import {
    LEVEL_DEFAULTS,
    beepPhase,
    copy,
    judgeShove,
    laneIndexAt,
    nearestBeep,
    qtyForTruck,
    tailgateWindowEnd,
    truckCredit,
    truckSchedule,
} from '../../shared';
import type {
    DockMg,
    DockMinigame,
    ItemState,
    ItemType,
    LayoutConfig,
    MgOp,
    OrderState,
    PlayerState,
    Product,
    Tile,
} from '../../shared';
import { setBubble } from '../bubbles';
import { destroyItem, giveToPlayer, placeNear, stageOnLane, takeCarried } from '../items';
import { activeOrderId, ensureOrder, initOrders, settleOrder } from '../orders';
import type { Station } from '../stations';
import type { System, World } from '../World';
import type { MinigameInstance, MinigameModule, StationCtx } from './types';

/**
 * The Dock (docs/04 "The Dock", docs/03 Shipping). The truck's reversing alarm
 * is the metronome for the whole factory: it beeps on the server's clock, the
 * shove is judged against the beep and never against anything the client drew,
 * and a miss stalls the crate in its lane rather than sending it back — the
 * lesson is "you missed the beat", not "you lost the stick".
 */

/** Functional numbers with no designer meaning (contracts §14). */
const TAILGATE_BANNER_SECONDS = 2;
const RIDE_BUBBLE_EXTRA_SECONDS = 2;
/** The clock accumulates in 50 ms steps, so an exact hold length lands just under. */
const HOLD_EPSILON = 1e-6;

interface LaneRuntime {
    itemId: string;
    stalled: boolean;
    /** The beep this lane was last judged against; one judgement per beep. */
    lastBeep: number;
}

interface DockRuntime {
    /** 0-based truck; `truck.id` is this plus one. */
    index: number;
    lanes: LaneRuntime[];
    holds: Map<string, number>;
    leavingUntil: number;
    /** One `'P'` or `'O'` per boarded stick — the slot lamps, not a truck field. */
    hits: string;
    beepAt: number;
    tailgateUntil: number;
}

const runtimes = new WeakMap<World, DockRuntime>();

function runtimeOf(world: World, station: Station): DockRuntime {
    let runtime = runtimes.get(world);

    if (runtime === undefined) {
        runtime = {
            index: 0,
            lanes: [],
            holds: new Map(),
            leavingUntil: 0,
            hits: '',
            beepAt: 0,
            tailgateUntil: 0,
        };

        runtimes.set(world, runtime);
    }

    while (runtime.lanes.length < station.cfg.workTiles.length) {
        runtime.lanes.push({ itemId: '', stalled: false, lastBeep: -1 });
    }

    return runtime;
}

/** M1 has one dock; M2's second line widens this to a loop. */
function dockStation(world: World): Station | null {
    for (const station of world.stations.values()) {
        if (station.cfg.type === 'dock') return station;
    }

    return null;
}

function dockConfig(station: Station): DockMinigame {
    return station.cfg.minigame as DockMinigame;
}

function periodMsOf(cfg: DockMinigame): number {
    return cfg.beepHz > 0 ? 1000 / cfg.beepHz : 0;
}

/** The last beep is a full second before the truck goes, so every beep is judgeable. */
function beepCountOf(world: World, cfg: DockMinigame): number {
    return Math.max(1, Math.round(world.level.orders.truckWaitSeconds * cfg.beepHz));
}

function centreOf(tile: Tile): [number, number] {
    return [tile[0] + 0.5, tile[1] + 0.5];
}

function doorCentre(layout: LayoutConfig): [number, number] {
    const [x, y, w] = layout.dockDoor;

    return [x + w / 2, y + 0.5];
}

function orderForTruck(world: World, truckId: number): OrderState | undefined {
    let found: OrderState | undefined;

    world.state.orders.forEach((order) => {
        if (order.truckId === truckId) found = order;
    });

    return found;
}

function buildMg(world: World, station: Station, runtime: DockRuntime): DockMg {
    const cfg = dockConfig(station);
    const { truck } = world.state;

    return {
        truck: {
            phase: truck.phase as DockMg['truck']['phase'],
            arrivesAt: truck.arrivesAt,
            leavesAt: truck.leavesAt,
            slots: truck.slots,
            loaded: truck.loaded,
            hits: runtime.hits,
        },
        lanes: station.cfg.workTiles.map((tile, index) => ({
            tile,
            itemId: runtime.lanes[index]?.itemId ?? '',
            stalled: runtime.lanes[index]?.stalled ?? false,
        })),
        beepAt: runtime.beepAt,
        beepPeriodMs: periodMsOf(cfg),
        windows: { perfectMs: cfg.perfectMs, okMs: cfg.okMs },
        tailgateUntil: runtime.tailgateUntil,
        returnsTile: world.layout.props.returnsPile,
    };
}

/** The module owns `st.mg` (contracts §10.3); it is rewritten only when it changes. */
function writeMg(world: World, station: Station, runtime: DockRuntime): void {
    const encoded = JSON.stringify(buildMg(world, station, runtime));

    if (station.st.mg !== encoded) station.st.mg = encoded;
}

function carriedItem(world: World, player: PlayerState): ItemState | null {
    if (player.carrying === '' || player.carrying === 'broom') return null;

    return world.state.items.get(player.carrying) ?? null;
}

/**
 * `lastBeep` survives: it says this lane has already been judged against that
 * beep, and clearing it on every set-down would let one lane board two sticks
 * on a single beep, which is the whole thing the guard exists to stop.
 */
function emptyLane(lane: LaneRuntime): void {
    lane.itemId = '';
    lane.stalled = false;
}

/**
 * Whatever is still on the ramp when the truck pulls out is the factory's
 * problem, not the truck's: it goes on the Returns pile rather than vanishing.
 */
function dumpToReturns(world: World, runtime: DockRuntime): void {
    const pile = world.layout.props.returnsPile;

    for (const lane of runtime.lanes) {
        const item = lane.itemId === '' ? undefined : world.state.items.get(lane.itemId);

        lane.stalled = false;
        lane.lastBeep = -1;

        if (item === undefined) {
            lane.itemId = '';

            continue;
        }

        // A pile with nowhere left to spread keeps the stick on the lane rather
        // than deleting it; the next truck can still take it.
        if (placeNear(world, item, pile)) lane.itemId = '';
    }
}

/** docs/17: stand in the bay when the truck goes and you go with it. */
function driveOffRiders(world: World, seconds: number): void {
    const [bx, by, bw, bh] = world.layout.truckBay;
    const [rx, ry, rw] = world.layout.breakRoom;
    const now = world.now;

    world.state.players.forEach((player) => {
        const [tx, ty] = world.tileOf(player.x, player.y);

        if (tx < bx || ty < by || tx >= bx + bw || ty >= by + bh) return;

        player.drivenOffUntil = now + seconds;

        const cargo = world.state.items.get(player.carrying);

        // Whatever they were holding went to the highway with them: it never
        // reached a customer, so the day is billed for it.
        if (cargo !== undefined) {
            world.tally.scrap(cargo.type as ItemType);
            destroyItem(world, cargo.id);
        }

        player.stationId = '';
        player.workTile = '';
        player.x = rx + rw + 0.5;
        player.y = ry + 1 + 0.5;

        setBubble(world, player, copy.bubbles.sawTheHighway, seconds + RIDE_BUBBLE_EXTRA_SECONDS);
        world.tally.bumpPlayer(player.userId, 'truckRides');
    });
}

export function departTruck(world: World, reason: 'timer' | 'tailgate' | 'whistle'): void {
    const station = dockStation(world);

    if (station === null) return;

    const runtime = runtimeOf(world, station);
    const cfg = dockConfig(station);
    const { state } = world;
    const { truck } = state;
    const now = world.now;
    const order = orderForTruck(world, truck.id);
    const product = (order?.product ?? 'red_stick') as Product;
    const perOrder = world.level.scoring?.perOrder ?? LEVEL_DEFAULTS.scoring.perOrder;
    const { credit, complete } = truckCredit(
        truck.loaded,
        truck.slots,
        world.level.economy.price[product] ?? 0,
        perOrder,
    );

    if (order !== undefined) settleOrder(world, order.id, truck.loaded);

    // The book only shrinks here; F03 reads `bookRemaining === 0` and ends the day.
    if (state.bookTotal > 0) state.bookRemaining = Math.max(0, state.bookRemaining - 1);
    if (complete) world.grooveEvents.trucksComplete += 1;

    const [dx, dy] = doorCentre(world.layout);

    if (reason === 'tailgate') {
        world.fx('slam', dx, dy, { text: 'SLAM' });
        world.fx('horn', dx, dy, { text: 'HONK HONK' });
        state.banner = 'TAILGATE';
        state.bannerUntil = now + TAILGATE_BANNER_SECONDS;
    } else if (reason !== 'whistle') {
        world.fx('horn', dx, dy, { text: 'HONK' });
    }

    if (complete) {
        world.toast('all', `TRUCK OUT ${truck.loaded}/${truck.slots} — ${credit}`, 'good');
    } else if (truck.loaded > 0) {
        world.toast('all', `TRUCK LEFT WITH ${truck.loaded}/${truck.slots} — ${credit}`, 'warn');
    } else {
        world.toast('all', 'TRUCK LEFT EMPTY — 0', 'bad');
    }

    dumpToReturns(world, runtime);
    driveOffRiders(world, world.level.carry.truckRideSeconds);

    runtime.tailgateUntil = 0;
    runtime.holds.clear();
    runtime.leavingUntil = now + (cfg.leaveSeconds ?? LEVEL_DEFAULTS.minigame.dock.leaveSeconds);
    truck.phase = 'leaving';
    truck.beepPhase = 0;

    writeMg(world, station, runtime);
}

/** The whistle blew mid-load: the truck takes what it has and goes, quietly. */
export function closeShift(world: World): void {
    if (world.state.truck.phase === 'docked') departTruck(world, 'whistle');
}

function armNext(world: World, runtime: DockRuntime): void {
    const next = runtime.index + 1;

    // The book is done and the last truck stays parked; ending the day is F03's.
    if (next >= world.state.bookTotal && world.level.day.endsOn !== 'never') return;

    const cfg = world.level.orders;
    const slot = truckSchedule(cfg, next);
    const { truck } = world.state;

    runtime.index = next;
    runtime.hits = '';
    ensureOrder(world, next);

    truck.id = next + 1;
    truck.phase = 'away';
    truck.arrivesAt = slot.arrivesAt;
    truck.leavesAt = slot.leavesAt;
    truck.slots = qtyForTruck(cfg, slot.arrivesAt);
    truck.loaded = 0;
    truck.beepPhase = 0;

    for (const lane of runtime.lanes) lane.lastBeep = -1;
}

/** First mature hold wins; stepping off the lane abandons it. */
function checkHolds(world: World, station: Station, runtime: DockRuntime): void {
    const cfg = dockConfig(station);
    const hold = cfg.tailgateHoldSeconds ?? LEVEL_DEFAULTS.minigame.dock.tailgateHoldSeconds;
    const now = world.now;

    for (const [sessionId, startedAt] of [...runtime.holds]) {
        if (now - startedAt + HOLD_EPSILON < hold) continue;

        const player = world.state.players.get(sessionId);

        if (player === undefined || laneIndexAt(station.cfg.workTiles, player.x, player.y) < 0) {
            runtime.holds.delete(sessionId);

            continue;
        }

        runtime.holds.clear();
        departTruck(world, 'tailgate');

        return;
    }
}

export function dockTick(world: World, dt: number): void {
    const station = dockStation(world);

    if (station === null) return;

    const runtime = runtimeOf(world, station);
    const cfg = dockConfig(station);
    const { truck } = world.state;
    const now = world.now;

    if (truck.phase === 'away' && now >= truck.arrivesAt) {
        truck.phase = 'docked';
        runtime.beepAt = truck.arrivesAt;

        for (const lane of runtime.lanes) lane.lastBeep = -1;
    }

    if (truck.phase === 'docked') {
        truck.beepPhase = beepPhase(runtime.beepAt, periodMsOf(cfg), now);

        if (runtime.tailgateUntil > now) checkHolds(world, station, runtime);
        else runtime.holds.clear();

        if (truck.phase === 'docked' && now >= truck.leavesAt) departTruck(world, 'timer');
    } else if (truck.phase === 'leaving') {
        truck.beepPhase = 0;

        if (now >= runtime.leavingUntil) armNext(world, runtime);
    }

    writeMg(world, station, runtime);
}

function shove(ctx: StationCtx, player: PlayerState, t: number): void {
    const { world } = ctx;
    const { truck } = world.state;

    if (truck.phase !== 'docked') return;
    if (truck.loaded >= truck.slots) return;

    const lane = laneIndexAt(ctx.cfg.workTiles, player.x, player.y);
    const runtime = runtimeOf(world, ctx.station);
    const laneRuntime = runtime.lanes[lane];
    const tile = ctx.cfg.workTiles[lane];

    if (laneRuntime === undefined || tile === undefined) return;
    if (laneRuntime.itemId === '') return;

    const cfg = dockConfig(ctx.station);
    const tMs = world.inputClock(ctx.sessionIdOf(player), t) * 1000;
    const beep = nearestBeep(
        runtime.beepAt * 1000,
        periodMsOf(cfg),
        beepCountOf(world, cfg),
        tMs,
    );

    if (beep.index === laneRuntime.lastBeep) return;

    laneRuntime.lastBeep = beep.index;

    const [cx, cy] = centreOf(tile);
    const result = judgeShove(beep.deltaMs, { perfectMs: cfg.perfectMs, okMs: cfg.okMs });

    // A miss stalls the stick halfway in and blocks the lane; it never returns.
    if (result === 'miss') {
        laneRuntime.stalled = true;
        ctx.fx('bonk', cx, cy, { text: 'STALL' });
        ctx.setMg(buildMg(world, ctx.station, runtime));

        return;
    }

    if (result === 'perfect') {
        ctx.fx('thunk', cx, cy, { text: 'THUD' });
        runtime.hits += 'P';
    } else {
        ctx.fx('clink', cx, cy, { text: 'scrape' });
        runtime.hits += 'O';
    }

    destroyItem(world, laneRuntime.itemId);
    emptyLane(laneRuntime);
    truck.loaded += 1;

    const order = orderForTruck(world, truck.id);

    if (order !== undefined) order.shipped += 1;

    if (truck.loaded >= truck.slots) {
        runtime.tailgateUntil = tailgateWindowEnd(
            world.now,
            truck.leavesAt,
            cfg.tailgateWindowSeconds,
        );
    }

    ctx.setMg(buildMg(world, ctx.station, runtime));
}

function tailgate(ctx: StationCtx, player: PlayerState, v: number | string | undefined): void {
    const { world } = ctx;
    const runtime = runtimeOf(world, ctx.station);
    const sessionId = ctx.sessionIdOf(player);

    if (v === 'up') {
        runtime.holds.delete(sessionId);

        return;
    }

    if (v !== 'down') return;
    if (world.state.truck.phase !== 'docked') return;

    // A player already holding E when the last slot fills has to press again:
    // the window is the reward for watching the truck, not for leaning on a key.
    if (runtime.tailgateUntil <= world.now) return;
    if (laneIndexAt(ctx.cfg.workTiles, player.x, player.y) < 0) return;

    runtime.holds.set(sessionId, world.now);
}

class DockGame implements MinigameInstance {
    onJoin(): void {}

    onLeave(ctx: StationCtx, player: PlayerState): void {
        runtimeOf(ctx.world, ctx.station).holds.delete(ctx.sessionIdOf(player));
    }

    /** `E` on a lane: set a stick down, take one back, or slam nothing at all. */
    onInteract(ctx: StationCtx, player: PlayerState): boolean {
        const { world } = ctx;
        const lane = laneIndexAt(ctx.cfg.workTiles, player.x, player.y);

        if (lane < 0) return false;

        const runtime = runtimeOf(world, ctx.station);
        const laneRuntime = runtime.lanes[lane];
        const tile = ctx.cfg.workTiles[lane];

        if (laneRuntime === undefined || tile === undefined) return false;

        // While the window is open `E` means SLAM, and the keydown that opens the
        // hold must not also drop a stick on the lane.
        if (runtime.tailgateUntil > world.now) return true;

        const [cx, cy] = centreOf(tile);
        const carried = carriedItem(world, player);

        if (carried !== null) {
            if (carried.type !== 'stick') return false;

            const { truck } = world.state;

            if (truck.phase === 'docked' && truck.loaded >= truck.slots) {
                ctx.fx('bonk', cx, cy, { text: 'FULL' });

                return true;
            }

            // A short fuse is one knot fewer at the Jig, so an unchecked lane
            // would make the wrong stick strictly faster to make and to ship.
            const order = world.state.orders.get(activeOrderId(world));

            if (order !== undefined && carried.fuseLength !== order.fuseLength) {
                ctx.fx('bonk', cx, cy, { text: 'WRONG FUSE' });

                return true;
            }

            if (laneRuntime.itemId !== '') {
                ctx.fx('bonk', cx, cy, { text: 'BUSY' });

                return true;
            }

            const item = takeCarried(world, ctx.sessionIdOf(player));

            if (item === null) return true;

            stageOnLane(world, item, ctx.station.st.id, tile);
            laneRuntime.itemId = item.id;
            laneRuntime.stalled = false;
            ctx.setMg(buildMg(world, ctx.station, runtime));

            return true;
        }

        if (player.carrying !== '') return false;
        if (laneRuntime.itemId === '') return false;

        // A stalled stick is halfway into the truck: only a shove moves it now.
        if (laneRuntime.stalled) return true;

        const item = world.state.items.get(laneRuntime.itemId);

        if (item === undefined) {
            emptyLane(laneRuntime);
            ctx.setMg(buildMg(world, ctx.station, runtime));

            return false;
        }

        if (!giveToPlayer(world, item, ctx.sessionIdOf(player))) return true;

        emptyLane(laneRuntime);
        ctx.setMg(buildMg(world, ctx.station, runtime));

        return true;
    }

    onMessage(
        ctx: StationCtx,
        player: PlayerState,
        op: MgOp,
        v: number | string | undefined,
        t: number,
    ): void {
        if (op === 'shove') shove(ctx, player, t);
        else if (op === 'tailgate') tailgate(ctx, player, v);
    }

    /** The cadence is world state, so it ticks in `dockTick`, not per station. */
    tick(): void {}

    /** Sticks are walked to the lanes; the dock has no input shelf to starve. */
    starved(): boolean {
        return false;
    }

    status(ctx: StationCtx): { state: 'idle' | 'starved' | 'working'; progress: number } {
        const { truck } = ctx.world.state;

        if (truck.phase !== 'docked') return { state: 'idle', progress: 0 };

        return {
            state: 'working',
            progress: truck.slots > 0 ? truck.loaded / truck.slots : 0,
        };
    }
}

export const dockModule: MinigameModule = {
    create(): MinigameInstance {
        return new DockGame();
    },
};

export const dockSystem: System = {
    name: 'dock',
    onStart: initOrders,
    tick: dockTick,

    onDayEnd(world: World, _status, reason): void {
        if (reason === 'clock') closeShift(world);
    },
};
