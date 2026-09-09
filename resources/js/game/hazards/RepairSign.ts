import { type Copy, TILE_PX } from '@shared';
import type Phaser from 'phaser';

import type { Factory, FactoryConn } from '../scenes/Factory';

/**
 * What a damaged station is waiting for (F10 §Client). F05 already writes
 * DAMAGED over the machine, so this adds the part a player can act on: the
 * paperwork, and how far through it somebody is. The bar is
 * `StationState.progress`, which F10's server side writes as the best of the
 * live repair holds, so two people filing the same report share one bar.
 */

export const REPAIR_BAR_W = 72;
export const REPAIR_BAR_H = 8;
export const REPAIR_SIGN_LIFT_PX = 34;
export const REPAIR_LABEL_PX = 10;

export const REPAIR_COLOURS = {
    track: 0x101014,
    bar: 0xf2921d,
    text: '#f2921d',
} as const;

export interface DamagedRow {
    id: string;
    anchorX: number;
    anchorY: number;
    state: string;
    progress: number;
}

export interface StationSource {
    forEach(fn: (station: DamagedRow) => void): void;
}

export interface RepairSignRow {
    id: string;
    x: number;
    y: number;
    progress: number;
}

export function damagedStations(stations: StationSource): RepairSignRow[] {
    const rows: RepairSignRow[] = [];

    stations.forEach((station) => {
        if (station.state !== 'damaged') return;

        rows.push({
            id: station.id,
            x: (station.anchorX + 0.5) * TILE_PX,
            y: (station.anchorY + 0.5) * TILE_PX,
            progress: station.progress,
        });
    });

    return rows;
}

export function repairFill(progress: number): number {
    return Math.min(1, Math.max(0, progress)) * REPAIR_BAR_W;
}

/**
 * The scene declares its config as F04's `FactoryConn`, which types only what
 * the scene itself reads; the connection behind it always carries `copy` as
 * well (contracts §10.9), and the sign is its words rather than ours.
 */
function repairLabel(scene: Factory): string {
    return (scene.conn.config as FactoryConn['config'] & { copy: Copy }).copy.chores.repair;
}

export class RepairSignView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly labels = new Map<string, Phaser.GameObjects.Text>();
    private painted = '';

    constructor(
        private readonly scene: Factory,
        private readonly layer: Phaser.GameObjects.Container,
    ) {
        this.graphics = scene.add.graphics();
        layer.add(this.graphics);
    }

    update(): void {
        const rows = damagedStations(this.scene.conn.state.stations);
        const key = rows.map((row) => `${row.id}=${Math.round(repairFill(row.progress))}`).join('|');

        if (key === this.painted) return;

        this.painted = key;
        this.graphics.clear();

        const standing = new Set<string>();

        for (const row of rows) {
            standing.add(row.id);
            this.paint(row);
        }

        for (const [id, label] of this.labels) {
            if (!standing.has(id)) label.setVisible(false);
        }
    }

    destroy(): void {
        for (const label of this.labels.values()) label.destroy();

        this.labels.clear();
        this.graphics.destroy();
    }

    private paint(row: RepairSignRow): void {
        const top = row.y - REPAIR_SIGN_LIFT_PX;
        const label = this.labelFor(row.id);

        label.setPosition(row.x, top);
        label.setVisible(true);

        this.graphics.fillStyle(REPAIR_COLOURS.track, 0.85);
        this.graphics.fillRect(
            row.x - REPAIR_BAR_W / 2 - 1,
            top + 1,
            REPAIR_BAR_W + 2,
            REPAIR_BAR_H + 2,
        );
        this.graphics.fillStyle(REPAIR_COLOURS.bar, 1);
        this.graphics.fillRect(
            row.x - REPAIR_BAR_W / 2,
            top + 2,
            repairFill(row.progress),
            REPAIR_BAR_H,
        );
    }

    private labelFor(id: string): Phaser.GameObjects.Text {
        const seen = this.labels.get(id);

        if (seen) return seen;

        const label = this.scene.add.text(0, 0, repairLabel(this.scene), {
            fontFamily: 'monospace',
            fontSize: `${REPAIR_LABEL_PX}px`,
            color: REPAIR_COLOURS.text,
            fontStyle: 'bold',
        });

        label.setOrigin(0.5, 1);
        label.setStroke('#000000', 3);
        this.layer.add(label);
        this.labels.set(id, label);

        return label;
    }
}
