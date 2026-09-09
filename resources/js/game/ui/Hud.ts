import type {
    StationType,
    BannerKey,
    FactoryState,
    PlayerState,
    ToastMsg,
    TruckPhase,
} from '@shared';
import type Phaser from 'phaser';

import { HUD_HEIGHT, TOAST_MAX, TOAST_MS } from '../constants';
import { GROOVE, NOTHING_ON_THE_BOARD, ORDER_BOARD } from '../nouns';
import type { Connection } from '../net/connection';
import { BANNER_COLOURS, BOARD_COLOURS, TOAST_COLOURS, UI, lineColour } from '../render/palette';
import { HELP_HINT, helpSections } from './helpContent';
import type { Factory } from '../scenes/Factory';
import { mmss } from './format';
import { grooveBand } from './grooveBand';
import { BOARD_HINT, type BoardRow, orderBoardRows } from './orderBoard';

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

/** The crew size the factory is designed around; below it the lobby nudges (ADR 0013). */
const BEST_CREW = 3;

/**
 * The clock is the phase line until the shift is actually running, and counts
 * elapsed rather than remaining in Sandbox, where the day never ends.
 */
export function clockText(view: ClockView, isHost: boolean): string {
    if (view.phase === 'ended') return 'SHIFT OVER';

    if (view.phase === 'lobby') {
        const tail = isHost ? 'ENTER starts the shift' : 'waiting for the host';
        // Solo and duo are the taster (ADR 0013) — playable, but say so, so nobody
        // mistakes a one-person shift for the game the factory was designed around.
        const hint = view.players < BEST_CREW ? ` · best with ${BEST_CREW}+` : '';

        return `LOBBY · ${view.players}/${view.minPlayers} players · ${tail}${hint}`;
    }

    if (view.shiftSeconds === 0) return mmss(view.clock);

    return mmss(view.shiftSeconds - view.clock);
}

/**
 * How much of the day's book is left, in the HUD band. 'BOOK' was a noun no
 * other surface in the client said and nothing defined — and the panel title
 * repeated it, so one line read 'ORDER BOARD · BOOK 11/13'.
 */
export function bookText(remaining: number, total: number): string {
    return `ORDERS ${remaining}/${total}`;
}

/**
 * Whether the band shows the count at all. `bookTotal` is 0 until the whistle
 * and 0 all day in Sandbox (contracts §3), so before the shift starts the band
 * was counting nothing — and 'ORDERS 0/0' sits hard against the left edge of a
 * lobby line that, at one player, runs the full width of the band. One rule,
 * the same one `boardTitle` uses: no book, no count.
 */
export function showsBook(total: number): boolean {
    return total > 0;
}

/** Sandbox has no book, so a count there would only ever read 0/0. */
export function boardTitle(remaining: number, total: number): string {
    return total > 0 ? `${ORDER_BOARD} · ${remaining}/${total} LEFT` : ORDER_BOARD;
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
    private boardOpen = false;
    private boardSignature = '';
    private helpPanel: Phaser.GameObjects.Container | null = null;

    constructor(
        private readonly scene: Factory,
        private readonly conn: Connection,
    ) {
        const width = scene.floorWidth;

        // Nobody finds a help key they were never told about.
        scene.add
            .text(10, HUD_HEIGHT + scene.floorHeight - 16, HELP_HINT, {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: css(UI.text),
            })
            .setDepth(5);

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
            .text(width - 8, 4, GROOVE, {
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

    /**
     * The `Tab` board (F04 §8). Held rather than toggled, so it is repainted
     * from `update` while it is up — a truck's countdown that froze the moment
     * the key went down would be lying about the only number on the panel that
     * moves.
     */
    board(open: boolean): void {
        this.boardOpen = open;

        if (!open) {
            this.boardPanel?.destroy(true);
            this.boardPanel = null;
            this.boardSignature = '';

            return;
        }

        this.paintBoard(this.conn.clock.now());
    }

    /** Rebuilt only when a row's words or its colour change: once a second at most. */
    private paintBoard(serverNow: number): void {
        const state = this.conn.state;
        const level = this.scene.levelConfig;
        const rows = orderBoardRows([...state.orders.values()], {
            now: serverNow,
            orders: level.orders,
            recipes: level.recipes,
            truck: { id: state.truck.id, phase: state.truck.phase as TruckPhase },
        });
        const signature = rows.map((row) => `${row.tone} ${row.text}`).join('\n');

        if (this.boardPanel !== null && signature === this.boardSignature) return;

        this.boardSignature = signature;
        this.boardPanel?.destroy(true);
        this.boardPanel = this.buildBoard(rows, state);
    }

    private buildBoard(rows: BoardRow[], state: FactoryState): Phaser.GameObjects.Container {
        const width = Math.min(480, this.scene.floorWidth - 64);
        const panel = this.scene.add.container(0, 0);
        const background = this.scene.add.graphics();
        const parts: Phaser.GameObjects.GameObject[] = [
            background,
            this.scene.add.text(16, 12, boardTitle(state.bookRemaining, state.bookTotal), {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: css(UI.text),
                fontStyle: 'bold',
            }),
        ];

        let y = 40;

        if (rows.length === 0) {
            parts.push(
                this.scene.add.text(16, y, NOTHING_ON_THE_BOARD, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: css(BOARD_COLOURS.waiting),
                }),
            );
            y += 16;
        }

        for (const row of rows) {
            parts.push(
                this.scene.add.text(16, y, row.text, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: css(BOARD_COLOURS[row.tone]),
                }),
            );
            y += 16;
        }

        const hint = this.scene.add.text(16, y + 10, BOARD_HINT, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: css(BOARD_COLOURS.done),
            wordWrap: { width: width - 32 },
        });
        const height = y + 10 + hint.height + 12;

        parts.push(hint);
        background.fillStyle(UI.panel, 0.9);
        background.fillRoundedRect(0, 0, width, height, 8);
        background.lineStyle(2, lineColour('a'), 1);
        background.strokeRoundedRect(0, 0, width, height, 8);

        panel.setPosition(
            (this.scene.floorWidth - width) / 2,
            Math.max(8, (this.scene.floorHeight - height) / 2),
        );
        panel.add(parts);
        this.scene.layers.overlay.add(panel);

        return panel;
    }

    /**
     * `H` help. The station the player is standing at leads, because the
     * mini-games are the part that cannot be guessed from the floor.
     */
    help(open: boolean, station: StationType | null): void {
        this.helpPanel?.destroy(true);
        this.helpPanel = null;

        if (!open) return;

        const sections = helpSections(station, this.scene.levelConfig.carry.throwTiles);
        const width = Math.min(560, this.scene.floorWidth - 48);
        // Height is finalised after the rows are laid out, since wrapping decides it.
        const lines = sections.reduce((n, s) => n + s.rows.length + 2, 0);
        const height = 44 + lines * 16;
        const panel = this.scene.add.container(
            (this.scene.floorWidth - width) / 2,
            Math.max(8, (this.scene.floorHeight - height) / 2),
        );
        const background = this.scene.add.graphics();

        background.fillStyle(UI.panel, 0.95);
        background.fillRoundedRect(0, 0, width, height, 8);
        background.lineStyle(2, lineColour('a'), 1);
        background.strokeRoundedRect(0, 0, width, height, 8);

        const parts: Phaser.GameObjects.GameObject[] = [
            background,
            this.scene.add.text(16, 12, 'HOW THIS WORKS', {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: css(UI.text),
                fontStyle: 'bold',
            }),
        ];

        let y = 40;

        for (const section of sections) {
            parts.push(
                this.scene.add.text(16, y, section.title, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: css(lineColour('a')),
                    fontStyle: 'bold',
                }),
            );
            y += 18;

            for (const [key, what] of section.rows) {
                const description = this.scene.add.text(168, y, what, {
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#bbbbbb',
                    wordWrap: { width: width - 184 },
                });

                parts.push(
                    this.scene.add.text(24, y, key, {
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: css(UI.text),
                    }),
                    description,
                );

                // A wrapped description is taller than one line, so step by what
                // was actually rendered or the next row lands on top of it.
                y += Math.max(16, description.height + 4);
            }

            y += 8;
        }

        // Redraw the background now that the wrapped rows have settled the real height.
        background.clear();
        background.fillStyle(UI.panel, 0.95);
        background.fillRoundedRect(0, 0, width, y + 8, 8);
        background.lineStyle(2, lineColour('a'), 1);
        background.strokeRoundedRect(0, 0, width, y + 8, 8);
        panel.setY(Math.max(8, (this.scene.floorHeight - (y + 8)) / 2));

        panel.add(parts);
        this.scene.layers.overlay.add(panel);
        this.helpPanel = panel;
    }

    update(state: FactoryState, me: PlayerState | undefined, serverNow: number): void {
        if (this.boardOpen) this.paintBoard(serverNow);

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
        const hasBook = showsBook(state.bookTotal);

        this.book.setVisible(hasBook);
        this.glyphs.setVisible(hasBook);

        if (!hasBook) return;

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

        this.grooveLabel.setText(band.label === '' ? GROOVE : band.label);
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
