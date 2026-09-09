import { TILE_PX, type MgOp, type PlayerState, type StationState, type StationType } from '@shared';
import type Phaser from 'phaser';

import type { Keys } from '../input/Keys';
import type { Connection } from '../net/connection';
import { UI, lineColour } from '../render/palette';
import type { Factory } from '../scenes/Factory';
import { minigames } from './index';
import type { MinigameOverlay, OverlayContext, OverlayKey } from './types';

/**
 * Mounts the overlay for the station the player is working (F04 §11). The panel
 * is the host's; what goes inside it belongs to the station's own feature, and
 * a key the overlay does not consume still reaches the floor.
 */

const TAIL_INSET = 12;

/** The clipboard bar has to finish exactly when the server says the wait is over. */
export function clipboardProgress(
    clipboardUntil: number,
    clipboardSeconds: number,
    serverNow: number,
): number {
    if (clipboardSeconds <= 0) return 1;

    const elapsed = serverNow - (clipboardUntil - clipboardSeconds);

    return Math.max(0, Math.min(1, elapsed / clipboardSeconds));
}

/** The tail points at the station, but never off the end of the panel. */
export function tailX(anchorPx: number, panelWidth: number): number {
    return Math.max(TAIL_INSET, Math.min(panelWidth - TAIL_INSET, anchorPx));
}

export class Host {
    private readonly panel: Phaser.GameObjects.Container;
    private readonly background: Phaser.GameObjects.Graphics;
    private readonly content: Phaser.GameObjects.Container;
    private readonly clipboardTitle: Phaser.GameObjects.Text;
    private readonly clipboardLine: Phaser.GameObjects.Text;
    private readonly clipboardBar: Phaser.GameObjects.Graphics;

    private readonly width: number;
    private readonly height: number;

    private overlay: MinigameOverlay | null = null;
    private mountedStationId = '';
    private onClipboard = false;

    constructor(
        private readonly scene: Factory,
        private readonly conn: Connection,
        private readonly keys: Keys,
    ) {
        this.width = scene.floorWidth;
        this.height = scene.floorHeight / 3;

        this.background = scene.add.graphics();
        this.content = scene.add.container(0, 0);

        this.clipboardTitle = scene.add.text(16, 12, 'CLIPBOARD', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold',
        });
        this.clipboardLine = scene.add.text(16, 44, '', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#dddddd',
            wordWrap: { width: this.width - 32 },
        });
        this.clipboardBar = scene.add.graphics();

        this.panel = scene.add.container(0, (scene.floorHeight * 2) / 3, [
            this.background,
            this.content,
            this.clipboardTitle,
            this.clipboardLine,
            this.clipboardBar,
        ]);
        this.panel.setVisible(false);
        scene.layers.overlay.add(this.panel);
    }

    update(me: PlayerState | undefined, serverNow: number): void {
        const station =
            me && me.stationId !== '' ? this.conn.state.stations.get(me.stationId) : undefined;
        const active = me !== undefined && me.workTile !== '' && station !== undefined;

        if (!active || !me || !station) {
            this.clearPanel();

            return;
        }

        this.onClipboard = serverNow < me.clipboardUntil;

        if (this.onClipboard) {
            this.unmountOverlay();
            this.showClipboard(me, station, serverNow);

            return;
        }

        this.hideClipboard();

        if (this.mountedStationId !== station.id) {
            this.unmountOverlay();
            this.mountOverlay(station);
        }

        this.overlay?.update(station, me, serverNow);
    }

    /** `true` means the overlay ate the key and the floor message must not fire. */
    handleKey(key: OverlayKey, down: boolean, repeat: boolean): boolean {
        if (!this.overlay || this.onClipboard) return false;

        return this.overlay.onKey(key, down, repeat);
    }

    destroy(): void {
        this.unmountOverlay();
        this.panel.destroy(true);
    }

    private mountOverlay(station: StationState): void {
        const type = station.type as StationType;
        const overlay = minigames[type]();

        this.overlay = overlay;
        this.mountedStationId = station.id;

        this.drawPanel(station);
        this.panel.setVisible(true);

        overlay.mount(this.context(station, type));
        this.keys.setOverlayRouting(overlay.capturesMovement);
    }

    private context(station: StationState, type: StationType): OverlayContext {
        return {
            scene: this.scene,
            room: this.conn.room,
            sessionId: this.conn.sessionId,
            state: this.conn.state,
            container: this.content,
            width: this.width,
            height: this.height,
            stationId: station.id,
            stationType: type,
            clock: this.conn.clock,
            serverClock: () => this.conn.clock.now(),
            anchorPx: () => ({ x: station.anchorX * TILE_PX, y: station.anchorY * TILE_PX }),
            send: (op: MgOp, v?: number | string) =>
                this.conn.send('mg', {
                    stationId: station.id,
                    op,
                    t: performance.now(),
                    ...(v === undefined ? {} : { v }),
                }),
            sendInteract: () => this.conn.send('interact', { t: performance.now() }),
            sendAction: () => this.conn.send('action', { t: performance.now() }),
        };
    }

    private showClipboard(me: PlayerState, station: StationState, serverNow: number): void {
        this.drawPanel(station);
        this.panel.setVisible(true);
        this.clipboardTitle.setVisible(true);
        this.clipboardLine.setVisible(true);
        this.clipboardBar.setVisible(true);
        this.clipboardLine.setText(me.bubble);

        const filled = clipboardProgress(
            me.clipboardUntil,
            this.conn.config.level.clipboardSeconds,
            serverNow,
        );

        this.clipboardBar.clear();
        this.clipboardBar.fillStyle(UI.beaconOff, 1);
        this.clipboardBar.fillRect(16, this.height - 32, this.width - 32, 10);
        this.clipboardBar.fillStyle(UI.text, 1);
        this.clipboardBar.fillRect(16, this.height - 32, (this.width - 32) * filled, 10);
    }

    private hideClipboard(): void {
        this.clipboardTitle.setVisible(false);
        this.clipboardLine.setVisible(false);
        this.clipboardBar.setVisible(false);
    }

    private clearPanel(): void {
        this.onClipboard = false;
        this.unmountOverlay();
        this.hideClipboard();
        this.panel.setVisible(false);
    }

    private unmountOverlay(): void {
        if (!this.overlay) return;

        this.overlay.unmount();
        this.overlay = null;
        this.mountedStationId = '';
        this.panel.setVisible(false);
        this.keys.setOverlayRouting(false);
    }

    private drawPanel(station: StationState): void {
        const tail = tailX(station.anchorX * TILE_PX, this.width);

        this.background.clear();
        this.background.fillStyle(UI.panel, 0.88);
        this.background.fillRoundedRect(0, 0, this.width, this.height, 8);
        this.background.fillTriangle(tail - 6, 0, tail + 6, 0, tail, -12);
        this.background.lineStyle(2, lineColour(station.line), 1);
        this.background.strokeRoundedRect(0, 0, this.width, this.height, 8);
    }
}
