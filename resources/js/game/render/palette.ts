import type { Banner, Line } from '@shared';

import type { GrooveBandKey } from '../ui/grooveBand';
import type { OrderTone } from '../ui/orderBoard';

/**
 * Every colour the client draws with. The docs fix eight player indices and
 * name the Groove bands and banners; the hexes are F04's, kept in one file so a
 * repaint is one diff rather than a hunt through the scenes.
 */

export const PLAYER_PALETTE: readonly number[] = [
    0xe0453a, 0xf2921d, 0xf2d33b, 0x4cb944, 0x2bb5a0, 0x3b7de0, 0x8e5bd6, 0xe86aa6,
];

export const LINE_COLOURS: Record<Line, number> = { a: 0xd62828, b: 0x2b6fd6 };

export const GROOVE_COLOURS: Record<GrooveBandKey, number> = {
    onFire: 0xf5c542,
    groove: 0x4cb944,
    baseline: 0x9a9a9a,
    churn: 0xd9463d,
    meltdown: 0x7a1e1e,
};

export const BANNER_COLOURS: Record<Exclude<Banner, ''>, number> = {
    WHOOPS: 0xf2d33b,
    INCIDENT: 0xf2921d,
    EXPLODED: 0xd9463d,
    'NICE SAVE': 0x4cb944,
    'CLEAN SWEEP': 0x2bb5a0,
    'HOT STREAK': 0xf5c542,
    TAILGATE: 0xffffff,
};

/**
 * The order board's four voices. A truck on the clock is amber and never red:
 * the deadline is pressure, not a fault, and red on this floor means somebody
 * dropped something.
 */
export const BOARD_COLOURS: Record<OrderTone, number> = {
    now: 0xffffff,
    urgent: 0xf2d33b,
    waiting: 0xbbbbbb,
    done: 0x7a7d82,
};

export const TOAST_COLOURS = {
    info: 0xffffff,
    warn: 0xf2d33b,
    good: 0x4cb944,
    bad: 0xd9463d,
} as const;

export const UI = {
    hudBackground: 0x101014,
    panel: 0x101014,
    floor: 0x3a3a44,
    grid: 0x000000,
    wall: 0x1c1c22,
    wallEdge: 0x4a4a55,
    breakRoom: 0x2f4f3a,
    blastBin: 0xc8a951,
    dockDoor: 0x5a4632,
    ramp: 0x6e6e78,
    orderBoard: 0x8b6b3e,
    spill: 0x9a7b2d,
    scorch: 0x111111,
    beaconOff: 0x333333,
    beaconGold: 0xf5c542,
    beaconRed: 0xd9463d,
    text: 0xffffff,
    outline: 0x222222,
} as const;

export function playerColour(index: number): number {
    return PLAYER_PALETTE[index % PLAYER_PALETTE.length] ?? PLAYER_PALETTE[0] ?? 0xffffff;
}

export function lineColour(line: string): number {
    return line === 'b' ? LINE_COLOURS.b : LINE_COLOURS.a;
}
