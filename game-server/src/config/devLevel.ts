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
    layout: 'mvp-small',
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
            anchor: [4, 2],
            workTiles: [[5, 4]],
            rackTiles: [],
            outputShelf: {
                tile: [7, 3],
                capacity: 6,
            },
            floorRing: {
                tiles: [[3, 4], [4, 4], [6, 4], [7, 4], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]],
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
            anchor: [12, 8],
            workTiles: [[13, 9], [14, 9]],
            rackTiles: [[16, 9]],
            inputShelf: {
                tile: [12, 9],
                capacity: 8,
                accepts: ['keg', 'casing'],
            },
            outputShelf: {
                tile: [12, 11],
                capacity: 4,
            },
            floorRing: {
                tiles: [
                    [11, 7],
                    [12, 7],
                    [13, 7],
                    [14, 7],
                    [15, 7],
                    [16, 7],
                    [11, 12],
                    [12, 12],
                    [13, 12],
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
            anchor: [23, 3],
            workTiles: [[23, 4], [23, 5], [23, 6], [23, 7]],
            rackTiles: [],
            floorRing: {
                tiles: [[22, 4], [22, 5], [22, 6], [22, 7]],
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
    key: 'mvp-small',
    width: 28,
    height: 18,
    walls: [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
        24, 25, 26, 27, 28, 37, 38, 55, 56, 60, 61, 62, 83, 84, 88, 89, 90, 91, 105, 107, 111,
        112, 139, 140, 148, 167, 168, 195, 196, 223, 224, 236, 237, 238, 239, 251, 252, 264,
        279, 280, 282, 297, 307, 308, 320, 335, 336, 353, 363, 364, 391, 392, 419, 420, 447,
        448, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490,
        491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503,
    ],
    spawn: [14, 15],
    breakRoom: [12, 14, 5, 3],
    blastBins: [[3, 3]],
    dockDoor: [24, 2, 3],
    truckBay: [24, 3, 3, 6],
    ramp: [[23, 4], [23, 5], [23, 6], [23, 7]],
    beaconPoles: {
        'powder-a': [8, 5],
        'assembly-a': [17, 10],
        'dock-a': [21, 3],
    },
    orderBoard: [10, 1],
    props: {
        toolCart: [17, 12],
        countdownSign: [9, 1],
        returnsPile: [19, 12],
        broomHook: [2, 10],
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
