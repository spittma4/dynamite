import { TILE_PX } from '@shared';
import type Phaser from 'phaser';

import { HUD_HEIGHT } from '../constants';
import type { FxHandler } from '../fx/Fx';
import { playerColour } from '../render/palette';
import type { Factory } from '../scenes/Factory';

/**
 * The four `fx` kinds F10 draws itself (F10 §Client, contracts §4). Everything
 * else the server fires stays on F04's default renderer; these four are here
 * because a blast is the one moment in the game that is allowed to take the
 * screen — a ring, a soot puff and a shake for one keg, and the whole canvas
 * going white when the factory itself goes up.
 *
 * Each handler is one `Graphics` and one tween that destroys it, so nothing is
 * held between blasts and nothing allocates per frame.
 */

export const BLAST_RING_START_PX = 8;
export const BLAST_RING_PX = 48;
export const BLAST_RING_MS = 300;
export const BLAST_RING_COLOUR = 0xff7a1a;
export const SOOT_COLOUR = 0x222222;
export const SOOT_PX = 12;
export const SOOT_MS = 500;
export const SHAKE_MS = 200;
export const SHAKE_PER_SIZE = 0.004;
/** The size the server reserves for the factory explosion (F10 §6). */
export const FACTORY_EXPLOSION_SIZE = 3;
export const FLASH_COLOUR = 0xffffff;
export const FLASH_MS = 600;
export const SAND_COLOUR = 0xc8a951;
export const WHUMP_MS = 700;
export const CONFETTI_COUNT = 40;
export const CONFETTI_PX = 3;
export const CONFETTI_SPREAD_PX = 26;
export const IGNITION_COLOUR = 0xffe066;
export const IGNITION_PX = 12;
export const IGNITION_MS = 150;

export function fxSize(size: number | undefined): number {
    return size ?? 1;
}

export function isFactoryExplosion(size: number): boolean {
    return size >= FACTORY_EXPLOSION_SIZE;
}

export function blastShake(size: number): { duration: number; intensity: number } {
    return { duration: SHAKE_MS, intensity: SHAKE_PER_SIZE * size };
}

export interface ConfettiBit {
    x: number;
    y: number;
    tint: number;
}

/**
 * The NICE SAVE confetti, in the crew's own eight colours. The golden angle
 * spreads the bits evenly without an RNG, so the same save looks the same on
 * every screen — the client never rolls anything, not even for a party.
 */
export function confettiSpray(count: number): ConfettiBit[] {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const bits: ConfettiBit[] = [];

    for (let i = 0; i < count; i++) {
        const radius = CONFETTI_SPREAD_PX * Math.sqrt((i + 0.5) / count);
        const angle = i * golden;

        bits.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius - radius * 0.3,
            tint: playerColour(i),
        });
    }

    return bits;
}

function at(scene: Factory, x: number, y: number): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics();

    g.setPosition(x, y);
    scene.layers.fx.add(g);

    return g;
}

/** One keg's worth of noise: a ring, a soot cloud and a kick to the camera. */
export const blastFx: FxHandler = (scene, m) => {
    const size = fxSize(m.size);
    const x = m.x * TILE_PX;
    const y = m.y * TILE_PX;
    const ring = at(scene, x, y);
    const soot = at(scene, x, y);

    ring.lineStyle(3, BLAST_RING_COLOUR, 0.9);
    ring.strokeCircle(0, 0, BLAST_RING_START_PX);
    scene.tweens.add({
        targets: ring,
        scale: (BLAST_RING_PX / BLAST_RING_START_PX) * size,
        alpha: 0,
        duration: BLAST_RING_MS,
        onComplete: () => ring.destroy(),
    });

    soot.fillStyle(SOOT_COLOUR, 0.75);
    soot.fillCircle(0, 0, SOOT_PX);
    soot.fillCircle(-SOOT_PX * 0.6, SOOT_PX * 0.3, SOOT_PX * 0.6);
    soot.fillCircle(SOOT_PX * 0.7, -SOOT_PX * 0.2, SOOT_PX * 0.5);
    scene.tweens.add({
        targets: soot,
        scale: 2 * size,
        alpha: 0,
        duration: SOOT_MS,
        onComplete: () => soot.destroy(),
    });

    const shake = blastShake(size);

    scene.cameras.main.shake(shake.duration, shake.intensity);

    if (isFactoryExplosion(size)) whiteOut(scene);
};

/**
 * The sand bin swallowing a lit keg: a dull puff and the crew's confetti. It is
 * the one hazard effect that is a reward, so it is the only one that does not
 * shake the camera.
 */
export const whumpFx: FxHandler = (scene, m) => {
    const x = m.x * TILE_PX;
    const y = m.y * TILE_PX;
    const puff = at(scene, x, y);
    const party = at(scene, x, y);

    puff.fillStyle(SAND_COLOUR, 0.7);
    puff.fillCircle(0, 0, 10);
    puff.fillCircle(-6, 3, 6);
    puff.fillCircle(7, 2, 5);
    scene.tweens.add({
        targets: puff,
        scale: 1.8,
        alpha: 0,
        duration: SOOT_MS,
        onComplete: () => puff.destroy(),
    });

    for (const bit of confettiSpray(CONFETTI_COUNT)) {
        party.fillStyle(bit.tint, 1);
        party.fillRect(
            bit.x - CONFETTI_PX / 2,
            bit.y - CONFETTI_PX / 2,
            CONFETTI_PX,
            CONFETTI_PX,
        );
    }

    scene.tweens.add({
        targets: party,
        scale: 1.6,
        angle: 40,
        alpha: 0,
        duration: WHUMP_MS,
        onComplete: () => party.destroy(),
    });
};

/** A spark that found fuel and one that did not look the same for 150 ms. */
export const ignitionFx: FxHandler = (scene, m) => {
    const flash = at(scene, m.x * TILE_PX, m.y * TILE_PX);

    flash.fillStyle(IGNITION_COLOUR, 0.85);
    flash.fillCircle(0, 0, IGNITION_PX);
    scene.tweens.add({
        targets: flash,
        scale: 1.4,
        alpha: 0,
        duration: IGNITION_MS,
        onComplete: () => flash.destroy(),
    });
};

/**
 * The factory going up. The rectangle covers the HUD as well as the floor —
 * the fx layer sits inside the stage, which is pushed down by the HUD, so the
 * flash has to start above its own origin to reach the top of the canvas.
 */
function whiteOut(scene: Factory): void {
    const flash = scene.add.graphics();

    flash.fillStyle(FLASH_COLOUR, 0.9);
    flash.fillRect(0, -HUD_HEIGHT, scene.floorWidth, HUD_HEIGHT + scene.floorHeight);
    scene.layers.overlay.add(flash);
    scene.tweens.add({
        targets: flash,
        alpha: 0,
        duration: FLASH_MS,
        onComplete: () => flash.destroy(),
    });
}

/**
 * F10's line in the mount list, run once by `createHazardsLayer`. An override
 * replaces F04's default for that kind, so `pfft` and `chime` — the two other
 * kinds hazards emit — stay on the default renderer by not appearing here.
 */
export function installBlastFx(scene: Factory): void {
    scene.fx.override('blast', blastFx);
    scene.fx.override('whump', whumpFx);
    scene.fx.override('spark', ignitionFx);
    scene.fx.override('fuse', ignitionFx);
}
