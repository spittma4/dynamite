import { TILE_PX, type DockMg, type LayoutConfig, type TruckPhase } from '@shared';
import type Phaser from 'phaser';

import type { Factory } from '../../scenes/Factory';

/**
 * The truck in the world (F09 §Client). It is drawn for every viewer, not just
 * the players on the ramp, because the whole point of the dock is that the rest
 * of the floor can read it from across the room: how many slots are left, which
 * ones went in clean, and how long there is to fill them.
 *
 * Nothing here judges anything. The bed fills from `mg.truck.loaded` and the
 * lamps from `mg.truck.hits`, both of which the server already resolved.
 */

/** How long the truck takes to back into the bay once it docks. */
export const DRIVE_IN_SECONDS = 0.4;

/** One pixel of spring per stick, so a full truck sits visibly low. */
export const MAX_SAG_PX = 6;

export const TRUCK_COLOURS = {
    body: 0x3f4652,
    bodyEdge: 0x6d7686,
    cab: 0x59626f,
    bed: 0x2a2f38,
    slot: 0x1b1f26,
    slotEdge: 0x4a515c,
    stick: 0xd62828,
    stickFuse: 0xf2d33b,
    lampOff: 0x2a2f38,
    lampOn: 0xf5c542,
} as const;

export interface BedSlot {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * The slot grid on the bed. Two columns filled row by row, sized to whatever
 * bed the bay gives us, so an 8-slot truck and a 13-slot truck both fill the
 * same rectangle rather than growing off the end of it.
 */
export function bedSlots(slots: number, bedW: number, bedH: number, cols = 2): BedSlot[] {
    if (slots <= 0 || cols <= 0) return [];

    const rows = Math.ceil(slots / cols);
    const cellW = bedW / cols;
    const cellH = bedH / rows;
    const padX = cellW * 0.18;
    const padY = cellH * 0.18;
    const laid: BedSlot[] = [];

    for (let i = 0; i < slots; i++) {
        laid.push({
            x: (i % cols) * cellW + padX,
            y: Math.floor(i / cols) * cellH + padY,
            w: cellW - padX * 2,
            h: cellH - padY * 2,
        });
    }

    return laid;
}

/** The springs give a pixel per stick and then stop giving. */
export function sagPx(loaded: number, maxPx: number): number {
    return Math.min(maxPx, Math.max(0, loaded));
}

/** A lamp marks a Perfect; an OK scraped in and lights nothing. */
export function lampLit(hits: string, index: number): boolean {
    return hits[index] === 'P';
}

/**
 * How far off the bay the truck is: 0 parked, 1 gone. Both tweens run off the
 * server clock rather than a Phaser tween, so a client that joins mid-shift or
 * drops a frame lands on the same picture as everyone else. `leftAt` is the
 * moment this viewer saw the phase flip — a viewer that never saw it holds the
 * truck still instead of guessing when it pulled out.
 */
export function truckSlide(
    phase: TruckPhase,
    serverNow: number,
    arrivesAt: number,
    leftAt: number | null,
    leaveSeconds: number,
): number {
    if (phase === 'away') return 1;

    if (phase === 'leaving') {
        if (leftAt === null) return 0;
        if (leaveSeconds <= 0) return 1;

        return clamp01((serverNow - leftAt) / leaveSeconds);
    }

    return 1 - clamp01((serverNow - arrivesAt) / DRIVE_IN_SECONDS);
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

export class TruckSprite {
    private readonly container: Phaser.GameObjects.Container;
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly bay: { x: number; y: number; w: number; h: number };
    private readonly travelPx: number;

    private painted = '';
    private leftAt: number | null = null;
    private lastPhase: TruckPhase = 'away';

    constructor(
        scene: Factory,
        layer: Phaser.GameObjects.Container,
        layout: LayoutConfig,
        private readonly leaveSeconds: number,
    ) {
        const [bx, by, bw, bh] = layout.truckBay;

        this.bay = { x: bx * TILE_PX, y: by * TILE_PX, w: bw * TILE_PX, h: bh * TILE_PX };
        // The bay opens onto the dock door, so the truck leaves upward and has
        // to clear the wall as well as the bay before it stops being drawn.
        this.travelPx = this.bay.h + TILE_PX * 3;

        this.graphics = scene.add.graphics();
        this.container = scene.add.container(this.bay.x, this.bay.y, [this.graphics]);
        this.container.setVisible(false);
        layer.add(this.container);
    }

    update(mg: DockMg | null, serverNow: number): void {
        if (!mg) {
            this.container.setVisible(false);

            return;
        }

        const { phase, slots, loaded, hits } = mg.truck;

        if (phase !== this.lastPhase) {
            if (phase === 'leaving') this.leftAt = serverNow;

            this.lastPhase = phase;
        }

        const slide = truckSlide(phase, serverNow, mg.truck.arrivesAt, this.leftAt, this.leaveSeconds);

        this.container.setVisible(slide < 1);

        if (slide >= 1) return;

        this.container.setY(this.bay.y - slide * this.travelPx);

        const key = `${slots}~${loaded}~${hits}`;

        if (key === this.painted) return;

        this.painted = key;
        this.paint(slots, loaded, hits);
    }

    destroy(): void {
        this.container.destroy();
    }

    private paint(slots: number, loaded: number, hits: string): void {
        const g = this.graphics;
        const cabH = TILE_PX;
        const sag = sagPx(loaded, MAX_SAG_PX);
        const bedX = 3;
        const bedY = cabH + 3 + sag;
        const bedW = this.bay.w - bedX * 2;
        const bedH = this.bay.h - bedY - 3;

        g.clear();
        g.fillStyle(TRUCK_COLOURS.cab, 1);
        g.fillRect(0, 0, this.bay.w, cabH);
        g.fillStyle(TRUCK_COLOURS.body, 1);
        g.fillRect(0, cabH + sag, this.bay.w, this.bay.h - cabH - sag);
        g.lineStyle(2, TRUCK_COLOURS.bodyEdge, 1);
        g.strokeRect(1, 1, this.bay.w - 2, this.bay.h - 2);
        g.fillStyle(TRUCK_COLOURS.bed, 1);
        g.fillRect(bedX, bedY, bedW, bedH);

        for (const [index, slot] of bedSlots(slots, bedW, bedH).entries()) {
            const x = bedX + slot.x;
            const y = bedY + slot.y;

            g.fillStyle(TRUCK_COLOURS.slot, 1);
            g.fillRect(x, y, slot.w, slot.h);
            g.lineStyle(1, TRUCK_COLOURS.slotEdge, 1);
            g.strokeRect(x, y, slot.w, slot.h);

            if (index < loaded) this.paintStick(x, y, slot.w, slot.h);

            g.fillStyle(lampLit(hits, index) ? TRUCK_COLOURS.lampOn : TRUCK_COLOURS.lampOff, 1);
            g.fillCircle(x + slot.w - 3, y + 3, 2);
        }
    }

    /** A boarded stick: the red body plus the fuse that got it judged. */
    private paintStick(x: number, y: number, w: number, h: number): void {
        const g = this.graphics;
        const inset = Math.min(4, w / 4);

        g.fillStyle(TRUCK_COLOURS.stick, 1);
        g.fillRect(x + inset, y + 2, w - inset * 2, h - 4);
        g.fillStyle(TRUCK_COLOURS.stickFuse, 1);
        g.fillRect(x + w / 2 - 1, y, 2, 3);
    }
}
