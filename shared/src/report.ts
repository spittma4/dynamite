/**
 * The end-of-day payloads (contracts §9). F11 fills them in and F01 stores what
 * Node sends; nothing downstream recomputes a number that appears here.
 */

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Verdict = 'EXPLODED' | 'DISASTER' | 'ROUGH' | 'FINE' | 'SMOOTH' | 'FLOW';
export type PlayerLabel = 'EXCELLENT' | 'GOOD' | 'NEEDS FOCUS';
export type RunStatus = 'ended' | 'exploded' | 'abandoned';
export type EndReason = 'book' | 'clock' | 'exploded' | 'abandoned';

export interface BottleneckSummary {
    stationId: string;
    starvedSeconds: number;
    blockedSeconds: number;
}

export interface StationReport {
    id: string;
    utilization: number;
}

export interface PlayerReport {
    userId: string;
    name: string;
    utilization: number;
    label: PlayerLabel;
    topStation: string;
    bubbles: number;
    drops: number;
    /** A count of soot events, not `PlayerState.sooted`. */
    sooted: number;
    fusesStomped: number;
    niceSaves: number;
    truckRides: number;
}

/** `profit` and `coin` are integers; `profit` may be negative. */
export interface Pnl {
    revenue: number;
    waste: number;
    profit: number;
    multiplier: number;
    coin: number;
}

/** `purchased` = kegs made; `shipped` = sticks loaded onto a truck. */
export interface Materials {
    purchased: number;
    shipped: number;
}

export interface ReportPayload {
    day: number;
    levelKey: string;
    grade: Grade;
    score: number;
    verdict: Verdict;
    ordersCompleted: number;
    ordersTotal: number;
    /** Orders completed per 10 minutes of shift played. */
    throughput: number;
    avgCycleSeconds: number;
    peakWip: number;
    /** One sample per second from shift start. */
    wipTimeline: number[];
    kegsMade: number;
    kegsUsed: number;
    defects: number;
    rework: number;
    kegsExploded: number;
    fusesStomped: number;
    fizzles: number;
    niceSaves: number;
    truckRides: number;
    bottleneck: BottleneckSummary;
    stations: StationReport[];
    players: PlayerReport[];
    pnl: Pnl;
    materials: Materials;
}

export type RunPayload = ReportPayload & {
    /** A string on the wire; Laravel's `integer` rule accepts it. */
    factoryId: string;
    seed: number;
    startedAt: string;
    endedAt: string;
    status: RunStatus;
};
