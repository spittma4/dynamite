import { describe, expect, it } from 'vitest';

import { validateLevelConfig, validateLevelOnLayout } from '../src/config/validate';
import { levelFixture, rawLevelFixture } from './fixtures';
import type { LayoutConfig, LevelConfig, StationConfig, Tile } from '../src/config/types';

/**
 * ADR 0015 is arithmetic over a station's own named tiles, so every level here
 * carries hand-placed geometry on a floor with no walls in it: every other rule
 * in `validateLevelOnLayout` passes vacuously and what comes back is the flow
 * report and nothing else.
 */

interface Geometry {
    anchor: Tile;
    work: Tile[];
    rack?: Tile[];
    in?: Tile | null;
    out?: Tile | null;
}

const FIXTURE_INDEX = { powder: 0, assembly: 1, dock: 2 } as const;

function station(which: keyof typeof FIXTURE_INDEX, geometry: Geometry): StationConfig {
    const base = levelFixture().stations[FIXTURE_INDEX[which]];

    if (base === undefined) throw new Error(`the fixture has no ${which} station`);

    return {
        ...base,
        anchor: geometry.anchor,
        workTiles: geometry.work,
        rackTiles: geometry.rack ?? [],
        inputShelf:
            geometry.in == null ? null : { tile: geometry.in, capacity: 8, accepts: ['keg'] },
        outputShelf: geometry.out == null ? null : { tile: geometry.out, capacity: 6 },
        // A ring is not a named tile, and the only rule that reads one is the
        // tile claim, so these levels carry none rather than dragging the
        // fixture's rings around the floor behind the machines.
        floorRing: { tiles: [] },
    };
}

function levelOf(...stations: StationConfig[]): LevelConfig {
    return { ...levelFixture(), stations };
}

/**
 * A floor with no walls but the ones the other rules insist on, so nothing here
 * can fail a rule that is not ADR 0015's. Each shelf gets machine above it —
 * that is the hopper's precondition, and it moves with the shelf rather than
 * being written out per case.
 */
function openFloor(level: LevelConfig): LayoutConfig {
    const dock = level.stations.find((s) => s.type === 'dock');
    const walls: number[] = [];

    for (const station of level.stations) {
        for (const shelf of [station.inputShelf, station.outputShelf]) {
            if (shelf) walls.push((shelf.tile[1] - 1) * 28 + shelf.tile[0]);
        }
    }

    return {
        key: 'open',
        width: 28,
        height: 18,
        walls,
        spawn: [14, 16],
        breakRoom: [1, 14, 3, 3],
        blastBins: [[1, 12]],
        dockDoor: [22, 0, 5],
        truckBay: [22, 1, 5, 3],
        ramp: dock?.workTiles ?? [[27, 17]],
        beaconPoles: {},
        orderBoard: [18, 12],
        props: {
            toolCart: [1, 4],
            countdownSign: [26, 4],
            returnsPile: [18, 12],
            broomHook: [10, 15],
        },
    };
}

function flowErrors(level: LevelConfig): string[] {
    return validateLevelOnLayout(level, openFloor(level));
}

/** F15's re-laid band: Powder, Assembly and the Dock along row 4, left to right. */
const POWDER: Geometry = { anchor: [4, 3], work: [[4, 5]], out: [7, 4] };
const ASSEMBLY: Geometry = {
    anchor: [13, 3],
    work: [
        [13, 5],
        [14, 5],
    ],
    rack: [[13, 7]],
    in: [11, 4],
    out: [16, 4],
};
const DOCK: Geometry = {
    anchor: [22, 1],
    work: [
        [22, 4],
        [23, 4],
        [24, 4],
        [25, 4],
    ],
};

function legibleLine(overrides: Partial<Record<keyof typeof FIXTURE_INDEX, Geometry>> = {}): LevelConfig {
    return levelOf(
        station('powder', overrides.powder ?? POWDER),
        station('assembly', overrides.assembly ?? ASSEMBLY),
        station('dock', overrides.dock ?? DOCK),
    );
}

describe('checkFlowDirection — the line reads left to right', () => {
    it('accepts a band whose machines wear their input left and their output right', () => {
        expect(flowErrors(legibleLine())).toEqual([]);
    });

    /**
     * The geometry all five levels and every fixture shipped with, and the
     * reason a playtester kept asking where to put things: rule 2 passes — the
     * line does run rightward in the large — while the faces and the handoffs,
     * which is where the question actually gets asked, do not.
     */
    it('reports the zigzag the repo shipped', () => {
        const shipped = legibleLine({
            powder: { anchor: [3, 2], work: [[4, 5]], out: [6, 3] },
            assembly: {
                anchor: [12, 6],
                work: [
                    [13, 8],
                    [14, 8],
                ],
                rack: [[16, 8]],
                in: [11, 7],
                out: [13, 10],
            },
        });

        expect(flowErrors(shipped)).toEqual([
            'assembly-a.outputShelf: x 13 is not right of the work tiles, which reach x 14',
            "powder-a.outputShelf: its out-face at row 3 misses assembly-a's rows 6-10",
            "assembly-a.outputShelf: its out-face at row 10 misses dock-a's rows 1-4",
        ]);
    });
});

describe('rule 1 — the output shelf is on the right face', () => {
    it('rejects an output shelf left of the rightmost work tile', () => {
        const level = legibleLine({ assembly: { ...ASSEMBLY, out: [13, 4] } });

        expect(flowErrors(level)).toEqual([
            'assembly-a.outputShelf: x 13 is not right of the work tiles, which reach x 14',
        ]);
    });

    it('rejects an output shelf above its own rightmost work tile', () => {
        const level = legibleLine({ assembly: { ...ASSEMBLY, out: [14, 4] } });

        expect(flowErrors(level)).toEqual([
            'assembly-a.outputShelf: x 14 is not right of the work tiles, which reach x 14',
        ]);
    });

    it('says nothing about a station with no output shelf', () => {
        // The dock is left out so rule 4 has no downstream rows to land in:
        // this case is about rule 1 being vacuous, not about the handoff.
        const level = levelOf(
            station('powder', POWDER),
            station('assembly', { ...ASSEMBLY, out: null }),
        );

        expect(flowErrors(level)).toEqual([]);
    });
});

describe('rule 2 — the chain runs rightward', () => {
    /** Assembly shifted five tiles left, so its in-shelf sits in Powder's band. */
    const OVERLAPPING: Geometry = {
        anchor: [8, 3],
        work: [
            [8, 5],
            [9, 5],
        ],
        rack: [[8, 7]],
        in: [6, 4],
        out: [11, 4],
    };

    it('rejects a station that does not start right of its supplier', () => {
        expect(flowErrors(legibleLine({ assembly: OVERLAPPING }))).toEqual([
            "assembly-a: its leftmost tile at x 6 is not right of powder-a's rightmost at x 7",
        ]);
    });

    it('counts rack tiles in the extent a station has to fit inside', () => {
        // Every other named tile of Assembly's stops at x 16, so the rack is the
        // only thing that can be reaching under the Dock here.
        const reaching = { ...ASSEMBLY, rack: [[22, 7]] as Tile[] };

        expect(flowErrors(legibleLine({ assembly: { ...ASSEMBLY, rack: [] } }))).toEqual([]);
        expect(flowErrors(legibleLine({ assembly: reaching }))).toEqual([
            "dock-a: its leftmost tile at x 22 is not right of assembly-a's rightmost at x 22",
        ]);
    });

    it('orders the chain by process order, not by the order of the stations array', () => {
        const reversed = levelOf(
            station('dock', DOCK),
            station('assembly', OVERLAPPING),
            station('powder', POWDER),
        );

        expect(flowErrors(reversed)).toEqual([
            "assembly-a: its leftmost tile at x 6 is not right of powder-a's rightmost at x 7",
        ]);
    });
});

describe('rule 3 — the input shelf is on the left face', () => {
    it('rejects an input shelf right of the leftmost work tile', () => {
        const level = legibleLine({ assembly: { ...ASSEMBLY, in: [14, 4] } });

        expect(flowErrors(level)).toEqual([
            'assembly-a.inputShelf: x 14 is not left of the work tiles, which start at x 13',
        ]);
    });

    it('rejects an input shelf above its own leftmost work tile', () => {
        const level = legibleLine({ assembly: { ...ASSEMBLY, in: [13, 4] } });

        expect(flowErrors(level)).toEqual([
            'assembly-a.inputShelf: x 13 is not left of the work tiles, which start at x 13',
        ]);
    });

    it('says nothing about a station with no input shelf', () => {
        expect(flowErrors(legibleLine({ assembly: { ...ASSEMBLY, in: null } }))).toEqual([]);
    });
});

describe('rule 4 — the handoff does not climb', () => {
    it("rejects an out-face row outside the next station's rows", () => {
        const highDock: Geometry = {
            anchor: [22, 1],
            work: [
                [22, 2],
                [23, 2],
                [24, 2],
                [25, 2],
            ],
        };

        expect(flowErrors(legibleLine({ dock: highDock }))).toEqual([
            "assembly-a.outputShelf: its out-face at row 4 misses dock-a's rows 1-2",
        ]);
    });

    it('uses the work rows when the upstream station has no output shelf', () => {
        const tall: Geometry = {
            anchor: [4, 3],
            work: [
                [4, 5],
                [4, 6],
            ],
        };

        expect(flowErrors(legibleLine({ powder: tall }))).toEqual([]);

        const high: Geometry = {
            anchor: [13, 1],
            work: [
                [13, 2],
                [14, 2],
            ],
            in: [11, 2],
            out: [16, 2],
        };

        expect(flowErrors(legibleLine({ powder: tall, assembly: high }))).toEqual([
            "powder-a.workTiles: its out-face at rows 5-6 misses assembly-a's rows 1-2",
        ]);
    });
});

describe('rack tiles are the station’s own supply', () => {
    it('lets a rack sit left of the input shelf or right of the output shelf', () => {
        const flanked = {
            ...ASSEMBLY,
            rack: [
                [10, 7],
                [17, 7],
            ] as Tile[],
        };

        expect(flowErrors(legibleLine({ assembly: flanked }))).toEqual([]);
    });
});

describe('the opt-out', () => {
    it('reads an absent flowRightward as a line that has to read left to right', () => {
        const level = legibleLine({ assembly: { ...ASSEMBLY, out: [13, 4] } });

        expect(level.flowRightward).toBeUndefined();
        expect(flowErrors(level)).not.toEqual([]);
    });

    it('skips all four rules for a level that has argued for its tangle', () => {
        const level = legibleLine({
            powder: { anchor: [3, 2], work: [[4, 5]], out: [6, 3] },
            assembly: {
                anchor: [12, 6],
                work: [
                    [13, 8],
                    [14, 8],
                ],
                rack: [[16, 8]],
                in: [11, 7],
                out: [13, 10],
            },
        });
        level.flowRightward = false;
        level.flowExemption = 'The Spaghetti Factory: the tangle is the lesson.';

        expect(flowErrors(level)).toEqual([]);
    });

    it('refuses to turn the rules off without saying why', () => {
        const level = rawLevelFixture();
        level.flowRightward = false;

        expect(errorsOf(level)).toContain(
            'flowRightward: false needs a flowExemption saying why this floor does not read left to right',
        );
    });

    it('does not take a blank reason for a reason', () => {
        const level = rawLevelFixture();
        level.flowRightward = false;
        level.flowExemption = '   ';

        expect(errorsOf(level)).toContain(
            'flowRightward: false needs a flowExemption saying why this floor does not read left to right',
        );
    });

    /**
     * The level's own `notes` would have been the cheaper place to demand the
     * argument, and it is not one: all five shipped levels carry a kilobyte of
     * it, so `flowRightward: false` would have been accepted on prose written
     * about something else entirely.
     */
    it('does not accept notes in place of a reason', () => {
        const level = rawLevelFixture();
        level.flowRightward = false;
        level.notes = 'Tuning notes that say nothing about the floor.';

        expect(errorsOf(level)).toContain(
            'flowRightward: false needs a flowExemption saying why this floor does not read left to right',
        );
    });

    it('refuses a reason left behind by a level that no longer opts out', () => {
        const level = rawLevelFixture();
        level.flowExemption = 'The Spaghetti Factory: the tangle is the lesson.';

        expect(errorsOf(level)).toContain(
            'flowExemption: only means something with flowRightward false',
        );
    });

    it('accepts the pair a tangled level has to write', () => {
        const level = rawLevelFixture();
        level.flowRightward = false;
        level.flowExemption = 'The Spaghetti Factory: the tangle is the lesson.';

        expect(errorsOf(level)).toEqual([]);
    });

    /**
     * The two halves of the opt-out used to be enforced by two functions with
     * nothing holding them together: `validateLevelOnLayout` is exported from
     * `shared/src/index.ts` and callable on its own, so a caller that reached for
     * the geometry check alone honoured a bare `flowRightward: false` that the
     * level validator would have thrown out. The shipped path calls both; the
     * rule should not depend on that.
     */
    it('does not turn itself off for a level that never argued its case', () => {
        const level = legibleLine({ assembly: { ...ASSEMBLY, out: [13, 4] } });
        level.flowRightward = false;

        expect(flowErrors(level)).not.toEqual([]);
    });
});

function errorsOf(input: unknown): string[] {
    const result = validateLevelConfig(input);

    return result.ok ? [] : result.errors;
}
