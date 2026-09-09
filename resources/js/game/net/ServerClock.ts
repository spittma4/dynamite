import { CLOCK_EXTRAPOLATE_MAX_S } from '../constants';

/**
 * The client's estimate of `FactoryState.clock`, the one time base every
 * deadline in the state is written against (contracts §3). Extrapolation is
 * capped so a stalled connection freezes the countdowns instead of expiring
 * them early against a wall clock that kept running.
 */
export class ServerClock {
    private lastClock = 0;
    private lastAt = 0;
    private seen = false;

    onPatch(clockSeconds: number, nowMs: number): void {
        this.lastClock = clockSeconds;
        this.lastAt = nowMs;
        this.seen = true;
    }

    now(nowMs: number = performance.now()): number {
        if (!this.seen) return 0;

        const elapsed = Math.max(0, (nowMs - this.lastAt) / 1000);

        return this.lastClock + Math.min(elapsed, CLOCK_EXTRAPOLATE_MAX_S);
    }
}
