import { TILE_PX } from '@shared';
import { describe, expect, it, vi } from 'vitest';

import type { Factory } from '../scenes/Factory';

/**
 * Phaser touches `window` at import time, so the runtime is stubbed for the node
 * suite; the layer reads it only for the two scene event names, and the glyphs
 * only for the `Graphics` type, which is erased.
 */
vi.mock('phaser', () => ({
    default: { Scenes: { Events: { POST_UPDATE: 'postupdate', SHUTDOWN: 'shutdown' } } },
}));

const {
    GLYPH_COLOURS,
    HALO_COLOUR,
    KEG_TINTS,
    UNKNOWN_GLYPH,
    drawItemGlyph,
    glyphTint,
} = await import('../render/stationGlyphs');
const {
    APRON_ALPHA,
    APRON_LIT_ALPHA,
    APRON_WIDTH,
    STATION_COLOURS,
    chevron,
    createStationsLayer,
    machineCentre,
    occupiedWorkTiles,
    progressSweep,
    shelfCounter,
    slotOffsets,
    stateLabel,
    stationBubble,
    stripeSegments,
} = await import('../render/Stations');
const { POST_LABEL, POST_WIDTH, postBrackets } = await import('../render/helperPosts');
const { JIG_COLOURS } = await import('../minigames/Jig');
const { BOARD_COLOURS, LINE_COLOURS } = await import('../render/palette');
const { ANY, AUTO } = await import('../render/hopper');
const { pluralOf } = await import('../render/dropTargets');
const { RACK_COLOURS, rackCaption } = await import('../render/fuseRack');
const { COWL_PX, PLINTH_PX } = await import('../render/machine');

/**
 * The station layer's decisions (F05 §Client). Every one of them is a function
 * of `StationState`, the level config and `copy` alone — the client judges
 * nothing — so the drawing is left to Phaser and the rules tested on their own.
 */

const STATION_COPY = { needHands: 'need hands!', needParts: 'need parts!' };

/** A `Graphics` that records what was asked of it, for the glyph shapes. */
function recorder(): {
    calls: { op: string; args: number[] }[];
    g: Parameters<typeof drawItemGlyph>[0];
} {
    const calls: { op: string; args: number[] }[] = [];
    const op =
        (name: string) =>
        (...args: number[]): unknown => {
            calls.push({ op: name, args });

            return null;
        };
    const g = {
        fillStyle: op('fillStyle'),
        lineStyle: op('lineStyle'),
        fillRect: op('fillRect'),
        strokeRect: op('strokeRect'),
        fillCircle: op('fillCircle'),
        fillRoundedRect: op('fillRoundedRect'),
        lineBetween: op('lineBetween'),
    };

    return { calls, g: g as unknown as Parameters<typeof drawItemGlyph>[0] };
}

describe('glyphTint', () => {
    it('reads a keg by quality: dud grey, damp pale, full white', () => {
        expect(glyphTint({ type: 'keg', quality: 0.4, prime: false }).colour).toBe(KEG_TINTS.dud);
        expect(glyphTint({ type: 'keg', quality: 0.7, prime: false }).colour).toBe(KEG_TINTS.damp);
        expect(glyphTint({ type: 'keg', quality: 1, prime: false }).colour).toBe(KEG_TINTS.full);
    });

    it('haloes a prime item and nothing else', () => {
        expect(glyphTint({ type: 'keg', quality: 1, prime: true }).halo).toBe(true);
        expect(glyphTint({ type: 'stick', quality: 1, prime: true }).halo).toBe(true);
        expect(glyphTint({ type: 'keg', quality: 1, prime: false }).halo).toBe(false);
    });

    it('gives every other type its own colour and an unknown one the fallback', () => {
        expect(glyphTint({ type: 'casing', quality: 1, prime: false }).colour).toBe(
            GLYPH_COLOURS.casing,
        );
        expect(glyphTint({ type: 'crate', quality: 1, prime: false }).colour).toBe(
            GLYPH_COLOURS.crate,
        );
        expect(glyphTint({ type: '', quality: 1, prime: false }).colour).toBe(UNKNOWN_GLYPH);
    });
});

describe('drawItemGlyph', () => {
    it('fills the body in the tint the item earned', () => {
        const { calls, g } = recorder();

        drawItemGlyph(g, { type: 'keg', quality: 0.4, prime: false }, 100, 50, 8);

        expect(calls.some((c) => c.op === 'fillStyle' && c.args[0] === KEG_TINTS.dud)).toBe(true);
    });

    it('lays a halo down before the body, and only for a prime item', () => {
        const { calls, g } = recorder();

        drawItemGlyph(g, { type: 'keg', quality: 1, prime: true }, 100, 50, 8);

        const halo = calls.findIndex((c) => c.op === 'fillStyle' && c.args[0] === HALO_COLOUR);
        const body = calls.findIndex((c) => c.op === 'fillStyle' && c.args[0] === KEG_TINTS.full);

        expect(halo).toBeGreaterThanOrEqual(0);
        expect(halo).toBeLessThan(body);

        const plain = recorder();

        drawItemGlyph(plain.g, { type: 'keg', quality: 1, prime: false }, 100, 50, 8);

        expect(plain.calls.some((c) => c.op === 'fillStyle' && c.args[0] === HALO_COLOUR)).toBe(
            false,
        );
    });

    it('draws every type inside the box it was given, around the point it was given', () => {
        const size = 8;
        const slack = 3;

        for (const type of ['keg', 'casing', 'stick', 'crate', 'parts', '']) {
            const { calls, g } = recorder();

            drawItemGlyph(g, { type, quality: 1, prime: true }, 100, 50, size);

            const points = calls.filter((c) => c.op !== 'fillStyle' && c.op !== 'lineStyle');

            expect(points.length).toBeGreaterThan(0);

            for (const call of points) {
                const [x, y] = call.args;

                expect(Math.abs((x ?? 100) - 100)).toBeLessThanOrEqual(size / 2 + slack);
                expect(Math.abs((y ?? 50) - 50)).toBeLessThanOrEqual(size / 2 + slack);
            }
        }
    });
});

/**
 * A restock is not a fault. `stationStatus` sets `state = 'starved'` whenever
 * somebody is seated and the shelf has no casing, so 'STARVED' was painted in
 * the alert red directly above the bubble 'CASINGS COMING' — the Jig prints its
 * own casings and the answer is to stand still. The Jig panel already splits
 * `act` from `wait` (`blockColour`); the floor is where the label is read from,
 * and it never got the same treatment.
 */
describe('stateLabel', () => {
    it('names only the states a player has to do something about', () => {
        expect(stateLabel('starved')).toEqual({ text: 'STARVED', colour: STATION_COLOURS.alert });
        expect(stateLabel('jammed')).toEqual({ text: 'JAMMED', colour: STATION_COLOURS.alert });
        expect(stateLabel('damaged')).toEqual({ text: 'DAMAGED', colour: STATION_COLOURS.damaged });
    });

    it('drops the alarm when the shortage is one nobody can act on', () => {
        const wait = { sentence: 'CASINGS COMING', haul: false, act: false };
        const errand = { sentence: 'NEED A KEG', haul: true, act: true };

        expect(stateLabel('starved', wait)?.colour).toBe(JIG_COLOURS.wait);
        expect(stateLabel('starved', errand)?.colour).toBe(STATION_COLOURS.alert);
        expect(stateLabel('starved', wait)?.text).toBe('STARVED');
    });

    it('keeps the alarm for a jam and the grey for damage, whatever is short', () => {
        const wait = { sentence: 'CASINGS COMING', haul: false, act: false };

        expect(stateLabel('jammed', wait)?.colour).toBe(STATION_COLOURS.alert);
        expect(stateLabel('damaged', wait)?.colour).toBe(STATION_COLOURS.damaged);
    });

    it('says nothing while the station is idle or working', () => {
        expect(stateLabel('idle')).toBeNull();
        expect(stateLabel('working')).toBeNull();
        expect(stateLabel('')).toBeNull();
    });
});

/** What `shortageOf` hands the bubble for the errand at the heart of M1. */
const NEEDS_A_KEG = { sentence: 'NEED A KEG', haul: true, act: true };

/** A shelf at its cap: nothing to fetch, but somebody can still unjam it. */
const SHELF_IS_FULL = { sentence: 'SHELF FULL — LIFT ONE OFF (E)', haul: false, act: true };

describe('stationBubble', () => {
    it('asks for parts while starved, whoever is on it', () => {
        expect(stationBubble({ state: 'starved', workers: 1 }, 'running', STATION_COPY)).toBe(
            STATION_COPY.needParts,
        );
        expect(stationBubble({ state: 'starved', workers: 0 }, 'running', STATION_COPY)).toBe(
            STATION_COPY.needParts,
        );
    });

    it('asks for hands only when an idle station has nobody on it, mid-shift', () => {
        expect(stationBubble({ state: 'idle', workers: 0 }, 'running', STATION_COPY)).toBe(
            STATION_COPY.needHands,
        );
        expect(stationBubble({ state: 'idle', workers: 1 }, 'running', STATION_COPY)).toBe('');
        expect(stationBubble({ state: 'working', workers: 0 }, 'running', STATION_COPY)).toBe('');
    });

    it('stays quiet in the lobby and after the whistle', () => {
        expect(stationBubble({ state: 'idle', workers: 0 }, 'lobby', STATION_COPY)).toBe('');
        expect(stationBubble({ state: 'idle', workers: 0 }, 'ended', STATION_COPY)).toBe('');
    });

    // "NEED PARTS" for every shortage is what sent a playtester hunting for
    // casings while six kegs sat on the powder shelf; when `starveSentence` can
    // name the missing thing, the bubble says that instead.
    it('says what the station is short of when the client can name it', () => {
        expect(
            stationBubble({ state: 'starved', workers: 0 }, 'running', STATION_COPY, NEEDS_A_KEG),
        ).toBe('NEED A KEG');
    });

    /**
     * The signage only ever spoke to people who had already committed. Assembly
     * is 'starved' only while somebody is standing on it — `stationStatus` gates
     * the seat starve on `state.a !== ''` (shared/src/sim/jig.ts) — so the player
     * with empty hands looking for something to do saw an idle grey machine and
     * no shortage anywhere, which is backwards: naming the errand is how the
     * floor recruits.
     */
    it('names an errand nobody has started yet, before the machine has stopped', () => {
        expect(
            stationBubble({ state: 'idle', workers: 0 }, 'running', STATION_COPY, NEEDS_A_KEG),
        ).toBe('NEED A KEG');
        expect(
            stationBubble({ state: 'idle', workers: 1 }, 'running', STATION_COPY, NEEDS_A_KEG),
        ).toBe('NEED A KEG');
    });

    /**
     * A machine that is running is not short of hands or parts this second, and
     * Assembly holds its keg in `state.keg` while it pours — so an errand on
     * every working station would be a sentence that is always on, which is a
     * sentence nobody reads.
     */
    it('leaves a working machine alone, however bare its shelf is', () => {
        expect(
            stationBubble({ state: 'working', workers: 1 }, 'running', STATION_COPY, NEEDS_A_KEG),
        ).toBe('');
    });

    it('still asks for hands when what is missing is only a wait', () => {
        expect(
            stationBubble({ state: 'idle', workers: 0 }, 'running', STATION_COPY, {
                sentence: 'CASINGS COMING',
                haul: false,
                act: false,
            }),
        ).toBe(STATION_COPY.needHands);
    });

    /**
     * A jammed shelf is not an errand — there is nothing to bring — but it is
     * something a person can fix. A lone hauler arriving at an unattended
     * Assembly with eight kegs on it was told 'NEED HANDS', which is the
     * opposite of the truth: it needs shelf space, not bodies.
     */
    it('names a shelf that is refusing rather than asking for more hands', () => {
        expect(
            stationBubble({ state: 'idle', workers: 0 }, 'running', STATION_COPY, SHELF_IS_FULL),
        ).toBe(SHELF_IS_FULL.sentence);
    });

    /**
     * At the whistle the dock holds no sticks and cannot use a body, yet it
     * shouted NEED HANDS in the same frame, the same colour and the same size as
     * Boom Powder — three commands, no priority, and walking to the dock is the
     * worst opening move in the game.
     */
    it('keeps quiet when there is no job here for the hands it would ask for', () => {
        expect(stationBubble({ state: 'idle', workers: 0 }, 'running', STATION_COPY, null, false)).toBe(
            '',
        );
        expect(stationBubble({ state: 'idle', workers: 0 }, 'running', STATION_COPY, null, true)).toBe(
            STATION_COPY.needHands,
        );
    });

    it('keeps quiet about the errand before the whistle', () => {
        expect(
            stationBubble({ state: 'idle', workers: 0 }, 'lobby', STATION_COPY, NEEDS_A_KEG),
        ).toBe('');
    });

    it('falls back to the copy line when the shortage is nothing a player can carry', () => {
        expect(stationBubble({ state: 'starved', workers: 1 }, 'running', STATION_COPY, null)).toBe(
            STATION_COPY.needParts,
        );
    });
});

describe('stripeSegments', () => {
    it('stripes the tile at 45°, every line inside it and off the edges', () => {
        const lines = stripeSegments([3, 2], 7, 2);

        expect(lines.length).toBeGreaterThan(3);

        for (const { x1, y1, x2, y2 } of lines) {
            expect(x2 - x1).toBeCloseTo(y1 - y2, 6);

            for (const x of [x1, x2]) {
                expect(x).toBeGreaterThanOrEqual(3 * TILE_PX + 2);
                expect(x).toBeLessThanOrEqual(4 * TILE_PX - 2);
            }

            for (const y of [y1, y2]) {
                expect(y).toBeGreaterThanOrEqual(2 * TILE_PX + 2);
                expect(y).toBeLessThanOrEqual(3 * TILE_PX - 2);
            }
        }
    });

    it('spaces the stripes by the pitch it was given', () => {
        expect(stripeSegments([0, 0], 7, 2).length).toBeGreaterThan(
            stripeSegments([0, 0], 14, 2).length,
        );
    });
});

describe('chevron', () => {
    it('puts its tip on the side it points at, arms trailing behind', () => {
        const [armA, tip, armB] = chevron([10, 7], 1, 9);

        expect(tip?.x).toBeGreaterThan(armA?.x ?? 0);
        expect(tip?.x).toBeGreaterThan(armB?.x ?? 0);
        expect(armA?.y).toBeLessThan(armB?.y ?? 0);
        expect(tip?.x).toBeLessThanOrEqual(11 * TILE_PX);
    });

    it('turns around for a shelf on the other side', () => {
        const [armA, tip] = chevron([10, 7], -1, 9);

        expect(tip?.x).toBeLessThan(armA?.x ?? 0);
        expect(tip?.x).toBeGreaterThanOrEqual(10 * TILE_PX);
    });
});

describe('shelfCounter', () => {
    it('counts what is on the shelf against the cap', () => {
        expect(shelfCounter(3, 6)).toEqual({ text: '3/6', colour: STATION_COLOURS.counter });
    });

    it('turns red when the shelf is full, which is what blocks the next cycle', () => {
        expect(shelfCounter(6, 6)).toEqual({ text: '6/6', colour: STATION_COLOURS.alert });
    });

    it('draws nothing for a shelf the station does not have', () => {
        expect(shelfCounter(0, 0)).toBeNull();
    });
});

describe('slotOffsets', () => {
    it('lays the cap out in two columns, centred on the shelf tile', () => {
        expect(slotOffsets(6, 8, 2)).toEqual([
            { x: -5, y: -10 },
            { x: 5, y: -10 },
            { x: -5, y: 0 },
            { x: 5, y: 0 },
            { x: -5, y: 10 },
            { x: 5, y: 10 },
        ]);
    });

    it('leaves an odd cap with a gap rather than an off-centre column', () => {
        const offsets = slotOffsets(3, 8, 2);

        expect(offsets).toHaveLength(3);
        expect(offsets[2]).toEqual({ x: -5, y: 5 });
    });

    it('has no slots for a shelf that is not there', () => {
        expect(slotOffsets(0, 8, 2)).toEqual([]);
    });
});

describe('progressSweep', () => {
    it('is a full turn at 1 and nothing at 0', () => {
        expect(progressSweep(0)).toBe(0);
        expect(progressSweep(1)).toBeCloseTo(Math.PI * 2, 6);
        expect(progressSweep(0.25)).toBeCloseTo(Math.PI / 2, 6);
    });

    it('clamps the arc to the ring whatever the server sends', () => {
        expect(progressSweep(-1)).toBe(0);
        expect(progressSweep(4)).toBeCloseTo(Math.PI * 2, 6);
    });
});

describe('machineCentre', () => {
    it('is the middle of the machine tiles in pixels', () => {
        expect(machineCentre([[4, 2]])).toEqual({ x: 4.5 * TILE_PX, y: 2.5 * TILE_PX });
        expect(
            machineCentre([
                [4, 2],
                [5, 2],
            ]),
        ).toEqual({ x: 5 * TILE_PX, y: 2.5 * TILE_PX });
    });

    it('has nowhere to put a label on a station with no machine tiles', () => {
        expect(machineCentre([])).toBeNull();
    });
});

describe('occupiedWorkTiles', () => {
    it('fills only the tiles the station crew is standing on', () => {
        const tiles = occupiedWorkTiles(
            [
                { stationId: 'powder-a', workTile: '5,4' },
                { stationId: 'assembly-a', workTile: '13,9' },
                { stationId: 'powder-a', workTile: '' },
                { stationId: '', workTile: '' },
            ],
            'powder-a',
        );

        expect([...tiles]).toEqual(['5,4']);
    });
});

/**
 * The layer itself. Phaser is stubbed, so this is not a pixel test — it is the
 * proof that a station's furniture and its state can actually be drawn: a layer
 * that throws inside `Factory.create()` takes the whole scene down with it, and
 * no other test walks this code at all.
 */

interface TextStyle {
    fontSize?: string;
    fontStyle?: string;
    wordWrap?: { width: number };
    align?: string;
}

class FakeText {
    text: string;
    colour = '';
    visible = true;
    readonly width = 40;
    readonly height = 12;
    readonly style: TextStyle;

    constructor(value: string, style: TextStyle = {}) {
        this.text = value;
        this.style = style;
    }

    originX = 0;
    originY = 0;

    /** Which way a sign grows from its anchor, which is the N2 fix on the IN sign. */
    setOrigin(x = 0, y = x): this {
        this.originX = x;
        this.originY = y;

        return this;
    }

    setStroke(): this {
        return this;
    }

    angle = 0;

    /** A bin name is read down an 11 px bin, so the rotation is part of the fix. */
    setAngle(value: number): this {
        this.angle = value;

        return this;
    }

    x = 0;
    y = 0;

    // Recorded, unlike the other setters, because *where* the shelf sign lands
    // is the fix: it used to be drawn over the shelf glyphs and read "KEGS · CAS".
    setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;

        return this;
    }

    setText(value: string): this {
        this.text = value;

        return this;
    }

    setColor(value: string): this {
        this.colour = value;

        return this;
    }

    setVisible(value: boolean): this {
        this.visible = value;

        return this;
    }

    alpha = 1;

    /** Recorded: a helper post's word comes up to full exactly when `E` will answer. */
    setAlpha(value: number): this {
        this.alpha = value;

        return this;
    }

    destroy(): void {}
}

const GRAPHICS_OPS = [
    'fillStyle',
    'lineStyle',
    'fillRect',
    'strokeRect',
    'fillCircle',
    'strokeCircle',
    'fillRoundedRect',
    'strokeRoundedRect',
    'lineBetween',
    'beginPath',
    'arc',
    'strokePath',
    'clear',
] as const;

/**
 * Rows 3-4 of the shipped `one-line.json`, packed the way the layout packs them:
 * Boom Powder x3-7 and Assembly x11-16, two rows of machine each. It is what
 * puts a wall above every shelf tile.
 */
const MACHINE_WALLS = [
    ...[3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16].map((x) => 3 * 28 + x),
    ...[3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16].map((x) => 4 * 28 + x),
];

/**
 * The re-laid floor (ADR 0015, `config/game/levels/*.json`), copied off disk
 * rather than approximated: every machine is two rows of furniture on rows 3–4,
 * the crew stands on row 5, and each shelf is a tile of that furniture on a left
 * or right face. Nothing here is a shape this repo does not ship — the retired
 * zigzag survives only where a test is about the zigzag, named `ZIGZAG` where it
 * appears, the way `intake.test.ts` keeps it.
 */

/** The shipped Boom Powder: an out tray and nothing anybody brings to it. */
const POWDER_CFG = {
    id: 'powder-a',
    type: 'boom_powder',
    line: 'a',
    joinMode: 'press',
    anchor: [4, 3],
    workTiles: [[4, 5]],
    rackTiles: [],
    outputShelf: { tile: [7, 4], capacity: 6 },
    floorRing: { tiles: [[3, 5]] },
};

/**
 * The shipped Assembly: the IN shelf sits at 11,4 on the left face of a machine
 * that spans x 11–16, so the aisle a hauler walks — and the apron — is 10,4, and
 * the OUT chute at 16,4 hands out on the right face towards the Dock.
 */
const ASSEMBLY_CFG = {
    id: 'assembly-a',
    type: 'assembly',
    line: 'a',
    joinMode: 'press',
    anchor: [13, 3],
    workTiles: [
        [13, 5],
        [14, 5],
    ],
    rackTiles: [[13, 7]],
    inputShelf: { tile: [11, 4], capacity: 8, accepts: ['keg', 'casing'] },
    outputShelf: { tile: [16, 4], capacity: 4 },
    floorRing: { tiles: [[12, 5]] },
};

/**
 * The same Assembly once its shelf takes a fuse set (N2). `accepts` gains
 * `parts`, so the intake face carries three bins — a keg funnel, the AUTO casing
 * silo and the fuse bin — and the hopper grows inward over the machine wall
 * beside the shelf to hold them.
 */
const ASSEMBLY_FUSE_CFG = {
    ...ASSEMBLY_CFG,
    inputShelf: { tile: [11, 4], capacity: 8, accepts: ['keg', 'casing', 'parts'] },
};

/** What each machine makes, which is where an out tray gets its noun. */
const RECIPES = {
    keg: { station: 'boom_powder', inputs: {}, output: { type: 'keg', pours: 2 } },
    red_stick: {
        station: 'assembly',
        inputs: { casing: 1 },
        output: { type: 'stick', product: 'red_stick' },
    },
};

interface Extras {
    /** The level's stations; the powder line alone by default. */
    stations?: Record<string, unknown>[];
    /** `StationState` rows by station id, for a level with more than one. */
    rows?: [string, Record<string, unknown>][];
    /** The item id in the local player's hands. */
    carrying?: string;
    /** Who is on which post, for the helper-post paint (N4). */
    crew?: { stationId: string; workTile: string }[];
}

function harness(
    stationRow: Record<string, unknown> | null,
    extras: Extras = {},
): {
    scene: Factory;
    ops: string[];
    texts: FakeText[];
    post: () => void;
    handlers: Map<string, () => void>;
} {
    const ops: string[] = [];
    const texts: FakeText[] = [];
    const handlers = new Map<string, () => void>();
    const graphics = (): unknown => {
        const g: Record<string, unknown> = { destroy: () => {}, setVisible: () => g };

        for (const op of GRAPHICS_OPS) {
            g[op] = (...args: unknown[]): unknown => {
                ops.push(`${op}:${args.map((a) => String(a)).join(',')}`);

                return g;
            };
        }

        return g;
    };
    const container = (): unknown => ({ add: () => {}, destroy: () => {} });
    const level = { stations: extras.stations ?? [POWDER_CFG], recipes: RECIPES };
    // Rows 3-4 of the re-laid floor: Boom Powder x3-7 and Assembly x11-16, which
    // is what makes each shelf's northern neighbour machine rather than floor —
    // the hopper's one precondition, now a rule in `validateLevelOnLayout`.
    const layout = { width: 28, height: 18, walls: MACHINE_WALLS };
    const stations = new Map<string, unknown>(extras.rows ?? []);

    if (stationRow) stations.set('powder-a', stationRow);

    const scene = {
        add: {
            graphics,
            text: (_x: number, _y: number, value: string, style: TextStyle = {}) => {
                const label = new FakeText(value, style);

                texts.push(label);

                return label;
            },
            container,
        },
        events: {
            on: (name: string, fn: () => void) => handlers.set(name, fn),
            once: () => {},
            off: (name: string) => handlers.delete(name),
        },
        layers: { stations: { add: () => {} } },
        levelConfig: level,
        layout,
        time: { now: 0 },
        conn: {
            sessionId: 's1',
            state: {
                phase: 'running',
                players: new Map(
                    (extras.crew ?? [{ stationId: 'powder-a', workTile: '5,4' }]).map(
                        (member, i) => [
                            `s${i + 1}`,
                            { ...member, carrying: i === 0 ? (extras.carrying ?? '') : '' },
                        ],
                    ),
                ),
                stations,
                items: new Map([
                    ['k-1', { type: 'keg', quality: 0.7, prime: false }],
                    ['c-1', { type: 'casing', quality: 1, prime: false }],
                    ['c-2', { type: 'casing', quality: 1, prime: false }],
                    ['c-3', { type: 'casing', quality: 1, prime: false }],
                    // Banked fuse sets, which are the one material on an input
                    // shelf that can be the wrong one.
                    ['p-short', { type: 'parts', quality: 1, prime: false, fuseLength: 'short' }],
                    ['p-long', { type: 'parts', quality: 1, prime: false, fuseLength: 'long' }],
                ]),
            },
            config: { level, layout, copy: { stations: STATION_COPY } },
        },
    };

    return {
        scene: scene as unknown as Factory,
        ops,
        texts,
        handlers,
        post: () => handlers.get('postupdate')?.(),
    };
}

function row(over: Record<string, unknown>): Record<string, unknown> {
    return {
        state: 'idle',
        progress: 0,
        workers: 0,
        inputShelf: [],
        outputShelf: [],
        mg: '',
        ...over,
    };
}

/**
 * The longest thing a bubble can be handed is `SHELF_FULL_HANDS`, 44 characters
 * — roughly 265 px at 10 px monospace, over eight tiles, centred on the machine
 * and drawn across whatever is beside it. It fires at the exact moment a player
 * is stuck holding a keg at a full shelf, which is the worst moment to paint
 * over the shelf they are looking at.
 */
describe('the station bubble', () => {
    it('wraps rather than running across the floor beside the machine', () => {
        const h = harness(row({ state: 'starved' }));

        createStationsLayer(h.scene);
        h.post();

        const bubble = h.texts.find((t) => t.text === STATION_COPY.needParts);
        const wrap = bubble?.style.wordWrap?.width ?? 0;

        expect(wrap).toBeGreaterThan(0);
        expect(wrap).toBeLessThanOrEqual(TILE_PX * 6);
        expect(bubble?.style.align).toBe('center');
    });
});

describe('createStationsLayer', () => {
    it('draws the furniture and the machine label from the config alone', () => {
        const h = harness(null);

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'BOOM POWDER')).toBe(true);
        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${STATION_COLOURS.work}`))).toBe(true);
        expect(h.ops.some((op) => op.startsWith(`lineStyle:1,${STATION_COLOURS.ring}`))).toBe(true);
    });

    it('calls for parts when the station is starved and shows no ring', () => {
        const h = harness(row({ state: 'starved' }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'STARVED' && t.visible)).toBe(true);
        expect(h.texts.some((t) => t.text === STATION_COPY.needParts && t.visible)).toBe(true);
        expect(h.ops.some((op) => op.startsWith('arc:'))).toBe(false);
    });

    it('draws the progress arc and the shelved keg while it is working', () => {
        const h = harness(row({ state: 'working', progress: 0.5, workers: 1, outputShelf: ['k-1'] }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith('arc:'))).toBe(true);
        expect(h.ops.some((op) => op.startsWith(`fillStyle:${KEG_TINTS.damp}`))).toBe(true);
        expect(h.texts.some((t) => t.text === '1/6' && t.visible)).toBe(true);
        expect(h.texts.some((t) => t.text === 'STARVED' && t.visible)).toBe(false);
    });

    it('repaints only when something it draws has changed', () => {
        const h = harness(row({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        const after = h.ops.length;

        h.post();

        expect(h.ops.length).toBe(after);
    });

    it('lets go of the frame loop when the scene tears down', () => {
        const h = harness(row({ state: 'idle' }));
        const layer = createStationsLayer(h.scene);

        layer.destroy();

        expect(h.handlers.has('postupdate')).toBe(false);
    });
});

/**
 * The intake zone. A playtester with kegs to deliver said "make it almost like
 * an intake zone or very obvious where things go" — so the shelf gets a striped
 * apron, the sign moves off the glyphs and onto the aisle tile a hauler walks,
 * and the whole zone lifts out of the floor when it is the thing you need.
 */

/** Every `lineStyle` the apron stripes ask for at one alpha. */
function apronStrokes(ops: string[], alpha: number): string[] {
    return ops.filter((op) => op === `lineStyle:${APRON_WIDTH},${STATION_COLOURS.apron},${alpha}`);
}

function assembly(over: Record<string, unknown>): Extras {
    return { stations: [ASSEMBLY_CFG], rows: [['assembly-a', row(over)]] };
}

/** How many times the bracket stroke was set up at one alpha. */
function postStrokes(ops: string[], alpha: number): string[] {
    return ops.filter((op) => op === `lineStyle:${POST_WIDTH},${STATION_COLOURS.work},${alpha}`);
}

/**
 * The bracket arms actually drawn on `ASSEMBLY_CFG`'s one post, read back against
 * the geometry module — so the paint and `postBrackets` cannot drift apart.
 */
function postArms(ops: string[]): string[] {
    const wanted = postBrackets([12, 5]).map(
        (seg) => `lineBetween:${seg.x1},${seg.y1},${seg.x2},${seg.y2}`,
    );

    return ops.filter((op) => wanted.includes(op));
}

/** `StationState.mg` as the Jig writes it, at the two stops that look alike. */
const SEAT = JSON.stringify({ phase: 'seat', cradle: 'empty' });
const WAITING_ON_A_FUSE = JSON.stringify({ phase: 'parts', cradle: 'empty', keg: { poursLeft: 1 } });
/** Between the two sticks one keg pours: the machine is stocked, the shelf is bare. */
const KEG_IN_THE_MACHINE = JSON.stringify({ phase: 'seat', cradle: 'empty', keg: { poursLeft: 1 } });

/** The shipped dock: ramp lanes along row 4, no shelf of any kind. */
const DOCK_CFG = {
    id: 'dock-a',
    type: 'dock',
    line: 'a',
    joinMode: 'stand',
    anchor: [22, 1],
    workTiles: [
        [22, 4],
        [23, 4],
        [24, 4],
        [25, 4],
    ],
    rackTiles: [],
    floorRing: { tiles: [[21, 4]] },
};

function dockMg(lanes: { itemId: string }[]): string {
    return JSON.stringify({
        truck: { phase: 'docked', arrivesAt: 0, leavesAt: 40, slots: 8, loaded: 0, hits: '' },
        lanes: lanes.map((lane, i) => ({ tile: [22 + i, 4], itemId: lane.itemId, stalled: false })),
        beepAt: 0,
        beepPeriodMs: 1000,
        windows: { perfectMs: 70, okMs: 180 },
        tailgateUntil: 0,
        returnsTile: [19, 12],
    });
}

describe('the intake apron', () => {
    it('stripes the drop zone dimly while nobody needs it', () => {
        const h = harness(null, assembly({ state: 'working', progress: 0.5, workers: 1 }));

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_ALPHA).length).toBeGreaterThan(0);
        expect(apronStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
    });

    /**
     * It used to hang off the shelf tile's edge at 348 px, across the glyphs, where
     * the playtester read it as "KEGS · CAS". Then it was centred on the aisle
     * tile — which was fine at 'KEGS IN' and wrong the moment `accepts` gained
     * N2's fuse set: `shelfLabel` names every haulable type, so the sign is four
     * tiles wide and centred it crossed the hopper bins it points at. It is ranged
     * up against the machine's intake face instead, growing away from it.
     */
    it('ranges the sign up against the intake face, never across it', () => {
        const h = harness(null, assembly({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        const sign = h.texts.find((t) => t.text === 'KEGS IN');

        expect(sign).toBeDefined();
        // The aisle tile is 10,4 and the shelf it faces is 11,4.
        expect(sign?.x).toBeGreaterThan(10 * TILE_PX);
        expect(sign?.x).toBeLessThanOrEqual(11 * TILE_PX);
        expect(sign?.originX).toBe(1);
        expect(sign?.y).toBeGreaterThan(4 * TILE_PX);
        expect(sign?.y).toBeLessThan(5 * TILE_PX);
    });

    /**
     * The sign that made the anchoring matter. 'KEGS · FUSE SETS IN' is 19
     * characters — about 114 px at 10 px bold, three and a half tiles — and the
     * hopper's first bin wall starts 2 px inside the shelf tile.
     */
    it('still clears the bins once the shelf takes a fuse set too', () => {
        const h = harness(null, {
            stations: [ASSEMBLY_FUSE_CFG],
            rows: [['assembly-a', row({ state: 'idle' })]],
        });

        createStationsLayer(h.scene);
        h.post();

        const sign = h.texts.find((t) => t.text === `KEGS · ${pluralOf('parts')} IN`);

        expect(sign).toBeDefined();
        expect(sign?.originX).toBe(1);
        expect(sign?.x).toBeLessThanOrEqual(11 * TILE_PX);
    });

    it('lights up when you walk in carrying what the shelf takes', () => {
        const h = harness(null, { ...assembly({ state: 'idle' }), carrying: 'k-1' });

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA).length).toBeGreaterThan(0);
    });

    it('stays dim for an item this shelf has no use for', () => {
        const h = harness(row({ state: 'idle' }), { carrying: 'k-1' });

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
    });

    it('lights up on its own when the station is starved for something haulable', () => {
        const h = harness(null, assembly({ state: 'starved', inputShelf: ['c-1', 'c-2', 'c-3'], mg: SEAT }));

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA).length).toBeGreaterThan(0);
    });

    it('asks for kegs, not parts, when the shelf holds only self-stocked casings', () => {
        const h = harness(null, assembly({ state: 'starved', inputShelf: ['c-1', 'c-2', 'c-3'], mg: SEAT }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'NEED A KEG' && t.visible)).toBe(true);
        expect(h.texts.some((t) => t.text === STATION_COPY.needParts && t.visible)).toBe(false);
    });

    /**
     * The read the whole split exists for: a Jig that has run out of the casings
     * it prints for itself. The bubble says CASINGS COMING and the word above it
     * used to be red — a fault light over a machine restocking itself, at the
     * one moment the answer is to stand still.
     */
    it('paints a restock as a wait, not as a fault', () => {
        const h = harness(null, assembly({ state: 'starved', inputShelf: ['k-1'], mg: SEAT }));

        createStationsLayer(h.scene);
        h.post();

        const said = h.texts.find((t) => t.text === 'STARVED' && t.visible);

        expect(h.texts.some((t) => t.text === 'CASINGS COMING' && t.visible)).toBe(true);
        expect(said?.colour).toBe(`#${JIG_COLOURS.wait.toString(16).padStart(6, '0')}`);
    });

    it('keeps the alarm on the word when somebody has to walk a keg over', () => {
        const h = harness(
            null,
            assembly({ state: 'starved', inputShelf: ['c-1', 'c-2', 'c-3'], mg: SEAT }),
        );

        createStationsLayer(h.scene);
        h.post();

        const said = h.texts.find((t) => t.text === 'STARVED' && t.visible);

        expect(said?.colour).toBe(`#${STATION_COLOURS.alert.toString(16).padStart(6, '0')}`);
    });

    it('still says the copy line when the shortage is nothing a player hauls', () => {
        const h = harness(null, assembly({ state: 'starved', inputShelf: ['k-1', 'c-1'], mg: SEAT }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === STATION_COPY.needParts && t.visible)).toBe(true);
    });

    /**
     * The floor sign as a recruiter. Nobody is on this Jig, so the sim never
     * calls it starved; the shelf is still missing the one thing a player can
     * carry to it, and that is what the floor has to say.
     */
    it('names the missing keg on a machine nobody has reached yet', () => {
        const h = harness(null, assembly({ state: 'idle', workers: 0, inputShelf: ['c-1'], mg: SEAT }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'NEED A KEG' && t.visible)).toBe(true);
        expect(h.texts.some((t) => t.text === STATION_COPY.needHands && t.visible)).toBe(false);
    });

    /**
     * Quieter than a starve, deliberately: a machine somebody is stood at, doing
     * nothing, is more urgent than one nobody has walked to. The unstaffed
     * shortage gets the bubble and nothing else — no red STARVED, and the striped
     * zone stays at its wayfinding alpha until the machine has actually stopped.
     */
    it('says it at floor volume: no alarm, and the zone stays dim', () => {
        const h = harness(null, assembly({ state: 'idle', workers: 0, inputShelf: ['c-1'], mg: SEAT }));

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
        expect(h.texts.some((t) => t.text === 'STARVED' && t.visible)).toBe(false);
    });

    it('still asks an idle machine with a full shelf for hands, not for kegs', () => {
        const h = harness(
            null,
            assembly({ state: 'idle', workers: 0, inputShelf: ['k-1', 'c-1'], mg: SEAT }),
        );

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === STATION_COPY.needHands && t.visible)).toBe(true);
    });

    /**
     * The regression the widened `JigStall` exists for. `startPour` consumes the
     * keg off the shelf into `state.keg`, and every shipped level pours two
     * sticks from one keg — so between sticks the shelf holds casings only and
     * the sim (`pourAvailable`) still counts the machine as stocked. Reading the
     * shelf alone cried NEED A KEG on roughly every other cycle of a healthy
     * line, at the operator as well as the room.
     */
    it('says nothing about kegs while the machine is holding one with pours left', () => {
        for (const workers of [0, 1]) {
            const h = harness(
                null,
                assembly({ state: 'idle', workers, inputShelf: ['c-1'], mg: KEG_IN_THE_MACHINE }),
            );

            createStationsLayer(h.scene);
            h.post();

            const said = h.texts.filter((t) => t.visible).map((t) => t.text);

            expect({ workers, cried: said.some((t) => /NEED A KEG/.test(t)) }).toEqual({
                workers,
                cried: false,
            });
        }
    });

    /**
     * The dead end. `acceptsAt` drops a full shelf, so the floor went completely
     * dark for a player holding a keg — no pulsing tile, no lit apron — and `E`
     * answered with a wordless bonk. The destination is still there; it is
     * refusing, and the sentence has to be one these hands can act on.
     */
    it('paints the refusing shelf in the alert colour rather than going dark', () => {
        const full = ['c-1', 'c-2', 'c-3', 'k-1', 'k-1', 'k-1', 'k-1', 'k-1'];
        const h = harness(null, {
            ...assembly({ state: 'idle', inputShelf: full }),
            carrying: 'k-1',
        });

        createStationsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${STATION_COLOURS.alert}`))).toBe(true);
        expect(apronStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
    });

    it('tells the hands that are already full to put theirs down first', () => {
        const full = ['c-1', 'c-2', 'c-3', 'k-1', 'k-1', 'k-1', 'k-1', 'k-1'];
        const h = harness(null, {
            ...assembly({ state: 'idle', inputShelf: full }),
            carrying: 'k-1',
        });

        createStationsLayer(h.scene);
        h.post();

        const said = h.texts.filter((t) => t.visible).map((t) => t.text);

        expect(said.some((t) => t.includes('PUT YOURS DOWN'))).toBe(true);
        expect(said).not.toContain(STATION_COPY.needHands);
    });

    /**
     * `shelfContents` guards the frame between a shelved id arriving and the
     * item row behind it, and the counter uses `ids.length` for exactly that
     * reason. The shortage read had no such guard, so a keg landing on the shelf
     * blinked NEED A KEG for one frame — on the sentence the floor most needs
     * a player to believe.
     */
    it('says nothing about a shelf whose items have not synced yet', () => {
        const h = harness(
            null,
            assembly({ state: 'idle', workers: 0, inputShelf: ['c-1', 'k-9'], mg: SEAT }),
        );

        createStationsLayer(h.scene);
        h.post();

        const said = h.texts.filter((t) => t.visible).map((t) => t.text);

        expect(said.some((t) => /NEED A KEG/.test(t))).toBe(false);
    });

    /**
     * The route the panel prints quotes both signs — 'E at KEGS OUT' as well as
     * 'face KEGS IN' — and the out tray's caption was 9 px grey while the IN
     * sign was 10 px bold, so the sentence pointed at paint the player had to
     * hunt for across the room.
     */
    it('gives the out tray caption the same weight as the IN sign', () => {
        const h = harness(null, assembly({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        const inSign = h.texts.find((t) => t.text === 'KEGS IN');
        const outSign = h.texts.find((t) => t.text === 'STICKS OUT');

        expect(outSign?.style.fontSize).toBe(inSign?.style.fontSize);
        expect(outSign?.style.fontStyle).toBe('bold');
    });

    it('leaves a station nobody brings anything to unstriped', () => {
        const h = harness(row({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_ALPHA)).toEqual([]);
    });

    /**
     * The starve that reads exactly like a keg starve and is not one. `startPour`
     * consumes the keg off the shelf at the first pour and keeps it in `state.keg`,
     * so a Jig stopped in `parts` waiting on B has nothing on its shelf but the
     * casings `feed()` restocked. Answering that with NEED KEGS sends the hauler
     * to fill all eight slots, and a full shelf is what stops the casing restock.
     */
    it('asks for a fuse, not kegs, while the Jig waits on an empty cradle', () => {
        const h = harness(
            null,
            assembly({ state: 'starved', inputShelf: ['c-1', 'c-2', 'c-3'], mg: WAITING_ON_A_FUSE }),
        );

        createStationsLayer(h.scene);
        h.post();

        const said = h.texts.filter((t) => t.visible).map((t) => t.text);

        expect(said.some((t) => /FUSE/.test(t))).toBe(true);
        expect(said).not.toContain('NEED A KEG');
        expect(said).not.toContain(STATION_COPY.needParts);
    });

    /**
     * It used to leave the zone dim, because a fuse set never crossed this shelf:
     * B fetched one from the rack and tossed it across the aisle. Since N2 the bin
     * takes one — `assembly-a.inputShelf.accepts` lists `parts` and
     * `takeFromShelf` arms the cradle out of it — so carrying a set into the
     * striped zone is an answer to this stop, and for a crew with nobody at the
     * rack it is the only answer. The relay is still there; the zone is no longer
     * lying about being no use.
     */
    it('lights the intake zone for a fuse, which the bin now takes', () => {
        const h = harness(
            null,
            assembly({ state: 'starved', inputShelf: ['c-1', 'c-2', 'c-3'], mg: WAITING_ON_A_FUSE }),
        );

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA).length).toBeGreaterThan(0);
    });

    // `shelfPush` refuses at the cap and answers with a bonk and no words, so the
    // zone stops inviting a keg it cannot take — and the red 8/8 says why.
    it('stops inviting a keg once the shelf is full', () => {
        const full = ['c-1', 'c-2', 'c-3', 'k-1', 'k-1', 'k-1', 'k-1', 'k-1'];
        const h = harness(null, {
            ...assembly({ state: 'idle', inputShelf: full }),
            carrying: 'k-1',
        });

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
        expect(h.texts.some((t) => t.text === '8/8' && t.visible)).toBe(true);
    });

    /**
     * The repaint guard again, on the station that actually has an apron: the
     * powder harness paints none of this, so nothing was watching whether the
     * striped zone redraws itself every frame.
     */
    /**
     * The layer's docstring promises 'a station that is doing nothing costs one
     * string compare a frame', and the Jig's `mg` is the whole overlay payload —
     * tiles, lanes, knots, the keg. Parsing it every frame before the repaint
     * guard is the one cost the draw-op count cannot see.
     */
    it('parses the mini-game blob only when the blob itself changes', () => {
        const h = harness(null, assembly({ state: 'idle', inputShelf: ['c-1'], mg: SEAT }));
        const parse = vi.spyOn(JSON, 'parse');

        createStationsLayer(h.scene);
        h.post();

        const after = parse.mock.calls.length;

        h.post();
        h.post();

        expect(parse.mock.calls.length).toBe(after);
        parse.mockRestore();
    });

    it('repaints the intake zone only when something it draws has changed', () => {
        for (const over of [
            { state: 'working', progress: 0.5, workers: 1, mg: SEAT },
            { state: 'starved', inputShelf: ['c-1'], mg: SEAT },
        ]) {
            const h = harness(null, assembly(over));

            createStationsLayer(h.scene);
            h.post();

            const after = h.ops.length;

            h.post();
            h.post();

            expect(h.ops.length).toBe(after);
        }
    });
});

/**
 * The hue of a colour in degrees, for the one thing a palette cannot be tested
 * for by name: two marks on the same machine that mean different things and look
 * identical.
 */
function hueOf(colour: number): number {
    const [r, g, b] = [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff].map(
        (v) => v / 255,
    ) as [number, number, number];
    const max = Math.max(r, g, b);
    const span = max - Math.min(r, g, b);

    if (span === 0) return 0;

    const raw =
        max === r ? ((g - b) / span) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;

    return (raw * 60 + 360) % 360;
}

/** sRGB relative luminance, for the one thing hue cannot answer. */
function luminance(colour: number): number {
    const channel = (shift: number): number => {
        const v = ((colour >> shift) & 0xff) / 255;

        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrastRatio(a: number, b: number): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

    return (hi + 0.05) / (lo + 0.05);
}

function hueGap(a: number, b: number): number {
    const gap = Math.abs(hueOf(a) - hueOf(b));

    return Math.min(gap, 360 - gap);
}

describe('the intake colour', () => {
    /**
     * On the shipped Assembly the rack post is [16,8] and the apron is [10,7]/[11,7]
     * — one machine, and at 0xffa41b against the rack's 0xff9a00 the two warm marks
     * were 0.2° of hue apart. "Where B fetches a fuse" and "where you put a keg
     * down" cannot be the same colour on the same station.
     */
    it('does not sit on top of the other marks on the same machine', () => {
        expect(hueGap(STATION_COLOURS.apron, STATION_COLOURS.rack)).toBeGreaterThan(40);
        expect(hueGap(STATION_COLOURS.apron, STATION_COLOURS.work)).toBeGreaterThan(40);
        expect(hueGap(STATION_COLOURS.apron, STATION_COLOURS.alert)).toBeGreaterThan(40);
    });
});

describe('the out tray', () => {
    /**
     * A player who reads NEED KEGS at Assembly looks up at two grey machines. The
     * only cue that Boom Powder's four white rounded rectangles are kegs was that
     * a keg glyph is a white rounded rectangle; the tray said 'OUT'.
     */
    it('names what is on it, from the level recipes', () => {
        const h = harness(row({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'KEGS OUT')).toBe(true);
        expect(h.texts.some((t) => t.text === 'OUT')).toBe(false);
    });
});

/**
 * The whistle, with nobody anywhere. Three machines used to shout NEED HANDS in
 * the same frame, in the same colour, at the same size — and one of them was
 * lying: the dock has no sticks in existence at t=0 and walking there is the
 * worst opening move in the game.
 */
describe('who calls for hands at the whistle', () => {
    it('leaves an empty dock silent and lets the machine with a job speak', () => {
        const h = harness(row({ state: 'idle', workers: 0 }), {
            stations: [POWDER_CFG, DOCK_CFG],
            rows: [['dock-a', row({ state: 'idle', workers: 0, mg: dockMg([{ itemId: '' }]) })]],
        });

        createStationsLayer(h.scene);
        h.post();

        const said = h.texts.filter((t) => t.visible).map((t) => t.text);

        expect(said.filter((t) => t === STATION_COPY.needHands)).toHaveLength(1);
    });

    it('calls for hands at the dock once a stick is waiting on a lane', () => {
        const h = harness(null, {
            stations: [DOCK_CFG],
            rows: [['dock-a', row({ state: 'idle', workers: 0, mg: dockMg([{ itemId: 's-1' }]) })]],
        });

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === STATION_COPY.needHands && t.visible)).toBe(true);
    });
});

/**
 * The hopper (F15 §2). A shelf used to be a grey box with 8 px glyphs laid into
 * it and an `n/cap` string a gap below the tile — and from the Dock end of the
 * floor a tray holding one keg looked exactly like a tray holding six. "Boom
 * Powder is drowning Assembly" is the sentence the whole game is built to make
 * sayable while pointing, and it needs a silhouette, not a label.
 */
describe('the hopper standing on a shelf tile', () => {
    /** Every op that painted in the fill colour at full alpha. */
    const filled = (ops: string[]): string[] =>
        ops.filter((op) => op === `fillStyle:${STATION_COLOURS.fill},1`);

    /**
     * The fill column used to be `lineColour('a')` = 0xd62828 and the full-tray
     * alarm stroke two lines later is 0xd9463d: about 1.16:1 across a 2 px edge.
     * So a healthy filling tray was painted in the exact colour this floor
     * reserves for a fault, and the one thing an out tray exists to shout — "I am
     * at my cap, the next keg goes in your hands" (ADR 0012) — was invisible
     * against its own contents. 3:1 is WCAG's bar for a graphical boundary.
     */
    it('keeps the alarm colour legible against what the tray is holding', () => {
        expect(contrastRatio(STATION_COLOURS.fill, STATION_COLOURS.alert)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(LINE_COLOURS.a, STATION_COLOURS.alert)).toBeLessThan(1.5);
    });

    it('paints no fill column while the tray is empty', () => {
        const h = harness(row({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        expect(filled(h.ops)).toEqual([]);
    });

    it('paints one as soon as something is on the tray', () => {
        const h = harness(row({ state: 'idle', outputShelf: ['k-1'] }));

        createStationsLayer(h.scene);
        h.post();

        expect(filled(h.ops).length).toBeGreaterThan(0);
    });

    /**
     * The counter was positioned a `COUNTER_GAP` *below* the shelf tile: a
     * number you had to walk over and read, on the one surface whose whole job
     * is to be read from the other side of the room.
     */
    it('reads its count on the throat rather than under the tile', () => {
        const h = harness(row({ state: 'idle', outputShelf: ['k-1'] }));

        createStationsLayer(h.scene);
        h.post();

        const counter = h.texts.find((t) => t.text === '1/6');

        // Boom Powder's out chute stands on 7,4, so its throat is inside rows 3-4
        // and a counter a `COUNTER_GAP` under the tile would be past y 5.
        expect(counter?.visible).toBe(true);
        expect(counter?.y).toBeGreaterThan(3 * TILE_PX);
        expect(counter?.y).toBeLessThan(5 * TILE_PX);
    });

    // A full out tray is what puts the next keg in the operator's hands
    // (ADR 0012), so it is the whole room's business, not the operator's.
    it('outlines the tray in the alert colour once it is at the cap', () => {
        const six = row({ state: 'idle', outputShelf: ['k-1', 'k-1', 'k-1', 'k-1', 'k-1', 'k-1'] });
        const h = harness(six);

        createStationsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${STATION_COLOURS.alert}`))).toBe(true);
        expect(h.texts.some((t) => t.text === '6/6')).toBe(true);
    });

    /**
     * `feed()` stocks Assembly's casings itself, one a tick, because Casing Prep
     * is M2. A funnel you cannot pour into is a lie a player only learns by
     * walking a casing errand that does not exist.
     */
    it('gives the type the machine stocks for itself a closed silo, not a funnel', () => {
        const h = harness(null, assembly({ state: 'idle', inputShelf: ['c-1'] }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === AUTO && t.visible)).toBe(true);
    });

    it('still lets the apron stripes through on the tile below it', () => {
        const h = harness(null, assembly({ state: 'idle', inputShelf: ['c-1'] }));

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_ALPHA).length).toBeGreaterThan(0);
    });

    /**
     * 'AUTO' at 8 px monospace is ~19 px and the silo is 6.5 px wide, so centred
     * on the silo's throat it ran right across the keg funnel's mouth — reading as
     * a label on the funnel, which inverts what it says. It is read down the silo
     * for the same reason the rack's bin names are.
     */
    it('reads AUTO down the silo rather than across the funnel beside it', () => {
        const h = harness(null, assembly({ state: 'idle', inputShelf: ['c-1'] }));

        createStationsLayer(h.scene);
        h.post();

        const auto = h.texts.find((t) => t.text === AUTO);
        const funnelRight = 11 * TILE_PX + (TILE_PX - 28) / 2 + (28 * 1) / 1.3;

        expect(auto?.visible).toBe(true);
        expect(auto?.angle).not.toBe(0);
        expect(auto?.x).toBeGreaterThan(funnelRight);
    });

    /**
     * The alert stroke means "this tray is at cap and the next item goes into the
     * operator's hands" (ADR 0012). On the AUTO silo it said a bin the player must
     * not chase is in trouble, which is the opposite of what the closed silhouette
     * is there for.
     */
    it('reddens only the bins a player can fill', () => {
        const full = assembly({
            state: 'idle',
            inputShelf: ['k-1', 'k-1', 'k-1', 'k-1', 'c-1', 'c-1', 'c-1', 'c-1'],
        });
        const h = harness(null, full);

        createStationsLayer(h.scene);
        h.post();

        const alert = h.ops.filter((op) => op.startsWith(`lineStyle:2,${STATION_COLOURS.alert}`));

        expect(alert).toHaveLength(1);
    });

    /**
     * The number and the column it sat on were two different facts: `hopperOf`
     * gives each bin its own type's count while `shelfCounter` counts everything
     * on the shelf, and the counter was anchored to the first fillable bin's
     * throat. Two kegs and three casings painted a keg funnel a quarter full with
     * '5/8' sitting on it. The count belongs to the shelf, so it is drawn on the
     * shelf's own face, between the bins rather than on one of them.
     */
    it('counts the shelf on the shelf, not on one of its bins', () => {
        const h = harness(
            null,
            assembly({ state: 'idle', inputShelf: ['k-1', 'k-1', 'c-1', 'c-1', 'c-1'] }),
        );

        createStationsLayer(h.scene);
        h.post();

        const counter = h.texts.find((t) => t.text === '5/8');

        expect(counter?.visible).toBe(true);
        expect(counter?.x).toBe(11.5 * TILE_PX);
    });
});

/**
 * The fuse rack, as everybody who is not standing at it sees it (F15 §3). It
 * was one orange tile outline: nothing about it said there were two lengths to
 * choose between, let alone which one the order on the board wanted.
 */
describe('the fuse rack from across the floor', () => {
    /**
     * `StationState.mg`, with the three fields the rack is drawn from. `b` is
     * load-bearing: `bPick` is seeded 'long' at `createJigState` and is only ever
     * derived from the order once somebody takes the rack tile, so the pick means
     * nothing until `b` names them.
     */
    const rackMg = (bPick: string, wants: string, b = 'B1'): string =>
        JSON.stringify({
            phase: 'seat',
            cradle: 'empty',
            b,
            bPick,
            orderChip: wants === '' ? [] : [{ orderId: 'o-1', fuseLength: wants }],
        });

    /**
     * Everything drawn inside the rack tile, which the shipped Assembly puts at
     * 13,7. Both coordinates, not just the x: the nameplate on the body above is
     * centred on the same column, 100 px up, and a filter that scopes by tile has
     * to mean the tile.
     */
    const onRack = (ops: string[], op: string): string[] =>
        ops.filter((entry) => {
            const [name, args] = entry.split(':');
            const [x, y] = (args ?? '').split(',').map(Number);

            return (
                name === op &&
                (x ?? -1) >= 13 * TILE_PX &&
                (x ?? -1) < 14 * TILE_PX &&
                (y ?? -1) >= 7 * TILE_PX &&
                (y ?? -1) < 8 * TILE_PX
            );
        });

    it('draws two bins on the rack tile before anybody has joined', () => {
        const h = harness(null, assembly({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        expect(onRack(h.ops, 'strokeRoundedRect')).toHaveLength(2);
    });

    /**
     * The panel got the sentence and the floor got a tick mark. `pickLabel` named
     * the PICK — 'LONG FUSE' — which is the one thing on the tile that is actively
     * wrong when the pick and the order disagree, and the disagreement itself was
     * a 7 px chevron in a slightly different shade. `rackCaption` was already
     * built and colour-coded and the world rack never called it.
     */
    it('says on the floor exactly what the panel says in the aisle', () => {
        const h = harness(null, assembly({ state: 'idle', mg: rackMg('long', 'long') }));

        createStationsLayer(h.scene);
        h.post();

        const caption = rackCaption('long', 'long', true);

        expect(h.texts.some((t) => t.text === caption.text && t.visible)).toBe(true);
        expect(h.texts.some((t) => t.text === 'LONG FUSE')).toBe(false);
    });

    it('names the wanted length on the floor when the pick is on the other bin', () => {
        const h = harness(null, assembly({ state: 'idle', mg: rackMg('long', 'short') }));

        createStationsLayer(h.scene);
        h.post();

        const caption = rackCaption('long', 'short', false);
        const said = h.texts.find((t) => t.text === caption.text);

        expect(said?.visible).toBe(true);
        expect(said?.colour).toBe(`#${BOARD_COLOURS.urgent.toString(16)}`);
    });

    /**
     * SHORT and LONG were told apart on the floor by a spool tail of 3 px against
     * 7 px of hairline. The names are read down the bin because an 11 px bin has
     * no room for them across it.
     */
    it('names both bins on the floor, to every client, with nobody joined', () => {
        const h = harness(null, assembly({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        for (const name of ['SHORT', 'LONG']) {
            const label = h.texts.find((t) => t.text === name);

            expect(label?.visible).toBe(true);
            expect(label?.angle).not.toBe(0);
        }
    });

    /**
     * The pick is not wrong — `reconcileRoles` derives it from the active order
     * — but B can override it, and the mismatch is otherwise caught nowhere
     * until the Dock bonks the finished stick with WRONG FUSE, in the hands of
     * a third player who did none of it.
     */
    it('marks the bin the order wants when the pick is on the other one', () => {
        const h = harness(null, assembly({ state: 'idle', mg: rackMg('long', 'short') }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${BOARD_COLOURS.urgent}`))).toBe(true);
    });

    it('marks neither bin while there is nothing on the board', () => {
        const h = harness(null, assembly({ state: 'idle', mg: rackMg('long', '') }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${BOARD_COLOURS.urgent}`))).toBe(false);
    });

    /**
     * `bPick` is seeded 'long' at `createJigState` and only ever derived from the
     * order inside `if (state.b !== b)`. So from the whistle, with nobody at the
     * rack, the wire says `bPick: 'long'` — and for roughly half of all orders the
     * floor was telling every player on it that the rack was set to LONG and the
     * order wanted SHORT, in the urgent amber, before anybody had touched it. A
     * default dressed as a choice you are failing is the exact complaint this
     * whole feature is about.
     */
    it('does not claim a pick nobody has made', () => {
        const h = harness(null, assembly({ state: 'idle', mg: rackMg('long', 'short', '') }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'LONG FUSE' && t.visible)).toBe(false);
        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${BOARD_COLOURS.urgent}`))).toBe(false);
    });

    it('still marks the bin the order wants once somebody is standing there', () => {
        const h = harness(null, assembly({ state: 'idle', mg: rackMg('long', 'short') }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`lineStyle:2,${BOARD_COLOURS.urgent}`))).toBe(true);
    });
});

/** The numeric ops of one kind, for the shapes whose position is the whole point. */
function shapes(ops: string[], op: string): number[][] {
    return ops
        .filter((line) => line.startsWith(`${op}:`))
        .map((line) =>
            line
                .slice(op.length + 1)
                .split(',')
                .map(Number),
        );
}

/**
 * The machine (N3). "The gameboard is better but just feels off for some reason.
 * Some of the words/signs are just there and not entirely accurate. I bet adding
 * the fuse receptacle and making the stations more of a 'machine' on the board
 * might fix it a lot."
 *
 * The old drawing is the reason: every machine tile was filled on its own and
 * given its own 2 px top highlight, so Assembly was six boxes in a row with a
 * word floating over the middle of them — which is why the signage read as
 * bolted on rather than part of the thing. The body is now one silhouette with a
 * lit top, a shaded front, a console on the side the crew works from and a plate
 * the name is bolted to.
 *
 * The harness's Assembly block is row 4 of x 11–16 (`MACHINE_WALLS` inside the
 * station's own bbox), so the body is one 192 px slab at y 128.
 */
describe('the machine on the board', () => {
    const body = (): string[] => {
        const h = harness(null, assembly({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        return h.ops;
    };

    it('fills each row of the body as one slab, not one box per tile', () => {
        const rects = shapes(body(), 'fillRect');

        expect(rects).toContainEqual([11 * TILE_PX, 4 * TILE_PX, 6 * TILE_PX, TILE_PX]);
        // The retired per-tile highlight: a 32x2 cap on top of every single tile,
        // which is exactly what made one machine read as a row of boxes.
        expect(rects.filter((r) => r[2] === TILE_PX && r[3] === 2)).toEqual([]);
    });

    it('draws one silhouette around it rather than a seam between its tiles', () => {
        const ops = body();
        const left = 11 * TILE_PX;
        const right = 17 * TILE_PX;
        const runs = shapes(ops, 'lineBetween');

        expect(ops).toContain(`lineStyle:2,${STATION_COLOURS.machineEdge},1`);
        expect(runs).toContainEqual([left, 3 * TILE_PX, right, 3 * TILE_PX]);
        expect(runs).toContainEqual([left, 5 * TILE_PX, right, 5 * TILE_PX]);
        // The seam between rows 3 and 4 is the one line that must not be there.
        expect(runs).not.toContainEqual([left, 4 * TILE_PX, right, 4 * TILE_PX]);
    });

    it('lights the top and shades the front, so the body has a direction', () => {
        const rects = shapes(body(), 'fillRect');

        expect(rects).toContainEqual([11 * TILE_PX, 3 * TILE_PX, 6 * TILE_PX, COWL_PX]);
        expect(rects).toContainEqual([
            11 * TILE_PX,
            5 * TILE_PX - PLINTH_PX,
            6 * TILE_PX,
            PLINTH_PX,
        ]);
    });

    /**
     * A word painted straight onto the grey belongs to nothing, which is the
     * "just there" the owner read. A plate with a bolt through each end is part
     * of the machine, and the name on it is then the machine's own.
     */
    it('bolts the name to a plate instead of letting it float on the grey', () => {
        const ops = body();
        const centre = { x: 14 * TILE_PX, y: 4 * TILE_PX };
        const plate = shapes(ops, 'fillRoundedRect').find(
            (r) => Math.abs((r[0] ?? 0) + (r[2] ?? 0) / 2 - centre.x) < 1,
        );

        expect(plate).toBeDefined();
        expect((plate?.[1] ?? 0) + (plate?.[3] ?? 0) / 2).toBeCloseTo(centre.y, 5);
        expect(shapes(ops, 'fillCircle').filter((c) => c[1] === centre.y)).toHaveLength(2);
    });

    /**
     * The work tiles were outlined on the floor and the body above them was
     * blank, so nothing about the machine said which side of it you operate.
     */
    it('gives the working side a console over the tiles the crew stand on', () => {
        const lip = shapes(body(), 'fillRect').find(
            (r) => r[0] === 13 * TILE_PX && r[2] === 2 * TILE_PX,
        );

        expect(lip).toBeDefined();
        expect((lip?.[1] ?? 0) + (lip?.[3] ?? 0)).toBe(5 * TILE_PX);
    });

    /**
     * The bins used to stand on the shelf tile looking like furniture parked in
     * front of the machine. Framed into the body they read as mouths cut into its
     * intake side, which is the half of N2 the drawing owes the fuse bin.
     */
    it('frames the intake bins into the body rather than parking them beside it', () => {
        const bins = shapes(body(), 'fillRect').find((r) => r[0] === 11 * TILE_PX - 1);

        expect(bins).toBeDefined();
        expect(bins?.[1]).toBe(3 * TILE_PX);
    });

    it('still outlines the work posts and the floor ring it always did', () => {
        const ops = body();

        expect(ops.some((op) => op.startsWith(`lineStyle:2,${STATION_COLOURS.work}`))).toBe(true);
        expect(ops.some((op) => op.startsWith(`lineStyle:1,${STATION_COLOURS.ring}`))).toBe(true);
    });

    it('draws no body at all for a station with no machine tiles in its footprint', () => {
        const h = harness(null, {
            stations: [DOCK_CFG],
            rows: [['dock-a', row({ state: 'idle', mg: dockMg([{ itemId: 's-1' }]) })]],
        });

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'DOCK')).toBe(true);
        expect(h.ops).not.toContain(`lineStyle:2,${STATION_COLOURS.machineEdge},1`);
    });
});

/**
 * The receptacle on screen (N2). "There should be a receptacle for fuses like
 * there is for boom — having to just drop them in at the assembly line's feet or
 * carry it over as the operator is kludgey and doesn't make sense. You input the
 * materials into the station the same."
 *
 * Kegs and casings already had a bin each on the intake face. The fuse set gets
 * the third, with the one fact no other bin needs: the length the machine will
 * reach for. `usableSetOnShelf` (`shared/src/sim/jig.ts`) refuses a set the
 * seated order cannot use, so a bin of LONG sets under a SHORT order stops the
 * Jig exactly as dead as an empty bin while the shelf's `n/cap` reads stocked.
 */
describe('the fuse bin on the intake face', () => {
    /** `StationState.mg` for a Jig stopped on an empty cradle, wanting a length. */
    const wanting = (cradleWants: string): string =>
        JSON.stringify({ phase: 'parts', cradle: 'empty', keg: { poursLeft: 1 }, cradleWants });

    function fused(over: Record<string, unknown>): Extras {
        return { stations: [ASSEMBLY_FUSE_CFG], rows: [['assembly-a', row(over)]] };
    }

    /** The three bins on a 60 px face: keg 354–380, AUTO silo 380–388, fuse 388–414. */
    const FUSE_BIN = { x0: 388, x1: 414 };

    it('names the bin down its own face, in the plural the floor signs use', () => {
        const h = harness(null, fused({ state: 'idle', mg: wanting('short') }));

        createStationsLayer(h.scene);
        h.post();

        const name = h.texts.find((t) => t.text === 'FUSE SETS');

        expect(name?.angle).not.toBe(0);
        expect(name?.x).toBeGreaterThan(FUSE_BIN.x0);
        expect(name?.x).toBeLessThan(FUSE_BIN.x1);
    });

    it('names the keg bin the same way, so the two funnels are told apart', () => {
        const h = harness(null, fused({ state: 'idle', mg: wanting('short') }));

        createStationsLayer(h.scene);
        h.post();

        const name = h.texts.find((t) => t.text === 'KEGS');

        expect(name?.angle).not.toBe(0);
        expect(name?.x).toBeLessThan(FUSE_BIN.x0);
    });

    /**
     * The rack already draws SHORT and LONG on its own two bins down on row 7.
     * This one is on the machine's intake face, which is what makes it a fact
     * about the bin rather than about the rack.
     */
    it('tags the bin with the length the machine will reach for', () => {
        const h = harness(null, fused({ state: 'idle', mg: wanting('short') }));

        createStationsLayer(h.scene);
        h.post();

        const tag = h.texts.find(
            (t) => t.text === 'SHORT' && t.y > 3 * TILE_PX && t.y < 5 * TILE_PX,
        );

        expect(tag?.visible).toBe(true);
        expect(tag?.x).toBeGreaterThan(FUSE_BIN.x0);
        expect(tag?.x).toBeLessThan(FUSE_BIN.x1);
    });

    it('says so in the rack voice for a length the bin can satisfy', () => {
        const h = harness(null, fused({ state: 'idle', inputShelf: ['p-short'], mg: wanting('short') }));

        createStationsLayer(h.scene);
        h.post();

        const tag = h.texts.find((t) => t.text === 'SHORT' && t.y < 5 * TILE_PX);

        expect(tag?.colour).toBe(`#${RACK_COLOURS.set.toString(16).padStart(6, '0')}`);
    });

    /**
     * The only amber state on the bin, and the reason the tag exists at all: two
     * sets banked, 2/8 on the shelf, and the machine will not touch either of
     * them. Amber rather than red for the rack's own reason — a length that
     * disagrees is pressure, not a fault.
     */
    it('turns amber when every set banked is the wrong length', () => {
        const h = harness(
            null,
            fused({ state: 'idle', inputShelf: ['p-long', 'p-long'], mg: wanting('short') }),
        );

        createStationsLayer(h.scene);
        h.post();

        const tag = h.texts.find((t) => t.text === 'SHORT' && t.y < 5 * TILE_PX);

        expect(tag?.colour).toBe(`#${RACK_COLOURS.warn.toString(16).padStart(6, '0')}`);
    });

    it('takes any length on a day with no order to disagree with', () => {
        const h = harness(null, fused({ state: 'idle', inputShelf: ['p-long'], mg: wanting('') }));

        createStationsLayer(h.scene);
        h.post();

        const tag = h.texts.find((t) => t.text === ANY);

        expect(tag?.visible).toBe(true);
        expect(tag?.colour).toBe(`#${RACK_COLOURS.set.toString(16).padStart(6, '0')}`);
    });

    it('has no tag at all on a machine whose shelf refuses fuse sets', () => {
        const h = harness(null, assembly({ state: 'idle', mg: wanting('short') }));

        createStationsLayer(h.scene);
        h.post();

        expect(h.texts.some((t) => t.text === 'FUSE SETS')).toBe(false);
        expect(h.texts.some((t) => t.text === 'SHORT' && t.y < 5 * TILE_PX)).toBe(false);
    });

    it('fills the bin with the sets banked in it', () => {
        const h = harness(null, fused({ state: 'idle', inputShelf: ['p-long', 'p-short'] }));

        createStationsLayer(h.scene);
        h.post();

        const column = shapes(h.ops, 'fillRect').filter(
            (r) => (r[0] ?? 0) >= FUSE_BIN.x0 && (r[0] ?? 0) < FUSE_BIN.x1 && r[3] === 2,
        );

        expect(column.length).toBeGreaterThan(0);
        expect(h.texts.some((t) => t.text === '2/8' && t.visible)).toBe(true);
    });

    /**
     * All of the above is a lot of new drawing, and the layer's promise is that a
     * station doing nothing costs one string compare a frame. The fuse facts are
     * on the key because nothing else on it can see them: two LONG sets and one
     * of each are the same item types on the same shelf.
     */
    it('repaints only when the fuse bin itself has changed', () => {
        for (const over of [
            { state: 'idle', inputShelf: ['p-long'], mg: wanting('short') },
            { state: 'starved', inputShelf: ['p-long', 'p-short'], mg: wanting('long') },
        ]) {
            const h = harness(null, fused(over));

            createStationsLayer(h.scene);
            h.post();

            const after = h.ops.length;

            h.post();
            h.post();

            expect(h.ops.length).toBe(after);
        }
    });
});

/**
 * The helper posts on the floor (N4). "You can 'sit'/press E and get stuck on the
 * squares around a station — you should only be able to press E on something you
 * can pick up or a station that you're working." Half the fix is the shrunken join
 * zone in `shared`; this is the other half, which is that the tile never looked
 * like anything: every ring tile wore the same faint grey dashes, on the corridor
 * as much as on the post.
 */
describe('the helper posts', () => {
    it('brackets the posts dimly while nobody is running the machine', () => {
        const h = harness(null, { ...assembly({ state: 'idle' }), crew: [] });

        createStationsLayer(h.scene);
        h.post();

        // `ASSEMBLY_CFG`'s ring is the single tile (12,5): eight arms, one stroke.
        expect(postStrokes(h.ops, APRON_ALPHA)).toHaveLength(1);
        expect(postArms(h.ops)).toHaveLength(8);
        expect(postStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
    });

    it('brings the posts up to full once every work tile is taken', () => {
        const h = harness(null, {
            ...assembly({ state: 'working', workers: 2 }),
            crew: [
                { stationId: 'assembly-a', workTile: '13,5' },
                { stationId: 'assembly-a', workTile: '14,5' },
            ],
        });

        createStationsLayer(h.scene);
        h.post();

        expect(postStrokes(h.ops, APRON_LIT_ALPHA)).toHaveLength(1);
        expect(postArms(h.ops)).toHaveLength(16);
    });

    it('leaves them dim while only one of the two posts is manned', () => {
        const h = harness(null, {
            ...assembly({ state: 'working', workers: 1 }),
            crew: [{ stationId: 'assembly-a', workTile: '13,5' }],
        });

        createStationsLayer(h.scene);
        h.post();

        expect(postStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
    });

    it('names the posts once, and lights the word with the brackets', () => {
        const dim = harness(null, { ...assembly({ state: 'idle' }), crew: [] });

        createStationsLayer(dim.scene);
        dim.post();

        const word = dim.texts.filter((t) => t.text === POST_LABEL);

        expect(word).toHaveLength(1);
        expect(word[0]?.alpha).toBe(APRON_ALPHA);

        const live = harness(null, {
            ...assembly({ state: 'working', workers: 2 }),
            crew: [
                { stationId: 'assembly-a', workTile: '13,5' },
                { stationId: 'assembly-a', workTile: '14,5' },
            ],
        });

        createStationsLayer(live.scene);
        live.post();

        expect(live.texts.find((t) => t.text === POST_LABEL)?.alpha).toBe(APRON_LIT_ALPHA);
    });
});
