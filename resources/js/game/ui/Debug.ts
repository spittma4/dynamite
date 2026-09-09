import { TILE_PX } from '@shared';
import type Phaser from 'phaser';

import { DEBUG_REFRESH_HZ, HUD_HEIGHT } from '../constants';
import type { Connection } from '../net/connection';
import type { Factory } from '../scenes/Factory';
import { CycleTracker, STATION_HEADER, bottleneckOf, fullness, stationRow } from './debugRows';

/**
 * The `~` overlay (F04 §9). It exists to answer "what does the sim think is
 * happening" in one glance during a playtest, so every number is read straight
 * from state and nothing here is cached beyond one refresh.
 */

export interface DebugGlobals {
    ticksPerSecond: number;
    patchesPerSecond: number;
    clock: number;
    phase: string;
    rttMs: number;
    lagMs: number;
    players: number;
    items: number;
}

export interface OrderCounts {
    open: number;
    partial: number;
    complete: number;
    failed: number;
}

export interface DebugTotals {
    groove: number;
    wip: number;
    orders: OrderCounts;
    bottleneck: string;
    pressure: number;
}

export interface PlayerRowInput {
    name: string;
    x: number;
    y: number;
    seq: number;
    stationId: string;
    workTile: string;
    speed: number;
}

export const PLAYER_HEADER = 'name     x     y     seq   station     tile   speed';

const PLAYER_COLUMNS = [9, 6, 6, 6, 12, 7] as const;

export function globalsLine(g: DebugGlobals): string {
    return [
        `tick ${g.ticksPerSecond.toFixed(1)}/s`,
        `patches ${g.patchesPerSecond.toFixed(1)}/s`,
        `clock ${g.clock.toFixed(1)}`,
        `phase ${g.phase}`,
        `rtt ${Math.round(g.rttMs)}ms`,
        `lag ${Math.round(g.lagMs)}ms`,
        `players ${g.players}`,
        `items ${g.items}`,
    ].join('  ');
}

export function totalsLine(t: DebugTotals): string {
    const o = t.orders;
    const orders = `orders open ${o.open} partial ${o.partial} complete ${o.complete} failed ${o.failed}`;
    const bottleneck =
        t.bottleneck === ''
            ? 'bottleneck -'
            : `bottleneck ${t.bottleneck} ${t.pressure.toFixed(2)}`;

    return `groove ${t.groove}  wip ${t.wip}  ${orders}  ${bottleneck}`;
}

export function playerRow(p: PlayerRowInput): string {
    const cells = [
        p.name,
        p.x.toFixed(1),
        p.y.toFixed(1),
        String(p.seq),
        p.stationId === '' ? '-' : p.stationId,
        p.workTile === '' ? '-' : p.workTile,
    ];

    const padded = cells.map((cell, i) => cell.padEnd(PLAYER_COLUMNS[i] ?? 0)).join('');

    return padded + p.speed.toFixed(1);
}

export class Debug {
    private readonly panel: Phaser.GameObjects.Container;
    private readonly background: Phaser.GameObjects.Graphics;
    private readonly text: Phaser.GameObjects.Text;
    private readonly ghost: Phaser.GameObjects.Graphics;
    private readonly cycles = new CycleTracker();

    private shown = false;
    private nextRefreshMs = 0;

    constructor(
        private readonly scene: Factory,
        private readonly conn: Connection,
    ) {
        this.background = scene.add.graphics();
        this.text = scene.add.text(6, 6, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#e8e8e8',
        });
        this.panel = scene.add.container(8, HUD_HEIGHT + 8, [this.background, this.text]);
        this.panel.setVisible(false);

        // Under the avatars on purpose: the predicted square should cover the
        // authoritative outline except while a nudge is being walked off.
        this.ghost = scene.add.graphics();
        this.ghost.setVisible(false);
        scene.layers.floor.add(this.ghost);
    }

    get visible(): boolean {
        return this.shown;
    }

    toggle(): void {
        this.shown = !this.shown;
        this.panel.setVisible(this.shown);
        this.ghost.setVisible(this.shown);
        this.nextRefreshMs = 0;
    }

    update(serverNow: number, nowMs: number): void {
        const state = this.conn.state;

        for (const [id, station] of state.stations.entries()) {
            this.cycles.note(id, station.state, serverNow);
        }

        if (!this.shown) return;

        this.drawGhost();

        if (nowMs < this.nextRefreshMs) return;

        this.nextRefreshMs = nowMs + 1000 / DEBUG_REFRESH_HZ;
        this.text.setText(this.lines().join('\n'));
        this.background.clear();
        this.background.fillStyle(0x000000, 0.7);
        this.background.fillRect(0, 0, this.text.width + 12, this.text.height + 12);
    }

    private lines(): string[] {
        const state = this.conn.state;
        const stations = [...state.stations.values()];
        const bottleneck = bottleneckOf(stations);
        const worst = state.stations.get(bottleneck);

        return [
            globalsLine({
                ticksPerSecond: this.conn.ticksPerSecond,
                patchesPerSecond: this.conn.patchesPerSecond,
                clock: state.clock,
                phase: state.phase,
                rttMs: this.conn.rttMs,
                lagMs: this.scene.prediction.lagMs,
                players: state.players.size,
                items: state.items.size,
            }),
            totalsLine({
                groove: Math.round(state.groove),
                wip: state.items.size,
                orders: this.orderCounts(),
                bottleneck,
                pressure: worst
                    ? worst.utilization * fullness(worst.inputShelf.length, worst.inputCap)
                    : 0,
            }),
            STATION_HEADER,
            ...stations.map((station) => stationRow(station, this.cycles.last(station.id))),
            PLAYER_HEADER,
            ...[...state.players.values()].map((player) =>
                playerRow({
                    name: player.name,
                    x: player.x,
                    y: player.y,
                    seq: player.seq,
                    stationId: player.stationId,
                    workTile: player.workTile,
                    speed: player.speed,
                }),
            ),
        ];
    }

    private orderCounts(): OrderCounts {
        const counts: OrderCounts = { open: 0, partial: 0, complete: 0, failed: 0 };

        for (const order of this.conn.state.orders.values()) {
            if (order.status === 'open') counts.open += 1;
            else if (order.status === 'partial') counts.partial += 1;
            else if (order.status === 'complete') counts.complete += 1;
            else if (order.status === 'failed') counts.failed += 1;
        }

        return counts;
    }

    private drawGhost(): void {
        const me = this.conn.me;

        this.ghost.clear();

        if (!me) return;

        this.ghost.lineStyle(2, 0xd9463d, 1);
        this.ghost.strokeRect(me.x * TILE_PX - 12, me.y * TILE_PX - 12, 24, 24);
    }
}
