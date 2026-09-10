import type { GameAudio } from './Audio';
import type { CueName } from './cues';

/**
 * How a cue reaches the beat it marks (F18 §The clock bridge). Nothing here
 * sounds anything or reads a clock: a caller hands a track the moments it
 * already draws and the clock it already draws them from, and the track books
 * each one on the `AudioContext`'s own timeline before it arrives.
 *
 * The whole point is *before*. A cue asked for on the frame its beat lands is
 * a cue a frame late, and a beat marker a frame late is the failure this
 * feature exists to remove — so every site books ahead and none of them polls.
 */

/** One moment worth a sound, in seconds on whichever clock the caller draws from. */
export interface Pulse {
    at: number;
    cue: CueName;
}

/**
 * How far ahead a pulse is booked. Comfortably inside the engine's own horizon
 * so a pulse is never offered at the edge of it, and long enough that a phrase
 * at 150 bpm is always two beats ahead of the player.
 */
export const BOOK_AHEAD_MS = 1200;

const NO_PULSES: readonly Pulse[] = [];

/**
 * A cursor over one phrase's pulses — a jig phrase, the Slammer's three band
 * moments. It books each pulse once, as that pulse comes inside the horizon,
 * which is what keeps a phrase longer than the horizon audible to its last
 * beat: the far pulses are simply booked by a later frame.
 *
 * Re-aiming at the *same* array is a no-op, so a caller can hand it the phrase
 * every frame; only a genuinely new phrase rewinds the cursor.
 */
export class PulseTrack {
    private pulses: readonly Pulse[] = NO_PULSES;
    private next = 0;

    /**
     * A shorter horizon for a phrase that stops mattering the moment the player
     * acts — the Slammer's trailing band edge is nothing to a keg already
     * released, and a scheduled voice cannot be taken back.
     */
    constructor(private readonly aheadMs: number = BOOK_AHEAD_MS) {}

    aim(pulses: readonly Pulse[]): void {
        if (pulses === this.pulses) return;

        this.pulses = pulses;
        this.next = 0;
    }

    clear(): void {
        this.aim(NO_PULSES);
    }

    /** Returns how many pulses actually sounded, which is what a test can read. */
    book(now: number, audio: GameAudio, gain = 1): number {
        let booked = 0;

        for (;;) {
            const pulse = this.pulses[this.next];

            if (pulse === undefined || (pulse.at - now) * 1000 > this.aheadMs) return booked;

            this.next++;

            // A pulse the engine refuses — too stale to be worth hearing — is
            // still stepped over, never retried on the next frame.
            if (audio.at(pulse.cue, pulse.at, now, gain)) booked++;
        }
    }
}

/**
 * The next moment on a repeating grid at or after `now`. `firstAt` is the grid's
 * origin rather than its first audible pulse, so a beacon that has been red for
 * a minute stays in step with the lamp that has been pulsing all along.
 */
export function nextPulseAt(firstAt: number, periodSeconds: number, now: number): number {
    if (periodSeconds <= 0 || now <= firstAt) return firstAt;

    return firstAt + Math.ceil((now - firstAt) / periodSeconds) * periodSeconds;
}

/**
 * A cue that repeats for as long as something is true: the dock's reversing
 * beep, a burning fuse, a red beacon. It holds one pulse at a time rather than
 * a list, because none of the three knows how many pulses it has left.
 */
export class Metronome {
    private booked = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly cue: CueName,
        private readonly aheadMs: number = BOOK_AHEAD_MS,
    ) {}

    /** Forgets what it booked, so the next call books the next pulse afresh. */
    reset(): void {
        this.booked = Number.NEGATIVE_INFINITY;
    }

    book(
        firstAt: number,
        periodSeconds: number,
        now: number,
        audio: GameAudio,
        gain = 1,
    ): boolean {
        const at = nextPulseAt(firstAt, periodSeconds, now);

        if (at <= this.booked || (at - now) * 1000 > this.aheadMs) return false;

        this.booked = at;

        return audio.at(this.cue, at, now, gain);
    }
}
