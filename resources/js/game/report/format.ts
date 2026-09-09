import {
    type Copy,
    type LevelConfig,
    type PlayerReport,
    type ReportPayload,
    STATION_LABEL,
    type StationType,
} from '@shared';

/**
 * The report card's strings (F11 §Design › Client). Every number is already
 * decided by the server, so nothing here computes: it only lays the payload out
 * as the two columns of docs/10, which is the whole joke.
 */

/** The monospace factory column is read as label-left, value-right. */
const PNL_WIDTH = 30;

/** Between two segments of a hazard line — wide enough to read as columns. */
const SEGMENT_GAP = '   ';

/** Between the names inside one segment. */
const NAME_GAP = ' · ';

/** `m:ss`, the shape a cycle time is quoted in. */
export function formatClock(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));

    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function levelTitle(level: LevelConfig): string {
    return level.name.toUpperCase();
}

/**
 * The report names a station the way the floor does. An id the level does not
 * know is printed raw rather than hidden, so a mismatch is visible instead of
 * quietly becoming "(no station)".
 */
export function stationName(id: string, level: LevelConfig): string {
    if (id === '') return '(no station)';

    const station = level.stations.find((s) => s.id === id);

    return station ? STATION_LABEL[station.type as StationType] : id;
}

/**
 * The FACTORY PERFORMANCE column. A loss gets its own line so the scene can
 * stamp it across the P&L in red without re-deciding what a loss is.
 */
export function pnlLines(p: ReportPayload, copy: Copy): string[] {
    const { pnl } = p;
    const lines = [
        row('Orders completed', `${p.ordersCompleted} / ${p.ordersTotal}`),
        row('Throughput', `${p.throughput} / 10 min`),
        row('Avg cycle time', formatClock(p.avgCycleSeconds)),
        row('Peak WIP', String(p.peakWip)),
        row('Rework', String(p.rework)),
        '',
        row('Verdict:', p.verdict),
        `Revenue ${pnl.revenue} − Waste ${pnl.waste} = ${pnl.profit}`,
    ];

    if (pnl.profit < 0) lines.push(copy.report.loss);

    // An exploded day has no grade worth multiplying by; the fire marshal took it.
    lines.push(
        p.verdict === 'EXPLODED'
            ? `× EXPLODED = ${pnl.coin} coin`
            : `× ${p.grade} (${pnl.multiplier}) = ${pnl.coin} coin`,
    );

    return lines;
}

/**
 * The bubbles, hazards and oops lines. A segment nobody earned is left out
 * entirely — a shift with no fizzles should not read `Fizzles: 0`, and a shift
 * where nothing went wrong says nothing at all.
 */
export function hazardLines(p: ReportPayload): string[] {
    const lines: string[] = [];
    const bubbles = namesWith(p.players, 'bubbles');

    if (bubbles) lines.push(`"WHAT CAN I DO?" bubbles emitted: ${bubbles}`);

    const hazards = segments([
        p.kegsExploded > 0 ? `Kegs exploded: ${p.kegsExploded}` : '',
        prefixed('Fuses stomped', namesWith(p.players, 'fusesStomped')),
        prefixed('Sooted', justNames(p.players, 'sooted')),
    ]);

    if (hazards) lines.push(hazards);

    const oops = segments([
        p.fizzles > 0 ? `Fizzles: ${p.fizzles}` : '',
        prefixed('Nice Saves', namesWith(p.players, 'niceSaves')),
        prefixed('Truck rides', namesWith(p.players, 'truckRides')),
        mostDropped(p.players),
    ]);

    if (oops) lines.push(oops);

    return lines;
}

/**
 * The WIP timeline reduced to one value per pixel column. A ten-minute shift
 * samples once a second, so the series outgrows the box: each column keeps its
 * bucket's peak, because a spike that got averaged away is the one thing the
 * line is there to show.
 */
export function sparklineBuckets(series: number[], columns: number): number[] {
    if (series.length <= columns) return [...series];

    const buckets: number[] = [];

    for (let column = 0; column < columns; column += 1) {
        const from = Math.floor((column * series.length) / columns);
        const to = Math.floor(((column + 1) * series.length) / columns);

        buckets.push(Math.max(...series.slice(from, Math.max(to, from + 1))));
    }

    return buckets;
}

function row(label: string, value: string): string {
    const gap = Math.max(1, PNL_WIDTH - label.length - value.length);

    return `${label}${' '.repeat(gap)}${value}`;
}

function segments(parts: string[]): string {
    return parts.filter((part) => part !== '').join(SEGMENT_GAP);
}

function prefixed(label: string, body: string): string {
    return body === '' ? '' : `${label}: ${body}`;
}

/** `Marco 14 · Jo 9` — the loudest first, and only those who did the thing. */
function namesWith(players: PlayerReport[], key: keyof PlayerReport): string {
    return counted(players, key)
        .map(([player, count]) => `${player.name} ${count}`)
        .join(NAME_GAP);
}

function justNames(players: PlayerReport[], key: keyof PlayerReport): string {
    return counted(players, key)
        .map(([player]) => player.name)
        .join(NAME_GAP);
}

function counted(players: PlayerReport[], key: keyof PlayerReport): [PlayerReport, number][] {
    return players
        .map((player): [PlayerReport, number] => [player, Number(player[key])])
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);
}

/** One name only: the point is who to look at, not a table of everyone. */
function mostDropped(players: PlayerReport[]): string {
    const [worst] = counted(players, 'drops');

    return worst ? `Most dropped: ${worst[0].name} (${worst[1]})` : '';
}
