import type { PlayerState, StationState } from '@shared';
import type Phaser from 'phaser';

import type { MinigameOverlay, OverlayContext, OverlayKey } from './types';

/**
 * The placeholder every station wears until its own overlay lands (F07–F09). It
 * prints the server's raw `mg` blob so the author of the real overlay can watch
 * the mini-game run before drawing a pixel of it.
 */
export class Stub implements MinigameOverlay {
    private ctx: OverlayContext | null = null;
    private mgText: Phaser.GameObjects.Text | null = null;
    private lastMg = '';

    constructor(
        readonly capturesMovement: boolean,
        private readonly title: string,
        private readonly legend: string,
    ) {}

    mount(ctx: OverlayContext): void {
        this.ctx = ctx;
        this.lastMg = '';

        const scene = ctx.scene;

        ctx.container.add(
            scene.add.text(16, 12, this.title, {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#ffffff',
                fontStyle: 'bold',
            }),
        );
        ctx.container.add(
            scene.add.text(16, 38, this.legend, {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#bbbbbb',
                wordWrap: { width: ctx.width - 32 },
            }),
        );

        this.mgText = scene.add.text(16, 78, '', {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#8fb8ff',
            wordWrap: { width: ctx.width - 32 },
        });
        ctx.container.add(this.mgText);
    }

    update(station: StationState, _me: PlayerState, _serverNow: number): void {
        if (!this.mgText || station.mg === this.lastMg) return;

        this.lastMg = station.mg;
        this.mgText.setText(pretty(station.mg));
    }

    onKey(_key: OverlayKey, _down: boolean, _repeat: boolean): boolean {
        return false;
    }

    unmount(): void {
        this.ctx?.container.removeAll(true);
        this.mgText = null;
        this.ctx = null;
    }
}

/** An `mg` blob the client cannot parse is shown raw rather than swallowed. */
function pretty(mg: string): string {
    if (mg === '') return 'mg: (empty)';

    try {
        return JSON.stringify(JSON.parse(mg) as unknown, null, 1);
    } catch {
        return mg;
    }
}
