import {
    LEVEL_DEFAULTS,
    type DockLane,
    type DockMg,
    type DockMinigame,
    type PlayerState,
    type StationState,
    beepPhase,
    parseDockMg,
    tileKey,
} from '@shared';
import type Phaser from 'phaser';

import { BayWall, type ReturnsItem } from './dock/BayWall';
import { TruckSprite } from './dock/TruckSprite';
import type { MinigameOverlay, OverlayContext, OverlayFactory, OverlayKey, StationView } from './types';
import { mmss } from '../ui/format';
import type { Factory } from '../scenes/Factory';

/**
 * The Dock overlay (F09 §Client). The dock joins by standing, so this panel is
 * up whenever the player is on a ramp lane — there is no clipboard to wait out
 * and the arrows keep walking (`capturesMovement: false`), which is how a
 * player changes lanes without leaving the station.
 *
 * Every number drawn here comes from `parseDockMg(station.mg)` and the server
 * clock. The client judges no shove: `Space` sends `shove` and the server
 * decides, on its own clock, whether that was a THUD, a scrape or a stall.
 */

export const DOCK_LEGEND = 'E set · SPACE shove on the beep · hold E slam (full truck) · ESC leave';

const PAD = 16;
const HEAD_Y = 12;
const ROW_Y = 46;
const ROW_H = 34;
const CHIP_Y = 96;
const CHIP_H = 30;
const CHIP_GAP = 8;
const LEGEND_Y = 150;
const MARKER_W = 3;

export const DOCK_COLOURS = {
    track: 0x1b1f26,
    trackIdle: 0x15171c,
    ok: 0x8a6d1e,
    perfect: 0x2f7a33,
    target: 0xffffff,
    marker: 0xffffff,
    markerIdle: 0x6a6a78,
    chipEmpty: 0x24262e,
    chipReady: 0x2b6fd6,
    chipStalled: 0xd9463d,
    chipEdge: 0xffd400,
} as const;

const TEXT = {
    head: '#ffffff',
    legend: '#bbbbbb',
    slam: '#f5c542',
    chip: '#ffffff',
} as const;

export type LaneStatus = 'EMPTY' | 'READY' | 'STALLED';

export function laneStatus(lane: DockLane | undefined): LaneStatus {
    if (!lane || lane.itemId === '') return 'EMPTY';

    return lane.stalled ? 'STALLED' : 'READY';
}

/** Which lane the player is standing on, from the work tile F05 wrote. */
export function localLane(mg: DockMg, workTile: string): number {
    if (workTile === '') return -1;

    return mg.lanes.findIndex((lane) => tileKey(lane.tile[0], lane.tile[1]) === workTile);
}

/**
 * Whether `Space` is the dock's key right now. A stalled stick counts: only a
 * shove moves it, so the key stays live until the lane clears.
 */
export function canShove(mg: DockMg, lane: number): boolean {
    if (lane < 0 || mg.truck.phase !== 'docked') return false;

    return laneStatus(mg.lanes[lane]) !== 'EMPTY';
}

export function tailgateOpen(mg: DockMg, serverNow: number): boolean {
    return mg.tailgateUntil > serverNow;
}

/**
 * Where the marker sits on the beep row, 0–1 across the track. The beep is the
 * middle of the row rather than an edge, so the OK band and the Perfect core
 * read as one window either side of it and the sweep's wrap lands at the moment
 * furthest from a judgement.
 */
export function sweepFraction(phase: number): number {
    return (((phase + 0.5) % 1) + 1) % 1;
}

/** The windows drawn to scale: how much of the row half a window covers. */
export function bandHalfFraction(windowMs: number, periodMs: number): number {
    if (periodMs <= 0) return 0;

    return Math.min(0.5, Math.max(0, windowMs / periodMs));
}

export function truckHeadline(mg: DockMg, serverNow: number): string {
    const { phase, loaded, slots, leavesAt, arrivesAt } = mg.truck;

    if (phase === 'leaving') return 'TRUCK LEAVING';
    if (phase === 'away') return `NEXT TRUCK ${mmss(arrivesAt - serverNow)}`;

    return `TRUCK ${loaded}/${slots} · ${mmss(leavesAt - serverNow)}`;
}

class DockOverlay implements MinigameOverlay {
    /** The arrows walk: changing lanes is walking to the next one. */
    readonly capturesMovement = false;

    private ctx: OverlayContext | null = null;
    private row: Phaser.GameObjects.Graphics | null = null;
    private chips: Phaser.GameObjects.Graphics | null = null;
    private head: Phaser.GameObjects.Text | null = null;
    private legend: Phaser.GameObjects.Text | null = null;
    private chipText: Phaser.GameObjects.Text[] = [];

    private mg: DockMg | null = null;
    private lastMg = '';
    private lane = -1;
    private painted = '';
    private holding = false;

    mount(ctx: OverlayContext): void {
        this.ctx = ctx;
        this.lastMg = '';
        this.mg = null;
        this.painted = '';
        this.holding = false;

        const scene = ctx.scene;

        this.row = scene.add.graphics();
        this.chips = scene.add.graphics();
        this.head = text(scene, HEAD_Y, 16, TEXT.head, true);
        this.legend = text(scene, LEGEND_Y, 12, TEXT.legend, false);
        this.legend.setText(DOCK_LEGEND);

        ctx.container.add([this.chips, this.row, this.head, this.legend]);
    }

    update(station: StationState, me: PlayerState, serverNow: number): void {
        const ctx = this.ctx;

        if (!ctx || !this.row || !this.head || !this.legend) return;

        if (station.mg !== this.lastMg) {
            this.lastMg = station.mg;
            this.mg = parseDockMg(station.mg);
        }

        const mg = this.mg;

        if (!mg) {
            this.head.setText('DOCK');
            this.row.clear();

            return;
        }

        this.lane = localLane(mg, me.workTile);
        this.head.setText(truckHeadline(mg, serverNow));
        this.drawRow(ctx, mg, serverNow);
        this.drawChips(ctx, mg);

        const slam = tailgateOpen(mg, serverNow);

        this.legend.setText(slam ? 'HOLD E — SLAM THE TAILGATE' : DOCK_LEGEND);
        this.legend.setColor(slam ? TEXT.slam : TEXT.legend);
    }

    onKey(key: OverlayKey, down: boolean, _repeat: boolean): boolean {
        const ctx = this.ctx;
        const mg = this.mg;

        if (!ctx || !mg) return false;

        if (key === 'space') {
            if (!down || !canShove(mg, this.lane)) return false;

            ctx.send('shove');

            return true;
        }

        // Every other `E` has to fall through: the plain `interact` message is
        // what puts a stick on the lane in the first place (contracts §10.9).
        if (key !== 'interact') return false;

        if (down) {
            if (this.lane < 0 || !tailgateOpen(mg, ctx.serverClock())) return false;

            this.holding = true;
            ctx.send('tailgate', 'down');

            return true;
        }

        if (!this.holding) return false;

        this.holding = false;
        ctx.send('tailgate', 'up');

        return true;
    }

    unmount(): void {
        this.ctx?.container.removeAll(true);
        this.row = null;
        this.chips = null;
        this.head = null;
        this.legend = null;
        this.chipText = [];
        this.ctx = null;
        this.holding = false;
    }

    /**
     * The reversing alarm as a row: the target line is the beep, the bands are
     * the server's own windows drawn to scale, and the marker crosses the
     * target at the instant a shove would be Perfect.
     */
    private drawRow(ctx: OverlayContext, mg: DockMg, serverNow: number): void {
        const g = this.row;

        if (!g) return;

        const width = ctx.width - PAD * 2;
        const docked = mg.truck.phase === 'docked';
        const centre = PAD + width / 2;

        g.clear();
        g.fillStyle(docked ? DOCK_COLOURS.track : DOCK_COLOURS.trackIdle, 1);
        g.fillRect(PAD, ROW_Y, width, ROW_H);

        if (!docked) return;

        const ok = bandHalfFraction(mg.windows.okMs, mg.beepPeriodMs) * width;
        const perfect = bandHalfFraction(mg.windows.perfectMs, mg.beepPeriodMs) * width;

        g.fillStyle(DOCK_COLOURS.ok, 1);
        g.fillRect(centre - ok, ROW_Y, ok * 2, ROW_H);
        g.fillStyle(DOCK_COLOURS.perfect, 1);
        g.fillRect(centre - perfect, ROW_Y, perfect * 2, ROW_H);
        g.fillStyle(DOCK_COLOURS.target, 1);
        g.fillRect(centre - 1, ROW_Y - 4, 2, ROW_H + 8);

        const at = PAD + sweepFraction(beepPhase(mg.beepAt, mg.beepPeriodMs, serverNow)) * width;

        g.fillStyle(DOCK_COLOURS.marker, 1);
        g.fillRect(at - MARKER_W / 2, ROW_Y - 2, MARKER_W, ROW_H + 4);
    }

    /** One chip per lane, in the config's lane order; the local lane is ringed. */
    private drawChips(ctx: OverlayContext, mg: DockMg): void {
        const g = this.chips;

        if (!g) return;

        if (this.chipText.length !== mg.lanes.length) this.buildChips(ctx, mg.lanes.length);

        const key = `${this.lane}~${mg.lanes.map((lane) => laneStatus(lane)).join(',')}`;

        if (key === this.painted) return;

        this.painted = key;

        const width = ctx.width - PAD * 2;
        const chipW = (width - CHIP_GAP * (mg.lanes.length - 1)) / mg.lanes.length;

        g.clear();

        mg.lanes.forEach((lane, index) => {
            const status = laneStatus(lane);
            const x = PAD + index * (chipW + CHIP_GAP);

            g.fillStyle(chipFill(status), 1);
            g.fillRect(x, CHIP_Y, chipW, CHIP_H);

            if (index === this.lane) {
                g.lineStyle(2, DOCK_COLOURS.chipEdge, 1);
                g.strokeRect(x + 1, CHIP_Y + 1, chipW - 2, CHIP_H - 2);
            }

            const label = this.chipText[index];

            label?.setPosition(x + chipW / 2, CHIP_Y + CHIP_H / 2);
            label?.setText(`L${index + 1} ${status}`);
        });
    }

    private buildChips(ctx: OverlayContext, lanes: number): void {
        for (const label of this.chipText) label.destroy();

        this.chipText = [];

        for (let i = 0; i < lanes; i++) {
            const label = text(ctx.scene, CHIP_Y, 12, TEXT.chip, true);

            label.setOrigin(0.5, 0.5);
            ctx.container.add(label);
            this.chipText.push(label);
        }
    }
}

function chipFill(status: LaneStatus): number {
    if (status === 'READY') return DOCK_COLOURS.chipReady;

    return status === 'STALLED' ? DOCK_COLOURS.chipStalled : DOCK_COLOURS.chipEmpty;
}

function text(
    scene: Factory,
    y: number,
    size: number,
    colour: string,
    bold: boolean,
): Phaser.GameObjects.Text {
    return scene.add.text(PAD, y, '', {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color: colour,
        ...(bold ? { fontStyle: 'bold' } : {}),
    });
}

/**
 * The in-world half (contracts §10.9): one per viewer, mounted for the dock
 * station whether or not this player ever stands on the ramp. It owns the truck
 * and the wall and does nothing else — the panel above is the overlay's.
 */
class DockStationView implements StationView {
    private truck: TruckSprite | null = null;
    private wall: BayWall | null = null;
    private scene: Factory | null = null;
    private mg: DockMg | null = null;
    private lastMg = '';
    private readonly pile: ReturnsItem[] = [];

    create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void {
        this.scene = scene;
        this.truck = new TruckSprite(scene, layer, scene.layout, leaveSecondsOf(scene, station.id));
        this.wall = new BayWall(scene, layer, scene.layout);
    }

    update(station: StationState, serverNow: number): void {
        if (!this.truck || !this.wall || !this.scene) return;

        if (station.mg !== this.lastMg) {
            this.lastMg = station.mg;
            this.mg = parseDockMg(station.mg);
        }

        this.pile.length = 0;
        this.scene.conn.state.items.forEach((item) => this.pile.push(item));

        this.truck.update(this.mg, serverNow);
        this.wall.update(this.mg, this.pile, serverNow);
    }

    destroy(): void {
        this.truck?.destroy();
        this.wall?.destroy();
        this.truck = null;
        this.wall = null;
        this.scene = null;
    }
}

/** The `leaving` tween's length is the server's, so it is read from the level. */
function leaveSecondsOf(scene: Factory, stationId: string): number {
    const cfg = scene.levelConfig.stations.find((station) => station.id === stationId);
    const minigame = cfg?.minigame as DockMinigame | undefined;

    return minigame?.leaveSeconds ?? LEVEL_DEFAULTS.minigame.dock.leaveSeconds;
}

export const dockOverlay: OverlayFactory = () => new DockOverlay();
export const dockStationView = (): StationView => new DockStationView();
