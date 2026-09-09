import { TICK_HZ, gradeDay } from '../shared';
import type { EndReason, GradeInputs } from '../shared';
import { cleanSweepCount } from './groove';
import type { World } from './World';

/**
 * The instrument panel (contracts §10.7). It samples a finished tick — it runs
 * last in `SYSTEMS` — and owns both `utilization` fields and `FactoryState.score`,
 * so no other system has to decide what "busy" means.
 */

export interface StationMetrics {
    workingTicks: number;
    totalTicks: number;
    starvedSeconds: number;
    blockedSeconds: number;
    inputFullnessSum: number;
    fullnessSamples: number;
    /** A ring of the last `ROLLING_WINDOW_TICKS` busy flags, summed as it turns. */
    rolling: Uint8Array;
    rollingIndex: number;
    rollingSum: number;
}

export interface PlayerMetrics {
    userId: string;
    name: string;
    firstSeenTick: number;
    presentSeconds: number;
    workingSeconds: number;
    secondsAtStation: Record<string, number>;
}

/** `clock` seconds, floored: the report talks in whole seconds. */
export interface OrderTiming {
    startedAt: number | null;
    completedAt: number | null;
}

export interface MetricsState {
    ticks: number;
    wipTimeline: number[];
    stations: Map<string, StationMetrics>;
    players: Map<string, PlayerMetrics>;
    orders: Map<string, OrderTiming>;
}

/** 30 s at 20 Hz — long enough to mean something on the HUD, short enough to move. */
export const ROLLING_WINDOW_TICKS = 600;

const metrics = new WeakMap<World, MetricsState>();

/** `wipTimeline[i]` is the WIP at whole second `i`, so second 0 is seeded empty. */
function blank(): MetricsState {
    return {
        ticks: 0,
        wipTimeline: [0],
        stations: new Map(),
        players: new Map(),
        orders: new Map(),
    };
}

export function createMetrics(world: World): void {
    metrics.set(world, blank());
}

export function snapshotMetrics(world: World): MetricsState {
    const found = metrics.get(world);

    if (found === undefined) throw new Error('metrics were never created for this world');

    return found;
}

function stationMetrics(m: MetricsState, id: string): StationMetrics {
    let found = m.stations.get(id);

    if (found === undefined) {
        found = {
            workingTicks: 0,
            totalTicks: 0,
            starvedSeconds: 0,
            blockedSeconds: 0,
            inputFullnessSum: 0,
            fullnessSamples: 0,
            rolling: new Uint8Array(ROLLING_WINDOW_TICKS),
            rollingIndex: 0,
            rollingSum: 0,
        };
        m.stations.set(id, found);
    }

    return found;
}

/** Keyed by `userId`, so a player who left and rejoined reads as one shift. */
function playerMetrics(m: MetricsState, userId: string, name: string): PlayerMetrics {
    let found = m.players.get(userId);

    if (found === undefined) {
        found = {
            userId,
            name,
            firstSeenTick: m.ticks,
            presentSeconds: 0,
            workingSeconds: 0,
            secondsAtStation: {},
        };
        m.players.set(userId, found);
    }

    return found;
}

function orderTiming(m: MetricsState, id: string): OrderTiming {
    let found = m.orders.get(id);

    if (found === undefined) {
        found = { startedAt: null, completedAt: null };
        m.orders.set(id, found);
    }

    return found;
}

function sampleStations(world: World, m: MetricsState, dt: number): void {
    world.state.stations.forEach((st, id) => {
        const s = stationMetrics(m, id);
        const working = st.state === 'working' ? 1 : 0;

        s.totalTicks++;
        s.workingTicks += working;

        // `damaged` is neither: a broken machine is not waiting on its supplier
        // and it is not backed up, it is off.
        if (st.state === 'starved') s.starvedSeconds += dt;
        if (st.state === 'jammed') s.blockedSeconds += dt;

        s.rollingSum -= s.rolling[s.rollingIndex] ?? 0;
        s.rolling[s.rollingIndex] = working;
        s.rollingSum += working;
        s.rollingIndex = (s.rollingIndex + 1) % ROLLING_WINDOW_TICKS;
    });
}

function samplePlayers(world: World, m: MetricsState, dt: number): void {
    const { state } = world;

    state.players.forEach((player) => {
        const p = playerMetrics(m, player.userId, player.name);

        p.name = player.name;
        p.presentSeconds += dt;

        if (player.stationId === '' || player.workTile === '') return;

        p.secondsAtStation[player.stationId] = (p.secondsAtStation[player.stationId] ?? 0) + dt;

        if (state.stations.get(player.stationId)?.state === 'working') p.workingSeconds += dt;
    });
}

function boundOrderIds(world: World): Set<string> {
    const bound = new Set<string>();

    world.state.items.forEach((item) => {
        if (item.orderId !== '') bound.add(item.orderId);
    });

    return bound;
}

/** Once a second: the numbers a report reads, and the two the HUD watches. */
function sampleSecond(world: World, m: MetricsState): void {
    const { state } = world;
    const second = Math.floor(state.clock);
    const bound = boundOrderIds(world);

    m.wipTimeline.push(state.items.size);

    state.stations.forEach((st, id) => {
        const s = stationMetrics(m, id);

        // A station with no input shelf contributes 0, so `bottleneckStation`
        // can never blame it for a queue it cannot hold.
        s.inputFullnessSum += st.inputCap > 0 ? st.inputShelf.length / st.inputCap : 0;
        s.fullnessSamples++;
        st.utilization = s.rollingSum / Math.min(ROLLING_WINDOW_TICKS, Math.max(1, s.totalTicks));
    });

    state.orders.forEach((order, id) => {
        const timing = orderTiming(m, id);

        if (timing.startedAt === null && bound.has(id)) timing.startedAt = second;
        if (timing.completedAt === null && order.status === 'complete') timing.completedAt = second;
    });

    state.players.forEach((player) => {
        const p = m.players.get(player.userId);

        if (p === undefined) return;

        player.utilization = p.presentSeconds > 0 ? p.workingSeconds / p.presentSeconds : 0;
    });

    state.score = gradeDay(gradeInputsFor(world, null), world.level.grading, world.level.day).score;
}

export function metricsTick(world: World, dt: number): void {
    const m = snapshotMetrics(world);

    sampleStations(world, m, dt);
    samplePlayers(world, m, dt);

    m.ticks++;

    if (m.ticks % TICK_HZ === 0) sampleSecond(world, m);
}

/**
 * F02 grades the day; this only says what happened. `reason` is `null` for the
 * running score, which is the same sum with the day not yet over.
 */
export function gradeInputsFor(world: World, reason: EndReason | null): GradeInputs {
    const m = snapshotMetrics(world);
    const { state, tally } = world;
    let ordersCompleted = 0;
    let shipped = 0;
    let cycleSum = 0;
    let cycleCount = 0;
    let niceSaves = 0;
    let peakWip = 0;

    // The last truck of the day settles inside `onDayEnd`, after the final
    // per-second sample, so an order the report already counts as completed
    // would otherwise be missing from the mean it belongs to: a completion the
    // sampler never saw happened now.
    const second = Math.floor(state.clock);

    state.orders.forEach((order, id) => {
        if (order.status === 'complete') ordersCompleted++;

        shipped += order.shipped;

        const timing = m.orders.get(id);

        if (timing === undefined || timing.startedAt === null) return;

        const completedAt = timing.completedAt ?? (order.status === 'complete' ? second : null);

        if (completedAt === null) return;

        cycleSum += completedAt - timing.startedAt;
        cycleCount++;
    });

    for (const wip of m.wipTimeline) peakWip = Math.max(peakWip, wip);

    tally.players.forEach((row) => {
        niceSaves += row.niceSaves;
    });

    const bookDone = reason === 'book';

    return {
        ordersCompleted,
        ordersTotal: state.bookTotal,
        peakWip,
        complaints: 0,
        shipped,
        avgCycleSeconds: cycleCount > 0 ? Math.round(cycleSum / cycleCount) : 0,
        incidents: tally.counts.incidents,
        cleanSweeps: cleanSweepCount(world),
        niceSaves,
        bookDone,
        remainingSeconds: bookDone ? Math.max(0, state.shiftSeconds - state.clock) : 0,
        exploded: reason === 'exploded',
    };
}
