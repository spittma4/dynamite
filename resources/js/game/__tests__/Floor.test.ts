import { TILE_PX, type LayoutConfig } from '@shared';
import { describe, expect, it } from 'vitest';

import { FLOOR_LABEL, FloorView, beaconColour, clampLabel } from '../render/Floor';
import { NOTHING_ON_THE_BOARD, ORDER_BOARD } from '../nouns';
import { UI } from '../render/palette';
import type { Factory } from '../scenes/Factory';

/**
 * The pole is the one place the beacon colour is drawn (F04 §3), so the colour
 * is a function of `StationState.beacon` and the server clock alone.
 */

describe('beaconColour', () => {
    it('is dark while the station is calling for nothing', () => {
        expect(beaconColour('off', 0)).toBe(UI.beaconOff);
        expect(beaconColour('', 12.5)).toBe(UI.beaconOff);
    });

    it('is gold whenever a pickup is wanted, whatever the clock says', () => {
        expect(beaconColour('gold', 0)).toBe(UI.beaconGold);
        expect(beaconColour('gold', 3.37)).toBe(UI.beaconGold);
    });

    it('blinks red twice a second', () => {
        expect(beaconColour('red', 0)).toBe(UI.beaconRed);
        expect(beaconColour('red', 0.2)).toBe(UI.beaconRed);
        expect(beaconColour('red', 0.3)).toBe(UI.beaconOff);
        expect(beaconColour('red', 0.45)).toBe(UI.beaconOff);
        expect(beaconColour('red', 0.5)).toBe(UI.beaconRed);
        expect(beaconColour('red', 12.8)).toBe(UI.beaconOff);
    });
});

/**
 * Not the mechanism behind the reported 'LAST BI' — no shipped layout reaches
 * this. In `config/game/layouts/one-line.json` the only blast bin is tile
 * [1, 8]: centre x = 48 px, a ~43 px label, left edge ~26 px, comfortably
 * inside the 896 px world. `clampLabel` exists for the layout a designer is
 * free to write tomorrow, with a prop in column 0 or row 0 — the map is resized
 * to exactly `width × TILE_PX` (`Factory.applyConfig`), so there is no margin
 * to overhang into and the overhang is simply not drawn. Slide the whole name
 * back inside rather than letting it be cut: a name half read is worse than a
 * name a few pixels off centre.
 */
describe('clampLabel', () => {
    const world = { width: 896, height: 576 };
    const bin = { width: 44, height: 14 };

    it('leaves a label in open floor exactly where it was put', () => {
        expect(clampLabel({ x: 448, y: 288 }, bin, world)).toEqual({ x: 448, y: 288 });
    });

    it('slides a prop against the left wall fully inside', () => {
        expect(clampLabel({ x: 16, y: 288 }, bin, world)).toEqual({ x: 22, y: 288 });
    });

    it('slides a prop against the right wall fully inside', () => {
        expect(clampLabel({ x: 880, y: 288 }, bin, world)).toEqual({ x: 874, y: 288 });
    });

    it('slides a prop against the top wall fully inside', () => {
        expect(clampLabel({ x: 448, y: 4 }, bin, world)).toEqual({ x: 448, y: 7 });
    });

    it('slides a prop against the bottom wall fully inside', () => {
        expect(clampLabel({ x: 448, y: 572 }, bin, world)).toEqual({ x: 448, y: 569 });
    });

    it('centres a name too long for the world rather than picking an end to cut', () => {
        expect(clampLabel({ x: 10, y: 288 }, { width: 1200, height: 14 }, world)).toEqual({
            x: 448,
            y: 288,
        });
    });
});

/** One `Text` the floor made: what it says, where it ended up, and how it reads. */
interface Painted {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    colour: string;
    stroke: string;
    strokeThickness: number;
}

interface TextStyle {
    fontSize?: string;
    color?: string;
    stroke?: string;
    strokeThickness?: number;
}

/** A Phaser object that answers every call it is not asked about with itself. */
function stub(target: Record<string, unknown>): Record<string, unknown> {
    const proxy: Record<string, unknown> = new Proxy(target, {
        get: (obj, prop) => (prop in obj ? obj[prop as string] : () => proxy),
    });

    return proxy;
}

/**
 * Chrome measures 8 px monospace at 4.82 px a character; 0.6 em is the same
 * number to within a pixel and is what makes 'BLAST BIN' 43 px wide on a 32 px
 * tile. The stroke is drawn outside the glyphs, so it counts.
 */
function measure(text: string, style: TextStyle): { width: number; height: number } {
    const size = Number.parseInt(style.fontSize ?? '8px', 10);
    const stroke = style.strokeThickness ?? 0;

    return { width: text.length * size * 0.6 + stroke, height: size + stroke };
}

function painter(layout: LayoutConfig): { painted: Painted[]; view: FloorView } {
    const painted: Painted[] = [];
    const scene = stub({
        add: stub({
            graphics: () => stub({}),
            text: (x: number, y: number, text: string, style: TextStyle) => {
                const label: Painted = {
                    text,
                    x,
                    y,
                    ...measure(text, style),
                    colour: style.color ?? '',
                    stroke: style.stroke ?? '',
                    strokeThickness: style.strokeThickness ?? 0,
                };

                painted.push(label);

                return stub({
                    width: label.width,
                    height: label.height,
                    setPosition: (px: number, py: number) => {
                        label.x = px;
                        label.y = py;
                    },
                    // The board's live line is the one label that changes after
                    // it is drawn, so what it ends up saying has to be readable.
                    setText: (value: string) => {
                        label.text = value;
                    },
                });
            },
        }),
    }) as unknown as Factory;

    const view = new FloorView(scene, stub({}) as never);

    view.draw(layout);

    return { painted, view };
}

function paint(layout: LayoutConfig): Painted[] {
    return painter(layout).painted;
}

/**
 * A layout that puts something with a long name hard against each of the four
 * walls. No shipped layout does — `one-line.json` puts its blast bin a whole
 * tile clear of the left wall — so this is the map a level designer is free to
 * write tomorrow, drawn here rather than waiting for the report.
 */
function edgeLayout(): LayoutConfig {
    return {
        width: 28,
        height: 18,
        walls: [],
        breakRoom: [12, 8, 4, 2],
        blastBins: [
            [0, 9],
            [27, 9],
        ],
        dockDoor: [22, 0, 5],
        ramp: [],
        orderBoard: [14, 0],
        beaconPoles: {},
        props: {
            toolCart: [0, 0],
            countdownSign: [27, 17],
            returnsPile: [3, 17],
            broomHook: [14, 17],
        },
    } as unknown as LayoutConfig;
}

/** sRGB relative luminance, WCAG 2.1 §Relative luminance, for a `#rrggbb`. */
function luminance(css: string): number {
    const channels = [1, 3, 5].map((at) => Number.parseInt(css.slice(at, at + 2), 16) / 255);
    const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

    return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

/** The WCAG contrast ratio between two `#rrggbb` strings, 1:1 to 21:1. */
function contrast(a: string, b: string): number {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);

    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * Every swatch a floor label can be drawn over: the bin, the ramp, the dock
 * door, the order board and the break room are what the props and the bins are
 * painted in, and the bare floor is what the overhanging letters land on,
 * because no label fits inside its own tile.
 */
const GROUNDS = [
    UI.floor,
    UI.blastBin,
    UI.ramp,
    UI.dockDoor,
    UI.orderBoard,
    UI.breakRoom,
].map(hex);

/**
 * The defect this guards: the blast bin's caption was drawn in `UI.outline`
 * (#222222), which reads against the gold of the bin and against nothing else —
 * and 43 px of caption on a 32 px swatch leaves about 1.2 characters hanging at
 * each end, over `UI.floor` (#3a3a44) at 1.4:1. Exactly the seven that landed
 * on the gold survived, and a live browser read 'LAST BI'.
 *
 * So the property is not that every label agrees with `FLOOR_LABEL` — that is
 * true of the broken version too — but that `FLOOR_LABEL` itself is legible on
 * every ground a label can land on. It is an outlined label, so the rule is
 * that one of the two colours reaches 4.5:1 against each: the white fill is
 * only 2.3:1 on the gold bin, which is precisely what the dark stroke is for.
 */
describe('the labels on the floor', () => {
    it('is legible on every swatch the floor is painted in', () => {
        expect(contrast(FLOOR_LABEL.color, FLOOR_LABEL.stroke)).toBeGreaterThanOrEqual(4.5);

        for (const ground of GROUNDS) {
            const best = Math.max(
                contrast(FLOOR_LABEL.color, ground),
                contrast(FLOOR_LABEL.stroke, ground),
            );

            expect({ ground, best: best >= 4.5 }).toEqual({ ground, best: true });
        }
    });

    it('draws the outline the fill depends on', () => {
        expect(FLOOR_LABEL.strokeThickness).toBeGreaterThan(0);
        expect(FLOOR_LABEL.color).not.toBe(FLOOR_LABEL.stroke);
    });

    it('reads on the floor, not on the swatch, wherever it lands', () => {
        const painted = paint(edgeLayout());

        expect(painted.length).toBeGreaterThan(0);

        for (const label of painted) {
            expect(label.colour).toBe(FLOOR_LABEL.color);
            expect(label.stroke).toBe(FLOOR_LABEL.stroke);
            expect(label.strokeThickness).toBeGreaterThan(0);
        }
    });

    /**
     * Every prop caption names an object. 'SIGN' named the category, in the
     * order board's own brown a few tiles from the order board, so it read as a
     * second board with nothing written on it.
     */
    it('captions every prop with the thing it is, never with its category', () => {
        const said = paint(edgeLayout()).map((label) => label.text);

        expect(said).toContain('DAYS SINCE');
        expect(said).not.toContain('SIGN');
    });

    it('names the blast bin in full even when the bin is against a wall', () => {
        const bins = paint(edgeLayout()).filter((label) => label.text === 'BLAST BIN');

        expect(bins).toHaveLength(2);

        for (const bin of bins) expect(bin.width).toBeGreaterThan(TILE_PX);
    });

    /**
     * The prop drew the word ORDERS and nothing else, and it is the one surface
     * between Assembly and the Dock that every hauler walks past. Until now the
     * required fuse length existed on the Tab board and in the Jig's overlay and
     * nowhere in world space, so the hauler who eats the WRONG FUSE bonk at the
     * ramp could not see the requirement from where they stood.
     */
    it('carries what the order wants under the board prop, live', () => {
        const { painted, view } = painter(edgeLayout());

        view.setOrderBoard([
            { id: 'o-1', fuseLength: 'short', status: 'open' },
            { id: 'o-2', fuseLength: 'long', status: 'open' },
        ] as never);

        const said = painted.map((label) => label.text);

        expect(said).toContain(ORDER_BOARD);
        expect(said).toContain('SHORT FUSE');
    });

    it('says the empty book rather than going blank when the day is done', () => {
        const { painted, view } = painter(edgeLayout());

        view.setOrderBoard([] as never);

        expect(painted.map((label) => label.text)).toContain(NOTHING_ON_THE_BOARD);
    });

    it('keeps every label inside the world, at all four walls', () => {
        const world = { width: 28 * TILE_PX, height: 18 * TILE_PX };

        for (const label of paint(edgeLayout())) {
            expect(label.x - label.width / 2).toBeGreaterThanOrEqual(0);
            expect(label.x + label.width / 2).toBeLessThanOrEqual(world.width);
            expect(label.y - label.height / 2).toBeGreaterThanOrEqual(0);
            expect(label.y + label.height / 2).toBeLessThanOrEqual(world.height);
        }
    });
});
