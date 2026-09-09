import type { FactoryState, MgOp, PlayerState, StationState, StationType } from '@shared';
import type { Room } from '@colyseus/sdk';
import type Phaser from 'phaser';

import type { ServerClock } from '../net/ServerClock';
import type { Factory } from '../scenes/Factory';

/**
 * The seam between the client core and a mini-game (contracts §10.9). An
 * overlay draws inside the panel it is handed and sends ops; it never mutates
 * state and never decides an outcome — the server judges every press.
 */

export type OverlayKey = 'left' | 'right' | 'up' | 'down' | 'space' | 'interact' | 'esc';

export interface OverlayContext {
    scene: Factory;
    room: Room<FactoryState>;
    sessionId: string;
    state: FactoryState;
    /** The panel. Draw inside `(0, 0)`–`(width, height)`; the host owns its position. */
    container: Phaser.GameObjects.Container;
    width: number;
    height: number;
    stationId: string;
    stationType: StationType;
    clock: ServerClock;
    serverClock(): number;
    anchorPx(): { x: number; y: number };
    send(op: MgOp, v?: number | string): void;
    sendInteract(): void;
    sendAction(): void;
}

export interface MinigameOverlay {
    /** `true` routes the arrows to `onKey`; the dock leaves them walking. */
    capturesMovement: boolean;
    mount(ctx: OverlayContext): void;
    update(station: StationState, me: PlayerState, serverNow: number): void;
    /** `true` consumes the key; `false` lets the floor behaviour fire. */
    onKey(key: OverlayKey, down: boolean, repeat: boolean): boolean;
    unmount(): void;
}

export type OverlayFactory = () => MinigameOverlay;

/** One per station of the type, on every client — not just the players working it. */
export interface StationView {
    create(scene: Factory, station: StationState, layer: Phaser.GameObjects.Container): void;
    update(station: StationState, serverNow: number): void;
    destroy(): void;
}
