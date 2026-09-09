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
    STATION_COLOURS,
    createStationsLayer,
    machineCentre,
    occupiedWorkTiles,
    progressSweep,
    shelfCounter,
    slotOffsets,
    stateLabel,
    stationBubble,
} = await import('../render/Stations');

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

describe('stateLabel', () => {
    it('names only the states a player has to do something about', () => {
        expect(stateLabel('starved')).toEqual({ text: 'STARVED', colour: STATION_COLOURS.alert });
        expect(stateLabel('jammed')).toEqual({ text: 'JAMMED', colour: STATION_COLOURS.alert });
        expect(stateLabel('damaged')).toEqual({ text: 'DAMAGED', colour: STATION_COLOURS.damaged });
    });

    it('says nothing while the station is idle or working', () => {
        expect(stateLabel('idle')).toBeNull();
        expect(stateLabel('working')).toBeNull();
        expect(stateLabel('')).toBeNull();
    });
});

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

class FakeText {
    text: string;
    colour = '';
    visible = true;
    readonly width = 40;
    readonly height = 12;

    constructor(value: string) {
        this.text = value;
    }

    setOrigin(): this {
        return this;
    }

    setStroke(): this {
        return this;
    }

    setPosition(): this {
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

function harness(stationRow: Record<string, unknown> | null): {
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
    const level = {
        stations: [
            {
                id: 'powder-a',
                type: 'boom_powder',
                line: 'a',
                joinMode: 'press',
                anchor: [4, 2],
                workTiles: [[5, 4]],
                rackTiles: [],
                outputShelf: { tile: [7, 3], capacity: 6 },
                floorRing: { tiles: [[3, 4]] },
            },
        ],
    };
    const layout = { width: 10, height: 10, walls: [2 * 10 + 4] };
    const stations = new Map<string, unknown>();

    if (stationRow) stations.set('powder-a', stationRow);

    const scene = {
        add: {
            graphics,
            text: (_x: number, _y: number, value: string) => {
                const label = new FakeText(value);

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
        conn: {
            state: {
                phase: 'running',
                players: new Map([['s1', { stationId: 'powder-a', workTile: '5,4' }]]),
                stations,
                items: new Map([['k-1', { type: 'keg', quality: 0.7, prime: false }]]),
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
        ...over,
    };
}

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
