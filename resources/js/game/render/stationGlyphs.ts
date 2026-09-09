import type { ItemState } from '@shared';
import type Phaser from 'phaser';

/**
 * The little pictures on a station's shelves (F05 §Client). A shelf slot is 8 px
 * across, so a glyph is a silhouette and a tint rather than a drawing: what a
 * player reads across the room is "how many, of what, and is one of them any
 * good". F06 draws the same items at floor size in `render/Items.ts`; this file
 * has no dependency on it so either may be reused without a cycle.
 */

/** Only a keg is tinted by quality; the rest are told apart by colour alone. */
export const KEG_TINTS = {
    dud: 0x8a8a8a,
    damp: 0xc8c8c8,
    full: 0xffffff,
} as const;

export const GLYPH_COLOURS: Record<string, number> = {
    keg: KEG_TINTS.full,
    casing: 0xc9c1a8,
    stick: 0xd93b2b,
    crate: 0x8b6b3e,
    parts: 0x9aa4b0,
};

/**
 * The quality spectrum as a name (contracts §3): a dud is grey and deflated, a
 * damp keg steams, a prime keg glows. Prime is checked last so a keg knocked
 * down to damp stops glowing the moment its quality drops. It lives here rather
 * than with the floor-size drawing in `render/Items.ts` because that module
 * pulls Phaser in at runtime, and the Jig's panel needs the same answer.
 */
export type KegLook = 'dud' | 'damp' | 'normal' | 'prime';

export function kegLook(quality: number, prime: boolean): KegLook {
    if (quality <= 0.4) return 'dud';

    if (quality < 1) return 'damp';

    return prime ? 'prime' : 'normal';
}

/**
 * The same four states as a word, for the panels that print them. The Jig's keg
 * gauge wrote `quality.toFixed(1)` under a label reading 'KEG' — 'KEG / 0.7' is
 * a float out of the schema, and no player can decode it into 'this one pours
 * slowly'. The tint has always known the answer; now the readout says it too.
 */
export const KEG_WORD: Record<KegLook, string> = {
    dud: 'DUD',
    damp: 'DAMP',
    normal: 'FULL',
    prime: 'PRIME',
};

export const UNKNOWN_GLYPH = 0x8a8a94;
export const HALO_COLOUR = 0xf5c542;
const GLYPH_OUTLINE = 0x1c1c22;

const HALO_ALPHA = 0.55;
const HALO_PAD = 2;

/** What the shelf needs from an item; a plain object satisfies it in tests. */
export type GlyphItem = Pick<ItemState, 'type' | 'quality' | 'prime'>;

export interface GlyphTint {
    colour: number;
    halo: boolean;
}

/**
 * Quality is the Slammer's verdict (contracts §3) and the halo is the prime
 * flag, so a shelf of kegs shows at a glance which one the Jig should pour
 * next. Quality is read before the type table so a dud keg never comes out
 * looking like a good one.
 */
export function glyphTint(item: GlyphItem): GlyphTint {
    const halo = item.prime === true;

    if (item.type === 'keg') {
        if (item.quality <= 0.4) return { colour: KEG_TINTS.dud, halo };

        if (item.quality < 1) return { colour: KEG_TINTS.damp, halo };

        return { colour: KEG_TINTS.full, halo };
    }

    return { colour: GLYPH_COLOURS[item.type] ?? UNKNOWN_GLYPH, halo };
}

/**
 * One glyph centred on `(x, y)` inside a `size` box. The halo goes down first so
 * the body sits on top of it, and every shape is drawn from the centre out so a
 * caller can lay slots out with `slotOffsets` and nothing else.
 */
export function drawItemGlyph(
    g: Phaser.GameObjects.Graphics,
    item: GlyphItem,
    x: number,
    y: number,
    size: number,
): void {
    const tint = glyphTint(item);
    const half = size / 2;

    if (tint.halo) {
        g.fillStyle(HALO_COLOUR, HALO_ALPHA);
        g.fillCircle(x, y, half + HALO_PAD);
    }

    g.fillStyle(tint.colour, 1);

    if (item.type === 'keg') {
        g.fillRoundedRect(x - half, y - half + 1, size, size - 2, 2);
        g.lineStyle(1, GLYPH_OUTLINE, 0.7);
        g.lineBetween(x - half + 1, y, x + half - 1, y);

        return;
    }

    if (item.type === 'casing') {
        g.fillRect(x - size * 0.3, y - half, size * 0.6, size);
        g.lineStyle(1, GLYPH_OUTLINE, 0.7);
        g.lineBetween(x - size * 0.3, y - half + 1, x + size * 0.3, y - half + 1);

        return;
    }

    if (item.type === 'stick') {
        g.fillRect(x - size * 0.2, y - half, size * 0.4, size);
        g.lineStyle(1, GLYPH_OUTLINE, 0.9);
        g.lineBetween(x, y - half, x + size * 0.3, y - half - size * 0.25);

        return;
    }

    if (item.type === 'crate') {
        g.fillRect(x - half, y - half, size, size);
        g.lineStyle(1, GLYPH_OUTLINE, 0.7);
        g.lineBetween(x - half, y - half, x + half, y + half);

        return;
    }

    if (item.type === 'parts') {
        g.fillCircle(x - size * 0.2, y - size * 0.1, size * 0.28);
        g.fillCircle(x + size * 0.22, y + size * 0.18, size * 0.22);

        return;
    }

    g.fillRect(x - half, y - half, size, size);
}
