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
