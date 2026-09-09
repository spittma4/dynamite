import {
    type Copy,
    type FactoryState,
    type LayoutConfig,
    type LevelConfig,
    type ItemType,
    type PlayerState,
    STATION_LABEL,
    type StationConfig,
    type StationState,
    type StationType,
    TILE_PX,
    type Tile,
    footprintOf,
    tileKey,
} from '@shared';
import Phaser from 'phaser';

import { lineColour } from './palette';
import { dropTargets, shelfLabel } from './dropTargets';
import { type GlyphItem, drawItemGlyph } from './stationGlyphs';
import type { Factory, FactoryConn } from '../scenes/Factory';

/**
 * The machines (F05 §Client). Every station is drawn from its `StationConfig`
 * and the layout — footprint, machine block, work and rack posts, shelves and
 * floor ring never move — with `StationState` painted over the top: who is on a
 * post, what is on the shelves, what the station is complaining about and how
 * far through a cycle it is. The client decides none of that; it reads.
 *
 * The beacon pole, the banner, the clipboard panel and the debug rows are F04's
 * (`render/Floor.ts` and the HUD), and floor, lane, held and in-flight items are
 * F06's — a shelved item is drawn here and nowhere else.
 */

const FOOTPRINT_ALPHA = 0.15;
const MACHINE_EDGE_PX = 2;
const TILE_INSET = 1;
const OCCUPIED_ALPHA = 0.35;
const RING_DASH = 5;
const RING_GAP = 4;
const GLYPH_PX = 8;
const GLYPH_GAP = 2;
const SHELF_INSET = 3;
const PROGRESS_RADIUS = 24;
const PROGRESS_WIDTH = 4;
const PROGRESS_TRACK_ALPHA = 0.25;
const LABEL_PX = 10;
const STATE_PX = 11;
const COUNTER_PX = 9;
const BUBBLE_PX = 10;
const BUBBLE_PAD = 4;
const STATE_GAP = 6;
const BUBBLE_GAP = 6;
const COUNTER_GAP = 4;

export const STATION_COLOURS = {
    machine: 0x50505c,
    machineEdge: 0x7a7a88,
    work: 0xffd400,
    rack: 0xff9a00,
    ring: 0x9a9a9a,
    shelf: 0x2a2a33,
    shelfEdge: 0x6a6a78,
    counter: 0xffffff,
    alert: 0xd9463d,
    damaged: 0x9a9a9a,
    progress: 0x4cb944,
    bubble: 0x101014,
} as const;

export interface StateLabel {
    text: string;
    colour: number;
}

/** What a state label reads for; `null` means the station has nothing to say. */
const STATE_LABELS: Record<string, StateLabel> = {
    starved: { text: 'STARVED', colour: STATION_COLOURS.alert },
    jammed: { text: 'JAMMED', colour: STATION_COLOURS.alert },
    damaged: { text: 'DAMAGED', colour: STATION_COLOURS.damaged },
};

export function stateLabel(state: string): StateLabel | null {
    return STATE_LABELS[state] ?? null;
}

/**
 * The station's own speech (F05 §Client): it wants parts before it wants
 * people, and it only asks for hands mid-shift — an empty factory in the lobby
 * is not a problem anybody can fix yet.
 */
export function stationBubble(
    station: Pick<StationState, 'state' | 'workers'>,
    phase: string,
    copy: Copy['stations'],
): string {
    if (station.state === 'starved') return copy.needParts;

    if (station.state === 'idle' && station.workers === 0 && phase === 'running') {
        return copy.needHands;
    }

    return '';
}

export interface ShelfCounter {
    text: string;
    colour: number;
}

/**
 * `n/cap` under a shelf tile, red at the cap — a full output shelf is what puts
 * the next keg in the operator's hands instead of on the shelf.
 */
export function shelfCounter(count: number, cap: number): ShelfCounter | null {
    if (cap <= 0) return null;

    return {
        text: `${count}/${cap}`,
        colour: count >= cap ? STATION_COLOURS.alert : STATION_COLOURS.counter,
    };
}

/** The slot grid on a shelf tile: two columns, centred on the tile. */
export function slotOffsets(cap: number, size: number, gap: number): { x: number; y: number }[] {
    const rows = Math.ceil(cap / 2);
    const pitch = size + gap;
    const slots: { x: number; y: number }[] = [];

    for (let i = 0; i < cap; i++) {
        slots.push({
            x: (i % 2 === 0 ? -1 : 1) * (pitch / 2),
            y: (Math.floor(i / 2) - (rows - 1) / 2) * pitch,
        });
    }

    return slots;
}

/** The progress arc, clamped: `StationState.progress` is 0–1 by contract. */
export function progressSweep(progress: number): number {
    return Math.min(1, Math.max(0, progress)) * Math.PI * 2;
}

/** Where the machine's label and progress ring sit, in pixels. */
export function machineCentre(machine: Tile[]): { x: number; y: number } | null {
    if (machine.length === 0) return null;

    let x = 0;
    let y = 0;

    for (const [tx, ty] of machine) {
        x += tx + 0.5;
        y += ty + 0.5;
    }

    return { x: (x / machine.length) * TILE_PX, y: (y / machine.length) * TILE_PX };
}

/** The work tiles of one station that a body is standing on right now. */
export function occupiedWorkTiles(
    players: ReadonlyArray<Pick<PlayerState, 'stationId' | 'workTile'>>,
    stationId: string,
): Set<string> {
    const tiles = new Set<string>();

    for (const player of players) {
        if (player.stationId === stationId && player.workTile !== '') tiles.add(player.workTile);
    }

    return tiles;
}

function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * The scene declares its config as F04's `FactoryConn`, which types only what
 * the scene itself reads; the connection behind it always carries `copy` too
 * (§10.9), and the station bubbles are its words.
 */
function stationCopy(scene: Factory): Copy['stations'] {
    return (scene.conn.config as FactoryConn['config'] & { copy: Copy }).copy.stations;
}

interface ShelfBox {
    kind: 'in' | 'out';
    tile: Tile;
    cap: number;
    accepts?: ItemType[];
    centre: { x: number; y: number };
    counter: Phaser.GameObjects.Text;
}

/** One station: the furniture painted once, the state painted when it changes. */
class StationSprite {
    private readonly container: Phaser.GameObjects.Container;
    private readonly statics: Phaser.GameObjects.Graphics;
    private readonly dynamic: Phaser.GameObjects.Graphics;
    private readonly nameLabel: Phaser.GameObjects.Text;
    private readonly stateText: Phaser.GameObjects.Text;
    private readonly bubbleText: Phaser.GameObjects.Text;
    private readonly shelves: ShelfBox[] = [];
    private readonly centre: { x: number; y: number };
    private readonly top: number;
    private painted = '';

    constructor(
        scene: Factory,
        layer: Phaser.GameObjects.Container,
        private readonly cfg: StationConfig,
        layout: LayoutConfig,
    ) {
        const { bbox, machine } = footprintOf(cfg, layout);

        this.centre = machineCentre(machine) ?? {
            x: (cfg.anchor[0] + 0.5) * TILE_PX,
            y: (cfg.anchor[1] + 0.5) * TILE_PX,
        };
        this.top = machine.length > 0 ? Math.min(...machine.map(([, y]) => y)) : bbox.y0;

        this.statics = scene.add.graphics();
        this.dynamic = scene.add.graphics();
        this.nameLabel = text(scene, STATION_LABEL[cfg.type as StationType] ?? cfg.id, LABEL_PX);
        this.nameLabel.setOrigin(0.5, 0.5);
        this.nameLabel.setPosition(this.centre.x, this.centre.y);
        this.stateText = text(scene, '', STATE_PX);
        this.stateText.setPosition(this.centre.x, this.top * TILE_PX - STATE_GAP);
        this.bubbleText = text(scene, '', BUBBLE_PX);
        this.stateText.setVisible(false);
        this.bubbleText.setVisible(false);

        this.container = scene.add.container(0, 0, [
            this.statics,
            this.dynamic,
            this.nameLabel,
            this.stateText,
            this.bubbleText,
        ]);
        layer.add(this.container);

        for (const shelf of shelvesOf(cfg)) {
            const counter = text(scene, '', COUNTER_PX);

            counter.setPosition(
                (shelf.tile[0] + 0.5) * TILE_PX,
                (shelf.tile[1] + 1) * TILE_PX + COUNTER_GAP,
            );
            counter.setOrigin(0.5, 0);
            this.container.add(counter);

            // Grey boxes teach nothing: say what the shelf is for. The label goes on
            // whichever side faces away from the machine, so it never lands on the
            // nameplate or on the other shelf's counter.
            const label = text(scene, shelfLabel(shelf.kind, shelf.accepts), COUNTER_PX, '#9aa0a6');
            const outward = shelf.tile[0] <= (bbox.x0 + bbox.x1) / 2 ? -1 : 1;

            label.setPosition(
                (shelf.tile[0] + (outward < 0 ? 0 : 1)) * TILE_PX + outward * COUNTER_GAP,
                (shelf.tile[1] + 0.5) * TILE_PX,
            );
            label.setOrigin(outward < 0 ? 1 : 0, 0.5);
            this.container.add(label);
            this.shelves.push({
                ...shelf,
                centre: {
                    x: (shelf.tile[0] + 0.5) * TILE_PX,
                    y: (shelf.tile[1] + 0.5) * TILE_PX,
                },
                counter,
            });
        }

        this.paintStatics(bbox, machine);
    }

    update(
        st: StationState | undefined,
        state: FactoryState,
        copy: Copy['stations'],
        occupied: Set<string>,
    ): void {
        if (!st) {
            this.blank();

            return;
        }

        const glyphs = this.shelves.map((shelf) => ({ shelf, ...shelfContents(st, shelf, state) }));
        const label = stateLabel(st.state);
        const bubble = stationBubble(st, state.phase, copy);
        const ring = st.state === 'working' ? Math.round(progressSweep(st.progress) * 64) : -1;
        const key = [
            ring,
            label?.text ?? '',
            bubble,
            [...occupied].sort().join(' '),
            glyphs
                .map(({ count, items }) =>
                    items
                        .map((i) => `${i.type}${i.quality}${i.prime ? 'p' : ''}`)
                        .join(',')
                        .concat(`=${count}`),
                )
                .join('|'),
        ].join('~');

        if (key === this.painted) return;

        this.painted = key;
        this.dynamic.clear();
        this.paintOccupied(occupied);

        for (const { shelf, items, count } of glyphs) this.paintShelf(shelf, items, count);

        if (ring >= 0) this.paintProgress(st.progress);

        this.stateText.setText(label?.text ?? '');
        this.stateText.setVisible(label !== null);

        if (label) this.stateText.setColor(hex(label.colour));

        this.paintBubble(bubble, label !== null);
    }

    destroy(): void {
        this.container.destroy();
    }

    private blank(): void {
        this.painted = '';
        this.dynamic.clear();
        this.stateText.setVisible(false);
        this.bubbleText.setVisible(false);

        for (const shelf of this.shelves) shelf.counter.setVisible(false);
    }

    private paintStatics(
        bbox: { x0: number; y0: number; x1: number; y1: number },
        machine: Tile[],
    ): void {
        const g = this.statics;

        g.fillStyle(lineColour(this.cfg.line), FOOTPRINT_ALPHA);
        g.fillRect(
            bbox.x0 * TILE_PX,
            bbox.y0 * TILE_PX,
            (bbox.x1 - bbox.x0 + 1) * TILE_PX,
            (bbox.y1 - bbox.y0 + 1) * TILE_PX,
        );

        for (const [x, y] of machine) {
            g.fillStyle(STATION_COLOURS.machine, 1);
            g.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
            g.fillStyle(STATION_COLOURS.machineEdge, 1);
            g.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, MACHINE_EDGE_PX);
        }

        this.outline(this.cfg.workTiles, STATION_COLOURS.work);
        this.outline(this.cfg.rackTiles, STATION_COLOURS.rack);

        for (const [x, y] of this.cfg.floorRing.tiles) this.dashedTile(x, y);

        for (const shelf of this.shelves) this.paintShelfBox(shelf);
    }

    private outline(tiles: Tile[], colour: number): void {
        this.statics.lineStyle(2, colour, 1);

        for (const [x, y] of tiles) {
            this.statics.strokeRect(
                x * TILE_PX + TILE_INSET,
                y * TILE_PX + TILE_INSET,
                TILE_PX - TILE_INSET * 2,
                TILE_PX - TILE_INSET * 2,
            );
        }
    }

    /** Phaser has no dashed stroke, so the ring is drawn a segment at a time. */
    private dashedTile(tx: number, ty: number): void {
        const g = this.statics;
        const x = tx * TILE_PX;
        const y = ty * TILE_PX;

        g.lineStyle(1, STATION_COLOURS.ring, 0.7);

        for (let at = 0; at < TILE_PX; at += RING_DASH + RING_GAP) {
            const run = Math.min(RING_DASH, TILE_PX - at);

            g.lineBetween(x + at, y, x + at + run, y);
            g.lineBetween(x + at, y + TILE_PX, x + at + run, y + TILE_PX);
            g.lineBetween(x, y + at, x, y + at + run);
            g.lineBetween(x + TILE_PX, y + at, x + TILE_PX, y + at + run);
        }
    }

    private paintShelfBox(shelf: ShelfBox): void {
        const g = this.statics;
        const x = shelf.tile[0] * TILE_PX + SHELF_INSET;
        const y = shelf.tile[1] * TILE_PX + SHELF_INSET;
        const size = TILE_PX - SHELF_INSET * 2;
        const rows = Math.ceil(shelf.cap / 2);

        g.fillStyle(STATION_COLOURS.shelf, 0.95);
        g.fillRect(x, y, size, size);
        g.lineStyle(1, STATION_COLOURS.shelfEdge, 1);
        g.strokeRect(x, y, size, size);

        for (let row = 1; row < rows; row++) {
            const at = y + (size / rows) * row;

            g.lineBetween(x, at, x + size, at);
        }
    }

    private paintOccupied(occupied: Set<string>): void {
        this.dynamic.fillStyle(STATION_COLOURS.work, OCCUPIED_ALPHA);

        for (const [x, y] of this.cfg.workTiles) {
            if (!occupied.has(tileKey(x, y))) continue;

            this.dynamic.fillRect(
                x * TILE_PX + TILE_INSET,
                y * TILE_PX + TILE_INSET,
                TILE_PX - TILE_INSET * 2,
                TILE_PX - TILE_INSET * 2,
            );
        }
    }

    private paintShelf(shelf: ShelfBox, items: GlyphItem[], count: number): void {
        const slots = slotOffsets(shelf.cap, GLYPH_PX, GLYPH_GAP);

        items.forEach((item, index) => {
            const slot = slots[index];

            if (!slot) return;

            drawItemGlyph(
                this.dynamic,
                item,
                shelf.centre.x + slot.x,
                shelf.centre.y + slot.y,
                GLYPH_PX,
            );
        });

        const counter = shelfCounter(count, shelf.cap);

        shelf.counter.setVisible(counter !== null);

        if (!counter) return;

        shelf.counter.setText(counter.text);
        shelf.counter.setColor(hex(counter.colour));
    }

    private paintProgress(progress: number): void {
        const g = this.dynamic;
        const start = -Math.PI / 2;

        g.lineStyle(PROGRESS_WIDTH, STATION_COLOURS.progress, PROGRESS_TRACK_ALPHA);
        g.strokeCircle(this.centre.x, this.centre.y, PROGRESS_RADIUS);
        g.lineStyle(PROGRESS_WIDTH, STATION_COLOURS.progress, 1);
        g.beginPath();
        g.arc(
            this.centre.x,
            this.centre.y,
            PROGRESS_RADIUS,
            start,
            start + progressSweep(progress),
            false,
        );
        g.strokePath();
    }

    private paintBubble(bubble: string, hasLabel: boolean): void {
        this.bubbleText.setVisible(bubble !== '');

        if (bubble === '') return;

        const y = this.top * TILE_PX - STATE_GAP - (hasLabel ? STATE_PX + BUBBLE_GAP : 0);

        this.bubbleText.setText(bubble);
        this.bubbleText.setPosition(this.centre.x, y);

        const width = this.bubbleText.width + BUBBLE_PAD * 2;
        const height = this.bubbleText.height + BUBBLE_PAD;

        this.dynamic.fillStyle(STATION_COLOURS.bubble, 0.85);
        this.dynamic.fillRoundedRect(
            this.centre.x - width / 2,
            y - height,
            width,
            height,
            BUBBLE_PAD,
        );
    }
}

function text(
    scene: Factory,
    value: string,
    size: number,
    colour = '#ffffff',
): Phaser.GameObjects.Text {
    const label = scene.add.text(0, 0, value, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color: colour,
    });

    label.setOrigin(0.5, 1);
    label.setStroke('#000000', 3);

    return label;
}

function shelvesOf(
    cfg: StationConfig,
): { kind: 'in' | 'out'; tile: Tile; cap: number; accepts?: ItemType[] }[] {
    const shelves: { kind: 'in' | 'out'; tile: Tile; cap: number; accepts?: ItemType[] }[] = [];

    if (cfg.inputShelf) {
        shelves.push({
            kind: 'in',
            tile: cfg.inputShelf.tile,
            cap: cfg.inputShelf.capacity,
            accepts: cfg.inputShelf.accepts as ItemType[] | undefined,
        });
    }

    if (cfg.outputShelf) {
        shelves.push({ kind: 'out', tile: cfg.outputShelf.tile, cap: cfg.outputShelf.capacity });
    }

    return shelves;
}

/**
 * What is on one shelf. The count is the server's array length rather than the
 * glyphs drawn, so `n/cap` still reads true for the frame between a shelved id
 * arriving and the item row behind it.
 */
function shelfContents(
    st: StationState,
    shelf: ShelfBox,
    state: FactoryState,
): { count: number; items: GlyphItem[] } {
    const ids = shelf.kind === 'in' ? st.inputShelf : st.outputShelf;
    const items: GlyphItem[] = [];

    ids.forEach((id) => {
        const item = state.items.get(id);

        if (item) items.push({ type: item.type, quality: item.quality, prime: item.prime });
    });

    return { count: ids.length, items };
}

class StationsLayer {
    private readonly root: Phaser.GameObjects.Container;
    private readonly sprites = new Map<string, StationSprite>();
    private readonly hints: Phaser.GameObjects.Graphics;
    private hintTiles: Tile[] = [];
    private hintedFor = '';
    private hintsDrawn = false;
    private builtFrom: LevelConfig | null = null;
    private destroyed = false;

    constructor(private readonly scene: Factory) {
        this.root = scene.add.container(0, 0);
        scene.layers.stations.add(this.root);
        this.hints = scene.add.graphics();
        scene.layers.stations.add(this.hints);
    }

    update(): void {
        if (this.destroyed) return;

        const level = this.scene.levelConfig;

        if (level !== this.builtFrom) this.rebuild(level);

        const state = this.scene.conn.state;
        const copy = stationCopy(this.scene);
        const crew: Pick<PlayerState, 'stationId' | 'workTile'>[] = [];

        state.players.forEach((player) => crew.push(player));

        for (const [id, sprite] of this.sprites) {
            sprite.update(state.stations.get(id), state, copy, occupiedWorkTiles(crew, id));
        }

        this.paintDropHints(state, level);
    }

    /**
     * While the player carries something, outline every tile it may be put
     * down on. "Where does this keg go?" is the question the floor could never
     * answer before: the shelves are identical boxes until one of them lights up.
     */
    private paintDropHints(state: FactoryState, level: LevelConfig): void {
        const me = state.players.get(this.scene.conn.sessionId);
        const carried = me?.carrying ? state.items.get(me.carrying) : undefined;
        const key = carried?.type ?? '';

        if (key === this.hintedFor) {
            this.pulseHints();

            return;
        }

        this.hintedFor = key;
        this.hints.clear();
        this.hintTiles = [];

        if (!carried) return;

        for (const target of dropTargets(carried.type as ItemType, level)) {
            this.hintTiles.push(...target.tiles);
        }

        this.pulseHints();
    }

    private pulseHints(): void {
        // Nothing in hand: leave the canvas untouched rather than clearing an
        // already-empty layer every frame, so an idle floor costs nothing.
        if (this.hintTiles.length === 0) {
            if (this.hintsDrawn) {
                this.hints.clear();
                this.hintsDrawn = false;
            }

            return;
        }

        this.hints.clear();
        this.hintsDrawn = true;

        // A slow breath rather than a blink: readable from across the floor,
        // and it never competes with the DANGER beacon for attention.
        const t = this.scene.time.now / 1000;
        const alpha = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3));

        this.hints.lineStyle(2, STATION_COLOURS.work, alpha);

        for (const [x, y] of this.hintTiles) {
            this.hints.strokeRect(x * TILE_PX + 2, y * TILE_PX + 2, TILE_PX - 4, TILE_PX - 4);
        }
    }

    destroy(): void {
        if (this.destroyed) return;

        this.destroyed = true;
        this.clear();
        this.hints.destroy();
        this.root.destroy();
    }

    /**
     * The lobby draws the unscaled level's stations and the `config` reply after
     * the whistle replaces it with the scaled one (contracts §8), which is a new
     * object — so the furniture is rebuilt from whichever level the scene holds.
     */
    private rebuild(level: LevelConfig): void {
        this.clear();
        this.builtFrom = level;

        for (const cfg of level.stations) {
            this.sprites.set(
                cfg.id,
                new StationSprite(this.scene, this.root, cfg, this.scene.layout),
            );
        }
    }

    private clear(): void {
        for (const sprite of this.sprites.values()) sprite.destroy();

        this.sprites.clear();
    }
}

/**
 * The F05 line in `Factory.create()`'s mount list. The layer redraws on the
 * scene's POST_UPDATE and only when something it draws actually changed, so a
 * station that is doing nothing costs one string compare a frame.
 */
export function createStationsLayer(scene: Factory): { destroy(): void } {
    const layer = new StationsLayer(scene);
    const onPostUpdate = (): void => layer.update();
    const api = {
        destroy: (): void => {
            scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
            layer.destroy();
        },
    };

    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, api.destroy);

    return api;
}
