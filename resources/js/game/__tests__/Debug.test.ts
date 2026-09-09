import { describe, expect, it } from 'vitest';

import { PLAYER_HEADER, globalsLine, playerRow, totalsLine } from '../ui/Debug';

describe('globalsLine', () => {
    it('reads the tick, the patch rate, the clock and the two latencies', () => {
        expect(
            globalsLine({
                ticksPerSecond: 20,
                patchesPerSecond: 20.1,
                clock: 123.44,
                phase: 'running',
                rttMs: 34.4,
                lagMs: 61.2,
                players: 4,
                items: 37,
            }),
        ).toBe(
            'tick 20.0/s  patches 20.1/s  clock 123.4  phase running  rtt 34ms  lag 61ms  players 4  items 37',
        );
    });
});

describe('totalsLine', () => {
    it('reads groove, work in progress, the order tallies and the bottleneck', () => {
        expect(
            totalsLine({
                groove: 52,
                wip: 37,
                orders: { open: 3, partial: 1, complete: 4, failed: 0 },
                bottleneck: 'assembly-a',
                pressure: 0.92,
            }),
        ).toBe(
            'groove 52  wip 37  orders open 3 partial 1 complete 4 failed 0  bottleneck assembly-a 0.92',
        );
    });

    it('says none when no station has any pressure yet', () => {
        expect(
            totalsLine({
                groove: 50,
                wip: 0,
                orders: { open: 0, partial: 0, complete: 0, failed: 0 },
                bottleneck: '',
                pressure: 0,
            }),
        ).toContain('bottleneck -');
    });
});

describe('playerRow', () => {
    it('lines the columns up under the header', () => {
        const row = playerRow({
            name: 'Sam',
            x: 12.44,
            y: 8.1,
            seq: 812,
            stationId: 'powder-a',
            workTile: '12,9',
            speed: 0,
        });

        expect(row).toBe('Sam      12.4  8.1   812   powder-a    12,9   0.0');
        expect(PLAYER_HEADER.indexOf('station')).toBe(row.indexOf('powder-a'));
    });

    it('dashes the station and tile of a player on the floor', () => {
        expect(
            playerRow({
                name: 'Priya',
                x: 1,
                y: 2,
                seq: 3,
                stationId: '',
                workTile: '',
                speed: 4,
            }),
        ).toBe('Priya    1.0   2.0   3     -           -      4.0');
    });
});
