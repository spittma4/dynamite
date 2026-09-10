import {
    type Facing,
    type FactoryState,
    LEVEL_DEFAULTS,
    type LayoutConfig,
    type LevelConfig,
    type MoveInput,
    type PlayerState,
    type StationState,
    type StationType,
    TILE_PX,
    makeWallLookup,
} from '@shared';
import type { Callbacks } from '@colyseus/sdk';
import Phaser from 'phaser';

import { HUD_HEIGHT } from '../constants';
import { Fx } from '../fx/Fx';
import { createHazardsLayer } from '../hazards/HazardsLayer';
import { stationViews } from '../minigames';
import type { StationView } from '../minigames/types';
import type { ServerClock } from '../net/ServerClock';
import { OwnPrediction } from '../predict/reconcile';
import { AvatarsLayer } from '../render/Avatars';
import { FloorView } from '../render/Floor';
import { createItemsLayer } from '../render/Items';
import { createStationsLayer } from '../render/Stations';

/**
 * The factory floor (contracts §10.9). The whole map is on screen at once and
 * the camera never moves — every "camera" decision in the design is really the
 * canvas fitting the mount div — so a tile is always at the same place and an
 * overlay can point at a station without a scroll offset.
 */

export { HUD_HEIGHT };

/** Draw order, bottom to top. F05, F06 and F10 fill the layers they own. */
export interface FactoryLayers {
    floor: Phaser.GameObjects.Container;
    stations: Phaser.GameObjects.Container;
    items: Phaser.GameObjects.Container;
    avatars: Phaser.GameObjects.Container;
    fx: Phaser.GameObjects.Container;
    overlay: Phaser.GameObjects.Container;
}

/**
 * What the scene reads from `net/connection.ts`'s `Connection`. It is declared
 * here so the scene compiles ahead of that module; `Connection` satisfies it
 * structurally and replaces it as the annotation once it lands.
 */
export interface FactoryConn {
    readonly sessionId: string;
    readonly state: FactoryState;
    readonly clock: ServerClock;
    readonly config: { level: LevelConfig; layout: LayoutConfig };
    readonly callbacks: ReturnType<typeof Callbacks.get<FactoryState>>;
}

/** The station-type registry F07–F09 fill; `minigames/index.ts` owns the values. */
export type StationViewRegistry = Partial<Record<StationType, () => StationView>>;

/**
 * The per-viewer station views (contracts §10.9): one per entry of
 * `state.stations` whose type has registered a factory, on every client rather
 * than only the players working it. The scene drives it from the schema
 * callbacks, so a station that arrives mid-shift gets its view with no reload.
 */
export class StationViewHost {
    private readonly views = new Map<string, { view: StationView; station: StationState }>();

    constructor(
        private readonly scene: Factory,
        private readonly layer: Phaser.GameObjects.Container,
        private readonly registry: StationViewRegistry,
    ) {}

    add(station: StationState): void {
        const make = this.registry[station.type as StationType];

        if (!make || this.views.has(station.id)) return;

        const view = make();

        this.views.set(station.id, { view, station });
        view.create(this.scene, station, this.layer);
    }

    remove(stationId: string): void {
        const entry = this.views.get(stationId);

        if (!entry) return;

        entry.view.destroy();
        this.views.delete(stationId);
    }

    update(serverNow: number): void {
        for (const { view, station } of this.views.values()) view.update(station, serverNow);
    }

    destroy(): void {
        for (const { view } of this.views.values()) view.destroy();

        this.views.clear();
    }
}

export function tileToPx(t: number): number {
    return t * TILE_PX;
}

/** The schema carries `facing` as a plain number; the sim's union is 0–7. */
function asFacing(value: number): Facing {
    return Math.min(7, Math.max(0, Math.round(value))) as Facing;
}

export class Factory extends Phaser.Scene {
    /**
     * The intent the scene integrates, written by the key layer. It stays at
     * rest until then, which is also what a blurred window should look like.
     */
    intent: MoveInput = { dx: 0, dy: 0 };

    private connection: FactoryConn | null = null;
    private stage: Phaser.GameObjects.Container | null = null;
    private containers: FactoryLayers | null = null;
    private effects: Fx | null = null;
    private floorView: FloorView | null = null;
    private avatars: AvatarsLayer | null = null;
    private predictor: OwnPrediction | null = null;
    private stationViewHost: StationViewHost | null = null;
    private stationSubscriptions: (() => void)[] = [];

    private level: LevelConfig | null = null;
    private layoutConfig: LayoutConfig | null = null;
    private lastClock = -1;

    floorWidth = 0;
    floorHeight = 0;

    constructor() {
        super('Factory');
    }

    get conn(): FactoryConn {
        if (!this.connection) throw new Error('Factory: create() has not run yet');

        return this.connection;
    }

    get layers(): FactoryLayers {
        if (!this.containers) throw new Error('Factory: create() has not run yet');

        return this.containers;
    }

    get fx(): Fx {
        if (!this.effects) throw new Error('Factory: create() has not run yet');

        return this.effects;
    }

    /** The own-avatar predictor; the input sender records its seqs here. */
    get prediction(): OwnPrediction {
        if (!this.predictor) throw new Error('Factory: create() has not run yet');

        return this.predictor;
    }

    create(): void {
        this.connection = this.registry.get('conn') as FactoryConn;

        this.stage = this.add.container(0, HUD_HEIGHT);
        this.containers = {
            floor: this.add.container(0, 0),
            stations: this.add.container(0, 0),
            items: this.add.container(0, 0),
            avatars: this.add.container(0, 0),
            fx: this.add.container(0, 0),
            overlay: this.add.container(0, 0),
        };
        this.stage.add([
            this.containers.floor,
            this.containers.stations,
            this.containers.items,
            this.containers.avatars,
            this.containers.fx,
            this.containers.overlay,
        ]);

        this.effects = new Fx(this, this.containers.fx);
        this.floorView = new FloorView(this, this.containers.floor);
        this.avatars = new AvatarsLayer(this, this.containers.avatars);

        this.scale.scaleMode = Phaser.Scale.ScaleModes.FIT;
        this.scale.autoCenter = Phaser.Scale.Center.CENTER_BOTH;

        this.applyConfig(this.conn.config.level, this.conn.config.layout);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

        // The mount list (F04 §11): F05 `createStationsLayer(this)`, F06
        // `createItemsLayer(this)` and F10 `createHazardsLayer(this)` add one
        // line each here, in that order.
        createStationsLayer(this);
        createItemsLayer(this);
        createHazardsLayer(this);

        // …and last, one view per station of a type a mini-game has registered.
        const views = new StationViewHost(this, this.containers.stations, stationViews);

        this.stationViewHost = views;
        this.stationSubscriptions = [
            this.conn.callbacks.onAdd('stations', (station) => views.add(station)),
            this.conn.callbacks.onRemove('stations', (_station, id) => views.remove(id)),
        ];
    }

    /**
     * Every `config` reply, including the one after the lobby → running flip
     * that swaps in the scaled level. The server re-spawns everyone at `start`,
     * so re-seeding the prediction from the server position is the truth then
     * rather than a lost frame.
     */
    applyConfig(level: LevelConfig, layout: LayoutConfig): void {
        this.level = level;
        this.layoutConfig = layout;
        this.floorWidth = layout.width * TILE_PX;
        this.floorHeight = layout.height * TILE_PX;

        this.scale.resize(this.floorWidth, HUD_HEIGHT + this.floorHeight);
        this.floorView?.draw(layout);

        this.predictor = new OwnPrediction({
            isSolid: makeWallLookup(layout),
            radius: level.movement?.playerRadius ?? LEVEL_DEFAULTS.movement.playerRadius,
        });

        const me = this.me();

        if (me) this.predictor.reset(me.x, me.y, asFacing(me.facing), performance.now());

        this.lastClock = -1;
    }

    update(_time: number, delta: number): void {
        const conn = this.connection;
        const predictor = this.predictor;
        const avatars = this.avatars;

        if (!conn || !predictor || !avatars) return;

        const state = conn.state;
        const nowMs = performance.now();
        const serverNow = conn.clock.now(nowMs);
        const me = this.me();

        if (me) {
            // One patch per tick, so a changed clock is the arrival of a new
            // authoritative sample — the moment reconciliation is meant to run.
            if (state.clock !== this.lastClock) {
                this.lastClock = state.clock;
                predictor.reconcile({ x: me.x, y: me.y, seq: me.seq, speed: me.speed }, nowMs);
            }

            predictor.step(this.intent, delta / 1000, me.speed, nowMs);
        }

        avatars.update(state, conn.sessionId, me ? predictor.pose : null, serverNow, nowMs);
        this.floorView?.setTiles(state.spillTiles, state.scorchTiles);
        this.floorView?.setBeacons(state.stations, serverNow);
        this.floorView?.setOrderBoard(state.orders.values());
        this.stationViewHost?.update(serverNow);
    }

    /** Px inside the layers: predicted for the own avatar, interpolated for the rest. */
    avatarPosition(sessionId: string): { x: number; y: number } | null {
        return this.avatars?.positionOf(sessionId) ?? null;
    }

    /** The level as the scene last received it — scaled once the day starts. */
    get levelConfig(): LevelConfig {
        if (!this.level) throw new Error('Factory: create() has not run yet');

        return this.level;
    }

    get layout(): LayoutConfig {
        if (!this.layoutConfig) throw new Error('Factory: create() has not run yet');

        return this.layoutConfig;
    }

    private me(): PlayerState | undefined {
        return this.connection?.state.players.get(this.connection.sessionId);
    }

    private teardown(): void {
        for (const off of this.stationSubscriptions) off();

        this.stationSubscriptions = [];
        this.stationViewHost?.destroy();
        this.avatars?.destroy();
        this.floorView?.destroy();
        this.stationViewHost = null;
        this.avatars = null;
        this.floorView = null;
    }
}
