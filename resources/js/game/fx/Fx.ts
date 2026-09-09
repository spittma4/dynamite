import { TILE_PX, type FxKind, type FxMsg } from '@shared';
import type Phaser from 'phaser';

import type { Factory } from '../scenes/Factory';

/**
 * One-shot effects the server asks for (contracts §4). Everything is cheap —
 * particles, a tween, a rising label — and only a blast shakes the camera; the
 * juice budget in docs/04 keeps the small kinds quiet so the big one lands.
 */

export type FxHandler = (scene: Factory, m: FxMsg) => void;

export interface FxSpec {
    count: number;
    tint: number | number[];
    speed: [number, number];
    lifespan: number;
    gravityY?: number;
    /** Degrees; set for the kinds that drift upward. */
    angle?: [number, number];
    /** Drawn when the message carries no `text` of its own. */
    text?: string;
    textSize?: number;
    extra?: 'blast' | 'ring' | 'arcs' | 'squash' | 'flash';
}

export const FX_SPECS: Record<FxKind, FxSpec> = {
    thunk: { count: 8, tint: 0x9a9a9a, speed: [40, 80], lifespan: 300 },
    spark: { count: 6, tint: 0xffb347, speed: [60, 120], lifespan: 250, gravityY: 200 },
    fuse: { count: 10, tint: 0xffe066, speed: [20, 60], lifespan: 400 },
    blast: {
        count: 40,
        tint: [0xff7a1a, 0x222222],
        speed: [80, 220],
        lifespan: 600,
        extra: 'blast',
    },
    fizzle: { count: 12, tint: 0x444444, speed: [10, 30], lifespan: 500, angle: [-110, -70] },
    snap: { count: 6, tint: 0xffffff, speed: [40, 90], lifespan: 200 },
    whump: { count: 20, tint: 0xc8a951, speed: [20, 50], lifespan: 500, extra: 'ring' },
    horn: {
        count: 0,
        tint: 0xffffff,
        speed: [0, 0],
        lifespan: 500,
        text: 'HONK',
        textSize: 24,
        extra: 'arcs',
    },
    slam: { count: 16, tint: 0x9a9a9a, speed: [30, 70], lifespan: 350, extra: 'squash' },
    chime: { count: 8, tint: 0xf5c542, speed: [30, 60], lifespan: 400, extra: 'flash' },
    clink: { count: 3, tint: 0xbbbbbb, speed: [20, 40], lifespan: 250, text: 'clink', textSize: 12 },
    pfft: {
        count: 6,
        tint: 0xdddddd,
        speed: [10, 25],
        lifespan: 450,
        angle: [-110, -70],
        text: 'pfft',
        textSize: 12,
    },
    bonk: { count: 4, tint: 0xbbbbbb, speed: [20, 40], lifespan: 250, text: 'bonk', textSize: 12 },
    slop: { count: 10, tint: 0x6b4a2b, speed: [20, 50], lifespan: 350 },
};

export class Fx {
    private readonly overrides = new Map<FxKind, FxHandler>();
    private emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

    constructor(
        private readonly scene: Factory,
        private readonly layer: Phaser.GameObjects.Container,
    ) {}

    /** A registered handler replaces the default, so the two never fire together. */
    override(kind: FxKind, handler: FxHandler): void {
        this.overrides.set(kind, handler);
    }

    play(m: FxMsg): void {
        const handler = this.overrides.get(m.kind);

        if (handler) {
            handler(this.scene, m);

            return;
        }

        this.render(FX_SPECS[m.kind], m);
    }

    private render(spec: FxSpec, m: FxMsg): void {
        const size = m.size ?? 1;
        const x = m.x * TILE_PX;
        const y = m.y * TILE_PX;

        if (spec.count > 0) this.burst(spec, size, x, y);

        switch (spec.extra) {
            case 'blast':
                this.blast(size, x, y);
                break;
            case 'ring':
                this.ring(x, y, 0xc8a951, 8, 40, 400);
                break;
            case 'arcs':
                this.ring(x, y, 0xffffff, 8, 48, 500);
                break;
            case 'squash':
                this.squash(x, y);
                break;
            case 'flash':
                this.flash(x, y);
                break;
            default:
                break;
        }

        const text = m.text ?? spec.text;

        if (text !== undefined) this.label(text, x, y, m.text === undefined ? spec.textSize : 14);
    }

    private burst(spec: FxSpec, size: number, x: number, y: number): void {
        const emitter = this.particles();

        emitter.setConfig({
            speed: { min: spec.speed[0] * size, max: spec.speed[1] * size },
            lifespan: spec.lifespan,
            tint: spec.tint,
            gravityY: spec.gravityY ?? 0,
            angle: spec.angle ? { min: spec.angle[0], max: spec.angle[1] } : { min: 0, max: 360 },
            scale: size,
            quantity: 1,
            emitting: false,
        });
        emitter.explode(Math.round(spec.count * size), x, y);
    }

    private particles(): Phaser.GameObjects.Particles.ParticleEmitter {
        if (!this.emitter) {
            this.emitter = this.scene.add.particles(0, 0, 'dot', { emitting: false });
            this.layer.add(this.emitter);
        }

        return this.emitter;
    }

    private blast(size: number, x: number, y: number): void {
        const flash = this.scene.add.graphics();

        flash.fillStyle(0xffffff, 0.8);
        flash.fillCircle(x, y, 32 * size);
        this.layer.add(flash);
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 200,
            onComplete: () => flash.destroy(),
        });
        this.scene.cameras.main.shake(250, 0.008 * size);
    }

    private ring(x: number, y: number, colour: number, from: number, to: number, ms: number): void {
        const ring = this.scene.add.graphics();

        ring.lineStyle(2, colour, 0.8);
        ring.strokeCircle(x, y, from);
        this.layer.add(ring);
        this.scene.tweens.add({
            targets: ring,
            scale: to / from,
            alpha: 0,
            duration: ms,
            onComplete: () => ring.destroy(),
        });
    }

    private squash(x: number, y: number): void {
        const box = this.scene.add.graphics();

        box.fillStyle(0x9a9a9a, 0.9);
        box.fillRect(-12, -12, 24, 24);
        box.setPosition(x, y);
        this.layer.add(box);
        this.scene.tweens.add({
            targets: box,
            scaleY: 0.6,
            duration: 100,
            yoyo: true,
            onComplete: () => box.destroy(),
        });
    }

    private flash(x: number, y: number): void {
        const brass = this.scene.add.graphics();

        brass.fillStyle(0xf5c542, 0.6);
        brass.fillRect(x - 32, y - 32, 64, 64);
        this.layer.add(brass);
        this.scene.tweens.add({
            targets: brass,
            alpha: 0,
            duration: 300,
            onComplete: () => brass.destroy(),
        });
    }

    private label(text: string, x: number, y: number, size = 14): void {
        const label = this.scene.add.text(x, y, text, {
            fontFamily: 'monospace',
            fontSize: `${size}px`,
            color: '#ffffff',
            fontStyle: 'bold',
        });

        label.setOrigin(0.5, 0.5);
        label.setStroke('#000000', 3);
        this.layer.add(label);
        this.scene.tweens.add({
            targets: label,
            y: y - 20,
            alpha: 0,
            duration: 600,
            onComplete: () => label.destroy(),
        });
    }
}
