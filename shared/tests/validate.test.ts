import { describe, expect, it } from 'vitest';

import { scaleLevel } from '../src/sim/scale';

import {
    validateLayoutConfig,
    validateLevelConfig,
    validateLevelOnLayout,
} from '../src/config/validate';
import {
    bareLevelFixture,
    layoutFixture,
    levelFixture,
    rawLayoutFixture,
    rawLevelFixture,
} from './fixtures';
import { packTile } from '../src/sim/tiles';
import type {
    AssemblyMinigame,
    BoomPowderMinigame,
    DockMinigame,
    LayoutConfig,
    LevelConfig,
} from '../src/config/types';

function errorsOf(input: unknown): string[] {
    const result = validateLevelConfig(input);

    return result.ok ? [] : result.errors;
}

describe('validateLevelConfig — structure', () => {
    it('accepts the reference level', () => {
        const result = validateLevelConfig(rawLevelFixture());

        expect(result.ok).toBe(true);
    });

    it('names the path of a missing required key', () => {
        const level = rawLevelFixture();
        delete level.hazards;

        expect(errorsOf(level).join('\n')).toMatch(/hazards/);
    });

    it('refuses a key nothing reads', () => {
        const level = rawLevelFixture();
        level.upgradesAvailable = [];

        expect(errorsOf(level).join('\n')).toMatch(/upgradesAvailable/);
    });

    it('refuses a hazard key from a later milestone', () => {
        const withBucket = rawLevelFixture();
        (withBucket.hazards as Record<string, unknown>).sandBucket = true;

        expect(errorsOf(withBucket).join('\n')).toMatch(/sandBucket/);

        const withHotfix = rawLevelFixture();
        const hazards = withHotfix.hazards as { sparks: Record<string, unknown> };
        hazards.sparks.hotfix = 0.2;

        expect(errorsOf(withHotfix).join('\n')).toMatch(/hotfix/);

        const withBins = rawLevelFixture();
        (withBins.hazards as Record<string, unknown>).blastBins = [[3, 3]];

        expect(errorsOf(withBins).join('\n')).toMatch(/blastBins/);
    });

    it('refuses a station key nothing reads', () => {
        const level = rawLevelFixture();
        const stations = level.stations as Record<string, unknown>[];
        stations[0]!.recipe = 'keg';

        expect(errorsOf(level).join('\n')).toMatch(/recipe/);
    });

    it('refuses the dock keys held back for M2', () => {
        const level = rawLevelFixture();
        const stations = level.stations as { minigame: Record<string, unknown> }[];
        stations[2]!.minigame.rattlyOkMs = 120;

        expect(errorsOf(level).join('\n')).toMatch(/rattlyOkMs/);
    });

    it('hands back the level with every contract default applied', () => {
        const result = validateLevelConfig(bareLevelFixture());

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const level = result.value;

        expect(level.movement).toEqual({
            tilesPerSecond: 4,
            playerRadius: 0.35,
            bumpStaggerSeconds: 0.3,
            floorItemSpeed: 0.4,
            spillSpeed: 0.6,
        });
        expect(level.clipboardMemorySeconds).toBe(60);
        expect(level.interrupts).toEqual({ everySeconds: 6, pauseSeconds: 0.5 });
        expect(level.carry.putDownSeconds).toBe(0.3);
        expect(level.carry.hitStaggerSeconds).toBe(0.5);
        expect(level.hazards.unjamSeconds).toBe(4);
        expect(level.hazards.sweepSecondsPerTile).toBe(1.5);
        expect(level.hazards.repairSeconds).toBe(10);
        expect(level.hazards.bannerSeconds).toBe(3);
        expect(level.groove.weights.truckComplete).toBe(10);
        expect(level.scoring?.perOrder).toBe(100);
        expect(level.grading.advanceOn).toBe('C');

        const powder = level.stations[0]?.minigame as BoomPowderMinigame;
        const assembly = level.stations[1]?.minigame as AssemblyMinigame;
        const dock = level.stations[2]?.minigame as DockMinigame;

        expect(powder.heat.overholdMs).toBe(500);
        expect(powder.comboBannerSeconds).toBe(2);
        expect(assembly.casings).toEqual({ stock: 3, dentChance: 0.3 });
        expect(dock.tailgateHoldSeconds).toBe(0.5);
        expect(dock.leaveSeconds).toBe(1.5);
    });

    it('keeps a value the level file supplied', () => {
        const level = rawLevelFixture();
        level.movement = { tilesPerSecond: 6 };

        const result = validateLevelConfig(level);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.value.movement?.tilesPerSecond).toBe(6);
        expect(result.value.movement?.spillSpeed).toBe(0.6);
    });

    it('refuses something that is not an object at all', () => {
        expect(validateLevelConfig(null).ok).toBe(false);
        expect(validateLevelConfig('level').ok).toBe(false);
        expect(validateLevelConfig([]).ok).toBe(false);
    });
});

describe('validateLevelConfig — the rules a JSON Schema cannot state', () => {
    it('refuses an OK window tighter than the floor', () => {
        const level = rawLevelFixture();
        const stations = level.stations as { minigame: Record<string, unknown> }[];
        stations[2]!.minigame.okMs = 99;

        expect(errorsOf(level).join('\n')).toMatch(/okMs/);
    });

    it('refuses a Perfect window tighter than the floor', () => {
        const level = rawLevelFixture();
        const stations = level.stations as { minigame: Record<string, unknown> }[];
        stations[2]!.minigame.perfectMs = 44;

        expect(errorsOf(level).join('\n')).toMatch(/perfectMs/);
    });

    it('refuses a catch window tighter than the floor', () => {
        const level = rawLevelFixture();
        (level.carry as Record<string, unknown>).catchPerfectMs = 44;

        expect(errorsOf(level).join('\n')).toMatch(/catchPerfectMs/);
    });

    it('refuses a slammer heat window tighter than the floor', () => {
        const level = rawLevelFixture();
        const stations = level.stations as { minigame: { heat: Record<string, unknown> } }[];
        stations[0]!.minigame.heat.okMsAtMinCharge = 99;

        expect(errorsOf(level).join('\n')).toMatch(/okMsAtMinCharge/);
    });

    it('refuses two stations with the same id', () => {
        const level = rawLevelFixture();
        const stations = level.stations as Record<string, unknown>[];
        stations[1]!.id = 'powder-a';

        expect(errorsOf(level).join('\n')).toMatch(/duplicate/i);
    });

    it('refuses an id that does not spell out its type and line', () => {
        const level = rawLevelFixture();
        const stations = level.stations as Record<string, unknown>[];
        stations[0]!.id = 'dock-a';

        expect(errorsOf(level).join('\n')).toMatch(/powder-a/);
    });

    it('refuses a station that never says how you join it', () => {
        const level = rawLevelFixture();
        const stations = level.stations as Record<string, unknown>[];
        delete stations[0]!.joinMode;

        expect(errorsOf(level).join('\n')).toMatch(/joinMode/);
    });

    it('refuses a staffing key that is not a whole number of workers', () => {
        const level = rawLevelFixture();
        const stations = level.stations as { staffing: Record<string, number> }[];
        stations[0]!.staffing['1.5'] = 1.0;

        expect(errorsOf(level).join('\n')).toMatch(/staffing/);
    });

    it('refuses a machine floor slower than its nominal cycle', () => {
        const level = rawLevelFixture();
        const stations = level.stations as Record<string, unknown>[];
        stations[1]!.floorSeconds = 7;

        expect(errorsOf(level).join('\n')).toMatch(/floorSeconds/);
    });

    it('refuses a recipe for a station this level does not have', () => {
        const level = rawLevelFixture();
        const stations = level.stations as unknown[];
        stations.shift();

        expect(errorsOf(level).join('\n')).toMatch(/keg/);
    });

    it('refuses an order for something no recipe makes', () => {
        const level = rawLevelFixture();
        const orders = level.orders as { mix: { type: string }[] };
        orders.mix[0]!.type = 'gold_exec';

        expect(errorsOf(level).join('\n')).toMatch(/gold_exec/);
    });

    it('refuses an order for something with no price', () => {
        const level = rawLevelFixture();
        const economy = level.economy as { price: Record<string, number> };
        delete economy.price.red_stick;

        expect(errorsOf(level).join('\n')).toMatch(/red_stick/);
    });

    it('refuses breakpoints that do not climb', () => {
        const level = rawLevelFixture();
        const scaling = level.scaling as { breakpoints: { maxPlayers: number }[] };
        scaling.breakpoints[0]!.maxPlayers = 10;

        expect(errorsOf(level).join('\n')).toMatch(/breakpoints/);
    });

    it('refuses breakpoints that stop short of the seat count', () => {
        const level = rawLevelFixture();
        const scaling = level.scaling as { breakpoints: { maxPlayers: number }[] };
        scaling.breakpoints[1]!.maxPlayers = 8;

        expect(errorsOf(level).join('\n')).toMatch(/breakpoints/);
    });

    it('refuses a crew of two on a level that ends', () => {
        const level = rawLevelFixture();
        (level.players as Record<string, number>).min = 2;

        expect(errorsOf(level).join('\n')).toMatch(/players\.min|min/);
    });

    it('lets one person into the sandbox', () => {
        const level = rawLevelFixture();
        level.day = {
            shiftSeconds: 0,
            orderBook: 0,
            endsOn: 'never',
            earlyFinishBonusPerMinute: 5,
            earlyFinishCap: 10,
        };
        (level.players as Record<string, number>).min = 1;

        expect(validateLevelConfig(level).ok).toBe(true);
    });

    it('refuses a sandbox with a shift clock', () => {
        const level = rawLevelFixture();
        level.day = {
            shiftSeconds: 600,
            orderBook: 0,
            endsOn: 'never',
            earlyFinishBonusPerMinute: 5,
            earlyFinishCap: 10,
        };
        (level.players as Record<string, number>).min = 1;

        expect(errorsOf(level).join('\n')).toMatch(/never/);
    });

    it('refuses a day that ends on the clock with no clock', () => {
        const level = rawLevelFixture();
        (level.day as Record<string, unknown>).shiftSeconds = 0;
        (level.day as Record<string, unknown>).orderBook = 0;

        expect(errorsOf(level).join('\n')).toMatch(/never/);
    });

    it('refuses a crew larger than the room', () => {
        const level = rawLevelFixture();
        level.players = { min: 8, max: 4 };

        expect(errorsOf(level).join('\n')).toMatch(/min/);
    });

    it('accepts a level that ships no clipboard copy of its own', () => {
        const level = rawLevelFixture();

        expect(level.copy).toBeUndefined();
        expect(validateLevelConfig(level).ok).toBe(true);
    });

    it('lets a level ship its own clipboard copy, punchlines and all', () => {
        const level = rawLevelFixture();
        level.copy = { clipboard: ['line one'], punchline: 'anything' };

        expect(validateLevelConfig(level).ok).toBe(true);

        const noLines = rawLevelFixture();
        noLines.copy = { punchline: 'anything' };

        expect(errorsOf(noLines).join('\n')).toMatch(/clipboard/);
    });
});

function layoutErrorsOf(input: unknown): string[] {
    const result = validateLayoutConfig(input);

    return result.ok ? [] : result.errors;
}

describe('validateLayoutConfig', () => {
    it('accepts the one-line layout', () => {
        expect(validateLayoutConfig(rawLayoutFixture()).ok).toBe(true);
    });

    it('refuses a wall index past the end of the map', () => {
        const layout = rawLayoutFixture();
        (layout.walls as number[]).push(28 * 18);

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/walls/);
    });

    it('refuses a spawn outside the map', () => {
        const layout = rawLayoutFixture();
        layout.spawn = [40, 2];

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/spawn/);
    });

    it('refuses a layout with no truck bay', () => {
        const layout = rawLayoutFixture();
        delete layout.truckBay;

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/truckBay/);
    });

    it('refuses a layout that forgot where the broom hangs', () => {
        const layout = rawLayoutFixture();
        delete (layout.props as Record<string, unknown>).broomHook;

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/broomHook/);
    });

    it('refuses a returns pile you cannot walk to', () => {
        const layout = rawLayoutFixture();
        (layout.props as Record<string, unknown>).returnsPile = [0, 0];

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/returnsPile/);
    });

    it('refuses a blast bin buried in a wall', () => {
        const layout = rawLayoutFixture();
        layout.blastBins = [[0, 0]];

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/blastBins/);
    });

    it('refuses a spawn buried in a wall', () => {
        const layout = rawLayoutFixture();
        const spawn = layout.spawn as [number, number];
        (layout.walls as number[]).push(packTile(spawn[0], spawn[1], layout.width as number));

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/spawn/);
    });

    it('refuses a break room tile buried in a wall', () => {
        const layout = rawLayoutFixture();
        const [x, y] = layout.breakRoom as [number, number, number, number];
        (layout.walls as number[]).push(packTile(x, y, layout.width as number));

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/breakRoom/);
    });

    it('refuses a rectangle with no tiles in it', () => {
        const bay = rawLayoutFixture();
        bay.truckBay = [21, 3, 0, 0];

        expect(layoutErrorsOf(bay).join('\n')).toMatch(/truckBay/);

        const room = rawLayoutFixture();
        room.breakRoom = [12, 14, 5, 0];

        expect(layoutErrorsOf(room).join('\n')).toMatch(/breakRoom/);

        const door = rawLayoutFixture();
        door.dockDoor = [24, 2, 0];

        expect(layoutErrorsOf(door).join('\n')).toMatch(/dockDoor/);
    });

    it('refuses a break room that hangs off the map', () => {
        const layout = rawLayoutFixture();
        layout.breakRoom = [26, 14, 5, 3];

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/breakRoom/);
    });

    it('refuses a dock door that hangs off the map', () => {
        const layout = rawLayoutFixture();
        layout.dockDoor = [26, 2, 5];

        expect(layoutErrorsOf(layout).join('\n')).toMatch(/dockDoor/);
    });
});

describe('validateLevelOnLayout', () => {
    function pair(): { level: LevelConfig; layout: LayoutConfig } {
        return { level: levelFixture(), layout: layoutFixture() };
    }

    it('puts the reference level on its layout without complaint', () => {
        const { level, layout } = pair();

        expect(validateLevelOnLayout(level, layout)).toEqual([]);
    });

    it('refuses a work tile inside a wall', () => {
        const { level, layout } = pair();
        level.stations[1]!.workTiles[0] = [12, 8];

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/workTiles/);
    });

    it('refuses a work tile off the map', () => {
        const { level, layout } = pair();
        level.stations[1]!.workTiles[0] = [99, 99];

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/workTiles/);
    });

    it('refuses a floor ring tile inside a wall', () => {
        const { level, layout } = pair();
        level.stations[0]!.floorRing.tiles[0] = [4, 2];

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/floorRing/);
    });

    it('lets the furniture be furniture', () => {
        const { level, layout } = pair();

        // The assembly anchor, its input shelf and its output shelf are all walls
        // in the fixture, and that is exactly right.
        expect(layout.walls).toContain(packTile(12, 8, layout.width));
        expect(layout.walls).toContain(packTile(12, 9, layout.width));
        expect(layout.walls).toContain(packTile(12, 11, layout.width));
        expect(validateLevelOnLayout(level, layout)).toEqual([]);
    });

    it('refuses a shelf nobody can stand next to', () => {
        const { level, layout } = pair();

        for (const t of [[11, 9], [13, 9], [12, 10]] as const) {
            layout.walls.push(packTile(t[0], t[1], layout.width));
        }

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/inputShelf/);
    });

    it('refuses two stations standing on the same tile', () => {
        const { level, layout } = pair();
        level.stations[0]!.floorRing.tiles.push([11, 7]);

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/11,7/);
    });

    it('refuses a ramp that is not where the dock crew stands', () => {
        const { level, layout } = pair();
        layout.ramp = [[23, 4], [23, 5], [23, 6]];

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/ramp/);
    });

    it('refuses a truck bay with a wall in it', () => {
        const { level, layout } = pair();
        layout.truckBay = [21, 3, 3, 6];

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/truckBay/);
    });

    it('refuses a beacon pole for a station that does not exist', () => {
        const { level, layout } = pair();
        layout.beaconPoles['casing-a'] = [5, 12];

        expect(validateLevelOnLayout(level, layout).join('\n')).toMatch(/casing-a/);
    });
});

describe('small-crew levels', () => {
    it('accepts players.min 1 on a normal level when a breakpoint covers a small crew', () => {
        const level = soloLevel();
        const result = validateLevelConfig(level);

        expect(errorsOf(level)).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('rejects players.min 1 when no breakpoint is tuned for a small crew', () => {
        const level = soloLevel();
        level.scaling.breakpoints = [
            { maxPlayers: 6, lines: 1, truckEverySeconds: 60, orderBook: 8 },
        ];

        expect(errorsOf(level).join(' ')).toMatch(/tuned for a small crew|maxPlayers/i);
        expect(validateLevelConfig(level).ok).toBe(false);
    });

    it('lets a breakpoint override qtyPerTruck so a solo book is reachable', () => {
        const level = soloLevel();
        const checked = validateLevelConfig(level);

        if (!checked.ok) throw new Error(`fixture invalid: ${checked.errors.join(', ')}`);

        const scaled = scaleLevel(checked.value, 1);

        expect(scaled.orders.qtyPerTruck.base).toBe(3);
        expect(scaled.day.orderBook).toBe(4);
        expect(scaled.orders.everySeconds).toBe(90);
    });
});

/** A level declaring solo play, with a breakpoint tuned for one or two players. */
function soloLevel(): LevelConfig {
    const level = structuredClone(levelFixture()) as LevelConfig;

    level.players = { min: 1, max: 6 };
    level.scaling.breakpoints = [
        {
            maxPlayers: 2,
            lines: 1,
            truckEverySeconds: 90,
            orderBook: 4,
            qtyPerTruck: { base: 3, rampPerMinute: 0 },
        },
        { maxPlayers: 6, lines: 1, truckEverySeconds: 60, orderBook: 8 },
    ];
    level.day.orderBook = 4;

    return level;
}
