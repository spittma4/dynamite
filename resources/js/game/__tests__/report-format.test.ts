import { type LevelConfig, type PlayerReport, type ReportPayload, copy } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    formatClock,
    hazardLines,
    levelTitle,
    pnlLines,
    sparklineBuckets,
    stationName,
} from '../report/format';

const LEVEL = {
    name: 'Level 2 · Too Much Powder',
    stations: [
        { id: 'powder-a', type: 'boom_powder' },
        { id: 'assembly-a', type: 'assembly' },
        { id: 'dock-a', type: 'dock' },
    ],
} as unknown as LevelConfig;

function player(over: Partial<PlayerReport> = {}): PlayerReport {
    return {
        userId: '1',
        name: 'Sam',
        utilization: 0.98,
        label: 'EXCELLENT',
        topStation: 'powder-a',
        bubbles: 0,
        drops: 0,
        sooted: 0,
        fusesStomped: 0,
        niceSaves: 0,
        truckRides: 0,
        ...over,
    };
}

function report(over: Partial<ReportPayload> = {}): ReportPayload {
    return {
        day: 3,
        levelKey: 'level-02-too-much-powder',
        grade: 'D',
        score: 41,
        verdict: 'DISASTER',
        ordersCompleted: 4,
        ordersTotal: 11,
        throughput: 4,
        avgCycleSeconds: 372,
        peakWip: 37,
        wipTimeline: [0, 3, 12, 37],
        kegsMade: 31,
        kegsUsed: 8,
        defects: 2,
        rework: 0,
        kegsExploded: 0,
        fusesStomped: 0,
        fizzles: 0,
        niceSaves: 0,
        truckRides: 0,
        bottleneck: { stationId: 'assembly-a', starvedSeconds: 0, blockedSeconds: 84 },
        stations: [
            { id: 'powder-a', utilization: 0.98 },
            { id: 'assembly-a', utilization: 1 },
            { id: 'dock-a', utilization: 0.27 },
        ],
        players: [player()],
        pnl: { revenue: 480, waste: 212, profit: 268, multiplier: 0.75, coin: 201 },
        materials: { purchased: 31, shipped: 8 },
        ...over,
    };
}

describe('formatClock', () => {
    it('formats a clock as minutes and seconds', () => {
        expect(formatClock(372)).toBe('6:12');
        expect(formatClock(65)).toBe('1:05');
        expect(formatClock(9)).toBe('0:09');
    });

    it('floors fractional seconds and clamps a negative to zero', () => {
        expect(formatClock(59.9)).toBe('0:59');
        expect(formatClock(-4)).toBe('0:00');
    });
});

describe('levelTitle', () => {
    it('upper-cases the level name for the title', () => {
        expect(levelTitle(LEVEL)).toBe('LEVEL 2 · TOO MUCH POWDER');
    });
});

describe('stationName', () => {
    it('maps a station id to the label the floor uses', () => {
        expect(stationName('powder-a', LEVEL)).toBe('BOOM POWDER');
        expect(stationName('assembly-a', LEVEL)).toBe('ASSEMBLY');
    });

    it('reads an empty id as no station at all', () => {
        expect(stationName('', LEVEL)).toBe('(no station)');
    });

    it('falls back to the raw id when the level has no such station', () => {
        expect(stationName('powder-b', LEVEL)).toBe('powder-b');
    });
});

describe('pnlLines', () => {
    it('renders the factory column from the payload', () => {
        const lines = pnlLines(report(), copy);

        expect(lines[0]).toMatch(/^Orders completed +4 \/ 11$/);
        expect(lines[1]).toMatch(/^Throughput +4 \/ 10 min$/);
        expect(lines[2]).toMatch(/^Avg cycle time +6:12$/);
        expect(lines[3]).toMatch(/^Peak WIP +37$/);
        expect(lines[4]).toMatch(/^Rework +0$/);
        expect(lines[5]).toBe('');
        expect(lines[6]).toMatch(/^Verdict: +DISASTER$/);
        expect(lines[7]).toBe('Revenue 480 − Waste 212 = 268');
        expect(lines[8]).toBe('× D (0.75) = 201 coin');
        expect(lines).toHaveLength(9);
    });

    it('stamps a loss line for a negative profit', () => {
        const lines = pnlLines(
            report({ pnl: { revenue: 120, waste: 400, profit: -280, multiplier: 0.5, coin: 0 } }),
            copy,
        );

        expect(lines).toContain('Revenue 120 − Waste 400 = -280');
        expect(lines).toContain(copy.report.loss);
    });

    it('says who wrote the multiplier off when the factory exploded', () => {
        const lines = pnlLines(
            report({
                verdict: 'EXPLODED',
                grade: 'F',
                pnl: { revenue: 480, waste: 900, profit: -420, multiplier: 0, coin: 0 },
            }),
            copy,
        );

        expect(lines).toContain('× EXPLODED = 0 coin');
    });
});

describe('hazardLines', () => {
    const busy = report({
        kegsExploded: 3,
        fizzles: 3,
        players: [
            player({ name: 'Marco', bubbles: 14, drops: 7, truckRides: 1 }),
            player({ name: 'Jo', bubbles: 9, fusesStomped: 2, niceSaves: 1 }),
            player({ name: 'Sam', sooted: 1 }),
        ],
    });

    it('names who asked what they could do, loudest first', () => {
        const [bubbles] = hazardLines(busy);

        expect(bubbles).toBe('"WHAT CAN I DO?" bubbles emitted: Marco 14 · Jo 9');
    });

    it('omits the bubbles line when nobody bubbled', () => {
        const lines = hazardLines(report({ players: [player({ name: 'Marco' })] }));

        expect(lines.join(' | ')).not.toMatch(/WHAT CAN I DO/);
    });

    it('reports the hazards with the names attached', () => {
        const line = hazardLines(busy).find((l) => l.startsWith('Kegs exploded'));

        expect(line).toBe('Kegs exploded: 3   Fuses stomped: Jo 2   Sooted: Sam');
    });

    it('reports the oops line with the heaviest dropper', () => {
        const line = hazardLines(busy).find((l) => l.startsWith('Fizzles'));

        expect(line).toBe(
            'Fizzles: 3   Nice Saves: Jo 1   Truck rides: Marco 1   Most dropped: Marco (7)',
        );
    });

    it('omits a hazard segment whose count is zero', () => {
        const lines = hazardLines(
            report({ kegsExploded: 2, players: [player({ name: 'Jo', fusesStomped: 1 })] }),
        );

        expect(lines).toContain('Kegs exploded: 2   Fuses stomped: Jo 1');
        expect(lines.join(' | ')).not.toMatch(/Sooted|Fizzles|Nice Saves|Truck rides|Most dropped/);
    });

    it('says nothing at all on a shift where nothing went wrong', () => {
        expect(hazardLines(report())).toEqual([]);
    });
});

describe('sparklineBuckets', () => {
    it('leaves a series that already fits the box alone', () => {
        expect(sparklineBuckets([0, 3, 12, 37], 300)).toEqual([0, 3, 12, 37]);
    });

    it('keeps the peak of each pixel column when the shift is longer than the box', () => {
        expect(sparklineBuckets([1, 9, 2, 3, 4, 8], 3)).toEqual([9, 3, 8]);
    });

    it('has nothing to draw for an empty timeline', () => {
        expect(sparklineBuckets([], 300)).toEqual([]);
    });
});
