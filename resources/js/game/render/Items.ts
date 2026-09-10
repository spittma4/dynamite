import { TILE_PX, type Copy, type FactoryState, type ItemState } from '@shared';
import Phaser from 'phaser';

import { UI } from './palette';
import { type KegLook, kegLook } from './stationGlyphs';
import { gameAudio } from '../audio/Audio';
import type { CueName } from '../audio/cues';
import type { Factory, FactoryConn } from '../scenes/Factory';

/**
 * Everything the players carry, throw, drop and sweep (F06 §Client). The layer
 * reads `state.items` and `state.players` and decides nothing: a keg's quality,
 * an item's tile, an arc's progress and a chore's fill are all schema fields, so
 * what a player sees is what the server believes.
 *
 * Spill blobs, scorch tiles, beacon poles and the banner are F04's `Floor.ts`
 * and HUD; the jam lever glyph is F05's `stationGlyphs.ts` (contracts §10.4).
 */

const BODY_PX = 18;
const HELD_LIFT_PX = 20;
const DENT_PX = 5;
const GLOW_RADIUS = 13;
const PULSE_HZ = 1.2;
const SHADOW_ALPHA = 0.3;
const CHORE_BAR_W = 28;
const CHORE_BAR_H = 4;
const CHORE_BAR_Y = -30;
const BROOM_LEN = 22;

/** The lift of a thrown item at the top of its arc; cosmetic, client-only. */
export const ARC_LIFT_PX = 20;

export const ITEM_COLOURS: Record<string, number> = {
    casing: 0xc9c1a8,
    stick: 0xd93b2b,
    crate: 0x8b6b3e,
    parts: 0x9aa4b0,
    broom: 0xc8a951,
};

const UNKNOWN_COLOUR = 0x8a8a94;

export const KEG_COLOURS: Record<KegLook, number> = {
    dud: 0x6b6b73,
    damp: 0x8f6a3d,
    normal: 0xb5472f,
    prime: 0xf2921d,
};

export interface ItemLook {
    type: string;
    quality: number;
    prime: boolean;
    dents: number;
}

export interface ItemWhere {
    x: number;
    y: number;
    holder: string;
    inFlight: boolean;
}

export interface FlightPath {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

export interface ItemSkin {
    colour: number;
    glow: boolean;
    steam: boolean;
    squat: boolean;
    dents: number;
}

export interface FlightPose {
    x: number;
    y: number;
    lift: number;
}

export type ItemPlacement =
    | { kind: 'hidden' }
    | { kind: 'flight' }
    | { kind: 'tile'; x: number; y: number }
    | { kind: 'held'; sessionId: string };

/**
 * One item, as the local pair of hands is concerned with it (F18). Three states
 * is the whole vocabulary because only three transitions make a sound, and
 * `away` deliberately lumps the floor, a shelf and somebody else's hands
 * together: from here they are all "not mine".
 */
export type HandState = 'away' | 'flight' | 'mine';

export function handStateOf(placement: ItemPlacement, sessionId: string): HandState {
    if (placement.kind === 'flight') return 'flight';

    return placement.kind === 'held' && placement.sessionId === sessionId ? 'mine' : 'away';
}

/**
 * What a change of hands sounds like. A catch is kept apart from a pick-up
 * because they are different achievements — one is a throw that worked — and a
 * throw leaving your hands gets nothing: the arc is already the loudest thing
 * on screen.
 */
export function handCue(from: HandState, to: HandState): CueName | null {
    if (from === to) return null;

    if (to === 'mine') return from === 'flight' ? 'catch' : 'grab';

    return from === 'mine' && to === 'away' ? 'clink' : null;
}

export function itemSkin(look: ItemLook): ItemSkin {
    const keg = look.type === 'keg' ? kegLook(look.quality, look.prime) : null;
    const colour = keg ? KEG_COLOURS[keg] : (ITEM_COLOURS[look.type] ?? UNKNOWN_COLOUR);

    return {
        colour,
        glow: keg === 'prime',
        steam: keg === 'damp',
        squat: keg === 'dud',
        dents: Math.min(3, Math.max(0, Math.floor(look.dents))),
    };
}

/**
 * Where one item belongs this frame (contracts §3 Locations). Flight wins over
 * the tile because the server keeps `x`/`y` moving along the arc, and a holder
 * that is not a player is a station: shelved items are the station renderer's.
 */
export function placementOf(
    where: ItemWhere,
    isPlayer: (sessionId: string) => boolean,
): ItemPlacement {
    if (where.inFlight) return { kind: 'flight' };

    if (where.x >= 0) {
        return { kind: 'tile', x: (where.x + 0.5) * TILE_PX, y: (where.y + 0.5) * TILE_PX };
    }

    if (where.holder !== '' && isPlayer(where.holder)) {
        return { kind: 'held', sessionId: where.holder };
    }

    return { kind: 'hidden' };
}

/**
 * The flight runs on the local clock between patches so a 20 Hz throw looks
 * smooth, but never behind `flightT`: the server's value wins whenever it is
 * further along, which is what keeps a laggy client's catch honest.
 */
export function flightProgress(flightT: number, elapsedMs: number, flightSeconds: number): number {
    const local = flightSeconds > 0 ? elapsedMs / (flightSeconds * 1000) : 1;

    return Math.min(1, Math.max(0, Math.max(flightT, local)));
}

/**
 * The arc's ends are already absolute: the server writes the thrower's own
 * position and the landing tile's centre, so adding the half-tile offset here
 * would shift the whole flight and pop the item on landing.
 */
export function flightPose(path: FlightPath, t: number): FlightPose {
    return {
        x: (path.fromX + (path.toX - path.fromX) * t) * TILE_PX,
        y: (path.fromY + (path.toY - path.fromY) * t) * TILE_PX,
        lift: Math.sin(Math.PI * t) * ARC_LIFT_PX,
    };
}

export function choreFill(startedAt: number, until: number, now: number): number {
    const span = until - startedAt;

    if (span <= 0) return 1;

    return Math.min(1, Math.max(0, (now - startedAt) / span));
}

export function choreLabel(chores: Copy['chores'], chore: string): string {
    if (chore === 'unjam' || chore === 'sweep' || chore === 'stomp' || chore === 'repair') {
        return chores[chore];
    }

    return '';
}

/**
 * When a thing the server only tells us the *end* of began. A flight and a
 * chore both arrive already in progress, so the layer times them from the first
 * frame it saw them; a different token means a new one started.
 */
export class StartTimes {
    private readonly starts = new Map<string, { token: string; at: number }>();

    mark(key: string, token: string, now: number): number {
        const seen = this.starts.get(key);

        if (seen && seen.token === token) return seen.at;

        this.starts.set(key, { token, at: now });

        return now;
    }

    forget(key: string): void {
        this.starts.delete(key);
    }
}

/**
 * The scene declares its config as F04's `FactoryConn`, which types only what
 * the scene itself reads; the connection behind it always carries `copy` as
 * well (§10.9), and the chore bar is labelled from it.
 */
function choresOf(scene: Factory): Copy['chores'] {
    return (scene.conn.config as FactoryConn['config'] & { copy: Copy }).copy.chores;
}

/** One item: a body that lifts along an arc over a shadow that does not. */
class ItemSprite {
    private readonly container: Phaser.GameObjects.Container;
    private readonly shadow: Phaser.GameObjects.Graphics;
    private readonly aura: Phaser.GameObjects.Graphics;
    private readonly body: Phaser.GameObjects.Graphics;
    private layer: Phaser.GameObjects.Container;
    private painted = '';

    constructor(scene: Factory, layer: Phaser.GameObjects.Container) {
        this.shadow = scene.add.graphics();
        this.aura = scene.add.graphics();
        this.body = scene.add.graphics();
        this.container = scene.add.container(0, 0, [this.shadow, this.aura, this.body]);
        this.container.setVisible(false);
        this.layer = layer;
        layer.add(this.container);
    }

    /**
     * The same sprite draws an item on the floor and in a pair of hands, and
     * those belong to different layers: on the ground it goes under every
     * avatar, in hands it goes over them.
     */
    attach(layer: Phaser.GameObjects.Container): void {
        if (layer === this.layer) return;

        this.layer = layer;
        layer.add(this.container);
    }

    show(
        skin: ItemSkin,
        type: string,
        x: number,
        y: number,
        lift: number,
        shadow: boolean,
        nowMs: number,
    ): void {
        const key = `${type}|${skin.colour}|${skin.dents}|${skin.squat}|${skin.steam}|${skin.glow}`;

        if (key !== this.painted) {
            this.painted = key;
            this.paint(skin, type);
        }

        this.container.setVisible(true);
        this.container.setPosition(x, y);
        this.body.y = -lift;
        this.aura.y = -lift;
        this.shadow.setVisible(shadow);

        const alive = skin.glow || skin.steam;

        this.aura.setVisible(alive);

        if (alive) {
            this.aura.setAlpha(0.35 + 0.25 * Math.sin((nowMs / 1000) * 2 * Math.PI * PULSE_HZ));
        }
    }

    hide(): void {
        this.container.setVisible(false);
    }

    destroy(): void {
        this.container.destroy();
    }

    private paint(skin: ItemSkin, type: string): void {
        const half = BODY_PX / 2;

        this.shadow.clear();
        this.shadow.fillStyle(0x000000, SHADOW_ALPHA);
        this.shadow.fillEllipse(0, half - 2, BODY_PX - 2, half - 1);

        this.aura.clear();

        if (skin.glow) {
            this.aura.fillStyle(skin.colour, 1);
            this.aura.fillCircle(0, 0, GLOW_RADIUS);
        }

        if (skin.steam) {
            this.aura.fillStyle(0xffffff, 1);
            this.aura.fillCircle(-2, -half - 3, 4);
            this.aura.fillCircle(3, -half - 8, 3);
        }

        this.body.clear();
        this.body.fillStyle(skin.colour, 1);
        this.body.lineStyle(1, UI.outline, 1);

        this.shape(type, skin);
        this.dents(skin.dents);
    }

    private shape(type: string, skin: ItemSkin): void {
        const half = BODY_PX / 2;

        if (type === 'keg') {
            const height = skin.squat ? BODY_PX - 6 : BODY_PX;

            this.body.fillRoundedRect(-half, -height / 2, BODY_PX, height, 4);
            this.body.strokeRoundedRect(-half, -height / 2, BODY_PX, height, 4);
            this.body.lineStyle(1, UI.outline, 0.6);
            this.body.lineBetween(-half + 1, -2, half - 1, -2);
            this.body.lineBetween(-half + 1, 3, half - 1, 3);

            return;
        }

        if (type === 'stick') {
            this.body.fillRect(-3, -half, 6, BODY_PX);
            this.body.strokeRect(-3, -half, 6, BODY_PX);
            this.body.lineStyle(2, 0x2a2a2a, 1);
            this.body.lineBetween(0, -half, 5, -half - 5);

            return;
        }

        if (type === 'parts') {
            this.body.fillCircle(-4, 0, 4);
            this.body.fillCircle(4, 2, 3);
            this.body.strokeCircle(-4, 0, 4);

            return;
        }

        if (type === 'crate') {
            this.body.fillRect(-half, -half, BODY_PX, BODY_PX);
            this.body.strokeRect(-half, -half, BODY_PX, BODY_PX);
            this.body.lineBetween(-half, -half, half, half);
            this.body.lineBetween(half, -half, -half, half);

            return;
        }

        this.body.fillRect(-6, -half, 12, BODY_PX);
        this.body.strokeRect(-6, -half, 12, BODY_PX);
        this.body.fillStyle(UI.text, 0.35);
        this.body.fillRect(-6, -half, 12, 3);
    }

    /** Each dent is a scar the crimp has to live with, so they stack visibly. */
    private dents(count: number): void {
        if (count === 0) return;

        this.body.lineStyle(2, 0x2a2a2a, 0.9);

        for (let i = 0; i < count; i++) {
            const y = -5 + i * 5;

            this.body.lineBetween(-DENT_PX / 2, y, DENT_PX / 2, y + 2);
        }
    }
}

/** The broom and the chore bar: what a player is doing, drawn over the player. */
class CarrierView {
    private readonly container: Phaser.GameObjects.Container;
    private readonly broom: Phaser.GameObjects.Graphics;
    private readonly bar: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;
    private lastFill = -1;

    constructor(scene: Factory, layer: Phaser.GameObjects.Container) {
        this.broom = scene.add.graphics();
        this.bar = scene.add.graphics();
        this.label = scene.add.text(0, CHORE_BAR_Y - 5, '', {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#ffffff',
        });
        this.label.setOrigin(0.5, 1);
        this.label.setStroke('#000000', 2);
        this.container = scene.add.container(0, 0, [this.broom, this.bar, this.label]);
        this.container.setVisible(false);
        layer.add(this.container);

        this.paintBroom();
    }

    update(
        x: number,
        y: number,
        broom: boolean,
        chore: { fill: number; label: string } | null,
    ): void {
        this.container.setVisible(true);
        this.container.setPosition(x, y);
        this.broom.setVisible(broom);
        this.bar.setVisible(chore !== null);
        this.label.setVisible(chore !== null);

        if (!chore) {
            this.lastFill = -1;

            return;
        }

        if (this.label.text !== chore.label) this.label.setText(chore.label);

        const fill = Math.round(chore.fill * CHORE_BAR_W);

        if (fill === this.lastFill) return;

        this.lastFill = fill;
        this.bar.clear();
        this.bar.fillStyle(0x000000, 0.6);
        this.bar.fillRect(-CHORE_BAR_W / 2 - 1, CHORE_BAR_Y - 1, CHORE_BAR_W + 2, CHORE_BAR_H + 2);
        this.bar.fillStyle(UI.beaconGold, 1);
        this.bar.fillRect(-CHORE_BAR_W / 2, CHORE_BAR_Y, fill, CHORE_BAR_H);
    }

    hide(): void {
        this.container.setVisible(false);
    }

    destroy(): void {
        this.container.destroy();
    }

    private paintBroom(): void {
        const colour = ITEM_COLOURS.broom ?? UNKNOWN_COLOUR;

        this.broom.setVisible(false);
        this.broom.lineStyle(2, colour, 1);
        this.broom.lineBetween(6, -HELD_LIFT_PX - 6, -4, -HELD_LIFT_PX + 8);
        this.broom.fillStyle(colour, 1);
        this.broom.fillRect(-9, -HELD_LIFT_PX + 6, 10, 5);
    }
}

/**
 * Two layers, because `items` sits under the avatars (contracts §10.9 draw
 * order) and a held item or a chore bar has to clear the body of a teammate
 * standing one tile north. Floor, lane and flight sprites stay under; hands and
 * chore bars ride above every avatar in the fx layer.
 */
class ItemsLayer {
    private readonly root: Phaser.GameObjects.Container;
    private readonly overhead: Phaser.GameObjects.Container;
    private readonly sprites = new Map<
        string,
        { item: ItemState; sprite: ItemSprite; hand: HandState }
    >();
    private readonly carriers = new Map<string, CarrierView>();
    private readonly flights = new StartTimes();
    private readonly chores = new StartTimes();
    private readonly unsubscribes: (() => void)[];
    private destroyed = false;

    constructor(private readonly scene: Factory) {
        this.root = scene.add.container(0, 0);
        this.overhead = scene.add.container(0, 0);
        scene.layers.items.add(this.root);
        scene.layers.fx.add(this.overhead);

        const callbacks = scene.conn.callbacks;

        this.unsubscribes = [
            callbacks.onAdd('items', (item, id) => this.add(id, item)),
            callbacks.onRemove('items', (_item, id) => this.remove(id)),
        ];
    }

    update(nowMs: number): void {
        if (this.destroyed) return;

        const conn = this.scene.conn;
        const serverNow = conn.clock.now(nowMs);
        const flightSeconds = this.scene.levelConfig.carry.throwFlightSeconds;

        for (const [id, entry] of this.sprites) {
            this.drawItem(id, entry, nowMs, serverNow, flightSeconds);
        }

        this.drawCarriers(conn.state, serverNow);
        this.root.sort('y');
        this.overhead.sort('y');
    }

    destroy(): void {
        if (this.destroyed) return;

        this.destroyed = true;

        for (const off of this.unsubscribes) off();

        for (const { sprite } of this.sprites.values()) sprite.destroy();

        for (const view of this.carriers.values()) view.destroy();

        this.sprites.clear();
        this.carriers.clear();
        this.root.destroy();
        this.overhead.destroy();
    }

    private add(id: string, item: ItemState): void {
        if (this.destroyed || this.sprites.has(id)) return;

        const state = this.scene.conn.state;

        this.sprites.set(id, {
            item,
            sprite: new ItemSprite(this.scene, this.root),
            // Seeded from where the item already is, so joining a shift with a
            // keg in your hands is not a pick-up you never made.
            hand: handStateOf(
                placementOf(item, (sessionId) => state.players.has(sessionId)),
                this.scene.conn.sessionId,
            ),
        });
    }

    private remove(id: string): void {
        this.sprites.get(id)?.sprite.destroy();
        this.sprites.delete(id);
        this.flights.forget(id);
    }

    private drawItem(
        id: string,
        entry: { item: ItemState; sprite: ItemSprite; hand: HandState },
        nowMs: number,
        serverNow: number,
        flightSeconds: number,
    ): void {
        const { item, sprite } = entry;
        const state = this.scene.conn.state;
        const placement = placementOf(item, (sessionId) => state.players.has(sessionId));
        const hand = handStateOf(placement, this.scene.conn.sessionId);
        const cue = handCue(entry.hand, hand);

        entry.hand = hand;

        // Off the placement rather than off `carrying`, because the placement is
        // the only thing that knows a full pair of hands came out of the air.
        if (cue !== null) gameAudio.play(cue);

        if (placement.kind === 'flight') {
            const t = flightProgress(
                item.flightT,
                nowMs - this.flights.mark(id, 'flight', nowMs),
                flightSeconds,
            );
            const pose = flightPose(item, t);

            sprite.attach(this.root);
            sprite.show(itemSkin(item), item.type, pose.x, pose.y, pose.lift, true, nowMs);

            return;
        }

        this.flights.forget(id);

        if (placement.kind === 'hidden') {
            sprite.hide();

            return;
        }

        if (placement.kind === 'tile') {
            sprite.attach(this.root);
            sprite.show(itemSkin(item), item.type, placement.x, placement.y, 0, false, nowMs);

            return;
        }

        const carrier = this.scene.avatarPosition(placement.sessionId);
        const player = state.players.get(placement.sessionId);

        if (!carrier || !player || serverNow < player.drivenOffUntil) {
            sprite.hide();

            return;
        }

        sprite.attach(this.overhead);
        sprite.show(
            itemSkin(item),
            item.type,
            carrier.x,
            carrier.y - HELD_LIFT_PX,
            0,
            false,
            nowMs,
        );
    }

    private drawCarriers(state: FactoryState, serverNow: number): void {
        const labels = choresOf(this.scene);
        const seen = new Set<string>();

        state.players.forEach((player, sessionId) => {
            seen.add(sessionId);

            const view = this.carrierFor(sessionId);
            const at = this.scene.avatarPosition(sessionId);

            if (!at || serverNow < player.drivenOffUntil) {
                view.hide();
                this.chores.forget(sessionId);

                return;
            }

            if (player.chore === '') {
                this.chores.forget(sessionId);
                view.update(at.x, at.y, player.carrying === 'broom', null);

                return;
            }

            const startedAt = this.chores.mark(sessionId, player.chore, serverNow);

            view.update(at.x, at.y, player.carrying === 'broom', {
                fill: choreFill(startedAt, player.choreUntil, serverNow),
                label: choreLabel(labels, player.chore),
            });
        });

        for (const [sessionId, view] of this.carriers) {
            if (seen.has(sessionId)) continue;

            view.destroy();
            this.carriers.delete(sessionId);
            this.chores.forget(sessionId);
        }
    }

    private carrierFor(sessionId: string): CarrierView {
        let view = this.carriers.get(sessionId);

        if (!view) {
            view = new CarrierView(this.scene, this.overhead);
            this.carriers.set(sessionId, view);
        }

        return view;
    }
}

/**
 * The F06 line in `Factory.create()`'s mount list. The layer drives itself from
 * the scene's POST_UPDATE, which is the first moment `avatarPosition` holds this
 * frame's poses — a carried item drawn any earlier would trail its carrier.
 * `update` stays on the returned object because §10.4 fixes that shape, so a
 * caller with its own frame loop can drive the layer instead.
 */
export function createItemsLayer(scene: Factory): { update(nowMs: number): void; destroy(): void } {
    const layer = new ItemsLayer(scene);
    const onPostUpdate = (): void => layer.update(performance.now());
    const api = {
        update: (nowMs: number): void => layer.update(nowMs),
        destroy: (): void => {
            scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
            layer.destroy();
        },
    };

    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, api.destroy);

    return api;
}
