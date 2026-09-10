import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

import schema from './schema.json';
import { LEVEL_DEFAULTS, applyDefaults } from './defaults';
import { STATION_FLOW, STATION_SHORT } from '../sim/constants';
import { inBounds, packTile, tileKey } from '../sim/tiles';
import type { Line } from '../schema/types';
import type {
    AssemblyMinigame,
    BoomPowderMinigame,
    DockMinigame,
    LayoutConfig,
    LevelConfig,
    Rect,
    ScalingBreakpoint,
    StationConfig,
    TempoFloorsMs,
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

/**
 * Seconds are what a designer writes and milliseconds what these rules compare,
 * and `0.4 * 1000` is not 400 — a floor sitting exactly on an authored value
 * would otherwise reject or accept it on a rounding bit.
 */
function ms(value: number): number {
    return Math.round(value * 1000) / 1000;
}

/** A judged marker series: how far its marks sit apart, and how wide the OK window on them is. */
interface Marks {
    /** The window T2 reports on. */
    path: string;
    /** The field that sets the gap, which for the pour is the level's own beat. */
    spacingPath: string;
    spacingMs: number;
    okMs: number;
}

/** A judged window and the warning the player gets before the mark it belongs to. */
interface Cue {
    /** The phase T3's lead floor reports on. */
    path: string;
    /** The window T3's second clause reports on; the Slammer has two on one charge. */
    windowPath: string;
    leadMs: number;
    okMs: number;
    /**
     * Whether the cue is something the player has to see coming. The Slammer's
     * charge is the player's own hold, so no reaction-time floor applies to it —
     * only the promise that its window cannot open before the hold began.
     */
    anticipated: boolean;
}

function marksOf(level: LevelConfig): Marks[] {
    const beatMs = ms(60000 / level.bpm);
    const marks: Marks[] = [];

    for (const station of level.stations) {
        const at = `stations.${station.id}.minigame`;

        if (station.type === 'assembly') {
            const mg = station.minigame as AssemblyMinigame;

            marks.push(
                // The pour is one judged mark on a running beat grid, so the
                // grid is what the player counts and `bpm` is what an author
                // would have to change.
                { path: `${at}.pour`, spacingPath: 'bpm', spacingMs: beatMs, okMs: mg.pour.okMs },
                {
                    path: `${at}.knots`,
                    spacingPath: `${at}.knots`,
                    spacingMs: ms(mg.knots.secondsPerKnot * 1000),
                    okMs: mg.knots.okMs,
                },
                {
                    path: `${at}.crimp`,
                    spacingPath: `${at}.crimp`,
                    spacingMs: ms(mg.crimp.clickSeconds * 1000),
                    okMs: mg.crimp.okMs,
                },
            );
            continue;
        }

        if (station.type === 'dock') {
            const mg = station.minigame as DockMinigame;

            marks.push({
                path: at,
                spacingPath: at,
                spacingMs: ms(1000 / mg.beepHz),
                okMs: mg.okMs,
            });
        }
    }

    return marks;
}

function cuesOf(level: LevelConfig): Cue[] {
    const beatMs = ms(60000 / level.bpm);
    // The catch's cue is the throw: `arrivesAt` is the flight away, so a window
    // wider than the flight is open before the item leaves the thrower. The
    // flight itself carries no lead floor — Dexterity scales it with nothing to
    // clamp to, and a floor here would reject the transform's own output.
    const cues: Cue[] = [
        {
            path: 'carry',
            windowPath: 'carry.catchOkMs',
            leadMs: ms(level.carry.throwFlightSeconds * 1000),
            okMs: level.carry.catchOkMs,
            anticipated: false,
        },
    ];

    for (const station of level.stations) {
        const at = `stations.${station.id}.minigame`;

        if (station.type === 'boom_powder') {
            const { heat } = station.minigame as BoomPowderMinigame;

            // `okWindowMs` interpolates between the two across the charge
            // (slammer.ts), so the opening is linear in the hold and testing the
            // ends tests the whole of it. The widest window against the shortest
            // hold would be one line and would reject levels that are fine.
            cues.push(
                {
                    path: `${at}.heat`,
                    windowPath: `${at}.heat.okMsAtMinCharge`,
                    leadMs: ms(heat.minChargeSeconds * 1000),
                    okMs: heat.okMsAtMinCharge,
                    anticipated: false,
                },
                {
                    path: `${at}.heat`,
                    windowPath: `${at}.heat.okMsAtMaxCharge`,
                    leadMs: ms(heat.maxChargeSeconds * 1000),
                    okMs: heat.okMsAtMaxCharge,
                    anticipated: false,
                },
            );
            continue;
        }

        if (station.type === 'assembly') {
            const mg = station.minigame as AssemblyMinigame;
            // The shortest pour a keg can ask for is the least warning the phase
            // ever gives, so the cheapest keg sets the bound.
            const beats = Math.min(...Object.values(mg.pour.beatsByQuality));

            cues.push(
                {
                    path: `${at}.pour`,
                    windowPath: `${at}.pour.okMs`,
                    leadMs: ms(beats * beatMs),
                    okMs: mg.pour.okMs,
                    anticipated: true,
                },
                {
                    path: `${at}.crimp`,
                    windowPath: `${at}.crimp.okMs`,
                    leadMs: ms(mg.crimp.leadSeconds * 1000),
                    okMs: mg.crimp.okMs,
                    anticipated: true,
                },
                {
                    path: `${at}.toss`,
                    windowPath: `${at}.toss.okMs`,
                    leadMs: ms(mg.toss.arcSeconds * 1000),
                    okMs: mg.toss.okMs,
                    anticipated: true,
                },
            );
        }
    }

    return cues;
}

/**
 * ADR 0009 keeps execution difficulty flat with millisecond floors, and
 * `windowFloorsMs` only ever bounded how forgiving a mark is. These are the
 * three rules that bound the beat the marks sit on, without which a level can
 * ship a series no hand can play and still validate.
 */
function checkTempo(level: LevelConfig, floors: TempoFloorsMs, errors: string[]): void {
    const series = marksOf(level);
    // Two assembly stations share one `bpm`, and one error about it is enough.
    const reported = new Set<string>();

    for (const marks of series) {
        if (marks.spacingMs >= floors.markSpacing || reported.has(marks.spacingPath)) continue;

        reported.add(marks.spacingPath);
        errors.push(
            `${marks.spacingPath}: ${marks.spacingMs} ms apart is tighter than ` +
                `the ${floors.markSpacing} ms mark floor`,
        );
    }

    // Half the gap, so a tap is never nearer a mark than the one being judged
    // and two neighbouring windows never touch.
    for (const marks of series) {
        if (marks.okMs < marks.spacingMs / 2) continue;

        errors.push(
            `${marks.path}.okMs: ${marks.okMs} ms is wider than half ` +
                `the ${marks.spacingMs} ms between marks`,
        );
    }

    for (const cue of cuesOf(level)) {
        if (cue.anticipated && cue.leadMs < floors.leadInMs) {
            errors.push(
                `${cue.path}: ${cue.leadMs} ms of lead-in is tighter than ` +
                    `the ${floors.leadInMs} ms lead floor`,
            );
        }

        if (cue.okMs > cue.leadMs) {
            errors.push(
                `${cue.windowPath}: ${cue.okMs} ms opens before its own ${cue.leadMs} ms lead-in`,
            );
        }
    }
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

/**
 * ADR 0015's escape hatch, shaped so nobody reaches it by drift. The boolean
 * turns the flow rules off and the string is the argument for turning them off,
 * and neither is legal without the other. `notes` would have been the cheaper
 * place to demand the argument and is not one: every shipped level carries a
 * kilobyte of it, so the ceremony would have been satisfied by prose written
 * about something else.
 */
function checkFlowExemption(level: LevelConfig, errors: string[]): void {
    const argued = (level.flowExemption ?? '').trim() !== '';

    if (level.flowRightward === false && !argued) {
        errors.push(
            'flowRightward: false needs a flowExemption saying why this floor ' +
                'does not read left to right',
        );
    }

    if (level.flowRightward !== false && level.flowExemption !== undefined) {
        errors.push('flowExemption: only means something with flowRightward false');
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

    // A level may invite small crews (players.min below 3) only if it is tuned for them:
    // the order book and truck cadence have to come down too, or a solo player is handed a
    // book they cannot finish. Sandbox has no book at all, so it needs no breakpoint.
    if (players.min < 3 && !sandbox) {
        const smallCrew = level.scaling.breakpoints.some((b) => b.maxPlayers <= 2);

        if (!smallCrew) {
            errors.push(
                'players.min: below 3 needs a scaling breakpoint with maxPlayers <= 2, ' +
                    'tuned for a small crew',
            );
        }
    }

    if (players.min < 1) {
        errors.push('players.min: needs at least 1');
    }

    if (players.min > players.max) {
        errors.push('players.min: cannot be more than players.max');
    }
}

/** Every semantic rule runs, so one save reports every fault rather than the first. */
function semanticErrors(level: LevelConfig): string[] {
    const errors: string[] = [];
    // Every rule here reads the level as parsed, and `applyDefaults` only runs
    // once this has returned, so the tempo rules resolve their own floors rather
    // than reading a key no shipped level file carries.
    const floors = level.tempoFloorsMs ?? LEVEL_DEFAULTS.tempoFloorsMs;

    for (const w of windowsOf(level)) {
        if (w.value < w.floor) {
            errors.push(`${w.path}: ${w.value} ms is tighter than the ${w.floor} ms floor`);
        }
    }

    checkTempo(level, floors, errors);
    checkStations(level, errors);
    checkFlowExemption(level, errors);
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

/** The x/y extent of a station's named tiles — the set `footprintOf` spans. */
interface Extent {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

function extentOf(station: StationConfig): Extent {
    const tiles: Tile[] = [station.anchor, ...station.workTiles, ...station.rackTiles];

    for (const [, tile] of shelfTilesOf(station)) tiles.push(tile);

    const xs = tiles.map((t) => t[0]);
    const ys = tiles.map((t) => t[1]);

    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
}

function rows(lo: number, hi: number): string {
    return lo === hi ? `row ${lo}` : `rows ${lo}-${hi}`;
}

/**
 * Where a hauler stands to take this station's work away: the out-shelf's row,
 * or the rows its crew works on when it has no shelf to leave anything on.
 */
function outFaceRows(station: StationConfig): [number, number] {
    if (station.outputShelf) {
        const y = station.outputShelf.tile[1];

        return [y, y];
    }

    const ys = station.workTiles.map((t) => t[1]);

    return [Math.min(...ys), Math.max(...ys)];
}

/**
 * ADR 0015: the floor reads left to right in process order and every machine
 * wears its input on its left face and its output on its right, so "pull from
 * the left, push to the right, walk right" is learned once and never re-learned.
 * A rule a designer can only follow beats a sign a player has to read at every
 * station.
 *
 * Rack tiles are exempt from the face rules — a rack is the station's own
 * supply, fetched by its own crew, and nothing is ever hauled to it.
 *
 * The opt-out defends itself rather than trusting its other half. The rule that
 * `flowRightward: false` has to be argued for lives in `checkFlowExemption`, and
 * `validateLevelOnLayout` is exported and callable on its own — so a caller that
 * reached for the geometry check alone would otherwise honour an opt-out the
 * level validator would have rejected.
 */
function checkFlowDirection(level: LevelConfig, errors: string[]): void {
    if (level.flowRightward === false && (level.flowExemption ?? '').trim() !== '') return;

    const lines = new Map<Line, StationConfig[]>();

    for (const station of level.stations) {
        const line = lines.get(station.line) ?? [];

        line.push(station);
        lines.set(station.line, line);
    }

    for (const stations of lines.values()) {
        const chain = [...stations].sort(
            (a, b) => STATION_FLOW.indexOf(a.type) - STATION_FLOW.indexOf(b.type),
        );

        for (const station of chain) {
            const xs = station.workTiles.map((t) => t[0]);
            const workMinX = Math.min(...xs);
            const workMaxX = Math.max(...xs);

            if (station.outputShelf && station.outputShelf.tile[0] <= workMaxX) {
                errors.push(
                    `${station.id}.outputShelf: x ${station.outputShelf.tile[0]} is not right ` +
                        `of the work tiles, which reach x ${workMaxX}`,
                );
            }

            if (station.inputShelf && station.inputShelf.tile[0] >= workMinX) {
                errors.push(
                    `${station.id}.inputShelf: x ${station.inputShelf.tile[0]} is not left ` +
                        `of the work tiles, which start at x ${workMinX}`,
                );
            }
        }

        for (let i = 1; i < chain.length; i++) {
            const previous = chain[i - 1] as StationConfig;
            const next = chain[i] as StationConfig;
            const from = extentOf(previous);
            const to = extentOf(next);

            if (to.minX <= from.maxX) {
                errors.push(
                    `${next.id}: its leftmost tile at x ${to.minX} is not right of ` +
                        `${previous.id}'s rightmost at x ${from.maxX}`,
                );
            }

            const [lo, hi] = outFaceRows(previous);

            // A hauler leaving one machine should already be standing on a row
            // the next one wants, so the out-face has only to reach the next
            // station's rows, not sit on one particular tile of them.
            if (lo > to.maxY || hi < to.minY) {
                const path = previous.outputShelf ? 'outputShelf' : 'workTiles';

                errors.push(
                    `${previous.id}.${path}: its out-face at ${rows(lo, hi)} misses ` +
                        `${next.id}'s ${rows(to.minY, to.maxY)}`,
                );
            }
        }
    }
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

            // The hopper standing on a shelf is 56 px tall and grows upward into
            // the machine (`resources/js/game/render/hopper.ts`), which is the
            // only reason it never covers a tile somebody walks on. ADR 0015
            // constrains a shelf's x and says nothing about what is above it, so
            // this is the rule that keeps the drawing's one assumption true.
            const above: Tile = [tile[0], tile[1] - 1];

            if (isInside(layout, above) && !isWall(layout, walls, above)) {
                errors.push(
                    `${station.id}.${path}: ${above.join(',')} above it is not machine, ` +
                        'so the hopper would stand on walkable floor',
                );
            }
        }
    }

    checkFlowDirection(level, errors);

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

    // `tickBeacons` reddens every station that has a floor ring, but the client
    // hangs the entire danger channel off the pole: `DangerBeaconView.update`
    // clears its stripes when the layout names no pole for the station, and so
    // does `Floor.setBeacons`. A ring with no pole is a station that goes red on
    // the server with no lamp, no stripes and no alarm anywhere on screen.
    for (const station of level.stations) {
        if (station.floorRing.tiles.length === 0) continue;
        if (layout.beaconPoles[station.id] !== undefined) continue;

        errors.push(
            `${station.id}.floorRing: a ring with no beaconPole has nowhere to show its danger`,
        );
    }

    return errors;
}
