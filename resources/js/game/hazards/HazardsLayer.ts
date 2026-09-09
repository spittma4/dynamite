import Phaser from 'phaser';

import { installBlastFx } from './BlastFx';
import { DangerBeaconView } from './DangerBeacon';
import { FuseSparkles } from './FuseFx';
import { RepairSignView } from './RepairSign';
import type { Factory } from '../scenes/Factory';

/**
 * Everything the players can see burning (F10 §Client, contracts §10.5). The
 * layer decides nothing: fuses, beacons and damage are schema fields the server
 * writes, and the four `fx` overrides are one-shots it fires. What is here is
 * the reading of them — a sparkle on the keg, stripes around the pile, a lamp
 * on the pole and the paperwork over a broken machine.
 *
 * Scorch tiles, spill blobs, the beacon pole itself, the banner and the avatar
 * chore bar belong to F04 and F06 and are drawn nowhere in this directory.
 */
class HazardsLayer {
    private readonly ground: Phaser.GameObjects.Container;
    private readonly overhead: Phaser.GameObjects.Container;
    private readonly beacons: DangerBeaconView;
    private readonly sparkles: FuseSparkles;
    private readonly signs: RepairSignView;
    private destroyed = false;

    constructor(private readonly scene: Factory) {
        // Stripes are paint on the floor and go under the machines; sparkles and
        // signs have to clear the bodies standing over them.
        this.ground = scene.add.container(0, 0);
        this.overhead = scene.add.container(0, 0);
        scene.layers.floor.add(this.ground);
        scene.layers.fx.add(this.overhead);

        this.beacons = new DangerBeaconView(scene, this.ground);
        this.sparkles = new FuseSparkles(scene, this.overhead);
        this.signs = new RepairSignView(scene, this.overhead);

        installBlastFx(scene);
    }

    update(nowMs: number): void {
        if (this.destroyed) return;

        this.beacons.update(this.scene.conn.clock.now(nowMs));
        this.sparkles.update(nowMs);
        this.signs.update();
    }

    destroy(): void {
        if (this.destroyed) return;

        this.destroyed = true;
        this.beacons.destroy();
        this.sparkles.destroy();
        this.signs.destroy();
        this.ground.destroy();
        this.overhead.destroy();
    }
}

/**
 * F10's line in `Factory.create()`'s mount list. Like F06's layer it runs on
 * POST_UPDATE, which is the first moment `avatarPosition` holds this frame's
 * poses — a sparkle drawn any earlier would trail the keg it is burning on.
 *
 * The `fx` overrides installed here outlive the layer, because F04's `Fx` has
 * no way to take one back; they hold no state of their own, so a handler that
 * fires after a teardown draws into the next scene's layers or nothing at all.
 */
export function createHazardsLayer(scene: Factory): { destroy(): void } {
    const layer = new HazardsLayer(scene);
    const onPostUpdate = (): void => layer.update(performance.now());
    const api = {
        destroy: (): void => {
            scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
            layer.destroy();
        },
    };

    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, api.destroy);

    return api;
}
