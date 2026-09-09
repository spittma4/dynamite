import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

import schema from './schema.json';
import { applyDefaults } from './defaults';
import { STATION_SHORT } from '../sim/constants';
import { inBounds, packTile, tileKey } from '../sim/tiles';
import type {
    AssemblyMinigame,
    BoomPowderMinigame,
    DockMinigame,
    LayoutConfig,
    LevelConfig,
    Rect,
    ScalingBreakpoint,
    StationConfig,
    Tile,
} from './types';

/**
 * Node-only: ajv keeps the client bundle clean, so this module is deliberately
 * absent from the barrel. Laravel validates structure against the same
 * `schema.json`; only this side applies the §13 defaults.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ajv = new Ajv({ allErrors: true, strict: false });
const compileLevel: ValidateFunction = ajv.compile(schema);

/**
 * Ajv leaves the offending key in `params`, so an unknown property would
 * otherwise report only the object that holds it — useless when a level has
 * sixteen stations.
 */
function formatError(e: ErrorObject): string {
    const path = e.instancePath || '/';

    if (e.keyword === 'additionalProperties') {
        const key = (e.params as { additionalProperty?: string }).additionalProperty ?? '?';

        return `${path}/${key}: is not a key this schema knows`;
    }

    return `${path}: ${e.message ?? 'is invalid'}`;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
    return (errors ?? []).map(formatError);
}

export function validateLevelConfig(input: unknown): ValidationResult<LevelConfig> {
    if (!compileLevel(input)) return { ok: false, errors: formatErrors(compileLevel.errors) };

    const level = input as LevelConfig;
    const errors = semanticErrors(level);

    if (errors.length > 0) return { ok: false, errors };

    return { ok: true, value: applyDefaults(level) };
}

/** Every window the level tunes, with the floor it must clear (docs/13). */
interface Window {
    path: string;
    value: number;
    floor: number;
}

function windowsOf(level: LevelConfig): Window[] {
    const { ok, perfect } = level.windowFloorsMs;
    const windows: Window[] = [
        { path: 'carry.catchOkMs', value: level.carry.catchOkMs, floor: ok },
        { path: 'carry.catchPerfectMs', value: level.carry.catchPerfectMs, floor: perfect },
    ];

    for (const station of level.stations) {
        const at = `stations.${station.id}.minigame`;

        if (station.type === 'boom_powder') {
            const { heat } = station.minigame as BoomPowderMinigame;

            windows.push(
                { path: `${at}.heat.okMsAtMaxCharge`, value: heat.okMsAtMaxCharge, floor: ok },
                { path: `${at}.heat.okMsAtMinCharge`, value: heat.okMsAtMinCharge, floor: ok },
                { path: `${at}.heat.deadCenterMs`, value: heat.deadCenterMs, floor: perfect },
            );
            continue;
        }

        if (station.type === 'assembly') {
            const mg = station.minigame as AssemblyMinigame;

            for (const phase of ['pour', 'knots', 'crimp', 'toss'] as const) {
                windows.push(
                    { path: `${at}.${phase}.okMs`, value: mg[phase].okMs, floor: ok },
                    { path: `${at}.${phase}.perfectMs`, value: mg[phase].perfectMs, floor: perfect },
                );
            }
            continue;
        }

        const mg = station.minigame as DockMinigame;

        windows.push(
            { path: `${at}.okMs`, value: mg.okMs, floor: ok },
            { path: `${at}.perfectMs`, value: mg.perfectMs, floor: perfect },
        );
    }

    return windows;
}

const WORKER_COUNT = /^[1-9][0-9]*$/;

function checkStations(level: LevelConfig, errors: string[]): void {
    const seen = new Set<string>();

    for (const station of level.stations) {
        if (seen.has(station.id)) errors.push(`stations: duplicate station id ${station.id}`);
        seen.add(station.id);

        const expected = `${STATION_SHORT[station.type]}-${station.line}`;

        if (station.id !== expected) {
            errors.push(`stations.${station.id}: a ${station.type} on line ${station.line} must be ${expected}`);
        }

        for (const key of Object.keys(station.staffing)) {
            if (!WORKER_COUNT.test(key)) {
                errors.push(`stations.${station.id}.staffing: ${key} is not a whole number of workers`);
            }
        }

        if (station.floorSeconds > station.nominalSeconds) {
            errors.push(`stations.${station.id}: floorSeconds is slower than nominalSeconds`);
        }
    }
}

function checkRecipesAndOrders(level: LevelConfig, errors: string[]): void {
    const types = new Set(level.stations.map((s) => s.type));
    const products = new Set<string>();

    for (const [name, recipe] of Object.entries(level.recipes)) {
        if (!types.has(recipe.station)) {
            errors.push(`recipes.${name}: no ${recipe.station} station on this level`);
        }
        if (recipe.output.product !== undefined) products.add(recipe.output.product);
    }

    const prices = level.economy.price as Record<string, number | undefined>;

    for (const entry of level.orders.mix) {
        if (!products.has(entry.type)) {
            errors.push(`orders.mix: no recipe makes ${entry.type}`);
        }
        if (prices[entry.type] === undefined) {
            errors.push(`orders.mix: economy.price has no entry for ${entry.type}`);
        }
    }
}

function checkScaling(level: LevelConfig, errors: string[]): void {
    const { breakpoints } = level.scaling;
    const first = breakpoints[0];
    const last = breakpoints[breakpoints.length - 1];

    for (let i = 1; i < breakpoints.length; i++) {
        const previous = breakpoints[i - 1] as ScalingBreakpoint;
        const current = breakpoints[i] as ScalingBreakpoint;

        if (current.maxPlayers <= previous.maxPlayers) {
            errors.push('scaling.breakpoints: maxPlayers must climb');
        }
    }

    if (first !== undefined && first.maxPlayers < level.players.min) {
        errors.push('scaling.breakpoints: the first breakpoint does not reach players.min');
    }

    if (last !== undefined && last.maxPlayers < level.players.max) {
        errors.push('scaling.breakpoints: the last breakpoint does not reach players.max');
    }
}

function checkDayAndPlayers(level: LevelConfig, errors: string[]): void {
    const { day, players } = level;
    const sandbox = day.endsOn === 'never';
    const noEnd = day.shiftSeconds === 0 && day.orderBook === 0;

    if (sandbox !== noEnd) {
        errors.push(
            "day: endsOn 'never' means shiftSeconds 0 and orderBook 0, and nothing else may",
        );
    }

    const floor = sandbox ? 1 : 3;

    if (players.min < floor) {
        errors.push(`players.min: needs at least ${floor} on this level`);
    }

    if (players.min > players.max) {
        errors.push('players.min: cannot be more than players.max');
    }
}

/** Every semantic rule runs, so one save reports every fault rather than the first. */
function semanticErrors(level: LevelConfig): string[] {
    const errors: string[] = [];

    for (const w of windowsOf(level)) {
        if (w.value < w.floor) {
            errors.push(`${w.path}: ${w.value} ms is tighter than the ${w.floor} ms floor`);
        }
    }

    checkStations(level, errors);
    checkRecipesAndOrders(level, errors);
    checkScaling(level, errors);
    checkDayAndPlayers(level, errors);

    return errors;
}

const layoutSchema = {
    $schema: schema.$schema,
    definitions: schema.definitions,
    $ref: '#/definitions/LayoutConfig',
};
const compileLayout: ValidateFunction = ajv.compile(layoutSchema);

function wallSet(layout: LayoutConfig): Set<number> {
    return new Set(layout.walls);
}

function isInside(layout: LayoutConfig, t: Tile): boolean {
    return inBounds(t[0], t[1], layout.width, layout.height);
}

function isWall(layout: LayoutConfig, walls: Set<number>, t: Tile): boolean {
    return walls.has(packTile(t[0], t[1], layout.width));
}

function rectTiles(rect: Rect): Tile[] {
    const [x, y, w, h] = rect;
    const tiles: Tile[] = [];

    for (let ty = y; ty < y + h; ty++) {
        for (let tx = x; tx < x + w; tx++) tiles.push([tx, ty]);
    }

    return tiles;
}

function checkLayoutTiles(layout: LayoutConfig, errors: string[]): void {
    const limit = layout.width * layout.height;
    const walls = wallSet(layout);

    for (const index of layout.walls) {
        if (index >= limit) errors.push(`walls: ${index} is past the end of the map`);
    }

    const singles: [string, Tile][] = [
        ['spawn', layout.spawn],
        ['orderBoard', layout.orderBoard],
        ['props.toolCart', layout.props.toolCart],
        ['props.countdownSign', layout.props.countdownSign],
        ['props.returnsPile', layout.props.returnsPile],
        ['props.broomHook', layout.props.broomHook],
        ...layout.blastBins.map((t, i): [string, Tile] => [`blastBins[${i}]`, t]),
        ...layout.ramp.map((t, i): [string, Tile] => [`ramp[${i}]`, t]),
        ...Object.entries(layout.beaconPoles).map(([id, t]): [string, Tile] => [
            `beaconPoles.${id}`,
            t,
        ]),
    ];

    for (const [path, tile] of singles) {
        if (!isInside(layout, tile)) errors.push(`${path}: ${tile.join(',')} is off the map`);
    }

    const rects: [string, Rect][] = [
        ['breakRoom', layout.breakRoom],
        ['truckBay', layout.truckBay],
        ['dockDoor', [layout.dockDoor[0], layout.dockDoor[1], layout.dockDoor[2], 1]],
    ];

    for (const [path, rect] of rects) {
        // A zero-width or zero-height rectangle covers no tiles, so every loop
        // below passes vacuously and the truck bay ships with nowhere to park.
        if (rect[2] < 1 || rect[3] < 1) {
            errors.push(`${path}: ${rect[2]}x${rect[3]} covers no tiles`);
        }

        for (const tile of rectTiles(rect)) {
            if (!isInside(layout, tile)) {
                errors.push(`${path}: ${tile.join(',')} is off the map`);
                break;
            }
        }
    }

    // Contracts §8 keeps these clear of the wall set: a bin and the returns pile
    // are floor tiles with a meaning an item lands on, and spawn and the break
    // room are where the crew stands — a wall on either buries the whole shift.
    const floors: [string, Tile][] = [
        ...layout.blastBins.map((t, i): [string, Tile] => [`blastBins[${i}]`, t]),
        ['props.returnsPile', layout.props.returnsPile],
        ['spawn', layout.spawn],
        ...rectTiles(layout.breakRoom).map((t, i): [string, Tile] => [`breakRoom[${i}]`, t]),
    ];

    for (const [path, tile] of floors) {
        if (isInside(layout, tile) && isWall(layout, walls, tile)) {
            errors.push(`${path}: ${tile.join(',')} is a wall`);
        }
    }
}

export function validateLayoutConfig(input: unknown): ValidationResult<LayoutConfig> {
    if (!compileLayout(input)) return { ok: false, errors: formatErrors(compileLayout.errors) };

    const layout = input as LayoutConfig;
    const errors: string[] = [];

    checkLayoutTiles(layout, errors);

    if (errors.length > 0) return { ok: false, errors };

    return { ok: true, value: layout };
}

const ORTHOGONAL: readonly Tile[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

function shelfTilesOf(station: StationConfig): [string, Tile][] {
    const shelves: [string, Tile][] = [];

    if (station.inputShelf) shelves.push(['inputShelf', station.inputShelf.tile]);
    if (station.outputShelf) shelves.push(['outputShelf', station.outputShelf.tile]);

    return shelves;
}

/** Contracts §8: the level's tiles have to make sense on the map it names. */
export function validateLevelOnLayout(level: LevelConfig, layout: LayoutConfig): string[] {
    const errors: string[] = [];
    const walls = wallSet(layout);
    const claimed = new Map<string, string>();

    function claim(stationId: string, path: string, tile: Tile): void {
        const key = tileKey(tile[0], tile[1]);
        const owner = claimed.get(key);

        if (owner !== undefined && owner !== stationId) {
            errors.push(`${stationId}.${path}: ${key} already belongs to ${owner}`);
        }

        claimed.set(key, stationId);
    }

    for (const station of level.stations) {
        const groups: [string, Tile[]][] = [
            ['workTiles', station.workTiles],
            ['rackTiles', station.rackTiles],
            ['floorRing', station.floorRing.tiles],
        ];

        for (const [path, tiles] of groups) {
            for (const tile of tiles) {
                claim(station.id, path, tile);

                if (!isInside(layout, tile)) {
                    errors.push(`${station.id}.${path}: ${tile.join(',')} is off the map`);
                    continue;
                }

                if (isWall(layout, walls, tile)) {
                    errors.push(`${station.id}.${path}: ${tile.join(',')} is a wall`);
                }
            }
        }

        if (!isInside(layout, station.anchor)) {
            errors.push(`${station.id}.anchor: ${station.anchor.join(',')} is off the map`);
        }

        for (const [path, tile] of shelfTilesOf(station)) {
            claim(station.id, path, tile);

            if (!isInside(layout, tile)) {
                errors.push(`${station.id}.${path}: ${tile.join(',')} is off the map`);
                continue;
            }

            // A shelf is furniture, so it may be a wall — but somebody has to be
            // able to stand beside it and pull from it.
            const reachable = ORTHOGONAL.some((d) => {
                const next: Tile = [tile[0] + d[0], tile[1] + d[1]];

                return isInside(layout, next) && !isWall(layout, walls, next);
            });

            if (!reachable) {
                errors.push(`${station.id}.${path}: ${tile.join(',')} has no tile to work from`);
            }
        }
    }

    const dock = level.stations.find((s) => s.type === 'dock');

    if (dock !== undefined) {
        const ramp = new Set(layout.ramp.map((t) => tileKey(t[0], t[1])));
        const work = new Set(dock.workTiles.map((t) => tileKey(t[0], t[1])));
        const same = ramp.size === work.size && [...ramp].every((k) => work.has(k));

        if (!same) errors.push(`ramp: does not match ${dock.id}.workTiles`);
    }

    for (const tile of rectTiles(layout.truckBay)) {
        if (isInside(layout, tile) && isWall(layout, walls, tile)) {
            errors.push(`truckBay: ${tile.join(',')} is a wall`);
        }
    }

    const stationIds = new Set(level.stations.map((s) => s.id));

    for (const id of Object.keys(layout.beaconPoles)) {
        if (!stationIds.has(id)) errors.push(`beaconPoles.${id}: no such station`);
    }

    return errors;
}
