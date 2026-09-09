import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    validateLayoutConfig,
    validateLevelConfig,
    validateLevelOnLayout,
} from '../src/config/validate';
import type { LayoutConfig, LevelConfig, StationConfig, Tile } from '../src/config/types';
import {
    LEVEL_DEFAULTS,
    breakpointFor,
    efficiencyFor,
    packTile,
    qtyForTruck,
    scaleLevel,
    tileKey,
    truckSchedule,
} from '../src/index';

/**
 * The files this repo actually ships, read from disk rather than from a
 * fixture: a level that fails here is a level that would throw at room create,
 * so this suite is the gate F01's PHP schema pass and F03's runtime pass sit
 * behind (F12 B9).
 */

const LEVELS_DIR = fileURLToPath(new URL('../../config/game/levels', import.meta.url));
const LAYOUTS_DIR = fileURLToPath(new URL('../../config/game/layouts', import.meta.url));

const LEVEL_KEYS = [
    'level-01-basic-flow',
    'level-02-too-much-powder',
    'level-03-the-bottleneck',
    'level-04-too-many-helpers',
    'sandbox',
] as const;

type LevelKey = (typeof LEVEL_KEYS)[number];

function readJson<T>(dir: string, name: string): T {
    return JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as T;
}

/** The bytes on disk, before `validateLevelConfig` fills the §13 defaults in. */
function rawLevel(key: LevelKey): Record<string, unknown> {
    return readJson<Record<string, unknown>>(LEVELS_DIR, key);
}

function level(key: LevelKey): LevelConfig {
    const result = validateLevelConfig(rawLevel(key));

    if (!result.ok) throw new Error(`${key}: ${result.errors.join('\n')}`);

    return result.value;
}

const rawLayout = readJson<Record<string, unknown>>(LAYOUTS_DIR, 'one-line');
const layout = (() => {
    const result = validateLayoutConfig(rawLayout);

    if (!result.ok) throw new Error(`one-line: ${result.errors.join('\n')}`);

    return result.value;
})();

const walls = new Set(layout.walls);

function isWall(tile: Tile): boolean {
    return walls.has(packTile(tile[0], tile[1], layout.width));
}

function rectTiles(rect: readonly number[]): Tile[] {
    const [x = 0, y = 0, w = 0, h = 0] = rect;
    const tiles: Tile[] = [];

    for (let ty = y; ty < y + h; ty++) {
        for (let tx = x; tx < x + w; tx++) tiles.push([tx, ty]);
    }

    return tiles;
}

function stationOf(config: LevelConfig, id: string): StationConfig {
    const station = config.stations.find((s) => s.id === id);

    if (station === undefined) throw new Error(`no station ${id}`);

    return station;
}

/**
 * A stick reaches the truck in one pair of hands, one at a time, so a book is a
 * labour sum over the whole crew and not a jig calculation — which is what
 * `qtyPerTruck 8 = 80 % of the jig's 10 sticks a minute` forgot. Every term
 * below is a *lower* bound on the work (straight-line distances, best-play
 * cycle times, no clipboard, no interrupt bubbles, no jams, no missed windows,
 * no walking between roles), so the rate they add up to is a ceiling the real
 * floor never reaches. `HEADROOM` is the share of that ceiling a book may ask
 * for: the interrupt bubbles alone spend `interrupts.pauseSeconds` in every
 * `everySeconds` (8 %), the clipboard costs `clipboardSeconds` on every station
 * join, and the shipped books sit at 47-67 % of the ceiling, so 70 % is the
 * line between a demanding day and one no crew can ship.
 */
const HEADROOM = 0.7;

function distanceBetween(a: Tile, b: Tile): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Carrying an item there and walking back empty, with a beat at each end. */
function carryRoundTrip(config: LevelConfig, from: Tile, to: Tile): number {
    const speed = config.movement?.tilesPerSecond ?? LEVEL_DEFAULTS.movement.tilesPerSecond;
    const handling = config.carry.putDownSeconds ?? LEVEL_DEFAULTS.carry.putDownSeconds;
    const tiles = distanceBetween(from, to);

    return tiles / (speed * (1 - config.carry.slowdown)) + tiles / speed + 2 * handling;
}

function shelfTile(station: StationConfig, shelf: 'inputShelf' | 'outputShelf'): Tile {
    const tile = station[shelf]?.tile;

    if (tile === undefined) throw new Error(`${station.id} has no ${shelf}`);

    return tile;
}

/** The powder, the two hauls and the shove: what one stick costs off the jig. */
function haulSecondsPerStick(config: LevelConfig): number {
    const powder = stationOf(config, 'powder-a');
    const assembly = stationOf(config, 'assembly-a');
    const dock = stationOf(config, 'dock-a');
    const outShelf = shelfTile(assembly, 'outputShelf');
    const lane = layout.ramp.reduce((closest, tile) =>
        distanceBetween(outShelf, tile) < distanceBetween(outShelf, closest) ? tile : closest,
    );
    const kegsPerStick = 1 / (config.recipes.keg?.output.pours ?? 1);
    const { beepHz } = dock.minigame as { beepHz: number };

    const kegRun = carryRoundTrip(
        config,
        shelfTile(powder, 'outputShelf'),
        shelfTile(assembly, 'inputShelf'),
    );

    return (
        kegsPerStick * (powder.floorSeconds + kegRun) +
        carryRoundTrip(config, outShelf, lane) +
        0.5 / beepHz
    );
}

/** Sticks a second with `workers` on the jig: the machine or the hands, whichever runs out. */
function capacityAt(config: LevelConfig, crew: number, workers: number): number {
    const assembly = stationOf(config, 'assembly-a');
    const machineSeconds = assembly.floorSeconds / efficiencyFor(assembly.staffing, workers);

    return Math.min(
        1 / machineSeconds,
        crew / (workers * machineSeconds + haulSecondsPerStick(config)),
    );
}

/** The best a crew of this size can do, over every way it can split itself up. */
function crewCapacity(config: LevelConfig, crew: number): number {
    let best = 0;

    for (let workers = 1; workers <= crew; workers++) {
        best = Math.max(best, capacityAt(config, crew, workers));
    }

    return best;
}

/** The sticks a scaled book asks for, and the window the trucks give to ship them. */
function demandOf(config: LevelConfig): { sticks: number; seconds: number } {
    let sticks = 0;
    let seconds = 0;

    for (let index = 0; index < config.day.orderBook; index++) {
        const slot = truckSchedule(config.orders, index);

        sticks += qtyForTruck(config.orders, slot.arrivesAt);
        seconds = slot.leavesAt;
    }

    return { sticks, seconds };
}

function demandRate(config: LevelConfig, crew: number): number {
    const { sticks, seconds } = demandOf(scaleLevel(config, crew));

    return seconds > 0 ? sticks / seconds : 0;
}

/** The smallest crew a breakpoint has to serve: one past the band below it. */
function lowestCrewFor(config: LevelConfig, index: number): number {
    const below = config.scaling.breakpoints[index - 1];

    return below === undefined ? config.players.min : below.maxPlayers + 1;
}

function at(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((node, step) => {
        if (node === null || typeof node !== 'object') return undefined;

        return (node as Record<string, unknown>)[step];
    }, root);
}

/** Deletes a dotted path so two files can be compared everywhere else. */
function strip(root: Record<string, unknown>, path: string): void {
    const steps = path.split('.');
    const last = steps.pop() as string;
    const parent = at(root, steps.join('.')) ?? root;

    if (steps.length > 0 && (parent === null || typeof parent !== 'object')) return;

    delete (parent as Record<string, unknown>)[last];
}

function without(key: LevelKey, paths: readonly string[]): Record<string, unknown> {
    const copy = rawLevel(key);

    for (const path of paths) strip(copy, path);

    return copy;
}

const IDENTITY = ['key', 'name', 'notes'] as const;
const ASSEMBLY_STAFFING = 'stations.1.staffing';

/** Contracts §8 / F12 B2: the only cells the ladder is allowed to move. */
const LADDER: Record<Exclude<LevelKey, 'level-02-too-much-powder'>, readonly string[]> = {
    'level-01-basic-flow': [
        ...IDENTITY,
        'day.orderBook',
        'players.min',
        'hazards.explosionEndsRound',
        'scaling.breakpoints',
    ],
    'level-03-the-bottleneck': [
        ...IDENTITY,
        'day.orderBook',
        'players.min',
        'orders.everySeconds',
        'orders.qtyPerTruck',
        'scaling.breakpoints',
    ],
    'level-04-too-many-helpers': [
        ...IDENTITY,
        ASSEMBLY_STAFFING,
        'players.min',
        'scaling.breakpoints',
    ],
    sandbox: [
        ...IDENTITY,
        'day.shiftSeconds',
        'day.orderBook',
        'day.endsOn',
        'players.min',
        'hazards.explosionEndsRound',
        'scaling.breakpoints',
    ],
};

const TIMED = LEVEL_KEYS.filter((key) => key !== 'sandbox');

describe('the levels this repo ships', () => {
    it('ships exactly the five campaign files', () => {
        const files = readdirSync(LEVELS_DIR)
            .filter((name) => name.endsWith('.json'))
            .sort();

        expect(files).toEqual(LEVEL_KEYS.map((key) => `${key}.json`));
    });

    it.each(LEVEL_KEYS)('accepts %s', (key) => {
        const result = validateLevelConfig(rawLevel(key));

        expect(result.ok ? [] : result.errors).toEqual([]);
    });

    it.each(LEVEL_KEYS)('names %s after its file', (key) => {
        expect(rawLevel(key).key).toBe(key);
    });

    it.each(LEVEL_KEYS)('stands %s on the one-line layout', (key) => {
        expect(rawLevel(key).layout).toBe('one-line');
        expect(validateLevelOnLayout(level(key), layout)).toEqual([]);
    });

    it('gives every level a name and notes', () => {
        for (const key of LEVEL_KEYS) {
            const raw = rawLevel(key);

            expect(raw.name).toEqual(expect.any(String));
            expect(String(raw.notes ?? '').length).toBeGreaterThan(40);
        }
    });
});

describe('the one-line layout', () => {
    it('validates', () => {
        const result = validateLayoutConfig(rawLayout);

        expect(result.ok ? [] : result.errors).toEqual([]);
    });

    it('names the file after its key', () => {
        expect(rawLayout.key).toBe('one-line');
    });

    it('draws 28 by 18 tiles with 118 solid ones', () => {
        expect([layout.width, layout.height]).toEqual([28, 18]);
        expect(layout.walls).toHaveLength(118);
        expect(new Set(layout.walls).size).toBe(118);
    });

    it('walls the whole border except the factory door', () => {
        for (let x = 0; x < layout.width; x++) {
            expect(isWall([x, 0])).toBe(true);
            expect(isWall([x, layout.height - 1])).toBe(x !== 14);
        }

        for (let y = 1; y < layout.height - 1; y++) {
            expect(isWall([0, y])).toBe(true);
            expect(isWall([layout.width - 1, y])).toBe(true);
        }

        expect(layout.spawn).toEqual([14, 17]);
    });

    it('walls the machines, the shelves and the furniture', () => {
        const solid: Tile[] = [
            ...rectTiles([3, 2, 3, 3]), // Boom Powder footprint
            [6, 2],
            [6, 3],
            [6, 4], // Powder output shelf
            ...rectTiles([12, 6, 4, 2]), // the jig
            [11, 6],
            [11, 7], // Assembly input shelf
            [12, 10],
            [13, 10], // Assembly output shelf
            [8, 1], // beacon pole
            [16, 1],
            [17, 1],
            [18, 1], // order board
            [16, 6], // tool cart
            [26, 5], // countdown sign
            [10, 15], // broom hook
            ...rectTiles([22, 0, 5, 1]), // the dock door
        ];

        for (const tile of solid) expect({ tile, wall: isWall(tile) }).toEqual({ tile, wall: true });
    });

    it('leaves everything a player stands on walkable', () => {
        const walkable: Tile[] = [
            [4, 5], // Powder work tile
            [13, 8],
            [14, 8], // Assembly work tiles
            [16, 8], // Assembly rack tile
            ...layout.ramp,
            ...rectTiles(layout.truckBay),
            ...rectTiles(layout.breakRoom),
            ...layout.blastBins,
            layout.props.returnsPile,
            layout.spawn,
            [15, 8], // the aisle tile a missed toss lands on
            [9, 15], // the break-room door
        ];

        for (const tile of walkable) {
            expect({ tile, wall: isWall(tile) }).toEqual({ tile, wall: false });
        }
    });

    it('parks the truck bay under the door and above the ramp', () => {
        expect(layout.dockDoor).toEqual([22, 0, 5]);
        expect(layout.truckBay).toEqual([22, 1, 5, 3]);

        for (const tile of rectTiles(layout.truckBay)) expect(isWall(tile)).toBe(false);

        for (const [x] of layout.ramp) expect(x).toBeGreaterThanOrEqual(layout.truckBay[0]);

        for (const [, y] of layout.ramp) expect(y).toBe(layout.truckBay[1] + layout.truckBay[3]);
    });

    it('puts the props and the bin where the fiction needs them', () => {
        expect(layout.blastBins).toEqual([[1, 8]]);
        expect(layout.orderBoard).toEqual([16, 1]);
        expect(layout.breakRoom).toEqual([3, 14, 6, 3]);
        expect(layout.props).toEqual({
            toolCart: [16, 6],
            countdownSign: [26, 5],
            returnsPile: [21, 8],
            broomHook: [10, 15],
        });
    });

    it('names only the powder station on a beacon pole', () => {
        expect(layout.beaconPoles).toEqual({ 'powder-a': [8, 1] });
    });

    it('keeps Powder a haul away from Assembly and Assembly a run from the dock', () => {
        // docs/02: "Powder is 6 tiles from Assembly", "the dock is far enough
        // that the truck horn causes a run".
        const powderWork: Tile = [4, 5];
        const assemblyIn: Tile = [11, 7];
        const assemblyOut: Tile = [13, 10];
        const nearestLane: Tile = [22, 4];

        expect(assemblyIn[0] - powderWork[0]).toBe(7);
        expect(nearestLane[0] - assemblyOut[0]).toBe(9);
        expect(assemblyOut[1] - nearestLane[1]).toBe(6);
    });
});

describe('every station on the shipped layout', () => {
    const baseline = level('level-02-too-much-powder');

    it('joins Powder and Assembly by press and the dock by stand', () => {
        expect(stationOf(baseline, 'powder-a').joinMode).toBe('press');
        expect(stationOf(baseline, 'assembly-a').joinMode).toBe('press');
        expect(stationOf(baseline, 'dock-a').joinMode).toBe('stand');
    });

    it('gives the dock no shelves and Powder no input shelf', () => {
        const dock = stationOf(baseline, 'dock-a');

        expect(dock.inputShelf).toBeUndefined();
        expect(dock.outputShelf).toBeUndefined();
        expect(stationOf(baseline, 'powder-a').inputShelf).toBeUndefined();
    });

    it('matches the ramp to the dock work tiles', () => {
        expect(stationOf(baseline, 'dock-a').workTiles).toEqual(layout.ramp);
    });

    it('keeps the three floor rings disjoint and off the furniture', () => {
        const seen = new Map<string, string>();

        for (const station of baseline.stations) {
            for (const [x, y] of station.floorRing.tiles) {
                const key = tileKey(x, y);

                expect(seen.get(key)).toBeUndefined();
                seen.set(key, station.id);
                expect(isWall([x, y])).toBe(false);
            }
        }

        expect(seen.size).toBe(23 + 40 + 29);
    });

    it('gives every shelf a tile to work from', () => {
        const shelves: Tile[] = [
            [6, 3], // Powder output
            [11, 7], // Assembly input
            [13, 10], // Assembly output
        ];

        for (const [x, y] of shelves) {
            expect(isWall([x, y])).toBe(true);

            const reachable = [
                [x + 1, y],
                [x - 1, y],
                [x, y + 1],
                [x, y - 1],
            ].some(([nx = 0, ny = 0]) => !isWall([nx, ny]));

            expect(reachable).toBe(true);
        }
    });
});

describe('the optional keys the shipped files decide for themselves', () => {
    const CARRIED = [
        'notes',
        'grading.advanceOn',
        'groove.weights.truckComplete',
        'hazards.repairSeconds',
        'hazards.bannerSeconds',
        'stations.0.minigame.heat.overholdMs',
        'stations.0.minigame.comboBannerSeconds',
        'stations.1.minigame.casings',
        'stations.2.minigame.tailgateHoldSeconds',
        'stations.2.minigame.leaveSeconds',
    ] as const;

    const DELEGATED = [
        'movement',
        'clipboardMemorySeconds',
        'interrupts',
        'scoring',
        'carry.putDownSeconds',
        'carry.hitStaggerSeconds',
        'hazards.unjamSeconds',
        'hazards.sweepSecondsPerTile',
    ] as const;

    it.each(LEVEL_KEYS)('%s writes out every key it owns', (key) => {
        const raw = rawLevel(key);

        for (const path of CARRIED) expect({ path, value: at(raw, path) }).not.toEqual({ path, value: undefined });
    });

    it.each(LEVEL_KEYS)('%s leaves the engine-feel keys to defaults.ts', (key) => {
        const raw = rawLevel(key);

        for (const path of DELEGATED) expect({ path, value: at(raw, path) }).toEqual({ path, value: undefined });
    });

    it.each(LEVEL_KEYS)('%s still reads a value for them after validation', (key) => {
        const config = level(key);

        expect(config.movement).toEqual({
            tilesPerSecond: 4,
            playerRadius: 0.35,
            bumpStaggerSeconds: 0.3,
            floorItemSpeed: 0.4,
            spillSpeed: 0.6,
        });
        expect(config.clipboardMemorySeconds).toBe(60);
        expect(config.interrupts).toEqual({ everySeconds: 6, pauseSeconds: 0.5 });
        expect(config.scoring).toEqual({ perOrder: 100 });
        expect(config.carry.putDownSeconds).toBe(0.3);
        expect(config.carry.hitStaggerSeconds).toBe(0.5);
        expect(config.hazards.unjamSeconds).toBe(4);
        expect(config.hazards.sweepSecondsPerTile).toBe(1.5);
    });
});

describe('the ladder', () => {
    const baseline = rawLevel('level-02-too-much-powder');

    it.each(Object.keys(LADDER) as (keyof typeof LADDER)[])(
        'keeps %s identical to the baseline outside its ladder cells',
        (key) => {
            const paths = LADDER[key];

            expect(without(key, paths)).toEqual(without('level-02-too-much-powder', paths));
        },
    );

    it('teaches the loop on level 1 and takes the teeth out of the trap', () => {
        const one = level('level-01-basic-flow');

        expect(one.players).toEqual({ min: 1, max: 6 });
        expect(one.day.orderBook).toBe(8);
        expect(one.hazards.explosionEndsRound).toBe(false);
    });

    it('tunes level 1 for a crew of one or two (ADR 0013)', () => {
        const one = level('level-01-basic-flow');
        const solo = breakpointFor(one, 1);

        expect(solo.maxPlayers).toBe(2);
        expect(solo.orderBook).toBe(4);
        expect(solo.truckEverySeconds).toBe(90);
        expect(solo.qtyPerTruck).toEqual({ base: 2, rampPerMinute: 0 });
        expect(breakpointFor(one, 3).orderBook).toBe(8);
    });

    it('gives a crew of three its own truck size on every campaign level', () => {
        // A crew at the floor of the range has one pair of spare hands, not
        // three: it gets the same book on a smaller truck (ADR 0013).
        for (const key of ['level-01-basic-flow', 'level-02-too-much-powder'] as const) {
            const config = level(key);
            const small = breakpointFor(config, 3);
            const full = breakpointFor(config, config.players.max);

            expect({ key, maxPlayers: small.maxPlayers }).toEqual({ key, maxPlayers: 3 });
            expect(small.qtyPerTruck).toEqual({ base: 5, rampPerMinute: 0.25 });
            expect(full.qtyPerTruck).toBeUndefined();
        }
    });

    it('drowns level 2 in powder and means it', () => {
        const two = level('level-02-too-much-powder');
        const powder = stationOf(two, 'powder-a');
        const assembly = stationOf(two, 'assembly-a');

        // docs/09: Powder runs 4x Assembly's demand. One keg is two pours and a
        // stick takes one, so Powder's lazy rate has to beat half of Assembly's.
        const pours = two.recipes.keg?.output.pours ?? 1;
        const kegsPerStick = 1 / pours;
        const powderRate = 1 / powder.nominalSeconds;
        const assemblyDemand = kegsPerStick / assembly.nominalSeconds;

        expect(powderRate / assemblyDemand).toBeGreaterThanOrEqual(4);
        expect(powderRate / assemblyDemand).toBeLessThan(5);
        expect(two.players.min).toBe(3);
        expect(two.hazards.explosionEndsRound).toBe(true);
    });

    it('makes assembly the visible constraint on level 3', () => {
        const three = level('level-03-the-bottleneck');
        const two = level('level-02-too-much-powder');

        expect(three.players.min).toBe(4);
        expect(three.day.orderBook).toBeGreaterThan(two.day.orderBook);
        expect(three.orders.everySeconds).toBe(45);
        expect(three.orders.qtyPerTruck).toEqual({ base: 5, rampPerMinute: 0.25 });
    });

    it('puts level 3 out of one jig operator reach and inside two', () => {
        // "Come help Assembly" is a number: the book asks for more sticks a
        // second than one operator can emit and fewer than a pair can.
        const three = level('level-03-the-bottleneck');
        const assembly = stationOf(three, 'assembly-a');
        const rate = demandRate(three, three.players.min);
        const jigRate = (workers: number): number =>
            efficiencyFor(assembly.staffing, workers) / assembly.floorSeconds;

        expect(jigRate(1)).toBeLessThan(rate);
        expect(jigRate(2)).toBeGreaterThan(rate);
    });

    it('punishes the fourth helper on level 4 and nobody before them', () => {
        const four = stationOf(level('level-04-too-many-helpers'), 'assembly-a').staffing;
        const two = stationOf(level('level-02-too-much-powder'), 'assembly-a').staffing;

        for (const workers of [1, 2, 3]) {
            expect(efficiencyFor(four, workers)).toBe(efficiencyFor(two, workers));
        }

        for (const workers of [4, 5, 6]) {
            expect(efficiencyFor(four, workers)).toBeLessThan(efficiencyFor(two, workers));
        }

        expect(level('level-04-too-many-helpers').players.min).toBe(4);
    });

    it('opens level 4 only to a crew big enough to over-help', () => {
        // A level whose only lever is a staffing cliff at N workers is its own
        // baseline below N: the lobby has to be able to seat the Nth body.
        const four = level('level-04-too-many-helpers');
        const curve = stationOf(four, 'assembly-a').staffing;
        const baseline = stationOf(level('level-02-too-much-powder'), 'assembly-a').staffing;
        const divergesAt = [1, 2, 3, 4, 5, 6, 7, 8].find(
            (workers) => efficiencyFor(curve, workers) !== efficiencyFor(baseline, workers),
        );

        expect(divergesAt).toBe(4);
        expect(four.players.min).toBeGreaterThanOrEqual(divergesAt as number);
    });

    it('makes the fourth helper on level 4 cost the crew the day', () => {
        // "No, not everyone": with four on the jig the crew can no longer make
        // the rate the book asks for, and with two they comfortably can.
        const four = level('level-04-too-many-helpers');
        const crew = four.players.min;
        const rate = demandRate(four, crew);

        expect(capacityAt(four, crew, 4)).toBeLessThan(rate);
        expect(capacityAt(four, crew, 2)).toBeGreaterThan(rate);
    });

    it('gives sandbox no clock, no book, no end and a floor of one player', () => {
        const sandbox = level('sandbox');

        expect(sandbox.day.endsOn).toBe('never');
        expect(sandbox.day.shiftSeconds).toBe(0);
        expect(sandbox.day.orderBook).toBe(0);
        expect(sandbox.players.min).toBe(1);
        expect(sandbox.hazards.explosionEndsRound).toBe(false);
        expect(scaleLevel(sandbox, 1).day.orderBook).toBe(0);
    });

    it('ends the round on an explosion everywhere the lesson has teeth', () => {
        const setback = LEVEL_KEYS.filter((key) => !level(key).hazards.explosionEndsRound);

        expect(setback).toEqual(['level-01-basic-flow', 'sandbox']);
    });
});

describe('the numbers that have to add up', () => {
    it.each(TIMED)('%s lands its last truck before the whistle', (key) => {
        const config = level(key);
        const { firstAt, everySeconds, truckWaitSeconds } = config.orders;
        const lastArrival = firstAt + (config.day.orderBook - 1) * everySeconds;

        expect(lastArrival).toBeLessThanOrEqual(config.day.shiftSeconds - truckWaitSeconds);
    });

    it.each(LEVEL_KEYS)('%s agrees its last breakpoint with day and orders', (key) => {
        const config = level(key);
        const breakpoints = config.scaling.breakpoints;
        const last = breakpoints[breakpoints.length - 1];

        expect(last?.maxPlayers).toBe(config.players.max);
        expect(last?.lines).toBe(1);
        expect(last?.orderBook).toBe(config.day.orderBook);
        expect(last?.truckEverySeconds).toBe(config.orders.everySeconds);
        expect(last?.layout).toBeUndefined();
    });

    it.each(LEVEL_KEYS)('%s scales onto one line at both ends of its range', (key) => {
        const config = level(key);

        for (const players of [config.players.min, config.players.max]) {
            const scaled = scaleLevel(config, players);
            const breakpoint = breakpointFor(config, players);

            expect(scaled.lines).toEqual(['a']);
            expect(scaled.breakpoint).toEqual(breakpoint);
            expect(scaled.day.orderBook).toBe(breakpoint.orderBook);
            expect(scaled.orders.everySeconds).toBe(breakpoint.truckEverySeconds);
            expect(scaled.layout).toBe('one-line');
            expect(scaled.stations.map((s) => s.id)).toEqual(['powder-a', 'assembly-a', 'dock-a']);
        }
    });

    it.each(TIMED)('%s can finish every truck of its small-crew book too', (key) => {
        const config = level(key);

        for (const breakpoint of config.scaling.breakpoints) {
            const lastArrival =
                config.orders.firstAt + (breakpoint.orderBook - 1) * breakpoint.truckEverySeconds;

            expect(lastArrival).toBeLessThanOrEqual(
                config.day.shiftSeconds - config.orders.truckWaitSeconds,
            );
        }
    });

    it.each(LEVEL_KEYS)('%s keeps every judged window above the floors', (key) => {
        const config = level(key);
        const { ok, perfect } = config.windowFloorsMs;

        expect(config.carry.catchOkMs).toBeGreaterThanOrEqual(ok);
        expect(config.carry.catchPerfectMs).toBeGreaterThanOrEqual(perfect);

        const powder = stationOf(config, 'powder-a').minigame as {
            heat: { okMsAtMaxCharge: number; okMsAtMinCharge: number; deadCenterMs: number };
        };

        expect(powder.heat.okMsAtMinCharge).toBeGreaterThanOrEqual(ok);
        expect(powder.heat.okMsAtMaxCharge).toBeGreaterThanOrEqual(ok);
        expect(powder.heat.deadCenterMs).toBeGreaterThanOrEqual(perfect);

        const assembly = stationOf(config, 'assembly-a').minigame as Record<
            'pour' | 'knots' | 'crimp' | 'toss',
            { okMs: number; perfectMs: number }
        >;

        for (const phase of ['pour', 'knots', 'crimp', 'toss'] as const) {
            expect(assembly[phase].okMs).toBeGreaterThanOrEqual(ok);
            expect(assembly[phase].perfectMs).toBeGreaterThanOrEqual(perfect);
        }

        const dock = stationOf(config, 'dock-a').minigame as { okMs: number; perfectMs: number };

        expect(dock.okMs).toBeGreaterThanOrEqual(ok);
        expect(dock.perfectMs).toBeGreaterThanOrEqual(perfect);
    });
});

describe('the book the crew has to carry', () => {
    it.each(TIMED)('%s asks no crew for more than it can ship', (key) => {
        const config = level(key);

        config.scaling.breakpoints.forEach((_, index) => {
            const crew = lowestCrewFor(config, index);
            const { sticks, seconds } = demandOf(scaleLevel(config, crew));
            const ceiling = crewCapacity(config, crew) * HEADROOM * seconds;

            expect({ crew, sticks, withinReach: sticks <= ceiling }).toEqual({
                crew,
                sticks,
                withinReach: true,
            });
        });
    });

    it('never grows a truck on a level with no whistle', () => {
        // Sandbox counts up forever and mints a truck on every cadence, so a
        // ramp there has nothing to stop it: 18 slots at 20 minutes, 38 at an
        // hour, and a truck bed drawn as 19 rows of one silhouette.
        for (const key of LEVEL_KEYS) {
            const config = level(key);

            if (config.day.endsOn !== 'never') continue;

            for (const breakpoint of config.scaling.breakpoints) {
                const qty = breakpoint.qtyPerTruck ?? config.orders.qtyPerTruck;

                expect({ maxPlayers: breakpoint.maxPlayers, ramp: qty.rampPerMinute }).toEqual({
                    maxPlayers: breakpoint.maxPlayers,
                    ramp: 0,
                });
            }
        }
    });
});
