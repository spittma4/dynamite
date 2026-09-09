import type { Banner, ItemType, StationType } from '../schema/types';

/**
 * Numbers the contract fixes and a designer never tunes. Anything a level might
 * want to change lives in the level JSON instead, defaulted in
 * `config/defaults.ts` — which is why there is no `WALK_SPEED` here.
 */

export const TICK_HZ = 20;
export const TICK_SECONDS = 0.05;
export const TILE_PX = 32;
export const STUNNED_SPEED_MULT = 0;
export const INPUT_HEARTBEAT_MS = 250;
export const MAX_CLIENTS = 10;
export const RECONNECT_SECONDS = 30;
export const PLAYER_COLOURS = 8;
/** How far back a client's timestamp may pull a judgement (contracts §7). */
export const MAX_INPUT_BACKDATE_S = 0.2;

export const CYCLE = {
    churnFactorMax: 1.15,
    perfectRearmFactor: 0.75,
    interruptSecondsPerBubble: 0.5,
} as const;

export const HERO_POINTS_PER_EVENT = 2;
export const UTILIZATION_LABELS = { excellent: 0.9, good: 0.6 } as const;

export const ITEM_ID_PREFIX: Record<ItemType, string> = {
    keg: 'k',
    casing: 'c',
    stick: 's',
    crate: 'x',
    parts: 'p',
};

export const STATION_SHORT: Record<StationType, string> = {
    boom_powder: 'powder',
    assembly: 'assembly',
    dock: 'dock',
};

export const BANNERS: readonly Exclude<Banner, ''>[] = [
    'WHOOPS',
    'INCIDENT',
    'EXPLODED',
    'NICE SAVE',
    'CLEAN SWEEP',
    'HOT STREAK',
    'TAILGATE',
];
