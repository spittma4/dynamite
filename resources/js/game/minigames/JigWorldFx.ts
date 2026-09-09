import {
    type AssemblyMinigame,
    type FuseLength,
    type JigCradle,
    type JigMg,
    type JigTiles,
    type StationState,
    TILE_PX,
    type Tile,
    nearestTile,
} from '@shared';
import type Phaser from 'phaser';

import type { Factory } from '../scenes/Factory';
import { JIG_COLOURS, casingDings, fractionIn, isFrozen, parseJigMg, primeFlash } from './Jig';
import type { StationView } from './types';

/**
 * The Jig as the rest of the floor sees it (F08 §Client, contracts §10.9): one
 * per client per assembly station, mounted whether or not this player ever
 * stands at it. The panel belongs to the two players working the station; what
 * is drawn here — the set arcing across the aisle, the casing seated with its
 * dings, what is sitting in the cradle, and the brass flash of a PRIME STICK —
 * is what a hauler on the far side of the room has to read without one.
 */

/** Pixels, tuned against the 32 px tile rather than taken from the design docs. */
const ARC_LIFT_PX = TILE_PX * 0.9;
const SET_PX = TILE_PX * 0.3;
const CRADLE_PX = TILE_PX * 0.4;
const CASING_PX = TILE_PX * 0.36;
const DING_GAP_PX = 5;
/** How far off square an OK toss lands, in degrees, until A squares it up. */
const ASKEW_DEGREES = 20;
const FLASH_ALPHA = 0.55;

const FUSE_PX: Record<FuseLength, number> = {
    '': 0,
    short: TILE_PX * 0.3,
    long: TILE_PX * 0.6,
};

export function tileCentre(tile: Tile): { x: number; y: number } {
    return { x: (tile[0] + 0.5) * TILE_PX, y: (tile[1] + 0.5) * TILE_PX };
}

/**
 * Where the set comes down. The server tosses it to the jig tile nearest the
 * rack, so the arc has to end on the same one or the drawing and the sim
 * disagree about which end of the machine the work landed on.
 */
export function landingTile(tiles: JigTiles): Tile {
    const first = tiles.jig[0];
    const rack = tiles.rack[0];

    if (first === undefined) return tiles.aisle;

    return rack === undefined ? first : nearestTile(rack, tiles.jig);
}

/** A's end of the machine: the casing is seated where the toss does not land. */
export function seatTile(tiles: JigTiles): Tile {
    return tiles.jig[0] ?? tiles.aisle;
}

/**
 * How far through the swing the set is. The release is judged at
 * `swingStartAt + arcSeconds`, so the set is over the jig exactly when B should
 * let go and the whole floor can see the mark being aimed at. A hold past the
 * mark stops there rather than sailing on.
 */
export function swingFraction(swingStartAt: number, arcSeconds: number, now: number): number {
    return fractionIn(swingStartAt, swingStartAt + arcSeconds, now);
}

/** A parabola over the aisle, so the set is read as thrown and not as slid. */
export function arcPoint(from: Tile, to: Tile, u: number): { x: number; y: number } {
    const a = tileCentre(from);
    const b = tileCentre(to);
    const t = Math.max(0, Math.min(1, u));

    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - 4 * t * (1 - t) * ARC_LIFT_PX,
    };
}

export interface CradleShow {
    show: boolean;
    /** Degrees off square: an OK toss lands askew and costs A the surface tax. */
    angle: number;
    /** The spool B picked, read off the length of the fuse rather than a label. */
    fusePx: number;
}

export function cradleShow(cradle: JigCradle, fuse: FuseLength): CradleShow {
    return {
        show: cradle !== 'empty',
        angle: cradle === 'surface' ? ASKEW_DEGREES : 0,
        fusePx: FUSE_PX[fuse],
    };
}

/** The arc has to close on the beat the server judges the release against. */
function arcSecondsOf(scene: Factory, stationId: string): number {
    const cfg = scene.levelConfig.stations.find((station) => station.id === stationId);
    const minigame = cfg?.minigame as AssemblyMinigame | undefined;

    return minigame?.toss.arcSeconds ?? 0;
}

class JigWorldView implements StationView {
    private graphics: Phaser.GameObjects.Graphics | null = null;
    private mg: JigMg | null = null;
    private lastMg = '';
    private arcSeconds = 0;
    private frozenNow = 0;

    create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void {
        this.arcSeconds = arcSecondsOf(scene, station.id);
        this.frozenNow = scene.conn.clock.now();
        this.graphics = scene.add.graphics();
        layer.add(this.graphics);
    }

    update(station: StationState, serverNow: number): void {
        const g = this.graphics;

        if (!g) return;

        if (station.mg !== this.lastMg) {
            this.lastMg = station.mg;
            this.mg = parseJigMg(station.mg);
        }

        const mg = this.mg;

        g.clear();

        if (!mg) return;

        // The panel's rule, for the same reason: F05 stops ticking a jammed or
        // damaged station, so its marks stand still and the clock stands with
        // them. An interrupt shifts the marks itself and keeps the live clock.
        if (!isFrozen(station)) this.frozenNow = serverNow;

        this.drawSeated(g, mg);
        this.drawCradle(g, mg);
        this.drawSwing(g, mg, this.frozenNow);
        this.drawPrimeFlash(g, mg, this.frozenNow);
    }

    destroy(): void {
        this.graphics?.destroy();
        this.graphics = null;
        this.mg = null;
    }

    /** The casing A is working, with the dings that decide whether it sparks. */
    private drawSeated(g: Phaser.GameObjects.Graphics, mg: JigMg): void {
        const seated = mg.seated;

        if (seated === null) return;

        const at = tileCentre(seatTile(mg.tiles));

        g.fillStyle(JIG_COLOURS.casing, 1);
        g.fillRoundedRect(at.x - CASING_PX / 2, at.y - CASING_PX / 2, CASING_PX, CASING_PX, 3);
        g.fillStyle(JIG_COLOURS.dent, 1);

        for (let d = 0; d < casingDings(seated.dents); d++) {
            g.fillCircle(at.x - CASING_PX / 2 + 4 + d * DING_GAP_PX, at.y + CASING_PX / 2 - 4, 1.5);
        }
    }

    /** What is on the jig, on the tile the toss actually lands on. */
    private drawCradle(g: Phaser.GameObjects.Graphics, mg: JigMg): void {
        const show = cradleShow(mg.cradle, mg.cradleFuse);

        if (!show.show) return;

        const at = tileCentre(landingTile(mg.tiles));
        const radians = (show.angle * Math.PI) / 180;

        g.fillStyle(JIG_COLOURS.parts, 1);
        g.fillRoundedRect(at.x - CRADLE_PX / 2, at.y - CRADLE_PX / 2, CRADLE_PX, CRADLE_PX, 3);
        g.lineStyle(2, JIG_COLOURS.label, 1);
        g.lineBetween(
            at.x,
            at.y,
            at.x + Math.cos(radians) * show.fusePx,
            at.y - Math.sin(radians) * show.fusePx,
        );
    }

    /** The set on its way across, from B's swing to the mark it is released on. */
    private drawSwing(g: Phaser.GameObjects.Graphics, mg: JigMg, now: number): void {
        const rack = mg.tiles.rack[0];

        if (mg.bPhase !== 'swinging' || rack === undefined) return;

        const at = arcPoint(
            rack,
            landingTile(mg.tiles),
            swingFraction(mg.swingStartAt, this.arcSeconds, now),
        );

        g.fillStyle(JIG_COLOURS.parts, 1);
        g.fillCircle(at.x, at.y, SET_PX / 2);
        g.lineStyle(1, JIG_COLOURS.trackEdge, 1);
        g.strokeCircle(at.x, at.y, SET_PX / 2);
    }

    /** The PRIME STICK flash the panel shows, on the machine everyone can see. */
    private drawPrimeFlash(g: Phaser.GameObjects.Graphics, mg: JigMg, now: number): void {
        const alpha = primeFlash(mg.primeAt, now);

        if (alpha <= 0) return;

        g.fillStyle(JIG_COLOURS.brass, alpha * FLASH_ALPHA);

        for (const tile of mg.tiles.jig) {
            g.fillRect(tile[0] * TILE_PX, tile[1] * TILE_PX, TILE_PX, TILE_PX);
        }
    }
}

export const jigView = (): StationView => new JigWorldView();
