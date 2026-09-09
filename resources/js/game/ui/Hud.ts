import type { BannerKey, FactoryState, PlayerState, ToastMsg } from '@shared';
import type Phaser from 'phaser';

import { HUD_HEIGHT, TOAST_MAX, TOAST_MS } from '../constants';
import type { Connection } from '../net/connection';
import { BANNER_COLOURS, TOAST_COLOURS, UI, lineColour } from '../render/palette';
import type { Factory } from '../scenes/Factory';
import { mmss } from './format';
import { grooveBand } from './grooveBand';

/**
 * The top band, the banner and the toasts (F04 §8). Everything it shows is read
 * from state each frame; the HUD owns no truth of its own, which is why a
 * reconnect needs nothing more than the next patch to be correct again.
 */

const BAR_WIDTH = 160;
const BAR_HEIGHT = 14;
const GLYPH_MAX = 20;
const BANNER_TWEEN_MS = 150;

/** Everything the clock line reads. Plain data so the branches are testable. */
export interface ClockView {
    phase: string;
    clock: number;
    shiftSeconds: number;
    players: number;
    minPlayers: number;
}

/**
 * The clock is the phase line until the shift is actually running, and counts
 * elapsed rather than remaining in Sandbox, where the day never ends.
 */
export function clockText(view: ClockView, isHost: boolean): string {
    if (view.phase === 'ended') return 'SHIFT OVER';

    if (view.phase === 'lobby') {
        const tail = isHost ? 'ENTER starts the shift' : 'waiting for the host';

        return `LOBBY · ${view.players}/${view.minPlayers} players · ${tail}`;
    }

    if (view.shiftSeconds === 0) return mmss(view.clock);

    return mmss(view.shiftSeconds - view.clock);
}

export function bookText(remaining: number, total: number): string {
    return `BOOK ${remaining}/${total}`;
}

/**
 * Order ids are `o-<n>` (contracts §3), so plain string order lists a book of
 * ten as `o-1, o-10, o-2`. The board is read top to bottom in book order.
 */
export function compareOrderIds(a: string, b: string): number {
    const left = Number(a.slice(2));
    const right = Number(b.slice(2));

    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;

    return a.localeCompare(b);
}

function css(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

export class Hud {
    private readonly band: Phaser.GameObjects.Graphics;
    private readonly chip: Phaser.GameObjects.Graphics;
    private readonly chipLabel: Phaser.GameObjects.Text;
    private readonly book: Phaser.GameObjects.Text;
    private readonly glyphs: Phaser.GameObjects.Graphics;
    private readonly clockLabel: Phaser.GameObjects.Text;
    private readonly grooveLabel: Phaser.GameObjects.Text;
    private readonly grooveBar: Phaser.GameObjects.Graphics;
    private readonly bannerLabel: Phaser.GameObjects.Text;
    private readonly toasts: Phaser.GameObjects.Container[] = [];

    private chipText = '';
    private bookLine = '';
    private clockLine = '';
    private bannerKey: BannerKey | '' = '';
    private bannerUntil = 0;
    private painted = '';
    private local: string | null = null;
    private localColour = 0xf2d33b;
    private boardPanel: Phaser.GameObjects.Container | null = null;

    constructor(
        private readonly scene: Factory,
        private readonly conn: Connection,
    ) {
        const width = scene.floorWidth;

        this.band = scene.add.graphics();
        this.band.fillStyle(UI.hudBackground, 1);
        this.band.fillRect(0, 0, width, HUD_HEIGHT);

        this.chip = scene.add.graphics();
        this.chipLabel = scene.add.text(16, 16, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: css(UI.text),
            fontStyle: 'bold',
        });

        this.book = scene.add.text(0, 18, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: css(UI.text),
        });
        this.glyphs = scene.add.graphics();

        this.clockLabel = scene.add
            .text(width / 2, 8, '', {
                fontFamily: 'monospace',
                fontSize: '24px',
                color: css(UI.text),
                fontStyle: 'bold',
            })
            .setOrigin(0.5, 0);

        this.grooveLabel = scene.add
            .text(width - 8, 4, 'GROOVE', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: css(UI.text),
            })
            .setOrigin(1, 0);
        this.grooveBar = scene.add.graphics();

        this.bannerLabel = scene.add
            .text(scene.floorWidth / 2, scene.floorHeight * 0.35, '', {
                fontFamily: 'monospace',
                fontSize: '44px',
                color: css(UI.text),
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setVisible(false);
        scene.layers.overlay.add(this.bannerLabel);
    }

    /** Shows one banner until the given `clock` second; `update` calls it from state. */
    banner(key: BannerKey, untilServerSeconds: number): void {
        this.bannerKey = key;
        this.bannerUntil = untilServerSeconds;
        this.paintBanner(this.conn.config.copy.banners[key], BANNER_COLOURS[key]);
        this.bannerLabel.setScale(0.6);
        this.scene.tweens.add({ targets: this.bannerLabel, scale: 1, duration: BANNER_TWEEN_MS });
    }

    /** Connection news. It sits on top of the server's banner until cleared. */
    localBanner(text: string | null, colour = 0xf2d33b): void {
        this.local = text;
        this.localColour = colour;
    }

    toast(m: ToastMsg): void {
        const panel = this.scene.add.container(this.scene.floorWidth - 8, HUD_HEIGHT + 8);
        const label = this.scene.add
            .text(-8, 4, m.text, {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: css(TOAST_COLOURS[m.kind]),
            })
            .setOrigin(1, 0);
        const background = this.scene.add.graphics();

        background.fillStyle(UI.panel, 0.85);
        background.fillRoundedRect(-label.width - 16, 0, label.width + 16, 24, 4);
        panel.add([background, label]);
        panel.setAlpha(0);

        this.toasts.push(panel);
        while (this.toasts.length > TOAST_MAX) this.dropToast(this.toasts[0]);
        this.restackToasts();

        this.scene.tweens.add({ targets: panel, alpha: 1, duration: 150 });
        this.scene.time.delayedCall(TOAST_MS, () => this.dropToast(panel));
    }

    /** The `Tab` order board (F04 §8) — one row per order, sorted by id. */
    board(open: boolean): void {
        this.boardPanel?.destroy(true);
        this.boardPanel = null;

        if (!open) return;

        const state = this.conn.state;
        const width = Math.min(420, this.scene.floorWidth - 64);
        const rows = [...state.orders.entries()]
            .sort(([a], [b]) => compareOrderIds(a, b))
            .map(
                ([id, order]) =>
                    `${id}  ${order.product}  ${order.shipped}/${order.qty}  ${order.status}`,
            );
        const height = 56 + rows.length * 16;
        const panel = this.scene.add.container(
            (this.scene.floorWidth - width) / 2,
            (this.scene.floorHeight - height) / 2,
        );
        const background = this.scene.add.graphics();

        background.fillStyle(UI.panel, 0.9);
        background.fillRoundedRect(0, 0, width, height, 8);
        background.lineStyle(2, lineColour('a'), 1);
        background.strokeRoundedRect(0, 0, width, height, 8);

        panel.add([
            background,
            this.scene.add.text(
                16,
                12,
                `ORDER BOARD · ${bookText(state.bookRemaining, state.bookTotal)}`,
                {
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    color: css(UI.text),
                    fontStyle: 'bold',
                },
            ),
            this.scene.add.text(16, 40, rows.length > 0 ? rows.join('\n') : 'no orders yet', {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#bbbbbb',
            }),
        ]);

        this.scene.layers.overlay.add(panel);
        this.boardPanel = panel;
    }

    update(state: FactoryState, me: PlayerState | undefined, serverNow: number): void {
        this.updateChip(me);
        this.updateBook(state);
        this.updateClock(state);
        this.updateGroove(state);
        this.updateBanner(state, serverNow);
    }

    private updateChip(me: PlayerState | undefined): void {
        const text = me ? `${me.name} · LINE ${me.line.toUpperCase()}` : '';

        if (text === this.chipText) return;

        this.chipText = text;
        this.chipLabel.setText(text);
        this.chip.clear();

        if (text === '') return;

        this.chip.fillStyle(lineColour(me?.line ?? 'a'), 1);
        this.chip.fillRoundedRect(8, 10, this.chipLabel.width + 16, 26, 6);
        this.book.setX(8 + this.chipLabel.width + 32);
    }

    private updateBook(state: FactoryState): void {
        // Sandbox has no book at all, so the glyphs would only ever read 0/0.
        const sandbox = state.shiftSeconds === 0;

        this.book.setVisible(!sandbox);
        this.glyphs.setVisible(!sandbox);

        if (sandbox) return;

        const line = bookText(state.bookRemaining, state.bookTotal);

        if (line === this.bookLine) return;

        this.bookLine = line;
        this.book.setText(line);
        this.glyphs.clear();

        const shown = Math.min(state.bookTotal, GLYPH_MAX);
        const left = this.book.x + this.book.width + 8;

        for (let i = 0; i < shown; i += 1) {
            this.glyphs.fillStyle(i < state.bookRemaining ? UI.text : UI.beaconOff, 1);
            this.glyphs.fillRect(left + i * 8, 16, 6, 8);
        }
    }

    private updateClock(state: FactoryState): void {
        const line = clockText(
            {
                phase: state.phase,
                clock: state.clock,
                shiftSeconds: state.shiftSeconds,
                players: state.players.size,
                minPlayers: this.conn.config.level.players.min,
            },
            state.host === this.conn.sessionId,
        );

        if (line === this.clockLine) return;

        this.clockLine = line;
        this.clockLabel.setText(line);
        this.clockLabel.setFontSize(state.phase === 'running' ? 24 : 14);
    }

    private updateGroove(state: FactoryState): void {
        const band = grooveBand(state.groove, this.conn.config.level.groove.thresholds);
        const left = this.scene.floorWidth - 8 - BAR_WIDTH;

        this.grooveLabel.setText(band.label === '' ? 'GROOVE' : band.label);
        this.grooveLabel.setColor(css(band.colour));

        this.grooveBar.clear();
        this.grooveBar.fillStyle(UI.beaconOff, 1);
        this.grooveBar.fillRect(left, 24, BAR_WIDTH, BAR_HEIGHT);
        this.grooveBar.fillStyle(band.colour, 1);
        this.grooveBar.fillRect(
            left,
            24,
            (BAR_WIDTH * Math.max(0, Math.min(100, state.groove))) / 100,
            BAR_HEIGHT,
        );
    }

    private updateBanner(state: FactoryState, serverNow: number): void {
        const live = state.banner !== '' && serverNow < state.bannerUntil;

        if (live && (state.banner !== this.bannerKey || state.bannerUntil !== this.bannerUntil)) {
            this.banner(state.banner as BannerKey, state.bannerUntil);
        }

        if (this.bannerKey !== '' && serverNow >= this.bannerUntil) this.bannerKey = '';

        // A connection banner outranks the server's: the player has to know the
        // socket is gone before they read anything the factory has to say.
        if (this.local !== null) {
            this.paintBanner(this.local, this.localColour);

            return;
        }

        if (this.bannerKey === '') {
            this.bannerLabel.setVisible(false);

            return;
        }

        this.paintBanner(
            this.conn.config.copy.banners[this.bannerKey],
            BANNER_COLOURS[this.bannerKey],
        );
    }

    private paintBanner(text: string, colour: number): void {
        this.bannerLabel.setVisible(true);

        if (text === this.painted) return;

        this.painted = text;
        this.bannerLabel.setText(text);
        this.bannerLabel.setColor(css(colour));
    }

    private restackToasts(): void {
        this.toasts.forEach((panel, i) => panel.setY(HUD_HEIGHT + 8 + i * 28));
    }

    private dropToast(panel: Phaser.GameObjects.Container | undefined): void {
        if (!panel) return;

        const index = this.toasts.indexOf(panel);

        if (index === -1) return;

        this.toasts.splice(index, 1);
        this.restackToasts();
        this.scene.tweens.add({
            targets: panel,
            alpha: 0,
            duration: 300,
            onComplete: () => panel.destroy(true),
        });
    }
}
