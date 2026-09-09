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
const { JIG_COLOURS } = await import('../minigames/Jig');

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

    setOrigin(): this {
        return this;
    }

    setStroke(): this {
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
    'lineBetween',
    'beginPath',
    'arc',
    'strokePath',
    'clear',
] as const;

/** The shipped Boom Powder: an out tray and nothing anybody brings to it. */
const POWDER_CFG = {
    id: 'powder-a',
    type: 'boom_powder',
    line: 'a',
    joinMode: 'press',
    anchor: [4, 2],
    workTiles: [[5, 4]],
    rackTiles: [],
    outputShelf: { tile: [7, 3], capacity: 6 },
    floorRing: { tiles: [[3, 4]] },
};

/**
 * The shipped Assembly (`config/game/levels/*.json`): the IN shelf sits at 11,7
 * on the left edge of a machine that spans x 11–16, so the aisle a hauler walks
 * — and the apron — is the tile at 10,7.
 */
const ASSEMBLY_CFG = {
    id: 'assembly-a',
    type: 'assembly',
    line: 'a',
    joinMode: 'press',
    anchor: [12, 6],
    workTiles: [
        [13, 8],
        [14, 8],
    ],
    rackTiles: [[16, 8]],
    inputShelf: { tile: [11, 7], capacity: 8, accepts: ['keg', 'casing'] },
    outputShelf: { tile: [13, 10], capacity: 4 },
    floorRing: { tiles: [[10, 8]] },
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
    const layout = { width: 28, height: 14, walls: [2 * 28 + 4, 6 * 28 + 12] };
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
                players: new Map([
                    [
                        's1',
                        {
                            stationId: 'powder-a',
                            workTile: '5,4',
                            carrying: extras.carrying ?? '',
                        },
                    ],
                ]),
                stations,
                items: new Map([
                    ['k-1', { type: 'keg', quality: 0.7, prime: false }],
                    ['c-1', { type: 'casing', quality: 1, prime: false }],
                    ['c-2', { type: 'casing', quality: 1, prime: false }],
                    ['c-3', { type: 'casing', quality: 1, prime: false }],
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

/** `StationState.mg` as the Jig writes it, at the two stops that look alike. */
const SEAT = JSON.stringify({ phase: 'seat', cradle: 'empty' });
const WAITING_ON_A_FUSE = JSON.stringify({ phase: 'parts', cradle: 'empty', keg: { poursLeft: 1 } });
/** Between the two sticks one keg pours: the machine is stocked, the shelf is bare. */
const KEG_IN_THE_MACHINE = JSON.stringify({ phase: 'seat', cradle: 'empty', keg: { poursLeft: 1 } });

/** The shipped dock: two ramp lanes, no shelf of any kind. */
const DOCK_CFG = {
    id: 'dock-a',
    type: 'dock',
    line: 'a',
    joinMode: 'stand',
    anchor: [22, 3],
    workTiles: [
        [22, 4],
        [23, 4],
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

    it('signs the aisle tile, not the shelf the glyphs sit on', () => {
        const h = harness(null, assembly({ state: 'idle' }));

        createStationsLayer(h.scene);
        h.post();

        const sign = h.texts.find((t) => t.text === 'KEGS IN');

        // It used to hang off the shelf tile's edge at 348 px, across the glyphs,
        // where the playtester read it as "KEGS · CAS".
        expect(sign).toBeDefined();
        expect(sign?.x).toBe(10.5 * TILE_PX);
        expect(sign?.y).toBeGreaterThan(7 * TILE_PX);
        expect(sign?.y).toBeLessThan(8 * TILE_PX);
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

    it('leaves the intake zone dim for a fuse, which is fetched from the rack', () => {
        const h = harness(
            null,
            assembly({ state: 'starved', inputShelf: ['c-1', 'c-2', 'c-3'], mg: WAITING_ON_A_FUSE }),
        );

        createStationsLayer(h.scene);
        h.post();

        expect(apronStrokes(h.ops, APRON_LIT_ALPHA)).toEqual([]);
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
