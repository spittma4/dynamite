/**
 * The bottleneck estimate from docs/05: pressure is how busy a station is times
 * how deep the queue in front of it is. A starved station reads as zero, which
 * is right — it isn't the constraint, its supplier is.
 */

export interface StationPressure {
    id: string;
    utilization: number;
    inputShelfFullness: number;
}

export function bottleneckStation(stations: StationPressure[]): string {
    let worstId = '';
    let worstPressure = -1;

    for (const station of stations) {
        const pressure = station.utilization * station.inputShelfFullness;

        if (pressure > worstPressure) {
            worstPressure = pressure;
            worstId = station.id;
        }
    }

    return worstId;
}
