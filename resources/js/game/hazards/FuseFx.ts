import { TILE_PX, tileKey } from '@shared';
import type Phaser from 'phaser';

import type { Factory } from '../scenes/Factory';

/**
 * The six seconds of warning (F10 §Client). One hissing sparkler per entry of
 * `FactoryState.fuses`, drawn where the server says the fuse is burning: on the
 * tile for a keg on the floor or a spill, and on the carrier for a keg somebody
 * picked up and is running to the bin with.
 *
 * The whole layer is one `Graphics` cleared and redrawn each frame — a burning
 * fuse changes every frame anyway, and a pool of sprites for something that
 * lives six seconds costs more than it saves.
 */

/** The hiss doubles inside the last two seconds, which is the warning. */
export const FUSE_URGENT_SECONDS = 2;
export const FUSE_HZ = 8;
export const FUSE_URGENT_HZ = 16;
/** Never all the way out: a fuse that blinks off reads as one that went out. */
export const SPARKLE_MIN_ALPHA = 0.35;
export const SPARKLE_PX = 3.5;
/** The cord the spark runs down, at full length on a fresh six-second fuse. */
export const CORD_PX = 16;
export const CORD_BASE_PX = 10;
/** A carried keg rides 20 px above its carrier (F06), so the cord starts over it. */
export const CARRIED_BASE_PX = 30;

export const FUSE_COLOURS = {
    calm: 0xffe066,
    urgent: 0xff7a1a,
    stomped: 0x9a9a9a,
    cord: 0x2a2a2a,
} as const;

export interface FuseWhere {
    itemId: string;
    x: number;
    y: number;
}

export interface FuseRow extends FuseWhere {
    secondsLeft: number;
}

/** `state.fuses` and a plain `Map` both satisfy this. */
export interface FuseSource {
    forEach(fn: (fuse: FuseRow) => void): void;
}

export interface StompPlayer {
    chore: string;
    x: number;
    y: number;
}

export interface PlayerSource {
    forEach(fn: (player: StompPlayer) => void): void;
}

export type FuseAnchor =
    | { kind: 'tile'; x: number; y: number }
    | { kind: 'carried'; sessionId: string }
    | { kind: 'hidden' };

/**
 * Where one sparkle belongs. The server keeps `FuseState.x/y` on the carrier's
 * tile too, but a tile centre lags a walking avatar by up to half a tile, so a
 * fuse whose keg is in a pair of hands is drawn on the hands.
 */
export function fuseAnchor(fuse: FuseWhere, carrier: string): FuseAnchor {
    if (carrier !== '') return { kind: 'carried', sessionId: carrier };

    if (fuse.x < 0) return { kind: 'hidden' };

    return { kind: 'tile', x: (fuse.x + 0.5) * TILE_PX, y: (fuse.y + 0.5) * TILE_PX };
}

export function fuseHz(secondsLeft: number): number {
    return secondsLeft < FUSE_URGENT_SECONDS ? FUSE_URGENT_HZ : FUSE_HZ;
}

export function sparkleAlpha(secondsLeft: number, nowMs: number): number {
    const phase = (nowMs / 1000) * 2 * Math.PI * fuseHz(secondsLeft);

    return SPARKLE_MIN_ALPHA + (1 - SPARKLE_MIN_ALPHA) * (0.5 + 0.5 * Math.sin(phase));
}

export function sparkleTint(secondsLeft: number, stomped: boolean): number {
    if (stomped) return FUSE_COLOURS.stomped;

    return secondsLeft < FUSE_URGENT_SECONDS ? FUSE_COLOURS.urgent : FUSE_COLOURS.calm;
}

/**
 * How much cord is left. It is the countdown a player can read from across the
 * floor without a number on the screen: a chain fuse arrives as a stub because
 * 1.5 s of a 6 s cord is all it ever gets.
 */
export function cordLength(secondsLeft: number, fuseSeconds: number): number {
    if (fuseSeconds <= 0) return CORD_PX;

    return CORD_PX * Math.min(1, Math.max(0, secondsLeft / fuseSeconds));
}

/** The tiles a boot is currently on; a fuse under one is drawn going out. */
export function stompTiles(players: PlayerSource): Set<string> {
    const tiles = new Set<string>();

    players.forEach((player) => {
        if (player.chore !== 'stomp') return;

        tiles.add(tileKey(Math.floor(player.x), Math.floor(player.y)));
    });

    return tiles;
}

export class FuseSparkles {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private lit = false;

    constructor(
        private readonly scene: Factory,
        layer: Phaser.GameObjects.Container,
    ) {
        this.graphics = scene.add.graphics();
        layer.add(this.graphics);
    }

    update(nowMs: number): void {
        const state = this.scene.conn.state;
        const g = this.graphics;

        // An empty floor is the common case, and clearing a canvas that is
        // already blank is the one cost this layer can refuse to pay.
        if (state.fuses.size === 0) {
            if (this.lit) {
                g.clear();
                this.lit = false;
            }

            return;
        }

        const fuseSeconds = this.scene.levelConfig.hazards.fuseSeconds;
        const stomped = stompTiles(state.players);

        g.clear();
        this.lit = true;

        state.fuses.forEach((fuse) => {
            const anchor = fuseAnchor(fuse, this.carrierOf(fuse.itemId));

            if (anchor.kind === 'hidden') return;

            const at =
                anchor.kind === 'carried' ? this.scene.avatarPosition(anchor.sessionId) : anchor;

            if (!at) return;

            const base = at.y - (anchor.kind === 'carried' ? CARRIED_BASE_PX : CORD_BASE_PX);
            const alpha = sparkleAlpha(fuse.secondsLeft, nowMs);
            const tint = sparkleTint(fuse.secondsLeft, stomped.has(tileKey(fuse.x, fuse.y)));
            const tip = base - cordLength(fuse.secondsLeft, fuseSeconds);

            g.lineStyle(2, FUSE_COLOURS.cord, 0.9);
            g.lineBetween(at.x, base, at.x, tip);
            g.fillStyle(tint, alpha);
            g.fillCircle(at.x, tip, SPARKLE_PX);
            g.fillStyle(tint, alpha * 0.3);
            g.fillCircle(at.x, tip, SPARKLE_PX * 2);
        });
    }

    destroy(): void {
        this.graphics.destroy();
    }

    /** The session holding the burning keg, or `''` for a fuse on the floor. */
    private carrierOf(itemId: string): string {
        if (itemId === '') return '';

        const state = this.scene.conn.state;
        const holder = state.items.get(itemId)?.holder ?? '';

        return state.players.has(holder) ? holder : '';
    }
}
