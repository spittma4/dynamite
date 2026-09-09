import type { LevelConfig, ScalingBreakpoint } from '../config/types';
import type { Line } from '../schema/types';

/**
 * Player-count scaling (docs/19). The result is still a whole `LevelConfig`, so
 * `world.level` after the day starts answers every question the unscaled file
 * did — consumers read `day.orderBook` and `orders.everySeconds`, never the
 * breakpoint directly.
 */
export type ScaledLevel = LevelConfig & { breakpoint: ScalingBreakpoint; lines: Line[] };

export function breakpointFor(level: LevelConfig, players: number): ScalingBreakpoint {
    if (players < level.players.min || players > level.players.max) {
        throw new RangeError(`players out of range: ${players}`);
    }

    const breakpoint = level.scaling.breakpoints.find((b) => b.maxPlayers >= players);

    if (breakpoint === undefined) throw new RangeError(`no breakpoint for ${players} players`);

    return breakpoint;
}

export function scaleLevel(level: LevelConfig, players: number): ScaledLevel {
    const breakpoint = breakpointFor(level, players);

    if (breakpoint.lines === 2) throw new RangeError('two-line scaling is M2');

    // The M1 template stations are already the one line, so the spread carries
    // them through; M2's second line clones them with a `-b` suffix here.
    return {
        ...level,
        breakpoint,
        lines: ['a'],
        layout: breakpoint.layout ?? level.layout,
        day: { ...level.day, orderBook: breakpoint.orderBook },
        orders: { ...level.orders, everySeconds: breakpoint.truckEverySeconds },
    };
}
