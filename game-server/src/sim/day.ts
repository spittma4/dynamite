import { bottleneckStation, gradeDay, profitAndLoss, utilizationLabel } from '../shared';
import type {
    EndReason,
    ItemType,
    PlayerReport,
    Product,
    ReportPayload,
    StationReport,
} from '../shared';
import { createMetrics, gradeInputsFor, metricsTick, snapshotMetrics } from './metrics';
import type { PlayerMetrics, StationMetrics } from './metrics';
import type { PlayerTallyKey } from './tally';
import type { System, World } from './World';

/**
 * Day end (contracts §9, §10.7). The shift's counters and samples become one
 * payload here and then stop moving: F03 broadcasts it and posts it, Laravel
 * stores it verbatim, and nothing downstream recomputes a figure that appears
 * in it — so this is the last place any of these numbers is decided.
 */

type TallyRow = Record<PlayerTallyKey, number>;

const NO_TALLY: TallyRow = {
    produced: 0,
    bubbles: 0,
    drops: 0,
    sooted: 0,
    fusesStomped: 0,
    niceSaves: 0,
    truckRides: 0,
};

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Sandbox has no book, no whistle and no paperwork (contracts §8). */
export function isSandbox(world: World): boolean {
    return world.level.day.endsOn === 'never';
}

/** The whole-shift fraction; `StationState.utilization` carries the rolling one. */
function utilizationOf(s: StationMetrics | undefined): number {
    return s === undefined ? 0 : round2(s.workingTicks / Math.max(1, s.totalTicks));
}

function fullnessOf(s: StationMetrics | undefined): number {
    return s === undefined ? 0 : s.inputFullnessSum / Math.max(1, s.fullnessSamples);
}

/** Where the player spent the most time on a work tile; '' if they never took one. */
function topStationOf(p: PlayerMetrics): string {
    let top = '';
    let best = 0;

    for (const [stationId, seconds] of Object.entries(p.secondsAtStation)) {
        if (seconds <= best) continue;

        best = seconds;
        top = stationId;
    }

    return top;
}

function playerRow(p: PlayerMetrics, tally: TallyRow): PlayerReport {
    const utilization = round2(p.workingSeconds / Math.max(1, p.presentSeconds));

    return {
        userId: p.userId,
        name: p.name,
        utilization,
        label: utilizationLabel(utilization),
        topStation: topStationOf(p),
        bubbles: tally.bubbles,
        drops: tally.drops,
        sooted: tally.sooted,
        fusesStomped: tally.fusesStomped,
        niceSaves: tally.niceSaves,
        truckRides: tally.truckRides,
    };
}

/**
 * Everything still on the floor, on a shelf or in a hand at the whistle was
 * bought and never sold, so it is waste alongside what blew up or fizzled and
 * what was scrapped. Each loss is counted under exactly one of the two tallies,
 * so summing both bills it once. Every type is counted here and the level
 * decides the bill: `profitAndLoss` prices a type with no `economy.wasteCost`
 * entry at nothing.
 */
function wasteOf(world: World): Partial<Record<ItemType, number>> {
    const waste: Partial<Record<ItemType, number>> = {};
    const add = (type: ItemType, count: number): void => {
        waste[type] = (waste[type] ?? 0) + count;
    };

    world.state.items.forEach((item) => add(item.type as ItemType, 1));

    for (const [type, count] of Object.entries(world.tally.destroyedByType)) {
        add(type as ItemType, count);
    }

    for (const [type, count] of Object.entries(world.tally.wastedByType)) {
        add(type as ItemType, count);
    }

    return waste;
}

/**
 * Revenue is what left on a truck, whether or not its order ever completed. An
 * order that shipped nothing is left out entirely: `profitAndLoss` throws on a
 * product the level does not price, and a zero has no business taking the whole
 * report down with it.
 */
function shippedByProduct(world: World): Partial<Record<Product, number>> {
    const shipped: Partial<Record<Product, number>> = {};

    world.state.orders.forEach((order) => {
        if (order.shipped === 0) return;

        const product = order.product as Product;

        shipped[product] = (shipped[product] ?? 0) + order.shipped;
    });

    return shipped;
}

export function buildReport(world: World, reason: EndReason): ReportPayload {
    const m = snapshotMetrics(world);
    const { state, tally, level } = world;
    const inputs = gradeInputsFor(world, reason);
    const day = gradeDay(inputs, level.grading, level.day);

    const stations: StationReport[] = level.stations.map((cfg) => ({
        id: cfg.id,
        utilization: utilizationOf(m.stations.get(cfg.id)),
    }));
    const bottleneckId = bottleneckStation(
        stations.map((s) => ({ ...s, inputShelfFullness: fullnessOf(m.stations.get(s.id)) })),
    );
    const worst = m.stations.get(bottleneckId);

    const players = [...m.players.values()]
        .map((p) => playerRow(p, tally.players.get(p.userId) ?? NO_TALLY))
        .sort((a, b) => {
            if (a.utilization !== b.utilization) return b.utilization - a.utilization;

            const [first, second] = [m.players.get(a.userId), m.players.get(b.userId)];

            return (first?.firstSeenTick ?? 0) - (second?.firstSeenTick ?? 0);
        });

    let fusesStomped = 0;
    let niceSaves = 0;
    let truckRides = 0;

    tally.players.forEach((row) => {
        fusesStomped += row.fusesStomped;
        niceSaves += row.niceSaves;
        truckRides += row.truckRides;
    });

    // An explosion pays nothing and an abandoned shift was never finished, so
    // neither earns the grade's multiplier (docs/18).
    const earned = reason === 'exploded' || reason === 'abandoned' ? 0 : day.multiplier;

    return {
        day: state.day,
        levelKey: state.levelKey,
        grade: day.grade,
        score: day.score,
        verdict: day.verdict,
        ordersCompleted: inputs.ordersCompleted,
        ordersTotal: inputs.ordersTotal,
        throughput: round1((inputs.ordersCompleted * 600) / Math.max(1, state.clock)),
        avgCycleSeconds: inputs.avgCycleSeconds,
        peakWip: inputs.peakWip,
        wipTimeline: [...m.wipTimeline],
        kegsMade: tally.counts.kegsMade,
        kegsUsed: tally.counts.kegsUsed,
        defects: tally.counts.defects,
        rework: 0,
        kegsExploded: tally.destroyedByType.keg,
        fusesStomped,
        fizzles: tally.destroyedByType.stick,
        niceSaves,
        truckRides,
        bottleneck: {
            stationId: bottleneckId,
            starvedSeconds: Math.round(worst?.starvedSeconds ?? 0),
            blockedSeconds: Math.round(worst?.blockedSeconds ?? 0),
        },
        stations,
        players,
        pnl: profitAndLoss(
            { shipped: shippedByProduct(world), waste: wasteOf(world) },
            level.economy,
            earned,
        ),
        materials: { purchased: tally.counts.kegsMade, shipped: inputs.shipped },
    };
}

/**
 * Last in `SYSTEMS`, so its `tick` samples a finished tick and its `onDayEnd`
 * sees the final state (contracts §11). A Sandbox day builds nothing: there is
 * no book to grade and F03 posts no run for it.
 */
export const reportSystem: System = {
    name: 'report',
    onStart(world: World): void {
        world.tally.reset();
        createMetrics(world);
    },
    tick: metricsTick,
    onDayEnd(world: World, _status, reason: EndReason): void {
        if (isSandbox(world)) return;

        world.setReport(buildReport(world, reason));
    },
};
