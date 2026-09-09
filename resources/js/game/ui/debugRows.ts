import { bottleneckStation } from '@shared';

/**
 * The `~` overlay's text, built from plain data so it can be tested without a
 * scene. The station table is fixed-width because the whole point is scanning
 * one column down the rows while the factory runs.
 */

export interface ShelfLike {
    readonly length: number;
}

export interface StationRowInput {
    id: string;
    state: string;
    workers: number;
    efficiency: number;
    progress: number;
    inputShelf: ShelfLike;
    inputCap: number;
    outputShelf: ShelfLike;
    outputCap: number;
    floorCount: number;
    utilization: number;
    interruptsPerSecond: number;
}

export const STATION_HEADER =
    'station       st       w  eff   prog  in    out   flr  util  ips   last';

const COLUMNS = [14, 9, 3, 6, 6, 6, 6, 5, 6, 6] as const;

/** A station with no input shelf is never waiting on one, so it reads as full. */
export function fullness(shelfLength: number, cap: number): number {
    return cap > 0 ? shelfLength / cap : 1;
}

export function shelf(shelfLength: number, cap: number): string {
    return cap > 0 ? `${shelfLength}/${cap}` : '-';
}

export function bottleneckOf(stations: StationRowInput[]): string {
    return bottleneckStation(
        stations.map((s) => ({
            id: s.id,
            utilization: s.utilization,
            inputShelfFullness: fullness(s.inputShelf.length, s.inputCap),
        })),
    );
}

export function stationRow(station: StationRowInput, lastCycleSeconds: number | null): string {
    const cells = [
        station.id,
        station.state,
        String(station.workers),
        station.efficiency.toFixed(2),
        station.progress.toFixed(2),
        shelf(station.inputShelf.length, station.inputCap),
        shelf(station.outputShelf.length, station.outputCap),
        String(station.floorCount),
        station.utilization.toFixed(2),
        station.interruptsPerSecond.toFixed(1),
        lastCycleSeconds === null ? '-' : `${lastCycleSeconds.toFixed(1)}s`,
    ];

    return cells.map((cell, i) => cell.padEnd(COLUMNS[i] ?? 0)).join('');
}

/**
 * How long a station's last cycle took, measured the way a floor manager would:
 * from one start of work to the next.
 */
export class CycleTracker {
    private readonly entries = new Map<string, number[]>();
    private readonly wasWorking = new Map<string, boolean>();

    note(stationId: string, state: string, nowSeconds: number): void {
        const working = state === 'working';

        if (working && !this.wasWorking.get(stationId)) {
            const times = this.entries.get(stationId) ?? [];

            times.push(nowSeconds);
            if (times.length > 2) times.shift();
            this.entries.set(stationId, times);
        }

        this.wasWorking.set(stationId, working);
    }

    last(stationId: string): number | null {
        const times = this.entries.get(stationId);

        if (!times || times.length < 2) return null;

        return (times[1] ?? 0) - (times[0] ?? 0);
    }
}
