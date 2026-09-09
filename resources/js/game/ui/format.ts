/**
 * The HUD's number formatting. The clock clamps at zero because the shift timer
 * runs on the client's estimate of the server clock and may cross the end by a
 * frame before the phase flips.
 */

export function mmss(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);

    return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function pct(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
}

export function fixed(value: number, decimals: number): string {
    return value.toFixed(decimals);
}

/**
 * How far `Space` throws what you are carrying. It is `level.carry.throwTiles`,
 * a per-level knob, and two surfaces say it in the same breath — the help
 * panel's floor row and the Slammer's hands panel — so both read the number off
 * the level rather than one hedging while the other asserts.
 */
export function throwDistance(tiles: number): string {
    return `${tiles} tile${tiles === 1 ? '' : 's'}`;
}
