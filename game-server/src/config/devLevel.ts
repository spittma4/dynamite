import type { FactoryConfigResponse } from '../laravel/api';
import type { LayoutConfig, LevelConfig } from '../shared';

/**
 * The level a room falls back to when Laravel has no active level and
 * `LEVELS_DIR` is empty — which is every dev machine until F12 ships the real
 * files. The floor is the MVP 28 x 18 one-line map (docs/02) and the station
 * numbers are docs/03, so a dev room plays the same shape as the campaign.
 *
 * Delete nothing here when F12 lands: a level file on disk always wins, and
 * this keeps `npm run dev` working on a machine with no database.
 */

const DEV_LEVEL: LevelConfig = {
    key: 'dev-fallback',
    name: 'Dev Fallback Line',
    notes:
        'The built-in level a room falls back to when Laravel has no level for the factory ' +
        'and LEVELS_DIR is empty. The floor is the MVP 28 x 18 one-line map (docs/02) and the ' +
        'station numbers are docs/03. F12 replaces it with the real level files.',
    day: {
        shiftSeconds: 600,
        orderBook: 8,
        endsOn: 'either',
        earlyFinishBonusPerMinute: 5,
        earlyFinishCap: 10,
    },
    players: {
        // Solo is the taster: one person can feel the loop out. The real game — the
        // crowding, the "stop making powder", the bottleneck argument — needs 3+.
        min: 1,
        max: 6,
    },
    layout: 'one-line',
    groove: {
        start: 50,
        weights: {
            onTimeShip: 8,
            shelfFullness: -4,
            floorItem: -0.5,
            rework: -1,
            starved: -2,
            jammed: -1,
            litFuse: -3,
            fizzle: -2,
            niceSave: 3,
            blastKeg: -10,
            primeStick: 1,
            truckComplete: 10,
        },
        thresholds: {
            onFire: 85,
            groove: 70,
            churn: 30,
            meltdown: 10,
        },
        cleanSweep: {
            holdSeconds: 3,
            snapTo: 60,
            cooldownSeconds: 90,
        },
    },
    clipboardSeconds: 3,
    bpm: 150,
    windowFloorsMs: {
        ok: 100,
        perfect: 45,
    },
    carry: {
        slowdown: 0.2,
        throwTiles: 2,
        throwFlightSeconds: 0.5,
        catchOkMs: 150,
        catchPerfectMs: 75,
        drop: {
            kegKnockOverOnHit: true,
            stickFizzleChance: 0.3,
            crateRattlyOnDrop: true,
        },
        truckRideSeconds: 20,
        footprints: false,
    },
    stations: [
        {
            id: 'powder-a',
            type: 'boom_powder',
            line: 'a',
            joinMode: 'press',
            anchor: [4, 3],
            workTiles: [[4, 5]],
            rackTiles: [],
            outputShelf: {
                tile: [7, 4],
                capacity: 6,
            },
            floorRing: {
                tiles: [
                    [8, 3],
                    [2, 4], [8, 4],
                    [2, 5], [3, 5], [5, 5], [6, 5], [7, 5], [8, 5],
                    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
                ],
            },
            nominalSeconds: 2.8,
            floorSeconds: 1.4,
            staffing: {
                '1': 1.0,
                '2': 1.05,
                '3': 0.9,
                '4': 0.75,
            },
            churnSensitive: true,
            minigame: {
                heat: {
                    minChargeSeconds: 0.7,
                    maxChargeSeconds: 1.5,
                    okMsAtMaxCharge: 225,
                    okMsAtMinCharge: 105,
                    deadCenterMs: 50,
                    churnBandDrift: 0.08,
                    overholdMs: 500,
                },
                comboTiers: [10, 25, 50],
                overflowSpills: true,
                comboBannerSeconds: 2,
            },
        },
        {
            id: 'assembly-a',
            type: 'assembly',
            line: 'a',
            joinMode: 'press',
            anchor: [13, 3],
            workTiles: [[13, 5], [14, 5]],
            rackTiles: [[13, 7]],
            inputShelf: {
                tile: [11, 4],
                capacity: 8,
                accepts: ['keg', 'casing', 'parts'],
            },
            outputShelf: {
                tile: [16, 4],
                capacity: 4,
            },
            floorRing: {
                tiles: [
                    [17, 3],
                    [17, 4],
                    [11, 5], [12, 5], [15, 5], [16, 5], [17, 5],
                    [11, 6], [12, 6], [13, 6], [14, 6], [15, 6], [16, 6], [17, 6],
                    [11, 7], [12, 7], [14, 7], [15, 7], [16, 7], [17, 7],
                ],
            },
            nominalSeconds: 6.0,
            floorSeconds: 5.0,
            staffing: {
                '1': 0.6,
                '2': 1.0,
                '3': 1.15,
                '4': 1.1,
                '5': 0.95,
                '6': 0.8,
                '8': 0.5,
            },
            churnSensitive: false,
            minigame: {
                pour: {
                    beatsByQuality: {
                        '1.0': 5,
                        '0.7': 7,
                        '0.4': 8,
                    },
                    perfectMs: 60,
                    okMs: 140,
                    primeKegWindowMultiplier: 1.5,
                },
                knots: {
                    long: 3,
                    short: 2,
                    secondsPerKnot: 0.4,
                    perfectMs: 60,
                    okMs: 140,
                },
                crimp: {
                    clicks: 3,
                    leadSeconds: 0.4,
                    clickSeconds: 0.4,
                    perfectMs: 80,
                    okMs: 180,
                },
                toss: {
                    arcSeconds: 0.5,
                    perfectMs: 120,
                    okMs: 250,
                },
                casings: {
                    stock: 3,
                    dentChance: 0.3,
                },
            },
        },
        {
            id: 'dock-a',
            type: 'dock',
            line: 'a',
            joinMode: 'stand',
            anchor: [22, 1],
            workTiles: [[22, 4], [23, 4], [24, 4], [25, 4]],
            rackTiles: [],
            floorRing: {
                tiles: [
                    [21, 4],
                    [20, 5], [21, 5], [22, 5], [23, 5], [24, 5], [25, 5], [26, 5],
                    [20, 6], [21, 6], [22, 6], [23, 6], [24, 6], [25, 6], [26, 6],
                ],
            },
            nominalSeconds: 1.0,
            floorSeconds: 1.0,
            staffing: {
                '1': 1.0,
                '2': 1.6,
                '3': 1.9,
                '4': 1.8,
                '5': 1.5,
                '6': 1.2,
                '8': 1.0,
            },
            churnSensitive: false,
            minigame: {
                beepHz: 1,
                perfectMs: 70,
                okMs: 180,
                tailgateWindowSeconds: 3,
                tailgateHoldSeconds: 0.5,
                leaveSeconds: 1.5,
            },
        },
    ],
    recipes: {
        keg: {
            station: 'boom_powder',
            inputs: {},
            output: {
                type: 'keg',
                pours: 2,
            },
        },
        red_stick: {
            station: 'assembly',
            inputs: {
                casing: 1,
                pour: 1,
                fuse: 1,
                cap: 1,
            },
            output: {
                type: 'stick',
                product: 'red_stick',
            },
        },
    },
    orders: {
        firstAt: 20,
        everySeconds: 60,
        truckWaitSeconds: 20,
        mix: [
            {
                type: 'red_stick',
                weight: 10,
            },
        ],
        qtyPerTruck: {
            base: 8,
            rampPerMinute: 0.5,
        },
    },
    hazards: {
        fuseSeconds: 6,
        chainFuseSeconds: 1.5,
        blastRadius: 1,
        chainWindowSeconds: 3,
        sparks: {
            slammerRedline: 1.0,
            jammedPer10s: 0.5,
            crimpOnDented: 0.3,
        },
        fuel: {
            floorKeg: 1,
            spillTile: 1,
            shelfKeg: 1,
        },
        incidentThreshold: 4,
        factoryExplosionThreshold: 10,
        explosionEndsRound: true,
        dangerWarningAt: 0.5,
        stompSeconds: 1.0,
        stunSeconds: 2,
        knockbackTiles: 2,
        litKegCarry: true,
        repairSeconds: 10,
        bannerSeconds: 3,
    },
    grading: {
        weights: {
            onTime: 50,
            wip: 20,
            quality: 15,
            cycle: 15,
            incident: -5,
            heroCap: 10,
        },
        thresholds: {
            A: 90,
            B: 75,
            C: 60,
            D: 40,
        },
        targets: {
            wip: 16,
            cycleSeconds: 240,
        },
        multiplier: {
            A: 1.5,
            B: 1.25,
            C: 1.0,
            D: 0.75,
            F: 0.5,
        },
        verdict: {
            flow: 1.0,
            smooth: 0.75,
            fine: 0.5,
            rough: 0.25,
        },
        advanceOn: 'C',
    },
    economy: {
        price: {
            red_stick: 10,
        },
        wasteCost: {
            keg: 4,
            casing: 2,
            stick: 6,
            crate: 8,
        },
    },
    scaling: {
        breakpoints: [
            {
                // Small crew: a shorter book and slower trucks, so one pair of hands can
                // actually finish a day instead of drowning in an eight-order book.
                maxPlayers: 2,
                lines: 1,
                truckEverySeconds: 90,
                orderBook: 4,
                qtyPerTruck: { base: 3, rampPerMinute: 0 },
            },
            {
                maxPlayers: 6,
                lines: 1,
                truckEverySeconds: 60,
                orderBook: 8,
            },
        ],
    },
};

const DEV_LAYOUT: LayoutConfig = {
    key: 'one-line',
    width: 28,
    height: 18,
    walls: [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
        24, 25, 26, 27,
        28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 55,
        56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 83,
        84, 85, 86, 87, 88, 89, 90, 91, 95, 96, 97, 98, 99, 100, 102, 105, 111,
        112, 113, 115, 116, 117, 118, 119, 123, 124, 125, 126, 127, 128, 138, 139,
        140, 167,
        168, 195,
        196, 223,
        224, 251,
        252, 279,
        280, 307,
        308, 335,
        336, 363,
        364, 391,
        392, 419,
        420, 430, 447,
        448, 475,
        476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 491, 492, 493,
        494, 495, 496, 497, 498, 499, 500, 501, 502, 503,
    ],
    spawn: [14, 16],
    breakRoom: [3, 14, 6, 3],
    blastBins: [[1, 7], [19, 7]],
    dockDoor: [22, 0, 5],
    truckBay: [22, 1, 5, 3],
    ramp: [[22, 4], [23, 4], [24, 4], [25, 4]],
    beaconPoles: {
        'powder-a': [6, 3],
        'assembly-a': [12, 3],
        'dock-a': [21, 3],
    },
    orderBoard: [18, 3],
    props: {
        toolCart: [1, 4],
        countdownSign: [26, 4],
        returnsPile: [18, 6],
        broomHook: [10, 15],
    },
};

/** A fresh copy per call, so a room that scales its level cannot poison the next. */
export function devFactoryConfig(factoryId: string): FactoryConfigResponse {
    return {
        factory: { id: factoryId, name: 'Dev factory', day: 1, coin: 0, ownerUserId: '' },
        level: JSON.parse(JSON.stringify(DEV_LEVEL)) as LevelConfig,
        layout: JSON.parse(JSON.stringify(DEV_LAYOUT)) as LayoutConfig,
        members: [],
    };
}
