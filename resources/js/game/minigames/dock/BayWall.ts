import {
    TILE_PX,
    type DockMg,
    type ItemState,
    type LayoutConfig,
    type Tile,
    beepPhase,
    tileOf,
} from '@shared';
import type Phaser from 'phaser';

import { gameAudio } from '../../audio/Audio';
import { Metronome } from '../../audio/tracks';
import { truckIn, truckLeaves } from '../../nouns';
import type { Factory } from '../../scenes/Factory';

/**
 * The dock wall as read from across the floor (F09 §Client): how long the truck
 * has left, the reversing light strobing on every beep, the SLAM IT prompt when
 * the last slot fills, and how big the Returns pile has grown.
 *
 * The strobe is timed on this client from `mg.beepAt` rather than followed off
 * `TruckState.beepPhase`, so it stays steady through patch jitter — the beep the
 * player shoves against is a fixed cadence, not a value that arrives late.
 */

/** How long the bay light stays lit after each beep. */
export const STROBE_FLASH_MS = 120;

/** The SLAM IT prompt blinks fast enough to read as urgent, not as a fault. */
export const SLAM_FLASH_HZ = 4;

/**
 * When a docked truck stops being a clock and starts being a deadline (F18).
 * Until this, every second of the dwell looked and sounded the same: the wall
 * changed only its digits and the beep was identical at t-18 and t-2, so the
 * one player the deadline is really about — whoever is halfway down the
 * floor with a stick — got nothing in either channel.
 */
export const LEAVING_WARN_SECONDS = 5;

/**
 * Half the slam rate, and deliberately not the same constant. `SLAM IT` is one
 * word you read once, so it can strobe; the countdown is a number that changes
 * every second and has to stay readable while it is doing the shouting.
 */
export const GOING_FLASH_HZ = SLAM_FLASH_HZ / 2;

export const BAY_COLOURS = {
    lampOff: 0x3a2f22,
    lampOn: 0xf2921d,
    countdown: '#ffffff',
    going: '#f2921d',
    slam: '#f5c542',
    returns: '#bbbbbb',
} as const;

export type ReturnsItem = Pick<ItemState, 'holder' | 'x' | 'y' | 'inFlight'>;

export interface BayLabel {
    text: string;
    kind: 'countdown' | 'going' | 'next' | 'slam';
}

/** Whether a docked truck is inside its last few seconds. */
export function leavingSoon(mg: DockMg, serverNow: number): boolean {
    if (mg.truck.phase !== 'docked') return false;

    return mg.truck.leavesAt - serverNow <= LEAVING_WARN_SECONDS;
}

/**
 * What the wall says. The slam prompt outranks the clock: while the window is
 * open the only number that matters is how fast someone can hold `E`.
 *
 * The docked clock names the truck and what it is about to do, because from ten
 * tiles away a bare `0:12` floating over a doorway is a number with no subject —
 * the one thing a player halfway down the line needs is whether it is worth
 * running the stick over.
 */
export function bayLabel(mg: DockMg, serverNow: number): BayLabel {
    if (mg.tailgateUntil > serverNow) return { text: 'SLAM IT', kind: 'slam' };

    if (mg.truck.phase === 'docked') {
        return {
            text: truckLeaves(mg.truck.leavesAt - serverNow),
            kind: leavingSoon(mg, serverNow) ? 'going' : 'countdown',
        };
    }

    return { text: truckIn(mg.truck.arrivesAt - serverNow), kind: 'next' };
}

/** The bay light is lit for `flashMs` after each beep, and dark before the first. */
export function strobeOn(
    beepAt: number,
    periodMs: number,
    serverNow: number,
    flashMs: number,
): boolean {
    if (periodMs <= 0 || serverNow < beepAt) return false;

    return beepPhase(beepAt, periodMs, serverNow) * periodMs < flashMs;
}

export function flashOn(serverNow: number, hz: number): boolean {
    return Math.floor(serverNow * hz) % 2 === 0;
}

/**
 * The pile, not the tile: `items.placeNear` spreads a returned stick around the
 * Returns tile when the tile itself is taken, so the label counts the floor
 * items within one tile of it.
 */
export function returnsCount(items: Iterable<ReturnsItem>, tile: Tile): number {
    let count = 0;

    for (const item of items) {
        if (item.holder !== '' || item.inFlight) continue;

        const [x, y] = tileOf(item.x, item.y);

        if (Math.abs(x - tile[0]) <= 1 && Math.abs(y - tile[1]) <= 1) count += 1;
    }

    return count;
}

export class BayWall {
    private readonly container: Phaser.GameObjects.Container;
    private readonly lamps: Phaser.GameObjects.Graphics;
    private readonly countdown: Phaser.GameObjects.Text;
    private readonly returns: Phaser.GameObjects.Text;
    private readonly door: { x: number; y: number; w: number };

    /** The last five seconds, once a second, off the departure's own grid (F18). */
    private readonly going = new Metronome('leaving');

    private lit = false;
    private label = '';
    private pile = '';

    constructor(scene: Factory, layer: Phaser.GameObjects.Container, layout: LayoutConfig) {
        const [dx, dy, dw] = layout.dockDoor;

        this.door = { x: dx * TILE_PX, y: dy * TILE_PX, w: dw * TILE_PX };
        this.lamps = scene.add.graphics();
        this.countdown = label(scene, 16);
        this.countdown.setPosition(this.door.x + this.door.w / 2, this.door.y - 4);
        this.returns = label(scene, 10);
        this.returns.setColor(BAY_COLOURS.returns);
        this.returns.setPosition(
            (layout.props.returnsPile[0] + 0.5) * TILE_PX,
            layout.props.returnsPile[1] * TILE_PX - 2,
        );

        this.container = scene.add.container(0, 0, [this.lamps, this.countdown, this.returns]);
        layer.add(this.container);
        this.paintLamps(false);
    }

    update(mg: DockMg | null, items: readonly ReturnsItem[], serverNow: number): void {
        if (!mg) {
            this.countdown.setVisible(false);
            this.returns.setVisible(false);
            this.setLamps(false);
            this.going.reset();

            return;
        }

        const bay = bayLabel(mg, serverNow);
        const visible =
            bay.kind === 'slam'
                ? flashOn(serverNow, SLAM_FLASH_HZ)
                : bay.kind !== 'going' || flashOn(serverNow, GOING_FLASH_HZ);
        const text = `${bay.kind}|${bay.text}`;

        this.countdown.setVisible(visible);

        if (text !== this.label) {
            this.label = text;
            this.countdown.setText(bay.text);
            this.countdown.setColor(colourFor(bay.kind));
        }

        this.setLamps(
            mg.truck.phase === 'docked' &&
                strobeOn(mg.beepAt, mg.beepPeriodMs, serverNow, STROBE_FLASH_MS),
        );

        // One descending pair a second through the last five, on the grid the
        // departure itself sits on. It falls where the shove beep rises, so
        // "the truck is going" is audibly the opposite of "shove now".
        if (leavingSoon(mg, serverNow)) {
            this.going.book(mg.truck.leavesAt - LEAVING_WARN_SECONDS, 1, serverNow, gameAudio);
        } else {
            this.going.reset();
        }

        const pile = returnsCount(items, mg.returnsTile);
        const next = pile === 0 ? '' : `RETURNS ${pile}`;

        this.returns.setVisible(next !== '');

        if (next !== this.pile) {
            this.pile = next;
            this.returns.setText(next);
        }
    }

    destroy(): void {
        this.container.destroy();
    }

    private setLamps(on: boolean): void {
        if (on === this.lit) return;

        this.lit = on;
        this.paintLamps(on);
    }

    /** One lamp either side of the door, so the strobe reads from any angle. */
    private paintLamps(on: boolean): void {
        const g = this.lamps;
        const colour = on ? BAY_COLOURS.lampOn : BAY_COLOURS.lampOff;
        const y = this.door.y + 6;

        g.clear();
        g.fillStyle(colour, 1);
        g.fillRect(this.door.x - 10, y, 8, 14);
        g.fillRect(this.door.x + this.door.w + 2, y, 8, 14);
    }
}

function colourFor(kind: BayLabel['kind']): string {
    if (kind === 'slam') return BAY_COLOURS.slam;

    return kind === 'going' ? BAY_COLOURS.going : BAY_COLOURS.countdown;
}

function label(scene: Factory, size: number): Phaser.GameObjects.Text {
    const text = scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color: BAY_COLOURS.countdown,
        fontStyle: 'bold',
    });

    text.setOrigin(0.5, 1);
    text.setStroke('#000000', 3);
    text.setVisible(false);

    return text;
}
