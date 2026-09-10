import { type LayoutConfig, TILE_PX, makeWallLookup, packTile, unpackTile } from '@shared';
import type Phaser from 'phaser';

import { gameAudio } from '../audio/Audio';
import type { CueName } from '../audio/cues';
import { Metronome } from '../audio/tracks';
import { stripeSegments } from '../render/Stations';
import type { Factory } from '../scenes/Factory';

/**
 * The warning before the warning (F10 §7). The server decides a station's ring
 * is holding half an explosion and writes `StationState.beacon = 'red'`; this
 * draws the lamp pulsing on its pole and paints hazard stripes around every
 * pile on the floor, so the thing being warned about is the thing you can see.
 *
 * The pole's base colour is F04's `Floor.ts`; only the pulse is drawn here.
 * The stripes are repainted when the pile changes shape, not every frame.
 */

export const BEACON_PULSE_HZ = 1.5;
/**
 * The alarm's beat (F18). The lamp is brightest a quarter-cycle into its
 * breath, so the sound lands on the frame the glow is widest and the two read
 * as one event rather than as two warnings out of step.
 */
export const BEACON_PERIOD = 1 / BEACON_PULSE_HZ;
export const BEACON_PEAK_AT = BEACON_PERIOD / 4;
export const BEACON_GLOW_PX = 16;
export const STRIPE_WIDTH = 2;
export const STRIPE_PITCH = 7;
export const STRIPE_INSET = 2;
export const STRIPE_ALPHA = 0.8;

export const DANGER_COLOURS = { glow: 0xd9463d, stripe: 0xf2d33b } as const;

export interface BeaconRow {
    beacon: string;
}

export interface BeaconSource {
    forEach(fn: (station: BeaconRow) => void): void;
}

export interface FuelItemRow {
    type: string;
    x: number;
    y: number;
    holder: string;
    inFlight: boolean;
}

export interface FuelItemSource {
    forEach(fn: (item: FuelItemRow) => void): void;
}

export function anyRedBeacon(stations: BeaconSource): boolean {
    let red = false;

    stations.forEach((station) => {
        if (station.beacon === 'red') red = true;
    });

    return red;
}

/**
 * What a pole crossing into a new colour is worth hearing (F18). Only gold
 * gets a cue: red is not a moment, it is a state, and it says so on its own
 * beat for as long as it lasts.
 */
export function beaconCue(before: string, after: string): CueName | null {
    return after === 'gold' && before !== 'gold' ? 'warn' : null;
}

/**
 * How many pulses the red alarm gets on the crossing into red (F18).
 *
 * `dangerBeacon` returns 'red' off a fuel *level*, not an event, and level-02 is
 * designed so the pile grows — so an alarm that ran for as long as a pole
 * was red ran for minutes. It buried `hiss`, the six-second countdown it is
 * guaranteed to co-occur with, and its 1.5 Hz grid corrupted the 2.5 Hz beat the
 * jig operator is trying to feel, which is the faculty F18 exists to give them.
 * The pulsing lamp and the hazard stripes are already drawn and carry the
 * standing state on their own, indefinitely and for free.
 */
export const ALARM_BURST = 3;

/** The burst, as a count: re-armed on the crossing, spent down, reset by quiet. */
export function alarmPulsesLeft(wasRed: boolean, red: boolean, left: number): number {
    if (!red) return 0;

    return wasRed ? left : ALARM_BURST;
}

function wave(serverNow: number): number {
    return 0.5 + 0.5 * Math.sin(serverNow * 2 * Math.PI * BEACON_PULSE_HZ);
}

/** A breath rather than a blink: F04's pole already blinks at 2 Hz. */
export function pulseAlpha(serverNow: number): number {
    return 0.15 + 0.35 * wave(serverNow);
}

export function pulseRadius(serverNow: number): number {
    return BEACON_GLOW_PX * (0.6 + 0.4 * wave(serverNow));
}

/**
 * The pile, as the client can see it: floor kegs and spills. Shelf kegs are
 * fuel for a blast too (F10 §1), but the client has no station config to place
 * them with, and a shelf is not what the stripes are warning anybody off.
 */
export function floorFuelTiles(
    items: FuelItemSource,
    spillTiles: readonly number[],
    width: number,
): number[] {
    const tiles = new Set<number>();

    items.forEach((item) => {
        if (item.type !== 'keg' || item.holder !== '' || item.inFlight || item.x < 0) return;

        tiles.add(packTile(Math.floor(item.x), Math.floor(item.y), width));
    });

    for (const packed of spillTiles) tiles.add(packed);

    return [...tiles].sort((a, b) => a - b);
}

/**
 * The floor around the pile. The fuel tiles themselves are left clear — the
 * kegs and the spill are already drawn there, and painting over them would hide
 * the thing the stripes are about.
 */
export function hazardStripeTiles(
    fuel: readonly number[],
    width: number,
    isSolid: (tx: number, ty: number) => boolean,
): number[] {
    const pile = new Set(fuel);
    const stripes = new Set<number>();

    for (const packed of fuel) {
        const [x, y] = unpackTile(packed, width);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;

                const tx = x + dx;
                const ty = y + dy;

                if (isSolid(tx, ty)) continue;

                const neighbour = packTile(tx, ty, width);

                if (pile.has(neighbour)) continue;

                stripes.add(neighbour);
            }
        }
    }

    return [...stripes].sort((a, b) => a - b);
}

export class DangerBeaconView {
    private readonly stripes: Phaser.GameObjects.Graphics;
    private readonly lamps: Phaser.GameObjects.Graphics;
    /** One pulse of the alarm per breath of the lamp, booked ahead of it (F18). */
    private readonly alarm = new Metronome('alarm');
    private wasRed = false;
    private alarmsLeft = 0;
    private poles: { id: string; x: number; y: number; was: string }[] = [];
    private isSolid: (tx: number, ty: number) => boolean = () => true;
    private builtFrom: LayoutConfig | null = null;
    private stripeKey = '';
    private lit = false;

    constructor(
        private readonly scene: Factory,
        layer: Phaser.GameObjects.Container,
    ) {
        this.stripes = scene.add.graphics();
        this.lamps = scene.add.graphics();
        layer.add(this.stripes);
        layer.add(this.lamps);
    }

    update(serverNow: number): void {
        const layout = this.scene.layout;
        const state = this.scene.conn.state;

        if (this.builtFrom !== layout) this.rebuild(layout);

        const red = this.paintLamps(serverNow);

        if (!red) {
            if (this.stripeKey !== '') {
                this.stripes.clear();
                this.stripeKey = '';
            }

            return;
        }

        const fuel = floorFuelTiles(state.items, state.spillTiles, layout.width);
        const key = fuel.join();

        if (key === this.stripeKey) return;

        this.stripeKey = key;
        this.stripes.clear();
        this.stripes.lineStyle(STRIPE_WIDTH, DANGER_COLOURS.stripe, STRIPE_ALPHA);

        for (const packed of hazardStripeTiles(fuel, layout.width, this.isSolid)) {
            const tile = unpackTile(packed, layout.width);

            for (const line of stripeSegments(tile, STRIPE_PITCH, STRIPE_INSET)) {
                this.stripes.lineBetween(line.x1, line.y1, line.x2, line.y2);
            }
        }
    }

    destroy(): void {
        this.stripes.destroy();
        this.lamps.destroy();
    }

    /** Returns whether any pole is red, which is also the stripes' switch. */
    private paintLamps(serverNow: number): boolean {
        const stations = this.scene.conn.state.stations;
        const alpha = pulseAlpha(serverNow);
        const radius = pulseRadius(serverNow);
        let red = false;

        for (const pole of this.poles) {
            const colour = stations.get(pole.id)?.beacon ?? 'off';
            const crossing = beaconCue(pole.was, colour);

            pole.was = colour;

            if (crossing !== null) gameAudio.play(crossing);

            if (colour !== 'red') continue;

            if (!red) {
                this.lamps.clear();
                red = true;
            }

            this.lamps.fillStyle(DANGER_COLOURS.glow, alpha);
            this.lamps.fillCircle(pole.x, pole.y, radius);
        }

        if (!red && this.lit) this.lamps.clear();

        this.lit = red;

        // The alarm rides the lamp's own grid rather than the moment the pole
        // went red, so a player arriving mid-emergency hears it in step with
        // the glow they can already see — and it stops after `ALARM_BURST`,
        // because a level is news once and then it is the room's noise floor.
        this.alarmsLeft = alarmPulsesLeft(this.wasRed, red, this.alarmsLeft);
        this.wasRed = red;

        if (!red) {
            this.alarm.reset();
        } else if (
            this.alarmsLeft > 0 &&
            this.alarm.book(BEACON_PEAK_AT, BEACON_PERIOD, serverNow, gameAudio)
        ) {
            this.alarmsLeft -= 1;
        }

        return red;
    }

    private rebuild(layout: LayoutConfig): void {
        this.builtFrom = layout;
        this.isSolid = makeWallLookup(layout);
        this.poles = Object.entries(layout.beaconPoles).map(([id, tile]) => ({
            id,
            x: (tile[0] + 0.5) * TILE_PX,
            y: (tile[1] + 0.5) * TILE_PX,
            was: this.scene.conn.state.stations.get(id)?.beacon ?? 'off',
        }));
        this.stripeKey = '';
    }
}
