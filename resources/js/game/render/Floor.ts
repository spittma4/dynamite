import {
    TILE_PX,
    type LayoutConfig,
    type OrderState,
    type StationState,
    type Tile,
    unpackTile,
} from '@shared';
import type Phaser from 'phaser';

import { NOTHING_ON_THE_BOARD, ORDER_BOARD } from '../nouns';
import { UI } from './palette';
import { wallBoardLine } from '../ui/orderBoard';
import type { Factory } from '../scenes/Factory';

/**
 * The static map plus the layers the server changes underneath it (contracts §8,
 * F04 §3). Everything here is drawn from `LayoutConfig`, so a new layout JSON is
 * a new floor with no code change.
 *
 * Machines, shelves, state words and progress are F05's `render/Stations.ts`;
 * the floor draws none of them, so the two never paint the same pixels twice.
 */

const GRID_ALPHA = 0.08;
const SPILL_ALPHA = 0.55;
const SCORCH_ALPHA = 0.5;
const PROP_PX = 24;
/** The board's live line sits under its name, on the same tile. */
const BOARD_LINE_GAP = 11;
const BEACON_RADIUS = 6;
const BLINK_SECONDS = 0.5;

function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * One look for every name written on the floor, and no caller gets to choose.
 *
 * A floor label is centred on the thing it names and is always wider than it:
 * 'BLAST BIN' is 43 px of 8 px monospace on a 32 px tile, which leaves about
 * 1.2 characters hanging off each end onto bare floor. The caption was painted
 * in `UI.outline` (#222222), and #222222 on `UI.floor` (#3a3a44) is 1.4:1 — so
 * exactly the seven characters that landed on the gold of the bin survived and
 * a live browser read 'LAST BI'. Nothing was clipped; the ends went dark.
 *
 * White over a dark stroke is the only rule that survives a new prop: the fill
 * carries grey, brown and green, the stroke carries the gold, and neither
 * depends on knowing what is painted underneath.
 */
export const FLOOR_LABEL = {
    color: hex(UI.text),
    stroke: hex(UI.outline),
    strokeThickness: 3,
} as const;

/**
 * The centre a label is actually drawn at, given how big it turned out.
 *
 * No shipped layout reaches this: `one-line.json`'s two blast bins are [1, 7]
 * and [19, 7], and the leftmost 43 px caption starts at x = 26 inside an 896 px
 * world. It is
 * here for the layout a designer writes tomorrow with a prop in column 0 or
 * row 0 — the map is resized to exactly `width × TILE_PX`
 * (`Factory.applyConfig`), so there is no margin to overhang into and the
 * overhang is simply not drawn. A name slid a few pixels off centre is still
 * the name; a name cut in half is a different word.
 */
export function clampLabel(
    centre: { x: number; y: number },
    size: { width: number; height: number },
    world: { width: number; height: number },
): { x: number; y: number } {
    return {
        x: inside(centre.x, size.width, world.width),
        y: inside(centre.y, size.height, world.height),
    };
}

/** A name with no room to fit is centred, rather than cut at an end we picked. */
function inside(centre: number, extent: number, bound: number): number {
    const half = extent / 2;

    if (extent >= bound) return bound / 2;

    return Math.min(Math.max(centre, half), bound - half);
}

function centreOf(tile: Tile): { x: number; y: number } {
    return { x: (tile[0] + 0.5) * TILE_PX, y: (tile[1] + 0.5) * TILE_PX };
}

/** Enough of `state.stations` to colour a pole; a plain `Map` satisfies it. */
export interface StationLookup {
    get(id: string): StationState | undefined;
}

/**
 * The pole colour for one station (F04 §3). Red is a blink at 2 Hz rather than a
 * fill so a danger pole reads differently from a pickup call across the room.
 */
export function beaconColour(beacon: string, serverNow: number): number {
    if (beacon === 'gold') return UI.beaconGold;

    if (beacon !== 'red') return UI.beaconOff;

    return serverNow % BLINK_SECONDS < BLINK_SECONDS / 2 ? UI.beaconRed : UI.beaconOff;
}

export class FloorView {
    private world = { width: 0, height: 0 };
    private map: Phaser.GameObjects.Graphics | null = null;
    private tiles: Phaser.GameObjects.Graphics | null = null;
    private beacons: Phaser.GameObjects.Graphics | null = null;
    private labels: Phaser.GameObjects.Text[] = [];
    private poleTiles: { id: string; x: number; y: number }[] = [];
    private boardLine: Phaser.GameObjects.Text | null = null;
    private lastTileKey = '';
    private lastBeaconKey = '';
    private lastBoardLine = '';

    constructor(
        private readonly scene: Factory,
        private readonly layer: Phaser.GameObjects.Container,
    ) {}

    draw(layout: LayoutConfig): void {
        this.clear();

        this.world = { width: layout.width * TILE_PX, height: layout.height * TILE_PX };

        const map = this.scene.add.graphics();

        this.map = map;
        this.layer.add(map);

        this.ground(map, layout);
        this.walls(map, layout);
        this.rooms(map, layout);
        this.ramp(map, layout);
        this.props(map, layout);

        this.tiles = this.scene.add.graphics();
        this.layer.add(this.tiles);
        this.lastTileKey = '';

        this.beacons = this.scene.add.graphics();
        this.layer.add(this.beacons);
        this.poleTiles = Object.entries(layout.beaconPoles).map(([id, tile]) => ({
            id,
            ...centreOf(tile),
        }));
        this.lastBeaconKey = '';
        this.setBeacons(new Map(), 0);
    }

    /**
     * Spill and scorch, rebuilt only when the packed arrays actually change —
     * the caller can hand it every frame without repainting every frame.
     */
    setTiles(spill: readonly number[], scorch: readonly number[]): void {
        const key = `${spill.join()}|${scorch.join()}`;

        if (!this.tiles || key === this.lastTileKey) return;

        const layout = this.scene.layout;

        this.lastTileKey = key;
        this.tiles.clear();

        for (const packed of spill) {
            const [x, y] = unpackTile(packed, layout.width);

            this.tiles.fillStyle(UI.spill, SPILL_ALPHA);
            this.tiles.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
        }

        for (const packed of scorch) {
            const [x, y] = unpackTile(packed, layout.width);

            this.tiles.fillStyle(UI.scorch, SCORCH_ALPHA);
            this.tiles.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
        }
    }

    /**
     * The poles, repainted from `StationState.beacon` (F04 §3). The key carries
     * the colour rather than the beacon word, so the 2 Hz red blink still
     * repaints while a steady pole costs nothing.
     */
    setBeacons(stations: StationLookup, serverNow: number): void {
        const beacons = this.beacons;

        if (!beacons) return;

        const painted = this.poleTiles.map((pole) => ({
            ...pole,
            colour: beaconColour(stations.get(pole.id)?.beacon ?? 'off', serverNow),
        }));
        const key = painted.map((pole) => pole.colour).join();

        if (key === this.lastBeaconKey) return;

        this.lastBeaconKey = key;
        beacons.clear();

        for (const pole of painted) {
            beacons.fillStyle(pole.colour, 1);
            beacons.fillCircle(pole.x, pole.y, BEACON_RADIUS);
        }
    }

    destroy(): void {
        this.clear();
    }

    private clear(): void {
        for (const label of this.labels) label.destroy();

        this.labels = [];
        this.map?.destroy();
        this.tiles?.destroy();
        this.beacons?.destroy();
        this.map = null;
        this.tiles = null;
        this.beacons = null;
        this.boardLine = null;
        this.poleTiles = [];
        this.lastBoardLine = '';
    }

    private ground(map: Phaser.GameObjects.Graphics, layout: LayoutConfig): void {
        const width = layout.width * TILE_PX;
        const height = layout.height * TILE_PX;

        map.fillStyle(UI.floor, 1);
        map.fillRect(0, 0, width, height);
        map.lineStyle(1, UI.grid, GRID_ALPHA);

        for (let x = 0; x <= layout.width; x++) {
            map.lineBetween(x * TILE_PX, 0, x * TILE_PX, height);
        }

        for (let y = 0; y <= layout.height; y++) {
            map.lineBetween(0, y * TILE_PX, width, y * TILE_PX);
        }
    }

    /** The top edge is what makes a wall read as a wall from above. */
    private walls(map: Phaser.GameObjects.Graphics, layout: LayoutConfig): void {
        for (const packed of layout.walls) {
            const [x, y] = unpackTile(packed, layout.width);
            const px = x * TILE_PX;
            const py = y * TILE_PX;

            map.fillStyle(UI.wall, 1);
            map.fillRect(px, py, TILE_PX, TILE_PX);
            map.fillStyle(UI.wallEdge, 1);
            map.fillRect(px, py, TILE_PX, 2);
        }
    }

    private rooms(map: Phaser.GameObjects.Graphics, layout: LayoutConfig): void {
        const [bx, by, bw, bh] = layout.breakRoom;

        map.fillStyle(UI.breakRoom, 0.5);
        map.fillRect(bx * TILE_PX, by * TILE_PX, bw * TILE_PX, bh * TILE_PX);
        this.label('BREAK ROOM', (bx + bw / 2) * TILE_PX, (by + bh / 2) * TILE_PX, 10);

        for (const bin of layout.blastBins) {
            const centre = centreOf(bin);

            map.fillStyle(UI.blastBin, 0.8);
            map.fillRect(bin[0] * TILE_PX, bin[1] * TILE_PX, TILE_PX, TILE_PX);
            this.label('BLAST BIN', centre.x, centre.y, 8);
        }

        const [dx, dy, dw] = layout.dockDoor;

        map.fillStyle(UI.dockDoor, 1);
        map.fillRect(dx * TILE_PX, dy * TILE_PX, dw * TILE_PX, TILE_PX);
        this.label('DOCK', (dx + dw / 2) * TILE_PX, (dy + 0.5) * TILE_PX, 10);

        const board = centreOf(layout.orderBoard);

        map.fillStyle(UI.orderBoard, 1);
        map.fillRect(
            layout.orderBoard[0] * TILE_PX,
            layout.orderBoard[1] * TILE_PX,
            TILE_PX,
            TILE_PX,
        );
        this.label(ORDER_BOARD, board.x, board.y, 8);

        // The board's second line, the only live text on the floor. It says the
        // one thing the wall between Assembly and the Dock could never say: which
        // fuse the order being worked wants. Without it the requirement lived on
        // the Tab board and in the Jig's overlay and nowhere a hauler walking
        // past could read it — and the ramp is where the mismatch is punished,
        // usually in the hands of somebody who did none of the work.
        this.boardLine = this.label(NOTHING_ON_THE_BOARD, board.x, board.y + BOARD_LINE_GAP, 8);
    }

    /**
     * The board prop's live line. Repainted only when the sentence changes, so
     * the caller can hand it every frame.
     */
    setOrderBoard(orders: Iterable<OrderState>): void {
        const line = wallBoardLine(orders);

        if (!this.boardLine || line === this.lastBoardLine) return;

        this.lastBoardLine = line;
        this.boardLine.setText(line);
    }

    /** Each ramp tile carries a chevron pointing at the dock door. */
    private ramp(map: Phaser.GameObjects.Graphics, layout: LayoutConfig): void {
        const [dx, dy, dw] = layout.dockDoor;
        const doorX = (dx + dw / 2) * TILE_PX;
        const doorY = (dy + 0.5) * TILE_PX;

        for (const tile of layout.ramp) {
            const centre = centreOf(tile);

            map.fillStyle(UI.ramp, 1);
            map.fillRect(tile[0] * TILE_PX, tile[1] * TILE_PX, TILE_PX, TILE_PX);

            const angle = Math.atan2(doorY - centre.y, doorX - centre.x);
            const point = (radius: number, offset: number): [number, number] => [
                centre.x + Math.cos(angle + offset) * radius,
                centre.y + Math.sin(angle + offset) * radius,
            ];
            const [tipX, tipY] = point(11, 0);
            const [leftX, leftY] = point(9, 2.4);
            const [rightX, rightY] = point(9, -2.4);

            map.fillStyle(UI.text, 0.35);
            map.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
        }
    }

    private props(map: Phaser.GameObjects.Graphics, layout: LayoutConfig): void {
        const props: [Tile, number, string][] = [
            [layout.props.toolCart, UI.ramp, 'TOOLS'],
            // 'SIGN' named no object, in the order board's own brown a few tiles
            // from the order board — a new player read it as a second board with
            // nothing on it. The prop is `countdownSign`, so it says what it counts.
            [layout.props.countdownSign, UI.orderBoard, 'DAYS SINCE'],
            [layout.props.returnsPile, UI.dockDoor, 'RETURNS'],
            [layout.props.broomHook, UI.ramp, 'BROOM'],
        ];

        for (const [tile, colour, text] of props) {
            const centre = centreOf(tile);

            map.fillStyle(colour, 1);
            map.fillRect(centre.x - PROP_PX / 2, centre.y - PROP_PX / 2, PROP_PX, PROP_PX);
            this.label(text, centre.x, centre.y, 8);
        }
    }

    private label(text: string, x: number, y: number, size: number): Phaser.GameObjects.Text {
        const label = this.scene.add.text(x, y, text, {
            fontFamily: 'monospace',
            fontSize: `${size}px`,
            ...FLOOR_LABEL,
        });

        label.setOrigin(0.5, 0.5);

        // Measured, not guessed: the width is whatever the browser's monospace
        // face and the stroke actually came to.
        const at = clampLabel({ x, y }, { width: label.width, height: label.height }, this.world);

        label.setPosition(at.x, at.y);
        this.layer.add(label);
        this.labels.push(label);

        return label;
    }
}
