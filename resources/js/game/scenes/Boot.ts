import Phaser from 'phaser';

import type { Factory } from './Factory';

/**
 * The one job before the floor exists: the two textures everything else tints.
 * Generating them beats shipping images for four white pixels, and it keeps the
 * client asset-free until there is real art to load.
 */
export class Boot extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    create(): void {
        this.square('dot', 4);
        this.square('px', 1);

        // `main.ts` composes the HUD, keys, debug overlay and mini-game host
        // around the scene, and can only do it once `Factory.create()` has built
        // the layers they draw into.
        const wire = this.registry.get('wire') as ((factory: Factory) => void) | undefined;
        const factory = this.scene.get<Factory>('Factory');

        if (wire) factory.events.once(Phaser.Scenes.Events.CREATE, () => wire(factory));

        this.scene.start('Factory');
    }

    private square(key: string, size: number): void {
        const graphics = this.add.graphics();

        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(0, 0, size, size);
        graphics.generateTexture(key, size, size);
        graphics.destroy();
    }
}
