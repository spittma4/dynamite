import {
    STATION_LABEL,
    TILE_PX,
    type MgOp,
    type PlayerState,
    type StationState,
    type StationType,
} from '@shared';
import type Phaser from 'phaser';

import type { Keys } from '../input/Keys';
import type { Connection } from '../net/connection';
import { TOAST_COLOURS, UI, lineColour } from '../render/palette';
import type { Factory } from '../scenes/Factory';
import { helperNotice } from '../ui/helperPost';
import { minigames } from './index';
import type { MinigameOverlay, OverlayContext, OverlayKey } from './types';

/**
 * Mounts the overlay for the station the player is working (F04 §11). The panel
 * is the host's; what goes inside it belongs to the station's own feature, and
 * a key the overlay does not consume still reaches the floor.
 */

const TAIL_INSET = 12;

function hex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

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

export type PanelMode = 'none' | 'clipboard' | 'overlay' | 'helper';

/**
 * Which panel a station member gets. It used to be the one expression
 * `me.workTile !== ''`, and a helper's `workTile` is empty by design (contracts
 * §10.2) — so the only role with no gesture to drive got no panel either, and N4's
 * "press E and get stuck" was a player who had joined a machine that never said so.
 *
 * A helper does not get the operator's console. The Slammer's panel has one
 * plunger and the Jig's has one needle; handing either to a body the server will
 * refuse every op from (`isOperator`, `jig.a`) would replace a silence with a lie.
 */
export function panelMode(
    me: { stationId: string; workTile: string; clipboardUntil: number },
    hasStation: boolean,
    serverNow: number,
): PanelMode {
    if (me.stationId === '' || !hasStation) return 'none';
    if (serverNow < me.clipboardUntil) return 'clipboard';

    return me.workTile === '' ? 'helper' : 'overlay';
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
    private readonly helperTitle: Phaser.GameObjects.Text;
    private readonly helperEffect: Phaser.GameObjects.Text;
    private readonly helperExit: Phaser.GameObjects.Text;

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

        this.helperTitle = scene.add.text(16, 12, '', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold',
        });
        this.helperEffect = scene.add.text(16, 44, '', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#dddddd',
            wordWrap: { width: this.width - 32 },
        });
        this.helperExit = scene.add.text(16, 72, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#bbbbbb',
        });

        this.panel = scene.add.container(0, (scene.floorHeight * 2) / 3, [
            this.background,
            this.content,
            this.clipboardTitle,
            this.clipboardLine,
            this.clipboardBar,
            this.helperTitle,
            this.helperEffect,
            this.helperExit,
        ]);
        this.panel.setVisible(false);
        this.hideClipboard();
        this.hideHelper();
        scene.layers.overlay.add(this.panel);
    }

    update(me: PlayerState | undefined, serverNow: number): void {
        const station =
            me && me.stationId !== '' ? this.conn.state.stations.get(me.stationId) : undefined;
        const mode = me ? panelMode(me, station !== undefined, serverNow) : 'none';

        if (mode === 'none' || !me || !station) {
            this.clearPanel();

            return;
        }

        this.onClipboard = mode === 'clipboard';

        if (mode === 'clipboard') {
            this.unmountOverlay();
            this.hideHelper();
            this.showClipboard(me, station, serverNow);

            return;
        }

        this.hideClipboard();

        if (mode === 'helper') {
            this.unmountOverlay();
            this.showHelper(station);

            return;
        }

        this.hideHelper();

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

    /**
     * The helper's panel: where you are, what the curve makes of your being
     * there, and the three ways out. Its own three lines rather than the
     * clipboard's, because the clipboard is a countdown with a bar and this is a
     * standing report that changes every time somebody else joins or leaves.
     */
    private showHelper(station: StationState): void {
        const cfg = this.conn.config.level.stations.find((entry) => entry.id === station.id);
        const label = STATION_LABEL[station.type as StationType];
        const notice = helperNotice(label, cfg?.staffing ?? { 1: 1 }, station.workers);

        this.drawPanel(station);
        this.panel.setVisible(true);
        this.helperTitle.setVisible(true);
        this.helperEffect.setVisible(true);
        this.helperExit.setVisible(true);
        this.helperTitle.setText(notice.title);
        this.helperTitle.setColor(hex(notice.helping ? TOAST_COLOURS.good : TOAST_COLOURS.warn));
        this.helperEffect.setText(notice.effect);
        this.helperExit.setText(notice.exit);
    }

    private hideHelper(): void {
        this.helperTitle.setVisible(false);
        this.helperEffect.setVisible(false);
        this.helperExit.setVisible(false);
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
        this.hideHelper();
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
