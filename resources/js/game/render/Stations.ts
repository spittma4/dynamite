import {
    type Copy,
    type DockMg,
    type FactoryState,
    type JigMg,
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
    parseDockMg,
    tileKey,
} from '@shared';
import Phaser from 'phaser';

import { lineColour } from './palette';
import { blockedTargets, dropTargets, producedBy, shelfLabel } from './dropTargets';
import { type Shortage, apron, outwardSide, shortageOf } from './intake';
import { type GlyphItem, drawItemGlyph } from './stationGlyphs';
import { parseJigMg } from '../minigames/Jig';
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
const APRON_PITCH = 7;
const APRON_INSET = 2;
const CHEVRON_PX = 10;
/** The sign and the arrow share the aisle tile: words above, arrow below. */
const SIGN_ROW = 0.32;
const CHEVRON_ROW = 0.7;
const LABEL_PX = 10;
const SIGN_PX = 10;
const STATE_PX = 11;
const COUNTER_PX = 9;
const BUBBLE_PX = 10;
const BUBBLE_PAD = 4;
const STATE_GAP = 6;
const BUBBLE_GAP = 6;
const COUNTER_GAP = 4;

/** The stripes on the floor: dim wayfinding, full when the zone is the answer. */
export const APRON_WIDTH = 2;
export const APRON_ALPHA = 0.3;
export const APRON_LIT_ALPHA = 1;

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
    apron: 0x35c8ff,
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
 *
 * `shortage` is `shortageOf`'s naming of what is actually missing. The Jig
 * starves for three different reasons and one copy line for all of them sent a
 * playtester hunting for casings; when the shortage has a name, the bubble says
 * the name.
 *
 * A stopped machine and one nobody has walked to are the same errand at two
 * volumes. `stationStatus` gates Assembly's seat starve on `state.a !== ''`
 * (`shared/src/sim/jig.ts`), so the shortage the floor most needs to advertise —
 * the one on the machine standing idle with nobody at it — is never a starve at
 * all. It says so anyway, but only through the bubble: the red state label and
 * the lit intake zone stay with the machine that has actually stopped.
 *
 * `hasWork` is the last gate. At the whistle three machines shouted the same
 * plea in the same frame and one of them was lying — the dock holds no sticks
 * at t=0 and walking there is the worst opening move in the game — so a station
 * with nothing for a pair of hands to do keeps quiet and lets the one that can
 * start the line be the only voice on the floor.
 */
export function stationBubble(
    station: Pick<StationState, 'state' | 'workers'>,
    phase: string,
    copy: Copy['stations'],
    shortage: Shortage | null = null,
    hasWork = true,
): string {
    if (station.state === 'starved') return shortage?.sentence ?? copy.needParts;

    if (station.state !== 'idle' || phase !== 'running') return '';

    // Something a person can act on beats a plea for hands: hands are no use
    // without the keg, and no use at all against a shelf that is refusing them.
    if (shortage?.act === true) return shortage.sentence;

    return station.workers === 0 && hasWork ? copy.needHands : '';
}

/**
 * Whether there is a job here for the hands this station is about to ask for.
 * Boom Powder takes no input and can always start the line; Assembly's own
 * shortage speaks for it before the plea is ever reached. The dock is the one
 * that lied: at the whistle no stick exists anywhere, so nobody standing on a
 * ramp lane can do a thing, and its `mg` lanes are the only evidence the client
 * has of one being staged.
 */
function hasWorkFor(cfg: Pick<StationConfig, 'type'>, mg: JigMg | DockMg | null): boolean {
    if (cfg.type !== 'dock') return true;

    const dock = mg as DockMg | null;

    return dock !== null && dock.lanes.some((lane) => lane.itemId !== '');
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

export interface Segment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * The hazard stripes inside one apron tile, in pixels. Each line is the part of
 * `x + y = c` that falls inside the tile, so the diagonals stop at the tile's
 * own edges instead of bleeding across the floor; the inset keeps them clear of
 * the edge so the zone reads as paint on the floor, not another box on top.
 */
export function stripeSegments(tile: Tile, pitch: number, inset: number): Segment[] {
    const left = tile[0] * TILE_PX + inset;
    const top = tile[1] * TILE_PX + inset;
    const size = TILE_PX - inset * 2;
    const lines: Segment[] = [];

    for (let c = pitch; c < size * 2; c += pitch) {
        lines.push({
            x1: left + Math.max(0, c - size),
            y1: top + Math.min(c, size),
            x2: left + Math.min(c, size),
            y2: top + Math.max(0, c - size),
        });
    }

    return lines;
}

/**
 * The arrowhead on the apron: three points, tip in the middle, pointing at the
 * shelf tile beside it. The stripes say "zone"; the chevron says which of the
 * two tiles is the one you put the thing on.
 */
export function chevron(tile: Tile, toward: -1 | 1, size: number): { x: number; y: number }[] {
    const tip = (tile[0] + (toward < 0 ? 0 : 1)) * TILE_PX - toward * APRON_INSET;
    const back = tip - toward * size;
    const y = (tile[1] + CHEVRON_ROW) * TILE_PX;

    return [
        { x: back, y: y - size / 2 },
        { x: tip, y },
        { x: back, y: y + size / 2 },
    ];
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
    private readonly apronTiles: Tile[];
    private readonly intake: { aisle: Tile; toward: -1 | 1 } | null;
    private readonly centre: { x: number; y: number };
    private readonly top: number;
    private painted = '';
    /**
     * The `mg` blob is the whole overlay payload — tiles, lanes, knots, the keg
     * — and it was re-parsed every frame, before the repaint guard, on a station
     * doing nothing. The raw string is what actually changes, so that is what
     * the parse is keyed on: one string compare a frame, as advertised.
     */
    private lastMg = '';
    private parsedMg: JigMg | DockMg | null = null;

    constructor(
        scene: Factory,
        layer: Phaser.GameObjects.Container,
        private readonly cfg: StationConfig,
        layout: LayoutConfig,
        recipes: LevelConfig['recipes'],
    ) {
        const { bbox, machine } = footprintOf(cfg, layout);
        const shelfTile = cfg.inputShelf?.tile;

        this.apronTiles = apron(cfg) ?? [];

        // `apron()` returns the shelf tile first and the aisle tile a hauler
        // stands on second, so the chevron points back the way the apron grew.
        const aisle = this.apronTiles[1];

        this.intake =
            shelfTile && aisle
                ? { aisle, toward: (outwardSide(cfg, shelfTile) * -1) as -1 | 1 }
                : null;

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

            // Grey boxes teach nothing: say what the shelf is for. The IN sign is
            // the primary mark on the floor, so it goes big and in the intake's own
            // colour on the aisle tile a hauler walks onto — never over the glyphs
            // it used to be drawn on top of. Everything else stays a caption at the
            // shelf's outward edge, clear of the nameplate and the other counter.
            // Both captions carry the same weight: the panel's route quotes them
            // both — 'E at KEGS OUT' as well as 'face KEGS IN' — and the out tray
            // was 9 px grey, so the sentence pointed at paint the player had to
            // hunt for across the room. Only the intake wears the apron's colour.
            const words = shelfLabel(shelf.kind, shelf.accepts, producedBy(cfg, recipes));
            const sign = shelf.kind === 'in' ? this.intake : null;
            const label = sign
                ? text(scene, words, SIGN_PX, hex(STATION_COLOURS.apron), true)
                : text(scene, words, SIGN_PX, hex(STATION_COLOURS.counter), true);

            if (sign) {
                label.setPosition(
                    (sign.aisle[0] + 0.5) * TILE_PX,
                    (sign.aisle[1] + SIGN_ROW) * TILE_PX,
                );
                label.setOrigin(0.5, 0.5);
            } else {
                const outward = outwardSide(cfg, shelf.tile);

                label.setPosition(
                    (shelf.tile[0] + (outward < 0 ? 0 : 1)) * TILE_PX + outward * COUNTER_GAP,
                    (shelf.tile[1] + 0.5) * TILE_PX,
                );
                label.setOrigin(outward < 0 ? 1 : 0, 0.5);
            }

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
        wanted: boolean,
        handsFull: boolean,
    ): void {
        if (!st) {
            this.blank();

            return;
        }

        const mg = this.readMg(st.mg);
        const glyphs = this.shelves.map((shelf) => ({ shelf, ...shelfContents(st, shelf, state) }));
        const inShelf = glyphs.find(({ shelf }) => shelf.kind === 'in');
        const shortage = this.shortage(inShelf, mg, handsFull);
        const label = stateLabel(st.state);
        const bubble = stationBubble(st, state.phase, copy, shortage, hasWorkFor(this.cfg, mg));

        // Full alpha for the thing in your hands, and for a machine stood waiting
        // on something somebody could go and fetch — but not for a Jig waiting on
        // a fuse, which comes off the rack and never crosses this shelf.
        const lit = wanted || (st.state === 'starved' && (shortage?.haul ?? false));
        const ring = st.state === 'working' ? Math.round(progressSweep(st.progress) * 64) : -1;
        const key = [
            ring,
            label?.text ?? '',
            bubble,
            lit ? 'lit' : '',
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

        if (lit) this.paintApron(this.dynamic, APRON_LIT_ALPHA);

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

    /** The station's own mini-game blob, parsed only when the string changed. */
    private readMg(mg: string): JigMg | DockMg | null {
        if (mg === this.lastMg) return this.parsedMg;

        this.lastMg = mg;
        this.parsedMg =
            this.cfg.type === 'dock'
                ? parseDockMg(mg)
                : this.cfg.type === 'assembly'
                  ? parseJigMg(mg)
                  : null;

        return this.parsedMg;
    }

    /**
     * What this machine is short of. A shelf whose ids have outrun the item rows
     * behind them is a shelf the client cannot describe yet — `shelfContents`
     * guards its counter against exactly that frame — so the sign says nothing
     * rather than blinking a shortage as a keg lands on it.
     */
    private shortage(
        inShelf: { count: number; items: GlyphItem[] } | undefined,
        mg: JigMg | DockMg | null,
        handsFull: boolean,
    ): Shortage | null {
        if (inShelf && inShelf.count !== inShelf.items.length) return null;

        return shortageOf(
            this.cfg,
            (inShelf?.items ?? []).map((item) => item.type as ItemType),
            this.cfg.type === 'assembly' ? (mg as JigMg | null) : null,
            handsFull,
        );
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

        // Last, so the stripes cross the shelf box as well as the aisle: on the
        // shipped level the shelf tile is part of the machine block, and a zone
        // that stops at its edge is a one-tile zone again.
        this.paintApron(g, APRON_ALPHA);
    }

    /**
     * The intake zone: hazard stripes across the shelf tile and the aisle tile
     * in front of it, with a chevron on the aisle pointing at the shelf. It is
     * furniture, so the dim pass is painted once into the statics; the dynamic
     * layer redraws the same shape at full alpha when the zone is the answer to
     * the question the player is holding.
     */
    private paintApron(g: Phaser.GameObjects.Graphics, alpha: number): void {
        if (this.apronTiles.length === 0) return;

        g.lineStyle(APRON_WIDTH, STATION_COLOURS.apron, alpha);

        for (const tile of this.apronTiles) {
            for (const { x1, y1, x2, y2 } of stripeSegments(tile, APRON_PITCH, APRON_INSET)) {
                g.lineBetween(x1, y1, x2, y2);
            }
        }

        if (!this.intake) return;

        const [tail, tip, head] = chevron(this.intake.aisle, this.intake.toward, CHEVRON_PX);

        if (!tail || !tip || !head) return;

        g.lineBetween(tail.x, tail.y, tip.x, tip.y);
        g.lineBetween(tip.x, tip.y, head.x, head.y);
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
    bold = false,
): Phaser.GameObjects.Text {
    const label = scene.add.text(0, 0, value, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color: colour,
        fontStyle: bold ? 'bold' : 'normal',
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
    private readonly hintStations = new Set<string>();
    private hintTiles: Tile[] = [];
    private blockedTiles: Tile[] = [];
    private handsFull = false;
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

        // The hints run first: they work out which stations take what is in the
        // player's hands, and the stations light their aprons from that answer
        // rather than each asking the same question again.
        this.paintDropHints(state, level);

        for (const [id, sprite] of this.sprites) {
            sprite.update(
                state.stations.get(id),
                state,
                copy,
                occupiedWorkTiles(crew, id),
                this.hintStations.has(id),
                this.handsFull,
            );
        }
    }

    /**
     * While the player carries something, outline every tile it may be put
     * down on. "Where does this keg go?" is the question the floor could never
     * answer before: the shelves are identical boxes until one of them lights up.
     */
    private paintDropHints(state: FactoryState, level: LevelConfig): void {
        const me = state.players.get(this.scene.conn.sessionId);
        const carried = me?.carrying ? state.items.get(me.carrying) : undefined;
        const onShelf = new Map<string, number>();

        // A shelf that fills up stops being a target, so the occupancy is part of
        // the answer and part of the key that decides whether to work it out again.
        if (carried) {
            for (const station of level.stations) {
                onShelf.set(station.id, state.stations.get(station.id)?.inputShelf.length ?? 0);
            }
        }

        const key = carried ? `${carried.type}~${[...onShelf.values()].join(',')}` : '';

        this.handsFull = carried !== undefined;

        if (key === this.hintedFor) {
            this.pulseHints();

            return;
        }

        this.hintedFor = key;
        this.hints.clear();
        this.hintTiles = [];
        this.blockedTiles = [];
        this.hintStations.clear();

        if (!carried) return;

        for (const target of dropTargets(carried.type as ItemType, level, onShelf)) {
            this.hintTiles.push(...target.tiles);
            this.hintStations.add(target.stationId);
        }

        // Where it belongs and is being refused. Without this the floor went
        // completely dark at a shelf on its cap — no tile, no apron — and `E`
        // answered with a wordless `bonk`. The destination is drawn refusing
        // rather than not drawn at all, and never as an invitation: it is the
        // alert colour, it does not breathe, and the apron stays dim.
        for (const target of blockedTargets(carried.type as ItemType, level, onShelf)) {
            this.blockedTiles.push(...target.tiles);
        }

        this.pulseHints();
    }

    private pulseHints(): void {
        // Nothing in hand: leave the canvas untouched rather than clearing an
        // already-empty layer every frame, so an idle floor costs nothing.
        if (this.hintTiles.length === 0 && this.blockedTiles.length === 0) {
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
        this.strokeTiles(this.hintTiles);

        if (this.blockedTiles.length === 0) return;

        this.hints.lineStyle(2, STATION_COLOURS.alert, 1);
        this.strokeTiles(this.blockedTiles);
    }

    private strokeTiles(tiles: Tile[]): void {
        for (const [x, y] of tiles) {
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
                new StationSprite(this.scene, this.root, cfg, this.scene.layout, level.recipes),
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
