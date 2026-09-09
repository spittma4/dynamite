/**
 * The client's own numbers (F04). Anything a designer would tune lives in the
 * level JSON instead; these are render and netcode constants the server never
 * sees.
 */

export const HUD_HEIGHT = 48;
export const INTERP_DELAY_MS = 100;
export const HISTORY_MS = 2000;
export const LAG_INITIAL_MS = 100;
export const LAG_MIN_MS = 30;
export const LAG_MAX_MS = 500;
export const LAG_ALPHA = 0.1;
export const SNAP_TILES = 1;
export const DEADBAND_TILES = 0.02;
export const NUDGE = 0.3;
export const CLOCK_EXTRAPOLATE_MAX_S = 0.25;
export const PING_INTERVAL_MS = 2000;
export const TOAST_MS = 3000;
export const TOAST_MAX = 3;
export const DEBUG_REFRESH_HZ = 4;
export const EMOTE_MIN_INTERVAL_MS = 500;
