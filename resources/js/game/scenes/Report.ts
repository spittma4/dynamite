import { type Copy, type LevelConfig, type ReportPayload, fill } from '@shared';
import Phaser from 'phaser';

import type { Connection } from '../net/connection';
import {
    hazardLines,
    levelTitle,
    pnlLines,
    sparklineBuckets,
    stationName,
} from '../report/format';

/**
 * The report card (contracts §10.7, docs/10). It is a certificate and an
 * autopsy printed on the same sheet: the left column congratulates the crew on
 * how busy they were while the right column adds up what that cost. Every
 * figure is read from the payload — the client decides no grade, no verdict and
 * no number of its own.
 */

export interface ReportSceneData {
    payload: ReportPayload;
    factoryUrl: string;
}

const PAPER = 0xf3ead7;
const INK = 0x2b2b2b;
/** Utilization is never green (docs/10): the bars are as neutral as the label is not. */
const GREY = 0x8a8a8a;
const GOLD = 0xc9a227;
const RED = 0xb3261e;

const SERIF = 'Georgia, serif';
const MONO = '"Courier New", monospace';

const MARGIN = 20;
const PADDING = 18;
const HEADER_HEIGHT = 120;
const COLUMN_GAP = 28;
const ROW = 17;
const PNL_ROW = 16;
const STATION_ROW = 19;
const LABEL_WIDTH = 130;
const BAR_WIDTH = 240;
const BAR_HEIGHT = 11;
const NOTE_GAP = 52;
const SPARK_WIDTH = 300;
const SPARK_HEIGHT = 40;
const BUTTON_HEIGHT = 34;

function css(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
}

export class ReportScene extends Phaser.Scene {
    private payload: ReportPayload | null = null;
    private factoryUrl = '';
    private connection: Connection | null = null;
    private ink: Phaser.GameObjects.Graphics | null = null;

    constructor() {
        super('Report');
    }

    init(data: ReportSceneData): void {
        this.payload = data.payload;
        this.factoryUrl = data.factoryUrl;
    }

    create(): void {
        const payload = this.payload;

        if (!payload) throw new Error('Report: started without a payload');

        this.connection = this.registry.get('conn') as Connection;

        const { level, copy } = this.connection.config;
        const width = this.scale.width;
        const height = this.scale.height;
        const left = MARGIN + PADDING;
        const right = width - MARGIN - PADDING;

        this.ink = this.add.graphics();
        this.sheet(width, height);
        this.header(payload, copy, level, left, right);

        const columnWidth = (right - left - COLUMN_GAP) / 2;
        const columnTop = MARGIN + HEADER_HEIGHT + 14;
        const individualBottom = this.individualColumn(payload, copy, level, left, columnTop);
        const factoryBottom = this.factoryColumn(
            payload,
            copy,
            left + columnWidth + COLUMN_GAP,
            columnTop,
        );

        let y = Math.max(individualBottom, factoryBottom) + 10;

        this.rule(left, right, y - 6);
        y = this.stationBlock(payload, copy, level, left, y + 4);
        y = this.sparkline(payload, left, y + 2);

        for (const line of hazardLines(payload)) {
            this.line(left, y, line, MONO, 11, INK);
            y += 15;
        }

        this.footer(payload, copy, left, right, height);
    }

    private sheet(width: number, height: number): void {
        const g = this.graphics();

        g.fillStyle(PAPER, 1);
        g.fillRect(MARGIN, MARGIN, width - 2 * MARGIN, height - 2 * MARGIN);
        g.lineStyle(2, INK, 1);
        g.strokeRect(MARGIN, MARGIN, width - 2 * MARGIN, height - 2 * MARGIN);
    }

    /**
     * The grade is the biggest thing on the sheet, and on an exploded day it is
     * red and delivered by the fire marshal — the one caption that outranks
     * every number under it.
     */
    private header(
        payload: ReportPayload,
        copy: Copy,
        level: LevelConfig,
        left: number,
        right: number,
    ): void {
        const exploded = payload.verdict === 'EXPLODED';
        const title = `DAY ${payload.day} · ${levelTitle(level)}`;

        this.line(left, MARGIN + PADDING, title, SERIF, 18, INK, 'bold');
        this.add
            .text(right - 80, MARGIN + PADDING + 30, 'REPORT CARD:', {
                fontFamily: MONO,
                fontSize: '13px',
                color: css(GREY),
            })
            .setOrigin(1, 0);
        this.add
            .text(right, MARGIN + 2, payload.grade, {
                fontFamily: SERIF,
                fontSize: '96px',
                fontStyle: 'bold',
                color: css(exploded ? RED : INK),
            })
            .setOrigin(1, 0);

        if (exploded) {
            this.add
                .text(left, MARGIN + PADDING + 42, copy.report.fireMarshal, {
                    fontFamily: SERIF,
                    fontSize: '17px',
                    fontStyle: 'bold',
                    color: css(RED),
                })
                .setAngle(-12);
        }

        this.rule(left, right, MARGIN + HEADER_HEIGHT);
    }

    /** The certificate: gold stars for how busy everyone was, and nothing else. */
    private individualColumn(
        payload: ReportPayload,
        copy: Copy,
        level: LevelConfig,
        x: number,
        top: number,
    ): number {
        let y = top;

        this.line(x, y, copy.report.individualHeading, SERIF, 15, INK, 'bold');
        y += 21;
        this.line(x, y, copy.report.certificate, SERIF, 11, GOLD, 'bold');
        y += 20;

        for (const player of payload.players) {
            const excellent = player.label === 'EXCELLENT';

            this.line(x, y, player.name, SERIF, 13, INK);
            this.add
                .text(x + 130, y, `${Math.round(player.utilization * 100)}%`, {
                    fontFamily: SERIF,
                    fontSize: '13px',
                    color: css(GREY),
                })
                .setOrigin(1, 0);
            this.line(
                x + 146,
                y,
                excellent ? `${player.label} ★` : player.label,
                SERIF,
                13,
                excellent ? GOLD : GREY,
                excellent ? 'bold' : undefined,
            );
            y += ROW;
        }

        const best = payload.players[0];

        if (best) {
            y += 8;
            this.line(
                x,
                y,
                fill(copy.report.topPerformer, {
                    name: best.name,
                    station: stationName(best.topStation, level),
                }),
                SERIF,
                12,
                INK,
                'italic',
            );
            y += 18;
        }

        return y;
    }

    /** The column that disagrees with the other one, ending in coin. */
    private factoryColumn(payload: ReportPayload, copy: Copy, x: number, top: number): number {
        let y = top;

        this.line(x, y, copy.report.factoryHeading, MONO, 15, INK, 'bold');
        y += 21;

        for (const text of pnlLines(payload, copy)) {
            // The loss is a stamp, not a row: `pnlLines` decided there was one.
            if (text === copy.report.loss) {
                this.add
                    .text(x + 60, y + 6, text, {
                        fontFamily: SERIF,
                        fontSize: '20px',
                        fontStyle: 'bold',
                        color: css(RED),
                    })
                    .setAngle(-12);
                y += 24;
                continue;
            }

            this.line(x, y, text, MONO, 13, INK);
            y += PNL_ROW;
        }

        return y;
    }

    /**
     * Grey bars, the bottleneck explaining itself in one clause, and the number
     * M1 is actually about: kegs made against kegs used.
     */
    private stationBlock(
        payload: ReportPayload,
        copy: Copy,
        level: LevelConfig,
        left: number,
        top: number,
    ): number {
        const g = this.graphics();
        const barX = left + LABEL_WIDTH;
        const noteX = barX + BAR_WIDTH + NOTE_GAP;
        let y = top;

        this.line(left, y, 'STATION UTILIZATION', MONO, 12, INK, 'bold');
        this.line(
            noteX,
            y,
            `BOTTLENECK: ${stationName(payload.bottleneck.stationId, level)}`,
            MONO,
            12,
            INK,
            'bold',
        );
        y += 20;

        for (const station of payload.stations) {
            const config = level.stations.find((s) => s.id === station.id);

            this.line(left, y, stationName(station.id, level), MONO, 12, INK);
            g.lineStyle(1, GREY, 0.7);
            g.strokeRect(barX, y + 1, BAR_WIDTH, BAR_HEIGHT);
            g.fillStyle(GREY, 1);
            g.fillRect(barX, y + 1, Math.max(1, station.utilization * BAR_WIDTH), BAR_HEIGHT);
            this.line(
                barX + BAR_WIDTH + 8,
                y,
                `${Math.round(station.utilization * 100)}%`,
                MONO,
                12,
                GREY,
            );

            let noteEnd = noteX;

            if (config?.type === 'boom_powder') {
                const kegs = this.line(
                    noteX,
                    y,
                    `← ${payload.kegsMade} kegs made, ${payload.kegsUsed} used`,
                    MONO,
                    13,
                    INK,
                    'bold',
                );

                noteEnd = kegs.x + kegs.width + 10;
            }

            if (station.id === payload.bottleneck.stationId) {
                const { starvedSeconds, blockedSeconds } = payload.bottleneck;

                this.line(
                    noteEnd,
                    y,
                    `← starved ${starvedSeconds} s, blocked ${blockedSeconds} s`,
                    MONO,
                    12,
                    INK,
                );
            }

            y += STATION_ROW;
        }

        y += 4;
        this.line(
            left,
            y,
            fill(copy.report.materials, {
                purchased: payload.materials.purchased,
                shipped: payload.materials.shipped,
            }),
            MONO,
            13,
            INK,
            'bold',
        );

        return y + 22;
    }

    /** WIP over the shift, one pixel column per bucket, peaks kept. */
    private sparkline(payload: ReportPayload, left: number, top: number): number {
        const g = this.graphics();
        const boxX = left + LABEL_WIDTH;
        const points = sparklineBuckets(payload.wipTimeline, SPARK_WIDTH);
        const peak = Math.max(payload.peakWip, 1);
        const floor = top + SPARK_HEIGHT - 1;

        this.line(left, top + 14, 'WIP OVER TIME', MONO, 11, GREY);
        g.lineStyle(1, GREY, 0.7);
        g.strokeRect(boxX, top, SPARK_WIDTH, SPARK_HEIGHT);
        g.lineStyle(1, INK, 1);

        if (points.length < 2) {
            g.lineBetween(boxX, floor, boxX + SPARK_WIDTH, floor);

            return top + SPARK_HEIGHT + 12;
        }

        g.beginPath();

        points.forEach((value, index) => {
            const x = boxX + (index * (SPARK_WIDTH - 1)) / (points.length - 1);
            const y = floor - (value / peak) * (SPARK_HEIGHT - 3);

            if (index === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        });

        g.strokePath();

        return top + SPARK_HEIGHT + 12;
    }

    /**
     * The room never unlocks, so the next day is a fresh room: NEXT DAY leaves
     * this one and reloads into whatever day Laravel advanced to. Everyone gets
     * the button — there is no host to wait for once the shift is over.
     */
    private footer(
        payload: ReportPayload,
        copy: Copy,
        left: number,
        right: number,
        height: number,
    ): void {
        const y = height - MARGIN - PADDING - BUTTON_HEIGHT;

        if (payload.grade === 'D' || payload.grade === 'F') {
            this.line(left, y + 10, copy.report.repeatDay, SERIF, 13, RED, 'bold');
        }

        this.button(right - 320, y, 150, 'NEXT DAY', INK, PAPER, () => this.nextDay());
        this.button(right - 160, y, 160, 'BACK TO FACTORY', PAPER, INK, () => this.backToFactory());
        this.input.keyboard?.on('keydown-ENTER', () => this.nextDay());
    }

    private button(
        x: number,
        y: number,
        width: number,
        label: string,
        fillColour: number,
        textColour: number,
        onClick: () => void,
    ): void {
        this.add
            .rectangle(x + width / 2, y + BUTTON_HEIGHT / 2, width, BUTTON_HEIGHT, fillColour)
            .setStrokeStyle(2, INK)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', onClick);
        this.add
            .text(x + width / 2, y + BUTTON_HEIGHT / 2, label, {
                fontFamily: MONO,
                fontSize: '13px',
                fontStyle: 'bold',
                color: css(textColour),
            })
            .setOrigin(0.5);
    }

    private nextDay(): void {
        this.leaveRoom();
        window.location.reload();
    }

    private backToFactory(): void {
        this.leaveRoom();
        window.location.assign(this.factoryUrl);
    }

    /**
     * The seat is given up before the page goes, so the room disposes with the
     * last client instead of holding an empty chair for the grace window.
     */
    private leaveRoom(): void {
        this.connection?.room.leave().catch(() => undefined);
    }

    private line(
        x: number,
        y: number,
        text: string,
        family: string,
        size: number,
        colour: number,
        style?: string,
    ): Phaser.GameObjects.Text {
        return this.add.text(x, y, text, {
            fontFamily: family,
            fontSize: `${size}px`,
            color: css(colour),
            ...(style ? { fontStyle: style } : {}),
        });
    }

    private rule(left: number, right: number, y: number): void {
        const g = this.graphics();

        g.lineStyle(1, GREY, 0.8);
        g.lineBetween(left, y, right, y);
    }

    private graphics(): Phaser.GameObjects.Graphics {
        if (!this.ink) throw new Error('Report: create() has not run yet');

        return this.ink;
    }
}
