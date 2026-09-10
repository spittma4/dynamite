import { describe, expect, it } from 'vitest';

import type { GameAudio } from '../audio/Audio';
import {
    type AudioSettings,
    type CueName,
    DEFAULT_AUDIO_SETTINGS,
    MAX_LATE_MS,
    MAX_SCHEDULE_AHEAD_MS,
    contextTimeFor,
} from '../audio/cues';
import { BOOK_AHEAD_MS, Metronome, type Pulse, PulseTrack, nextPulseAt } from '../audio/tracks';

/**
 * The booking half of F18: which cue gets scheduled, when, and — the part that
 * is easy to get wrong and impossible to hear — exactly once. A beat booked
 * twice is a flam and a beat booked every frame is a buzz, so both are asserted
 * against a recording engine rather than trusted.
 */

interface Booked {
    cue: CueName;
    deltaMs: number;
    gain: number;
}

/**
 * A `GameAudio` that records instead of sounding. It refuses a stale or a
 * far-future cue the way the real engine does, through the same
 * `contextTimeFor`, so a track that leans on a `false` is tested against the
 * real rule rather than a permissive stand-in.
 */
class RecordingAudio implements GameAudio {
    readonly available = true;
    readonly unlocked = true;
    readonly booked: Booked[] = [];

    settings(): AudioSettings {
        return { ...DEFAULT_AUDIO_SETTINGS };
    }

    setVolume(): void {}

    setMuted(): void {}

    toggleMute(): boolean {
        return false;
    }

    nudgeVolume(): number {
        return DEFAULT_AUDIO_SETTINGS.volume;
    }

    unlock(): void {}

    play(cue: CueName, gain = 1): boolean {
        return this.afterMs(cue, 0, gain);
    }

    afterMs(cue: CueName, deltaMs: number, gain = 1): boolean {
        if (contextTimeFor(deltaMs, 0) === null) return false;

        this.booked.push({ cue, deltaMs, gain });

        return true;
    }

    at(cue: CueName, atSeconds: number, now: number, gain = 1): boolean {
        return this.afterMs(cue, (atSeconds - now) * 1000, gain);
    }

    cues(): CueName[] {
        return this.booked.map((entry) => entry.cue);
    }

    deltas(): number[] {
        return this.booked.map((entry) => entry.deltaMs);
    }
}

/** Three beats of a 150 bpm grid, the shape every jig phrase arrives in. */
const PHRASE: readonly Pulse[] = [
    { at: 10, cue: 'tick' },
    { at: 10.4, cue: 'tick' },
    { at: 10.8, cue: 'tickAccent' },
];

/** Short enough that one frame books one pulse, which keeps the order readable. */
const TIGHT_MS = 150;

describe('nextPulseAt', () => {
    it('is the first pulse before the metronome has started', () => {
        expect(nextPulseAt(10, 1, 9.2)).toBe(10);
    });

    it('is the pulse itself at the exact moment it lands', () => {
        expect(nextPulseAt(10, 1, 11)).toBe(11);
    });

    it('steps to the next period once the last one has gone by', () => {
        expect(nextPulseAt(10, 1, 11.25)).toBeCloseTo(12, 9);
    });

    it('returns the first pulse rather than dividing by a zero period', () => {
        expect(nextPulseAt(10, 0, 40)).toBe(10);
    });
});

describe('PulseTrack', () => {
    it('books inside the engine’s own horizon, never at the edge of it', () => {
        expect(BOOK_AHEAD_MS).toBeLessThan(MAX_SCHEDULE_AHEAD_MS);
    });

    it('books nothing before it has been aimed at a phrase', () => {
        const audio = new RecordingAudio();

        expect(new PulseTrack().book(10, audio)).toBe(0);
        expect(audio.booked).toHaveLength(0);
    });

    it('books a pulse at the delta between its moment and now', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);

        expect(track.book(9.9, audio)).toBe(1);
        expect(audio.cues()).toEqual(['tick']);
        expect(audio.booked[0]?.deltaMs).toBeCloseTo(100, 6);
    });

    it('books each pulse exactly once however many frames pass over it', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack();

        track.aim(PHRASE);

        for (let now = 9.5; now < 11; now += 1 / 60) track.book(now, audio);

        expect(audio.cues()).toEqual(['tick', 'tick', 'tickAccent']);
    });

    it('leaves a pulse beyond the horizon for a later frame', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack();

        track.aim(PHRASE);

        expect(track.book(10 - BOOK_AHEAD_MS / 1000 - 0.01, audio)).toBe(0);
        expect(track.book(10 - BOOK_AHEAD_MS / 1000 + 0.01, audio)).toBe(1);
    });

    it('honours a horizon shorter than the default', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);

        expect(track.book(9.7, audio)).toBe(0);
        expect(track.book(9.95, audio)).toBe(1);
    });

    it('steps over a pulse too stale to be worth playing without replaying it', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);

        // Arriving a whole beat late: the first two are past the lateness clamp
        // and are dropped, and the accent still lands on its own moment.
        expect(track.book(10.79, audio)).toBe(1);
        expect(audio.cues()).toEqual(['tickAccent']);
    });

    it('plays a pulse a frame in the past rather than dropping it', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);
        track.book(10 + MAX_LATE_MS / 2000, audio);

        expect(audio.cues()).toEqual(['tick']);
    });

    it('starts over when it is aimed at a different phrase', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);
        track.book(9.9, audio);
        track.aim([{ at: 20, cue: 'beep' }]);
        track.book(19.9, audio);

        expect(audio.cues()).toEqual(['tick', 'beep']);
    });

    it('keeps its place when it is aimed at the same phrase again', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);
        track.book(9.9, audio);
        track.aim(PHRASE);
        track.book(9.9, audio);

        expect(audio.cues()).toEqual(['tick']);
    });

    it('books nothing more once it is cleared', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack();

        track.aim(PHRASE);
        track.clear();

        expect(track.book(9.9, audio)).toBe(0);
    });

    it('passes the caller’s gain through to every pulse', () => {
        const audio = new RecordingAudio();
        const track = new PulseTrack(TIGHT_MS);

        track.aim(PHRASE);
        track.book(9.9, audio, 0.4);

        expect(audio.booked[0]?.gain).toBe(0.4);
    });
});

describe('Metronome', () => {
    it('books one pulse per period and never the same one twice', () => {
        const audio = new RecordingAudio();
        const beeps = new Metronome('beep');

        for (let now = 10; now < 13; now += 1 / 60) beeps.book(10, 1, now, audio);

        expect(audio.cues()).toEqual(['beep', 'beep', 'beep', 'beep']);
    });

    it('books the first pulse before the period has begun', () => {
        const audio = new RecordingAudio();

        expect(new Metronome('beep').book(10, 1, 9.6, audio)).toBe(true);
        expect(audio.booked[0]?.deltaMs).toBeCloseTo(400, 6);
    });

    it('waits until a far-off first pulse is inside the horizon', () => {
        const audio = new RecordingAudio();
        const beeps = new Metronome('beep');

        expect(beeps.book(10, 1, 5, audio)).toBe(false);
        expect(beeps.book(10, 1, 9.5, audio)).toBe(true);
    });

    it('starts again from the next pulse after a reset', () => {
        const audio = new RecordingAudio();
        const beeps = new Metronome('beep');

        beeps.book(10, 1, 9.9, audio);
        beeps.reset();
        beeps.book(10, 1, 9.9, audio);

        expect(audio.cues()).toEqual(['beep', 'beep']);
    });

    it('follows a period that changes under it', () => {
        const audio = new RecordingAudio();
        const hiss = new Metronome('hiss');

        hiss.book(0, 0.5, 0.1, audio);
        hiss.book(0, 0.25, 0.6, audio);

        const deltas = audio.deltas();

        expect(deltas[0]).toBeCloseTo(400, 6);
        expect(deltas[1]).toBeCloseTo(150, 6);
    });

    it('passes the caller’s gain through', () => {
        const audio = new RecordingAudio();

        new Metronome('alarm').book(10, 1, 9.9, audio, 0.25);

        expect(audio.booked[0]?.gain).toBe(0.25);
    });
});
